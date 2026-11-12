// Standard four-player Hokm core. Teams are opposite seats (0/2 vs 1/3).
// The first match is always spades; later trump choice is supplied by the host UI.
const SUITS = ['S','H','D','C'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const POWER = Object.fromEntries(RANKS.map((r,i)=>[r,i]));
function createDeck(){return SUITS.flatMap(s=>RANKS.map(r=>({id:r+s,rank:r,suit:s,kind:'normal'})));}
function shuffle(deck,rng=Math.random){const a=[...deck];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function deal(rng=Math.random){const d=shuffle(createDeck(),rng),hands=[[],[],[],[]];d.forEach((c,i)=>hands[i%4].push(c));return hands;}
function teamOf(player){return player%2===0?'A':'B';}
function legalCards(hand,leadSuit){if(!leadSuit)return [...hand];const follow=hand.filter(c=>c.suit===leadSuit);return follow.length?follow:[...hand];}
function beats(a,b,leadSuit,trumpSuit){const at=a.suit===trumpSuit,bt=b.suit===trumpSuit;if(at!==bt)return at;if(a.suit===b.suit)return POWER[a.rank]>POWER[b.rank];return a.suit===leadSuit;}
function currentWinner(plays,trumpSuit){if(!Array.isArray(plays)||plays.length<1||plays.length>4)throw new Error('A partial Hokm trick requires one to four plays');const lead=plays[0].card.suit;let best=plays[0];for(const p of plays.slice(1))if(beats(p.card,best.card,lead,trumpSuit))best=p;return best.player;}
function chooseAICard(hand,plays,player,trumpSuit,difficulty='normal'){
 const lead=plays.length?plays[0].card.suit:null;
 const legal=legalCards(hand,lead);
 if(!legal.length)throw new Error('No legal Hokm card available');
 const sorted=[...legal].sort((a,b)=>POWER[a.rank]-POWER[b.rank]);
 if(!plays.length)return difficulty==='hard'?sorted[Math.floor(sorted.length/2)]:sorted[0];
 const winnerPlayer=currentWinner(plays,trumpSuit);
 const winningPlay=plays.find(p=>p.player===winnerPlayer);
 const partnerWinning=teamOf(winnerPlayer)===teamOf(player);
 const winning=sorted.filter(c=>beats(c,winningPlay.card,lead,trumpSuit));
 const losing=sorted.filter(c=>!beats(c,winningPlay.card,lead,trumpSuit));
 if(partnerWinning)return losing[0]||sorted[0];
 if(winning.length)return difficulty==='hard'?winning[winning.length-1]:winning[0];
 return difficulty==='hard'?sorted[sorted.length-1]:sorted[0];
}
function resolveTrick(plays,trumpSuit){if(!Array.isArray(plays)||plays.length!==4)throw new Error('A Hokm trick requires four plays');return currentWinner(plays,trumpSuit);}
function newGame({starter=0,matchNumber=1,rng=Math.random}={}){return {mode:'standard-hokm',players:4,hands:deal(rng),trump:matchNumber===1?'S':null,starter,turn:starter,trick:[],trickNo:1,trickWinners:[],score:{A:0,B:0},done:false};}
const StandardHokmEngine={SUITS,RANKS,createDeck,shuffle,deal,teamOf,legalCards,beats,currentWinner,chooseAICard,resolveTrick,newGame};
if(typeof module!=='undefined'&&module.exports)module.exports=StandardHokmEngine;
if(typeof window!=='undefined')window.StandardHokmEngine=StandardHokmEngine;
