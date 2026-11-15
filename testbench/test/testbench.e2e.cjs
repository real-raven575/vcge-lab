// Test Bench end to end, on a throwaway lab: the real service with the real seed, a stand-in for GitHub's Actions API,
// and a small stand-in for Caddy. Drawn pictures only.
//   Run: node testbench/test/testbench.e2e.cjs        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');

const REPO = path.resolve(__dirname, '../..');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'testbench-e2e-'));
const W = path.join(T, 'www');
const PORTS = { api: 18981, gh: 18982, web: 18983 };
const SEED = JSON.parse(fs.readFileSync(path.join(REPO, 'testbench/benches/vcge.json'), 'utf8')).items;
const SHOP = JSON.parse(fs.readFileSync(path.join(REPO, 'testbench/benches/auto-fixer.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}`); } };

// A real 8x8 PNG (so the browser can draw it), made here.
function png() {
    const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
        let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]);
        const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc(8 * (1 + 8 * 3)); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) raw[y * 25 + 1 + x * 3] = 200;
    return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function fakeGitHub() {
    return http.createServer((req, res) => {
        let body;
        if (req.url.includes('/actions/workflows/')) body = { workflow_runs: [{ id: 5, html_url: 'https://github.com/x/y/actions/runs/5', head_sha: 'feedbee1234',
            display_title: 'Merge step 3', updated_at: '2026-11-14T05:40:00Z', run_attempt: 1, conclusion: 'failure' }] };
        else if (req.url.includes('/runs/5/jobs')) body = { jobs: [
            { name: 'Web (unit + browser e2e)', conclusion: 'success', steps: [] },
            { name: 'Browser e2e (WebKit)', conclusion: 'failure', steps: [{ name: 'Browser e2e (source)', conclusion: 'failure' }] },
            { name: 'Browser e2e (iPhone)', conclusion: 'success', steps: [] }] };
        else { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
    });
}

function standIn() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    return http.createServer((req, res) => {
        if (req.url.startsWith('/testbench/api/')) {
            const p = http.request({ host: '127.0.0.1', port: PORTS.api, path: req.url, method: req.method, headers: req.headers }, x => { res.writeHead(x.statusCode, x.headers); x.pipe(res); });
            req.pipe(p); return;
        }
        let f = path.join(W, decodeURIComponent(req.url.split('?')[0]));
        if (f.endsWith('/')) f += 'index.html';
        if (!f.startsWith(W) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    });
}

(async () => {
    fs.cpSync(path.join(REPO, 'testbench/www'), path.join(W, 'testbench'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'flight-deck/www/deckbar.css'), path.join(W, 'deckbar.css'));
    const gh = fakeGitHub().listen(PORTS.gh), web = standIn().listen(PORTS.web);
    const api = spawn('python3', ['-I', path.join(REPO, 'testbench/testbench-api.py'), '--root', path.join(T, 'root'), '--port', String(PORTS.api),
        '--seeds', path.join(REPO, 'testbench/benches'), '--github', `http://127.0.0.1:${PORTS.gh}`, '--no-ci'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let browser;
    try {
        for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORTS.api}/testbench/api/health`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
        browser = await chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
        await ctx.route(/^https:\/\//, r => r.abort());   // decision links open new tabs; never leave the machine
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORTS.web}` });
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        const url = `http://127.0.0.1:${PORTS.web}/testbench/`;
        await page.goto(url);
        const raven = page.locator('#ravenList > li.item'), auto = page.locator('#autoList > li.item');
        await raven.first().waitFor();
        const seedRaven = SEED.filter(i => i.section === 'raven'), seedAuto = SEED.filter(i => i.section === 'auto');
        ok(await raven.count() === seedRaven.length, `every hands-on test from the seed is listed (${seedRaven.length})`);
        ok(await auto.count() === seedAuto.length, `every automatic line is listed (${seedAuto.length})`);
        ok((await raven.first().locator('.ttl').textContent()).startsWith(seedRaven[0].title), 'in the seed\'s order');
        ok(await page.locator('#tally').textContent().then(t => t.includes(`${seedRaven.filter(i => i.status === 'ready').length} ready`)), 'tally counts ready tests');

        // Interactive filter
        await page.click('[data-filter=interactive]');
        const nInter = SEED.filter(i => i.interactive).length;
        ok(await raven.count() === nInter && await page.locator('#ravenList .badge').count() === nInter, `🔁 Interactive filter shows the ${nInter} interactive tests`);
        ok(await page.locator('#ravenList .inter:visible').count() === 0, 'closed tests hide their body');
        await page.locator('#ravenList > li.item summary').first().click();
        ok(await page.locator('#ravenList .inter').first().textContent().then(t => t.includes(SEED.find(i => i.interactive).interactive.thread)), 'an interactive test names the thread to report in');
        await page.click('[data-filter=open]');

        // Decisions: every yes/no waiting on raven575 has a one-tap link, even with the card closed
        const asks = seedRaven.filter(i => i.decision && i.status !== 'pass');
        await page.click('[data-filter=decide]');
        ok(asks.length > 0 && await raven.count() === asks.length, `👉 filter shows the ${asks.length} tests that need a yes or no`);
        for (const a of asks) {
            const link = page.locator(`li.item[data-id="${a.id}"] summary a.decide`);
            ok(await link.getAttribute('href') === a.decision.link && await link.getAttribute('target') === '_blank', `"${a.title}" links straight to where it is answered`);
        }
        ok(await page.locator('#tally').textContent().then(t => t.includes(`${asks.length} need your yes or no`)), 'the tally counts the yes/no choices');
        await page.locator(`li.item[data-id="${asks[0].id}"] summary a.decide`).click();
        ok(await page.locator(`li.item[data-id="${asks[0].id}"] details`).evaluate(d => !d.open), 'tapping the link does not fold the card open');
        await page.click('[data-filter=open]');

        // Steps: results and notes persist on the server
        const first = seedRaven[0];
        const item = page.locator(`li.item[data-id="${first.id}"]`);
        await item.locator('summary').click();
        const step = n => item.locator('li.step').nth(n);
        await step(0).getByRole('button', { name: '✅ Pass' }).click();
        await page.waitForFunction(id => document.querySelector(`li.item[data-id="${id}"] .sub`).textContent.includes('1 of'), first.id);
        await step(1).locator('textarea').fill('The tabs showed, the mini card <b>jumped</b>');
        await step(1).getByRole('button', { name: '❌ Fail' }).click();
        await page.waitForFunction(id => document.querySelector(`li.item[data-id="${id}"] .sub`).textContent.includes('2 of'), first.id);
        await item.locator('.notes textarea').fill('Tried on the phone and the laptop');
        await item.getByRole('button', { name: 'Add note' }).click();
        await item.locator('.log li').waitFor();

        // Pictures: one for the whole test, one for step 2
        await item.locator('.drop input[type=file]').setInputFiles({ name: 'screen.png', mimeType: 'image/png', buffer: png() });
        await item.locator('.shots img').waitFor();
        await step(1).locator('input[type=file]').setInputFiles({ name: 'step2.png', mimeType: 'image/png', buffer: Buffer.concat([png(), Buffer.from('x')]) });
        await page.waitForFunction(id => document.querySelectorAll(`li.item[data-id="${id}"] .shots img`).length === 2, first.id);
        await item.locator('.shots img').first().evaluate(img => img.decode());
        ok(await item.locator('.shots img').first().evaluate(img => img.naturalWidth === 8), 'the picture is served back and drawn');
        ok(await item.locator('.shots a').nth(1).textContent().then(t => t.includes('step 2')), 'a step picture says which step');
        // Typed text is never lost: it saves by itself, and survives a redraw (an upload) before it is saved
        await step(2).locator('textarea').fill('Saved without pressing anything');
        await step(2).locator('.saved').filter({ hasText: '✓ saved' }).waitFor();
        ok(true, 'a step note saves by itself, no button needed');
        await step(3).locator('textarea').fill('Typed, then a picture went up');
        await item.locator('.notes textarea').fill('A card note not added yet');
        await item.locator('.drop input[type=file]').setInputFiles({ name: 'third.png', mimeType: 'image/png', buffer: Buffer.concat([png(), Buffer.from('yy')]) });
        await page.waitForFunction(id => document.querySelectorAll(`li.item[data-id="${id}"] .shots img`).length === 3, first.id);
        ok(await step(3).locator('textarea').inputValue() === 'Typed, then a picture went up', 'a step note typed before an upload is still there after it');
        ok(await item.locator('.notes textarea').inputValue() === 'A card note not added yet' && await item.locator('.notes .note').textContent().then(t => t.includes('not saved yet')), 'an unsent card note stays and says it is not saved yet');
        await step(3).locator('.saved').filter({ hasText: '✓ saved' }).waitFor();
        await item.locator('.notes textarea').fill('');
        await item.locator('.drop input[type=file]').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
        await item.locator('.drop + .note').filter({ hasText: 'photos and screenshots only' }).waitFor();
        ok(true, 'a file that is not a picture is refused with a reason');

        await page.reload();
        await item.locator('summary').click();
        ok(await step(0).getByRole('button', { name: '✅ Pass' }).getAttribute('aria-pressed') === 'true', 'step 1 result kept after a reload');
        ok(await step(1).locator('textarea').inputValue() === 'The tabs showed, the mini card <b>jumped</b>', 'step 2 note kept after a reload');
        ok(await step(2).locator('textarea').inputValue() === 'Saved without pressing anything' && await step(3).locator('textarea').inputValue() === 'Typed, then a picture went up', 'notes that saved by themselves are kept after a reload');
        ok(await item.locator('.shots img').count() === 3 && await item.locator('.log li').textContent().then(t => t.includes('Tried on the phone')), 'pictures and notes kept after a reload');

        // Copy my results
        await item.getByRole('button', { name: '📋 Copy my results' }).click();
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        ok(copied.includes(`Test Bench: ${first.title}`) && copied.includes('❌ Fail: The tabs showed') && copied.includes('Pictures on the lab Test Bench: 3'), 'Copy my results gives the steps, results, notes and picture count');

        // Status: Passed leaves "Still to do"
        await item.locator('select').selectOption('pass');
        await page.waitForFunction(id => !document.querySelector(`li.item[data-id="${id}"]`), first.id);
        ok(true, 'a passed test leaves the Still to do list');
        await page.click('[data-filter=pass]');
        ok(await page.locator(`#ravenList li.item[data-id="${first.id}"]`).count() === 1, '…and shows under ✅ Passed');
        await page.click('[data-filter=all]');

        // Automatic: reads GitHub (stand-in) on request
        await page.click('#refreshBtn');
        await page.waitForFunction(() => document.querySelector('#autoList .sub').textContent.includes('of 3 jobs green'));
        ok(await auto.first().locator('.sub').textContent().then(t => t.includes('2 of 3 jobs green') && t.includes('feedbee')), 'automatic line shows jobs green and the build');
        ok(await auto.first().getAttribute('data-status') === 'fail', 'a red job makes the line red');
        await auto.first().locator('summary').click();
        ok(await auto.first().locator('.jobs').textContent().then(t => t.includes('Browser e2e (WebKit) (failure, at "Browser e2e (source)")')), 'the failed job and its step are named');
        ok(await auto.first().locator('a[href^="https://github.com/"]').count() === 1, 'links to the run on GitHub');
        const wk = page.locator('#autoList li.item[data-id="ci-iphone"]');
        ok(await wk.getAttribute('data-status') === 'pass', 'a one-job line is green when its own job passed');
        ok(await page.locator('#fetchNote').textContent().then(t => t.startsWith('Last read')), 'says when GitHub was last read');

        // Add a test (text stays text)
        await page.fill('input[name=title]', 'Dark mode <img src=x onerror=window.hit=1>');
        await page.fill('textarea[name=steps]', 'Turn on dark mode\nOpen every screen');
        await page.check('input[name=interactive]');
        await page.fill('input[name=thread]', '🐢 Shell');
        await page.click('#addForm button[type=submit]');
        await page.locator('li.item[data-id^="p-dark-mode"]').waitFor();
        const added = page.locator('li.item[data-id^="p-dark-mode"]');
        ok(await added.locator('.ttl').textContent().then(t => t.includes('<img')) && await page.evaluate(() => !window.hit), 'an added test shows its title as text');
        ok(await added.locator('li.step').count() === 2 && await added.locator('.inter').textContent().then(t => t.includes('🐢 Shell')), 'an added test has its steps and its thread');

        // Phone width: no sideways scroll
        await page.setViewportSize({ width: 390, height: 800 });
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll at phone width');
        ok(await page.locator('#allNote').textContent().then(t => /^\d+ of \d+ steps done/.test(t)), 'the overall bar says how many steps are done');

        // Auto-Fixer's bench on the same engine: its own list, theme and 👤/🤖 steps
        await page.setViewportSize({ width: 1200, height: 900 });
        await page.goto(`${url}?bench=auto-fixer`);
        await raven.first().waitFor();
        ok(await page.locator('#benchTitle').textContent() === `${SHOP.emoji} ${SHOP.title}`, 'Auto-Fixer bench shows its own title');
        ok(await page.evaluate(() => document.documentElement.dataset.bench) === 'auto-fixer', '…its own theme');
        ok(await raven.count() === SHOP.items.length && await page.locator('#autoPanel').isHidden(), `…its ${SHOP.items.length} PR cards, and no empty Automatic panel`);
        ok(await page.locator(`li.item[data-id="${first.id}"]`).count() === 0, '…and none of vCGE\'s tests');
        const pr = raven.first();
        await pr.locator('summary').click();
        ok(await pr.locator('a', { hasText: 'Open the PR' }).getAttribute('href') === SHOP.items[0].link, 'a PR card links to its PR');
        const robotSteps = SHOP.items[0].steps.filter(st => st.who === 'robot').length;
        ok(await pr.locator('.who.robot').count() === robotSteps && await pr.locator('.who.human').count() === SHOP.items[0].steps.length - robotSteps, 'each step is marked 👤 YOU or 🤖 ROBOT');
        const withRobotLine = SHOP.items.flatMap(i => i.steps).find(st => st.robot);
        await page.click('[data-filter=all]');
        ok(await page.locator('.res', { hasText: withRobotLine.robot.slice(0, 30) }).count() >= 1, 'a robot step shows its result line');
        await page.click('[data-filter=human]');
        ok(await pr.locator('.who.robot').count() === 0 && await pr.locator('.who.human').count() > 0, '👤 Mine shows only your steps');
        ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    } catch (e) {
        fail++; console.log(`FAIL ${e.stack}`);
    } finally {
        if (browser) await browser.close();
        api.kill(); gh.close(); web.close();
        fs.rmSync(T, { recursive: true, force: true });
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    }
})();
