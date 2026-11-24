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
let busy=false,refreshQueued=false;
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ensure(){
 if(!$('centralStoreThemeStyles')){
  const style=document.createElement('style');style.id='centralStoreThemeStyles';
  style.textContent='html[data-card-back="black-gold"] .card.back{background:linear-gradient(135deg,#090909,#35302a 52%,#080808)!important;border-color:#e8c66e!important;box-shadow:inset 0 0 0 2px #c9a34d55,0 8px 16px #000b!important}html[data-card-back="emerald"] .card.back{background:linear-gradient(135deg,#063c2c,#16845b 52%,#05291e)!important;border-color:#e9d49a!important}html[data-card-back="ruby"] .card.back{background:linear-gradient(135deg,#4a0715,#a51f3b 52%,#330611)!important;border-color:#f2d19a!important}html[data-card-back="violet"] .card.back{background:linear-gradient(135deg,#251044,#633a91 52%,#17092d)!important;border-color:#e9d49a!important}';
  document.head.appendChild(style);
 }
 if($('onlineStore'))return;
 const host=$('storeContent');if(!host)return;
 const box=document.createElement('section');box.id='onlineStore';
 box.style.cssText='border-top:1px solid #668c78;margin-top:14px;padding-top:12px';
 box.innerHTML='<h3 style="margin:0 0 6px;color:#f4d58b">فروشگاه طرح پشت کارت</h3><div id="storeBalance" style="font-size:13px;margin-bottom:9px">برای مشاهده فروشگاه وارد حساب دائمی شو.</div><div id="storeItems" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px"></div><div style="font-size:11px;color:#c4d5cd;line-height:1.9;margin-top:9px">طرح‌های امتیازی با امتیاز برد خریداری می‌شوند. جوایز ویدئویی و پرداخت واقعی پس از اتصال و تأیید سرویس مربوط فعال خواهند شد.</div><div id="storeStatus" role="status" style="font-size:12px;margin-top:7px"></div>';
 host.appendChild(box);
 const retry=document.createElement('button');retry.type='button';retry.textContent='تلاش دوباره';retry.style.cssText='width:100%;margin-top:8px';retry.addEventListener('click',refresh);box.appendChild(retry);
}

