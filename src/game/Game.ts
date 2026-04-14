import * as THREE from 'three';
import { GameState } from './GameState';
import { GameEngine } from './GameEngine';
import { SceneManager } from '../scene/SceneManager';
import { Earth } from '../scene/Earth';
import { Starfield } from '../scene/Starfield';
import { Sun } from '../scene/Sun';
import { OrbitRenderer } from '../scene/OrbitRenderer';
import { Rocket } from '../scene/Rocket';
import { simulateLaunch, simulateGhost } from '../physics/LaunchSimulator';
import { BriefingPanel } from '../ui/BriefingPanel';
import { LaunchPanel } from '../ui/LaunchPanel';
import { HUD } from '../ui/HUD';
import { ScorePanel } from '../ui/ScorePanel';
import { kmToScene } from '../utils/constants';
import { getOrbitHints } from '../orbits/OrbitHints';
import { MultiplayerSession, RoundPhase } from '../multiplayer/MultiplayerSession';
import { ConnectionState } from '../multiplayer/PeerConnection';
import type { LaunchParams } from '../physics/LaunchSimulator';
import type { OrbitParameters } from '../orbits/types';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';


/**
 * Thin orchestrator that wires GameEngine (pure logic) to Three.js rendering
 * and DOM-based UI panels. All game state, scoring, and mission generation
 * live in GameEngine — this class only handles visuals and user interaction.
 */
export class Game {
  private engine: GameEngine;
  private sceneManager: SceneManager;
  private earth: Earth;
  private starfield: Starfield;
  private sun: Sun;
  private orbitRenderer: OrbitRenderer;
  private rocket: Rocket;

  // UI
  private briefingPanel: BriefingPanel;
  private launchPanel: LaunchPanel;
  private hud: HUD;
  private scorePanel: ScorePanel;

  // Ghost trajectory preview
  private ghostLine: THREE.Line | null = null;
  private ghostThrottleTimer: number = 0;

  // Launch animation
  private launchTrajectory: THREE.Vector3[] = [];
  private launchAnimIndex: number = 0;
  private launchAnimSpeed: number = 10; // points per frame
  private coastStartIndex: number = 0;  // trajectory index where the orbit loop begins
  private launchFinishTimer: number = 0; // setTimeout handle for delayed finishLaunch
  private launchResult: {
    orbitalElements: OrbitParameters;
    finalFuel: number;
  } | null = null;

  // Multiplayer
  private session: MultiplayerSession | null = null;
  private opponentTrajectoryLine: THREE.Line | null = null;
  private mpWaiting: HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    // Game engine (pure logic)
    this.engine = new GameEngine();

    // Scene setup
    this.sceneManager = new SceneManager(canvas);

    // Earth
    this.earth = new Earth();
    this.sceneManager.scene.add(this.earth.group);

    // Starfield
    this.starfield = new Starfield();
    this.sceneManager.scene.add(this.starfield.points);

    // Sun (visual source for the directional light)
    this.sun = new Sun();
    this.sceneManager.scene.add(this.sun.group);

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
    this.mpWaiting = document.getElementById('mp-waiting')!;

    // Welcome screen
    this.setupWelcomeScreen();

    // Help button
    this.setupHelpButton();

    // Multiplayer UI
    this.setupMultiplayerUI();

    // Subscribe to engine events
    this.subscribeToEngine();

