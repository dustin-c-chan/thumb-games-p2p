// Mini Golf: a randomly generated top-down hole on a little island. Both players putt
// at the same time on the same hole (you see your opponent's ball too). Fewest strokes wins.
// Water hazards cost a stroke and put you back where you putted from.
import { limitSpeed, resolveAgainstPoint, resolveAgainstRect, resolveAgainstSegment } from '../physics.js';

export const W = 400;
export const H = 600;
export const BALL_R = 7;
export const CUP_R = 12;
export const RAIL_T = 4; // half-thickness of the white rails
export const MAX_PUTT = 900;
export const GAME_SECONDS = 90;
export const COURSE = { L: 26, R: 374, T: 82, B: 574, chamfer: 38 };
const MAX_STROKES = 10;
const DECEL = 230; // px/s^2 rolling friction on grass
const SAND_DECEL = 1100;
const SUBSTEPS = 6;

const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function generateHole(rng) {
  const { L, R, T, B, chamfer: c } = COURSE;
  const rails = [];
  const logs = [];
  const bumpers = [];
  const sand = [];
  const water = [];
  const tee = { x: rng.range(120, 280), y: 536 };
  const cup = { x: rng.range(70, 330), y: rng.range(118, 140) };

  // Island outline: rectangle with bevelled bottom corners and maybe a notch of water
  // biting into one side.
  const notch = rng.chance(0.6)
    ? { side: rng.chance(0.5) ? 'left' : 'right', y1: rng.range(235, 275), depth: rng.range(70, 105) }
    : null;
  if (notch) notch.y2 = notch.y1 + rng.range(95, 130);
  const left = [[L, B - c], ...(notch?.side === 'left' ? [[L, notch.y2], [L + notch.depth, notch.y2], [L + notch.depth, notch.y1], [L, notch.y1]] : []), [L, T]];
  const right = [[R, T], ...(notch?.side === 'right' ? [[R, notch.y1], [R - notch.depth, notch.y1], [R - notch.depth, notch.y2], [R, notch.y2]] : []), [R, B - c]];
  const outline = [...left, ...right, [R - c, B], [L + c, B]];

  // Effective walls at height y (the notch narrows the course).
  const wallsAt = (y) => {
    const inNotch = notch && y > notch.y1 - 25 && y < notch.y2 + 25;
    return [inNotch && notch.side === 'left' ? L + notch.depth : L, inNotch && notch.side === 'right' ? R - notch.depth : R];
  };

  // Obstacle rows between tee and cup. Every row leaves a clear gap so the hole is playable.
  for (const y of [208, 332, 452]) {
    const [lw, rw] = wallsAt(y);
    const span = rw - lw;
    const kind = rng.pick(['rail', 'rail', 'gate', 'pool', 'logs', 'bumpers', 'sand']);
    if (kind === 'rail') {
      const w = rng.range(0.45, 0.62) * span;
      if (rng.chance(0.5)) rails.push([lw, y, lw + w, y]);
      else rails.push([rw - w, y, rw, y]);
    } else if (kind === 'gate') {
      const gap = rng.range(80, 110);
      const cx = rng.range(lw + gap / 2 + 40, rw - gap / 2 - 40);
      rails.push([lw, y, cx - gap / 2, y], [cx + gap / 2, y, rw, y]);
    } else if (kind === 'pool') {
      const w = rng.range(0.32, 0.48) * span;
      const atLeft = rng.chance(0.5);
      const x = atLeft ? lw + 8 : rw - 8 - w;
      water.push({ x, y: y - 26, w, h: 52 });
      // Short rails on the pool's open side, like a little dock.
      const edge = atLeft ? x + w : x;
      rails.push([edge, y - 30, edge, y + 30]);
    } else if (kind === 'logs') {
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const lwid = rng.range(46, 64);
        const x = lw + ((i + 0.5) / n) * span - lwid / 2 + rng.range(-30, 30);
        logs.push({ x: Math.max(lw + 6, Math.min(rw - 6 - lwid, x)), y: y - 11, w: lwid, h: 22 });
      }
    } else if (kind === 'bumpers') {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) bumpers.push({ x: lw + ((i + 0.5) / n) * span + rng.range(-18, 18), y: y + rng.range(-18, 18), r: rng.range(12, 16) });
    } else {
      const w = rng.range(110, 190);
      sand.push({ x: rng.range(lw + 6, rw - 6 - w), y: y - 30, w, h: 60 });
    }
  }
  // Sometimes a bunker guarding the cup.
  if (rng.chance(0.5)) {
    const w = rng.range(60, 100);
    const x = cup.x > W / 2 ? rng.range(L + 8, L + 80) : rng.range(R - 80 - w, R - 8 - w);
    sand.push({ x, y: 96, w, h: 44 });
  }
  const hazards = water.length + rails.length / 2 + (notch ? 1 : 0);
  const par = Math.max(2, Math.min(4, 2 + Math.round(hazards / 2)));
  return { tee, cup, outline, rails, logs, bumpers, sand, water, par };
}

