const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../web-prototype.html'),'utf8');
const engineTag=html.indexOf('<script src="./engines/double-kout-sequence.js"></script>');
const scriptStart=html.indexOf('<script>',engineTag);
const scriptEnd=html.indexOf('</script>',scriptStart);
assert.ok(engineTag>=0&&scriptStart>engineTag&&scriptEnd>scriptStart,'main game script must exist after the engines');
new vm.Script(html.slice(scriptStart+8,scriptEnd),{filename:'web-prototype-inline.js'});
assert.ok(html.includes("activeMode='double-kout'")&&!html.includes("id=\"nextTrump\""),'four-player setup must not expose a separate contract/suit menu');
assert.ok(html.includes('id="hokmContract"')&&html.includes('value="hokm_spades"'),'four-player game startup must retain its internal contract element used by dealGame and render');
assert.ok(html.includes("value=\"hokm_spades\"")&&html.includes("value=\"hokm_clubs\"")&&html.includes("value=\"partner_middle\""));
assert.ok(html.includes("function beginNormalOrChallenge(challengerTeam)")&&html.includes("function confirmTrump()"),'both choice buttons must have defined handlers');
assert.ok(html.includes("function cardRank(c)")&&html.includes("c.rank!==undefined"),'card rank adapter must accept both r and rank fields');
assert.ok(html.includes("function winner(plays){const code=")&&html.includes("StandardHokmEngine.resolveTrick"));
assert.ok(html.includes("G.trickCompletePending||G.plays.length>=4"));
assert.ok(html.includes("G.trickCompletePending=true;G.turn=null"));
assert.ok(html.includes("G.resolvingTrick=true;G.trickCompletePending=false"));
assert.ok(html.includes("const handPlayer=playStyle==='hotseat'?G.turn:0")&&html.includes("playStyle==='hotseat'&&!hotseatRevealed"),'hotseat must reveal only the current player hand after an explicit pass-phone confirmation');
assert.ok(html.includes("if(playStyle==='hotseat'||playStyle==='online')return"),'AI must not play cards in local hotseat or online mode');
assert.ok(html.includes('id="playStyle"')&&html.includes('value="hotseat"')&&html.includes('value="online"'),'four-player setup must offer AI, private pass-and-play, and online play styles');
assert.ok(html.includes("G.turn=(p+1)%4;hotseatRevealed=false;render();runAI()"),'the next local player must receive a privacy screen after each card');
assert.ok(html.includes('id="hotseatGate"')&&html.includes('id="revealHotseatHand"'),'hotseat must cover the table until the next player confirms the phone handoff');
assert.ok(html.includes("value=\"partner_middle\"")&&html.includes("const contract=$('nextContract').value"),'partner-middle must remain available in the single later-deal contract selector');

