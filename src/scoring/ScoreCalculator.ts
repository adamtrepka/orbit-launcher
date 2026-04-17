import type { OrbitParameters } from '../orbits/types';
import { gaussianScore } from '../utils/math';

export interface ScoreBreakdown {
  altitudeScore: number;
  inclinationScore: number;
  eccentricityScore: number;
  accuracyScore: number;
  fuelScore: number;
  totalScore: number;
}

/**
 * Calculate score by comparing achieved orbit to target.
 * Accuracy (60%) + Fuel efficiency (40%) = Total (0-100)
 * Optional scoreMultiplier applies a bonus for active mutators.
 */
export function calculateScore(
  target: OrbitParameters,
  achieved: OrbitParameters,
  fuelRemaining: number,
  tolerances: { altitude: number; inclination: number; eccentricity: number },
  scoreMultiplier?: number,
): ScoreBreakdown {
  // Altitude comparison: use perigee/apogee for elliptical, altitude for circular
  let altError: number;
  if (
    target.perigee !== undefined &&
    target.apogee !== undefined &&
    achieved.perigee !== undefined &&
    achieved.apogee !== undefined
  ) {
    // For elliptical orbits, compare both perigee and apogee
    const perigeeError = Math.abs(achieved.perigee - target.perigee);
    const apogeeError = Math.abs(achieved.apogee - target.apogee);
    altError = (perigeeError + apogeeError) / 2;
  } else {
    altError = Math.abs(achieved.altitude - target.altitude);
  }

  const incError = Math.abs(achieved.inclination - target.inclination);
  const eccError = Math.abs(achieved.eccentricity - target.eccentricity);

  const altitudeScore = gaussianScore(altError, tolerances.altitude);
  const inclinationScore = gaussianScore(incError, tolerances.inclination);
  const eccentricityScore = gaussianScore(eccError, tolerances.eccentricity);

  const accuracyScore = (altitudeScore + inclinationScore + eccentricityScore) / 3;
  const fuelScore = Math.max(0, Math.min(1, fuelRemaining));

  const totalScore = (accuracyScore * 0.6 + fuelScore * 0.4) * 100 * (scoreMultiplier ?? 1.0);

  return {
    altitudeScore,
    inclinationScore,
    eccentricityScore,
    accuracyScore,
    fuelScore,
    totalScore,
  };
}
