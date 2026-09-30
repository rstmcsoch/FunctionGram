// Local-only final admin smoke/accessibility pass; requires .local/browser-tools.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('.local/browser-tools/package.json'));
const { chromium: playwright } = require('playwright-core');
const { default: chromium } = await import(require.resolve('@sparticuz/chromium'));
const cookies = JSON.parse(fs.readFileSync('.local/admin-check.json', 'utf8'));
const baseUrl = process.env.ADMIN_TEST_ORIGIN || 'http://localhost:3000';
const routes = [
  '/rstmcadmin', '/rstmcadmin/users', '/rstmcadmin/users/regular', '/rstmcadmin/content',
  '/rstmcadmin/appearance', '/rstmcadmin/features', '/rstmcadmin/labels', '/rstmcadmin/media',
  '/rstmcadmin/moderation', '/rstmcadmin/audit', '/rstmcadmin/security',
  '/rstmcadmin/communications', '/rstmcadmin/analytics', '/rstmcadmin/exports',
  '/rstmcadmin/system', '/rstmcadmin/guide',
];
const widths = [320, 360, 390, 430, 768, 1024, 1200, 1440];
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => arg !== '--single-process'), headless: true });
const summaries = [];
try {
  for (const width of widths) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    await context.addInitScript(value => localStorage.setItem('rstmc-theme', value), theme);
    const [name, ...value] = cookies.admin.split('=');
    await context.addCookies([{ name, value: value.join('='), domain: 'localhost', path: '/' }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let routeMs = [];
    for (const route of routes) {
      const start = performance.now();
      const response = await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded' });
      assert.equal(response?.status(), 200, `${route} returned ${response?.status()}`);
      await page.locator('.admin-shell').waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts?.ready);
      const durationMs = Math.round(performance.now() - start);
      routeMs.push({ route, durationMs });
      const result = await page.evaluate(() => {
        const tables = [...document.querySelectorAll('.admin-shell table')].map(table => {
          const section = table.closest('section');
          const name = table.getAttribute('aria-label') || table.querySelector('caption')?.textContent?.trim() ||
            table.closest('[role="region"][aria-label]')?.getAttribute('aria-label') || section?.querySelector('h2,h3')?.textContent?.trim() || '';
          return { name, headers: [...table.querySelectorAll('thead th')].map(th => th.textContent?.trim()).filter(Boolean) };
        });
        const unlabeledButtons = [...document.querySelectorAll('.admin-shell button')].filter(button => {
          const name = button.getAttribute('aria-label') || button.getAttribute('title') || button.innerText;
          return !name?.trim();
        }).map(button => button.outerHTML.slice(0, 160));
        const unnamedInputs = [...document.querySelectorAll('.admin-shell input:not([type="hidden"]),.admin-shell select,.admin-shell textarea')].filter(input => {
          const element = input;
          return !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') && !(element.labels?.length);
        }).map(input => input.outerHTML.slice(0, 160));
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          theme: document.documentElement.dataset.theme,
          heading: document.querySelector('main h1')?.textContent?.trim() || '',
          tables,
          unlabeledButtons,
          unnamedInputs,
        };
      });
      assert.equal(result.theme, theme, `${route} did not apply ${theme} theme`);
      assert.ok(result.scrollWidth <= result.width, `Horizontal document overflow at ${width}px: ${route} (${result.scrollWidth}px)`);
      assert.ok(result.heading, `Missing main heading: ${route}`);
      for (const table of result.tables) {
        assert.ok(table.name, `Table has no accessible context on ${route}`);
        assert.ok(table.headers.length, `Table is missing column headers on ${route}: ${table.name}`);
      }
      assert.deepEqual(result.unlabeledButtons, [], `Unlabeled button on ${route}`);
      assert.deepEqual(result.unnamedInputs, [], `Form control without an accessible label on ${route}`);
      if (width <= 430) {
        for (const control of await page.locator('.admin-shell button:visible,.admin-shell input:visible,.admin-shell select:visible,.admin-shell nav a:visible').all()) {
          const box = await control.boundingBox();
          if (box) assert.ok(box.height >= 44, `Touch target below 44px at ${width}px on ${route}: ${await control.evaluate(el => el.outerHTML.slice(0, 120))}`);
        }
      }
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.activeElement !== document.body), `Keyboard focus did not enter the page at ${route}`);
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    summaries.push({ width, theme, pages: routes.length, medianNavigationMs: routeMs.toSorted((a,b) => a.durationMs-b.durationMs)[Math.floor(routeMs.length/2)].durationMs, slowest: routeMs.toSorted((a,b) => b.durationMs-a.durationMs)[0] });
    await context.close();
    console.log(`Phase 12 UI pass: ${width}px ${theme}`);
  }
  console.log(JSON.stringify({ scope: 'local isolated PGlite + production/dev server only; no preview/provider verification', summaries }, null, 2));
} finally {
  await browser.close();
}
