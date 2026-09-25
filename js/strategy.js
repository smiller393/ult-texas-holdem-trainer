// Wizard of Odds simple strategy for Ultimate Texas Hold'em, with explanations.
// https://wizardofodds.com/games/ultimate-texas-hold-em/

import { rankLabel, rankName, rankPlural, remainingDeck, cardText, SUIT_SYMBOLS } from './cards.js';
import { bestHand, CAT, CAT_NAMES, describeHand } from './evaluator.js';

export const OUTS_THRESHOLD = 21;

const hiLo = (hole) => {
  const [a, b] = hole;
  return a.r >= b.r ? [a.r, b.r] : [b.r, a.r];
};

/** Short hand code like "AKs", "T9o", "77". */
export function holeCode(hole) {
  const [hi, lo] = hiLo(hole);
  const h = rankLabel(hi).replace('10', 'T');
  const l = rankLabel(lo).replace('10', 'T');
  if (hi === lo) return h + l;
  return h + l + (hole[0].s === hole[1].s ? 's' : 'o');
}

/**
 * Preflop: raise 4x or check.
 * Raise with 33+, any ace, K-x suited, K5o+, Q6s+, Q8o+, J8s+, JTo.
 */
export function preflopDecision(hole) {
  const [hi, lo] = hiLo(hole);
  const suited = hole[0].s === hole[1].s;
  const code = holeCode(hole);
  const raise = (rule, detail) => ({ action: 'raise', rule, reason: detail ?? rule, code });
  const check = (rule, detail) => ({ action: 'check', rule, reason: detail ?? rule, code });

  if (hi === lo) {
    if (hi >= 3) return raise('Any pair 3-3 or higher', `Pocket ${rankPlural(hi)}: every pair from 3-3 up gets the 4x raise.`);
    return check('Pocket deuces are the one pair you check', 'Pocket 2s are the only pair you check preflop. Every pair from 3-3 up raises 4x.');
  }
  if (hi === 14) return raise('Any ace', `${code}: any hand with an Ace raises 4x, suited or not, no matter the kicker.`);
  if (hi === 13) {
    if (suited) return raise('King + any suited card', `${code}: a King with ANY suited kicker raises 4x (K2s and up).`);
    if (lo >= 5) return raise('K-5 offsuit or better', `${code}: offsuit Kings raise with a 5 or better kicker (K5o+).`);
    return check('Offsuit King needs a 5+', `${code}: offsuit Kings need a 5 or better kicker (K5o+). K${rankLabel(lo)} offsuit falls short. (If it were suited, you'd raise.)`);
  }
  if (hi === 12) {
    if (suited) {
      if (lo >= 6) return raise('Q-6 suited or better', `${code}: suited Queens raise with a 6 or better kicker (Q6s+).`);
      return check('Suited Queen needs a 6+', `${code}: suited Queens need a 6 or better kicker (Q6s+).`);
    }
    if (lo >= 8) return raise('Q-8 offsuit or better', `${code}: offsuit Queens raise with an 8 or better kicker (Q8o+).`);
    return check('Offsuit Queen needs an 8+', `${code}: offsuit Queens need an 8 or better kicker (Q8o+).${lo >= 6 ? ' Suited it would be a raise (Q6s+).' : ''}`);
  }
  if (hi === 11) {
    if (suited) {
      if (lo >= 8) return raise('J-8 suited or better', `${code}: suited Jacks raise with an 8 or better kicker (J8s+).`);
      return check('Suited Jack needs an 8+', `${code}: suited Jacks need an 8 or better kicker (J8s+).`);
    }
    if (lo >= 10) return raise('J-10 offsuit', `${code}: J-10 is the only offsuit Jack that raises (JTo).`);
    return check('Offsuit Jack needs a 10', `${code}: the only offsuit Jack that raises is J-10.${lo >= 8 ? ' Suited it would be a raise (J8s+).' : ''}`);
  }
  return check('Ten-high or worse: check', `${code}: unpaired hands without an A, K, Q or J never raise preflop. Check and see the flop.`);
}

/** True if a hole card rank is part of the made portion of the hand (pair/trips/etc). */
function holeInMade(hand, hole) {
  if (hand.cat === CAT.STRAIGHT || hand.cat === CAT.FLUSH || hand.cat === CAT.STRAIGHT_FLUSH) return true;
  return hand.made.some((r) => hole.some((c) => c.r === r));
}

