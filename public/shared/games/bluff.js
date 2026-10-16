// Blind Bluff (a.k.a. Indian poker): each player gets one card that only the OPPONENT
// can see, as if it were stuck to your forehead. Read their card, guess yours, then bet
// or fold. Higher card wins the pot (aces high). Five hands; most chips wins.
import { makeDeck, stateRng, facedown } from '../cards.js';

export const HANDS = 5;
export const START_CHIPS = 10;
export const ANTE = 1;
export const BET = 2;
export const DECISION_SECONDS = 12;
const DEAL_SECONDS = 1.1;
const SHOWDOWN_SECONDS = 2.8;

export const cardValue = (c) => (c.r === 1 ? 14 : c.r);

function startHand(state) {
  if (state.chips.some((c) => c < ANTE)) return finish(state);
  state.hand++;
  if (state._deck.length < 2) state._deck = makeDeck(stateRng(state));
  state.cards = [state._deck.pop(), state._deck.pop()];
  state.chips = state.chips.map((c) => c - ANTE);
  state.pot = ANTE * 2;
  state.first = (state.firstSeat + state.hand - 1) % 2;
  state.toAct = state.first;
  state.betOut = false;
  state.betSize = 0;
  state.actions = [];
  state.result = null;
  state.phase = 'deal';
  state.timer = DEAL_SECONDS;
}

function finish(state) {
  const [a, b] = state.chips;
  state.over = { winner: a === b ? null : a > b ? 0 : 1, reason: `${a} vs ${b} chips` };
}

function endHand(state, winner, text) {
  if (winner == null) {
    state.chips[0] += state.pot / 2;
    state.chips[1] += state.pot / 2;
  } else {
    state.chips[winner] += state.pot;
  }
  state.result = { winner, text, pot: state.pot };
  state.pot = 0;
  state.phase = 'showdown';
  state.timer = SHOWDOWN_SECONDS;
}

function showdown(state) {
  const [a, b] = state.cards.map(cardValue);
  if (a === b) endHand(state, null, 'Same rank · split pot');
  else endHand(state, a > b ? 0 : 1, 'Showdown');
}

export function legalActions(state, seat) {
  if (state.over || state.phase !== 'act' || state.toAct !== seat) return [];
  return state.betOut ? ['call', 'fold'] : ['check', 'bet'];
}

function act(state, seat, type) {
  const other = 1 - seat;
  state.actions.push({ seat, type });
  if (type === 'fold') return endHand(state, other, 'Fold');
  if (type === 'call') {
    const amt = Math.min(state.betSize, state.chips[seat]);
    state.chips[seat] -= amt;
    state.pot += amt;
    return showdown(state);
  }
  if (type === 'bet') {
    const amt = Math.min(BET, state.chips[seat], state.chips[other]);
    if (amt <= 0) return showdown(state); // nothing left to bet: just show
    state.chips[seat] -= amt;
    state.pot += amt;
    state.betOut = true;
    state.betSize = amt;
    state.toAct = other;
    state.timer = DECISION_SECONDS;
    return;
  }
  // Check: second check (or a check behind) goes to showdown.
  if (seat !== state.first) return showdown(state);
  state.toAct = other;
  state.timer = DECISION_SECONDS;
}

export default {
  id: 'bluff',
  name: 'Blind Bluff',
  blurb: 'You can see their card but not your own! Bet if you think you’re higher, fold if not. 5 hands, most chips wins.',
  controls: 'Tap Check / Bet, or Call / Fold when they bet.',

  create(rng) {
    const state = {
      hand: 0,
      hands: HANDS,
      chips: [START_CHIPS, START_CHIPS],
      firstSeat: rng() < 0.5 ? 0 : 1,
      first: 0,
      toAct: 0,
      cards: [],
      pot: 0,
      betOut: false,
      betSize: 0,
      actions: [],
      result: null,
      phase: 'deal',
      timer: DEAL_SECONDS,
      over: null,
      _seed: Math.floor(rng() * 2147483646) + 1,
    };
    state._deck = makeDeck(rng);
    startHand(state);
    return { config: {}, state };
  },

  // Your own card stays face down to you until the showdown.
  view(state, seat) {
    const { _deck, _seed, ...pub } = state;
    const reveal = state.phase === 'showdown' || state.over;
    return { ...pub, cards: state.cards.map((c, i) => (i === seat && !reveal ? facedown(c) : c)) };
  },

  input(config, state, seat, msg) {
    if (legalActions(state, seat).includes(msg.type)) act(state, seat, msg.type);
  },

  step(config, state, dt) {
    if (state.over) return;
    state.timer -= dt;
    if (state.timer > 0) return;
    if (state.phase === 'deal') {
      state.phase = 'act';
      state.timer = DECISION_SECONDS;
    } else if (state.phase === 'act') {
      act(state, state.toAct, state.betOut ? 'fold' : 'check');
    } else if (state.phase === 'showdown') {
      if (state.hand >= HANDS) finish(state);
      else startHand(state);
    }
  },
};
