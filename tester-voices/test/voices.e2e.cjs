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
        // Delete takes three taps.
        const del = () => page.locator('.drop .danger').first();
        await del().click(); await del().click();
        assert.equal(await del().textContent(), 'Are you sure? Delete now');
        await del().click();
        await page.waitForSelector('#empty:not(.hidden)');
        // Auto-Fixer has its own shelf and colours.
        await page.goto(BASE + '?app=auto-fixer');
        await page.waitForFunction(() => document.getElementById('tester').value === 'T1');
        assert.equal(await page.textContent('#appName'), 'Auto-Fixer');
        // Creative's art (HQ-0396) loads, and the Auto-Fixer pair is used here.
        await page.waitForFunction(() => document.getElementById('mark').naturalWidth > 0 && document.getElementById('emptyArt').naturalWidth > 0);
        assert.match(await page.getAttribute('#mark', 'src'), /tv-header-autofixer\.svg$/);
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
