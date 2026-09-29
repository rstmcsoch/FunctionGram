// Optional isolated QA: same tooling/fixtures as scripts/admin-browser.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('.local/browser-tools/package.json'));
const {chromium:playwright}=require('playwright-core');const {default:chromium}=await import(require.resolve('@sparticuz/chromium'));
const cookies=JSON.parse(fs.readFileSync('.local/admin-check.json','utf8'));const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';const base='/rstmcadmin/content';
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(arg=>arg!=='--single-process'),headless:true});
try{
 for(const width of [320,360,390,430,768,1024])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,hasTouch:true});
  const [rawName,...value]=cookies.admin.split('=');const name=(process.env.ADMIN_TEST_SECURE_COOKIES==='1'?'__Secure-':'')+rawName;
  await context.addCookies([{name,value:value.join('='),domain:new URL(origin).hostname,path:'/',secure:process.env.ADMIN_TEST_SECURE_COOKIES==='1'}]);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const route of [base,base+'?resource=comments',base+'/demo_coast',base+'/demo_comment_0?resource=comments']){
   assert.equal((await page.goto(origin+route)).status(),200);await page.waitForLoadState('networkidle');await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow: ${width} ${theme} ${route}`);
   for(const control of await page.locator('.admin-shell button,.admin-shell input:not([type=checkbox]),.admin-shell select,.admin-shell nav a,.content-checkbox').all()){
    const box=await control.boundingBox();if(box&&await control.isVisible()&&await control.evaluate(e=>!e.closest('details:not([open])')))assert.ok(box.height>=44,`Small touch control ${route} ${await control.getAttribute('name')}`);
   }
   await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
   if(width===390)await page.screenshot({path:`.local/phase3-${route.includes('demo')?'detail':'list'}-${route.includes('comments')?'comments':'posts'}-${theme}.png`,fullPage:true});
  }
  const hide=page.getByRole('button',{name:'Hide',exact:true});await hide.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.ok(await dialog.getByRole('button',{name:'Confirm content action'}).isDisabled());await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.ok(await hide.evaluate(e=>document.activeElement===e));
  if(width===390&&theme==='light'){
   await page.goto(origin+base);await page.getByRole('checkbox',{name:'Select demo_coast',exact:true}).check();await page.getByRole('checkbox',{name:'Select demo_alpine',exact:true}).check();
   for(const operation of ['Hide','Unhide']){
    await page.getByRole('button',{name:operation,exact:true}).click();await dialog.getByLabel('Content confirmation').fill('CONFIRM 2');await dialog.getByLabel(/Moderation reason/).fill('Browser bulk regression');
    await dialog.getByRole('button',{name:'Confirm content action'}).click();await dialog.waitFor({state:'hidden'});await page.waitForLoadState('networkidle');
    assert.equal((await context.request.get(origin+'/api/social?post=demo_coast').then(r=>r.json())).length,operation==='Hide'?0:1);
    if(operation==='Hide'){await page.getByRole('checkbox',{name:'Select demo_coast',exact:true}).check();await page.getByRole('checkbox',{name:'Select demo_alpine',exact:true}).check();}
   }
   await page.goto(origin+base+'/demo_coast');await page.getByRole('button',{name:'Regenerate aspects from media'}).click();await page.getByText('Measured aspects loaded.',{exact:false}).waitFor();
   assert.ok(JSON.parse(await page.getByLabel('Aspect ratios', {exact:false}).inputValue())[0]>0);
   await page.getByLabel('Edit confirmation').fill('demo_coast');await page.getByRole('button',{name:'Save content',exact:true}).click();await page.waitForLoadState('networkidle');
   // A hidden direct link must not reopen a resident cached feed item.
   const guest=await browser.newContext();const publicPage=await guest.newPage();publicPage.on('pageerror',e=>errors.push('Public: '+e.message));await publicPage.bringToFront();await publicPage.goto(origin+'/');await publicPage.waitForLoadState('networkidle');
   const moderate=operation=>context.request.post(origin+'/api/admin',{headers:{origin},data:{action:'moderateContent',resource:'posts',operation,ids:['demo_coast'],confirmation:'demo_coast',reason:'Cached-link regression'}});
   try{
    assert.equal((await moderate('hide')).status(),200);
    const response=publicPage.waitForResponse(r=>r.url().includes('/api/social?post=demo_coast'),{timeout:15000});
    await publicPage.evaluate(()=>window.location.hash='#/post/demo_coast');assert.deepEqual(await (await response).json(),[]);
    await publicPage.getByText('This post is no longer available.',{exact:true}).waitFor();assert.equal(await publicPage.locator('.post-viewer').count(),0);
    assert.equal((await moderate('unhide')).status(),200);await publicPage.evaluate(()=>{window.location.hash='#/';});
    await publicPage.evaluate(()=>{window.location.hash='#/post/demo_coast';});await publicPage.locator('.post-viewer').waitFor();
   }finally{await moderate('unhide');await guest.close();}
   await page.goto(origin+base);await page.getByText('Story & reel controls',{exact:true}).click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Settings overflow');
  }
  assert.deepEqual(errors,[]);await context.close();console.log(`Content browser passed: ${width}px ${theme}`);
 }
}finally{await browser.close();}
