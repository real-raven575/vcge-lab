// Tester Voices in Chromium on a phone-sized screen: node tester-voices/test/voices.e2e.cjs  (made-up names only)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert/strict');

const PORT = 18772;
const BASE = `http://127.0.0.1:${PORT}/vcge/voices/`;
const SHOTS = process.env.SHOTS_DIR;   // optional: where to save screenshots for a person to look at

(async () => {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'voices-'));
    const lab = spawn('python3', [path.join(__dirname, 'stand-in.py'), data, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise(ok => lab.stdout.once('data', ok));
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1 });
        const sent = [];
        page.on('request', r => { if (r.method() !== 'GET') sent.push(r.postData() || ''); });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        // A stand-in Google: sign-in hands back a fake key; the Sheet keeps rows in memory. Nothing reaches Google.
        const sheet = { tabs: ['Rules', 'Welcome', 'Inbox'], rows: [] };
        const gsi = `window.google = { accounts: { oauth2: { initTokenClient: o => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: 'fake-token' }), 10) }), revoke: (t, cb) => cb && cb() } } };`;
        await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: gsi }));
        await page.route('**/desk/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.DESK_CONFIG = { clientId: 'test.apps.googleusercontent.com' };" }));
        await page.route(/googleapis\.com/, r => {
            const req = r.request(), url = decodeURIComponent(req.url());
            const json = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
            if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
            assert.equal(req.headers().authorization, 'Bearer fake-token');
            if (url.includes('/drive/v3/files')) return json({ files: [{ id: 'desk1' }] });
            if (url.includes(':batchUpdate')) { sheet.tabs.push(JSON.parse(req.postData()).requests[0].addSheet.properties.title); return json({}); }
            if (url.includes(':append')) { sheet.rows.push(JSON.parse(req.postData()).values[0]); return json({ updates: { updatedRange: `'Voices out'!A${sheet.rows.length + 1}:J${sheet.rows.length + 1}` } }); }
            if (req.method() === 'PUT') { sheet.header = JSON.parse(req.postData()).values[0]; return json({}); }
            if (url.includes('fields=sheets')) return json({ sheets: sheet.tabs.map(title => ({ properties: { title } })) });
            return r.fulfill({ status: 404, body: 'unexpected ' + url });
        });
        await page.goto(BASE);
        await page.waitForFunction(() => document.getElementById('tester').value === 'T1');
        await page.fill('#words', '[11/24 3:02 PM] Jane Doe: Scanned 10 cards, all perfect! jane.doe@example.com\nJane: the PIN screen confused me.');
        await page.fill('#names', 'Jane Doe');
        assert.match(await page.textContent('#preview'), /T1: Scanned 10 cards/);
        assert.doesNotMatch(await page.textContent('#preview'), /Jane|example\.com/);
        assert.match(await page.textContent('#swapLine'), /2 names, 1 e-mail/);
        await page.locator('#tagPick').getByRole('button', { name: '💚 Praise' }).click();
        await page.locator('#tagPick').getByRole('button', { name: '😕 Confusing' }).click();
        await page.setInputFiles('#shots', { name: 'shot.png', mimeType: 'image/png', buffer: Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(200, 7)]) });
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'voices-drop.png'), fullPage: true });
        await page.click('#save');
        await page.waitForFunction(() => /Saved as T1/.test(document.getElementById('status').textContent));
        // "Saved" shows before the list reloads; the next free code comes with the reload.
        await page.waitForFunction(() => document.getElementById('tester').value === 'T2');
        assert.equal(await page.inputValue('#words'), '');
        // The real name never left the page, and nothing was saved with it.
        assert.ok(sent.every(b => !/Jane|example\.com/.test(b)), 'a real name or address was sent');
        assert.ok(!/Jane|example\.com/.test(fs.readFileSync(path.join(data, 'vcge', 'drops.json'), 'utf8')));
        const card = page.locator('.drop').first();
        assert.match(await card.textContent(), /🧑 T1.*UTC · .*Eastern/s);
        assert.equal(await card.locator('.shots img').count(), 1);
        await card.locator('select').selectOption('sent');
        await page.waitForSelector('.drop.st-sent');
        await page.getByRole('button', { name: /🐞 Bug 0/ }).click();
        assert.equal(await page.locator('.drop').count(), 0);
        await page.getByRole('button', { name: /^All 1/ }).click();
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'voices-list.png'), fullPage: true });
        // Straight to the team's PM chat.
        assert.match(await page.getAttribute('#teamChat a', 'href'), /^https:\/\/claude\.ai\/code\/project\/chan_/);
        // Send to team: two taps, Google sign-in, one row in "Voices out" with only the cleaned words.
        const sendBtn = () => page.locator('.drop .send').first();
        await sendBtn().click();
        assert.equal(await sendBtn().textContent(), 'Tap again: send to vCGE');
        await sendBtn().click();
        await page.waitForFunction(() => /Sent T1's drop to Team vCGE/.test(document.getElementById('status').textContent));
        assert.ok(sheet.tabs.includes('Voices out'));
        assert.equal(sheet.header[0], 'when_utc');
        assert.equal(sheet.rows.length, 1);
        const [when, team, tester, tags, , , text, labId] = sheet.rows[0];
        assert.match(when, /^'\d{4}-\d\d-\d\d \d\d:\d\d, UTC$/);
        assert.deepEqual([team, tester, tags], ['Team vCGE', 'T1', 'praise, confusing']);
        assert.match(text, /^\[11\/24 3:02 PM\] T1: Scanned/);
        assert.match(labId, /^d\d{8}-/);
        assert.ok(!/Jane|example\.com/.test(JSON.stringify(sheet.rows)), 'a real name or address was sent to Google');
        await page.waitForSelector('#sendBar:not(.hidden)');
        assert.match(await page.locator('.drop .notes').first().textContent(), /Sent to Team vCGE \(Desk "Voices out" row 2\)/);
        // Delete takes three taps.
        const del = () => page.locator('.drop .danger').first();
        await del().click(); await del().click();
        assert.equal(await del().textContent(), 'Are you sure? Delete now');
        await del().click();
        await page.waitForSelector('#empty:not(.hidden)');
        // The dropdown switches to Auto-Fixer's own shelf and colours, without a reload.
        await page.selectOption('#team', 'auto-fixer');
        await page.waitForFunction(() => document.getElementById('tester').value === 'T1' && location.search === '?app=auto-fixer');
        assert.match(await page.getAttribute('#teamChat a', 'href'), /chan_01PxwWhZtmc1AxLmjp2kSTgu$/);
        assert.equal(await page.textContent('#appName'), 'Auto-Fixer');
        assert.ok(await page.evaluate(() => document.body.classList.contains('app-auto-fixer')));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'voices-auto-fixer.png') });
        const wide = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(wide <= 390, `page scrolls sideways on a phone (${wide}px)`);
        assert.deepEqual(errors, []);
        console.log('voices e2e: OK');
    } finally {
        await browser.close();
        lab.kill();
        fs.rmSync(data, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
