// Layout Lab end to end: two browsers ("phone" and "computer") on one throwaway lab server pick up the same work.
//   Run: node testbench/test/layout-lab.e2e.cjs        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const REPO = path.resolve(__dirname, '../..');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-lab-e2e-'));
const PORTS = { api: 18991, web: 18993 };
let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}`); } };

// A stand-in for Caddy: the page at /vcge/testbench/, the service at /vcge/testbench/api/ (prefix /vcge removed).
const web = http.createServer((req, res) => {
    if (req.url.startsWith('/vcge/testbench/api/')) {
        const p = http.request({ host: '127.0.0.1', port: PORTS.api, path: req.url.slice(5), method: req.method, headers: req.headers },
            x => { res.writeHead(x.statusCode, x.headers); x.pipe(res); });
        req.pipe(p); return;
    }
    if (req.url.split('?')[0] !== '/vcge/testbench/layout-lab.html') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); fs.createReadStream(path.join(REPO, 'testbench/www/layout-lab.html')).pipe(res);
});

(async () => {
    web.listen(PORTS.web);
    const api = spawn('python3', ['-I', path.join(REPO, 'testbench/testbench-api.py'), '--root', path.join(T, 'root'), '--port', String(PORTS.api),
        '--seeds', path.join(REPO, 'testbench/benches'), '--no-ci'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let browser;
    try {
        for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORTS.api}/testbench/api/health`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
        browser = await chromium.launch();
        const url = `http://127.0.0.1:${PORTS.web}/vcge/testbench/layout-lab.html`;
        const errors = [];
        const open = async () => { const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
            await ctx.route(/^https:\/\//, r => r.abort()); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
            await p.goto(url); await p.waitForFunction(() => document.getElementById('saveNote').textContent.includes('lab server')); return p; };

        const phone = await open();
        ok((await phone.locator('#saveNote').textContent()).includes('every device'), 'the page finds the lab server');
        await phone.locator('#kb .key', { hasText: /^q/ }).first().click();
        await phone.locator('#kW').fill('2.5'); await phone.locator('#kW').dispatchEvent('input');
        await phone.waitForFunction(() => document.getElementById('syncNote').textContent.includes('saved on the lab server'));
        ok(true, 'an edit is saved to the lab server by itself');

        const computer = await open();
        await computer.waitForFunction(() => JSON.parse(document.getElementById('json').value).rows[2].keys[0].w === 2.5);
        ok((await computer.locator('#syncNote').textContent()).includes('Picked up'), 'another device opens the same work');

        await phone.locator('#name').fill('Big thumbs'); await phone.locator('#save').click();
        await phone.waitForFunction(() => document.getElementById('saveNote').textContent.includes('Every device can open it'));
        await computer.reload(); await computer.waitForSelector('#savedList li');
        ok((await computer.locator('#savedList li').first().textContent()).includes('Big thumbs'), 'a saved layout shows on the other device');

        const del = computer.locator('#savedList li button.danger');
        await del.click(); ok((await del.textContent()) === 'Are you sure?', 'delete asks "Are you sure?" first');
        await del.click(); await computer.waitForFunction(() => document.getElementById('saveNote').textContent.includes('bin'));
        ok(fs.readdirSync(path.join(T, 'root/layouts/bin')).length === 1, 'a deleted layout goes to the lab bin, not erased');
        ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
    } catch (e) { fail++; console.log('FAIL ' + e.message); }
    finally { if (browser) await browser.close(); api.kill(); web.close(); fs.rmSync(T, { recursive: true, force: true }); }
    console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
