import { BUMPERS, FLIPPER_R, LANE_WALLS, PUCK_R, REST_ANGLE, W, H, flipperSegment, stepFlipperAngle, toWorld } from '../../shared/games/hockey.js';
import { COLORS, circle, line, text } from '../draw.js';

const KEYS = { a: 0, arrowleft: 0, d: 1, arrowright: 1 };

export default function hockeyClient({ seat, names, send }) {
  // Your own flippers are predicted locally so they react instantly to your thumbs.
  const local = [REST_ANGLE, REST_ANGLE];
  const pointers = new Map(); // pointerId -> side
  const keys = [false, false];
  const pressed = [false, false];

  function sync() {
    for (const side of [0, 1]) {
      const down = keys[side] || [...pointers.values()].includes(side);
      if (down !== pressed[side]) {
        pressed[side] = down;
        send({ type: 'flip', side, down });
      }
    }
  }

  function drawFlipper(s, side, angle, color) {
    const [x1, y1, x2, y2] = flipperSegment(s, side, angle);
    // Tapered pinball flipper: fat at the pivot, thinner at the tip.
    line(_ctx, x1, y1, x2, y2, color, FLIPPER_R * 2);
    circle(_ctx, x1, y1, FLIPPER_R + 3, color);
    circle(_ctx, x1, y1, 3, '#fff');
  }
  let _ctx;

  return {
    render(ctx, state, dt) {
      _ctx = ctx;
      for (const side of [0, 1]) local[side] = stepFlipperAngle(local[side], pressed[side], dt);

      ctx.save();
      if (seat === 1) { ctx.translate(W, H); ctx.rotate(Math.PI); }

      // Table.
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a0f24');
      g.addColorStop(0.5, '#141226');
      g.addColorStop(1, '#0c2230');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      line(ctx, 0, H / 2, W, H / 2, 'rgba(255,255,255,.12)', 2);
      circle(ctx, W / 2, H / 2, 46, null, 'rgba(255,255,255,.12)', 2);

      // Goal mouths behind each pair of flippers.
      for (const s of [0, 1]) {
        const a = toWorld(s, 112, 600), b = toWorld(s, 288, 588);
        ctx.fillStyle = s === seat ? 'rgba(77,225,255,.18)' : 'rgba(255,92,138,.18)';
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        for (const [x1, y1, x2, y2] of LANE_WALLS) {
          const p = toWorld(s, x1, y1), q = toWorld(s, x2, y2);
          line(ctx, p.x, p.y, q.x, q.y, s === seat ? COLORS.you : COLORS.them, 5);
          // Fill the dead corner below the lane wall.
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          const c = toWorld(s, x2, 600), d = toWorld(s, x1, 600);
          ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.fill();
        }
      }

      for (const b of BUMPERS) {
        circle(ctx, b.x, b.y, b.r + 4, 'rgba(255,204,51,.15)');
        circle(ctx, b.x, b.y, b.r, '#3a2a00', COLORS.accent, 3);
      }

      // Flippers: opponent from server state, yours from local prediction.
      for (const side of [0, 1]) {
        drawFlipper(1 - seat, side, state.flippers[1 - seat][side], COLORS.them);
        drawFlipper(seat, side, local[side], COLORS.you);
      }

      const p = state.puck;
      circle(ctx, p.x, p.y, PUCK_R + 5, 'rgba(255,255,255,.12)');
      circle(ctx, p.x, p.y, PUCK_R, '#f3f1ff', '#9a96b5', 2);
      ctx.restore();

      // HUD (unrotated).
      const [me, them] = [state.score[seat], state.score[1 - seat]];
      text(ctx, `${names[1 - seat]}  ${them}`, 12, 22, { align: 'left', color: COLORS.them, size: 15 });
      text(ctx, `You  ${me}`, 12, H - 18, { align: 'left', color: COLORS.you, size: 18 });
      text(ctx, 'first to 3', W - 12, H - 18, { align: 'right', color: COLORS.muted, size: 12, weight: 500 });
      if (state.flash) {
        const mine = state.flash.scorer === seat;
        text(ctx, mine ? 'GOAL!' : 'Scored on!', W / 2, H / 2, { size: 48, weight: 900, color: mine ? COLORS.good : COLORS.them });
      }
    },

    pointerDown(p) {
      pointers.set(p.id, p.x < W / 2 ? 0 : 1);
      sync();
    },
    pointerMove(p) {
      if (!pointers.has(p.id)) return;
      pointers.set(p.id, p.x < W / 2 ? 0 : 1);
      sync();
    },
    pointerUp(p) {
      pointers.delete(p.id);
      sync();
    },
    keyDown(k) {
      const side = KEYS[k.toLowerCase()];
      if (side !== undefined) { keys[side] = true; sync(); }
    },
    keyUp(k) {
      const side = KEYS[k.toLowerCase()];
      if (side !== undefined) { keys[side] = false; sync(); }
    },
  };
}
