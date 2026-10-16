import { SIZE, TURN_SECONDS, legalMoves } from '../../shared/games/chess.js';
import { COLORS, circle, roundRect, text } from '../draw.js';

const SQ = 72;
const BX = (400 - SQ * SIZE) / 2;
const BY = 120;
// Solid glyphs for both sides (tinted per color); FE0E asks for text, not emoji, rendering.
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

export default function chessClient({ seat, names, send }) {
  let selected = null;
  let lastState = null;

  // Board coordinates <-> screen squares; black (seat 1) sees the board flipped.
  const toScreen = (r, c) => (seat === 0 ? [r, c] : [SIZE - 1 - r, SIZE - 1 - c]);
  const fromScreen = toScreen; // the flip is its own inverse

  function drawClock(ctx, state, who, y) {
    const active = state.turn === who && !state.over;
    const t = active ? state.clock : TURN_SECONDS;
    const mine = who === seat;
    roundRect(ctx, BX, y, SQ * SIZE, 44, 12, active ? (mine ? 'rgba(77,225,255,.15)' : 'rgba(255,92,138,.15)') : COLORS.panel);
    text(ctx, mine ? `You (${who === 0 ? 'White' : 'Black'})` : names[who], BX + 14, y + 22, { align: 'left', color: mine ? COLORS.you : COLORS.them, size: 16 });
    text(ctx, active ? `${Math.ceil(t)}s` : '', BX + SQ * SIZE - 14, y + 22, { align: 'right', color: t < 8 ? COLORS.them : COLORS.text, size: 18 });
  }

  return {
    render(ctx, state) {
      lastState = state;
      if (selected && (state.turn !== seat || state.board[selected[0] * SIZE + selected[1]] === '.')) selected = null;

      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, 400, 600);
      drawClock(ctx, state, 1 - seat, 50);
      drawClock(ctx, state, seat, BY + SQ * SIZE + 26);

      const targets = selected
        ? legalMoves(state.board, seat).filter((m) => m.from[0] === selected[0] && m.from[1] === selected[1]).map((m) => m.to)
        : [];
      const kingIdx = state.check ? state.board.indexOf(state.turn === 0 ? 'K' : 'k') : -1;

      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const [sr, sc] = toScreen(r, c);
          const x = BX + sc * SQ, y = BY + sr * SQ;
          ctx.fillStyle = (r + c) % 2 === 0 ? '#e9dcc1' : '#9c7b5b';
          ctx.fillRect(x, y, SQ, SQ);
          const isLast = state.last && ((state.last.from[0] === r && state.last.from[1] === c) || (state.last.to[0] === r && state.last.to[1] === c));
          if (isLast) { ctx.fillStyle = 'rgba(255,204,51,.45)'; ctx.fillRect(x, y, SQ, SQ); }
          if (selected && selected[0] === r && selected[1] === c) { ctx.fillStyle = 'rgba(77,225,255,.55)'; ctx.fillRect(x, y, SQ, SQ); }
          if (kingIdx === r * SIZE + c) { ctx.fillStyle = 'rgba(255,60,60,.6)'; ctx.fillRect(x, y, SQ, SQ); }

          const p = state.board[r * SIZE + c];
          if (p !== '.') {
            const white = p === p.toUpperCase();
            ctx.font = `${SQ * 0.78}px "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const g = GLYPH[p.toLowerCase()] + '︎';
            ctx.lineWidth = 3;
            ctx.strokeStyle = white ? '#2b2b2b' : '#f5f5f5';
            ctx.strokeText(g, x + SQ / 2, y + SQ / 2 + 3);
            ctx.fillStyle = white ? '#ffffff' : '#1a1a1a';
            ctx.fillText(g, x + SQ / 2, y + SQ / 2 + 3);
          }
          if (targets.some((t) => t[0] === r && t[1] === c)) {
            if (p !== '.') circle(ctx, x + SQ / 2, y + SQ / 2, SQ / 2 - 4, null, 'rgba(20,120,200,.85)', 5);
            else circle(ctx, x + SQ / 2, y + SQ / 2, 11, 'rgba(20,120,200,.75)');
          }
        }
      }

      let status = state.turn === seat ? 'Your move' : 'Opponent is thinking…';
      if (state.check) status = state.turn === seat ? 'Check! Protect your king' : 'Check!';
      if (state.last?.auto) status += '  (time ran out — random move played)';
      text(ctx, status, 200, 20, { size: state.last?.auto ? 13 : 16, color: state.turn === seat ? COLORS.accent : COLORS.muted });
    },

    pointerDown(p) {
      const state = lastState;
      if (!state || state.over || state.turn !== seat) return;
      const sc = Math.floor((p.x - BX) / SQ), sr = Math.floor((p.y - BY) / SQ);
      if (sc < 0 || sc >= SIZE || sr < 0 || sr >= SIZE) { selected = null; return; }
      const [r, c] = fromScreen(sr, sc);
      const piece = state.board[r * SIZE + c];
      const own = piece !== '.' && (piece === piece.toUpperCase() ? 0 : 1) === seat;
      if (selected) {
        const ok = legalMoves(state.board, seat).some((m) => m.from[0] === selected[0] && m.from[1] === selected[1] && m.to[0] === r && m.to[1] === c);
        if (ok) { send({ type: 'move', from: selected, to: [r, c] }); selected = null; return; }
      }
      selected = own ? [r, c] : null;
    },
  };
}
