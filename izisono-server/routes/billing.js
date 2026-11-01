import express from 'express';
import crypto from 'node:crypto';
import { requireUser } from '../supabase.js';

const router=express.Router();
const BASE='https://lomopay.net/api/v1';
const PAYMENT_CURRENCY='XOF', DISPLAY_CURRENCY='XOF';
const PLANS=[
{id:'discovery',name:'Découverte',price:1900,credits:4,popular:false,description:'Pour découvrir izisono et créer 2 chansons'},
{id:'popular',name:'Populaire',price:3490,credits:10,popular:true,description:'Le meilleur équilibre pour créer régulièrement'},
{id:'premium',name:'Premium',price:9990,credits:24,popular:false,description:'Pour les créateurs intensifs et les événements'}];
const PAYMENT_METHODS=[
{code:'togocel',name:'Togocel Money',short:'T-Money',country:'TG',icon:'📱'},
{code:'moov_tg',name:'Moov Money Togo',short:'Moov Money',country:'TG',icon:'📲'}];

function credentials(){
 const publicKey=process.env.LOMOPAY_PUBLIC_KEY,secretKey=process.env.LOMOPAY_SECRET_KEY;
 if(!publicKey||!secretKey)throw Object.assign(new Error('lomopay_credentials_missing'),{status:503});
 if(!/^(pk_live_|pk_test_)/.test(publicKey)||!/^(sk_live_|sk_test_)/.test(secretKey)||publicKey.includes('_test_')!==secretKey.includes('_test_'))throw Object.assign(new Error('lomopay_credentials_invalid'),{status:503});
 return {publicKey,secretKey};
}
const displayRate=()=>1,displayPrice=x=>Math.round(Number(x));
function publicUrl(){return String(process.env.PUBLIC_APP_URL||process.env.CLIENT_URL||'http://localhost:3000').split(',')[0].trim().replace(/\/$/,'');}
function adminConfig(){const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Object.assign(new Error('supabase_service_role_key_missing'),{status:500});return {url,key};}
async function supabaseAdmin(path,options={}){const {url,key}=adminConfig();const r=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json','Content-Type':'application/json',...(options.headers||{})}});const data=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||'supabase_admin_request_failed'),{status:r.status,payload:data});return data;}
async function rpc(name,args){return supabaseAdmin(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});}
async function record({userId,paymentId,plan,method,payload,status='initiated'}){return rpc('record_paydunya_transaction',{p_user_id:userId,p_payment_id:paymentId,p_plan_id:plan.id,p_amount:plan.price,p_currency:PAYMENT_CURRENCY,p_credits:plan.credits,p_status:status,p_method:method||null,p_gateway:'lomopay',p_raw_payload:payload||{}});}
function normalizePhone(value){const d=String(value||'').replace(/\D/g,'');if(/^228\d{8}$/.test(d))return `+${d}`;if(/^0\d{8}$/.test(d))return `+228${d.slice(1)}`;if(/^\d{8}$/.test(d))return `+228${d}`;throw Object.assign(new Error('invalid_togo_phone'),{status:400});}
function operatorFor(method){const key=method==='togocel'?'LOMOPAY_TG_TOGOCEL_OPERATOR':'LOMOPAY_TG_MOOV_OPERATOR';const value=String(process.env[key]||'').trim();if(!value)throw Object.assign(new Error('lomopay_operator_not_configured'),{status:503});return value;}
async function lomo(path,options={}){const {publicKey,secretKey}=credentials();const r=await fetch(BASE+path,{...options,headers:{'X-Public-Key':publicKey,'X-Secret-Key':secretKey,'Content-Type':'application/json',Accept:'application/json',...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok||data?.success===false){const code=data?.error?.code||data?.code||data?.error||data?.message||`lomopay_http_${r.status}`;throw Object.assign(new Error(String(code)),{status:r.status||502,payload:data});}return data;}
function payloadData(x){return x?.data?.data||x?.data||x||{};}
async function getPayment(ref){return payloadData(await lomo(`/payments.php?external_reference=${encodeURIComponent(ref)}`,{method:'GET'}));}
async function localPayment(ref){const rows=await supabaseAdmin(`payment_transactions?payment_id=eq.${encodeURIComponent(ref)}&select=user_id,payment_id,plan_id,amount,currency,credits,status,gateway,method&limit=1`);return rows?.[0]||null;}
async function creditPayment(ref){if(!ref)throw new Error('payment_reference_missing');const p=await getPayment(ref),local=await localPayment(ref);if(!local||local.gateway!=='lomopay')throw new Error('payment_reference_unknown');const plan=PLANS.find(x=>x.id===local.plan_id);if(!plan)throw new Error('payment_metadata_invalid');if(String(p.currency||local.currency||'').toUpperCase()!==PAYMENT_CURRENCY)throw new Error('payment_currency_invalid');const amount=Number(p.amount||p.total_amount||0);if(!Number.isFinite(amount)||amount<plan.price)throw new Error('payment_amount_invalid');const status=String(p.status||'').toLowerCase();if(status!=='completed')return {credited:false,status:status||'unknown',paymentId:ref};return (await rpc('apply_paydunya_payment',{p_user_id:local.user_id,p_payment_id:ref,p_plan_id:plan.id,p_amount:amount,p_currency:PAYMENT_CURRENCY,p_credits:plan.credits,p_status:'completed',p_method:local.method||p.method||null,p_gateway:'lomopay',p_raw_payload:p}))||{credited:false,status:'completed',paymentId:ref};}

router.get('/plans',(_req,res)=>res.json({currency:PAYMENT_CURRENCY,display_currency:DISPLAY_CURRENCY,display_rate:displayRate(),payment_provider:'LomoPay Direct API',plans:PLANS.map(p=>({...p,display_price:displayPrice(p.price)})),payment_methods:PAYMENT_METHODS}));
router.get('/methods',(_req,res)=>res.json({currency:PAYMENT_CURRENCY,payment_provider:'LomoPay Direct API',methods:PAYMENT_METHODS}));

router.post('/checkout',async(req,res)=>{
 let ref=null,ctx=null;
 try{
  const {user}=await requireUser(req),plan=PLANS.find(p=>p.id===req.body?.plan),method=String(req.body?.payment_method||'togocel');
  if(!plan)return res.status(400).json({error:'invalid_plan'});
  if(!PAYMENT_METHODS.some(m=>m.code===method))return res.status(400).json({error:'invalid_payment_method'});
  const phone=normalizePhone(req.body?.phone),operator=operatorFor(method),email=user.email||'';
  const name=(email.split('@')[0]||'Utilisateur').replace(/[^a-zA-ZÀ-ÿ0-9 _-]/g,' ').trim().slice(0,60)||'Utilisateur';
  ref='izo_'+crypto.randomUUID();ctx={userId:user.id,plan,method};
  await record({userId:user.id,paymentId:ref,plan,method,payload:{provider:'lomopay',external_reference:ref},status:'initiated'});
  const response=await lomo('/direct.php',{method:'POST',headers:{'Idempotency-Key':ref},body:JSON.stringify({amount:plan.price,currency:PAYMENT_CURRENCY,country:'TG',operator,phone,method:'mobile_money',customer_name:name,customer_email:email,external_reference:ref,webhook_url:publicUrl()+'/api/billing/lomopay-webhook'})});
  const p=payloadData(response),providerId=p.id||p.payment_id||null,status=String(p.status||'pending').toLowerCase();
  await record({userId:user.id,paymentId:ref,plan,method,payload:{provider:'lomopay',provider_id:providerId,response},status:status==='failed'?'failed':'pending'});
  let verification={credited:false,status,paymentId:ref};if(status==='completed'){try{verification=await creditPayment(ref);}catch(e){console.warn('LomoPay immediate verification deferred:',e.message);}}
  const action=p.next_action||{};
  return res.json({ok:true,payment_id:ref,provider_payment_id:providerId,status:verification.status||status,pending_confirmation:!verification.credited&&status!=='failed',message:action.message||(action.type==='confirm_on_phone'?'Une demande de paiement a été envoyée sur ton téléphone. Confirme-la avec ton code PIN.':'Paiement lancé.'),next_action:{type:action.type||'confirm_on_phone',url:action.url||null},plan:{...plan,display_price:displayPrice(plan.price)},display_currency:DISPLAY_CURRENCY,payment_currency:PAYMENT_CURRENCY,payment_provider:'LomoPay Direct API',payment_method:method});
 }catch(e){
  if(ref&&ctx){try{await record({userId:ctx.userId,paymentId:ref,plan:ctx.plan,method:ctx.method,payload:{provider:'lomopay',error:e.payload||e.message},status:'failed'});}catch(re){console.error('Failed to record LomoPay failure:',re.message);}}
  console.error('LomoPay Direct checkout failed:',e.message);return res.status(e.status||500).json({error:e.message||'checkout_failed'});
 }
});
router.get('/verify/:paymentId',async(req,res)=>{try{const {user}=await requireUser(req),local=await localPayment(req.params.paymentId);if(!local)return res.status(404).json({error:'payment_not_found'});if(local.user_id!==user.id)return res.status(403).json({error:'payment_forbidden'});const result=await creditPayment(req.params.paymentId);return res.json({status:result.status||local.status,...result});}catch(e){return res.status(e.status||500).json({error:e.message||'payment_verification_failed'});}});
router.post('/lomopay-webhook',async(req,res)=>{try{const {secretKey}=credentials(),raw=Buffer.isBuffer(req.body)?req.body:Buffer.from(JSON.stringify(req.body||{})),sig=String(req.get('X-LomoPay-Signature')||'').replace(/^sha256=/i,'');const expected=crypto.createHmac('sha256',secretKey).update(raw).digest('hex'),a=Buffer.from(sig,'hex'),b=Buffer.from(expected,'hex');if(!sig||a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).send('invalid_signature');const event=JSON.parse(raw.toString('utf8'));if(!['payment.succeeded','payment.updated','payment.failed'].includes(String(event.type||'')))return res.status(200).send('ignored');const ref=event?.data?.external_reference;if(!ref)return res.status(200).send('missing_reference');const local=await localPayment(ref);if(!local||local.gateway!=='lomopay')return res.status(200).send('unknown_payment');const status=String(event?.data?.status||'').toLowerCase();if(status==='completed'||event.type==='payment.succeeded')await creditPayment(ref);else if(status==='failed'||event.type==='payment.failed'){const plan=PLANS.find(x=>x.id===local.plan_id);if(plan)await record({userId:local.user_id,paymentId:ref,plan,method:local.method,payload:event,status:'failed'});}return res.status(200).send('ok');}catch(e){console.error('LomoPay webhook failed:',e.message);return res.status(e.status||500).send('webhook_processing_failed');}});
export {PLANS,PAYMENT_METHODS,creditPayment as creditFromPayment,DISPLAY_CURRENCY,PAYMENT_CURRENCY,displayPrice};
export default router;
