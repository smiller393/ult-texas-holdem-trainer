import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../../js/cards.js';
import { preflopDecision, flopDecision, riverDecision, countOuts } from '../../js/strategy.js';

const pre = (s) => preflopDecision(parseCards(s)).action;
const flop = (hole, board) => flopDecision(parseCards(hole), parseCards(board)).action;
const river = (hole, board) => riverDecision(parseCards(hole), parseCards(board));

test('preflop: pairs 3-3 and up raise, deuces check', () => {
  assert.equal(pre('3s 3d'), 'raise');
  assert.equal(pre('Ah Ad'), 'raise');
  assert.equal(pre('2s 2d'), 'check');
});

test('preflop: any ace raises', () => {
  assert.equal(pre('As 2d'), 'raise');
  assert.equal(pre('Ah 7h'), 'raise');
});

test('preflop: kings', () => {
  assert.equal(pre('Ks 2s'), 'raise');
  assert.equal(pre('Ks 5d'), 'raise');
  assert.equal(pre('Ks 4d'), 'check');
  assert.equal(pre('Kh Qc'), 'raise');
});

test('preflop: queens', () => {
  assert.equal(pre('Qs 6s'), 'raise');
  assert.equal(pre('Qs 5s'), 'check');
  assert.equal(pre('Qs 8d'), 'raise');
  assert.equal(pre('Qs 7d'), 'check');
});

test('preflop: jacks', () => {
  assert.equal(pre('Js 8s'), 'raise');
  assert.equal(pre('Js 7s'), 'check');
  assert.equal(pre('Js Td'), 'raise');
  assert.equal(pre('Js 9d'), 'check');
});

test('preflop: ten-high and below check', () => {
  assert.equal(pre('Ts 9s'), 'check');
  assert.equal(pre('7s 2d'), 'check');
});

test('preflop: count of raising hands matches the WoO chart (1326 combos)', () => {
  // Pairs 33-AA: 12*6=72. Ax: 12*16=192. Kx suited (K2s-KQs): 11*4=44. K5o-KQo: 8*12=96.
  // Q6s-QJs: 6*4=24. Q8o-QJo: 4*12=48. J8s-JTs: 3*4=12. JTo: 12. Total 500.
  const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const suits = ['s', 'h', 'd', 'c'];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push({ r, s });
  let raises = 0;
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      if (preflopDecision([deck[i], deck[j]]).action === 'raise') raises++;
    }
  }
  assert.equal(raises, 500);
});

test('flop: two pair or better raises', () => {
  assert.equal(flop('Ks 7d', 'Kh 7c 2s'), 'raise');
  assert.equal(flop('4s 4d', '7h 7c Ks'), 'raise');
  assert.equal(flop('9s 8d', '7h 6c 5s'), 'raise'); // straight
});

test('flop: hidden pair raises except pocket deuces', () => {
  assert.equal(flop('Ks 3d', '3h 9c 7s'), 'raise');
  assert.equal(flop('5s 5d', 'Ah Kc Qs'), 'raise');
  assert.equal(flop('2s 2d', 'Ah Kc Qs'), 'check');
  assert.equal(flop('2s 9d', '2h Kc Qd'), 'raise'); // paired deuce on board is not "pocket" deuces
});

test('flop: board pair alone is not hidden', () => {
  assert.equal(flop('As Qd', '7h 7c 2s'), 'check');
});

test('flop: four to a flush needs a hidden 10 or better', () => {
  assert.equal(flop('Ts 4s', '8s 2s Kd'), 'raise');
  assert.equal(flop('As 4d', '8s 2s 3s'), 'raise');
  assert.equal(flop('9s 4s', '8s 2s Kd'), 'check');
  assert.equal(flop('9s 4d', 'Ts 2s 3s'), 'check'); // the 10 is on the board, not hidden
});

test('flop: pocket deuces with a four-flush still check (the hidden 2 is below a 10)', () => {
  assert.equal(flop('2s 2d', 'As 7s 9s'), 'check');
});

test('river: WoO worked example, 23 outs, fold', () => {
  // Board K-7-2-A-10, player holds a 9 plus a non-playing card.
  const d = river('9h 3c', 'Kd 7s 2h Ac Td');
  assert.equal(d.hidden, false);
  assert.equal(d.outs.outs.length, 23);
  assert.equal(d.action, 'fold');
  const pairs = d.outs.groups.find((g) => g.label === 'Pairs the board');
  const kick = d.outs.groups.find((g) => g.label === 'Out-kicks you');
  assert.equal(pairs.count, 15);
  assert.equal(kick.count, 8);
  // The other three nines push, so they are not outs.
  assert.equal(d.outs.ties.length, 3);
  assert.ok(d.outs.ties.every((c) => c.r === 9));
});

test('river: best kicker available raises (under 21)', () => {
  // Player Q with board K-7-2-A-10: only J pushes? No: Q is the best missing rank, so only pairs beat you.
  const d = river('Qh 3c', 'Kd 7s 2h Ac Td');
  assert.equal(d.outs.outs.length, 15);
  assert.equal(d.action, 'raise');
});

test('river: second-best kicker is 19 outs, raise', () => {
  const d = river('Jh 3c', 'Kd 7s 2h Ac Td');
  assert.equal(d.outs.outs.length, 19);
  assert.equal(d.action, 'raise');
});

test('river: hidden pair raises without counting outs', () => {
  const d = river('3h 4c', 'Kd 7s 3s Ac Td');
  assert.equal(d.hidden, true);
  assert.equal(d.action, 'raise');
});

test('river: pocket pair that does not play is not hidden', () => {
  const d = river('4h 4c', 'Kd Ks 9h 9c 5d');
  assert.equal(d.hidden, false);
  assert.ok(d.outs);
});

test('river: board straight that player cannot improve counts outs', () => {
  const d = river('2h 2c', '5d 6s 7h 8c 9d');
  assert.equal(d.hidden, false);
  // Only a Ten (higher straight) beats you: 4 outs. Everything else pushes.
  assert.equal(d.outs.outs.length, 4);
  assert.equal(d.action, 'raise');
});

test('river: four-flush board adds flush outs', () => {
  const { outs, groups } = countOuts(parseCards('Kd 3c'), parseCards('2h 7h 9h Jh 4s'));
  const flush = groups.find((g) => g.label === 'Completes a flush');
  assert.equal(flush.count, 9);
  // No overlap: each card is counted once.
  assert.equal(new Set(outs.map((c) => c.r + c.s)).size, outs.length);
});

test('river: outs are counted from 45 unseen cards', () => {
  const { unseen } = countOuts(parseCards('Kd 3c'), parseCards('2h 7h 9h Jh 4s'));
  assert.equal(unseen.length, 45);
});
