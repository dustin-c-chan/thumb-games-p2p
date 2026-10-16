// Blackjack Duel: one player deals, the other plays, and the roles swap every hand.
// Unlike casino blackjack, the dealer makes real choices: they see the player's final
// total and decide whether to hit. The player has the upside of doubling down and
// blackjack paying 3:2. Four hands, everyone starts with 500 chips; most chips wins.
import { makeDeck, stateRng, facedown } from '../cards.js';

export const HANDS = 4;
export const START_CHIPS = 500;
export const BETS = [25, 50, 100];
export const DECISION_SECONDS = 12;
const DEAL_SECONDS = 1.3;
const REVEAL_SECONDS = 0.8;
const SETTLE_SECONDS = 2.4;

export function total(cards) {
  let sum = 0, aces = 0;
  for (const c of cards) {
    if (c.down) continue;
    const v = c.r === 1 ? 11 : Math.min(10, c.r);
    sum += v;
    if (c.r === 1) aces++;
  }
  while (sum > 21 && aces) { sum -= 10; aces--; }
  return { sum, soft: aces > 0 };
}
const isBlackjack = (cards) => cards.length === 2 && total(cards).sum === 21;

function draw(state) {
  if (state._deck.length < 12) state._deck = makeDeck(stateRng(state));
  return state._deck.pop();
}

function startHand(state) {
  state.hand++;
  state.dealer = state.hand === 1 ? state.firstDealer : 1 - state.dealer;
  state.player = 1 - state.dealer;
  state.phase = 'bet';
  state.timer = DECISION_SECONDS;
  state.bet = null;
  state.doubled = false;
  state.cards = { player: [], dealer: [] };
  state.result = null;
}

function deal(state) {
  const p = state.cards.player, d = state.cards.dealer;
  p.push(draw(state)); d.push(draw(state)); p.push(draw(state));
  d.push({ ...draw(state), down: true });
  state.phase = 'deal';
  state.timer = DEAL_SECONDS;
}

function revealHole(state) {
  for (const c of state.cards.dealer) delete c.down;
}

// Settle the hand. `amount` > 0 means the player wins that many chips from the dealer.
function settle(state, amount, text) {
  state.chips[state.player] += amount;
  state.chips[state.dealer] -= amount;
  state.result = { amount, text };
  state.phase = 'settle';
  state.timer = SETTLE_SECONDS;
}

function afterPlayerDone(state) {
  const pt = total(state.cards.player).sum;
  if (pt > 21) return settle(state, -state.bet, 'Player busts');
  revealHole(state);
  state.phase = 'reveal';
  state.timer = REVEAL_SECONDS;
}

function afterReveal(state) {
  const p = state.cards.player, d = state.cards.dealer;
  if (isBlackjack(p)) {
    if (isBlackjack(d)) return settle(state, 0, 'Both blackjack · push');
    return settle(state, Math.round(state.bet * 1.5), 'Blackjack! Pays 3:2');
  }
  if (isBlackjack(d)) return settle(state, -state.bet, 'Dealer blackjack');
  state.phase = 'dealer';
  state.timer = DECISION_SECONDS;
}

function dealerStands(state) {
  const pt = total(state.cards.player).sum, dt = total(state.cards.dealer).sum;
  if (dt > pt) settle(state, -state.bet, `Dealer wins ${dt} to ${pt}`);
  else if (dt < pt) settle(state, state.bet, `Player wins ${pt} to ${dt}`);
  else settle(state, 0, `Push at ${pt}`);
}

function playerHit(state) {
  state.cards.player.push(draw(state));
  if (total(state.cards.player).sum >= 21) afterPlayerDone(state);
  else state.timer = DECISION_SECONDS;
}

function dealerHit(state) {
  state.cards.dealer.push(draw(state));
  const dt = total(state.cards.dealer).sum;
  if (dt > 21) settle(state, state.bet, 'Dealer busts');
  else state.timer = DECISION_SECONDS;
}

export function legalActions(state, seat) {
  if (state.over) return [];
  if (state.phase === 'bet' && seat === state.player) return BETS.map((b) => `bet:${b}`);
  if (state.phase === 'player' && seat === state.player) {
    const a = ['hit', 'stand'];
    if (state.cards.player.length === 2 && !state.doubled) a.push('double');
    return a;
  }
  if (state.phase === 'dealer' && seat === state.dealer) return ['hit', 'stand'];
  return [];
}

export default {
  id: 'blackjack',
  name: 'Blackjack Duel',
  blurb: 'One of you deals, one of you plays, then swap. The dealer sees your total and chooses whether to hit! 4 hands, most chips wins.',
  controls: 'Tap the buttons: pick a bet, then Hit, Stand or Double.',

  create(rng) {
    const state = {
      hand: 0,
      hands: HANDS,
      chips: [START_CHIPS, START_CHIPS],
      firstDealer: rng() < 0.5 ? 0 : 1,
      dealer: 0,
      player: 1,
      phase: 'bet',
      timer: DECISION_SECONDS,
      bet: null,
      doubled: false,
      cards: { player: [], dealer: [] },
      result: null,
      over: null,
      _seed: Math.floor(rng() * 2147483646) + 1,
    };
    state._deck = makeDeck(rng);
    startHand(state);
    return { config: {}, state };
  },

  view(state) {
    // Nobody sees the dealer's hole card (not even the dealer) until it's revealed.
    const { _deck, _seed, ...pub } = state;
    return { ...pub, cards: { player: state.cards.player, dealer: state.cards.dealer.map((c) => (c.down ? facedown(c) : c)) } };
  },

  input(config, state, seat, msg) {
    if (state.over) return;
    if (state.phase === 'bet' && seat === state.player && msg.type === 'bet' && BETS.includes(msg.amount)) {
      state.bet = msg.amount;
      deal(state);
    } else if (state.phase === 'player' && seat === state.player) {
      if (msg.type === 'hit') playerHit(state);
      else if (msg.type === 'stand') afterPlayerDone(state);
      else if (msg.type === 'double' && state.cards.player.length === 2 && !state.doubled) {
        state.doubled = true;
        state.bet *= 2;
        state.cards.player.push(draw(state));
        afterPlayerDone(state);
      }
    } else if (state.phase === 'dealer' && seat === state.dealer) {
      if (msg.type === 'hit') dealerHit(state);
      else if (msg.type === 'stand') dealerStands(state);
    }
  },

  step(config, state, dt) {
    if (state.over) return;
    state.timer -= dt;
    if (state.timer > 0) return;
    // Timeouts keep the game moving with safe defaults.
    switch (state.phase) {
      case 'bet': state.bet = BETS[0]; deal(state); break;
      case 'deal':
        if (isBlackjack(state.cards.player)) afterPlayerDone(state);
        else { state.phase = 'player'; state.timer = DECISION_SECONDS; }
        break;
      case 'player': afterPlayerDone(state); break;
      case 'reveal': afterReveal(state); break;
      case 'dealer': dealerStands(state); break;
      case 'settle':
        if (state.hand >= HANDS) {
          const [a, b] = state.chips;
          state.over = { winner: a === b ? null : a > b ? 0 : 1, reason: `${a} vs ${b} chips` };
        } else startHand(state);
        break;
    }
  },
};
