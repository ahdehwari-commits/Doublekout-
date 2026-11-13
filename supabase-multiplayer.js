(function(){
'use strict';
var SUPABASE_URL='https://awgzilkxmtyrcxpouxif.supabase.co';
var SUPABASE_PUBLISHABLE_KEY='sb_publishable_NKmVkAcOJUEAQI7oW7nd0g_3DM3lmCs';
var client=null,session=null,roomId=null,roomCode='',channel=null,me=null,mode='double-kout',count=4;
function el(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function say(s){var n=el('onlineStatus');if(n)n.textContent=s;}
function ensureUI(){
 if(el('onlineButton'))return;
 var grid=document.querySelector('#modePicker .mode-grid');if(!grid)return;
 var b=document.createElement('button');b.id='onlineButton';b.className='mode-card';b.innerHTML='<strong>🌐 بازی آنلاین چندگوشی</strong><span>ساخت اتاق، ورود با کد و آمادگی بازیکنان از گوشی‌های مختلف</span>';b.onclick=open;grid.appendChild(b);
 var style=document.createElement('style');style.textContent=
 '#onlineOverlay{position:fixed;inset:0;z-index:100000;background:#03140ff5;display:none;align-items:center;justify-content:center;padding:14px;direction:rtl;font-family:Tahoma,Arial,sans-serif}'+
 '#onlineOverlay.open{display:flex}#onlinePanel{width:min(560px,100%);max-height:92vh;overflow:auto;background:linear-gradient(145deg,#164333,#071d17);border:2px solid #d7b66d;border-radius:20px;padding:16px;color:#fff;box-shadow:0 20px 55px #000c}'+
 '#onlinePanel h2{color:#f4d58b;margin:0 0 8px}#onlinePanel p{font-size:12px;line-height:1.9;color:#d1e1d8}'+
 '#onlinePanel label{display:block;font-size:12px;color:#d8e7de;margin:10px 0 4px}'+
 '#onlinePanel input,#onlinePanel select{width:100%;padding:11px;border-radius:9px;border:1px solid #7b9d8b;background:#f7f2e5;color:#13251d;font:inherit}'+
 '#onlinePanel button{padding:10px 12px;border-radius:10px;border:1px solid #e6ce92;background:linear-gradient(145deg,#f5dfaa,#bd9144);color:#211808;font-weight:bold;font:inherit;cursor:pointer}'+
 '#onlinePanel button.secondary{background:#193b30;color:#f5e8c4;border-color:#688d7d}'+
 '#onlinePanel button:disabled{opacity:.45;cursor:not-allowed}#onlinePanel .onrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#onlinePanel .onrow>*{flex:1;min-width:120px}'+
 '#onlineStatus{background:#071b15;border-radius:9px;padding:10px;font-size:12px;line-height:1.9;color:#f3dfaa;margin-top:10px;white-space:pre-wrap}'+
 '#onlineCode{direction:ltr;text-align:center;font-size:27px;letter-spacing:5px;color:#ffe09a;padding:12px;border:1px dashed #c9a65f;border-radius:10px;margin:10px 0}'+
 '#onlineRoster{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0}#onlineRoster div{background:#0b2a20;border:1px solid #537e6a;border-radius:9px;padding:9px;font-size:12px}';
 document.head.appendChild(style);
 var root=document.createElement('div');root.id='onlineOverlay';root.innerHTML=
 '<section id="onlinePanel"><button id="onlineClose" class="secondary" style="float:left">بستن</button><h2>اتاق آنلاین دابل کوت</h2>'+
 '<p>بازیکنان با اینترنت و گوشی‌های جداگانه وارد یک اتاق می‌شوند. در این مرحله ساخت اتاق، ورود با کد و وضعیت آمادگی فعال است؛ اجرای خود بازی آنلاین هنوز در حال تکمیل است.</p>'+
 '<div id="onlineSetup"><label>نوع بازی</label><select id="onlineMode"><option value="double-kout">دابل کوت توالی · چهار نفره</option><option value="standard-hokm">حکم معمولی · چهار نفره</option><option value="kuwaiti">کوت کویتی · شش نفره</option></select>'+
 '<label>نام نمایشی</label><input id="onlineName" maxlength="24" value="بازیکن">'+
 '<div class="onrow"><button id="onlineCreate">ساخت اتاق جدید</button><button id="onlineShowJoin" class="secondary">ورود با کد</button></div>'+
 '<div id="onlineJoinBox" style="display:none"><label>کد اتاق</label><input id="onlineJoinCode" maxlength="6" placeholder="مثلاً A1B2C3" style="text-transform:uppercase;direction:ltr;text-align:center"><button id="onlineJoin" style="width:100%;margin-top:8px">ورود به اتاق</button></div></div>'+
 '<div id="onlineRoom" style="display:none"><div id="onlineCode"></div><div id="onlineRoster"></div><div class="onrow"><button id="onlineReady">آماده‌ام</button><button id="onlineLeave" class="secondary">خروج از اتاق</button></div></div>'+
 '<div id="onlineStatus">برای شروع، ساخت اتاق یا ورود با کد را انتخاب کن.</div></section>';
 document.body.appendChild(root);
 el('onlineClose').onclick=close;el('onlineCreate').onclick=createRoom;el('onlineShowJoin').onclick=function(){el('onlineJoinBox').style.display='block';};
 el('onlineJoin').onclick=joinRoom;el('onlineReady').onclick=toggleReady;el('onlineLeave').onclick=leave;
 root.addEventListener('click',function(e){if(e.target===root)close();});
}
function open(){ensureUI();el('onlineOverlay').classList.add('open');}
function close(){if(el('onlineOverlay'))el('onlineOverlay').classList.remove('open');}
function initClient(){
 if(client)return true;
 if(!window.supabase||!window.supabase.createClient){say('کتابخانه اتصال بارگذاری نشد. صفحه را تازه‌سازی کن.');return false;}
 client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 return true;
}
async function authenticate(){
 if(!initClient())throw new Error('کتابخانه Supabase در دسترس نیست.');
 var got=await client.auth.getSession();session=got.data&&got.data.session;
 if(!session){var sign=await client.auth.signInAnonymously();if(sign.error)throw sign.error;session=sign.data.session;}
 if(!session)throw new Error('ورود مهمان انجام نشد. ورود ناشناس را در Authentication فعال کن.');
 me=session.user;return me;
}
function showRoom(){el('onlineSetup').style.display='none';el('onlineRoom').style.display='block';el('onlineCode').textContent=roomCode;}
function subscribe(){
 if(channel){client.removeChannel(channel);channel=null;}
 channel=client.channel('doublekout-room-'+roomId)
 .on('postgres_changes',{event:'*',schema:'public',table:'room_members',filter:'room_id=eq.'+roomId},refreshRoster)
 .on('postgres_changes',{event:'*',schema:'public',table:'game_rooms',filter:'id=eq.'+roomId},refreshRoster)
 .subscribe(function(state){if(state==='SUBSCRIBED')say('اتصال زنده برقرار است. تغییرات بازیکنان همگام می‌شود.');});
 refreshRoster();
}
async function refreshRoster(){
 if(!roomId||!client)return;
 var r=await client.from('room_members').select('seat,display_name,is_host,ready,user_id').eq('room_id',roomId).order('seat');
 if(r.error){say('خواندن فهرست بازیکنان: '+r.error.message);return;}
 var cap=count,rows=r.data||[],html='';
 for(var i=0;i<cap;i++){var p=rows.find(function(x){return x.seat===i;});html+='<div>'+(i+1)+'. '+(p?esc(p.display_name)+(p.is_host?' ★':'')+(p.ready?' ✓ آماده':' · در انتظار'):'صندلی خالی')+'</div>';}
 el('onlineRoster').innerHTML=html;
 var allReady=rows.length===cap&&rows.every(function(x){return x.ready;});
 say(rows.length+' از '+cap+' بازیکن وارد شده‌اند. '+(allReady?'همه آماده‌اند.':'منتظر ورود و آمادگی بازیکنان دیگر...'));
 var mine=rows.find(function(x){return x.user_id===me.id;});
 el('onlineReady').textContent=mine&&mine.ready?'لغو آمادگی':'آماده‌ام';
}
async function createRoom(){
 try{
  say('در حال ورود مهمان و ساخت اتاق...');
  await authenticate();mode=el('onlineMode').value;count=mode==='kuwaiti'?6:4;
  var r=await client.rpc('create_game_room',{p_game_mode:mode,p_player_count:count,p_display_name:el('onlineName').value.trim()||'بازیکن'});
  if(r.error)throw r.error;
  roomId=r.data.room_id;roomCode=r.data.code;showRoom();subscribe();
 }catch(e){say('ساخت اتاق انجام نشد: '+(e.message||e)+'\nاگر پیام Anonymous sign-ins disabled دیدی، Authentication > Sign In / Providers > Anonymous را فعال کن.');}
}
async function joinRoom(){
 try{
  say('در حال ورود به اتاق...');
  await authenticate();var code=el('onlineJoinCode').value.trim().toUpperCase();
  if(!/^[A-F0-9]{6}$/.test(code))throw new Error('کد اتاق باید شش حرف یا عدد باشد.');
  var r=await client.rpc('join_game_room',{p_code:code,p_display_name:el('onlineName').value.trim()||'بازیکن'});
  if(r.error)throw r.error;
  roomId=r.data.room_id;roomCode=r.data.code;mode=r.data.game_mode;count=Number(r.data.player_count);showRoom();subscribe();
 }catch(e){say('ورود به اتاق انجام نشد: '+(e.message||e)+'\nاگر پیام Anonymous sign-ins disabled دیدی، ورود ناشناس را در تنظیمات Authentication فعال کن.');}
}
async function toggleReady(){
 try{if(!roomId)return;say('در حال ثبت آمادگی...');var q=await client.from('room_members').select('ready').eq('room_id',roomId).eq('user_id',me.id).single();if(q.error)throw q.error;
 var r=await client.rpc('set_room_ready',{p_room_id:roomId,p_ready:!q.data.ready});if(r.error)throw r.error;await refreshRoster();
 }catch(e){say('ثبت آمادگی انجام نشد: '+(e.message||e));}
}
async function leave(){
 if(channel){await client.removeChannel(channel);channel=null;}
 roomId=null;roomCode='';el('onlineRoom').style.display='none';el('onlineSetup').style.display='block';say('از اتاق خارج شدی. نشست مهمان روی این گوشی باقی می‌ماند.');
}
window.DoubleKoutOnline={open:open,leave:leave};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUI);else ensureUI();
})();
