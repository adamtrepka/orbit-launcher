import type { TargetOrbit } from '../orbits/types';
import type { LaunchParams } from '../physics/LaunchSimulator';

/**
 * Compute optimal hidden launch parameters for Arcade mode.
 *
 * Given just the player's azimuth and target altitude choices (the two Arcade
 * sliders), derive sensible elevation, thrust%, and injection-burn altitude so
 * the physics simulation produces a reasonable orbit.  The auto-computed values
 * aim for roughly 70-80% accuracy — good enough that player choices matter but
 * not so perfect that the game becomes trivial.
 */
export function computeArcadeParams(
  azimuth: number,
  targetAltitude: number,
  mission: TargetOrbit,
): LaunchParams {
  const isElliptical = mission.params.eccentricity > 0.05;

  return {
    azimuth,
    elevation: computeElevation(targetAltitude, isElliptical),
    thrustPercent: computeThrust(mission),
    burnAltitude: computeBurnAltitude(targetAltitude, isElliptical),
    targetApogee: targetAltitude,
  };
}

/**
 * Estimate the resulting inclination for a given launch azimuth.
 *
 * From an equatorial launch site the relationship is:
 *   cos(inclination) = sin(azimuth) * cos(latitude)
 * With latitude = 0 this simplifies to:
 *   inclination ≈ 90 - azimuth   (for az 0-180, mirrored for 180-360)
 * We add a small correction because the Earth's rotation shifts the
 * effective azimuth slightly eastward.
 */
export function estimateInclination(azimuthDeg: number): number {
  // Normalize to 0-360
  const az = ((azimuthDeg % 360) + 360) % 360;

  // sin(azimuth) gives the eastward component; cos(inc) = sin(az) for lat=0
  const azRad = (az * Math.PI) / 180;
  const cosInc = Math.sin(azRad);
  const incRad = Math.acos(Math.max(-1, Math.min(1, cosInc)));
  const incDeg = (incRad * 180) / Math.PI;

  return Math.round(incDeg * 10) / 10;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derive a good launch elevation angle from the target altitude.
 *
 * Heuristic calibrated against OrbitHints data:
 * - Low orbits (< 2,000 km): steeper ~38-45 deg helps reach altitude quickly
 * - Medium orbits (2,000-20,000 km): moderate ~32-38 deg
 * - High orbits (> 20,000 km): shallower ~28-33 deg for efficient gravity turn
 * - Elliptical orbits get a slight bump — steeper ascent gives cleaner perigee
 */
function computeElevation(targetAlt: number, isElliptical: boolean): number {
  // Logarithmic interpolation: high altitudes get shallower angles
  // log10(300) ≈ 2.48, log10(50000) ≈ 4.70
  const logAlt = Math.log10(Math.max(300, Math.min(targetAlt, 50000)));
  const t = (logAlt - 2.48) / (4.70 - 2.48); // 0..1 from low to high

  // Interpolate from 43 deg (low orbit) to 30 deg (very high orbit)
  let elevation = 43 - t * 13;

  // Elliptical orbits: slightly steeper for cleaner perigee injection
  if (isElliptical) {
    elevation += 3;
  }

  return Math.round(Math.max(25, Math.min(50, elevation)));
}

/**
 * Derive the thrust percentage (controls circularization behavior).
 *
 * Physics model:
 *   thrustPercent ≤ 0.50 → full circularization (circular orbit)
 *   thrustPercent 0.50-0.62 → partial circ (moderate eccentricity)
 *   thrustPercent ≥ 0.62 → no circularization (fully elliptical)
 *
 * For arcade mode we map directly from target eccentricity:
 * - Circular targets (ecc ≈ 0): thrust ~46% — safely in the full-circ zone
 * - Low eccentricity (0.05-0.3): thrust ~54-58% — partial circ zone
 * - High eccentricity (0.3-0.8): thrust ~58-62% — mostly no circ
 *
 * The value returned is already in 0-1 range (matching LaunchParams convention).
 */
function computeThrust(mission: TargetOrbit): number {
  const ecc = mission.params.eccentricity;

  if (ecc < 0.05) {
    // Circular orbit — full circularization zone
    // Slightly vary with altitude: higher orbits need a touch more fuel for ascent
    const alt = mission.params.altitude;
    if (alt < 2000) return 0.46;
    if (alt < 20000) return 0.48;
    return 0.50;
  }

  // Elliptical orbit — interpolate through partial-to-no-circ zone
  // ecc 0.05 → thrust 0.54, ecc 0.8 → thrust 0.62
  const t = Math.min(1, (ecc - 0.05) / 0.75);
  return 0.54 + t * 0.08;
}

/**
 * Derive the injection burn altitude.
 *
 * Heuristic:
 * - For circular orbits, inject at a low altitude (~200-350 km).
 *   We don't want it too low (rocket might not reach it in time) or too high
 *   (wastes fuel on coast phase).
 * - For elliptical orbits, inject low (~200-300 km) since the injection burn
 *   raises the apogee from perigee height.
 * - For very high circular orbits (GEO+), slightly higher injection (~300 km)
 *   to ensure the gravity turn has enough room.
 */
function computeBurnAltitude(targetAlt: number, isElliptical: boolean): number {
  if (isElliptical) {
    return 250;
  }

  // Circular: scale gently with target altitude
  if (targetAlt < 2000) return 200;
  if (targetAlt < 20000) return 250;
  return 300;
}
