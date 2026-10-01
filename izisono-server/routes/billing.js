import express from 'express';
import crypto from 'node:crypto';
import { requireUser } from '../supabase.js';

const router = express.Router();
const PAYDUNYA_LIVE_BASE = 'https://app.paydunya.com/api/v1';
const PAYDUNYA_TEST_BASE = 'https://app.paydunya.com/sandbox-api/v1';
const PAYMENT_CURRENCY = 'XOF';
const DISPLAY_CURRENCY = 'XOF';
const PLANS = [
  { id:'discovery', name:'Découverte', price:1900, credits:4, popular:false, description:'Pour découvrir izisono et créer 2 chansons' },
  { id:'popular', name:'Populaire', price:3490, credits:10, popular:true, description:'Le meilleur équilibre pour créer régulièrement' },
  { id:'premium', name:'Premium', price:9990, credits:24, popular:false, description:'Pour les créateurs intensifs et les événements' },
];
const PAYMENT_METHODS = [
  { code:'togocel', name:'Togocel Money', short:'T-Money', country:'TG', icon:'📱', channel:'t-money-togo', softpayPath:'/softpay/t-money-togo' },
  { code:'moov_tg', name:'Moov Money Togo', short:'Moov Money', country:'TG', icon:'📲', channel:'moov-togo', softpayPath:'/softpay/moov-togo' },
];

