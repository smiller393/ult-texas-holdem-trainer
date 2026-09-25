import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../../js/cards.js';
import { bestHand, CAT, describeHand } from '../../js/evaluator.js';

const best = (s) => bestHand(parseCards(s));

test('recognizes every category', () => {
  assert.equal(best('As Ks Qs Js Ts 2d 3c').cat, CAT.STRAIGHT_FLUSH);
  assert.equal(best('9h 9d 9s 9c 2d 3c 4h').cat, CAT.QUADS);
  assert.equal(best('9h 9d 9s 4c 4d 3c 2h').cat, CAT.FULL_HOUSE);
  assert.equal(best('2h 7h 9h Jh Kh 3c 4d').cat, CAT.FLUSH);
  assert.equal(best('5h 6d 7s 8c 9d Kc 2h').cat, CAT.STRAIGHT);
  assert.equal(best('5h 5d 5s 8c 9d Kc 2h').cat, CAT.TRIPS);
  assert.equal(best('5h 5d 8s 8c 9d Kc 2h').cat, CAT.TWO_PAIR);
  assert.equal(best('5h 5d 7s 8c 9d Kc 2h').cat, CAT.PAIR);
  assert.equal(best('5h 3d 7s 8c 9d Kc 2h').cat, CAT.HIGH);
});

test('wheel straight is five-high and loses to six-high', () => {
  const wheel = best('Ah 2d 3s 4c 5d');
  const six = best('2d 3s 4c 5d 6h');
  assert.equal(wheel.cat, CAT.STRAIGHT);
  assert.equal(wheel.tiebreak[0], 5);
  assert.ok(six.score > wheel.score);
});

test('kickers break ties', () => {
  assert.ok(best('Ah Kd 9s 7c 4d').score > best('Ah Qd 9s 7c 4d').score);
  assert.ok(best('7h 7d As 3c 2d').score > best('7h 7d Ks Qc Jd').score);
  assert.equal(best('Ah Kd 9s 7c 4d 3h 2c').score, best('As Kc 9d 7h 4s 3c 2d').score);
});

test('two pair uses best kicker from seven cards', () => {
  const h = best('Kh Kd 9s 9c Ad 2h 3c');
  assert.deepEqual(h.tiebreak, [13, 9, 14]);
});

test('describes hands', () => {
  assert.equal(describeHand(best('As Ks Qs Js Ts')), 'Royal flush');
  assert.equal(describeHand(best('9h 9d 9s 4c 4d')), 'Nines full of Fours');
  assert.equal(describeHand(best('Kh 3d 7s 8c 9d')), 'King high');
});
