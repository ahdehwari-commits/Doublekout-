const assert = require('node:assert/strict');
const { cardPower, findHighestEligiblePlay } = require('./kuwaiti-card-power');
const suits = ['♠', '♥', '♦', '♣'];
const twos = suits.map(suit => ({ kind: 'normal', rank: '2', suit }));
const aces = suits.map(suit => ({ kind: 'normal', rank: 'A', suit }));
const red = { kind: 'joker', color: 'red' };
const black = { kind: 'joker', color: 'black' };

for (const card of twos) assert.equal(cardPower(card, 'naras'), 9000);
assert.equal(cardPower(black, 'naras'), 8000);
assert.equal(cardPower(red, 'naras'), 10000);

for (const card of aces) {
  assert.equal(cardPower(card, 'saras'), 9000);
  assert.equal(cardPower(card, 'tak_naras'), 9000);
}
for (const contract of ['saras', 'tak_naras']) {
  assert.equal(cardPower(black, contract), 8000);
  assert.equal(cardPower(red, contract), 10000);
}
assert.equal(cardPower({ kind: 'normal', rank: 'K' }, 'naras'), 12);

assert.equal(findHighestEligiblePlay([
  { playerId: 1, card: black },
  { playerId: 2, card: twos[0] },
  { playerId: 3, card: red }
], 'naras').playerId, 3);

assert.equal(findHighestEligiblePlay([
  { playerId: 1, card: black },
  { playerId: 2, card: aces[2] },
  { playerId: 3, card: red }
], 'saras').playerId, 3);

// Regression: invalid contracts must be rejected before special-card shortcuts.
for (const card of [red, black, twos[0]]) {
  assert.throws(() => cardPower(card, 'unknown'), /قرارداد کوت کویتی نامعتبر است/);
}
assert.throws(() => findHighestEligiblePlay([{ playerId: 1, card: red }], 'unknown'));

console.log('PASS: 18 assertions — card tiers, joker order, winner selection and invalid-contract regression');
