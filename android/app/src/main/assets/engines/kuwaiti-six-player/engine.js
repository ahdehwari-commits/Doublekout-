(function(){
'use strict';
// Six-player Kuwaiti Kout rules core.
// Hokm suit modes allow trump cutting; Naras, Tak Naras and Saras are no-trump.
const SUITS=['S','H','D','C'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const CONTRACTS=new Set(['hokm','naras','tak_naras','saras']);
function deck(){
 const cards=SUITS.flatMap(s=>RANKS.map(r=>({id:r+s,kind:'normal',rank:r,suit:s})));
 cards.push({id:'JR',kind:'joker',color:'red'},{id:'JB',kind:'joker',color:'black'});
 return cards;
}
function shuffle(cards,rng=Math.random){
 const a=[...cards];
 for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
function deal(rng=Math.random){
 const cards=shuffle(deck(),rng),hands=Array.from({length:6},()=>[]);
 cards.forEach((c,i)=>hands[i%6].push(c));
 return hands;
}
function teamOf(player){return player%2===0?'A':'B';}
function validateContract(contract){
 if(!CONTRACTS.has(contract))throw new Error('قرارداد کوت کویتی نامعتبر است: '+contract);
}
function isJoker(card){return !!card&&card.kind==='joker';}
function isTwoOfClubs(card){return !!card&&card.kind==='normal'&&card.rank==='2'&&card.suit==='C';}
function findOpeningPlayer(hands){
 if(!Array.isArray(hands)||hands.length!==6)throw new Error('کوت کویتی به شش دست کارت نیاز دارد');
 const holders=hands.map((hand,index)=>hand.some(isTwoOfClubs)?index:-1).filter(i=>i>=0);
 if(holders.length!==1)throw new Error('دارنده یکتای ۲ خاج پیدا نشد');
 return holders[0];
}
// Return normal-card strength from weakest (1) to strongest (13).
function normalPower(card,contract){
 validateContract(contract);
 if(!card||card.kind!=='normal'||!RANKS.includes(card.rank))throw new TypeError('کارت معمولی نامعتبر است');
 if(contract==='naras')return 13-RANKS.indexOf(card.rank); // 2 strongest, A weakest
 if(contract==='tak_naras')return card.rank==='A'?13:12-RANKS.indexOf(card.rank); // A, 2, 3 ... K
 return RANKS.indexOf(card.rank)+1; // Hokm and Saras: A, K ... 2
}
function cardPower(card,contract,{trickNo=1,isLead=false,isMalzoom=false,trumpAnnounced=false}={}){
 validateContract(contract);
 if(!card||typeof card!=='object')throw new TypeError('کارت نامعتبر است');
 if(card.kind==='normal')return normalPower(card,contract);
 if(!isJoker(card)||!['red','black'].includes(card.color))throw new Error('نوع کارت ناشناخته است');
 // A joker led in the ninth trick is legal, but powerless.
 if(trickNo===9&&isLead)return 0;
 // Black joker loses its power from trick five onward.
 if(card.color==='black'&&trickNo>=5)return 0;
 // In a hidden Malzoom contract, black joker is powerless until the
 // obligated player announces the hidden trump.
 if(card.color==='black'&&isMalzoom&&!trumpAnnounced)return 0;
 return card.color==='red'?10000:8000;
}
// On trick nine, a first-played joker does not establish the suit;
// the second player's normal card establishes the lead suit.
function effectiveLeadSuit(plays,{trickNo=1}={}){
 if(!Array.isArray(plays)||plays.length===0)return null;
 if(trickNo===9&&isJoker(plays[0].card)){
   if(plays.length<2)return null;
   const second=plays[1].card;
   return second&&second.kind==='normal'?second.suit:null;
 }
 const first=plays[0].card;
 return first&&first.kind==='normal'?first.suit:null;
}
// Jokers cannot be the first card through trick eight. They are allowed
// on trick nine, and may be played later when the player cannot follow suit.
function legalCards(hand,leadSuit,{trickNo=1,isFirstPlay=true,trumpSuit=null}={}){
 if(!Array.isArray(hand))throw new TypeError('دست کارت نامعتبر است');
 if(isFirstPlay&&!leadSuit){
   if(trickNo<9)return hand.filter(c=>!isJoker(c));
   return [...hand];
 }
 if(!leadSuit)return hand.filter(c=>!isJoker(c));
 const follow=hand.filter(c=>c.kind==='normal'&&c.suit===leadSuit);
 if(follow.length)return follow;
 if(trumpSuit){const trumps=hand.filter(c=>c.kind==='normal'&&c.suit===trumpSuit);if(trumps.length)return [...trumps,...hand.filter(isJoker)];}
 return [...hand];
}
function findTrickWinner(plays,contract,{trickNo=1,isMalzoom=false,trumpAnnounced=false,trumpSuit=null}={}){
 validateContract(contract);
 if((contract==='naras'||contract==='tak_naras'||contract==='saras')&&trumpSuit)throw new Error('قرارداد بدون حکم نمی‌تواند خال حکم داشته باشد');
 if(!Array.isArray(plays)||plays.length!==6)throw new Error('برای تعیین برنده باید شش کارت بازی شده باشد');
 const leadSuit=effectiveLeadSuit(plays,{trickNo});
 const hasTrump=!!trumpSuit&&plays.some(p=>p.card.kind==='normal'&&p.card.suit===trumpSuit);
 const eligible=plays.filter((play,index)=>{
   if(isJoker(play.card))return cardPower(play.card,contract,{trickNo,isLead:index===0,isMalzoom,trumpAnnounced})>0;
   return hasTrump?play.card.suit===trumpSuit:play.card.suit===leadSuit;
 });
 if(!eligible.length)return plays[1]; // Ninth-trick joker lead has no power; second card sets suit.
 return eligible.reduce((best,current)=>{
   const bestPower=best.card.kind==='normal'?normalPower(best.card,contract):cardPower(best.card,contract,{trickNo,isLead:best===plays[0],isMalzoom,trumpAnnounced});
   const currentPower=current.card.kind==='normal'?normalPower(current.card,contract):cardPower(current.card,contract,{trickNo,isLead:current===plays[0],isMalzoom,trumpAnnounced});
   return currentPower>bestPower?current:best;
 });
}

function startPlay(game,auctionWinner,contract,{isMalzoom=false,trumpAnnounced=false,trumpSuit=null}={}){
 if(!game||game.mode!=='kuwaiti-six-player')throw new Error('وضعیت بازی کوت کویتی نامعتبر است');
 if(!Number.isInteger(auctionWinner)||auctionWinner<0||auctionWinner>5)throw new Error('برنده مزایده نامعتبر است');
 validateContract(contract);
 const noTrump=contract==='naras'||contract==='tak_naras'||contract==='saras';
 if(noTrump&&trumpSuit)throw new Error('قرارداد بدون حکم نمی‌تواند خال حکم داشته باشد');
 game.contract=contract;game.auctionWinner=auctionWinner;game.leader=auctionWinner;game.turn=auctionWinner;
 game.isMalzoom=!!isMalzoom;game.trumpAnnounced=!!trumpAnnounced;game.trumpSuit=noTrump?null:(trumpSuit||null);
 game.trick=[];game.trickNo=1;game.trickWinners=[];game.playedCards=[];game.lastTrick=[];game.done=false;
 return game;
}
function playCard(game,player,card){
 if(!game||game.mode!=='kuwaiti-six-player'||game.done)throw new Error('بازی فعال نیست');
 if(player!==game.turn)throw new Error('نوبت این بازیکن نیست');
 const hand=game.hands[player];
 const cardIndex=hand.findIndex(c=>c.id===card.id);
 if(cardIndex<0)throw new Error('این کارت در دست بازیکن نیست');
 const leadSuit=effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
 const activeTrumpSuit=game.trumpSuit&&(game.trumpAnnounced||player===game.auctionWinner)?game.trumpSuit:null;
 const allowed=legalCards(hand,leadSuit,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:activeTrumpSuit});
 if(!allowed.some(c=>c.id===card.id))throw new Error('بازی این کارت طبق قانون مجاز نیست');
 hand.splice(cardIndex,1);
 if(!Array.isArray(game.playedCards))game.playedCards=[];
 game.playedCards.push({player,card:{...card},trickNo:game.trickNo});
 if(game.trick.length===0)game.lastTrick=[];
 game.trick.push({player,card});
 if(game.trick.length<6){game.turn=(player+1)%6;return {completed:false,game};}
 const winner=findTrickWinner(game.trick,game.contract,{trickNo:game.trickNo,isMalzoom:game.isMalzoom,trumpAnnounced:game.trumpAnnounced,trumpSuit:game.trumpSuit});
 game.lastTrick=game.trick.map(p=>({...p}));game.lastWinner=winner.player;
 game.trickWinners.push(winner.player);
 game.leader=winner.player;game.turn=winner.player;game.trick=[];
 game.trickNo++;
 if(game.trickNo>9)game.done=true;
 return {completed:true,winner:winner.player,game};
}
function scoreContract(bid,tricksTaken,{success=null}={}){
 const ok=success===null?(typeof bid==='number'?tricksTaken>=bid:tricksTaken>=5):!!success;
 if(bid==='malzoom'){if(success===null)throw new Error('نتیجه موفقیت ملزوم باید صریح مشخص شود');return ok?5:-5;}
 if(bid===6)return ok?6:-12;
 if(bid===7)return ok?7:-14;
 if(bid===8)return ok?8:-16;
 if(bid===9)return ok?36:-18; // Baun is nine tricks.
 throw new Error('نوع قرارداد یا تعداد دست نامعتبر است');
}

function newGame({rng=Math.random,firstGame=true,previousAuctionWinner=null,firstAuctionPlayer=null}={}){
 const hands=deal(rng);
 const auctionStarter=firstGame?findOpeningPlayer(hands):firstAuctionPlayer;
 if(!firstGame&&(!Number.isInteger(previousAuctionWinner)||previousAuctionWinner<0||previousAuctionWinner>5))
   throw new Error('برای بازی بعدی، برنده مزایده قبلی لازم است');
 if(!firstGame&&(!Number.isInteger(auctionStarter)||auctionStarter<0||auctionStarter>5))
   throw new Error('تیم برنده باید نفر اول مزایده را مشخص کند');
 const obligatedPlayer=firstGame?(auctionStarter+5)%6:(previousAuctionWinner+5)%6;
 return {mode:'kuwaiti-six-player',players:6,hands,contract:null,leader:null,turn:null,
   auctionStarter,obligatedPlayer,trick:[],trickNo:1,trickWinners:[],score:{A:0,B:0},
   openingLeadRequired:false,done:false,firstGame,playedCards:[],lastTrick:[]};
}
const KuwaitiSixPlayerEngine={SUITS,RANKS,deck,shuffle,deal,teamOf,validateContract,isJoker,isTwoOfClubs,
 findOpeningPlayer,normalPower,cardPower,effectiveLeadSuit,legalCards,findTrickWinner,startPlay,playCard,scoreContract,newGame};
if(typeof module!=='undefined'&&module.exports)module.exports=KuwaitiSixPlayerEngine;
if(typeof window!=='undefined')window.KuwaitiSixPlayerEngine=KuwaitiSixPlayerEngine;

})();
