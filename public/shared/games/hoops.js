// Arcade Hoops: two side-by-side lanes, like carnival basketball machines.
// Flick balls at your hoop; most baskets in 45 seconds wins. The hoop starts moving late.
import { limitSpeed, resolveAgainstPoint, resolveAgainstSegment } from '../physics.js';

export const LANE_W = 400;
export const LANE_H = 300;
export const BALL_R = 13;
export const START = { x: 70, y: 236 };
export const RIM_FRONT_X = 296;
export const RIM_BACK_X = 350;
export const BOARD_X = 356;
export const GAME_SECONDS = 45;
const G = 1250;
const MAX_LAUNCH = 1150;
const MAX_BALLS = 4;
const COOLDOWN = 0.32;
const SUBSTEPS = 4;
const MOVE_AFTER = 20; // seconds elapsed before the hoop starts moving

export function hoopY(elapsed) {
  const base = 118;
  if (elapsed < MOVE_AFTER) return base;
  const t = elapsed - MOVE_AFTER;
  const amp = Math.min(55, t * 6);
  return base + Math.sin(t * 1.6) * amp;
}

function stepBall(ball, hy, dt, lane) {
  const prevY = ball.y;
  ball.vy += G * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.age += dt;

  // Lane bounds.
  if (ball.y > LANE_H - BALL_R) {
    ball.y = LANE_H - BALL_R;
    ball.vy = -Math.abs(ball.vy) * 0.55;
    ball.vx *= 0.85;
  }
  if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) * 0.6; }
  if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.6; }
  if (ball.x > LANE_W - BALL_R) { ball.x = LANE_W - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.6; }

  // Backboard and rim.
  resolveAgainstSegment(ball, BALL_R, BOARD_X, hy - 80, BOARD_X, hy + 14, 3, 0.6);
  resolveAgainstPoint(ball, RIM_FRONT_X, hy, BALL_R + 3, 0.55);
  resolveAgainstPoint(ball, RIM_BACK_X, hy, BALL_R + 3, 0.55);
  limitSpeed(ball, 1600);

  // Basket: center passes down through the rim plane between the rim edges.
  if (!ball.scored && prevY < hy && ball.y >= hy && ball.vy > 0 && ball.x > RIM_FRONT_X + 3 && ball.x < RIM_BACK_X - 3) {
    ball.scored = true;
    lane.score++;
    lane.swish = 0.6;
  }
}

export default {
  id: 'hoops',
  name: 'Arcade Hoops',
  blurb: 'Race side by side! Flick balls into your hoop — most baskets in 45 seconds wins.',
  controls: 'Swipe / flick from the ball toward the hoop. Faster flick = harder throw.',

  create() {
    const lane = () => ({ score: 0, balls: [], cool: 0, nextId: 1, swish: 0 });
    return {
      config: {},
      state: { elapsed: 0, hoopY: hoopY(0), lanes: [lane(), lane()], over: null },
    };
  },

  input(config, state, seat, msg) {
    if (state.over || msg.type !== 'shoot') return;
    const lane = state.lanes[seat];
    if (lane.cool > 0 || lane.balls.length >= MAX_BALLS) return;
    let vx = Number(msg.vx), vy = Number(msg.vy);
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) return;
    const s = Math.hypot(vx, vy);
    if (s < 80) return;
    if (s > MAX_LAUNCH) { vx *= MAX_LAUNCH / s; vy *= MAX_LAUNCH / s; }
    lane.balls.push({ id: lane.nextId++, x: START.x, y: START.y, vx, vy, age: 0, scored: false });
    lane.cool = COOLDOWN;
  },

  step(config, state, dt) {
    if (state.over) return;
    state.elapsed += dt;
    state.hoopY = hoopY(state.elapsed);
    const h = dt / SUBSTEPS;
    for (const lane of state.lanes) {
      lane.cool = Math.max(0, lane.cool - dt);
      lane.swish = Math.max(0, lane.swish - dt);
      for (const ball of lane.balls) for (let i = 0; i < SUBSTEPS; i++) stepBall(ball, state.hoopY, h, lane);
      lane.balls = lane.balls.filter((b) => b.age < 3.2);
    }
    if (state.elapsed >= GAME_SECONDS) {
      const [a, b] = state.lanes.map((l) => l.score);
      state.over = { winner: a === b ? null : a > b ? 0 : 1, reason: `${a}–${b}` };
    }
  },
};

