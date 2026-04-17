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
  message: { message: GameMessage; fromPeerId: string };
  peerJoined: { peerId: string };
  peerLeft: { peerId: string };
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
 * Supports up to 8 players using a star topology: the host accepts multiple
 * connections and relays messages between joiners. Joiners only connect to
 * the host. After connection, all sides use send()/broadcast() and subscribe
 * to 'message' events.
 */
export class PeerConnection extends EventEmitter<PeerEventMap> {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
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

  /** Number of active peer connections. */
  public getConnectedCount(): number {
    return this.connections.size;
  }

  /** IDs of all connected peers. */
  public getConnectedPeerIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Create a room and wait for players to join.
   * Returns the room code players need to enter.
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
        this.setupHostConnection(conn);
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
        this.setupJoinerConnection(conn);

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
            this.setState(ConnectionState.ERROR, 'Connection timed out — host may have left.');
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

  /** Send a GameMessage to all connected peers (host broadcasts, joiner sends to host). */
  public broadcast(message: GameMessage): void {
    if (this.state !== ConnectionState.CONNECTED && this.state !== ConnectionState.WAITING) return;
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(message);
      }
    }
  }

  /** Send a GameMessage to a specific peer by ID. Host only. */
  public sendTo(peerId: string, message: GameMessage): void {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(message);
    }
  }

  /** Send a GameMessage to all connected peers. Alias for broadcast for backward compat. */
  public send(message: GameMessage): void {
    this.broadcast(message);
  }

  /**
   * Relay a message from one peer to all other peers. Host only.
   * Optionally include the host's own message handler by re-emitting.
   */
  public relayToOthers(fromPeerId: string, message: GameMessage): void {
    if (!this.isHost) return;
    for (const [peerId, conn] of this.connections.entries()) {
      if (peerId !== fromPeerId && conn.open) {
        conn.send(message);
      }
    }
  }

  /** Tear down the connection and PeerJS instance. */
  public disconnect(): void {
    this.clearConnectTimeout();
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.setState(ConnectionState.DISCONNECTED);
  }

  /**
   * Host side: set up a new incoming connection.
   * The host can accept multiple joiners (star topology).
   */
  private setupHostConnection(conn: DataConnection): void {
    const peerId = conn.peer;
    console.log('[PeerConnection] Host: setupHostConnection for', peerId);

    conn.on('data', (data) => {
      const message = data as GameMessage;
      // Emit to the host's own handler
      this.emit('message', { message, fromPeerId: peerId });
      // Relay to all other connected peers (star topology)
      this.relayToOthers(peerId, message);
    });

    conn.on('close', () => {
      console.log('[PeerConnection] Host: peer disconnected:', peerId);
      this.connections.delete(peerId);
      this.emit('peerLeft', { peerId });
      if (this.connections.size === 0) {
        this.setState(ConnectionState.WAITING);
      }
    });

    conn.on('error', (err) => {
      console.error('[PeerConnection] Host: connection error from', peerId, err.message);
      this.connections.delete(peerId);
      this.emit('peerLeft', { peerId });
    });

    const onOpen = (): void => {
      console.log('[PeerConnection] Host: peer connected:', peerId);
      this.connections.set(peerId, conn);
      this.emit('peerJoined', { peerId });
      // Transition to CONNECTED once we have at least one joiner
      if (this.state === ConnectionState.WAITING) {
        this.setState(ConnectionState.CONNECTED);
      }
    };

    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }
  }

  /**
   * Joiner side: set up the single connection to the host.
   */
  private setupJoinerConnection(conn: DataConnection): void {
    const peerId = conn.peer;
    console.log('[PeerConnection] Joiner: setupConnection to host', peerId);

    conn.on('data', (data) => {
      this.emit('message', { message: data as GameMessage, fromPeerId: peerId });
    });

    conn.on('close', () => {
      console.log('[PeerConnection] Joiner: connection to host closed');
      this.connections.delete(peerId);
      this.setState(ConnectionState.DISCONNECTED);
    });

    conn.on('error', (err) => {
      console.error('[PeerConnection] Joiner: connection error', err.message);
      this.setState(ConnectionState.ERROR, err.message);
    });

    const onOpen = (): void => {
      console.log('[PeerConnection] Joiner: connected to host');
      this.connections.set(peerId, conn);
      this.setState(ConnectionState.CONNECTED);
    };

    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
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
