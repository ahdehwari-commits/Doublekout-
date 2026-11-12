const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../web-prototype.html'),'utf8');
const engineTag=html.indexOf('<script src="./engines/double-kout-sequence.js"></script>');
const scriptStart=html.indexOf('<script>',engineTag);
const scriptEnd=html.indexOf('</script>',scriptStart);
assert.ok(engineTag>=0&&scriptStart>engineTag&&scriptEnd>scriptStart,'main game script must exist after the engines');
new vm.Script(html.slice(scriptStart+8,scriptEnd),{filename:'web-prototype-inline.js'});
assert.ok(html.includes("activeMode='double-kout';$('hokmContractPicker').classList.remove('hidden')"));
assert.ok(html.includes("const selected=$('hokmContract').value;")&&html.includes("hokm_spades")&&html.includes("hokm_clubs")&&html.includes("partner_middle"));
assert.ok(html.includes("function beginNormalOrChallenge(challengerTeam)")&&html.includes("function confirmTrump()"),'both choice buttons must have defined handlers');
assert.ok(html.includes("function cardRank(c)")&&html.includes("c.rank!==undefined"),'card rank adapter must accept both r and rank fields');
assert.ok(html.includes("function winner(plays){const code=")&&html.includes("StandardHokmEngine.resolveTrick"));
assert.ok(html.includes("G.trickCompletePending||G.plays.length>=4"));
assert.ok(html.includes("G.trickCompletePending=true;G.turn=null"));
assert.ok(html.includes("G.resolvingTrick=true;G.trickCompletePending=false"));
assert.ok(html.includes("legal=G.turn===0&&!G.trickCompletePending&&G.plays.length<4"));
assert.ok(html.includes('خال کارت سوم از پنج کارت اول یار'),'partner-middle trump mode must be selectable');

const sixUi=fs.readFileSync(require.resolve('../kuwaiti-six-player-ui.js'),'utf8');
new vm.Script(sixUi,{filename:'kuwaiti-six-player-ui.js'});
for(const mode of ['hokm_spades','hokm_clubs','naras','tak_naras','saras','partner_middle']){
 assert.ok(sixUi.includes('value="'+mode+'"')||sixUi.includes("'"+mode+"'"),'six-player selector/engine must support '+mode);
}
assert.ok(sixUi.includes("game.contract=['naras','tak_naras','saras'].includes(bid.contract)?bid.contract:'hokm'"));
assert.ok(sixUi.includes("game.initialHands[(win+2)%6][2]"),'six-player partner-middle trump must use partner initial cards');

console.log('PASS: four/six-player contract choices, controls, rank adapter and trick lock');
