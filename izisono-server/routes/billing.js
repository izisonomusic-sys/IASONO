import express from 'express';
import crypto from 'node:crypto';
import { requireUser } from '../supabase.js';

const router = express.Router();
const BASE = 'https://lomopay.net/api/v1';
const PLANS = [
  { id: 'discovery', name: 'Découverte', price: 1900, credits: 4, popular: false, description: 'Pour découvrir izisono et créer 2 chansons' },
  { id: 'popular', name: 'Populaire', price: 3490, credits: 10, popular: true, description: 'Le meilleur équilibre pour créer régulièrement' },
  { id: 'premium', name: 'Premium', price: 9990, credits: 24, popular: false, description: 'Pour les créateurs intensifs et les événements' }
];
const COUNTRIES = [
  { code:'TG', name:'Togo', currency:'XOF', dial:'228' },
  { code:'CI', name:"Côte d’Ivoire", currency:'XOF', dial:'225' },
  { code:'SN', name:'Sénégal', currency:'XOF', dial:'221' },
  { code:'ML', name:'Mali', currency:'XOF', dial:'223' },
  { code:'BF', name:'Burkina Faso', currency:'XOF', dial:'226' },
  { code:'BJ', name:'Bénin', currency:'XOF', dial:'229' },
  { code:'NE', name:'Niger', currency:'XOF', dial:'227' },
  { code:'GH', name:'Ghana', currency:'GHS', dial:'233' },
  { code:'NG', name:'Nigeria', currency:'NGN', dial:'234' },
  { code:'GN', name:'Guinée', currency:'GNF', dial:'224' },
  { code:'SL', name:'Sierra Leone', currency:'SLE', dial:'232' },
  { code:'LR', name:'Liberia', currency:'LRD', dial:'231' }
];
const CURRENCY_NAMES = { XOF:'FCFA', GHS:'GHS', NGN:'NGN', GNF:'GNF', SLE:'SLE', LRD:'LRD' };
const CURRENCY_DECIMALS = { XOF:0, GHS:0, NGN:0, GNF:0, SLE:0, LRD:0 };
let ratesCache = { at:0, rates:null };
const RATE_TTL = 6 * 60 * 60 * 1000;

