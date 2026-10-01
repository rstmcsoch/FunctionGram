// Optional browser QA; isolated fixture/tool setup matches scripts/admin-browser.mjs.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(path.resolve('.local/browser-tools/package.json'));const{chromium:playwright}=require('playwright-core');const{default:chromium}=await import(require.resolve('@sparticuz/chromium'));
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';const cookies=JSON.parse(fs.readFileSync('.local/admin-check.json','utf8'));
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
const admin=await browser.newContext();const [key,...value]=cookies.admin.split('=');await admin.addCookies([{name:key,value:value.join('='),domain:new URL(origin).hostname,path:'/'}]);
const original=await admin.request.get(origin+'/api/admin/features').then(r=>r.json());
const save=async value=>{const r=await admin.request.post(origin+'/api/admin/features',{headers:{origin},data:{value,confirmation:value.maintenance.enabled?'MAINTENANCE':''}});assert.equal(r.status(),200,await r.text());};
try{
 const config=structuredClone(original);for(const key of ['reels','stories','search','explore','messages','notifications','likes','comments','shares','saves','follow','reports','uploads','signups'])config.flags[key].enabled=false;await save(config);
 for(const width of [320,390,768,1024])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.bringToFront();await page.goto(origin);await page.waitForLoadState('networkidle');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`public overflow ${width}`);
  assert.equal(await page.getByRole('button',{name:'Like',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Sign up',exact:true}).count(),0);
  for(const section of ['reels','search','explore','messages','notifications','saved','create']){await page.evaluate(section=>{location.hash='#/'+section;},section);await page.getByRole('heading',{name:'This section is not available'}).waitFor();}
  assert.deepEqual(errors,[]);await context.close();
  const editor=await admin.newPage();await editor.setViewportSize({width,height:900});await editor.goto(origin+'/admin-panel/features');await editor.waitForLoadState('networkidle');await editor.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await editor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`editor overflow ${width}`);assert.equal(await editor.locator('.feature-grid fieldset').count(),18);await editor.close();
 }
 const page=await admin.newPage();await page.goto(origin+'/admin-panel/features');await page.getByLabel('Public title',{exact:true}).fill('Browser maintenance test');await page.getByLabel('Enable maintenance mode',{exact:true}).check();assert.equal(await page.getByRole('button',{name:'Publish feature controls'}).isEnabled(),false);await page.getByLabel('Type MAINTENANCE to confirm',{exact:true}).fill('MAINTENANCE');await page.getByRole('button',{name:'Publish feature controls'}).click();await page.getByRole('status').filter({hasText:'saved and audited'}).waitFor();
 const guest=await browser.newPage({viewport:{width:320,height:900}});await guest.goto(origin);await guest.getByRole('heading',{name:'Browser maintenance test'}).waitFor();assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.goto(origin);assert.equal(await page.getByRole('heading',{name:'Browser maintenance test'}).count(),0);
 console.log('Feature browser QA passed: 8 public/admin viewport-theme pairs, disabled controls/direct hashes, actual maintenance form confirmation/save, guest screen/admin bypass.');
}finally{await save(original);await browser.close();}
