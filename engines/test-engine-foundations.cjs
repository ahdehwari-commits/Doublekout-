const assert=require('node:assert/strict');
const kuwaiti=require('./kuwaiti-six-player/engine');
const h=kuwaiti.deal(()=>0.41);
assert.equal(h.length,6);assert.ok(h.every(x=>x.length===9));
assert.equal(kuwaiti.deck().length,54);
const red={kind:'joker',color:'red'},black={kind:'joker',color:'black'};
assert.equal(kuwaiti.cardPower(red,'naras'),10000);
assert.equal(kuwaiti.cardPower({kind:'normal',rank:'2'},'naras'),9000);
assert.equal(kuwaiti.cardPower(black,'naras'),8000);
assert.equal(kuwaiti.cardPower({kind:'normal',rank:'A'},'saras'),9000);
assert.equal(kuwaiti.cardPower(black,'naras',{trickNo:5}),-1);
assert.equal(kuwaiti.cardPower(red,'naras',{isLead:true}),-1);
assert.throws(()=>kuwaiti.cardPower(red,'bad'));

// Opening must be led by the unique holder of 2 clubs.
const game=kuwaiti.newGame({rng:()=>0.41});
assert.equal(game.openingLeadRequired,true);
assert.ok(game.hands[game.turn].some(kuwaiti.isTwoOfClubs));
const opening=kuwaiti.legalCards(game.hands[game.turn],null,{openingLeadRequired:true});
assert.equal(opening.length,1);
assert.equal(opening[0].rank,'2');assert.equal(opening[0].suit,'C');
assert.equal(kuwaiti.findOpeningPlayer(game.hands),game.turn);

// Ninth-trick exception applies to both jokers: zero power, and player two sets suit.
assert.equal(kuwaiti.cardPower(red,'naras',{trickNo:9,isLead:true}),0);
assert.equal(kuwaiti.cardPower(black,'saras',{trickNo:9,isLead:true}),0);
assert.equal(kuwaiti.effectiveLeadSuit([{card:red},{card:{kind:'normal',rank:'7',suit:'H'}}],{trickNo:9}),'H');
assert.equal(kuwaiti.effectiveLeadSuit([{card:black},{card:{kind:'normal',rank:'K',suit:'D'}}],{trickNo:9}),'D');
assert.equal(kuwaiti.effectiveLeadSuit([{card:red},{card:{kind:'normal',rank:'7',suit:'H'}}],{trickNo:8}),null);
console.log('PASS: six-player deal, opening 2C, contracts, joker ranking and ninth-trick lead exception');
