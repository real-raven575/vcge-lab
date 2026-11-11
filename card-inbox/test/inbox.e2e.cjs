// Card Inbox end to end, on a throwaway lab: the real Card Shelf, Reading Room and Card Inbox services, a build of the
// app published from a checkout, and a small stand-in for Caddy. Drawn cards only (made in the browser, made-up text).
// Checks: drop a photo -> it lands on the shelf for every bench -> the card page runs it with the build's own code ->
// answers typed once are saved here and as the Reading Room's "<card>__card" key -> scores show; then a short clip
// recorded from a drawn card -> the frame picker keeps frames -> they run as angles too.
//   Run: node card-inbox/test/inbox.e2e.cjs <app checkout>      (needs Playwright with Chromium)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const REPO = path.resolve(__dirname, '../..');
const APP = path.resolve(process.argv[2] || path.join(REPO, '../vCGE-Master'));
const SHORT = 'e2e0001';
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-e2e-'));
const W = path.join(T, 'www');
const PORTS = { shelf: '18968', bench: '18965', inbox: '18970', web: '18971' };
let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}`); } };

function lab() {
    fs.mkdirSync(path.join(W, 'v', SHORT), { recursive: true });
    fs.cpSync(path.join(APP, 'src'), path.join(W, 'v', SHORT, 'src'), { recursive: true });
    fs.writeFileSync(path.join(W, 'v', SHORT, 'version.json'), JSON.stringify({ short: SHORT, subject: 'test build', date: '2026-11-10T00:00:00Z', tests: 'n/a' }));
    fs.symlinkSync(path.join('v', SHORT), path.join(W, 'latest'));
    fs.cpSync(path.join(REPO, 'bench/www'), path.join(W, 'bench'), { recursive: true });
    fs.cpSync(path.join(REPO, 'logo-bench/www'), path.join(W, 'logo-bench'), { recursive: true });
    fs.cpSync(path.join(REPO, 'card-inbox/www'), path.join(W, 'inbox'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'flight-deck/www/deckbar.css'), path.join(W, 'deckbar.css'));
    for (const d of ['holding', 'archive', 'active/ocr', 'active/logo', 'active/edges']) fs.mkdirSync(path.join(T, 'shelf', d), { recursive: true });
}

const kids = [];
function start(args) { const k = spawn('python3', ['-I', ...args], { stdio: ['ignore', 'ignore', 'inherit'] }); kids.push(k); }

function standIn() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.png': 'image/png', '.jpg': 'image/jpeg' };
    const routes = [['/bench/api/', PORTS.bench], ['/shelf/api/', PORTS.shelf], ['/inbox/api/', PORTS.inbox]];
    return http.createServer((req, res) => {
        const r = routes.find(([p]) => req.url.startsWith(p));
        if (r) { const p = http.request({ host: '127.0.0.1', port: r[1], path: req.url, method: req.method, headers: req.headers }, x => { res.writeHead(x.statusCode, x.headers); x.pipe(res); }); req.pipe(p); return; }
        let file = path.join(W, decodeURIComponent(req.url.split('?')[0]));
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    }).listen(PORTS.web, '127.0.0.1');
}

// A drawn business card on a dark desk, made-up text; tilt moves it a little (for the clip).
const DRAW = `(c, tilt) => { const x = c.getContext('2d'); x.fillStyle = '#3a3f47'; x.fillRect(0, 0, c.width, c.height);
  x.save(); x.translate(c.width / 2, c.height / 2); x.rotate(tilt); x.fillStyle = '#fbfaf6'; x.fillRect(-350, -200, 700, 400);
  x.fillStyle = '#1b2a4a'; x.font = 'bold 44px sans-serif'; x.fillText('Velmar Studio', -310, -110);
  x.fillStyle = '#111'; x.font = '36px sans-serif'; x.fillText('Kalo Renmi', -310, -30); x.fillText('555-0123', -310, 40); x.fillText('kalo@velmar.test', -310, 110);
  x.restore(); }`;

(async () => {
    lab();
    start([path.join(REPO, 'card-shelf/card-shelf-api.py'), '--shelf', path.join(T, 'shelf'), '--port', PORTS.shelf]);
    start([path.join(REPO, 'bench/vcge-bench-api.py'), '--root', W, '--port', PORTS.bench, '--cards-dir', path.join(T, 'shelf/active/ocr')]);
    start([path.join(REPO, 'card-inbox/card-inbox-api.py'), '--root', path.join(T, 'inbox'), '--port', PORTS.inbox, '--shelf-api', `http://127.0.0.1:${PORTS.shelf}`, '--no-drop']);
    const web = standIn();
    await new Promise(r => setTimeout(r, 1500));
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
        const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`http://127.0.0.1:${PORTS.web}/inbox/`);
        await page.waitForFunction(() => document.querySelector('#inboxBuild option'), null, { timeout: 15000 }).catch(async () => { console.log('errors:', errors, 'builds:', await (await fetch(`http://127.0.0.1:${PORTS.web}/bench/api/builds`)).text(), await page.textContent('#inboxBuildNote'), await page.textContent('#status')); throw new Error('no builds'); });
        ok(await page.locator('#inboxBuild').inputValue() === SHORT, 'the build list comes from the Reading Room');

        // 1. one drawn photo
        const jpg = await page.evaluate(async (draw) => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; eval(draw)(c, 0.06);
            const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); return Array.from(new Uint8Array(await b.arrayBuffer())); }, DRAW);
        await page.fill('#cardName', 'E2E card');
        await page.setInputFiles('#fileInput', { name: 'angle-1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
        await page.waitForSelector('#angleRows tr[data-hash] td.state:text("✓"), #angleRows tr[data-hash] td.state:text("✗")', { timeout: 120000 });
        const shelfList = JSON.parse(await (await fetch(`http://127.0.0.1:${PORTS.shelf}/shelf/api/photos`)).text()).photos;
        ok(shelfList.length === 1 && shelfList[0].name === 'e2e-card__angle-1.jpg', 'the photo is on the shelf as "<card>__<photo>"');
        ok(shelfList.length === 1 && ['edges', 'logo', 'ocr'].every(b => shelfList[0].benches.includes(b)), 'ticked for all three benches');
        ok(await page.locator('#angleRows td.state').first().textContent() === '✓', 'the angle was read by the build');
        const card = JSON.parse(fs.readFileSync(path.join(T, 'inbox/cards/e2e-card/card.json')));
        const res = Object.values(card.results)[0];
        ok(res && res.lines.length > 0 && res.build === SHORT, `the result is saved (${res ? res.lines.length : 0} lines)`);
        ok(res && typeof res.edges === 'boolean' && typeof res.logo === 'boolean', 'edges and logo answers are saved');

        // 2. the right answers, once
        await page.click('#fillVote');
        ok(await page.locator('#truthLines .tline').count() > 0, 'Fill from the vote puts in the lines read');
        await page.evaluate(() => { document.querySelectorAll('#truthLines .tline').forEach(r => r.remove()); });
        for (const [text, role] of [['Velmar Studio', 'organization'], ['Kalo Renmi', 'name'], ['555-0123', 'phone'], ['kalo@velmar.test', 'email']]) {
            await page.click('#addLine');
            const row = page.locator('#truthLines .tline').last();
            await row.locator('.ttext').fill(text); await row.locator('.trole').selectOption(role);
        }
        await page.click('#saveTruth');
        await page.waitForFunction(() => /Saved here/.test(document.querySelector('#truthNote').textContent));
        ok(/and in the Reading Room/.test(await page.textContent('#truthNote')), 'saved here and in the Reading Room');
        const key = JSON.parse(fs.readFileSync(path.join(W, 'bench/data/truth/business-cards/e2e-card__card.json')));
        ok(key.lines.length === 4 && key.lines[1].text === 'Kalo Renmi', 'the Reading Room key "<card>__card" has the 4 lines');
        ok(/\d+%/.test(await page.textContent('#angleRows td.num')), 'the angle now shows characters right');
        ok(/All angles voted/.test(await page.textContent('#summary')), 'the summary shows the vote');

        // 3. a short clip of the same drawn card, recorded in the browser
        const webm = await page.evaluate(async (draw) => {
            const c = document.createElement('canvas'); c.width = 960; c.height = 720; const f = eval(draw); f(c, 0);
            const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }); const parts = []; rec.ondataavailable = e => parts.push(e.data);
            rec.start(); const t0 = performance.now();
            await new Promise(res => { const step = () => { const s = (performance.now() - t0) / 1000; f(c, Math.sin(s * 3) * 0.08); if (s < 1.6) requestAnimationFrame(step); else res(); }; step(); });
            rec.stop(); await new Promise(r => { rec.onstop = r; });
            return Array.from(new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer())); }, DRAW);
        await page.setInputFiles('#fileInput', { name: 'hold.webm', mimeType: 'video/webm', buffer: Buffer.from(webm) });
        await page.waitForFunction(() => document.querySelectorAll('#angleRows .pill').length > 0, null, { timeout: 120000 });
        const after = JSON.parse(fs.readFileSync(path.join(T, 'inbox/cards/e2e-card/card.json')));
        const frames = after.photos.filter(p => p.kind === 'frame');
        ok(after.clips.length === 1 && frames.length >= 1 && frames.length <= 8, `the clip is kept and ${frames.length} frames were picked`);
        ok(frames.every(p => p.from === after.clips[0].hash), 'each frame points back to its clip');
        await page.waitForFunction(() => !Array.from(document.querySelectorAll('#angleRows td.state')).some(td => td.textContent !== '✓' && td.textContent !== '✗'), null, { timeout: 240000 });
        ok(/Video frames/.test(await page.textContent('#summary')), 'the summary compares photos with video frames');
        await page.setViewportSize({ width: 390, height: 844 });
        const wide = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.scroll')).slice(0, 3).map(e => e.tagName + '#' + e.id + '.' + e.className));
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `no sideways scroll at phone width${wide.length ? ': ' + wide.join(', ') : ''}`);
        if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT, fullPage: true });
        ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    } finally {
        await browser.close(); web.close(); kids.forEach(k => k.kill());
        fs.rmSync(T, { recursive: true, force: true });
    }
    console.log(`\n${pass} of ${pass + fail} passed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); kids.forEach(k => k.kill()); process.exit(1); });
