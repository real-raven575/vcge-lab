const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:18900/bench/'); await page.waitForTimeout(500);
  console.log('build note:', await page.textContent('#buildNote'));
  // Upload your own card photo (argument 2) as a business card and a rendered card as handwriting (just to exercise the second set)
  if (!process.argv[3]) throw new Error('usage: node bench.e2e.cjs <www> <card-photo.jpg>');
  await page.setInputFiles('input[data-set="business-cards"]', process.argv[3]);
  await page.waitForFunction(() => document.getElementById('countCards').textContent === '(1)');
  const dataUrl = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 300); x.fillStyle = '#111'; x.font = 'bold 48px Arial'; x.fillText('Jane Doe', 60, 90); x.font = '32px Arial'; x.fillText('jane@example.com', 60, 160); x.fillText('+1 (312) 555-0100', 60, 220); return c.toDataURL('image/png'); });
  await page.setInputFiles('input[data-set="handwriting"]', { name: 'note sample.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.waitForFunction(() => document.getElementById('countHand').textContent === '(1)');
  console.log('samples listed:', await page.textContent('#listCards'), '|', await page.textContent('#listHand'));
  await page.click('#runBtn');
  await page.waitForFunction(() => /^Done/.test(document.getElementById('runStatus').textContent), null, { timeout: 180000 });
  console.log('run status:', await page.textContent('#runStatus'));
  const outcomes = await page.$$eval('.sample .outcome', els => els.map(e => e.textContent));
  console.log('outcomes:', outcomes);
  const lines = await page.$$eval('.sample .read', els => els.map(e => e.innerText.split('\n').length));
  console.log('lines per sample:', lines);
  // Correct one line of the card so a confusion shows in the scoring
  const inputs = await page.$$('.sample:first-child .truth input[type=text]');
  const vals = []; for (const i of inputs) vals.push(await i.inputValue());
  console.log('truth inputs:', vals);
  await inputs[0].fill(vals[0] + ' X');   // make one deliberate difference so a confusion shows
  await page.click('#goBtn');
  await page.waitForFunction(() => /saved|Failed/.test(document.getElementById('goStatus').textContent), null, { timeout: 30000 });
  console.log('go status:', await page.textContent('#goStatus'));
  console.log('summary:', (await page.innerText('#summary')).slice(0, 600));
  console.log('md:', await page.inputValue('#summaryMd'));
  console.log('saved:', await page.textContent('#savedNote'));
  console.log('past runs rows:', (await page.$$('#runsTable tbody tr')).length);
  console.log('truth files:', fs.readdirSync(process.argv[2] + '/bench/data/truth/business-cards'), fs.readdirSync(process.argv[2] + '/bench/data/truth/handwriting'));
  // Reload: the sample now shows as having truth and a second run scores it at once
  await page.reload(); await page.waitForTimeout(500);
  console.log('after reload:', await page.textContent('#listCards'));
  console.log('errors:', errors);
  await browser.close();
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
