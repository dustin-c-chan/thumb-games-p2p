// Hot Shot Hoops: two tabletop arcade basketball machines side by side (think the 1990
// Milton Bradley "Hot Shot"). Each machine has a spring launcher, 3 balls that roll back
// down the tilted court, and a hoop in a net cage. Most baskets in 45 seconds wins.
//
// Physics runs in 3D lane space (centimetres, toy scale):
//   x: left/right across the lane (0 = centre), y: height above court, z: distance from launcher.

export const LANE = {
  halfW: 15,
  hoopZ: 100,
  rimY: 45,
  rimR: 9,
  boardZ: 111,
  boardHalfW: 14,
  boardY0: 37,
  boardY1: 68,
  cageTop: 95,
  cageStartZ: 62,
  backZ: 116,
  frontZ: -3,
};
export const BALL_R = 4.2;
export const LAUNCH = { x: 0, y: 7, z: 4, angle: 1.01 };
export const RACK_SIZE = 3;
export const GAME_SECONDS = 45;
export const CHARGE_SECONDS = 1.1; // client meter: time for 0 -> 1
const G = 600;
const SLOPE = 280; // court tilt rolls balls back to the launcher
const SUBSTEPS = 5;
const COOLDOWN = 0.25;
const RIM_POINTS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  return { x: Math.cos(a) * LANE.rimR, z: LANE.hoopZ + Math.sin(a) * LANE.rimR };
});

export const launchSpeed = (power) => 150 + Math.max(0, Math.min(1, power)) * 200;

// Meter shape shared with the client: ramps 0 -> 1 -> 0 while you hold.
export const chargeAt = (heldSeconds) => {
  const t = heldSeconds / CHARGE_SECONDS;
  const m = t % 2;
  return m < 1 ? m : 2 - m;
};

function bounce3(b, px, py, pz, rad, e) {
  let nx = b.x - px, ny = b.y - py, nz = b.z - pz;
  const d = Math.hypot(nx, ny, nz);
  if (d >= rad || d < 1e-6) return false;
  nx /= d; ny /= d; nz /= d;
  b.x = px + nx * rad; b.y = py + ny * rad; b.z = pz + nz * rad;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    b.vz -= (1 + e) * vn * nz;
  }
  return true;
}

export function stepBall(b, dt, lane) {
  const L = LANE, r = BALL_R;
  const prevY = b.y;
  b.vy -= G * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.age += dt;

  // Court floor (tilted toward the launcher).
  const onFloor = b.y <= r + 0.3;
  if (b.y < r) {
    b.y = r;
    if (b.vy < 0) b.vy = -b.vy * 0.38;
    if (b.vy < 25) b.vy = 0;
    b.vx *= 0.97;
  }
  if (onFloor) {
    b.vz -= SLOPE * dt;
    b.vz *= 1 - 0.6 * dt;
  }

  // Lane walls and cage.
  if (b.x < -L.halfW + r) { b.x = -L.halfW + r; b.vx = Math.abs(b.vx) * 0.6; }
  if (b.x > L.halfW - r) { b.x = L.halfW - r; b.vx = -Math.abs(b.vx) * 0.6; }
  if (b.z > L.backZ - r) { b.z = L.backZ - r; b.vz = -Math.abs(b.vz) * 0.8; }
  if (b.z < L.frontZ + r) { b.z = L.frontZ + r; b.vz = Math.abs(b.vz) * 0.2; }
  if (b.y > L.cageTop - r) { b.y = L.cageTop - r; b.vy = -Math.abs(b.vy) * 0.5; }

  // Backboard.
  if (b.z + r > L.boardZ && b.z < L.boardZ + 3 && Math.abs(b.x) < L.boardHalfW && b.y > L.boardY0 && b.y < L.boardY1) {
    b.z = L.boardZ - r;
    b.vz = -Math.abs(b.vz) * 0.85;
  }

  // Rim: a ring of points the ball can clang off.
  if (Math.abs(b.y - L.rimY) < r + 1 && Math.abs(b.z - L.hoopZ) < L.rimR + r + 1) {
    for (const p of RIM_POINTS) bounce3(b, p.x, L.rimY, p.z, r + 0.7, 0.62);
  }

  // Basket: drops down through the ring.
  if (!b.scored && prevY >= L.rimY && b.y < L.rimY && b.vy < 0 && Math.hypot(b.x, b.z - L.hoopZ) < L.rimR - r * 0.45) {
    b.scored = true;
    lane.score++;
    lane.swish = 0.7;
    // The net soaks up the speed.
    b.vx *= 0.25; b.vz *= 0.25; b.vy *= 0.5;
  }
}

function shoot(lane, power, spread) {
  const v = launchSpeed(power);
  lane.balls.push({
    id: lane.nextId++,
    x: LAUNCH.x, y: LAUNCH.y, z: LAUNCH.z,
    vx: spread, vy: Math.sin(LAUNCH.angle) * v, vz: Math.cos(LAUNCH.angle) * v,
    age: 0, scored: false,
  });
  lane.rack--;
  lane.cool = COOLDOWN;
  lane.lastPower = power;
}

export default {
  id: 'hoops',
  name: 'Hot Shot Hoops',
  blurb: 'Side-by-side tabletop basketball machines. 3 balls each, most baskets in 45 seconds wins!',
  controls: 'Hold to charge the launcher, release to shoot. Timing is everything.',

  create() {
    const lane = () => ({ score: 0, balls: [], rack: RACK_SIZE, cool: 0, nextId: 1, swish: 0, lastPower: null });
    return { config: {}, state: { elapsed: 0, lanes: [lane(), lane()], over: null } };
  },

  input(config, state, seat, msg) {
    if (state.over || msg.type !== 'shoot') return;
    const lane = state.lanes[seat];
    const power = Number(msg.power);
    if (!Number.isFinite(power) || power < 0 || power > 1) return;
    if (lane.rack <= 0 || lane.cool > 0) return;
    shoot(lane, power, (Math.random() - 0.5) * 6);
  },

  step(config, state, dt) {
    if (state.over) return;
    state.elapsed += dt;
    const h = dt / SUBSTEPS;
    for (const lane of state.lanes) {
      lane.cool = Math.max(0, lane.cool - dt);
      lane.swish = Math.max(0, lane.swish - dt);
      for (const b of lane.balls) for (let i = 0; i < SUBSTEPS; i++) stepBall(b, h, lane);
      // Balls that rolled back to the launcher return to the rack.
      const back = lane.balls.filter((b) => (b.z < 12 && b.y <= BALL_R + 0.5 && b.vz <= 0 && b.age > 0.3) || b.age > 7);
      if (back.length) {
        lane.balls = lane.balls.filter((b) => !back.includes(b));
        lane.rack = Math.min(RACK_SIZE, lane.rack + back.length);
      }
    }
    if (state.elapsed >= GAME_SECONDS) {
      const [a, b] = state.lanes.map((l) => l.score);
      state.over = { winner: a === b ? null : a > b ? 0 : 1, reason: `${a}–${b}` };
    }
  },
};
