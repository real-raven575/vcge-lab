// End to end: one answer key for many photos of the same card, in Chromium, with a real published build's reader, on
// the Funhouse's drawn scan card (made-up). Started by run-e2e.sh with E2E_SCRIPT=samecard.e2e.cjs.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const [root, port] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/bench/`);
  await page.waitForSelector('#listCards li');
  // Two "angles" of one card, uploaded under the card name card-07
  const photo = fs.readFileSync(path.join(__dirname, '../../funhouse/sample-sources/drawn-scan.jpg'));
  await page.fill('#cardName', 'card 07');
  await page.setInputFiles('input[type=file][data-set="business-cards"]', [
    { name: 'front.jpg', mimeType: 'image/jpeg', buffer: photo }, { name: 'tilted.jpg', mimeType: 'image/jpeg', buffer: photo }]);
  await page.waitForFunction(() => /2 files added/.test(document.getElementById('runStatus').textContent));
  const listed = await page.$$eval('#listCards li', lis => lis.map(li => li.textContent));
  console.log('in-tray:', listed);
  assert.ok(listed.some(t => t.startsWith('card-07__front.jpg')) && listed.some(t => t.startsWith('card-07__tilted.jpg')));
  // Read everything, then correct only the first photo of card-07
  await page.click('#runBtn');
  await page.waitForFunction(() => /^(Done|Stopped)/.test(document.getElementById('runStatus').textContent), null, { timeout: 900000 });
  const boxes = await page.$$('#rows article.sample');
  const names = await page.$$eval('#rows article.sample > div > h3', hs => hs.map(h => h.textContent));
  console.log('samples read:', names);
  const i = names.findIndex(n => n.startsWith('card-07__front.jpg'));
  assert.ok(i >= 0);
  const head = await boxes[i].$eval('.truth h3', h => h.textContent);
  assert.match(head, /becomes the key for every photo of card card-07/);
  const first = await boxes[i].$('.truth .line input[type=text]');
  await first.fill('Velmar Studio');
  await page.click('#goBtn');
  await page.waitForFunction(() => /Corrections saved and scored|fail/i.test(document.getElementById('goStatus').textContent), null, { timeout: 60000 });
  console.log('go:', await page.textContent('#goStatus'));
  const table = await page.innerText('#summary');
  console.log('summary:\n' + table);
  assert.match(table, /Same card, every angle/);
  assert.match(table, /card-07\s+2\s/);
  const md = await page.inputValue('#summaryMd'); console.log('md tail:\n' + md.split('\n').slice(-2).join('\n'));
  assert.match(md, /- card-07: 2 photos, average \d+%/);
  // On disk: one key for the card, and each photo keeps only its edges answer
  const tdir = path.join(root, 'bench/data/truth/business-cards');
  const keyFile = JSON.parse(fs.readFileSync(path.join(tdir, 'card-07__card.json'), 'utf8'));
  assert.equal(keyFile.card, 'card-07'); assert.ok(keyFile.lines.length > 0);
  assert.equal(keyFile.lines[0].text, 'Velmar Studio');
  for (const p of ['card-07__front.jpg', 'card-07__tilted.jpg']) {
    const own = JSON.parse(fs.readFileSync(path.join(tdir, p + '.json'), 'utf8'));
    assert.ok(!own.lines && typeof own.edgesOk === 'boolean', `${p} keeps only its edges answer`);
  }
  // A second read of card-07 shows the shared key on both photos
  const total = boxes.length;
  await page.evaluate(() => { document.getElementById('runStatus').textContent = ''; });
  await page.click('#runBtn');
  await page.waitForFunction(() => /^(Done|Stopped)/.test(document.getElementById('runStatus').textContent), null, { timeout: 900000 });
  assert.equal((await page.$$('#rows article.sample')).length, total);
  const heads2 = await page.$$eval('#rows article.sample', as => as.filter(a => a.querySelector('h3').textContent.startsWith('card-07__')).map(a => a.querySelector('.truth h3').textContent));
  console.log('second read heads:', heads2);
  assert.equal(heads2.length, 2); heads2.forEach(h => assert.match(h, /Answer key for card card-07 \(shared/));
  console.log('errors:', errors); assert.deepEqual(errors, []);
  await browser.close();
  console.log('E2E PASSED');
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
