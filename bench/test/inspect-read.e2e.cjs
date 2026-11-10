// Diagnostic, not a pass/fail test: reads the drawn scan card through the in-tray's Run all and prints each line the
// build read with the field it chose, to explain the set run's field columns. Usage as setrun.e2e.cjs (E2E_SCRIPT=).
const { chromium } = require('playwright');
const [, port] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/bench/`); await page.waitForTimeout(800);
  await page.uncheck('#runHand'); await page.click('#runBtn');
  await page.waitForFunction(() => /^Done/.test(document.getElementById('runStatus').textContent), null, { timeout: 300000 });
  console.log(await page.textContent('.sample .outcome'));
  console.log((await page.$$eval('.sample .read li', ls => ls.map(l => l.textContent))).join('\n'));
  console.log(await page.innerText('.sample .score'));
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
