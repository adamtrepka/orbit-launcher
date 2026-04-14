/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Deterministic: given the same seed, produces the identical sequence of
 * numbers every time. This is critical for multiplayer — both clients using
 * the same seed will generate identical missions.
 *
 * Interface mirrors Math.random() so it can be used as a drop-in replacement
 * in any function that needs controllable randomness.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a float in [0, 1), same contract as Math.random(). */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] (inclusive). */
  public int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

/** Generate a random seed from system entropy (for starting new games). */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
