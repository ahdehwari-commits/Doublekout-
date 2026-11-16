/* Anonymous strategy learning for Double Kout.
 * Only human decisions are sampled. No names, auth IDs, device IDs or stable seat IDs.
 * Events are uploaded after the trick result is known.
 */
(function(){
'use strict';
const URL='https://awgzilkxmtyrcxpouxif.supabase.co';
const KEY='sb_publishable_NKmVkAcOJUEAQI7oW7nd0g_3DM3lmCs';
let pending=[];
function card(c){if(!c)return null;return {rank:c.rank||c.r||null,suit:c.suit||c.s||null,kind:c.kind||'normal',color:c.color||null};}
function cleanPlays(plays,actor,count){return (plays||[]).map(p=>({relativeSeat:(p.player-actor+count)%count,card:card(p.card)}));}
function capture(x){
 if(!x||!Array.isArray(x.hand)||!Array.isArray(x.legalCards)||!x.legalCards.length)return;
 const count=x.playerCount||4,actor=x.player, ownTeam=actor%2;
 const hand=x.hand.map(card),legal=x.legalCards.map(card),plays=cleanPlays(x.plays,actor,count);
 const trump=x.trumpSuit||null,trumps=trump?hand.filter(c=>c.suit===trump).length:0;
 const state={mode:x.mode||'unknown',players:count,contract:x.contract||'hokm',
  trickNo:Number(x.trickNo||1),leadSuit:plays.length?plays[0].card.suit:null,
  hand,legal,plays,trump,trumpCount:trumps,partnerWinning:!!x.partnerWinning,
  auctionTarget:Number.isFinite(x.target)?x.target:null,
  ownScore:Number(x.ownScore||0),opponentScore:Number(x.opponentScore||0),
  sequenceMode:!!x.sequenceMode};
 const pattern=[state.mode,state.contract,state.trickNo,state.leadSuit||'-',legal.length,trumps,state.partnerWinning?1:0,state.sequenceMode?1:0].join('|');
 pending.push({actor,ownTeam,state,action:card(x.chosen),pattern});
}
async function complete(winner,plays,count){
 if(!pending.length)return;
 const batch=pending.splice(0,Math.min(pending.length,count||6));
 const result=batch.map(e=>{
  const relativeWinner=Number.isInteger(winner)?(winner-e.actor+e.state.players)%e.state.players:null;
  return {mode:e.state.mode,players:e.state.players,contract:e.state.contract,pattern:e.pattern,
   state:e.state,action:e.action,
   outcome:{trickWon:relativeWinner!==null&&relativeWinner%2===0,winnerRelativeSeat:relativeWinner,
    plays:cleanPlays(plays,e.actor,e.state.players)}};
 });
 try{
  const response=await fetch(URL+'/rest/v1/rpc/record_anonymous_learning_batch',{
   method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
   body:JSON.stringify({p_events:result})
  });
  if(!response.ok)throw new Error('HTTP '+response.status);
 }catch(err){console.warn('Anonymous strategy learning upload skipped:',err&&err.message||err);}
}
window.DoubleKoutLearning={capture,complete,discard:function(){pending=[];}};
})();