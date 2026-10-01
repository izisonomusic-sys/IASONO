const API='/api';
const LANGS=[
  ['fr','???? Fran�ais'],['en','???? English'],['ee','???? E?egbe (Ewe)'],['mina','???? Mina / Gen'],['kbp','???? Kaby�'],['tem','???? Tem'],['ife','???? If�'],['nawdm','???? Nawdm'],['bass','???? Bassar'],['kon','???? Konkomba'],['ha','?? Hausa'],['yo','?? Yoruba'],['tw','?? Twi']
];
function safeLocalJson(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch(e){console.warn('localStorage reset:',key,e);localStorage.removeItem(key);return fallback}}
const state={lang:localStorage.getItem('izisono_lang')||'fr',occasion:'birthday',supabase:null,user:null,config:null,profile:null,notifications:safeLocalJson('izisono_notifications',[]),plans:[],selectedPlan:localStorage.getItem('izisono_selected_plan')||'popular',paymentMethod:'togocel'};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(m){const x=$('#toast');x.textContent=m;x.classList.add('show');setTimeout(()=>x.classList.remove('show'),3200)}
function addNotification(title,text){state.notifications.unshift({id:Date.now(),title,text,time:new Date().toISOString()});state.notifications=state.notifications.slice(0,12);localStorage.setItem('izisono_notifications',JSON.stringify(state.notifications));renderNotifications();}
function renderNotifications(){const list=$('#notificationList');if(!list)return;list.innerHTML=state.notifications.length?state.notifications.map(n=>`<div class="notification-item"><span>?</span><div><b>${esc(n.title)}</b><p>${esc(n.text)}</p><small>${new Date(n.time).toLocaleString()}</small></div></div>`).join(''):'<div class="notification-empty">Aucune notification pour le moment.</div>';$('#notificationDot').hidden=!state.notifications.length;}
async function api(path,opt={}){const headers={'Content-Type':'application/json','Accept-Language':state.lang,...(opt.headers||{})};if(state.supabase){const {data}=await state.supabase.auth.getSession();if(data.session?.access_token)headers.Authorization=`Bearer ${data.session.access_token}`;}const r=await fetch(API+path,{...opt,headers});const body=await r.json().catch(()=>({}));if(!r.ok){const messages={email_confirmation_required:'Confirme ton adresse email avant de g�n�rer une chanson.',generation_rate_limited:'Trop de demandes. Attends une minute puis r�essaie.',too_many_active_generations:'Tu as d�j� trop de g�n�rations en cours.',daily_generation_limit:'La limite quotidienne de g�n�rations a �t� atteinte.',insufficient_credits:'Tu n�as pas assez de Notes.',mureka_api_key_missing:'Le service de g�n�ration IA n�est pas configur�.',paydunya_credentials_missing:'Le paiement PayDunya n�est pas configur� c�t� serveur.'};throw new Error(messages[body.error]||body.error||body.message||'Erreur');}return body}
async function bootSupabase(){
  const cfg=await api('/config');
  state.config=cfg;
  if(!cfg.supabase?.url||!cfg.supabase?.publishableKey)throw new Error('Supabase non configur�');
  let createClient;
  try{
    ({createClient}=await import('https://esm.sh/@supabase/supabase-js@2'));
  }catch(first){
    console.warn('Supabase CDN esm.sh indisponible, tentative jsDelivr',first);
    try{
      ({createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
    }catch(second){
      throw new Error('Impossible de charger le module Supabase. V�rifie ta connexion ou d�sactive le bloqueur de contenu.');
    }
  }
  state.supabase=createClient(cfg.supabase.url,cfg.supabase.publishableKey);
  let recoveryOpened=false;
  state.supabase.auth.onAuthStateChange((event,session)=>{
    state.user=session?.user||null;renderAuth();
    if(event==='PASSWORD_RECOVERY'){recoveryOpened=true;setTimeout(()=>openRecovery(true),0);}
    // Auth callbacks run under the Supabase lock; defer calls that read the session.
    setTimeout(()=>{loadTracks();loadCredits();renderProfile();},0);
  });
  const {data,error}=await state.supabase.auth.getUser();
  if(error&&error.name!=='AuthSessionMissingError')console.warn('Supabase getUser:',error.message);
  state.user=data?.user||null;
  if(new URLSearchParams(location.search).get('auth')==='recovery'){
    if(!recoveryOpened){openRecovery(!!state.user);if(!state.user)$('#recoveryMessage').textContent='Ce lien est invalide ou expiré. Demandez un nouveau lien.';}
    const url=new URL(location.href);url.searchParams.delete('auth');history.replaceState({},'',url.pathname+url.search+url.hash);
  }
}
function renderAuth(){document.querySelectorAll('[data-signup]').forEach(b=>b.hidden=!!state.user);const b=$('#loginBtn'), mobile=$('#mobileProfileBtn'), bottom=$('#bottomProfileAvatar'), avatar=$('#mobileProfileAvatar');if(state.user){const label=(state.user.email||'Compte').split('@')[0];b.textContent=`${label} � Profil`;b.onclick=()=>showPage('profile');const initial=(label.charAt(0)||'U').toUpperCase();if(avatar)avatar.textContent=initial;if(bottom)bottom.textContent=initial;}else{b.textContent='Se connecter';b.onclick=login;if(avatar)avatar.textContent='I';if(bottom)bottom.textContent='?';}if(mobile)mobile.onclick=()=>state.user?showPage('profile'):login();}
async function loadCredits(){if(!state.user){$('#creditsDisplay').textContent='Connecte-toi';$('#headerNotes').textContent='0';return}try{const d=await api('/me');state.profile=d;$('#creditsDisplay').textContent=`${d.credits} Notes`;
$('#headerNotes').textContent=d.credits;$('#notesBalance').textContent=d.credits;renderProfile();}catch{}}
async function loadOccasions(){try{const d=await api('/occasions');$('#occasionGrid').innerHTML=d.occasions.map(o=>`<button type="button" class="occasion ${o.id===state.occasion?'selected':''}" data-id="${o.id}"><span>${o.icon}</span><b>${o.name}</b></button>`).join('');document.querySelectorAll('.occasion').forEach(b=>b.onclick=()=>{state.occasion=b.dataset.id;document.querySelectorAll('.occasion').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')})}catch{toast('Les occasions sont indisponibles. Vérifie ta connexion Internet.');}}
async function loadTracks(){const list=$('#trackList');if(!state.user){list.innerHTML='<div class="empty">Connecte-toi pour retrouver tes cr�ations.</div>';return}try{const d=await api('/tracks');const tracks=d.tracks||[];$('#profileSongs').textContent=tracks.filter(t=>t.user_id===state.user.id).length;if(!tracks.length){list.innerHTML='<div class="empty">Aucune cr�ation pour le moment. Ta premi�re chanson appara�tra ici.</div>';return}list.innerHTML=tracks.map(t=>`<article class="track-row" data-track-id="${esc(t.id)}"><div class="mini-cover">?</div><div class="track-info"><h3>${esc(t.title)}</h3><p>${esc(t.genre||'')} � ${esc(t.mood||'')} � ${new Date(t.created_at).toLocaleDateString()}</p></div>${t.audio_url?`<audio controls src="${esc(t.audio_url)}"></audio>`:`<span class="track-status">${esc(t.status)}</span>`}<div class="track-actions"><a class="btn ghost" href="${esc(t.audio_url||'#')}" ${t.audio_url?'download':''}>? T�l�charger</a><button class="btn danger delete-track" data-id="${esc(t.id)}">?? Supprimer</button></div></article>`).join('');document.querySelectorAll('.delete-track').forEach(b=>b.onclick=()=>deleteTrack(b.dataset.id));}catch(e){console.error(e)}}
async function deleteTrack(id){const track=document.querySelector(`.track-row[data-track-id="${CSS.escape(id)}"]`);const title=track?.querySelector('h3')?.textContent||'cette chanson';if(!confirm(`Supprimer d�finitivement � ${title} � ?\n\nCette action ne peut pas �tre annul�e.`))return;const btn=track?.querySelector('.delete-track');if(btn){btn.disabled=true;btn.textContent='Suppression�';}try{await api('/tracks/'+encodeURIComponent(id),{method:'DELETE'});addNotification('Chanson supprim�e',`� ${title} � a �t� supprim�e de ta biblioth�que.`);toast('Chanson supprim�e.');await loadTracks();}catch(e){if(btn){btn.disabled=false;btn.textContent='?? Supprimer';}toast(e.message||'Impossible de supprimer la chanson.')}}
async function loadPlans(){try{const d=await api('/billing/plans');state.plans=d.plans||[];const currency=d.display_currency==='XOF'?'FCFA':(d.display_currency||'FCFA');$('#notePlanGrid').innerHTML=state.plans.map(p=>`<article class="note-plan ${p.popular?'popular-plan':''}" data-plan="${p.id}"><span class="plan-tag">${p.popular?'POPULAIRE':p.id==='discovery'?'D�COUVERTE':'PREMIUM'}</span><h3>${esc(p.name)}</h3><strong>${p.credits} Notes</strong><b>${Number(p.display_price??p.price).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}</b><p>${esc(p.description||'Recharge ton solde')}</p><button class="btn ${p.popular?'primary':'ghost'} select-plan" data-plan="${p.id}">${state.selectedPlan===p.id?'? S�lectionn�':'Choisir'}</button></article>`).join('');document.querySelectorAll('.select-plan').forEach(b=>b.onclick=e=>{e.stopPropagation();selectPlan(b.dataset.plan)});document.querySelectorAll('.note-plan').forEach(c=>c.onclick=()=>selectPlan(c.dataset.plan));updatePlanSelection();}catch(e){console.error(e)}}
function selectPlan(plan){if(!state.plans.length)return;state.selectedPlan=plan;localStorage.setItem('izisono_selected_plan',plan);updatePlanSelection();}
function updatePlanSelection(){const plan=state.plans.find(p=>p.id===state.selectedPlan);const currency=state.config?.currency?.code==='XOF'?'FCFA':(state.config?.currency?.code||'FCFA');document.querySelectorAll('.note-plan').forEach(c=>{const yes=c.dataset.plan===state.selectedPlan;c.classList.toggle('selected-plan',yes);const b=c.querySelector('.select-plan');if(b){b.textContent=yes?'? S�lectionn�':'Choisir';const popular=state.plans.find(p=>p.id===c.dataset.plan)?.popular;b.classList.toggle('primary',!!(yes||popular));b.classList.toggle('ghost',!(yes||popular));}});const btn=$('#continuePlanBtn');if(!btn)return;btn.disabled=!plan;$('#selectedPlanLabel').textContent=plan?`${plan.name} � ${plan.credits} Notes � ${Number(plan.display_price??plan.price).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`:'Aucun forfait s�lectionn�';$('#selectedPlanHint').textContent=plan?'Pr�t ? Continue vers le choix du paiement.':'S�lectionne une offre pour continuer.';}
function showPaymentPage(){if(!state.user)return login();const plan=state.plans.find(p=>p.id===state.selectedPlan);if(!plan)return toast('Choisis d�abord un forfait.');const currency=state.config?.currency?.code==='XOF'?'FCFA':(state.config?.currency?.code||'FCFA');$('#paymentPlanName').textContent=plan.name;$('#paymentPlanCredits').textContent=`${plan.credits} Notes`;$('#paymentPlanSongs').textContent=`${Math.floor(plan.credits/2)} chanson${plan.credits>2?'s':''}`;$('#paymentPlanPrice').textContent=`${Number(plan.display_price??plan.price).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`;showPage('payment');}
async function buyPlan(plan){
  if(!state.user)return login();
  const phone=($('#paymentPhone')?.value||'').trim();
  const btn=$('#payNowBtn');
  if(!phone){toast('Entre ton numéro Togo avant de payer.');$('#paymentPhone')?.focus();return;}
  if(btn){btn.disabled=true;btn.textContent='Lancement…';}
  try{
    const d=await api('/billing/checkout',{method:'POST',body:JSON.stringify({plan,payment_method:state.paymentMethod,phone})});
    addNotification('Paiement lancé',d.message||'Valide la demande de paiement sur ton téléphone.');
    if(d.pending_confirmation){
      toast(d.message||'Valide le paiement sur ton téléphone.');
      await pollPaymentStatus(d.payment_id);
    }else if(d.status==='completed'){
      toast(`Paiement confirmé : +${d.plan?.credits||0} Notes`);
      await loadCredits();
      showPage('notes');
    }
  }catch(e){
    toast(e.message==='paydunya_credentials_missing'?'Le paiement PayDunya n’est pas encore configuré côté serveur.':e.message);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Payer maintenant';}
  }
}
async function pollPaymentStatus(paymentId){
  if(!paymentId)return;
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,3000));
    try{
      const r=await api('/billing/verify/'+encodeURIComponent(paymentId));
      const status=String(r.status||'').toLowerCase();
      if(r.credited){
        addNotification('Notes ajoutées',`${r.creditsAdded||0} Notes ont été ajoutées à ton compte.`);
        toast(`Paiement confirmé : +${r.creditsAdded||0} Notes`);
        await loadCredits();
        return;
      }
      if(['failed','cancelled','canceled'].includes(status)){
        toast('Le paiement n’a pas été confirmé. Tu peux réessayer.');
        return;
      }
    }catch(e){console.warn('SoftPay status check failed',e);}
  }
  toast('La demande est encore en cours. Valide le paiement sur ton téléphone ; ton solde sera actualisé automatiquement après confirmation.');
}
function showPage(page,{updateUrl=true,behavior='smooth'}={}){const pages=['profile','notes','payment'];pages.forEach(id=>{const el=$('#'+id);if(el)el.hidden=id!==page});const isAccount=pages.includes(page);document.querySelectorAll('main>section').forEach(x=>x.hidden=isAccount);if(!isAccount)pages.forEach(id=>{const el=$('#'+id);if(el)el.hidden=true});if(updateUrl){history.replaceState({izisonoPage:page},'',location.pathname+(page&&page!=='home'?`#${page}`:'#top'));}requestAnimationFrame(()=>{const el=$('#'+page);if(el)el.scrollIntoView({behavior,block:'start'});});if(page==='notes'){loadCredits();loadPlans();}if(page==='profile'){renderProfile();loadCredits();}if(page==='payment'){loadPlans();}}
function restoreMain({updateUrl=true,behavior='smooth'}={}){['profile','notes','payment'].forEach(id=>{const el=$('#'+id);if(el)el.hidden=true});document.querySelectorAll('main>section').forEach(x=>x.hidden=false);if(updateUrl)history.replaceState({izisonoPage:'top'},'',location.pathname+'#top');requestAnimationFrame(()=>window.scrollTo({top:0,behavior}));;}
function renderProfile(){if(!state.user)return;const email=state.user.email||'';const name=state.profile?.display_name||localStorage.getItem('izisono_profile_name')||email.split('@')[0]||'Utilisateur';const initial=name.charAt(0).toUpperCase();$('#profileName').textContent=name;$('#profileEmail').textContent=email;$('#profileAvatar').textContent=initial;$('#profileNotes').textContent=state.profile?.credits??0;const input=$('#profileDisplayName');if(input&&document.activeElement!==input)input.value=name;const created=state.user.created_at?new Date(state.user.created_at):new Date();$('#profileMember').textContent=`Membre depuis ${created.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}`;}
async function saveProfile(){if(!state.user)return login();const input=$('#profileDisplayName'),hint=$('#profileSaveHint'),btn=$('#saveProfileBtn');const display_name=(input?.value||'').trim();if(!display_name)return toast('Entre un nom ou un pseudo.');if(btn){btn.disabled=true;btn.textContent='Enregistrement�';}try{const d=await api('/me',{method:'PATCH',body:JSON.stringify({display_name})});state.profile={...(state.profile||{}),...d};localStorage.setItem('izisono_profile_name',display_name);renderProfile();renderAuth();if(hint)hint.textContent='Profil enregistr�.';toast('Profil mis � jour.');}catch(e){if(hint)hint.textContent=e.message||'Erreur';toast(e.message||'Impossible de mettre � jour le profil.');}finally{if(btn){btn.disabled=false;btn.textContent='Enregistrer';}}}
async function waitForGeneration(trackId){for(let i=0;i<120;i++){const d=await api('/generation/'+trackId);const status=d.providerStatus||d.status||'preparing';const labels={preparing:'Pr�paration�',queued:'Dans la file�',running:'Composition en cours�',streaming:'Finalisation de l�audio�'};$('#resultMeta').textContent=`Mureka � ${labels[status]||status}`;if(d.streamUrl)$('#audioPlayer').src=d.streamUrl;if(d.done){if(d.status!=='succeeded')throw new Error(d.failed_reason||'La g�n�ration a �chou�');if(!d.audio_url)throw new Error('Mureka a termin� la g�n�ration mais aucun fichier audio n�a �t� retourn�.');return d;}await new Promise(r=>setTimeout(r,3000));}throw new Error('La g�n�ration prend trop de temps. Tu peux retrouver le statut dans ta biblioth�que.')}
async function generate(e){e.preventDefault();if(!state.user)return login();const btn=$('#submitBtn');if(btn.disabled)return;const prompt=$('#promptInput').value.trim(),lyrics=$('#lyricsInput').value.trim();if(!prompt&&!lyrics)return toast('D�cris ton histoire ou ajoute des paroles.');if(state.profile&&Number(state.profile.credits||0)<2){toast('Tu n�as pas assez de Notes. Ach�te un forfait pour continuer.');showPage('notes');return;}btn.disabled=true;btn.textContent='? Envoi � Mureka�';$('#resultSection').hidden=false;$('#resultTitle').textContent='Cr�ation de ta chanson�';$('#resultMeta').textContent='Connexion � Mureka�';$('#audioPlayer').removeAttribute('src');try{const started=await api('/generate',{method:'POST',body:JSON.stringify({prompt,lyrics,occasion:state.occasion,genre:$('#genreSelect').value,mood:$('#moodSelect').value,voice:$('#voiceSelect').value,duration:+$('#durationSelect').value,language:$('#songLanguageSelect').value,instrumental:$('#instrumental').checked})});$('#resultSection').hidden=false;$('#resultTitle').textContent=started.title||'Cr�ation en cours';$('#resultMeta').textContent='Mureka � t�che cr��e, g�n�ration en cours�';$('#mockNotice').textContent='Izisono envoie ta cr�ation � Mureka. Cette �tape peut prendre quelques instants.';btn.textContent='? G�n�ration IA�';const d=await waitForGeneration(started.id);$('#resultTitle').textContent=d.title;$('#resultMeta').textContent=`${d.genre||''} � ${d.mood||''} � ${d.duration||''}s`;$('#audioPlayer').src=d.audio_url||d.streamUrl;$('#downloadBtn').href=d.audio_url||d.streamUrl;$('#publicBtn').onclick=async()=>{await api('/tracks/'+d.id,{method:'PATCH',body:JSON.stringify({public:true})});toast('Chanson publi�e dans Explorer.');addNotification('Chanson publi�e',d.title);loadTracks()};$('#shareBtn').onclick=async()=>{if(navigator.share)await navigator.share({title:d.title,url:location.href});else await navigator.clipboard.writeText(location.href);toast('Lien copi�.');};$('#mockNotice').textContent='Chanson g�n�r�e avec Mureka. Ton fichier est pr�t.';addNotification('Nouvelle chanson pr�te',d.title);loadTracks();loadCredits();toast('Chanson g�n�r�e avec succ�s !');navigateToHash('resultSection')}catch(err){toast(err.message)}finally{btn.disabled=false;btn.textContent='? Cr�er ma chanson � 2 Notes'}}
function updatePromptCounter(){const input=$('#promptInput'),counter=$('#promptCounter');if(input&&counter)counter.textContent=`${input.value.length}/1200`;}
function createSpeechRecognizer(input,button){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){button.title='La dict�e vocale n�est pas disponible dans ce navigateur';button.addEventListener('click',()=>toast('La dict�e vocale n�est pas disponible dans ce navigateur. Utilise Chrome ou Edge.'));return null;}const recognition=new Recognition();recognition.continuous=false;recognition.interimResults=true;recognition.lang=state.lang==='fr'?'fr-FR':state.lang==='en'?'en-US':state.lang==='ee'?'ee-TG':'fr-FR';let base='';recognition.onstart=()=>{button.classList.add('listening');button.setAttribute('aria-pressed','true');button.textContent='?';toast('Je t��coute�');base=input.value.trim();};recognition.onresult=e=>{let text='';for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;if(text){input.value=(base?base+' ':'')+text;input.dispatchEvent(new Event('input'));}};recognition.onerror=e=>{button.classList.remove('listening');button.setAttribute('aria-pressed','false');button.textContent='??';if(e.error!=='aborted')toast(e.error==='not-allowed'?'Autorise le micro dans ton navigateur.':'Impossible d�utiliser le micro.');};recognition.onend=()=>{button.classList.remove('listening');button.setAttribute('aria-pressed','false');button.textContent='??';};button.addEventListener('click',()=>{try{recognition.start();}catch{recognition.stop();}});return recognition;}
function bindVoiceInputs(){document.querySelectorAll('.voice-input-btn').forEach(button=>{const input=document.getElementById(button.dataset.target);if(input)createSpeechRecognizer(input,button);});}
async function generateAiLyrics(){
  const btn=$('#generateLyricsBtn'), subject=$('#promptInput')?.value.trim()||'mon histoire';
  const occasion=state.occasion||'autre', style=$('#genreSelect')?.value||'Afrobeat', language=$('#songLanguageSelect')?.value||state.lang;
  if(!btn)return;
  btn.disabled=true;btn.textContent='? G�n�ration des paroles�';
  try{
    const d=await api('/lyrics/generate',{method:'POST',body:JSON.stringify({subject,occasion,language,style})});
    if($('#lyricsInput')){$('#lyricsInput').value=d.lyrics||'';$('#lyricsInput').dispatchEvent(new Event('input',{bubbles:true}));}
    toast('Paroles IA g�n�r�es. Tu peux les modifier avant de cr�er la chanson.');
  }catch(e){toast(e.message||'Impossible de g�n�rer les paroles.');}
  finally{btn.disabled=false;btn.textContent='? G�n�rer des paroles avec l�IA';}
}
function bindPromptHelpers(){const input=$('#promptInput');bindVoiceInputs();if(input){input.addEventListener('input',updatePromptCounter);updatePromptCounter();}document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{if(input){input.value=b.dataset.example;input.dispatchEvent(new Event('input'));input.focus();input.setSelectionRange(input.value.length,input.value.length);}});document.querySelectorAll('.demo-create').forEach(b=>b.onclick=()=>{restoreMain();navigateToHash('create');setTimeout(()=>{const p=$('#promptInput');if(p){p.value=b.dataset.demoPrompt||'';p.dispatchEvent(new Event('input'));p.focus({preventScroll:true});}const title=b.dataset.demoTitle||'';const genre=title.toLowerCase().includes('amapiano')?'Amapiano':title.toLowerCase().includes('zouk')?'Zouk':title.toLowerCase().includes('gospel')?'Gospel':'Afrobeat';if($('#genreSelect'))$('#genreSelect').value=genre;},220);});}
async function login(){
  // Account creation is now the entry view, exactly like the requested card.
  const modal=$('#signupModal');
  if(modal.dataset.busy==='true')return;
  if(!showAuthPanel(modal))return;resetAuthFields(modal);$('#signupMessage').textContent='';
  $('#signupEntry').hidden=false;$('#signupSuccess').hidden=true;modal.setAttribute('aria-labelledby','signupTitle');$('#authModal').setAttribute('aria-labelledby','signupTitle');
  $('#signupLoginPrompt').hidden=false;$('#signupLogin').hidden=false;$('#signupLogin').textContent='Se connecter';const submit=$('#signupSubmit');submit.disabled=false;submit.textContent='Créer mon compte';
  $('#signupEmail').focus();
}
function showLoginPanel(){
  const modal=$('#loginModal');if(!modal||!showAuthPanel(modal))return;
  $('#loginEmail').value=state.user?.email||$('#loginEmail').value;
  $('#loginPassword').type='password';const reveal=document.querySelector('[data-reveal="loginPassword"]');if(reveal){reveal.textContent='Afficher';reveal.setAttribute('aria-pressed','false');}
  $('#loginUsePassword').checked=true;$('#loginUsePassword').dispatchEvent(new Event('change'));
  $('#loginEmail').focus();
}
function handlePaymentReturn(){const p=new URLSearchParams(location.search);if(!p.has('payment'))return;const token=p.get('token');const cancelled=p.get('payment')==='cancelled';if(cancelled){toast('Paiement annul�. Aucun cr�dit n�a �t� ajout�.');history.replaceState({},'',location.pathname+location.hash);return;}if(token&&state.user){api('/billing/verify/'+encodeURIComponent(token)).then(r=>{if(r.credited){addNotification('Notes ajout�es',`${r.creditsAdded} Notes ont �t� ajout�es � ton compte.`);toast(`Paiement confirm� : +${r.creditsAdded} Notes`);loadCredits();}else if(['pending','initiated'].includes(String(r.status||'').toLowerCase())){toast('Paiement en cours de confirmation�');}else toast('Le paiement n�a pas encore �t� confirm�.');}).catch(e=>toast(e.message));}history.replaceState({},'',location.pathname+location.hash);}
function setMobileNavActive(target){document.querySelectorAll('[data-bottom-nav]').forEach(b=>b.classList.toggle('active',b.dataset.bottomNav===target));}
function goMobileNav(target){$('#mobileMenu').hidden=true;setMobileNavActive(target);navigateToHash(target);}
function navigateToHash(target){
  const allowed={home:'top',create:'create',library:'library',explore:'explore',notes:'pricing',pricing:'pricing',resultSection:'resultSection',aiTools:'aiTools'};
  const hash=allowed[target]||target;
  if(target==='profile'){showPage('profile');return;}
  if(target==='notes'){showPage('notes');return;}
  if(target==='payment'){showPage('payment');return;}
  restoreMain({updateUrl:false});
  const el=document.getElementById(hash);
  if(el){
    history.replaceState({izisonoPage:hash},'',location.pathname+'#'+hash);
    requestAnimationFrame(()=>el.scrollIntoView({behavior:'smooth',block:'start'}));
  }else{
    history.replaceState({izisonoPage:'top'},'',location.pathname+'#top');
    requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
  }
}
function applyHashNavigation(){
  const hash=(location.hash||'#top').slice(1)||'top';
  if(['profile','notes','payment'].includes(hash)){showPage(hash,{updateUrl:false,behavior:'auto'});return;}
  restoreMain({updateUrl:false,behavior:'auto'});
  const target=document.getElementById(hash);
  if(target)requestAnimationFrame(()=>target.scrollIntoView({behavior:'auto',block:'start'}));
}
function bindNavigation(){
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{
    const href=a.getAttribute('href');if(!href||href==='#')return;
    e.preventDefault();
    const hash=href.slice(1)||'top';
    navigateToHash(hash);
  }));
  window.addEventListener('hashchange',()=>applyHashNavigation());
  document.querySelectorAll('#pricing [data-plan]').forEach(b=>b.onclick=e=>{e.preventDefault();navigateToHash('pricing');setTimeout(()=>selectPlan(b.dataset.plan),120);});
  document.querySelectorAll('.tool-jump').forEach(b=>b.onclick=e=>{e.preventDefault();navigateToHash(b.dataset.toolTarget||'create');});
}
// All auth actions share the existing Supabase client and its session storage.
function authError(error){
  const messages={
    weak_password:'Ce mot de passe ne respecte pas les règles de sécurité. Utilisez un mot de passe plus long et unique, avec majuscules, minuscules, chiffres et symboles.',
    user_already_exists:'Cette adresse possède déjà un compte. Connectez-vous ou utilisez « Mot de passe oublié ».',
    email_exists:'Cette adresse possède déjà un compte. Connectez-vous ou utilisez « Mot de passe oublié ».',
    email_address_invalid:'Veuillez entrer une adresse e-mail valide.',
    over_email_send_rate_limit:'Trop de demandes. Patientez quelques minutes avant de réessayer.',
    over_request_rate_limit:'Trop de demandes. Patientez quelques minutes avant de réessayer.',
    signup_disabled:'Les inscriptions sont temporairement indisponibles. Réessayez plus tard.',
    email_provider_disabled:'La connexion par e-mail est temporairement indisponible.',
    same_password:'Choisissez un mot de passe différent de votre ancien mot de passe.',
    otp_expired:'Ce lien a expiré. Demandez un nouveau lien.',
    session_not_found:'Votre lien a expiré. Demandez un nouveau lien.'
  };
  return messages[error?.code]||(error?.status===429?messages.over_request_rate_limit:'Impossible de terminer cette demande. Vérifiez votre connexion et réessayez.');
}
function authFieldError(id,text){
  const field=$('#'+id);field.setAttribute('aria-invalid',String(!!text));
  $('#'+id+'Error').textContent=text;return !text;
}
function validateAuthField(id){
  const field=$('#'+id);let error='';
  if(field.type==='email'){
    if(!field.value.trim()||field.validity.typeMismatch)error='Veuillez entrer une adresse e-mail valide.';
  }else if(field.type==='checkbox'){
    if(!field.checked)error='Vous devez accepter les conditions d’utilisation et la politique de confidentialité.';
  }else if(id.endsWith('Confirm')){
    if(!field.value||field.value!==$('#'+id.replace('Confirm','Password')).value)error='Les deux mots de passe ne correspondent pas.';
  }else if(!field.value)error='Veuillez entrer un mot de passe.';
  else if(field.value.length<8)error='Le mot de passe doit contenir au minimum 8 caractères.';
  return authFieldError(id,error);
}
function validateAuthForm(form){
  const fields=[...form.querySelectorAll('input')];const valid=fields.map(f=>validateAuthField(f.id)).every(Boolean);
  if(!valid)form.querySelector('[aria-invalid="true"]')?.focus();return valid;
}
function resetAuthFields(modal){
  modal.querySelectorAll('form').forEach(f=>f.reset());
  modal.querySelectorAll('input').forEach(f=>{if($('#'+f.id+'Error'))authFieldError(f.id,'');});
  modal.querySelectorAll('[data-reveal]').forEach(b=>{
    $('#'+b.dataset.reveal).type='password';b.setAttribute('aria-pressed','false');b.textContent='Afficher';
    b.setAttribute('aria-label','Afficher le mot de passe');
  });
}
let authOpener=null;
function showAuthPanel(modal){
  const shell=$('#authModal');
  if(shell.querySelector('[data-auth-panel][data-busy="true"]'))return false;
  if(shell.hidden)authOpener=document.activeElement;
  shell.querySelectorAll('[data-auth-panel]').forEach(panel=>{
    panel.hidden=panel!==modal;
    if(panel!==modal)panel.querySelectorAll('input[type="password"],.auth-password input').forEach(input=>input.value='');
  });
  state.authMode=modal.dataset.authPanel;shell.dataset.mode=state.authMode;
  shell.setAttribute('aria-labelledby',modal.getAttribute('aria-labelledby'));
  shell.hidden=false;document.body.classList.add('auth-open');return true;
}
function hideAuthPanel(modal){
  if(modal.dataset.busy==='true')return false;
  modal.hidden=true;resetAuthFields(modal);$('#authModal').hidden=true;state.authMode=null;
  document.body.classList.remove('auth-open');
  if(authOpener?.isConnected&&!authOpener.closest('[hidden]'))authOpener.focus();else $('#loginBtn').focus();
  return true;
}
function bindAuthFields(){
  document.querySelectorAll('[data-auth-panel]').forEach(modal=>{
    modal.querySelectorAll('input').forEach(field=>{
      if(!$('#'+field.id+'Error'))return; // Keep the existing login validation unchanged.
      const check=()=>{validateAuthField(field.id);if(field.id.endsWith('Password')){
        const confirm=$('#'+field.id.replace('Password','Confirm'));if(confirm?.value)validateAuthField(confirm.id);
      }};
      field.addEventListener('blur',check);field.addEventListener('input',check);
    });
    modal.querySelectorAll('[data-reveal]').forEach(button=>{
      const input=$('#'+button.dataset.reveal);let timer;
      function hide(){input.type='password';button.textContent='Afficher';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Afficher le mot de passe');}
      button.onclick=()=>{
        clearTimeout(timer);const visible=input.type==='password';input.type=visible?'text':'password';
        button.textContent=visible?'Masquer':'Afficher';button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'Masquer le mot de passe':'Afficher le mot de passe');
        if(visible)timer=setTimeout(hide,10000);
      };
      input.addEventListener('blur',()=>{clearTimeout(timer);hide();});
    });
    modal.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();hideAuthPanel(modal);}
      if(e.key==='Tab'){
        const nodes=[...modal.querySelectorAll('button,input,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&(document.activeElement===first||!nodes.includes(document.activeElement))){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    });
  });
}
function bindSignup(){
  bindAuthFields();bindRecovery();
  const modal=$('#signupModal'),form=$('#signupForm'),message=$('#signupMessage'),button=$('#signupSubmit');
  let registeredEmail='',resendAt=0;
  const resend=$('#signupResend');
  function updateResend(){const seconds=Math.max(0,Math.ceil((resendAt-Date.now())/1000));resend.disabled=seconds>0||modal.dataset.busy==='true';resend.textContent=seconds?`Renvoyer dans ${seconds} s`:'Renvoyer l’e-mail';}
  setInterval(()=>{if(!modal.hidden)updateResend();},1000);
  document.querySelectorAll('[data-signup]').forEach(opener=>opener.onclick=login);
  $('#signupCancel').onclick=()=>hideAuthPanel(modal);
  $('#signupLogin').onclick=()=>{
    const email=$('#signupEmail').value.trim()||registeredEmail;
    if(modal.dataset.busy==='true')return;
    resetAuthFields(modal);showLoginPanel();$('#loginEmail').value=email;$('#loginUsePassword').checked=true;
    $('#loginUsePassword').dispatchEvent(new Event('change'));$('#loginEmail').focus();
  };
  $('#signupContinue').onclick=()=>{if(hideAuthPanel(modal)){restoreMain();navigateToHash('create');}};
  form.onsubmit=async e=>{
    e.preventDefault();if(button.disabled)return;message.textContent='';
    if(!validateAuthForm(form))return;
    if(!state.supabase){message.textContent='Le service de connexion est indisponible. Réessayez dans un instant.';return;}
    const email=$('#signupEmail').value.trim(),password=$('#signupPassword').value;
    button.disabled=true;button.textContent='Création du compte…';modal.dataset.busy='true';form.setAttribute('aria-busy','true');
    try{
      const {data,error}=await state.supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
      if(error)throw error;
      registeredEmail=email;resetAuthFields(modal);button.textContent='Compte créé ✓';
      $('#signupEntry').hidden=true;$('#signupSuccess').hidden=false;modal.setAttribute('aria-labelledby','signupSuccessTitle');$('#authModal').setAttribute('aria-labelledby','signupSuccessTitle');
      const connected=!!data.session;
      $('#signupSuccessTitle').textContent=connected?'Votre studio vous attend':'Vérifiez votre adresse e-mail';
      $('#signupSuccessText').textContent=connected?'Votre compte est créé et vous êtes connecté. Tout est prêt pour votre première chanson.':'Un lien de confirmation vous a été envoyé si cette adresse peut être inscrite. Ouvrez cet e-mail pour activer votre compte.';
      $('#signupSentTo').textContent=email;$('#signupMailHint').hidden=connected;resend.hidden=connected;$('#signupContinue').hidden=!connected;
      $('#signupLoginPrompt').hidden=true;$('#signupLogin').hidden=connected;$('#signupLogin').textContent='Retour à la connexion';
      if(!connected)resendAt=Date.now()+60000;
      $('#signupSuccessTitle').focus();
    }catch(error){message.textContent=authError(error);button.disabled=false;button.textContent='Créer mon compte';}
    finally{modal.dataset.busy='false';form.setAttribute('aria-busy','false');updateResend();}
  };
  resend.onclick=async()=>{
    if(resend.disabled||Date.now()<resendAt||!registeredEmail)return;
    if(!state.supabase){message.textContent='Le service de connexion est indisponible. Réessayez dans un instant.';return;}
    modal.dataset.busy='true';resend.disabled=true;message.textContent='Envoi en cours…';
    try{
      const {error}=await state.supabase.auth.resend({type:'signup',email:registeredEmail,options:{emailRedirectTo:location.origin}});
      if(error)throw error;
      message.textContent='Si votre compte attend une confirmation, un nouveau lien a été envoyé. Vérifiez votre boîte e-mail.';
    }catch(error){message.textContent=authError(error);}
    finally{resendAt=Date.now()+60000;modal.dataset.busy='false';updateResend();}
  };
}
function openRecovery(update=false){
  const modal=$('#recoveryModal');if(!showAuthPanel(modal))return;resetAuthFields(modal);
  $('#recoveryRequestForm').hidden=update;$('#recoveryUpdateForm').hidden=!update;
  $('#recoveryTitle').textContent=update?'Choisir un nouveau mot de passe':'Mot de passe oublié ?';
  $('#recoveryHint').textContent=update?'Protégez votre compte avec un nouveau mot de passe unique.':'Recevez un lien sécurisé pour choisir un nouveau mot de passe.';
  $('#recoveryMessage').textContent='';$('#recoverySave').disabled=false;
  $('#recoveryEmail').value=$('#loginEmail').value.trim();
  $(update?'#recoveryPassword':'#recoveryEmail').focus();
}
function bindRecovery(){
  const modal=$('#recoveryModal'),message=$('#recoveryMessage');let nextRequest=0;
  $('#forgotPassword').onclick=()=>openRecovery();
  $('#recoveryCancel').onclick=()=>hideAuthPanel(modal);
  $('#recoveryLogin').onclick=()=>{if(modal.dataset.busy!=='true'){resetAuthFields(modal);showLoginPanel();}};
  $('#recoveryRequestForm').onsubmit=async e=>{
    e.preventDefault();const button=$('#recoverySend');if(button.disabled)return;
    if(!validateAuthForm(e.target))return;
    if(Date.now()<nextRequest){message.textContent='Patientez une minute avant de demander un nouveau lien.';return;}
    if(!state.supabase){message.textContent='Le service de connexion est indisponible. Réessayez dans un instant.';return;}
    button.disabled=true;button.textContent='Envoi en cours…';modal.dataset.busy='true';message.textContent='';
    try{
      const {error}=await state.supabase.auth.resetPasswordForEmail($('#recoveryEmail').value.trim(),{redirectTo:location.origin+'/?auth=recovery'});
      if(error)throw error;
      message.textContent='Si un compte correspond à cette adresse, un lien de réinitialisation a été envoyé. Vérifiez aussi les courriers indésirables.';
    }catch(error){message.textContent=authError(error);}
    finally{nextRequest=Date.now()+60000;button.disabled=false;button.textContent='Envoyer le lien';modal.dataset.busy='false';}
  };
  $('#recoveryUpdateForm').onsubmit=async e=>{
    e.preventDefault();const button=$('#recoverySave');if(button.disabled||!validateAuthForm(e.target))return;
    if(!state.supabase){message.textContent='Le service de connexion est indisponible. Réessayez dans un instant.';return;}
    button.disabled=true;button.textContent='Enregistrement…';modal.dataset.busy='true';message.textContent='';
    try{
      const {error}=await state.supabase.auth.updateUser({password:$('#recoveryPassword').value});if(error)throw error;
      resetAuthFields(modal);$('#recoveryUpdateForm').hidden=true;
      message.textContent='Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter avec ce nouveau mot de passe.';
    }catch(error){message.textContent=authError(error);}
    finally{button.disabled=false;button.textContent='Enregistrer le mot de passe';modal.dataset.busy='false';}
  };
}
function hardenButtons(){document.querySelectorAll('button:not([type])').forEach(b=>b.type='button');}
function init(){hardenButtons();bindSignup();loadOccasions();loadPlans();renderNotifications();bindNavigation();$('#promptForm').onsubmit=generate;$('#generateLyricsBtn').onclick=generateAiLyrics;$('#loginCancel').onclick=()=>hideAuthPanel($('#loginModal'));$('#loginForm').onsubmit=async e=>{e.preventDefault();const email=$('#loginEmail').value.trim();if(!state.supabase){toast('Le service de connexion est encore en cours de chargement. Actualise la page puis r�essaie.');return;}const usePassword=$('#loginUsePassword')?.checked;const password=$('#loginPassword')?.value||'';try{let result;if(usePassword){if(!password)throw new Error('Entre ton mot de passe.');result=await state.supabase.auth.signInWithPassword({email,password});}else{result=await state.supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});}if(result.error)throw result.error;if(usePassword){hideAuthPanel($('#loginModal'));renderAuth();await loadCredits();await loadTracks();toast('Connexion r�ussie.');const {data}=await state.supabase.auth.getSession();if(data.session?.user?.app_metadata?.role==='admin')setTimeout(()=>location.href='/admin',300);}else{hideAuthPanel($('#loginModal'));toast('Lien de connexion envoy� par email.');addNotification('Connexion',`Lien de connexion envoy� � ${email}.`);}}catch(err){toast(err.message||'Connexion impossible.');}};$('#loginUsePassword').onchange=e=>{const on=e.target.checked;$('#loginPassword').required=on;$('#loginPassword').hidden=!on;$('#loginPasswordField').hidden=!on;$('#loginPassword').value=on?'':$('#loginPassword').value;$('#loginHint').textContent=on?'Entre ton email et ton mot de passe.':'Entre ton email : nous t�enverrons un lien de connexion s�curis�.';};$('#loginPassword').hidden=false;$('#newTrackBtn').onclick=()=>{$('#resultSection').hidden=true;navigateToHash('create')};$('#languageSelect').value=state.lang;$('#songLanguageSelect').value=state.lang;$('#languageSelect').onchange=e=>{state.lang=e.target.value;localStorage.setItem('izisono_lang',state.lang);$('#songLanguageSelect').value=state.lang;$('#mobileLanguageSelect').value=state.lang;loadOccasions()};$('#songLanguageSelect').onchange=e=>{state.lang=e.target.value;localStorage.setItem('izisono_lang',state.lang);$('#languageSelect').value=state.lang};$('#notesBtn').onclick=()=>showPage('notes');$('#profileBuy').onclick=()=>showPage('notes');$('#continuePlanBtn').onclick=showPaymentPage;$('#paymentBack').onclick=()=>showPage('notes');document.querySelectorAll('.payment-method').forEach(b=>b.onclick=()=>{state.paymentMethod=b.dataset.method||'all';document.querySelectorAll('.payment-method').forEach(x=>x.classList.toggle('selected',x===b));});$('#payNowBtn').onclick=()=>{if(!state.selectedPlan)return toast('Choisis un forfait.');buyPlan(state.selectedPlan)};$('#profileLibrary').onclick=()=>{navigateToHash('library')};$('#profileNotifications').onclick=()=>{$('#notificationPanel').hidden=false};$('#saveProfileBtn').onclick=saveProfile;$('#profileBack').onclick=()=>restoreMain();$('#notesBack').onclick=()=>restoreMain();$('#notificationBtn').onclick=()=>{$('#notificationPanel').hidden=!$('#notificationPanel').hidden};$('#notificationClose').onclick=()=>$('#notificationPanel').hidden=true;$('#profileLogout').onclick=async()=>{await state.supabase.auth.signOut();restoreMain();toast('D�connexion effectu�e.')};bindPromptHelpers();$('#mobileMenuBtn').onclick=()=>$('#mobileMenu').hidden=!$('#mobileMenu').hidden;$('#mobileMenuClose').onclick=()=>$('#mobileMenu').hidden=true;document.querySelectorAll('[data-mobile-nav]').forEach(b=>b.onclick=()=>goMobileNav(b.dataset.mobileNav));document.querySelectorAll('[data-bottom-nav]').forEach(b=>b.onclick=()=>goMobileNav(b.dataset.bottomNav));document.addEventListener('click',e=>{const menu=$('#mobileMenu');if(menu&&!menu.hidden&&!menu.contains(e.target)&&!$('#mobileMenuBtn').contains(e.target))menu.hidden=true;});$('#mobileLanguageSelect').value=state.lang;$('#mobileLanguageSelect').onchange=e=>{state.lang=e.target.value;localStorage.setItem('izisono_lang',state.lang);$('#languageSelect').value=state.lang;$('#songLanguageSelect').value=state.lang;loadOccasions();$('#mobileMenu').hidden=true;};}
document.addEventListener('DOMContentLoaded',async()=>{
  // Bind the UI immediately. A temporary Supabase/CDN failure must never make the buttons appear dead.
  try{init();renderAuth();if(location.pathname==='/auth')login();}catch(e){console.error('UI init failed',e);toast('Erreur de chargement de l�interface.');return}
  try{
    await bootSupabase();
    renderAuth();
    loadTracks();
    loadCredits();
    applyHashNavigation();
    handlePaymentReturn();
  }catch(e){
    console.error('Supabase boot failed',e);
    toast(e.message||'Connexion au service impossible. Recharge la page.');
    renderAuth();
  }
});
