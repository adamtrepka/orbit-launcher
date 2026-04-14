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
  private dismissBtn: HTMLElement;
  private showScoreBtn: HTMLElement;
  private scoreTitle: HTMLElement;
  private opponentScoreDiv: HTMLElement;

  private onRetry: (() => void) | null = null;
  private onNext: (() => void) | null = null;

  constructor() {
    this.panel = document.getElementById('score-panel')!;
    this.comparison = document.getElementById('score-orbit-comparison')!;
    this.breakdown = document.getElementById('score-breakdown')!;
    this.totalDiv = document.getElementById('score-total')!;
    this.retryBtn = document.getElementById('btn-retry')!;
    this.nextBtn = document.getElementById('btn-next')!;
    this.dismissBtn = document.getElementById('btn-dismiss-score')!;
    this.showScoreBtn = document.getElementById('btn-show-score')!;
    this.scoreTitle = document.getElementById('score-title')!;
    this.opponentScoreDiv = document.getElementById('mp-opponent-score')!;

    this.retryBtn.addEventListener('click', () => {
      if (this.onRetry) this.onRetry();
    });
    this.nextBtn.addEventListener('click', () => {
      if (this.onNext) this.onNext();
    });

    // Dismiss: hide score panel, show floating "SCORE" button
    this.dismissBtn.addEventListener('click', () => {
      this.panel.classList.add('hidden');
      this.showScoreBtn.classList.remove('hidden');
    });

    // Show score: re-show score panel, hide floating button
    this.showScoreBtn.addEventListener('click', () => {
    this.panel.classList.remove('hidden');
    this.showScoreBtn.classList.add('hidden');
      this.showScoreBtn.classList.add('hidden');
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
    this.showScoreBtn.classList.add('hidden');
    this.opponentScoreDiv.classList.add('hidden');
    this.scoreTitle.textContent = 'MISSION COMPLETE';
    this.onRetry = null;
    this.onNext = null;
  }

  /**
   * Show the opponent's score in multiplayer mode.
   * Call this after show() to overlay opponent results.
   */
  showOpponentScore(myScore: number, opponentScore: number): void {
    let resultLabel: string;
    let resultClass: string;

    if (myScore > opponentScore + 0.5) {
      resultLabel = 'YOU WIN!';
      resultClass = 'mp-result-win';
    } else if (opponentScore > myScore + 0.5) {
      resultLabel = 'YOU LOSE';
      resultClass = 'mp-result-lose';
    } else {
      resultLabel = 'DRAW';
      resultClass = 'mp-result-draw';
    }

    this.scoreTitle.textContent = 'ROUND COMPLETE';
    this.opponentScoreDiv.innerHTML = `
      <div class="mp-opponent-label">OPPONENT SCORE</div>
      <div class="mp-opponent-value">${Math.round(opponentScore)}</div>
      <div class="mp-result-label ${resultClass}">${resultLabel}</div>
    `;
    this.opponentScoreDiv.classList.remove('hidden');

    // In multiplayer, hide retry (both must play same mission), relabel next
    this.retryBtn.classList.add('hidden');
    this.nextBtn.textContent = 'NEXT ROUND';
  }

  /** Reset multiplayer-specific UI for single-player mode. */
  resetForSinglePlayer(): void {
    this.retryBtn.classList.remove('hidden');
    this.nextBtn.textContent = 'NEXT MISSION';
    this.opponentScoreDiv.classList.add('hidden');
    this.scoreTitle.textContent = 'MISSION COMPLETE';
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
