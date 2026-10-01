// Optional Chromium QA, using the isolated fixtures/tooling from scripts/admin-browser.mjs.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(path.resolve('.local/browser-tools/package.json'));const{chromium:playwright}=require('playwright-core');const{default:chromium}=await import(require.resolve('@sparticuz/chromium'));
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';const cookies=JSON.parse(fs.readFileSync('.local/admin-check.json','utf8'));
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
const admin=await browser.newContext();const [key,...value]=cookies.admin.split('=');await admin.addCookies([{name:(process.env.ADMIN_TEST_SECURE_COOKIES==='1'?'__Secure-':'')+key,value:value.join('='),domain:new URL(origin).hostname,path:'/',secure:process.env.ADMIN_TEST_SECURE_COOKIES==='1'}]);
const original=await admin.request.get(origin+'/api/admin/labels').then(r=>r.json());
const save=async value=>{const r=await admin.request.post(origin+'/api/admin/labels',{headers:{origin},data:{value}});assert.equal(r.status(),200,await r.text());};
try{
 await save({});const editor=await admin.newPage();await editor.bringToFront();await editor.goto(origin+'/admin-panel/labels');await editor.waitForLoadState('networkidle');await editor.getByRole('searchbox').fill('nav.reels');await editor.getByRole('textbox',{name:'Text for nav.reels',exact:true}).fill('Small films');
 assert.equal((await admin.request.get(origin+'/api/admin/labels').then(r=>r.json()))['nav.reels'],undefined,'draft must not publish early');
 await editor.getByRole('button',{name:'Publish labels',exact:true}).click();await editor.getByRole('status').filter({hasText:'published and audited'}).waitFor();
 const firstPaint=await admin.request.get(origin).then(r=>r.text());assert.match(firstPaint,/aria-label="Small films"/);assert.ok(!firstPaint.includes('aria-label="Reels"'));
 for(const width of [320,390,430,768,1024])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.bringToFront();await page.goto(origin);await page.waitForLoadState('networkidle');await page.waitForFunction(()=>Boolean(history.state?.__NA));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`public overflow ${width} ${theme}`);
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  assert.equal(await page.locator('button[aria-label="Reels"]').count(),0);assert.ok(await page.locator('button[aria-label="Small films"]').count()>0);
  await page.evaluate(()=>{location.hash='#/reels';});await page.getByRole('heading',{name:'Small films',exact:true}).waitFor();await page.waitForFunction(()=>document.title.startsWith('Small films —'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`reels overflow ${width} ${theme}`);
  await page.evaluate(()=>{location.hash='#/explore';});await page.getByRole('heading',{name:'Explore',exact:true}).waitFor();await page.evaluate(()=>{location.hash='#/search';});await page.getByRole('heading',{name:'Search',exact:true}).waitFor();assert.deepEqual(errors,[]);
  await context.close();
  const panel=await admin.newPage();await panel.setViewportSize({width,height:900});await panel.goto(origin+'/admin-panel/labels');await panel.waitForLoadState('networkidle');await panel.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`labels overflow ${width} ${theme}`);
  for(const control of await panel.locator('.labels-editor textarea,.labels-editor input:not([type=file]),.labels-editor button').all()){const box=await control.boundingBox();if(box)assert.ok(box.height>=44,`touch target ${box.height}`);}
  await panel.keyboard.press('Tab');assert.ok(await panel.evaluate(()=>document.activeElement!==document.body));await panel.close();console.log(`Labels viewport/theme passed: ${width} ${theme}`);
 }
 // JSON export is a full editable snapshot. Invalid imports do not overwrite the live setting.
 const downloadPromise=editor.waitForEvent('download');await editor.getByRole('button',{name:'Export JSON',exact:true}).click();const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported['nav.reels'],'Small films');assert.ok(Object.keys(exported).length>400);
 await editor.locator('input[type=file]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"unknown.key":"bad"}')});await editor.getByRole('status').filter({hasText:'Unknown label key'}).waitFor();assert.equal((await admin.request.get(origin+'/api/admin/labels').then(r=>r.json()))['nav.reels'],'Small films');
 await editor.locator('input[type=file]').setInputFiles({name:'labels.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({'nav.reels':'Shorts','category.nature':'Outdoors'}))});await editor.getByRole('status').filter({hasText:'Import staged'}).waitFor();await editor.getByRole('button',{name:'Publish labels',exact:true}).click();await editor.getByRole('status').filter({hasText:'published and audited'}).waitFor();
 const page=await browser.newPage();await page.bringToFront();await page.goto(origin+'/#/explore');await page.getByRole('tab',{name:'Outdoors',exact:true}).waitFor();const query=page.waitForRequest(r=>r.url().includes('category=Nature'));await page.getByRole('tab',{name:'Outdoors',exact:true}).click();await query;await page.close();
 await editor.getByRole('searchbox').fill('nav.reels');await editor.getByRole('button',{name:'Reset to default',exact:true}).click();await editor.getByRole('button',{name:'Publish labels',exact:true}).click();await editor.getByRole('status').filter({hasText:'published and audited'}).waitFor();assert.equal((await admin.request.get(origin+'/api/admin/labels').then(r=>r.json()))['nav.reels'],undefined);
 await editor.getByLabel('Type RESET to reset the draft',{exact:true}).fill('RESET');await editor.getByRole('button',{name:'Reset all to defaults',exact:true}).click();await editor.getByRole('button',{name:'Publish labels',exact:true}).click();await editor.getByRole('status').filter({hasText:'published and audited'}).waitFor();assert.deepEqual(await admin.request.get(origin+'/api/admin/labels').then(r=>r.json()),{});
 console.log('Labels browser QA passed: actual editing/publish, search, 10 viewport-theme pairs, first paint/nav/dock/header/title, JSON import/export/invalid import, category ID preservation, per-key/all reset.');
}finally{await save(original);await browser.close();}