function fourFlush(hole, board) {
  const all = [...hole, ...board];
  for (const s of Object.keys(SUIT_SYMBOLS)) {
    const n = all.filter((c) => c.s === s).length;
    if (n >= 4) {
      const hidden = hole.filter((c) => c.s === s);
      const bigHidden = hidden.filter((c) => c.r >= 10);
      return { suit: s, hidden, bigHidden };
    }
  }
  return null;
}

/**
 * Flop: raise 2x or check.
 * Raise with two pair or better, hidden pair (except pocket deuces), or four to a
 * flush with a hidden 10 or better of that suit.
 */
export function flopDecision(hole, flop) {
  const hand = bestHand([...hole, ...flop]);
  const desc = describeHand(hand);
  const hidden = holeInMade(hand, hole);
  const pocketPair = hole[0].r === hole[1].r;

  if (hand.cat >= CAT.TWO_PAIR && hidden) {
    return { action: 'raise', rule: 'Two pair or better', reason: `You have ${desc.toLowerCase()} using your hole cards. Two pair or better always raises 2x on the flop.`, hand };
  }
  if (hand.cat === CAT.PAIR && hidden) {
    if (pocketPair && hole[0].r === 2) {
      return { action: 'check', rule: 'Pocket deuces exception', reason: 'Pocket 2s are the one hidden pair that does NOT raise on the flop. Check.', hand };
    }
    return { action: 'raise', rule: 'Hidden pair (not pocket 2s)', reason: `You have a hidden ${desc.toLowerCase()} (a pair using your hole card${pocketPair ? 's' : ''}). Any hidden pair except pocket 2s raises 2x.`, hand };
  }
  const ff = fourFlush(hole, flop);
  if (ff && ff.bigHidden.length) return flushRaise(ff, hand);

  // Checking. Explain what the hand is missing.
  let reason;
  if (ff && ff.hidden.length) {
    reason = `You have four to a flush (${SUIT_SYMBOLS[ff.suit]}), but it needs a hidden 10 or better in that suit. Your ${ff.hidden.map(cardText).join(' ')} ${ff.hidden.length > 1 ? 'are' : 'is'} too low. Check.`;
  } else if (hand.cat >= CAT.PAIR && !hidden) {
    reason = `The ${desc.toLowerCase()} is all on the board, so the dealer has it too. It isn't a hidden pair. Check.`;
  } else {
    reason = `${desc} with no hidden pair and no qualifying flush draw. Straight draws and overcards don't count. Check.`;
  }
  return { action: 'check', rule: 'Nothing that qualifies', reason, hand };
}

function flushRaise(ff, hand) {
  const big = ff.bigHidden.map(cardText).join(' ');
  return {
    action: 'raise',
    rule: 'Four to a flush with hidden 10+',
    reason: `Four to a flush (${SUIT_SYMBOLS[ff.suit]}) with a hidden 10 or better in the suit (${big}). Raise 2x.`,
    hand,
  };
}

/** Does the player have a hidden pair or better on the river (and does it actually beat the board)? */
export function riverHidden(hole, board) {
  const hand = bestHand([...hole, ...board]);
  const boardHand = bestHand(board);
  const hidden = hand.cat >= CAT.PAIR && holeInMade(hand, hole) && hand.score > boardHand.score;
  return { hidden, hand, boardHand };
}

const OUT_LABEL_ORDER = [
  'Pairs the board', 'Out-kicks you', 'Makes two pair', 'Makes trips', 'Completes a straight',
  'Makes a higher straight', 'Completes a flush', 'Makes a higher flush', 'Makes a full house',
  'Makes a higher full house', 'Makes quads', 'Makes a straight flush',
];

function outLabel(dealer, player) {
  if (dealer.cat > player.cat) {
    switch (dealer.cat) {
      case CAT.PAIR: return 'Pairs the board';
      case CAT.TWO_PAIR: return 'Makes two pair';
      case CAT.TRIPS: return 'Makes trips';
      case CAT.STRAIGHT: return 'Completes a straight';
      case CAT.FLUSH: return 'Completes a flush';
      case CAT.FULL_HOUSE: return 'Makes a full house';
      case CAT.QUADS: return 'Makes quads';
      default: return 'Makes a straight flush';
    }
  }
  if (dealer.cat === CAT.STRAIGHT) return 'Makes a higher straight';
  if (dealer.cat === CAT.FLUSH) return 'Makes a higher flush';
  if (dealer.cat === CAT.FULL_HOUSE) return 'Makes a higher full house';
  if (dealer.cat === CAT.STRAIGHT_FLUSH) return 'Makes a straight flush';
  return 'Out-kicks you';
}

