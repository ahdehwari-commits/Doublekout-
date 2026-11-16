const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../anonymous-learning.js'),'utf8');
let sent=null,confirmCalls=0;
const store=new Map();
const context={console,URL,Math,Number,Array,JSON,String,Promise,
 window:{confirm:()=>{confirmCalls++;return true;}},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 fetch:async(url,opts)=>{sent={url,opts};return {ok:true};}
};
vm.runInNewContext(source,context);
const api=context.window.DoubleKoutLearning;
assert.ok(api);
api.capture({mode:'double-kout',playerCount:4,player:2,hand:[{r:'A',s:'S'},{r:'K',s:'H'}],
 legalCards:[{r:'A',s:'S'},{r:'K',s:'H'}],chosen:{r:'K',s:'H'},plays:[{player:1,card:{r:'2',s:'S'}}],
 contract:'hokm',trumpSuit:'S',trickNo:3,ownScore:12,opponentScore:8,sequenceMode:true,partnerWinning:false});
assert.equal(confirmCalls,1,'consent is requested once');
(async()=>{
 await api.complete(0,[{player:1,card:{r:'2',s:'S'}},{player:2,card:{r:'K',s:'H'}},{player:3,card:{r:'3',s:'S'}},{player:0,card:{r:'A',s:'S'}}],4);
 assert.ok(sent,'decision batch is sent after trick resolution');
 assert.match(sent.url,/record_anonymous_learning_batch/);
 const payload=JSON.parse(sent.opts.body).p_events;
 assert.equal(payload.length,1);
 assert.equal(payload[0].outcome.trickWon,true,'winner is normalized relative to the human player');
 assert.equal(payload[0].state.plays[0].relativeSeat,3);
 const text=JSON.stringify(payload);
 for(const forbidden of ['user_id','player_id','device_id','display_name','email','phone','room_id','session_id'])assert.ok(!text.includes(forbidden),'no identity field: '+forbidden);
 console.log('Anonymous strategy-learning tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
