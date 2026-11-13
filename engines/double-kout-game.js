const DoubleKoutGameEngine=(function(root){
'use strict';
function engineRef(){const e=root.StandardHokmEngine||(typeof require==='function'?require('./standard-hokm/engine'):null);if(!e)throw new Error('StandardHokmEngine must be loaded first');return e;}
const teamOf=p=>p%2===0?'A':'B';
function cardAdapter(c){return {id:c.id,rank:c.rank!==undefined?c.rank:c.r,suit:c.suit||({'♠':'S','♥':'H','♦':'D','♣':'C'})[c.s],kind:c.kind||'normal',r:c.rank!==undefined?c.rank:c.r,s:({'S':'♠','H':'♥','D':'♦','C':'♣'})[c.suit]||c.s};}
function createGame({mode='double-kout',starter=0,rng=Math.random,challenge=null,contract='hokm',trumpSuit='S'}={}){
 if(!['double-kout','standard-hokm'].includes(mode))throw new Error('حالت بازی چهار نفره نامعتبر است');
 if(!Number.isInteger(starter)||starter<0||starter>3)throw new Error('صندلی شروع‌کننده نامعتبر است');
 const E=engineRef(),hands=E.deal(rng).map(h=>h.map(cardAdapter));
 return {mode,players:4,hands,initialHands:hands.map(h=>h.map(c=>({...c}))),trump:trumpSuit,trumpCode:trumpSuit,contract,leader:starter,hakemPlayer:starter,turn:starter,trickNo:1,plays:[],trickWinners:[],cardHistory:[],scoreA:0,scoreB:0,challenge:challenge==='A'||challenge==='B'?challenge:null,challengeResult:null,waitingChallenge:mode==='double-kout'&&challenge===null,done:false,history:[],revision:0};
}
function legalCards(game,player=game.turn){
 if(!game||game.done)throw new Error('بازی فعال نیست');
 const lead=game.plays.length?game.plays[0].card.suit:null;
 return engineRef().legalCards(game.hands[player],lead);
}
function beginPlay(game,challengeTeam=null){
 if(!game||game.done||!game.waitingChallenge)throw new Error('انتخاب شروع بازی در دسترس نیست');
 if(game.mode==='double-kout'&&challengeTeam!==null&&!['A','B'].includes(challengeTeam))throw new Error('تیم چالش نامعتبر است');
 game.challenge=challengeTeam;game.waitingChallenge=false;game.revision++;return game;
}
function finish(game){
 if(game.challenge){
  const result=engineRef()&&root.DoubleKoutSequence.evaluateChallenge(game.trickWinners,game.challenge);
  game.challengeResult=result;
  if(['success','failed-last-trick','failed-opponent-sequence'].includes(result.status)){game.done=true;game.history.push(result.status);return;}
 }
 if(game.trickNo>13){
  if(game.mode==='double-kout'){
   const r=root.DoubleKoutSequence.scoreSequence(game.trickWinners);game.scoreA=r.scores.A;game.scoreB=r.scores.B;
  }else{
   game.scoreA=game.trickWinners.filter(p=>teamOf(p)==='A').length;game.scoreB=13-game.scoreA;
  }
  game.done=true;
 }
}
function playCard(game,player,cardId){
 if(!game||game.done||game.waitingChallenge)throw new Error('بازی آماده دریافت کارت نیست');
 if(player!==game.turn)throw new Error('نوبت این بازیکن نیست');
 const hand=game.hands[player],card=hand.find(c=>c.id===cardId);
 if(!card)throw new Error('کارت در دست بازیکن نیست');
 if(!legalCards(game,player).some(c=>c.id===cardId))throw new Error('بازی این کارت طبق قانون مجاز نیست');
 hand.splice(hand.findIndex(c=>c.id===cardId),1);
 game.cardHistory.push({player,card:{...card},trickNo:game.trickNo});
 game.plays.push({player,card:{...card}});
 let completed=false,winner=null;
 if(game.plays.length===4){
  winner=engineRef().resolveTrick(game.plays.map(p=>({player:p.player,card:{suit:p.card.suit,rank:p.card.rank}})),game.trump,game.contract);
  game.trickWinners.push(winner);game.plays=[];game.trickNo++;game.leader=winner;game.turn=winner;completed=true;
  finish(game);
 }else game.turn=(player+1)%4;
 game.revision++;
 return {game,completed,winner,done:game.done};
}
function chooseAICard(game,player=game.turn,difficulty='normal'){
 const plays=game.plays.map(p=>({player:p.player,card:{suit:p.card.suit,rank:p.card.rank}}));
 return engineRef().chooseAICard(game.hands[player],plays,player,game.trump,difficulty,game.contract,game.cardHistory,game.initialHands[player]);
}
return {teamOf,createGame,legalCards,beginPlay,playCard,chooseAICard};
})(typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined'&&module.exports)module.exports=DoubleKoutGameEngine;
if(typeof window!=='undefined')window.DoubleKoutGameEngine=DoubleKoutGameEngine;
