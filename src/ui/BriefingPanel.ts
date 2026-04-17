import { formatNumber } from '../utils/math';
import { getBestScore } from '../scoring/HighScores';
import { PLANET_CONFIGS } from '../scene/planetTypes';
import { getCombinedScoreMultiplier } from '../game/Mutators';
import type { TargetOrbit } from '../orbits/types';

/**
 * Mission briefing overlay: shows orbit type, description, target params, difficulty.
 */
export class BriefingPanel {
  private panel: HTMLElement;
  private orbitName: HTMLElement;
  private description: HTMLElement;
  private paramsGrid: HTMLElement;
  private difficulty: HTMLElement;
  private acceptBtn: HTMLElement;

  private onAccept: (() => void) | null = null;

  constructor() {
    this.panel = document.getElementById('briefing-panel')!;
    this.orbitName = document.getElementById('briefing-orbit-name')!;
    this.description = document.getElementById('briefing-description')!;
    this.paramsGrid = document.getElementById('briefing-params')!;
    this.difficulty = document.getElementById('briefing-difficulty')!;
    this.acceptBtn = document.getElementById('btn-accept-mission')!;

    this.acceptBtn.addEventListener('click', () => {
      if (this.onAccept) this.onAccept();
    });
  }

  show(target: TargetOrbit, onAccept: () => void): void {
    this.onAccept = onAccept;
    const def = target.definition;
    const params = target.params;

    this.orbitName.textContent = def.name;
    this.description.textContent = def.description;

    // Show planet name as subtitle
    const planetName = PLANET_CONFIGS[target.planetType].name;
    this.orbitName.textContent = `${def.name} — ${planetName}`;

    // Build params grid
    let paramsHtml = '';

    if (params.perigee !== undefined && params.apogee !== undefined) {
      paramsHtml += this.paramItem('PERIGEE', formatNumber(params.perigee), 'km');
      paramsHtml += this.paramItem('APOGEE', formatNumber(params.apogee), 'km');
    } else {
      paramsHtml += this.paramItem('ALTITUDE', formatNumber(params.altitude), 'km');
    }

    paramsHtml += this.paramItem('INCLINATION', params.inclination.toFixed(1), 'deg');
    paramsHtml += this.paramItem('ECCENTRICITY', params.eccentricity.toFixed(3), '');

    this.paramsGrid.innerHTML = paramsHtml;

    // Difficulty badge
    const diffClass = `difficulty-${def.difficulty.toLowerCase()}`;
    this.difficulty.className = `difficulty ${diffClass}`;
    const best = getBestScore(def.type);
    const bestText = best !== null ? ` | BEST: ${best}` : '';
    this.difficulty.textContent = `DIFFICULTY: ${def.difficulty}${bestText}`;

    // Active mutators display
    this.renderMutators(target);

    this.panel.classList.remove('hidden');
  }

  hide(): void {
    this.panel.classList.add('hidden');
    this.onAccept = null;
  }

  private renderMutators(target: TargetOrbit): void {
    // Remove any previous mutator container
    const existing = this.panel.querySelector('.briefing-mutators');
    if (existing) existing.remove();

    if (target.mutators.length === 0) return;

    const container = document.createElement('div');
    container.className = 'briefing-mutators';

    const header = document.createElement('div');
    header.className = 'mutators-header';
    const multiplier = getCombinedScoreMultiplier(target.mutators);
    header.textContent = `ACTIVE MODIFIERS (${multiplier.toFixed(1)}x score)`;
    container.appendChild(header);

    for (const mutator of target.mutators) {
      const badge = document.createElement('div');
      badge.className = 'mutator-badge';
      badge.innerHTML = `
        <span class="mutator-icon">${mutator.icon}</span>
        <span class="mutator-info">
          <span class="mutator-name">${mutator.name}</span>
          <span class="mutator-desc">${mutator.description}</span>
        </span>
      `;
      container.appendChild(badge);
    }

    // Insert after difficulty badge
    this.difficulty.insertAdjacentElement('afterend', container);
  }

  private paramItem(label: string, value: string, unit: string): string {
    return `
      <div class="param-item">
        <div class="param-label">${label}</div>
        <div class="param-value">${value}<span class="param-unit">${unit}</span></div>
      </div>
    `;
  }
}
