import type { PlanetType } from '../scene/planetTypes';

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
  /** Generate random target parameters within this orbit type's valid range.
   *  Accepts an optional RNG function (returns [0,1)) for deterministic generation. */
  generateParams: (rng?: () => number) => OrbitParameters;
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
  /** Visual planet type for the central body this round. */
  planetType: PlanetType;
}

export const ControlMode = {
  ARCADE: 'ARCADE',
  PRO: 'PRO',
} as const;

export type ControlMode = (typeof ControlMode)[keyof typeof ControlMode];
