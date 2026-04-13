import type { OrbitParameters } from '../orbits/types';
import type { ScoreBreakdown } from '../scoring/ScoreCalculator';
import { formatNumber } from '../utils/math';

/**
 * Score display panel shown after launch with comparison and breakdown.
 */
export class ScorePanel {
  private panel: HTMLElement;
  private comparison: HTMLElement;
  private breakdown: HTMLElement;
  private totalDiv: HTMLElement;
  private retryBtn: HTMLElement;
  private nextBtn: HTMLElement;

  private onRetry: (() => void) | null = null;
  private onNext: (() => void) | null = null;

  constructor() {
    this.panel = document.getElementById('score-panel')!;
    this.comparison = document.getElementById('score-orbit-comparison')!;
    this.breakdown = document.getElementById('score-breakdown')!;
    this.totalDiv = document.getElementById('score-total')!;
    this.retryBtn = document.getElementById('btn-retry')!;
    this.nextBtn = document.getElementById('btn-next')!;

    this.retryBtn.addEventListener('click', () => {
      if (this.onRetry) this.onRetry();
    });
    this.nextBtn.addEventListener('click', () => {
      if (this.onNext) this.onNext();
    });
  }

  show(
    target: OrbitParameters,
    achieved: OrbitParameters,
    score: ScoreBreakdown,
    isNewBest: boolean,
    onRetry: () => void,
    onNext: () => void
  ): void {
    this.onRetry = onRetry;
    this.onNext = onNext;

    // Build comparison
    this.comparison.innerHTML = this.buildComparison(target, achieved);

    // Build score breakdown
    this.breakdown.innerHTML = '';
    this.addScoreRow('Altitude Match', score.altitudeScore, '#42a5f5');
    this.addScoreRow('Inclination Match', score.inclinationScore, '#ab47bc');
    this.addScoreRow('Eccentricity Match', score.eccentricityScore, '#ffa726');
    this.addScoreRow('Fuel Efficiency', score.fuelScore, '#66bb6a');

    // Total
    const totalVal = Math.round(score.totalScore);
    let totalColor = '#ef5350';
    if (totalVal >= 80) totalColor = '#66bb6a';
    else if (totalVal >= 50) totalColor = '#ffa726';

    this.totalDiv.innerHTML = `
      <div class="total-label">TOTAL SCORE</div>
      <div class="total-value" style="color: ${totalColor}">${totalVal}</div>
      ${isNewBest ? '<div style="color: #ffd54f; font-size: 12px; letter-spacing: 2px; margin-top: 4px;">NEW BEST!</div>' : ''}
    `;

    this.panel.classList.remove('hidden');

    // Animate score bars after a brief delay
    requestAnimationFrame(() => {
      const fills = this.breakdown.querySelectorAll('.score-row-fill') as NodeListOf<HTMLElement>;
      fills.forEach((fill) => {
        const targetWidth = fill.getAttribute('data-width') || '0%';
        fill.style.width = targetWidth;
      });
    });
  }

  hide(): void {
    this.panel.classList.add('hidden');
    this.onRetry = null;
    this.onNext = null;
  }

  private buildComparison(target: OrbitParameters, achieved: OrbitParameters): string {
    const targetRows = this.buildParamRows(target, 'TARGET');
    const achievedRows = this.buildParamRows(achieved, 'ACHIEVED');

    return `
      <div class="comparison-column">
        <h3>TARGET</h3>
        ${targetRows}
      </div>
      <div class="comparison-vs">VS</div>
      <div class="comparison-column">
        <h3>ACHIEVED</h3>
        ${achievedRows}
      </div>
    `;
  }

  private buildParamRows(params: OrbitParameters, _type: string): string {
    let html = '';

    if (params.perigee !== undefined && params.apogee !== undefined) {
      html += `<div class="comparison-row"><span class="label">PERIGEE</span><br><span class="value">${formatNumber(params.perigee)} km</span></div>`;
      html += `<div class="comparison-row"><span class="label">APOGEE</span><br><span class="value">${formatNumber(params.apogee)} km</span></div>`;
    } else {
      html += `<div class="comparison-row"><span class="label">ALTITUDE</span><br><span class="value">${formatNumber(params.altitude)} km</span></div>`;
    }

    html += `<div class="comparison-row"><span class="label">INCLINATION</span><br><span class="value">${params.inclination.toFixed(1)} deg</span></div>`;
    html += `<div class="comparison-row"><span class="label">ECCENTRICITY</span><br><span class="value">${params.eccentricity.toFixed(3)}</span></div>`;

    return html;
  }

  private addScoreRow(label: string, score: number, color: string): void {
    const percent = Math.round(score * 100);
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `
      <span class="score-row-label">${label}</span>
      <div class="score-row-bar">
        <div class="score-row-fill" style="width: 0%; background: ${color}" data-width="${percent}%"></div>
      </div>
      <span class="score-row-value" style="color: ${color}">${percent}</span>
    `;
    this.breakdown.appendChild(row);
  }
}
