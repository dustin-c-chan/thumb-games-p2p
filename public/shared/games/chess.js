// Mini Chess: Gardner's 5x5 variant. White (seat 0) moves first from the bottom.
// Simplifications: no castling, no en passant, pawns move one square, always promote to queen.

export const SIZE = 5;
export const TURN_SECONDS = 30;
const MAX_PLIES = 120;

const START = [
  'rnbqk',
  'ppppp',
  '.....',
  'PPPPP',
  'RNBQK',
];

const isWhite = (p) => p !== '.' && p === p.toUpperCase();
const colorOf = (p) => (p === '.' ? -1 : isWhite(p) ? 0 : 1);
const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const at = (board, r, c) => board[r * SIZE + c];

const DIRS = {
  n: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
  b: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  r: [[-1, 0], [1, 0], [0, -1], [0, 1]],
};
DIRS.q = DIRS.b.concat(DIRS.r);
DIRS.k = DIRS.q;

function pseudoMoves(board, side) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = at(board, r, c);
      if (colorOf(p) !== side) continue;
      const t = p.toLowerCase();
      const push = (tr, tc) => moves.push({ from: [r, c], to: [tr, tc] });
      if (t === 'p') {
        const dir = side === 0 ? -1 : 1;
        if (inside(r + dir, c) && at(board, r + dir, c) === '.') push(r + dir, c);
        for (const dc of [-1, 1]) {
          const tr = r + dir, tc = c + dc;
          if (inside(tr, tc) && colorOf(at(board, tr, tc)) === 1 - side) push(tr, tc);
        }
      } else {
        const slide = t === 'b' || t === 'r' || t === 'q';
        for (const [dr, dc] of DIRS[t]) {
          let tr = r + dr, tc = c + dc;
          while (inside(tr, tc)) {
            const q = at(board, tr, tc);
            if (colorOf(q) === side) break;
            push(tr, tc);
            if (q !== '.' || !slide) break;
            tr += dr; tc += dc;
          }
        }
      }
    }
  }
  return moves;
}

export function applyMove(board, m) {
  const next = board.slice();
  let p = at(board, m.from[0], m.from[1]);
  if (p === 'P' && m.to[0] === 0) p = 'Q';
  if (p === 'p' && m.to[0] === SIZE - 1) p = 'q';
  next[m.to[0] * SIZE + m.to[1]] = p;
  next[m.from[0] * SIZE + m.from[1]] = '.';
  return next;
}

export function inCheck(board, side) {
  const king = side === 0 ? 'K' : 'k';
  const idx = board.indexOf(king);
  if (idx < 0) return true;
  const kr = Math.floor(idx / SIZE), kc = idx % SIZE;
  return pseudoMoves(board, 1 - side).some((m) => m.to[0] === kr && m.to[1] === kc);
}

export function legalMoves(board, side) {
  return pseudoMoves(board, side).filter((m) => !inCheck(applyMove(board, m), side));
}

function sameSq(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function onlyKings(board) {
  return board.every((p) => p === '.' || p.toLowerCase() === 'k');
}

function doMove(state, m) {
  const captured = at(state.board, m.to[0], m.to[1]) !== '.';
  state.board = applyMove(state.board, m);
  state.last = { from: m.from, to: m.to, captured };
  state.ply++;
  state.turn = 1 - state.turn;
  state.clock = TURN_SECONDS;
  state.check = inCheck(state.board, state.turn);
  const replies = legalMoves(state.board, state.turn);
  if (replies.length === 0) {
    state.over = state.check
      ? { winner: 1 - state.turn, reason: 'Checkmate' }
      : { winner: null, reason: 'Stalemate' };
  } else if (onlyKings(state.board)) {
    state.over = { winner: null, reason: 'Only kings left' };
  } else if (state.ply >= MAX_PLIES) {
    state.over = { winner: null, reason: 'Move limit reached' };
  }
}

export default {
  id: 'chess',
  name: 'Mini Chess',
  blurb: '5×5 chess. Checkmate the king. 30s per move or a random move is played for you!',
  controls: 'Tap a piece, then tap where it should go.',

  create(rng) {
    return {
      config: {},
      state: {
        board: START.join('').split(''),
        turn: 0,
        clock: TURN_SECONDS,
        ply: 0,
        check: false,
        last: null,
        over: null,
        _rngSeed: Math.floor(rng() * 1e9),
      },
    };
  },

  input(config, state, seat, msg) {
    if (state.over || msg.type !== 'move' || seat !== state.turn) return;
    const ok = (sq) => Array.isArray(sq) && sq.length === 2 && sq.every((v) => Number.isInteger(v)) && inside(sq[0], sq[1]);
    if (!ok(msg.from) || !ok(msg.to)) return;
    const m = legalMoves(state.board, seat).find((mv) => sameSq(mv.from, msg.from) && sameSq(mv.to, msg.to));
    if (m) doMove(state, m);
  },

  step(config, state, dt) {
    if (state.over) return;
    state.clock -= dt;
    if (state.clock <= 0) {
      // Out of time: play a random legal move so nobody can stall the game.
      const moves = legalMoves(state.board, state.turn);
      state._rngSeed = (state._rngSeed * 1103515245 + 12345) % 2147483648;
      doMove(state, moves[state._rngSeed % moves.length]);
      state.last.auto = true;
    }
  },
};
