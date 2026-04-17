import type { LaunchParams } from '../physics/LaunchSimulator';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';

/** Auto-generated pilot names assigned in join order. */
export const PILOT_NAMES = [
  'Pilot Alpha',
  'Pilot Bravo',
  'Pilot Charlie',
  'Pilot Delta',
  'Pilot Echo',
  'Pilot Foxtrot',
  'Pilot Golf',
  'Pilot Hotel',
] as const;

/** Maximum number of players in a room. */
export const MAX_PLAYERS = 8;

/** Information about a player in the lobby and during play. */
export interface PlayerInfo {
  id: string;
  name: string;
}

/**
 * Serializable messages for multiplayer exchange.
 *
 * These types define the wire protocol for real-time spectating multiplayer.
 * Both clients share the same seed (deterministic missions), exchange only
 * LaunchParams (5 numbers), and replay the opponent's launch locally using
 * the shared deterministic physics engine.
 *
 * Star topology: host relays messages between all joiners.
 * The network transport (WebSocket, WebRTC, etc.) is NOT part of this module —
 * it only defines the message shapes so any transport can serialize them.
 */
export type GameMessage =
  | { type: 'GAME_START'; seed: number; rounds: number }
  | { type: 'READY'; playerId: string }
  | { type: 'LAUNCH'; playerId: string; params: LaunchParams }
  | { type: 'RESULT'; playerId: string; score: number; breakdown: ScoreBreakdown }
  | { type: 'REPLAY_REQUEST'; round: number }
  | { type: 'LOBBY_STATE'; players: PlayerInfo[] }
  | { type: 'PLAYER_JOINED'; player: PlayerInfo }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'HOST_START' };

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
