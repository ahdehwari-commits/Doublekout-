/* Double Kout central cosmetic store. Purchases and ownership are server-authoritative. */
(function(){
'use strict';
const themes={
 'blue-gold':{bg:'linear-gradient(135deg,#08264b,#1f5c91 48%,#081f3c)',edge:'#e9d49a',glow:'#7db8e8'},
 'black-gold':{bg:'linear-gradient(135deg,#090909,#35302a 52%,#080808)',edge:'#e8c66e',glow:'#c9a34d'},
 emerald:{bg:'linear-gradient(135deg,#063c2c,#16845b 52%,#05291e)',edge:'#e9d49a',glow:'#69d4a7'},
 ruby:{bg:'linear-gradient(135deg,#4a0715,#a51f3b 52%,#330611)',edge:'#f2d19a',glow:'#f18a9e'},
 violet:{bg:'linear-gradient(135deg,#251044,#633a91 52%,#17092d)',edge:'#e9d49a',glow:'#c6a1f0'}
};
let busy=false;
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ensure(){
 if($('onlineStore'))return;
 const host=$('onlineProgress');if(!host)return;
 const box=document.createElement('section');box.id='onlineStore';
 box.style.cssText='border-top:1px solid #668c78;margin-top:14px;padding-top:12px';
 box.innerHTML='<h3 style="margin:0 0 6px;color:#f4d58b">فروشگاه طرح پشت کارت</h3><div id="storeBalance" style="font-size:13px;margin-bottom:9px">برای مشاهده فروشگاه وارد حساب دائمی شو.</div><div id="storeItems" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px"></div><div style="font-size:11px;color:#c4d5cd;line-height:1.9;margin-top:9px">طرح‌های امتیازی با امتیاز برد خریداری می‌شوند. جوایز ویدئویی و پرداخت واقعی پس از اتصال و تأیید سرویس مربوط فعال خواهند شد.</div><div id="storeStatus" role="status" style="font-size:12px;margin-top:7px"></div>';
 host.appendChild(box);
}
function preview(theme){const t=themes[theme]||themes['blue-gold'];return '<div aria-hidden="true" style="width:58px;height:82px;margin:0 auto 7px;border:3px solid '+t.edge+';border-radius:8px;background:'+t.bg+';box-shadow:inset 0 0 0 2px #ffffff22,0 4px 9px #0008;position:relative"><div style="position:absolute;inset:7px;border:1px solid '+t.edge+';border-radius:4px;background:repeating-linear-gradient(45deg,transparent 0 6px,'+t.glow+'33 6px 8px)"></div><b style="position:absolute;left:0;right:0;top:35px;text-align:center;font:italic 700 7px Georgia;color:#ffe6a0">Abdulhamid</b></div>';}
async function call(name,args){const api=window.DoubleKoutOnline;if(!api||!api.rpc)throw new Error('اتصال حساب مرکزی آماده نیست.');const r=await api.rpc(name,args||{});if(r.error)throw r.error;return r.data;}
async function refresh(){
 ensure();if(busy)return;busy=true;
 try{
  const session=await window.DoubleKoutOnline.getSession();
  if(!session||!session.user||session.user.is_anonymous){$('storeBalance').textContent='برای خرید و نگهداری طرح‌ها وارد حساب دائمی شو.';$('storeItems').innerHTML='';return;}
  const data=await call('get_store_catalog');
  $('storeBalance').textContent='موجودی شما: '+Number(data.points||0)+' امتیاز';
  $('storeItems').innerHTML=(data.items||[]).map(item=>{
   const owned=!!item.owned,active=data.equipped===item.id;
   return '<article style="background:#09271f;border:1px solid '+(active?'#e7c879':'#467565')+';border-radius:12px;padding:9px;text-align:center">'+preview(item.theme)+'<b style="font-size:12px">'+esc(item.title)+'</b><div style="font-size:10px;color:#c4d5cd;min-height:30px;margin:4px 0">'+esc(item.description)+'</div><div style="font-size:11px;color:#f4d58b;margin-bottom:6px">'+(owned?'دریافت‌شده':Number(item.price)+' امتیاز')+'</div>'+(active?'<span style="font-size:11px;color:#a8efbd">طرح فعال</span>':owned?'<button data-equip="'+esc(item.id)+'" style="width:100%;padding:7px;font-size:11px">استفاده از طرح</button>':'<button data-buy="'+esc(item.id)+'" style="width:100%;padding:7px;font-size:11px">خرید با امتیاز</button>')+'</article>';
  }).join('');
  $('storeItems').querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>purchase(b.dataset.buy)));
  $('storeItems').querySelectorAll('[data-equip]').forEach(b=>b.addEventListener('click',()=>equip(b.dataset.equip)));
  applyTheme(data.equipped);
 }catch(e){$('storeBalance').textContent='فروشگاه فعلاً در دسترس نیست: '+(e.message||e);}
 finally{busy=false;}
}
function applyTheme(id){
 const themesById={'classic-blue':'blue-gold','black-gold':'black-gold',emerald:'emerald',ruby:'ruby',violet:'violet'};
 const key=themesById[id]||'blue-gold';document.documentElement.dataset.cardBack=key;
}
async function purchase(id){
 $('storeStatus').textContent='در حال بررسی موجودی و ثبت خرید...';
 try{const r=await call('purchase_card_back',{p_card_back_id:id});$('storeStatus').textContent=r.already_owned?'این طرح قبلاً برای حساب شما ثبت شده است.':'خرید با موفقیت در حساب مرکزی ثبت شد.';await refresh();}
 catch(e){$('storeStatus').textContent=e.message==='not_enough_points'?'امتیاز کافی نداری؛ با بردن بازی امتیاز جمع کن.':(e.message||'خرید انجام نشد.');}
}
async function equip(id){
 $('storeStatus').textContent='در حال فعال‌سازی طرح...';
 try{await call('equip_card_back',{p_card_back_id:id});$('storeStatus').textContent='طرح جدید برای کارت‌های پشت فعال شد.';await refresh();}
 catch(e){$('storeStatus').textContent=e.message||'فعال‌سازی انجام نشد.';}
}
window.DoubleKoutStore={refresh,applyTheme};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensure();});else ensure();
document.addEventListener('click',e=>{if(e.target&&e.target.id==='onlineRefreshProgress')setTimeout(refresh,100);});
document.addEventListener('dblclick',()=>{});
const oldRefresh=window.DoubleKoutProgress&&window.DoubleKoutProgress.refresh;
if(oldRefresh){const wrap=async function(){const r=await oldRefresh.apply(this,arguments);refresh();return r;};window.DoubleKoutProgress.refresh=wrap;}
window.addEventListener('load',()=>{ensure();refresh();});
})();
