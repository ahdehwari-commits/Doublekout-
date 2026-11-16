/* Double Kout top-ups and admin console. No client-side authority can grant points. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('fa-IR')+' تومان';
let selectedUser=null,busy=false;
async function rpc(name,args){const r=await window.DoubleKoutOnline.rpc(name,args||{});if(r.error)throw r.error;return r.data;}
async function invoke(name,body){const r=await window.DoubleKoutOnline.invoke(name,body||{});if(r.error)throw r.error;return r.data;}
function ensure(){
 const host=$('onlineProgress');if(!host||$('pointTopups'))return;
 const top=document.createElement('section');top.id='pointTopups';top.style.cssText='border-top:1px solid #668c78;margin-top:12px;padding-top:10px';
 top.innerHTML='<h3 style="color:#f4d58b;margin:0 0 8px">خرید امتیاز</h3><div id="topupHint" class="muted">بسته موردنظر را انتخاب کن. پرداخت پس از تأیید درگاه به‌صورت خودکار ثبت می‌شود.</div><div id="topupPackages" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:8px"></div><div id="topupStatus" role="status" class="muted" style="margin-top:7px"></div>';
 host.appendChild(top);
 const admin=document.createElement('section');admin.id='centralAdminPanel';admin.style.cssText='display:none;border-top:2px solid #d7b66c;margin-top:16px;padding-top:12px';
 admin.innerHTML='<h3 style="color:#f4d58b;margin:0 0 8px">پنل مدیریت مرکزی</h3><div id="adminStatus" role="status" class="muted">بررسی دسترسی مدیر...</div><div id="adminTools" style="display:none"><div style="display:flex;gap:6px"><input id="adminSearch" placeholder="جست‌وجوی نام، ایمیل یا شناسه بازیکن" style="flex:1;min-width:0;padding:9px;border-radius:8px"><button id="adminSearchBtn">جست‌وجو</button></div><div id="adminPlayers" style="margin-top:8px"></div><div id="adminSelected" style="margin-top:8px"></div><div style="margin-top:10px;padding:9px;background:#09271f;border-radius:10px"><b>ثبت پرداخت دستی پس از دریافت وجه</b><select id="adminPackage" style="width:100%;margin:7px 0;padding:8px"></select><input id="adminReference" placeholder="شماره پیگیری / شناسه واریز" style="width:100%;padding:8px"><button id="adminCreateManual" style="width:100%;margin-top:7px">ثبت پرداخت در انتظار تأیید</button></div><div style="margin-top:12px"><b>پرداخت‌های در انتظار</b><div id="adminOrders" style="margin-top:7px"></div></div><div id="adminRoleBox" style="display:none;margin-top:12px;padding:9px;background:#09271f;border-radius:10px"><b>مدیریت مدیران</b><select id="adminRole" style="width:100%;margin:7px 0;padding:8px"><option value="finance">مدیر مالی</option><option value="support">پشتیبانی</option><option value="super_admin">مدیرکل</option></select><button id="adminSetRole">ثبت سطح دسترسی برای بازیکن انتخاب‌شده</button></div></div>';
 host.appendChild(admin);
 $('adminSearchBtn').onclick=searchPlayers;$('adminCreateManual').onclick=createManual;$('adminSetRole').onclick=setRole;
}
async function loadPackages(){
 const data=await rpc('get_topup_packages');const items=Array.isArray(data)?data:[];
 $('topupPackages').innerHTML=items.map(p=>'<article style="background:#09271f;border:1px solid #467565;border-radius:10px;padding:9px;text-align:center"><b>'+esc(p.title)+'</b><div style="color:#f4d58b;font-size:18px;margin:5px 0">'+Number(p.points).toLocaleString('fa-IR')+' امتیاز</div><div class="muted">'+money(p.price_toman)+'</div><button data-package="'+esc(p.id)+'" style="width:100%;margin-top:7px">پرداخت آنلاین</button></article>').join('');
 $('topupPackages').querySelectorAll('[data-package]').forEach(b=>b.onclick=()=>startPayment(b.dataset.package));
}
async function startPayment(id){
 if(busy)return;busy=true;$('topupStatus').textContent='در حال ساخت سفارش امن پرداخت...';
 try{const data=await invoke('zarinpal',{package_id:id});if(!data||!data.url)throw new Error(data&&data.error||'ساخت لینک پرداخت ناموفق بود.');window.location.href=data.url;}
 catch(e){$('topupStatus').textContent='پرداخت آنلاین هنوز فعال نیست: '+(e.message||e)+'. مدیر باید تنظیمات امن درگاه را تکمیل کند.';}
 finally{busy=false;}
}
async function loadAdmin(){
 ensure();const panel=$('centralAdminPanel');if(!panel)return;
 try{
  const allowed=await rpc('has_admin_role',{p_roles:['super_admin','finance','support']});
  if(!allowed){panel.style.display='none';return;}
  panel.style.display='block';$('adminTools').style.display='block';$('adminStatus').textContent='دسترسی مدیر تأیید شد. همه عملیات ثبت امتیاز در سوابق مرکزی ذخیره می‌شود.';
  const superAdmin=await rpc('has_admin_role',{p_roles:['super_admin']});$('adminRoleBox').style.display=superAdmin?'block':'none';
  const packages=await rpc('get_topup_packages');$('adminPackage').innerHTML=packages.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title)+' · '+money(p.price_toman)+'</option>').join('');
  await loadOrders();
 }catch(e){panel.style.display='none';console.warn('Admin panel access check:',e.message||e);}
}
async function searchPlayers(){
 try{const data=await rpc('get_admin_dashboard',{p_query:$('adminSearch').value.trim(),p_limit:40});const players=data.players||[];
  $('adminPlayers').innerHTML=players.length?players.map(p=>'<button data-user="'+esc(p.user_id)+'" style="display:block;width:100%;text-align:right;margin:4px 0;background:#123d31;color:white;border:1px solid #467565"><b>'+esc(p.display_name)+'</b> · '+esc(p.email||'')+'<br><small>'+Number(p.points).toLocaleString('fa-IR')+' امتیاز · '+Number(p.wins).toLocaleString('fa-IR')+' برد</small></button>').join(''):'بازیکنی پیدا نشد.';
  $('adminPlayers').querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>selectPlayer(players.find(p=>p.user_id===b.dataset.user)));
 }catch(e){$('adminStatus').textContent='خطا در جست‌وجو: '+(e.message||e);}
}
function selectPlayer(p){if(!p)return;selectedUser=p;$('adminSelected').innerHTML='<div style="padding:9px;border:1px solid #d7b66c;border-radius:9px"><b>بازیکن انتخاب‌شده: '+esc(p.display_name)+'</b><br>'+esc(p.email||'')+'<br>موجودی: '+Number(p.points).toLocaleString('fa-IR')+' امتیاز<br><input id="adminDelta" type="number" placeholder="مثلاً ۵۰ یا ۱۰-" style="width:100%;margin:7px 0;padding:8px"><input id="adminReason" maxlength="240" placeholder="علت افزایش یا اصلاح امتیاز" style="width:100%;padding:8px"><button id="adminAdjust" style="width:100%;margin-top:7px">ثبت تغییر موجودی</button></div>';
 $('adminAdjust').onclick=async()=>{try{const delta=Number($('adminDelta').value),reason=$('adminReason').value.trim();const r=await rpc('admin_adjust_points',{p_user_id:p.user_id,p_delta:delta,p_reason:reason});$('adminStatus').textContent='تغییر ثبت شد؛ موجودی جدید: '+Number(r.points).toLocaleString('fa-IR');await searchPlayers();}catch(e){$('adminStatus').textContent='ثبت تغییر انجام نشد: '+(e.message||e);}};}
async function createManual(){if(!selectedUser){$('adminStatus').textContent='ابتدا بازیکن را جست‌وجو و انتخاب کن.';return;}try{const id=await rpc('admin_create_manual_payment',{p_user_id:selectedUser.user_id,p_package_id:$('adminPackage').value,p_reference:$('adminReference').value.trim()});$('adminStatus').textContent='سفارش پرداخت دستی ثبت شد. پس از تطبیق رسید با گردش حساب، آن را تأیید کن. شناسه: '+id;$('adminReference').value='';await loadOrders();}catch(e){$('adminStatus').textContent='ثبت پرداخت ناموفق بود: '+(e.message||e);}}
async function loadOrders(){try{const rows=await rpc('admin_get_payment_orders',{p_status:'pending',p_limit:100});$('adminOrders').innerHTML=rows.length?rows.map(o=>'<article style="padding:9px;margin:6px 0;border:1px solid #467565;border-radius:9px"><b>'+esc(o.display_name||'بازیکن')+'</b> · '+esc(o.email||'')+'<br>'+esc(o.package_title)+' · '+money(o.amount_toman)+' · '+Number(o.points)+' امتیاز<br>روش: '+(o.source==='manual'?'دستی':'زرین‌پال')+' · '+esc(o.payment_reference||'درگاه')+'<br><small>'+esc(o.id)+'</small>'+(o.source==='manual'?'<div style="display:flex;gap:6px;margin-top:7px"><button data-approve="'+esc(o.id)+'">تأیید و واریز امتیاز</button><button data-reject="'+esc(o.id)+'" class="secondary">رد پرداخت</button></div>':'<div class="muted">پرداخت آنلاین فقط با تأیید سرور درگاه به موجودی اضافه می‌شود.</div>')+'</article>').join(''):'پرداخت در انتظار بررسی وجود ندارد.';
 $('adminOrders').querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>review(b.dataset.approve,true));$('adminOrders').querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>review(b.dataset.reject,false));
 }catch(e){$('adminOrders').textContent='دریافت پرداخت‌ها ناموفق بود: '+(e.message||e);}}
async function review(id,approve){try{const note=prompt(approve?'یادداشت تأیید (اختیاری):':'علت رد پرداخت:')||'';await rpc('admin_review_manual_payment',{p_order_id:id,p_approve:approve,p_note:note});$('adminStatus').textContent=approve?'پرداخت تأیید شد و امتیاز فقط یک‌بار واریز شد.':'پرداخت رد شد و امتیازی واریز نشد.';await loadOrders();await searchPlayers();}catch(e){$('adminStatus').textContent='بررسی پرداخت ناموفق بود: '+(e.message||e);}}
async function setRole(){if(!selectedUser)return;try{await rpc('admin_set_role',{p_user_id:selectedUser.user_id,p_role:$('adminRole').value,p_active:true});$('adminStatus').textContent='سطح دسترسی مدیر ثبت شد.';}catch(e){$('adminStatus').textContent='تغییر سطح دسترسی انجام نشد: '+(e.message||e);}}
async function refresh(){ensure();try{await loadPackages();}catch(e){$('topupHint').textContent='بسته‌های خرید پس از اعمال مهاجرت پایگاه داده نمایش داده می‌شوند.';}await loadAdmin();}
window.DoubleKoutPaymentsAdmin={refresh,loadAdmin};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
window.addEventListener('load',refresh);
})();
