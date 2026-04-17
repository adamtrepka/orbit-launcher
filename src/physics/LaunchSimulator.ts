import * as THREE from 'three';
import { EARTH_RADIUS, MU } from '../utils/constants';
import { computeMutatorForces } from '../game/Mutators';
import type { OrbitParameters } from '../orbits/types';
import type { DifficultyMutator } from '../game/Mutators';

export interface SimState {
  /** Position in km (Earth-centered) */
  position: THREE.Vector3;
  /** Velocity in km/s */
  velocity: THREE.Vector3;
  /** Elapsed simulation time in seconds */
  time: number;
  /** Fuel remaining (0-1) */
  fuel: number;
  /** Current altitude above Earth surface in km */
  altitude: number;
}

export interface LaunchParams {
  /** Launch azimuth in degrees (compass: 0=North, 90=East, 180=South, 270=West) */
  azimuth: number;
  /** Launch elevation angle in degrees above horizon */
  elevation: number;
  /** Stage 1 thrust percentage (0-1) */
  thrustPercent: number;
  /** Altitude at which to perform injection burn (km) */
  burnAltitude: number;
  /** Target apogee altitude (km) - the sim computes needed injection DV */
  targetApogee: number;
}

/** Total delta-V budget in km/s */
const TOTAL_DV = 16.0;

/** Ascent burn duration in seconds */
const ASCENT_DURATION = 300;

/**
 * Compute orbital elements from a state vector (position + velocity).
 */
export function computeOrbitalElements(
  posKm: THREE.Vector3,
  velKmS: THREE.Vector3
): OrbitParameters {
  const r = posKm.length();
  const v = velKmS.length();

  // Specific orbital energy
  const energy = (v * v) / 2 - MU / r;

  // Semi-major axis
  const a = -MU / (2 * energy);

  // Angular momentum vector h = r x v
  const h = new THREE.Vector3().crossVectors(posKm, velKmS);
  const hMag = h.length();

  // Inclination: in our coordinate system, Y is the polar axis.
  // For prograde equatorial orbits, h points in -Y direction,
  // so we negate h.y to get standard inclination (0° = prograde equatorial).
  const cosInc = Math.max(-1, Math.min(1, -h.y / hMag));
  const inclination = (Math.acos(cosInc) * 180) / Math.PI;

  // Eccentricity vector
  const eVec = new THREE.Vector3()
    .crossVectors(velKmS, h)
    .divideScalar(MU)
    .sub(posKm.clone().divideScalar(r));
  const eccentricity = eVec.length();

  // Altitude (semi-major axis - Earth radius)
  const altitude = a - EARTH_RADIUS;

  // For elliptical orbits, compute perigee and apogee
  const perigee = a * (1 - eccentricity) - EARTH_RADIUS;
  const apogee = a * (1 + eccentricity) - EARTH_RADIUS;

  if (eccentricity > 0.05) {
    return {
      altitude,
      perigee: Math.max(0, perigee),
      apogee,
      inclination: Math.abs(inclination),
      eccentricity,
    };
  }

  return {
    altitude,
    inclination: Math.abs(inclination),
    eccentricity,
  };
}

/**
 * Compute the apogee radius (km from Earth center) of the orbit defined
 * by a given position and velocity state vector.
 * Returns Infinity for hyperbolic/escape trajectories.
 */
function getApogeeFromState(posKm: THREE.Vector3, velKmS: THREE.Vector3): number {
  const r = posKm.length();
  const v = velKmS.length();
  const energy = (v * v) / 2 - MU / r;
  if (energy >= 0) return Infinity; // escape trajectory

  const a = -MU / (2 * energy);
  const h = new THREE.Vector3().crossVectors(posKm, velKmS);
  const eVec = new THREE.Vector3()
    .crossVectors(velKmS, h)
    .divideScalar(MU)
    .sub(posKm.clone().divideScalar(r));
  const e = eVec.length();
  return a * (1 + e);
}

/**
 * Compute the prograde delta-V needed at a given position/velocity
 * to reach a target apogee altitude.
 *
 * Uses binary search: tries different prograde DV values, computes the
 * resulting apogee from the full state vector (accounting for radial
 * velocity), and converges on the correct value.
 *
 * Returns the delta-V in km/s (positive = prograde, 0 if already above target).
 */
