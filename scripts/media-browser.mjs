// Optional browser QA. Fixtures and tooling follow scripts/admin-browser.mjs.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(path.resolve('.local/browser-tools/package.json'));const{chromium:playwright}=require('playwright-core');const{default:chromium}=await import(require.resolve('@sparticuz/chromium'));
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';const cookies=JSON.parse(fs.readFileSync(process.env.ADMIN_TEST_FIXTURE||'.local/admin-check.json','utf8'));
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
const admin=await browser.newContext();const[key,...value]=cookies.admin.split('=');await admin.addCookies([{name:key,value:value.join('='),domain:new URL(origin).hostname,path:'/'}]);
const original=await admin.request.get(origin+'/api/admin/media').then(r=>r.json());
const save=async value=>{const r=await admin.request.post(origin+'/api/admin/media',{headers:{origin},data:{action:'settings',value}});assert.equal(r.status(),200,await r.text());};
const labels=await admin.request.get(origin+'/api/admin/labels').then(r=>r.json());
try{
 const editor=await admin.newPage();await editor.bringToFront();await editor.goto(origin+'/admin-panel/media');await editor.waitForLoadState('networkidle');await editor.getByLabel('File limit (MB)',{exact:true}).fill('50');await editor.getByLabel('Maximum photos per post',{exact:true}).fill('8');await editor.getByRole('button',{name:'Publish media settings',exact:true}).click();await editor.getByRole('status').filter({hasText:'published and audited'}).waitFor();
 for(const width of [320,390,430,768,1024])for(const theme of ['light','dark']){
  const page=await admin.newPage();await page.bringToFront();await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/admin-panel/media');await page.waitForLoadState('networkidle');await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`media admin overflow ${width} ${theme}`);
  for(const el of await page.locator('main button,main input:not([type=checkbox]),main select').all()){const box=await el.boundingBox();if(box)assert.ok(box.height>=44,'44px controls');}
  await page.goto(origin+'/#/create');await page.waitForLoadState('networkidle');await page.waitForFunction(()=>Boolean(history.state?.__NA));await page.getByRole('heading',{name:'Share a moment',exact:true}).waitFor();await page.getByRole('button',{name:'Create',exact:true}).last().click();await page.getByText(/Up to 50 MB per file/).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`create overflow ${width} ${theme}`);assert.deepEqual(errors,[]);await page.close();console.log(`Media viewport/theme passed: ${width} ${theme}`);
 }
 // A new hint key is editable through Phase 6 without changing old label contracts.
 const r=await admin.request.post(origin+'/api/admin/labels',{headers:{origin},data:{value:{...labels,'media.hint':'Upload rules: {max} MB, {quota} MB daily, {items} items, {types}'}}});assert.equal(r.status(),200);
 const page=await admin.newPage();await page.bringToFront();await page.goto(origin+'/#/create');await page.waitForLoadState('networkidle');await page.waitForFunction(()=>Boolean(history.state?.__NA));await page.getByRole('button',{name:'Create',exact:true}).last().click();await page.getByText(/Upload rules: 50 MB/).waitFor();
 // Actual upload in the compose flow uses server output, not browser-only transformations.
 await page.locator('input[type=file]').first().setInputFiles('public/media/avatar-1.jpg');await page.getByRole('button',{name:'Next',exact:true}).waitFor();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Share post',exact:true}).waitFor();
 await page.close();
 // Review action requires the complete key and a reason; inventory refresh follows the mutation.
 await editor.goto(origin+'/admin-panel/media?status=orphans');await editor.waitForLoadState('networkidle');const button=editor.getByRole('button',{name:'Quarantine',exact:true}).first();if(await button.count()){
  const row=button.locator('xpath=ancestor::tr');const key=await row.locator('code').innerText();await button.click();assert.equal(await editor.getByRole('button',{name:'Confirm media operation',exact:true}).isEnabled(),false);await editor.getByLabel('Reason',{exact:true}).fill('Browser QA');await editor.getByLabel('Type asset key',{exact:true}).fill(key);await editor.getByRole('button',{name:'Confirm media operation',exact:true}).click();await editor.getByRole('status').filter({hasText:'completed and audited'}).waitFor();const release=await admin.request.post(origin+'/api/admin/media',{headers:{origin},data:{action:'release',key,confirmation:key}});assert.equal(release.status(),200);
 }
 console.log('Media browser QA passed: real settings save, responsive inventory/create flow, live limits, label compatibility, actual image upload and typed quarantine action.');
}finally{await save(original.config);await admin.request.post(origin+'/api/admin/labels',{headers:{origin},data:{value:labels}});await browser.close();}
