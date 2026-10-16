import { BALL_R, CUP_R, GAME_SECONDS, MAX_PUTT, RAIL_T, W, H, isStopped } from '../../shared/games/golf.js';
import { circle, roundRect, text, fmtTime } from '../draw.js';

const PULL_GAIN = 5; // drag distance -> putt speed
const CHECK = 22;
const GRASS = ['#63c94f', '#58bb45'];
const TEE_GRASS = ['#4fa83e', '#479c37'];
const BALL_COLORS = ['#ffffff', '#ffd23a']; // [you, opponent]

function tracePoly(ctx, pts, dx = 0, dy = 0) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
  ctx.closePath();
}

function rail(ctx, x1, y1, x2, y2) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,40,20,.28)';
  ctx.lineWidth = RAIL_T * 2 + 1;
  ctx.beginPath(); ctx.moveTo(x1 + 3, y1 + 4); ctx.lineTo(x2 + 3, y2 + 4); ctx.stroke();
  ctx.strokeStyle = '#f4f7f6';
  ctx.lineWidth = RAIL_T * 2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x1, y1 - 1.5); ctx.lineTo(x2, y2 - 1.5); ctx.stroke();
}

function checker(ctx, x0, y0, x1, y1, colors) {
  for (let y = Math.floor(y0 / CHECK) * CHECK; y < y1; y += CHECK) {
    for (let x = Math.floor(x0 / CHECK) * CHECK; x < x1; x += CHECK) {
      ctx.fillStyle = colors[((x + y) / CHECK) & 1];
      ctx.fillRect(x, y, CHECK, CHECK);
    }
  }
}

function drawBadge(ctx, x, align, name, strokes, done, color, active) {
  const dir = align === 'left' ? 1 : -1;
  circle(ctx, x, 34, 21, 'rgba(0,0,0,.25)');
  circle(ctx, x, 32, 20, active ? '#ffe36b' : '#cfd8e3');
  circle(ctx, x, 32, 16, color);
  text(ctx, name[0].toUpperCase(), x, 33, { size: 17, weight: 900, color: '#173052' });
  text(ctx, name.length > 13 ? name.slice(0, 12) + '…' : name, x + dir * 28, 22, { size: 14, weight: 800, align, color: '#fff' });
  text(ctx, `${strokes}${done ? ' ✓' : ''}`, x + dir * 28, 42, { size: 18, weight: 900, align, color: '#fff' });
  text(ctx, 'SHOTS', x + dir * (28 + (String(strokes).length + (done ? 2 : 0)) * 11 + 4), 44, { size: 9, weight: 800, align, color: 'rgba(255,255,255,.75)' });
}

