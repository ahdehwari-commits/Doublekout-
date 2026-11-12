const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const hokm=require('./standard-hokm/engine');
const hands=hokm.deal(()=>0.37);
assert.equal(hands.length,4);
assert.ok(hands.every(h=>h.length===13));
assert.equal(new Set(hands.flat().map(c=>c.id)).size,52);
const sample=[{id:'AS',rank:'A',suit:'S'},{id:'KH',rank:'K',suit:'H'},{id:'2S',rank:'2',suit:'S'}];
assert.deepEqual(hokm.legalCards(sample,'S').map(c=>c.id),['AS','2S']);
assert.deepEqual(hokm.legalCards(sample,'D').map(c=>c.id),sample.map(c=>c.id));
assert.equal(hokm.beats({rank:'2',suit:'S'},{rank:'A',suit:'H'},'H','S'),true);
assert.equal(hokm.beats({rank:'A',suit:'H'},{rank:'K',suit:'H'},'H','S'),true);
assert.equal(hokm.beats({rank:'2',suit:'D'},{rank:'A',suit:'H'},'H','S'),false);
const plays=[{player:0,card:{rank:'A',suit:'H'}},{player:1,card:{rank:'2',suit:'S'}},{player:2,card:{rank:'K',suit:'H'}},{player:3,card:{rank:'A',suit:'D'}}];
assert.equal(hokm.currentWinner(plays.slice(0,1),'S'),0);
assert.equal(hokm.currentWinner(plays.slice(0,2),'S'),1);
assert.equal(hokm.currentWinner(plays.slice(0,3),'S'),1);
assert.equal(hokm.resolveTrick(plays,'S'),1);
assert.equal(hokm.rankPower('A','hokm'),13);
assert.equal(hokm.rankPower('K','hokm'),12);
assert.equal(hokm.rankPower('Q','hokm'),11);
assert.equal(hokm.rankPower('2','hokm'),1);
assert.equal(hokm.rankPower('2','naras'),13);
assert.equal(hokm.rankPower('A','naras'),1);
assert.equal(hokm.rankPower('A','tak_naras'),13);
assert.equal(hokm.rankPower('2','tak_naras'),12);
assert.equal(hokm.rankPower('K','tak_naras'),1);
assert.equal(hokm.rankPower('A','saras'),13);
assert.equal(hokm.rankPower('2','saras'),1);
assert.equal(hokm.beats({rank:'2',suit:'S'},{rank:'A',suit:'H'},'H','S','hokm'),true);
assert.equal(hokm.beats({rank:'2',suit:'S'},{rank:'A',suit:'H'},'H','S','naras'),false);
assert.equal(hokm.beats({rank:'2',suit:'H'},{rank:'A',suit:'H'},'H',null,'naras'),true);
assert.equal(hokm.koutMessage(0,13,0),'حاکم کوت شدید');
assert.equal(hokm.koutMessage(0,13,1),'شما کوت شدید');
assert.equal(hokm.koutMessage(13,0,1),'حاکم حریف کوت شد');
assert.equal(hokm.koutMessage(13,0,0),'حریف شما کوت شد');
assert.equal(hokm.koutMessage(0,13,2),'حاکم کوت شدید');
assert.equal(hokm.koutMessage(13,0,3),'حاکم حریف کوت شد');
for(let target=0;target<4;target++){
 const ranks=['2','3','4','5'];ranks[target]='A';
 const four=r=>({player:r,card:{rank:ranks[r],suit:'H'}});
 assert.equal(hokm.resolveTrick([0,1,2,3].map(four),'S'),target);
}
assert.equal(hokm.resolveTrick([
 {player:0,card:{rank:'A',suit:'H'}},
 {player:1,card:{rank:'2',suit:'S'}},
 {player:2,card:{rank:'K',suit:'H'}},
 {player:3,card:{rank:'3',suit:'S'}}
],'S','hokm'),3);
const noTrumpCases=[
 ['naras','2','3','4'],
 ['tak_naras','A','2','3'],
 ['saras','A','K','Q']
];
for(const [contract,leadRank,thirdRank,fourthRank] of noTrumpCases){
 const noCut=hokm.currentWinner([
  {player:0,card:{rank:leadRank,suit:'H'}},
  {player:1,card:{rank:contract==='naras'?'A':'2',suit:'S'}},
  {player:2,card:{rank:thirdRank,suit:'H'}},
  {player:3,card:{rank:fourthRank,suit:'H'}}
 ],null,contract);
 assert.equal(noCut,0,'off-suit card must not cut in '+contract);
}
assert.equal(hokm.currentWinner([
 {player:0,card:{rank:'2',suit:'H'}},
 {player:1,card:{rank:'A',suit:'H'}},
 {player:2,card:{rank:'3',suit:'H'}},
 {player:3,card:{rank:'4',suit:'H'}}
 ],null,'naras'),0);
assert.equal(hokm.currentWinner([
 {player:0,card:{rank:'2',suit:'H'}},
 {player:1,card:{rank:'A',suit:'H'}},
 {player:2,card:{rank:'3',suit:'H'}},
 {player:3,card:{rank:'4',suit:'H'}}
 ],null,'tak_naras'),1);

assert.equal(hokm.koutMessage(5,8,0),null);

const chooseHand=[{id:'3H',rank:'3',suit:'H'},{id:'2S',rank:'2',suit:'S'}];
assert.equal(hokm.chooseAICard(chooseHand,[{player:0,card:{rank:'2',suit:'H'}}],1,'S').id,'3H');
const partnerHand=[{id:'2H',rank:'2',suit:'H'},{id:'3H',rank:'3',suit:'H'}];
assert.equal(hokm.chooseAICard(partnerHand,[{player:0,card:{rank:'A',suit:'H'}}],2,'S').id,'2H');
const overtakeHand=[{id:'2H',rank:'2',suit:'H'},{id:'AH',rank:'A',suit:'H'}];
assert.equal(hokm.chooseAICard(overtakeHand,[{player:0,card:{rank:'2',suit:'H'}}],3,'S').id,'AH');
assert.equal(hokm.currentWinner([{player:0,card:{rank:'2',suit:'H'}},{player:1,card:{rank:'A',suit:'H'}}],'S'),1);
const game=hokm.newGame({starter:2,matchNumber:1,rng:()=>0.37});
assert.equal(game.turn,2);assert.equal(game.trump,'S');assert.equal(game.hands.length,4);
console.log('PASS: standard four-player Hokm deal, follow-suit, trump and trick winner');
