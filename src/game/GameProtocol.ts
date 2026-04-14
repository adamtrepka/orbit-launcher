import type { LaunchParams } from '../physics/LaunchSimulator';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';

/**
 * Serializable messages for multiplayer exchange.
 *
 * These types define the wire protocol for real-time spectating multiplayer.
 * Both clients share the same seed (deterministic missions), exchange only
 * LaunchParams (5 numbers), and replay the opponent's launch locally using
 * the shared deterministic physics engine.
 *
 * The network transport (WebSocket, WebRTC, etc.) is NOT part of this module —
 * it only defines the message shapes so any transport can serialize them.
 */
export type GameMessage =
  | { type: 'GAME_START'; seed: number; rounds: number }
  | { type: 'READY'; playerId: string }
  | { type: 'LAUNCH'; playerId: string; params: LaunchParams }
  | { type: 'RESULT'; playerId: string; score: number; breakdown: ScoreBreakdown }
  | { type: 'REPLAY_REQUEST'; round: number };

/**
 * Full snapshot of a multiplayer game, suitable for reconnection or replay.
 */
export interface GameSnapshot {
  seed: number;
  round: number;
  totalRounds: number;
  players: PlayerState[];
}

export interface PlayerState {
  id: string;
  name: string;
  launches: LaunchParams[];
  scores: number[];
}
