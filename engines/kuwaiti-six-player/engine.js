// Six-player Kuwaiti Kout core. Contract scoring and auction UI are separate modules.
const SUITS=['S','H','D','C'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const POWER=Object.fromEntries(RANKS.map((r,i)=>[r,i+1]));
const CONTRACTS=new Set(['naras','tak_naras','saras']);
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

// The ninth-trick exception: a joker led first has no power and does not establish
// the lead suit. The second player's card establishes the trick's background suit.
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
function cardPower(card,contract,{trickNo=1,isLead=false,isFinalTrick=false,isBidderLead=false}={}){
 validateContract(contract);
 if(!card||typeof card!=='object')throw new TypeError('کارت نامعتبر است');
 const joker=isJoker(card);
 // Ninth trick only: either joker, if led first, is powerless (not illegal).
 if(trickNo===9&&isLead&&joker)return 0;
 // A joker cannot establish a suit on other leads in this foundation.
 if(joker&&isLead)return -1;
 if(joker&&card.color==='black'&&trickNo>4)return -1;
 if(joker&&isFinalTrick&&isBidderLead)return -1;
 if(joker&&card.color==='red')return 10000;
 if(contract==='naras'&&card.kind==='normal'&&card.rank==='2')return 9000;
 if((contract==='tak_naras'||contract==='saras')&&card.kind==='normal'&&card.rank==='A')return 9000;
 if(joker&&card.color==='black')return 8000;
 if(card.kind==='normal'&&POWER[card.rank])return POWER[card.rank];
 throw new Error('نوع یا رتبه کارت ناشناخته است');
}
function legalCards(hand,leadSuit,{trickNo=1,openingLeadRequired=false}={}){
 if(openingLeadRequired){
   const opening=hand.filter(isTwoOfClubs);
   if(opening.length!==1)throw new Error('کارت ۲ خاج برای شروع در دست این بازیکن نیست');
   return opening;
 }
 if(!leadSuit){
   // Jokers may be held for a later play; the opening lead is separately constrained to 2♣.
   return hand.filter(c=>c.kind==='normal');
 }
 const follow=hand.filter(c=>c.kind==='normal'&&c.suit===leadSuit);
 // Jokers do not have a suit. They may be used only when the player cannot follow suit.
 return follow.length?follow:hand.filter(c=>c.kind!=='joker'||trickNo<=4);
}
function findOpeningPlayer(hands){
 if(!Array.isArray(hands)||hands.length!==6)throw new Error('کوت کویتی به شش دست کارت نیاز دارد');
 const holders=hands.map((hand,index)=>hand.some(isTwoOfClubs)?index:-1).filter(i=>i>=0);
 if(holders.length!==1)throw new Error('دارنده یکتای ۲ خاج پیدا نشد');
 return holders[0];
}
function newGame({rng=Math.random}={}){
 const hands=deal(rng),starter=findOpeningPlayer(hands);
 return {mode:'kuwaiti-six-player',players:6,hands,contract:null,leader:starter,turn:starter,
   trick:[],trickNo:1,trickWinners:[],score:{A:0,B:0},openingLeadRequired:true,done:false};
}
module.exports={SUITS,RANKS,deck,shuffle,deal,teamOf,validateContract,isJoker,isTwoOfClubs,
 effectiveLeadSuit,cardPower,legalCards,findOpeningPlayer,newGame};
