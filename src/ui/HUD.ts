import { formatNumber } from '../utils/math';

/**
 * Heads-up display showing real-time flight data during launch.
 */
export class HUD {
  private container: HTMLElement;
  private altitudeSpan: HTMLElement;
  private velocitySpan: HTMLElement;
  private fuelSpan: HTMLElement;
  private phaseSpan: HTMLElement;

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
  }

  update(altitude: number, velocity: number, fuel: number, phase: string): void {
    this.altitudeSpan.textContent = formatNumber(altitude);
    this.velocitySpan.textContent = formatNumber(velocity);
    this.fuelSpan.textContent = formatNumber(fuel * 100);
    this.phaseSpan.textContent = phase;
  }
}
