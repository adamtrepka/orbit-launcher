export const GameState = {
  WELCOME: 'WELCOME',
  BRIEFING: 'BRIEFING',
  SETUP: 'SETUP',
  LAUNCHING: 'LAUNCHING',
  RESULT: 'RESULT',
} as const;

export type GameState = (typeof GameState)[keyof typeof GameState];
