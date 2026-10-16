import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../public/shared/registry.js';
import { makeRng } from '../public/shared/rng.js';
import { legalMoves, inCheck } from '../public/shared/games/chess.js';

const DT = 1 / 60;
const run = (game, config, state, seconds, each) => {
  for (let i = 0; i < seconds * 60 && !state.over; i++) {
    each?.(i);
    game.step(config, state, DT);
  }
};

test('chess: start position has legal moves for both sides and no check', () => {
  const { state } = GAMES.chess.create(makeRng(1));
  assert.ok(legalMoves(state.board, 0).length > 0);
  assert.ok(legalMoves(state.board, 1).length > 0);
  assert.equal(inCheck(state.board, 0), false);
});

test('chess: rejects moves out of turn and illegal moves', () => {
  const g = GAMES.chess;
  const { config, state } = g.create(makeRng(1));
  g.input(config, state, 1, { type: 'move', from: [1, 0], to: [2, 0] });
  assert.equal(state.ply, 0);
  g.input(config, state, 0, { type: 'move', from: [3, 0], to: [1, 0] });
  assert.equal(state.ply, 0);
  g.input(config, state, 0, { type: 'move', from: [3, 0], to: [2, 0] });
  assert.equal(state.ply, 1);
  assert.equal(state.turn, 1);
});

test('chess: detects checkmate', () => {
  // Black king boxed in the corner by a white queen supported by the king.
  const b = (
    'k....' +
    '....Q' +
    '.K...' +
    '.....' +
    '.....').split('');
  const g = GAMES.chess;
  const { config, state } = g.create(makeRng(1));
  state.board = b;
  // Queen slides next to the black king, protected by the white king: checkmate.
  g.input(config, state, 0, { type: 'move', from: [1, 4], to: [1, 0] });
  assert.deepEqual(state.over, { winner: 0, reason: 'Checkmate' });
});

test('chess: random move is played when the clock runs out', () => {
  const g = GAMES.chess;
  const { config, state } = g.create(makeRng(2));
  run(g, config, state, 31);
  assert.equal(state.ply, 1);
  assert.equal(state.last.auto, true);
});

test('chess: random self-play always terminates with a valid result', () => {
  const g = GAMES.chess;
  const rng = makeRng(3);
  for (let n = 0; n < 30; n++) {
    const { config, state } = g.create(rng);
    while (!state.over) {
      const moves = legalMoves(state.board, state.turn);
      const m = rng.pick(moves);
      g.input(config, state, state.turn, { type: 'move', from: m.from, to: m.to });
      assert.equal(inCheck(state.board, 1 - state.turn), false, 'side that just moved is never left in check');
    }
    assert.ok([0, 1, null].includes(state.over.winner));
  }
});

test('hoops: there is a launcher sweet spot, and weak or huge shots miss', () => {
  const g = GAMES.hoops;
  const scores = (power) => {
    const { config, state } = g.create();
    g.input(config, state, 0, { type: 'shoot', power });
    run(g, config, state, 4);
    return state.lanes[0].score;
  };
  let hits = 0;
  for (let p = 0.7; p <= 0.83; p += 0.01) hits += scores(p);
  assert.ok(hits >= 8, `sweet spot scored ${hits}/14`);
  assert.equal(scores(0.3), 0);
  assert.equal(scores(0.05), 0);
});

test('hoops: only 3 balls; they roll back to the launcher and can be shot again', () => {
  const g = GAMES.hoops;
  const { config, state } = g.create();
  for (let i = 0; i < 5; i++) {
    g.input(config, state, 1, { type: 'shoot', power: 0.5 });
    run(g, config, state, 0.3);
  }
  assert.equal(state.lanes[1].rack, 0);
  assert.equal(state.lanes[1].balls.length, 3);
  run(g, config, state, 4);
  assert.equal(state.lanes[1].rack, 3, 'balls returned');
  g.input(config, state, 1, { type: 'shoot', power: 2 }); // out of range: ignored
  assert.equal(state.lanes[1].rack, 3);
  run(g, config, state, 46);
  assert.ok(state.over);
});

test('pachinko: balls keep coming, paddles defend, someone wins', () => {
  const g = GAMES.pachinko;
  const { config, state } = g.create(makeRng(8));
  run(g, config, state, 120, () => {
    for (const b of state.balls) assert.ok(Number.isFinite(b.x) && b.x >= 0 && b.x <= 400);
  });
  assert.ok(state.over, 'game ended');
  assert.ok(Math.max(...state.score) > 0);
});

test('pachinko: a paddle in the right spot returns the ball', () => {
  const g = GAMES.pachinko;
  const { config, state } = g.create(makeRng(9));
  state.spawnIn = 99;
  state.balls = [{ id: 1, x: 120, y: 520, vx: 0, vy: 300, age: 0 }];
  state.paddles[0] = state.targets[0] = 120;
  run(g, config, state, 0.25); // long enough to reach the paddle, short of the pins above
  assert.ok(state.balls[0].vy < 0, 'bounced back up');
  assert.deepEqual(state.score, [0, 0]);
  // Seat 1 sends seat-local x: 100 from its own view is world x 300.
  g.input(config, state, 1, { type: 'paddle', x: 100 });
  assert.equal(state.targets[1], 300);
});

