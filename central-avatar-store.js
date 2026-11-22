/* Double Kout 10.2 — account-bound avatar catalog and personalization */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let catalog=null,busy=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function rpc(name,args){
 const api=window.DoubleKoutOnline;
 if(!api||!api.rpc)throw new Error('اتصال حساب مرکزی آماده نیست.');
 const r=await api.rpc(name,args||{});
 if(r.error)throw r.error;
 return r.data;
}
function render(data){
 const host=$('personalAvatarPicker');if(!host)return;
 const items=Array.isArray(data.items)?data.items:[];
 const groups=[['fantasy','آواتارهای رایگان'],['gulf','آواتارهای خلیجی ویژه']];
 host.innerHTML='';
 groups.forEach(([category,title])=>{
  const list=items.filter(x=>x.category===category);
  const section=document.createElement('section');section.className='avatar-store-group';
  const heading=document.createElement('h4');heading.textContent=title;section.appendChild(heading);
  const grid=document.createElement('div');grid.className='avatar-store-grid';
  list.forEach(item=>{
   const owned=!!item.owned,active=data.equipped===item.id;
   const button=document.createElement('button');button.type='button';
   button.className='avatar-store-item'+(active?' selected':'');
   button.dataset.avatarId=item.id;button.disabled=busy;
   const img=document.createElement('img');img.src=item.asset_path;img.alt=item.title;img.loading='lazy';img.width=160;img.height=160;
   const name=document.createElement('span');name.textContent=item.title;
   const status=document.createElement('small');status.textContent=active?'آواتار فعال':owned?'متعلق به شما':item.free?'رایگان':Number(item.price)+' امتیاز';
   button.append(img,name,status);grid.appendChild(button);
  });
  section.appendChild(grid);host.appendChild(section);
 });
 const balance=$('avatarStoreBalance');
 if(balance)balance.textContent='موجودی: '+Number(data.points||0)+' امتیاز · آواتارهای رایگان برای همه قابل انتخاب‌اند.';
 const status=$('avatarStoreStatus');if(status)status.textContent='';
}
async function refresh(){
 if(busy)return;
 const host=$('personalAvatarPicker');if(!host)return;
 const status=$('avatarStoreStatus');if(status)status.textContent='در حال دریافت آواتارهای حساب...';
 try{
  const data=await rpc('get_avatar_catalog');if(!data||!Array.isArray(data.items))throw new Error('فهرست آواتار معتبر نیست.');
  catalog=data;render(data);
  if(data.equipped){
   const item=data.items.find(x=>x.id===data.equipped);
   if(item)applySelection(item);
  }
 }catch(e){if(status)status.textContent='آواتارها بارگذاری نشدند: '+(e.message||e);}
}
function applySelection(item){
 try{localStorage.setItem('doubleKoutAvatarId',item.id);localStorage.setItem('doubleKoutAvatarAsset',item.asset_path);}catch(_){}
 const host=$('personalAvatarPicker');
 if(host)host.querySelectorAll('[data-avatar-id]').forEach(b=>b.classList.toggle('selected',b.dataset.avatarId===item.id));
 window.dispatchEvent(new CustomEvent('doublekout:avatar-changed',{detail:{avatarId:item.id,assetPath:item.asset_path,category:item.category}}));
}
async function choose(id){
 if(busy||!catalog)return;
 const item=catalog.items.find(x=>x.id===id);if(!item)return;
 const owned=!!item.owned;
 if(!owned){
  if(item.free===false){
   if(!window.confirm('خرید «'+item.title+'» با '+Number(item.price)+' امتیاز انجام شود؟'))return;
  }
 }
 busy=true;render(catalog);
 const status=$('avatarStoreStatus');
 try{
  if(!owned){
   const purchase=await rpc('purchase_avatar',{p_avatar_id:id});
   if(purchase&&purchase.already_owned!==true&&purchase.purchased!==true)throw new Error('خرید آواتار تأیید نشد.');
  }
  await rpc('equip_avatar',{p_avatar_id:id});
  if(status)status.textContent='آواتار انتخابی با موفقیت در حساب شما ذخیره شد.';
  await refresh();
 }catch(e){
  if(status)status.textContent=e.message==='not_enough_points'?'امتیاز کافی برای خرید این آواتار ندارید.':(e.message||'خرید یا انتخاب آواتار انجام نشد.');
 }finally{busy=false;if(catalog)render(catalog);}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('#personalAvatarPicker [data-avatar-id]');
 if(b){e.preventDefault();choose(b.dataset.avatarId);}
 if(e.target.closest('#openPersonalization'))setTimeout(refresh,0);
});
window.addEventListener('doublekout:avatar-refresh',refresh);
window.DoubleKoutAvatars={refresh,getCatalog:()=>catalog,getSelected:()=>localStorage.getItem('doubleKoutAvatarId')||null};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{});
})();
