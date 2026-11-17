// Standard four-player Hokm core. Teams are opposite seats (0/2 vs 1/3).
// The first match is always spades; later trump choice is supplied by the host UI.
const SUITS = ['S','H','D','C'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const POWER = Object.fromEntries(RANKS.map((r,i)=>[r,i]));
const CONTRACTS = ['hokm','naras','tak_naras','saras'];
function rankPower(rank,contract='hokm'){
 const index=RANKS.indexOf(rank);
 if(index<0)throw new Error('رتبه کارت نامعتبر است: '+rank);
 if(contract==='naras')return 13-index;              // 2 strongest ... A weakest
 if(contract==='tak_naras')return index===12?13:12-index; // A, 2 ... K
 if(contract==='hokm'||contract==='saras')return index+1; // A strongest ... 2 weakest
 throw new Error('نوع قرارداد حکم نامعتبر است: '+contract);
}
function createDeck(){return SUITS.flatMap(s=>RANKS.map(r=>({id:r+s,rank:r,suit:s,kind:'normal'})));}
function shuffle(deck,rng=Math.random){const a=[...deck];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function deal(rng=Math.random){const d=shuffle(createDeck(),rng),hands=[[],[],[],[]];d.forEach((c,i)=>hands[i%4].push(c));return hands;}
function teamOf(player){return player%2===0?'A':'B';}
function legalCards(hand,leadSuit){if(!leadSuit)return [...hand];const follow=hand.filter(c=>c.suit===leadSuit);return follow.length?follow:[...hand];}
function beats(a,b,leadSuit,trumpSuit,contract='hokm'){
 const hasTrump=contract==='hokm'&&!!trumpSuit;
 const at=hasTrump&&a.suit===trumpSuit,bt=hasTrump&&b.suit===trumpSuit;
 if(at!==bt)return at;
 if(a.suit===b.suit)return rankPower(a.rank,contract)>rankPower(b.rank,contract);
 return a.suit===leadSuit;
}
function currentWinner(plays,trumpSuit,contract='hokm'){
 if(!Array.isArray(plays)||plays.length<1||plays.length>4)throw new Error('A partial Hokm trick requires one to four plays');
 const lead=plays[0].card.suit;let best=plays[0];
 for(const p of plays.slice(1))if(beats(p.card,best.card,lead,trumpSuit,contract))best=p;
 return best.player;
}
function cooperativeLeadCard(hand,lastTrick,lastWinner,player,contract='hokm'){
 if(contract!=='hokm'||!Array.isArray(lastTrick)||!lastTrick.length||!Number.isInteger(lastWinner)||teamOf(lastWinner)!==teamOf(player))return null;
 const ledSuit=lastTrick[0]&&lastTrick[0].card&&lastTrick[0].card.suit;
 if(!SUITS.includes(ledSuit))return null;
 const partnerPlay=lastTrick.find(x=>x.player===lastWinner);
 const partnerVoid=!!partnerPlay&&partnerPlay.card.suit!==ledSuit;
 const hasAce=hand.some(c=>c.suit===ledSuit&&c.rank==='A');
 const inSuit=hand.filter(c=>c.suit===ledSuit).sort((a,b)=>rankPower(a.rank,contract)-rankPower(b.rank,contract));
 if(!hasAce&&!partnerVoid&&inSuit.length)return inSuit[0];
 if(hasAce||partnerVoid){
  const alternatives=SUITS.filter(s=>s!==ledSuit).map(s=>({s,cards:hand.filter(c=>c.suit===s)})).filter(x=>x.cards.length);
  alternatives.sort((a,b)=>b.cards.length-a.cards.length);
  if(alternatives.length)return alternatives[0].cards.slice().sort((a,b)=>rankPower(a.rank,contract)-rankPower(b.rank,contract))[0];
 }
 return null;
}
function chooseAICardBase(hand,plays,player,trumpSuit,difficulty='normal',contract='hokm',playedCards=[],initialHand=null,lastTrick=[],lastWinner=null,isHakemTeam=true,sequenceMode=false){
 const lead=plays.length?plays[0].card.suit:null;
 const legal=legalCards(hand,lead);
 if(!legal.length)throw new Error('No legal Hokm card available');
 if(difficulty==='easy')return legal[Math.floor(Math.random()*legal.length)];
 const original=Array.isArray(initialHand)?initialHand:hand;
 const known=new Set(original.map(c=>c.id));
 (playedCards||[]).forEach(x=>known.add(x.card?x.card.id:x.id));
 const unseen=createDeck().filter(c=>!known.has(c.id));
 const threatCount=card=>unseen.filter(c=>c.suit===card.suit&&rankPower(c.rank,contract)>rankPower(card.rank,contract)).length;
 const value=card=>rankPower(card.rank,contract);
 const cost=card=>value(card)+(card.suit===trumpSuit&&contract==='hokm'?7:0);
 const discardCost=card=>{
  const offSuit=!!lead&&card.suit!==lead;
  const wastedAce=offSuit&&card.rank==='A'&&!(contract==='hokm'&&card.suit===trumpSuit);
  return cost(card)+(wastedAce?30:0);
 };
 const cheapestDiscard=cards=>[...cards].sort((a,b)=>discardCost(a)-discardCost(b))[0];
 const sorted=[...legal].sort((a,b)=>cost(a)-cost(b));
 if(!plays.length){
  const coordinated=cooperativeLeadCard(hand,lastTrick,lastWinner,player,contract);
  if(coordinated)return coordinated;
  // In Double Kout sequence play, the non-hakem side should normally draw trump
  // when it has a useful trump holding, forcing the declarer side to spend theirs.
  if(contract==='hokm'&&!isHakemTeam&&trumpSuit){
   const ownTrumps=hand.filter(c=>c.suit===trumpSuit).sort((a,b)=>rankPower(a.rank,contract)-rankPower(b.rank,contract));
   const unseenTrumps=unseen.filter(c=>c.suit===trumpSuit);
   if(ownTrumps.length>=2&&unseenTrumps.length>0)return ownTrumps[0];
  }
  const suitLength=s=>hand.filter(c=>c.suit===s).length;
  const scored=legal.map(card=>{
   const length=suitLength(card.suit),threats=threatCount(card);
   const control=threats===0?18:threats===1?8:0;
   const longSuit=length>=3?length*2.5:0;
   const shortPenalty=length===1?-5:0;
   return {card,score:cost(card)-control-longSuit-shortPenalty};
  }).sort((a,b)=>a.score-b.score);
  if(difficulty==='expert'){
   // Prefer leads whose top cards are less likely to be beaten by unseen cards.
   scored.sort((a,b)=>(threatCount(a.card)*3-cost(a.card)*.08)-(threatCount(b.card)*3-cost(b.card)*.08));
  }
  return scored[0].card;
 }
 const winnerPlayer=currentWinner(plays,trumpSuit,contract);
 const winningPlay=plays.find(p=>p.player===winnerPlayer);
 const partnerWinning=teamOf(winnerPlayer)===teamOf(player);
 if(partnerWinning){
  // In Double Kout, a king can be worth spending to pressure an unseen ace.
  // Do this only when partner is currently winning with a lower card and an
  // opponent still has a turn: the king may force the ace out instead of
  // letting the opposing side preserve it for a later sequence.
  if(sequenceMode&&contract==='hokm'&&plays.length<3){
   const opponentsStillToPlay=[0,1,2,3].some(seat=>seat!==player&&teamOf(seat)!==teamOf(player)&&!plays.some(x=>x.player===seat));
   const king=legal.find(c=>c.suit===lead&&c.rank==='K');
   const aceUnseen=unseen.some(c=>c.suit===lead&&c.rank==='A');
   if(opponentsStillToPlay&&king&&aceUnseen&&rankPower('K',contract)>rankPower(winningPlay.card.rank,contract))return king;
  }
  return cheapestDiscard(legal)||sorted[0];
 }
 // In sequence mode, do not save a winning card while an opponent is taking
 // the trick: stop their run with the cheapest card that overtakes the winner.
 if(sequenceMode){
  const stopRun=sorted.filter(c=>beats(c,winningPlay.card,lead,trumpSuit,contract));
  if(stopRun.length)return stopRun[0];
 }
 if(difficulty==='expert'){
  // Monte-Carlo estimate: deal unseen cards to the remaining seats and
  // estimate whether each candidate can secure this trick for our team.
  const remainingPlayers=[0,1,2,3].filter(p=>p!==player&&!plays.some(x=>x.player===p));
  const samples=64;
  const scored=legal.map(card=>{
   let teamWins=0,partnerWins=0;
   for(let sample=0;sample<samples;sample++){
    const pool=[...unseen];
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    const simulated=[...plays,{player,card}];
    remainingPlayers.forEach((seat,index)=>{
     const leadSuit=simulated[0].card.suit;
     const follow=pool.filter(c=>c.suit===leadSuit);
     const options=follow.length?follow:pool;
     const picked=options[Math.floor(Math.random()*options.length)];
     if(picked){simulated.push({player:seat,card:picked});pool.splice(pool.findIndex(c=>c.id===picked.id),1);}
    });
    if(simulated.length===4){
     const win=currentWinner(simulated,trumpSuit,contract);
     if(teamOf(win)===teamOf(player)){teamWins++;if(win!==player)partnerWins++;}
    }
   }
   return {card,score:teamWins/samples*100-cost(card)*.12+partnerWins/samples*2};
  }).sort((a,b)=>b.score-a.score);
  return scored[0].card;
 }
 // Normal and hard both count unseen higher cards; hard additionally avoids
 // spending a high card when a partner is already taking the trick.
 const winning=sorted.filter(c=>beats(c,winningPlay.card,lead,trumpSuit,contract));
 const losing=sorted.filter(c=>!beats(c,winningPlay.card,lead,trumpSuit,contract));
 if(difficulty==='hard'){
  const safeWinners=winning.sort((a,b)=>threatCount(a)-threatCount(b)||cost(a)-cost(b));
  if(safeWinners.length)return safeWinners[0];
  return cheapestDiscard(losing.length?losing:legal)||sorted[0];
 }
 if(winning.length)return winning[0];
 return cheapestDiscard(legal)||sorted[0];
}
function chooseAICard(hand,plays,player,trumpSuit,difficulty='normal',contract='hokm',playedCards=[],initialHand=null,lastTrick=[],lastWinner=null,isHakemTeam=true,sequenceMode=false,gameMode='standard-hokm',trickNo=1){
 const chosen=chooseAICardBase(hand,plays,player,trumpSuit,difficulty,contract,playedCards,initialHand,lastTrick,lastWinner,isHakemTeam,sequenceMode);
 if(difficulty==='easy'||typeof globalThis==='undefined'||!globalThis.DoubleKoutLearning||typeof globalThis.DoubleKoutLearning.getSuggestion!=='function')return chosen;
 const lead=plays.length?plays[0].card.suit:null,legal=legalCards(hand,lead);
 let partnerWinning=false;
 if(plays.length){const w=currentWinner(plays,trumpSuit,contract);partnerWinning=teamOf(w)===teamOf(player);}
 const trumpCount=trumpSuit?hand.filter(c=>c.suit===trumpSuit).length:0;
 const pattern=[gameMode||'standard-hokm',contract,trickNo||1,lead||'-',legal.length,trumpCount,partnerWinning?1:0,sequenceMode?1:0].join('|');
 try{return globalThis.DoubleKoutLearning.getSuggestion(pattern,legal,chosen)||chosen;}catch(_){return chosen;}
}
function resolveTrick(plays,trumpSuit,contract='hokm'){if(!Array.isArray(plays)||plays.length!==4)throw new Error('A Hokm trick requires four plays');return currentWinner(plays,trumpSuit,contract);}
function koutMessage(scoreA,scoreB,hakemPlayer){
 const hakemTeam=teamOf(hakemPlayer);
 if(scoreA===0&&scoreB===13)return hakemTeam==='A'?'حاکم کوت شدید':'شما کوت شدید';
 if(scoreB===0&&scoreA===13)return hakemTeam==='B'?'حاکم حریف کوت شد':'حریف شما کوت شد';
 return null;
}
function newGame({starter=0,matchNumber=1,rng=Math.random,contract='hokm'}={}){
 if(!CONTRACTS.includes(contract))throw new Error('نوع قرارداد حکم نامعتبر است: '+contract);
 return {mode:'standard-hokm',players:4,hands:deal(rng),trump:matchNumber===1&&contract==='hokm'?'S':null,contract,starter,hakemPlayer:starter,turn:starter,trick:[],trickNo:1,trickWinners:[],score:{A:0,B:0},done:false};
}
const StandardHokmEngine={SUITS,RANKS,POWER,CONTRACTS,createDeck,shuffle,deal,teamOf,legalCards,rankPower,beats,currentWinner,cooperativeLeadCard,chooseAICard,resolveTrick,koutMessage,newGame};
if(typeof module!=='undefined'&&module.exports)module.exports=StandardHokmEngine;
if(typeof window!=='undefined')window.StandardHokmEngine=StandardHokmEngine;
