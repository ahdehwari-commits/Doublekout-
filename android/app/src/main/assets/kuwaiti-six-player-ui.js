(function(){
'use strict';
const K=window.KuwaitiSixPlayerEngine;
const $=id=>document.getElementById(id);
const suitGlyph={S:'♠',H:'♥',D:'♦',C:'♣'};
const suitName={S:'پیک',H:'دل',D:'خشت',C:'خاج'};
const contractName={naras:'نرس',tak_naras:'تک نرس',saras:'سرس'};
const playerNames=['شما','بازیکن ۲','بازیکن ۳','بازیکن ۴','بازیکن ۵','بازیکن ۶'];
const team=p=>K.teamOf(p);
const fa=n=>String(n).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
let game=null,auction=null,firstGame=true,previousAuctionWinner=null,previousWinningTeam=null;
let points={A:0,B:0},trickView=[],locked=false,aiTimer=null;
function addStyle(){
 const s=document.createElement('style');
 s.textContent=`
 #kuwaitiSetup,#kuwaitiGame{direction:rtl}
 .k-intro{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
 .k-intro div{background:#09271f;border:1px solid #477a68;border-radius:12px;padding:10px;text-align:center;font-size:12px;color:#e8d9ad}
 .k-table{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:auto minmax(110px,auto) auto;gap:6px;align-items:center;text-align:center;border:3px solid #c5a15a;border-radius:22px;padding:8px;background:radial-gradient(ellipse at 50% 48%,#1b7355,#0b3c2d 68%,#06251d);box-shadow:inset 0 0 0 2px #fff2,inset 0 -22px 40px #001b14aa,0 15px 30px #0009}
 .k-seat{min-width:0;background:linear-gradient(145deg,#174d3d,#061c16);border:1px solid #8c9d70;border-radius:12px;padding:6px 3px;box-shadow:0 5px 12px #0008}
 .k-seat.active{outline:2px solid #f3d58c;box-shadow:0 0 18px #f3d58c77}
 .k-seat .k-name{font-size:11px;color:#f4dfaa;font-weight:bold}
 .k-seat .k-count{font-size:10px;color:#c3d6ca;margin:3px}
 .k-played{min-height:48px;display:flex;align-items:center;justify-content:center}
 .k-center{grid-column:2;grid-row:2;min-height:120px;border:1px solid #d7bd7b66;border-radius:15px;background:#031a1488;padding:7px;display:flex;flex-direction:column;justify-content:center;gap:6px}
 .k-seat[data-p="3"]{grid-column:2;grid-row:1}.k-seat[data-p="2"]{grid-column:3;grid-row:1}.k-seat[data-p="4"]{grid-column:1;grid-row:1}
 .k-seat[data-p="0"]{grid-column:2;grid-row:3}.k-seat[data-p="1"]{grid-column:3;grid-row:3}.k-seat[data-p="5"]{grid-column:1;grid-row:3}
 .k-card{width:38px;height:54px;border-radius:7px;background:#fffaf0;color:#17251f;border:1px solid #d8d0bd;box-shadow:0 4px 8px #00140f99;display:flex;flex-direction:column;justify-content:space-between;padding:3px;font:700 13px Georgia,serif;flex-shrink:0}
 .k-card.red{color:#c83d43}.k-card .ksuit{font-size:18px;align-self:center}
 .k-card.joker{font:700 10px Tahoma;background:linear-gradient(145deg,#fff,#e5d8b7);justify-content:center;text-align:center}
 .k-hand{display:flex;justify-content:center;gap:2px;overflow-x:auto;padding:10px 0 14px;direction:ltr}
 .k-hand button{padding:0;background:transparent;border:0;min-width:0}
 .k-hand button:disabled{opacity:.38}
 .k-hand button:not(:disabled) .k-card{outline:2px solid #f0d38a;transform:translateY(-4px)}
 .k-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
 .k-actions button{flex:1;min-width:90px}
 .k-auction{background:#08271f;border:1px solid #a58b54;border-radius:14px;padding:12px;margin:10px 0}
 .k-auction .k-bids{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
 .k-auction button{padding:9px 4px;font-size:12px}
 .k-status{background:#09271f;border:1px solid #477a68;border-radius:12px;padding:10px;margin:8px 0;color:#f8e9bd;font-size:13px;line-height:1.8;min-height:42px}
 .k-score{display:flex;justify-content:space-around;gap:8px;flex-wrap:wrap;background:#09271f;border-radius:12px;padding:10px;margin-bottom:10px;font-size:13px}
 .k-score b{color:#f3d58c;font-size:19px}
 .k-small{font-size:11px;color:#c4d5cd;line-height:1.8}
 .k-select{width:100%;background:#f7f1df;color:#17251f;border-radius:10px;padding:10px;margin:5px 0}
 @media(max-width:520px){.k-card{width:34px;height:49px}.k-table{gap:4px;padding:5px;grid-template-rows:auto minmax(100px,auto) auto}.k-seat{padding:5px 2px}.k-seat .k-name{font-size:10px}.k-center{min-height:100px}.k-intro{grid-template-columns:1fr 1fr 1fr}.k-auction .k-bids{grid-template-columns:repeat(2,1fr)}}
 `;
 document.head.appendChild(s);
}
function cardNode(c,small=false){
 const d=document.createElement('div');
 if(c.kind==='joker'){d.className='k-card joker '+(c.color==='red'?'red':'');d.textContent=c.color==='red'?'جوکر قرمز':'جوکر مشکی';return d;}
 d.className='k-card '+(['H','D'].includes(c.suit)?'red':'');
 d.innerHTML='<span>'+c.rank+'</span><span class="ksuit">'+suitGlyph[c.suit]+'</span><span style="align-self:flex-end;font-size:9px">'+c.rank+'</span>';
 return d;
}
function setStatus(msg){$('kStatus').textContent=msg;}
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
 <div id="kNextPicker" class="hidden"><label>انتخاب نفر اول مزایده توسط تیم برنده بازی قبل</label><select class="k-select" id="kFirstAuction"><option value="0">بازیکن ۱</option><option value="2">بازیکن ۳</option><option value="4">بازیکن ۵</option></select></div>
 <p class="k-small">در بازی اول دارنده ۲ خاج نفر اول مزایده است. در بازی‌های بعدی تیم برنده بازی قبل نفر اول مزایده را انتخاب می‌کند و بازیکن نشسته قبل از برنده مزایده قبلی، ملزوم‌کننده است.</p>
 <div class="k-actions"><button id="kStartAuction">پخش کارت و شروع مزایده</button><button id="kBackModes">بازگشت</button></div>`;
 const g=document.createElement('section');g.className='panel hidden';g.id='kuwaitiGame';
 g.innerHTML=`<h2 class="section-title">کوت کویتی · میز شش‌نفره</h2>
 <div class="k-score"><div>امتیاز تیم شما <b id="kScoreA">۰</b></div><div>امتیاز تیم حریف <b id="kScoreB">۰</b></div><div>دست <b id="kTrickNo">۱</b> از ۹</div></div>
 <div id="kAuction" class="k-auction hidden"><b id="kAuctionTitle">مزایده</b><div class="k-small" id="kAuctionInfo"></div>
 <label>نوع قرارداد</label><select id="kContract" class="k-select"><option value="naras">نرس</option><option value="tak_naras">تک نرس</option><option value="saras">سرس</option></select>
 <div class="k-bids"><button data-bid="pass" id="kPass">پاس</button><button data-bid="6">۶ دست</button><button data-bid="7">۷ دست</button><button data-bid="9">باون · ۹ دست</button></div>
 <button id="kMalzoom" class="primary hidden">ملزوم</button></div>
 <div id="kMalzoomSetup" class="k-auction hidden"><b>تنظیم حکم ملزوم</b><label>خال حکم</label><select id="kTrumpSuit" class="k-select"><option value="S">پیک ♠</option><option value="H">دل ♥</option><option value="D">خشت ♦</option><option value="C">خاج ♣</option></select><label><input type="checkbox" id="kHideTrump" checked> حکم مخفی بماند</label><button id="kConfirmMalzoom" class="primary">تأیید و شروع بازی</button></div>
 <div class="k-table" id="kTable">${[0,1,2,3,4,5].map(p=>'<div class="k-seat" data-p="'+p+'"><div class="k-name" id="kName'+p+'">'+playerNames[p]+'</div><div class="k-count" id="kCount'+p+'">۹ کارت</div><div class="k-played" id="kPlayed'+p+'"></div></div>').join('')}
 <div class="k-center"><div style="color:#f2d998;font-weight:bold">کوت کویتی</div><div id="kTrumpDisplay" style="font-size:25px;color:#f3d58c">بدون حکم</div><div id="kTrickCards" class="k-small">کارت‌های این دست: ۰ از ۶</div><div id="kTurn" class="k-small">در انتظار مزایده</div></div></div>
 <div id="kStatus" class="k-status">کارت‌ها پخش شده‌اند.</div>
 <div class="k-actions"><button id="kAskTrump" class="hidden">درخواست اعلام حکم مخفی</button><button id="kAnnounceTrump" class="hidden">اعلام حکم</button></div>
 <h3 class="section-title">کارت‌های شما</h3><div id="kHand" class="k-hand"></div>
 <div id="kResult" class="k-auction hidden"></div>
 <div class="k-actions"><button id="kNewGame" class="hidden">بازی بعدی</button><button id="kExit">بازگشت به انتخاب بازی</button></div>`;
 $('modePicker').after(s,g);
}
function resetSetup(){
 game=null;auction=null;locked=false;trickView=[];setScreen('setup');
 if(firstGame){$('kNextPicker').classList.add('hidden');}
 else{
  $('kNextPicker').classList.remove('hidden');
  const options=previousWinningTeam==='A'?[0,2,4]:[1,3,5];
  const sel=$('kFirstAuction');sel.innerHTML=options.map(p=>'<option value="'+p+'">'+playerNames[p]+'</option>').join('');
  if(previousWinningTeam==='A')sel.value='0';
 }
}
function startAuction(){
 const firstAuctionPlayer=firstGame?null:Number($('kFirstAuction').value);
 game=K.newGame({firstGame,previousAuctionWinner,firstAuctionPlayer});
 auction={starter:game.auctionStarter,current:game.auctionStarter,highest:null,highestRank:0,highestPlayer:null,passes:0,bids:[],lastBidder:null};
 $('kAuction').classList.remove('hidden');$('kMalzoomSetup').classList.add('hidden');$('kResult').classList.add('hidden');$('kNewGame').classList.add('hidden');
 $('kTrumpDisplay').textContent='در حال مزایده';$('kStatus').textContent='کارت‌ها پخش شدند؛ مزایده از '+playerNames[auction.current]+' آغاز می‌شود.';
 setScreen('game');renderAuction();auctionTurn();
}
function renderAuction(){
 if(!auction)return;
 $('kAuctionTitle').textContent='نوبت مزایده: '+playerNames[auction.current];
 const obligated=game.obligatedPlayer;
 $('kAuctionInfo').textContent='ملزوم‌کننده: '+(obligated===null?'ندارد (بازی اول)':playerNames[obligated])+' · بالاترین پیشنهاد: '+(auction.highest?auction.highest.label:'هنوز پیشنهادی ثبت نشده');
 const isHuman=auction.current===0,forced=auction.passes>=5&&!auction.highest;
 $('kAuction').classList.toggle('hidden',!isHuman);
 if(isHuman){
  $('kPass').disabled=forced;
  $('kPass').textContent=forced?'پاس (غیرمجاز)':'پاس';
  $('kMalzoom').classList.toggle('hidden',obligated!==0);
  [...$('kAuction').querySelectorAll('[data-bid]')].forEach(b=>{const n=b.dataset.bid==='pass'?0:Number(b.dataset.bid);b.disabled=b.dataset.bid!=='pass'&&n<=auction.highestRank;});
 }
}
function handStrength(p){
 const h=game.hands[p];let score=0;
 for(const c of h){if(c.kind==='joker')score+=5;else score+=K.normalPower(c,'saras')/3;}
 return score;
}
function aiBid(p){
 const rank=auction.highestRank,str=handStrength(p);
 if(p===game.obligatedPlayer&&rank===0&&str>22&&Math.random()<.28)return {type:'malzoom',rank:1,label:'ملزوم',contract:randomContract()};
 if(str>25&&rank<3&&Math.random()<.65)return {type:'normal',rank:rank+1,label:rank===0?'۶ دست':rank===1?'۷ دست':'باون · ۹ دست',target:rank===0?6:rank===1?7:9,contract:randomContract()};
 if(auction.passes>=5&&!auction.highest)return {type:'normal',rank:1,label:'۶ دست',target:6,contract:randomContract()};
 return null;
}
function randomContract(){return ['naras','tak_naras','saras'][Math.floor(Math.random()*3)];}
function submitBid(bid){
 if(!auction||locked)return;
 const p=auction.current;
 if(bid.type==='pass'){
  auction.passes++;auction.bids.push({player:p,label:'پاس'});
 }else{
  if(bid.rank<=auction.highestRank)return;
  auction.highest=bid;auction.highestRank=bid.rank;auction.highestPlayer=p;auction.passes=0;auction.lastBidder=p;
  auction.bids.push({player:p,label:bid.label,contract:bid.contract});
 }
 if(auction.passes>=5&&auction.highest){finishAuction();return;}
 if(auction.passes>=5&&!auction.highest){
  const forcedPlayer=(p+1)%6;auction.current=forcedPlayer;
  auction.passes=5;
  if(forcedPlayer!==0){const forcedBid={type:'normal',rank:1,label:'۶ دست',target:6,contract:randomContract()};submitBid(forcedBid);return;}
 }
 auction.current=(p+1)%6;
 renderAuction();auctionTurn();
}
function finishAuction(){
 const win=auction.highestPlayer,bid=auction.highest;
 $('kAuction').classList.add('hidden');
 game.auctionBid=bid;game.auctionWinner=win;game.contract=bid.contract;
 game.isMalzoom=bid.type==='malzoom';
 $('kStatus').textContent='برنده مزایده: '+playerNames[win]+' · '+bid.label+' · قرارداد '+contractName[bid.contract];
 if(game.isMalzoom){
  if(win===0){
   $('kMalzoomSetup').classList.remove('hidden');$('kTrumpDisplay').textContent='حکم مخفی';
   setStatus('خال حکم ملزوم را انتخاب کن و مشخص کن مخفی بماند یا اعلام شود.');
  }else{
   const counts={S:0,H:0,D:0,C:0};game.hands[win].forEach(c=>{if(c.kind==='normal')counts[c.suit]++});
   const suit=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
   startActualGame(suit,true);
  }
 }else startActualGame(null,false);
}
function startActualGame(trumpSuit,hidden){
 K.startPlay(game,game.auctionWinner,game.contract,{isMalzoom:game.isMalzoom,trumpAnnounced:!hidden,trumpSuit});
 game.hiddenTrump=!!hidden;game.trumpSuit=trumpSuit;game.target=game.auctionBid.target||null;
 $('kMalzoomSetup').classList.add('hidden');$('kAuction').classList.add('hidden');
 $('kTrumpDisplay').textContent=game.isMalzoom?(hidden?'حکم مخفی':'حکم: '+suitGlyph[trumpSuit]+' '+suitName[trumpSuit]):'بدون حکم';
 $('kStatus').textContent='بازی آغاز شد. '+playerNames[game.turn]+' اولین کارت را بازی می‌کند.';
 renderGame();playAITurn();
}
function auctionTurn(){
 if(!auction)return;
 if(auction.current===0){renderAuction();return;}
 const p=auction.current;
 setTimeout(()=>{
  if(!auction||auction.current!==p)return;
  const bid=aiBid(p);
  if(bid)submitBid(bid);else submitBid({type:'pass'});
 },500);
}
function aiCard(p){
 const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
 const legal=K.legalCards(game.hands[p],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trumpSuit});
 const power=c=>c.kind==='joker'?K.cardPower(c,game.contract,{trickNo:game.trickNo,isLead:game.trick.length===0,isMalzoom:game.isMalzoom,trumpAnnounced:game.trumpAnnounced}):K.normalPower(c,game.contract);
 const sorted=[...legal].sort((a,b)=>power(a)-power(b));
 const current=game.trick.length?game.trick.reduce((best,x)=>power(x.card)>power(best.card)?x:best,null):null;
 if(!current)return sorted[Math.floor(sorted.length*.55)]||legal[0];
 const winning=sorted.filter(c=>power(c)>power(current.card));
 return winning.length?winning[0]:sorted[0];
}
function playHumanCard(card){
 if(!game||game.done||locked||game.turn!==0)return;
 const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
 const allowed=K.legalCards(game.hands[0],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trumpSuit});
 if(!allowed.some(c=>c.id===card.id)){setStatus('این کارت طبق قانون فعلی مجاز نیست.');return;}
 if(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&lead&&!game.hands[0].some(c=>c.kind==='normal'&&c.suit===lead)){
  setStatus('حکم هنوز مخفی است. ابتدا می‌توانی درخواست اعلام حکم بدهی یا بدون درخواست کارت مجاز بازی کنی.');
 }
 playOne(0,card);
}
function playOne(p,card){
 if(!game||game.done)return;
 const wasFirst=game.trick.length===0;
 const res=K.playCard(game,p,card);
 if(wasFirst&&game.trick.length===1)game.lastTrick=[];
 $('kStatus').textContent=playerNames[p]+' کارت '+cardLabel(card)+' را بازی کرد.';
 if(res.completed){
  const win=res.winner;setStatus('دست '+fa(game.trickNo-1)+' را '+playerNames[win]+' برد.');
  renderGame();
  if(game.done){finishGame();return;}
  setTimeout(()=>{renderGame();playAITurn()},700);
 }else{renderGame();playAITurn();}
}
function cardLabel(c){return c.kind==='joker'?(c.color==='red'?'جوکر قرمز':'جوکر مشکی'):c.rank+' '+suitGlyph[c.suit];}
function playAITurn(){
 if(!game||game.done||game.turn===0||locked||game.waitingResult)return;
 const p=game.turn;
 setTimeout(()=>{
  if(!game||game.done||game.turn!==p)return;
  const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
  if(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&lead&&!game.hands[p].some(c=>c.kind==='normal'&&c.suit===lead)){
   game.trumpAnnounced=true;setStatus(playerNames[p]+' خال زمینه را نداشت و حکم مخفی را درخواست کرد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit]);
   $('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];
  }
  const c=aiCard(p);playOne(p,c);
 },550);
}
function renderGame(){
 if(!game)return;
 $('kScoreA').textContent=fa(points.A);$('kScoreB').textContent=fa(points.B);
 $('kTrickNo').textContent=fa(Math.min(game.trickNo,9));
 const currentPlays=game.trick.length?game.trick:(game.lastTrick||[]);
 $('kTrickCards').textContent='کارت‌های این دست: '+fa(game.trick.length)+' از ۶';
 $('kTurn').textContent=game.done?'بازی پایان یافت':('نوبت: '+playerNames[game.turn]);
 for(let p=0;p<6;p++){
  const seat=document.querySelector('.k-seat[data-p="'+p+'"]');
  seat.classList.toggle('active',game.turn===p&&!game.done);
  $('kCount'+p).textContent=fa(game.hands[p].length)+' کارت';
  const slot=$('kPlayed'+p);slot.innerHTML='';
  const played=currentPlays.find(x=>x.player===p);
  if(played)slot.append(cardNode(played.card,true));
  else if(p!==0&&game.hands[p].length){const back=document.createElement('div');back.className='k-card';back.style.background='repeating-linear-gradient(45deg,#173e69,#173e69 5px,#e4d6ad 5px,#e4d6ad 7px)';back.style.border='2px solid #f4e7c4';back.textContent='DK';slot.append(back);}
 }
 $('kHand').innerHTML='';
 game.hands[0].forEach(c=>{
  const b=document.createElement('button');
  const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
  const legal=game.turn===0&&!game.done&&K.legalCards(game.hands[0],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trumpSuit}).some(x=>x.id===c.id);
  b.disabled=!legal;b.append(cardNode(c));b.onclick=()=>playHumanCard(c);$('kHand').append(b);
 });
 const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
 const voidInLead=game.turn===0&&lead&&!game.hands[0].some(c=>c.kind==='normal'&&c.suit===lead);
 $('kAskTrump').classList.toggle('hidden',!(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&voidInLead));
 $('kAnnounceTrump').classList.toggle('hidden',!(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&game.turn===0&&game.auctionWinner===0));
}
function finishGame(){
 game.done=true;locked=true;
 const bidderTeam=team(game.auctionWinner),won=game.trickWinners.filter(p=>team(p)===bidderTeam).length;
 let resultText='',score=0;
 if(game.isMalzoom){
  $('kResult').classList.remove('hidden');
  $('kResult').innerHTML='<b>نتیجه ملزوم</b><p class="k-small">تعداد دست‌های تیم برنده مزایده: '+fa(won)+' از ۹. با توجه به شرط ملزوم، نتیجه موفقیت را تعیین کن.</p><div class="k-actions"><button id="kMalzoomSuccess">ملزوم موفق · ۵+</button><button id="kMalzoomFail">ملزوم ناموفق · ۵-</button></div>';
  $('kMalzoomSuccess').onclick=()=>applyScore(true,won,bidderTeam);
  $('kMalzoomFail').onclick=()=>applyScore(false,won,bidderTeam);
  resultText='بازی تمام شد؛ نتیجه ملزوم را مشخص کن.';
 }else{
  const target=game.auctionBid.target;
  const success=won>=target;
  score=K.scoreContract(target,won);
  applyScore(success,won,bidderTeam,score);
  resultText='تیم برنده مزایده '+fa(won)+' دست گرفت؛ هدف '+fa(target)+' دست بود. '+(success?'قرارداد موفق شد.':'قرارداد انجام نشد.');
 }
 setStatus(resultText);renderGame();
}
function applyScore(success,won,bidderTeam,provided){
 const val=provided===undefined?K.scoreContract('malzoom',won,{success}):provided;
 points[bidderTeam]+=val;
 previousAuctionWinner=game.auctionWinner;
 previousWinningTeam=success?bidderTeam:(bidderTeam==='A'?'B':'A');
 firstGame=false;
 $('kResult').classList.remove('hidden');
 $('kResult').innerHTML='<b>'+(success?'قرارداد موفق شد':'قرارداد ناموفق شد')+'</b><p class="k-small">تعداد دست تیم مزایده‌برنده: '+fa(won)+' · امتیاز این بازی: '+(val>0?'+':'')+fa(val)+'</p>';
 $('kNewGame').classList.remove('hidden');$('kNewGame').textContent='بازی بعدی';
 renderGame();
}
function startNewMatch(){
 locked=false;resetSetup();
}
function bind(){
 $('modeKuwaiti').onclick=()=>{if(window.audioReady)audioReady();resetSetup();};
 $('kStartAuction').onclick=()=>{if(firstGame)points={A:0,B:0};startAuction();};
 $('kBackModes').onclick=()=>setScreen('modes');
 $('kExit').onclick=()=>setScreen('modes');
 $('kNewGame').onclick=()=>startNewMatch();
 $('kPass').onclick=()=>submitBid({type:'pass'});
 document.querySelectorAll('#kAuction [data-bid]').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.bid==='pass')return;
  const n=Number(b.dataset.bid),rank=n===6?1:n===7?2:3;
  submitBid({type:'normal',rank,label:n===9?'باون · ۹ دست':n+' دست',target:n,contract:$('kContract').value});
 }));
 $('kMalzoom').onclick=()=>submitBid({type:'malzoom',rank:auction.highestRank+1,label:'ملزوم',contract:$('kContract').value});
 $('kConfirmMalzoom').onclick=()=>startActualGame($('kTrumpSuit').value,$('kHideTrump').checked);
 $('kAskTrump').onclick=()=>{if(game){game.trumpAnnounced=true;$('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];setStatus('حکم مخفی اعلام شد.');renderGame();}};
 $('kAnnounceTrump').onclick=()=>{if(game){game.trumpAnnounced=true;$('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];setStatus('حکم اعلام شد.');renderGame();}};
}
function init(){
 if(!K||!$('modeKuwaiti'))return;
 addStyle();setupMarkup();bind();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();