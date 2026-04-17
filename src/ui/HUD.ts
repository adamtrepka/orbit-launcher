import { formatNumber } from '../utils/math';
import type { DifficultyMutator } from '../game/Mutators';

/**
 * Heads-up display showing real-time flight data during launch.
 */
export class HUD {
  private container: HTMLElement;
  private altitudeSpan: HTMLElement;
  private velocitySpan: HTMLElement;
  private fuelSpan: HTMLElement;
  private phaseSpan: HTMLElement;
  private mutatorContainer: HTMLElement | null = null;

  constructor() {
    this.container = document.getElementById('hud')!;
    this.altitudeSpan = this.container.querySelector('#hud-altitude span')!;
    this.velocitySpan = this.container.querySelector('#hud-velocity span')!;
    this.fuelSpan = this.container.querySelector('#hud-fuel span')!;
    this.phaseSpan = this.container.querySelector('#hud-phase span')!;
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
    this.hideMutators();
  }

  update(altitude: number, velocity: number, fuel: number, phase: string): void {
    this.altitudeSpan.textContent = formatNumber(altitude);
    this.velocitySpan.textContent = formatNumber(velocity);
    this.fuelSpan.textContent = formatNumber(fuel * 100);
    this.phaseSpan.textContent = phase;
  }

  /** Show active mutator indicators in the top-right corner. */
  showMutators(mutators: DifficultyMutator[]): void {
    this.hideMutators();
    if (mutators.length === 0) return;

    this.mutatorContainer = document.createElement('div');
    this.mutatorContainer.className = 'hud-mutators';

    for (const m of mutators) {
      const pip = document.createElement('div');
      pip.className = 'hud-mutator-pip';
      pip.textContent = m.icon;
      pip.setAttribute('data-name', m.name);
      pip.title = m.name;
      this.mutatorContainer.appendChild(pip);
    }

    document.body.appendChild(this.mutatorContainer);
  }

  hideMutators(): void {
    if (this.mutatorContainer) {
      this.mutatorContainer.remove();
      this.mutatorContainer = null;
    }
  }
}
