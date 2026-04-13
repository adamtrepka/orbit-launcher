import * as THREE from 'three';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Map a value from one range to another
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Gaussian function for scoring: returns 0-1 based on error vs tolerance
 */
export function gaussianScore(error: number, tolerance: number): number {
  return Math.exp(-((error * error) / (tolerance * tolerance)));
}

/**
 * Format a number with commas for display
 */
export function formatNumber(n: number, decimals: number = 0): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Create a direction vector from azimuth and elevation angles (in radians).
 * Compass convention: 0=North, 90=East, 180=South, 270=West
 */
export function launchDirection(azimuthRad: number, elevationRad: number): THREE.Vector3 {
  const cosEl = Math.cos(elevationRad);
  const sinEl = Math.sin(elevationRad);
  const cosAz = Math.cos(azimuthRad);
  const sinAz = Math.sin(azimuthRad);

  // Compass convention: 0=N(+Y), 90=E(+Z)
  // Elevation: angle above local horizon (radial = +X)
  return new THREE.Vector3(
    sinEl,           // radial (up)
    cosEl * cosAz,   // north (Y)
    cosEl * sinAz    // east (Z)
  ).normalize();
}
