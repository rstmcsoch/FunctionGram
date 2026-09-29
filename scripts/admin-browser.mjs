// Optional QA tooling: npm install --prefix .local/browser-tools playwright-core @sparticuz/chromium
// Seed fixtures with admin-check.mts, then start the isolated local dev server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ADMIN_BASE_PATH } from '../lib/admin/config.ts';
const require = createRequire(path.resolve('.local/browser-tools/package.json'));
const { chromium: playwright } = require('playwright-core');
const { default: chromium } = await import(require.resolve('@sparticuz/chromium'));
const cookies = JSON.parse(fs.readFileSync('.local/admin-check.json','utf8'));
const browser = await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(arg=>arg!=='--single-process'),headless:true});
try {
 for (const width of [320,360,390,430,768,1024]) for (const theme of ['light','dark']) {
  const context = await browser.newContext({viewport:{width,height:900},colorScheme:theme});
  const [name,...value]=cookies.admin.split('=');
  await context.addCookies([{name,value:value.join('='),domain:'localhost',path:'/'}]);
  const page=await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  for (const route of [ADMIN_BASE_PATH,ADMIN_BASE_PATH+'/users',ADMIN_BASE_PATH+'/users/regular']) {
    const response=await page.goto('http://localhost:3000'+route); assert.equal(response.status(),200);
    await page.waitForLoadState('networkidle');
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width} ${theme} ${route}`);
    for (const control of await page.locator('.admin-shell button,.admin-shell input,.admin-shell select,.admin-shell nav a').all()) {
      assert.ok((await control.boundingBox()).height>=44,`touch target ${route}`);
    }
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(()=>document.activeElement!==document.body),'Keyboard reaches navigation');
    if (width===390) await page.screenshot({path:`.local/phase2-${route.split('/').pop()}-${theme}.png`,fullPage:true});
  }
  // Dialog, keyboard escape, focus restoration and typed-confirmation flow.
  const ban=page.getByRole('button',{name:'Ban account',exact:true});
  await ban.click(); const dialog=page.getByRole('dialog'); await dialog.waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Confirm action'}).isDisabled(),true);
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
  assert.equal(await ban.evaluate(e=>document.activeElement===e),true);
  assert.equal(errors.length,0,errors.join('\n'));
  if(width===390 && theme==='light') {
    await ban.click(); await dialog.getByLabel('Confirmation email').fill('regular@example.test');
    await dialog.getByLabel('Reason (required)').fill('Browser regression test');
    await dialog.getByRole('button',{name:'Confirm action'}).click(); await dialog.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Unban account',exact:true}).click();
    await dialog.getByLabel('Confirmation email').fill('regular@example.test');
    await dialog.getByRole('button',{name:'Confirm action'}).click(); await dialog.waitFor({state:'hidden'});
    await page.goto('http://localhost:3000'+ADMIN_BASE_PATH+'/users');
    await page.getByRole('searchbox').fill('regular'); await page.getByRole('button',{name:'Apply filters'}).click();
    await page.waitForURL('**/*q=regular*');
    assert.equal(await page.locator('tbody tr').count(),1);
    const download=page.waitForEvent('download'); await page.getByRole('button',{name:'Export this page (CSV)'}).click();
    assert.equal((await download).suggestedFilename(),'users-page.csv');
  }
  await context.close(); console.log(`Phase 2 browser passed: ${width}px ${theme}`);
 }
} finally {await browser.close();}
