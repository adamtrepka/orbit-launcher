import type { LaunchParams } from '../physics/LaunchSimulator';
import type { OrbitHint } from '../orbits/OrbitHints';

interface SliderConfig {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
  hint: string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    id: 'azimuth',
    label: 'LAUNCH AZIMUTH',
    min: 0,
    max: 360,
    step: 1,
    defaultValue: 90,
    unit: 'deg',
    hint: 'Compass heading: 0=N, 90=E, 180=S, 270=W. East → low inclination, North/South → polar.',
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
  },
  {
    id: 'targetApogee',
    label: 'TARGET APOGEE',
    min: 150,
    max: 50000,
    step: 50,
    defaultValue: 500,
    unit: 'km',
    hint: 'The orbit\'s highest point. Injection burn auto-computes the right delta-V to reach this altitude.',
  },
];

/**
 * Launch parameter control panel with sliders and contextual orbit hints.
 */
export class LaunchPanel {
  private panel: HTMLElement;
  private sliderContainer: HTMLElement;
  private launchBtn: HTMLElement;
  private hintsContainer: HTMLElement;
  private sliders: Map<string, HTMLInputElement> = new Map();
  private valueDisplays: Map<string, HTMLElement> = new Map();

  private onChange: ((params: LaunchParams) => void) | null = null;
  private onLaunch: (() => void) | null = null;

  constructor() {
    this.panel = document.getElementById('launch-panel')!;
    this.sliderContainer = document.getElementById('slider-controls')!;
    this.launchBtn = document.getElementById('btn-launch')!;
    this.hintsContainer = document.getElementById('orbit-hints')!;

    this.buildSliders();

    this.launchBtn.addEventListener('click', () => {
      if (this.onLaunch) this.onLaunch();
    });
  }

  private buildSliders(): void {
    this.sliderContainer.innerHTML = '';

    for (const config of SLIDER_CONFIGS) {
      const group = document.createElement('div');
      group.className = 'slider-group';

      const header = document.createElement('div');
      header.className = 'slider-header';

      const label = document.createElement('span');
      label.className = 'slider-label';
      label.textContent = config.label;

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
        if (this.onChange) {
          this.onChange(this.getParams());
        }
      });

      const hint = document.createElement('div');
      hint.className = 'slider-hint';
      hint.textContent = config.hint;

      group.appendChild(header);
      group.appendChild(slider);
      group.appendChild(hint);
      this.sliderContainer.appendChild(group);
    }
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
    return {
      azimuth: parseFloat(this.sliders.get('azimuth')!.value),
      elevation: parseFloat(this.sliders.get('elevation')!.value),
      thrustPercent: parseFloat(this.sliders.get('thrustPercent')!.value) / 100,
      burnAltitude: parseFloat(this.sliders.get('burnAltitude')!.value),
      targetApogee: parseFloat(this.sliders.get('targetApogee')!.value),
    };
  }

  show(onChange: (params: LaunchParams) => void, onLaunch: () => void, hints?: OrbitHint | null): void {
    this.onChange = onChange;
    this.onLaunch = onLaunch;
    this.panel.classList.remove('hidden');

    if (hints) {
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
    this.hideHints();
  }

  disable(): void {
    this.launchBtn.setAttribute('disabled', 'true');
    this.launchBtn.style.opacity = '0.5';
    this.sliders.forEach((s) => (s.disabled = true));
  }

  enable(): void {
    this.launchBtn.removeAttribute('disabled');
    this.launchBtn.style.opacity = '1';
    this.sliders.forEach((s) => (s.disabled = false));
  }
}
