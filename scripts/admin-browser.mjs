// Optional browser QA: install playwright-core and @sparticuz/chromium without changing the lockfile.
// Run after scripts/admin-check.mts seed and starting the isolated dev server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const cookies = JSON.parse(fs.readFileSync('.local/admin-check.json', 'utf8'));
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => arg !== '--single-process'), headless: true });
try {
 for (const width of [320,360,390,430,768,1024]) for (const theme of ['light','dark']) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  const [name,...value] = cookies.admin.split('=');
  await context.addCookies([{name,value:value.join('='),domain:'localhost',path:'/'}]);
  const page = await context.newPage();
  const response = await page.goto('http://localhost:3000/rstmcadmin');
  assert.equal(response.status(),200);
  await page.getByRole('heading',{name:'Admin control room'}).waitFor();
  await page.waitForLoadState('networkidle');
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), `overflow ${width} ${theme}`);
  const link = page.getByRole('link', {name:'Refresh system status'});
  assert.ok((await link.boundingBox()).height >=44);
  for (let i = 0; i < 5 && !(await link.evaluate(e=>document.activeElement===e)); i++) await page.keyboard.press('Tab');
  assert.equal(await link.evaluate(e=>document.activeElement===e),true);
  assert.ok(await link.evaluate(e=>getComputedStyle(e).outlineStyle !== 'none'));
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
  if(width===390) await page.screenshot({path:`.local/admin-${theme}.png`,fullPage:true});
  await context.close();
  console.log(`Admin browser passed: ${width}px ${theme}`);
 }
} finally { await browser.close(); }
