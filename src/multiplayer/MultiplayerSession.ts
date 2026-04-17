import { EventEmitter } from '../game/GameEvents';
import { PeerConnection, ConnectionState } from './PeerConnection';
import { randomSeed } from '../utils/random';
import type { GameMessage, PlayerInfo } from '../game/GameProtocol';
import { PILOT_NAMES, MAX_PLAYERS } from '../game/GameProtocol';
import type { LaunchParams } from '../physics/LaunchSimulator';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';

/** Multiplayer round state. */
export const RoundPhase = {
  LOBBY: 'LOBBY',
  WAITING_FOR_READY: 'WAITING_FOR_READY',
  PLAYING: 'PLAYING',
  WAITING_FOR_OTHERS: 'WAITING_FOR_OTHERS',
  ROUND_COMPLETE: 'ROUND_COMPLETE',
} as const;

export type RoundPhase = (typeof RoundPhase)[keyof typeof RoundPhase];

/** Tracked state for each player in the session. */
export interface SessionPlayer {
  id: string;
  name: string;
  connected: boolean;
  launch: { params: LaunchParams } | null;
  result: { score: number; breakdown: ScoreBreakdown } | null;
}

export interface MultiplayerEventMap {
  /** Connection status changed. */
  connectionChanged: { state: ConnectionState; error?: string };
  /** Lobby updated — player list changed. */
  lobbyUpdated: { players: SessionPlayer[] };
  /** Game seed established — ready to start playing. */
  gameReady: { seed: number };
  /** A player has launched — replay their trajectory. */
  playerLaunched: { playerId: string; params: LaunchParams };
  /** A player's result has arrived — update the leaderboard. */
  playerResultReceived: { playerId: string; score: number; breakdown: ScoreBreakdown };
  /** All active players have submitted results. */
  allResultsReceived: {};
  /** A player disconnected mid-game. */
  playerDisconnected: { playerId: string; name: string };
}

/**
 * Coordinates a multiplayer session with up to 8 players.
 *
 * Uses a star topology: host connects to all joiners and relays messages.
 * The host assigns pilot names to joiners in connection order.
 *
 * Flow:
 * 1. Host creates room — enters LOBBY phase
 * 2. Joiners connect — each gets a LOBBY_STATE with player list
 * 3. Host clicks "Start Game" — sends HOST_START + GAME_START with seed
 * 4. All players play the same mission (seeded RNG)
 * 5. When a player launches, they send LAUNCH (relayed to all)
 * 6. When a player finishes scoring, they send RESULT (relayed to all)
 * 7. Leaderboard updates live as results arrive
 * 8. When all results are in, allResultsReceived fires
 */
export class MultiplayerSession extends EventEmitter<MultiplayerEventMap> {
  private connection: PeerConnection;
  private seed: number = 0;
  private roundPhase: RoundPhase = RoundPhase.LOBBY;

  /** All players including self. Key is the player ID. */
  private players: Map<string, SessionPlayer> = new Map();

  /** Map from PeerJS peer ID to our logical player ID. */
  private peerToPlayerId: Map<string, string> = new Map();

  /** Our own player ID. */
  private localPlayerId: string = '';

  /** Counter for assigning pilot names. */
  private nextNameIndex: number = 0;

  constructor() {
    super();
    this.connection = new PeerConnection();

    this.connection.on('stateChanged', (e) => {
      this.emit('connectionChanged', e);
    });

    this.connection.on('message', (e) => {
      this.handleMessage(e.message, e.fromPeerId);
    });

    this.connection.on('peerJoined', (e) => {
      if (this.connection.getIsHost()) {
        this.onPeerJoined(e.peerId);
      }
    });

    this.connection.on('peerLeft', (e) => {
      this.onPeerLeft(e.peerId);
    });
  }

