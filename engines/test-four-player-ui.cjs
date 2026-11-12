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
assert.ok(html.includes('خال کارت وسط از پنج کارت اول یار'),'partner-middle trump mode must be selectable');

const sixUi=fs.readFileSync(require.resolve('../kuwaiti-six-player-ui.js'),'utf8');
new vm.Script(sixUi,{filename:'kuwaiti-six-player-ui.js'});
for(const mode of ['hokm_spades','hokm_clubs','naras','tak_naras','saras']){
 assert.ok(sixUi.includes('value="'+mode+'"')||sixUi.includes("'"+mode+"'"),'six-player selector/engine must support '+mode);
}
assert.ok(sixUi.includes("game.contract=['naras','tak_naras','saras'].includes(bid.contract)?bid.contract:'hokm'"));
assert.ok(!sixUi.includes('partner_middle'),'six-player partner-middle must be completely removed');


const auctionUi=fs.readFileSync(require.resolve('../kuwaiti-six-player-ui.js'),'utf8');
assert.ok(auctionUi.includes('id="kAuctionLog"'),'auction must show a turn-by-turn log');
assert.ok(auctionUi.includes('id="kHumanAuctionControls"'),'only human bidding controls should hide during AI turns');
assert.ok(auctionUi.includes("$('kAuction').classList.remove('hidden')"),'auction rotation stays visible while AI players act');
assert.ok(auctionUi.includes('data-bid="8"'),'8-trick bid must be available');
assert.ok(auctionUi.includes('function renderAuctionHand()'),'human hand must be visible during auction');
assert.ok(auctionUi.includes("auction.current===0"),'auction must wait for the human only on their own turn');
assert.ok(auctionUi.includes("if(auction.current===0){renderAuction();return;}"),'AI seats must act automatically and not require human pass clicks');
assert.ok(auctionUi.includes("rank=n===6?1:n===7?2:n===8?3:4"),'bid ranks must progress 6, 7, 8, Baun');


for(const suit of ['hokm_spades','hokm_hearts','hokm_diamonds','hokm_clubs']){
 assert.ok(html.includes('value="'+suit+'"'),'four-player Hokm must offer '+suit);
 assert.ok(sixUi.includes('value="'+suit+'"'),'six-player Hokm must offer '+suit);
}
assert.ok(html.includes("G.trump=({'hokm_spades':'♠','hokm_hearts':'♥','hokm_diamonds':'♦','hokm_clubs':'♣'})[selected]"));
assert.ok(sixUi.includes("else if(bid.contract==='hokm_hearts')trumpSuit='H'"));
assert.ok(sixUi.includes("else if(bid.contract==='hokm_diamonds')trumpSuit='D'"));
assert.ok(sixUi.includes("function startActualGame(trumpSuit,hidden){\n try{"));
assert.ok(sixUi.includes("K.startPlay(game,winner,contract,{isMalzoom:!!game.isMalzoom,trumpAnnounced:!hidden,trumpSuit:trumpSuit||null})"));
assert.ok(sixUi.includes("setScreen('game');renderGame();\n  if(winner!==0)playAITurn();"));
assert.ok(sixUi.includes("Kuwaiti AI fallback card selected"),'AI turn must have a legal-card fallback after auction');
assert.ok(sixUi.includes('class="devil-mark">😈')&&sixUi.includes('class="trident">🔱'),'six-player jokers must show a devil and trident');
assert.ok(sixUi.includes('transform:rotate(-19deg) scale(.68)'),'card-back name must be smaller and more angled');
assert.ok(sixUi.includes("const choices=['hokm_spades','hokm_hearts','hokm_diamonds','hokm_clubs','naras','tak_naras','saras']"));
assert.ok(!sixUi.includes('value="partner_middle"'),'six-player partner-middle option must be removed');
assert.ok(!sixUi.includes("'partner_middle'") ,'six-player partner-middle contract must not be selectable by AI');
assert.ok(sixUi.includes("if(bid.type==='malzoom'&&p!==game.obligatedPlayer)return"),'only the obligated player may choose Malzoom');

assert.ok(html.includes("$('trickCountWrap').style.display=selected==='partner_middle'?'none':''"));
assert.ok(sixUi.includes("$('kTrickCards').style.display='';"),'six-player trick counter should remain visible');
console.log('PASS: four/six-player all four Hokm suits, partner-middle counter, auction-to-play handoff, auction rotation and rank adapter');


assert.ok(html.includes("if(matchNo===1){selected='hokm_spades';"),'first game must lock all four-player contracts to spades');
assert.ok(html.includes("hands[i%4].push({...deck[i],s:")&&html.includes("G.pendingDeck.splice(0,8)"),'later four-player games must deal five cards before asking trump');
assert.ok(html.includes("G.hands[starter].forEach(c=>$('hakimPreview').append(cardEl(c,true)))"),'five-card hakim preview must be shown before trump selection');
assert.ok(sixUi.includes('id="kMatchLimit"')&&sixUi.includes('value="54"')&&sixUi.includes('value="108"'),'six-player match must offer 54 and 108 tricks');
assert.ok(sixUi.includes('playedTricks+=9')&&sixUi.includes("if(playedTricks<matchLimit)"),'six-player match must track total tricks and stop at selected limit');
assert.ok(sixUi.includes('RED JOKER')&&sixUi.includes('BLACK JOKER'),'jokers must use English titles');
assert.ok(sixUi.includes('rotate(-19deg) scale(.68)'),'card-back title must be smaller and more angled');
