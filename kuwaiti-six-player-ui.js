(function(){
'use strict';
window.__doubleKoutKuwaitiUIFileLoaded=true;
let K=window.KuwaitiSixPlayerEngine;
const $=id=>document.getElementById(id);
const suitGlyph={S:'♠',H:'♥',D:'♦',C:'♣'};
const suitName={S:'پیک',H:'دل',D:'خشت',C:'گشنیز'};
const contractName={hokm_spades:'پیک',hokm_hearts:'دل',hokm_diamonds:'خشت',hokm_clubs:'گشنیز',naras:'نرس',tak_naras:'تک نرس',saras:'سرس',hokm:'حکم',malzoom:'ملزوم'};
const playerNames=['بازیکن ۱','بازیکن ۲','بازیکن ۳','بازیکن ۴','بازیکن ۵','بازیکن ۶'];
const team=p=>K.teamOf(p);
const fa=n=>String(n).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
let game=null,auction=null,firstGame=true,previousAuctionWinner=null,previousWinningTeam=null,humanSeats=new Set([0]),hotseatRevealed=false,matchGamesWon={A:0,B:0};
let points={A:0,B:0},trickView=[],locked=false,aiTimer=null,matchLimit=54,playedTricks=0;

let onlineKuwaiti=null,onlineKuwaitiBusy=false,onlineKuwaitiRefreshQueued=false,onlineKuwaitiAiTimer=null,onlineKuwaitiAiBusy=false,onlineKuwaitiBidBusy=false;
function isOnlineKuwaiti(){return !!(onlineKuwaiti&&onlineKuwaiti.roomId);}
function onlineKuwaitiStatus(message){if($('kStatus'))setStatus(message);}
async function onlineKuwaitiRpc(action){
 if(!isOnlineKuwaiti()||!window.DoubleKoutOnline)throw new Error('اتصال اتاق شش‌نفره برقرار نیست');
 const r=await window.DoubleKoutOnline.rpc('kuwaiti_online_action',{p_room_id:onlineKuwaiti.roomId,p_action:action});
 if(r.error)throw r.error;
 await refreshOnlineKuwaiti();
 return r.data;
}
function scheduleKuwaitiOnlineAI(){
 if(!isOnlineKuwaiti()||!onlineKuwaiti.isHost||onlineKuwaitiAiBusy||onlineKuwaitiAiTimer)return;
 const st=onlineKuwaiti.state||{};
 const phase=st.phase;
 const seat=phase==='malzoom_result'?Number(st.auctionWinner):Number(st.turn);
 const meta=(st.seatPlayers||{})[String(seat)];
 if(!Number.isInteger(seat)||!meta||meta.human!==false)return;
 onlineKuwaitiAiTimer=setTimeout(async()=>{
  onlineKuwaitiAiTimer=null;
  if(!isOnlineKuwaiti()||!onlineKuwaiti.isHost||onlineKuwaitiAiBusy)return;
  onlineKuwaitiAiBusy=true;
  try{
   const r=await window.DoubleKoutOnline.rpc('kuwaiti_online_ai_turn',{p_room_id:onlineKuwaiti.roomId});
   if(r.error)throw r.error;
   await refreshOnlineKuwaiti();
  }catch(e){
   const message=String(e&&e.message||e);
   // A delayed AI call can arrive after the turn has moved to a human.
   // Refresh the authoritative state, but do not expose this expected race as an error.
   if(!message.includes('current_turn_is_human'))onlineKuwaitiStatus('نوبت هوش مصنوعی: '+message);
   try{await refreshOnlineKuwaiti();}catch(_){}
  }finally{
   onlineKuwaitiAiBusy=false;
   scheduleKuwaitiOnlineAI();
  }
 },650);
}
async function refreshOnlineKuwaiti(){
 if(!isOnlineKuwaiti()||!window.DoubleKoutOnline)return false;
 if(onlineKuwaitiBusy){onlineKuwaitiRefreshQueued=true;return true;}
 const requestContext=onlineKuwaiti,requestRoomId=requestContext.roomId;
 onlineKuwaitiBusy=true;let refreshOk=false;
 try{
  const r=await window.DoubleKoutOnline.rpc('kuwaiti_online_snapshot',{p_room_id:requestRoomId});
  if(r.error)throw r.error;
  if(onlineKuwaiti!==requestContext||!isOnlineKuwaiti()||onlineKuwaiti.roomId!==requestRoomId)return false;
  const d=r.data||{},incomingRevision=Number(d.revision||0),seat=Number(d.seat);
  if(!Number.isFinite(incomingRevision)||incomingRevision<0)throw new Error('شماره نسخه وضعیت کوت کویتی معتبر نیست');
  if(incomingRevision<Number(requestContext.revision||0))return true;
  const incomingHand=Array.isArray(d.hand)?d.hand:[],incomingHandSignature=JSON.stringify(incomingHand);
  const sameRevision=incomingRevision===Number(requestContext.revision||0);
  if(sameRevision&&incomingHandSignature===requestContext.handSignature)return true;
  const st=sameRevision?(requestContext.state||{}):(d.state||{});
  if(!Number.isInteger(seat)||seat<0||seat>5)throw new Error('صندلی حساب در اتاق پیدا نشد');
  if(onlineKuwaiti!==requestContext||!isOnlineKuwaiti()||onlineKuwaiti.roomId!==requestRoomId)return false;
  onlineKuwaiti.seat=seat;if(incomingRevision>Number(onlineKuwaiti.revision||0))onlineKuwaiti.revision=incomingRevision;
  onlineKuwaiti.state=st;onlineKuwaiti.legalCardIds=Array.isArray(d.legal_card_ids)?d.legal_card_ids:[];
  onlineKuwaiti.hand=incomingHand;onlineKuwaiti.handSignature=incomingHandSignature;
  onlineKuwaiti.status=d.status;
  onlineKuwaiti.trumpSuit=d.trump_suit||null;
  $('kPlayStyle').value='online';humanSeats=new Set([seat]);hotseatRevealed=true;
  const names=st.seatPlayers||{};
  for(let p=0;p<6;p++){
   const name=names[String(p)]&&names[String(p)].name||('بازیکن '+fa(p+1));
   playerNames[p]=name;
   const n=$('kName'+p);if(n)n.textContent=name;
  }
  const counts=Array.isArray(d.hand_counts)?d.hand_counts:[9,9,9,9,9,9];
  const hands=Array.from({length:6},(_,p)=>p===seat?onlineKuwaiti.hand:Array.from({length:Number(counts[p]||0)},(_,i)=>({id:'hidden-'+p+'-'+i,kind:'hidden'})));
  const plays=Array.isArray(st.plays)?st.plays.map(x=>({player:Number(x.player),card:x.card})):[];
  const last=Array.isArray(st.lastTrick)?st.lastTrick.map(x=>({player:Number(x.player),card:x.card})):[];
  game={
   mode:'kuwaiti-six-player',players:6,hands,contract:st.contract||null,selectedContract:st.selectedContract||null,
   auctionWinner:st.auctionWinner===null||st.auctionWinner===undefined?null:Number(st.auctionWinner),
   auctionBid:st.auctionBid||null,isMalzoom:!!st.isMalzoom,hiddenTrump:!!st.hiddenTrump,
   trumpAnnounced:!!st.trumpAnnounced,trumpSuit:onlineKuwaiti.trumpSuit,target:st.target===null?null:Number(st.target),
   turn:Number(st.turn||0),leader:Number(st.leader||0),trick:plays,trickNo:Number(st.trickNo||1),
   trickWinners:Array.isArray(st.trickWinners)?st.trickWinners.map(Number):[],lastTrick:last,
   obligatedPlayer:Number(st.obligatedPlayer||0),done:['finished','malzoom_result'].includes(st.phase),
   scoreRecorded:st.phase==='finished',opponentTricks:st.opponentTricks,maxOpponentTricks:st.target?9-Number(st.target):undefined
  };
  points={A:Number(st.scoreA||0),B:Number(st.scoreB||0)};
  matchLimit=Number(st.matchLimit||54);firstGame=!!st.firstGame;
  previousAuctionWinner=st.previousAuctionWinner===null?null:Number(st.previousAuctionWinner);
  previousWinningTeam=st.previousWinningTeam||null;
  auction=st.phase==='auction'?{
   starter:Number(st.auctionStarter||0),current:Number(st.turn||0),
   highest:st.highest&&st.highest!=='null'?st.highest:null,
   highestRank:Number(st.highestRank||0),
   highestPlayer:st.highestPlayer===null||st.highestPlayer===undefined?null:Number(st.highestPlayer),
   passes:Number(st.passes||0),bids:Array.isArray(st.bids)?st.bids:[],lastBidder:null
  }:null;
  $('kScoreA').textContent=fa(points.A);$('kScoreB').textContent=fa(points.B);
  $('kMatchProgress').textContent='حد امتیاز مسابقه: '+(matchLimit>0?'+':'')+fa(matchLimit)+' · تیم الف: '+fa(points.A)+' · تیم ب: '+fa(points.B);
  if(st.phase!=='auction'){
   $('kTable')?.classList.remove('auction-orbit-active');
   const mount=$('kAuctionMount'),panel=$('kAuction');
   document.querySelectorAll('.k-seat.auction-panel-active').forEach(x=>x.classList.remove('auction-panel-active'));
   if(mount&&panel&&panel.parentElement!==mount){panel.classList.remove('seat-auction-panel');mount.appendChild(panel);}
  }
  $('kAuction').classList.toggle('hidden',st.phase!=='auction');
  $('kContractSetup').classList.toggle('hidden',st.phase!=='contract_selection'||seat!==game.auctionWinner);
  $('kMalzoomSetup').classList.toggle('hidden',st.phase!=='malzoom_selection'||seat!==game.auctionWinner);
  if(st.phase==='auction'){
   $('kTrumpDisplay').textContent='در حال مزایده';
   setScreen('game');renderAuction();renderAuctionHand();
  }else if(st.phase==='contract_selection'){
   $('kAuction').classList.add('hidden');$('kAuctionSummary').classList.remove('hidden');
   $('kAuctionSummary').textContent='مزایده پایان یافت · برنده: '+playerNames[game.auctionWinner]+' · پیشنهاد: '+(st.auctionBid&&st.auctionBid.label||'');
   if(seat===game.auctionWinner){setContractChoice('hokm_spades');$('kStatus').textContent='مزایده را بردی؛ قرارداد را انتخاب و تأیید کن.';renderContractChoiceHand(seat);}
   else{$('kStatus').textContent='منتظر انتخاب قرارداد توسط '+playerNames[game.auctionWinner]+' هستیم.';renderContractChoiceHand(seat);}
   setScreen('game');
  }else if(st.phase==='malzoom_selection'){
   $('kAuction').classList.add('hidden');$('kAuctionSummary').classList.remove('hidden');
   $('kAuctionSummary').textContent='برنده مزایده: '+playerNames[game.auctionWinner]+' · ملزوم';
   if(seat===game.auctionWinner){$('kStatus').textContent='خال حکم ملزوم را انتخاب کن و مخفی‌بودن آن را مشخص کن.';renderContractChoiceHand(seat);}
   else{$('kStatus').textContent='منتظر انتخاب حکم ملزوم توسط '+playerNames[game.auctionWinner]+' هستیم.';renderContractChoiceHand(seat);}
   setScreen('game');
  }else if(st.phase==='playing'){
   $('kAuction').classList.add('hidden');$('kContractSetup').classList.add('hidden');$('kMalzoomSetup').classList.add('hidden');
   const contractLabel=st.isMalzoom?(st.hiddenTrump&&!st.trumpAnnounced?'ملزوم · حکم مخفی':('ملزوم · '+(suitGlyph[game.trumpSuit]||'')+' '+(suitName[game.trumpSuit]||''))):(contractName[st.selectedContract]||st.selectedContract||'');
   $('kTrumpDisplay').textContent=contractLabel||'بدون حکم';
   setScreen('game');renderGame();
   $('kStatus').textContent=seat===Number(st.turn)?('حکم ثبت شد: '+(contractLabel||'بدون حکم')+' · نوبت شماست؛ یکی از کارت‌های مجاز را انتخاب کن.'):(('حکم ثبت شد: '+(contractLabel||'بدون حکم'))+' · نوبت '+playerNames[Number(st.turn)]+' است.');
  }else if(st.phase==='malzoom_result'){
   $('kAuction').classList.add('hidden');setScreen('game');renderGame();
   $('kResult').classList.remove('hidden');
   const won=Number(st.bidderTricks||0),opp=Number(st.opponentTricks||0);
   if(seat===game.auctionWinner){
    $('kResult').innerHTML='<b>نتیجه ملزوم</b><p class="k-small">تیم برنده مزایده '+fa(won)+' دست و حریف '+fa(opp)+' دست برده است. نتیجه را ثبت کن.</p><div class="k-actions"><button id="kOnlineMalzoomSuccess">ملزوم موفق · ۵+</button><button id="kOnlineMalzoomFail">ملزوم ناموفق · ۵-</button></div>';
    $('kOnlineMalzoomSuccess').onclick=()=>onlineKuwaitiRpc({type:'score_malzoom',success:true}).catch(e=>onlineKuwaitiStatus('ثبت نتیجه ملزوم: '+e.message));
    $('kOnlineMalzoomFail').onclick=()=>onlineKuwaitiRpc({type:'score_malzoom',success:false}).catch(e=>onlineKuwaitiStatus('ثبت نتیجه ملزوم: '+e.message));
   }else $('kResult').innerHTML='<b>۹ دست تمام شد</b><p class="k-small">منتظر ثبت نتیجه ملزوم توسط برنده مزایده هستیم.</p>';
   $('kNewGame').classList.add('hidden');
  }else if(st.phase==='cancelled'){
   $('kAuction').classList.add('hidden');$('kContractSetup').classList.add('hidden');$('kMalzoomSetup').classList.add('hidden');$('kHand').innerHTML='';$('kResult').classList.remove('hidden');$('kResult').innerHTML='<b>اتاق لغو شد</b><p class="k-small">یکی از بازیکنان از بازی خارج شد؛ این مسابقه پایان یافت.</p>';$('kNewGame').classList.add('hidden');setScreen('game');onlineKuwaitiStatus(st.message||'بازی لغو شد.');
  }else if(st.phase==='finished'){
   $('kAuction').classList.add('hidden');setScreen('game');renderGame();
   $('kResult').classList.remove('hidden');
   const result=st.result||{},score=Number(result.score||0);
   $('kResult').innerHTML='<b>'+(result.success?'قرارداد موفق شد':'قرارداد ناموفق شد')+'</b><p class="k-small">تیم مزایده‌برنده '+fa(result.bidderTricks||0)+' دست و حریف '+fa(result.opponentTricks||0)+' دست برد · امتیاز این بازی: '+(score>0?'+':'')+fa(score)+'</p><p class="k-small">مجموع تیم الف: '+fa(points.A)+' · مجموع تیم ب: '+fa(points.B)+'</p>'+(st.matchOver?'<p class="k-small">مسابقه به حد امتیاز پایان رسید.</p>':'');
   const winningTeam=st.previousWinningTeam;
   const winnerTeamHasHuman=Object.keys(st.seatPlayers||{}).some(p=>team(Number(p))===winningTeam&&(st.seatPlayers[p]||{}).human===true);
   const canChoose=winningTeam===team(seat)||(onlineKuwaiti.isHost&&!winnerTeamHasHuman);
   if(!st.matchOver&&canChoose){
    const options=[0,1,2,3,4,5].filter(p=>team(p)===winningTeam);
    $('kResult').innerHTML+='<label for="kOnlineNextPicker">انتخاب نفر اول مزایده بازی بعد</label><select id="kOnlineNextPicker" class="k-select">'+options.map(p=>'<option value="'+p+'">'+playerNames[p]+((st.seatPlayers||{})[String(p)]?.human===false?' · هوش مصنوعی':'')+'</option>').join('')+'</select>';
   }else if(!st.matchOver)$('kResult').innerHTML+='<p class="k-small">تیم برنده بازی، نفر اول مزایده بعدی را انتخاب می‌کند.</p>';
   $('kNewGame').classList.remove('hidden');
   $('kNewGame').textContent=st.matchOver?'شروع مسابقه جدید':'بازی بعدی';
   $('kNewGame').disabled=st.matchOver?!onlineKuwaiti.isHost:!canChoose;
  }else{
   $('kStatus').textContent='در انتظار شروع بازی آنلاین شش‌نفره';
   setScreen('game');
  }
  refreshOk=true;
 }catch(e){onlineKuwaitiStatus('همگام‌سازی کوت کویتی آنلاین: '+(e.message||e));refreshOk=false;}
 finally{
  onlineKuwaitiBusy=false;
  if(onlineKuwaitiRefreshQueued){onlineKuwaitiRefreshQueued=false;Promise.resolve().then(refreshOnlineKuwaiti);}
  else scheduleKuwaitiOnlineAI();
 }
 return refreshOk;
}
async function submitOnlineKuwaitiBid(bid){
 if(onlineKuwaitiBidBusy||!isOnlineKuwaiti())return;
 onlineKuwaitiBidBusy=true;
 document.querySelectorAll('#kAuction [data-bid],#kAuction #kMalzoom').forEach(button=>button.disabled=true);
 const kind=bid.type==='pass'?'pass':bid.type==='malzoom'?'malzoom':'normal';
 try{await onlineKuwaitiRpc({type:'bid',kind,rank:kind==='normal'?bid.rank:undefined});}
 catch(e){
  onlineKuwaitiStatus('ثبت پیشنهاد مزایده انجام نشد: '+(e.message||e));
  try{await refreshOnlineKuwaiti();}catch(_){}
 }finally{
  onlineKuwaitiBidBusy=false;
  if(auction&&isOnlineKuwaiti()&&isHumanSeat(auction.current))renderAuction();
 }
}
async function attachOnlineKuwaitiRoom(info){
 if(!info||info.mode!=='kuwaiti'||!info.roomId)return;
 if(isOnlineKuwaiti()&&onlineKuwaiti.roomId===info.roomId){
  onlineKuwaiti.isHost=!!info.isHost;
  onlineKuwaiti.code=info.code||onlineKuwaiti.code;
  onlineKuwaiti.roster=info.roster||onlineKuwaiti.roster||[];
  if($('kPlayStyle'))$('kPlayStyle').value='online';
  $('kExit').textContent='بازگشت به اتاق آنلاین';
  setScreen('game');
  const ok=await refreshOnlineKuwaiti();if(!ok)throw new Error('بازی آنلاین پیدا شد، اما دریافت میز کامل نشد؛ اتصال را دوباره امتحان کن.');
  return true;
 }
 onlineKuwaiti={roomId:info.roomId,code:info.code,seat:Number(info.seat),isHost:!!info.isHost,roster:info.roster||[],revision:-1,handSignature:null,legalCardIds:[]};
 if($('kPlayStyle'))$('kPlayStyle').value='online';
 setScreen('game');
 $('kExit').textContent='بازگشت به اتاق آنلاین';
 onlineKuwaitiStatus('اتاق کوت کویتی شروع شد؛ در حال بارگذاری میز و مزایده…');
 const ok=await refreshOnlineKuwaiti();if(!ok)throw new Error('اتاق ساخته شد، اما دریافت وضعیت بازی کامل نشد؛ به لابی برگرد و دوباره تلاش کن.');
 return true;
}
window.addEventListener('doublekout:kuwaiti-online-started',e=>{window.__doubleKoutKuwaitiAttachPromise=attachOnlineKuwaitiRoom(e.detail);});
window.__doubleKoutKuwaitiOnlineListenerReady=true;
window.addEventListener('doublekout:kuwaiti-room-update',e=>{
 if(!window.DoubleKoutOnline||!window.DoubleKoutOnline.getRoomInfo)return;
 const info=window.DoubleKoutOnline.getRoomInfo();
 if(info&&info.mode==='kuwaiti'&&info.roomId){
  if(!isOnlineKuwaiti())attachOnlineKuwaitiRoom(info).catch(e=>onlineKuwaitiStatus('ورود به میز آنلاین: '+(e.message||e)));
  else if(info.roomId===onlineKuwaiti.roomId)refreshOnlineKuwaiti();
 }
});
window.addEventListener('online',()=>{if(isOnlineKuwaiti())refreshOnlineKuwaiti();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isOnlineKuwaiti())refreshOnlineKuwaiti();});
window.addEventListener('doublekout:kuwaiti-left',()=>{
 $('kExit').textContent='بازگشت به انتخاب بازی';
 if(onlineKuwaitiAiTimer){clearTimeout(onlineKuwaitiAiTimer);onlineKuwaitiAiTimer=null;}
 onlineKuwaitiAiBusy=false;onlineKuwaiti=null;auction=null;game=null;
 if($('kPlayStyle'))$('kPlayStyle').value='ai';
});
function openOnlineKuwaiti(){
 if(!window.DoubleKoutOnline||typeof window.DoubleKoutOnline.open!=='function'){
  onlineKuwaitiStatus('ماژول اتصال آنلاین بارگذاری نشده است.');return;
 }
 $('kPlayStyle').value='online';
 window.DoubleKoutOnline.open('kuwaiti');
}

function addStyle(){
 const s=document.createElement('style');
 s.textContent='#kuwaitiGame #kStatus{display:block!important;visibility:visible!important;opacity:1!important;position:relative;z-index:70;min-height:42px;box-sizing:border-box;}';
 s.textContent=`
 #kuwaitiSetup,#kuwaitiGame{direction:rtl}
 .k-intro{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
 .k-intro div{background:#09271f;border:1px solid #477a68;border-radius:12px;padding:10px;text-align:center;font-size:12px;color:#e8d9ad}
 .k-table{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:auto minmax(110px,auto) auto;gap:6px;align-items:center;text-align:center;border:3px solid #c5a15a;border-radius:22px;padding:8px;background:radial-gradient(ellipse at 50% 48%,#1b7355,#0b3c2d 68%,#06251d);box-shadow:inset 0 0 0 2px #fff2,inset 0 -22px 40px #001b14aa,0 15px 30px #0009}
  .k-seat{position:relative;min-width:0;background:linear-gradient(145deg,#174d3d,#061c16);border:1px solid #8c9d70;border-radius:12px;padding:6px 3px;box-shadow:0 5px 12px #0008}
.k-seat.active{outline:2px solid #f3d58c;box-shadow:0 0 18px #f3d58caa;animation:kTurnPulse 1.05s ease-in-out infinite alternate}
 .k-seat.active:after{content:'';position:absolute;inset:-5px;border:2px solid transparent;border-top-color:#ffe6a1;border-right-color:#c99a43;border-radius:16px;pointer-events:none;animation:kAuctionOrbit 1.15s linear infinite}
 @keyframes kAuctionOrbit{to{transform:rotate(360deg)}}
 .k-bid-chip.pass{background:linear-gradient(145deg,#d7e1d7,#718b7a);border-color:#e7f0e5;color:#14251d;font-size:9px;letter-spacing:.2px}
 .k-bid-chip.winner{background:linear-gradient(145deg,#ffe6a2,#bd8730);border:1px solid #fff0b7;color:#241a08;font-weight:900;box-shadow:0 0 12px #f6d47a88}
 .k-seat.auction-winner{outline:2px solid #f5d487;box-shadow:0 0 20px #e7c87966,inset 0 0 0 1px #ffe9b2}
 .k-bid-chip{position:absolute;z-index:3;top:4px;left:4px;min-width:20px;height:20px;padding:0 4px;border-radius:7px;background:linear-gradient(145deg,#ffe6a1,#b27b24);border:1px solid #fff0bd;color:#241708;font:900 12px/18px Georgia,serif;box-shadow:0 2px 7px #0009;text-align:center}
 .k-seat.active .k-bid-chip{transform:scale(1.12);box-shadow:0 0 10px #ffe6a1}
 @keyframes kTurnPulse{from{filter:brightness(1)}to{filter:brightness(1.35)}}
 .k-seat .k-name{font-size:11px;color:#f4dfaa;font-weight:bold}
 .k-seat .k-count{font-size:10px;color:#c3d6ca;margin:3px}
 .k-played{min-height:48px;display:flex;align-items:center;justify-content:center}
 .k-center{grid-column:2;grid-row:2;min-height:120px;border:1px solid #d7bd7b66;border-radius:15px;background:#031a1488;padding:7px;display:flex;flex-direction:column;justify-content:center;gap:6px}
 .k-seat[data-p="3"]{grid-column:2;grid-row:1}.k-seat[data-p="2"]{grid-column:3;grid-row:1}.k-seat[data-p="4"]{grid-column:1;grid-row:1}
 .k-seat[data-p="0"]{grid-column:2;grid-row:3}.k-seat[data-p="1"]{grid-column:3;grid-row:3}.k-seat[data-p="5"]{grid-column:1;grid-row:3}
 .k-card{width:38px;height:54px;border-radius:7px;background:#fffaf0;color:#17251f;border:1px solid #d8d0bd;box-shadow:0 4px 8px #00140f99;display:flex;flex-direction:column;justify-content:space-between;padding:3px;font:700 13px Georgia,serif;flex-shrink:0}
 .k-card.red{color:#c83d43}.k-card .ksuit{font-size:18px;align-self:center}
 .k-card.joker{font:700 6px Georgia,serif;display:flex;flex-direction:column;justify-content:space-between;align-items:center;gap:0;padding:2px 1px;overflow:hidden;position:relative;background:#16060b;border:2px solid #e8bd6b;box-shadow:inset 0 0 0 1px #fff5,0 4px 9px #0009}
 .k-card.joker.red{background:linear-gradient(145deg,#ff4a4f,#6f0612 70%,#21030a);color:#fff;border-color:#ffb36f}
 .k-card.joker.black{background:linear-gradient(145deg,#aeb5c5,#222633 58%,#070912);color:#fff;border-color:#e2d4b6}
 .k-card.joker .joker-title{font:900 6px Georgia,serif;letter-spacing:.35px;text-shadow:0 1px 2px #000;display:block;line-height:1.1;white-space:nowrap}
 .k-card.joker .joker-art{display:block;width:100%;height:39px;filter:drop-shadow(0 1px 2px #0009)}
 .k-card.joker .joker-caption{font:700 4px Georgia,serif;letter-spacing:.45px;line-height:1;color:#f7dfad;text-shadow:0 1px 2px #000;white-space:nowrap}
 .k-back{position:relative;background:repeating-linear-gradient(45deg,#173e69,#173e69 5px,#e4d6ad 5px,#e4d6ad 7px)!important;border:2px solid #f4e7c4!important}
 .k-back:after{content:'Abdolhamid\\A Dehvari';white-space:pre;position:absolute;left:5%;top:18%;width:90%;height:64%;display:flex;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;font:italic 700 4px/1.05 Georgia,'Times New Roman',serif;letter-spacing:-.12px;color:#ffdf83;text-shadow:0 1px 1px #071b32,0 0 2px #f2d58a;transform:rotate(-24deg) scale(.92);padding:1px;border-radius:3px;background:#102b4b55;overflow:hidden}
 .k-hand{display:flex;justify-content:center;gap:2px;overflow-x:auto;padding:10px 0 14px;direction:ltr}
 .k-hand button,.k-auction-card{padding:0;background:transparent;border:0;min-width:0;flex:0 0 auto}
 .k-hand button:disabled{opacity:.38}
 .k-hand button:not(:disabled) .k-card{outline:2px solid #f0d38a;transform:translateY(-4px)}
 .k-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
 .k-actions button{flex:1;min-width:90px}
 .k-auction{background:#08271f;border:1px solid #a58b54;border-radius:14px;padding:12px;margin:10px 0}
  .k-auction-summary{background:linear-gradient(120deg,#132d25,#071e18);border:1px solid #b99a5d;border-radius:12px;padding:9px;margin:8px 0;color:#f4dfaa;font-size:12px;line-height:1.8}
 .k-contract-setup{background:#0a3026;border:1px solid #d3b76e;border-radius:14px;padding:12px;margin:10px 0}
 .k-auction .k-bids{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}
 .k-auction button{padding:9px 4px;font-size:12px}
 .k-status{background:#09271f;border:1px solid #477a68;border-radius:12px;padding:10px;margin:8px 0;color:#f8e9bd;font-size:13px;line-height:1.8;min-height:42px}
 .k-score{display:flex;justify-content:space-around;gap:8px;flex-wrap:wrap;background:#09271f;border-radius:12px;padding:10px;margin-bottom:10px;font-size:13px}
 .k-score b{color:#f3d58c;font-size:19px}
 .k-small{font-size:11px;color:#c4d5cd;line-height:1.8}
 .k-select{width:100%;background:#f7f1df;color:#17251f;border-radius:10px;padding:10px;margin:5px 0}
 @media(max-width:520px){.k-card{width:34px;height:49px}.k-table{gap:4px;padding:5px;grid-template-rows:auto minmax(100px,auto) auto}.k-seat{padding:5px 2px}.k-seat .k-name{font-size:10px}.k-center{min-height:100px}.k-intro{grid-template-columns:1fr 1fr 1fr}.k-auction .k-bids{grid-template-columns:repeat(2,1fr)}}
 /* Enlarged premium cards, fanned hands and central 3D trick pile */
.k-table{min-height:490px;transform:perspective(1100px) rotateX(4deg);transform-style:preserve-3d;background:radial-gradient(ellipse at 50% 48%,#23815c,#0b4935 65%,#04291f);box-shadow:inset 0 0 0 3px #ffe7a355,inset 0 -28px 55px #001b14bb,0 28px 48px #000c}
.k-seat{transform:translateZ(20px);box-shadow:0 12px 20px #0009,inset 0 1px 0 #ffffff33}
.k-played{min-height:72px;overflow:visible}
.k-card{width:78px;height:116px;border-radius:11px;padding:6px;font-size:23px;background:linear-gradient(145deg,#fffef8,#f3ead6 56%,#d4c7aa);border:1px solid #fff5dc;box-shadow:inset 2px 2px 3px #fff,inset -3px -4px 8px #9e9277,0 9px 17px #000b;transform:perspective(700px) rotateY(-4deg) translateZ(4px)}
.k-card .ksuit{font-size:35px}
.k-card.red{color:#d52e43}
.k-card.joker{font-size:11px;padding:5px 3px}
.k-card.joker .joker-title{font-size:10px;letter-spacing:.45px}
.k-card.joker .joker-art{height:82px}
.k-card.joker .joker-caption{font-size:7px}
.k-back{background:linear-gradient(135deg,#0a2850,#1f5c91 48%,#0a2446)!important;border:3px solid #e9d49a!important;box-shadow:inset 0 0 0 2px #f9e7bb,inset 0 0 20px #72a9d6,0 8px 16px #000b!important;overflow:hidden}
.k-back:before{content:"";position:absolute;inset:5px;border:1px solid #e9d49a;border-radius:5px;background:repeating-linear-gradient(45deg,transparent 0 5px,#f4d88a33 5px 7px),radial-gradient(circle at 50% 50%,#d8b86a44,transparent 55%)}
.k-back:after{content:"Abdolhamid Dehvari";position:absolute;inset:40% 4% auto;height:20%;display:flex;align-items:center;justify-content:center;text-align:center;font:italic 700 7px/1.1 Georgia,"Times New Roman",serif;letter-spacing:0;color:#ffe6a0;text-shadow:0 2px 3px #06172b;transform:rotate(-18deg);padding:1px}
.k-hand{direction:ltr;display:flex;justify-content:flex-start;align-items:flex-end;gap:0;overflow-x:auto;overflow-y:visible;padding:22px 16px 30px;min-height:160px;scrollbar-width:thin}
.k-hand button{flex:0 0 auto;margin-left:-54px;perspective:700px}
.k-hand button:first-child{margin-left:0}
.k-hand button .k-card{width:80px;height:120px}
.k-hand button .k-card .ksuit{font-size:36px}
.k-hand button:not(:disabled) .k-card{outline:2px solid #f0d38a;transform:translateY(-5px) rotateY(-3deg);filter:saturate(1.12)}
.k-hand button:not(:disabled):hover .k-card{transform:translateY(-17px) rotateY(0) scale(1.04);z-index:5}.k-hand:not(.k-has-legal-restrictions) button:not(:disabled) .k-card{outline:none!important;filter:none!important}
.k-opponent-fan{direction:ltr;display:flex;align-items:center;justify-content:center;height:66px;max-width:100%;overflow:visible;padding:2px}
.k-opponent-fan .k-card.k-back{width:44px;height:66px;min-width:44px;padding:0;margin-left:-37px;border-width:2px!important;border-radius:5px;transform:rotate(calc((var(--fan-index) - 3)*3deg))}
.k-opponent-fan .k-card.k-back:first-child{margin-left:0}
.k-center{position:relative;min-height:175px;transform:translateZ(28px);border:1px solid #e9d49a88;background:radial-gradient(ellipse,#05291eaa,#031a1488);box-shadow:inset 0 0 22px #0009,0 9px 18px #0006}
.k-center-cards{display:flex;align-items:center;justify-content:center;direction:ltr;min-height:95px;overflow:visible}
.k-center-cards .k-table-played{width:65px;height:96px;margin-left:-23px;box-shadow:0 13px 22px #000b,inset 2px 2px 3px #fff;transform:rotate(calc((var(--play-index) - 2.5)*7deg)) translateY(0)}
.k-center-cards .k-table-played:first-child{margin-left:0}
@media(max-width:520px){.k-table{min-height:440px;gap:4px;padding:6px}.k-hand button{margin-left:-57px}.k-hand button .k-card{width:74px;height:111px}.k-center-cards .k-table-played{width:53px;height:80px}.k-center{min-height:150px}}
`;

 s.textContent+=`
/* AI diagnostic banner */\n#kuwaitiGame #kStatus{display:block!important;visibility:visible!important;opacity:1!important;position:fixed!important;left:8px!important;right:8px!important;bottom:calc(8px + env(safe-area-inset-bottom))!important;z-index:2147483000!important;min-height:42px!important;max-height:25vh!important;overflow:auto!important}\n/* 0.8.13: dual-corner ranks and illustrated face cards */
.k-card{position:relative;overflow:hidden}
.k-corner{position:absolute;z-index:4;display:flex;flex-direction:column;align-items:center;font:900 10px/1 Georgia,serif}
.k-corner i{font-style:normal;font-size:9px}
.k-corner-top{top:3px;left:3px}
.k-corner-bottom{right:3px;bottom:3px;transform:rotate(180deg)}
.k-royal-frame{position:absolute;inset:13px 8px 12px;display:flex;align-items:center;justify-content:center}
.k-royal-art{width:100%;height:100%;max-height:42px}
.k-hand button{margin-left:-45px!important}
.k-hand button:first-child{margin-left:0!important}
.k-hand button .k-card{transform:none!important}
.k-back:after{font-size:6px!important;letter-spacing:0!important}
@media(max-width:520px){.k-hand button{margin-left:-49px!important}}
`;
 s.textContent+=`
.k-table-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:8px 0;padding:8px 10px;border:1px solid #b99a5d;border-radius:12px;background:linear-gradient(120deg,#102f25,#061d17);color:#f4dfaa}
.k-trump-badge{display:flex;align-items:center;gap:8px;font-size:12px}.k-trump-badge b{font-size:15px;color:#ffe19a}
.k-live-tricks{display:flex!important;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;font-weight:700}.k-live-tricks b{font-size:20px;color:#ffe19a;margin-right:4px}
.k-table-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:8px 0;padding:8px 10px;border:1px solid #b99a5d;border-radius:12px;background:linear-gradient(120deg,#102f25,#061d17);color:#f4dfaa}\n.k-trump-badge{display:flex;align-items:center;gap:8px;font-size:12px}.k-trump-badge b{font-size:15px;color:#ffe19a}\n.k-live-tricks{display:flex!important;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;font-weight:700}.k-live-tricks b{font-size:20px;color:#ffe19a;margin-right:4px}\n/* One large, curved hand for the player; opponent backs fan out at the table edges. */
.k-hand{direction:ltr;display:flex;justify-content:center;align-items:flex-end;flex-wrap:nowrap;gap:0;overflow-x:auto;overflow-y:visible;padding:24px 12px 32px;min-height:174px;scrollbar-width:thin}
.k-hand button,.k-hand .k-auction-card{flex:0 0 78px;width:78px;height:117px;margin-left:-49px!important;transform-origin:50% 100%;position:relative}
.k-hand button:first-child,.k-hand .k-auction-card:first-child{margin-left:0!important}
.k-hand button .k-card,.k-hand .k-auction-card .k-card{width:78px;height:117px}
.k-hand button .k-card{transform:none!important}
.k-hand button:disabled{opacity:.78}
.k-opponent-fan{direction:ltr;display:flex;align-items:flex-end;justify-content:center;height:92px;min-width:0;max-width:100%;overflow:visible;padding:2px 0 0;position:relative}
.k-opponent-fan .k-card.k-back{width:56px;height:84px;min-width:56px;flex:0 0 56px;margin-left:-44px;border-width:2px!important;border-radius:6px;transform-origin:50% 100%;box-shadow:0 5px 12px #000c,inset 0 0 0 1px #fff5!important}
.k-opponent-fan .k-card.k-back:first-child{margin-left:0}
.k-back:after{content:"Abdolhamid\\A Dehvari";white-space:pre;position:absolute;inset:37% 3% auto;height:27%;display:flex;align-items:center;justify-content:center;text-align:center;font:italic 900 7px/1.12 Georgia,"Times New Roman",serif;letter-spacing:.05px;color:#ffe7a0;text-shadow:0 1px 2px #06172b,0 0 4px #f2c86a;transform:rotate(-18deg);padding:1px;background:#102b4b55;border:1px solid #e8cf8d66;border-radius:4px;box-sizing:border-box}
.k-seat[data-p="1"] .k-opponent-fan,.k-seat[data-p="2"] .k-opponent-fan,.k-seat[data-p="4"] .k-opponent-fan,.k-seat[data-p="5"] .k-opponent-fan{transform:rotate(90deg) scale(.92);transform-origin:center}
@media(max-width:520px){.k-hand{min-height:160px;padding-left:8px;padding-right:8px}.k-hand button,.k-hand .k-auction-card{flex-basis:72px;width:72px;height:108px;margin-left:-46px!important}.k-hand button:first-child,.k-hand .k-auction-card:first-child{margin-left:0!important}.k-hand button .k-card,.k-hand .k-auction-card .k-card{width:72px;height:108px}.k-opponent-fan{height:84px}.k-opponent-fan .k-card.k-back{width:52px;height:78px;min-width:52px;flex-basis:52px;margin-left:-41px}}
`;
 
  s.textContent+=`
  /* 0.8.15 responsive hands: keep all nine cards inside the phone viewport. */
  .k-hand{width:100%;max-width:100%;box-sizing:border-box;justify-content:center;overflow:hidden;overflow-y:visible;padding:12px 4px 22px;min-height:122px;gap:0}
  .k-hand button{flex:0 0 56px;width:56px;height:84px;margin-left:-18px!important;perspective:none}
  .k-hand button:first-child{margin-left:0!important}
  .k-hand button .k-card,.k-hand button .k-card.joker{width:56px;height:84px;min-width:56px;box-sizing:border-box;padding:4px;border-radius:8px;font-size:17px}
  .k-hand button .k-card .ksuit{font-size:25px}
  .k-hand button .k-card.joker .joker-title{font-size:7px}
  .k-hand button .k-card.joker .joker-art{height:52px}
  .k-hand button .k-card.joker .joker-caption{font-size:5px}
  .k-opponent-fan{height:66px;max-width:100%;min-width:0;overflow:visible;justify-content:center;transform:none!important}
  .k-opponent-fan .k-card.k-back{width:40px;height:60px;min-width:40px;flex:0 0 40px;margin-left:-31px;border-width:2px!important;border-radius:5px;transform:rotate(calc((var(--fan-index) - 4)*1.8deg))!important}
  .k-opponent-fan .k-card.k-back:first-child{margin-left:0}
  /* Corner seats are on the top/bottom edges: their fan baseline stays horizontal and parallel to that edge. */
  .k-seat[data-p="1"] .k-opponent-fan,.k-seat[data-p="2"] .k-opponent-fan,.k-seat[data-p="4"] .k-opponent-fan,.k-seat[data-p="5"] .k-opponent-fan{transform:rotate(90deg) scale(.76)!important;transform-origin:center}
  @media(max-width:380px){
    .k-hand{min-height:108px;padding:8px 2px 18px}
    .k-hand button{flex-basis:48px;width:48px;height:72px;margin-left:-17px!important}
    .k-hand button .k-card,.k-hand button .k-card.joker{width:48px;height:72px;min-width:48px;padding:3px;font-size:15px}
    .k-hand button .k-card .ksuit{font-size:21px}
    .k-hand button .k-card.joker .joker-art{height:43px}
    .k-opponent-fan .k-card.k-back{width:36px;height:54px;min-width:36px;flex-basis:36px;margin-left:-28px}
  }
/* 0.8.18: six-player-only corner seating and wide radial opponent fans. */
.k-table{position:relative!important;display:block!important;min-height:620px!important;padding:0!important;overflow:visible!important}
.k-table>.k-center{position:absolute!important;left:29%!important;right:29%!important;top:34%!important;bottom:34%!important;min-height:0!important;z-index:2}
.k-table>.k-seat{position:absolute!important;width:29%!important;min-height:118px;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;padding:5px 2px!important;z-index:3}
.k-table>.k-seat[data-p="3"]{top:1%!important;left:35.5%!important;right:auto!important;bottom:auto!important}
.k-table>.k-seat[data-p="2"]{top:17%!important;right:1%!important;left:auto!important;bottom:auto!important}
.k-table>.k-seat[data-p="1"]{bottom:17%!important;right:1%!important;left:auto!important;top:auto!important}
.k-table>.k-seat[data-p="0"]{bottom:1%!important;left:35.5%!important;right:auto!important;top:auto!important}
.k-table>.k-seat[data-p="5"]{bottom:17%!important;left:1%!important;right:auto!important;top:auto!important}
.k-table>.k-seat[data-p="4"]{top:17%!important;left:1%!important;right:auto!important;bottom:auto!important}
.k-seat .k-opponent-fan{height:110px!important;width:100%!important;max-width:none!important;justify-content:center!important;overflow:visible!important;transform:none!important;position:relative;left:auto;right:auto}
.k-seat .k-opponent-fan .k-card.k-back{width:68px!important;height:102px!important;min-width:68px!important;flex:0 0 68px!important;margin-left:-48px!important;transform-origin:50% 100%!important}
.k-seat .k-opponent-fan .k-card.k-back:first-child{margin-left:0!important}
.k-seat[data-p="4"] .k-opponent-fan,.k-seat[data-p="5"] .k-opponent-fan{transform:rotate(24deg) translate(-10px,8px) scale(1.12)!important}
.k-seat[data-p="1"] .k-opponent-fan,.k-seat[data-p="2"] .k-opponent-fan{transform:rotate(-24deg) translate(10px,8px) scale(1.12)!important}
.k-seat[data-p="3"] .k-opponent-fan{transform:rotate(0deg) translateY(-5px) scale(1.12)!important}
@media(max-width:520px){.k-table{min-height:600px!important}.k-table>.k-center{left:28%!important;right:28%!important;top:35%!important;bottom:35%!important}.k-table>.k-seat{width:31%!important;min-height:112px}.k-seat .k-opponent-fan{height:104px!important}.k-seat .k-opponent-fan .k-card.k-back{width:66px!important;height:99px!important;min-width:66px!important;flex-basis:66px!important;margin-left:-49px!important}}

  `;
  s.textContent+=`
  /* 0.8.16: larger illustrated royal portraits */
  .k-royal-frame{inset:8px 5px 8px!important}
  .k-royal-art{display:block;width:100%;height:100%;max-height:none!important;filter:drop-shadow(0 2px 2px #49351f55)}
  .k-card .k-corner{z-index:6}
  `;

  s.textContent+=`
  /* 0.8.19: compact, overlapping 3D fans, curved inward toward each seat. */
  .k-seat .k-opponent-fan{display:flex!important;align-items:center!important;justify-content:center!important;gap:0!important;width:100%!important;max-width:none!important;height:104px!important;overflow:visible!important;perspective:850px!important;transform-style:preserve-3d!important;filter:drop-shadow(0 10px 7px #0008)}
  .k-seat .k-opponent-fan .k-card.k-back{width:62px!important;height:93px!important;min-width:62px!important;flex:0 0 62px!important;margin-left:-54px!important;border-radius:9px!important;border-width:3px!important;box-shadow:0 12px 18px #000b,inset 0 0 0 1px #fff6!important;backface-visibility:hidden;transition:transform .2s ease}
  .k-seat .k-opponent-fan .k-card.k-back:first-child{margin-left:0!important}
  .k-seat[data-p="3"] .k-opponent-fan,.k-seat[data-p="0"] .k-opponent-fan{transform:rotateX(10deg) translateZ(18px)!important}
  .k-seat[data-p="1"] .k-opponent-fan,.k-seat[data-p="2"] .k-opponent-fan{transform:rotateY(-13deg) rotateZ(-5deg) translateZ(20px)!important}
  .k-seat[data-p="4"] .k-opponent-fan,.k-seat[data-p="5"] .k-opponent-fan{transform:rotateY(13deg) rotateZ(5deg) translateZ(20px)!important}
  .k-seat .k-opponent-fan .k-back:after{font-size:6px!important;transform:rotate(180deg)!important}
  @media(max-width:520px){.k-seat .k-opponent-fan{height:96px!important}.k-seat .k-opponent-fan .k-card.k-back{width:58px!important;height:87px!important;min-width:58px!important;flex-basis:58px!important;margin-left:-51px!important}}

  /* 0.8.20: bright, non-clickable hand while choosing the contract/challenge. */
  #kHand.k-contract-thinking{opacity:1!important;filter:none!important;pointer-events:none!important}
  #kHand.k-contract-thinking .k-auction-card,#kHand.k-contract-thinking .k-card{opacity:1!important;filter:none!important;pointer-events:none!important}
  #kHand.k-contract-thinking .k-card{box-shadow:0 9px 16px #0009,0 0 0 1px #f4d98f!important}
  /* 0.8.17: visible own hand throughout AI play; oversized edge-clipped opponent fans. */
  .k-hand{width:100%;max-width:100%;box-sizing:border-box;justify-content:center;overflow:visible;overflow-y:visible;padding:18px 4px 26px;min-height:148px;gap:0}
  .k-hand button,.k-hand .k-auction-card{flex:0 0 68px;width:68px;height:102px;margin-left:-39px!important;position:relative;transform-origin:50% 100%}
  .k-hand button:first-child,.k-hand .k-auction-card:first-child{margin-left:0!important}
  .k-hand button .k-card,.k-hand .k-auction-card .k-card{width:68px;height:102px;min-width:68px}
  .k-hand button:disabled{opacity:1}
  .k-opponent-fan{height:108px;min-width:0;max-width:none;width:max-content;overflow:visible;justify-content:center;align-items:flex-end;padding:0;position:relative}
  .k-opponent-fan .k-card.k-back{width:64px;height:96px;min-width:64px;flex:0 0 64px;margin-left:-43px;border-width:3px!important;border-radius:8px;transform:rotate(calc((var(--fan-index) - 4)*4.2deg))!important;transform-origin:50% 100%}
  .k-opponent-fan .k-card.k-back:first-child{margin-left:0}
  .k-seat[data-p="1"] .k-opponent-fan,.k-seat[data-p="2"] .k-opponent-fan{transform:translateX(12px) rotate(90deg) scale(1.12)!important;transform-origin:center}
  .k-seat[data-p="4"] .k-opponent-fan,.k-seat[data-p="5"] .k-opponent-fan{transform:translateX(-12px) rotate(90deg) scale(1.12)!important;transform-origin:center}
  .k-seat[data-p="3"] .k-opponent-fan{transform:translateY(-4px) scale(1.08)!important}
  .k-seat[data-p="0"] .k-opponent-fan{transform:translateY(4px) scale(1.08)!important}
  @media(max-width:520px){
   .k-hand{min-height:142px;padding:14px 2px 24px}
   .k-hand button,.k-hand .k-auction-card{flex-basis:62px;width:62px;height:93px;margin-left:-36px!important}
   .k-hand button:first-child,.k-hand .k-auction-card:first-child{margin-left:0!important}
   .k-hand button .k-card,.k-hand .k-auction-card .k-card{width:62px;height:93px;min-width:62px}
   .k-opponent-fan{height:100px}
   .k-opponent-fan .k-card.k-back{width:60px;height:90px;min-width:60px;flex-basis:60px;margin-left:-41px}
   .k-seat[data-p="1"] .k-opponent-fan,.k-seat[data-p="2"] .k-opponent-fan{transform:translateX(15px) rotate(90deg) scale(1.08)!important}
   .k-seat[data-p="4"] .k-opponent-fan,.k-seat[data-p="5"] .k-opponent-fan{transform:translateX(-15px) rotate(90deg) scale(1.08)!important}
  }
  `;
  
/* iOS Safari: avoid stale composited layers after scroll and orientation changes. */
s.textContent+=`
@media(max-width:900px){.k-table{transform:none!important;transform-style:flat!important;perspective:none!important}.k-seat{transform:none!important;transform-style:flat!important}}
.k-table{min-height:480px!important;border:4px solid #c5a15a!important;border-radius:26px!important;background:radial-gradient(ellipse at 50% 45%,#23815c,#0b4935 65%,#04291f)!important;box-shadow:inset 0 0 0 2px #ffe7a355,inset 0 -26px 48px #001b14aa,0 18px 32px #000b!important;overflow:visible!important}
.k-table:before{content:none!important}
.k-table>.k-seat{border:1px solid #8c9d70!important;border-radius:12px!important;background:linear-gradient(145deg,#174d3d,#061c16)!important;box-shadow:0 7px 14px #0009,inset 0 1px 0 #ffffff22!important}
.k-table>.k-center{border:1px solid #d7bd7b66!important;border-radius:15px!important;background:#031a1488!important;box-shadow:inset 0 0 20px #00140f99!important}
.k-table .k-name{display:inline-block!important;padding:4px 2px!important;border:0!important;border-top:1px solid #d9bd7866!important;border-radius:0 0 8px 8px!important;background:linear-gradient(180deg,#0b3025,#061b15)!important;color:#f4dfaa!important;font-weight:800!important}
@media(max-width:520px){.k-table{min-height:460px!important}.k-table>.k-seat{min-height:104px!important}.k-table>.k-center{left:28%!important;right:28%!important;top:35%!important;bottom:35%!important}}
@media(max-width:520px){#kPhaseModal{padding:10px}#kPhaseModal .k-phase-dialog{padding:14px;max-height:calc(100dvh - 20px);border-radius:20px}#kPhaseModal .k-contract-choice{min-height:92px}#kPhaseModal .k-contract-choice .k-choice-symbol{font-size:31px}#kPhaseModal .k-auction .k-bids button{min-height:48px;font-size:14px}}
`;
s.textContent+=`
/* Compact animated gold ring belongs to the auction panel, never the full tabletop. */
#kTable.auction-orbit-active:after{content:none!important;display:none!important}

/* 9.42 — true front-to-back stacking: central ring is the backdrop only. */
#kTable{position:relative!important;isolation:isolate!important;transform-style:preserve-3d!important}
#kTable>.k-center{z-index:1!important;transform:translateZ(1px)!important;pointer-events:none!important}
#kTable>.k-seat{position:relative!important;z-index:30!important;transform:translateZ(30px)!important}
#kTable>.k-seat.auction-panel-active{z-index:120!important;transform:translateZ(70px)!important}
#kTable>.k-seat.auction-panel-active>.seat-auction-panel{z-index:180!important}
#kTable>.k-table-card-layer{z-index:150!important;transform:translateZ(60px)!important;pointer-events:none!important}
#kTable>.k-table-card-layer .k-previous-cards{z-index:1!important}
#kTable>.k-table-card-layer .k-center-cards{z-index:5!important}
#kTable>.k-table-card-layer .k-table-played{position:relative!important;z-index:6!important}

 #kTable.auction-orbit-active:before{content:none!important;display:none!important}
 /* During bidding, the center card well must not render as a large circular ring. */
 #kTable.auction-orbit-active>.k-center{border:0!important;border-radius:12px!important;background:transparent!important;box-shadow:none!important;outline:0!important}
.k-seat .seat-auction-panel{position:relative!important;overflow:visible!important;border:1px solid #e3c27c!important;isolation:isolate!important}
.k-seat .seat-auction-panel:after{content:""!important;position:absolute!important;inset:-4px!important;border-radius:16px!important;padding:2px!important;pointer-events:none!important;z-index:2!important;background:conic-gradient(from 0deg,transparent 0deg 205deg,#9c742d 225deg,#fff0bd 245deg,#d6a344 263deg,#fff5d1 280deg,transparent 300deg 360deg)!important;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0)!important;-webkit-mask-composite:xor!important;mask-composite:exclude!important;filter:drop-shadow(0 0 3px #e9c46c99)!important;animation:kAuctionPanelGoldOrbit 3.8s linear infinite!important}
@keyframes kAuctionPanelGoldOrbit{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.k-seat .seat-auction-panel:after{animation:none!important}}
/* 9.30: calmer active-seat indicator; no rotating orbit or flashing ring. */
.k-seat.active{animation:none!important;outline:2px solid #f2d18a!important;box-shadow:0 0 16px #e7c87966,inset 0 0 0 1px #ffe9b2!important}
.k-seat.active:after{content:none!important;display:none!important;animation:none!important}
/* Approved auction placement: compact controls beside the active player's chair. */
.k-table{position:relative!important;overflow:visible!important}
.k-seat{position:relative!important;overflow:visible!important}
.k-seat.auction-panel-active{z-index:120!important}
.k-seat .seat-auction-panel{position:absolute!important;z-index:140!important;width:min(238px,66vw)!important;max-width:238px!important;min-width:190px!important;max-height:48vh!important;overflow:auto!important;box-sizing:border-box!important;margin:0!important;padding:10px!important;transform:none!important;border:1px solid #e3c27c!important;border-radius:13px!important;background:linear-gradient(145deg,#292722f7,#080a09f7)!important;box-shadow:0 15px 28px #000d,inset 0 1px 0 #fff3!important}
.k-seat[data-p="4"] .seat-auction-panel,.k-seat[data-p="5"] .seat-auction-panel{left:calc(100% + 8px)!important;right:auto!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important}
.k-seat[data-p="1"] .seat-auction-panel,.k-seat[data-p="2"] .seat-auction-panel{right:calc(100% + 8px)!important;left:auto!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important}
.k-seat[data-p="3"] .seat-auction-panel{left:50%!important;right:auto!important;top:calc(100% + 8px)!important;bottom:auto!important;transform:translateX(-50%)!important}
.k-seat[data-p="0"] .seat-auction-panel{left:50%!important;right:auto!important;bottom:calc(100% + 8px)!important;top:auto!important;transform:translateX(-50%)!important}
.k-seat .seat-auction-panel .k-bids{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:4px!important}
.k-seat .seat-auction-panel .k-bids button{min-height:42px!important;padding:6px 2px!important;font-size:12px!important}
@media(max-width:520px){
 .k-seat .seat-auction-panel{width:min(214px,62vw)!important;min-width:174px!important;max-height:42vh!important;padding:8px!important}
 .k-seat .seat-auction-panel .k-bids{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}
/* Keep the game name out of the auction/card-play area: compact upper-left table marker. */
 .k-game-corner-label{position:absolute!important;top:10px!important;left:12px!important;right:auto!important;z-index:45!important;pointer-events:none!important;padding:4px 8px!important;border:1px solid #c9a45e!important;border-radius:8px!important;background:linear-gradient(145deg,#171512ee,#080807f2)!important;color:#f2d998!important;font-size:10px!important;font-weight:800!important;letter-spacing:.1px!important;box-shadow:0 3px 9px #0009!important;white-space:nowrap!important}
 @media(max-width:520px){.k-game-corner-label{top:8px!important;left:9px!important;padding:3px 6px!important;font-size:9px!important}}
 #kTrickCards,#kTable>.k-center #kTeamTricks{display:none!important}
  #kTable>.k-center{pointer-events:none!important}
  #kTable>.k-center #kTurn{display:none!important}
 #kTable>.k-turn-corner{position:absolute!important;top:9px!important;right:10px!important;left:auto!important;bottom:auto!important;z-index:56!important;display:block!important;width:min(48%,230px)!important;max-height:58px!important;overflow:auto!important;padding:5px 8px!important;border:1px solid #c9a45e!important;border-radius:9px!important;background:linear-gradient(145deg,#171512f2,#080807f5)!important;color:#ffe5a1!important;font-size:10px!important;line-height:1.35!important;text-align:right!important;box-shadow:0 3px 10px #000b!important;overflow-wrap:anywhere!important;pointer-events:none!important}
 #kTable>.k-turn-corner:empty{display:none!important}
 @media(max-width:520px){#kTable>.k-turn-corner{top:8px!important;right:8px!important;width:min(52%,175px)!important;max-height:52px!important;font-size:9px!important;padding:4px 6px!important}}
  #kTable>.k-game-corner-label{top:9px!important;left:10px!important;right:auto!important;z-index:55!important}
 /* 3D direction: charcoal stone surface, raised brass rim and black/gold card backs. */
.k-table{background-color:#282722!important;background-image:radial-gradient(ellipse at 50% 40%,#5b584f 0%,#34332e 56%,#171815 100%),repeating-linear-gradient(13deg,#ffffff08 0 2px,transparent 2px 8px)!important;border-color:#c19a50!important;box-shadow:inset 0 0 0 3px #f5d99588,inset 0 -26px 50px #000c,0 24px 42px #000d!important}
.k-table:before{content:"";position:absolute;inset:6px;border:2px solid #e2c27c;border-radius:18px;box-shadow:inset 0 0 0 4px #ffffff12,inset 0 0 28px #000b;pointer-events:none;z-index:0}
.k-seat{background:linear-gradient(145deg,#24231f,#080909)!important;border-color:#b18d4d!important;box-shadow:0 10px 18px #000b,inset 0 1px 0 #fff2!important}
.k-back{background:linear-gradient(145deg,#050607,#27241d 52%,#050607)!important;border:3px solid #c6a45f!important;box-shadow:inset 0 0 0 2px #f8e2a5,inset 0 0 18px #000,0 9px 16px #000c!important}
.k-back:before{background:repeating-linear-gradient(45deg,transparent 0 6px,#e6c77825 6px 8px),radial-gradient(circle at 50% 50%,#d7b45a33,transparent 58%)!important;border:1px solid #e4c477!important}
.k-back:after{color:#ffe6a0!important;text-shadow:0 2px 3px #000!important}
`;
document.head.appendChild(s);
 const cornerStyle=document.createElement('style');cornerStyle.textContent="/* 9.2 contract indicator fixed to upper-right table corner */\n.k-table{position:relative}\n.k-trump-corner{position:absolute;top:9px;right:9px;transform:none;z-index:30;min-width:76px;justify-content:center;padding:5px 9px;border:1px solid #f0d58b;border-radius:10px;background:linear-gradient(145deg,#09271fee,#031711f5);box-shadow:0 4px 12px #0009;text-align:center;pointer-events:none}\n.k-trump-corner span{font-size:10px;color:#e9d39a}\n.k-trump-corner b{font-size:14px!important;color:#ffe19a}\n.k-table .k-seat[data-p=\"2\"]{padding-top:30px}\n";cornerStyle.textContent+="\n/* Seat labels sit below the card fans; individual trick wins stay on each chair. */\n.k-seat{display:flex!important;flex-direction:column!important;align-items:center!important;gap:3px!important}\n.k-seat .k-played{order:-1!important;position:relative!important;z-index:8!important;min-height:88px!important;margin:0 0 3px!important;overflow:visible!important;transform:translateY(-3px)!important}\n.k-seat .k-opponent-fan{position:relative!important;z-index:9!important}\n .k-seat .k-name{order:0!important;position:relative!important;z-index:10!important;width:100%;margin-top:20px!important;padding:7px 2px 3px!important;border-top:1px solid #d9bd78aa!important;background:linear-gradient(180deg,#0b3025,#061b15)!important;border-radius:7px 7px 10px 10px!important}\n.k-seat .k-count{order:1!important;margin:0!important;font-size:9px!important;line-height:1.1!important}\n/* Remaining cards are already counted on each chair; hide the duplicate oversized trick-card counter. */\n#kTrickCards{display:none!important}\n.k-seat .k-seat-tricks{order:2!important;font-size:10px!important;font-weight:900!important;color:#ffe5a1!important;line-height:1.3!important}\n.k-team-tricks{font-size:11px;font-weight:900;color:#ffe5a1;background:#09271f;border:1px solid #b99a5d;border-radius:8px;padding:4px 8px;margin:1px auto;max-width:max-content}\n/* Corner trump marker and two-layer trick pile: previous trick remains underneath current plays. */\n.k-table{position:relative!important;isolation:isolate!important;overflow:visible!important}\n.k-table>.k-seat{z-index:3!important}\n.k-table>.k-center{z-index:12!important;overflow:visible!important}\n.k-table>.k-table-card-layer{position:absolute!important;inset:0!important;z-index:24!important;pointer-events:none!important;overflow:visible!important}\n .k-trump-corner{position:absolute!important;top:9px!important;right:9px!important;left:auto!important;bottom:auto!important;transform:none!important;z-index:45!important;display:flex!important;align-items:center!important;gap:6px!important;max-width:34%!important;white-space:nowrap!important}\n.k-center{position:absolute!important}\n.k-previous-cards,.k-center-cards{position:absolute!important;left:50%!important;top:50%!important;width:100%!important;height:116px!important;min-height:0!important;transform:translate(-50%,-50%)!important;display:flex!important;align-items:center!important;justify-content:center!important;direction:ltr!important;overflow:visible!important;pointer-events:none!important}\n.k-previous-cards{z-index:2!important;opacity:.58!important;filter:brightness(.72) saturate(.78)!important}\n.k-center-cards{z-index:7!important}\n.k-previous-cards .k-pile-played{position:absolute!important;left:calc(50% - 30px)!important;top:calc(50% - 44px)!important;width:60px!important;height:88px!important;margin:0!important;transform:translate(var(--pile-x),var(--pile-y)) rotate(var(--pile-r))!important;box-shadow:0 8px 15px #000c!important}\n.k-center-cards .k-table-played{position:relative!important;z-index:8!important}\n@media(max-width:520px){.k-previous-cards,.k-center-cards{height:96px!important}.k-previous-cards .k-pile-played{width:49px!important;height:74px!important;left:calc(50% - 24px)!important;top:calc(50% - 37px)!important} .k-trump-corner{top:118px!important;right:118px!important;font-size:11px!important}.k-seat .k-played{min-height:60px!important}.k-seat-tricks{font-size:9px!important}}";
cornerStyle.textContent+=`\n/* Final auction polish: compact status badge in table corner and orbit on bid panel only. */
#kTable>.k-center #kTurn{display:none!important}
#kTable>.k-turn-corner{position:absolute!important;top:9px!important;right:10px!important;left:auto!important;bottom:auto!important;z-index:56!important;display:block!important;width:min(48%,230px)!important;max-height:58px!important;overflow:auto!important;padding:5px 8px!important;border:1px solid #c9a45e!important;border-radius:9px!important;background:linear-gradient(145deg,#171512f2,#080807f5)!important;color:#ffe5a1!important;font-size:10px!important;line-height:1.35!important;text-align:right!important;box-shadow:0 3px 10px #000b!important;overflow-wrap:anywhere!important;pointer-events:none!important}
#kTable.auction-orbit-active:after{content:none!important;display:none!important}
.k-seat .seat-auction-panel{position:relative!important;overflow:visible!important;isolation:isolate!important}
.k-seat .seat-auction-panel:after{content:""!important;position:absolute!important;inset:-4px!important;border-radius:16px!important;padding:2px!important;pointer-events:none!important;z-index:2!important;background:conic-gradient(from 0deg,transparent 0deg 205deg,#9c742d 225deg,#fff0bd 245deg,#d6a344 263deg,#fff5d1 280deg,transparent 300deg 360deg)!important;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0)!important;-webkit-mask-composite:xor!important;mask-composite:exclude!important;filter:drop-shadow(0 0 3px #e9c46c99)!important;animation:kAuctionPanelGoldOrbit 3.8s linear infinite!important}
@keyframes kAuctionPanelGoldOrbit{to{transform:rotate(360deg)}}
@media(max-width:520px){#kTable>.k-turn-corner{top:8px!important;right:8px!important;width:min(52%,175px)!important;max-height:52px!important;font-size:9px!important;padding:4px 6px!important}}
@media(prefers-reduced-motion:reduce){.k-seat .seat-auction-panel:after{animation:none!important}}`;
document.head.appendChild(cornerStyle);
const auctionVisualStyle=document.createElement('style');
auctionVisualStyle.textContent=`
/* 9.31 — charcoal marble tabletop, raised brass rim, black leather seats. */
#kTable{
 min-height:480px!important;border:5px solid #171411!important;border-radius:28px!important;
 background-color:#171512!important;
 background-image:radial-gradient(ellipse at 50% 43%,rgba(105,91,70,.42),rgba(31,28,24,.94) 62%,rgba(8,8,7,.99) 100%),repeating-linear-gradient(13deg,rgba(255,255,255,.025) 0 1px,transparent 1px 6px),linear-gradient(145deg,#484137,#171614 52%,#393127)!important;
 box-shadow:inset 0 0 0 2px #e6c27b,inset 0 0 0 7px #3a2b1b,inset 0 0 58px #000e,0 22px 40px #000d!important;
}
#kTable>.k-seat{
 border:1px solid #c49a50!important;border-radius:13px!important;
 background:linear-gradient(145deg,#29241e,#090909 78%)!important;
 box-shadow:0 10px 20px #000e,inset 0 1px 0 #fff3,inset 0 -8px 18px #0009!important;
}
#kTable>.k-center{border:1px solid #c49a50!important;border-radius:50%!important;background:radial-gradient(ellipse,rgba(48,42,33,.78),rgba(7,7,7,.9))!important;box-shadow:inset 0 0 28px #000e,0 0 0 5px #d1ad6544!important}
#kTable .k-name{background:linear-gradient(#f3dfb0,#b98a43)!important;color:#24180c!important;border:1px solid #f5d58b!important;border-radius:6px!important;padding:3px 6px!important}
#kTable .k-back{background-image:url("./assets/card-back-black-gold.svg")!important;background-size:100% 100%!important;background-position:center!important;background-repeat:no-repeat!important;border:2px solid #e4c477!important;box-shadow:inset 0 0 0 1px #fff3,0 8px 16px #000c!important}
#kTable>.k-seat.active{outline:1px solid #f3d58c!important;box-shadow:0 0 0 1px #f3d58c,0 0 14px #f3d58c88!important;animation:none!important}
#kTable>.k-seat.active:after{content:none!important;display:none!important;animation:none!important}
#kTable .k-bid-chip{top:4px!important;left:4px!important;min-width:21px!important;height:21px!important;border-radius:50%!important;padding:0 4px!important;font:900 11px/19px Georgia,serif!important;z-index:4!important}
#kTable .k-bid-chip.pass{font-size:7px!important;letter-spacing:0!important}
#kTable .k-bid-chip.winner{min-width:25px!important;height:25px!important;font-size:11px!important;line-height:23px!important}
#kTable>.k-seat{overflow:visible!important}
#kTable .seat-auction-panel{
 position:absolute!important;z-index:80!important;left:50%!important;top:calc(100% + 5px)!important;bottom:auto!important;
 transform:translateX(-50%)!important;width:min(218px,calc(100vw - 34px))!important;max-width:218px!important;
 margin:0!important;padding:7px!important;border:1px solid #e6c27b!important;border-radius:12px!important;
 background:linear-gradient(145deg,rgba(24,21,17,.98),rgba(5,5,5,.99))!important;
 box-shadow:0 14px 28px #000e,0 0 12px #e7c87933!important;text-align:center!important;
}
#kTable>.k-seat[data-p="0"]>.seat-auction-panel,#kTable>.k-seat[data-p="1"]>.seat-auction-panel,#kTable>.k-seat[data-p="5"]>.seat-auction-panel{top:auto!important;bottom:calc(100% + 5px)!important}
#kTable .seat-auction-panel #kAuctionTitle{display:block!important;font-size:11px!important;color:#ffe3a0!important;margin-bottom:3px!important}
#kTable .seat-auction-panel #kAuctionInfo{font-size:9px!important;line-height:1.45!important;max-height:35px!important;overflow:hidden!important}
#kTable .seat-auction-panel #kAuctionLog{display:none!important}
#kTable .seat-auction-panel #kHumanAuctionControls .k-bids{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:3px!important;margin-top:5px!important}
#kTable .seat-auction-panel #kHumanAuctionControls .k-bids button{min-width:0!important;min-height:34px!important;padding:3px 1px!important;font-size:11px!important;border-radius:8px!important}
#kTable .seat-auction-panel #kMalzoom{min-height:34px!important;margin-top:4px!important;padding:5px!important}
@media(max-width:520px){#kTable{min-height:460px!important}#kTable .seat-auction-panel{width:min(194px,calc(100vw - 26px))!important}#kTable .k-bid-chip{top:2px!important;left:2px!important}}
`;
document.head.appendChild(auctionVisualStyle);
}
function royalPortrait(rank){
 const p=rank==='K'?{coat:'#173e72',light:'#d9b45d',hair:'#49301f'}:rank==='Q'?{coat:'#8c2854',light:'#f0c66c',hair:'#38233b'}:{coat:'#17644e',light:'#e0b85d',hair:'#57351f'};
 const head=rank==='K'
  ? '<path d="M20 34Q16 14 32 13Q48 14 44 34L41 46Q32 54 23 46Z" fill="#e9b98d" stroke="#6b402d" stroke-width="1.2"/><path d="M20 34Q17 18 25 14Q36 7 44 20L43 35L39 29L35 33L30 28L24 34Z" fill="'+p.hair+'"/><path d="M22 42Q32 49 42 42L40 53Q32 61 24 53Z" fill="'+p.hair+'"/><path d="M25 37h5M35 37h5" stroke="#34251e" stroke-width="1.7" stroke-linecap="round"/><path d="M29 45Q32 47 35 45" stroke="#8d4939" fill="none" stroke-width="1"/>'
  : rank==='Q'
  ? '<path d="M19 34Q15 13 32 13Q49 13 45 35L43 51Q32 61 21 51Z" fill="#f0c39e" stroke="#80543b" stroke-width="1.2"/><path d="M19 39Q12 22 20 15Q30 5 42 14Q52 22 45 43L41 31L37 24L31 30L25 24L22 34Z" fill="'+p.hair+'"/><path d="M26 38h4M35 38h4" stroke="#402b29" stroke-width="1.6" stroke-linecap="round"/><path d="M29 47Q32 49 35 47" stroke="#a34c56" fill="none" stroke-width="1.2"/><path d="M23 52Q32 59 41 52" stroke="#e7bd91" stroke-width="3" fill="none"/>'
  : '<path d="M21 34Q17 15 32 14Q47 15 43 35L41 48Q32 56 23 48Z" fill="#efc39b" stroke="#76513a" stroke-width="1.2"/><path d="M20 31Q17 16 30 12Q43 8 46 23L42 29L36 22L29 27L24 23Z" fill="'+p.hair+'"/><path d="M25 38h4M35 38h4" stroke="#34251e" stroke-width="1.6" stroke-linecap="round"/><path d="M26 45Q32 50 38 45" stroke="#8d4939" fill="none" stroke-width="1.2"/>';
 const crown=rank==='K'
  ? '<path d="M17 20L14 6L24 14L32 3L40 14L50 6L47 21Z" fill="#e7bf55" stroke="#78521f" stroke-width="1.8"/><circle cx="32" cy="8" r="2" fill="#b52f48"/>'
  : rank==='Q'
  ? '<path d="M17 20Q16 5 25 12L32 3L39 12Q48 5 47 20Z" fill="#e7bf55" stroke="#78521f" stroke-width="1.8"/><circle cx="32" cy="12" r="3" fill="#bd3c64"/><circle cx="22" cy="15" r="2" fill="#4c8bb5"/><circle cx="42" cy="15" r="2" fill="#4c8bb5"/>'
  : '<path d="M17 22Q13 7 29 9Q42 4 48 17L45 24L34 18L24 24Z" fill="#d7b05a" stroke="#765024" stroke-width="1.8"/><path d="M39 13Q52 1 51 5Q49 18 43 23" fill="#b33e47" stroke="#76252c" stroke-width="1.2"/>';
 return '<svg class="royal-art" viewBox="0 0 64 76" role="img" aria-label="'+({K:'شاه',Q:'بی‌بی',J:'سرباز'})[rank]+'"><defs><linearGradient id="robe'+rank+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+p.coat+'"/><stop offset="1" stop-color="#101b2c"/></linearGradient></defs><rect x="2" y="2" width="60" height="72" rx="8" fill="#f4e7c8" stroke="#a37a3c" stroke-width="1.8"/><path d="M7 70Q9 53 21 49L32 55L43 49Q55 53 57 70Z" fill="url(#robe'+rank+')" stroke="#4b3928" stroke-width="1.5"/><path d="M21 50L32 61L43 50L40 70H24Z" fill="'+p.light+'" opacity=".9"/><path d="M15 69Q18 57 24 56L32 65L40 56Q47 58 49 69" fill="none" stroke="#f6df9a" stroke-width="2"/>'+head+crown+'<path d="M28 52L32 57L36 52" fill="none" stroke="#fff0c4" stroke-width="2"/><path d="M9 9H55M9 66H55" stroke="#b48b4a" stroke-width=".8" opacity=".75"/><circle cx="12" cy="12" r="2" fill="#c9a45d"/><circle cx="52" cy="12" r="2" fill="#c9a45d"/><circle cx="12" cy="64" r="2" fill="#c9a45d"/><circle cx="52" cy="64" r="2" fill="#c9a45d"/></svg>';
}
function cardNode(c,small=false){
 const d=document.createElement('div');
 if(c.kind==='joker'){
  const red=c.color==='red',tone=red?'#ff303d':'#aeb7c8',deep=red?'#58000b':'#080b18',label=red?'RED JOKER':'BLACK JOKER';
  d.className='k-card joker '+(red?'red':'black');
  d.innerHTML='<span class="joker-title">'+label+'</span><svg class="joker-art" viewBox="0 0 100 112" role="img" aria-label="'+label+'"><defs><linearGradient id="jbg'+(red?'r':'b')+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+tone+'"/><stop offset="1" stop-color="'+deep+'"/></linearGradient><radialGradient id="jface'+(red?'r':'b')+'"><stop stop-color="'+(red?'#ff8a78':'#b8bdcc')+'"/><stop offset="1" stop-color="'+(red?'#9d0719':'#242938')+'"/></radialGradient></defs><path d="M12 105 L17 20 Q50 -2 83 20 L88 105Z" fill="url(#jbg'+(red?'r':'b')+')" stroke="'+tone+'" stroke-width="2"/><path d="M25 34 Q8 5 7 4 Q30 7 39 26 M75 34 Q92 5 93 4 Q70 7 61 26" fill="'+tone+'" stroke="'+deep+'" stroke-width="3"/><path d="M24 48 Q50 26 76 48 L70 78 Q50 96 30 78Z" fill="url(#jface'+(red?'r':'b')+')" stroke="'+tone+'" stroke-width="2"/><path d="M30 52 L45 57 L36 64Z M70 52 L55 57 L64 64Z" fill="#fff1c9"/><path d="M34 75 Q50 91 66 75 Q50 82 34 75" fill="#21050a" stroke="#fff1c9" stroke-width="2"/><path d="M78 30 L78 91 M70 38 L86 38 M78 30 L70 23 M78 30 L86 23" stroke="#f4d78a" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M72 91 L84 91" stroke="#f4d78a" stroke-width="3" stroke-linecap="round"/></svg><span class="joker-caption">DOUBLE KOUT</span>';
  return d;
 }
 d.className='k-card '+(['H','D'].includes(c.suit)?'red':'');
 const rank=String(c.rank||'');
 const royal=(r)=>royalPortrait(r);
 d.innerHTML='<span class="k-corner k-corner-top">'+rank+'<i>'+suitGlyph[c.suit]+'</i></span><span class="k-corner k-corner-bottom">'+rank+'<i>'+suitGlyph[c.suit]+'</i></span>'+(['K','Q','J'].includes(rank)?'<span class="k-royal-frame">'+royal(rank)+'</span>':'<span class="ksuit">'+suitGlyph[c.suit]+'</span>');
 return d;
}
function setStatus(msg){const node=$('kStatus');if(!node){console.error('Kuwaiti status node is missing:',msg);return;}node.classList.remove('hidden');node.removeAttribute('hidden');node.style.cssText+=';display:block!important;visibility:visible!important;opacity:1!important;position:fixed!important;left:8px!important;right:8px!important;bottom:calc(8px + env(safe-area-inset-bottom))!important;z-index:2147483000!important;min-height:42px!important;max-height:25vh!important;overflow:auto!important;background:#09271f!important;color:#fff0c2!important;border:2px solid #e7c879!important;border-radius:12px!important;padding:10px!important;box-sizing:border-box!important;';node.setAttribute('role','status');node.setAttribute('aria-live','assertive');node.textContent=String(msg);console.info('[Kuwaiti status]',msg);}
function setContractChoice(value){const select=$('kContract');if(select)select.value=value;document.querySelectorAll('#kContractChoices [data-contract]').forEach(b=>{const yes=b.dataset.contract===value;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes?'true':'false');});}
function setMalzoomSuit(value){const select=$('kTrumpSuit');if(select)select.value=value;document.querySelectorAll('#kMalzoomChoices [data-trump-suit]').forEach(b=>{const yes=b.dataset.trumpSuit===value;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes?'true':'false');});}
function setScreen(which){
 $('modePicker').classList.toggle('hidden',which!=='modes');
 $('setup').classList.add('hidden');$('game').classList.add('hidden');
 $('kuwaitiSetup').classList.toggle('hidden',which!=='setup');
 $('kuwaitiGame').classList.toggle('hidden',which!=='game');
}
function setupMarkup(){
 const s=document.createElement('section');s.className='panel hidden';s.id='kuwaitiSetup';
 s.innerHTML=`<h2 class="section-title">آماده‌سازی کوت کویتی · شش نفره</h2>
 <div class="k-intro"><div>۶ بازیکن</div><div>۵۴ کارت · ۹ کارت برای هر نفر</div><div>۹ دست در هر بازی</div></div>
 <label>شیوه بازی</label><select class="k-select" id="kPlayStyle"><option value="ai">یک بازیکن انسانی در برابر هوش مصنوعی</option><option value="hotseat">بازی چندنفره واقعی با یک گوشی</option><option value="online">آنلاین با شش گوشی · اتاق اینترنتی</option></select><div id="kHumanSeatSetup"><label>انتخاب صندلی بازیکنان انسانی؛ صندلی‌های خالی با هوش مصنوعی پر می‌شوند</label><div id="kHumanSeatChoices" class="k-actions"></div><p class="k-small">تغییر صندلی‌ها فقط هنگام شروع بازی جدید امکان‌پذیر است.</p></div><label>سطح هوش مصنوعی</label><select class="k-select" id="kDifficulty"><option value="easy">آسان · انتخاب ساده</option><option value="normal" selected>معمولی · تحلیل پایه</option><option value="hard">سخت · شمارش و تحلیل کارت‌ها</option><option value="expert">خیلی سخت · شبیه‌سازی دست‌های پنهان</option></select><p class="k-small">سطح انتخابی روی تمام بازیکنان هوش مصنوعی در این میز اعمال می‌شود.</p><label>حد امتیاز پایان مسابقه</label><select class="k-select" id="kMatchLimit"><option value="54">۵۴ امتیاز مثبت</option><option value="-54">۵۴ امتیاز منفی</option><option value="108">۱۰۸ امتیاز مثبت</option><option value="-108">۱۰۸ امتیاز منفی</option></select>
 <div class="k-small" id="kMatchProgress">حد امتیاز مسابقه: ۵۴+</div>
 <div id="kNextPicker" class="hidden"><label>انتخاب نفر اول مزایده توسط تیم برنده بازی قبل</label><select class="k-select" id="kFirstAuction"><option value="0">بازیکن ۱</option><option value="2">بازیکن ۳</option><option value="4">بازیکن ۵</option></select></div>
 <p class="k-small">در بازی اول دارنده ۲ خاج نفر اول مزایده است. در بازی‌های بعدی تیم برنده بازی قبل نفر اول مزایده را انتخاب می‌کند و بازیکن نشسته قبل از برنده مزایده قبلی، ملزوم‌کننده است.</p>
 <div class="k-actions"><button id="kStartAuction">پخش کارت و شروع مزایده</button><button id="kBackModes">بازگشت</button></div>`;
 const g=document.createElement('section');g.className='panel hidden';g.id='kuwaitiGame';
 g.innerHTML=`<h2 class="section-title">کوت کویتی · میز شش‌نفره</h2>
 <div class="k-score"><div>امتیاز تیم شما <b id="kScoreA">۰</b></div><div>امتیاز تیم حریف <b id="kScoreB">۰</b></div><div>دست <b id="kTrickNo">۱</b> از ۹</div><div>بازی‌های برده تیم شما <b id="kGamesWonA">۰</b></div><div>بازی‌های برده حریف <b id="kGamesWonB">۰</b></div></div>
 <div id="kPhaseModal" class="k-phase-modal" role="dialog" aria-modal="true" aria-label="تصمیم‌های بازی"><div class="k-phase-dialog"><div id="kAuctionMount"></div><div id="kAuction" class="k-auction k-phase-modal-content hidden"><b id="kAuctionTitle">مزایده</b><div class="k-small" id="kAuctionInfo"></div><div class="k-small" id="kAuctionLog"></div>
 <div id="kHumanAuctionControls">
 <div class="k-bids"><button data-bid="pass" id="kPass">پاس</button><button data-bid="6">۶</button><button data-bid="7">۷</button><button data-bid="8">۸</button><button data-bid="9">۹</button></div>
 <button id="kMalzoom" class="primary hidden">ملزوم</button></div></div>
 <div id="kAuctionSummary" class="k-auction-summary k-phase-modal-content hidden">نتیجه مزایده هنوز مشخص نشده است.</div>
 <div id="kContractSetup" class="k-contract-setup k-phase-modal-content hidden"><h3>انتخاب قرارداد بازی</h3><p class="k-small">با توجه به کارت‌هایی که در اختیار داری، قرارداد مناسب را انتخاب کن.</p><select id="kContract" class="k-select" style="display:none"><option value="hokm_spades">پیک ♠ · حکم‌دار</option><option value="hokm_hearts">دل ♥ · حکم‌دار</option><option value="hokm_diamonds">خشت ♦ · حکم‌دار</option><option value="hokm_clubs">گشنیز ♣ · حکم‌دار</option><option value="naras">نرس · بدون حکم</option><option value="tak_naras">تک نرس · بدون حکم</option><option value="saras">سرس · بدون حکم</option></select><div id="kContractChoices" class="k-contract-choice-grid"><button type="button" class="k-contract-choice selected" data-contract="hokm_spades" aria-pressed="true"><span class="k-choice-symbol">♠</span><b>حکم پیک</b><small>خال حکم‌دار</small></button><button type="button" class="k-contract-choice" data-contract="hokm_hearts" aria-pressed="false"><span class="k-choice-symbol red">♥</span><b>حکم دل</b><small>خال حکم‌دار</small></button><button type="button" class="k-contract-choice" data-contract="hokm_diamonds" aria-pressed="false"><span class="k-choice-symbol red">♦</span><b>حکم خشت</b><small>خال حکم‌دار</small></button><button type="button" class="k-contract-choice" data-contract="hokm_clubs" aria-pressed="false"><span class="k-choice-symbol">♣</span><b>حکم گشنیز</b><small>خال حکم‌دار</small></button><button type="button" class="k-contract-choice" data-contract="naras" aria-pressed="false"><span class="k-choice-symbol">✧</span><b>نرس</b><small>بدون حکم</small></button><button type="button" class="k-contract-choice" data-contract="tak_naras" aria-pressed="false"><span class="k-choice-symbol">Ⅱ</span><b>تک نرس</b><small>بدون حکم</small></button><button type="button" class="k-contract-choice" data-contract="saras" aria-pressed="false"><span class="k-choice-symbol">♛</span><b>سرس</b><small>بدون حکم</small></button></div><button id="kConfirmContract" class="primary">تأیید قرارداد و شروع بازی</button></div>
 <div id="kMalzoomSetup" class="k-auction k-phase-modal-content hidden"><h3>انتخاب خال حکم ملزوم</h3><p class="k-small">خال حکم را انتخاب کن و سپس مشخص کن که حکم مخفی بماند یا نه.</p><select id="kTrumpSuit" class="k-select" style="display:none"><option value="S">پیک ♠</option><option value="H">دل ♥</option><option value="D">خشت ♦</option><option value="C">گشنیز ♣</option></select><div id="kMalzoomChoices" class="k-contract-choice-grid k-suit-choice-grid"><button type="button" class="k-contract-choice selected" data-trump-suit="S" aria-pressed="true"><span class="k-choice-symbol">♠</span><b>پیک</b></button><button type="button" class="k-contract-choice" data-trump-suit="H" aria-pressed="false"><span class="k-choice-symbol red">♥</span><b>دل</b></button><button type="button" class="k-contract-choice" data-trump-suit="D" aria-pressed="false"><span class="k-choice-symbol red">♦</span><b>خشت</b></button><button type="button" class="k-contract-choice" data-trump-suit="C" aria-pressed="false"><span class="k-choice-symbol">♣</span><b>گشنیز</b></button></div><label class="k-hide-trump"><input type="checkbox" id="kHideTrump" checked> حکم مخفی بماند</label><button id="kConfirmMalzoom" class="primary">تأیید و شروع بازی</button></div>
 <div class="k-table" id="kTable">${[0,1,2,3,4,5].map(p=>'<div class="k-seat" data-p="'+p+'"><div class="k-name" id="kName'+p+'">'+playerNames[p]+'</div><div class="k-count" id="kCount'+p+'">۹ کارت</div><div class="k-seat-tricks" id="kSeatTricks'+p+'">۰ دست</div><div class="k-played" id="kPlayed'+p+'"></div></div>').join('')}
 <div class="k-game-corner-label" aria-label="کوت کویتی">کوت کویتی</div><div class="k-trump-badge k-trump-corner"><span>حکم</span><b id="kTrumpDisplay">بدون حکم</b></div><div id="kTurn" class="k-turn-corner" role="status" aria-live="polite">در انتظار مزایده</div><div class="k-center"><div id="kTrickCards" class="hidden" aria-hidden="true">۰</div></div><div id="kTableCardLayer" class="k-table-card-layer" aria-label="کارت‌های بازی‌شده روی میز"><div id="kPreviousCards" class="k-previous-cards" aria-label="کارت‌های دست قبلی"></div><div id="kCenterCards" class="k-center-cards" aria-label="کارت‌های دست جاری"></div></div></div>
 <div class="hidden" id="kLiveTricks"><span id="kWonA">۰</span><span id="kWonB">۰</span></div>
 <div id="kStatus" class="k-status hidden">وضعیت بازی</div>
 <div class="k-actions"><button id="kAskTrump" class="hidden">درخواست اعلام حکم مخفی</button><button id="kAnnounceTrump" class="hidden">اعلام حکم</button></div>
 <div class="k-hand-tools"><h3 class="section-title">کارت‌های بازیکن نوبت‌دار</h3><button type="button" id="kSortHand" aria-label="مرتب‌سازی کارت‌ها">↕</button></div><div id="kHand" class="k-hand"></div>
 <div id="kResult" class="k-auction k-phase-modal-content hidden"></div>
 <div id="kHotseatGate" class="k-auction k-phase-modal-content hidden"><b id="kHotseatTitle">تحویل گوشی</b><p class="k-small" id="kHotseatText">گوشی را به بازیکن بعدی بدهید.</p><button id="kRevealHand" class="primary">کارت‌ها را نمایش بده</button></div></div></div><div class="k-actions"><button id="kNewGame" class="hidden">بازی بعدی</button><button id="kExit">بازگشت به انتخاب بازی</button></div>`;
 $('modePicker').insertAdjacentElement('afterend',s);s.insertAdjacentElement('afterend',g);
}
function renderHumanSeatChoices(){const host=$('kHumanSeatChoices');if(!host)return;host.innerHTML='';for(let p=0;p<6;p++){const l=document.createElement('label');l.style.cssText='display:flex;align-items:center;gap:5px;background:#09271f;border:1px solid #477a68;border-radius:9px;padding:7px;color:#f4dfaa;font-size:11px';const c=document.createElement('input');c.type='checkbox';c.value=String(p);c.checked=p===0;c.addEventListener('change',()=>{if(!host.querySelector('input:checked'))c.checked=true;});l.append(c,document.createTextNode('صندلی '+fa(p+1)));host.append(l);}}
function isHumanSeat(p){if(isOnlineKuwaiti())return Number(p)===onlineKuwaiti.seat;return $('kPlayStyle')&&$('kPlayStyle').value!=='hotseat'?p===0:humanSeats.has(p);}
function revealCurrentHuman(){hotseatRevealed=true;$('kHotseatGate').classList.add('hidden');if(auction){renderAuction();renderAuctionHand();}else renderGame();}
function isMatchOver(){return matchLimit>=0?(points.A>=matchLimit||points.B>=matchLimit):(points.A<=matchLimit||points.B<=matchLimit);}
function resetSetup(){
 if(aiTimer){clearTimeout(aiTimer);aiTimer=null;}
 game=null;auction=null;locked=false;trickView=[];hotseatRevealed=false;$('kHotseatGate')?.classList.add('hidden');
 $('kAuction').classList.add('hidden');$('kAuctionSummary').classList.add('hidden');$('kContractSetup').classList.add('hidden');$('kMalzoomSetup').classList.add('hidden');$('kResult').classList.add('hidden');$('kNewGame').classList.add('hidden');
 $('kHand').innerHTML='';$('kPreviousCards').innerHTML='';$('kCenterCards').innerHTML='';$('kTrumpDisplay').textContent='بدون حکم';$('kTrickCards').textContent='کارت‌های این دست: ۰ از ۶';$('kTurn').textContent='در انتظار مزایده';$('kStatus').textContent='میز پاک و آماده بازی جدید است.';
 for(let p=0;p<6;p++){$('kPlayed'+p).innerHTML='';$('kCount'+p).textContent='۹ کارت';$('kSeatTricks'+p).textContent='۰ دست تیم';$('kSeat'+p)?.classList?.remove('active');}
 if(firstGame){playedTricks=0;matchLimit=Number($('kMatchLimit').value)||54;}
 $('kMatchProgress').textContent='حد امتیاز مسابقه: '+(matchLimit>0?'+':'')+fa(matchLimit)+' · مجموع الف: '+fa(points.A)+' · مجموع ب: '+fa(points.B);
 renderHumanSeatChoices();$('kHumanSeatSetup').classList.toggle('hidden',$('kPlayStyle').value!=='hotseat');
 setScreen('setup');
 if(firstGame){$('kNextPicker').classList.add('hidden');}
 else{
  $('kNextPicker').classList.remove('hidden');
  const options=previousWinningTeam==='A'?[0,2,4]:[1,3,5];
  const sel=$('kFirstAuction');sel.innerHTML=options.map(p=>'<option value="'+p+'">'+playerNames[p]+'</option>').join('');
  if(previousWinningTeam==='A')sel.value='0';
 }
}
function startAuction(){
 humanSeats=$('kPlayStyle').value==='hotseat'?new Set([...document.querySelectorAll('#kHumanSeatChoices input:checked')].map(x=>Number(x.value))):new Set([0]);hotseatRevealed=false;
 if(!humanSeats.size){setStatus('دست‌کم یک صندلی انسانی انتخاب کن.');return;}
 if(isMatchOver()){setStatus('حد امتیاز مسابقه قبلاً ثبت شده است؛ مسابقه جدید را آغاز کن.');return;}
 locked=false;
 // Clear every visual trace from the previous deal before dealing a fresh 54-card deck.
 $('kHand').innerHTML='';$('kPreviousCards').innerHTML='';$('kCenterCards').innerHTML='';$('kResult').classList.add('hidden');$('kNewGame').classList.add('hidden');$('kTrickCards').textContent='کارت‌های این دست: ۰ از ۶';
 for(let p=0;p<6;p++){$('kPlayed'+p).innerHTML='';$('kCount'+p).textContent='۹ کارت';}
 const firstAuctionPlayer=firstGame?null:Number($('kFirstAuction').value);
 // Do not allow a prior deal's contract or trump display to leak into the new auction.
 $('kTrumpDisplay').textContent='در انتظار مزایده';setContractChoice('hokm_spades');setMalzoomSuit('S');$('kAuctionSummary').classList.add('hidden');$('kContractSetup').classList.add('hidden');$('kWonA').textContent='۰';$('kWonB').textContent='۰';
 $('kStatus').textContent='کارت‌ها پخش شدند؛ قرارداد این بازی هنوز تعیین نشده است.';
 game=K.newGame({firstGame,previousAuctionWinner,firstAuctionPlayer});
 game.contract=null;game.selectedContract=null;game.trumpSuit=null;game.trumpAnnounced=false;game.hiddenTrump=false;game.isMalzoom=false;
 game.initialHands=game.hands.map(h=>h.slice());
 auction={starter:game.auctionStarter,current:game.auctionStarter,highest:null,highestRank:0,highestPlayer:null,passes:0,bids:[],lastBidder:null};
 $('kAuction').classList.remove('hidden');$('kContractSetup').classList.add('hidden');$('kMalzoomSetup').classList.add('hidden');$('kResult').classList.add('hidden');$('kNewGame').classList.add('hidden');
 $('kTrumpDisplay').textContent='در حال مزایده';$('kStatus').textContent='کارت‌ها پخش شدند؛ مزایده از '+playerNames[auction.current]+' آغاز می‌شود.';
 setScreen('game');renderAuction();renderAuctionHand();auctionTurn();
}
function renderAuction(){
 if(!auction)return;
 $('kTable')?.classList.add('auction-orbit-active');
 const activeSeat=document.querySelector('.k-seat[data-p="'+auction.current+'"]');
 const auctionPanel=$('kAuction');
 const isHuman=isHumanSeat(auction.current),forced=auction.passes>=5&&!auction.highest;
 document.querySelectorAll('.k-seat.auction-panel-active').forEach(seat=>seat.classList.remove('auction-panel-active'));
 if(isHuman&&activeSeat&&auctionPanel){
  activeSeat.classList.add('auction-panel-active');
  auctionPanel.classList.remove('hidden');auctionPanel.classList.add('seat-auction-panel');
  if(auctionPanel.parentElement!==activeSeat)activeSeat.appendChild(auctionPanel);
 }else if(auctionPanel){
  auctionPanel.classList.add('hidden');auctionPanel.classList.remove('seat-auction-panel');
  const mount=$('kAuctionMount');if(mount&&auctionPanel.parentElement!==mount)mount.appendChild(auctionPanel);
 }
 $('kAuctionSummary').classList.add('hidden');
 $('kAuctionTitle').textContent=isHuman?'نوبت مزایده شما · پیشنهاد یا پاس':'نوبت مزایده هوش مصنوعی';
 $('kAuctionInfo').classList.toggle('hidden',!isHuman);
 $('kAuctionLog').classList.add('hidden');
 const obligated=game.obligatedPlayer;
 $('kAuctionInfo').textContent='ملزوم‌کننده: '+(obligated===null?'نامشخص':playerNames[obligated])+' · بالاترین پیشنهاد: '+(auction.highest?playerNames[auction.highestPlayer]+' · '+auction.highest.label:'هنوز پیشنهادی ثبت نشده')+' · پاس‌های پیاپی: '+auction.passes+' از ۵';
 $('kAuctionSummary').classList.add('hidden');
 $('kAuctionSummary').textContent='مزایده در جریان است · '+(auction.highest?'پیشتاز فعلی: '+playerNames[auction.highestPlayer]+' با پیشنهاد '+auction.highest.label:'هنوز پیشنهادی ثبت نشده')+' · '+auction.bids.map(x=>playerNames[x.player]+': '+x.label).join(' ← ');
 $('kAuctionLog').textContent='روند مزایده: '+(auction.bids.length?auction.bids.map(x=>playerNames[x.player]+': '+x.label+(x.contract?' · '+(contractName[x.contract]||x.contract):'')).join(' ← '):'هنوز کسی پیشنهاد نداده است');
 document.querySelectorAll('.k-seat').forEach(el=>{
  const p=Number(el.dataset.p);el.classList.toggle('active',p===auction.current);
  el.querySelector('.k-bid-chip')?.remove();
  const latest=[...auction.bids].reverse().find(b=>b.player===p);
  if(latest){
   const isPass=latest.label==='پاس';
   const chip=document.createElement('span');chip.className='k-bid-chip'+(isPass?' pass':'');
   chip.textContent=isPass?'PASS':(latest.label==='ملزوم'?'M':fa(latest.label));
   chip.title=isPass?'پاس در مزایده':'پیشنهاد مزایده '+latest.label;el.append(chip);
  }
 });
 if(isHuman)$('kAuction').classList.remove('hidden');
 $('kHumanAuctionControls').classList.toggle('hidden',!isHuman);
 const gate=$('kHotseatGate');if(isHuman&&!hotseatRevealed){gate.classList.remove('hidden');$('kHotseatTitle').textContent='تحویل گوشی به '+playerNames[auction.current];$('kHotseatText').textContent='گوشی را به '+playerNames[auction.current]+' بدهید؛ سپس کارت‌های مزایده را نمایش دهید.';}else if(!isHuman)gate.classList.add('hidden');
 if(isHuman){
  $('kPass').disabled=forced||onlineKuwaitiBidBusy;
  $('kPass').textContent=forced?'پاس (غیرمجاز؛ باید پیشنهاد بدهی)':'پاس';
  $('kMalzoom').classList.toggle('hidden',obligated!==auction.current||!!auction.highest);
  $('kMalzoom').disabled=onlineKuwaitiBidBusy;
  [...$('kAuction').querySelectorAll('[data-bid]')].forEach(b=>{
   const n=b.dataset.bid==='pass'?0:Number(b.dataset.bid);
   b.disabled=onlineKuwaitiBidBusy||(b.dataset.bid!=='pass'&&n<=auction.highestRank);
  });
 }
 renderAuctionHand();
}
function renderAuctionHand(){
 if(!game||!game.hands)return;
 $('kHand').innerHTML='';
 // In solo-vs-AI mode the human's own cards remain visible throughout the auction,
 // regardless of whose bid turn it is. Hotseat keeps the private handoff gate.
 const hotseat=$('kPlayStyle').value==='hotseat';
 const p=isOnlineKuwaiti()?onlineKuwaiti.seat:(hotseat?(auction?auction.current:game.turn):0);
 const gate=$('kHotseatGate'),hide=hotseat&&isHumanSeat(p)&&!hotseatRevealed;
 gate.classList.toggle('hidden',!!hide);if(hide){$('kHotseatTitle').textContent='تحویل گوشی به '+playerNames[p];$('kHotseatText').textContent='گوشی را به '+playerNames[p]+' بدهید؛ سپس کارت‌ها را نمایش دهید.';}
 if(!isHumanSeat(p)||hide)return;
 game.hands[p].forEach((c,i,arr)=>{
  const card=document.createElement('div');
  card.className='k-auction-card';
  const offset=i-(arr.length-1)/2;
  card.style.transform='rotate('+(offset*4)+'deg) translateY('+(Math.abs(offset)*2.1)+'px)';
  card.style.zIndex=String(10+i);
  card.append(cardNode(c));
  $('kHand').append(card);
 });
}
function handStrength(p){
 const h=game.hands[p],counts={S:0,H:0,D:0,C:0};
 let score=0,aces=0,kings=0,queens=0;
 for(const c of h){
  if(c.kind==='joker'){score+=c.color==='red'?6:4;continue;}
  counts[c.suit]++;
  if(c.rank==='A'){score+=4.8;aces++;}
  else if(c.rank==='K'){score+=3.7;kings++;}
  else if(c.rank==='Q'){score+=2.7;queens++;}
  else if(c.rank==='J')score+=1.8;
  else if(c.rank==='10')score+=1.1;
  else if(c.rank==='9')score+=.6;
 }
 const lengths=Object.values(counts).sort((a,b)=>b-a);
 score+=(lengths[0]||0)*1.35+(lengths[1]||0)*.35;
 if(aces>=2)score+=1.5;if(kings>=2)score+=.8;if(queens>=2)score+=.4;
 return score;
}
function aiBid(p){
 const rank=auction.highestRank,str=handStrength(p),difficulty=$('kDifficulty')?.value||'normal';
 const bidAdjustment={easy:-3.5,normal:0,hard:1.5,expert:3}[difficulty]||0;
 const malzoomThreshold={easy:18,normal:22,hard:24,expert:26}[difficulty]||22;
 if(p===game.obligatedPlayer&&!auction.highest&&str>malzoomThreshold)return {type:'malzoom',rank:1,label:'ملزوم'};
 if(rank<4){const next=rank+1,target=next===4?9:5+next,threshold=[0,15.5,20.5,25.5,30][next]+bidAdjustment;if(str>=threshold)return {type:'normal',rank:next,label:String(target),target};}
 if(auction.passes>=5&&!auction.highest)return {type:'normal',rank:1,label:'۶',target:6};
 return null;
}
function submitBid(bid){
 if(!auction||locked)return;
 if(isOnlineKuwaiti()){submitOnlineKuwaitiBid(bid);return;}
 const p=auction.current;
 if(bid.type==='malzoom'&&(p!==game.obligatedPlayer||auction.highest||auction.highestRank>0)){setStatus('ملزوم فقط زمانی مجاز است که هنوز هیچ بازیکنی پیشنهاد دست نداده باشد؛ اکنون باید پیشنهاد قبلی را بالاتر ببری یا پاس بدهی.');return;}
 if(bid.type==='pass'){
  auction.passes++;auction.bids.push({player:p,label:'پاس'});
 }else{
  const allowedContracts=['hokm_spades','hokm_hearts','hokm_diamonds','hokm_clubs','naras','tak_naras','saras'];
  if(bid.type!=='malzoom'&&bid.contract!==undefined&&!allowedContracts.includes(bid.contract)){setStatus('نوع پیشنهاد نامعتبر است؛ مزایده ادامه پیدا نکرد.');return;}
  if(bid.rank<=auction.highestRank)return;
  const committedBid={...bid};
  auction.highest=committedBid;auction.highestRank=committedBid.rank;auction.highestPlayer=p;auction.passes=0;auction.lastBidder=p;
  auction.bids.push({player:p,label:committedBid.label,contract:committedBid.contract});
 }
 if(auction.passes>=5&&auction.highest){finishAuction();return;}
 if(auction.passes>=5&&!auction.highest){
  const forcedPlayer=(p+1)%6;auction.current=forcedPlayer;
  auction.passes=5;
  if(!isHumanSeat(forcedPlayer)){const forcedBid={type:'normal',rank:1,label:'۶',target:6};submitBid(forcedBid);return;}
 }
 auction.current=(p+1)%6;hotseatRevealed=false;
 renderAuction();renderAuctionHand();auctionTurn();
}
function finishAuction(){
 if(!auction||!auction.highest||!Number.isInteger(auction.highestPlayer)){setStatus('مزایده برنده مشخصی ندارد؛ بازی آغاز نشد.');return;}
 const auctionMount=$('kAuctionMount');if(auctionMount){$('kAuction').classList.remove('seat-auction-panel');auctionMount.appendChild($('kAuction'));}

 const win=auction.highestPlayer,bid={...auction.highest};
 // Once the auction closes, remove every PASS/bid marker and retain only the
 // winning contract value on the winning player's seat.
 document.querySelectorAll('.k-seat').forEach(el=>{
  el.querySelector('.k-bid-chip')?.remove();
  el.classList.remove('auction-winner');
  el.classList.remove('active');
  el.classList.remove('auction-panel-active');
 });
 const winningSeat=document.querySelector('.k-seat[data-p="'+win+'"]');
 if(winningSeat){
  winningSeat.classList.add('auction-winner');
  const chip=document.createElement('span');chip.className='k-bid-chip winner';
  chip.textContent=bid.type==='malzoom'?'M':fa(bid.target||bid.label||'');
  chip.title=bid.type==='malzoom'?'برنده مزایده · ملزوم':'برنده مزایده · '+(bid.target||bid.label)+' دست';
  winningSeat.append(chip);
 }
 game.auctionBid=bid;game.auctionWinner=win;game.selectedContract=null;
 game.isMalzoom=bid.type==='malzoom';
 $('kAuction').classList.add('hidden');
 $('kAuctionSummary').classList.remove('hidden');
 $('kAuctionSummary').textContent='نتیجه مزایده · برنده: '+playerNames[win]+' · پیشنهاد نهایی: '+bid.label+' · روند: '+auction.bids.map(x=>playerNames[x.player]+': '+x.label).join(' ← ');
 const closedAuction=auction;auction=null;
 if(window.kuwaitiAuctionSummaryTimer)clearTimeout(window.kuwaitiAuctionSummaryTimer);
 window.kuwaitiAuctionSummaryTimer=setTimeout(()=>{const panel=$('kAuction');if(panel){panel.classList.add('hidden');const mount=$('kAuctionMount');if(mount&&panel.parentElement!==mount)mount.appendChild(panel);}const summary=$('kAuctionSummary');if(summary)summary.classList.add('hidden');},7800); // Auction is closed; subsequent phone handoffs belong to the active game turn.
 if(game.isMalzoom){
  game.contract='hokm';
  $('kStatus').textContent='برنده مزایده: '+playerNames[win]+' · ملزوم';
  if(isHumanSeat(win)){
   setMalzoomSuit('S');$('kMalzoomSetup').classList.remove('hidden');$('kTrumpDisplay').textContent='انتخاب حکم ملزوم';
   renderContractChoiceHand(win);
   setStatus('خال حکم ملزوم را انتخاب کن و مشخص کن مخفی بماند یا اعلام شود.');
  }else{
   const counts={S:0,H:0,D:0,C:0};game.hands[win].forEach(c=>{if(c.kind==='normal')counts[c.suit]++});
   const suit=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
   startActualGame(suit,true);
  }
  return;
 }
 if(isHumanSeat(win)){
  setScreen('game');
  $('kAuction').classList.add('hidden');$('kMalzoomSetup').classList.add('hidden');
  $('kContractSetup').classList.remove('hidden');
  $('kContract').value='hokm_spades';
  $('kTrumpDisplay').textContent='منتظر انتخاب قرارداد';
  setStatus('مزایده را بردی؛ قرارداد و خال حکم را انتخاب کن، سپس دکمه تأیید را بزن تا کارت‌بازی شروع شود.');
  renderContractChoiceHand(win);
 }else{
  const chosen=aiChooseContract(win);
  beginWinningContract(chosen);
 }
}
function aiChooseContract(p){
 const h=game.hands[p],suits=['S','H','D','C'];
 const rankScore={A:5,K:4,Q:3,J:2,10:1.3,9:.8};
 const suitScores=suits.map(s=>{
  const cards=h.filter(c=>c.kind==='normal'&&c.suit===s);
  return {s,count:cards.length,score:cards.length*1.7+cards.reduce((v,c)=>v+(rankScore[c.rank]||0),0)};
 });
 const best=suitScores.sort((a,b)=>b.score-a.score)[0];
 const highCount=h.filter(c=>c.kind==='normal'&&['A','K','Q'].includes(c.rank)).length;
 const jokerCount=h.filter(c=>c.kind==='joker').length;
 if(jokerCount>=2&&highCount>=3)return 'saras';
 if(best.count>=5&&best.score>=12)return ({S:'hokm_spades',H:'hokm_hearts',D:'hokm_diamonds',C:'hokm_clubs'})[best.s];
 if(h.filter(c=>c.kind==='normal'&&c.rank==='2').length>=3)return 'naras';
 return 'tak_naras';
}
/* 0.8.21: pin the six-player private hand above the viewport edge while choosing a contract. */
const contractHandStyle=document.createElement('style');
contractHandStyle.textContent="#kHand.k-contract-thinking{position:fixed!important;left:50%!important;bottom:calc(8px + env(safe-area-inset-bottom))!important;transform:translateX(-50%)!important;width:min(96vw,850px)!important;max-width:96vw!important;min-height:132px!important;max-height:158px!important;z-index:1000!important;margin:0!important;padding:18px 8px 24px!important;display:flex!important;justify-content:center!important;align-items:flex-end!important;gap:0!important;overflow-x:auto!important;overflow-y:visible!important;background:linear-gradient(180deg,#123d30f7,#071e18f7)!important;border:1px solid #f0d18b!important;border-radius:14px!important;box-shadow:0 8px 24px #000c,inset 0 0 18px #0008!important}\n#kHand.k-contract-thinking .k-auction-card{flex:0 0 62px!important;width:62px!important;height:93px!important;margin-left:-36px!important;position:relative!important;opacity:1!important;filter:none!important;pointer-events:none!important}\n#kHand.k-contract-thinking .k-auction-card:first-child{margin-left:0!important}\n#kHand.k-contract-thinking .k-auction-card .k-card{width:62px!important;height:93px!important;min-width:62px!important;opacity:1!important;filter:none!important}\n@media(max-width:520px){#kHand.k-contract-thinking{min-height:118px!important;max-height:136px!important;padding:14px 5px 20px!important}#kHand.k-contract-thinking .k-auction-card{flex-basis:54px!important;width:54px!important;height:81px!important;margin-left:-31px!important}#kHand.k-contract-thinking .k-auction-card:first-child{margin-left:0!important}#kHand.k-contract-thinking .k-auction-card .k-card{width:54px!important;height:81px!important;min-width:54px!important}}";
document.head.appendChild(contractHandStyle);
function renderContractChoiceHand(player){
 if(!game||!game.hands||!Number.isInteger(player))return;
 const host=$('kHand');host.innerHTML='';host.classList.add('k-contract-thinking');
 // Keep the private hand above transformed table layers and iOS clipping while selecting the contract.
 document.body.appendChild(host);
 game.hands[player].forEach((card,i,arr)=>{const el=document.createElement('div');el.className='k-auction-card';const offset=i-(arr.length-1)/2;el.style.transform='rotate('+(offset*4.2)+'deg) translateY('+(Math.abs(offset)*2)+'px)';el.style.zIndex=String(10+i);el.style.opacity='1';el.style.filter='none';el.style.pointerEvents='none';el.append(cardNode(card));host.append(el);});
}
function markWinningSeatContract(contract){
 if(!game||!Number.isInteger(game.auctionWinner))return;
 const seat=document.querySelector('.k-seat[data-p="'+game.auctionWinner+'"]');if(!seat)return;
 let chip=seat.querySelector('.k-bid-chip.winner');if(!chip){chip=document.createElement('span');chip.className='k-bid-chip winner';seat.append(chip);}
 const target=game.auctionBid&&game.auctionBid.target;
 const value=target?fa(target)+' · '+(contractName[contract]||contract):'M · '+(contractName[contract]||'ملزوم');
 chip.textContent=value;chip.title='قرارداد نهایی برنده مزایده: '+value;
}
function beginWinningContract(contract){
 game.auctionBid.contract=contract;game.selectedContract=contract;
 const noTrump=['naras','tak_naras','saras'].includes(contract);
 const trumpSuit=noTrump?null:({hokm_spades:'S',hokm_hearts:'H',hokm_diamonds:'D',hokm_clubs:'C'})[contract];
 game.contract=noTrump?contract:'hokm';game.trumpSuit=trumpSuit;
 $('kContractSetup').classList.add('hidden');
 $('kStatus').textContent='برنده مزایده: '+playerNames[game.auctionWinner]+' · '+game.auctionBid.label+' · قرارداد: '+contractName[contract];
 markWinningSeatContract(contract);
 startActualGame(trumpSuit,false);
}
function confirmWinningContract(){
 if(!game||!game.auctionBid||!isHumanSeat(game.auctionWinner))return;
 if(isOnlineKuwaiti()){onlineKuwaitiRpc({type:'select_contract',contract:$('kContract').value}).catch(e=>onlineKuwaitiStatus('ثبت قرارداد انجام نشد: '+e.message));return;}
 beginWinningContract($('kContract').value);
}
function startActualGame(trumpSuit,hidden){
 if(isOnlineKuwaiti()){onlineKuwaitiRpc({type:'select_malzoom',trump_suit:trumpSuit,hidden:!!hidden}).catch(e=>onlineKuwaitiStatus('ثبت حکم ملزوم انجام نشد: '+e.message));return;}
 try{
  if(!game||!game.auctionBid||!Number.isInteger(game.auctionWinner))throw new Error('اطلاعات برنده مزایده ثبت نشده است؛ بازی آغاز نشد.');
  if(!Array.isArray(game.hands)||game.hands.length!==6||game.hands.some(h=>!Array.isArray(h)))throw new Error('کارت‌های شش بازیکن آماده نیستند.');
  const winner=game.auctionWinner;
  // The winning bid is the sole source of truth for the contract in this deal.
  const bidContract=game.isMalzoom?'hokm':String(game.auctionBid.contract||'');
  const noTrumpContracts=['naras','tak_naras','saras'];
  const suitByContract={hokm_spades:'S',hokm_hearts:'H',hokm_diamonds:'D',hokm_clubs:'C'};
  if(!game.isMalzoom&&!noTrumpContracts.includes(bidContract)&&!Object.prototype.hasOwnProperty.call(suitByContract,bidContract))
   throw new Error('نوع قرارداد مزایده نامعتبر است: '+String(bidContract));
  const contract=noTrumpContracts.includes(bidContract)?bidContract:'hokm';
  const resolvedTrump=noTrumpContracts.includes(bidContract)?null:(game.isMalzoom?(trumpSuit||null):suitByContract[bidContract]);
  if(noTrumpContracts.includes(bidContract)&&(trumpSuit||hidden))throw new Error('قرارداد بدون حکم نباید خال حکم یا حکم مخفی داشته باشد.');
  if(!game.isMalzoom&&resolvedTrump!==null&&trumpSuit&&trumpSuit!==resolvedTrump)throw new Error('خال حکم با قرارداد برنده مزایده مغایرت دارد.');
  if(aiTimer){clearTimeout(aiTimer);aiTimer=null;}
  // Establish the human-seat map before handing the first turn to the auction winner.
  if($('kPlayStyle').value!=='hotseat')humanSeats=new Set([0]);
  locked=false;hotseatRevealed=$('kPlayStyle').value!=='hotseat';
  game.waitingResult=false;game.waitingChallenge=false;game.waitingContract=false;
  game.contract=contract;game.selectedContract=bidContract;game.auctionWinner=winner;game.turn=winner;game.leader=winner;
  const openingCards=K.legalCards(game.hands[winner],null,{trickNo:1,isFirstPlay:true,trumpSuit:resolvedTrump,firstTrickNoCut:true});
  if(!openingCards.length)throw new Error('برای برنده مزایده کارت شروع مجاز پیدا نشد.');
  K.startPlay(game,winner,contract,{isMalzoom:!!game.isMalzoom,trumpAnnounced:!hidden,trumpSuit:resolvedTrump});
  game.hiddenTrump=!!hidden;game.trumpSuit=resolvedTrump;game.target=game.auctionBid.target||null;
  if(game.turn!==winner||!Array.isArray(game.trick)||game.trick.length!==0)throw new Error('انتقال نوبت از مزایده به بازی کامل نشد.');
  $('kMalzoomSetup').classList.add('hidden');$('kAuction').classList.add('hidden');$('kHand').classList.remove('k-contract-thinking');
  $('kTrumpDisplay').textContent=game.isMalzoom?(hidden?'حکم مخفی':('ملزوم · '+suitGlyph[resolvedTrump]+' '+suitName[resolvedTrump])):(noTrumpContracts.includes(bidContract)?contractName[bidContract]+' · بدون حکم':contractName[bidContract]+' · '+suitGlyph[resolvedTrump]+' '+suitName[resolvedTrump]);
  markWinningSeatContract(bidContract);
  $('kAuctionSummary').textContent+=' · قرارداد: '+(game.isMalzoom?'ملزوم':contractName[bidContract])+(resolvedTrump?' · '+suitGlyph[resolvedTrump]+' '+suitName[resolvedTrump]:'');
  $('kTrickCards').style.display='';
  $('kStatus').textContent='مزایده تمام شد؛ نوبت اولین کارت: '+playerNames[winner]+(isHumanSeat(winner)?' · کارت‌های بازیکن انسانی پس از نمایش فعال می‌شوند.':' · هوش مصنوعی در حال بازی است.');
  $('kResult').classList.add('hidden');setScreen('game');$('kStatus').classList.remove('hidden');
  renderGame();
  if(isHumanSeat(winner)){
   locked=false;hotseatRevealed=$('kPlayStyle').value!=='hotseat';
   $('kStatus').textContent='نوبت شروع بازی: '+playerNames[winner]+' · یکی از کارت‌های روشن و مجاز را انتخاب کن.';
   renderGame();
  }else{
   locked=false;playAITurn();
  }
 }catch(e){
  locked=true;setScreen('game');$('kStatus').textContent='خطا در شروع بازی پس از مزایده: '+(e&&e.message?e.message:'خطای ناشناخته');
  console.error('Kuwaiti auction-to-play transition failed',e);
 }
}
function auctionTurn(){
 if(!auction)return;
 if(isHumanSeat(auction.current)){renderAuction();renderAuctionHand();return;}
 const p=auction.current;
 setTimeout(()=>{
  if(!auction||auction.current!==p)return;
  const bid=aiBid(p);
  if(bid)submitBid(bid);else submitBid({type:'pass'});
 },500);
}
function aiCardBase(p){
 const trick=game.trick||[],trickNo=game.trickNo,difficulty=$('kDifficulty')?.value||'normal';
 const lead=K.effectiveLeadSuit(trick,{trickNo});
 const visibleTrump=(game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:null;
 const legal=K.legalCards(game.hands[p],lead,{trickNo,isFirstPlay:trick.length===0,trumpSuit:trickNo===1?game.trumpSuit:visibleTrump,firstTrickNoCut:trickNo===1});
 if(!legal.length)throw new Error('هیچ کارت مجازی برای هوش مصنوعی وجود ندارد');
 if(difficulty==='easy')return legal[Math.floor(Math.random()*legal.length)];
 const ownInitial=new Set((game.initialHands&&game.initialHands[p]||game.hands[p]).map(c=>c.id));
 const seen=new Set((game.playedCards||[]).map(x=>x.card.id));
 const unseen=K.deck().filter(c=>!ownInitial.has(c.id)&&!seen.has(c.id));
 const unseenHigher=(card,suit)=>unseen.filter(c=>c.kind==='normal'&&c.suit===suit&&K.normalPower(c,game.contract)>K.normalPower(card,game.contract)).length;
 const cardValue=card=>card.kind==='joker'?(card.color==='red'?55:(trickNo>=5?18:42)):K.normalPower(card,game.contract);
 const playStrength=(card,leadSuit,isLead)=>{
  if(card.kind==='joker'){const v=K.cardPower(card,game.contract,{trickNo,isLead,isMalzoom:game.isMalzoom,trumpAnnounced:game.trumpAnnounced});return v>0?{tier:3,power:v}:{tier:0,power:0};}
  if(visibleTrump&&card.suit===visibleTrump)return {tier:2,power:K.normalPower(card,game.contract)};
  if(leadSuit&&card.suit===leadSuit)return {tier:1,power:K.normalPower(card,game.contract)};
  return {tier:0,power:0};
 };
 const compare=(a,b,leadSuit)=>{const x=playStrength(a.card,leadSuit,a.index===0),y=playStrength(b.card,leadSuit,b.index===0);return x.tier===y.tier?x.power-y.power:x.tier-y.tier;};
 const partialWinner=plays=>{
  if(!plays.length)return null;
  const effective=K.effectiveLeadSuit(plays,{trickNo});
  if(trickNo===9&&K.isJoker(plays[0].card)&&plays.length===1)return null;
  let best={...plays[0],index:0};
  for(let i=1;i<plays.length;i++){const candidate={...plays[i],index:i};if(compare(candidate,best,effective)>0)best=candidate;}
  return best;
 };
 const current=partialWinner(trick);
 const partnerWinning=current&&team(current.player)===team(p);
 const opponentWinning=current&&!partnerWinning;
 const previousLead=game.lastTrick&&game.lastTrick[0]&&game.lastTrick[0].card;
 const previousWinner=Number.isInteger(game.lastWinner)?game.lastWinner:null;
 const partnerLedSuit=game.contract==='hokm'&&previousLead&&previousLead.kind==='normal'&&previousWinner!==null&&team(previousWinner)===team(p)?previousLead.suit:null;
 const holdingPartnerAce=!!partnerLedSuit&&game.hands[p].some(c=>c.kind==='normal'&&c.suit===partnerLedSuit&&c.rank==='A');
 const partnerLastPlay=previousWinner!==null&&game.lastTrick?game.lastTrick.find(x=>x.player===previousWinner):null;
 const partnerVoidInLedSuit=!!partnerLedSuit&&!!partnerLastPlay&&partnerLastPlay.card.kind==='normal'&&partnerLastPlay.card.suit!==partnerLedSuit;
 const baseScores=legal.map(card=>{
  const power=cardValue(card),isJoker=card.kind==='joker';let cost=isJoker?power:power*.9;
  if(card.kind==='normal'&&visibleTrump&&card.suit===visibleTrump)cost+=10;
  if(!trick.length){
   if(partnerLedSuit&&card.kind==='normal'){
    if((holdingPartnerAce||partnerVoidInLedSuit)&&card.suit===partnerLedSuit)cost+=1000;
    else if(!holdingPartnerAce&&!partnerVoidInLedSuit&&card.suit===partnerLedSuit)cost-=35;
   }
   const length=game.hands[p].filter(c=>c.kind==='normal'&&c.suit===card.suit).length,higher=unseenHigher(card,card.suit);
   const control=card.kind==='normal'?(higher===0?18:higher===1?9:0):0,longSuit=length>=3?length*2.2:0,avoidShort=length===1?-5:0;
   return {card,score:cost-(card.kind==='normal'?longSuit+control+avoidShort:-(trickNo===9?0:80))};
  }
  const candidatePlay={player:p,card,index:trick.length},candidateWinner=partialWinner([...trick,candidatePlay]);
  const candidateTakesLead=!current||compare(candidatePlay,current,lead)>0;
  if(partnerWinning)return {card,score:cost+(candidateTakesLead?1000:0)};
  if(opponentWinning)return {card,score:cost-(candidateTakesLead&&candidateWinner&&team(candidateWinner.player)===team(p)?65:0)};
  return {card,score:cost};
 });
 if(difficulty==='normal'){baseScores.sort((a,b)=>a.score-b.score);return baseScores[0].card;}
 const voidSuits=Array.from({length:6},()=>new Set()),groups=new Map();
 for(const entry of (game.playedCards||[])){if(!groups.has(entry.trickNo))groups.set(entry.trickNo,[]);groups.get(entry.trickNo).push(entry);}
 for(const [number,entries] of groups){
  const leadPlayer=entries[0].player;
  entries.sort((a,b)=>((a.player-leadPlayer+6)%6)-((b.player-leadPlayer+6)%6));
  const plays=entries.map(x=>({player:x.player,card:x.card})),suit=K.effectiveLeadSuit(plays,{trickNo:number});
  if(suit)for(const x of entries)if(x.card.kind==='normal'&&x.card.suit!==suit)voidSuits[x.player].add(suit);
 }
 const hardScores=baseScores.map(item=>{
  let score=item.score;
  if(item.card.kind==='normal'){
   const higher=unseenHigher(item.card,item.card.suit),remainingSuit=unseen.filter(c=>c.kind==='normal'&&c.suit===item.card.suit).length;
   if(higher===0)score-=difficulty==='expert'?15:10;
   if(remainingSuit===0)score-=8;
  }
  if(trick.length&&current&&team(current.player)===team(p)){
   const takes=partialWinner([...trick,{player:p,card:item.card,index:trick.length}]);
   if(takes&&team(takes.player)!==team(p))score+=1200;
  }
  return {...item,score};
 });
 if(difficulty==='hard'){hardScores.sort((a,b)=>a.score-b.score);return hardScores[0].card;}
 const simulateCandidate=(candidate,samples)=>{
  let wins=0,total=0;
  for(let sample=0;sample<samples;sample++){
   const seats=Array.from({length:6},(_,i)=>i).filter(seat=>seat!==p),capacities=seats.map(seat=>game.hands[seat].length),pool=unseen.slice();
   let sampled=null;
   for(let attempt=0;attempt<24&&!sampled;attempt++){
    const shuffled=pool.slice();
    for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    const assigned=Array.from({length:6},()=>[]);let offset=0,valid=true;
    for(let si=0;si<seats.length;si++){
     const seat=seats[si],hand=shuffled.slice(offset,offset+capacities[si]);offset+=capacities[si];
     if(hand.some(c=>c.kind==='normal'&&voidSuits[seat].has(c.suit))){valid=false;break;}
     assigned[seat]=hand;
    }
    if(valid)sampled=assigned;
   }
   if(!sampled){sampled=Array.from({length:6},()=>[]);let offset=0;for(let si=0;si<seats.length;si++){sampled[seats[si]]=pool.slice(offset,offset+capacities[si]);offset+=capacities[si];}}
   const plays=trick.map(x=>({player:x.player,card:x.card}));plays.push({player:p,card:candidate});
   let next=(p+1)%6,guard=0;
   while(plays.length<6&&guard++<6){
    if(next===p){next=(next+1)%6;continue;}
    const hand=sampled[next],activeTrump=trickNo===1?game.trumpSuit:(game.trumpSuit&&(game.trumpAnnounced||next===game.auctionWinner)?game.trumpSuit:null);
    const effective=K.effectiveLeadSuit(plays,{trickNo});
    const allowed=K.legalCards(hand,effective,{trickNo,isFirstPlay:plays.length===0,trumpSuit:activeTrump,firstTrickNoCut:trickNo===1});
    if(!allowed.length)break;
    const winnerNow=partialWinner(plays),allyWinning=winnerNow&&team(winnerNow.player)===team(next);
    let chosen=allowed[Math.floor(Math.random()*allowed.length)];
    if(allowed.length>1){
     const ranked=allowed.map(card=>({card,cost:card.kind==='joker'?(card.color==='red'?55:35):K.normalPower(card,game.contract)})).sort((a,b)=>a.cost-b.cost);
     chosen=allyWinning?ranked[0].card:ranked[Math.min(ranked.length-1,Math.floor(Math.random()*Math.min(3,ranked.length)))].card;
    }
    plays.push({player:next,card:chosen});next=(next+1)%6;
   }
   if(plays.length===6){
    const result=K.findTrickWinner(plays,game.contract,{trickNo,isMalzoom:game.isMalzoom,trumpAnnounced:game.trumpAnnounced,trumpSuit:game.trumpSuit});
    if(team(result.player)===team(p))wins++;total++;
   }
  }
  return total?wins/total:0;
 };
 const scored=hardScores.map(item=>({...item,score:item.score-simulateCandidate(item.card,64)*150}));
 scored.sort((a,b)=>a.score-b.score);
 return scored[0].card;
}
function playHumanCard(card){
 if(!game||game.done||locked||!isHumanSeat(game.turn)||($('kPlayStyle').value==='hotseat'&&!hotseatRevealed))return;
 if(isOnlineKuwaiti()){if(game.turn!==onlineKuwaiti.seat)return;onlineKuwaitiRpc({type:'play_card',card_id:card.id}).catch(e=>onlineKuwaitiStatus('ثبت کارت ناموفق بود: '+e.message));return;}
 const p=game.turn;
 const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
 const allowed=K.legalCards(game.hands[p],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trickNo===1?game.trumpSuit:((game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:null),firstTrickNoCut:game.trickNo===1});
 if(!allowed.some(c=>c.id===card.id)){setStatus('این کارت طبق قانون فعلی مجاز نیست.');return;}
 if(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&lead&&!game.hands[p].some(c=>c.kind==='normal'&&c.suit===lead)){
  setStatus('حکم هنوز مخفی است. ابتدا می‌توانی درخواست اعلام حکم بدهی یا بدون درخواست کارت مجاز بازی کنی.');
 }
 hotseatRevealed=false;playOne(p,card);
}
function aiCard(p){
 const chosen=aiCardBase(p),difficulty=$('kDifficulty')?.value||'normal';
 if(difficulty==='easy'||!window.DoubleKoutLearning||typeof window.DoubleKoutLearning.getSuggestion!=='function')return chosen;
 const trick=game.trick||[],trickNo=game.trickNo,lead=K.effectiveLeadSuit(trick,{trickNo});
 const visibleTrump=(game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:(trickNo===1?game.trumpSuit:null);
 const legal=K.legalCards(game.hands[p],lead,{trickNo,isFirstPlay:trick.length===0,trumpSuit:trickNo===1?game.trumpSuit:visibleTrump,firstTrickNoCut:trickNo===1});
 const trumpCount=visibleTrump?game.hands[p].filter(c=>c.kind==='normal'&&c.suit===visibleTrump).length:0;
 const patternLead=trick.length?trick[0].card.suit:null;
 const pattern=['kuwaiti',game.contract||'hokm',trickNo,patternLead||'-',legal.length,trumpCount,0,0].join('|');
 try{return window.DoubleKoutLearning.getSuggestion(pattern,legal,chosen)||chosen;}catch(_){return chosen;}
}
function playOne(p,card,throwOnError=false){
 if(!game||game.done)return false;
 const wasFirst=game.trick.length===0;
 if(window.DoubleKoutLearning&&isHumanSeat(p)){
  const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
  const activeTrump=game.trickNo===1?game.trumpSuit:((game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:null);
  const legalNow=K.legalCards(game.hands[p],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:activeTrump,firstTrickNoCut:game.trickNo===1});
  const own=team(p)==='A';
  window.DoubleKoutLearning.capture({mode:'kuwaiti',playerCount:6,player:p,hand:game.hands[p],legalCards:legalNow,chosen:card,
   plays:game.trick,contract:game.contract||'hokm',trumpSuit:activeTrump,trickNo:game.trickNo,
   ownScore:own?points.A:points.B,opponentScore:own?points.B:points.A,
   target:game.auctionBid&&game.auctionBid.target});
 }

 if(typeof playCardSound==='function')playCardSound();if(p!==0&&typeof speakPlayer==='function')speakPlayer('play',p);
 let res;try{res=K.playCard(game,p,card);}catch(e){setStatus('خطا در اجرای کارت '+playerNames[p]+': '+(e&&e.message?e.message:'نامشخص'));console.error('Kuwaiti playCard failed',e);if(throwOnError)throw e;return false;}
 if(!isHumanSeat(p))setStatus('هوش مصنوعی '+playerNames[p]+' کارت را با موفقیت انداخت.');
 if(wasFirst&&game.trick.length===1)game.lastTrick=[];
 // The live team trick counter occupies this area; do not replace it with a per-card announcement.
 if(res.completed){
  const win=res.winner;
  if(window.DoubleKoutLearning)window.DoubleKoutLearning.complete(win,game.lastTrick,6);if(typeof tone==='function'){tone(590,.09,'sine',.035);tone(790,.12,'triangle',.025,.08);}if(win!==0&&typeof speakPlayer==='function')speakPlayer('win',win);setStatus('دست '+fa(game.trickNo-1)+' را '+playerNames[win]+' برد.');
  if(!game.isMalzoom&&game.auctionBid&&Number.isInteger(game.auctionBid.target)){
   const bidderTeam=team(game.auctionWinner);
   const bidderWon=game.trickWinners.filter(p=>team(p)===bidderTeam).length;
   const opponentWon=game.trickWinners.length-bidderWon;
   const contractState=K.contractProgress(game.auctionBid.target,bidderWon,opponentWon);
   if(contractState){game.done=true;game.earlyContractEnd=true;game.earlyContractState=contractState;}
  }
  renderGame();
  if(game.done){finishGame();return;}
  setTimeout(()=>{if(!game||game.done)return;renderGame();playAITurn()},700);
 }else{renderGame();playAITurn();}
 return true;
}
function cardLabel(c){return c.kind==='joker'?(c.color==='red'?'جوکر قرمز':'جوکر مشکی'):c.rank+' '+suitGlyph[c.suit];}
function playAITurn(){
 if(!game||game.done)return;
 if(isHumanSeat(game.turn))return;
 if(locked){setStatus('توقف نوبت هوش مصنوعی: قفل داخلی بازی فعال است.');return;}
 if(game.waitingResult){setStatus('توقف نوبت هوش مصنوعی: بازی منتظر ثبت نتیجه است.');return;}
 if(aiTimer){setStatus('نوبت '+playerNames[game.turn]+' در صف اجراست؛ منتظر پاسخ هوش مصنوعی…');return;}
 const p=game.turn;setStatus('نوبت هوش مصنوعی: '+playerNames[p]+' · در حال انتخاب و انداختن کارت…');
 try{aiTimer=setTimeout(()=>{
  aiTimer=null;
  if(!game||game.done)return;
  if(game.turn!==p){setStatus('اجرای هوش لغو شد: نوبت بازیکن تغییر کرده است.');return;}
  if(isHumanSeat(game.turn)){setStatus('اجرای هوش لغو شد: نوبت به بازیکن انسانی رسیده است.');return;}
  try{
   const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
   if(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&p!==game.auctionWinner&&lead&&!game.hands[p].some(c=>c.kind==='normal'&&c.suit===lead)){
    game.trumpAnnounced=true;setStatus(playerNames[p]+' خال زمینه را نداشت و حکم مخفی را درخواست کرد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit]);$('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];
   }
   let c;try{c=aiCard(p);}catch(aiError){const allowed=K.legalCards(game.hands[p],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trickNo===1?game.trumpSuit:((game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:null),firstTrickNoCut:game.trickNo===1});c=allowed[0];console.warn('Kuwaiti AI fallback card selected',aiError);}
   if(!c){if(!game||game.done)return;throw new Error('کارت مجاز برای بازیکن '+playerNames[p]+' پیدا نشد');}
   if(!playOne(p,c,true))throw new Error('اجرای کارت هوش مصنوعی ناموفق بود');
  }catch(e){
   if(!game||game.done)return;
   console.error('Kuwaiti AI turn failed; attempting legal fallback',e);
   try{const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});const allowed=K.legalCards(game.hands[p],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trickNo===1?game.trumpSuit:((game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:null),firstTrickNoCut:game.trickNo===1});if(!allowed.length)throw new Error('هیچ کارت مجازی باقی نمانده است');if(!playOne(p,allowed[0],true))throw new Error('اجرای کارت جایگزین ناموفق بود');}
   catch(fallbackError){if(!game||game.done)return;locked=true;const message='خطای نوبت '+playerNames[p]+': '+(fallbackError&&fallbackError.message?fallbackError.message:'نامشخص')+' · بازی متوقف شد.';setStatus(message);$('kTurn').textContent=message;console.error('Kuwaiti AI fallback failed',fallbackError);}
  }
 },550);}catch(scheduleError){aiTimer=null;locked=true;const message='خطا در زمان‌بندی نوبت '+playerNames[p]+': '+(scheduleError&&scheduleError.message?scheduleError.message:'نامشخص');setStatus(message);$('kTurn').textContent=message;console.error(scheduleError);}
}
function renderGame(){
 if(!game)return;
 $('kTable')?.classList.remove('auction-orbit-active');
 const handHost=$('kHand');
 handHost.classList.remove('k-contract-thinking');
 if(handHost.parentElement===document.body){const tools=$('kuwaitiGame')?.querySelector('.k-hand-tools');if(tools)tools.insertAdjacentElement('afterend',handHost);}
 $('kScoreA').textContent=fa(points.A);$('kScoreB').textContent=fa(points.B);$('kGamesWonA').textContent=fa(matchGamesWon.A);$('kGamesWonB').textContent=fa(matchGamesWon.B);
 $('kTrickNo').textContent=fa(Math.min(game.trickNo,9));
 const bidderTeam=Number.isInteger(game.auctionWinner)?team(game.auctionWinner):'A';
 const ownTricks=game.trickWinners.filter(p=>team(p)===bidderTeam).length;
 const opponentTricks=game.trickWinners.length-ownTricks;
 $('kWonA').textContent=fa(ownTricks);$('kWonB').textContent=fa(opponentTricks);
 if($('kTeamTricks'))$('kTeamTricks').textContent='دست‌های گروه جاری: '+fa(ownTricks);
 const currentPlays=game.trick||[];
 const previousPlays=game.lastTrick||[];
 const previousCards=$('kPreviousCards');if(previousCards){previousCards.innerHTML='';previousPlays.forEach((x,i)=>{const card=cardNode(x.card,true);card.classList.add('k-pile-played');const angle=(Math.sin(i*1.73)*13)+'deg';const radius=4+Math.sqrt(i+1)*4;card.style.setProperty('--pile-x',(Math.cos(i*2.3999632297)*radius)+'px');card.style.setProperty('--pile-y',(Math.sin(i*2.3999632297)*radius*.72)+'px');card.style.setProperty('--pile-r',angle);card.style.zIndex=String(i+1);previousCards.append(card);});}
 const centerCards=$('kCenterCards');if(centerCards){centerCards.innerHTML='';currentPlays.forEach((x,i)=>{const card=cardNode(x.card,true);card.classList.add('k-table-played');card.style.setProperty('--play-index',i);centerCards.append(card);});}
 $('kTrickCards').textContent='کارت‌های این دست: '+fa(game.trick.length)+' از ۶';
 $('kTrickCards').style.display='';
 $('kTurn').textContent=game.done?'بازی پایان یافت':('نوبت: '+playerNames[game.turn]);
 for(let p=0;p<6;p++){
  const seat=document.querySelector('.k-seat[data-p="'+p+'"]');
  seat.classList.toggle('active',game.turn===p&&!game.done);
  $('kCount'+p).textContent=fa(game.hands[p].length)+' کارت';
  const teamTricks=game.trickWinners.filter(w=>team(Number(w))===team(p)).length;
  $('kSeatTricks'+p).textContent=fa(teamTricks)+' دست تیم';
  const slot=$('kPlayed'+p);slot.innerHTML='';
  const played=currentPlays.find(x=>x.player===p);
  if(p!==game.turn&&game.hands[p].length&&(isOnlineKuwaiti()?p!==onlineKuwaiti.seat:!($('kPlayStyle').value!=='hotseat'&&p===0))){const fan=document.createElement('div');fan.className='k-opponent-fan';const n=game.hands[p].length;const side=p===1||p===2||p===4||p===5;for(let j=0;j<n;j++){const back=document.createElement('div');back.className='k-card k-back';const offset=j-(n-1)/2;back.style.setProperty('--fan-index',String(j));back.style.setProperty('--fan-count',String(n));back.style.zIndex=String(10+j);const toward=side?Math.abs(offset)*1.25:-Math.abs(offset)*1.25;const angle=offset*(side?5.2:6.2);back.style.transform='translateY('+toward+'px) rotate('+angle+'deg) translateZ('+(Math.max(0,5-Math.abs(offset))*2)+'px)';back.style.marginLeft=j===0?'0':'-54px';back.style.width='62px';back.style.height='93px';back.style.minWidth='62px';back.style.flex='0 0 62px';back.style.transformOrigin='50% 100%';back.style.boxShadow='0 12px 18px #000b, inset 0 0 0 1px #fff6';fan.append(back);}slot.append(fan);}
 }
 $('kHand').innerHTML='';
 const turnPlayer=game.turn;
 const displayPlayer=isOnlineKuwaiti()?onlineKuwaiti.seat:($('kPlayStyle').value==='hotseat'?turnPlayer:0);
 const isTurnHuman=isHumanSeat(turnPlayer),displayHuman=isHumanSeat(displayPlayer),gate=$('kHotseatGate');
 const hideGate=$('kPlayStyle').value==='hotseat'&&isTurnHuman&&!hotseatRevealed&&!game.done;
 gate.classList.toggle('hidden',!hideGate);
 if(hideGate){$('kHotseatTitle').textContent='تحویل گوشی به '+playerNames[turnPlayer];$('kHotseatText').textContent='گوشی را به '+playerNames[turnPlayer]+' بدهید؛ سپس کارت‌ها را نمایش دهید.';}
 const canRevealHand=displayHuman&&($('kPlayStyle').value!=='hotseat'||(displayPlayer===turnPlayer&&hotseatRevealed));
  const displayLead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});const displayLegalCards=isOnlineKuwaiti()?game.hands[displayPlayer].filter(x=>onlineKuwaiti.legalCardIds.includes(x.id)):K.legalCards(game.hands[displayPlayer],displayLead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trickNo===1?game.trumpSuit:((game.trumpAnnounced||displayPlayer===game.auctionWinner)?game.trumpSuit:null),firstTrickNoCut:game.trickNo===1});$('kHand').classList.toggle('k-has-legal-restrictions',displayLegalCards.length<game.hands[displayPlayer].length);
 if(canRevealHand)game.hands[displayPlayer].forEach((c,i,arr)=>{
  const b=document.createElement('button');
  const offset=i-(arr.length-1)/2;
  b.style.transform='rotate('+(offset*4.8)+'deg) translateY('+(Math.abs(offset)*2.4)+'px)';
  b.style.zIndex=String(10+i);
  const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
  const legal=displayPlayer===turnPlayer&&isTurnHuman&&!game.done&&($('kPlayStyle').value!=='hotseat'||hotseatRevealed)&&displayLegalCards.some(x=>x.id===c.id);
  b.disabled=!legal;b.append(cardNode(c));b.onclick=()=>playHumanCard(c);$('kHand').append(b);
 });
 const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
 const currentPlayer=game.turn;
 const currentIsHuman=isHumanSeat(currentPlayer);
 const voidInLead=currentIsHuman&&!!lead&&!game.hands[currentPlayer].some(c=>c.kind==='normal'&&c.suit===lead);
 $('kAskTrump').classList.toggle('hidden',!(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&voidInLead&&game.auctionWinner!==currentPlayer));
 $('kAnnounceTrump').classList.toggle('hidden',!(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&currentIsHuman&&hotseatRevealed&&currentPlayer===game.auctionWinner));
}
function finishGame(){
 if(!game||game.scoreRecorded)return;
 if(aiTimer){clearTimeout(aiTimer);aiTimer=null;}
 game.done=true;locked=true;$('kHotseatGate').classList.add('hidden');
 const bidderTeam=team(game.auctionWinner),won=game.trickWinners.filter(p=>team(p)===bidderTeam).length;
 const opponentWon=game.trickWinners.length-won;
 let resultText='',score=0;
 if(game.isMalzoom){
  $('kResult').classList.remove('hidden');
  $('kResult').innerHTML='<b>نتیجه ملزوم</b><p class="k-small">تعداد دست‌های تیم برنده مزایده: '+fa(won)+' از ۹. با توجه به شرط ملزوم، نتیجه موفقیت را تعیین کن.</p><div class="k-actions"><button id="kMalzoomSuccess">ملزوم موفق · ۵+</button><button id="kMalzoomFail">ملزوم ناموفق · ۵-</button></div>';
  $('kMalzoomSuccess').onclick=()=>applyScore(true,won,bidderTeam);
  $('kMalzoomFail').onclick=()=>applyScore(false,won,bidderTeam);
  resultText='بازی تمام شد؛ نتیجه ملزوم را مشخص کن.';
 }else{
  const target=game.auctionBid.target;
  const maxOpponentTricks=9-target;
  const success=won>=target;
  game.opponentTricks=opponentWon;
  game.maxOpponentTricks=maxOpponentTricks;
  score=K.scoreContract(target,won);
  applyScore(success,won,bidderTeam,score);
  resultText=success
   ?'قرارداد موفق شد؛ تیم برنده مزایده '+fa(won)+' دست گرفت و حریف '+fa(opponentWon)+' دست برد.'
   :'قرارداد ناموفق؛ تیم رقیب '+fa(opponentWon)+' دست گرفت، درحالی‌که حداکثر '+fa(maxOpponentTricks)+' دست مجاز بود. تیم برنده مزایده فقط '+fa(won)+' دست گرفت.';
 }
 setStatus(resultText);renderGame();
}
function applyScore(success,won,bidderTeam,provided){
 if(game.scoreRecorded)return;game.scoreRecorded=true;
 const gameWinner=success?bidderTeam:(bidderTeam==='A'?'B':'A');matchGamesWon[gameWinner]++;
 const val=provided===undefined?K.scoreContract('malzoom',won,{success}):provided;
 playedTricks+=game.trickWinners.length;
 points[bidderTeam]=(Number(points[bidderTeam])||0)+val;
 const matchOver=isMatchOver();
 $('kMatchProgress').textContent='حد امتیاز مسابقه: '+(matchLimit>0?'+':'')+fa(matchLimit)+' · مجموع الف: '+fa(points.A)+' · مجموع ب: '+fa(points.B);
 previousAuctionWinner=game.auctionWinner;
 previousWinningTeam=success?bidderTeam:(bidderTeam==='A'?'B':'A');
 firstGame=false;
 $('kResult').classList.remove('hidden');
 const opponentText=game.opponentTricks===undefined?'':(' · دست‌های تیم رقیب: '+fa(game.opponentTricks));
 const limitText=game.maxOpponentTricks===undefined?'':(' · حداکثر دست مجاز حریف: '+fa(game.maxOpponentTricks));
 $('kResult').innerHTML='<b>'+(success?'قرارداد موفق شد':'قرارداد ناموفق شد')+'</b><p class="k-small">تعداد دست تیم مزایده‌برنده: '+fa(won)+opponentText+limitText+' · امتیاز این بازی: '+(val>0?'+':'')+fa(val)+'</p><p class="k-small">مجموع امتیاز تیم الف: '+fa(points.A)+' · مجموع امتیاز تیم ب: '+fa(points.B)+'</p>';
 $('kNewGame').classList.remove('hidden');
 if(matchOver){$('kNewGame').textContent='شروع مسابقه جدید';$('kResult').innerHTML+='<p class="k-small">مسابقه با رسیدن امتیاز یکی از تیم‌ها به حد انتخابی پایان یافت.</p>';}
 else $('kNewGame').textContent='بازی بعدی';
 renderGame();
 const humanSeat=humanSeats.size===1?Array.from(humanSeats)[0]:-1;const humanTeam=humanSeat>=0?(humanSeat%2===0?'A':'B'):null;
 if(humanTeam&&gameWinner===humanTeam&&window.DoubleKoutProgress){const gameId=game.centralGameId||(game.centralGameId=(window.crypto&&crypto.randomUUID?crypto.randomUUID():('kuwaiti-'+Date.now()+'-'+Math.random().toString(36).slice(2))));window.DoubleKoutProgress.awardLocalWin(gameId,'kuwaiti').then(result=>window.DoubleKoutProgress.showAwardResult(result,'kResult'));}
}
function startNewMatch(){
 if(isOnlineKuwaiti()){
  const st=onlineKuwaiti.state||{};const picker=$('kOnlineNextPicker');
  const action={type:'next_game'};
  if(!st.matchOver){
   if(!picker){onlineKuwaitiStatus('تیم برنده باید نفر اول مزایده را انتخاب کند.');return;}
   action.first_auction_player=Number(picker.value);
   const chosen=(st.seatPlayers||{})[String(action.first_auction_player)];
   if(chosen&&chosen.human===false)action.bot_seat=action.first_auction_player;
  }
  onlineKuwaitiRpc(action).catch(e=>onlineKuwaitiStatus('شروع بازی بعدی انجام نشد: '+e.message));return;
 }
 hotseatRevealed=false;
 if(isMatchOver()){firstGame=true;previousAuctionWinner=null;previousWinningTeam=null;points={A:0,B:0};matchGamesWon={A:0,B:0};playedTricks=0;matchLimit=Number($('kMatchLimit').value)||54;resetSetup();return;}
 locked=false;
 const teamPlayers=previousWinningTeam==='B'?[1,3,5]:[0,2,4];
 const firstPicker=$('kFirstAuction');
 firstPicker.innerHTML=teamPlayers.map(p=>'<option value="'+p+'">'+playerNames[p]+'</option>').join('');
 firstPicker.value=String(teamPlayers[0]);
 $('kNewGame').classList.add('hidden');$('kResult').classList.add('hidden');
 startAuction();
}
function bind(){
 $('kPlayStyle').onchange=()=>{const style=$('kPlayStyle').value;$('kHumanSeatSetup').classList.toggle('hidden',style!=='hotseat');if(style==='online'){openOnlineKuwaiti();$('kHumanSeatSetup').classList.add('hidden');return;}};
 $('kRevealHand').onclick=()=>{if((auction&&isHumanSeat(auction.current))||(game&&isHumanSeat(game.turn)))revealCurrentHuman();};
 $('kSortHand').onclick=()=>{if(!game||game.done)return;const p=isOnlineKuwaiti()?onlineKuwaiti.seat:($('kPlayStyle').value==='hotseat'?game.turn:0);if(!isHumanSeat(p))return;const order={S:0,H:1,D:2,C:3},rank={2:0,3:1,4:2,5:3,6:4,7:5,8:6,9:7,10:8,J:9,Q:10,K:11,A:12};game.hands[p].sort((a,b)=>{if(a.kind==='joker'||b.kind==='joker'){if(a.kind!=='joker')return -1;if(b.kind!=='joker')return 1;return (a.color==='red'?0:1)-(b.color==='red'?0:1);}return (order[a.suit]??9)-(order[b.suit]??9)||(rank[a.rank]??99)-(rank[b.rank]??99);});renderGame();};
 $('modeKuwaiti').onclick=()=>{try{if(window.audioReady)audioReady();if(!initialized&&!init())throw new Error('راه‌اندازی میز کامل نشد');resetSetup();}catch(e){$('modeMessage').textContent='خطا در باز کردن میز شش‌نفره: '+(e&&e.message?e.message:'خطای ناشناخته');console.error(e);}};
 $('kStartAuction').onclick=()=>{if(firstGame){points={A:0,B:0};playedTricks=0;matchLimit=Number($('kMatchLimit').value)||54;$('kMatchProgress').textContent='حد امتیاز مسابقه: '+(matchLimit>0?'+':'')+fa(matchLimit)+' · مجموع الف: ۰ · مجموع ب: ۰';}startAuction();};
 $('kBackModes').onclick=()=>setScreen('modes');
 $('kExit').onclick=()=>{if(isOnlineKuwaiti()){setScreen('modes');window.DoubleKoutOnline.open('kuwaiti');return;}setScreen('modes');};
 $('kNewGame').onclick=()=>startNewMatch();
 $('kPass').onclick=()=>submitBid({type:'pass'});
 document.querySelectorAll('#kAuction [data-bid]').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.bid==='pass')return;
  const n=Number(b.dataset.bid),rank=n===6?1:n===7?2:n===8?3:4;
  submitBid({type:'normal',rank,label:n===9?'باون · ۹ دست':n+' دست',target:n});
 }));
 $('kMalzoom').onclick=()=>submitBid({type:'malzoom',rank:1,label:'ملزوم'});
 $('kContractChoices').addEventListener('click',e=>{const b=e.target.closest('[data-contract]');if(b)setContractChoice(b.dataset.contract);});
 $('kMalzoomChoices').addEventListener('click',e=>{const b=e.target.closest('[data-trump-suit]');if(b)setMalzoomSuit(b.dataset.trumpSuit);});
 $('kConfirmContract').onclick=confirmWinningContract;
 $('kConfirmMalzoom').onclick=()=>startActualGame($('kTrumpSuit').value,$('kHideTrump').checked);
 $('kAskTrump').onclick=()=>{if(isOnlineKuwaiti()){onlineKuwaitiRpc({type:'announce_trump'}).catch(e=>onlineKuwaitiStatus('درخواست اعلام حکم: '+e.message));return;}if(game&&isHumanSeat(game.turn)&&hotseatRevealed){game.trumpAnnounced=true;$('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];setStatus('حکم مخفی اعلام شد.');renderGame();}};
 $('kAnnounceTrump').onclick=()=>{if(isOnlineKuwaiti()){onlineKuwaitiRpc({type:'announce_trump'}).catch(e=>onlineKuwaitiStatus('اعلام حکم: '+e.message));return;}if(game&&isHumanSeat(game.turn)&&hotseatRevealed){game.trumpAnnounced=true;$('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];setStatus('حکم اعلام شد.');renderGame();}};
}
let initialized=false,engineLoading=false;
function loadEngine(){
 if(engineLoading)return;
 engineLoading=true;
 const script=document.createElement('script');
 script.src='./engines/kuwaiti-six-player/engine.js';
 script.onload=()=>{
  engineLoading=false;K=window.KuwaitiSixPlayerEngine;
  if(init())resetSetup();
  else {const msg=$('modeMessage');if(msg)msg.textContent='موتور کوت کویتی بارگذاری شد اما راه‌اندازی رابط کامل نشد.';}
 };
 script.onerror=()=>{
  engineLoading=false;
  const msg=$('modeMessage');if(msg)msg.textContent='فایل موتور کوت کویتی پیدا نشد؛ مسیر engines/kuwaiti-six-player/engine.js را بررسی کن.';
 };
 document.head.appendChild(script);
}
function init(){
 try{
  if(initialized)return true;
  K=window.KuwaitiSixPlayerEngine||K;
  if(!K){const msg=$('modeMessage');if(msg)msg.textContent='در حال بارگذاری موتور کوت کویتی…';loadEngine();return false;}
  if(!$('modeKuwaiti'))throw new Error('دکمه ورود به کوت کویتی در صفحه پیدا نشد');
  addStyle();
  if(!$('kuwaitiSetup')||!$('kuwaitiGame'))setupMarkup();
  bind();initialized=true;
  window.openKuwaitiMode=resetSetup;
  $('modeMessage').textContent='کوت کویتی آماده شروع است.';
  return true;
 }catch(e){
  const msg=$('modeMessage');if(msg)msg.textContent='خطای راه‌اندازی میز شش‌نفره: '+(e&&e.message?e.message:'نامشخص');
  console.error('Kuwaiti UI initialization failed',e);
  return false;
 }
}

window.openKuwaitiMode=function(){
 try{if(!initialized&&!init()){if(engineLoading)return;throw new Error('راه‌اندازی میز کامل نشد');}resetSetup();}
 catch(e){const msg=$('modeMessage');if(msg)msg.textContent='خطا در ورود به کوت کویتی: '+(e&&e.message?e.message:'نامشخص');console.error('Kuwaiti entry failed',e);}
};
// Rebuild only the six-player view after iOS viewport changes so cards never remain in stale layers.
let kuwaitiViewportRaf=0;
function refreshKuwaitiViewport(){
 if(kuwaitiViewportRaf)cancelAnimationFrame(kuwaitiViewportRaf);
 kuwaitiViewportRaf=requestAnimationFrame(()=>{
  kuwaitiViewportRaf=0;
  document.documentElement.style.setProperty('--kuwaiti-vh',(window.visualViewport?window.visualViewport.height:window.innerHeight)+'px');
  if(initialized&&game&&!$('kuwaitiGame').classList.contains('hidden'))renderGame();
 });
}
window.addEventListener('orientationchange',()=>setTimeout(refreshKuwaitiViewport,180),{passive:true});
window.addEventListener('resize',refreshKuwaitiViewport,{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener('resize',refreshKuwaitiViewport,{passive:true});
// This script is loaded after the complete page markup; initialize synchronously.
init();
})();
/* build: 0.8.17 compact auction badges, contract status and online mode normalization */