  /** Create a room and return the room code. */
  public async createRoom(): Promise<string> {
    const code = await this.connection.createRoom();
    // Host is always Pilot Alpha
    this.localPlayerId = 'host';
    this.nextNameIndex = 0;
    const hostName = PILOT_NAMES[this.nextNameIndex++];
    this.players.set(this.localPlayerId, {
      id: this.localPlayerId,
      name: hostName,
      connected: true,
      launch: null,
      result: null,
    });
    this.roundPhase = RoundPhase.LOBBY;
    this.emitLobbyUpdate();
    return code;
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

  /** Our own player ID. */
  public getLocalPlayerId(): string {
    return this.localPlayerId;
  }

  /** Our own pilot name. */
  public getLocalPlayerName(): string {
    return this.players.get(this.localPlayerId)?.name ?? 'Unknown';
  }

  /** All players in the session. */
  public getPlayers(): SessionPlayer[] {
    return Array.from(this.players.values());
  }

  /** Total number of players. */
  public getPlayerCount(): number {
    return this.players.size;
  }

  /**
   * Host starts the game. Sends seed to all players.
   * Can only be called by the host while in LOBBY phase.
   */
  public startGame(): void {
    if (!this.connection.getIsHost()) return;
    if (this.roundPhase !== RoundPhase.LOBBY && this.roundPhase !== RoundPhase.ROUND_COMPLETE) return;

    this.seed = randomSeed();
    this.resetPlayerRoundState();
    this.roundPhase = RoundPhase.PLAYING;

    this.connection.broadcast({ type: 'GAME_START', seed: this.seed, rounds: 1 });
    this.emit('gameReady', { seed: this.seed });
  }

  /**
   * Called when the local player launches.
   * Sends LAUNCH to all other players.
   */
  public sendLaunch(params: LaunchParams): void {
    const msg: GameMessage = { type: 'LAUNCH', playerId: this.localPlayerId, params };
    this.connection.send(msg);
    this.roundPhase = RoundPhase.WAITING_FOR_OTHERS;

    // Track our own launch
    const self = this.players.get(this.localPlayerId);
    if (self) {
      self.launch = { params };
    }
  }

  /**
   * Called after local scoring completes.
   * Sends RESULT to all other players.
   */
  public sendResult(score: number, breakdown: ScoreBreakdown, params: LaunchParams): void {
    const msg: GameMessage = { type: 'RESULT', playerId: this.localPlayerId, score, breakdown };
    this.connection.send(msg);

    // Track our own result
    const self = this.players.get(this.localPlayerId);
    if (self) {
      self.launch = { params };
      self.result = { score, breakdown };
    }

    this.tryCompleteRound();
  }

  /**
   * Reset for a new round.
   * Host sends a fresh GAME_START with a new seed.
   */
  public nextRound(): void {
    if (this.connection.getIsHost()) {
      this.startGame();
    }
  }

  /** Tear down the session. */
  public disconnect(): void {
    this.connection.disconnect();
  }

  // ---------------------------------------------------------------------------
  // Host: player management
  // ---------------------------------------------------------------------------

  private onPeerJoined(peerId: string): void {
    if (this.nextNameIndex >= MAX_PLAYERS) {
      console.warn('[MultiplayerSession] Room is full, ignoring new peer:', peerId);
      return;
    }

    const playerId = `player-${this.nextNameIndex}`;
    const name = PILOT_NAMES[this.nextNameIndex++] ?? `Pilot ${this.nextNameIndex}`;

    this.peerToPlayerId.set(peerId, playerId);
    this.players.set(playerId, {
      id: playerId,
      name,
      connected: true,
      launch: null,
      result: null,
    });

    // Send full lobby state to everyone
    this.broadcastLobbyState();
    this.emitLobbyUpdate();
  }

  private onPeerLeft(peerId: string): void {
    const playerId = this.peerToPlayerId.get(peerId);
    if (!playerId) return;

    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
      this.emit('playerDisconnected', { playerId, name: player.name });
    }

    this.peerToPlayerId.delete(peerId);

    // If we're in an active round, check if all remaining players are done
    if (this.roundPhase === RoundPhase.PLAYING || this.roundPhase === RoundPhase.WAITING_FOR_OTHERS) {
      this.tryCompleteRound();
    }

    // If host, broadcast updated lobby
    if (this.connection.getIsHost()) {
      this.broadcastLobbyState();
    }

    this.emitLobbyUpdate();
  }

