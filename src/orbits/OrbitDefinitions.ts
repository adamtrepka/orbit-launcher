import type { OrbitDefinition } from './types';
import { OrbitType } from './types';

function randRange(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(randRange(min, max + 1, rng));
}

/** Fallback to Math.random when no seeded RNG is provided. */
function rngOrDefault(rng?: () => number): () => number {
  return rng ?? Math.random;
}

export const ORBIT_DEFINITIONS: OrbitDefinition[] = [
  // === EASY ===
  {
    type: OrbitType.LEO,
    name: 'Low Earth Orbit',
    description:
      'A circular orbit close to Earth, used by the ISS, Earth observation satellites, and constellations like Starlink.',
    difficulty: 'EASY',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const alt = randInt(300, 1200, r);
      const inc = randRange(0, 51.6, r);
      return { altitude: alt, inclination: inc, eccentricity: 0 };
    },
    tolerances: { altitude: 200, inclination: 15, eccentricity: 0.05 },
  },
  {
    type: OrbitType.POLAR,
    name: 'Polar Orbit',
    description:
      'Passes over both poles with ~90 deg inclination. Used for full-Earth coverage in weather and reconnaissance.',
    difficulty: 'EASY',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const alt = randInt(500, 900, r);
      const inc = randRange(85, 95, r);
      return { altitude: alt, inclination: inc, eccentricity: 0 };
    },
    tolerances: { altitude: 150, inclination: 8, eccentricity: 0.04 },
  },

  // === MEDIUM ===
  {
    type: OrbitType.SSO,
    name: 'Sun-Synchronous Orbit',
    description:
      'A near-polar orbit where the satellite crosses any latitude at the same local solar time. Essential for consistent imaging.',
    difficulty: 'MEDIUM',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const alt = randInt(500, 800, r);
      // SSO inclination depends on altitude; roughly 96-98 degrees for typical altitudes
      const inc = randRange(96, 99, r);
      return { altitude: alt, inclination: inc, eccentricity: 0 };
    },
    tolerances: { altitude: 100, inclination: 4, eccentricity: 0.03 },
  },
  {
    type: OrbitType.MEO,
    name: 'Medium Earth Orbit',
    description:
      'Home of GPS, Galileo, and GLONASS navigation constellations. A sweet spot between coverage area and signal latency.',
    difficulty: 'MEDIUM',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const alt = randInt(10000, 25000, r);
      const inc = randRange(50, 65, r);
      return { altitude: alt, inclination: inc, eccentricity: 0 };
    },
    tolerances: { altitude: 2000, inclination: 10, eccentricity: 0.04 },
  },
  {
    type: OrbitType.GEO,
    name: 'Geostationary Orbit',
    description:
      'Circular equatorial orbit at 35,786 km. The satellite appears fixed in the sky -- used for TV, weather, and comms.',
    difficulty: 'MEDIUM',
    generateParams: () => {
      return { altitude: 35786, inclination: 0, eccentricity: 0 };
    },
    tolerances: { altitude: 1500, inclination: 3, eccentricity: 0.02 },
  },
  {
    type: OrbitType.GSO,
    name: 'Geosynchronous Orbit',
    description:
      'Same period as Earth\'s rotation but with a non-zero inclination. The satellite traces a figure-8 pattern from the ground.',
    difficulty: 'MEDIUM',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const inc = randRange(5, 25, r);
      return { altitude: 35786, inclination: inc, eccentricity: 0 };
    },
    tolerances: { altitude: 1500, inclination: 5, eccentricity: 0.03 },
  },

  // === HARD ===
  {
    type: OrbitType.GTO,
    name: 'Geostationary Transfer Orbit',
    description:
      'An elliptical orbit used to transfer satellites from LEO to GEO. Perigee near LEO, apogee at GEO altitude.',
    difficulty: 'HARD',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const perigee = randInt(200, 400, r);
      const apogee = randInt(34000, 37000, r);
      const alt = (perigee + apogee) / 2;
      const inc = randRange(5, 28, r);
      const ecc = (apogee - perigee) / (apogee + perigee + 2 * 6371);
      return { altitude: alt, perigee, apogee, inclination: inc, eccentricity: ecc };
    },
    tolerances: { altitude: 2000, inclination: 8, eccentricity: 0.08 },
  },
  {
    type: OrbitType.HEO,
    name: 'Highly Elliptical Orbit',
    description:
      'A general high-eccentricity orbit spending most time near apogee. Useful for communications at high latitudes.',
    difficulty: 'HARD',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const perigee = randInt(500, 2000, r);
      const apogee = randInt(30000, 45000, r);
      const alt = (perigee + apogee) / 2;
      const inc = randRange(30, 70, r);
      const ecc = (apogee - perigee) / (apogee + perigee + 2 * 6371);
      return { altitude: alt, perigee, apogee, inclination: inc, eccentricity: ecc };
    },
    tolerances: { altitude: 3000, inclination: 10, eccentricity: 0.1 },
  },
  {
    type: OrbitType.MOLNIYA,
    name: 'Molniya Orbit',
    description:
      'A 12-hour highly elliptical orbit at 63.4 deg inclination. Developed by Russia for high-latitude communications.',
    difficulty: 'HARD',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const perigee = randInt(400, 600, r);
      const apogee = randInt(38000, 42000, r);
      const alt = (perigee + apogee) / 2;
      const ecc = (apogee - perigee) / (apogee + perigee + 2 * 6371);
      return { altitude: alt, perigee, apogee, inclination: 63.4, eccentricity: ecc };
    },
    tolerances: { altitude: 2500, inclination: 5, eccentricity: 0.08 },
  },
  {
    type: OrbitType.TUNDRA,
    name: 'Tundra Orbit',
    description:
      'A 24-hour elliptical orbit at 63.4 deg inclination. Similar to Molniya but geosynchronous -- only 2 satellites needed for coverage.',
    difficulty: 'HARD',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const perigee = randInt(800, 1200, r);
      const apogee = randInt(44000, 48000, r);
      const alt = (perigee + apogee) / 2;
      const ecc = (apogee - perigee) / (apogee + perigee + 2 * 6371);
      return { altitude: alt, perigee, apogee, inclination: 63.4, eccentricity: ecc };
    },
    tolerances: { altitude: 3000, inclination: 5, eccentricity: 0.08 },
  },

  // === EXPERT ===
  {
    type: OrbitType.GRAVEYARD,
    name: 'Graveyard Orbit',
    description:
      'A disposal orbit ~300 km above GEO. End-of-life satellites are boosted here to free up valuable geostationary slots.',
    difficulty: 'EXPERT',
    generateParams: (rng?) => {
      const r = rngOrDefault(rng);
      const alt = randInt(36050, 36250, r);
      return { altitude: alt, inclination: 0, eccentricity: 0 };
    },
    tolerances: { altitude: 500, inclination: 2, eccentricity: 0.01 },
  },
];

export function getOrbitDefinition(type: OrbitType): OrbitDefinition {
  const def = ORBIT_DEFINITIONS.find((d) => d.type === type);
  if (!def) throw new Error(`Unknown orbit type: ${type}`);
  return def;
}

/** Pick a random orbit definition. Accepts an optional RNG for deterministic selection. */
export function getRandomOrbitDefinition(rng?: () => number): OrbitDefinition {
  const r = rng ?? Math.random;
  return ORBIT_DEFINITIONS[Math.floor(r() * ORBIT_DEFINITIONS.length)];
}