/**
 * Count dealer outs: unseen cards that, combined with the board, BEAT the player.
 * Cards that tie (push) are not outs.
 */
export function countOuts(hole, board) {
  const player = bestHand([...hole, ...board]);
  const unseen = remainingDeck([...hole, ...board]);
  const outs = [];
  const ties = [];
  const groups = new Map();
  for (const c of unseen) {
    const dealer = bestHand([...board, c]);
    if (dealer.score > player.score) {
      outs.push(c);
      const label = outLabel(dealer, player);
      if (!groups.has(label)) groups.set(label, { label, cards: [] });
      groups.get(label).cards.push(c);
    } else if (dealer.score === player.score) {
      ties.push(c);
    }
  }
  const groupList = [...groups.values()]
    .sort((a, b) => OUT_LABEL_ORDER.indexOf(a.label) - OUT_LABEL_ORDER.indexOf(b.label))
    .map((g) => ({ ...g, count: g.cards.length, ranks: rankCounts(g.cards) }));
  return { outs, ties, groups: groupList, unseen, player, tieRanks: rankCounts(ties) };
}

/** [{ r, n }] sorted by rank descending. */
function rankCounts(cards) {
  const m = new Map();
  for (const c of cards) m.set(c.r, (m.get(c.r) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([r, n]) => ({ r, n }));
}

export function formatRankCounts(rc) {
  return rc.map(({ r, n }) => (n === 4 ? `${rankLabel(r)}` : `${rankLabel(r)}×${n}`)).join(', ');
}

/**
 * River: raise 1x or fold.
 * Raise with a hidden pair or better, or if fewer than 21 dealer outs beat you.
 */
export function riverDecision(hole, board) {
  const { hidden, hand, boardHand } = riverHidden(hole, board);
  const desc = describeHand(hand);
  if (hidden) {
    return {
      action: 'raise', rule: 'Hidden pair or better', hand, hidden: true,
      reason: `You have ${desc.toLowerCase()} with help from your hole cards, and it beats what's on the board. Hidden pair or better always raises 1x. No need to count outs.`,
    };
  }
  const o = countOuts(hole, board);
  const n = o.outs.length;
  const action = n < OUTS_THRESHOLD ? 'raise' : 'fold';
  const parts = o.groups.map((g) => `${g.count} ${g.label.toLowerCase()}`).join(', ');
  let lead = `No hidden pair: you're playing ${desc.toLowerCase()}${hand.score === boardHand.score ? ' (the board plays)' : ''}.`;
  const holeMatches = hole.some((c) => board.some((b) => b.r === c.r)) || hole[0].r === hole[1].r;
  if (holeMatches) {
    lead += ' Your pair doesn\'t count as hidden because it doesn\'t improve on the board\'s hand.';
  }
  const tieNote = o.ties.length ? ` (${o.ties.length} more would only push, so they don't count.)` : '';
  const verdict = action === 'raise'
    ? `${n} is fewer than ${OUTS_THRESHOLD}, so raise 1x.`
    : `${n} is ${OUTS_THRESHOLD} or more, so fold.`;
  return {
    action, rule: action === 'raise' ? `Fewer than ${OUTS_THRESHOLD} dealer outs` : `${OUTS_THRESHOLD}+ dealer outs`,
    reason: `${lead} ${n} dealer card${n === 1 ? '' : 's'} beat you${parts ? ` (${parts})` : ''}.${tieNote} ${verdict}`,
    hand, hidden: false, outs: o,
  };
}

export const ACTION_LABELS = {
  preflop: { raise: 'Raise 4x', check: 'Check' },
  flop: { raise: 'Raise 2x', check: 'Check' },
  river: { raise: 'Raise 1x', fold: 'Fold' },
};

export function decisionFor(street, hole, board) {
  if (street === 'preflop') return preflopDecision(hole);
  if (street === 'flop') return flopDecision(hole, board.slice(0, 3));
  return riverDecision(hole, board);
}

export { CAT_NAMES, rankName };
