import type { TargetOrbit } from '../orbits/types';
import { getRandomOrbitDefinition } from '../orbits/OrbitDefinitions';
import type { SeededRandom } from '../utils/random';

/**
 * Generate a random mission.
 *
 * When called without arguments, uses Math.random() (non-deterministic).
 * When called with a SeededRandom, the mission is fully deterministic —
 * same seed always produces the same orbit type and parameters.
 */
export function generateMission(rng?: SeededRandom): TargetOrbit {
  const nextFn = rng ? () => rng.next() : undefined;
  const definition = getRandomOrbitDefinition(nextFn);
  const params = definition.generateParams(nextFn);
  return { definition, params };
}
