import * as THREE from 'three';
import { SUN_DIRECTION } from '../utils/constants';
import { fbm3 } from '../utils/noise';
import type { PlanetConfig, SurfaceLayer } from './planetTypes';

/** Texture resolution for procedurally generated maps — reduced on mobile for performance. */
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth <= 600;
const TEX_WIDTH = IS_MOBILE ? 512 : 1024;
const TEX_HEIGHT = IS_MOBILE ? 256 : 512;

/**
 * Procedurally generated planet with canvas-based diffuse + bump textures,
 * optional atmosphere glow, and optional ring system.
 */
export class ProceduralPlanet {
  public group: THREE.Group;

  private surfaceMesh: THREE.Mesh;
  private diffuseTexture: THREE.CanvasTexture | null = null;
  private bumpTexture: THREE.CanvasTexture | null = null;
  private ringTexture: THREE.CanvasTexture | null = null;
  private disposed: boolean = false;

  constructor(config: PlanetConfig) {
    this.group = new THREE.Group();

    // Generate textures
    const { diffuseCanvas, bumpCanvas } = this.generateTextures(config);

    this.diffuseTexture = new THREE.CanvasTexture(diffuseCanvas);
    this.diffuseTexture.wrapS = THREE.RepeatWrapping;
    this.diffuseTexture.wrapT = THREE.ClampToEdgeWrapping;

    this.bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    this.bumpTexture.wrapS = THREE.RepeatWrapping;
    this.bumpTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Surface mesh
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      map: this.diffuseTexture,
      bumpMap: this.bumpTexture,
      bumpScale: config.bumpStrength * 0.02,
      specular: 0x222222,
      shininess: config.bandedSurface ? 5 : 12,
    });
    this.surfaceMesh = new THREE.Mesh(geometry, material);
    this.group.add(this.surfaceMesh);

    // Atmosphere
    if (config.atmosphere) {
      this.addAtmosphere(config.atmosphere.color, config.atmosphere.intensity);
    }

    // Rings
    if (config.rings) {
      this.addRings(config.rings);
    }
  }

  /** Dispose all GPU resources. Call before removing from scene. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.diffuseTexture?.dispose();
    this.bumpTexture?.dispose();
    this.ringTexture?.dispose();
  }

  /** Slow rotation each frame. */
  public update(_dt: number, elapsed: number): void {
    this.surfaceMesh.rotation.y = elapsed * 0.02;
  }

  // ── Texture generation ──────────────────────────────────────────

  private generateTextures(config: PlanetConfig): {
    diffuseCanvas: HTMLCanvasElement;
    bumpCanvas: HTMLCanvasElement;
  } {
    const diffuseCanvas = document.createElement('canvas');
    diffuseCanvas.width = TEX_WIDTH;
    diffuseCanvas.height = TEX_HEIGHT;
    const diffuseCtx = diffuseCanvas.getContext('2d')!;
    const diffuseData = diffuseCtx.createImageData(TEX_WIDTH, TEX_HEIGHT);

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = TEX_WIDTH;
    bumpCanvas.height = TEX_HEIGHT;
    const bumpCtx = bumpCanvas.getContext('2d')!;
    const bumpData = bumpCtx.createImageData(TEX_WIDTH, TEX_HEIGHT);

    const freq = config.noiseFrequency;
    const octaves = config.noiseOctaves;
    const lac = config.noiseLacunarity;
    const gain = 0.5;
    const layers = config.surfaceLayers;

    for (let py = 0; py < TEX_HEIGHT; py++) {
      // v: 0 (top/north pole) → 1 (bottom/south pole)
      const v = py / TEX_HEIGHT;
      const lat = Math.PI * v; // 0 → π (colatitude)
      const sinLat = Math.sin(lat);
      const cosLat = Math.cos(lat);

      for (let px = 0; px < TEX_WIDTH; px++) {
        const u = px / TEX_WIDTH;
        const lon = 2 * Math.PI * u; // 0 → 2π

        // Map UV to 3D point on unit sphere (avoids polar pinching)
        const sx = sinLat * Math.cos(lon);
        const sy = cosLat;
        const sz = sinLat * Math.sin(lon);

        // Sample noise
        const n = fbm3(sx * freq, sy * freq, sz * freq, octaves, lac, gain);

        let r: number, g: number, b: number;

        if (config.bandedSurface) {
          // Gas giant: color from latitude bands with slight noise variation
          const bandValue = this.latitudeBandValue(v, n);
          [r, g, b] = this.samplePalette(layers, bandValue);
        } else {
          // Solid body: color from noise height
          [r, g, b] = this.samplePalette(layers, n);
        }

        // Ice caps: blend toward white near poles
        if (config.iceCaps) {
          // latitude factor: 1.0 at poles, 0.0 at equator
          const poleFactor = Math.abs(cosLat);
          // Only kick in above ~65° latitude
          const iceBlend = Math.max(0, (poleFactor - 0.4) / 0.6);
          const iceFactor = iceBlend * iceBlend * (0.7 + 0.3 * (n * 0.5 + 0.5));
          r = Math.round(r + (235 - r) * iceFactor);
          g = Math.round(g + (240 - g) * iceFactor);
          b = Math.round(b + (245 - b) * iceFactor);
        }

        // Write diffuse pixel
        const idx = (py * TEX_WIDTH + px) * 4;
        diffuseData.data[idx] = r;
        diffuseData.data[idx + 1] = g;
        diffuseData.data[idx + 2] = b;
        diffuseData.data[idx + 3] = 255;

        // Write bump pixel (greyscale from noise, 0-255)
        const bumpVal = Math.round(((n + 1) / 2) * 255);
        bumpData.data[idx] = bumpVal;
        bumpData.data[idx + 1] = bumpVal;
        bumpData.data[idx + 2] = bumpVal;
        bumpData.data[idx + 3] = 255;
      }
    }

    diffuseCtx.putImageData(diffuseData, 0, 0);
    bumpCtx.putImageData(bumpData, 0, 0);

    return { diffuseCanvas, bumpCanvas };
  }

  /** Compute a band-driven value for gas giant surfaces. */
  private latitudeBandValue(v: number, noise: number): number {
    // Create horizontal bands from latitude
    const bandFreq = 12;
    const band = Math.sin(v * Math.PI * bandFreq);
    // Add turbulence from noise
    const turbulence = noise * 0.3;
    // Map to [0, 1] range for palette lookup, recentered
    return (band + turbulence) * 0.5;
  }

  /** Look up color from sorted surface layers by threshold. */
  private samplePalette(layers: SurfaceLayer[], value: number): [number, number, number] {
    // Find the two layers to interpolate between
    for (let i = 0; i < layers.length; i++) {
      if (value <= layers[i].threshold) {
        if (i === 0) return [...layers[0].color];
        // Interpolate between layer i-1 and layer i
        const prev = layers[i - 1];
        const curr = layers[i];
        const range = curr.threshold - prev.threshold;
        const t = range > 0 ? (value - prev.threshold) / range : 0;
        return [
          Math.round(prev.color[0] + (curr.color[0] - prev.color[0]) * t),
          Math.round(prev.color[1] + (curr.color[1] - prev.color[1]) * t),
          Math.round(prev.color[2] + (curr.color[2] - prev.color[2]) * t),
        ];
      }
    }
    return [...layers[layers.length - 1].color];
  }

  // ── Atmosphere ──────────────────────────────────────────────────

  private addAtmosphere(color: [number, number, number], intensity: number): void {
    const sunDir = new THREE.Vector3(...SUN_DIRECTION).normalize();

    const geometry = new THREE.SphereGeometry(1.04, 64, 64);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: sunDir },
        atmosColor: { value: new THREE.Vector3(color[0], color[1], color[2]) },
        atmosIntensity: { value: intensity },
      },
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
        uniform vec3 sunDirection;
        uniform vec3 atmosColor;
        uniform float atmosIntensity;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);

          // Rim glow: bright at edges, transparent at center
          float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
          rim = pow(rim, 3.0);

          // Sun-facing modulation
          float sunFacing = dot(vNormal, sunDirection);
          float sunGlow = smoothstep(-0.3, 0.5, sunFacing);
          sunGlow = mix(0.08, 1.0, sunGlow);

          float alpha = rim * sunGlow * atmosIntensity;
          gl_FragColor = vec4(atmosColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    this.group.add(new THREE.Mesh(geometry, material));
  }

  // ── Rings ───────────────────────────────────────────────────────

  private addRings(ringCfg: {
    innerRadius: number;
    outerRadius: number;
    color: [number, number, number];
    tilt: number;
  }): void {
    const segments = 128;
    const geometry = new THREE.RingGeometry(
      ringCfg.innerRadius,
      ringCfg.outerRadius,
      segments,
    );

    // Fix UVs so they map radially (default RingGeometry UVs are angular).
    // RingGeometry vertices lie in the XY plane (z = 0).
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      // u = radial position [0 = inner, 1 = outer]
      const u = (dist - ringCfg.innerRadius) / (ringCfg.outerRadius - ringCfg.innerRadius);
      uv.setXY(i, u, 0.5);
    }

    // Generate ring texture (1D radial bands with gaps)
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 512;
    ringCanvas.height = 1;
    const ctx = ringCanvas.getContext('2d')!;
    const imgData = ctx.createImageData(512, 1);
    const [cr, cg, cb] = ringCfg.color;

    for (let i = 0; i < 512; i++) {
      const t = i / 512;
      let opacity = 0;

      // Inner bright ring (B ring)
      if (t > 0.05 && t < 0.38) {
        opacity = 0.55 + 0.15 * Math.sin(t * 120);
      }
      // Cassini division (prominent gap)
      if (t > 0.38 && t < 0.44) {
        opacity = 0.03;
      }
      // Outer broad ring (A ring)
      if (t > 0.44 && t < 0.78) {
        opacity = 0.35 + 0.1 * Math.sin(t * 90);
      }
      // Encke-like gap within A ring
      if (t > 0.58 && t < 0.61) {
        opacity *= 0.15;
      }
      // Faint outer ring (F ring)
      if (t > 0.82 && t < 0.92) {
        opacity = 0.12;
      }

      // Fine particle variation
      const variation = 0.85 + 0.3 * Math.sin(t * 200) * Math.sin(t * 47);
      const clampedVar = Math.max(0.6, Math.min(1.2, variation));

      const idx = i * 4;
      imgData.data[idx] = Math.min(255, Math.round(cr * clampedVar));
      imgData.data[idx + 1] = Math.min(255, Math.round(cg * clampedVar));
      imgData.data[idx + 2] = Math.min(255, Math.round(cb * clampedVar));
      imgData.data[idx + 3] = Math.round(opacity * 255);
    }
    ctx.putImageData(imgData, 0, 0);

    this.ringTexture = new THREE.CanvasTexture(ringCanvas);
    this.ringTexture.wrapS = THREE.ClampToEdgeWrapping;

    const material = new THREE.MeshBasicMaterial({
      map: this.ringTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const ringMesh = new THREE.Mesh(geometry, material);
    ringMesh.rotation.x = Math.PI / 2 + ringCfg.tilt;
    this.group.add(ringMesh);
  }
}
