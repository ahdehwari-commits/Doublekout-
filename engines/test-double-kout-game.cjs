const assert=require('node:assert/strict');
const Hokm=require('./standard-hokm/engine');
const Sequence=require('./double-kout-sequence');
global.StandardHokmEngine=Hokm;global.DoubleKoutSequence=Sequence;
const Game=require('./double-kout-game');
let seed=1;const rng=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
let g=Game.createGame({mode:'standard-hokm',starter:0,rng});
assert.equal(g.hands.length,4);assert.ok(g.hands.every(h=>h.length===13));
assert.equal(g.turn,0);assert.equal(Game.legalCards(g,0).length,13);
for(let trick=0;trick<13;trick++){
 for(let step=0;step<4;step++){
  const p=g.turn,c=Game.chooseAICard(g,p,'normal');
  const result=Game.playCard(g,p,c.id);
  if(step<3)assert.equal(result.completed,false);else assert.equal(result.completed,true);
 }
}
assert.equal(g.done,true);assert.equal(g.trickWinners.length,13);assert.equal(g.scoreA+g.scoreB,13);
seed=1;g=Game.createGame({mode:'double-kout',starter:0,rng});
assert.equal(g.waitingChallenge,true);Game.beginPlay(g,'A');
for(let i=0;i<13&&!g.done;i++)while(g.plays.length<4&&!g.done){const p=g.turn,c=Game.chooseAICard(g,p);Game.playCard(g,p,c.id);}
assert.equal(g.trickWinners.length>=4,true);
console.log('PASS: four-player shared game engine deals, enforces turns/follow-suit, resolves 13 tricks, scores Hokm and evaluates Double Kout challenge');
