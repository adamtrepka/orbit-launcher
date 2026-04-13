export const OrbitType = {
  LEO: 'LEO',
  POLAR: 'POLAR',
  SSO: 'SSO',
  MEO: 'MEO',
  GEO: 'GEO',
  GSO: 'GSO',
  GTO: 'GTO',
  HEO: 'HEO',
  MOLNIYA: 'MOLNIYA',
  TUNDRA: 'TUNDRA',
  GRAVEYARD: 'GRAVEYARD',
} as const;

export type OrbitType = (typeof OrbitType)[keyof typeof OrbitType];

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';

export interface OrbitParameters {
  /** Semi-major axis altitude in km (above Earth surface for circular; average for elliptical) */
  altitude: number;
  /** For elliptical orbits: perigee altitude in km */
  perigee?: number;
  /** For elliptical orbits: apogee altitude in km */
  apogee?: number;
  /** Orbital inclination in degrees (0-180) */
  inclination: number;
  /** Eccentricity (0 = circular, <1 = elliptical) */
  eccentricity: number;
}

export interface OrbitDefinition {
  type: OrbitType;
  name: string;
  description: string;
  difficulty: Difficulty;
  /** Generate random target parameters within this orbit type's valid range */
  generateParams: () => OrbitParameters;
  /** Tolerances for scoring - how much error is "close enough" */
  tolerances: {
    altitude: number; // km
    inclination: number; // degrees
    eccentricity: number; // absolute
  };
}

export interface TargetOrbit {
  definition: OrbitDefinition;
  params: OrbitParameters;
}
