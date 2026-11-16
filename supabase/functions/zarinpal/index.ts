import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, GET, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const appUrl=Deno.env.get("APP_RETURN_URL")||"https://ahdehwari-commits.github.io/Doublekout-/";
const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const merchant=Deno.env.get("ZARINPAL_MERCHANT_ID")||"";
const sandbox=Deno.env.get("ZARINPAL_SANDBOX")==="true";
const base=sandbox?"https://sandbox.zarinpal.com":"https://payment.zarinpal.com";
const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const url=new URL(req.url);
 if(req.method==="GET"&&url.searchParams.has("Authority")){
  const authority=url.searchParams.get("Authority")||"";
  const status=url.searchParams.get("Status")||"NOK";
  const {data:order,error}=await admin.from("point_payment_orders").select("id,amount_rial").eq("authority",authority).eq("source","zarinpal").maybeSingle();
  if(error||!order)return Response.redirect(appUrl+"?payment=not-found",303);
  if(status!=="OK"){await admin.rpc("complete_zarinpal_payment",{p_order_id:order.id,p_authority:authority,p_ref_id:"",p_success:false});return Response.redirect(appUrl+"?payment=cancelled",303);}
  if(!merchant)return Response.redirect(appUrl+"?payment=configuration-error",303);
  try{
   const vr=await fetch(base+"/pg/v4/payment/verify.json",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({merchant_id:merchant,amount:order.amount_rial,authority})});
   const payload=await vr.json();const code=Number(payload?.data?.code);const ref=String(payload?.data?.ref_id||"");
   const success=code===100||code===101;
   const done=await admin.rpc("complete_zarinpal_payment",{p_order_id:order.id,p_authority:authority,p_ref_id:ref,p_success:success});
   if(done.error)throw done.error;
   return Response.redirect(appUrl+(success?"?payment=success":"?payment=failed"),303);
  }catch(_){return Response.redirect(appUrl+"?payment=verification-error",303);}
 }
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 if(!merchant)return json({error:"zarinpal_not_configured"},503);
 const token=req.headers.get("Authorization")||"";
 const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await userClient.auth.getUser();
 if(userError||!user||user.is_anonymous)return json({error:"permanent_account_required"},401);
 let body:{package_id?:string};try{body=await req.json();}catch{return json({error:"invalid_json"},400);}
 const {data:pkg,error:pkgError}=await admin.from("point_topup_packages").select("id,title,price_toman,points").eq("id",body.package_id||"").eq("active",true).maybeSingle();
 if(pkgError||!pkg)return json({error:"package_not_found"},404);
 const callback=Deno.env.get("SUPABASE_URL")+"/functions/v1/zarinpal";
 const {data:order,error:insertError}=await admin.from("point_payment_orders").insert({user_id:user.id,package_id:pkg.id,source:"zarinpal",status:"pending",amount_toman:pkg.price_toman,amount_rial:pkg.price_toman*10,points:pkg.points}).select("id").single();
 if(insertError||!order)return json({error:"order_creation_failed"},500);
 try{
  const response=await fetch(base+"/pg/v4/payment/request.json",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({merchant_id:merchant,amount:pkg.price_toman*10,callback_url:callback,description:"خرید امتیاز Double Kout - "+pkg.title,metadata:{email:user.email||""}})});
  const result=await response.json();const code=Number(result?.data?.code);const authority=String(result?.data?.authority||"");
  if(code!==100||!authority){await admin.from("point_payment_orders").update({status:"failed"}).eq("id",order.id);return json({error:"gateway_request_failed",code},502);}
  const {error:updateError}=await admin.from("point_payment_orders").update({authority}).eq("id",order.id);
  if(updateError)return json({error:"order_update_failed"},500);
  return json({url:(sandbox?"https://sandbox.zarinpal.com":"https://www.zarinpal.com")+"/pg/StartPay/"+authority});
 }catch(_){await admin.from("point_payment_orders").update({status:"failed"}).eq("id",order.id);return json({error:"gateway_unavailable"},502);}
});
