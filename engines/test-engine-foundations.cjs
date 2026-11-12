const assert=require('node:assert/strict');
const k=require('./kuwaiti-six-player/engine');
const h=k.deal(()=>0.41);
assert.equal(h.length,6);assert.ok(h.every(x=>x.length===9));assert.equal(k.deck().length,54);
const red={kind:'joker',color:'red'},black={kind:'joker',color:'black'};
const c=(rank,suit='S')=>({id:rank+suit,kind:'normal',rank,suit});
// No-trump contracts and suit-based Hokm have their specified within-suit order.
assert.equal(k.normalPower(c('2'),'naras'),13);
assert.equal(k.normalPower(c('A'),'naras'),1);
assert.equal(k.normalPower(c('A'),'tak_naras'),13);
assert.equal(k.normalPower(c('2'),'tak_naras'),12);
assert.equal(k.normalPower(c('K'),'tak_naras'),1);
assert.equal(k.normalPower(c('A'),'saras'),13);
assert.equal(k.normalPower(c('K'),'saras'),12);
assert.equal(k.normalPower(c('2'),'saras'),1);
assert.equal(k.normalPower(c('A'),'hokm'),13);
assert.equal(k.normalPower(c('2'),'hokm'),1);
const hokmTrick=[
 {player:0,card:c('A','S')},{player:1,card:c('2','H')},
 {player:2,card:c('K','S')},{player:3,card:c('3','H')},
 {player:4,card:c('Q','S')},{player:5,card:c('J','S')}
];
assert.equal(k.findTrickWinner(hokmTrick,'hokm',{trickNo:1,trumpSuit:'H'}).player,3);
assert.equal(k.findTrickWinner(hokmTrick,'hokm',{trickNo:1,trumpSuit:null}).player,0);
assert.equal(k.cardPower(red,'naras'),10000);
assert.equal(k.cardPower(black,'naras'),8000);
assert.equal(k.cardPower(black,'naras',{trickNo:5}),0);
assert.equal(k.cardPower(black,'naras',{trickNo:4,isMalzoom:true,trumpAnnounced:false}),0);
assert.equal(k.cardPower(black,'naras',{trickNo:4,isMalzoom:true,trumpAnnounced:true}),8000);
assert.equal(k.cardPower(black,'naras',{trickNo:5,isMalzoom:true,trumpAnnounced:true}),0);
// Jokers cannot lead in tricks 1-8, but can be played later if void in led suit.
for(let n=1;n<=8;n++){
 assert.deepEqual(k.legalCards([red,black,c('8')],null,{trickNo:n,isFirstPlay:true}),[c('8')]);
}
assert.equal(k.legalCards([red,black,c('8')],null,{trickNo:9,isFirstPlay:true}).length,3);
assert.equal(k.legalCards([red,black,c('8')],'H',{trickNo:5,isFirstPlay:false}).length,3);
assert.equal(k.legalCards([red,black,c('8','H')],'H',{trickNo:5,isFirstPlay:false}).length,1);
// Ninth trick: led joker has zero power and second normal card sets the suit.
assert.equal(k.cardPower(red,'naras',{trickNo:9,isLead:true}),0);
assert.equal(k.cardPower(black,'saras',{trickNo:9,isLead:true}),0);
assert.equal(k.effectiveLeadSuit([{card:red},{card:c('7','H')}],{trickNo:9}),'H');
assert.equal(k.effectiveLeadSuit([{card:black},{card:c('K','D')}],{trickNo:9}),'D');
// 2 clubs selects first auction player only; it is no longer forced to lead the first trick.
const g=k.newGame({rng:()=>0.41});
assert.equal(g.auctionStarter,k.findOpeningPlayer(g.hands));
assert.equal(g.turn,null);assert.equal(g.leader,null);assert.equal(g.openingLeadRequired,false);
assert.equal(g.obligatedPlayer,(g.auctionStarter+5)%6,'first-game obligor must be the player immediately before the 2C holder');
const later=k.newGame({rng:()=>0.41,firstGame:false,previousAuctionWinner:3,firstAuctionPlayer:1});
assert.equal(later.obligatedPlayer,2);assert.equal(later.auctionStarter,1);
// Invalid contract validation.
assert.throws(()=>k.cardPower(red,'bad'));
assert.equal(k.scoreContract(6,6),6);assert.equal(k.scoreContract(6,5),-12);
assert.equal(k.scoreContract(7,7),7);assert.equal(k.scoreContract(7,6),-14);
assert.equal(k.scoreContract(8,8),8);assert.equal(k.scoreContract(8,7),-16);
assert.equal(k.scoreContract(9,9),36);assert.equal(k.scoreContract(9,8),-18);
assert.equal(k.scoreContract('malzoom',0,{success:true}),5);
assert.equal(k.scoreContract('malzoom',0,{success:false}),-5);
assert.throws(()=>k.scoreContract('malzoom',0),/نتیجه موفقیت ملزوم/);
// The holder of 2C chooses the first auction seat, not the first trick leader.
const noTrumpGuard=k.newGame({rng:()=>0.41});
assert.throws(()=>k.startPlay(noTrumpGuard,0,'naras',{trumpSuit:'C'}),/بدون حکم/);
k.startPlay(noTrumpGuard,0,'naras',{trumpSuit:null});
assert.equal(noTrumpGuard.trumpSuit,null);
assert.equal(noTrumpGuard.contract,'naras');
const playGame=k.newGame({rng:()=>0.41});
playGame.hands=[
 [{id:'2S',kind:'normal',rank:'2',suit:'S'}],
 [{id:'3S',kind:'normal',rank:'3',suit:'S'}],
 [{id:'4S',kind:'normal',rank:'4',suit:'S'}],
 [{id:'5S',kind:'normal',rank:'5',suit:'S'}],
 [{id:'6S',kind:'normal',rank:'6',suit:'S'}],
 [{id:'7S',kind:'normal',rank:'7',suit:'S'}]
];
k.startPlay(playGame,0,'naras');
let outcome;
for(let p=0;p<6;p++)outcome=k.playCard(playGame,p,playGame.hands[p][0]);
assert.equal(outcome.completed,true);assert.equal(outcome.winner,0);
assert.equal(playGame.trickNo,2);assert.equal(playGame.turn,0);