let avatarItems=[],avatarFilter='all',avatarBusy=false,avatarCanBuy=false;
let avatarBackendReady=false;
const avatarStaticCatalog=[{"id":"fantasy_a_01_01","title":"فانتزی 01","category":"fantasy_free","image_file":"fantasy_a_01_01.webp","price":0,"sort_order":1},{"id":"fantasy_a_01_02","title":"فانتزی 02","category":"fantasy_free","image_file":"fantasy_a_01_02.webp","price":0,"sort_order":2},{"id":"fantasy_a_01_03","title":"فانتزی 03","category":"fantasy_free","image_file":"fantasy_a_01_03.webp","price":0,"sort_order":3},{"id":"fantasy_a_02_01","title":"فانتزی 04","category":"fantasy_free","image_file":"fantasy_a_02_01.webp","price":0,"sort_order":4},{"id":"fantasy_a_02_02","title":"فانتزی 05","category":"fantasy_free","image_file":"fantasy_a_02_02.webp","price":0,"sort_order":5},{"id":"fantasy_a_02_03","title":"فانتزی 06","category":"fantasy_free","image_file":"fantasy_a_02_03.webp","price":0,"sort_order":6},{"id":"fantasy_a_03_01","title":"فانتزی 07","category":"fantasy_free","image_file":"fantasy_a_03_01.webp","price":0,"sort_order":7},{"id":"fantasy_a_03_02","title":"فانتزی 08","category":"fantasy_free","image_file":"fantasy_a_03_02.webp","price":0,"sort_order":8},{"id":"fantasy_a_03_03","title":"فانتزی 09","category":"fantasy_free","image_file":"fantasy_a_03_03.webp","price":0,"sort_order":9},{"id":"gulf_b_01_01","title":"خلیجی 01","category":"gulf_paid","image_file":"gulf_b_01_01.webp","price":100,"sort_order":10},{"id":"gulf_b_01_02","title":"خلیجی 02","category":"gulf_paid","image_file":"gulf_b_01_02.webp","price":100,"sort_order":11},{"id":"gulf_b_01_03","title":"خلیجی 03","category":"gulf_paid","image_file":"gulf_b_01_03.webp","price":100,"sort_order":12},{"id":"gulf_b_01_04","title":"خلیجی 04","category":"gulf_paid","image_file":"gulf_b_01_04.webp","price":100,"sort_order":13},{"id":"gulf_b_01_05","title":"خلیجی 05","category":"gulf_paid","image_file":"gulf_b_01_05.webp","price":100,"sort_order":14},{"id":"gulf_b_02_01","title":"خلیجی 06","category":"gulf_paid","image_file":"gulf_b_02_01.webp","price":100,"sort_order":15},{"id":"gulf_b_02_02","title":"خلیجی 07","category":"gulf_paid","image_file":"gulf_b_02_02.webp","price":100,"sort_order":16},{"id":"gulf_b_02_03","title":"خلیجی 08","category":"gulf_paid","image_file":"gulf_b_02_03.webp","price":100,"sort_order":17},{"id":"gulf_b_02_04","title":"خلیجی 09","category":"gulf_paid","image_file":"gulf_b_02_04.webp","price":100,"sort_order":18},{"id":"gulf_b_02_05","title":"خلیجی 10","category":"gulf_paid","image_file":"gulf_b_02_05.webp","price":100,"sort_order":19},{"id":"gulf_b_03_01","title":"خلیجی 11","category":"gulf_paid","image_file":"gulf_b_03_01.webp","price":100,"sort_order":20},{"id":"gulf_b_03_02","title":"خلیجی 12","category":"gulf_paid","image_file":"gulf_b_03_02.webp","price":100,"sort_order":21},{"id":"gulf_b_03_03","title":"خلیجی 13","category":"gulf_paid","image_file":"gulf_b_03_03.webp","price":100,"sort_order":22},{"id":"gulf_b_03_04","title":"خلیجی 14","category":"gulf_paid","image_file":"gulf_b_03_04.webp","price":100,"sort_order":23},{"id":"gulf_b_03_05","title":"خلیجی 15","category":"gulf_paid","image_file":"gulf_b_03_05.webp","price":100,"sort_order":24},{"id":"regional_c_01_01","title":"منطقه‌ای 01","category":"regional_paid","image_file":"regional_c_01_01.webp","price":100,"sort_order":25},{"id":"regional_c_01_02","title":"منطقه‌ای 02","category":"regional_paid","image_file":"regional_c_01_02.webp","price":100,"sort_order":26},{"id":"regional_c_01_03","title":"منطقه‌ای 03","category":"regional_paid","image_file":"regional_c_01_03.webp","price":100,"sort_order":27},{"id":"regional_c_01_04","title":"منطقه‌ای 04","category":"regional_paid","image_file":"regional_c_01_04.webp","price":100,"sort_order":28},{"id":"regional_c_01_05","title":"منطقه‌ای 05","category":"regional_paid","image_file":"regional_c_01_05.webp","price":100,"sort_order":29},{"id":"regional_c_01_06","title":"منطقه‌ای 06","category":"regional_paid","image_file":"regional_c_01_06.webp","price":100,"sort_order":30},{"id":"regional_c_02_01","title":"منطقه‌ای 07","category":"regional_paid","image_file":"regional_c_02_01.webp","price":100,"sort_order":31},{"id":"regional_c_02_02","title":"منطقه‌ای 08","category":"regional_paid","image_file":"regional_c_02_02.webp","price":100,"sort_order":32},{"id":"regional_c_02_03","title":"منطقه‌ای 09","category":"regional_paid","image_file":"regional_c_02_03.webp","price":100,"sort_order":33},{"id":"regional_c_02_04","title":"منطقه‌ای 10","category":"regional_paid","image_file":"regional_c_02_04.webp","price":100,"sort_order":34},{"id":"regional_c_02_05","title":"منطقه‌ای 11","category":"regional_paid","image_file":"regional_c_02_05.webp","price":100,"sort_order":35},{"id":"regional_c_02_06","title":"منطقه‌ای 12","category":"regional_paid","image_file":"regional_c_02_06.webp","price":100,"sort_order":36},{"id":"regional_c_03_01","title":"منطقه‌ای 13","category":"regional_paid","image_file":"regional_c_03_01.webp","price":100,"sort_order":37},{"id":"regional_c_03_02","title":"منطقه‌ای 14","category":"regional_paid","image_file":"regional_c_03_02.webp","price":100,"sort_order":38},{"id":"regional_c_03_03","title":"منطقه‌ای 15","category":"regional_paid","image_file":"regional_c_03_03.webp","price":100,"sort_order":39},{"id":"regional_c_03_04","title":"منطقه‌ای 16","category":"regional_paid","image_file":"regional_c_03_04.webp","price":100,"sort_order":40},{"id":"regional_c_03_05","title":"منطقه‌ای 17","category":"regional_paid","image_file":"regional_c_03_05.webp","price":100,"sort_order":41},{"id":"regional_c_03_06","title":"منطقه‌ای 18","category":"regional_paid","image_file":"regional_c_03_06.webp","price":100,"sort_order":42},{"id":"fantasy_d_01_01","title":"فانتزی 10","category":"fantasy_free","image_file":"fantasy_d_01_01.webp","price":0,"sort_order":43},{"id":"fantasy_d_01_02","title":"فانتزی 11","category":"fantasy_free","image_file":"fantasy_d_01_02.webp","price":0,"sort_order":44},{"id":"fantasy_d_01_03","title":"فانتزی 12","category":"fantasy_free","image_file":"fantasy_d_01_03.webp","price":0,"sort_order":45},{"id":"fantasy_d_01_04","title":"فانتزی 13","category":"fantasy_free","image_file":"fantasy_d_01_04.webp","price":0,"sort_order":46},{"id":"fantasy_d_01_05","title":"فانتزی 14","category":"fantasy_free","image_file":"fantasy_d_01_05.webp","price":0,"sort_order":47},{"id":"fantasy_d_01_06","title":"فانتزی 15","category":"fantasy_free","image_file":"fantasy_d_01_06.webp","price":0,"sort_order":48},{"id":"fantasy_d_02_01","title":"فانتزی 16","category":"fantasy_free","image_file":"fantasy_d_02_01.webp","price":0,"sort_order":49},{"id":"fantasy_d_02_02","title":"فانتزی 17","category":"fantasy_free","image_file":"fantasy_d_02_02.webp","price":0,"sort_order":50},{"id":"fantasy_d_02_03","title":"فانتزی 18","category":"fantasy_free","image_file":"fantasy_d_02_03.webp","price":0,"sort_order":51},{"id":"fantasy_d_02_04","title":"فانتزی 19","category":"fantasy_free","image_file":"fantasy_d_02_04.webp","price":0,"sort_order":52},{"id":"fantasy_d_02_05","title":"فانتزی 20","category":"fantasy_free","image_file":"fantasy_d_02_05.webp","price":0,"sort_order":53},{"id":"fantasy_d_02_06","title":"فانتزی 21","category":"fantasy_free","image_file":"fantasy_d_02_06.webp","price":0,"sort_order":54},{"id":"fantasy_d_03_01","title":"فانتزی 22","category":"fantasy_free","image_file":"fantasy_d_03_01.webp","price":0,"sort_order":55},{"id":"fantasy_d_03_02","title":"فانتزی 23","category":"fantasy_free","image_file":"fantasy_d_03_02.webp","price":0,"sort_order":56},{"id":"fantasy_d_03_03","title":"فانتزی 24","category":"fantasy_free","image_file":"fantasy_d_03_03.webp","price":0,"sort_order":57},{"id":"fantasy_d_03_04","title":"فانتزی 25","category":"fantasy_free","image_file":"fantasy_d_03_04.webp","price":0,"sort_order":58},{"id":"fantasy_d_03_05","title":"فانتزی 26","category":"fantasy_free","image_file":"fantasy_d_03_05.webp","price":0,"sort_order":59},{"id":"fantasy_d_03_06","title":"فانتزی 27","category":"fantasy_free","image_file":"fantasy_d_03_06.webp","price":0,"sort_order":60}];
function ensureAvatarStore(){
 const host=$('storeContent');if(!host||$('avatarStore'))return;
 const section=document.createElement('section');section.id='avatarStore';
 section.style.cssText='border-top:1px solid #668c78;margin-top:14px;padding-top:12px';
 section.innerHTML='<h3 style="margin:0 0 6px;color:#f4d58b">فروشگاه آواتار بازیکن</h3>'+
  '<div id="avatarStoreBalance" style="font-size:12px;margin-bottom:9px;color:#c4d5cd">در حال آماده‌سازی فهرست آواتارها...</div>'+
  '<div id="avatarStoreFilters" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">'+
  '<button type="button" data-avatar-filter="all">همه</button><button type="button" data-avatar-filter="fantasy_free">فانتزی رایگان</button>'+
  '<button type="button" data-avatar-filter="gulf_paid">خلیجی</button><button type="button" data-avatar-filter="regional_paid">منطقه‌ای</button></div>'+
  '<div id="avatarStoreItems" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px"></div>'+
  '<div id="avatarStoreStatus" role="status" aria-live="polite" style="font-size:12px;line-height:1.8;margin-top:8px"></div>'+
  '<div style="font-size:11px;color:#c4d5cd;line-height:1.8;margin-top:8px">آواتارهای فانتزی رایگان‌اند؛ آواتارهای خلیجی و منطقه‌ای هرکدام ۱۰۰ امتیاز هستند.</div>';
 host.appendChild(section);
 section.querySelectorAll('[data-avatar-filter]').forEach(b=>b.addEventListener('click',()=>{
  avatarFilter=b.dataset.avatarFilter;
  section.querySelectorAll('[data-avatar-filter]').forEach(x=>{x.style.background=x===b?'#f4d58b':'#24483b';x.style.color=x===b?'#17251f':'#fff';});
  renderAvatarItems();
 }));
 section.querySelectorAll('[data-avatar-filter]').forEach((b,i)=>{b.style.cssText='padding:7px 9px;font-size:11px;background:'+(i===0?'#f4d58b':'#24483b')+';color:'+(i===0?'#17251f':'#fff')+';border:1px solid #987c43;border-radius:9px';});
}
function renderAvatarItems(){
 const host=$('avatarStoreItems');if(!host)return;
 const list=avatarItems.filter(x=>avatarFilter==='all'||x.category===avatarFilter);
 host.innerHTML=list.map(item=>{
  const id=String(item.id||''),file=String(item.image_file||'');
  if(!/^[a-z0-9_]{3,48}$/.test(id)||!/^[a-z0-9_]+\.webp$/.test(file))return '';
  const src='./assets/avatars/'+file,owned=!!item.owned||Number(item.price)===0,active=avatarEquipped===id;
  const action=active?'<span style="color:#a8efbd;font-size:11px">آواتار فعال</span>':
   !avatarBackendReady?(Number(item.price)===0?'<button type="button" data-avatar-local="'+esc(id)+'" style="width:100%;padding:7px 3px;font-size:10px">انتخاب روی این دستگاه</button>':'<button type="button" disabled style="width:100%;padding:7px 3px;font-size:10px">خرید پس از فعال‌سازی</button>'):
   owned?'<button type="button" data-avatar-equip="'+esc(id)+'" style="width:100%;padding:7px 3px;font-size:10px">انتخاب</button>':
   avatarCanBuy?'<button type="button" data-avatar-buy="'+esc(id)+'" style="width:100%;padding:7px 3px;font-size:10px">خرید · ۱۰۰ امتیاز</button>':'<button type="button" disabled style="width:100%;padding:7px 3px;font-size:10px">ورود دائمی برای خرید</button>';
  return '<article style="min-width:0;background:#09271f;border:1px solid '+(active?'#e7c879':'#467565')+';border-radius:11px;padding:7px;text-align:center">'+
   '<img loading="lazy" decoding="async" src="'+src+'" alt="'+esc(item.title||'آواتار')+'" style="display:block;width:100%;max-width:88px;aspect-ratio:1;object-fit:cover;border-radius:9px;margin:0 auto 6px;background:#173d30">'+
   '<b style="display:block;font-size:10px;min-height:25px">'+esc(item.title||'آواتار')+'</b>'+
   '<div style="font-size:10px;color:#f4d58b;margin:3px 0 6px">'+(owned?'رایگان / دریافت‌شده':'۱۰۰ امتیاز')+'</div>'+action+'</article>';
 }).join('')||'<div style="grid-column:1/-1;text-align:center;padding:12px;color:#c4d5cd">در این گروه آواتاری وجود ندارد.</div>';
 host.querySelectorAll('[data-avatar-buy]').forEach(b=>b.addEventListener('click',()=>buyAvatar(b.dataset.avatarBuy)));
 host.querySelectorAll('[data-avatar-equip]').forEach(b=>b.addEventListener('click',()=>equipAvatar(b.dataset.avatarEquip)));
 host.querySelectorAll('[data-avatar-local]').forEach(b=>b.addEventListener('click',()=>selectAvatarLocally(b.dataset.avatarLocal)));
}
let avatarEquipped=null;
async function loadAvatarStore(){
 ensureAvatarStore();
 const balance=$('avatarStoreBalance'),status=$('avatarStoreStatus');
 if(!balance||avatarBusy)return;
 avatarBusy=true;
 try{
  status.textContent='';avatarCanBuy=false;avatarBackendReady=false;balance.textContent='در حال دریافت فهرست آواتارها...';
  const api=window.DoubleKoutOnline;
  if(!api||!api.getSession)throw new Error('اتصال حساب مرکزی در دسترس نیست.');
  const session=await api.getSession();
  if(!session||!session.user)throw new Error('برای مشاهده آواتارها ابتدا وارد حساب بازی شو.');
  const data=await call('get_avatar_store_catalog');
  if(!data||!Array.isArray(data.items))throw new Error('فهرست آواتارها از سرور دریافت نشد.');
  avatarItems=data.items;avatarEquipped=data.equipped||null;avatarBackendReady=true;
  if(avatarEquipped){
   const equippedItem=avatarItems.find(x=>x.id===avatarEquipped);
   if(equippedItem){
    const image='./assets/avatars/'+equippedItem.image_file;
    try{localStorage.setItem('doubleKoutAvatarId',avatarEquipped);localStorage.setItem('doubleKoutAvatarImage',image);}catch(_){}
    const preview=$('selectedAvatarPreview');if(preview){preview.src=image;preview.classList.remove('hidden');}
    window.dispatchEvent(new CustomEvent('doublekout:avatar-changed',{detail:{avatarId:avatarEquipped,image}}));
   }
  }
  const permanent=!session.user.is_anonymous;avatarCanBuy=permanent;
  balance.textContent=(permanent?'موجودی حساب: ':'حساب مهمان · موجودی: ')+Number(data.points||0).toLocaleString('fa-IR')+' امتیاز · '+avatarItems.length+' آواتار';
  renderAvatarItems();
 }catch(e){
  avatarBackendReady=false;avatarCanBuy=false;avatarItems=avatarStaticCatalog;
  try{avatarEquipped=localStorage.getItem('doubleKoutAvatarId')||null;}catch(_){avatarEquipped=null;}
  balance.textContent='۶۰ آواتار تصویری آماده نمایش · ۲۷ رایگان · ۳۳ آواتار ۱۰۰ امتیازی';
  renderAvatarItems();
  status.textContent='نمایش تصاویر فعال است؛ خرید و ثبت انتخاب پس از فعال‌سازی سرویس حساب انجام می‌شود. موجودی و امتیاز بازیکنان دست‌نخورده است.';
 }finally{avatarBusy=false;}
}
function selectAvatarLocally(id){
 const item=avatarItems.find(x=>x.id===id);if(!item||Number(item.price)!==0)return;
 const image='./assets/avatars/'+item.image_file;
 try{localStorage.setItem('doubleKoutAvatarId',id);localStorage.setItem('doubleKoutAvatarImage',image);}catch(_){}
 avatarEquipped=id;renderAvatarItems();
 const preview=$('selectedAvatarPreview');if(preview){preview.src=image;preview.classList.remove('hidden');}
 const status=$('avatarStoreStatus');if(status)status.textContent='آواتار رایگان روی همین دستگاه انتخاب شد؛ ثبت در حساب پس از فعال‌سازی سرویس فروشگاه ممکن می‌شود.';
 window.dispatchEvent(new CustomEvent('doublekout:avatar-changed',{detail:{avatarId:id,image,localOnly:true}}));
}
async function buyAvatar(id){
 const status=$('avatarStoreStatus');if(!status)return;
 status.textContent='در حال بررسی موجودی و ثبت خرید...';
 try{
  const result=await call('purchase_avatar',{p_avatar_id:id});
  status.textContent=result&&result.already_owned?'این آواتار قبلاً خریداری شده است.':'خرید آواتار با موفقیت ثبت شد.';
  await loadAvatarStore();
 }catch(e){status.textContent=e.message==='not_enough_points'?'امتیاز کافی برای خرید این آواتار نداری.':(e.message||'خرید آواتار انجام نشد.');}
}
async function equipAvatar(id){
 const status=$('avatarStoreStatus');if(!status)return;
 status.textContent='در حال انتخاب آواتار...';
 try{
  await call('equip_avatar',{p_avatar_id:id});
  const item=avatarItems.find(x=>x.id===id);
  if(item){
   try{localStorage.setItem('doubleKoutAvatarId',id);localStorage.setItem('doubleKoutAvatarImage','./assets/avatars/'+item.image_file);}catch(_){}
   const preview=$('selectedAvatarPreview');if(preview){preview.src='./assets/avatars/'+item.image_file;preview.classList.remove('hidden');}
   window.dispatchEvent(new CustomEvent('doublekout:avatar-changed',{detail:{avatarId:id,image:'./assets/avatars/'+item.image_file}}));
  }
  status.textContent='آواتار برای حساب شما فعال شد.';
  await loadAvatarStore();
 }catch(e){status.textContent=e.message||'انتخاب آواتار انجام نشد.';}
}
function openAvatarStoreFromCustomizer(){
 const modal=$('storeModal'),host=$('storeContent');
 if(!modal||!host){
  const status=$('avatarStoreStatus');
  if(status)status.textContent='پنجره فروشگاه پیدا نشد؛ صفحه را یک‌بار تازه‌سازی کن.';
  return;
 }
 if(modal.parentElement!==document.body)document.body.appendChild(modal);
 modal.classList.remove('hidden');
 modal.style.display='flex';
 modal.style.zIndex='100050';
 modal.setAttribute('aria-hidden','false');
 document.body.style.overflow='hidden';
 loadAvatarStore();
}
// Capture the customizer action before other page-level click handlers.
document.addEventListener('click',e=>{
 const target=e.target&&e.target.closest?e.target.closest('#openAvatarStoreFromCustomizer'):null;
 if(!target)return;
 e.preventDefault();
 e.stopPropagation();
 openAvatarStoreFromCustomizer();
},true);
window.DoubleKoutStore=window.DoubleKoutStore||{};
window.DoubleKoutStore.openAvatarStore=openAvatarStoreFromCustomizer;