function computeInjectionDV(
  posKm: THREE.Vector3,
  velKmS: THREE.Vector3,
  targetApogeeAlt: number
): number {
  const targetApogeeR = targetApogeeAlt + EARTH_RADIUS;

  // Check if current orbit already reaches the target
  const currentApogeeR = getApogeeFromState(posKm, velKmS);
  if (currentApogeeR >= targetApogeeR) return 0;

  // Binary search for the prograde DV that produces the target apogee
  const prograde = velKmS.clone().normalize();
  let lo = 0;
  let hi = 12; // km/s upper bound (more than enough for any orbit)

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const testVel = velKmS.clone().add(prograde.clone().multiplyScalar(mid));
    const testApogee = getApogeeFromState(posKm, testVel);

    if (testApogee < targetApogeeR) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

/**
 * Simulation phases.
 */
const Phase = {
  ASCENT: 0,
  COAST_TO_BURN: 1,
  COAST_TO_APOGEE: 2,
  FINAL_COAST: 3,
  DONE: 4,
} as const;

type Phase = (typeof Phase)[keyof typeof Phase];

/**
 * Simulate a rocket launch with the given parameters.
 *
 * Physics model (two-burn Hohmann-style):
 *   1. ASCENT: 300s of continuous thrust with gravity turn
 *   2. COAST to burnAltitude
 *   3. INJECTION BURN: prograde burn computed to reach targetApogee
 *   4. COAST TO APOGEE of the resulting orbit
 *   5. CIRCULARIZATION: at apogee, burn prograde toward circular velocity (fraction-limited)
 *   6. Compute final orbital elements
 *
 * The player controls eccentricity through the thrust slider:
 *   - Thrust ≤50% → circFraction=1.0 → full circularization → circular orbit
 *   - Thrust 50-62% → circFraction decreases linearly → partial circ → elliptical
 *   - Thrust ≥62% → circFraction=0.0 → no circularization → fully elliptical
 */
export function simulateLaunch(params: LaunchParams, mutators?: DifficultyMutator[]): {
  trajectory: THREE.Vector3[];
  finalState: SimState;
  orbitalElements: OrbitParameters;
  /** Trajectory index where the final coast (orbit loop) begins */
  coastStartIndex: number;
} {
  const maxSteps = 80000;
  const trajectory: THREE.Vector3[] = [];
  let coastStartIndex = 0;

  // Launch site: equator, Earth surface
  const pos = new THREE.Vector3(EARTH_RADIUS, 0, 0);
  const vel = new THREE.Vector3(0, 0, 0.465); // Earth rotation ~0.465 km/s eastward

  // Launch direction (compass: 0=N, 90=E, 180=S, 270=W)
  const azRad = (params.azimuth * Math.PI) / 180;
  const elRad = (params.elevation * Math.PI) / 180;
  const thrustDir = new THREE.Vector3(
    Math.sin(elRad),                    // radial (up)
    Math.cos(elRad) * Math.cos(azRad),  // north (Y): max at az=0
    Math.cos(elRad) * Math.sin(azRad)   // east (Z): max at az=90
  ).normalize();

  // Delta-V budget
  const ascentBudget = TOTAL_DV * params.thrustPercent; // km/s for ascent
  const ascentAccel = ascentBudget / ASCENT_DURATION;   // km/s²

  // Circularization fraction: sharp falloff based on thrust.
  // At 50% thrust → circFraction ≈ 1.0 (full circ) → circular orbits
  // At 62% thrust → circFraction ≈ 0.0 (no circ) → elliptical orbits
  // This controls what fraction of the circularization deficit the auto-circ will cover.
  const CIRC_FULL_BELOW = 0.50; // full circ at or below this thrust
  const CIRC_ZERO_ABOVE = 0.62; // no circ at or above this thrust
  const circFraction = Math.max(0, Math.min(1,
    (CIRC_ZERO_ABOVE - params.thrustPercent) / (CIRC_ZERO_ABOVE - CIRC_FULL_BELOW)
  ));

  let dvRemaining = TOTAL_DV;
  let time = 0;
  let ascentTime = 0;
  let phase: Phase = Phase.ASCENT;
  let prevRadialVel = 1.0;
  let finalCoastSteps = 0;
  let finalCoastTarget = 50;  // will be computed when entering FINAL_COAST
  let finalCoastDt = 2.0;     // will be set to larger dt for orbit trace

  for (let step = 0; step < maxSteps; step++) {
    const r = pos.length();
    const alt = r - EARTH_RADIUS;

    // Adaptive time step
    const dt = phase === Phase.ASCENT ? 1.0 : phase === Phase.COAST_TO_APOGEE ? 5.0 : 2.0;

    // Store trajectory
    // During FINAL_COAST, store every step (dt is already 30s, so points are well-spaced)
    // During other phases, store every 3rd step
    if (phase === Phase.FINAL_COAST || step % 3 === 0) {
      trajectory.push(pos.clone());
    }

    // Gravity
    const gravMag = -MU / (r * r);
    const grav = pos.clone().normalize().multiplyScalar(gravMag);

    // Thrust (only during ascent)
    const thrust = new THREE.Vector3();

    // === Phase: ASCENT ===
    if (phase === Phase.ASCENT) {
      if (ascentTime < ASCENT_DURATION && dvRemaining > 0.01) {
        const pitchFactor = Math.max(0, 1 - ascentTime / ASCENT_DURATION);
        const velNorm = vel.length() > 0.001 ? vel.clone().normalize() : thrustDir.clone();
        const dir = new THREE.Vector3()
          .copy(thrustDir)
          .multiplyScalar(pitchFactor)
          .add(velNorm.multiplyScalar(1 - pitchFactor))
          .normalize();

        const accel = Math.min(ascentAccel, dvRemaining / dt);
        thrust.copy(dir.multiplyScalar(accel));
        dvRemaining -= accel * dt;
        ascentTime += dt;
      } else {
        phase = Phase.COAST_TO_BURN;
      }
    }

    // === Phase: COAST TO BURN ===
    if (phase === Phase.COAST_TO_BURN) {
      if (alt >= params.burnAltitude) {
        // Compute injection DV to reach target apogee
        const neededDV = computeInjectionDV(pos, vel, params.targetApogee);
        const actualDV = Math.min(neededDV, Math.max(0, dvRemaining));

        if (actualDV > 0.01) {
          const prograde = vel.clone().normalize();
          vel.add(prograde.multiplyScalar(actualDV));
          dvRemaining -= actualDV;
        }
        phase = Phase.COAST_TO_APOGEE;
      }

      // Timeout: if rocket can't reach burn altitude, skip
      if (phase === Phase.COAST_TO_BURN && time > ASCENT_DURATION + 30000) {
        phase = Phase.COAST_TO_APOGEE;
      }
    }

    // === Radial velocity for apogee detection ===
    const radialVel = pos.clone().normalize().dot(vel);

    // === Phase: COAST TO APOGEE ===
    if (phase === Phase.COAST_TO_APOGEE) {
      // Detect apogee: radial velocity crosses from positive to negative
      if (prevRadialVel > 0 && radialVel <= 0 && time > ASCENT_DURATION + 5) {
        // Fire circularization burn at apogee
        // circFraction controls how much of the deficit to close:
        //   1.0 = full circ (circular orbit), 0.0 = no circ (stays elliptical)
        const vCirc = Math.sqrt(MU / r);
        const vCurr = vel.length();
        const deficit = vCirc - vCurr;

        if (deficit > 0.01 && dvRemaining > 0.01) {
          const targetCircDV = deficit * circFraction;
          const actualDV = Math.min(targetCircDV, dvRemaining);
          if (actualDV > 0.01) {
            const prograde = vel.clone().normalize();
            vel.add(prograde.multiplyScalar(actualDV));
            dvRemaining -= actualDV;
          }
        }
        phase = Phase.FINAL_COAST;
      }

      // Check for hyperbolic escape
      const energy = vel.lengthSq() / 2 - MU / r;
      if (energy > 0) {
        phase = Phase.FINAL_COAST;
      }

      // Timeout for coast to apogee
      if (time > ASCENT_DURATION + 50000) {
        phase = Phase.FINAL_COAST;
      }
    }

    prevRadialVel = radialVel;

    // === Phase: FINAL COAST ===
    // After all burns, coast for one full orbital period to trace the final orbit.
    if (phase === Phase.FINAL_COAST) {
      finalCoastSteps++;
      // Compute orbital period from current state (once, when entering this phase)
      if (finalCoastSteps === 1) {
        // Record where the orbit loop begins in the trajectory
        coastStartIndex = trajectory.length;
        const energy = vel.lengthSq() / 2 - MU / r;
        if (energy < 0) {
          // Bound orbit: period = 2π * sqrt(a³/μ)
          const a = -MU / (2 * energy);
          const period = 2 * Math.PI * Math.sqrt(a * a * a / MU);
          // Coast for one full period. dt in FINAL_COAST is 2.0 (from the dt line above,
          // but we'll use a bigger dt for efficiency). We need period/dt steps.
          // Use larger dt for the orbit trace (30s steps) to keep point count reasonable.
          const coastDt = 30.0;
          const coastSteps = Math.ceil(period / coastDt);
          // Cap at ~3000 steps to prevent runaway for very long-period orbits
          finalCoastTarget = Math.min(coastSteps, 3000);
          finalCoastDt = coastDt;
        } else {
          // Escape trajectory: just coast for 500 steps
          finalCoastTarget = 500;
          finalCoastDt = 10.0;
        }
      }

      if (finalCoastSteps > finalCoastTarget) {
        phase = Phase.DONE;
      }
    }

    // Integrate (symplectic Euler)
    // Use custom dt for final coast phase
    const integrateDt = phase === Phase.FINAL_COAST ? finalCoastDt : dt;
    vel.add(grav.clone().multiplyScalar(integrateDt));
    vel.add(thrust.clone().multiplyScalar(integrateDt));

    // Apply mutator forces (atmospheric drag, lunar gravity, solar wind, etc.)
    const activeMutators = mutators ?? [];
    if (activeMutators.length > 0) {
      const mutatorAccel = computeMutatorForces(activeMutators, pos, vel, alt, time);
      vel.add(mutatorAccel.multiplyScalar(integrateDt));
    }

    pos.add(vel.clone().multiplyScalar(integrateDt));

    time += integrateDt;

    // Crash check
    if (alt < -10) break;
    if (phase === Phase.DONE) break;
  }

  // Final state
  const fuel = Math.max(0, dvRemaining / TOTAL_DV);

  const state: SimState = {
    position: pos.clone(),
    velocity: vel.clone(),
    time,
    fuel,
    altitude: pos.length() - EARTH_RADIUS,
  };

  const orbitalElements = computeOrbitalElements(pos, vel);

  return { trajectory, finalState: state, orbitalElements, coastStartIndex };
}

/**
 * Quick simulation for ghost trajectory preview.
 * Same physics model but larger time steps and fewer points.
 */
export function simulateGhost(params: LaunchParams, mutators?: DifficultyMutator[]): THREE.Vector3[] {
  const maxSteps = 6000;
  const trajectory: THREE.Vector3[] = [];

  const pos = new THREE.Vector3(EARTH_RADIUS, 0, 0);
  const vel = new THREE.Vector3(0, 0, 0.465);

  const azRad = (params.azimuth * Math.PI) / 180;
  const elRad = (params.elevation * Math.PI) / 180;
  const thrustDir = new THREE.Vector3(
    Math.sin(elRad),
    Math.cos(elRad) * Math.cos(azRad),
    Math.cos(elRad) * Math.sin(azRad)
  ).normalize();

  const ascentBudget = TOTAL_DV * params.thrustPercent;
  const CIRC_FULL_BELOW = 0.50;
  const CIRC_ZERO_ABOVE = 0.62;
  const circFraction = Math.max(0, Math.min(1,
    (CIRC_ZERO_ABOVE - params.thrustPercent) / (CIRC_ZERO_ABOVE - CIRC_FULL_BELOW)
  ));
  const ascentAccel = ascentBudget / ASCENT_DURATION;

  let dvRemaining = TOTAL_DV;
  let time = 0;
  let ascentTime = 0;
  let phase: Phase = Phase.ASCENT;
  let prevRadialVel = 1.0;

  for (let step = 0; step < maxSteps; step++) {
    const r = pos.length();
    const alt = r - EARTH_RADIUS;

    const dt = phase === Phase.ASCENT ? 3.0 : phase === Phase.COAST_TO_APOGEE ? 15.0 : 8.0;

    if (step % 2 === 0) {
      trajectory.push(pos.clone());
    }

    const gravMag = -MU / (r * r);
    const grav = pos.clone().normalize().multiplyScalar(gravMag);
    const thrust = new THREE.Vector3();

    // Ascent
    if (phase === Phase.ASCENT) {
      if (ascentTime < ASCENT_DURATION && dvRemaining > 0.01) {
        const pitchFactor = Math.max(0, 1 - ascentTime / ASCENT_DURATION);
        const velNorm = vel.length() > 0.001 ? vel.clone().normalize() : thrustDir.clone();
        const dir = new THREE.Vector3()
          .copy(thrustDir)
          .multiplyScalar(pitchFactor)
          .add(velNorm.multiplyScalar(1 - pitchFactor))
          .normalize();

        const accel = Math.min(ascentAccel, dvRemaining / dt);
        thrust.copy(dir.multiplyScalar(accel));
        dvRemaining -= accel * dt;
        ascentTime += dt;
      } else {
        phase = Phase.COAST_TO_BURN;
      }
    }

    // Coast to burn
    if (phase === Phase.COAST_TO_BURN) {
      if (alt >= params.burnAltitude) {
        const neededDV = computeInjectionDV(pos, vel, params.targetApogee);
        const actualDV = Math.min(neededDV, Math.max(0, dvRemaining));
        if (actualDV > 0.01) {
          vel.add(vel.clone().normalize().multiplyScalar(actualDV));
          dvRemaining -= actualDV;
        }
        phase = Phase.COAST_TO_APOGEE;
      }
      if (phase === Phase.COAST_TO_BURN && time > ASCENT_DURATION + 30000) {
        phase = Phase.COAST_TO_APOGEE;
      }
    }

    // Apogee detection and circularization
    const radialVel = pos.clone().normalize().dot(vel);

    if (phase === Phase.COAST_TO_APOGEE) {
      if (prevRadialVel > 0 && radialVel <= 0 && time > ASCENT_DURATION + 5) {
        const vCirc = Math.sqrt(MU / r);
        const vCurr = vel.length();
        const deficit = vCirc - vCurr;
        if (deficit > 0.01 && dvRemaining > 0.01) {
          const targetCircDV = deficit * circFraction;
          const actualDV = Math.min(targetCircDV, dvRemaining);
          if (actualDV > 0.01) {
            vel.add(vel.clone().normalize().multiplyScalar(actualDV));
            dvRemaining -= actualDV;
          }
        }
        phase = Phase.FINAL_COAST;
      }

      const energy = vel.lengthSq() / 2 - MU / r;
      if (energy > 0) phase = Phase.FINAL_COAST;
      if (time > ASCENT_DURATION + 50000) phase = Phase.FINAL_COAST;
    }

    prevRadialVel = radialVel;

    if (phase === Phase.FINAL_COAST) break;

    // Integrate
    vel.add(grav.clone().multiplyScalar(dt));
    vel.add(thrust.clone().multiplyScalar(dt));

    // Apply mutator forces
    const activeMutators = mutators ?? [];
    if (activeMutators.length > 0) {
      const mutatorAccel = computeMutatorForces(activeMutators, pos, vel, alt, time);
      vel.add(mutatorAccel.multiplyScalar(dt));
    }

    pos.add(vel.clone().multiplyScalar(dt));

    time += dt;

    if (alt < -10) break;
  }

  // Trace one full orbit from the post-burn state so the ghost shows
  // the resulting orbit ring (comparable to the yellow target).
  const energy = vel.lengthSq() / 2 - MU / pos.length();
  if (energy < 0) {
    const a = -MU / (2 * energy);
    const period = 2 * Math.PI * Math.sqrt(a * a * a / MU);
    const coastDt = 30.0;
    const coastSteps = Math.min(Math.ceil(period / coastDt), 2000);

    for (let i = 0; i < coastSteps; i++) {
      const r = pos.length();
      const alt = r - EARTH_RADIUS;
      const gravMag = -MU / (r * r);
      const grav = pos.clone().normalize().multiplyScalar(gravMag);
      vel.add(grav.clone().multiplyScalar(coastDt));

      // Apply mutator forces during coast too
      const coastMutators = mutators ?? [];
      if (coastMutators.length > 0) {
        const mutatorAccel = computeMutatorForces(coastMutators, pos, vel, alt, time);
        vel.add(mutatorAccel.multiplyScalar(coastDt));
      }

      pos.add(vel.clone().multiplyScalar(coastDt));
      time += coastDt;
      trajectory.push(pos.clone());
    }
  }

  return trajectory;
}
