// Pinball Hockey: each player defends a pinball-style drain with two flippers.
// Knock the puck through the gap between your opponent's flippers. First to 3.
//
// Geometry is defined in "seat-local" coordinates (you at the bottom) and mapped to
// world space with a 180° rotation for seat 1, so both players get identical tables.
import { clamp, closestOnSegment, limitSpeed, resolveAgainstPoint, resolveAgainstSegment } from '../physics.js';

export const W = 400;
export const H = 600;
export const PUCK_R = 11;
export const FLIPPER_LEN = 74;
export const FLIPPER_R = 7;
export const REST_ANGLE = 0.48;
export const UP_ANGLE = -0.5;
const UP_SPEED = 20; // rad/s
const DOWN_SPEED = 11;
const GOALS_TO_WIN = 3;
const SUBSTEPS = 8;
const MAX_SPEED = 950;
const MIN_SPEED = 110;

// Seat-local layout (seat 0's perspective, drain at the bottom).
export const PIVOTS = [{ x: 112, y: 546 }, { x: 288, y: 546 }];
export const LANE_WALLS = [
  [0, 468, 112, 546],
  [400, 468, 288, 546],
];
// Bumpers are in world space and symmetric under the 180° seat rotation.
export const BUMPERS = [
  { x: 105, y: 300, r: 22 },
  { x: 295, y: 300, r: 22 },
  { x: 200, y: 185, r: 13 },
  { x: 200, y: 415, r: 13 },
];

export const toWorld = (seat, x, y) => (seat === 0 ? { x, y } : { x: W - x, y: H - y });

// Flipper `side` 0 = left, 1 = right (from the owning player's perspective).
export function flipperSegment(seat, side, angle) {
  const p = PIVOTS[side];
  const dir = side === 0 ? 1 : -1;
  const tip = { x: p.x + dir * Math.cos(angle) * FLIPPER_LEN, y: p.y + Math.sin(angle) * FLIPPER_LEN };
  const a = toWorld(seat, p.x, p.y);
  const b = toWorld(seat, tip.x, tip.y);
  return [a.x, a.y, b.x, b.y];
}

export function stepFlipperAngle(angle, pressed, dt) {
  return pressed
    ? Math.max(UP_ANGLE, angle - UP_SPEED * dt)
    : Math.min(REST_ANGLE, angle + DOWN_SPEED * dt);
}

function serve(state, towardSeat, delay = 0.9) {
  state.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  state.serveIn = delay;
  state.serveToward = towardSeat;
}

export default {
  id: 'hockey',
  name: 'Pinball Hockey',
  blurb: 'Flip the puck past your opponent’s flippers. First to 3 goals wins!',
  controls: 'Hold the left / right side of the screen (or A / D, ← / →) to flip.',

  create(rng) {
    const state = {
      score: [0, 0],
      flippers: [[REST_ANGLE, REST_ANGLE], [REST_ANGLE, REST_ANGLE]],
      pressed: [[false, false], [false, false]],
      puck: null,
      serveIn: 0,
      serveToward: 0,
      flash: null,
      over: null,
      _seed: rng(),
    };
    serve(state, rng() < 0.5 ? 0 : 1, 0.6);
    return { config: {}, state };
  },

  input(config, state, seat, msg) {
    if (msg.type !== 'flip') return;
    const side = msg.side === 1 ? 1 : 0;
    state.pressed[seat][side] = !!msg.down;
  },

  step(config, state, dt) {
    if (state.over) return;
    if (state.flash) {
      state.flash.t -= dt;
      if (state.flash.t <= 0) state.flash = null;
    }

    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      // Flippers move first, remembering their previous segment for surface velocity.
      const segs = [];
      for (let seat = 0; seat < 2; seat++) {
        for (let side = 0; side < 2; side++) {
          const prev = flipperSegment(seat, side, state.flippers[seat][side]);
          state.flippers[seat][side] = stepFlipperAngle(state.flippers[seat][side], state.pressed[seat][side], h);
          segs.push({ prev, cur: flipperSegment(seat, side, state.flippers[seat][side]) });
        }
      }

      const b = state.puck;
      if (state.serveIn > 0) {
        state.serveIn -= h;
        if (state.serveIn <= 0) {
          state._seed = (state._seed * 9301 + 0.49297) % 1;
          const ang = (state._seed - 0.5) * 1.1;
          const dir = state.serveToward === 0 ? 1 : -1;
          b.vx = Math.sin(ang) * 300;
          b.vy = Math.cos(ang) * 300 * dir;
        }
        continue;
      }

      b.x += b.vx * h;
      b.y += b.vy * h;

      // Side walls.
      if (b.x < PUCK_R) { b.x = PUCK_R; b.vx = Math.abs(b.vx) * 0.9; }
      if (b.x > W - PUCK_R) { b.x = W - PUCK_R; b.vx = -Math.abs(b.vx) * 0.9; }

      for (let seat = 0; seat < 2; seat++) {
        for (const [x1, y1, x2, y2] of LANE_WALLS) {
          const a = toWorld(seat, x1, y1), c = toWorld(seat, x2, y2);
          resolveAgainstSegment(b, PUCK_R, a.x, a.y, c.x, c.y, 2, 0.75);
        }
      }
      // Bumpers are already laid out symmetrically, so they live in world space.
      for (const bm of BUMPERS) {
        if (resolveAgainstPoint(b, bm.x, bm.y, bm.r + PUCK_R, 1.0)) {
          // Pinball pop: add a kick away from the bumper.
          const nx = (b.x - bm.x) / (bm.r + PUCK_R), ny = (b.y - bm.y) / (bm.r + PUCK_R);
          b.vx += nx * 140;
          b.vy += ny * 140;
        }
      }

      for (const { prev, cur } of segs) {
        const q = closestOnSegment(b.x, b.y, cur[0], cur[1], cur[2], cur[3]);
        // Velocity of the contact point on the flipper (pivot is fixed, so scale tip motion by t).
        const svx = ((cur[2] - prev[2]) * q.t) / h;
        const svy = ((cur[3] - prev[3]) * q.t) / h;
        resolveAgainstPoint(b, q.x, q.y, PUCK_R + FLIPPER_R, 0.55, svx, svy);
      }

      limitSpeed(b, MAX_SPEED);
    }

    const b = state.puck;
    if (state.serveIn <= 0) {
      // Light table friction, but never let the puck die completely.
      const sp = Math.hypot(b.vx, b.vy);
      const f = Math.max(0, 1 - 0.18 * dt);
      b.vx *= f; b.vy *= f;
      if (sp < MIN_SPEED) {
        const s = sp < 1 ? 0 : MIN_SPEED / sp;
        if (s) { b.vx *= s; b.vy *= s; } else { b.vy = MIN_SPEED; }
      }
    }

    // Goals: puck fell out of a drain.
    let scorer = -1;
    if (b.y > H + PUCK_R) scorer = 1;
    else if (b.y < -PUCK_R) scorer = 0;
    if (scorer >= 0) {
      state.score[scorer]++;
      state.flash = { scorer, t: 1.0 };
      if (state.score[scorer] >= GOALS_TO_WIN) {
        state.over = { winner: scorer, reason: `${state.score[0]}–${state.score[1]}` };
      } else {
        serve(state, 1 - scorer);
      }
    }
    b.x = clamp(b.x, PUCK_R, W - PUCK_R);
  },
};
