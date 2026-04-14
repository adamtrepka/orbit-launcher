import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { EventEmitter } from '../game/GameEvents';
import type { GameMessage } from '../game/GameProtocol';

/** Connection states for UI feedback. */
export const ConnectionState = {
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  WAITING: 'WAITING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
} as const;

export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];

export interface PeerEventMap {
  stateChanged: { state: ConnectionState; error?: string };
  message: { message: GameMessage };
}

/** Prefix for PeerJS IDs so they don't collide with other apps. */
const PEER_PREFIX = 'orbit-launcher-';

/**
 * Wraps PeerJS for creating/joining rooms and exchanging GameMessages.
 *
 * One player "hosts" (creates a room with a code), the other "joins".
 * After connection, both sides use send() and subscribe to 'message' events.
 */
export class PeerConnection extends EventEmitter<PeerEventMap> {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private state: ConnectionState = ConnectionState.IDLE;
  private roomCode: string = '';
  private isHost: boolean = false;

  public getState(): ConnectionState {
    return this.state;
  }

  public getRoomCode(): string {
    return this.roomCode;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  /**
   * Create a room and wait for an opponent to join.
   * Returns the room code the opponent needs to enter.
   */
  public createRoom(): Promise<string> {
    this.roomCode = generateRoomCode();
    this.isHost = true;
    this.setState(ConnectionState.CONNECTING);

    return new Promise((resolve, reject) => {
      this.peer = new Peer(PEER_PREFIX + this.roomCode);

      this.peer.on('open', () => {
        this.setState(ConnectionState.WAITING);
        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this.setupConnection();
      });

      this.peer.on('error', (err) => {
        this.setState(ConnectionState.ERROR, err.message);
        reject(err);
      });
    });
  }

  /**
   * Join an existing room by code.
   */
  public joinRoom(code: string): Promise<void> {
    this.roomCode = code.toUpperCase().trim();
    this.isHost = false;
    this.setState(ConnectionState.CONNECTING);

    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', () => {
        this.conn = this.peer!.connect(PEER_PREFIX + this.roomCode, {
          reliable: true,
        });

        this.conn.on('open', () => {
          this.setupConnection();
          resolve();
        });

        this.conn.on('error', (err) => {
          this.setState(ConnectionState.ERROR, err.message);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        this.setState(ConnectionState.ERROR, err.message);
        reject(err);
      });
    });
  }

  /** Send a GameMessage to the connected peer. */
  public send(message: GameMessage): void {
    if (!this.conn || this.state !== ConnectionState.CONNECTED) return;
    this.conn.send(message);
  }

  /** Tear down the connection and PeerJS instance. */
  public disconnect(): void {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.setState(ConnectionState.DISCONNECTED);
  }

  private setupConnection(): void {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.setState(ConnectionState.CONNECTED);
    });

    // If we're the joiner, the connection is already open when we reach here
    if (this.conn.open) {
      this.setState(ConnectionState.CONNECTED);
    }

    this.conn.on('data', (data) => {
      this.emit('message', { message: data as GameMessage });
    });

    this.conn.on('close', () => {
      this.setState(ConnectionState.DISCONNECTED);
    });

    this.conn.on('error', (err) => {
      this.setState(ConnectionState.ERROR, err.message);
    });
  }

  private setState(state: ConnectionState, error?: string): void {
    this.state = state;
    this.emit('stateChanged', { state, error });
  }
}

/** Generate a 6-character uppercase alphanumeric room code. */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
