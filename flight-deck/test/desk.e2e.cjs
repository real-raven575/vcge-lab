// Desk end to end with Google stood in: sign-in, create the Sheet, sign off, edit, add a rule, welcome, inbox.
// Nothing reaches Google; every Google address is answered by a fake that keeps the Sheet in memory.
// Run: node flight-deck/test/desk.e2e.cjs   (uses the pre-installed Playwright Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict');

const root = path.join(__dirname, '..', 'www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});

// ---- fake Google: one spreadsheet, A1 ranges only as the Desk uses them ----
const tabs = {}; let created = false; const calls = [];
const col = c => c.charCodeAt(0) - 65;
function parse(r) { const [t, a] = decodeURIComponent(r).split('!'); const m = /^([A-Z])(\d*)(?::([A-Z])(\d*))?$/.exec(a); return { t, c0: col(m[1]), r0: m[2] ? +m[2] : 1, c1: col(m[3] || m[1]), r1: m[4] ? +m[4] : (m[3] ? 1e6 : +m[2]) }; }
function read(r) { const p = parse(r); return (tabs[p.t] || []).slice(p.r0 - 1, p.r1).map(row => (row || []).slice(p.c0, p.c1 + 1)); }
function write(r, values) { const p = parse(r); const g = tabs[p.t] = tabs[p.t] || []; values.forEach((v, i) => { const row = g[p.r0 - 1 + i] = g[p.r0 - 1 + i] || []; v.forEach((x, j) => { row[p.c0 + j] = x; }); }); }
async function google(route) {
  const req = route.request(), url = new URL(req.url()), body = req.postData() ? JSON.parse(req.postData()) : null;
  calls.push(`${req.method()} ${url.hostname}${url.pathname}`);
  const json = o => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (req.headers().authorization !== 'Bearer fake-token') return route.fulfill({ status: 401, body: 'no key' });
  if (url.hostname === 'www.googleapis.com') return json({ files: created ? [{ id: 'sheet1', name: 'Flight Deck Desk' }] : [] });
  const p = url.pathname.replace('/v4/spreadsheets', '');
  if (p === '' && req.method() === 'POST') { created = true; body.sheets.forEach(s => { tabs[s.properties.title] = []; }); return json({ spreadsheetId: 'sheet1' }); }
  if (p.endsWith('/values:batchUpdate')) { body.data.forEach(d => write(d.range, d.values)); return json({}); }
  if (p.endsWith('/values:batchGet')) return json({ valueRanges: url.searchParams.getAll('ranges').map(r => ({ values: read(r) })) });
  const m = /\/values\/([^:]+)(:append)?$/.exec(p); const r = decodeURIComponent(m[1]);
  if (m[2]) { const t = r.split('!')[0]; const n = tabs[t].length + 1; write(`${t}!A${n}:H${n}`, body.values); return json({}); }
  if (req.method() === 'PUT') { write(r, body.values); return json({}); }
  return json({ values: read(r) });
}
const gsi = `window.google = { accounts: { oauth2: {
  initTokenClient: o => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: 'fake-token' }), 10) }),
  revoke: (t, cb) => cb && cb() } } };`;

(async () => {
  await new Promise(r => server.listen(18950, '127.0.0.1', r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/config\.js/.test(m.text()) && !/404/.test(m.text())) errors.push(m.text()); });
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: gsi }));
  await page.route(/googleapis\.com/, google);
  await page.route('**/desk/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.DESK_CONFIG = { clientId: 'test.apps.googleusercontent.com' };" }));
  const status = () => page.textContent('#status');

  await page.goto('http://127.0.0.1:18950/desk/');
  assert.match(await status(), /Sign in with Google/);
  assert.equal(await page.isVisible('#rulesList'), false, 'nothing shows before sign-in');

  await page.click('#signIn');
  await page.waitForSelector('#create', { state: 'visible' });
  await page.click('#create');
  await page.waitForFunction(() => /Desk Sheet created/.test(document.getElementById('status').textContent));
  assert.deepEqual(tabs.Rules[0], ['id', 'group', 'rule', 'signed', 'signed_by', 'signed_utc', 'edited_by', 'edited_utc']);

  // Claude seeds through the Sheets connector; here the fake does it, then the page reloads.
  write('Rules!A2:C3', [['HB-01', 'Herd', 'Evidence only, never guess.'], ['CS-01', 'Team vCGE', '<img src=x onerror=alert(1)> stays text']]);
  write('Welcome!A2:C2', [['Welcome aboard', 'Hello, new project.\nStep 1: check your tools.', '']]);
  write('Inbox!A2:D3', [['2026-10-26 02:40', '🐘 Cornerstone (Team vCGE)', 'Nudge for Waggle', 'nudge text'], ['2026-10-26 02:45', '🐘 Cornerstone (Team vCGE)', 'Card HQ-0179', 'card text']]);
  await page.click('#reload'); await page.waitForSelector('.rule');
  assert.equal(await page.textContent('#rulesCount'), '0 of 2 signed off');
  assert.equal(await page.$('.rtext img'), null, 'Sheet text is never page code');

  // Sign off HB-01
  await page.check('.rule:has(.rid:text("HB-01")) input[type=checkbox]');
  await page.waitForFunction(() => document.getElementById('rulesCount').textContent === '1 of 2 signed off');
  assert.equal(tabs.Rules[1][3], 'yes'); assert.equal(tabs.Rules[1][4], 'raven575');
  assert.match(await page.textContent('.rule.signed .rsign'), /Signed off by raven575 on \d{4}-\d\d-\d\d \d\d:\d\d UTC \(.+ Eastern\)/);

  // New wording clears the sign-off
  await page.click('.rule:has(.rid:text("HB-01")) button:text("Edit wording")');
  await page.fill('textarea.edit', 'Evidence only. Never guess.');
  await page.click('button:text("Save wording")');
  await page.waitForFunction(() => document.getElementById('rulesCount').textContent === '0 of 2 signed off');
  assert.equal(tabs.Rules[1][2], 'Evidence only. Never guess.'); assert.equal(tabs.Rules[1][3], '');

  // A row moved in Sheets: the page refuses to write to the wrong rule
  const saved = tabs.Rules.splice(1, 1); tabs.Rules.push(saved[0]);
  await page.check('.rule:has(.rid:text("HB-01")) input[type=checkbox]');
  await page.waitForFunction(() => /Sheet changed/.test(document.getElementById('status').textContent));
  assert.equal(tabs.Rules[1][3] || '', '', 'CS-01 was not signed by mistake');

  // Add a rule
  await page.selectOption('#newGroup', 'Team vCGE');
  await page.fill('#newRule', 'Cards at the bottom.');
  await page.click('#addRule button[type=submit]');
  await page.click('summary:has-text("Team vCGE rules")');
  await page.waitForSelector('.rid:text("CS-02")');

  // Copy one group's block
  await page.click('button:text("Copy Herd block")');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '# Herd rules\n\nEvidence only. Never guess.');

  // Build a block: Herd + Team vCGE + Welcome in one paste, signed-only filter
  await page.click('a[href="#build"]');
  await page.check('.chip:has-text("vCGE") input');
  const built = await page.textContent('#buildText');
  assert.ok(built.startsWith('# Herd rules'), built);
  assert.ok(built.indexOf('# Team vCGE rules') > built.indexOf('# Herd rules'));
  assert.ok(built.includes('(paste as the first message in the new project)') && built.trim().endsWith('Step 1: check your tools.'));
  await page.click('#copyBuild');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), built);
  await page.check('#buildSigned');
  assert.ok(!(await page.textContent('#buildText')).includes('# Herd rules'), 'nothing signed off yet, so no rules');
  assert.match(await page.textContent('#buildNote'), /left out/);
  await page.uncheck('#buildSigned');
  await page.click('a[href="#rules"]');

  // Welcome: copy and edit
  await page.click('a[href="#welcome"]');
  assert.equal(await page.textContent('#welcomeTitle'), 'Welcome aboard');
  await page.click('#copyWelcome');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Hello, new project.\nStep 1: check your tools.');
  await page.click('#editWelcome'); await page.fill('#welcomeTextIn', 'Hello again.'); await page.click('#welcomeForm button[type=submit]');
  await page.waitForFunction(() => document.getElementById('welcomeText').textContent === 'Hello again.');
  assert.match(tabs.Welcome[1][2], /^\d{4}-\d\d-\d\d \d\d:\d\d$/);

  // Inbox: newest first, copy, mark used, used ones fold away
  await page.click('a[href="#inbox"]');
  assert.deepEqual(await page.$$eval('.msg .mhead b', e => e.map(x => x.textContent)), ['Card HQ-0179', 'Nudge for Waggle']);
  await page.click('.msg:first-child button.copy');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'card text');
  await page.click('.msg:first-child button:text("Mark used")');
  await page.waitForFunction(() => document.getElementById('inboxCount').textContent === '1 waiting, 1 used');
  assert.equal(await page.$$eval('.msg', e => e.length), 1);
  await page.check('#showUsed'); assert.equal(await page.$$eval('.msg', e => e.length), 2);

  // Mark all as used: "Are you sure?" first; No changes nothing, Yes ticks every waiting row and deletes none
  await page.uncheck('#showUsed');
  page.once('dialog', d => { assert.match(d.message(), /Are you sure\? This marks all 1 waiting/); d.dismiss(); });
  await page.click('#markAll');
  assert.equal(await page.textContent('#inboxCount'), '1 waiting, 1 used');
  page.once('dialog', d => d.accept());
  await page.click('#markAll');
  await page.waitForFunction(() => document.getElementById('inboxCount').textContent === '0 waiting, 2 used');
  assert.match(await status(), /Marked all 1 as used/);
  assert.equal(await page.isVisible('#markAll'), false);
  assert.equal(tabs.Inbox.length, 3);
  assert.ok(tabs.Inbox.slice(1).every(r => r[4] === 'yes' && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(r[5])));

  // Sign out drops the key; the next load finds the Sheet again by itself
  await page.click('#signOut'); assert.match(await status(), /Signed out/);
  assert.equal(await page.isVisible('#rulesList'), false);
  await page.click('a[href="#rules"]'); await page.click('#signIn'); await page.waitForSelector('.rule');

  // Mobile width: no sideways scroll
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll at 360px');
  if (process.argv[2]) { await page.click('a[href="#build"]'); await page.check('.chip:has-text("vCGE") input'); await page.setViewportSize({ width: 1000, height: 900 }); await page.screenshot({ path: process.argv[2], fullPage: true }); }

  assert.deepEqual(errors, []);
  assert.ok(calls.every(c => /googleapis\.com/.test(c)), 'only Google APIs were called');
  console.log(`desk e2e: all checks passed (${calls.length} fake Google calls)`);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
