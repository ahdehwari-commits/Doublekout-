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
assert.ok(ui.includes('const maxOpponentTricks=9-target;') && ui.includes('const success=won>=target;'), 'contract success must be decided by the bidder team reaching its target');
assert.ok(ui.includes("if(!game||game.done)return;"), 'AI turns must silently stop after the deal is complete');
console.log('PASS: cumulative match scoring, opponent-trick contract thresholds, and post-game AI guard.');

assert.equal(K.contractProgress(9, 0, 1), 'failed', '9-trick bid fails as soon as opponents take one trick');
assert.equal(K.contractProgress(8, 0, 1), null, '8-trick bid remains possible after one opponent trick');
assert.equal(K.contractProgress(8, 0, 2), 'failed', '8-trick bid fails as soon as opponents take two tricks');
assert.equal(K.contractProgress(8, 8, 0), 'success', '8-trick bid ends immediately when bidder team reaches eight');
assert.equal(K.contractProgress(7, 0, 3), 'failed');
assert.equal(K.contractProgress(6, 0, 4), 'failed');
assert.ok(ui.includes("const matchOver=isMatchOver();"), 'match end must depend on accumulated score threshold');
assert.ok(ui.includes('value="-54"') && ui.includes('value="108"') && ui.includes('value="-108"'), 'all four signed score targets must be selectable');
console.log('PASS: contracts terminate as soon as success/failure is mathematically certain; match ends at signed score target.');

assert.ok(ui.includes('id="kDifficulty"'), 'six-player table must expose four AI difficulty levels');
for (const level of ['easy','normal','hard','expert']) assert.ok(ui.includes('value="'+level+'"'), 'missing AI difficulty: '+level);
assert.ok(ui.includes('simulateCandidate(item.card,64)'), 'expert AI must use hidden-hand Monte Carlo analysis');
assert.ok(ui.includes('voidSuits') && ui.includes('K.findTrickWinner(plays'), 'advanced AI must use revealed void suits and official trick resolution');
console.log('PASS: four selectable six-player AI levels and hidden-hand analysis are wired into live card selection.');

assert.ok(ui.includes('bidAdjustment={easy:-3.5,normal:0,hard:1.5,expert:3}') && ui.includes('malzoomThreshold={easy:18,normal:22,hard:24,expert:26}'), 'easy AI must bid more readily while hard and expert AI require stronger hands');
console.log('PASS: AI difficulty also scales auction aggression by hand strength.');

