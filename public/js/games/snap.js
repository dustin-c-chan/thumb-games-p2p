import { GAME_SECONDS, POINTS_TO_WIN } from '../../shared/games/snap.js';
import { COLORS, circle, text } from '../draw.js';
import { GOLD, createCardAnimator, drawFelt, feltText, timerRing } from '../cards.js';

const PILE = { x: 200, y: 268 };
const BIG_W = 104, BIG_H = 148;
const BUTTON = { x: 200, y: 492, r: 62 };

export default function snapClient({ seat, names, send }) {
  const anim = createCardAnimator();
  let pressedAt = 0;
  let lastState = null;

  const snap = () => {
    pressedAt = performance.now();
    send({ type: 'snap' });
  };

  function pips(ctx, score, x, y, color) {
    for (let i = 0; i < POINTS_TO_WIN; i++) circle(ctx, x + i * 22, y, 8, i < score ? color : 'rgba(0,0,0,.35)', i < score ? '#fff' : 'rgba(255,255,255,.25)', 1.5);
  }

  return {
    render(ctx, state) {
      lastState = state;
      drawFelt(ctx, { tint: 'blue' });
      feltText(ctx, 'SNAP WHEN TWO IN A ROW MATCH', 200, 116, 12);

      // Scores.
      text(ctx, names[1 - seat], 44, 58, { align: 'left', size: 14, weight: 800, color: COLORS.them });
      pips(ctx, state.score[1 - seat], 52, 82, COLORS.them);
      text(ctx, 'You', 44, 402, { align: 'left', size: 14, weight: 800, color: COLORS.you });
      pips(ctx, state.score[seat], 52, 426, COLORS.you);
      const left = Math.max(0, GAME_SECONDS - state.elapsed);
      timerRing(ctx, 344, 70, 20, left / GAME_SECONDS);
      text(ctx, String(Math.ceil(left)), 344, 71, { size: 14, weight: 900, color: '#fff' });

      // The pile: older cards peek out at jaunty angles, newest on top.
      const showMatch = state.last && state.last.t < 1.1 && (state.last.ok || state.last.missed);
      state.pile.forEach((c, i) => {
        const top = i === state.pile.length - 1;
        const rot = (((c.id * 37) % 21) - 10) * 0.02;
        ctx.save();
        ctx.translate(PILE.x, PILE.y);
        ctx.rotate(rot);
        const glow = showMatch && i >= state.pile.length - 2 ? (state.last.missed ? '#ffcc33' : COLORS.good) : undefined;
        anim.draw(ctx, c, -BIG_W / 2 + (top ? 0 : (i - state.pile.length) * 6), -BIG_H / 2, { w: BIG_W, h: BIG_H, from: { x: 0, y: -420 }, glow });
        ctx.restore();
      });

      // Flash messages.
      const l = state.last;
      if (l && l.t < 1.1) {
        let msg = null, col = '#fff';
        if (l.missed) { msg = 'Missed a match!'; col = COLORS.accent; }
        else if (l.ok) { msg = l.seat === seat ? 'SNAP! +1' : `${names[l.seat]} snapped it!`; col = l.seat === seat ? COLORS.good : COLORS.them; }
        else if (l.seat === seat) { msg = 'No match! −1'; col = COLORS.them; }
        else { msg = 'They snapped too early!'; col = '#fff'; }
        text(ctx, msg, 200, 170 - l.t * 10, { size: l.ok && l.seat === seat ? 30 : 20, weight: 900, color: col });
      }

      // The big arcade SNAP button.
      const locked = state.lockout[seat] > 0;
      const down = performance.now() - pressedAt < 120;
      const by = BUTTON.y + (down ? 4 : 0);
      ctx.beginPath();
      ctx.ellipse(BUTTON.x, BUTTON.y + 12, BUTTON.r + 6, BUTTON.r * 0.5 + 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fill();
      circle(ctx, BUTTON.x, BUTTON.y + 8, BUTTON.r, locked ? '#555' : '#8a0f1c');
      const g = ctx.createRadialGradient(BUTTON.x - 18, by - 22, 6, BUTTON.x, by, BUTTON.r);
      g.addColorStop(0, locked ? '#aaa' : '#ff7a7a');
      g.addColorStop(1, locked ? '#666' : '#d0172a');
      circle(ctx, BUTTON.x, by, BUTTON.r, g, GOLD, 4);
      text(ctx, locked ? 'WAIT' : 'SNAP!', BUTTON.x, by + 2, { size: 30, weight: 900, color: '#fff' });
    },

    pointerDown(p) {
      if (!lastState) return;
      // The whole lower part of the table is the button, so you can slam it blind.
      if (p.y > 360) snap();
    },
    keyDown(k) { if (k === ' ') snap(); },
  };
}