const sixUi=fs.readFileSync(require.resolve('../kuwaiti-six-player-ui.js'),'utf8');
new vm.Script(sixUi,{filename:'kuwaiti-six-player-ui.js'});
for(const mode of ['hokm_spades','hokm_clubs','naras','tak_naras','saras']){
 assert.ok(sixUi.includes('value="'+mode+'"')||sixUi.includes("'"+mode+"'"),'six-player selector/engine must support '+mode);
}
assert.ok(sixUi.includes("game.contract=noTrump?contract:'hokm'")&&sixUi.includes("game.auctionBid.contract=contract"),'winning contract must be selected after the auction');
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
assert.ok(html.includes("const contract=$('nextContract').value;")&&html.includes("const noTrump=['naras','tak_naras','saras'].includes(contract)")&&!html.includes("id=\"nextTrump\""),'later four-player deals must select contract and trump suit as one unified option');
assert.ok(html.includes("value=\"naras\"")&&html.includes("value=\"tak_naras\"")&&html.includes("value=\"saras\"")&&html.includes("value=\"partner_middle\""),'later four-player contract picker must offer Naras, Tak Naras, Saras and partner-middle');
assert.ok(html.includes("const staged=matchNo>1;"),'all later four-player contracts must deal five cards before selection');
assert.ok(html.includes("function aiChooseFourPlayerContract(hand)")&&html.includes("const chosen=aiChooseFourPlayerContract(G.hands[starter])"),'AI hakim must choose among all supported contracts after seeing five cards');
assert.ok(html.includes("liveSequenceScores(G.trickWinners||[])")&&html.includes("function liveSequenceScores(winners)")&&html.includes("scores[winningTeam]+=count"),'live DoubleKout counters must use the exact same scoring function as the final result');
assert.ok(html.includes("globalStatsBtn")&&html.includes("function recordGlobalGame()")&&html.includes("localStorage.setItem(GLOBAL_STATS_KEY"),'four-player cumulative game statistics must be persisted and accessible from the mode menu');
assert.ok(html.includes("exitAppBtn")&&html.includes("AndroidApp.exitApp()"),'mode menu must provide a real native Android exit action');
assert.ok(!html.includes("nextTrumpWrap")&&!html.includes("nextTrump"),'four-player UI must not allow contract and trump suit to be selected separately');
assert.ok(html.includes("G.contract=noTrump?contract:'hokm'")&&html.includes("G.trump=suit"),'later contract selection must set the chosen contract and clear trump for no-trump modes');
assert.ok(sixUi.includes("const suitByContract={hokm_spades:'S',hokm_hearts:'H',hokm_diamonds:'D',hokm_clubs:'C'}"));
assert.ok(sixUi.includes("const resolvedTrump=noTrumpContracts.includes(bidContract)?null:(game.isMalzoom?(trumpSuit||null):suitByContract[bidContract])"));
assert.ok(sixUi.includes("function startActualGame(trumpSuit,hidden){\n try{"));
assert.ok(sixUi.includes("K.startPlay(game,winner,contract,{isMalzoom:!!game.isMalzoom,trumpAnnounced:!hidden,trumpSuit:resolvedTrump})"));
assert.ok(sixUi.includes("setScreen('game');renderGame();\n  if(winner!==0)playAITurn();"));
assert.ok(sixUi.includes("Kuwaiti AI fallback card selected"),'AI turn must have a legal-card fallback after auction');
assert.ok(sixUi.includes('class="joker-art"')&&sixUi.includes("M12 105")&&sixUi.includes("RED JOKER")&&sixUi.includes("BLACK JOKER"),'six-player jokers must use custom devil-and-trident card artwork');
assert.ok(sixUi.includes('transform:rotate(-24deg) scale(.92)'),'card-back name must be smaller, gold and contained within the card');
assert.ok(sixUi.includes("const noTrump=['naras','tak_naras','saras'].includes(contract)"));
assert.ok(!sixUi.includes('value="partner_middle"'),'six-player partner-middle option must be removed');
assert.ok(!sixUi.includes("'partner_middle'") ,'six-player partner-middle contract must not be selectable by AI');
assert.ok(sixUi.includes("if(bid.type==='malzoom'&&(p!==game.obligatedPlayer||auction.highest||auction.highestRank>0)"),'Malzoom is restricted to the obligor before any player bids');
assert.ok(sixUi.includes("function aiCard(p)")&&sixUi.includes("const unseen=K.deck().filter(c=>!ownInitial.has(c.id)&&!seen.has(c.id))"),'six-player AI must infer remaining cards from its own initial hand and public played cards');
assert.ok(sixUi.includes("const partnerWinning=current&&team(current.player)===team(p)")&&sixUi.includes("candidateTakesLead?1000:0"),'six-player AI must avoid overtaking its partner and preserve high cards');
assert.ok(sixUi.includes("function aiChooseContract(p)")&&sixUi.includes("function confirmWinningContract()"),'contract selection must occur after the auction winner is determined');
assert.ok(sixUi.includes('id="kAuctionSummary"')&&sixUi.includes('نتیجه مزایده · برنده:'),'auction winner and bid history must remain visible throughout the deal');
assert.ok(sixUi.includes('id="kWonA"')&&sixUi.includes('id="kWonB"')&&sixUi.includes('game.trickWinners.filter(p=>team(p)'), 'live won-trick counters must be displayed for both teams');
assert.ok(sixUi.includes('const teamPlayers=previousWinningTeam===\'B\'?[1,3,5]:[0,2,4]')&&sixUi.includes('startAuction();'), 'next six-player deal must skip setup and go directly to auction');

