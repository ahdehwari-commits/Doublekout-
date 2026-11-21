/* Central Double Kout player progress and local-win sync.
 * Uses the existing Supabase client/session; never creates a second auth client.
 */
(function(){
'use strict';
let busy=false;
const QUEUE_KEY='doublekout.pendingWinAwards.v1';
function online(){return window.DoubleKoutOnline&&typeof window.DoubleKoutOnline.rpc==='function';}
function setText(id,value){const n=document.getElementById(id);if(n)n.textContent=value;}
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function rpc(name,args){
 if(!online())throw new Error('ماژول اتصال مرکزی آماده نیست.');
 return window.DoubleKoutOnline.rpc(name,args||{});
}
async function refresh(){
 if(busy)return null;busy=true;
 try{
  let session=null;try{session=await window.DoubleKoutOnline.getSession();}catch(_){}
  if(session&&!session.user.is_anonymous){
   const me=await rpc('get_my_progress',{});
   if(me.error)throw me.error;
   const p=me.data||{points:0,wins:0,display_name:'بازیکن'};
   setText('onlineMyPoints','امتیاز من: '+Number(p.points||0)+' · بردها: '+Number(p.wins||0));
  }else setText('onlineMyPoints',session?'حساب مهمان امتیاز دائمی نمی‌گیرد؛ با ایمیل یا Google وارد شو.':'برای دیدن امتیازها وارد حساب شو.');
  const board=await rpc('get_player_leaderboard',{p_limit:20});
  if(board.error)throw board.error;
  const rows=Array.isArray(board.data)?board.data:[];
  const target=document.getElementById('onlineLeaderboard');
  if(target)target.innerHTML=rows.length?'<b>رتبه‌بندی بازیکنان</b>'+rows.map((p,i)=>'<div class="progress-row"><span>'+(i+1)+'. '+escapeHtml(p.display_name)+'</span><b>'+Number(p.points||0)+' امتیاز</b></div>').join(''):'هنوز امتیازی ثبت نشده است.';
  return {leaderboard:rows};
 }catch(e){setText('onlineMyPoints','دریافت امتیازها ناموفق بود: '+(e.message||e));return null;}
 finally{busy=false;}
}
function readQueue(){try{const x=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(x)?x:[];}catch(_){return [];}}
function writeQueue(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-100)));}catch(_){}}
async function flushPending(){
 // Discard legacy queued offline wins; they are intentionally not rankable.
 writeQueue([]);
}

async function awardLocalWin(gameId,mode){
 // Local/offline results are not server-verifiable and are excluded from rankings.
 return {status:'not_ranked',points:0};
}

function showAwardResult(result,containerId){const host=document.getElementById(containerId);if(!host)return;let n=document.getElementById('centralAwardNotice');if(!n){n=document.createElement('div');n.id='centralAwardNotice';n.style.cssText='margin-top:8px;padding:8px;border:1px solid #b99a5d;border-radius:8px;font-size:12px;line-height:1.8';host.appendChild(n);}n.innerHTML='';if(result&&result.status==='awarded'){n.textContent='دو امتیاز برد به حساب مرکزی اضافه شد.';}else if(result&&result.status==='duplicate'){n.textContent='امتیاز این بازی قبلاً ثبت شده است؛ امتیاز تکراری داده نشد.';}else if(result&&result.status==='pending'){n.textContent=result.needsAccount?'برد این بازی موقتاً نگهداری شد؛ پس از تبدیل همین حساب مهمان به حساب دائمی، دو امتیاز به حسابت اضافه می‌شود.':result.needsBackend?'برد ذخیره شد؛ سرویس مرکزی امتیاز فعلاً پاسخ نداد و بازی دوباره برای ثبت امتیاز تلاش می‌کند.':'برد روی همین دستگاه نگهداری شد و پس از برقراری اینترنت با همین حساب همگام می‌شود.';}else if(result&&result.status==='not_ranked'){n.textContent='بازی آفلاین ثبت شد، اما برای جلوگیری از تقلب در رتبه‌بندی امتیاز آنلاین ندارد.';}else if(result&&result.status==='no_account'){n.textContent='برای ثبت این برد و دریافت امتیاز، ابتدا وارد حساب دائمی شو. ';const b=document.createElement('button');b.textContent='ورود به حساب';b.onclick=openAccount;n.appendChild(b);}else{n.textContent='ثبت امتیاز انجام نشد: '+(result&&result.message||'اتصال مرکزی برقرار نیست.');}}
function openAccount(){if(online())window.DoubleKoutOnline.open();setText('onlineAuthStatus','برای ثبت بردهای محلی و دیدن رتبه‌ات، وارد حساب دائمی شو.');}
window.DoubleKoutProgress={refresh,awardLocalWin,openAccount,showAwardResult,flushPending};
window.addEventListener('online',flushPending);
 window.addEventListener('load',flushPending);
const bindRefresh=()=>{const b=document.getElementById('onlineRefreshProgress');if(b)b.onclick=()=>{refresh();flushPending();};};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindRefresh);else bindRefresh();
})();
