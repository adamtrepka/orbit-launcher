import './style.css';
import { Game } from './game/Game';

// Get canvas element
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

if (!canvas) {
  throw new Error('Canvas element #game-canvas not found');
}

// Create and start the game
const game = new Game(canvas);
game.start();