test('golf: every generated hole is sinkable by a simple aim-at-cup bot', () => {
  const g = GAMES.golf;
  const rng = makeRng(6);
  let sunk = 0;
  const N = 40;
  for (let n = 0; n < N; n++) {
    const { config, state } = g.create(rng);
    const shoot = () => {
      for (const seat of [0, 1]) {
        const b = state.balls[seat];
        if (b.done || Math.hypot(b.vx, b.vy) >= 1) continue;
        // Random-ish aim with a bias toward the cup; good enough to find a way around walls.
        const dx = config.cup.x - b.x, dy = config.cup.y - b.y;
        const d = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) + (rng() - 0.5) * (b.strokes > 3 ? 2.4 : 0.5);
        const sp = Math.min(900, Math.sqrt(2 * 230 * d) * rng.range(0.8, 1.15));
        g.input(config, state, seat, { type: 'putt', vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });
      }
    };
    run(g, config, state, 120, shoot);
    assert.ok(state.over, 'golf always ends');
    sunk += state.balls.filter((b) => b.strokes <= 10 && b.finishedAt < 90).length;
  }
  assert.ok(sunk > N * 0.5, `sunk ${sunk} of ${N * 2} balls`);
});

test('all games ignore junk input', () => {
  for (const g of Object.values(GAMES)) {
    const { config, state } = g.create(makeRng(7));
    for (const junk of [{}, { type: 'move' }, { type: 'shoot', vx: 'x' }, { type: 'putt', vx: NaN }, { type: 'flip', side: 9 }]) {
      g.input(config, state, 0, junk);
    }
    g.step(config, state, DT);
    assert.doesNotThrow(() => JSON.stringify(state));
  }
});

// --- Card games ----------------------------------------------------------------------
import { makeBot } from '../public/js/bots.js';
import { viewFor } from '../public/shared/match.js';

function botVsBot(id, seed, seconds = 400, each) {
  const g = GAMES[id];
  const { config, state } = g.create(makeRng(seed));
  const bots = [makeBot(id, 0), makeBot(id, 1)];
  for (let i = 0; i < seconds * 60 && !state.over; i++) {
    for (const s of [0, 1]) bots[s](config, viewFor(g, state, s), DT, (msg) => g.input(config, state, s, msg));
    g.step(config, state, DT);
    each?.(state);
  }
  return state;
}

test('blackjack: bot games finish, chips are conserved, roles alternate each hand', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const dealers = new Map();
    const state = botVsBot('blackjack', seed, 400, (s) => {
      assert.equal(s.chips[0] + s.chips[1], 1000);
      dealers.set(s.hand, s.dealer);
    });
    assert.ok(state.over, `seed ${seed} finished`);
    assert.notEqual(dealers.get(1), dealers.get(2));
    assert.equal(dealers.get(1), dealers.get(3));
  }
});

test('blackjack: the hole card and the deck never reach the players', () => {
  const g = GAMES.blackjack;
  const { config, state } = g.create(makeRng(3));
  g.input(config, state, state.player, { type: 'bet', amount: 50 });
  for (const seat of [0, 1]) {
    const v = JSON.parse(JSON.stringify(viewFor(g, state, seat)));
    assert.equal(v._deck, undefined);
    const hole = v.cards.dealer[1];
    assert.equal(hole.down, true);
    assert.equal(hole.r, undefined, 'rank hidden');
  }
  // Only the player may act in the player phase; dealer inputs are ignored.
  g.step(config, state, 2);
  if (state.phase === 'player') {
    const n = state.cards.player.length;
    g.input(config, state, state.dealer, { type: 'hit' });
    assert.equal(state.cards.player.length, n);
  }
});

test('snap: correct snaps score, wrong snaps cost a point and lock you out', () => {
  const g = GAMES.snap;
  const { config, state } = g.create(makeRng(4));
  state.pile = [{ id: 901, r: 5, s: 0 }, { id: 902, r: 9, s: 1 }];
  state.match = false;
  state.score = [2, 0];
  g.input(config, state, 0, { type: 'snap' });
  assert.equal(state.score[0], 1);
  assert.ok(state.lockout[0] > 0);
  g.input(config, state, 0, { type: 'snap' }); // locked out: ignored
  assert.equal(state.score[0], 1);
  state.pile.push({ id: 903, r: 9, s: 2 });
  state.match = true;
  g.input(config, state, 1, { type: 'snap' });
  assert.equal(state.score[1], 1);
  const end = botVsBot('snap', 5, 60);
  assert.ok(end.over);
});

test('bluff: you never see your own card before showdown; chips are conserved', () => {
  const g = GAMES.bluff;
  const { config, state } = g.create(makeRng(6));
  for (const seat of [0, 1]) {
    const v = JSON.parse(JSON.stringify(viewFor(g, state, seat)));
    assert.equal(v.cards[seat].down, true);
    assert.equal(v.cards[seat].r, undefined);
    assert.ok(v.cards[1 - seat].r >= 1, 'opponent card visible');
  }
  for (let seed = 1; seed <= 15; seed++) {
    const s = botVsBot('bluff', seed, 200, (st) => assert.equal(st.chips[0] + st.chips[1] + st.pot, 20));
    assert.ok(s.over);
  }
  // Fold hands the pot over.
  const t = g.create(makeRng(7));
  g.step(t.config, t.state, 2);
  const actor = t.state.toAct;
  g.input(t.config, t.state, actor, { type: 'bet' });
  g.input(t.config, t.state, 1 - actor, { type: 'fold' });
  assert.equal(t.state.result.winner, actor);
  assert.equal(t.state.chips[actor], 10 - 1 - 2 + 4); // ante, bet, then the 4-chip pot
});
