// Physical constants (real values)
export const G = 6.674e-11; // gravitational constant m^3 kg^-1 s^-2
export const EARTH_MASS = 5.972e24; // kg
export const EARTH_RADIUS = 6371; // km
export const MU = 3.986e5; // standard gravitational parameter km^3/s^2 (G * M_earth)

// Game scale: 1 unit in Three.js = EARTH_RADIUS km
// So Earth sphere radius = 1.0 in scene units
export const SCENE_SCALE = 1 / EARTH_RADIUS; // km -> scene units

// Convert km to scene units
export function kmToScene(km: number): number {
  return km * SCENE_SCALE;
}

// Convert scene units to km
export function sceneToKm(units: number): number {
  return units / SCENE_SCALE;
}

// Sun direction: shared by directional light, sun visual, and atmosphere shader.
// Plain tuple [x, y, z] to avoid importing THREE in this module.
// Represents the direction FROM which sunlight arrives (i.e. the sun's position direction).
export const SUN_DIRECTION: [number, number, number] = [5, 3, 4];

// Game configuration
export const GAME_CONFIG = {
  TOTAL_FUEL: 16000, // m/s total delta-v budget
  SIM_DT: 0.5, // simulation time step in seconds
  SIM_MAX_STEPS: 80000, // max simulation steps
  TRAJECTORY_POINTS: 2000, // max points to store in trajectory
  GHOST_SIM_STEPS: 6000, // steps for ghost trajectory preview
  GHOST_UPDATE_THROTTLE: 100, // ms between ghost trajectory updates
};
