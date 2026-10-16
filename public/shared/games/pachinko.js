// Pachinko Pong: Pong through a pachinko board. Each player guards their end with a
// paddle while steel balls ricochet off a field of pins. Every ball that slips past your
// opponent's paddle is a point for you. First to 7, or most points when time runs out.
import { clamp, limitSpeed, resolveAgainstPoint } from '../physics.js';

export const W = 400;
export const H = 600;
export const BALL_R = 7;
export const PIN_R = 4.5;
export const PADDLE_W = 76;
export const PADDLE_H = 12;
export const PADDLE_Y = 34; // distance of the paddle line from its end
export const PADDLE_SPEED = 1100; // px/s the paddle can travel toward your finger
export const GAME_SECONDS = 90;
const POINTS_TO_WIN = 7;
const SUBSTEPS = 6;
const SERVE_SPEED = 250;
const MAX_SPEED = 720;
const MIN_VY = 90; // keep balls travelling end to end instead of rattling sideways forever

// Pins in a staggered pachinko grid, symmetric under the 180° seat rotation, with a
// clear launch pocket in the middle.
export const PINS = (() => {
  const pins = [];
  const rows = [150, 196, 242, 358, 404, 450];
  rows.forEach((y, r) => {
    const offset = r % 2 ? 25 : 0;
    for (let x = 37.5 + offset; x <= W - 37.5; x += 50) pins.push({ x, y });
  });
  // A ring of pins around the launch pocket ("tulip").
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pins.push({ x: W / 2 + Math.cos(a) * 62, y: H / 2 + Math.sin(a) * 40 });
  }
  pins.push({ x: 70, y: 300 }, { x: W - 70, y: 300 });
  return pins;
})();

// Paddle centre in world space for a seat (seat 0 at the bottom).
export const paddleY = (seat) => (seat === 0 ? H - PADDLE_Y : PADDLE_Y);
export const toWorldX = (seat, x) => (seat === 0 ? x : W - x);

function targetBalls(elapsed) {
  return Math.min(4, 2 + Math.floor(elapsed / 20));
}

function spawn(state) {
  state._seed = (state._seed * 16807) % 2147483647;
  const r = state._seed / 2147483647;
  const toward = state.nextServe;
  state.nextServe = 1 - toward;
  const ang = (r - 0.5) * 1.2;
  const dir = toward === 0 ? 1 : -1;
  state.balls.push({
    id: state.nextId++,
    x: W / 2, y: H / 2,
    vx: Math.sin(ang) * SERVE_SPEED, vy: Math.cos(ang) * SERVE_SPEED * dir,
    age: 0,
  });
}

export default {
  id: 'pachinko',
  name: 'Pachinko Pong',
  blurb: 'Pong through a pachinko board! Knock steel balls past your opponent’s paddle. First to 7.',
  controls: 'Slide your finger left and right (or ← / →) to move your paddle.',

  create(rng) {
    return {
      config: {},
      state: {
        elapsed: 0,
        score: [0, 0],
        paddles: [W / 2, W / 2], // world-space x of each paddle centre
        targets: [W / 2, W / 2],
        balls: [],
        nextId: 1,
        nextServe: rng() < 0.5 ? 0 : 1,
        spawnIn: 0.4,
        hits: [], // recent pin hits for the light-up effect: [pinIndex, age]
        flash: null,
        over: null,
        _seed: Math.floor(rng() * 2147483646) + 1,
      },
    };
  },

  input(config, state, seat, msg) {
    if (msg.type !== 'paddle') return;
    const x = Number(msg.x);
    if (!Number.isFinite(x)) return;
    state.targets[seat] = clamp(toWorldX(seat, x), PADDLE_W / 2, W - PADDLE_W / 2);
  },

  step(config, state, dt) {
    if (state.over) return;
    state.elapsed += dt;
    for (const h of state.hits) h[1] += dt;
    state.hits = state.hits.filter((h) => h[1] < 0.35);
    if (state.flash) { state.flash.t -= dt; if (state.flash.t <= 0) state.flash = null; }

    // Paddles chase their targets at a capped speed.
    for (const s of [0, 1]) {
      const d = state.targets[s] - state.paddles[s];
      state.paddles[s] += clamp(d, -PADDLE_SPEED * dt, PADDLE_SPEED * dt);
    }

    // Keep the board busy: more balls as the game goes on.
    if (state.balls.length < targetBalls(state.elapsed)) {
      state.spawnIn -= dt;
      if (state.spawnIn <= 0) { spawn(state); state.spawnIn = 1.2; }
    }

    const h = dt / SUBSTEPS;
    for (const b of state.balls) {
      b.age += dt;
      for (let i = 0; i < SUBSTEPS; i++) {
        b.x += b.vx * h;
        b.y += b.vy * h;
        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
        if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }

        PINS.forEach((p, idx) => {
          if (resolveAgainstPoint(b, p.x, p.y, PIN_R + BALL_R, 0.92)) {
            if (!state.hits.some((x) => x[0] === idx)) state.hits.push([idx, 0]);
          }
        });

        // Paddles: Pong-style, where you hit it sets the angle.
        for (const s of [0, 1]) {
          const py = paddleY(s), px = state.paddles[s];
          const towardGoal = s === 0 ? b.vy > 0 : b.vy < 0;
          if (!towardGoal) continue;
          const dy = Math.abs(b.y - py);
          const dx = b.x - px;
          if (dy < PADDLE_H / 2 + BALL_R && Math.abs(dx) < PADDLE_W / 2 + BALL_R) {
            const off = clamp(dx / (PADDLE_W / 2), -1, 1);
            const speed = Math.min(MAX_SPEED, Math.hypot(b.vx, b.vy) * 1.06 + 15);
            const ang = off * 1.05; // up to ~60°
            b.vx = Math.sin(ang) * speed;
            b.vy = Math.cos(ang) * speed * (s === 0 ? -1 : 1);
            b.y = s === 0 ? py - PADDLE_H / 2 - BALL_R : py + PADDLE_H / 2 + BALL_R;
          }
        }
        if (Math.abs(b.vy) < MIN_VY) b.vy = (b.vy < 0 ? -1 : 1) * MIN_VY;
        limitSpeed(b, MAX_SPEED);
      }
    }

    // Balls that slipped past an end score for the other player.
    const kept = [];
    for (const b of state.balls) {
      let scorer = -1;
      if (b.y > H + BALL_R) scorer = 1;
      else if (b.y < -BALL_R) scorer = 0;
      if (scorer < 0) { kept.push(b); continue; }
      state.score[scorer]++;
      state.flash = { scorer, t: 0.8, x: b.x };
    }
    state.balls = kept;

    const [a, b] = state.score;
    if (a >= POINTS_TO_WIN || b >= POINTS_TO_WIN) {
      state.over = { winner: a > b ? 0 : 1, reason: `${a}–${b}` };
    } else if (state.elapsed >= GAME_SECONDS) {
      state.over = { winner: a === b ? null : a > b ? 0 : 1, reason: `${a}–${b} at the buzzer` };
    }
  },
};
