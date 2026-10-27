// Logo bench end-to-end check in headless Chromium, with drawn cards only (no photos of real cards).
// Usage: node test/logo.e2e.cjs <www> <base-url>   (www = the lab layout below; stand-in.cjs serving it)
// Lab layout: <www>/v/<commit>/src = the app's src/, <www>/latest -> v/<commit>, <www>/logo-bench = this folder's www/.
const { chromium } = require('playwright');
const [www, base] = process.argv.slice(2);
if (!www || !base) { console.error('usage: node test/logo.e2e.cjs <www> <base-url>'); process.exit(2); }
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ok    ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${detail}`); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${base}/logo-bench/`);
  await page.waitForFunction(() => /Card Shelf isn't reachable/.test(document.getElementById('photoNote').textContent));
  check('no shelf: photos from this device stay in the browser', true);
  check('the newest build is picked', (await page.inputValue('#buildSelect')) === 'latest');

  // Two drawn cards: a red round logo with contact text on white, and a teal-and-orange badge on a cream card at an angle.
  const cards = await page.evaluate(() => {
    const text = (x, l) => { l.forEach(([t, px, y]) => { x.font = `${px}px Arial`; x.fillStyle = '#222'; x.fillText(t, 60, y); }); };
    const a = document.createElement('canvas'); a.width = 1050; a.height = 600; let x = a.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 1050, 600);
    x.fillStyle = '#c81e28'; x.beginPath(); x.arc(150, 140, 85, 0, Math.PI * 2); x.fill();
    text(x, [['Jane Example', 46, 330], ['jane@example.com', 32, 420], ['+1 (312) 555-0100', 32, 470], ['www.example.com', 32, 520]]);
    // A whole photo: dark table, the card turned a little.
    const b = document.createElement('canvas'); b.width = 1400; b.height = 1000; x = b.getContext('2d');
    x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, 1400, 1000);
    x.translate(700, 500); x.rotate(0.12); x.translate(-525, -300);
    x.fillStyle = '#fbf6e9'; x.fillRect(0, 0, 1050, 600);
    x.fillStyle = '#1e9aa0'; x.fillRect(780, 60, 200, 160); x.fillStyle = '#f29e4c'; x.beginPath(); x.arc(880, 140, 55, 0, Math.PI * 2); x.fill();
    text(x, [['Sam Sample', 46, 330], ['sam@example.org', 32, 420], ['(555) 010-0199', 32, 470]]);
    return [a.toDataURL('image/png'), b.toDataURL('image/png')];
  });
  await page.setInputFiles('#addPhotos', cards.map((u, i) => ({ name: `drawn-${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(u.split(',')[1], 'base64') })));
  await page.waitForFunction(() => document.getElementById('photoCount').textContent === '2 photos');
  check('two photos added', true);

  await page.click('#runBtn');
  await page.waitForFunction(() => /^(Done|Failed)/.test(document.getElementById('runStatus').textContent), null, { timeout: 240000 });
  const status = await page.textContent('#runStatus');
  check('run all finishes', status === 'Done: 2 cards.', status);
  const info = await page.$$eval('.card .why', els => els.filter(e => e.tagName === 'P').map(e => e.textContent));
  check('the turned card is flattened by Snap to card', /Snap to card/.test(info[1] || ''), JSON.stringify(info));
  check('Glyph set the contact lines aside', info.every(t => /Glyph: [1-9]\d* contact lines? set aside/.test(t)), JSON.stringify(info));
  const seconds = await page.$$eval('.card ul.why li:nth-child(2)', els => els.map(e => e.textContent));
  check('no contact line is left as a pick on the white card', !(await page.$$eval('.card:nth-child(1) ul.why li', els => els.length > 2)), JSON.stringify(seconds));
  const firsts = await page.$$eval('.card ul.why li:first-child', els => els.map(e => e.textContent));
  check('both cards have a first pick in colour', firsts.length === 2 && firsts.every(t => /in colour/.test(t)), JSON.stringify(firsts));

  // Card 1: the first pick is the red logo; press Right.
  await page.click('.card:nth-child(1) .picks button:has-text("Right")');
  check('Right is scored as a first-pick hit', /first pick was right/.test(await page.textContent('.card:nth-child(1) .verdict')));
  await page.waitForSelector('.card:nth-child(1) .shape img');
  const shapes = await page.$$eval('.card:nth-child(1) .shape', els => els.map(e => e.textContent));
  check('flat-colour shapes and the app trace are offered with sizes', shapes.length === 2 && shapes.every(t => /Save SVG \(\d+\.\d KB\)/.test(t)), JSON.stringify(shapes));
  const svg = await page.$eval('.card:nth-child(1) .shape a', a => atob(a.href.split(',')[1]));
  check('the SVG is paths only, small, in the logo red', /^<svg /.test(svg) && !/script|href|style/i.test(svg) && svg.length < 6000 && /fill="#c[0-9a-f]1[0-9a-f]2[0-9a-f]"/.test(svg), svg.slice(0, 160));

  // Card 2: draw the box by hand over the badge (top right of the flattened card).
  const canvas = await page.$('.card:nth-child(2) canvas');
  await page.click('.card:nth-child(2) .picks button:has-text("Draw it")');
  const bb = await canvas.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.72, bb.y + bb.height * 0.06); await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * 0.96, bb.y + bb.height * 0.40, { steps: 5 }); await page.mouse.up();
  const v2 = await page.textContent('.card:nth-child(2) .verdict');
  check('a drawn box is saved and scored', /Checked/.test(v2), v2);
  await page.waitForSelector('.card:nth-child(2) .shape img');
  await page.selectOption('#colourCount', '3');
  await page.waitForFunction(() => /3 colours/.test(document.querySelector('.card:nth-child(2) .shape b').textContent));
  const inks = await page.$eval('.card:nth-child(2) .shape a', a => (atob(a.href.split(',')[1]).match(/<path /g) || []).length);
  check('changing the colour count redraws the shapes', inks >= 2, `paths: ${inks}`);
  check('the tally counts both', /2 of 2 checked/.test(await page.textContent('#tally')), await page.textContent('#tally'));

  // Answers survive a reload and score the next run without asking.
  await page.reload();
  await page.setInputFiles('#addPhotos', cards.map((u, i) => ({ name: `drawn-${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(u.split(',')[1], 'base64') })));
  await page.uncheck('#useReader');
  await page.click('#runBtn');
  await page.waitForFunction(() => /^Done/.test(document.getElementById('runStatus').textContent), null, { timeout: 120000 });
  check('answers are kept in this browser and scored again', /2 of 2 checked/.test(await page.textContent('#tally')), await page.textContent('#tally'));

  // The report has no pictures and no text read from the card.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#reportBtn')]);
  const body = require('fs').readFileSync(await download.path(), 'utf8');
  check('the report downloads with verdicts and no card text', /"verdict"/.test(body) && !/example\.com|data:image/.test(body));

  await page.setViewportSize({ width: 375, height: 800 });
  check('no sideways scroll on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= 375));
  check('no page errors', errors.length === 0, JSON.stringify(errors));
  await browser.close();
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
