// Six-player Kuwaiti Kout core. Contract scoring and auction UI are separate modules.
const SUITS=['S','H','D','C'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const POWER=Object.fromEntries(RANKS.map((r,i)=>[r,i+1]));
const CONTRACTS=new Set(['naras','tak_naras','saras']);
function deck(){const cards=SUITS.flatMap(s=>RANKS.map(r=>({id:r+s,kind:'normal',rank:r,suit:s})));cards.push({id:'JR',kind:'joker',color:'red'},{id:'JB',kind:'joker',color:'black'});return cards;}
function shuffle(cards,rng=Math.random){const a=[...cards];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function deal(rng=Math.random){const cards=shuffle(deck(),rng),hands=Array.from({length:6},()=>[]);cards.forEach((c,i)=>hands[i%6].push(c));return hands;}
function teamOf(player){return player%2===0?'A':'B';}
function validateContract(contract){if(!CONTRACTS.has(contract))throw new Error('قرارداد کوت کویتی نامعتبر است: '+contract);}
function cardPower(card,contract,{trickNo=1,isLead=false,isFinalTrick=false,isBidderLead=false}={}) {
 validateContract(contract);
 if(!card||typeof card!=='object')throw new TypeError('کارت نامعتبر است');
 const joker=card.kind==='joker';
 // Neither joker may establish the lead suit. The ninth-trick lead exception is explicit.
 if(joker&&isLead)return -1;
 if(joker&&card.color==='black'&&trickNo>4)return -1;
 if(joker&&isFinalTrick&&isBidderLead)return -1;
 if(card.kind==='joker'&&card.color==='red')return 10000;
 if(contract==='naras'&&card.kind==='normal'&&card.rank==='2')return 9000;
 if((contract==='tak_naras'||contract==='saras')&&card.kind==='normal'&&card.rank==='A')return 9000;
 if(joker&&card.color==='black')return 8000;
 if(card.kind==='normal'&&POWER[card.rank])return POWER[card.rank];
 throw new Error('نوع یا رتبه کارت ناشناخته است');
}
function legalCards(hand,leadSuit,{trickNo=1}={}) {
 if(!leadSuit)return hand.filter(c=>c.kind!=='joker');
 const follow=hand.filter(c=>c.kind==='normal'&&c.suit===leadSuit);
 // Jokers do not create a suit; they are legal only when no card of the led suit remains.
 return follow.length?follow:hand.filter(c=>c.kind!=='joker'||trickNo<=4);
}
function newGame({starter=0,rng=Math.random}={}){return {mode:'kuwaiti-six-player',players:6,hands:deal(rng),contract:null,leader:starter,turn:starter,trick:[],trickNo:1,trickWinners:[],score:{A:0,B:0},done:false};}
module.exports={SUITS,RANKS,deck,shuffle,deal,teamOf,validateContract,cardPower,legalCards,newGame};
