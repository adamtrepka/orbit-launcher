import * as THREE from 'three';
import { SUN_DIRECTION } from '../utils/constants';

/**
 * Procedural Sun: bright core sphere with inner corona and outer glow halo.
 * Positioned along the directional light direction so the visual source
 * matches the scene illumination.
 */
export class Sun {
  public group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();

    // Place the Sun at distance 100 along the directional light direction
    const lightDir = new THREE.Vector3(...SUN_DIRECTION).normalize();
    const sunDistance = 100;
    this.group.position.copy(lightDir.multiplyScalar(sunDistance));

    // --- Core sphere: bright self-illuminating solar disk ---
    const coreGeometry = new THREE.SphereGeometry(3, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff4e0,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    this.group.add(coreMesh);

    // --- Inner corona: warm radial glow around the disk ---
    const innerGlowGeometry = new THREE.SphereGeometry(5, 32, 32);
    const innerGlowMaterial = new THREE.ShaderMaterial({
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
          float rim = max(dot(viewDir, vNormal), 0.0);
          // Bright at center, fading toward edges
          float intensity = pow(rim, 1.5);
          vec3 coronaColor = vec3(1.0, 0.8, 0.3);
          gl_FragColor = vec4(coronaColor * intensity, intensity * 0.7);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    const innerGlowMesh = new THREE.Mesh(innerGlowGeometry, innerGlowMaterial);
    this.group.add(innerGlowMesh);

    // --- Outer glow: wide diffuse halo visible from far away ---
    const outerGlowGeometry = new THREE.SphereGeometry(12, 32, 32);
    const outerGlowMaterial = new THREE.ShaderMaterial({
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
          float rim = max(dot(viewDir, vNormal), 0.0);
          // Softer, wider falloff for the outer halo
          float intensity = pow(rim, 2.0);
          vec3 haloColor = vec3(1.0, 0.9, 0.6);
          gl_FragColor = vec4(haloColor * intensity, intensity * 0.3);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const outerGlowMesh = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
    this.group.add(outerGlowMesh);
  }
}
