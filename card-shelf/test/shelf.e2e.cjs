// Card Shelf end-to-end check in headless Chromium, with drawn cards only: the shelf page, Glyph's bench reading its
// OCR folder, and the Paint Shop reading its Logo photos and uploading to it.
// Usage: node card-shelf/test/shelf.e2e.cjs <base-url>   (stand-in.cjs serving the lab layout, both services running)
const { chromium } = require('playwright');
const base = process.argv[2];
if (!base) { console.error('usage: node shelf.e2e.cjs <base-url>'); process.exit(2); }
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ok    ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${detail}`); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto(`${base}/shelf/`);
  const drawn = await page.evaluate(() => ['#c81e28', '#1e9aa0'].map(colour => {
    const c = document.createElement('canvas'); c.width = 700; c.height = 400; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 700, 400); x.fillStyle = colour; x.beginPath(); x.arc(110, 100, 60, 0, 7); x.fill();
    x.fillStyle = '#222'; x.font = '30px Arial'; x.fillText('Sam Sample', 40, 260); x.font = '22px Arial'; x.fillText('sam@example.org', 40, 320);
    return c.toDataURL('image/png');
  }));
  const files = drawn.map((u, i) => ({ name: `drawn-${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(u.split(',')[1], 'base64') }));
  await page.setInputFiles('#addPhotos', files);
  await page.waitForFunction(() => document.getElementById('countHolding').textContent === '(2)');
  check('two uploads wait in Holding', (await page.$$('.tile')).length === 2);

  // Tick drawn-1 for OCR and Logo on its tile.
  const tile1 = '.tile:has-text("drawn-1.png")';
  await page.click(`${tile1} button:has-text("OCR")`);
  await page.waitForFunction(() => document.getElementById('countActive').textContent === '(1)');
  await page.click('[data-place="active"]');
  await page.click(`${tile1} button:has-text("Logo")`);
  await page.waitForFunction(() => document.querySelectorAll('.tile .btn.on').length === 2);
  check('a photo can be ticked for two benches', true);

  // Archive drawn-2 with the bulk bar, then restore it.
  await page.click('[data-place="holding"]');
  await page.check('#selectAll');
  await page.click('[data-bulk="archive"]');
  await page.waitForFunction(() => document.getElementById('countArchive').textContent === '(1)');
  check('archive keeps it, out of Holding', (await page.textContent('#countHolding')) === '(0)');
  await page.click('[data-place="archive"]');
  await page.click('.tile button:has-text("Restore")');
  await page.waitForFunction(() => document.getElementById('countHolding').textContent === '(1)');
  check('restore brings it back to Holding', true);

  // Delete it for good: two questions, both answered yes.
  await page.click('[data-place="holding"]');
  await page.click('.tile button:has-text("Delete")');
  await page.waitForFunction(() => document.getElementById('countHolding').textContent === '(0)');
  check('delete asks twice, the second time "Are you sure?"', dialogs.length === 2 && /Are you sure\?/.test(dialogs[1]), JSON.stringify(dialogs));
  const deleted = await page.evaluate(async () => (await (await fetch('../shelf/api/deleted')).json()).deleted.length);
  check('the deletion is noted by hash for the benches', deleted === 1);

  // Glyph's bench sees the photo ticked OCR, and serves it.
  const samples = await page.evaluate(async () => (await (await fetch('../bench/api/samples')).json()).sets['business-cards'].map(s => s.name));
  check("Glyph's bench lists the shelf's OCR photos", JSON.stringify(samples) === '["drawn-1.png"]', JSON.stringify(samples));
  const served = await page.evaluate(async () => (await fetch('../bench/api/photo?set=business-cards&name=drawn-1.png')).status);
  check("Glyph's bench serves the photo", served === 200);

  // The Paint Shop lists the photo ticked Logo, runs it, and its own uploads go on the shelf ticked Logo.
  await page.goto(`${base}/logo-bench/`);
  await page.waitForFunction(() => /ticked 🦎 Logo on the Card Shelf/.test(document.getElementById('photoNote').textContent));
  check('the Paint Shop lists the shelf photo', (await page.textContent('#photoCount')) === '1 photo');
  await page.uncheck('#useReader');
  await page.setInputFiles('#addPhotos', [{ ...files[1], name: 'drawn-3.png' }]);
  await page.waitForFunction(() => document.getElementById('photoCount').textContent === '2 photos');
  check('a Paint Shop upload goes on the shelf', true);
  await page.click('#runBtn');
  await page.waitForFunction(() => /^Done/.test(document.getElementById('runStatus').textContent), null, { timeout: 120000 });
  check('the Paint Shop runs the shelf photos', (await page.textContent('#runStatus')) === 'Done: 2 cards.', await page.textContent('#runStatus'));
  await page.goto(`${base}/shelf/`);
  await page.waitForFunction(() => document.getElementById('countActive').textContent === '(2)');
  await page.click('[data-place="active"]');
  check('the shelf shows it ticked Logo', /Logo/.test(await page.textContent('.tile:has-text("drawn-3.png") .btn.on')));

  await page.setViewportSize({ width: 375, height: 800 });
  check('no sideways scroll on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
  check('no page errors', errors.length === 0, JSON.stringify(errors));
  await browser.close();
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