  private broadcastLobbyState(): void {
    const players: PlayerInfo[] = Array.from(this.players.values())
      .filter((p) => p.connected)
      .map((p) => ({ id: p.id, name: p.name }));

    this.connection.broadcast({ type: 'LOBBY_STATE', players });
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  private handleMessage(msg: GameMessage, fromPeerId: string): void {
    switch (msg.type) {
      case 'GAME_START':
        this.handleGameStart(msg.seed);
        break;

      case 'LOBBY_STATE':
        this.handleLobbyState(msg.players, fromPeerId);
        break;

      case 'PLAYER_JOINED':
        // Joiners receive this via relay; no action needed (LOBBY_STATE covers it)
        break;

      case 'PLAYER_LEFT':
        this.handlePlayerLeftMessage(msg.playerId);
        break;

      case 'LAUNCH':
        this.handleLaunch(msg.playerId, msg.params);
        break;

      case 'RESULT':
        this.handleResult(msg.playerId, msg.score, msg.breakdown);
        break;

      case 'HOST_START':
      case 'READY':
      case 'REPLAY_REQUEST':
        // Future use or handled elsewhere
        break;
    }
  }

  private handleGameStart(seed: number): void {
    this.seed = seed;
    this.resetPlayerRoundState();
    this.roundPhase = RoundPhase.PLAYING;
    this.emit('gameReady', { seed: this.seed });
  }

  private handleLobbyState(players: PlayerInfo[], _fromPeerId: string): void {
    // Joiner receives the full player list from host.
    // Rebuild our player map from the host's authoritative state.

    // Find our own ID — it's the one that's NOT already in our map as 'host'
    // The host sends us the full list. We need to figure out which one is us.
    // Convention: the last player in the list that we don't already have tracked is us.
    if (!this.localPlayerId) {
      // First lobby state — figure out our ID
      // We're a joiner, so we'll be the last entry in the list
      const lastPlayer = players[players.length - 1];
      if (lastPlayer) {
        this.localPlayerId = lastPlayer.id;
      }
    }

    // Sync player map
    const currentIds = new Set(players.map((p) => p.id));

    // Add new players
    for (const p of players) {
      if (!this.players.has(p.id)) {
        this.players.set(p.id, {
          id: p.id,
          name: p.name,
          connected: true,
          launch: null,
          result: null,
        });
      } else {
        // Update name and connected status
        const existing = this.players.get(p.id)!;
        existing.name = p.name;
        existing.connected = true;
      }
    }

    // Mark players not in the list as disconnected
    for (const [id, player] of this.players) {
      if (!currentIds.has(id)) {
        player.connected = false;
      }
    }

    this.emitLobbyUpdate();
  }

  private handlePlayerLeftMessage(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
      this.emit('playerDisconnected', { playerId, name: player.name });
      this.emitLobbyUpdate();
    }
  }

  private handleLaunch(playerId: string, params: LaunchParams): void {
    const player = this.players.get(playerId);
    if (player) {
      player.launch = { params };
    }
    this.emit('playerLaunched', { playerId, params });
  }

  private handleResult(playerId: string, score: number, breakdown: ScoreBreakdown): void {
    const player = this.players.get(playerId);
    if (player) {
      player.result = { score, breakdown };
    }
    this.emit('playerResultReceived', { playerId, score, breakdown });
    this.tryCompleteRound();
  }

  // ---------------------------------------------------------------------------
  // Round management
  // ---------------------------------------------------------------------------

  private resetPlayerRoundState(): void {
    for (const player of this.players.values()) {
      player.launch = null;
      player.result = null;
    }
  }

  /**
   * Check if all active (connected) players have submitted results.
   * If so, mark the round as complete.
   */
  private tryCompleteRound(): void {
    const activePlayers = Array.from(this.players.values()).filter((p) => p.connected);
    const allDone = activePlayers.every((p) => p.result !== null);

    if (!allDone) return;

    // Also require that the local player has submitted
    const self = this.players.get(this.localPlayerId);
    if (!self || !self.result) return;

    this.roundPhase = RoundPhase.ROUND_COMPLETE;
    this.emit('allResultsReceived', {});
  }

  private emitLobbyUpdate(): void {
    this.emit('lobbyUpdated', { players: this.getPlayers() });
  }
}
