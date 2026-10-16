// Computer opponents for playing offline / when nobody else is online.
// Each bot gets called every tick with the live state and an `input(msg)` callback,
// exactly like a remote player's inputs would arrive at the server.
import { GAMES } from '../shared/registry.js';
import { legalMoves, applyMove, SIZE } from '../shared/games/chess.js';
import { closestOnSegment } from '../shared/physics.js';
import { flipperSegment, PUCK_R, FLIPPER_R } from '../shared/games/hockey.js';
import { isStopped } from '../shared/games/golf.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clone = (o) => JSON.parse(JSON.stringify(o));

// --- Chess: one-ply search with simple "don't hang pieces" safety -----------------
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

function chessBot(seat) {
  let think = rand(0.8, 1.8);
  return (config, state, dt, input) => {
    if (state.turn !== seat) { think = rand(0.8, 1.8); return; }
    think -= dt;
    if (think > 0) return;
    think = 99;
    const moves = legalMoves(state.board, seat);
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      const target = state.board[m.to[0] * SIZE + m.to[1]];
      const mover = state.board[m.from[0] * SIZE + m.from[1]].toLowerCase();
      const next = applyMove(state.board, m);
      const replies = legalMoves(next, 1 - seat);
      let score = target === '.' ? 0 : VALUE[target.toLowerCase()] * 10;
      if (replies.length === 0) score += 1000; // mate or stalemate-ish; mate is what usually happens
      if (replies.some((r) => r.to[0] === m.to[0] && r.to[1] === m.to[1])) score -= VALUE[mover] * 9;
      if (mover === 'p') score += 1; // nudge pawns forward
      score += Math.random() * 3;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (best) input({ type: 'move', from: best.from, to: best.to });
  };
}

// --- Hockey: flip when the puck is close to a flipper -----------------------------
function hockeyBot(seat) {
  const hold = [0, 0];
  const cooldown = [0, 0];
  const down = [false, false];
  return (config, state, dt, input) => {
    const p = state.puck;
    for (const side of [0, 1]) {
      hold[side] -= dt;
      cooldown[side] -= dt;
      const seg = flipperSegment(seat, side, state.flippers[seat][side]);
      const q = closestOnSegment(p.x, p.y, ...seg);
      const dist = Math.hypot(p.x - q.x, p.y - q.y) - PUCK_R - FLIPPER_R;
      if (!down[side] && cooldown[side] <= 0 && dist < 26 && q.t > 0.2) {
        cooldown[side] = rand(0.35, 0.6);
        if (Math.random() < 0.82) { // sometimes it just misses
          hold[side] = rand(0.14, 0.24);
          down[side] = true;
          input({ type: 'flip', side, down: true });
        }
      }
      if (down[side] && hold[side] <= 0) {
        down[side] = false;
        input({ type: 'flip', side, down: false });
      }
    }
  };
}

// --- Hoops: find a scoring launch by simulation, then add some human error --------
function hoopsBot(seat) {
  const game = GAMES.hoops;
  let wait = rand(1.4, 2.2);
  return (config, state, dt, input) => {
    wait -= dt;
    if (wait > 0) return;
    wait = rand(1.3, 2.1);
    let launch = null;
    for (let i = 0; i < 30 && !launch; i++) {
      const vx = rand(350, 750), vy = rand(-1050, -600);
      const sim = clone(state);
      const lane = sim.lanes[seat];
      lane.balls = []; lane.cool = 0; lane.score = 0;
      game.input(config, sim, seat, { type: 'shoot', vx, vy });
      for (let t = 0; t < 150 && !sim.over; t++) game.step(config, sim, 1 / 60);
      if (lane.score > 0) launch = [vx, vy];
    }
    launch ??= [rand(400, 700), rand(-950, -650)];
    const miss = Math.random() < 0.5;
    const [vx, vy] = miss ? [launch[0] * rand(0.9, 1.1), launch[1] * rand(0.92, 1.08)] : launch;
    input({ type: 'shoot', vx, vy });
  };
}

// --- Golf: sample putts by simulation and take the best one, slightly off ---------
function golfBot(seat) {
  const game = GAMES.golf;
  let wait = rand(1.2, 2);
  return (config, state, dt, input) => {
    const me = state.balls[seat];
    if (me.done || !isStopped(me)) { wait = rand(0.9, 1.8); return; }
    wait -= dt;
    if (wait > 0) return;
    wait = 99;
    let best = null, bestDist = Infinity;
    const baseAng = Math.atan2(config.cup.y - me.y, config.cup.x - me.x);
    for (let i = 0; i < 40; i++) {
      const ang = baseAng + rand(-1.4, 1.4) * (i < 15 ? 0.25 : 1);
      const sp = rand(150, 900);
      const sim = clone(state);
      sim.balls[1 - seat].done = true;
      game.input(config, sim, seat, { type: 'putt', vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });
      const b = sim.balls[seat];
      for (let t = 0; t < 360 && !b.done && !(t > 2 && isStopped(b)); t++) game.step(config, sim, 1 / 60);
      const d = b.done && b.strokes <= 10 ? 0 : Math.hypot(b.x - config.cup.x, b.y - config.cup.y);
      if (d < bestDist) { bestDist = d; best = { ang, sp }; }
    }
    const ang = best.ang + rand(-0.05, 0.05);
    const sp = best.sp * rand(0.93, 1.07);
    input({ type: 'putt', vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });
  };
}

const BOTS = { chess: chessBot, hockey: hockeyBot, hoops: hoopsBot, golf: golfBot };
export const makeBot = (gameId, seat) => BOTS[gameId](seat);
