import { BALL_R, BOARD_X, GAME_SECONDS, LANE_H, LANE_W, RIM_BACK_X, RIM_FRONT_X, START } from '../../shared/games/hoops.js';
import { COLORS, circle, line, roundRect, text } from '../draw.js';

const FLICK_GAIN = 3.6; // swipe distance (view px) -> launch speed

// The view stacks two lanes: opponent on top (0..300), you on the bottom (300..600).
export default function hoopsClient({ seat, names, send }) {
  let drag = null;

  function drawLane(ctx, lane, hy, oy, mine, label) {
    ctx.save();
    ctx.translate(0, oy);
    // Court.
    const g = ctx.createLinearGradient(0, 0, 0, LANE_H);
    g.addColorStop(0, mine ? '#1b2440' : '#2a1830');
    g.addColorStop(1, mine ? '#0e1426' : '#180d1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LANE_W, LANE_H);
    ctx.fillStyle = '#6b3f1d';
    ctx.fillRect(0, LANE_H - 6, LANE_W, 6);

    // Backboard, pole, rim, net.
    line(ctx, BOARD_X + 10, hy + 14, BOARD_X + 10, LANE_H - 6, '#555', 6, 'butt');
    roundRect(ctx, BOARD_X - 3, hy - 82, 12, 100, 3, '#eef', '#99a');
    roundRect(ctx, BOARD_X - 1, hy - 40, 6, 30, 1, null, COLORS.them);
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      ctx.moveTo(RIM_FRONT_X + t * (RIM_BACK_X - RIM_FRONT_X), hy);
      ctx.lineTo(RIM_FRONT_X + 10 + t * (RIM_BACK_X - RIM_FRONT_X - 20), hy + 34);
    }
    ctx.strokeStyle = lane.swish > 0 ? COLORS.good : 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    line(ctx, RIM_FRONT_X, hy, RIM_BACK_X, hy, '#ff6a00', 5);

    // Ball rack at the shooter's spot.
    const ready = lane.cool <= 0 && lane.balls.length < 4;
    if (ready) drawBall(ctx, START.x, START.y, 0, mine ? 1 : 0.6);

    for (const b of lane.balls) drawBall(ctx, b.x, b.y, b.x * 0.05, 1);

    text(ctx, label, 12, 18, { align: 'left', size: 14, color: mine ? COLORS.you : COLORS.them });
    text(ctx, String(lane.score), 200, 40, { size: 40, weight: 900, color: mine ? COLORS.you : COLORS.them });
    if (lane.swish > 0) text(ctx, 'SWISH!', 200, 80, { size: 22, weight: 900, color: COLORS.good });
    ctx.restore();
  }

  function drawBall(ctx, x, y, rot, alpha) {
    ctx.globalAlpha = alpha;
    circle(ctx, x, y, BALL_R, '#f28c28', '#5a2a00', 1.5);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    line(ctx, -BALL_R, 0, BALL_R, 0, '#5a2a00', 1.2);
    line(ctx, 0, -BALL_R, 0, BALL_R, '#5a2a00', 1.2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  return {
    render(ctx, state) {
      drawLane(ctx, state.lanes[1 - seat], state.hoopY, 0, false, names[1 - seat]);
      drawLane(ctx, state.lanes[seat], state.hoopY, LANE_H, true, 'You');
      line(ctx, 0, LANE_H, LANE_W, LANE_H, '#000', 4);

      const left = Math.max(0, GAME_SECONDS - state.elapsed);
      roundRect(ctx, 160, LANE_H - 16, 80, 32, 16, left < 10 ? COLORS.them : COLORS.panel);
      text(ctx, left.toFixed(left < 10 ? 1 : 0) + 's', 200, LANE_H, { size: 17 });
      if (state.elapsed > 18 && state.elapsed < 21) text(ctx, 'Hoops are moving!', 200, LANE_H + 60, { size: 18, color: COLORS.accent });

      if (drag) {
        // Aim hint: arrow from the ball in the flick direction.
        const dx = (drag.x - drag.sx) * 0.5, dy = (drag.y - drag.sy) * 0.5;
        line(ctx, START.x, START.y + LANE_H, START.x + dx, START.y + LANE_H + dy, 'rgba(255,204,51,.8)', 3);
      } else if (state.elapsed < 4) {
        text(ctx, 'Flick up toward the hoop!', 200, LANE_H + 270, { size: 15, color: COLORS.muted });
      }
    },

    pointerDown(p) {
      if (p.y < LANE_H) return;
      drag = { id: p.id, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now() };
    },
    pointerMove(p) {
      if (drag && drag.id === p.id) { drag.x = p.x; drag.y = p.y; }
    },
    pointerUp(p) {
      if (!drag || drag.id !== p.id) return;
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      drag = null;
      if (Math.hypot(dx, dy) < 15) return;
      send({ type: 'shoot', vx: dx * FLICK_GAIN, vy: dy * FLICK_GAIN });
    },
    keyDown(k) {
      // Keyboard fallback: space shoots a decent arc.
      if (k === ' ') send({ type: 'shoot', vx: 520 + Math.random() * 60, vy: -760 - Math.random() * 60 });
    },
  };
}
