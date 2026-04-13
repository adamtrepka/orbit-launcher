import * as THREE from 'three';

/**
 * Procedural starfield: random points scattered in a large sphere.
 */
export class Starfield {
  public points: THREE.Points;

  constructor(count: number = 5000) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Random position on a large sphere
      const r = 200 + Math.random() * 300;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Slight color variation (white-ish to blue-ish)
      const brightness = 0.5 + Math.random() * 0.5;
      const blueShift = Math.random() * 0.2;
      colors[i * 3] = brightness - blueShift;
      colors[i * 3 + 1] = brightness - blueShift * 0.5;
      colors[i * 3 + 2] = brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.8,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });

    this.points = new THREE.Points(geometry, material);
  }
}
