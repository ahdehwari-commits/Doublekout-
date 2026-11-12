const assert=require('node:assert/strict');
const k=require('./kuwaiti-six-player/engine');
const h=k.deal(()=>0.41);
assert.equal(h.length,6);assert.ok(h.every(x=>x.length===9));assert.equal(k.deck().length,54);
const red={kind:'joker',color:'red'},black={kind:'joker',color:'black'};
const c=(rank,suit='S')=>({kind:'normal',rank,suit});
// All contracts are no-trump and have their specified within-suit order.
assert.equal(k.normalPower(c('2'),'naras'),13);
assert.equal(k.normalPower(c('A'),'naras'),1);
assert.equal(k.normalPower(c('A'),'tak_naras'),13);
assert.equal(k.normalPower(c('2'),'tak_naras'),12);
assert.equal(k.normalPower(c('K'),'tak_naras'),1);
assert.equal(k.normalPower(c('A'),'saras'),13);
assert.equal(k.normalPower(c('K'),'saras'),12);
assert.equal(k.normalPower(c('2'),'saras'),1);
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
const later=k.newGame({rng:()=>0.41,firstGame:false,previousAuctionWinner:3,firstAuctionPlayer:1});
assert.equal(later.obligatedPlayer,2);assert.equal(later.auctionStarter,1);
// Invalid contract validation.
assert.throws(()=>k.cardPower(red,'bad'));
console.log('PASS: Kuwaiti contracts, no-trump ranks, hidden Malzoom joker, lead restrictions, ninth trick and auction setup');
