import * as THREE from 'three';

import type { Difficulty } from '../orbits/types';

/**
 * Mutator type identifiers.
 */
export const MutatorType = {
  ATMOSPHERIC_DRAG: 'ATMOSPHERIC_DRAG',
  LUNAR_PERTURBATION: 'LUNAR_PERTURBATION',
  SOLAR_WIND: 'SOLAR_WIND',
  TIME_PRESSURE: 'TIME_PRESSURE',
  MOVING_TARGET: 'MOVING_TARGET',
} as const;

export type MutatorType = (typeof MutatorType)[keyof typeof MutatorType];

/**
 * A difficulty mutator modifies physics, scoring, or UI to add gameplay variety.
 */
export interface DifficultyMutator {
  /** Unique identifier */
  id: MutatorType;
  /** Display name */
  name: string;
  /** Short description shown in briefing */
  description: string;
  /** Icon character for UI display */
  icon: string;
  /** Score multiplier bonus (1.0 = no bonus) */
  scoreMultiplier: number;
  /** Override launch timer seconds (null = use default 30s) */
  timerOverride: number | null;
  /** Compute additional acceleration (km/s²) to apply during physics sim */
  computeForce: ((pos: THREE.Vector3, vel: THREE.Vector3, alt: number, time: number) => THREE.Vector3) | null;
}

// ---------------------------------------------------------------------------
// Concrete mutator definitions
// ---------------------------------------------------------------------------

/** Scale height for exponential atmospheric drag model (km) */
const DRAG_SCALE_HEIGHT = 50;
/** Reference density altitude (sea level) */
const DRAG_REF_ALT = 0;
/** Drag coefficient tuned to make LEO orbits noticeably harder */
const DRAG_COEFFICIENT = 2.0e-5;

/**
 * Atmospheric drag: velocity-dependent deceleration at low altitudes.
 * Force = -Cd * rho(alt) * |v| * v  (opposite to velocity)
 * rho(alt) = exp(-(alt - alt0) / H) for alt < 400 km, 0 above.
 */
const ATMOSPHERIC_DRAG: DifficultyMutator = {
  id: MutatorType.ATMOSPHERIC_DRAG,
  name: 'Atmospheric Drag',
  description: 'Residual atmosphere slows your rocket at low altitudes. Burn more fuel to compensate.',
  icon: '\u{1F32C}',
  scoreMultiplier: 1.1,
  timerOverride: null,
  computeForce: (_pos: THREE.Vector3, vel: THREE.Vector3, alt: number, _time: number): THREE.Vector3 => {
    if (alt > 400 || alt < 0) return new THREE.Vector3();

    const rho = Math.exp(-(alt - DRAG_REF_ALT) / DRAG_SCALE_HEIGHT);
    const speed = vel.length();
    if (speed < 0.001) return new THREE.Vector3();

    // Drag opposes velocity
    const dragMag = DRAG_COEFFICIENT * rho * speed;
    return vel.clone().normalize().multiplyScalar(-dragMag);
  },
};

/** Moon distance from Earth (km, average) */
const MOON_DISTANCE = 384400;
/** Moon gravitational parameter (km³/s²) */
const MOON_MU = 4902.8;

/**
 * Lunar perturbation: third-body gravity from the Moon.
 * The Moon orbits in the XZ plane at a fixed position for simplicity.
 * Effect is small at LEO but significant for high orbits (GEO+).
 */
const LUNAR_PERTURBATION: DifficultyMutator = {
  id: MutatorType.LUNAR_PERTURBATION,
  name: 'Lunar Gravity',
  description: 'The Moon\'s gravity tugs on high orbits. Your trajectory will drift from predictions.',
  icon: '\u{1F319}',
  scoreMultiplier: 1.15,
  timerOverride: null,
  computeForce: (pos: THREE.Vector3, _vel: THREE.Vector3, _alt: number, time: number): THREE.Vector3 => {
    // Moon position: circular orbit in XZ plane, period ~27.3 days
    const moonPeriod = 27.3 * 24 * 3600; // seconds
    const moonAngle = (2 * Math.PI * time) / moonPeriod;
    const moonPos = new THREE.Vector3(
      MOON_DISTANCE * Math.cos(moonAngle),
      0,
      MOON_DISTANCE * Math.sin(moonAngle),
    );

    // Vector from spacecraft to Moon
    const toMoon = moonPos.clone().sub(pos);
    const dist = toMoon.length();

    // Gravitational acceleration toward Moon
    const accel = MOON_MU / (dist * dist);
    return toMoon.normalize().multiplyScalar(accel);
  },
};

/** Solar wind force magnitude (km/s², very small but cumulative) */
const SOLAR_WIND_MAGNITUDE = 5.0e-7;

/**
 * Solar wind: quasi-random lateral force that fluctuates over time.
 * Simulates radiation pressure and solar particle effects.
 * Uses deterministic pseudo-random variation based on time.
 */
