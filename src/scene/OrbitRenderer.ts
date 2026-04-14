import * as THREE from 'three';
import type { OrbitParameters } from '../orbits/types';
import { EARTH_RADIUS, kmToScene } from '../utils/constants';

/**
 * Renders an orbit as a 3D ellipse around Earth.
 * Supports both circular and elliptical orbits with any inclination.
 */
export class OrbitRenderer {
  private group: THREE.Group;
  private targetLine: THREE.Line | null = null;
  private achievedLine: THREE.Line | null = null;
  private opponentLine: THREE.Line | null = null;
  private parentScene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.parentScene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
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

  /**
   * Show the target orbit as a highlighted ring
   */
  showTarget(params: OrbitParameters): void {
    this.clearTarget();

    const points = this.generateOrbitPoints(params);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.6,
      linewidth: 1,
    });

    this.targetLine = new THREE.Line(geometry, material);
    this.group.add(this.targetLine);

    // Add dashed version on top for emphasis
    const dashMat = new THREE.LineDashedMaterial({
      color: 0xffd54f,
      dashSize: 0.05,
      gapSize: 0.05,
      transparent: true,
      opacity: 0.3,
    });
    const dashLine = new THREE.Line(geometry.clone(), dashMat);
    dashLine.computeLineDistances();
    this.targetLine.add(dashLine);
  }

  /**
   * Show the achieved orbit (post-launch result)
   */
  showAchieved(params: OrbitParameters): void {
    this.clearAchieved();

    const points = this.generateOrbitPoints(params);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: 0x66bb6a,
      transparent: true,
      opacity: 0.8,
      linewidth: 1,
    });

    this.achievedLine = new THREE.Line(geometry, material);
    this.group.add(this.achievedLine);
  }

  /**
   * Show the opponent's achieved orbit (multiplayer — orange/red color).
   */
  showOpponent(params: OrbitParameters): void {
    this.clearOpponent();

    const points = this.generateOrbitPoints(params);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: 0xef5350,
      transparent: true,
      opacity: 0.7,
      linewidth: 1,
    });

    this.opponentLine = new THREE.Line(geometry, material);
    this.group.add(this.opponentLine);
  }

  clearTarget(): void {
    if (this.targetLine) {
      this.group.remove(this.targetLine);
      this.targetLine.geometry.dispose();
      this.targetLine = null;
    }
  }

  clearAchieved(): void {
    if (this.achievedLine) {
      this.group.remove(this.achievedLine);
      this.achievedLine.geometry.dispose();
      this.achievedLine = null;
    }
  }

  clearOpponent(): void {
    if (this.opponentLine) {
      this.group.remove(this.opponentLine);
      this.opponentLine.geometry.dispose();
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
