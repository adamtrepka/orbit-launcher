import * as THREE from 'three';
import { kmToScene } from '../utils/constants';

/**
 * Rocket model built from simple Three.js primitives.
 * Also manages exhaust particle effects and trajectory trail.
 */
export class Rocket {
  public group: THREE.Group;
  public trail: THREE.Line;

  private trailPositions: number[] = [];
  private trailGeometry: THREE.BufferGeometry;
  private exhaustParticles: THREE.Points | null = null;
  private particlePositions: Float32Array;
  private particleVelocities: Float32Array;
  private particleCount = 100;

  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    // Rocket body (cone + cylinder)
    const bodyGeo = new THREE.CylinderGeometry(0.008, 0.01, 0.06, 8);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, emissive: 0x222222 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    this.group.add(body);

    // Nose cone
    const noseGeo = new THREE.ConeGeometry(0.008, 0.025, 8);
    const noseMat = new THREE.MeshPhongMaterial({ color: 0xff4444, emissive: 0x441111 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.y = 0.042;
    this.group.add(nose);

    // Engine glow
    const glowGeo = new THREE.SphereGeometry(0.012, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.7,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = -0.035;
    glow.name = 'engineGlow';
    this.group.add(glow);

    // Trail line
    this.trailGeometry = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.5,
    });
    this.trail = new THREE.Line(this.trailGeometry, trailMat);

    // Exhaust particles
    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleVelocities = new Float32Array(this.particleCount * 3);
    this.initExhaust();
  }

  private initExhaust(): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );

    const material = new THREE.PointsMaterial({
      color: 0xff6622,
      size: 0.006,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });

    this.exhaustParticles = new THREE.Points(geometry, material);
    this.group.add(this.exhaustParticles);
  }

  /**
   * Position the rocket at a given world position, oriented along velocity direction
   */
  setPosition(posKm: THREE.Vector3, velocityDir?: THREE.Vector3): void {
    const scenePos = posKm.clone().multiplyScalar(kmToScene(1));
    this.group.position.copy(scenePos);

    if (velocityDir && velocityDir.length() > 0.001) {
      // Orient rocket along velocity
      const up = velocityDir.clone().normalize();
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      this.group.quaternion.copy(quaternion);
    }
  }

  /**
   * Add current position to the trajectory trail
   */
  addTrailPoint(posKm: THREE.Vector3): void {
    const sp = posKm.clone().multiplyScalar(kmToScene(1));
    this.trailPositions.push(sp.x, sp.y, sp.z);

    const positions = new Float32Array(this.trailPositions);
    this.trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
  }

  /**
   * Update exhaust particles
   */
  updateExhaust(active: boolean): void {
    if (!this.exhaustParticles) return;

    const posAttr = this.exhaustParticles.geometry.getAttribute('position') as THREE.BufferAttribute;

    for (let i = 0; i < this.particleCount; i++) {
      if (active) {
        // Reset particles at engine position
        if (Math.random() < 0.3) {
          this.particlePositions[i * 3] = (Math.random() - 0.5) * 0.01;
          this.particlePositions[i * 3 + 1] = -0.035;
          this.particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
          this.particleVelocities[i * 3] = (Math.random() - 0.5) * 0.002;
          this.particleVelocities[i * 3 + 1] = -0.005 - Math.random() * 0.01;
          this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
        }
      }

      // Move particles
      this.particlePositions[i * 3] += this.particleVelocities[i * 3];
      this.particlePositions[i * 3 + 1] += this.particleVelocities[i * 3 + 1];
      this.particlePositions[i * 3 + 2] += this.particleVelocities[i * 3 + 2];

      // Fade out (move away from center)
      this.particleVelocities[i * 3] *= 0.98;
      this.particleVelocities[i * 3 + 1] *= 0.98;
      this.particleVelocities[i * 3 + 2] *= 0.98;
    }

    posAttr.set(this.particlePositions);
    posAttr.needsUpdate = true;
  }

  show(): void {
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  resetTrail(): void {
    this.trailPositions = [];
    this.trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(0), 3)
    );
  }

  reset(): void {
    this.hide();
    this.resetTrail();
    this.group.position.set(0, 0, 0);
    this.group.quaternion.identity();
  }
}
