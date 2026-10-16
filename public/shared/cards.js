// Playing-card helpers shared by the card games (server rules and client drawing).
// A card is { id, r, s }: r = rank 1..13 (A..K), s = suit 0..3 (♠ ♥ ♦ ♣).

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (card) => card.s === 1 || card.s === 2;
export const label = (card) => `${RANKS[card.r]}${SUITS[card.s]}`;

let nextId = 1;

// A freshly shuffled 52-card deck. Ids are unique across decks so the client can animate
// each card individually.
export function makeDeck(rng) {
  const deck = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ id: nextId++, r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Tiny serializable PRNG for games that must keep their randomness inside `state`.
export function stateRng(state, key = '_seed') {
  return () => {
    state[key] = (state[key] * 16807) % 2147483647;
    return state[key] / 2147483647;
  };
}

// Hide a card's face but keep its id (so the client can still animate it).
export const facedown = (card) => ({ id: card.id, down: true });
