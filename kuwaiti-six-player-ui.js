(function(){
'use strict';
let K=window.KuwaitiSixPlayerEngine;
const $=id=>document.getElementById(id);
const suitGlyph={S:'♠',H:'♥',D:'♦',C:'♣'};
const suitName={S:'پیک',H:'دل',D:'خشت',C:'گشنیز'};
const contractName={hokm_spades:'پیک',hokm_hearts:'دل',hokm_diamonds:'خشت',hokm_clubs:'گشنیز',naras:'نرس',tak_naras:'تک نرس',saras:'سرس',hokm:'حکم',malzoom:'ملزوم'};
const playerNames=['شما','بازیکن ۲','بازیکن ۳','بازیکن ۴','بازیکن ۵','بازیکن ۶'];
const team=p=>K.teamOf(p);
const fa=n=>String(n).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
let game=null,auction=null,firstGame=true,previousAuctionWinner=null,previousWinningTeam=null,humanSeats=new Set([0]),hotseatRevealed=false;
let points={A:0,B:0},trickView=[],locked=false,aiTimer=null,matchLimit=54,playedTricks=0;
function addStyle(){
 const s=document.createElement('style');
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
 .k-live-tricks{display:flex;justify-content:space-around;gap:8px;background:#09271f;border:1px solid #477a68;border-radius:12px;padding:8px;margin:8px 0;color:#f4dfaa;font-size:13px;font-weight:bold}
 .k-contract-setup{background:#0a3026;border:1px solid #d3b76e;border-radius:14px;padding:12px;margin:10px 0}
 .k-auction .k-bids{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}
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
 if(c.kind==='joker'){
  const red=c.color==='red',tone=red?'#ff303d':'#aeb7c8',deep=red?'#58000b':'#080b18',label=red?'RED JOKER':'BLACK JOKER';
  d.className='k-card joker '+(red?'red':'black');
  d.innerHTML='<span class="joker-title">'+label+'</span><svg class="joker-art" viewBox="0 0 100 112" role="img" aria-label="'+label+'"><defs><linearGradient id="jbg'+(red?'r':'b')+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+tone+'"/><stop offset="1" stop-color="'+deep+'"/></linearGradient><radialGradient id="jface'+(red?'r':'b')+'"><stop stop-color="'+(red?'#ff8a78':'#b8bdcc')+'"/><stop offset="1" stop-color="'+(red?'#9d0719':'#242938')+'"/></radialGradient></defs><path d="M12 105 L17 20 Q50 -2 83 20 L88 105Z" fill="url(#jbg'+(red?'r':'b')+')" stroke="'+tone+'" stroke-width="2"/><path d="M25 34 Q8 5 7 4 Q30 7 39 26 M75 34 Q92 5 93 4 Q70 7 61 26" fill="'+tone+'" stroke="'+deep+'" stroke-width="3"/><path d="M24 48 Q50 26 76 48 L70 78 Q50 96 30 78Z" fill="url(#jface'+(red?'r':'b')+')" stroke="'+tone+'" stroke-width="2"/><path d="M30 52 L45 57 L36 64Z M70 52 L55 57 L64 64Z" fill="#fff1c9"/><path d="M34 75 Q50 91 66 75 Q50 82 34 75" fill="#21050a" stroke="#fff1c9" stroke-width="2"/><path d="M78 30 L78 91 M70 38 L86 38 M78 30 L70 23 M78 30 L86 23" stroke="#f4d78a" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M72 91 L84 91" stroke="#f4d78a" stroke-width="3" stroke-linecap="round"/></svg><span class="joker-caption">DOUBLE KOUT</span>';
  return d;
 }
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
 <label>شیوه بازی</label><select class="k-select" id="kPlayStyle"><option value="ai">یک بازیکن انسانی در برابر هوش مصنوعی</option><option value="hotseat">بازی چندنفره واقعی با یک گوشی</option></select><div id="kHumanSeatSetup"><label>انتخاب صندلی بازیکنان انسانی؛ صندلی‌های خالی با هوش مصنوعی پر می‌شوند</label><div id="kHumanSeatChoices" class="k-actions"></div><p class="k-small">تغییر صندلی‌ها فقط هنگام شروع بازی جدید امکان‌پذیر است.</p></div><label>پایان مسابقه پس از چند دست؟</label><select class="k-select" id="kMatchLimit"><option value="54">۵۴ دست</option><option value="108">۱۰۸ دست</option></select>
 <div class="k-small" id="kMatchProgress">۰ از ۵۴ دست انجام شده</div>
 <div id="kNextPicker" class="hidden"><label>انتخاب نفر اول مزایده توسط تیم برنده بازی قبل</label><select class="k-select" id="kFirstAuction"><option value="0">بازیکن ۱</option><option value="2">بازیکن ۳</option><option value="4">بازیکن ۵</option></select></div>
 <p class="k-small">در بازی اول دارنده ۲ خاج نفر اول مزایده است. در بازی‌های بعدی تیم برنده بازی قبل نفر اول مزایده را انتخاب می‌کند و بازیکن نشسته قبل از برنده مزایده قبلی، ملزوم‌کننده است.</p>
 <div class="k-actions"><button id="kStartAuction">پخش کارت و شروع مزایده</button><button id="kBackModes">بازگشت</button></div>`;
 const g=document.createElement('section');g.className='panel hidden';g.id='kuwaitiGame';
 g.innerHTML=`<h2 class="section-title">کوت کویتی · میز شش‌نفره</h2>
 <div class="k-score"><div>امتیاز تیم شما <b id="kScoreA">۰</b></div><div>امتیاز تیم حریف <b id="kScoreB">۰</b></div><div>دست <b id="kTrickNo">۱</b> از ۹</div></div>
 <div id="kAuction" class="k-auction hidden"><b id="kAuctionTitle">مزایده</b><div class="k-small" id="kAuctionInfo"></div><div class="k-small" id="kAuctionLog"></div>
 <div id="kHumanAuctionControls">
 <div class="k-bids"><button data-bid="pass" id="kPass">پاس</button><button data-bid="6">۶</button><button data-bid="7">۷</button><button data-bid="8">۸</button><button data-bid="9">۹</button></div>
 <button id="kMalzoom" class="primary hidden">ملزوم</button></div></div>
 <div id="kAuctionSummary" class="k-auction-summary hidden">نتیجه مزایده هنوز مشخص نشده است.</div>
 <div id="kContractSetup" class="k-contract-setup hidden"><b>انتخاب قرارداد پس از پایان مزایده</b><label>نوع بازی و خال حکم</label><select id="kContract" class="k-select"><option value="hokm_spades">پیک ♠ · حکم‌دار</option><option value="hokm_hearts">دل ♥ · حکم‌دار</option><option value="hokm_diamonds">خشت ♦ · حکم‌دار</option><option value="hokm_clubs">گشنیز ♣ · حکم‌دار</option><option value="naras">نرس · بدون حکم</option><option value="tak_naras">تک نرس · بدون حکم</option><option value="saras">سرس · بدون حکم</option></select><button id="kConfirmContract" class="primary">تأیید قرارداد و شروع بازی</button></div>
 <div id="kMalzoomSetup" class="k-auction hidden"><b>تنظیم حکم ملزوم</b><label>خال حکم</label><select id="kTrumpSuit" class="k-select"><option value="S">پیک ♠</option><option value="H">دل ♥</option><option value="D">خشت ♦</option><option value="C">گشنیز ♣</option></select><label><input type="checkbox" id="kHideTrump" checked> حکم مخفی بماند</label><button id="kConfirmMalzoom" class="primary">تأیید و شروع بازی</button></div>
 <div class="k-table" id="kTable">${[0,1,2,3,4,5].map(p=>'<div class="k-seat" data-p="'+p+'"><div class="k-name" id="kName'+p+'">'+playerNames[p]+'</div><div class="k-count" id="kCount'+p+'">۹ کارت</div><div class="k-played" id="kPlayed'+p+'"></div></div>').join('')}
 <div class="k-center"><div style="color:#f2d998;font-weight:bold">کوت کویتی</div><div id="kTrumpDisplay" style="font-size:25px;color:#f3d58c">بدون حکم</div><div id="kTrickCards" class="k-small">کارت‌های این دست: ۰ از ۶</div><div id="kTurn" class="k-small">در انتظار مزایده</div></div></div>
 <div class="k-live-tricks" id="kLiveTricks"><span>دست‌های برده تیم شما: <b id="kWonA">۰</b></span><span>دست‌های برده حریف: <b id="kWonB">۰</b></span></div>
 <div id="kStatus" class="k-status hidden">وضعیت بازی</div>
 <div class="k-actions"><button id="kAskTrump" class="hidden">درخواست اعلام حکم مخفی</button><button id="kAnnounceTrump" class="hidden">اعلام حکم</button></div>
 <h3 class="section-title">کارت‌های شما</h3><div id="kHand" class="k-hand"></div>
 <div id="kResult" class="k-auction hidden"></div>
 <div id="kHotseatGate" class="k-auction hidden"><b id="kHotseatTitle">تحویل گوشی</b><p class="k-small" id="kHotseatText">گوشی را به بازیکن بعدی بدهید.</p><button id="kRevealHand" class="primary">کارت‌ها را نمایش بده</button></div><div class="k-actions"><button id="kNewGame" class="hidden">بازی بعدی</button><button id="kExit">بازگشت به انتخاب بازی</button></div>`;
 $('modePicker').insertAdjacentElement('afterend',s);s.insertAdjacentElement('afterend',g);
}
function renderHumanSeatChoices(){const host=$('kHumanSeatChoices');if(!host)return;host.innerHTML='';for(let p=0;p<6;p++){const l=document.createElement('label');l.style.cssText='display:flex;align-items:center;gap:5px;background:#09271f;border:1px solid #477a68;border-radius:9px;padding:7px;color:#f4dfaa;font-size:11px';const c=document.createElement('input');c.type='checkbox';c.value=String(p);c.checked=p===0;c.addEventListener('change',()=>{if(!host.querySelector('input:checked'))c.checked=true;});l.append(c,document.createTextNode('صندلی '+fa(p+1)));host.append(l);}}
function isHumanSeat(p){return humanSeats.has(p);}
function revealCurrentHuman(){hotseatRevealed=true;$('kHotseatGate').classList.add('hidden');if(auction){renderAuction();renderAuctionHand();}else renderGame();}
function resetSetup(){
 if(aiTimer){clearTimeout(aiTimer);aiTimer=null;}
 game=null;auction=null;locked=false;trickView=[];hotseatRevealed=false;$('kHotseatGate')?.classList.add('hidden');
 $('kAuction').classList.add('hidden');$('kAuctionSummary').classList.add('hidden');$('kContractSetup').classList.add('hidden');$('kMalzoomSetup').classList.add('hidden');$('kResult').classList.add('hidden');$('kNewGame').classList.add('hidden');
 $('kHand').innerHTML='';$('kTrumpDisplay').textContent='بدون حکم';$('kTrickCards').textContent='کارت‌های این دست: ۰ از ۶';$('kTurn').textContent='در انتظار مزایده';$('kStatus').textContent='میز پاک و آماده بازی جدید است.';
 for(let p=0;p<6;p++){$('kPlayed'+p).innerHTML='';$('kCount'+p).textContent='۹ کارت';$('kSeat'+p)?.classList?.remove('active');}
 if(firstGame){playedTricks=0;matchLimit=Number($('kMatchLimit').value)||54;}
 $('kMatchProgress').textContent=fa(playedTricks)+' از '+fa(matchLimit)+' دست انجام شده';
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
 if(playedTricks>=matchLimit){setStatus('مسابقه به پایان رسیده است.');return;}
 locked=false;
 // Clear every visual trace from the previous deal before dealing a fresh 54-card deck.
 $('kHand').innerHTML='';$('kResult').classList.add('hidden');$('kNewGame').classList.add('hidden');$('kTrickCards').textContent='کارت‌های این دست: ۰ از ۶';
 for(let p=0;p<6;p++){$('kPlayed'+p).innerHTML='';$('kCount'+p).textContent='۹ کارت';}
 const firstAuctionPlayer=firstGame?null:Number($('kFirstAuction').value);
 // Do not allow a prior deal's contract or trump display to leak into the new auction.
 $('kTrumpDisplay').textContent='در انتظار مزایده';$('kContract').value='hokm_spades';$('kAuctionSummary').classList.add('hidden');$('kContractSetup').classList.add('hidden');$('kWonA').textContent='۰';$('kWonB').textContent='۰';
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
 const isHuman=isHumanSeat(auction.current),forced=auction.passes>=5&&!auction.highest;
 $('kAuctionTitle').textContent='نوبت مزایده: '+playerNames[auction.current]+(isHuman?' · نوبت شما':' · هوش مصنوعی در حال تصمیم‌گیری');
 const obligated=game.obligatedPlayer;
 $('kAuctionInfo').textContent='ملزوم‌کننده: '+(obligated===null?'نامشخص':playerNames[obligated])+' · بالاترین پیشنهاد: '+(auction.highest?playerNames[auction.highestPlayer]+' · '+auction.highest.label:'هنوز پیشنهادی ثبت نشده')+' · پاس‌های پیاپی: '+auction.passes+' از ۵';
 $('kAuctionSummary').classList.remove('hidden');
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
 $('kAuction').classList.remove('hidden');
 $('kHumanAuctionControls').classList.toggle('hidden',!isHuman||!hotseatRevealed);
 const gate=$('kHotseatGate');if(isHuman&&!hotseatRevealed){gate.classList.remove('hidden');$('kHotseatTitle').textContent='تحویل گوشی به '+playerNames[auction.current];$('kHotseatText').textContent='گوشی را به '+playerNames[auction.current]+' بدهید؛ سپس کارت‌های مزایده را نمایش دهید.';}else if(!isHuman)gate.classList.add('hidden');
 if(isHuman){
  $('kPass').disabled=forced;
  $('kPass').textContent=forced?'پاس (غیرمجاز؛ باید پیشنهاد بدهی)':'پاس';
  $('kMalzoom').classList.toggle('hidden',obligated!==auction.current||!!auction.highest);
  [...$('kAuction').querySelectorAll('[data-bid]')].forEach(b=>{
   const n=b.dataset.bid==='pass'?0:Number(b.dataset.bid);
   b.disabled=b.dataset.bid!=='pass'&&n<=auction.highestRank;
  });
 }
 renderAuctionHand();
}
function renderAuctionHand(){
 if(!game||!game.hands)return;
 $('kHand').innerHTML='';const p=auction?auction.current:game.turn;
 const gate=$('kHotseatGate'),hide=isHumanSeat(p)&&!hotseatRevealed;gate.classList.toggle('hidden',!!hide);if(hide){$('kHotseatTitle').textContent='تحویل گوشی به '+playerNames[p];$('kHotseatText').textContent='گوشی را به '+playerNames[p]+' بدهید؛ سپس کارت‌ها را نمایش دهید.';}
 if(!isHumanSeat(p)||hide)return;
 game.hands[p].forEach(c=>{
  const card=document.createElement('div');
  card.className='k-auction-card';
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
 const rank=auction.highestRank,str=handStrength(p);
 if(p===game.obligatedPlayer&&!auction.highest&&str>22)return {type:'malzoom',rank:1,label:'ملزوم'};
 if(rank<4){const next=rank+1,target=next===4?9:5+next,threshold=[0,15.5,20.5,25.5,30][next];if(str>=threshold)return {type:'normal',rank:next,label:String(target),target};}
 if(auction.passes>=5&&!auction.highest)return {type:'normal',rank:1,label:'۶',target:6};
 return null;
}
function submitBid(bid){
 if(!auction||locked)return;
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
 const win=auction.highestPlayer,bid={...auction.highest};
 // Once the auction closes, remove every PASS/bid marker and retain only the
 // winning contract value on the winning player's seat.
 document.querySelectorAll('.k-seat').forEach(el=>{
  el.querySelector('.k-bid-chip')?.remove();
  el.classList.remove('auction-winner');
  el.classList.remove('active');
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
 auction=null; // Auction is closed; subsequent phone handoffs belong to the active game turn.
 if(game.isMalzoom){
  game.contract='hokm';
  $('kStatus').textContent='برنده مزایده: '+playerNames[win]+' · ملزوم';
  if(isHumanSeat(win)){
   $('kMalzoomSetup').classList.remove('hidden');$('kTrumpDisplay').textContent='انتخاب حکم ملزوم';
   setStatus('خال حکم ملزوم را انتخاب کن و مشخص کن مخفی بماند یا اعلام شود.');
  }else{
   const counts={S:0,H:0,D:0,C:0};game.hands[win].forEach(c=>{if(c.kind==='normal')counts[c.suit]++});
   const suit=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
   startActualGame(suit,true);
  }
  return;
 }
 if(isHumanSeat(win)){
  $('kContractSetup').classList.remove('hidden');
  $('kContract').value='hokm_spades';
  $('kTrumpDisplay').textContent='منتظر انتخاب قرارداد';
  setStatus('مزایده را بردی؛ اکنون نوع قرارداد و خال حکم را انتخاب کن.');
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
function beginWinningContract(contract){
 game.auctionBid.contract=contract;game.selectedContract=contract;
 const noTrump=['naras','tak_naras','saras'].includes(contract);
 const trumpSuit=noTrump?null:({hokm_spades:'S',hokm_hearts:'H',hokm_diamonds:'D',hokm_clubs:'C'})[contract];
 game.contract=noTrump?contract:'hokm';game.trumpSuit=trumpSuit;
 $('kContractSetup').classList.add('hidden');
 $('kStatus').textContent='برنده مزایده: '+playerNames[game.auctionWinner]+' · '+game.auctionBid.label+' · قرارداد: '+contractName[contract];
 startActualGame(trumpSuit,false);
}
function confirmWinningContract(){
 if(!game||!game.auctionBid||!isHumanSeat(game.auctionWinner))return;
 beginWinningContract($('kContract').value);
}
function startActualGame(trumpSuit,hidden){
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
  locked=false;game.contract=contract;game.selectedContract=bidContract;game.turn=winner;game.leader=winner;
  K.startPlay(game,winner,contract,{isMalzoom:!!game.isMalzoom,trumpAnnounced:!hidden,trumpSuit:resolvedTrump});
  game.hiddenTrump=!!hidden;game.trumpSuit=resolvedTrump;game.target=game.auctionBid.target||null;
  if(game.turn!==winner||!Array.isArray(game.trick)||game.trick.length!==0)throw new Error('انتقال نوبت از مزایده به بازی کامل نشد.');
  $('kMalzoomSetup').classList.add('hidden');$('kAuction').classList.add('hidden');
  $('kTrumpDisplay').textContent=game.isMalzoom?(hidden?'حکم مخفی':('حکم اعلام‌شده: '+suitGlyph[resolvedTrump]+' '+suitName[resolvedTrump])):(noTrumpContracts.includes(bidContract)?'بدون حکم · '+contractName[bidContract]:'حکم این بازی: '+suitGlyph[resolvedTrump]+' '+suitName[resolvedTrump]);
  $('kAuctionSummary').textContent+=' · قرارداد: '+(game.isMalzoom?'ملزوم':contractName[bidContract])+(resolvedTrump?' · '+suitGlyph[resolvedTrump]+' '+suitName[resolvedTrump]:'');
  $('kTrickCards').style.display='';
  $('kStatus').textContent='مزایده تمام شد؛ نوبت اولین کارت: '+playerNames[winner]+(isHumanSeat(winner)?' · کارت‌های بازیکن انسانی پس از نمایش فعال می‌شوند.':' · هوش مصنوعی در حال بازی است.');
  $('kResult').classList.add('hidden');setScreen('game');renderGame();
  if(!isHumanSeat(winner))playAITurn();else renderGame();
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
function aiCard(p){
 const trick=game.trick||[],trickNo=game.trickNo;
 const lead=K.effectiveLeadSuit(trick,{trickNo});
 const visibleTrump=(game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:null;
 const legal=K.legalCards(game.hands[p],lead,{trickNo,isFirstPlay:trick.length===0,trumpSuit:trickNo===1?game.trumpSuit:visibleTrump,firstTrickNoCut:trickNo===1});
 if(!legal.length)throw new Error('هیچ کارت مجازی برای هوش مصنوعی وجود ندارد');
 const ownInitial=new Set((game.initialHands&&game.initialHands[p]||game.hands[p]).map(c=>c.id));
 const seen=new Set((game.playedCards||[]).map(x=>x.card.id));
 const unseen=K.deck().filter(c=>!ownInitial.has(c.id)&&!seen.has(c.id));
 const unseenHigher=(card,suit)=>unseen.filter(c=>c.kind==='normal'&&c.suit===suit&&K.normalPower(c,game.contract)>K.normalPower(card,game.contract)).length;
 const cardValue=card=>card.kind==='joker'?(card.color==='red'?55:(trickNo>=5?18:42)):K.normalPower(card,game.contract);
 const playStrength=(card,leadSuit,isLead)=>{
  if(card.kind==='joker'){
   const v=K.cardPower(card,game.contract,{trickNo,isLead,isMalzoom:game.isMalzoom,trumpAnnounced:game.trumpAnnounced});
   return v>0?{tier:3,power:v}:{tier:0,power:0};
  }
  if(visibleTrump&&card.suit===visibleTrump)return {tier:2,power:K.normalPower(card,game.contract)};
  if(leadSuit&&card.suit===leadSuit)return {tier:1,power:K.normalPower(card,game.contract)};
  return {tier:0,power:0};
 };
 const compare=(a,b,leadSuit)=>{
  const x=playStrength(a.card,leadSuit,a.index===0),y=playStrength(b.card,leadSuit,b.index===0);
  return x.tier===y.tier?x.power-y.power:x.tier-y.tier;
 };
 const partialWinner=plays=>{
  if(!plays.length)return null;
  const effective=K.effectiveLeadSuit(plays,{trickNo});
  if(trickNo===9&&K.isJoker(plays[0].card)&&plays.length===1)return null;
  let best={...plays[0],index:0};
  for(let i=1;i<plays.length;i++){
   const candidate={...plays[i],index:i};
   if(compare(candidate,best,effective)>0)best=candidate;
  }
  return best;
 };
 const current=partialWinner(trick);
 const partnerWinning=current&&team(current.player)===team(p);
 const opponentWinning=current&&!partnerWinning;
 const scores=legal.map(card=>{
  const power=cardValue(card),isJoker=card.kind==='joker';
  let cost=isJoker?power:power*.9;
  if(card.kind==='normal'&&visibleTrump&&card.suit===visibleTrump)cost+=10;
  if(!trick.length){
   const length=game.hands[p].filter(c=>c.kind==='normal'&&c.suit===card.suit).length;
   const higher=unseenHigher(card,card.suit);
   const control=card.kind==='normal'?(higher===0?18:higher===1?9:0):0;
   const longSuit=length>=3?length*2.2:0;
   const avoidShort=length===1?-5:0;
   const leadBonus=card.kind==='normal'?longSuit+control+avoidShort:-(trickNo===9?0:80);
   return {card,score:cost-leadBonus};
  }
  const candidatePlay={player:p,card,index:trick.length};
  const candidateWinner=partialWinner([...trick,candidatePlay]);
  const winsForUs=candidateWinner&&team(candidateWinner.player)===team(p);
  const candidateTakesLead=!current||compare(candidatePlay,current,lead)>0;
  if(partnerWinning){
   // Keep the partner's winning trick; discard the cheapest card without overtaking.
   return {card,score:cost+(candidateTakesLead?1000:0)};
  }
  if(opponentWinning){
   // Take the trick with the least expensive winning card; otherwise shed cheaply.
   return {card,score:cost-(candidateTakesLead&&winsForUs?65:0)};
  }
  return {card,score:cost};
 });
 scores.sort((a,b)=>a.score-b.score);
 return scores[0].card;
}
function playHumanCard(card){
 if(!game||game.done||locked||!isHumanSeat(game.turn)||!hotseatRevealed)return;
 const p=game.turn;
 const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
 const allowed=K.legalCards(game.hands[p],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trickNo===1?game.trumpSuit:((game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:null),firstTrickNoCut:game.trickNo===1});
 if(!allowed.some(c=>c.id===card.id)){setStatus('این کارت طبق قانون فعلی مجاز نیست.');return;}
 if(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&lead&&!game.hands[p].some(c=>c.kind==='normal'&&c.suit===lead)){
  setStatus('حکم هنوز مخفی است. ابتدا می‌توانی درخواست اعلام حکم بدهی یا بدون درخواست کارت مجاز بازی کنی.');
 }
 hotseatRevealed=false;playOne(p,card);
}
function playOne(p,card){
 if(!game||game.done)return;
 const wasFirst=game.trick.length===0;
 if(typeof playCardSound==='function')playCardSound();if(p!==0&&typeof speakPlayer==='function')speakPlayer('play',p);
 let res;try{res=K.playCard(game,p,card);}catch(e){setStatus('خطا در اجرای کارت: '+(e&&e.message?e.message:'نامشخص'));console.error('Kuwaiti playCard failed',e);return;}
 if(wasFirst&&game.trick.length===1)game.lastTrick=[];
 // The live team trick counter occupies this area; do not replace it with a per-card announcement.
 if(res.completed){
  const win=res.winner;if(typeof tone==='function'){tone(590,.09,'sine',.035);tone(790,.12,'triangle',.025,.08);}if(win!==0&&typeof speakPlayer==='function')speakPlayer('win',win);setStatus('دست '+fa(game.trickNo-1)+' را '+playerNames[win]+' برد.');
  renderGame();
  if(game.done){finishGame();return;}
  setTimeout(()=>{renderGame();playAITurn()},700);
 }else{renderGame();playAITurn();}
}
function cardLabel(c){return c.kind==='joker'?(c.color==='red'?'جوکر قرمز':'جوکر مشکی'):c.rank+' '+suitGlyph[c.suit];}
function playAITurn(){
 if(!game||game.done||isHumanSeat(game.turn)||locked||game.waitingResult)return;
 const p=game.turn;
 setTimeout(()=>{
  if(!game||game.done||game.turn!==p||isHumanSeat(game.turn))return;
  try{
   const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
   if(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&p!==game.auctionWinner&&lead&&!game.hands[p].some(c=>c.kind==='normal'&&c.suit===lead)){
    game.trumpAnnounced=true;setStatus(playerNames[p]+' خال زمینه را نداشت و حکم مخفی را درخواست کرد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit]);
    $('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];
   }
   let c;
   try{c=aiCard(p);}catch(aiError){
    const allowed=K.legalCards(game.hands[p],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:(game.trumpAnnounced||p===game.auctionWinner)?game.trumpSuit:null});
    c=allowed[0];console.warn('Kuwaiti AI fallback card selected',aiError);
   }
   if(!c)throw new Error('کارت مجاز برای بازیکن '+playerNames[p]+' پیدا نشد');
   playOne(p,c);
  }catch(e){
   locked=true;setStatus('خطای نوبت هوش مصنوعی: '+(e&&e.message?e.message:'نامشخص')+' · بازی متوقف شد.');
   console.error('Kuwaiti AI turn failed',e);
  }
 },550);
}
function renderGame(){
 if(!game)return;
 $('kScoreA').textContent=fa(points.A);$('kScoreB').textContent=fa(points.B);
 $('kTrickNo').textContent=fa(Math.min(game.trickNo,9));
 $('kWonA').textContent=fa(game.trickWinners.filter(p=>team(p)==='A').length);
 $('kWonB').textContent=fa(game.trickWinners.filter(p=>team(p)==='B').length);
 const currentPlays=game.trick.length?game.trick:(game.lastTrick||[]);
 $('kTrickCards').textContent='کارت‌های این دست: '+fa(game.trick.length)+' از ۶';
 $('kTrickCards').style.display='';
 $('kTurn').textContent=game.done?'بازی پایان یافت':('نوبت: '+playerNames[game.turn]);
 for(let p=0;p<6;p++){
  const seat=document.querySelector('.k-seat[data-p="'+p+'"]');
  seat.classList.toggle('active',game.turn===p&&!game.done);
  $('kCount'+p).textContent=fa(game.hands[p].length)+' کارت';
  const slot=$('kPlayed'+p);slot.innerHTML='';
  const played=currentPlays.find(x=>x.player===p);
  if(played)slot.append(cardNode(played.card,true));
  else if(p!==game.turn&&game.hands[p].length){const back=document.createElement('div');back.className='k-card k-back';slot.append(back);}
 }
 $('kHand').innerHTML='';
 const p=game.turn,isHuman=isHumanSeat(p),gate=$('kHotseatGate'),hide=isHuman&&!hotseatRevealed&&!game.done;gate.classList.toggle('hidden',!!hide);if(hide){$('kHotseatTitle').textContent='تحویل گوشی به '+playerNames[p];$('kHotseatText').textContent='گوشی را به '+playerNames[p]+' بدهید؛ سپس کارت‌ها را نمایش دهید.';}
 if(isHuman&&hotseatRevealed)game.hands[p].forEach(c=>{
  const b=document.createElement('button');
  const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
  const legal=isHuman&&!game.done&&hotseatRevealed&&K.legalCards(game.hands[p],lead,{trickNo:game.trickNo,isFirstPlay:game.trick.length===0,trumpSuit:game.trickNo===1?game.trumpSuit:((game.trumpAnnounced||game.auctionWinner===0)?game.trumpSuit:null),firstTrickNoCut:game.trickNo===1}).some(x=>x.id===c.id);
  b.disabled=!legal;b.append(cardNode(c));b.onclick=()=>playHumanCard(c);$('kHand').append(b);
 });
 const lead=K.effectiveLeadSuit(game.trick,{trickNo:game.trickNo});
 const voidInLead=isHuman&&lead&&!game.hands[p].some(c=>c.kind==='normal'&&c.suit===lead);
 $('kAskTrump').classList.toggle('hidden',!(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&voidInLead&&game.auctionWinner!==p));
 $('kAnnounceTrump').classList.toggle('hidden',!(game.isMalzoom&&game.hiddenTrump&&!game.trumpAnnounced&&isHuman&&hotseatRevealed&&game.turn===game.auctionWinner));
}
function finishGame(){
 game.done=true;locked=true;$('kHotseatGate').classList.add('hidden');
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
 playedTricks+=9;
 $('kMatchProgress').textContent=fa(playedTricks)+' از '+fa(matchLimit)+' دست انجام شده';
 points[bidderTeam]+=val;
 previousAuctionWinner=game.auctionWinner;
 previousWinningTeam=success?bidderTeam:(bidderTeam==='A'?'B':'A');
 firstGame=false;
 $('kResult').classList.remove('hidden');
 $('kResult').innerHTML='<b>'+(success?'قرارداد موفق شد':'قرارداد ناموفق شد')+'</b><p class="k-small">تعداد دست تیم مزایده‌برنده: '+fa(won)+' · امتیاز این بازی: '+(val>0?'+':'')+fa(val)+'</p>';
 $('kNewGame').classList.remove('hidden');
 if(playedTricks<matchLimit)$('kNewGame').textContent='بازی بعدی';
 else{$('kNewGame').textContent='شروع مسابقه جدید';$('kResult').innerHTML+='<p class="k-small">مسابقه کامل شد: '+fa(matchLimit)+' دست انجام شد.</p>';}
 renderGame();
}
function startNewMatch(){
 hotseatRevealed=false;
 if(playedTricks>=matchLimit){firstGame=true;previousAuctionWinner=null;previousWinningTeam=null;points={A:0,B:0};playedTricks=0;resetSetup();return;}
 locked=false;
 const teamPlayers=previousWinningTeam==='B'?[1,3,5]:[0,2,4];
 const firstPicker=$('kFirstAuction');
 firstPicker.innerHTML=teamPlayers.map(p=>'<option value="'+p+'">'+playerNames[p]+'</option>').join('');
 firstPicker.value=String(teamPlayers[0]);
 $('kNewGame').classList.add('hidden');$('kResult').classList.add('hidden');
 startAuction();
}
function bind(){
 $('kPlayStyle').onchange=()=>{$('kHumanSeatSetup').classList.toggle('hidden',$('kPlayStyle').value!=='hotseat');};
 $('kRevealHand').onclick=()=>{if((auction&&isHumanSeat(auction.current))||(game&&isHumanSeat(game.turn)))revealCurrentHuman();};
 $('modeKuwaiti').onclick=()=>{try{if(window.audioReady)audioReady();if(!initialized&&!init())throw new Error('راه‌اندازی میز کامل نشد');resetSetup();}catch(e){$('modeMessage').textContent='خطا در باز کردن میز شش‌نفره: '+(e&&e.message?e.message:'خطای ناشناخته');console.error(e);}};
 $('kStartAuction').onclick=()=>{if(firstGame){points={A:0,B:0};playedTricks=0;matchLimit=Number($('kMatchLimit').value)||54;}startAuction();};
 $('kBackModes').onclick=()=>setScreen('modes');
 $('kExit').onclick=()=>setScreen('modes');
 $('kNewGame').onclick=()=>startNewMatch();
 $('kPass').onclick=()=>submitBid({type:'pass'});
 document.querySelectorAll('#kAuction [data-bid]').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.bid==='pass')return;
  const n=Number(b.dataset.bid),rank=n===6?1:n===7?2:n===8?3:4;
  submitBid({type:'normal',rank,label:n===9?'باون · ۹ دست':n+' دست',target:n});
 }));
 $('kMalzoom').onclick=()=>submitBid({type:'malzoom',rank:1,label:'ملزوم'});
 $('kConfirmContract').onclick=confirmWinningContract;
 $('kConfirmMalzoom').onclick=()=>startActualGame($('kTrumpSuit').value,$('kHideTrump').checked);
 $('kAskTrump').onclick=()=>{if(game&&isHumanSeat(game.turn)&&hotseatRevealed){game.trumpAnnounced=true;$('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];setStatus('حکم مخفی اعلام شد.');renderGame();}};
 $('kAnnounceTrump').onclick=()=>{if(game&&isHumanSeat(game.turn)&&hotseatRevealed){game.trumpAnnounced=true;$('kTrumpDisplay').textContent='حکم اعلام شد: '+suitGlyph[game.trumpSuit]+' '+suitName[game.trumpSuit];setStatus('حکم اعلام شد.');renderGame();}};
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
// This script is loaded after the complete page markup; initialize synchronously.
init();
})();