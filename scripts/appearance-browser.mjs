// Isolated browser QA. Tooling/fixtures: scripts/admin-browser.mjs.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(path.resolve('.local/browser-tools/package.json'));const{chromium:playwright}=require('playwright-core');const{default:chromium}=await import(require.resolve('@sparticuz/chromium'));
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';const cookies=JSON.parse(fs.readFileSync('.local/admin-check.json','utf8'));
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
const admin=await browser.newContext();const [key,...value]=cookies.admin.split('=');await admin.addCookies([{name:(process.env.ADMIN_TEST_SECURE_COOKIES==='1'?'__Secure-':'')+key,value:value.join('='),domain:new URL(origin).hostname,path:'/',secure:process.env.ADMIN_TEST_SECURE_COOKIES==='1'}]);
const original=await admin.request.get(origin+'/api/admin/appearance').then(r=>r.json());
const save=async a=>{const response=await admin.request.post(origin+'/api/admin/appearance',{headers:{origin},data:{value:a}});assert.equal(response.status(),200,await response.text());};
try{
 const config=structuredClone(original);config.wordmark='Community';config.hero={enabled:true,title:'A place to share',text:'Make yourself at home.',image:'/media/coast.jpg',label:'Explore',url:'/#/explore'};config.announcement={enabled:true,text:'Welcome to our community',label:'Discover',url:'/#/explore'};config.nav.find(n=>n.target==='reels').enabled=false;config.nav.find(n=>n.target==='messages').enabled=false;
 await save(config);
 for(const width of [320,360,390,430,768,1024,1200,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.bringToFront();await page.goto(origin);await page.waitForLoadState('networkidle');await page.waitForFunction(()=>Boolean(history.state?.__NA));assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`public overflow ${width} ${theme}`);
  assert.equal(await page.locator('.main-nav button[aria-label="Reels"],.dock button[aria-label="Reels"],.header-actions button[aria-label="Messages"]').count(),0);
  assert.equal(await page.locator('.public-footer a[href="/#/reels"]').count(),0);
  await page.evaluate(()=>{window.location.hash='#/reels';});await page.getByRole('heading',{name:'This section is not available'}).waitFor().catch(async e=>{console.log('DEBUG',errors,page.url(),(await page.locator('body').innerText()).slice(0,600));throw e;});
  assert.ok(await page.locator('.public-footer').isVisible());await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  if(width===390)await page.screenshot({path:`.local/phase4-public-${theme}.png`,fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
  const adminPage=await admin.newPage();await adminPage.setViewportSize({width,height:900});await adminPage.goto(origin+'/rstmcadmin/appearance');await adminPage.waitForLoadState('networkidle');await adminPage.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.ok(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`editor overflow ${width}`);
  for(const el of await adminPage.locator('.appearance-editor button,.appearance-editor input:not([type=checkbox]),.appearance-editor select,.appearance-toggle').all()){const box=await el.boundingBox();assert.ok(box&&box.height>=44,'44px control');}
  await adminPage.close();console.log(`Appearance browser passed: ${width}px ${theme}`);
 }
 const direct=await browser.newPage();await direct.goto(origin+'/#/reels');await direct.getByRole('heading',{name:'This section is not available'}).waitFor();await direct.close();
 // Actual form save and local verified image upload (production upload needs a real Blob store).
 const page=await admin.newPage();await page.goto(origin+'/rstmcadmin/appearance');await page.getByLabel('Site name',{exact:true}).fill('Browser appearance');
 await page.getByRole('button',{name:'Publish appearance',exact:true}).click();await page.getByText('Appearance published and audited.',{exact:false}).waitFor();
 if(process.env.ADMIN_TEST_SECURE_COOKIES!=='1'){
  await page.getByLabel('Upload logoLight',{exact:true}).setInputFiles('public/media/avatar-1.jpg');await page.getByText('Upload verified.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Publish appearance',exact:true}).click();await page.getByText('Appearance published and audited.',{exact:false}).waitFor();
  assert.match((await admin.request.get(origin+'/api/admin/appearance').then(r=>r.json())).logoLight,/^\/api\/media\//);
 }
 // Layout modes and stored personal theme take precedence over a site default.
 for(const mode of ['auto','compact','hidden']){config.sidebarMode=mode;config.headerPosition='static';await save(config);await page.setViewportSize({width:1440,height:900});await page.goto(origin);await page.waitForLoadState('networkidle');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(mode==='hidden')assert.ok(await page.locator('.mobile-header').isVisible());}
 config.defaultTheme='dark';await save(config);await page.addInitScript(()=>localStorage.setItem('rstmc-theme','light'));await page.bringToFront();await page.goto(origin);await page.waitForLoadState('networkidle');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 console.log('Form save, logo upload (dev), layout modes and stored theme precedence passed.');
}finally{await save(original);await browser.close();}
