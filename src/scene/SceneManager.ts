import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN_DIRECTION } from '../utils/constants';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  private clock: THREE.Clock;
  private callbacks: Array<(dt: number, elapsed: number) => void> = [];
  private resizeCallbacks: Array<(width: number, height: number) => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.001,
      1000
    );
    this.camera.position.set(3, 2, 4);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 50;
    this.controls.enablePan = false;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x334466, 0.25);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.set(...SUN_DIRECTION);
    this.scene.add(sunLight);

    // Subtle fill from opposite side
    const fillLight = new THREE.DirectionalLight(0x4466aa, 0.1);
    fillLight.position.set(-3, -1, -2);
    this.scene.add(fillLight);

    this.clock = new THREE.Clock();

    // Resize handler
    window.addEventListener('resize', this.onResize.bind(this));
  }

  onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    for (const cb of this.resizeCallbacks) {
      cb(w, h);
    }
  }

  /** Register a callback invoked on window resize with (width, height). */
  onResizeCallback(callback: (width: number, height: number) => void): void {
    this.resizeCallbacks.push(callback);
  }

  onUpdate(callback: (dt: number, elapsed: number) => void): void {
    this.callbacks.push(callback);
  }

  animate(): void {
    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.controls.update();

    for (const cb of this.callbacks) {
      cb(dt, elapsed);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }

  start(): void {
    this.animate();
  }
}
