// Snap!: cards flip onto a shared pile. When the new card matches the rank of the card
// under it, the first player to hit SNAP scores. Snapping on a non-match costs a point
// and locks you out for a moment. First to 5, or most points when time runs out.
import { makeDeck, stateRng } from '../cards.js';

export const POINTS_TO_WIN = 5;
export const GAME_SECONDS = 50;
export const SNAP_WINDOW = 1.8; // seconds a match stays snappable
const LOCKOUT = 1.0;
const MATCH_CHANCE = 0.26;

function flipInterval(elapsed) {
  return Math.max(0.75, 1.35 - elapsed * 0.012);
}

function flip(state) {
  const rng = stateRng(state);
  if (state._deck.length < 2) state._deck = makeDeck(rng);
  let card = state._deck.pop();
  const top = state.pile[state.pile.length - 1];
  // Stack the odds so matches come up often enough to be fun.
  if (top && rng() < MATCH_CHANCE && card.r !== top.r) {
    const i = state._deck.findIndex((c) => c.r === top.r);
    if (i >= 0) { state._deck.push(card); card = state._deck.splice(i, 1)[0]; }
  }
  state.pile.push(card);
  if (state.pile.length > 4) state.pile.shift();
  state.flips++;
  const prev = state.pile[state.pile.length - 2];
  state.match = !!prev && prev.r === card.r;
  state.matchAge = 0;
  state.nextFlip = flipInterval(state.elapsed);
}

export default {
  id: 'snap',
  name: 'Snap!',
  blurb: 'Cards flip onto the pile. When two in a row match, slam SNAP first! Wrong snaps cost a point. First to 5.',
  controls: 'Tap the big SNAP button (or Space) when the top two cards match.',

  create(rng) {
    const state = {
      elapsed: 0,
      score: [0, 0],
      pile: [],
      flips: 0,
      match: false,
      matchAge: 0,
      nextFlip: 0.6,
      lockout: [0, 0],
      last: null, // { seat, ok, missed, t }
      over: null,
      _seed: Math.floor(rng() * 2147483646) + 1,
    };
    state._deck = makeDeck(rng);
    return { config: {}, state };
  },

  view(state) {
    const { _deck, _seed, ...pub } = state;
    return pub;
  },

  input(config, state, seat, msg) {
    if (state.over || msg.type !== 'snap' || state.lockout[seat] > 0 || !state.pile.length) return;
    if (state.match) {
      state.score[seat]++;
      state.last = { seat, ok: true, t: 0 };
      state.match = false;
      state.nextFlip = 1.3; // a beat to enjoy it
    } else {
      state.score[seat] = Math.max(0, state.score[seat] - 1);
      state.lockout[seat] = LOCKOUT;
      state.last = { seat, ok: false, t: 0 };
    }
  },

  step(config, state, dt) {
    if (state.over) return;
    state.elapsed += dt;
    state.lockout = state.lockout.map((l) => Math.max(0, l - dt));
    if (state.last) state.last.t += dt;
    if (state.match) {
      state.matchAge += dt;
      if (state.matchAge > SNAP_WINDOW) {
        state.match = false;
        state.last = { seat: null, missed: true, t: 0 };
      }
    }
    state.nextFlip -= dt;
    if (state.nextFlip <= 0) flip(state);

    const [a, b] = state.score;
    if (a >= POINTS_TO_WIN || b >= POINTS_TO_WIN) state.over = { winner: a > b ? 0 : 1, reason: `${a}–${b}` };
    else if (state.elapsed >= GAME_SECONDS) state.over = { winner: a === b ? null : a > b ? 0 : 1, reason: `${a}–${b} at the buzzer` };
  },
};