function preview(theme){const t=themes[theme]||themes['blue-gold'];return '<div aria-hidden="true" style="width:58px;height:82px;margin:0 auto 7px;border:3px solid '+t.edge+';border-radius:8px;background:'+t.bg+';box-shadow:inset 0 0 0 2px #ffffff22,0 4px 9px #0008;position:relative"><div style="position:absolute;inset:7px;border:1px solid '+t.edge+';border-radius:4px;background:repeating-linear-gradient(45deg,transparent 0 6px,'+t.glow+'33 6px 8px)"></div><b style="position:absolute;left:0;right:0;top:35px;text-align:center;font:italic 700 7px Georgia;color:#ffe6a0">Abdulhamid</b></div>';}
async function call(name,args){const api=window.DoubleKoutOnline;if(!api||!api.rpc)throw new Error('اتصال حساب مرکزی آماده نیست.');const r=await api.rpc(name,args||{});if(r.error)throw r.error;return r.data;}
async function refresh(){
 ensure();
 if(busy){refreshQueued=true;return;}
 busy=true;
 try{
  const balance=$('storeBalance'),itemsHost=$('storeItems'),status=$('storeStatus');
  balance.textContent='در حال بررسی حساب و دریافت طرح‌ها...';status.textContent='';
  const api=window.DoubleKoutOnline;
  if(!api||!api.getSession)throw new Error('اتصال حساب مرکزی در دسترس نیست؛ صفحه را یک‌بار تازه‌سازی کن.');
  const session=await api.getSession();
  if(!session||!session.user){
   balance.textContent='برای مشاهده موجودی، ابتدا وارد حساب بازی شو.';
   itemsHost.innerHTML='<div style="grid-column:1/-1;padding:12px;border:1px dashed #b99b5c;border-radius:10px;text-align:center">برای نمایش فهرست و موجودی، وارد حساب بازی شو.</div>';
   return;
  }
  const permanent=!session.user.is_anonymous;
  const data=await call('get_store_catalog');
  if(!data||!Array.isArray(data.items))throw new Error('پاسخ فهرست فروشگاه معتبر نیست.');
  balance.textContent=permanent?'موجودی شما: '+Number(data.points||0)+' امتیاز':'حساب مهمان · موجودی قابل خرید: '+Number(data.points||0)+' امتیاز · برای خرید وارد حساب دائمی شو';
  itemsHost.innerHTML=data.items.length?data.items.map(item=>{
   const owned=!!item.owned,active=data.equipped===item.id;
   return '<article style="background:#09271f;border:1px solid '+(active?'#e7c879':'#467565')+';border-radius:12px;padding:9px;text-align:center">'+preview(item.theme)+'<b style="font-size:12px">'+esc(item.title)+'</b><div style="font-size:10px;color:#c4d5cd;min-height:30px;margin:4px 0">'+esc(item.description)+'</div><div style="font-size:11px;color:#f4d58b;margin-bottom:6px">'+(owned?'دریافت‌شده':Number(item.price)+' امتیاز')+'</div>'+(active?'<span style="font-size:11px;color:#a8efbd">طرح فعال</span>':owned?'<button data-equip="'+esc(item.id)+'" style="width:100%;padding:7px;font-size:11px">استفاده از طرح</button>':permanent?'<button data-buy="'+esc(item.id)+'" style="width:100%;padding:7px;font-size:11px">خرید با امتیاز</button>':'<button disabled style="width:100%;padding:7px;font-size:11px">ورود دائمی برای خرید</button>')+'</article>';
  }).join(''):'<div style="grid-column:1/-1;padding:12px;text-align:center">فعلاً طرح فعالی برای فروش ثبت نشده است.</div>';
  itemsHost.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>purchase(b.dataset.buy)));
  itemsHost.querySelectorAll('[data-equip]').forEach(b=>b.addEventListener('click',()=>equip(b.dataset.equip)));
  applyTheme(data.equipped);
 }catch(e){
  $('storeBalance').textContent='دریافت فروشگاه ناموفق بود.';
  $('storeItems').innerHTML='<div style="grid-column:1/-1;padding:12px;border:1px solid #a75b52;border-radius:10px;text-align:center">فهرست فروشگاه بارگذاری نشد. از دکمه «تلاش دوباره» استفاده کن.</div>';
  $('storeStatus').textContent='جزئیات خطا: '+(e.message||e);
 }finally{
  busy=false;
  Promise.resolve().then(loadAvatarStore);
  if(refreshQueued){refreshQueued=false;Promise.resolve().then(refresh);}
 }
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
window.DoubleKoutStore={refresh,applyTheme,refreshAvatars:loadAvatarStore};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensure();});else ensure();
document.addEventListener('click',e=>{if(e.target&&e.target.id==='onlineRefreshProgress')setTimeout(refresh,100);});
document.addEventListener('dblclick',()=>{});
const oldRefresh=window.DoubleKoutProgress&&window.DoubleKoutProgress.refresh;
if(oldRefresh){const wrap=async function(){const r=await oldRefresh.apply(this,arguments);refresh();return r;};window.DoubleKoutProgress.refresh=wrap;}
window.addEventListener('load',()=>{ensure();refresh();});
})();
