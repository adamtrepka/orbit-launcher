import type { TargetOrbit } from '../orbits/types';
import { getRandomOrbitDefinition } from '../orbits/OrbitDefinitions';

export function generateMission(): TargetOrbit {
  const definition = getRandomOrbitDefinition();
  const params = definition.generateParams();
  return { definition, params };
}