    // Update loop
    this.sceneManager.onUpdate((dt, elapsed) => this.update(dt, elapsed));
  }

  start(): void {
    this.sceneManager.start();
    // Stay on welcome screen -- don't auto-start mission
  }

  /** Expose engine for external access (e.g., multiplayer layer). */
  public getEngine(): GameEngine {
    return this.engine;
  }

  // ---------------------------------------------------------------------------
  // Engine event subscriptions
  // ---------------------------------------------------------------------------

  private subscribeToEngine(): void {
    this.engine.on('stateChanged', (e) => {
      this.onStateChanged(e.from, e.to);
    });

    this.engine.on('missionGenerated', () => {
      this.onMissionGenerated();
    });

    this.engine.on('launchStarted', (e) => {
      this.onLaunchStarted(e.params);
    });

    this.engine.on('scoreCalculated', (e) => {
      this.onScoreCalculated(e.breakdown, e.isNewBest, e.isValid);
    });
  }

  private onStateChanged(from: GameState, to: GameState): void {
    if (to === GameState.SETUP && from === GameState.BRIEFING) {
      this.enterSetupPhase();
    }
    if (to === GameState.SETUP && from === GameState.RESULT) {
      // Retry: clean up previous launch visuals but keep target orbit
      this.onRetrySetup();
    }
  }

  private onMissionGenerated(): void {
    const mission = this.engine.getMission();
    if (!mission) return;

    // Clear any pending finish timer from a previous launch
    if (this.launchFinishTimer) {
      clearTimeout(this.launchFinishTimer);
      this.launchFinishTimer = 0;
    }

    // Clean up previous state
    this.orbitRenderer.clearAll();
    this.rocket.reset();
    this.clearGhost();
    this.clearOpponentTrajectory();
    this.launchPanel.hide();
    this.hud.hide();
    this.scorePanel.hide();

    // Reset camera
    this.sceneManager.camera.position.set(3, 2, 4);
    this.sceneManager.camera.lookAt(0, 0, 0);

    // Show target orbit
    this.orbitRenderer.showTarget(mission.params);

    // Show briefing — on accept, tell the engine
    this.briefingPanel.show(mission, () => {
      this.engine.acceptBriefing();
    });
  }

  private onLaunchStarted(params: LaunchParams): void {
    const mission = this.engine.getMission();
    if (!mission) return;

    this.launchPanel.disable();
    this.clearGhost();

    // In multiplayer, notify the opponent
    if (this.isMultiplayer()) {
      this.session!.sendLaunch(params);
    }

    // Run the full simulation (this is the Three.js-dependent call)
    const result = simulateLaunch(params);

    this.launchTrajectory = result.trajectory;
    this.launchAnimIndex = 0;
    this.coastStartIndex = result.coastStartIndex;
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

    // Trigger score display after one full playthrough of the trajectory
    const estimatedDurationMs = (this.launchTrajectory.length / this.launchAnimSpeed / 60) * 1000;
    const scoreDelay = estimatedDurationMs + 1500;
    this.launchFinishTimer = window.setTimeout(() => {
      if (this.engine.getState() === GameState.LAUNCHING) {
        this.finishLaunch();
      }
    }, scoreDelay);
  }

  private onScoreCalculated(breakdown: ScoreBreakdown, isNewBest: boolean, isValid: boolean): void {
    const mission = this.engine.getMission();
    const outcome = this.engine.getLastOutcome();
    const params = this.engine.getLastParams();
    if (!mission || !outcome || !params) return;

    this.hud.hide();
    this.launchPanel.hide();

    // Reveal the entire trail so the player can see the full trajectory
    this.rocket.revealFullTrail();

    // Re-enable OrbitControls so the player can rotate around the result
    this.sceneManager.controls.enabled = true;
    this.sceneManager.controls.target.set(0, 0, 0);

    if (isValid) {
      this.orbitRenderer.showAchieved(outcome.orbitalElements);
    }

    // Pull camera back to see both orbits
    this.zoomToFitOrbit();

    // In multiplayer, send result to opponent and wait
    if (this.isMultiplayer()) {
      this.session!.sendResult(breakdown.totalScore, breakdown, params);

      if (this.session!.getRoundPhase() !== RoundPhase.ROUND_COMPLETE) {
        this.mpWaiting.classList.remove('hidden');
      }
    }

    // Show score panel (with small delay for drama)
    setTimeout(() => {
      const retryFn = this.isMultiplayer() ? () => {} : () => this.engine.retryMission();
      const nextFn = this.isMultiplayer()
        ? () => {
          this.clearOpponentTrajectory();
          this.orbitRenderer.clearOpponent();
          this.session!.nextRound();
        }
        : () => this.engine.newGame();

      this.scorePanel.show(
        mission.params,
        outcome.orbitalElements,
        breakdown,
        isNewBest,
        retryFn,
        nextFn,
      );

      // In multiplayer, hide retry button and wait for opponent
      if (this.isMultiplayer()) {
        // Hide retry (can't retry in multiplayer), relabel next
        const retryBtn = document.getElementById('btn-retry')!;
        retryBtn.classList.add('hidden');
        const nextBtn = document.getElementById('btn-next')!;
        nextBtn.textContent = 'NEXT ROUND';
      }
    }, 800);
  }

  // ---------------------------------------------------------------------------
  // Setup phase
  // ---------------------------------------------------------------------------

  private enterSetupPhase(): void {
    const mission = this.engine.getMission();
    if (!mission) return;

    this.briefingPanel.hide();

    // Zoom out to show full orbit
    this.zoomToFitOrbit();

    // Get contextual hints for this orbit type
    const hints = getOrbitHints(mission.definition.type, mission.params);

    // Show launch panel with hints and mission context (for arcade auto-compute)
    this.launchPanel.show(
      (params) => this.onParamsChanged(params),
      () => {
        const params = this.launchPanel.getParams();
        this.engine.startLaunch(params);
      },
      hints,
      mission,
    );
  }

  private onRetrySetup(): void {
    const mission = this.engine.getMission();
    if (!mission) return;

    // Clear any pending finish timer from a previous launch
    if (this.launchFinishTimer) {
      clearTimeout(this.launchFinishTimer);
      this.launchFinishTimer = 0;
    }

    this.scorePanel.hide();
    this.hud.hide();
    this.orbitRenderer.clearAchieved();
    this.rocket.reset();
    this.clearGhost();
    this.launchResult = null;
    this.launchTrajectory = [];

    // Re-show target orbit
    this.orbitRenderer.showTarget(mission.params);
    this.zoomToFitOrbit();

    const hints = getOrbitHints(mission.definition.type, mission.params);

    this.launchPanel.enable();
    this.launchPanel.show(
      (params) => this.onParamsChanged(params),
      () => {
        const params = this.launchPanel.getParams();
        this.engine.startLaunch(params);
      },
      hints,
      mission,
    );
  }

  // ---------------------------------------------------------------------------
  // Welcome / Help
  // ---------------------------------------------------------------------------

  private setupWelcomeScreen(): void {
    const welcomePanel = document.getElementById('welcome-panel')!;
    const startBtn = document.getElementById('btn-start-game')!;

    startBtn.addEventListener('click', () => {
      welcomePanel.classList.add('hidden');
      this.engine.newGame();
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

  // ---------------------------------------------------------------------------
  // Multiplayer
  // ---------------------------------------------------------------------------

  private setupMultiplayerUI(): void {
    const welcomePanel = document.getElementById('welcome-panel')!;
    const mpDialog = document.getElementById('mp-dialog')!;
    const mpStatus = document.getElementById('mp-status')!;
    const mpBtn = document.getElementById('btn-multiplayer')!;
    const createBtn = document.getElementById('btn-mp-create')!;
    const joinBtn = document.getElementById('btn-mp-join')!;
    const joinInput = document.getElementById('mp-join-code')! as HTMLInputElement;
    const backBtn = document.getElementById('btn-mp-back')!;

    mpBtn.addEventListener('click', () => {
      welcomePanel.classList.add('hidden');
      mpDialog.classList.remove('hidden');
    });

    backBtn.addEventListener('click', () => {
      if (this.session) {
        this.session.disconnect();
        this.session = null;
      }
      mpDialog.classList.add('hidden');
      mpStatus.classList.add('hidden');
      welcomePanel.classList.remove('hidden');
    });

    createBtn.addEventListener('click', async () => {
      this.session = new MultiplayerSession();
      this.subscribeToSession();
      try {
        const code = await this.session.createRoom();
        mpStatus.className = 'mp-status mp-status-waiting';
        mpStatus.innerHTML = `
          <div>Room created! Share this code:</div>
          <div class="mp-room-code">${code}</div>
          <div>Waiting for opponent...</div>
        `;
        mpStatus.classList.remove('hidden');
        createBtn.classList.add('hidden');
      } catch {
        mpStatus.className = 'mp-status mp-status-error';
        mpStatus.textContent = 'Failed to create room. Try again.';
        mpStatus.classList.remove('hidden');
      }
    });

    joinBtn.addEventListener('click', async () => {
      const code = joinInput.value.trim().toUpperCase();
      if (code.length < 4) return;
      this.session = new MultiplayerSession();
      this.subscribeToSession();
      try {
        mpStatus.className = 'mp-status mp-status-waiting';
        mpStatus.textContent = 'Connecting...';
        mpStatus.classList.remove('hidden');
        await this.session.joinRoom(code);
      } catch {
        mpStatus.className = 'mp-status mp-status-error';
        mpStatus.textContent = 'Failed to join room. Check the code and try again.';
        mpStatus.classList.remove('hidden');
      }
    });
  }

  private subscribeToSession(): void {
    if (!this.session) return;

    this.session.on('connectionChanged', (e) => {
      if (e.state === ConnectionState.DISCONNECTED && this.engine.getState() !== GameState.WELCOME) {
        this.mpWaiting.classList.add('hidden');
        // Could show a "disconnected" notification here
      }
    });

    this.session.on('gameReady', (e) => {
      const mpDialog = document.getElementById('mp-dialog')!;
      mpDialog.classList.add('hidden');
      this.scorePanel.resetForSinglePlayer(); // ensure clean state
      this.engine.newGame(e.seed);
    });

    this.session.on('opponentLaunched', (e) => {
      // Replay opponent's trajectory as a red line
      this.renderOpponentTrajectory(e.params);
    });

    this.session.on('roundComplete', (e) => {
      this.mpWaiting.classList.add('hidden');
      const myScore = this.engine.getLastScore();
      if (myScore) {
        this.scorePanel.showOpponentScore(myScore.totalScore, e.opponent.score);
        this.orbitRenderer.showOpponent(
          this.computeOpponentOrbit(e.opponent.params),
        );
      }
    });

    this.session.on('opponentDisconnected', () => {
      this.mpWaiting.classList.add('hidden');
    });
  }

  /** Run the opponent's launch through physics and render the trajectory. */
  private renderOpponentTrajectory(params: LaunchParams): void {
    this.clearOpponentTrajectory();

    const result = simulateLaunch(params);
    const scenePoints = result.trajectory.map(
      (p) => new THREE.Vector3(p.x * kmToScene(1), p.y * kmToScene(1), p.z * kmToScene(1))
    );

    const geometry = new THREE.BufferGeometry().setFromPoints(scenePoints);
    const material = new THREE.LineBasicMaterial({
      color: 0xef5350,
      transparent: true,
      opacity: 0.35,
    });

    this.opponentTrajectoryLine = new THREE.Line(geometry, material);
    this.sceneManager.scene.add(this.opponentTrajectoryLine);
  }

  /** Compute opponent's orbital elements from their params. */
  private computeOpponentOrbit(params: LaunchParams): OrbitParameters {
    const result = simulateLaunch(params);
    return result.orbitalElements;
  }

  private clearOpponentTrajectory(): void {
    if (this.opponentTrajectoryLine) {
      this.sceneManager.scene.remove(this.opponentTrajectoryLine);
      this.opponentTrajectoryLine.geometry.dispose();
      this.opponentTrajectoryLine = null;
    }
  }

  private isMultiplayer(): boolean {
    return this.session !== null && this.session.getConnectionState() === ConnectionState.CONNECTED;
  }

  // ---------------------------------------------------------------------------
  // Ghost trajectory preview
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Launch animation & camera
  // ---------------------------------------------------------------------------

  private finishLaunch(): void {
    if (!this.launchResult) return;

    // Feed the simulation result back to the engine for scoring
    this.engine.completeLaunch({
      orbitalElements: this.launchResult.orbitalElements,
      finalFuel: this.launchResult.finalFuel,
      coastStartIndex: this.coastStartIndex,
    });
  }

  private update(dt: number, elapsed: number): void {
    this.earth.update(dt, elapsed);

    const state = this.engine.getState();

    if (state === GameState.LAUNCHING || state === GameState.RESULT) {
      this.updateLaunchAnimation();
    }

    if (state === GameState.LAUNCHING || state === GameState.SETUP) {
      this.rocket.updateExhaust(state === GameState.LAUNCHING);
    }
  }

  private updateLaunchAnimation(): void {
    if (this.launchTrajectory.length === 0) return;

    // Step through trajectory points
    const stepsPerFrame = this.launchAnimSpeed;
    for (let i = 0; i < stepsPerFrame; i++) {
      this.launchAnimIndex++;
      // Loop: when we reach the end, wrap back to coastStartIndex
      if (this.launchAnimIndex >= this.launchTrajectory.length) {
        this.launchAnimIndex = this.coastStartIndex;
      }
    }

    // Position rocket at current trajectory point
    const idx = this.launchAnimIndex;
    if (idx >= 0 && idx < this.launchTrajectory.length) {
      const pos = this.launchTrajectory[idx];
      this.rocket.setPosition(pos, this.getVelocityAt(idx));

      // Progressively reveal the trail up to current position
      this.rocket.revealTrail(Math.min(this.launchAnimIndex, this.launchTrajectory.length));

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

    // Camera follow: track the rocket during launch only
    if (this.engine.getState() === GameState.LAUNCHING) {
      this.updateLaunchCamera();
    }
  }

  /**
   * Camera follow during launch animation.
   */
  private updateLaunchCamera(): void {
    const rocketPos = this.rocket.group.position;
    if (rocketPos.lengthSq() < 0.001) return;

    const distFromCenter = rocketPos.length();
    const offsetScale = Math.max(1.8, distFromCenter * 0.8 + 0.8);

    const radial = rocketPos.clone().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(worldUp, radial);
    if (tangent.lengthSq() < 0.001) {
      tangent.set(1, 0, 0);
    }
    tangent.normalize();
    const perpDir = tangent.clone().multiplyScalar(0.8).add(radial.clone().multiplyScalar(0.4)).normalize();

    const targetCamPos = rocketPos.clone().add(perpDir.multiplyScalar(offsetScale));
    const lookTarget = rocketPos.clone().multiplyScalar(0.3);

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

  private zoomToFitOrbit(): void {
    const mission = this.engine.getMission();
    if (!mission) return;
    const params = mission.params;
    const maxAlt = params.apogee ?? params.altitude;
    const orbitRadiusScene = kmToScene(6371 + maxAlt);
    const distance = orbitRadiusScene * 2.5;
    const clamped = Math.min(Math.max(distance, 3), 40);

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
      const eased = 1 - Math.pow(1 - t, 3);

      this.sceneManager.camera.position.lerpVectors(startPos, targetPos, eased);
      this.sceneManager.camera.lookAt(0, 0, 0);

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }
}
