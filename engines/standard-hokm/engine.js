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
function chooseAICard(hand,plays,player,trumpSuit,difficulty='normal',contract='hokm'){
 const lead=plays.length?plays[0].card.suit:null;
 const legal=legalCards(hand,lead);
 if(!legal.length)throw new Error('No legal Hokm card available');
 const sorted=[...legal].sort((a,b)=>rankPower(a.rank,contract)-rankPower(b.rank,contract));
 if(!plays.length)return difficulty==='hard'?sorted[Math.floor(sorted.length/2)]:sorted[0];
 const winnerPlayer=currentWinner(plays,trumpSuit,contract);
 const winningPlay=plays.find(p=>p.player===winnerPlayer);
 const partnerWinning=teamOf(winnerPlayer)===teamOf(player);
 const winning=sorted.filter(c=>beats(c,winningPlay.card,lead,trumpSuit,contract));
 const losing=sorted.filter(c=>!beats(c,winningPlay.card,lead,trumpSuit,contract));
 if(partnerWinning)return losing[0]||sorted[0];
 if(winning.length)return difficulty==='hard'?winning[winning.length-1]:winning[0];
 return difficulty==='hard'?sorted[sorted.length-1]:sorted[0];
}
function resolveTrick(plays,trumpSuit,contract='hokm'){if(!Array.isArray(plays)||plays.length!==4)throw new Error('A Hokm trick requires four plays');return currentWinner(plays,trumpSuit,contract);}
function koutMessage(scoreA,scoreB,hakemPlayer){
 if(scoreA===0&&scoreB===13)return hakemPlayer===0?'حاکم کوت شدید':'شما کوت شدید';
 if(scoreB===0&&scoreA===13)return hakemPlayer!==0?'حاکم حریف کوت شد':'حریف شما کوت شد';
 return null;
}
function newGame({starter=0,matchNumber=1,rng=Math.random,contract='hokm'}={}){
 if(!CONTRACTS.includes(contract))throw new Error('نوع قرارداد حکم نامعتبر است: '+contract);
 return {mode:'standard-hokm',players:4,hands:deal(rng),trump:matchNumber===1&&contract==='hokm'?'S':null,contract,starter,hakemPlayer:starter,turn:starter,trick:[],trickNo:1,trickWinners:[],score:{A:0,B:0},done:false};
}
const StandardHokmEngine={SUITS,RANKS,POWER,CONTRACTS,createDeck,shuffle,deal,teamOf,legalCards,rankPower,beats,currentWinner,chooseAICard,resolveTrick,koutMessage,newGame};
if(typeof module!=='undefined'&&module.exports)module.exports=StandardHokmEngine;
if(typeof window!=='undefined')window.StandardHokmEngine=StandardHokmEngine;
