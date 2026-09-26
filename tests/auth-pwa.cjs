// Run against npm start. See AUTH-VERIFICATION.md for isolated test dependencies.
const { chromium: playwright } = require('playwright');
const chromium = require('@sparticuz/chromium').default;
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://localhost:3000';
const sdk = path.join(path.dirname(require.resolve('@supabase/supabase-js')), 'umd/supabase.js');
const password = require('node:crypto').randomBytes(18).toString('hex');
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'izisono.test@gmail.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const token = ['header', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'signature'].join('.');
const session = { access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user };
(async()=>{
  const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter(a=>!['--single-process','--disable-web-security'].includes(a)), headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: process.env.TEST_PWA==='1'?'allow':'block' });
    await context.addInitScript({ content: fs.readFileSync(sdk,'utf8')+';globalThis.testSupabase=supabase;' });
    await context.route('https://esm.sh/**', r=>r.fulfill({ contentType: 'application/javascript', body: 'export const createClient=globalThis.testSupabase.createClient;' }));
    if(process.env.TEST_LEGACY==='1'){
      for(const [url,file,type] of [['/','index.html','text/html'],['/script.js','script.js','application/javascript'],['/styles.css','styles.css','text/css']]){
        await context.route(base+url,r=>r.fulfill({contentType:type,body:fs.readFileSync(path.join(__dirname,'../izisono-frontend',file))}));
      }
    }
    await context.route('https://fonts.googleapis.com/**', r=>r.fulfill({ body: '' }));
    await context.route('**/api/config', async r=>{
      const response=await r.fetch();const config=await response.json();
      config.supabase={ url: 'https://auth-test.supabase.co', publishableKey: 'test-public-key' };
      await r.fulfill({ json: config });
    });
    let signups=0, confirmation=true, reject=false, passwords=0, otps=0, resends=0, recoveries=0, updates=0;
    await context.route('https://auth-test.supabase.co/auth/v1/**', async r=>{
      const url=new URL(r.request().url());
      if(url.pathname.endsWith('/signup')){
        signups++;await new Promise(resolve=>setTimeout(resolve,350));assert.equal(r.request().postDataJSON().password,password);
        assert.equal(r.request().postDataJSON().email,user.email);
        assert.equal(url.searchParams.get('redirect_to'),base);
        return r.fulfill(reject?{status:422,headers:{'x-supabase-api-version':'2024-01-01','access-control-expose-headers':'x-supabase-api-version'},json:{code:'weak_password',msg:'Password is too weak'}}:{json:confirmation?user:session});
      }
      if(url.pathname.endsWith('/token')){passwords++;assert.equal(r.request().postDataJSON().email,user.email);assert.equal(r.request().postDataJSON().password,password);return r.fulfill({json:session});}
      if(url.pathname.endsWith('/resend')){resends++;assert.equal(r.request().postDataJSON().type,'signup');return r.fulfill({json:{}});}
      if(url.pathname.endsWith('/recover')){recoveries++;assert.equal(url.searchParams.get('redirect_to'),base+'/?auth=recovery');return r.fulfill({json:{}});}
      if(url.pathname.endsWith('/user')){if(r.request().method()==='PUT'){updates++;assert.equal(r.request().postDataJSON().password,password);}return r.fulfill({json:user});}
      if(url.pathname.endsWith('/logout'))return r.fulfill({status:204});
      if(url.pathname.endsWith('/otp')){otps++;return r.fulfill({json:{}});}
      throw new Error('Unexpected auth request '+url);
    });
    await context.route('**/api/me', r=>{assert.equal(r.request().headers().authorization,`Bearer ${token}`);return r.fulfill({json:{...user,credits:4}});});
    await context.route('**/api/tracks', r=>r.fulfill({json:{tracks:[]}}));
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('status of 422'))errors.push(m.text());});
    await page.goto(base);await page.waitForFunction(()=>document.querySelectorAll('.occasion').length>0);if(process.env.TEST_PWA==='1'){await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);}
    assert.equal(await page.locator('#loginBtn').textContent(),'Se connecter');
    // One physical card and exactly one visible form throughout mode changes.
    await page.evaluate(()=>{
      sessionStorage.removeItem('authOverlap');
      const monitor=()=>{
        if(document.querySelectorAll('#authModal form').length){
          const visible=[...document.querySelectorAll('#authModal form')].filter(f=>f.getClientRects().length);
          if(visible.length>1)sessionStorage.setItem('authOverlap','1');
        }
        requestAnimationFrame(monitor);
      };monitor();
    });
    async function onlyAuthForm(id){
      assert.deepEqual(await page.locator('#authModal form:visible').evaluateAll(forms=>forms.map(f=>f.id)),[id]);
      assert.equal(await page.locator('#authModal .auth-card').count(),1);
      assert.equal(await page.locator('.modal:visible').count(),1);
    }
    await page.click('#loginBtn');await onlyAuthForm('signupForm');
    for(const width of [1280,390,320]){
      await page.setViewportSize({width,height:900});
      const anchor=await page.locator('#authModal .auth-card').boundingBox();
      for(let n=0;n<3;n++){
        await page.click('#signupLogin');await onlyAuthForm('loginForm');
        if(width===1280&&n===0)assert.equal(await page.locator('#loginPassword').isVisible(),true);
        let box=await page.locator('#authModal .auth-card').boundingBox();
        assert.equal(box.x,anchor.x);assert.equal(box.y,anchor.y);assert.equal(box.width,anchor.width);
        await page.locator('#loginModal [data-signup]').click();await onlyAuthForm('signupForm');
        box=await page.locator('#authModal .auth-card').boundingBox();
        assert.equal(box.x,anchor.x);assert.equal(box.y,anchor.y);assert.equal(box.width,anchor.width);
      }
      assert.equal(await page.evaluate(()=>document.querySelector('#authModal').scrollWidth<=innerWidth),true);
    }
    await page.setViewportSize({width:1280,height:900});await page.click('#signupCancel');
    assert.equal(await page.locator('#authModal').isVisible(),false);
    await page.locator('.top [data-signup]').click();
    assert.equal(await page.locator('#signupPassword').getAttribute('type'),'password');
    assert.equal(await page.locator('#signupConfirm').getAttribute('type'),'password');
    await page.locator('#signupCancel').focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'signupLogin');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'signupCancel');
    for(const anchor of ['conditions','confidentialite']){const r=await page.request.get(base+'/legal.html');assert.equal(r.status(),200);assert.ok((await r.text()).includes('id="'+anchor+'"'));}
    await page.fill('#signupEmail','not-an-email');await page.fill('#signupPassword',password);await page.fill('#signupConfirm',password);
    await page.click('#signupSubmit');assert.equal(signups,0);assert.match(await page.locator('#signupEmailError').textContent(),/e-mail valide/);
    await page.fill('#signupEmail',user.email);await page.fill('#signupConfirm','different-password');await page.click('#signupSubmit');
    assert.match(await page.locator('#signupConfirmError').textContent(),/ne correspondent pas/);assert.equal(signups,0);
    await page.fill('#signupPassword','abc');await page.fill('#signupConfirm','abc');await page.click('#signupSubmit');assert.equal(signups,0);
    await page.fill('#signupPassword','');await page.click('#signupSubmit');assert.match(await page.locator('#signupPasswordError').textContent(),/entrer un mot de passe/);
    await page.fill('#signupPassword',password);await page.fill('#signupConfirm',password);await page.click('#signupSubmit');assert.equal(signups,0);assert.match(await page.locator('#signupTermsError').textContent(),/accepter/);
    await page.check('#signupTerms');
    await page.click('[data-reveal="signupPassword"]');assert.equal(await page.locator('#signupPassword').getAttribute('type'),'text');
    await page.click('[data-reveal="signupPassword"]');assert.equal(await page.locator('#signupPassword').getAttribute('type'),'password');
    await page.click('#signupSubmit');assert.equal(await page.locator('#signupSubmit').isDisabled(),true);assert.equal(await page.locator('#signupSubmit').textContent(),'Création du compte…');
    await page.evaluate(()=>document.querySelector('#signupForm').requestSubmit());
    await page.waitForFunction(()=>!document.querySelector('#signupSuccess').hidden);
    assert.equal(await page.locator('#signupSuccessTitle').textContent(),'Vérifiez votre adresse e-mail');
    assert.equal(await page.locator('#signupResend').isDisabled(),true);
    await page.clock.install();await page.clock.fastForward(61000);await page.click('#signupResend');
    await page.waitForFunction(()=>document.querySelector('#signupMessage').textContent.includes('nouveau lien'));assert.equal(resends,1);await page.clock.resume();
    assert.equal(signups,1);assert.equal(await page.inputValue('#signupPassword'),'');
    await page.click('#signupLogin');await page.fill('#loginPassword',password);await page.click('#loginSubmit');
    await page.waitForFunction(()=>document.querySelector('#loginBtn').textContent.includes('Profil'));
    assert.equal(passwords,1);await page.reload();
    await page.waitForFunction(()=>document.querySelector('#loginBtn').textContent.includes('Profil'));
    assert.equal(await page.locator('#headerNotes').textContent(),'4');
    // New page, same browser storage: returning to the site restores Supabase's session.
    const returning=await context.newPage();await returning.goto(base);
    await returning.waitForFunction(()=>document.querySelector('#loginBtn').textContent.includes('Profil'));await returning.close();
    await page.click('#loginBtn');await page.click('#profileLogout');
    await page.waitForFunction(()=>document.querySelector('#loginBtn').textContent==='Se connecter');
    await page.click('#loginBtn');await page.click('#signupLogin');await page.fill('#loginEmail',user.email);await page.check('#loginUsePassword');await page.fill('#loginPassword',password);await page.click('#loginSubmit');
    await page.waitForFunction(()=>document.querySelector('#loginBtn').textContent.includes('Profil'));assert.equal(passwords,2);
    await page.click('#loginBtn');await page.click('#profileLogout');
    await page.waitForFunction(()=>document.querySelector('#loginBtn').textContent==='Se connecter');
    await page.locator('.top [data-signup]').click();await page.fill('#signupEmail',user.email);await page.fill('#signupPassword',password);await page.fill('#signupConfirm',password);
    await page.check('#signupTerms');reject=true;await page.click('#signupSubmit');await page.waitForFunction(()=>document.querySelector('#signupMessage').textContent.includes('sécurité'));
    reject=false;confirmation=false;await page.click('#signupSubmit');await page.waitForFunction(()=>document.querySelector('#loginBtn').textContent.includes('Profil'));await page.click('#signupContinue');
    await page.click('#loginBtn');await page.click('#profileLogout');await page.waitForFunction(()=>document.querySelector('#loginBtn').textContent==='Se connecter');
    await page.click('#loginBtn');await page.click('#signupLogin');await page.fill('#loginEmail',user.email);await page.uncheck('#loginUsePassword');await page.click('#loginSubmit');await page.waitForFunction(()=>document.querySelector('#loginModal').hidden);assert.equal(otps,1);
    // Recovery uses the existing Supabase client, including the authenticated callback.
    await page.click('#loginBtn');await page.click('#signupLogin');await page.click('#forgotPassword');await page.fill('#recoveryEmail',user.email);await page.click('#recoverySend');
    await page.waitForFunction(()=>document.querySelector('#recoveryMessage').textContent.includes('réinitialisation'));assert.equal(recoveries,1);
    await page.click('#recoverySend');assert.equal(recoveries,1);await page.click('#recoveryCancel');
    await page.goto(base+'/?auth=recovery#access_token='+token+'&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery');
    await page.waitForFunction(()=>!document.querySelector('#recoveryUpdateForm').hidden);
    await page.fill('#recoveryPassword',password);await page.fill('#recoveryConfirm','wrong');await page.click('#recoverySave');assert.equal(updates,0);
    await page.fill('#recoveryConfirm',password);await page.click('#recoverySave');
    await page.waitForFunction(()=>document.querySelector('#recoveryMessage').textContent.includes('a été modifié'));assert.equal(updates,1);
    await page.click('#recoveryCancel');await page.click('#loginBtn');await page.click('#profileLogout');await page.waitForFunction(()=>document.querySelector('#loginBtn').textContent==='Se connecter');
    await page.goto(base+'/?auth=recovery#error=access_denied&error_code=otp_expired&error_description=expired');
    await page.waitForFunction(()=>document.querySelector('#recoveryMessage').textContent.includes('expiré'));assert.equal(await page.locator('#recoveryUpdateForm').isVisible(),false);await page.click('#recoveryCancel');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.signup-entry [data-signup]').isVisible(),true);
    await page.locator('.signup-entry [data-signup]').click();assert.equal(await page.locator('#signupModal').isVisible(),true);
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.querySelector('#authModal').scrollWidth<=innerWidth),true);assert.equal(await page.locator('#signupSubmit').isVisible(),true);}
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'node_modules/work/signup-mobile.png',fullPage:false});
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'node_modules/work/signup-desktop.png',fullPage:false});
    await page.click('#signupCancel');
    await page.click('#notificationBtn');assert.equal(await page.locator('#notificationPanel').isVisible(),true);await page.click('#notificationClose');
    assert.notEqual(await page.evaluate(()=>sessionStorage.getItem('authOverlap')),'1');assert.deepEqual(errors,[]);console.log('PASS: browser signup validation, confirmation, provider error, immediate session, password login/logout, reload, return visit, OTP, resend cooldown, password recovery/update/expired link, responsive 320–1280px, notifications; real Supabase SDK with mocked remote responses.');
    if(process.env.TEST_LEGACY!=='1'){
      await page.goto(base+'/auth');await onlyAuthForm('signupForm');await page.click('#signupLogin');await onlyAuthForm('loginForm');
      await page.click('#loginCancel');assert.equal(await page.locator('#authModal').isVisible(),false);
    }
    await context.close();

    const pwa=await browser.newContext();const p=await pwa.newPage();const pwaErrors=[];p.on('pageerror',e=>pwaErrors.push(e.message));
    await p.goto(base);await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const manifest=await (await p.request.get(base+'/manifest.webmanifest')).json();
    assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');assert.ok(manifest.name);
    for(const icon of manifest.icons){const r=await p.request.get(base+icon.src);assert.equal(r.status(),200);const b=await r.body();assert.equal(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`,icon.sizes);}
    const cdp=await p.context().newCDPSession(p);await cdp.send('Page.enable');
    const install=await cdp.send('Page.getInstallabilityErrors');assert.deepEqual(install.installabilityErrors,[]);
    await p.evaluate(async()=>{await fetch('/api/config');await fetch('/api/me');await fetch('/api/billing/verify/test');});
    const cached=await p.evaluate(async()=>(await (await caches.open('izisono-v18-shell')).keys()).map(r=>new URL(r.url).pathname));
    assert.ok(cached.includes('/script.js'));assert.ok(!cached.some(x=>x.startsWith('/api/')));
    await pwa.setOffline(true);await p.reload();assert.equal(await p.locator('#loginBtn').textContent(),'Se connecter');assert.equal(await p.locator('.top [data-signup]').isVisible(),true);
    assert.deepEqual(pwaErrors,[]);console.log('PASS: PWA service worker controlled, manifest/icons, Chromium installability checks, API excluded from cache, offline shell. Offline auth intentionally unavailable.');
    await pwa.close();
    for(const endpoint of ['/health','/api/config','/api/occasions','/api/styles','/api/billing/plans','/api/billing/methods','/api/language/list'])assert.equal((await fetch(base+endpoint)).status,200);
    for(const endpoint of ['/api/me','/api/tracks','/api/admin/overview'])assert.equal((await fetch(base+endpoint)).status,401);
    console.log('PASS: real Express public routes and unauthenticated API protection.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