const trumpHand=[c('9','S'),c('2','H'),c('A','D'),c('K','C')];
assert.deepEqual(k.legalCards(trumpHand,'S',{trickNo:2,isFirstPlay:false,trumpSuit:'H'}),[c('9','S')]);
const voidHand=[c('2','H'),c('A','D')];
assert.deepEqual(k.legalCards(voidHand,'S',{trickNo:2,isFirstPlay:false,trumpSuit:'H'}),[c('2','H')]);
const cutPlays=[
 {player:0,card:c('10','S')},{player:1,card:c('2','H')},
 {player:2,card:c('2','S')},{player:3,card:c('A','S')},
 {player:4,card:c('K','S')},{player:5,card:c('Q','S')}
];
assert.equal(k.findTrickWinner(cutPlays,'naras',{trickNo:1,trumpSuit:'H'}).player,1);
assert.equal(k.findTrickWinner(cutPlays,'naras',{trickNo:1,trumpSuit:null}).player,2);


const hiddenObligor=k.newGame({rng:()=>0.3});
hiddenObligor.hands=Array.from({length:6},()=>[]);
hiddenObligor.hands[1]=[c('2','H'),c('3','D')];
k.startPlay(hiddenObligor,1,'naras',{isMalzoom:true,trumpAnnounced:false,trumpSuit:'H'});
hiddenObligor.trick=[{player:0,card:c('10','S')}];hiddenObligor.turn=1;
assert.throws(()=>k.playCard(hiddenObligor,1,c('3','D')),/طبق قانون مجاز نیست/);
assert.equal(k.playCard(hiddenObligor,1,c('2','H')).completed,false);
const hiddenOpponent=k.newGame({rng:()=>0.3});
hiddenOpponent.hands=Array.from({length:6},()=>[]);
hiddenOpponent.hands[1]=[c('2','H'),c('3','D')];
k.startPlay(hiddenOpponent,0,'naras',{isMalzoom:true,trumpAnnounced:false,trumpSuit:'H'});
hiddenOpponent.trick=[{player:0,card:c('10','S')}];hiddenOpponent.turn=1;
assert.equal(k.playCard(hiddenOpponent,1,c('3','D')).completed,false);

console.log('PASS: six-player suit-based Hokm, no-trump ranks, hidden Malzoom joker, lead restrictions, ninth trick and auction setup');
