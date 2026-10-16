import { BALL_R, GAME_SECONDS, LANE, chargeAt } from '../../shared/games/hoops.js';
import { COLORS, circle, roundRect, text } from '../draw.js';

// Perspective camera behind the launcher, looking down the lane.
const Z_CAM = 80, CAM_H = 110, F = 360, HORIZON = 25;
const LANE_X = [102, 298]; // you on the left, opponent on the right

const proj = (cx, x, y, z) => {
  const s = F / (z + Z_CAM);
  return [cx + x * s, HORIZON + (CAM_H - y) * s, s];
};

function poly(ctx, cx, pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => {
    const [sx, sy] = proj(cx, x, y, z);
    if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
  });
  if (fill) { ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

const seg = (ctx, cx, a, b, color, lw) => poly(ctx, cx, [a, b], null, color, lw);

function arcPts(cxz, r, a0, a1, y = 0, n = 20) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [Math.cos(a) * r, y, cxz + Math.sin(a) * r];
  });
}

function drawBall(ctx, cx, b, alpha = 1) {
  const [sx, sy, s] = proj(cx, b.x, b.y, b.z);
  ctx.globalAlpha = alpha;
  const r = BALL_R * s;
  const g = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.1, sx, sy, r);
  g.addColorStop(0, '#ffb066');
  g.addColorStop(1, '#c4520f');
  circle(ctx, sx, sy, r, g);
  ctx.strokeStyle = 'rgba(60,20,0,.7)';
  ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy);
  ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawShadow(ctx, cx, b) {
  const [sx, sy, s] = proj(cx, b.x, 0, b.z);
  const k = Math.max(0.3, 1 - b.y / 90);
  ctx.beginPath();
  ctx.ellipse(sx, sy, BALL_R * s * k, BALL_R * s * k * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`;
  ctx.fill();
}

function drawMachine(ctx, cx, lane, mine, charge) {
  const L = LANE, W = L.halfW;

  // --- Court (tilted wood with painted lines) -------------------------------------
  poly(ctx, cx, [[-W - 2, 0, -2], [W + 2, 0, -2], [W + 2, 0, L.backZ], [-W - 2, 0, L.backZ]], '#c8401f');
  const [, yNear] = proj(cx, 0, 0, 0), [, yFar] = proj(cx, 0, 0, L.backZ);
  const wood = ctx.createLinearGradient(0, yFar, 0, yNear);
  wood.addColorStop(0, '#b9783e');
  wood.addColorStop(1, '#e2a764');
  poly(ctx, cx, [[-W, 0, 0], [W, 0, 0], [W, 0, L.backZ], [-W, 0, L.backZ]], wood);
  for (let x = -W + 3; x < W; x += 3) seg(ctx, cx, [x, 0, 0], [x, 0, L.backZ], 'rgba(90,45,10,.18)', 1);
  const paint = '#1f4fa8';
  poly(ctx, cx, [[-W + 1, 0, 0], [W - 1, 0, 0], [W - 1, 0, L.backZ - 1], [-W + 1, 0, L.backZ - 1]], null, paint, 2);
  poly(ctx, cx, [[-6, 0, 78], [6, 0, 78], [6, 0, L.backZ - 1], [-6, 0, L.backZ - 1]], 'rgba(31,79,168,.25)', paint, 1.5);
  poly(ctx, cx, arcPts(78, 6, Math.PI, 2 * Math.PI), null, paint, 1.5);
  poly(ctx, cx, arcPts(L.hoopZ, 24, Math.PI * 1.08, Math.PI * 1.92, 0, 30), null, paint, 1.5);
  seg(ctx, cx, [-W + 1, 0, 45], [W - 1, 0, 45], paint, 1.5);
  poly(ctx, cx, arcPts(45, 6, 0, Math.PI * 2), null, paint, 1.5);

  // --- Net cage (orange plastic mesh) ----------------------------------------------
  const cage = 'rgba(255,110,30,.75)';
  const z0 = L.cageStartZ, z1 = L.backZ, top = L.cageTop;
  poly(ctx, cx, [[-W, 0, z1], [W, 0, z1], [W, top, z1], [-W, top, z1]], 'rgba(255,110,30,.10)');
  for (let x = -W; x <= W; x += 3) seg(ctx, cx, [x, 0, z1], [x, top, z1], cage, 0.8);
  for (let y = 0; y <= top; y += 5) seg(ctx, cx, [-W, y, z1], [W, y, z1], cage, 0.8);
  for (const sx of [-W, W]) {
    for (let z = z0; z <= z1; z += 6) seg(ctx, cx, [sx, 0, z], [sx, top, z], cage, 0.8);
    for (let y = 0; y <= top; y += 6) seg(ctx, cx, [sx, y, z0], [sx, y, z1], cage, 0.8);
    seg(ctx, cx, [sx, 0, z0], [sx, top, z0], '#ff6a1a', 2.5);
  }
  for (let z = z0; z <= z1; z += 6) seg(ctx, cx, [-W, top, z], [W, top, z], cage, 0.8);
  for (let x = -W; x <= W; x += 4) seg(ctx, cx, [x, top, z0], [x, top, z1], cage, 0.8);
  poly(ctx, cx, [[-W, top, z0], [W, top, z0], [W, top, z1], [-W, top, z1]], null, '#ff6a1a', 2.5);

  // --- Backboard --------------------------------------------------------------------
  const bw = L.boardHalfW;
  poly(ctx, cx, [[-bw - 1.5, L.boardY0 - 1.5, L.boardZ + 0.5], [bw + 1.5, L.boardY0 - 1.5, L.boardZ + 0.5], [bw + 1.5, L.boardY1 + 1.5, L.boardZ + 0.5], [-bw - 1.5, L.boardY1 + 1.5, L.boardZ + 0.5]], '#1f4fa8');
  poly(ctx, cx, [[-bw, L.boardY0, L.boardZ], [bw, L.boardY0, L.boardZ], [bw, L.boardY1, L.boardZ], [-bw, L.boardY1, L.boardZ]], '#f7f7f2');
  poly(ctx, cx, [[-5.5, L.rimY + 1, L.boardZ - 0.1], [5.5, L.rimY + 1, L.boardZ - 0.1], [5.5, L.rimY + 11, L.boardZ - 0.1], [-5.5, L.rimY + 11, L.boardZ - 0.1]], null, '#d22', 2);

  // Balls behind the rim plane, then the hoop, then balls in front.
  for (const b of lane.balls) drawShadow(ctx, cx, b);
  const behind = lane.balls.filter((b) => b.z > L.hoopZ).sort((a, b) => b.z - a.z);
  const front = lane.balls.filter((b) => b.z <= L.hoopZ).sort((a, b) => b.z - a.z);
  for (const b of behind) drawBall(ctx, cx, b);

  // --- Rim & net --------------------------------------------------------------------
  seg(ctx, cx, [0, L.rimY, L.hoopZ + L.rimR], [0, L.rimY, L.boardZ], '#ff6a00', 2);
  const ring = arcPts(L.hoopZ, L.rimR, 0, Math.PI * 2, L.rimY, 24);
  const low = arcPts(L.hoopZ, L.rimR * 0.6, 0, Math.PI * 2, L.rimY - 13, 24);
  const netColor = lane.swish > 0 ? COLORS.good : 'rgba(255,255,255,.85)';
  for (let i = 0; i < 24; i += 2) {
    seg(ctx, cx, ring[i], low[(i + 2) % 24], netColor, 1);
    seg(ctx, cx, ring[i + 2] || ring[0], low[i], netColor, 1);
  }
  poly(ctx, cx, low, null, netColor, 1);
  poly(ctx, cx, ring, null, '#ff6a00', 3);

  for (const b of front) drawBall(ctx, cx, b);

  // --- White plastic base: LCD, buttons, launcher, ball rack ------------------------
  const baseY = 500;
  roundRect(ctx, cx - 92, baseY, 184, 96, 14, '#eceae4', '#b8b5ad');
  roundRect(ctx, cx - 92, baseY, 184, 10, 6, '#f8f7f3');
  for (let i = 0; i < 6; i++) roundRect(ctx, cx + 54, baseY + 22 + i * 7, 30, 3, 1.5, '#c8c5bd');
  // LCD scoreboard.
  roundRect(ctx, cx - 82, baseY + 18, 50, 30, 4, '#3a3d33');
  roundRect(ctx, cx - 79, baseY + 21, 44, 24, 3, '#9fb38a');
  text(ctx, String(lane.score).padStart(2, '0'), cx - 57, baseY + 34, { size: 19, weight: 800, color: '#1d2615', baseline: 'middle' });
  text(ctx, 'SCORE', cx - 57, baseY + 56, { size: 8, weight: 700, color: '#77746c' });
  roundRect(ctx, cx - 80, baseY + 66, 8, 20, 2, '#222');
  circle(ctx, cx - 58, baseY + 72, 5, '#d23', '#811', 1);
  circle(ctx, cx - 44, baseY + 78, 4, '#d23', '#811', 1);

  // Launcher: a blue disc with a cup; it squashes while you charge.
  const squash = charge == null ? 0 : charge;
  const lx = cx, ly = baseY + 38 + squash * 6;
  ctx.beginPath();
  ctx.ellipse(lx, baseY + 50, 36, 22, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#2b62c9';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(lx, ly, 22 - squash * 3, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = squash ? '#1b4396' : '#3d78e6';
  ctx.fill();
  ctx.strokeStyle = '#173a80';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (lane.rack > 0) {
    const g = ctx.createRadialGradient(lx - 4, ly - 10, 1, lx, ly - 6, 11);
    g.addColorStop(0, '#ffb066');
    g.addColorStop(1, '#c4520f');
    circle(ctx, lx, ly - 6, 10, g, 'rgba(60,20,0,.6)', 1);
  }
  // Spare balls waiting on the court in front of the launcher.
  for (let i = 1; i < lane.rack; i++) drawBall(ctx, cx, { x: 9, y: BALL_R, z: 6 + i * 9 });

  // Power meter: a wide bar above the launcher, with a tick at your last shot's power.
  if (mine && (charge != null || lane.lastPower != null)) {
    const mx = cx - 70, my = baseY - 20, mw = 140;
    roundRect(ctx, mx - 3, my - 3, mw + 6, 16, 6, 'rgba(0,0,0,.6)');
    if (charge != null) {
      const meter = ctx.createLinearGradient(mx, 0, mx + mw, 0);
      meter.addColorStop(0, COLORS.good);
      meter.addColorStop(0.65, COLORS.accent);
      meter.addColorStop(1, COLORS.them);
      roundRect(ctx, mx, my, mw * charge + 0.01, 10, 4, meter);
    }
    if (lane.lastPower != null) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + mw * lane.lastPower - 1, my - 4, 2, 18);
    }
  }

  if (lane.swish > 0) {
    const [sx, sy] = proj(cx, 0, L.rimY + 30, L.hoopZ);
    text(ctx, '+1', sx, sy - (0.7 - lane.swish) * 30, { size: 22, weight: 900, color: COLORS.good });
  }
}

export default function hoopsClient({ seat, names, send }) {
  let holdStart = null;
  let holdId = null;
  let lastState = null;

  const charge = () => (holdStart == null ? null : chargeAt((performance.now() - holdStart) / 1000));
  const canShoot = () => lastState && lastState.lanes[seat].rack > 0;

  function begin(id) {
    if (holdStart != null || !canShoot()) return;
    holdStart = performance.now();
    holdId = id;
  }
  function release(id) {
    if (holdStart == null || id !== holdId) return;
    const power = charge();
    holdStart = null;
    if (power > 0.02) send({ type: 'shoot', power });
  }

  return {
    render(ctx, state) {
      lastState = state;
      const bg = ctx.createLinearGradient(0, 0, 0, 600);
      bg.addColorStop(0, '#16131f');
      bg.addColorStop(1, '#2a1f18');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 400, 600);

      drawMachine(ctx, LANE_X[0], state.lanes[seat], true, charge());
      drawMachine(ctx, LANE_X[1], state.lanes[1 - seat], false, null);

      // Header: names and the shared clock.
      text(ctx, 'YOU', LANE_X[0], 16, { size: 15, weight: 900, color: COLORS.you });
      text(ctx, names[1 - seat], LANE_X[1], 16, { size: 13, weight: 800, color: COLORS.them });
      const left = Math.max(0, GAME_SECONDS - state.elapsed);
      roundRect(ctx, 176, 4, 48, 24, 5, left < 10 ? '#5a1020' : '#3a3d33');
      text(ctx, left.toFixed(0), 200, 17, { size: 16, weight: 800, color: left < 10 ? '#ff9db5' : '#c9e0a8' });

      if (state.elapsed < 5 && holdStart == null) {
        text(ctx, 'Hold anywhere, release to shoot', 200, 455, { size: 14, weight: 700, color: '#fff' });
      }
      if (holdStart != null && !canShoot()) holdStart = null;
    },

    pointerDown(p) { begin(p.id); },
    pointerUp(p) { release(p.id); },
    keyDown(k) { if (k === ' ') begin('key'); },
    keyUp(k) { if (k === ' ') release('key'); },
  };
}

