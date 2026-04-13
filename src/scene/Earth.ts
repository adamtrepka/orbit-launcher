import * as THREE from 'three';

/**
 * Procedural Earth: blue sphere with stylized continent-like patches,
 * latitude/longitude grid lines, and an atmospheric glow edge.
 */
export class Earth {
  public group: THREE.Group;
  private earthMesh: THREE.Mesh;

  constructor() {
    this.group = new THREE.Group();

    // Main sphere
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      color: 0x1a4a7a,
      emissive: 0x061428,
      specular: 0x446688,
      shininess: 15,
    });
    this.earthMesh = new THREE.Mesh(geometry, material);
    this.group.add(this.earthMesh);

    // Grid lines (latitude/longitude)
    this.addGridLines();

    // Atmosphere glow (slightly larger transparent sphere)
    this.addAtmosphere();
  }

  private addGridLines(): void {
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x3a7abf,
      transparent: true,
      opacity: 0.15,
    });

    // Latitude lines every 30 degrees
    for (let lat = -60; lat <= 60; lat += 30) {
      const phi = ((90 - lat) * Math.PI) / 180;
      const r = Math.sin(phi) * 1.002;
      const y = Math.cos(phi) * 1.002;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const theta = (i / 64) * Math.PI * 2;
        points.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      this.group.add(new THREE.Line(geo, gridMaterial));
    }

    // Equator (brighter)
    const equatorMaterial = new THREE.LineBasicMaterial({
      color: 0x5599dd,
      transparent: true,
      opacity: 0.3,
    });
    const eqPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      eqPoints.push(new THREE.Vector3(1.003 * Math.cos(theta), 0, 1.003 * Math.sin(theta)));
    }
    const eqGeo = new THREE.BufferGeometry().setFromPoints(eqPoints);
    this.group.add(new THREE.Line(eqGeo, equatorMaterial));

    // Longitude lines every 30 degrees
    for (let lon = 0; lon < 180; lon += 30) {
      const theta = (lon * Math.PI) / 180;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const phi = (i / 64) * Math.PI;
        points.push(
          new THREE.Vector3(
            1.002 * Math.sin(phi) * Math.cos(theta),
            1.002 * Math.cos(phi),
            1.002 * Math.sin(phi) * Math.sin(theta)
          )
        );
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      this.group.add(new THREE.Line(geo, gridMaterial));
    }
  }

  private addAtmosphere(): void {
    const atmosGeometry = new THREE.SphereGeometry(1.03, 64, 64);
    const atmosMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
          rim = pow(rim, 3.0);
          vec3 atmosColor = vec3(0.3, 0.6, 1.0);
          gl_FragColor = vec4(atmosColor, rim * 0.6);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(atmosGeometry, atmosMaterial);
    this.group.add(atmosMesh);
  }

  update(_dt: number, elapsed: number): void {
    // Slow rotation
    this.earthMesh.rotation.y = elapsed * 0.02;
  }
}