function paydunyaMode(){return String(process.env.PAYDUNYA_MODE||'live').toLowerCase()==='test'?'test':'live';}
function paydunyaBase(){return paydunyaMode()==='test'?PAYDUNYA_TEST_BASE:PAYDUNYA_LIVE_BASE;}
function requirePayDunya(){
  const master=process.env.PAYDUNYA_MASTER_KEY;
  const privateKey=process.env.PAYDUNYA_PRIVATE_KEY;
  const token=process.env.PAYDUNYA_TOKEN;
  if(!master||!privateKey||!token) throw Object.assign(new Error('paydunya_credentials_missing'),{status:500});
  return {master,privateKey,token};
}
function displayRate(){return 1;}
function displayPrice(xof){return Math.round(Number(xof));}
function publicUrl(){return String(process.env.PUBLIC_APP_URL||process.env.CLIENT_URL||'http://localhost:3000').split(',')[0].trim().replace(/\/$/,'');}
function adminConfig(){
  const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw Object.assign(new Error('supabase_service_role_key_missing'),{status:500});
  return {url,key};
}
async function supabaseAdmin(path, options={}){
  const {url,key}=adminConfig();
  const r=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json','Content-Type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.hint||'supabase_admin_request_failed'),{status:r.status,payload:data});
  return data;
}
async function rpc(name,args){return supabaseAdmin(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});}
async function createPaymentTransaction({userId,paymentId,plan,method,rawPayload,status='initiated'}){
  return rpc('record_paydunya_transaction',{
    p_user_id:userId,p_payment_id:paymentId,p_plan_id:plan.id,p_amount:plan.price,
    p_currency:PAYMENT_CURRENCY,p_credits:plan.credits,p_status:status,p_method:method||null,
    p_gateway:'paydunya',p_raw_payload:rawPayload||{}
  });
}
async function paydunya(path, options={}){
  const {master,privateKey,token}=requirePayDunya();
  const r=await fetch(`${paydunyaBase()}${path}`,{
    ...options,
    headers:{
      'PAYDUNYA-MASTER-KEY':master,
      'PAYDUNYA-PRIVATE-KEY':privateKey,
      'PAYDUNYA-TOKEN':token,
      'Content-Type':'application/json',
      Accept:'application/json',
      ...(options.headers||{})
    }
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok || String(data?.response_code||'00')!=='00'){
    throw Object.assign(new Error(data?.response_text||data?.message||`PayDunya HTTP ${r.status}`),{status:r.status||502,payload:data});
  }
  return data;
}
async function paydunyaSoftPay(path, payload){
  const {master,privateKey,token}=requirePayDunya();
  const r=await fetch(`${paydunyaBase()}${path}`,{
    method:'POST',
    headers:{
      'PAYDUNYA-MASTER-KEY':master,
      'PAYDUNYA-PRIVATE-KEY':privateKey,
      'PAYDUNYA-TOKEN':token,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:JSON.stringify(payload)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok || data?.success===false){
    throw Object.assign(new Error(data?.message||data?.errors?.message||`PayDunya SoftPay HTTP ${r.status}`),{status:r.status||502,payload:data});
  }
  return data;
}
function normalizeTogoPhone(value){
  const digits=String(value||'').replace(/\D/g,'');
  if(/^228\d{8}$/.test(digits)) return digits.slice(3);
  if(/^0\d{8}$/.test(digits)) return digits.slice(1);
  if(/^\d{8}$/.test(digits)) return digits;
  throw Object.assign(new Error('invalid_togo_phone'),{status:400});
}
function softPayPayload(method,{name,email,phone,paymentId}){
  if(method.code==='togocel'){
    return {
      name_t_money:name,
      email_t_money:email,
      phone_t_money:phone,
      payment_token:paymentId
    };
  }
  if(method.code==='moov_tg'){
    return {
      moov_togo_customer_fullname:name,
      moov_togo_email:email,
      moov_togo_customer_address:'Togo',
      moov_togo_phone_number:phone,
      payment_token:paymentId
    };
  }
  throw Object.assign(new Error('softpay_method_not_supported'),{status:400});
}
function verifyCallbackHash(data){
  const master=process.env.PAYDUNYA_MASTER_KEY;
  if(!master||!data?.hash)return false;
  const expected=crypto.createHash('sha512').update(master).digest('hex');
  const a=Buffer.from(String(data.hash));
  const b=Buffer.from(expected);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function fetchPayment(paymentId){
  return paydunya(`/checkout-invoice/confirm/${encodeURIComponent(paymentId)}`,{method:'GET'});
}
async function creditFromPayment(paymentId){
  if(!paymentId) throw new Error('payment_id_missing');
  const verified=await fetchPayment(paymentId);
  const p=verified?.data||verified||{};
  const custom=p.custom_data||p.customData||{};
  const userId=custom.user_id;
  const planId=custom.plan_id;
  const plan=PLANS.find(x=>x.id===planId);
  if(!userId||!plan) throw new Error('payment_metadata_invalid');
  const currency=String(p.currency||PAYMENT_CURRENCY).toUpperCase();
  if(currency!==PAYMENT_CURRENCY) throw new Error('payment_currency_invalid');
  const amount=Number(p.invoice?.total_amount||p.total_amount||0);
  if(amount < plan.price) throw new Error('payment_amount_invalid');
  const status=String(p.status||'').toLowerCase();
  if(status!=='completed') return {credited:false,status:p.status||'unknown',paymentId};
  const method=p.channel||p.method||p.customer?.phone||null;
  const transaction=await rpc('apply_paydunya_payment',{
    p_user_id:userId,p_payment_id:paymentId,p_plan_id:plan.id,p_amount:amount,
    p_currency:PAYMENT_CURRENCY,p_credits:plan.credits,p_status:'completed',p_method:method,
    p_gateway:'paydunya',p_raw_payload:p
  });
  return transaction||{credited:false,status:'completed',paymentId};
}

router.get('/plans',(_req,res)=>{
  res.json({
    currency:PAYMENT_CURRENCY,
    display_currency:DISPLAY_CURRENCY,
    display_rate:displayRate(),
    payment_provider:'PayDunya SoftPay',
    plans:PLANS.map(p=>({...p,display_price:displayPrice(p.price)})),
    payment_methods:PAYMENT_METHODS
  });
});

router.get('/methods',(_req,res)=>res.json({currency:PAYMENT_CURRENCY,payment_provider:'PayDunya SoftPay',methods:PAYMENT_METHODS}));

router.post('/checkout',async(req,res)=>{
  try{
    const {user}=await requireUser(req);
    const plan=PLANS.find(p=>p.id===req.body?.plan);
    const requestedMethod=String(req.body?.payment_method||'togocel');
    const selected=PAYMENT_METHODS.find(m=>m.code===requestedMethod);
    if(!selected) return res.status(400).json({error:'invalid_payment_method'});
    if(!plan) return res.status(400).json({error:'invalid_plan'});

    const phone=normalizeTogoPhone(req.body?.phone);
    const url=publicUrl();
    const email=user.email||'';
    const customerName=(email.split('@')[0]||'Utilisateur').replace(/[^a-zA-ZÀ-ÿ0-9 _-]/g,' ').trim().slice(0,60)||'Utilisateur';
    const baseInvoice={
      total_amount:plan.price,
      description:`izisono — ${plan.name} — ${plan.credits} Notes`,
      customer:{name:customerName,email,phone},
      items:{item_0:{name:`Pack ${plan.name}`,quantity:1,unit_price:String(plan.price),total_price:String(plan.price),description:`${plan.credits} Notes izisono`}}
    };
    const invoicePayload={
      invoice:baseInvoice,
      store:{name:'izisono',tagline:'Studio musical IA',website_url:url},
      custom_data:{user_id:user.id,plan_id:plan.id,credits:String(plan.credits),product:'izisono_notes',payment_method:requestedMethod},
      actions:{
        cancel_url:`${url}/?payment=cancelled`,
        return_url:`${url}/?payment=return`,
        callback_url:`${url}/api/billing/paydunya-ipn`
      }
    };

    const invoice=await paydunya('/checkout-invoice/create',{method:'POST',body:JSON.stringify(invoicePayload)});
    const paymentId=invoice?.token||invoice?.data?.token;
    if(!paymentId) throw new Error('paydunya_payment_token_missing');

    let softpay;
    try{
      softpay=await paydunyaSoftPay(selected.softpayPath,softPayPayload(selected,{name:customerName,email,phone,paymentId}));
    }catch(error){
      try{await createPaymentTransaction({userId:user.id,paymentId,plan,method:requestedMethod,rawPayload:{invoice,error:error.payload||error.message},status:'failed'});}catch(recordError){console.error('Failed to record SoftPay failure',recordError);}
      throw Object.assign(new Error(error.message||'softpay_payment_failed'),{status:error.status||502,payload:error.payload});
    }

    let verification={credited:false,status:'pending',paymentId};
    try{verification=await creditFromPayment(paymentId);}catch(verifyError){console.warn('Initial SoftPay verification deferred',verifyError.message);}
    const status=verification?.credited?'completed':String(verification?.status||'pending').toLowerCase();
    try{
      await createPaymentTransaction({userId:user.id,paymentId,plan,method:requestedMethod,rawPayload:{invoice,softpay},status:status==='completed'?'completed':'pending'});
    }catch(recordError){console.error('SoftPay transaction recording failed',recordError);}

    res.json({
      ok:true,
      payment_id:paymentId,
      status,
      pending_confirmation:status!=='completed',
      message:softpay?.message||'Paiement lancé. Valide la demande sur ton téléphone.',
      plan:{...plan,display_price:displayPrice(plan.price)},
      display_currency:DISPLAY_CURRENCY,
      payment_currency:PAYMENT_CURRENCY,
      payment_provider:'PayDunya SoftPay',
      payment_method:requestedMethod
    });
  }catch(e){
    console.error('PayDunya SoftPay checkout failed',e);
    res.status(e.status||500).json({error:e.message||'checkout_failed',details:e.payload});
  }
});
router.get('/verify/:paymentId',async(req,res)=>{
  try{
    const {user}=await requireUser(req);
    const verified=await fetchPayment(req.params.paymentId);
    const p=verified?.data||verified||{};
    const meta=p.custom_data||{};
    if(meta.user_id&&meta.user_id!==user.id) return res.status(403).json({error:'payment_forbidden'});
    const result=await creditFromPayment(req.params.paymentId);
    res.json({status:p.status||'unknown',...result});
  }catch(e){res.status(e.status||500).json({error:e.message||'payment_verification_failed'});}
});

router.post('/paydunya-ipn',async(req,res)=>{
  try{
    const data=req.body?.data||{};
    if(!verifyCallbackHash(data)) return res.status(403).send('invalid_signature');
    const token=data?.invoice?.token||data?.token;
    const custom=data?.custom_data||{};
    const plan=PLANS.find(x=>x.id===custom.plan_id);
    if(token&&custom.user_id&&plan){
      const status=String(data.status||'').toLowerCase();
      if(status==='completed') await creditFromPayment(token);
      else await createPaymentTransaction({userId:custom.user_id,paymentId:token,plan,method:null,rawPayload:data,status:status||'pending'});
    }
    return res.status(200).send('ok');
  }catch(e){console.error('PayDunya IPN failed',e);return res.status(e.status||500).send('ipn_processing_failed');}
});

export { PLANS, PAYMENT_METHODS, creditFromPayment, DISPLAY_CURRENCY, PAYMENT_CURRENCY, displayPrice };


export default router;
