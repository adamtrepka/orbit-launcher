import { getRandomOrbitDefinition } from '../orbits/OrbitDefinitions';
import { PLANET_TYPE_KEYS } from '../scene/planetTypes';
import { selectMutators } from './Mutators';
import type { TargetOrbit } from '../orbits/types';
import type { PlanetType } from '../scene/planetTypes';
import type { SeededRandom } from '../utils/random';

/**
 * Generate a random mission.
 *
 * When called without arguments, uses Math.random() (non-deterministic).
 * When called with a SeededRandom, the mission is fully deterministic —
 * same seed always produces the same orbit type, parameters, and planet.
 */
export function generateMission(rng?: SeededRandom): TargetOrbit {
  const nextFn = rng ? () => rng.next() : undefined;
  const definition = getRandomOrbitDefinition(nextFn);
  const params = definition.generateParams(nextFn);

  // Pick a random planet type for the visual central body
  const roll = nextFn ? nextFn() : Math.random();
  const planetType: PlanetType = PLANET_TYPE_KEYS[Math.floor(roll * PLANET_TYPE_KEYS.length)];

  // Select difficulty mutators based on orbit difficulty
  const mutators = selectMutators(definition.difficulty, nextFn);

  return { definition, params, planetType, mutators };
}
