// End to end: the Reading Room's Run a set, in Chromium, with a real published build's reader, on the Funhouse's drawn
// sample set (made-up cards). Started by run-e2e.sh. Usage: node setrun.e2e.cjs <lab www root> <port> <dead-funhouse port>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const [root, port, deadPort] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/bench/`);
  await page.waitForSelector('#setPanel:not(.hidden)', { timeout: 15000 });
  const options = await page.$$eval('#setSelect option', os => os.map(o => o.textContent));
  console.log('sets offered:', options);
  assert.ok(options.some(o => o.startsWith('drawn-sample-1')));
  const run = async (mode) => {
    await page.selectOption('#setMode', mode);
    await page.click('#setRunBtn');
    await page.waitForFunction(() => /^(Done|Stopped|Nothing|Set run failed)/.test(document.getElementById('setStatus').textContent), null, { timeout: 900000 });
    const status = await page.textContent('#setStatus');
    console.log(`[${mode}] status:`, status);
    assert.match(status, /^Done: \d+ of 12 versions scored, \d+ skipped \(no answer key for drawn-photo\.jpg\)\./);
    console.log(`[${mode}] version rows:`, (await page.$$('#setRows tbody tr')).length);
    console.log(`[${mode}] scorecard:\n` + (await page.innerText('#setCard')).split('\n').slice(0, 14).join('\n'));
    const md = await page.inputValue('#setMd'); console.log(`[${mode}] md:\n${md}`);
    for (const secret of ['Velmar', 'Kalo', '555-', 'velmar.test', 'Tesqu']) assert.ok(!md.includes(secret), `summary leaks ${secret}`);
    await page.waitForFunction(() => /Saved on the lab|Not saved/.test(document.getElementById('setSaved').textContent));
    console.log(`[${mode}] saved:`, await page.textContent('#setSaved'));
    console.log(`[${mode}] glyph:`, await page.textContent('#glyphSays'));
  };
  await run('perfect');
  await run('app');
  // Both runs are on disk with a scorecard, and the saved results keep numbers, not the card's text
  const runsDir = path.join(root, 'bench/data/runs');
  const saved = fs.readdirSync(runsDir).flatMap(b => fs.readdirSync(path.join(runsDir, b)).map(t => path.join(runsDir, b, t)));
  assert.equal(saved.length, 2);
  for (const d of saved) {
    console.log('saved files:', path.basename(d), fs.readdirSync(d).sort().join(' '));
    assert.ok(fs.existsSync(path.join(d, 'scorecard.json')));
    const results = fs.readFileSync(path.join(d, 'results.json'), 'utf8');
    for (const secret of ['Velmar', 'Kalo', 'velmar.test', 'Tesqu']) assert.ok(!results.includes(secret), `results.json keeps ${secret}`);
    assert.ok(!JSON.parse(results).scorecard, 'the scorecard is in its own file');
    const report = fs.readFileSync(path.join(d, 'report.html'), 'utf8');
    console.log('report pictures:', (report.match(/<img /g) || []).length);
  }
  // The archive shows the Set column; ticking the two runs compares them
  const cells = await page.$$eval('#runsTable tbody tr', trs => trs.map(tr => Array.from(tr.children).slice(1, 5).map(td => td.textContent).join(' | ')));
  console.log('archive:', cells);
  const ticks = await page.$$('#runsTable input.cmp'); assert.equal(ticks.length, 2);
  for (const t of ticks) await t.check();
  await page.click('#compareBtn');
  await page.waitForSelector('#compare:not(.hidden)');
  console.log('compare:\n' + (await page.innerText('#compare')).split('\n').slice(0, 8).join('\n'));
  // Phone width: no sideways scroll on the page
  await page.setViewportSize({ width: 390, height: 844 });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('phone sideways overflow px:', wide); assert.ok(wide <= 0);
  await page.screenshot({ path: path.join(root, '..', 'setrun-phone.png'), fullPage: true });
  console.log('errors:', errors); assert.deepEqual(errors, []);
  // With the Funhouse not answering, the panel stays hidden and the rest of the page works
  const p2 = await browser.newPage(); const errors2 = []; p2.on('pageerror', e => errors2.push(String(e)));
  await p2.goto(`http://127.0.0.1:${deadPort}/bench/`); await p2.waitForTimeout(1500);
  const hidden = await p2.$eval('#setPanel', el => el.classList.contains('hidden'));
  console.log('no Funhouse: panel hidden', hidden, 'build note:', await p2.textContent('#buildNote'), 'errors', errors2);
  assert.ok(hidden); assert.deepEqual(errors2, []);
  await browser.close();
  console.log('E2E PASSED');
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