const SOLAR_WIND: DifficultyMutator = {
  id: MutatorType.SOLAR_WIND,
  name: 'Solar Wind',
  description: 'Unpredictable solar particle pressure buffets your spacecraft. Ghost preview may not match reality.',
  icon: '\u{2600}',
  scoreMultiplier: 1.1,
  timerOverride: null,
  computeForce: (pos: THREE.Vector3, _vel: THREE.Vector3, alt: number, time: number): THREE.Vector3 => {
    if (alt < 100) return new THREE.Vector3(); // No effect in atmosphere

    // Deterministic oscillation with multiple frequencies for pseudo-randomness
    const f1 = Math.sin(time * 0.01) * Math.cos(time * 0.007);
    const f2 = Math.cos(time * 0.013) * Math.sin(time * 0.009);
    const f3 = Math.sin(time * 0.005 + 1.7);

    // Force perpendicular to radial direction
    const radial = pos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(up, radial).normalize();
    const normal = new THREE.Vector3().crossVectors(radial, tangent).normalize();

    // Scale increases with altitude (more exposed to solar wind)
    const altScale = Math.min(1, alt / 1000);
    const mag = SOLAR_WIND_MAGNITUDE * altScale;

    return tangent.multiplyScalar(f1 * mag)
      .add(normal.multiplyScalar(f2 * mag))
      .add(radial.multiplyScalar(f3 * mag * 0.3));
  },
};

/**
 * Time pressure: launch timer reduced to 15 seconds.
 * No physics force — purely a UI/gameplay modifier.
 */
const TIME_PRESSURE: DifficultyMutator = {
  id: MutatorType.TIME_PRESSURE,
  name: 'Time Pressure',
  description: 'Launch window closing! You have only 15 seconds to configure and launch.',
  icon: '\u{23F1}',
  scoreMultiplier: 1.2,
  timerOverride: 15,
  computeForce: null,
};

/**
 * Moving target: the target orbit parameters drift during setup.
 * This mutator doesn't add physics forces — it's handled by Game.ts
 * modifying the displayed target orbit parameters over time.
 * The computeForce is null; the mutator presence signals Game.ts to
 * animate the target.
 */
const MOVING_TARGET: DifficultyMutator = {
  id: MutatorType.MOVING_TARGET,
  name: 'Moving Target',
  description: 'Target orbit is shifting! Parameters change while you prepare. Launch at the right moment.',
  icon: '\u{1F3AF}',
  scoreMultiplier: 1.3,
  timerOverride: null,
  computeForce: null,
};

/** All available mutators, indexed by type. */
export const MUTATOR_REGISTRY: Record<MutatorType, DifficultyMutator> = {
  [MutatorType.ATMOSPHERIC_DRAG]: ATMOSPHERIC_DRAG,
  [MutatorType.LUNAR_PERTURBATION]: LUNAR_PERTURBATION,
  [MutatorType.SOLAR_WIND]: SOLAR_WIND,
  [MutatorType.TIME_PRESSURE]: TIME_PRESSURE,
  [MutatorType.MOVING_TARGET]: MOVING_TARGET,
};

/** Mutators available at each difficulty tier (cumulative pool to pick from). */
const MUTATOR_POOLS: Record<Difficulty, MutatorType[]> = {
  EASY: [MutatorType.ATMOSPHERIC_DRAG],
  MEDIUM: [MutatorType.ATMOSPHERIC_DRAG, MutatorType.LUNAR_PERTURBATION, MutatorType.SOLAR_WIND],
  HARD: [MutatorType.ATMOSPHERIC_DRAG, MutatorType.LUNAR_PERTURBATION, MutatorType.SOLAR_WIND, MutatorType.TIME_PRESSURE],
  EXPERT: [MutatorType.ATMOSPHERIC_DRAG, MutatorType.LUNAR_PERTURBATION, MutatorType.SOLAR_WIND, MutatorType.TIME_PRESSURE, MutatorType.MOVING_TARGET],
};

/** How many mutators to assign at each difficulty. */
const MUTATOR_COUNTS: Record<Difficulty, { min: number; max: number }> = {
  EASY: { min: 0, max: 1 },
  MEDIUM: { min: 0, max: 2 },
  HARD: { min: 1, max: 2 },
  EXPERT: { min: 1, max: 3 },
};

/**
 * Select mutators for a mission based on its difficulty.
 * Uses the provided RNG function for deterministic selection (multiplayer-safe).
 */
export function selectMutators(difficulty: Difficulty, rng?: () => number): DifficultyMutator[] {
  const nextFn = rng ?? Math.random;
  const pool = MUTATOR_POOLS[difficulty];
  const counts = MUTATOR_COUNTS[difficulty];

  const count = counts.min + Math.floor(nextFn() * (counts.max - counts.min + 1));
  if (count === 0) return [];

  // Shuffle pool and pick
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(nextFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length)).map((t) => MUTATOR_REGISTRY[t]);
}

/**
 * Compute the combined score multiplier for a set of active mutators.
 */
export function getCombinedScoreMultiplier(mutators: DifficultyMutator[]): number {
  let multiplier = 1.0;
  for (const m of mutators) {
    multiplier *= m.scoreMultiplier;
  }
  return multiplier;
}

/**
 * Get the effective timer duration from mutators.
 * Returns the shortest timer override, or the default if no mutator overrides it.
 */
export function getEffectiveTimer(mutators: DifficultyMutator[], defaultTimer: number): number {
  let timer = defaultTimer;
  for (const m of mutators) {
    if (m.timerOverride !== null && m.timerOverride < timer) {
      timer = m.timerOverride;
    }
  }
  return timer;
}

/**
 * Compute the combined additional acceleration from all active mutators' forces.
 */
export function computeMutatorForces(
  mutators: DifficultyMutator[],
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  alt: number,
  time: number,
): THREE.Vector3 {
  const total = new THREE.Vector3();
  for (const m of mutators) {
    if (m.computeForce) {
      total.add(m.computeForce(pos, vel, alt, time));
    }
  }
  return total;
}
