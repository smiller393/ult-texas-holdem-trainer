import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../../js/cards.js';
import { newHand, act, blindPayout } from '../../js/game.js';
import { bestHand } from '../../js/evaluator.js';
import { Stats } from '../../js/stats.js';

const layout = (player, dealer, board) => ({
  player: parseCards(player), dealer: parseCards(dealer), board: parseCards(board),
});

test('preflop raise wins 4x play + ante; blind pushes without a straight', () => {
  let s = newHand(undefined, layout('As Ad', 'Kc Kd', '2h 7s 9c Jd 4h'));
  s = act(s, 'raise');
  assert.equal(s.street, 'showdown');
  assert.equal(s.result.outcome, 'win');
  assert.equal(s.result.play, 4);
  assert.equal(s.result.ante, 1);
  assert.equal(s.result.blind, 0);
  assert.equal(s.result.net, 5);
  assert.ok(s.decisions[0].isCorrect);
});

test('dealer not qualifying pushes the ante', () => {
  let s = newHand(undefined, layout('As Kd', 'Qc 3d', '2h 7s 9c Jd 4h'));
  s = act(s, 'raise');
  assert.equal(s.result.qualifies, false);
  assert.equal(s.result.ante, 0);
  assert.equal(s.result.net, 4);
});

test('check, check, fold loses ante and blind', () => {
  let s = newHand(undefined, layout('7s 2d', 'Qc 3d', 'Kh 9s 4c 8d 5h'));
  s = act(s, 'check');
  assert.equal(s.street, 'flop');
  s = act(s, 'check');
  assert.equal(s.street, 'river');
  s = act(s, 'fold');
  assert.equal(s.result.outcome, 'fold');
  assert.equal(s.result.net, -2);
  assert.equal(s.decisions.length, 3);
});

test('losing a 1x river bet loses ante, blind, play', () => {
  let s = newHand(undefined, layout('Qs 3d', 'Ac Ad', 'Kh 9s 4c 8d 5h'));
  s = act(s, 'check');
  s = act(s, 'check');
  s = act(s, 'raise');
  assert.equal(s.result.outcome, 'lose');
  assert.equal(s.result.net, -3);
});

test('blind pay table', () => {
  assert.equal(blindPayout(bestHand(parseCards('As Ks Qs Js Ts'))), 500);
  assert.equal(blindPayout(bestHand(parseCards('9s Ks Qs Js Ts'))), 50);
  assert.equal(blindPayout(bestHand(parseCards('9s 9d 9h 9c Ts'))), 10);
  assert.equal(blindPayout(bestHand(parseCards('9s 9d 9h Tc Ts'))), 3);
  assert.equal(blindPayout(bestHand(parseCards('2s 5s 9s Js Ks'))), 1.5);
  assert.equal(blindPayout(bestHand(parseCards('5s 6d 7h 8c 9s'))), 1);
  assert.equal(blindPayout(bestHand(parseCards('5s 5d 7h 8c 9s'))), 0);
});

test('flush win pays blind 3:2', () => {
  let s = newHand(undefined, layout('As 3s', 'Kc Kd', '2s 7s 9s Jd 4h'));
  s = act(s, 'raise');
  assert.equal(s.result.blind, 1.5);
  assert.equal(s.result.net, 4 + 1 + 1.5);
});

test('stats track accuracy, streaks and mistakes', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const st = new Stats(storage);
  st.record('preflop', true);
  st.record('preflop', true);
  st.record('river', false, { note: 'x' });
  assert.equal(st.data.by.preflop.correct, 2);
  assert.equal(st.data.by.river.total, 1);
  assert.equal(st.data.streak, 0);
  assert.equal(st.data.bestStreak, 2);
  assert.equal(st.data.mistakes.length, 1);
  const reloaded = new Stats(storage);
  assert.equal(reloaded.totals().total, 3);
});
