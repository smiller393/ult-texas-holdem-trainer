// Card primitives. A card is { r: 2..14, s: 's'|'h'|'d'|'c' }.

export const SUITS = ['s', 'h', 'd', 'c'];
export const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

const RANK_CHARS = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T' };
const RANK_NAMES = {
  14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten', 9: 'Nine', 8: 'Eight',
  7: 'Seven', 6: 'Six', 5: 'Five', 4: 'Four', 3: 'Three', 2: 'Deuce',
};
const RANK_PLURALS = { 6: 'Sixes' };
export const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

export const card = (r, s) => ({ r, s });

export function rankChar(r) {
  return RANK_CHARS[r] ?? String(r);
}

/** Display label for a rank, using "10" instead of "T". */
export function rankLabel(r) {
  return r === 10 ? '10' : rankChar(r);
}

export function rankName(r) {
  return RANK_NAMES[r];
}

export function rankPlural(r) {
  return RANK_PLURALS[r] ?? `${RANK_NAMES[r]}s`;
}

export function cardId(c) {
  return rankChar(c.r) + c.s;
}

export function cardText(c) {
  return rankLabel(c.r) + SUIT_SYMBOLS[c.s];
}

/** Parse "As", "Td", "10h" into a card. */
export function parseCard(str) {
  const m = /^(10|[2-9TJQKA])([shdc])$/i.exec(str.trim());
  if (!m) throw new Error(`Bad card: ${str}`);
  const rc = m[1].toUpperCase();
  const r = { A: 14, K: 13, Q: 12, J: 11, T: 10, '10': 10 }[rc] ?? Number(rc);
  return card(r, m[2].toLowerCase());
}

export function parseCards(str) {
  return str.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

export function sameCard(a, b) {
  return a.r === b.r && a.s === b.s;
}

export function fullDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(card(r, s));
  return deck;
}

/** All cards not present in `used`. */
export function remainingDeck(used) {
  const ids = new Set(used.map(cardId));
  return fullDeck().filter((c) => !ids.has(cardId(c)));
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deal a full UTH layout: player 2, dealer 2, board 5. */
export function dealHand(rng = Math.random) {
  const d = shuffle(fullDeck(), rng);
  return { player: d.slice(0, 2), dealer: d.slice(2, 4), board: d.slice(4, 9) };
}
