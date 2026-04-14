import { EventEmitter } from '../game/GameEvents';
import { PeerConnection, ConnectionState } from './PeerConnection';
import { randomSeed } from '../utils/random';
import type { GameMessage } from '../game/GameProtocol';
import type { LaunchParams } from '../physics/LaunchSimulator';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';

/** Multiplayer round state. */
export const RoundPhase = {
  WAITING_FOR_READY: 'WAITING_FOR_READY',
  PLAYING: 'PLAYING',
  WAITING_FOR_OPPONENT: 'WAITING_FOR_OPPONENT',
  ROUND_COMPLETE: 'ROUND_COMPLETE',
} as const;

export type RoundPhase = (typeof RoundPhase)[keyof typeof RoundPhase];

export interface OpponentResult {
  params: LaunchParams;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface MultiplayerEventMap {
  /** Connection status changed. */
  connectionChanged: { state: ConnectionState; error?: string };
  /** Both players connected, game seed established — ready to start. */
  gameReady: { seed: number };
  /** Opponent has launched — replay their trajectory. */
  opponentLaunched: { params: LaunchParams };
  /** Both players done — show combined results. */
  roundComplete: { opponent: OpponentResult };
  /** Opponent disconnected mid-game. */
  opponentDisconnected: {};
}

/**
 * Coordinates a multiplayer session on top of PeerConnection.
 *
 * Flow:
 * 1. Host creates room, joiner connects
 * 2. Host sends GAME_START with seed
 * 3. Both players play same mission (seeded RNG)
 * 4. When player launches, sends LAUNCH message
 * 5. When both have launched, sends RESULT message
 * 6. Both sides emit roundComplete with opponent's data
 */
export class MultiplayerSession extends EventEmitter<MultiplayerEventMap> {
  private connection: PeerConnection;
  private seed: number = 0;
  private roundPhase: RoundPhase = RoundPhase.WAITING_FOR_READY;

  // Track whether we and opponent have launched this round
  private myLaunch: { params: LaunchParams; score: number; breakdown: ScoreBreakdown } | null = null;
  private opponentLaunch: { params: LaunchParams } | null = null;
  private opponentResult: { score: number; breakdown: ScoreBreakdown } | null = null;

  constructor() {
    super();
    this.connection = new PeerConnection();

    this.connection.on('stateChanged', (e) => {
      this.emit('connectionChanged', e);

      if (e.state === ConnectionState.CONNECTED) {
        this.onConnected();
      }
      if (e.state === ConnectionState.DISCONNECTED) {
        this.emit('opponentDisconnected', {});
      }
    });

    this.connection.on('message', (e) => {
      this.handleMessage(e.message);
    });
  }

  /** Create a room and return the room code. */
  public async createRoom(): Promise<string> {
    return this.connection.createRoom();
  }

  /** Join a room by code. */
  public async joinRoom(code: string): Promise<void> {
    return this.connection.joinRoom(code);
  }

  /** Get the connection state. */
  public getConnectionState(): ConnectionState {
    return this.connection.getState();
  }

  /** Get the room code. */
  public getRoomCode(): string {
    return this.connection.getRoomCode();
  }

  /** Whether this client is the host. */
  public isHost(): boolean {
    return this.connection.getIsHost();
  }

  /** Current round phase. */
  public getRoundPhase(): RoundPhase {
    return this.roundPhase;
  }

  /** The game seed (set by host on connection). */
  public getSeed(): number {
    return this.seed;
  }

  /**
   * Called when the local player launches.
   * Sends LAUNCH to opponent. If opponent already launched, triggers roundComplete.
   */
  public sendLaunch(params: LaunchParams): void {
    this.connection.send({ type: 'LAUNCH', playerId: 'local', params });
    this.roundPhase = RoundPhase.WAITING_FOR_OPPONENT;

    // If opponent already launched, we just need our result to complete the round
    // (result will be sent after scoring)
  }

  /**
   * Called after local scoring completes.
   * Sends RESULT to opponent. If opponent's result is already in, emits roundComplete.
   */
  public sendResult(score: number, breakdown: ScoreBreakdown, params: LaunchParams): void {
    this.myLaunch = { params, score, breakdown };
    this.connection.send({ type: 'RESULT', playerId: 'local', score, breakdown });
    this.tryCompleteRound();
  }

  /**
   * Reset for a new round.
   * Host sends a fresh GAME_START with a new seed.
   */
  public nextRound(): void {
    this.myLaunch = null;
    this.opponentLaunch = null;
    this.opponentResult = null;
    this.roundPhase = RoundPhase.PLAYING;

    if (this.connection.getIsHost()) {
      this.seed = randomSeed();
      this.connection.send({ type: 'GAME_START', seed: this.seed, rounds: 1 });
      this.emit('gameReady', { seed: this.seed });
    }
  }

  /** Tear down the session. */
  public disconnect(): void {
    this.connection.disconnect();
  }

  private onConnected(): void {
    // Host initiates the game with a seed
    if (this.connection.getIsHost()) {
      this.seed = randomSeed();
      this.connection.send({ type: 'GAME_START', seed: this.seed, rounds: 1 });
      this.roundPhase = RoundPhase.PLAYING;
      this.emit('gameReady', { seed: this.seed });
    }
    // Joiner waits for GAME_START message
  }

  private handleMessage(msg: GameMessage): void {
    switch (msg.type) {
      case 'GAME_START':
        this.seed = msg.seed;
        this.myLaunch = null;
        this.opponentLaunch = null;
        this.opponentResult = null;
        this.roundPhase = RoundPhase.PLAYING;
        this.emit('gameReady', { seed: this.seed });
        break;

      case 'LAUNCH':
        this.opponentLaunch = { params: msg.params };
        this.emit('opponentLaunched', { params: msg.params });
        break;

      case 'RESULT':
        this.opponentResult = { score: msg.score, breakdown: msg.breakdown };
        this.tryCompleteRound();
        break;

      case 'READY':
      case 'REPLAY_REQUEST':
        // Future use
        break;
    }
  }

  /**
   * Check if both players have sent their results.
   * If so, emit roundComplete.
   */
  private tryCompleteRound(): void {
    if (!this.myLaunch || !this.opponentResult || !this.opponentLaunch) return;

    this.roundPhase = RoundPhase.ROUND_COMPLETE;
    this.emit('roundComplete', {
      opponent: {
        params: this.opponentLaunch.params,
        score: this.opponentResult.score,
        breakdown: this.opponentResult.breakdown,
      },
    });
  }
}
