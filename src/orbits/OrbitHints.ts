import type { OrbitParameters } from './types';
import { OrbitType } from './types';

export interface OrbitHint {
  azimuth: string;
  elevation: string;
  thrust: string;
  burnAlt: string;
  targetApogee: string;
  tip: string;
}

/**
 * Generate contextual slider hints for a given orbit type and target parameters.
 *
 * Physics model:
 *   - Ascent gets you off the ground (thrust slider)
 *   - Injection burn at injection altitude boosts orbit to reach target apogee
 *   - Auto-circularization at apogee uses remaining fuel, fraction depends on thrust:
 *     ≤50% thrust → full circularization (circular orbits)
 *     ≥62% thrust → no circularization (elliptical orbits)
 *     50-62% range → partial circularization (intermediate eccentricity)
 */
export function getOrbitHints(type: OrbitType, params: OrbitParameters): OrbitHint {
  const alt = params.altitude;
  const inc = params.inclination;
  const apogee = params.apogee ?? alt;

  switch (type) {
    case OrbitType.LEO:
      return {
        azimuth: inc < 10 ? '~90 (east)' : `~${Math.round(90 - inc * 0.6)}-${Math.round(90 + inc * 0.3)}`,
        elevation: '~35-45',
        thrust: '~44-48%',
        burnAlt: '~200 km',
        targetApogee: `~${Math.round(alt)} km (= target alt)`,
        tip: 'Circular orbit. Low thrust (≤50%) gives full auto-circularization. Lower thrust → lower altitude.',
      };

    case OrbitType.POLAR:
      return {
        azimuth: '~350 (slightly W of N)',
        elevation: '~35-45',
        thrust: '~45-48%',
        burnAlt: '~200 km',
        targetApogee: `~${Math.round(alt)} km`,
        tip: 'Launch north (az ~350) for ~90° inclination. Slightly west compensates for Earth rotation.',
      };

    case OrbitType.SSO:
      return {
        azimuth: '~195-200 (SSW)',
        elevation: '~35-45',
        thrust: '~45-48%',
        burnAlt: '~200 km',
        targetApogee: `~${Math.round(alt)} km`,
        tip: 'Inclination ~97° (slightly retrograde). Azimuth ~198 gets the right inclination.',
      };

    case OrbitType.MEO:
      return {
        azimuth: inc < 55 ? '~75-90' : '~60-75',
        elevation: '~30-40',
        thrust: '~48-52%',
        burnAlt: '~300 km',
        targetApogee: `~${Math.round(alt)} km`,
        tip: 'Circular orbit at medium altitude. Keep thrust ≤50% for full circularization.',
      };

    case OrbitType.GEO:
      return {
        azimuth: '~90 (due east)',
        elevation: '~30-40',
        thrust: '~48-52%',
        burnAlt: '~300 km',
        targetApogee: '~35786 km',
        tip: 'Equatorial (inc ~0°). Thrust ≤50% ensures full circularization at GEO altitude.',
      };

    case OrbitType.GSO:
      return {
        azimuth: `~${Math.round(90 - inc * 0.8)}-${Math.round(90 + inc * 0.3)}`,
        elevation: '~30-40',
        thrust: '~48-52%',
        burnAlt: '~300 km',
        targetApogee: '~35786 km',
        tip: 'Like GEO but inclined. Adjust azimuth for inclination. Keep thrust ≤50% for circular orbit.',
      };

    case OrbitType.GTO:
      return {
        azimuth: inc < 10 ? '~85-95' : `~${Math.round(90 - inc * 0.5)}-90`,
        elevation: '~30-40',
        thrust: '~58-62%',
        burnAlt: '~300 km',
        targetApogee: `~${Math.round(apogee)} km`,
        tip: 'ELLIPTICAL: thrust >50% reduces auto-circ. ~60% gives moderate ecc, ~62% gives high ecc.',
      };

    case OrbitType.HEO:
      return {
        azimuth: inc > 60 ? '~15-25' : '~55-70',
        elevation: '~35-45',
        thrust: '~58-62%',
        burnAlt: '~300 km',
        targetApogee: `~${Math.round(apogee)} km`,
        tip: 'ELLIPTICAL: thrust 58-62% controls eccentricity. Higher thrust → less circ → more elliptical.',
      };

    case OrbitType.MOLNIYA:
      return {
        azimuth: '~15-25 (NNE)',
        elevation: '~35-45',
        thrust: '~59-62%',
        burnAlt: '~300 km',
        targetApogee: `~${Math.round(apogee)} km`,
        tip: 'Inc ~63.4° → azimuth ~20. ELLIPTICAL: thrust ~61% for high ecc with safe perigee.',
      };

    case OrbitType.TUNDRA:
      return {
        azimuth: '~15-25 (NNE)',
        elevation: '~35-45',
        thrust: '~59-62%',
        burnAlt: '~300 km',
        targetApogee: `~${Math.round(apogee)} km`,
        tip: 'Like Molniya but higher apogee. Inc ~63.4° → azimuth ~20. Thrust ~61% for elliptical.',
      };

    case OrbitType.GRAVEYARD:
      return {
        azimuth: '~90 (due east)',
        elevation: '~30-40',
        thrust: '~48-52%',
        burnAlt: '~300 km',
        targetApogee: `~${Math.round(alt)} km`,
        tip: 'Like GEO but ~300 km higher. Tight tolerance! Thrust ≤50% for circular.',
      };

    default:
      return {
        azimuth: '~90',
        elevation: '~35-45',
        thrust: '~50%',
        burnAlt: '~200-300 km',
        targetApogee: `~${Math.round(alt)} km`,
        tip: 'Watch the ghost preview and match it to the gold target ring.',
      };
  }
}