function stepBall(cfg, b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const o = cfg.outline;
  for (let i = 0; i < o.length; i++) {
    const [ax, ay] = o[i], [bx, by] = o[(i + 1) % o.length];
    resolveAgainstSegment(b, BALL_R, ax, ay, bx, by, RAIL_T, 0.8);
  }
  for (const [ax, ay, bx, by] of cfg.rails) resolveAgainstSegment(b, BALL_R, ax, ay, bx, by, RAIL_T, 0.8);
  for (const lg of cfg.logs) resolveAgainstRect(b, BALL_R, lg, 0.7);
  for (const bm of cfg.bumpers) {
    if (resolveAgainstPoint(b, bm.x, bm.y, bm.r + BALL_R, 1.0)) {
      // Springy: a little extra kick.
      const n = Math.hypot(b.x - bm.x, b.y - bm.y) || 1;
      b.vx += ((b.x - bm.x) / n) * 60;
      b.vy += ((b.y - bm.y) / n) * 60;
    }
  }

  const decel = cfg.sand.some((s) => inRect(b.x, b.y, s)) ? SAND_DECEL : DECEL;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 0) {
    const ns = Math.max(0, sp - decel * dt);
    b.vx *= ns / sp; b.vy *= ns / sp;
  }

  if (cfg.water.some((w) => inRect(b.x, b.y, w))) return 'splash';

  // Cup: drops in when slow enough, otherwise lips out with a little pull.
  const dx = cfg.cup.x - b.x, dy = cfg.cup.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d < CUP_R) {
    if (Math.hypot(b.vx, b.vy) < 420) return 'sunk';
    b.vx += (dx / (d || 1)) * 40;
    b.vy += (dy / (d || 1)) * 40;
  }
  limitSpeed(b, MAX_PUTT);
  return null;
}

export const isStopped = (b) => Math.hypot(b.vx, b.vy) < 1;

export default {
  id: 'golf',
  name: 'Mini Golf',
  blurb: 'A random hole, played at the same time. Fewest strokes wins! Water costs a stroke.',
  controls: 'Drag back anywhere (slingshot style) and release to putt.',

  create(rng) {
    const config = generateHole(rng);
    const ball = (seat) => {
      const x = config.tee.x + (seat ? 12 : -12), y = config.tee.y;
      return { x, y, vx: 0, vy: 0, lastX: x, lastY: y, strokes: 0, done: false, finishedAt: null, splash: 0 };
    };
    return { config, state: { elapsed: 0, balls: [ball(0), ball(1)], over: null } };
  },

  input(config, state, seat, msg) {
    if (state.over || msg.type !== 'putt') return;
    const b = state.balls[seat];
    if (b.done || !isStopped(b)) return;
    let vx = Number(msg.vx), vy = Number(msg.vy);
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) return;
    const s = Math.hypot(vx, vy);
    if (s < 15) return;
    if (s > MAX_PUTT) { vx *= MAX_PUTT / s; vy *= MAX_PUTT / s; }
    b.lastX = b.x; b.lastY = b.y;
    b.vx = vx; b.vy = vy;
    b.strokes++;
  },

  step(config, state, dt) {
    if (state.over) return;
    state.elapsed += dt;
    const h = dt / SUBSTEPS;
    for (const b of state.balls) {
      b.splash = Math.max(0, b.splash - dt);
      if (b.done) continue;
      for (let i = 0; i < SUBSTEPS; i++) {
        const result = stepBall(config, b, h);
        if (result === 'sunk') {
          b.done = true;
          b.x = config.cup.x; b.y = config.cup.y; b.vx = 0; b.vy = 0;
          b.finishedAt = state.elapsed;
          break;
        }
        if (result === 'splash') {
          b.splash = 1.2;
          b.strokes++;
          b.x = b.lastX; b.y = b.lastY; b.vx = 0; b.vy = 0;
          break;
        }
      }
      if (!b.done && b.strokes >= MAX_STROKES && isStopped(b)) {
        b.done = true;
        b.strokes = MAX_STROKES + 1;
        b.finishedAt = state.elapsed;
      }
    }
    if (state.elapsed >= GAME_SECONDS) {
      for (const b of state.balls) if (!b.done) { b.done = true; b.strokes += 2; b.finishedAt = state.elapsed; }
    }
    if (state.balls.every((b) => b.done)) {
      const [a, b] = state.balls.map((x) => x.strokes);
      state.over = { winner: a === b ? null : a < b ? 0 : 1, reason: `${a} vs ${b} strokes` };
    }
  },
};
