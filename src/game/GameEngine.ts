import { GameState } from './GameState';
import { EventEmitter } from './GameEvents';
import { generateMission } from './MissionGenerator';
import { calculateScore } from '../scoring/ScoreCalculator';
import { saveHighScore, getBestScore } from '../scoring/HighScores';
import { SeededRandom, randomSeed } from '../utils/random';
import type { GameEventMap } from './GameEvents';
import type { TargetOrbit, OrbitParameters } from '../orbits/types';
import type { LaunchParams } from '../physics/LaunchSimulator';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';

/** Result of a launch simulation, passed back to the engine by the orchestrator. */
export interface LaunchOutcome {
  orbitalElements: OrbitParameters;
  finalFuel: number;
  /** Trajectory index where coast/orbit loop begins (rendering detail, forwarded in events). */
  coastStartIndex: number;
}

/**
 * Framework-agnostic game logic engine.
 *
 * Owns: state machine, mission generation, scoring, high scores, seeded RNG.
 * Does NOT own: rendering, DOM, physics simulation (uses THREE.Vector3 internally).
 *
 * The orchestrator (Game.ts) subscribes to events and drives the visual layer.
 * The physics simulation is called by the orchestrator, which then feeds the
 * result back via completeLaunch(). This keeps the engine free of Three.js imports
 * while preserving the engine as the single authority on game state transitions.
 */
export class GameEngine extends EventEmitter<GameEventMap> {
  private state: GameState = GameState.WELCOME;
  private rng: SeededRandom | null = null;
  private seed: number = 0;
  private currentMission: TargetOrbit | null = null;
  private lastParams: LaunchParams | null = null;
  private lastOutcome: LaunchOutcome | null = null;
  private lastScore: ScoreBreakdown | null = null;

  /** Current game state. */
  public getState(): GameState {
    return this.state;
  }

  /** Current mission (null before first newGame). */
  public getMission(): TargetOrbit | null {
    return this.currentMission;
  }

  /** Seed used for the current game's RNG. */
  public getSeed(): number {
    return this.seed;
  }

  /** Launch params from the most recent launch. */
  public getLastParams(): LaunchParams | null {
    return this.lastParams;
  }

  /** Outcome from the most recent launch. */
  public getLastOutcome(): LaunchOutcome | null {
    return this.lastOutcome;
  }

  /** Score breakdown from the most recent launch. */
  public getLastScore(): ScoreBreakdown | null {
    return this.lastScore;
  }

  /**
   * Start a new game with a fresh mission.
   * If seed is provided, the RNG is deterministic (multiplayer-safe).
   * If omitted, a random seed is generated.
   */
  public newGame(seed?: number): void {
    this.seed = seed ?? randomSeed();
    this.rng = new SeededRandom(this.seed);

    // Clear previous launch state
    this.lastParams = null;
    this.lastOutcome = null;
    this.lastScore = null;

    // Generate a new mission using the seeded RNG
    this.currentMission = generateMission(this.rng);

    this.transitionTo(GameState.BRIEFING);
    this.emit('missionGenerated', { mission: this.currentMission, seed: this.seed });
  }

  /**
   * Player accepts the briefing and moves to the setup/slider phase.
   */
  public acceptBriefing(): void {
    if (this.state !== GameState.BRIEFING) return;
    this.transitionTo(GameState.SETUP);
  }

  /**
   * Player initiates a launch. The engine records the params, transitions
   * to LAUNCHING, and emits launchStarted. The orchestrator should then
   * run the physics simulation and call completeLaunch() with results.
   */
  public startLaunch(params: LaunchParams): void {
    if (this.state !== GameState.SETUP) return;
    this.lastParams = params;
    this.lastOutcome = null;
    this.lastScore = null;
    this.transitionTo(GameState.LAUNCHING);
    this.emit('launchStarted', { params });
  }

  /**
   * Called by the orchestrator after the physics simulation completes.
   * Scores the result, saves high scores, and transitions to RESULT.
   */
  public completeLaunch(outcome: LaunchOutcome): void {
    if (this.state !== GameState.LAUNCHING || !this.currentMission || !this.lastParams) return;

    this.lastOutcome = outcome;

    // Determine if the orbit is valid
    const achieved = outcome.orbitalElements;
    const isValid =
      isFinite(achieved.altitude) &&
      achieved.altitude > 0 &&
      isFinite(achieved.eccentricity) &&
      achieved.eccentricity < 1;

    // Calculate score
    const breakdown = calculateScore(
      this.currentMission.params,
      achieved,
      outcome.finalFuel,
      this.currentMission.definition.tolerances,
    );
    this.lastScore = breakdown;

    // Save high score
    const bestBefore = getBestScore(this.currentMission.definition.type);
    saveHighScore({
      orbitType: this.currentMission.definition.type,
      orbitName: this.currentMission.definition.name,
      score: Math.round(breakdown.totalScore),
      accuracy: Math.round(breakdown.accuracyScore * 100),
      fuel: Math.round(breakdown.fuelScore * 100),
      date: new Date().toISOString(),
    });
    const isNewBest = bestBefore === null || breakdown.totalScore > bestBefore;

    this.transitionTo(GameState.RESULT);

    this.emit('launchCompleted', {
      params: this.lastParams,
      orbitalElements: achieved,
      finalFuel: outcome.finalFuel,
      coastStartIndex: outcome.coastStartIndex,
    });

    this.emit('scoreCalculated', {
      breakdown,
      isNewBest,
      isValid,
    });
  }

  /**
   * Retry the current mission (same orbit, fresh launch).
   */
  public retryMission(): void {
    if (!this.currentMission) return;

    this.lastParams = null;
    this.lastOutcome = null;
    this.lastScore = null;
    this.transitionTo(GameState.SETUP);
  }

  private transitionTo(to: GameState): void {
    const from = this.state;
    this.state = to;
    this.emit('stateChanged', { from, to });
  }
}
