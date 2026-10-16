// Mini Golf: a randomly generated hole. Both players putt at the same time on the
// same hole (you see your opponent as a ghost ball). Fewest strokes wins.
import { limitSpeed, resolveAgainstPoint, resolveAgainstRect } from '../physics.js';

export const W = 400;
export const H = 600;
export const BALL_R = 7;
export const CUP_R = 12;
export const MAX_PUTT = 900;
export const GAME_SECONDS = 90;
const MAX_STROKES = 10;
const DECEL = 230; // px/s^2 rolling friction on green
const SAND_DECEL = 1100;
const SUBSTEPS = 6;

const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function generateHole(rng) {
  const walls = [];
  const bumpers = [];
  const sand = [];
  const tee = { x: rng.range(110, 290), y: 540 };
  const cup = { x: rng.range(70, 330), y: rng.range(60, 90) };

  // Obstacle rows between tee and cup. Every row leaves a gap of >= 40% width so
  // the hole is always playable.
  const rows = [190, 320, 445];
  for (const y of rows) {
    const kind = rng.pick(['left', 'right', 'middle', 'bumpers', 'sand', 'gates']);
    const th = 16;
    if (kind === 'left' || kind === 'right') {
      const w = rng.range(0.4, 0.6) * W;
      walls.push({ x: kind === 'left' ? 0 : W - w, y, w, h: th });
    } else if (kind === 'middle') {
      const w = rng.range(0.25, 0.45) * W;
      walls.push({ x: rng.range(70, W - 70 - w), y, w, h: th });
    } else if (kind === 'gates') {
      const gap = rng.range(70, 110);
      const cx = rng.range(110, 290);
      walls.push({ x: 0, y, w: cx - gap / 2, h: th });
      walls.push({ x: cx + gap / 2, y, w: W - (cx + gap / 2), h: th });
    } else if (kind === 'bumpers') {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) bumpers.push({ x: ((i + 0.5) / n) * W + rng.range(-25, 25), y: y + rng.range(-20, 20), r: rng.range(14, 22) });
    } else {
      const w = rng.range(120, 220);
      sand.push({ x: rng.range(0, W - w), y: y - 30, w, h: 70 });
    }
  }
  // Sometimes a little side bunker near the cup.
  if (rng.chance(0.5)) {
    const w = rng.range(60, 110);
    const x = cup.x > W / 2 ? rng.range(10, 120) : rng.range(W - 120 - w, W - 10 - w);
    sand.push({ x, y: 100, w, h: 50 });
  }
  const par = 2 + rows.length - 1 - (walls.length === 0 ? 1 : 0);
  return { tee, cup, walls, bumpers, sand, par: Math.max(2, Math.min(4, par)) };
}

function stepBall(cfg, b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // Course boundary.
  if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.8; }
  if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.8; }
  if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.8; }
  if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy) * 0.8; }
  for (const w of cfg.walls) resolveAgainstRect(b, BALL_R, w, 0.8);
  for (const bm of cfg.bumpers) resolveAgainstPoint(b, bm.x, bm.y, bm.r + BALL_R, 0.9);

  const decel = cfg.sand.some((s) => inRect(b.x, b.y, s)) ? SAND_DECEL : DECEL;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 0) {
    const ns = Math.max(0, sp - decel * dt);
    b.vx *= ns / sp; b.vy *= ns / sp;
  }

  // Cup: drops in when slow enough, otherwise lips out with a little pull.
  const dx = cfg.cup.x - b.x, dy = cfg.cup.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d < CUP_R) {
    if (Math.hypot(b.vx, b.vy) < 420) return true;
    b.vx += (dx / (d || 1)) * 40;
    b.vy += (dy / (d || 1)) * 40;
  }
  limitSpeed(b, MAX_PUTT);
  return false;
}

export const isStopped = (b) => Math.hypot(b.vx, b.vy) < 1;

export default {
  id: 'golf',
  name: 'Mini Golf',
  blurb: 'A random hole, played at the same time. Fewest strokes wins!',
  controls: 'Drag back anywhere (slingshot style) and release to putt.',

  create(rng) {
    const config = generateHole(rng);
    const ball = (seat) => ({ x: config.tee.x + (seat ? 10 : -10), y: config.tee.y, vx: 0, vy: 0, strokes: 0, done: false, finishedAt: null });
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
    b.vx = vx; b.vy = vy;
    b.strokes++;
  },

  step(config, state, dt) {
    if (state.over) return;
    state.elapsed += dt;
    const h = dt / SUBSTEPS;
    for (const b of state.balls) {
      if (b.done) continue;
      for (let i = 0; i < SUBSTEPS; i++) {
        if (stepBall(config, b, h)) {
          b.done = true;
          b.x = config.cup.x; b.y = config.cup.y; b.vx = 0; b.vy = 0;
          b.finishedAt = state.elapsed;
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
