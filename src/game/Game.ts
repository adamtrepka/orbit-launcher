import * as THREE from 'three';
import { GameState } from './GameState';
import { generateMission } from './MissionGenerator';
import { SceneManager } from '../scene/SceneManager';
import { Earth } from '../scene/Earth';
import { Starfield } from '../scene/Starfield';
import { OrbitRenderer } from '../scene/OrbitRenderer';
import { Rocket } from '../scene/Rocket';
import { simulateLaunch, simulateGhost } from '../physics/LaunchSimulator';
import type { LaunchParams } from '../physics/LaunchSimulator';
import { calculateScore } from '../scoring/ScoreCalculator';
import { saveHighScore, getBestScore } from '../scoring/HighScores';
import { BriefingPanel } from '../ui/BriefingPanel';
import { LaunchPanel } from '../ui/LaunchPanel';
import { HUD } from '../ui/HUD';
import { ScorePanel } from '../ui/ScorePanel';
import type { TargetOrbit } from '../orbits/types';
import type { OrbitParameters } from '../orbits/types';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';
import { kmToScene } from '../utils/constants';
import { getOrbitHints } from '../orbits/OrbitHints';

export class Game {
  private sceneManager: SceneManager;
  private earth: Earth;
  private starfield: Starfield;
  private orbitRenderer: OrbitRenderer;
  private rocket: Rocket;

  // UI
  private briefingPanel: BriefingPanel;
  private launchPanel: LaunchPanel;
  private hud: HUD;
  private scorePanel: ScorePanel;

  // State
  private state: GameState = GameState.WELCOME;
  private currentMission: TargetOrbit | null = null;

  // Ghost trajectory preview
  private ghostLine: THREE.Line | null = null;
  private ghostThrottleTimer: number = 0;

  // Launch animation
  private launchTrajectory: THREE.Vector3[] = [];
  private launchAnimIndex: number = 0;
  private launchAnimSpeed: number = 10; // points per frame
  private launchResult: {
    orbitalElements: OrbitParameters;
    finalFuel: number;
  } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Scene setup
    this.sceneManager = new SceneManager(canvas);

    // Earth
    this.earth = new Earth();
    this.sceneManager.scene.add(this.earth.group);

    // Starfield
    this.starfield = new Starfield();
    this.sceneManager.scene.add(this.starfield.points);

    // Orbit renderer
    this.orbitRenderer = new OrbitRenderer(this.sceneManager.scene);

    // Rocket
    this.rocket = new Rocket();
    this.sceneManager.scene.add(this.rocket.group);
    this.sceneManager.scene.add(this.rocket.trail);

    // UI
    this.briefingPanel = new BriefingPanel();
    this.launchPanel = new LaunchPanel();
    this.hud = new HUD();
    this.scorePanel = new ScorePanel();

    // Welcome screen
    this.setupWelcomeScreen();

    // Help button
    this.setupHelpButton();

