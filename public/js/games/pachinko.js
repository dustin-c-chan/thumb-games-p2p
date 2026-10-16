import { BALL_R, GAME_SECONDS, H, PADDLE_H, PADDLE_SPEED, PADDLE_W, PINS, PIN_R, W, paddleY, toWorldX } from '../../shared/games/pachinko.js';
import { COLORS, circle, roundRect, text } from '../draw.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function pachinkoClient({ seat, names, send }) {
  // Your paddle is predicted locally (seat-local x) so it tracks your thumb instantly.
  let target = W / 2;
  let local = W / 2;
  let lastSent = null;
  let lastSendAt = 0;
  const keys = { left: false, right: false };
  let t = 0;

  function setTarget(x) {
    target = clamp(x, PADDLE_W / 2, W - PADDLE_W / 2);
    flush();
  }
  // Throttled to ~60 msgs/s; render() calls this too so the final position always lands.
  function flush() {
    const now = performance.now();
    if (lastSent === null || (Math.abs(target - lastSent) > 0.5 && now - lastSendAt > 14)) {
      lastSent = target;
      lastSendAt = now;
      send({ type: 'paddle', x: target });
    }
  }

  function drawPaddle(ctx, x, y, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    roundRect(ctx, x - PADDLE_W / 2, y - PADDLE_H / 2, PADDLE_W, PADDLE_H, PADDLE_H / 2, color);
    ctx.restore();
    roundRect(ctx, x - PADDLE_W / 2 + 6, y - PADDLE_H / 2 + 2, PADDLE_W - 12, 3, 1.5, 'rgba(255,255,255,.6)');
  }

  return {
    render(ctx, state, dt) {
      t += dt;
      if (keys.left !== keys.right) setTarget(target + (keys.right ? 1 : -1) * 520 * dt);
      flush();
      local += clamp(target - local, -PADDLE_SPEED * dt, PADDLE_SPEED * dt);

      ctx.save();
      if (seat === 1) { ctx.translate(W, H); ctx.rotate(Math.PI); }

      // Board.
      const bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 420);
      bg.addColorStop(0, '#2b1650');
      bg.addColorStop(0.6, '#150c2e');
      bg.addColorStop(1, '#0a0618');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // Decorative sunburst behind the pins.
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(t * 0.05);
      for (let i = 0; i < 24; i++) {
        ctx.rotate((Math.PI * 2) / 24);
        ctx.fillStyle = i % 2 ? 'rgba(255,200,80,.035)' : 'rgba(255,80,180,.03)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -420); ctx.lineTo(40, -420); ctx.fill();
      }
      ctx.restore();

      // Goal zones: yours glows cyan, theirs pink.
      for (const s of [0, 1]) {
        const y = s === 0 ? H - 14 : 0;
        const g = ctx.createLinearGradient(0, s === 0 ? H : 0, 0, s === 0 ? H - 60 : 60);
        const col = s === seat ? '77,225,255' : '255,92,138';
        g.addColorStop(0, `rgba(${col},.35)`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, s === 0 ? H - 60 : 0, W, 60);
        ctx.fillStyle = `rgba(${col},.9)`;
        ctx.fillRect(0, y, W, 2);
        ctx.fillRect(0, y + 12, W, 2);
      }

      // Brass side rails.
      for (const x of [0, W - 5]) {
        const g = ctx.createLinearGradient(x, 0, x + 5, 0);
        g.addColorStop(0, '#8a6a1c'); g.addColorStop(0.5, '#ffe08a'); g.addColorStop(1, '#8a6a1c');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, 5, H);
      }

      // Launch pocket ("tulip").
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, 46, 26, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,190,60,${0.08 + pulse * 0.08})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,210,100,${0.4 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, '★', W / 2, H / 2 + 1, { size: 18, color: `rgba(255,220,120,${0.5 + pulse * 0.4})` });

      // Pins: brass, lighting up when hit.
      const lit = new Map(state.hits.map(([i, age]) => [i, 1 - age / 0.35]));
      PINS.forEach((p, i) => {
        const l = lit.get(i) || 0;
        if (l > 0) circle(ctx, p.x, p.y, PIN_R + 8 * l, `rgba(255,230,120,${0.45 * l})`);
        circle(ctx, p.x + 1, p.y + 1.5, PIN_R, 'rgba(0,0,0,.5)');
        const g = ctx.createRadialGradient(p.x - 1.5, p.y - 1.5, 0.5, p.x, p.y, PIN_R);
        g.addColorStop(0, l > 0 ? '#ffffff' : '#fff4c2');
        g.addColorStop(1, l > 0 ? '#ffd23a' : '#b8862a');
        circle(ctx, p.x, p.y, PIN_R, g);
      });

      // Paddles: opponent from the server, yours from local prediction.
      drawPaddle(ctx, state.paddles[1 - seat], paddleY(1 - seat), COLORS.them);
      drawPaddle(ctx, toWorldX(seat, local), paddleY(seat), COLORS.you);

      // Steel balls.
      for (const b of state.balls) {
        circle(ctx, b.x + 2, b.y + 3, BALL_R, 'rgba(0,0,0,.45)');
        const g = ctx.createRadialGradient(b.x - 2.5, b.y - 2.5, 0.5, b.x, b.y, BALL_R);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, '#c9ced8');
        g.addColorStop(1, '#5d6370');
        circle(ctx, b.x, b.y, BALL_R, g);
      }
      ctx.restore();

      // HUD (unrotated): scores as LED counters on the left, clock on the right.
      const me = state.score[seat], them = state.score[1 - seat];
      roundRect(ctx, 10, 252, 54, 96, 10, 'rgba(0,0,0,.55)', 'rgba(255,210,100,.4)');
      text(ctx, String(them), 37, 278, { size: 28, weight: 900, color: COLORS.them });
      ctx.fillStyle = 'rgba(255,210,100,.4)';
      ctx.fillRect(18, 299, 38, 2);
      text(ctx, String(me), 37, 323, { size: 28, weight: 900, color: COLORS.you });
      const left = Math.max(0, GAME_SECONDS - state.elapsed);
      roundRect(ctx, W - 64, 284, 54, 32, 10, left < 10 ? '#5a1020' : 'rgba(0,0,0,.55)', 'rgba(255,210,100,.4)');
      text(ctx, String(Math.ceil(left)), W - 37, 300, { size: 17, weight: 800, color: '#ffe08a' });
      text(ctx, names[1 - seat], W / 2, 12, { size: 12, weight: 700, color: 'rgba(255,92,138,.85)' });
      text(ctx, 'first to 7', W / 2, H - 9, { size: 11, weight: 600, color: COLORS.muted });

      if (state.flash) {
        const mine = state.flash.scorer === seat;
        text(ctx, mine ? '+1' : 'Slipped past!', W / 2, mine ? 220 : 380, { size: mine ? 44 : 30, weight: 900, color: mine ? COLORS.good : COLORS.them });
      }
      if (state.elapsed < 3) text(ctx, 'Slide your finger to move', W / 2, H - 70, { size: 14, weight: 700, color: '#fff' });
    },

    pointerDown(p) { setTarget(p.x); },
    pointerMove(p) { setTarget(p.x); },
    keyDown(k) {
      if (k === 'ArrowLeft' || k === 'a') keys.left = true;
      if (k === 'ArrowRight' || k === 'd') keys.right = true;
    },
    keyUp(k) {
      if (k === 'ArrowLeft' || k === 'a') keys.left = false;
      if (k === 'ArrowRight' || k === 'd') keys.right = false;
    },
  };
}
