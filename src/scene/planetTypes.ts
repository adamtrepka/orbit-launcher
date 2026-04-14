/**
 * Planet type configurations for procedural generation.
 * Each config defines surface colors, noise parameters, atmosphere, and optional rings.
 */

/** A single color band in the surface palette. */
export interface SurfaceLayer {
  /** Noise threshold [-1, 1] — below this value, this color applies. */
  threshold: number;
  /** RGB color [0-255, 0-255, 0-255]. */
  color: [number, number, number];
}

/** Atmosphere visual settings (null = no atmosphere). */
export interface AtmosphereConfig {
  /** RGB color [0-1, 0-1, 0-1] for the glow shader. */
  color: [number, number, number];
  /** Glow strength multiplier (0 = invisible, 1 = strong). */
  intensity: number;
}

/** Ring system settings (null = no rings). */
export interface RingConfig {
  /** Inner radius in scene units (Earth sphere = 1.0). */
  innerRadius: number;
  /** Outer radius in scene units. */
  outerRadius: number;
  /** Base RGB color [0-255, 0-255, 0-255]. */
  color: [number, number, number];
  /** Tilt angle in radians around X axis. */
  tilt: number;
}

/** Complete planet generation configuration. */
export interface PlanetConfig {
  /** Display name shown in briefings. */
  name: string;
  /** Color palette ordered by ascending noise threshold. */
  surfaceLayers: SurfaceLayer[];
  /** Base frequency for noise sampling on the unit sphere. */
  noiseFrequency: number;
  /** Number of noise octaves (more = finer detail). */
  noiseOctaves: number;
  /** Frequency multiplier per octave. */
  noiseLacunarity: number;
  /** Bump map strength for MeshStandardMaterial (0 = flat). */
  bumpStrength: number;
  /** If true, surface color is driven by latitude bands instead of noise height. */
  bandedSurface: boolean;
  /** Whether to blend polar ice caps by latitude. */
  iceCaps: boolean;
  /** Atmosphere glow settings, or null for no atmosphere. */
  atmosphere: AtmosphereConfig | null;
  /** Ring system settings, or null for no rings. */
  rings: RingConfig | null;
}

/** Planet type identifier. */
export const PlanetType = {
  TERRESTRIAL: 'TERRESTRIAL',
  LUNAR: 'LUNAR',
  ICE_DWARF: 'ICE_DWARF',
  GAS_GIANT: 'GAS_GIANT',
} as const;
export type PlanetType = (typeof PlanetType)[keyof typeof PlanetType];

/** All available planet type keys. */
export const PLANET_TYPE_KEYS: PlanetType[] = [
  PlanetType.TERRESTRIAL,
  PlanetType.LUNAR,
  PlanetType.ICE_DWARF,
  PlanetType.GAS_GIANT,
];

/** Planet configurations keyed by PlanetType. */
export const PLANET_CONFIGS: Record<PlanetType, PlanetConfig> = {

  // --- Earth-like: oceans, continents, mountains, ice caps ---
  [PlanetType.TERRESTRIAL]: {
    name: 'Terra',
    surfaceLayers: [
      { threshold: -0.05, color: [15, 40, 80] },    // deep ocean
      { threshold: 0.05, color: [20, 60, 120] },     // shallow ocean
      { threshold: 0.10, color: [160, 150, 100] },   // beach/sand
      { threshold: 0.30, color: [40, 100, 35] },     // lowland green
      { threshold: 0.50, color: [60, 80, 30] },      // forest
      { threshold: 0.70, color: [100, 85, 60] },     // highlands
      { threshold: 0.85, color: [140, 130, 120] },   // rocky mountains
      { threshold: 1.00, color: [220, 220, 230] },   // snow peaks
    ],
    noiseFrequency: 2.0,
    noiseOctaves: 6,
    noiseLacunarity: 2.2,
    bumpStrength: 1.5,
    bandedSurface: false,
    iceCaps: true,
    atmosphere: { color: [0.3, 0.6, 1.0], intensity: 0.6 },
    rings: null,
  },

  // --- Moon-like: grey, cratered, barren ---
  [PlanetType.LUNAR]: {
    name: 'Selene',
    surfaceLayers: [
      { threshold: -0.20, color: [60, 55, 50] },     // dark maria
      { threshold: 0.00, color: [85, 80, 75] },      // lowlands
      { threshold: 0.25, color: [120, 115, 110] },   // mid terrain
      { threshold: 0.50, color: [150, 145, 140] },   // highlands
      { threshold: 0.75, color: [170, 165, 158] },   // bright highlands
      { threshold: 1.00, color: [195, 190, 185] },   // bright crater rims
    ],
    noiseFrequency: 3.0,
    noiseOctaves: 5,
    noiseLacunarity: 2.5,
    bumpStrength: 2.0,
    bandedSurface: false,
    iceCaps: false,
    atmosphere: null,
    rings: null,
  },

  // --- Pluto-like: icy reddish with pale patches ---
  [PlanetType.ICE_DWARF]: {
    name: 'Kryos',
    surfaceLayers: [
      { threshold: -0.15, color: [140, 100, 80] },   // reddish-brown lowlands
      { threshold: 0.10, color: [170, 130, 100] },   // tan plains
      { threshold: 0.30, color: [190, 160, 130] },   // lighter tan
      { threshold: 0.50, color: [200, 190, 180] },   // pale transition
      { threshold: 0.70, color: [220, 215, 210] },   // ice patches
      { threshold: 1.00, color: [240, 235, 230] },   // bright ice
    ],
    noiseFrequency: 1.8,
    noiseOctaves: 5,
    noiseLacunarity: 2.0,
    bumpStrength: 1.0,
    bandedSurface: false,
    iceCaps: false,
    atmosphere: { color: [0.4, 0.5, 0.7], intensity: 0.2 },
    rings: null,
  },

  // --- Saturn/Jupiter-like: banded gas giant with rings ---
  [PlanetType.GAS_GIANT]: {
    name: 'Aurion',
    surfaceLayers: [
      { threshold: 0.15, color: [200, 170, 100] },   // pale gold band
      { threshold: 0.30, color: [180, 120, 60] },    // amber band
      { threshold: 0.45, color: [210, 185, 130] },   // light cream band
      { threshold: 0.60, color: [160, 100, 50] },    // dark brown band
      { threshold: 0.75, color: [220, 195, 140] },   // cream band
      { threshold: 1.00, color: [190, 140, 80] },    // mid-tone band
    ],
    noiseFrequency: 1.5,
    noiseOctaves: 3,
    noiseLacunarity: 2.0,
    bumpStrength: 0,
    bandedSurface: true,
    iceCaps: false,
    atmosphere: { color: [1.0, 0.85, 0.5], intensity: 0.5 },
    rings: {
      innerRadius: 1.4,
      outerRadius: 2.4,
      color: [200, 180, 140],
      tilt: 0.4,
    },
  },
};
