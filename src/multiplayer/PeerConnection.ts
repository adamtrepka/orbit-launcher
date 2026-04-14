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

/** Timeout in ms for the joiner to establish a data channel. */
const CONNECT_TIMEOUT_MS = 15_000;

/** Shared PeerJS options — debug level + explicit ICE servers. */
const PEER_OPTIONS = {
  debug: 2, // 0=none, 1=errors, 2=warnings, 3=all
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
};

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
  private connectTimer: number = 0;

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
      const peerId = PEER_PREFIX + this.roomCode;
      console.log('[PeerConnection] Host: creating peer with id', peerId);
      this.peer = new Peer(peerId, PEER_OPTIONS);

      this.peer.on('open', (id) => {
        console.log('[PeerConnection] Host: peer open, registered as', id);
        this.setState(ConnectionState.WAITING);
        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        console.log('[PeerConnection] Host: incoming connection from', conn.peer, 'open=', conn.open);
        this.conn = conn;
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('[PeerConnection] Host: peer error', err.type, err.message);
        this.setState(ConnectionState.ERROR, err.message);
        reject(err);
      });

      this.peer.on('disconnected', () => {
        console.warn('[PeerConnection] Host: peer disconnected from signaling server');
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
      let settled = false;

      console.log('[PeerConnection] Joiner: creating anonymous peer');
      this.peer = new Peer(PEER_OPTIONS);

      this.peer.on('open', (id) => {
        console.log('[PeerConnection] Joiner: peer open, registered as', id);

        const targetId = PEER_PREFIX + this.roomCode;
        console.log('[PeerConnection] Joiner: connecting to', targetId);

        const conn = this.peer!.connect(targetId, {
          reliable: true,
          serialization: 'json',
        });
        this.conn = conn;
        this.setupConnection(conn);

        // Resolve once we reach CONNECTED state
        let unsub: (() => void) | null = null;
        unsub = this.on('stateChanged', ({ state, error }) => {
          if (settled) return;
          if (state === ConnectionState.CONNECTED) {
            settled = true;
            unsub?.();
            this.clearConnectTimeout();
            resolve();
          } else if (state === ConnectionState.ERROR) {
            settled = true;
            unsub?.();
            this.clearConnectTimeout();
            reject(new Error(error ?? 'Connection failed'));
          }
        });

        // Timeout: if data channel doesn't open within the limit, fail
        this.connectTimer = window.setTimeout(() => {
          if (!settled) {
            console.error('[PeerConnection] Joiner: connection timed out after', CONNECT_TIMEOUT_MS, 'ms');
            settled = true;
            unsub?.();
            this.setState(ConnectionState.ERROR, 'Connection timed out — opponent may have left.');
            reject(new Error('Connection timed out'));
          }
        }, CONNECT_TIMEOUT_MS);
      });

      this.peer.on('error', (err) => {
        console.error('[PeerConnection] Joiner: peer error', err.type, err.message);
        if (!settled) {
          settled = true;
          this.clearConnectTimeout();
          this.setState(ConnectionState.ERROR, err.message);
          reject(err);
        }
      });

      this.peer.on('disconnected', () => {
        console.warn('[PeerConnection] Joiner: peer disconnected from signaling server');
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
    this.clearConnectTimeout();
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

  /**
   * Attach data/close/error listeners and transition to CONNECTED.
   * Handles the race condition where the connection may already be open
   * by the time this method is called (common on both host and joiner paths).
   */
  private setupConnection(conn: DataConnection): void {
    console.log('[PeerConnection] setupConnection: peer=', conn.peer, 'open=', conn.open, 'type=', conn.type);

    conn.on('data', (data) => {
      this.emit('message', { message: data as GameMessage });
    });

    conn.on('close', () => {
      console.log('[PeerConnection] DataConnection closed');
      this.setState(ConnectionState.DISCONNECTED);
    });

    conn.on('error', (err) => {
      console.error('[PeerConnection] DataConnection error', err.message);
      this.setState(ConnectionState.ERROR, err.message);
    });

    // Handle the open event — check if already open first to avoid
    // missing the event when it fires before we attach the listener.
    if (conn.open) {
      console.log('[PeerConnection] DataConnection already open');
      this.setState(ConnectionState.CONNECTED);
    } else {
      console.log('[PeerConnection] Waiting for DataConnection open event...');
      conn.on('open', () => {
        console.log('[PeerConnection] DataConnection open event fired');
        this.setState(ConnectionState.CONNECTED);
      });
    }
  }

  private setState(state: ConnectionState, error?: string): void {
    console.log('[PeerConnection] setState:', this.state, '->', state, error ? `(${error})` : '');
    this.state = state;
    this.emit('stateChanged', { state, error });
  }

  private clearConnectTimeout(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = 0;
    }
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
