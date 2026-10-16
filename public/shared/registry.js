import chess from './games/chess.js';
import hockey from './games/hockey.js';
import hoops from './games/hoops.js';
import golf from './games/golf.js';

export const GAMES = { chess, hockey, hoops, golf };
export const GAME_IDS = Object.keys(GAMES);
