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
const COUNTRIES = [
  {code:'TG',name:'Togo',currency:'XOF',currency_name:'FCFA',dial:'228'},
  {code:'BJ',name:'Bénin',currency:'XOF',currency_name:'FCFA',dial:'229'},
  {code:'BF',name:'Burkina Faso',currency:'XOF',currency_name:'FCFA',dial:'226'},
  {code:'CI',name:"Côte d’Ivoire",currency:'XOF',currency_name:'FCFA',dial:'225'},
  {code:'ML',name:'Mali',currency:'XOF',currency_name:'FCFA',dial:'223'},
  {code:'SN',name:'Sénégal',currency:'XOF',currency_name:'FCFA',dial:'221'}
];
const PAYMENT_METHODS = [
  {code:'togocel',name:'T-Money',short:'T-Money',country:'TG',icon:'📱',softpayPath:'/softpay/t-money-togo'},
  {code:'moov_tg',name:'Moov Money Togo',short:'Moov Money',country:'TG',icon:'📲',softpayPath:'/softpay/moov-togo'},
  {code:'moov_bj',name:'Moov Money Bénin',short:'Moov Money',country:'BJ',icon:'📲',softpayPath:'/softpay/moov-benin'},
  {code:'mtn_bj',name:'MTN Mobile Money',short:'MTN MoMo',country:'BJ',icon:'📱',softpayPath:'/softpay/mtn-benin'},
  {code:'celtiis_bj',name:'Celtiis Cash',short:'Celtiis Cash',country:'BJ',icon:'📱',softpayPath:'/softpay/celtiis-cash'},
  {code:'orange_bf',name:'Orange Money Burkina',short:'Orange Money',country:'BF',icon:'🟠',softpayPath:'/softpay/orange-money-burkina',requiresCode:true,codeLabel:'Code OTP Orange Money'},
  {code:'moov_bf',name:'Moov Money Burkina',short:'Moov Money',country:'BF',icon:'📲',softpayPath:'/softpay/moov-burkina'},
  {code:'orange_ci',name:'Orange Money Côte d’Ivoire',short:'Orange Money',country:'CI',icon:'🟠',softpayPath:'/softpay/orange-money-ci',requiresCode:true,codeLabel:'Code OTP Orange Money'},
  {code:'mtn_ci',name:'MTN Mobile Money Côte d’Ivoire',short:'MTN MoMo',country:'CI',icon:'📱',softpayPath:'/softpay/mtn-ci'},
  {code:'moov_ci',name:'Moov Money Côte d’Ivoire',short:'Moov Money',country:'CI',icon:'📲',softpayPath:'/softpay/moov-ci'},
  {code:'wave_ci',name:'Wave Côte d’Ivoire',short:'Wave',country:'CI',icon:'🌊',softpayPath:'/softpay/wave-ci',redirect:true},
  {code:'djamo_ci',name:'Djamo Côte d’Ivoire',short:'Djamo',country:'CI',icon:'💳',softpayPath:'/softpay/djamo',redirect:true},
  {code:'orange_ml',name:'Orange Money Mali',short:'Orange Money',country:'ML',icon:'🟠',softpayPath:'/softpay/orange-money-mali'},
  {code:'moov_ml',name:'Moov Money Mali',short:'Moov Money',country:'ML',icon:'📲',softpayPath:'/softpay/moov-mali'},
  {code:'orange_sn',name:'Orange Money Sénégal',short:'Orange Money',country:'SN',icon:'🟠',softpayPath:'/softpay/new-orange-money-senegal',redirect:true},
  {code:'free_sn',name:'Free Money Sénégal',short:'Free Money',country:'SN',icon:'📱',softpayPath:'/softpay/free-money-senegal'},
  {code:'expresso_sn',name:'Expresso Sénégal',short:'Expresso',country:'SN',icon:'📱',softpayPath:'/softpay/expresso-senegal'},
  {code:'wave_sn',name:'Wave Sénégal',short:'Wave',country:'SN',icon:'🌊',softpayPath:'/softpay/wave-senegal',redirect:true},
  {code:'wizall_sn',name:'Wizall Sénégal',short:'Wizall',country:'SN',icon:'📱',softpayPath:'/softpay/wizall-money-senegal',requiresCode:true,codeLabel:'Code de confirmation Wizall',confirmPath:'/softpay/wizall-money-senegal/confirm'},
  {code:'djamo_sn',name:'Djamo Sénégal',short:'Djamo',country:'SN',icon:'💳',softpayPath:'/softpay/djamo',redirect:true}
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
function publicUrl(){
  const configured=String(process.env.PUBLIC_APP_URL||process.env.CLIENT_URL||'').split(',')[0].trim();
  if(!configured)throw Object.assign(new Error('public_app_url_missing'),{status:503});
  let parsed;try{parsed=new URL(configured);}catch{throw Object.assign(new Error('public_app_url_invalid'),{status:503});}
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||
    ['localhost','127.0.0.1','::1'].includes(parsed.hostname.toLowerCase())||
    (process.env.NODE_ENV==='production'&&parsed.protocol!=='https:')||
    (parsed.port&&!['80','443','8080','8443'].includes(parsed.port))){
    throw Object.assign(new Error('public_app_url_must_be_public_https'),{status:503});
  }
  return parsed.origin;
}
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
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(20000)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok || data?.success===false){
    throw Object.assign(new Error(data?.message||data?.errors?.message||`PayDunya SoftPay HTTP ${r.status}`),{status:r.status||502,payload:data});
  }
  return data;
}
function normalizePhone(value,country){
  const digits=String(value||'').replace(/\D/g,'');
  const dial=COUNTRIES.find(c=>c.code===country)?.dial||'';
  let local=digits;
  if(dial&&local.startsWith(dial)&&local.length>dial.length+5)local=local.slice(dial.length);
  if(local.startsWith('0'))local=local.slice(1);
  if(!/^\d{6,12}$/.test(local))throw Object.assign(new Error('invalid_phone_number'),{status:400});
  return local;
}
function softPayPayload(method,{name,email,phone,paymentId,extraCode}){
  const common={payment_token:paymentId};
  switch(method.code){
    case 'togocel': return {name_t_money:name,email_t_money:email,phone_t_money:phone,...common};
    case 'moov_tg': return {moov_togo_customer_fullname:name,moov_togo_email:email,moov_togo_customer_address:'Togo',moov_togo_phone_number:phone,...common};
    case 'moov_bj': return {moov_benin_customer_fullname:name,moov_benin_email:email,moov_benin_phone_number:phone,...common};
    case 'mtn_bj': return {mtn_benin_customer_fullname:name,mtn_benin_email:email,mtn_benin_phone_number:phone,mtn_benin_wallet_provider:'MTNBENIN',...common};
    case 'celtiis_bj': return {celtiis_cash_customer_fullname:name,celtiis_cash_customer_email:email,celtiis_cash_phone_number:phone,...common};
    case 'orange_bf': return {name_bf:name,email_bf:email,phone_bf:phone,otp_code:extraCode,...common};
    case 'moov_bf': return {moov_burkina_faso_fullName:name,moov_burkina_faso_email:email,moov_burkina_faso_phone_number:phone,moov_burkina_faso_payment_token:paymentId};
    case 'orange_ci': return {orange_money_ci_customer_fullname:name,orange_money_ci_email:email,orange_money_ci_phone_number:phone,orange_money_ci_otp:extraCode,...common};
    case 'mtn_ci': return {mtn_ci_customer_fullname:name,mtn_ci_email:email,mtn_ci_phone_number:phone,mtn_ci_wallet_provider:'MTNCI',...common};
    case 'moov_ci': return {moov_ci_customer_fullname:name,moov_ci_email:email,moov_ci_phone_number:phone,...common};
    case 'wave_ci': return {wave_ci_fullName:name,wave_ci_email:email,wave_ci_phone:phone,wave_ci_payment_token:paymentId};
    case 'djamo_ci': return {djamo_fullName:name,djamo_email:email,djamo_phone:phone,code_country:'ci',djamo_payment_token:paymentId};
    case 'orange_ml': return {orange_money_mali_customer_fullname:name,orange_money_mali_email:email,orange_money_mali_phone_number:phone,orange_money_mali_customer_address:'Mali',...common};
    case 'moov_ml': return {moov_ml_customer_fullname:name,moov_ml_email:email,moov_ml_phone_number:phone,moov_ml_customer_address:'Mali',...common};
    case 'orange_sn': return {customer_name:name,customer_email:email,phone_number:phone,invoice_token:paymentId};
    case 'free_sn': return {customer_name:name,customer_email:email,phone_number:phone,...common};
    case 'expresso_sn': return {expresso_sn_fullName:name,expresso_sn_email:email,expresso_sn_phone:phone,...common};
    case 'wave_sn': return {wave_senegal_fullName:name,wave_senegal_email:email,wave_senegal_phone:phone,wave_senegal_payment_token:paymentId};
    case 'wizall_sn': return {customer_name:name,customer_email:email,phone_number:phone,invoice_token:paymentId};
    case 'djamo_sn': return {djamo_fullName:name,djamo_email:email,djamo_phone:phone,code_country:'sn',djamo_payment_token:paymentId};
    default: throw Object.assign(new Error('softpay_method_not_supported'),{status:400});
  }
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

router.get('/countries',(_req,res)=>res.json({countries:COUNTRIES.map(c=>({...c,currency_enabled:true,methods_configured:PAYMENT_METHODS.some(m=>m.country===c.code)}))}));

router.get('/plans',(req,res)=>{
  const country=String(req.query.country||'TG').toUpperCase();
  res.json({
    currency:PAYMENT_CURRENCY,
    display_currency:DISPLAY_CURRENCY,
    display_rate:displayRate(),
    payment_provider:'PayDunya SoftPay',
    plans:PLANS.map(p=>({...p,display_price:displayPrice(p.price)})),
    payment_methods:PAYMENT_METHODS.filter(m=>m.country===country)
  });
});

router.get('/methods',(req,res)=>{
  const country=String(req.query.country||'TG').toUpperCase();
  res.json({currency:PAYMENT_CURRENCY,payment_provider:'PayDunya SoftPay',methods:PAYMENT_METHODS.filter(m=>m.country===country)});
});

router.post('/checkout',async(req,res)=>{
  try{
    const {user}=await requireUser(req);
    const plan=PLANS.find(p=>p.id===req.body?.plan);
    const country=String(req.body?.country||'TG').toUpperCase();
    const requestedMethod=String(req.body?.payment_method||'togocel');
    const selected=PAYMENT_METHODS.find(m=>m.code===requestedMethod&&m.country===country);
    if(!selected) return res.status(400).json({error:'invalid_payment_method_for_country'});
    if(!plan) return res.status(400).json({error:'invalid_plan'});
    const extraCode=String(req.body?.extra_code||'').trim();
    if(selected.requiresCode&&!extraCode) return res.status(400).json({error:'payment_confirmation_code_required'});
    const phone=normalizePhone(req.body?.phone,country);
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
      custom_data:{user_id:user.id,plan_id:plan.id,credits:String(plan.credits),product:'izisono_notes',payment_method:requestedMethod,country},
      actions:{
        cancel_url:`${url}/?payment=cancelled`,
        return_url:`${url}/?payment=return`,
        callback_url:`${url}/api/billing/paydunya-ipn`
      }
    };

    const invoice=await paydunya('/checkout-invoice/create',{method:'POST',body:JSON.stringify(invoicePayload)});
    const paymentId=invoice?.token||invoice?.data?.token;
    if(!paymentId) throw new Error('paydunya_payment_token_missing');

    // Persist the PayDunya token before contacting SoftPay so an ambiguous network
    // result can be reconciled instead of losing a possibly accepted payment.
    await createPaymentTransaction({userId:user.id,paymentId,plan,method:requestedMethod,rawPayload:{provider:'paydunya_softpay',invoice},status:'initiated'});

    let softpay;
    try{
      softpay=await paydunyaSoftPay(selected.softpayPath,softPayPayload(selected,{name:customerName,email,phone,paymentId,extraCode}));
      if(selected.confirmPath){
        const confirmed=await paydunyaSoftPay(selected.confirmPath,{
          authorization_code:extraCode,phone_number:phone,
          transaction_id:softpay?.data?.TransactionID||softpay?.data?.transaction_id
        });
        softpay={...softpay,...confirmed};
      }
    }catch(error){
      const code=Number(error.status||0);
      const definitive=code>=400&&code<500&&![408,409,425,429].includes(code);
      try{await createPaymentTransaction({userId:user.id,paymentId,plan,method:requestedMethod,rawPayload:{provider:'paydunya_softpay',invoice,error:error.payload||error.message,ambiguous:!definitive},status:definitive?'failed':'initiated'});}catch(recordError){console.error('Failed to record SoftPay result',recordError);}
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
      payment_method:requestedMethod,
      ...(softpay?.url?{next_action:{type:'redirect',url:softpay.url}}:{})
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
