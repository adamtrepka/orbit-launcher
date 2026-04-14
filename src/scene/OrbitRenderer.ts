import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import type { OrbitParameters } from '../orbits/types';
import { EARTH_RADIUS, kmToScene } from '../utils/constants';

/**
 * Renders an orbit as a 3D ellipse around Earth using fat lines (Line2)
 * for high visibility on all displays.
 */
export class OrbitRenderer {
  private group: THREE.Group;
  private targetLine: Line2 | null = null;
  private achievedLine: Line2 | null = null;
  private opponentLine: Line2 | null = null;
  private parentScene: THREE.Scene;

  /** All active LineMaterials — updated on resize via setResolution(). */
  private materials: Set<LineMaterial> = new Set();

  constructor(scene: THREE.Scene) {
    this.parentScene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  /** Update the resolution uniform on all active LineMaterials. */
  public setResolution(width: number, height: number): void {
    for (const mat of this.materials) {
      mat.resolution.set(width, height);
    }
  }

  /**
   * Generate points for an orbital ellipse in 3D
   */
  private generateOrbitPoints(
    params: OrbitParameters,
    segments: number = 128
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];

    let semiMajorKm: number;
    let ecc: number;

    if (params.perigee !== undefined && params.apogee !== undefined) {
      const rp = EARTH_RADIUS + params.perigee;
      const ra = EARTH_RADIUS + params.apogee;
      semiMajorKm = (rp + ra) / 2;
      ecc = (ra - rp) / (ra + rp);
    } else {
      semiMajorKm = EARTH_RADIUS + params.altitude;
      ecc = params.eccentricity;
    }

    const a = kmToScene(semiMajorKm);
    const b = a * Math.sqrt(1 - ecc * ecc); // semi-minor axis

    // Generate ellipse in XZ plane, then rotate for inclination
    const incRad = (params.inclination * Math.PI) / 180;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      // Ellipse in XZ plane (centered, with focus offset for eccentric orbits)
      const x = a * Math.cos(angle) - a * ecc; // offset so Earth is at focus
      const z = b * Math.sin(angle);
      const y = 0;

      // Rotate around X-axis by inclination
      const ry = y * Math.cos(incRad) - z * Math.sin(incRad);
      const rz = y * Math.sin(incRad) + z * Math.cos(incRad);

      points.push(new THREE.Vector3(x, ry, rz));
    }

    return points;
  }

  /** Convert Vector3[] to a flat number[] for LineGeometry. */
  private flattenPoints(points: THREE.Vector3[]): number[] {
    const flat: number[] = [];
    for (const p of points) {
      flat.push(p.x, p.y, p.z);
    }
    return flat;
  }

  /** Create a Line2 with LineMaterial for thick, visible orbit lines. */
  private createFatLine(
    points: THREE.Vector3[],
    color: number,
    lineWidth: number,
    opacity: number,
  ): Line2 {
    const geometry = new LineGeometry();
    geometry.setPositions(this.flattenPoints(points));

    const material = new LineMaterial({
      color,
      linewidth: lineWidth,
      transparent: true,
      opacity,
      worldUnits: false, // linewidth is in pixels
    });
    material.resolution.set(window.innerWidth, window.innerHeight);
    this.materials.add(material);

    return new Line2(geometry, material);
  }

  /** Remove a LineMaterial from the tracked set. */
  private disposeLine(line: Line2): void {
    const mat = line.material as LineMaterial;
    this.materials.delete(mat);
    line.geometry.dispose();
    mat.dispose();
  }

  /**
   * Show the target orbit as a highlighted ring.
   */
  showTarget(params: OrbitParameters): void {
    this.clearTarget();

    const points = this.generateOrbitPoints(params);
    this.targetLine = this.createFatLine(points, 0xffd54f, 2.5, 0.9);
    this.group.add(this.targetLine);
  }

  /**
   * Show the achieved orbit (post-launch result).
   */
  showAchieved(params: OrbitParameters): void {
    this.clearAchieved();

    const points = this.generateOrbitPoints(params);
    this.achievedLine = this.createFatLine(points, 0x66bb6a, 2, 0.85);
    this.group.add(this.achievedLine);
  }

  /**
   * Show the opponent's achieved orbit (multiplayer — red color).
   */
  showOpponent(params: OrbitParameters): void {
    this.clearOpponent();

    const points = this.generateOrbitPoints(params);
    this.opponentLine = this.createFatLine(points, 0xef5350, 2, 0.75);
    this.group.add(this.opponentLine);
  }

  clearTarget(): void {
    if (this.targetLine) {
      this.group.remove(this.targetLine);
      this.disposeLine(this.targetLine);
      this.targetLine = null;
    }
  }

  clearAchieved(): void {
    if (this.achievedLine) {
      this.group.remove(this.achievedLine);
      this.disposeLine(this.achievedLine);
      this.achievedLine = null;
    }
  }

  clearOpponent(): void {
    if (this.opponentLine) {
      this.group.remove(this.opponentLine);
      this.disposeLine(this.opponentLine);
      this.opponentLine = null;
    }
  }

  clearAll(): void {
    this.clearTarget();
    this.clearAchieved();
    this.clearOpponent();
  }

  dispose(): void {
    this.clearAll();
    this.parentScene.remove(this.group);
  }
}
