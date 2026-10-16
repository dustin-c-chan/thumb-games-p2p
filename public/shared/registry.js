import chess from './games/chess.js';
import hoops from './games/hoops.js';
import golf from './games/golf.js';
import pachinko from './games/pachinko.js';
import blackjack from './games/blackjack.js';
import snap from './games/snap.js';
import bluff from './games/bluff.js';

export const GAMES = { chess, hoops, golf, pachinko, blackjack, snap, bluff };
export const GAME_IDS = Object.keys(GAMES);
