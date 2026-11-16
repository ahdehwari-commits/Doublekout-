/* Central Double Kout player progress and local-win sync.
 * Uses the existing Supabase client/session; never creates a second auth client.
 */
(function(){
'use strict';
let busy=false;
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
async function awardLocalWin(gameId,mode){
 try{
  const session=await window.DoubleKoutOnline.getSession();
  if(!session||!session.user||session.user.is_anonymous)return {status:'no_account'};
  const r=await rpc('award_local_game_win',{p_game_id:gameId,p_game_mode:mode});
  if(r.error)throw r.error;
  const data=r.data||{};
  await refresh();
  return {status:data.awarded?'awarded':'duplicate',points:Number(data.points_added||0)};
 }catch(e){console.warn('Central win-point sync failed:',e&&e.message||e);return {status:'error',message:e.message||String(e)};}
}
function openAccount(){if(online())window.DoubleKoutOnline.open();setText('onlineAuthStatus','برای ثبت بردهای محلی و دیدن رتبه‌ات، وارد حساب دائمی شو.');}
window.DoubleKoutProgress={refresh,awardLocalWin,openAccount};
document.addEventListener('DOMContentLoaded',()=>{const b=document.getElementById('onlineRefreshProgress');if(b)b.addEventListener('click',refresh);});
})();
