// End-to-end test of The Scriptorium (handwriting bench). Needs Playwright, the bench service on 127.0.0.1:8765
// (vcge-bench-api.py --root <www>) and test/caddy-stand-in.cjs <www> 18900. Lab layout as in the README.
// Usage: node bench/test/handwriting.e2e.cjs <www>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const www = process.argv[2];
if (!www) { console.error('usage: node handwriting.e2e.cjs <www>'); process.exit(2); }
const ok = (cond, msg) => { if (!cond) throw new Error(msg); console.log('ok', msg); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:18900/bench/handwriting.html');
  await page.waitForFunction(() => document.getElementById('buildSelect').options.length > 0);
  // Two drawn notes: a clear print line, and a blank page the reader should give up on
  const draw = (text) => page.evaluate((t) => { const c = document.createElement('canvas'); c.width = 1000; c.height = 300; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 1000, 300); x.fillStyle = '#123'; x.font = '64px Arial'; if (t) x.fillText(t, 60, 160); return c.toDataURL('image/png'); }, text);
  const buf = async (t) => Buffer.from((await draw(t)).split(',')[1], 'base64');
  await page.setInputFiles('#uploadHand', [
    { name: 'hw-print-upper-t1.png', mimeType: 'image/png', buffer: await buf('MEET AT NOON') },
    { name: 'hw-cursive-lower-blank.png', mimeType: 'image/png', buffer: await buf('') }]);
  await page.waitForFunction(() => document.getElementById('countHand').textContent === '(2)');
  ok(/1 print, 1 cursive/.test(await page.textContent('#sampleNote')), 'samples sorted by file name');
  await page.selectOption('#fStyle', 'print');
  ok(/1 will run/.test(await page.textContent('#sampleNote')), 'style filter narrows the run');
  await page.selectOption('#fStyle', '');
  await page.click('#runBtn');
  await page.waitForFunction(() => /^(Done|Stopped)/.test(document.getElementById('runStatus').textContent), null, { timeout: 240000 });
  console.log('run:', await page.textContent('#runStatus'));
  const cards = await page.$$('#rows .hwcard');
  ok(cards.length === 2, 'both samples shown');
  const print = page.locator('.hwcard[data-name="hw-print-upper-t1.png"]');
  console.log('reader got:', await print.locator('.readout').innerText());
  await print.locator('textarea').fill('MEET AT NOON');
  await print.locator('.ok').click();
  ok(/characters/.test(await print.locator('.score').innerText()), 'live score shows');
  ok(await print.evaluate(el => el.classList.contains('checked')), 'Looks right marks the sample checked');
  const blank = page.locator('.hwcard[data-name="hw-cursive-lower-blank.png"]');
  await blank.locator('.unreadable').check();
  ok(/Left out/.test(await blank.locator('.score').innerText()), 'unreadable sample left out of the score');
  ok(!(await page.isHidden('#board')), 'scoreboard shows');
  ok(/print/.test(await page.inputValue('#boardMd')), 'scoreboard text written');
  await page.click('#saveBtn');
  await page.waitForFunction(() => /Saved|Failed/.test(document.getElementById('saveStatus').textContent), null, { timeout: 30000 });
  const status = await page.textContent('#saveStatus'); console.log('save:', status);
  ok(/^Saved/.test(status), 'saved');
  const t = JSON.parse(fs.readFileSync(path.join(www, 'bench/data/truth/handwriting/hw-print-upper-t1.png.json')));
  ok(t.checked === true && t.lines[0].text === 'MEET AT NOON' && t.hw.style === 'print' && t.hw.case === 'upper', 'truth file kept text, style, case, checked');
  const tb = JSON.parse(fs.readFileSync(path.join(www, 'bench/data/truth/handwriting/hw-cursive-lower-blank.png.json')));
  ok(tb.unreadable === true, 'unreadable kept');
  ok((await page.$$('#runsTable tbody tr td code')).length === 1, 'run listed in past handwriting runs');
  await page.reload();
  await page.waitForFunction(() => document.getElementById('countHand').textContent === '(2)');
  await page.check('#fUnchecked');
  ok(/2 of 2 checked by you\. 0 will run/.test(await page.textContent('#sampleNote')), 'only-unchecked filter skips checked samples');
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await browser.close();
  console.log('handwriting e2e passed');
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
