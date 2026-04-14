import type { GameState } from './GameState';
import type { TargetOrbit, OrbitParameters } from '../orbits/types';
import type { LaunchParams } from '../physics/LaunchSimulator';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';

/** All events emitted by GameEngine, keyed by event name. */
export interface GameEventMap {
  stateChanged: { from: GameState; to: GameState };
  missionGenerated: { mission: TargetOrbit; seed: number };
  launchStarted: { params: LaunchParams };
  launchCompleted: {
    params: LaunchParams;
    orbitalElements: OrbitParameters;
    finalFuel: number;
    coastStartIndex: number;
  };
  scoreCalculated: { breakdown: ScoreBreakdown; isNewBest: boolean; isValid: boolean };
}

type Listener<T> = (event: T) => void;

/**
 * Minimal typed event emitter.
 *
 * Provides compile-time safety: event names and their payload types are
 * enforced by the GameEventMap interface. Designed for single-threaded
 * synchronous dispatch — no async, no bubbling, no capture.
 */
export class EventEmitter<TMap> {
  private listeners: { [K in keyof TMap]?: Set<Listener<TMap[K]>> } = {};

  /** Subscribe to an event. Returns an unsubscribe function. */
  public on<K extends keyof TMap>(event: K, listener: Listener<TMap[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);

    return () => {
      this.listeners[event]?.delete(listener);
    };
  }

  /** Subscribe to an event for a single firing, then auto-unsubscribe. */
  public once<K extends keyof TMap>(event: K, listener: Listener<TMap[K]>): () => void {
    const wrapper: Listener<TMap[K]> = (e) => {
      unsub();
      listener(e);
    };
    const unsub = this.on(event, wrapper);
    return unsub;
  }

  /** Emit an event to all current listeners. */
  protected emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const set = this.listeners[event];
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }

  /** Remove all listeners (useful for teardown). */
  public removeAllListeners(): void {
    this.listeners = {};
  }
}
