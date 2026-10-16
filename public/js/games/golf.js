import { BALL_R, CUP_R, GAME_SECONDS, MAX_PUTT, W, H, isStopped } from '../../shared/games/golf.js';
import { COLORS, circle, line, roundRect, text, fmtTime } from '../draw.js';

const PULL_GAIN = 5; // drag distance -> putt speed

export default function golfClient({ seat, config, names, send }) {
  let aim = null;
  let lastState = null;

  return {
    render(ctx, state) {
      lastState = state;
      // Fairway & green.
      ctx.fillStyle = '#0d3b1e';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1f7a3a';
      ctx.fillRect(4, 4, W - 8, H - 8);
      for (let y = 4; y < H; y += 40) { ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(4, y, W - 8, 20); }

      for (const s of config.sand) roundRect(ctx, s.x, s.y, s.w, s.h, 18, '#d9c27a');
      for (const w of config.walls) roundRect(ctx, w.x, w.y, w.w, w.h, 4, '#7a4a24', '#4a2a10');
      for (const b of config.bumpers) circle(ctx, b.x, b.y, b.r, '#6b6b7a', '#333', 3);

      // Tee & cup.
      roundRect(ctx, config.tee.x - 22, config.tee.y - 8, 44, 16, 6, 'rgba(255,255,255,.12)');
      circle(ctx, config.cup.x, config.cup.y, CUP_R, '#0a0a0a', '#ddd', 2);
      line(ctx, config.cup.x, config.cup.y, config.cup.x, config.cup.y - 44, '#ddd', 2);
      ctx.beginPath();
      ctx.moveTo(config.cup.x, config.cup.y - 44);
      ctx.lineTo(config.cup.x + 22, config.cup.y - 37);
      ctx.lineTo(config.cup.x, config.cup.y - 30);
      ctx.fillStyle = COLORS.them;
      ctx.fill();

      const me = state.balls[seat], them = state.balls[1 - seat];
      if (!them.done) {
        ctx.globalAlpha = 0.55;
        circle(ctx, them.x, them.y, BALL_R, COLORS.them);
        ctx.globalAlpha = 1;
      }
      if (aim && !me.done) {
        const [vx, vy] = shotFrom(aim);
        const power = Math.hypot(vx, vy) / MAX_PUTT;
        const col = power > 0.8 ? COLORS.them : power > 0.45 ? COLORS.accent : COLORS.good;
        // Dotted guide in the shot direction plus a pull-back line to your finger.
        ctx.setLineDash([4, 6]);
        line(ctx, me.x, me.y, me.x + vx * 0.18, me.y + vy * 0.18, col, 3);
        ctx.setLineDash([]);
        line(ctx, me.x, me.y, me.x - vx * 0.08, me.y - vy * 0.08, 'rgba(255,255,255,.3)', 2);
      }
      if (!me.done) {
        circle(ctx, me.x, me.y, BALL_R + 4, isStopped(me) ? 'rgba(77,225,255,.35)' : null);
        circle(ctx, me.x, me.y, BALL_R, '#fff', '#888', 1.5);
      }

      // HUD.
      roundRect(ctx, 8, 8, 170, 46, 10, 'rgba(0,0,0,.45)');
      text(ctx, `You: ${me.strokes}${me.done ? ' ✓' : ''}`, 18, 22, { align: 'left', size: 15, color: COLORS.you });
      text(ctx, `${names[1 - seat]}: ${them.strokes}${them.done ? ' ✓' : ''}`, 18, 42, { align: 'left', size: 13, color: COLORS.them });
      roundRect(ctx, W - 98, H - 40, 90, 32, 10, 'rgba(0,0,0,.45)');
      text(ctx, `Par ${config.par} · ${fmtTime(GAME_SECONDS - state.elapsed)}`, W - 53, H - 24, { size: 13 });
      if (me.done && !them.done) text(ctx, 'In the hole! Waiting for opponent…', W / 2, H / 2, { size: 17, color: COLORS.accent });
      else if (me.strokes === 0 && !aim) text(ctx, 'Drag back anywhere, then let go to putt', W / 2, H - 70, { size: 14, color: '#e8ffe8' });
    },

    pointerDown(p) {
      const me = lastState?.balls[seat];
      if (!me || me.done || !isStopped(me)) return;
      aim = { id: p.id, x: p.x, y: p.y, sx: p.x, sy: p.y };
    },
    pointerMove(p) {
      if (aim && aim.id === p.id) { aim.x = p.x; aim.y = p.y; }
    },
    pointerUp(p) {
      if (!aim || aim.id !== p.id) return;
      aim.x = p.x; aim.y = p.y;
      const [vx, vy] = shotFrom(aim);
      aim = null;
      if (Math.hypot(vx, vy) > 30) send({ type: 'putt', vx, vy });
    },
  };
}

// Slingshot: pull back from where you pressed (anywhere, so your thumb never hides
// the ball); the shot goes the opposite way.
function shotFrom(aim) {
  let vx = (aim.sx - aim.x) * PULL_GAIN, vy = (aim.sy - aim.y) * PULL_GAIN;
  const s = Math.hypot(vx, vy);
  if (s > MAX_PUTT) { vx *= MAX_PUTT / s; vy *= MAX_PUTT / s; }
  return [vx, vy];
}
