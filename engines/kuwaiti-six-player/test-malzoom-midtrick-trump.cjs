const assert = require('node:assert/strict');
const K = require('./engine.js');

const card = (rank, suit) => ({id:rank+suit,kind:'normal',rank,suit});
const blackJoker = {id:'JB',kind:'joker',color:'black'};
const play = (player, c, announced) => ({player,card:c,trumpAnnouncedAtPlay:announced});

// Case 1: Hearts are led. 6♦ is discarded before the hidden trump is revealed;
// 3♦ is played after reveal and must cut the earlier 6♦.
const caseOne = [
  play(0,card('A','H'),false),
  play(1,card('5','H'),false),
  play(2,card('6','D'),false),
  play(3,card('3','D'),true),
  play(4,card('4','H'),true),
  play(5,card('2','H'),true)
];
assert.equal(
  K.findTrickWinner(caseOne,'hokm',{trickNo:2,isMalzoom:true,trumpAnnounced:true,trumpSuit:'D'}).player,
  3,
  '3♦ revealed as trump after it is played must beat the earlier 6♦ discard'
);

// Control: if both diamonds were played after the reveal, the higher 6♦ wins.
const caseOneControl = caseOne.map((p,i)=>({...p,trumpAnnouncedAtPlay:i>=2}));
assert.equal(
  K.findTrickWinner(caseOneControl,'hokm',{trickNo:2,isMalzoom:true,trumpAnnounced:true,trumpSuit:'D'}).player,
  2,
  'when both trump cards are played after reveal, the higher trump wins'
);

// Case 2: Spades are led and later declared trump. The reveal must not make
// the earlier A♠ retroactively trump; nor may the 7♠ become a trump cut.
// Black joker therefore wins the led-suit trick.
const caseTwo = [
  play(0,card('A','S'),false),
  play(1,card('3','D'),true),
  play(2,blackJoker,true),
  play(3,card('7','S'),true),
  play(4,card('2','S'),true),
  play(5,card('4','S'),true)
];
assert.equal(
  K.findTrickWinner(caseTwo,'hokm',{trickNo:2,isMalzoom:true,trumpAnnounced:true,trumpSuit:'S'}).player,
  2,
  'when the led suit equals the revealed trump suit, black joker beats the ordinary led-suit cards'
);

// Control: without the joker, A♠ remains the highest ordinary card of the led suit.
assert.equal(
  K.findTrickWinner([caseTwo[0],caseTwo[1],play(2,card('5','D'),true),...caseTwo.slice(3)],'hokm',
    {trickNo:2,isMalzoom:true,trumpAnnounced:true,trumpSuit:'S'}).player,
  0,
  'same-suit reveal does not suppress normal rank ordering among ordinary cards'
);

console.log('PASS: 4 Malzoom mid-trick reveal regression scenarios.');
