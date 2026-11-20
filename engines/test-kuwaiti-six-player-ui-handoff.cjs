const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../kuwaiti-six-player-ui.js'), 'utf8');

assert.ok(source.includes("function setStatus(msg){") && source.includes("classList.remove('hidden')"),
  'status prompts must be visible after auction completion');
assert.ok(source.includes("aria-live"),
  'status must be announced accessibly');

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

assert.ok(source.includes('function aiCardBase(p)')&&source.includes('DoubleKoutLearning.getSuggestion')&&source.includes("['kuwaiti',game.contract||'hokm',trickNo,patternLead||'-',legal.length,trumpCount,0,0].join('|')"),'six-player AI must consume matching anonymous strategy evidence from the central database');
console.log('PASS: six-player auction-to-contract-to-first-card UI handoff checks.');

const playOne = source.slice(source.indexOf('function playOne('), source.indexOf('function cardLabel('));
assert.match(playOne, /throwOnError=false/, 'AI card-play failures must propagate to the AI fallback');
assert.match(playOne, /if\(throwOnError\)throw e/, 'AI card-play errors must not be swallowed');
const aiTurn = source.slice(source.indexOf('function playAITurn('), source.indexOf('function renderGame('));
assert.match(aiTurn, /setStatus\('نوبت هوش مصنوعی:/, 'AI turn start must be visible in the status bar');
assert.match(aiTurn, /playOne\(p,c,true\)/, 'AI primary card-play failure must trigger fallback');
assert.match(aiTurn, /playOne\(p,allowed\[0\],true\)/, 'AI fallback card-play failure must be reported');
assert.ok(source.includes('aria-live'), 'status must be announced accessibly');
console.log('PASS: AI card-play errors propagate to fallback and status diagnostics remain visible.');

const webPrototype = fs.readFileSync(require.resolve('../web-prototype.html'), 'utf8');
const speakStart = webPrototype.indexOf("function speakPlayer(kind='play',player=1){");
const speakEnd = webPrototype.indexOf("function shuffle(", speakStart);
const speakPlayer = webPrototype.slice(speakStart, speakEnd);
assert.ok(speakPlayer.includes('Array.isArray(requested)&&requested.length'),
  'voice playback must safely handle missing voice categories');
assert.ok(speakPlayer.includes("['کارت بازی شد!']"),
  'voice playback must have a non-empty fallback and never access undefined pool.length');
console.log('PASS: missing speech categories cannot interrupt card play.');

// The phase-modal wrapper must contain only auction/contract panels, never the table.
const phaseModalStart = source.indexOf('<div id="kPhaseModal"');
const tableStart = source.indexOf('<div class="k-table" id="kTable">', phaseModalStart);
const phaseModalClose = source.indexOf('</div></div>\n <div class="k-table" id="kTable">', phaseModalStart);
assert.ok(phaseModalStart >= 0 && phaseModalClose > phaseModalStart && tableStart > phaseModalClose,
  'the six-player table must be outside the hidden phase-modal wrapper');
console.log('PASS: hiding the contract modal cannot hide the six-player table.');

// No phone-handoff gate remains in six-player offline mode.
assert.ok(!source.includes('kHotseatGate') && !source.includes('تحویل گوشی') && !source.includes('kRevealHand'),
  'offline six-player play must not display a phone-handoff gate');

// Switching from offline to online clears the old deal, result, and delayed auction-summary timer.
assert.match(source, /function resetKuwaitiUiForOnlineAttach\(\)/);
assert.match(source, /resetKuwaitiUiForOnlineAttach\(\);\s*onlineKuwaiti=/);
assert.match(source, /function clearKuwaitiAuctionSummaryTimer\(\)/);
assert.match(source, /game!==summaryGame\|\|isOnlineKuwaiti\(\)\|\|auction/);
assert.match(source, /Clear stale offline result\/next-game controls[\s\S]*?kResult[\s\S]*?kNewGame/);
console.log('PASS: online attach resets stale offline UI and timer; no handoff overlay remains.');
