(function(){
'use strict';
var css=[
'#lanModeButton{background:linear-gradient(145deg,#244b65,#0b1d2b 75%);border-color:#7eb7d8;color:#e7f5ff}',
'#lanOverlay{position:fixed;inset:0;z-index:99999;background:#03140ff2;display:none;align-items:center;justify-content:center;padding:14px;direction:rtl;font-family:Tahoma,Arial,sans-serif}',
'#lanOverlay.open{display:flex}',
'#lanPanel{width:min(560px,100%);max-height:92vh;overflow:auto;background:linear-gradient(145deg,#164333,#071d17);border:2px solid #d7b66d;border-radius:20px;padding:16px;box-shadow:0 20px 55px #000c;color:#fff}',
'#lanPanel h2{color:#f4d58b;margin:0 0 8px;font-size:20px}',
'#lanPanel p{font-size:12px;line-height:1.9;color:#d1e1d8}',
'#lanPanel label{display:block;font-size:12px;color:#d8e7de;margin:9px 0 4px}',
'#lanPanel input,#lanPanel select{width:100%;padding:11px;border-radius:9px;border:1px solid #7b9d8b;background:#f7f2e5;color:#13251d;font:inherit}',
'#lanPanel button{padding:10px 12px;border-radius:10px;border:1px solid #e6ce92;background:linear-gradient(145deg,#f5dfaa,#bd9144);color:#211808;font-weight:bold;font:inherit;cursor:pointer}',
'#lanPanel button.secondary{background:#193b30;color:#f5e8c4;border-color:#688d7d}',
'#lanPanel .lan-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
'#lanPanel .lan-row>*{flex:1;min-width:120px}',
'#lanAddress{direction:ltr;text-align:center;background:#061710;border:1px dashed #bfa05e;border-radius:9px;padding:10px;font-size:13px;color:#ffdf91;word-break:break-all}',
'#lanSeats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0}',
'#lanSeats button{background:#0b2a20;color:#e5f0e9;border-color:#537e6a;text-align:right;font-size:12px}',
'#lanSeats button.mine{outline:2px solid #f3d58c;background:#315a3d}',
'#lanSeats button.taken{opacity:.7}',
'#lanStatus{background:#071b15;border-radius:9px;padding:10px;font-size:12px;line-height:1.8;color:#f3dfaa;margin-top:10px}',
'#lanClose{float:left}'
].join('\n');
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
function $(id){return document.getElementById(id);}
var socket=null,host=false,myId='',mySeat=-1,capacity=4,room=null,hostUrl='',ready=false;
function makeUI(){
 var grid=document.querySelector('#modePicker .mode-grid');
 if(grid&&!$('lanModeButton')){
  var b=document.createElement('button');b.id='lanModeButton';b.className='mode-card';
  b.innerHTML='<strong>📶 بازی چندگوشی آفلاین</strong><span>یک گوشی اندرویدی میزبان؛ اتصال گوشی‌ها با Wi‑Fi یا هات‌اسپات</span>';
  b.onclick=openOverlay;grid.appendChild(b);
 }
 if(!$('lanOverlay')){
  var root=document.createElement('div');root.id='lanOverlay';
  root.innerHTML='<section id="lanPanel"><button id="lanClose" class="secondary">بستن</button><h2>بازی چندگوشی در شبکه محلی</h2><p>یک گوشی اندرویدی میزبان می‌شود. بقیهٔ گوشی‌ها، از جمله آیفون، با مرورگر و از طریق همان Wi‑Fi یا هات‌اسپات وارد می‌شوند. اینترنت لازم نیست.</p><div id="lanStartChoices"><label>تعداد صندلی‌ها</label><select id="lanCapacity"><option value="4">چهار نفره</option><option value="6">شش نفره · کوت کویتی</option></select><label>نام بازیکن میزبان</label><input id="lanName" maxlength="18" value="میزبان"><div class="lan-row"><button id="lanHost">میزبان اندرویدی شو</button><button id="lanJoinToggle" class="secondary">ورود به میز</button></div><div id="lanJoinFields" class="hidden"><label>نشانی میزبان (IP)</label><input id="lanHostIp" placeholder="مثلاً 192.168.1.10"><label>نام بازیکن</label><input id="lanGuestName" maxlength="18" value="مهمان"><button id="lanJoin" style="width:100%;margin-top:8px">اتصال به میز</button></div></div><div id="lanRoom" class="hidden"><div id="lanAddress"></div><div id="lanQrWrap" style="display:none;text-align:center;margin:12px auto"><img id="lanQr" alt="QR اتصال به میز" style="width:210px;height:210px;max-width:70vw;background:#fff;padding:8px;border-radius:12px"><div style="font-size:11px;color:#f4dfaa;margin-top:6px">با دوربین گوشی مهمان اسکن کن؛ نشانی میز هم پایین قابل استفاده است.</div></div><div id="lanStatus">در حال اتصال...</div><h3 style="color:#f4d58b;font-size:15px">صندلی‌های میز</h3><div id="lanSeats"></div><div class="lan-row"><button id="lanReady">آماده‌ام</button><button id="lanLeave" class="secondary">خروج از میز</button></div><p id="lanNextStep">اتصال محلی و انتخاب صندلی در این مرحله فعال است. همگام‌سازی کامل کارت‌ها، مزایده و نوبت‌ها مرحلهٔ بعدی توسعه است.</p></div></section>';
  document.body.appendChild(root);
  $('lanClose').onclick=closeOverlay;
  $('lanHost').onclick=startHost;
  $('lanJoinToggle').onclick=function(){$('lanJoinFields').classList.toggle('hidden');};
  $('lanJoin').onclick=joinGuest;
  $('lanReady').onclick=function(){ready=!ready;send({type:'ready',ready:ready});$('lanReady').textContent=ready?'لغو آمادگی':'آماده‌ام';};
  $('lanLeave').onclick=leave;
  root.addEventListener('click',function(e){if(e.target===root)closeOverlay();});
 }
}
function openOverlay(){makeUI();$('lanOverlay').classList.add('open');}
function closeOverlay(){if($('lanOverlay'))$('lanOverlay').classList.remove('open');}
function status(s){if($('lanStatus'))$('lanStatus').textContent=s;}
function showRoom(url){$('lanStartChoices').classList.add('hidden');$('lanRoom').classList.remove('hidden');$('lanAddress').textContent=url||hostUrl;}
function connect(url,isHost,cap,name){
 host=isHost;capacity=cap||capacity;hostUrl=url.replace(/^ws:/,'http:').replace(/\/ws$/,'/');
 status('در حال اتصال به میز محلی...');
 try{socket=new WebSocket(url);}catch(e){status('آدرس اتصال معتبر نیست.');return;}
 socket.onopen=function(){status('اتصال برقرار شد؛ در حال ثبت صندلی...');socket.send(JSON.stringify({type:'join',host:host,capacity:capacity,name:name,seat:-1}));};
 socket.onmessage=function(e){
  var m;try{m=JSON.parse(e.data);}catch(_){return;}
  if(m.type==='welcome'){myId=m.id;mySeat=m.seat;capacity=m.capacity;showRoom(hostUrl);status((host?'میزبان':'مهمان')+' متصل شد. صندلی شما: '+(mySeat+1));}
  else if(m.type==='room'){room=m;renderSeats();var count=m.players.filter(function(p){return p.occupied;}).length;status('اتصال برقرار · '+count+' از '+m.capacity+' صندلی پر شده · انتخاب صندلی');}
  else if(m.type==='error'){status(m.message||'خطای اتصال');}
 };
 socket.onclose=function(){status('اتصال قطع شد. میزبان باید سرور را دوباره اجرا کند.');};
 socket.onerror=function(){status('اتصال برقرار نشد؛ مطمئن شوید همهٔ گوشی‌ها به یک Wi‑Fi یا هات‌اسپات وصل‌اند.');};
}
function renderHostQr(info){
 var wrap=$('lanQrWrap'),img=$('lanQr');
 if(!wrap||!img||!window.AndroidApp||typeof AndroidApp.createLanQr!=='function')return;
 // QR opens the host-served PWA and pre-fills the guest connection details.
 var invite='http://'+info.ip+':'+info.port+'/index.html?lanHost='+encodeURIComponent(info.ip);
 var encoded='';try{encoded=AndroidApp.createLanQr(invite)||'';}catch(e){}
 if(encoded){img.src='data:image/png;base64,'+encoded;wrap.style.display='block';}
}
function startHost(){
 if(!window.AndroidApp||typeof AndroidApp.startLanServer!=='function'){status('میزبان فقط روی نسخهٔ اندروید اجرا می‌شود. برای آیفون از گزینهٔ ورود به میز استفاده کن.');return;}
 var info;try{info=JSON.parse(AndroidApp.startLanServer());}catch(e){status('سرور محلی اجرا نشد.');return;}
 if(!info.ok){status(info.error||'سرور محلی اجرا نشد.');return;}
 capacity=Number($('lanCapacity').value)||4;hostUrl=info.url;showRoom(hostUrl);renderHostQr(info);
 $('lanAddress').textContent='نشانی HTTP میز: '+hostUrl+' · اتصال با QR یا ورود دستی IP · همه به یک Wi‑Fi/هات‌اسپات وصل باشند.';
 connect('ws://127.0.0.1:'+info.port+'/ws',true,capacity,$('lanName').value||'میزبان');
}
function joinGuest(){
 var ip=$('lanHostIp').value.trim()||location.hostname;
 if(!ip){status('آدرس IP گوشی میزبان را وارد کن.');return;}
 var name=$('lanGuestName').value||'مهمان';hostUrl='http://'+ip+':8765/';showRoom(hostUrl);
 connect('ws://'+ip+':8765/ws',false,capacity,name);
}
function send(o){if(socket&&socket.readyState===1)socket.send(JSON.stringify(o));}
function renderSeats(){
 if(!room||!$('lanSeats'))return;
 var seats=$('lanSeats');seats.innerHTML='';
 room.players.forEach(function(p){
  var b=document.createElement('button');b.className=(p.occupied?'taken ':'')+(p.seat===mySeat?'mine':'');
  b.textContent='صندلی '+(p.seat+1)+' · '+(p.occupied?(p.name+(p.host?' ★ میزبان':'')+(p.ready?' ✓':'')):'خالی');
  b.disabled=p.occupied&&p.seat!==mySeat;
  b.onclick=function(){mySeat=p.seat;send({type:'seat',seat:p.seat});renderSeats();};
  seats.appendChild(b);
 });
}
function leave(){
 send({type:'leave'});if(socket){socket.close();socket=null;}
 if(host&&window.AndroidApp&&typeof AndroidApp.stopLanServer==='function')AndroidApp.stopLanServer();
 host=false;myId='';mySeat=-1;room=null;ready=false;
 $('lanRoom').classList.add('hidden');$('lanStartChoices').classList.remove('hidden');status('از میز خارج شدی.');
}
makeUI();
// QR invitations open the host-served PWA, prefill the IP and join the local lobby.
try{
 var inviteParams=new URLSearchParams(window.location.search),inviteIp=inviteParams.get('lanHost');
 if(inviteIp){openOverlay();$('lanJoinFields').classList.remove('hidden');$('lanHostIp').value=inviteIp;$('lanGuestName').value='مهمان';status('دعوت میزبان اسکن شد؛ در حال اتصال به میز محلی...');setTimeout(joinGuest,350);}
}catch(e){}
window.LanMultiplayer={open:openOverlay,leave:leave};
})();