assert.ok(html.includes("$('trickCountWrap').style.display=contract==='partner_middle'?'none':''"));
assert.ok(sixUi.includes("$('kTrickCards').style.display='';"),'six-player trick counter should remain visible');
console.log('PASS: four/six-player all four Hokm suits, partner-middle counter, auction-to-play handoff, auction rotation and rank adapter');


assert.ok(html.includes("if(matchNo===1){selected='hokm_spades';"),'first game must lock all four-player contracts to spades');
assert.ok(html.includes("hands[i%4].push({...deck[i],s:")&&html.includes("G.pendingDeck.splice(0,8)"),'later four-player games must deal five cards before asking trump');
assert.ok(html.includes("G.hands[starter].forEach(c=>$('hakimPreview').append(cardEl(c,true)))"),'five-card hakim preview must be shown before trump selection');
assert.ok(sixUi.includes('id="kMatchLimit"')&&sixUi.includes('value="54"')&&sixUi.includes('value="108"'),'six-player match must offer 54 and 108 tricks');
assert.ok(sixUi.includes('playedTricks+=9')&&sixUi.includes("if(playedTricks<matchLimit)"),'six-player match must track total tricks and stop at selected limit');
assert.ok(sixUi.includes('RED JOKER')&&sixUi.includes('BLACK JOKER'),'jokers must use English titles');
assert.ok(sixUi.includes('rotate(-24deg) scale(.92)'),'card-back title must be smaller and more angled');

assert.ok(sixUi.includes("const bidContract=game.isMalzoom?'hokm':String(game.auctionBid.contract||'')"),'winning bid must be the only source of the active six-player contract');
assert.ok(sixUi.includes("قرارداد بدون حکم نباید خال حکم یا حکم مخفی داشته باشد"),'no-trump contract must reject any inherited trump suit');
assert.ok(sixUi.includes("'بدون حکم · '+contractName[bidContract]"),'no-trump variant must be explicitly shown on the table');
assert.ok(sixUi.includes("game.trumpSuit=null;game.trumpAnnounced=false;game.hiddenTrump=false"),'new auction must clear previous trump state');

assert.ok(sixUi.includes("const committedBid={...bid}"),'auction bid must not contain a prematurely selected contract');
assert.ok(sixUi.includes("function beginWinningContract(contract)")&&sixUi.includes("game.auctionBid.contract=contract"),'winning contract is committed only after auction');
assert.ok(sixUi.includes("$('kContract').value='hokm_spades'"),'new deal must reset the contract selector rather than reuse the previous deal selection');
assert.ok(sixUi.includes("'حکم این بازی: '+suitGlyph[resolvedTrump]"),'Hokm banner must explicitly refer to the current deal');
assert.ok(sixUi.includes('class="joker-art"')&&sixUi.includes('RED JOKER')&&sixUi.includes('BLACK JOKER'),'red and black jokers must use the new custom devil artwork');
assert.ok(sixUi.includes('trickNo===9&&isLead')||sixUi.includes('k-card.joker .joker-art'),'custom devil art must be present in the six-player card renderer');

assert.ok(html.includes("G.cardHistory.push({player:p,card:{...card},trickNo:G.trickNo})"),'four-player table must track all publicly played cards');
assert.ok(html.includes("G.cardHistory||[],G.initialHands[p]"),'four-player standard Hokm AI must receive card-memory information');
assert.ok(html.includes("if(G&&G.done){matchNo++;G=null;startGame();return;}"),'four-player next deal must bypass the old setup screen and begin the five-card deal');

assert.ok(html.includes("G.initialHands=G.hands.map(hand=>hand.slice());G.cardHistory=[];G.waitingTrump=false"),'four-player AI memory must be reset after all thirteen cards are dealt following trump selection');

