const assert=require('node:assert/strict');
const {scoreSequence,evaluateChallenge}=require('./double-kout-sequence');
const team=p=>p%2===0?'A':'B';

// First valid sequence is 3-4: all four initial tricks belong to that player.
let r=scoreSequence([0,1,2,2,1,3,0,1,2,3,0,1,2]);
assert.equal(r.groups[0].from,1);assert.equal(r.groups[0].to,4);assert.equal(r.groups[0].count,4);assert.equal(r.groups[0].team,'A');
// 3-4 fails, but 4-5 succeeds: all five tricks are the first group.
r=scoreSequence([0,1,2,3,3,1,0,1,2,3,0,1,2]);
assert.equal(r.groups[0].to,5);assert.equal(r.groups[0].count,5);assert.equal(r.groups[0].team,'B');
// 4-5 fails, 5-6 succeeds: all six tricks belong to the first group.
r=scoreSequence([0,1,2,3,0,0,1,2,3,1,2,3,1]);
assert.equal(r.groups[0].to,6);assert.equal(r.groups[0].count,6);assert.equal(r.groups[0].team,'A');
// No valid sequence: trick 13 winner receives all 13.
r=scoreSequence([0,1,2,3,0,1,2,3,0,1,2,3,1]);
assert.equal(r.groups.length,1);assert.equal(r.groups[0].count,13);assert.equal(r.groups[0].winner,1);assert.equal(r.scores.B,13);
// After a group closes, the next group starts from the next trick.
r=scoreSequence([0,1,2,2,1,1,0,3,2,3,0,1,2]);
assert.deepEqual(r.groups.map(g=>[g.from,g.to,g.count]),[[1,4,4],[5,6,2],[7,13,7]]);
assert.equal(r.total,13);

// Challenge: own team's streak is ignored.
assert.equal(evaluateChallenge([0,0,0,1,0,1,0,1,0,1,0,1,0],'A').status,'success');
// Opponent pair in tricks 1-2 or 2-3 is not a loss.
assert.equal(evaluateChallenge([1,1,1,0],'A').status,'pending');
// Opponent pair in tricks 3-4 ends the challenge immediately.
let c=evaluateChallenge([0,1,1,1],'A');assert.equal(c.status,'failed-opponent-sequence');assert.equal(c.endedAtTrick,4);
// Opponent pair in tricks 4-5 also ends it immediately.
c=evaluateChallenge([0,1,0,1,1],'A');assert.equal(c.status,'failed-opponent-sequence');assert.equal(c.endedAtTrick,5);
// If no opposing sequence through trick 12, challenger must win trick 13.
const prefix=[0,1,0,1,0,1,0,1,0,1,0,1];
assert.equal(evaluateChallenge([...prefix,0],'A').status,'success');
assert.equal(evaluateChallenge([...prefix,1],'A').status,'failed-last-trick');
console.log('PASS: Double Kout sequence scoring and challenge regression cases');
