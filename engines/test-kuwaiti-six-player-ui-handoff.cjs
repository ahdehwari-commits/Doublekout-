const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../kuwaiti-six-player-ui.js'), 'utf8');

const status = source.match(/function setStatus\(msg\)\{([^}]*)\}/);
assert.ok(status, 'setStatus helper must exist');
assert.match(status[1], /classList\.remove\('hidden'\)/,
  'status prompts must be visible after auction completion');

const auctionStart = source.indexOf('function finishAuction()');
const contractChooser = source.indexOf('function aiChooseContract(', auctionStart);
assert.ok(auctionStart >= 0 && contractChooser > auctionStart,
  'auction completion and contract selection functions must exist');
const finishAuction = source.slice(auctionStart, contractChooser);
assert.match(finishAuction, /if\(isHumanSeat\(win\)\)\{[\s\S]*?setScreen\('game'\)/,
  'a human auction winner must remain on the six-player game screen');
assert.match(finishAuction, /kContractSetup'\)\.classList\.remove\('hidden'\)/,
  'the human contract selector must be shown');
assert.match(finishAuction, /setStatus\('مزایده را بردی؛ قرارداد و خال حکم را انتخاب کن/,
  'the next required action must be explained to the winner');
assert.match(finishAuction, /renderContractChoiceHand\(win\)/,
  'the winner hand must remain visible while choosing a contract');

const confirmBinding = source.match(/\$\('kConfirmContract'\)\.onclick=confirmWinningContract/);
assert.ok(confirmBinding, 'the contract confirmation button must be wired');
const startActual = source.slice(source.indexOf('function startActualGame('), source.indexOf('function auctionTurn('));
assert.match(startActual, /\$\('kStatus'\)\.classList\.remove\('hidden'\)/,
  'the first-card prompt must be visible when play begins');

console.log('PASS: six-player auction-to-contract-to-first-card UI handoff checks.');