function credentials() {
  const publicKey = process.env.LOMOPAY_PUBLIC_KEY, secretKey = process.env.LOMOPAY_SECRET_KEY;
  if (!publicKey || !secretKey) throw Object.assign(new Error('lomopay_credentials_missing'), { status:503 });
  if (!/^(pk_live_|pk_test_)/.test(publicKey) || !/^(sk_live_|sk_test_)/.test(secretKey) || publicKey.includes('_test_') !== secretKey.includes('_test_')) throw Object.assign(new Error('lomopay_credentials_invalid'), { status:503 });
  return { publicKey, secretKey };
}
function adminConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error('supabase_service_role_key_missing'), { status:500 });
  return { url, key };
}
async function supabaseAdmin(path, options={}) {
  const {url,key} = adminConfig();
  const r = await fetch(`${url}/rest/v1/${path}`, { ...options, headers:{ apikey:key, Authorization:`Bearer ${key}`, Accept:'application/json', 'Content-Type':'application/json', ...(options.headers||{}) } });
  const data = await r.json().catch(()=>null);
  if (!r.ok) throw Object.assign(new Error(data?.message || data?.hint || 'supabase_admin_request_failed'), { status:r.status, payload:data });
  return data;
}
async function rpc(name,args) { return supabaseAdmin(`rpc/${name}`, { method:'POST', body:JSON.stringify(args) }); }
function enabledCurrencies() {
  return new Set(String(process.env.LOMOPAY_ENABLED_CURRENCIES || 'XOF').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean));
}
function operatorConfig() {
  try {
    const raw=process.env.LOMOPAY_COUNTRY_OPERATORS_JSON;
    if(raw){const parsed=JSON.parse(raw);return parsed&&typeof parsed==='object'?parsed:{};}
    const legacy={};
    if(process.env.LOMOPAY_TG_TOGOCEL_OPERATOR)legacy.TG=[{code:process.env.LOMOPAY_TG_TOGOCEL_OPERATOR,name:'Togocel Money',short:'T-Money',icon:'📱'}];
    if(process.env.LOMOPAY_TG_MOOV_OPERATOR)legacy.TG=[...(legacy.TG||[]),{code:process.env.LOMOPAY_TG_MOOV_OPERATOR,name:'Moov Money Togo',short:'Moov Money',icon:'📲'}];
    return legacy;
  } catch { throw Object.assign(new Error('lomopay_operator_config_invalid'), { status:500 }); }
}
function methodsFor(countryCode) {
  const entries = operatorConfig()[countryCode] || [];
  if (!Array.isArray(entries)) return [];
  return entries.filter(x=>x && typeof x.code==='string' && x.code.trim() && typeof x.name==='string' && x.name.trim())
    .map(x=>({ code:x.code.trim(), name:x.name.trim(), short:x.short || x.name.trim(), country:countryCode, icon:x.icon || '📱' }));
}
function countryInfo(code) {
  const country = COUNTRIES.find(x=>x.code===String(code||'TG').toUpperCase());
  if (!country) throw Object.assign(new Error('unsupported_country'), { status:400 });
  return country;
}
async function getRates() {
  if (ratesCache.rates && Date.now()-ratesCache.at<RATE_TTL) return ratesCache.rates;
  const response = await fetch('https://open.er-api.com/v6/latest/XOF', { headers:{Accept:'application/json'}, signal:AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('exchange_rate_service_unavailable');
  const data = await response.json();
  if (data.result !== 'success' || !data.rates) throw new Error('exchange_rate_service_unavailable');
  ratesCache = { at:Date.now(), rates:data.rates };
  return data.rates;
}
async function localPrice(baseXof, currency) {
  if (currency === 'XOF') return Math.round(baseXof);
  const rates = await getRates();
  const rate = Number(rates[currency]);
  if (!Number.isFinite(rate) || rate <= 0) throw Object.assign(new Error('exchange_rate_unavailable'), { status:503 });
  const decimals = CURRENCY_DECIMALS[currency] ?? 0;
  const factor = 10 ** decimals;
  return Math.round(baseXof * rate * factor) / factor;
}
async function plansFor(country) {
  const currency = country.currency;
  const plans = await Promise.all(PLANS.map(async p=>({ ...p, display_price:await localPrice(p.price,currency), currency })));
  return plans;
}
function publicUrl() {
  return String(process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/,'');
}
function normalizePhone(value,country) {
  let digits = String(value||'').replace(/\D/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  const dial = country.dial;
  let national = digits.startsWith(dial) ? digits.slice(dial.length) : digits;
  if (national.startsWith('0')) national = national.slice(1);
  if (national.length < 7 || national.length > 12) throw Object.assign(new Error('invalid_phone_number'), { status:400 });
  return `+${dial}${national}`;
}
function lomo(path,options={}) {
  const {publicKey,secretKey} = credentials();
  return fetch(BASE+path,{...options,headers:{'X-Public-Key':publicKey,'X-Secret-Key':secretKey,'Content-Type':'application/json',Accept:'application/json',...(options.headers||{})}})
    .then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok||data?.success===false){const code=data?.error?.code||data?.code||data?.error||data?.message||`lomopay_http_${r.status}`;throw Object.assign(new Error(String(code)),{status:r.status||502,payload:data});}return data;});
}
function payloadData(x) { return x?.data?.data || x?.data || x || {}; }
async function getPayment(ref) { return payloadData(await lomo(`/payments.php?external_reference=${encodeURIComponent(ref)}`,{method:'GET'})); }
async function localPayment(ref) {
  const rows=await supabaseAdmin(`payment_transactions?payment_id=eq.${encodeURIComponent(ref)}&select=user_id,payment_id,plan_id,amount,currency,credits,status,gateway,method&limit=1`);
  return rows?.[0]||null;
}
async function updateLocal(ref,patch,onlyIfNotCompleted=true) {
  let path=`payment_transactions?payment_id=eq.${encodeURIComponent(ref)}`;
  if (onlyIfNotCompleted) path+='&status=not.in.(success,completed)';
  return supabaseAdmin(path,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
}
async function recordInitial({userId,paymentId,plan,amount,currency,method,payload}) {
  return rpc('record_paydunya_transaction',{p_user_id:userId,p_payment_id:paymentId,p_plan_id:plan.id,p_amount:amount,p_currency:currency,p_credits:plan.credits,p_status:'initiated',p_method:method||null,p_gateway:'lomopay',p_raw_payload:payload||{}});
}
async function creditPayment(ref) {
  if (!ref) throw new Error('payment_reference_missing');
  const local=await localPayment(ref);
  if (!local || local.gateway!=='lomopay') throw new Error('payment_reference_unknown');
  const plan=PLANS.find(x=>x.id===local.plan_id);
  if (!plan) throw new Error('payment_metadata_invalid');
  const p=await getPayment(ref);
  const providerCurrency=String(p.currency||'').toUpperCase();
  if (providerCurrency!==String(local.currency).toUpperCase()) throw new Error('payment_currency_invalid');
  const amount=Number(p.amount??p.total_amount);
  const expected=Number(local.amount);
  if (!Number.isFinite(amount)||!Number.isFinite(expected)||amount+0.000001<expected) throw new Error('payment_amount_invalid');
  const status=String(p.status||'').toLowerCase();
  if (status!=='completed') return {credited:false,status:status||'unknown',paymentId:ref};
  return (await rpc('apply_paydunya_payment',{p_user_id:local.user_id,p_payment_id:ref,p_plan_id:plan.id,p_amount:expected,p_currency:local.currency,p_credits:local.credits||plan.credits,p_status:'completed',p_method:local.method||p.method||null,p_gateway:'lomopay',p_raw_payload:p}))||{credited:false,status:'completed',paymentId:ref};
}

router.get('/countries',(_req,res)=>{
  const allowed=enabledCurrencies(), ops=operatorConfig();
  res.json({countries:COUNTRIES.map(c=>({...c, currency_name:CURRENCY_NAMES[c.currency], currency_enabled:allowed.has(c.currency), methods_configured:Array.isArray(ops[c.code])&&ops[c.code].length>0}))});
});
router.get('/plans',async(req,res)=>{
  try {
    const country=countryInfo(req.query.country||'TG'), plans=await plansFor(country);
    res.set('Cache-Control','no-store');
    res.json({country:country.code,currency:country.currency,display_currency:CURRENCY_NAMES[country.currency],payment_provider:'LomoPay Direct API',plans,payment_methods:methodsFor(country.code)});
  } catch(e) { res.status(e.status||503).json({error:e.message||'plans_unavailable'}); }
});
router.get('/methods',(req,res)=>{
  try { const country=countryInfo(req.query.country||'TG');res.json({country:country.code,currency:country.currency,payment_provider:'LomoPay Direct API',methods:methodsFor(country.code)}); }
  catch(e){res.status(e.status||400).json({error:e.message});}
});
router.post('/checkout',async(req,res)=>{
  let ref=null,ctx=null;
  try {
    const {user}=await requireUser(req),plan=PLANS.find(p=>p.id===req.body?.plan);
    const country=countryInfo(req.body?.country||'TG'), method=String(req.body?.payment_method||'');
    if(!plan)return res.status(400).json({error:'invalid_plan'});
    if(!enabledCurrencies().has(country.currency))return res.status(503).json({error:'lomopay_currency_not_enabled',currency:country.currency});
    const methods=methodsFor(country.code), selected=methods.find(m=>m.code===method);
    if(!selected)return res.status(503).json({error:'lomopay_operator_not_configured',country:country.code});
    const operator=String((operatorConfig()[country.code]||[]).find(x=>x.code===method)?.code||'');
    if(!operator)return res.status(503).json({error:'lomopay_operator_not_configured'});
    const phone=normalizePhone(req.body?.phone,country), amount=await localPrice(plan.price,country.currency);
    const email=user.email||'', name=(email.split('@')[0]||'Utilisateur').replace(/[^a-zA-ZÀ-ÿ0-9 _-]/g,' ').trim().slice(0,60)||'Utilisateur';
    ref='izo_'+crypto.randomUUID();ctx={userId:user.id,plan,method};
    await recordInitial({userId:user.id,paymentId:ref,plan,amount,currency:country.currency,method,payload:{provider:'lomopay',country:country.code,external_reference:ref}});
    const response=await lomo('/direct.php',{method:'POST',headers:{'Idempotency-Key':ref},body:JSON.stringify({amount,currency:country.currency,country:country.code,operator,phone,method:'mobile_money',customer_name:name,customer_email:email,external_reference:ref,webhook_url:publicUrl()+'/api/billing/lomopay-webhook',...(req.body?.otp?{otp:String(req.body.otp).trim()}: {})})});
    const p=payloadData(response),providerId=p.id||p.payment_id||null,status=String(p.status||'pending').toLowerCase();
    await updateLocal(ref,{status:status==='failed'?'failed':'pending',raw_payload:{provider:'lomopay',provider_id:providerId,response},updated_at:new Date().toISOString()});
    let verification={credited:false,status,paymentId:ref};
    if(status==='completed'){try{verification=await creditPayment(ref);}catch(e){console.warn('LomoPay immediate verification deferred:',e.message);}}
    const action=p.next_action||{};
    return res.json({ok:true,payment_id:ref,provider_payment_id:providerId,status:verification.status||status,credited:!!verification.credited||['success','completed'].includes(String(verification.status||status).toLowerCase()),pending_confirmation:!verification.credited&&!['success','completed','failed'].includes(String(verification.status||status).toLowerCase()),message:action.message||(action.type==='confirm_on_phone'?'Une demande de paiement a été envoyée sur ton téléphone. Confirme-la avec ton code PIN.':'Paiement lancé.'),next_action:{type:action.type||'confirm_on_phone',url:action.url||null,otp_required:!!(p.otp_required||action.otp_required)},plan:{...plan,display_price:amount,currency:country.currency},country:country.code,display_currency:CURRENCY_NAMES[country.currency],payment_currency:country.currency,payment_provider:'LomoPay Direct API',payment_method:method});
  } catch(e) {
    if(ref&&ctx){try{await updateLocal(ref,{status:'failed',raw_payload:{provider:'lomopay',error:e.payload||e.message},updated_at:new Date().toISOString()});}catch(re){console.error('Failed to record LomoPay failure:',re.message);}}
    console.error('LomoPay Direct checkout failed:',e.message);
    return res.status(e.status||500).json({error:e.message||'checkout_failed'});
  }
});
router.get('/verify/:paymentId',async(req,res)=>{
  try {
    const {user}=await requireUser(req),local=await localPayment(req.params.paymentId);
    if(!local)return res.status(404).json({error:'payment_not_found'});
    if(local.user_id!==user.id)return res.status(403).json({error:'payment_forbidden'});
    const result=await creditPayment(req.params.paymentId);
    return res.json({status:result.status||local.status,...result});
  } catch(e){return res.status(e.status||500).json({error:e.message||'payment_verification_failed'});}
});
router.post('/lomopay-webhook',async(req,res)=>{
  try {
    const {secretKey}=credentials(),raw=Buffer.isBuffer(req.body)?req.body:Buffer.from(JSON.stringify(req.body||{})),sig=String(req.get('X-LomoPay-Signature')||'').replace(/^sha256=/i,''),expected=crypto.createHmac('sha256',secretKey).update(raw).digest('hex'),a=Buffer.from(sig,'hex'),b=Buffer.from(expected,'hex');
    if(!sig||a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).send('invalid_signature');
    const event=JSON.parse(raw.toString('utf8'));
    if(!['payment.succeeded','payment.updated','payment.failed'].includes(String(event.type||'')))return res.status(200).send('ignored');
    const ref=event?.data?.external_reference;if(!ref)return res.status(200).send('missing_reference');
    const local=await localPayment(ref);if(!local||local.gateway!=='lomopay')return res.status(200).send('unknown_payment');
    const status=String(event?.data?.status||'').toLowerCase();
    if(status==='completed'||event.type==='payment.succeeded')await creditPayment(ref);
    else if(status==='failed'||event.type==='payment.failed')await updateLocal(ref,{status:'failed',raw_payload:event,updated_at:new Date().toISOString()});
    else await updateLocal(ref,{status:'pending',raw_payload:event,updated_at:new Date().toISOString()});
    return res.status(200).send('ok');
  } catch(e){console.error('LomoPay webhook failed:',e.message);return res.status(e.status||500).send('webhook_processing_failed');}
});
export { PLANS, COUNTRIES, creditPayment as creditFromPayment };
export default router;
