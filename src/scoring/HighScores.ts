export interface HighScoreEntry {
  orbitType: string;
  orbitName: string;
  score: number;
  accuracy: number;
  fuel: number;
  date: string;
}

const STORAGE_KEY = 'orbit-launcher-highscores';
const MAX_ENTRIES = 20;

export function getHighScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HighScoreEntry[];
  } catch {
    return [];
  }
}

export function saveHighScore(entry: HighScoreEntry): void {
  const scores = getHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function getBestScore(orbitType: string): number | null {
  const scores = getHighScores();
  const matching = scores.filter((s) => s.orbitType === orbitType);
  if (matching.length === 0) return null;
  return matching[0].score;
}