    // Update loop
    this.sceneManager.onUpdate((dt, elapsed) => this.update(dt, elapsed));
  }

  start(): void {
    this.sceneManager.start();
    // Stay on welcome screen -- don't auto-start mission
  }

  private setupWelcomeScreen(): void {
    const welcomePanel = document.getElementById('welcome-panel')!;
    const startBtn = document.getElementById('btn-start-game')!;

    startBtn.addEventListener('click', () => {
      welcomePanel.classList.add('hidden');
      this.newMission();
    });
  }

  private setupHelpButton(): void {
    const helpBtn = document.getElementById('btn-help')!;
    const helpOverlay = document.getElementById('help-overlay')!;
    const closeHelpBtn = document.getElementById('btn-close-help')!;

    helpBtn.addEventListener('click', () => {
      helpOverlay.classList.remove('hidden');
    });

    closeHelpBtn.addEventListener('click', () => {
      helpOverlay.classList.add('hidden');
    });

    // Close on overlay background click
    helpOverlay.addEventListener('click', (e) => {
      if (e.target === helpOverlay) {
        helpOverlay.classList.add('hidden');
      }
    });
  }

  private newMission(): void {
    // Clean up previous state
    this.orbitRenderer.clearAll();
    this.rocket.reset();
    this.clearGhost();
    this.launchPanel.hide();
    this.hud.hide();
    this.scorePanel.hide();

    // Generate a new mission
    this.currentMission = generateMission();
    this.state = GameState.BRIEFING;

    // Reset camera
    this.sceneManager.camera.position.set(3, 2, 4);
    this.sceneManager.camera.lookAt(0, 0, 0);

    const mission = this.currentMission;

    // Show target orbit
    this.orbitRenderer.showTarget(mission.params);

    // Show briefing
    this.briefingPanel.show(mission, () => {
      this.enterSetupPhase();
    });
  }

  private enterSetupPhase(): void {
    this.state = GameState.SETUP;
    this.briefingPanel.hide();

    // Zoom out to show full orbit
    this.zoomToFitOrbit();

    // Get contextual hints for this orbit type
    const hints = this.currentMission
      ? getOrbitHints(this.currentMission.definition.type, this.currentMission.params)
      : null;

    // Show launch panel with hints
    this.launchPanel.show(
      (params) => this.onParamsChanged(params),
      () => this.executeLaunch(),
      hints
    );
  }

  private zoomToFitOrbit(): void {
    if (!this.currentMission) return;
    const params = this.currentMission.params;
    const maxAlt = params.apogee ?? params.altitude;
    const orbitRadiusScene = kmToScene(6371 + maxAlt);
    const distance = orbitRadiusScene * 2.5;
    const clamped = Math.min(Math.max(distance, 3), 40);

    // Smoothly animate camera
    const current = this.sceneManager.camera.position.clone();
    const target = current.normalize().multiplyScalar(clamped);
    this.animateCamera(target, 1000);
  }

  private animateCamera(targetPos: THREE.Vector3, durationMs: number): void {
    const startPos = this.sceneManager.camera.position.clone();
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);

      this.sceneManager.camera.position.lerpVectors(startPos, targetPos, eased);
      this.sceneManager.camera.lookAt(0, 0, 0);

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  private onParamsChanged(params: LaunchParams): void {
    // Throttle ghost trajectory updates
    const now = Date.now();
    if (now - this.ghostThrottleTimer < 100) return;
    this.ghostThrottleTimer = now;

    this.updateGhostTrajectory(params);
  }

  private updateGhostTrajectory(params: LaunchParams): void {
    this.clearGhost();

    const ghostPoints = simulateGhost(params);
    if (ghostPoints.length < 2) return;

    const scenePoints = ghostPoints.map(
      (p) => new THREE.Vector3(p.x * kmToScene(1), p.y * kmToScene(1), p.z * kmToScene(1))
    );

    const geometry = new THREE.BufferGeometry().setFromPoints(scenePoints);
    const material = new THREE.LineBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.25,
    });

    this.ghostLine = new THREE.Line(geometry, material);
    this.sceneManager.scene.add(this.ghostLine);
  }

  private clearGhost(): void {
    if (this.ghostLine) {
      this.sceneManager.scene.remove(this.ghostLine);
      this.ghostLine.geometry.dispose();
      this.ghostLine = null;
    }
  }

  private executeLaunch(): void {
    if (!this.currentMission) return;

    this.state = GameState.LAUNCHING;
    this.launchPanel.disable();
    this.clearGhost();

    const params = this.launchPanel.getParams();

    // Run the full simulation
    const result = simulateLaunch(params);

    this.launchTrajectory = result.trajectory;
    this.launchAnimIndex = 0;
    this.launchResult = {
      orbitalElements: result.orbitalElements,
      finalFuel: result.finalState.fuel,
    };

    // Load the full trajectory into the trail (hidden initially, revealed progressively)
    this.rocket.loadTrajectory(this.launchTrajectory);

    // Show rocket and HUD
    this.rocket.show();
    this.hud.show();

    // Adapt animation speed to trajectory length (aim for ~8 seconds of animation at 60fps)
    const targetFrames = 480; // ~8 seconds at 60fps
    this.launchAnimSpeed = Math.max(3, Math.ceil(this.launchTrajectory.length / targetFrames));

    // Disable OrbitControls during launch so camera follow works unimpeded
    this.sceneManager.controls.enabled = false;
  }

  private update(dt: number, elapsed: number): void {
    this.earth.update(dt, elapsed);

    if (this.state === GameState.LAUNCHING) {
      this.updateLaunchAnimation();
    }

    if (this.state === GameState.LAUNCHING || this.state === GameState.SETUP) {
      this.rocket.updateExhaust(this.state === GameState.LAUNCHING);
    }
  }

  private updateLaunchAnimation(): void {
    if (this.launchTrajectory.length === 0) return;

    // Step through trajectory points
    const stepsPerFrame = this.launchAnimSpeed;
    for (let i = 0; i < stepsPerFrame && this.launchAnimIndex < this.launchTrajectory.length; i++) {
      this.launchAnimIndex++;
    }

    // Position rocket at current trajectory point
    const idx = Math.min(this.launchAnimIndex, this.launchTrajectory.length) - 1;
    if (idx >= 0) {
      const pos = this.launchTrajectory[idx];
      this.rocket.setPosition(pos, this.getVelocityAt(idx));

      // Progressively reveal the trail up to current position
      this.rocket.revealTrail(this.launchAnimIndex);

      // Update HUD
      const alt = pos.length() - 6371;
      const vel =
        idx > 0
          ? pos.clone().sub(this.launchTrajectory[idx - 1]).length() * 0.2
          : 0;
      const fuelEst = this.launchResult
        ? Math.max(0, 1 - this.launchAnimIndex / this.launchTrajectory.length * (1 - this.launchResult.finalFuel))
        : 1;
      const phase =
        this.launchAnimIndex < this.launchTrajectory.length * 0.2
          ? 'ASCENT'
          : this.launchAnimIndex < this.launchTrajectory.length * 0.5
            ? 'COAST'
            : 'ORBIT';
      this.hud.update(alt, vel * 1000, fuelEst, phase);
    }

    // Camera follow: track the rocket, pulling back as altitude increases
    this.updateLaunchCamera();

    // Animation complete
    if (this.launchAnimIndex >= this.launchTrajectory.length) {
      this.finishLaunch();
    }
  }

  /**
   * Camera follow during launch animation.
   *
   * Strategy: position the camera on a perpendicular offset from the rocket,
   * looking at a point between the rocket and Earth center so both stay in frame.
   * The offset grows as the rocket gets farther from Earth.
   */
  private updateLaunchCamera(): void {
    const rocketPos = this.rocket.group.position;
    if (rocketPos.lengthSq() < 0.001) return;

    const distFromCenter = rocketPos.length();

    // Camera offset scales with distance from Earth center
    // Close to Earth: tight follow. Far out: pull back to see the orbit forming
    const offsetScale = Math.max(0.3, distFromCenter * 0.5);

    // Build a perpendicular offset direction
    const radial = rocketPos.clone().normalize();
    // Cross with world-up to get a tangent, then cross again for a stable perp
    const worldUp = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(worldUp, radial);
    if (tangent.lengthSq() < 0.001) {
      tangent.set(1, 0, 0); // fallback if radial is along Y
    }
    tangent.normalize();
    // Mix in some "up" so we're not perfectly edge-on
    const perpDir = tangent.clone().multiplyScalar(0.8).add(radial.clone().multiplyScalar(0.4)).normalize();

    const targetCamPos = rocketPos.clone().add(perpDir.multiplyScalar(offsetScale));

    // Look at a blend between rocket and Earth center — keeps both in frame
    const lookTarget = rocketPos.clone().multiplyScalar(0.3); // 30% toward rocket, 70% toward origin

    // Smooth follow — faster lerp than before so camera actually keeps up
    this.sceneManager.camera.position.lerp(targetCamPos, 0.08);
    this.sceneManager.camera.lookAt(lookTarget);
  }

  private getVelocityAt(index: number): THREE.Vector3 {
    if (index <= 0 || index >= this.launchTrajectory.length) {
      return new THREE.Vector3(0, 1, 0);
    }
    return this.launchTrajectory[index]
      .clone()
      .sub(this.launchTrajectory[index - 1])
      .normalize();
  }

  private finishLaunch(): void {
    if (!this.currentMission || !this.launchResult) return;

    this.state = GameState.RESULT;
    this.hud.hide();
    this.launchPanel.hide();

    // Reveal the entire trail so the player can see the full trajectory
    this.rocket.revealFullTrail();

    // Re-enable OrbitControls so the player can rotate around the result
    this.sceneManager.controls.enabled = true;
    // Reset the controls target to Earth center
    this.sceneManager.controls.target.set(0, 0, 0);

    const target = this.currentMission.params;
    const achieved = this.launchResult.orbitalElements;

    // Check if orbit is valid (altitude > 0, not NaN)
    const isValid =
      isFinite(achieved.altitude) &&
      achieved.altitude > 0 &&
      isFinite(achieved.eccentricity) &&
      achieved.eccentricity < 1;

    if (isValid) {
      // Show achieved orbit
      this.orbitRenderer.showAchieved(achieved);
    }

    // Calculate score
    const score: ScoreBreakdown = calculateScore(
      target,
      achieved,
      this.launchResult.finalFuel,
      this.currentMission.definition.tolerances
    );

    // Pull camera back to see both orbits
    this.zoomToFitOrbit();

    // Save high score
    const bestBefore = getBestScore(this.currentMission.definition.type);
    saveHighScore({
      orbitType: this.currentMission.definition.type,
      orbitName: this.currentMission.definition.name,
      score: Math.round(score.totalScore),
      accuracy: Math.round(score.accuracyScore * 100),
      fuel: Math.round(score.fuelScore * 100),
      date: new Date().toISOString(),
    });
    const isNewBest = bestBefore === null || score.totalScore > bestBefore;

    // Show score panel (with small delay for drama)
    setTimeout(() => {
      this.scorePanel.show(target, achieved, score, isNewBest, () => this.retryMission(), () => this.newMission());
    }, 800);
  }

  private retryMission(): void {
    if (!this.currentMission) return;

    this.scorePanel.hide();
    this.hud.hide();
    this.orbitRenderer.clearAchieved();
    this.rocket.reset();
    this.clearGhost();
    this.launchResult = null;
    this.launchTrajectory = [];

    this.state = GameState.SETUP;

    // Re-show target orbit
    this.orbitRenderer.showTarget(this.currentMission.params);

    this.zoomToFitOrbit();

    const hints = getOrbitHints(this.currentMission.definition.type, this.currentMission.params);

    this.launchPanel.enable();
    this.launchPanel.show(
      (params) => this.onParamsChanged(params),
      () => this.executeLaunch(),
      hints
    );
  }
}
