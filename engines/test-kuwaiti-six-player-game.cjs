const assert = require('node:assert/strict');
const K = require('./kuwaiti-six-player/engine.js');

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function playCompleteDeal(contract, auctionWinner, seed) {
  const game = K.newGame({ rng: seeded(seed) });
  assert.equal(game.players, 6);
  assert.equal(game.hands.length, 6);
  assert.ok(game.hands.every(hand => hand.length === 9));
  assert.equal(game.hands.flat().length, 54);
  assert.equal(game.auctionStarter, K.findOpeningPlayer(game.hands));

  const trumpSuit = contract === 'hokm' ? 'S' : null;
  K.startPlay(game, auctionWinner, contract, { trumpSuit });
  assert.equal(game.turn, auctionWinner);
  assert.equal(game.leader, auctionWinner);
  assert.equal(game.trickNo, 1);
  assert.equal(game.trick.length, 0);

  let plays = 0;
  while (!game.done) {
    const player = game.turn;
    const lead = K.effectiveLeadSuit(game.trick, { trickNo: game.trickNo });
    const activeTrump = game.trickNo === 1
      ? game.trumpSuit
      : (game.trumpSuit && (game.trumpAnnounced || player === game.auctionWinner)
        ? game.trumpSuit : null);
    const legal = K.legalCards(game.hands[player], lead, {
      trickNo: game.trickNo,
      isFirstPlay: game.trick.length === 0,
      trumpSuit: activeTrump,
      firstTrickNoCut: game.trickNo === 1
    });
    assert.ok(legal.length > 0, `no legal card for seat ${player}, trick ${game.trickNo}`);
    const result = K.playCard(game, player, legal[0]);
    plays++;
    if (result.completed) {
      assert.equal(game.trick.length, 0);
      assert.equal(game.turn, result.winner);
    }
  }

  assert.equal(plays, 54);
  assert.equal(game.trickWinners.length, 9);
  assert.equal(game.trickNo, 10);
  assert.ok(game.hands.every(hand => hand.length === 0));
  assert.equal(game.playedCards.length, 54);
}

let scenarios = 0;
for (const contract of ['hokm', 'naras', 'tak_naras', 'saras']) {
  for (let winner = 0; winner < 6; winner++) {
    playCompleteDeal(contract, winner, 20261115 + scenarios);
    scenarios++;
  }
}

assert.equal(K.scoreContract(6, 6), 6);
assert.equal(K.scoreContract(6, 5), -12);
assert.equal(K.scoreContract(7, 7), 7);
assert.equal(K.scoreContract(7, 6), -14);
assert.equal(K.scoreContract(8, 8), 8);
assert.equal(K.scoreContract(8, 7), -16, 'an 8-trick contract fails when opponents take 2 tricks');
assert.equal(K.scoreContract(9, 9), 36);
assert.equal(K.scoreContract(9, 8), -18, 'a 9-trick contract fails when opponents take even 1 trick');
assert.equal(K.scoreContract('malzoom', 5, { success: true }), 5);
assert.equal(K.scoreContract('malzoom', 4, { success: false }), -5);

console.log(`PASS: ${scenarios} complete six-player deals (all four contract families, every auction-winning seat) plus contract scoring.`);

const fs = require('node:fs');
const ui = fs.readFileSync(require.resolve('../kuwaiti-six-player-ui.js'), 'utf8');
assert.ok(ui.includes('points[bidderTeam]=(Number(points[bidderTeam])||0)+val'), 'match points must accumulate across deals');
assert.ok(ui.includes('مجموع امتیاز تیم الف') && ui.includes('مجموع امتیاز تیم ب'), 'result panel must show cumulative team totals');
assert.ok(ui.includes('const maxOpponentTricks=9-target;') && ui.includes('const success=opponentWon<=maxOpponentTricks;'), 'contract success must be decided by the opponents\' trick count');
assert.ok(ui.includes("if(!game||game.done)return;"), 'AI turns must silently stop after the deal is complete');
console.log('PASS: cumulative match scoring, opponent-trick contract thresholds, and post-game AI guard.');
