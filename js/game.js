// Hand flow and payouts for a single Ultimate Texas Hold'em hand.

import { dealHand } from './cards.js';
import { bestHand, CAT, describeHand } from './evaluator.js';
import { decisionFor } from './strategy.js';

export const STREETS = ['preflop', 'flop', 'river'];
export const RAISE_MULT = { preflop: 4, flop: 2, river: 1 };

/** Blind pays only when the player wins with a straight or better. */
export function blindPayout(hand) {
  switch (hand.cat) {
    case CAT.STRAIGHT_FLUSH: return hand.tiebreak[0] === 14 ? 500 : 50;
    case CAT.QUADS: return 10;
    case CAT.FULL_HOUSE: return 3;
    case CAT.FLUSH: return 1.5;
    case CAT.STRAIGHT: return 1;
    default: return 0;
  }
}

export function newHand(rng = Math.random, layout = dealHand(rng)) {
  return {
    ...layout,
    street: 'preflop',
    playMult: 0,
    folded: false,
    decisions: [],
    result: null,
  };
}

/** How many board cards are visible on each street. */
export function visibleBoard(state) {
  if (state.street === 'preflop') return 0;
  if (state.street === 'flop') return 3;
  return 5;
}

/**
 * Apply the player's action ('raise' | 'check' | 'fold') on the current street.
 * Records whether it matched strategy. Returns the new state (does not mutate).
 */
export function act(state, action) {
  if (state.street === 'showdown') throw new Error('Hand is over');
  const street = state.street;
  const correct = decisionFor(street, state.player, state.board);
  const decision = {
    street,
    chosen: action,
    correct: correct.action,
    isCorrect: action === correct.action,
    info: correct,
  };
  const next = { ...state, decisions: [...state.decisions, decision] };

  if (action === 'raise') {
    next.playMult = RAISE_MULT[street];
    next.street = 'showdown';
  } else if (action === 'fold') {
    if (street !== 'river') throw new Error('Can only fold on the river');
    next.folded = true;
    next.street = 'showdown';
  } else if (action === 'check') {
    if (street === 'river') throw new Error('Cannot check the river');
    next.street = street === 'preflop' ? 'flop' : 'river';
  } else {
    throw new Error(`Unknown action ${action}`);
  }
  if (next.street === 'showdown') next.result = resolve(next);
  return next;
}

/** Settle all bets in units of the ante. Returns per-bet net results. */
export function resolve(state) {
  const playerHand = bestHand([...state.player, ...state.board]);
  const dealerHand = bestHand([...state.dealer, ...state.board]);
  const qualifies = dealerHand.cat >= CAT.PAIR;
  const base = { playerHand, dealerHand, qualifies, playerDesc: describeHand(playerHand), dealerDesc: describeHand(dealerHand) };

  if (state.folded) {
    return { ...base, outcome: 'fold', ante: -1, blind: -1, play: 0, net: -2 };
  }
  const play = state.playMult;
  const cmp = Math.sign(playerHand.score - dealerHand.score);
  if (cmp > 0) {
    const ante = qualifies ? 1 : 0;
    const blind = blindPayout(playerHand);
    return { ...base, outcome: 'win', ante, blind, play, net: ante + blind + play };
  }
  if (cmp < 0) {
    const ante = qualifies ? -1 : 0;
    return { ...base, outcome: 'lose', ante, blind: -1, play: -play, net: ante - 1 - play };
  }
  return { ...base, outcome: 'push', ante: 0, blind: 0, play: 0, net: 0 };
}