export default function golfClient({ seat, config, names, send }) {
  let aim = null;
  let lastState = null;
  const trails = [[], []];
  let t = 0;

  // Water sparkles at fixed spots (seeded from the hole so both players see the same sea).
  const sparkles = Array.from({ length: 40 }, (_, i) => ({ x: (i * 97 + config.tee.x * 3) % W, y: (i * 61 + config.cup.y * 7) % H, p: i }));

  return {
    render(ctx, state, dt) {
      lastState = state;
      t += dt;

      // Sea.
      const sea = ctx.createLinearGradient(0, 0, 0, H);
      sea.addColorStop(0, '#2f86d6');
      sea.addColorStop(1, '#2370c2');
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (const s of sparkles) {
        const a = 0.5 + 0.5 * Math.sin(t * 1.5 + s.p);
        ctx.globalAlpha = a * 0.6;
        ctx.fillRect(s.x, s.y, 3, 1.5);
      }
      ctx.globalAlpha = 1;

      // Island: drop shadow, earthy side, then grass top.
      tracePoly(ctx, config.outline, 10, 14);
      ctx.fillStyle = 'rgba(10,40,90,.35)';
      ctx.fill();
      tracePoly(ctx, config.outline, 0, 9);
      ctx.fillStyle = '#7a5532';
      ctx.fill();
      ctx.save();
      tracePoly(ctx, config.outline);
      ctx.clip();
      checker(ctx, 0, 0, W, H, GRASS);
      // Tee box.
      checker(ctx, config.tee.x - 66, config.tee.y - 28, config.tee.x + 66, config.tee.y + 30, TEE_GRASS);
      ctx.restore();

      // Sand bunkers.
      for (const s of config.sand) {
        roundRect(ctx, s.x, s.y + 3, s.w, s.h, 14, '#d9b04f');
        roundRect(ctx, s.x, s.y, s.w, s.h - 2, 14, '#f3d47c');
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        for (let i = 0; i < 6; i++) ctx.fillRect(s.x + 12 + ((i * 37) % (s.w - 24)), s.y + 10 + ((i * 23) % (s.h - 22)), 4, 2);
      }

      // Water hazards with a dirt bank along the top edge.
      for (const w of config.water) {
        ctx.fillStyle = '#7a5532';
        ctx.fillRect(w.x, w.y - 2, w.w, w.h + 2);
        ctx.fillStyle = '#3a95e6';
        ctx.fillRect(w.x, w.y + 7, w.w, w.h - 7);
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        for (let i = 0; i < 3; i++) ctx.fillRect(w.x + 10 + i * (w.w / 3), w.y + 18 + (i % 2) * 14 + Math.sin(t * 2 + i) * 2, 12, 2);
        ctx.fillStyle = '#c9b48a';
        circle(ctx, w.x + w.w * 0.7, w.y + w.h * 0.6, 5, '#d8c79f');
      }

      // Cup + flag.
      circle(ctx, config.cup.x, config.cup.y + 1, CUP_R + 2, 'rgba(0,0,0,.18)');
      circle(ctx, config.cup.x, config.cup.y, CUP_R, '#1b1b1b');
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.moveTo(config.cup.x + 2, config.cup.y);
      ctx.lineTo(config.cup.x + 22, config.cup.y + 6);
      ctx.lineTo(config.cup.x + 2, config.cup.y + 4);
      ctx.fill();
      ctx.strokeStyle = '#f1f1f1';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(config.cup.x, config.cup.y); ctx.lineTo(config.cup.x, config.cup.y - 46); ctx.stroke();
      ctx.fillStyle = '#e8322b';
      ctx.beginPath();
      const wave = Math.sin(t * 4) * 2;
      ctx.moveTo(config.cup.x, config.cup.y - 46);
      ctx.quadraticCurveTo(config.cup.x + 12, config.cup.y - 42 + wave, config.cup.x + 26, config.cup.y - 38);
      ctx.lineTo(config.cup.x, config.cup.y - 30);
      ctx.fill();

      // Logs.
      for (const lg of config.logs) {
        roundRect(ctx, lg.x + 2, lg.y + 5, lg.w, lg.h, lg.h / 2, 'rgba(0,30,0,.3)');
        roundRect(ctx, lg.x, lg.y, lg.w, lg.h, lg.h / 2, '#8a5a2b');
        ctx.strokeStyle = 'rgba(60,30,10,.6)';
        ctx.lineWidth = 1.5;
        for (const fy of [0.35, 0.65]) { ctx.beginPath(); ctx.moveTo(lg.x + 10, lg.y + lg.h * fy); ctx.lineTo(lg.x + lg.w - 10, lg.y + lg.h * fy); ctx.stroke(); }
        circle(ctx, lg.x + lg.w - lg.h / 2, lg.y + lg.h / 2, lg.h / 2 - 1, '#d9a866', '#8a5a2b', 2);
        circle(ctx, lg.x + lg.w - lg.h / 2, lg.y + lg.h / 2, lg.h / 5, null, '#a8763e', 1.5);
      }

      // Spring bumpers.
      for (const b of config.bumpers) {
        circle(ctx, b.x + 2, b.y + 5, b.r, 'rgba(0,30,0,.3)');
        circle(ctx, b.x, b.y + 3, b.r, '#b8701a');
        circle(ctx, b.x, b.y, b.r, '#f6a623');
        ctx.strokeStyle = '#c4781c';
        ctx.lineWidth = 2;
        for (const k of [0.45, 0.75]) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r * k, 0, Math.PI * 2); ctx.stroke(); }
        circle(ctx, b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.2, 'rgba(255,255,255,.6)');
      }

      // White rails: island border and interior walls.
      const o = config.outline;
      for (let i = 0; i < o.length; i++) rail(ctx, o[i][0], o[i][1], o[(i + 1) % o.length][0], o[(i + 1) % o.length][1]);
      for (const [x1, y1, x2, y2] of config.rails) rail(ctx, x1, y1, x2, y2);

      // Ball trails.
      state.balls.forEach((b, i) => {
        const tr = trails[i];
        if (!isStopped(b) && !b.done) tr.push([b.x, b.y]);
        else if (tr.length) tr.shift();
        if (tr.length > 16) tr.shift();
        if (b.splash > 1.1) tr.length = 0;
        for (let k = 1; k < tr.length; k++) {
          ctx.strokeStyle = i === seat ? `rgba(230,255,170,${k / tr.length * 0.8})` : `rgba(255,240,140,${k / tr.length * 0.7})`;
          ctx.lineWidth = (k / tr.length) * BALL_R * 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tr[k - 1][0], tr[k - 1][1]); ctx.lineTo(tr[k][0], tr[k][1]); ctx.stroke();
        }
      });

      const me = state.balls[seat], them = state.balls[1 - seat];
      const drawGolfBall = (b, color) => {
        circle(ctx, b.x + 2, b.y + 3, BALL_R, 'rgba(0,30,0,.35)');
        circle(ctx, b.x, b.y, BALL_R, color, 'rgba(0,0,0,.25)', 1);
        circle(ctx, b.x - 2, b.y - 2, 2, 'rgba(255,255,255,.8)');
      };
      if (!them.done) drawGolfBall(them, BALL_COLORS[1]);

      if (aim && !me.done) {
        const [vx, vy] = shotFrom(aim);
        const power = Math.hypot(vx, vy) / MAX_PUTT;
        const col = power > 0.8 ? '#ff4d4d' : power > 0.45 ? '#ffd23a' : '#ffffff';
        ctx.setLineDash([2, 7]);
        ctx.lineCap = 'round';
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(me.x + vx * 0.2, me.y + vy * 0.2); ctx.stroke();
        ctx.setLineDash([]);
        circle(ctx, me.x, me.y, 16 + power * 18, null, 'rgba(255,255,255,.5)', 2);
      }
      if (!me.done) {
        if (isStopped(me) && !aim) circle(ctx, me.x, me.y, BALL_R + 6 + Math.sin(t * 5) * 1.5, null, 'rgba(255,255,255,.7)', 2);
        drawGolfBall(me, BALL_COLORS[0]);
      }
      for (const b of state.balls) {
        if (b.splash > 0) text(ctx, 'Splash! +1', b.x, b.y - 22 - (1.2 - b.splash) * 20, { size: 15, weight: 900, color: '#fff' });
      }

      // HUD over the sea, like the scoreboard in the reference.
      drawBadge(ctx, 30, 'left', 'You', me.strokes, me.done, '#bfe8ff', !me.done);
      drawBadge(ctx, W - 30, 'right', names[1 - seat], them.strokes, them.done, BALL_COLORS[1], !them.done);
      roundRect(ctx, W / 2 - 34, 10, 68, 50, 10, 'rgba(10,40,90,.35)');
      text(ctx, `PAR ${config.par}`, W / 2, 26, { size: 15, weight: 900, color: '#fff' });
      text(ctx, fmtTime(GAME_SECONDS - state.elapsed), W / 2, 46, { size: 13, weight: 700, color: 'rgba(255,255,255,.85)' });

      if (me.done && !them.done) {
        roundRect(ctx, W / 2 - 140, H / 2 - 22, 280, 44, 22, 'rgba(10,40,90,.75)');
        text(ctx, 'In the hole! Waiting for opponent…', W / 2, H / 2, { size: 16, weight: 800, color: '#fff' });
      } else if (me.strokes === 0 && !aim) {
        text(ctx, 'Drag back anywhere, then let go', W / 2, H - 10, { size: 13, weight: 800, color: '#fff' });
      }
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