assert.ok(html.includes("function lastPlayerOfTeam(winners,winningTeam,fallback)")&&html.includes("previousStarter=lastPlayerOfTeam(G.trickWinners,winningTeam,G.leader)"),'the next four-player hakim must come from the previous winning team');
assert.ok(html.includes('id="liveWonA"')&&html.includes('id="liveWonB"')&&html.includes("G.trickWinners||[]).filter(p=>team(p)==='A')"),'four-player tables must show live tricks won by both teams');
assert.ok(sixUi.includes("firstTrickNoCut:trickNo===1")&&sixUi.includes("firstTrickNoCut:game.trickNo===1"),'six-player AI and human must both enforce first-trick no-cut rules');
assert.ok(sixUi.includes("label:String(target)")&&sixUi.includes('data-bid="6">۶</button>'),'auction bids must show only their numeric value');
assert.ok(sixUi.includes('k-bid-chip')&&sixUi.includes('animation:kTurnPulse'),'auction turn must animate around player seats and display their bid number');
assert.ok(sixUi.indexOf('id="kAuction"')<sixUi.indexOf('class="k-live-tricks"'),'six-player live trick counter must sit below the auction process');
assert.ok(sixUi.includes("font:italic 700 4px/1.05")&&sixUi.includes("color:#ffdf83")&&sixUi.includes("rotate(-24deg) scale(.92)"),'card-back name must be contained and gold');

const manifest=fs.readFileSync(require.resolve('../android/app/src/main/AndroidManifest.xml'),'utf8');
const activity=fs.readFileSync(require.resolve('../android/app/src/main/java/com/doublekout/app/MainActivity.java'),'utf8');
assert.ok(manifest.includes('android:configChanges="orientation|screenSize|smallestScreenSize|keyboardHidden|uiMode"'),'Android activity must not be recreated on screen rotation');
assert.ok(activity.includes('onConfigurationChanged(Configuration newConfig)')&&activity.includes('webView.requestLayout()'),'WebView must preserve game state and relayout on orientation changes');

assert.ok(sixUi.includes("chip.textContent=isPass?'PASS'")&&sixUi.includes("className='k-bid-chip'+(isPass?' pass':'')"),'auction passes must be visible as PASS chips on player seats');
assert.ok(sixUi.includes('@keyframes kAuctionOrbit')&&sixUi.includes('.k-seat.active:after'),'auction turn indicator must rotate around the active seat');
assert.ok(sixUi.indexOf('id="kTable"')<sixUi.indexOf('id="kLiveTricks"')&&sixUi.indexOf('id="kLiveTricks"')<sixUi.indexOf('id="kStatus"'),'six-player live counters must replace the old status/card-announcement area below the table');
assert.ok(!sixUi.includes("playerNames[p]+' کارت '+cardLabel(card)+' را بازی کرد.'"),'per-card announcement must be removed from the six-player status area');
assert.ok(html.includes("matchNo=1;previousWinner=null;previousStarter=null;activeMode='double-kout'"),'starting four-player DoubleKout must reset the series and fixed first game');
assert.ok(html.includes("matchNo=1;previousWinner=null;previousStarter=null;activeMode='standard-hokm'"),'starting four-player Standard Hokm must reset the series and fixed first game');
assert.ok(html.includes("G.contract='hokm';G.trump='♠';G.trumpCode='S';G.waitingTrump=false;"),'first four-player game must lock trump to spades');

assert.ok(sixUi.includes("const win=auction.highestPlayer,bid={...auction.highest}")&&sixUi.includes("winningSeat.classList.add('auction-winner')"),'after auction only the winner should retain a seat marker');
assert.ok(sixUi.includes("el.querySelector('.k-bid-chip')?.remove()")&&sixUi.includes("chip.className='k-bid-chip winner'"),'all pass markers must be removed when the auction ends');
assert.ok(sixUi.includes("chip.textContent=bid.type==='malzoom'?'M':fa(bid.target||bid.label||'')"),'winning seat must show only the winning trick target');
