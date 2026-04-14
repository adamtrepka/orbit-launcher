import { ControlMode } from '../orbits/types';
import type { TargetOrbit } from '../orbits/types';
import type { LaunchParams } from '../physics/LaunchSimulator';
import type { OrbitHint } from '../orbits/OrbitHints';
import { computeArcadeParams, estimateInclination } from '../game/AutoCompute';

interface SliderConfig {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
  hint: string;
  /** Which modes show this slider ('ARCADE' | 'PRO' | 'BOTH') */
  visibility: 'ARCADE' | 'PRO' | 'BOTH';
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    id: 'azimuth',
    label: 'DIRECTION',
    min: 0,
    max: 360,
    step: 1,
    defaultValue: 90,
    unit: 'deg',
    hint: 'Compass heading: 0=N, 90=E, 180=S, 270=W. East → low inclination, North/South → polar.',
    visibility: 'BOTH',
  },
  {
    id: 'elevation',
    label: 'LAUNCH ELEVATION',
    min: 15,
    max: 85,
    step: 1,
    defaultValue: 45,
    unit: 'deg',
    hint: 'Angle above horizon. ~30-45 is typical. Higher = steeper initial climb.',
    visibility: 'PRO',
  },
  {
    id: 'thrustPercent',
    label: 'ASCENT THRUST',
    min: 10,
    max: 100,
    step: 1,
    defaultValue: 50,
    unit: '%',
    hint: 'Controls orbit shape! ≤50% → circular (full auto-circ). 55-62% → elliptical (less circ). ≥62% → no circ.',
    visibility: 'PRO',
  },
  {
    id: 'burnAltitude',
    label: 'INJECTION ALTITUDE',
    min: 100,
    max: 5000,
    step: 50,
    defaultValue: 300,
    unit: 'km',
    hint: 'Where the injection burn fires. Usually set LOW (200-300 km). Rocket must reach this altitude.',
    visibility: 'PRO',
  },
  {
    id: 'targetApogee',
    label: 'TARGET ALTITUDE',
    min: 150,
    max: 50000,
    step: 50,
    defaultValue: 500,
    unit: 'km',
    hint: 'How high to place the satellite. Match this to the mission target.',
    visibility: 'BOTH',
  },
];

const STORAGE_KEY = 'orbit-launcher-control-mode';

/**
 * Launch parameter control panel with sliders and contextual orbit hints.
 * Supports ARCADE mode (2 sliders) and PRO mode (5 sliders).
 */
export class LaunchPanel {
  private panel: HTMLElement;
  private sliderContainer: HTMLElement;
  private launchBtn: HTMLElement;
  private hintsContainer: HTMLElement;
  private modeToggleContainer: HTMLElement;
  private inclinationReadout: HTMLElement;
  private sliders: Map<string, HTMLInputElement> = new Map();
  private sliderGroups: Map<string, HTMLElement> = new Map();
  private valueDisplays: Map<string, HTMLElement> = new Map();

  private mode: ControlMode;
  private currentMission: TargetOrbit | null = null;
  private onChange: ((params: LaunchParams) => void) | null = null;
  private onLaunch: (() => void) | null = null;

  // Timer state
  private timerContainer: HTMLElement;
  private timerFill: HTMLElement;
  private timerText: HTMLElement;
  private timerInterval: number = 0;
  private timerExpiredCallback: (() => void) | null = null;

  constructor() {
    this.panel = document.getElementById('launch-panel')!;
    this.sliderContainer = document.getElementById('slider-controls')!;
    this.launchBtn = document.getElementById('btn-launch')!;
    this.hintsContainer = document.getElementById('orbit-hints')!;
    this.timerContainer = document.getElementById('launch-timer')!;
    this.timerFill = this.timerContainer.querySelector('.launch-timer-fill')!;
    this.timerText = this.timerContainer.querySelector('.launch-timer-text')!;

    // Load saved mode preference, default to ARCADE
    this.mode = this.loadMode();

    // Build the mode toggle
    this.modeToggleContainer = this.buildModeToggle();

    // Build the inclination readout (shown below azimuth in ARCADE)
    this.inclinationReadout = document.createElement('div');
    this.inclinationReadout.className = 'inclination-readout';

    this.buildSliders();
    this.applyMode();

    this.launchBtn.addEventListener('click', () => {
      if (this.onLaunch) this.onLaunch();
    });
  }

