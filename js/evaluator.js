// Poker hand evaluation for 5 to 7 cards.

export const CAT = {
  HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
};

export const CAT_NAMES = [
  'High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house',
  'Four of a kind', 'Straight flush',
];

/** Highest card of a straight in the given ranks, or 0. Handles the A-5 wheel. */
function straightHigh(ranks) {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  for (let hi = 14; hi >= 5; hi--) {
    let ok = true;
    for (let r = hi; r > hi - 5; r--) {
      if (!set.has(r)) { ok = false; break; }
    }
    if (ok) return hi;
  }
  return 0;
}

/**
 * Evaluate exactly five cards.
 * Returns { cat, tiebreak, score, made } where `made` is the ranks that form the
 * made part of the hand (pair ranks, trip rank, etc.; all ranks for straights/flushes).
 */
export function eval5(cards) {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const sHigh = straightHigh(ranks);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Groups sorted by count desc, then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let cat;
  let tiebreak;
  let made;
  if (sHigh && flush) {
    cat = CAT.STRAIGHT_FLUSH; tiebreak = [sHigh]; made = ranks;
  } else if (groups[0][1] === 4) {
    cat = CAT.QUADS; tiebreak = [groups[0][0], groups[1][0]]; made = [groups[0][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    cat = CAT.FULL_HOUSE; tiebreak = [groups[0][0], groups[1][0]]; made = [groups[0][0], groups[1][0]];
  } else if (flush) {
    cat = CAT.FLUSH; tiebreak = ranks; made = ranks;
  } else if (sHigh) {
    cat = CAT.STRAIGHT; tiebreak = [sHigh]; made = ranks;
  } else if (groups[0][1] === 3) {
    cat = CAT.TRIPS; tiebreak = groups.map((g) => g[0]); made = [groups[0][0]];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    cat = CAT.TWO_PAIR; tiebreak = groups.map((g) => g[0]); made = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 2) {
    cat = CAT.PAIR; tiebreak = groups.map((g) => g[0]); made = [groups[0][0]];
  } else {
    cat = CAT.HIGH; tiebreak = ranks; made = [];
  }

  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (tiebreak[i] ?? 0);
  return { cat, tiebreak, score, made, cards };
}

function* combinations(arr, k, start = 0, prefix = []) {
  if (prefix.length === k) { yield prefix; return; }
  for (let i = start; i <= arr.length - (k - prefix.length); i++) {
    yield* combinations(arr, k, i + 1, [...prefix, arr[i]]);
  }
}

/** Best 5-card hand out of 5..7 cards. For fewer than 5 cards, evaluates what's there. */
export function bestHand(cards) {
  if (cards.length < 5) return evalPartial(cards);
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const h = eval5(combo);
    if (!best || h.score > best.score) best = h;
  }
  return best;
}

/** Evaluate fewer than 5 cards (pairs/trips/quads only; no straights or flushes). */
function evalPartial(cards) {
  const counts = new Map();
  for (const c of cards) counts.set(c.r, (counts.get(c.r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let cat = CAT.HIGH;
  let made = [];
  if (groups[0]?.[1] === 4) { cat = CAT.QUADS; made = [groups[0][0]]; }
  else if (groups[0]?.[1] === 3) { cat = CAT.TRIPS; made = [groups[0][0]]; }
  else if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) { cat = CAT.TWO_PAIR; made = [groups[0][0], groups[1][0]]; }
  else if (groups[0]?.[1] === 2) { cat = CAT.PAIR; made = [groups[0][0]]; }
  const tiebreak = groups.map((g) => g[0]);
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (tiebreak[i] ?? 0);
  return { cat, tiebreak, score, made, cards };
}

export function compareHands(a, b) {
  return Math.sign(a.score - b.score);
}

export function describeHand(h) {
  const n = (r) => ({ 14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens', 9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives', 4: 'Fours', 3: 'Threes', 2: 'Deuces' })[r];
  const s = (r) => ({ 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten' })[r] ?? String(r);
  const t = h.tiebreak;
  switch (h.cat) {
    case CAT.HIGH: return `${s(t[0])} high`;
    case CAT.PAIR: return `Pair of ${n(t[0])}`;
    case CAT.TWO_PAIR: return `Two pair, ${n(t[0])} and ${n(t[1])}`;
    case CAT.TRIPS: return `Three ${n(t[0])}`;
    case CAT.STRAIGHT: return `${s(t[0])}-high straight`;
    case CAT.FLUSH: return `${s(t[0])}-high flush`;
    case CAT.FULL_HOUSE: return `${n(t[0])} full of ${n(t[1])}`;
    case CAT.QUADS: return `Four ${n(t[0])}`;
    case CAT.STRAIGHT_FLUSH: return t[0] === 14 ? 'Royal flush' : `${s(t[0])}-high straight flush`;
    default: return CAT_NAMES[h.cat];
  }
}