  private loadMode(): ControlMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === ControlMode.PRO) return ControlMode.PRO;
    } catch {
      // localStorage not available
    }
    return ControlMode.ARCADE;
  }

  private saveMode(): void {
    try {
      localStorage.setItem(STORAGE_KEY, this.mode);
    } catch {
      // localStorage not available
    }
  }

  private buildModeToggle(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'mode-toggle';

    const arcadeBtn = document.createElement('button');
    arcadeBtn.className = 'mode-btn';
    arcadeBtn.dataset['mode'] = ControlMode.ARCADE;
    arcadeBtn.textContent = 'ARCADE';

    const proBtn = document.createElement('button');
    proBtn.className = 'mode-btn';
    proBtn.dataset['mode'] = ControlMode.PRO;
    proBtn.textContent = 'PRO';

    arcadeBtn.addEventListener('click', () => this.setMode(ControlMode.ARCADE));
    proBtn.addEventListener('click', () => this.setMode(ControlMode.PRO));

    container.appendChild(arcadeBtn);
    container.appendChild(proBtn);
    return container;
  }

  private setMode(mode: ControlMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.saveMode();
    this.applyMode();

    // Re-trigger preview with new params
    if (this.onChange) {
      this.onChange(this.getParams());
    }
  }

  private applyMode(): void {
    // Update toggle button active states
    const buttons = this.modeToggleContainer.querySelectorAll('.mode-btn');
    buttons.forEach((btn) => {
      const el = btn as HTMLElement;
      el.classList.toggle('mode-btn-active', el.dataset['mode'] === this.mode);
    });

    // Show/hide slider groups based on mode
    for (const config of SLIDER_CONFIGS) {
      const group = this.sliderGroups.get(config.id);
      if (!group) continue;

      const visible =
        config.visibility === 'BOTH' ||
        config.visibility === this.mode;

      group.style.display = visible ? '' : 'none';
    }

    // Show/hide inclination readout (only in ARCADE)
    this.inclinationReadout.style.display =
      this.mode === ControlMode.ARCADE ? '' : 'none';

    // Update the target altitude label based on mode + orbit type
    this.updateAltitudeLabel();

    // In ARCADE mode, hide the detailed orbit hints
    if (this.mode === ControlMode.ARCADE) {
      this.hintsContainer.classList.add('hidden');
    }

    // Toggle panel styling class
    this.panel.classList.toggle('arcade-mode', this.mode === ControlMode.ARCADE);
    this.panel.classList.toggle('pro-mode', this.mode === ControlMode.PRO);
  }

  private updateAltitudeLabel(): void {
    const label = this.valueDisplays.get('targetApogee-label');
    if (!label) return;

    if (this.mode === ControlMode.ARCADE) {
      const isElliptical = this.currentMission
        ? this.currentMission.params.eccentricity > 0.05
        : false;
      label.textContent = isElliptical ? 'TARGET APOGEE' : 'TARGET ALTITUDE';
    } else {
      label.textContent = 'TARGET APOGEE';
    }
  }

  private buildSliders(): void {
    this.sliderContainer.innerHTML = '';

    // Insert mode toggle at top
    this.sliderContainer.appendChild(this.modeToggleContainer);

    for (const config of SLIDER_CONFIGS) {
      const group = document.createElement('div');
      group.className = 'slider-group';
      this.sliderGroups.set(config.id, group);

      const header = document.createElement('div');
      header.className = 'slider-header';

      const label = document.createElement('span');
      label.className = 'slider-label';
      label.textContent = config.label;
      // Store label reference for dynamic relabeling
      this.valueDisplays.set(config.id + '-label', label);

      const valueSpan = document.createElement('span');
      valueSpan.className = 'slider-value';
      valueSpan.textContent = `${config.defaultValue} ${config.unit}`;
      this.valueDisplays.set(config.id, valueSpan);

      header.appendChild(label);
      header.appendChild(valueSpan);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(config.min);
      slider.max = String(config.max);
      slider.step = String(config.step);
      slider.value = String(config.defaultValue);
      this.sliders.set(config.id, slider);

      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        valueSpan.textContent = `${val} ${config.unit}`;

        // Update inclination readout for azimuth changes
        if (config.id === 'azimuth') {
          this.updateInclinationReadout(val);
        }

        if (this.onChange) {
          this.onChange(this.getParams());
        }
      });

      const hint = document.createElement('div');
      hint.className = 'slider-hint';
      hint.textContent = config.hint;

      group.appendChild(header);
      group.appendChild(slider);

      // Insert inclination readout right after azimuth slider
      if (config.id === 'azimuth') {
        group.appendChild(this.inclinationReadout);
        this.updateInclinationReadout(config.defaultValue);
      }

      group.appendChild(hint);
      this.sliderContainer.appendChild(group);
    }
  }

  private updateInclinationReadout(azimuth: number): void {
    const inc = estimateInclination(azimuth);
    this.inclinationReadout.textContent = `~ ${inc}° inclination`;
  }

  private showHints(hints: OrbitHint): void {
    this.hintsContainer.innerHTML = `
      <div class="hints-title">SUGGESTED RANGES</div>
      <div class="hint-row"><span class="hint-label">Azimuth:</span> <span class="hint-value">${hints.azimuth}</span></div>
      <div class="hint-row"><span class="hint-label">Elevation:</span> <span class="hint-value">${hints.elevation}</span></div>
      <div class="hint-row"><span class="hint-label">Thrust:</span> <span class="hint-value">${hints.thrust}</span></div>
      <div class="hint-row"><span class="hint-label">Inj. Alt:</span> <span class="hint-value">${hints.burnAlt}</span></div>
      <div class="hint-row"><span class="hint-label">Target Apo:</span> <span class="hint-value">${hints.targetApogee}</span></div>
      <div style="margin-top:6px;color:#66bb6a;font-style:italic;">${hints.tip}</div>
    `;
    this.hintsContainer.classList.remove('hidden');
  }

  private hideHints(): void {
    this.hintsContainer.classList.add('hidden');
  }

  getParams(): LaunchParams {
    if (this.mode === ControlMode.ARCADE && this.currentMission) {
      const azimuth = parseFloat(this.sliders.get('azimuth')!.value);
      const targetAlt = parseFloat(this.sliders.get('targetApogee')!.value);
      return computeArcadeParams(azimuth, targetAlt, this.currentMission);
    }

    // PRO mode — read all 5 sliders directly
    return {
      azimuth: parseFloat(this.sliders.get('azimuth')!.value),
      elevation: parseFloat(this.sliders.get('elevation')!.value),
      thrustPercent: parseFloat(this.sliders.get('thrustPercent')!.value) / 100,
      burnAltitude: parseFloat(this.sliders.get('burnAltitude')!.value),
      targetApogee: parseFloat(this.sliders.get('targetApogee')!.value),
    };
  }

  show(
    onChange: (params: LaunchParams) => void,
    onLaunch: () => void,
    hints?: OrbitHint | null,
    mission?: TargetOrbit | null,
  ): void {
    this.onChange = onChange;
    this.onLaunch = onLaunch;
    this.currentMission = mission ?? null;
    this.panel.classList.remove('hidden');
    this.enable();

    // Reapply mode visibility (mission context may have changed)
    this.applyMode();

    // Show hints only in PRO mode
    if (hints && this.mode === ControlMode.PRO) {
      this.showHints(hints);
    } else {
      this.hideHints();
    }

    // Trigger initial preview
    if (this.onChange) {
      this.onChange(this.getParams());
    }
  }

  hide(): void {
    this.panel.classList.add('hidden');
    this.onChange = null;
    this.onLaunch = null;
    this.currentMission = null;
    this.hideHints();
    this.stopTimer();
  }

  disable(): void {
    this.launchBtn.setAttribute('disabled', 'true');
    this.launchBtn.style.opacity = '0.5';
    this.sliders.forEach((s) => (s.disabled = true));
    this.stopTimer();
  }

  enable(): void {
    this.launchBtn.removeAttribute('disabled');
    this.launchBtn.style.opacity = '1';
    this.sliders.forEach((s) => (s.disabled = false));
  }

  /**
   * Start a visible countdown timer. When it reaches zero, onExpired is called
   * (which typically auto-launches with current params).
   */
  startTimer(seconds: number, onExpired: () => void): void {
    this.stopTimer();
    this.timerExpiredCallback = onExpired;

    const totalMs = seconds * 1000;
    const startTime = performance.now();

    this.timerContainer.classList.remove('hidden');
    this.timerContainer.classList.remove('launch-timer-urgent');
    this.timerFill.style.width = '100%';
    this.timerText.textContent = String(seconds);

    this.timerInterval = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const remaining = Math.max(0, totalMs - elapsed);
      const remainingSec = Math.ceil(remaining / 1000);
      const fraction = remaining / totalMs;

      this.timerFill.style.width = `${fraction * 100}%`;
      this.timerText.textContent = String(remainingSec);

      // Urgent flash in last 5 seconds
      if (remainingSec <= 5) {
        this.timerContainer.classList.add('launch-timer-urgent');
      }

      if (remaining <= 0) {
        this.stopTimer();
        if (this.timerExpiredCallback) {
          this.timerExpiredCallback();
          this.timerExpiredCallback = null;
        }
      }
    }, 100);
  }

  /** Stop and hide the timer. */
  stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = 0;
    }
    this.timerContainer.classList.add('hidden');
    this.timerContainer.classList.remove('launch-timer-urgent');
    this.timerExpiredCallback = null;
  }
}
