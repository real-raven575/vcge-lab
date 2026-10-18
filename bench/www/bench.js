/**
 * vCGE lab: OCR test bench (Glyph, MOD04). Lab only; never part of the app.
 *
 * Runs ONE published build's own code over the sample library, in this browser: MOD03 cardFinder.js (edges) and
 * perspective.js (the crop), MOD04 ocrWorker.js (pre-processing + bundled Tesseract.js + second guesses + icons) and
 * MOD05 formMapper.js (lines to fields), imported by URL from /v/<build>/src/... so nothing is copied or re-implemented.
 * The reading happens on this device; the lab server only stores samples, truth and reports (bench/api, see
 * vcge-bench-api.py). Switching builds reloads the page, because a build's modules can only be loaded once.
 * Plain edition: the page has no #glyphSays, so say() does nothing.
 */
const ROOT = location.pathname.replace(/bench\/.*$/, '');   // the lab root, e.g. "/"
const API = `${ROOT}bench/api/`;
const DATA = `${ROOT}bench/data/`;
const SETS = { 'business-cards': 'Business card', handwriting: 'Handwriting' };
const FINDER_MAX_SIDE = 1200;      // same as MOD03 cropEditor.js: the edge finder reads a copy no larger than this
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Glyph's line in the speech bubble. Text only. */
const say = (text) => { const el = $('glyphSays'); if (el) el.textContent = text; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const state = { build: null, builds: [], samples: {}, roles: [], results: [], truths: {}, stop: false, modules: null };

async function api(path, options) {
    const r = await fetch(API + path, { cache: 'no-store', ...options });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `${path}: HTTP ${r.status}`);
    return body;
}

// ---- Builds and samples ----------------------------------------------------------------------------------------

async function loadBuilds() {
    const { builds, latest } = await api('builds');
    state.builds = builds;
    const wanted = new URLSearchParams(location.search).get('build') || latest || (builds[0] && builds[0].short);
    const sel = $('buildSelect');
    sel.replaceChildren(...builds.map(b => new Option(`${b.short}  ${b.subject.slice(0, 70)}${b.source ? '' : '  (source not published yet)'}`, b.short, false, b.short === wanted)));
    sel.addEventListener('change', () => { location.search = `?build=${encodeURIComponent(sel.value)}`; });
    const build = builds.find(b => b.short === sel.value);
    state.build = build || null;
    $('buildNote').textContent = build ? `${build.date.slice(0, 16).replace('T', ' ')} UTC, unit tests ${build.tests || '?'}` : 'No builds published yet.';
    if (build && !build.source) { $('buildNote').textContent += '. Its source is not published yet (vcge-lab-bench-publish-src runs every 5 minutes); pick another build or wait.'; $('runBtn').disabled = true; }
}

async function loadSamples() {
    const { sets } = await api('samples');
    state.samples = sets;
    const fill = (listId, countId, set) => {
        const rows = sets[set] || [];
        $(countId).textContent = `(${rows.length})`;
        $(listId).replaceChildren(...rows.map(r => { const li = document.createElement('li'); li.textContent = `${r.name} (${Math.round(r.size / 1024)} KB)`; if (r.truth) { li.className = 'truth'; li.title = 'has saved truth'; li.textContent += ' ✓ truth'; } return li; }));
        if (!rows.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No samples yet.'; $(listId).append(li); }
    };
    fill('listCards', 'countCards', 'business-cards');
    fill('listHand', 'countHand', 'handwriting');
    if (!(sets['business-cards'] || []).length && !(sets.handwriting || []).length) say("The in-tray is empty. I'll wait. I'm good at waiting.");
}

async function upload(set, files) {
    for (const file of files) {
        $('runStatus').textContent = `Uploading ${file.name}…`;
        await api(`upload?set=${encodeURIComponent(set)}&name=${encodeURIComponent(file.name)}`, { method: 'PUT', body: file });
    }
    $('runStatus').textContent = `${files.length} file${files.length === 1 ? '' : 's'} added.`;
    await loadSamples();
}

// ---- The build's own pipeline ------------------------------------------------------------------------------------

/** Loads the chosen build's modules once. Paths inside them resolve from <base>, so the page's base becomes the build. */
async function loadModules() {
    if (state.modules) return state.modules;
    const b = `${ROOT}v/${state.build.short}/`;
    const base = document.createElement('base'); base.href = new URL(b, location.href).href; document.head.prepend(base);
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = `${b}src/vendor/tesseract/tesseract.min.js`; s.onload = res; s.onerror = () => rej(new Error('tesseract.min.js not found in this build')); document.head.append(s); });
    const [finder, persp, ocr, mapper] = await Promise.all([
        import(`${b}src/modules/mod03-camera/cardFinder.js`), import(`${b}src/modules/mod03-camera/perspective.js`),
        import(`${b}src/modules/mod04-ocr/ocrWorker.js`), import(`${b}src/modules/mod05-form/formMapper.js`)]);
    state.roles = mapper.LINE_ROLES;
    state.modules = { finder, persp, ocr, mapper: new mapper.ContactFormMapper() };
    return state.modules;
}

function loadImage(url) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('image failed to load')); img.src = url; });
}

/** Edges, crop, read, map: one sample through the build's code. Returns a result record (never throws). */
async function runSample(set, name, snap) {
    const { finder, persp, ocr, mapper } = state.modules;
    const r = { set, name, url: `${DATA}samples/${set}/${name}`, quad: null, cropUrl: null, outcome: 'read', error: null, ms: {}, confidence: null, lines: [], fields: null, width: 0, height: 0 };
    let t = performance.now();
    try {
        const img = await loadImage(r.url);
        r.width = img.naturalWidth; r.height = img.naturalHeight;
        // Whole photo as a data URL (what the app reads when no corner is moved)
        const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
        full.getContext('2d').drawImage(img, 0, 0);
        let source = full.toDataURL('image/png');
        if (snap) {
            const scale = Math.min(1, FINDER_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
            const small = document.createElement('canvas'); small.width = Math.max(1, Math.round(img.naturalWidth * scale)); small.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const sctx = small.getContext('2d'); sctx.drawImage(img, 0, 0, small.width, small.height);
            const quad = finder.findCardQuad(sctx.getImageData(0, 0, small.width, small.height));
            r.ms.edges = Math.round(performance.now() - t);
            if (quad) {
                r.quad = quad.map(p => ({ x: p.x / scale, y: p.y / scale }));
                const { width, height } = persp.quadOutputSize(r.quad);
                const flat = persp.warpPerspective(full.getContext('2d').getImageData(0, 0, full.width, full.height), r.quad, width, height);
                const out = document.createElement('canvas'); out.width = width; out.height = height;
                out.getContext('2d').putImageData(new ImageData(flat.data, width, height), 0, 0);
                source = out.toDataURL('image/png');
            }
        }
        r.cropUrl = source;
        t = performance.now();
        const read = await ocr.executeOCRScan(source, { onStatus: s => { $('runStatus').textContent = `${name}: ${s === 'starting' ? 'preparing the reader' : 'reading'}…`; } });
        r.ms.read = Math.round(performance.now() - t);
        r.confidence = read.confidence;
        const lines = mapper.classifyLines(read.lines && read.lines.length ? read.lines : read.text);
        r.fields = mapper.buildFields(lines).fields;      // buildFields also sets the "please check" flags
        r.lines = lines.map(l => ({ text: l.text, role: l.role, icon: l.icon || null, check: l.check || null, unsure: l.unsure || [] }));
    } catch (e) {
        r.ms.read = r.ms.read || Math.round(performance.now() - t);
        r.outcome = (e && e.code) || 'error';
        r.error = e && e.message ? e.message : String(e);
    }
    return r;
}

async function runAll() {
    const sets = [];
    if ($('runCards').checked) sets.push('business-cards');
    if ($('runHand').checked) sets.push('handwriting');
    const jobs = sets.flatMap(set => (state.samples[set] || []).map(s => ({ set, name: s.name, snap: set === 'business-cards' || $('snapHand').checked })));
    if (!jobs.length) { $('runStatus').textContent = 'No samples to run.'; return; }
    $('runBtn').disabled = true; $('stopBtn').disabled = false; state.stop = false;
    $('progress').classList.remove('hidden'); $('progressFill').style.width = '0';
    say(`Goggles down. Reading ${plural(jobs.length, 'sample')}. Don't mind the head tilt.`);
    try {
        await loadModules();
    } catch (e) {
        say("I couldn't open this build's reader. Pick another build and I'll try that one.");
        $('runStatus').textContent = `Could not load the build's modules: ${e.message}`;
        $('runBtn').disabled = false; $('stopBtn').disabled = true; return;
    }
    state.results = []; state.truths = {};
    $('rows').replaceChildren(); $('results').classList.remove('hidden'); $('analysis').classList.add('hidden');
    for (let i = 0; i < jobs.length && !state.stop; i++) {
        const { set, name, snap } = jobs[i];
        const r = await runSample(set, name, snap);
        const got = await api(`truth?set=${encodeURIComponent(set)}&name=${encodeURIComponent(name)}`).catch(() => null);
        const truth = got && got.lines ? got : null;
        state.results.push(r); if (truth) state.truths[`${set}/${name}`] = truth;
        $('rows').append(renderSample(r, truth, state.results.length - 1));
        $('progressFill').style.width = `${Math.round(((i + 1) / jobs.length) * 100)}%`;
    }
    $('runStatus').textContent = state.stop ? `Stopped after ${state.results.length} of ${jobs.length}.` : `Done: ${state.results.length} sample${state.results.length === 1 ? '' : 's'} read.`;
    const failed = state.results.filter(r => r.outcome !== 'read').length;
    say(state.stop ? "Stopped. Don't ask me where I was. I keep nothing."
        : failed ? `Done. ${plural(failed, 'sample')} I couldn't read, and I said so instead of guessing. Correct the rest and press Go.`
        : 'Done. Fix anything I misread on the right, then press Go and I will score myself. Honestly.');
    $('runBtn').disabled = false; $('stopBtn').disabled = true;
}

// ---- Results page: photo + edges, readout, correction inputs -----------------------------------------------------

function drawPhoto(canvas, r) {
    const img = new Image();
    img.onload = () => {
        const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (r.quad) {
            ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3; ctx.beginPath();
            r.quad.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x * scale, p.y * scale)); ctx.closePath(); ctx.stroke();
        }
    };
    img.src = r.url;
}

function roleSelect(value) {
    const sel = document.createElement('select');
    state.roles.forEach(([v, label]) => sel.add(new Option(label, v, false, v === value)));
    if (value && !state.roles.some(([v]) => v === value)) sel.add(new Option(value, value, true, true));
    return sel;
}

function truthLineRow(line, readText) {
    const row = document.createElement('div'); row.className = 'line';
    const text = document.createElement('input'); text.type = 'text'; text.value = line.text; text.placeholder = 'line as it should read';
    const role = roleSelect(line.role);
    const drop = document.createElement('label'); drop.className = 'drop';
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = !!line.drop;
    drop.append(box, ' drop');
    const mark = () => { row.classList.toggle('changed', text.value !== readText); row.classList.toggle('dropped', box.checked); };
    text.addEventListener('input', mark); box.addEventListener('change', mark); mark();
    row.append(text, role, drop);
    row.getLine = () => ({ text: text.value.trim(), role: role.value, drop: box.checked });
    return row;
}

function renderSample(r, truth, index) {
    const box = document.createElement('article'); box.className = 'sample'; box.dataset.index = index;
    // Left: photo with edges, then the crop that was read
    const left = document.createElement('div');
    const h = document.createElement('h3'); h.innerHTML = `${esc(r.name)} <span class="set">${esc(SETS[r.set])}</span>`;
    const canvas = document.createElement('canvas'); drawPhoto(canvas, r);
    left.append(h, canvas);
    if (r.quad && r.cropUrl) { const crop = document.createElement('img'); crop.className = 'crop'; crop.alt = 'the crop that was read'; crop.src = r.cropUrl; left.append(crop); }
    const edgeNote = document.createElement('p'); edgeNote.className = 'note';
    edgeNote.textContent = r.quad ? `Edges found in ${r.ms.edges} ms.` : (r.set === 'business-cards' ? 'No card edges found: the whole photo was read.' : 'Edges not looked for (handwriting).');
    const edgeOk = document.createElement('label'); edgeOk.className = 'note'; const edgeBox = document.createElement('input'); edgeBox.type = 'checkbox';
    edgeBox.checked = truth && typeof truth.edgesOk === 'boolean' ? truth.edgesOk : !!r.quad; edgeOk.append(edgeBox, r.quad ? ' the green edges are right' : ' reading the whole photo was right (card fills it)'); left.append(edgeNote, edgeOk);
    // Middle: what it read
    const mid = document.createElement('div');
    const outcome = document.createElement('p'); outcome.className = `outcome ${r.outcome === 'read' ? 'ok' : 'bad'}`;
    outcome.textContent = r.outcome === 'read' ? `Read in ${r.ms.read} ms, confidence ${r.confidence}` : `${r.outcome}: ${r.error}`;
    const ul = document.createElement('ul'); ul.className = 'read';
    r.lines.forEach(l => { const li = document.createElement('li'); li.innerHTML = `${l.icon ? `<span class="icon">[${esc(l.icon)}]</span> ` : ''}${esc(l.text)} <span class="role">${esc(l.role || '')}</span>${l.check ? ` <span class="flag">⚠ ${esc(l.check)}</span>` : ''}`; ul.append(li); });
    const fields = document.createElement('div'); fields.className = 'fields';
    if (r.fields) {
        const f = r.fields, parts = [];
        const put = (label, v) => { if (v) parts.push(`<b>${label}</b> ${esc(v)}`); };
        put('Name', [f.namePrefix, f.firstName, f.middleName, f.lastName, f.nameSuffix].filter(Boolean).join(' ')); put('Title', f.jobTitle); put('Company', f.organization);
        f.phones.forEach(p => put(`Phone (${p.type})`, p.value)); f.emails.forEach(p => put(`Email (${p.type})`, p.value)); f.websites.forEach(p => put(`Web (${p.type})`, p.value));
        put('Street', f.street); put('Unit', [f.unitType, f.unitNumber].filter(Boolean).join(' ')); put('City', f.city); put('State', f.state); put('ZIP', f.zip); put('Country', f.country); put('Notes', f.notes);
        fields.innerHTML = parts.join(' · ') || 'No fields would be filled.';
    }
    mid.append(outcome, ul, fields);
    // Right: the truth inputs
    const right = document.createElement('div'); right.className = 'truth';
    const rh = document.createElement('h3'); rh.textContent = truth ? 'Truth (saved earlier; edit if wrong)' : 'Correct what it got wrong';
    const lines = document.createElement('div');
    const base = truth && truth.lines ? truth.lines : r.lines.map(l => ({ text: l.text, role: l.role, drop: false }));
    base.forEach((l, i) => lines.append(truthLineRow(l, (r.lines[i] || {}).text ?? '')));
    const add = document.createElement('button'); add.className = 'add'; add.textContent = '+ missed line';
    add.addEventListener('click', () => lines.append(truthLineRow({ text: '', role: 'notes', drop: false }, null)));
    const score = document.createElement('div'); score.className = 'score';
    right.append(rh, lines, add, score);
    box.append(left, mid, right);
    box.getTruth = () => ({ lines: Array.from(lines.children).map(row => row.getLine()).filter(l => l.text || l.drop), edgesOk: edgeBox.checked, hadQuad: !!r.quad });
    box.showScore = (s) => { score.innerHTML = scoreHtml(s); };
    if (truth) box.showScore(scoreSample(r, box.getTruth()));
    return box;
}

// ---- Scoring: read vs truth -----------------------------------------------------------------------------------------

/** Levenshtein distance with the edit list: [{ op: 'eq'|'sub'|'del'|'ins', a, b }], a = read, b = truth. */
export function editOps(a, b) {
    const n = a.length, m = b.length, d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) d[i][0] = i;
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const ops = []; let i = n, j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { ops.push({ op: a[i - 1] === b[j - 1] ? 'eq' : 'sub', a: a[i - 1], b: b[j - 1] }); i--; j--; }
        else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'del', a: a[i - 1], b: '' }); i--; }
        else { ops.push({ op: 'ins', a: '', b: b[j - 1] }); j--; }
    }
    return { distance: d[n][m], ops: ops.reverse() };
}

/** Groups runs of edits into readable confusions: "rn -> m", "I -> l", "0 -> O". */
export function confusions(ops) {
    const out = []; let cur = null;
    for (const o of ops) {
        if (o.op === 'eq') { if (cur) { out.push(cur); cur = null; } continue; }
        cur = cur || { from: '', to: '' }; cur.from += o.a; cur.to += o.b;
    }
    if (cur) out.push(cur);
    return out;
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Pairs read lines with truth lines (best edit-distance ratio first, each used once), then scores the sample. */
export function scoreSample(r, truth) {
    const read = r.lines.map((l, i) => ({ i, text: norm(l.text), role: l.role, check: !!l.check }));
    const want = truth.lines.filter(l => !l.drop).map((l, i) => ({ i, text: norm(l.text), role: l.role }));
    const dropped = truth.lines.filter(l => l.drop).length;
    const pairs = [];
    for (const a of read) for (const b of want) { const { distance } = editOps(a.text, b.text); const ratio = distance / Math.max(a.text.length, b.text.length, 1); if (ratio < 0.6) pairs.push({ a, b, distance, ratio }); }
    pairs.sort((x, y) => x.ratio - y.ratio);
    const usedA = new Set(), usedB = new Set(), matched = [];
    for (const p of pairs) { if (usedA.has(p.a.i) || usedB.has(p.b.i)) continue; usedA.add(p.a.i); usedB.add(p.b.i); matched.push(p); }
    const s = { sample: `${r.set}/${r.name}`, set: r.set, outcome: r.outcome, truthChars: want.reduce((n, l) => n + l.text.length, 0), errorChars: 0, linesTotal: want.length, linesExact: 0,
        linesWrongRole: 0, linesMissed: 0, linesInvented: 0, flagsRight: 0, flagsFalse: 0, flagsMissed: 0, confusions: [], edgesOk: truth.edgesOk, hadQuad: truth.hadQuad, diffs: [], dropped };
    for (const p of matched) {
        const { ops } = editOps(p.a.text, p.b.text);
        s.errorChars += p.distance;
        if (p.distance === 0) s.linesExact++;
        if (p.a.role !== p.b.role) s.linesWrongRole++;
        const wrong = p.distance > 0;
        if (p.a.check && wrong) s.flagsRight++; else if (p.a.check && !wrong) s.flagsFalse++; else if (!p.a.check && wrong) s.flagsMissed++;
        for (const c of confusions(ops)) s.confusions.push(c);
        s.diffs.push({ read: p.a.text, truth: p.b.text, ops, roleRead: p.a.role, roleTruth: p.b.role });
    }
    s.linesMissed = want.length - matched.length;
    s.linesInvented = read.length - matched.length;
    s.errorChars += want.filter(l => !usedB.has(l.i)).reduce((n, l) => n + l.text.length, 0);   // a missed line is all wrong
    s.charAccuracy = s.truthChars ? Math.max(0, 1 - s.errorChars / s.truthChars) : (read.length ? 0 : 1);
    return s;
}

function diffHtml(ops) {
    return ops.map(o => o.op === 'eq' ? esc(o.a) : o.op === 'sub' ? `<del>${esc(o.a)}</del><ins>${esc(o.b)}</ins>` : o.op === 'del' ? `<del>${esc(o.a)}</del>` : `<ins>${esc(o.b)}</ins>`).join('');
}

function scoreHtml(s) {
    const acc = Math.round(s.charAccuracy * 100);
    const bits = [`<span class="acc ${acc >= 98 ? 'good' : acc >= 90 ? 'mid' : 'low'}">${acc}%</span> of characters right, ${s.linesExact}/${s.linesTotal} lines exact`];
    if (s.linesMissed) bits.push(`${s.linesMissed} missed`); if (s.linesInvented) bits.push(`${s.linesInvented} invented or dropped`); if (s.linesWrongRole) bits.push(`${s.linesWrongRole} in the wrong field`);
    if (s.flagsFalse) bits.push(`${s.flagsFalse} needless "please check"`); if (s.flagsMissed) bits.push(`${s.flagsMissed} wrong line${s.flagsMissed === 1 ? '' : 's'} not flagged`);
    if (s.hadQuad && !s.edgesOk) bits.push('edges wrong'); if (s.set === 'business-cards' && !s.hadQuad) bits.push(s.edgesOk ? 'no edges found (whole photo was right)' : 'no edges found');
    const diffs = s.diffs.filter(d => d.ops.some(o => o.op !== 'eq')).map(d => `<div class="diff">${diffHtml(d.ops)}</div>`).join('');
    return `<div>${bits.join(', ')}.</div>${diffs}`;
}

// ---- Go: save the truth, analyse the run, keep the report --------------------------------------------------------

function analyse(scores) {
    const cards = scores.filter(s => s.set === 'business-cards'), hand = scores.filter(s => s.set === 'handwriting');
    const agg = (list) => {
        const t = { n: list.length, truthChars: 0, errorChars: 0, linesTotal: 0, linesExact: 0, linesMissed: 0, linesInvented: 0, linesWrongRole: 0, flagsRight: 0, flagsFalse: 0, flagsMissed: 0, edgesRight: 0, edgesTried: 0, failed: 0, confusions: {} };
        for (const s of list) {
            for (const k of ['truthChars', 'errorChars', 'linesTotal', 'linesExact', 'linesMissed', 'linesInvented', 'linesWrongRole', 'flagsRight', 'flagsFalse', 'flagsMissed']) t[k] += s[k];
            if (s.outcome !== 'read') t.failed++;
            if (s.set === 'business-cards') { t.edgesTried++; if (s.edgesOk) t.edgesRight++; }
            for (const c of s.confusions) { const key = `${c.from || '∅'} → ${c.to || '∅'}`; t.confusions[key] = (t.confusions[key] || 0) + 1; }
        }
        t.charAccuracy = t.truthChars ? 1 - t.errorChars / t.truthChars : 1;
        t.top = Object.entries(t.confusions).sort((a, b) => b[1] - a[1]).slice(0, 15);
        return t;
    };
    return { cards: agg(cards), hand: agg(hand), all: agg(scores) };
}

function pct(x) { return `${Math.round(x * 100)}%`; }

function summaryHtml(a, build) {
    const row = (label, t) => t.n ? `<tr><td>${label}</td><td>${t.n}</td><td>${pct(t.charAccuracy)}</td><td>${t.linesExact}/${t.linesTotal}</td><td>${t.linesMissed}</td><td>${t.linesInvented}</td><td>${t.linesWrongRole}</td><td>${t.flagsRight} / ${t.flagsFalse} / ${t.flagsMissed}</td><td>${t.edgesTried ? `${t.edgesRight}/${t.edgesTried}` : '–'}</td><td>${t.failed}</td></tr>` : '';
    // Each confusion: what was read, a "?", what it should have been
    const top = a.all.top.length ? `<p><b>Top character confusions (read → truth):</b></p><div class="confusions">${a.all.top.map(([k, n]) => { const [from, to] = k.split(' → '); return `<span class="confusion" title="${esc(k)}">${esc(from)} <span class="q">?</span> ${esc(to)} <span class="n">×${n}</span></span>`; }).join('')}</div>` : '<p>No character confusions.</p>';
    return `<p>Build <code>${esc(build.short)}</code>: ${esc(build.subject)}</p><table><thead><tr><th>Set</th><th>Samples</th><th>Char accuracy</th><th>Lines exact</th><th>Missed</th><th>Invented</th><th>Wrong field</th><th>Flags right / false / missed</th><th>Edges right</th><th>Failed reads</th></tr></thead><tbody>${row('Business cards', a.cards)}${row('Handwriting (v2 baseline)', a.hand)}</tbody></table>${top}`;
}

function summaryMd(a, build, scores) {
    const line = (label, t) => t.n ? `- ${label}: ${t.n} samples, ${pct(t.charAccuracy)} characters right, ${t.linesExact}/${t.linesTotal} lines exact, ${t.linesMissed} missed, ${t.linesInvented} invented, ${t.linesWrongRole} wrong field, flags right/false/missed ${t.flagsRight}/${t.flagsFalse}/${t.flagsMissed}${t.edgesTried ? `, edges right ${t.edgesRight}/${t.edgesTried}` : ''}, failed reads ${t.failed}` : '';
    const worst = scores.filter(s => s.outcome === 'read').sort((x, y) => x.charAccuracy - y.charAccuracy).slice(0, 5).map(s => `- ${s.sample}: ${pct(s.charAccuracy)}${s.linesMissed ? `, ${s.linesMissed} missed` : ''}${s.hadQuad && !s.edgesOk ? ', edges wrong' : ''}`);
    return [`OCR bench, build ${build.short} (${build.subject}), ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, line('Business cards', a.cards), line('Handwriting', a.hand),
        a.all.top.length ? `- Top confusions (read -> truth): ${a.all.top.map(([k, n]) => `${k} x${n}`).join(', ')}` : '- No character confusions.',
        worst.length ? 'Weakest samples:' : '', ...worst].filter(Boolean).join('\n');
}

async function go() {
    if (!state.results.length) return;
    $('goBtn').disabled = true; $('goStatus').textContent = 'Saving corrections…';
    const boxes = Array.from($('rows').children), scores = [];
    try {
        for (const box of boxes) {
            const r = state.results[Number(box.dataset.index)], truth = box.getTruth();
            await api(`truth?set=${encodeURIComponent(r.set)}&name=${encodeURIComponent(r.name)}`, { method: 'PUT', body: JSON.stringify({ ...truth, build: state.build.short }) });
            const s = scoreSample(r, truth); scores.push(s); box.showScore(s);
        }
        const a = analyse(scores);
        $('summary').innerHTML = summaryHtml(a, state.build);
        const md = summaryMd(a, state.build, scores); $('summaryMd').value = md;
        $('analysis').classList.remove('hidden');
        const reportHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>vCGE OCR bench ${esc(state.build.short)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#14181f}table{border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e6ea}del{background:#fde2e1;text-decoration:none}ins{background:#dcf5e4;text-decoration:none}.diff{font-family:monospace}</style></head><body><h1>OCR bench report</h1>${summaryHtml(a, state.build)}<h2>Samples</h2>${scores.map(s => `<h3>${esc(s.sample)}</h3>${scoreHtml(s)}`).join('')}<pre>${esc(md)}</pre></body></html>`;
        const summary = { samples: scores.length, charAccuracy: a.all.charAccuracy, linesExact: a.all.linesExact, linesTotal: a.all.linesTotal, edgesRight: a.all.edgesRight, edgesTried: a.all.edgesTried, failed: a.all.failed, cards: a.cards.n, hand: a.hand.n };
        const saved = await api('runs', { method: 'POST', body: JSON.stringify({ build: state.build.short, subject: state.build.subject, when: new Date().toISOString(), scores, summary, summaryMd: md, reportHtml }) });
        $('savedNote').innerHTML = `Saved on the lab: <a href="${ROOT}${esc(saved.path)}report.html">report</a> (${esc(saved.path)}).`;
        $('goStatus').textContent = 'Corrections saved and scored.';
        const all = a.all.charAccuracy;
        say(all >= 0.98 ? `${pct(all)} of characters right. Clean read. The lamp stays on for the next one.`
            : all >= 0.9 ? `${pct(all)} of characters right. The letters that fooled me are in the notebook. They won't work twice.`
            : `${pct(all)} of characters right. Rough night. Those fonts owe me an apology; the notebook has the details.`);
        await Promise.all([loadSamples(), loadRuns()]);
    } catch (e) {
        $('goStatus').textContent = `Failed: ${e.message}`;
    } finally {
        $('goBtn').disabled = false;
    }
}

async function loadRuns() {
    const { runs } = await api('runs');
    const tb = $('runsTable').querySelector('tbody');
    tb.replaceChildren(...runs.map(r => { const tr = document.createElement('tr'); const s = r.summary || {};
        tr.innerHTML = `<td>${esc(r.when.replace(/T(\d\d)-(\d\d)-\d\dZ/, ' $1:$2'))}</td><td><code>${esc(r.build)}</code></td><td>${s.samples ?? ''}</td><td>${s.charAccuracy != null ? pct(s.charAccuracy) : ''}</td><td>${s.linesTotal ? `${s.linesExact}/${s.linesTotal}` : ''}</td><td>${s.edgesTried ? `${s.edgesRight}/${s.edgesTried}` : '–'}</td><td><a href="${ROOT}bench/data/runs/${esc(r.build)}/${esc(r.when)}/report.html">report</a></td>`; return tr; }));
}

// ---- Boot ----------------------------------------------------------------------------------------------------------
if (typeof document !== 'undefined' && $('buildSelect')) {
    document.querySelectorAll('input[type=file][data-set]').forEach(inp => inp.addEventListener('change', () => upload(inp.dataset.set, Array.from(inp.files)).catch(e => { $('runStatus').textContent = `Upload failed: ${e.message}`; }).finally(() => { inp.value = ''; })));
    $('runBtn').addEventListener('click', () => runAll().catch(e => { $('runStatus').textContent = `Run failed: ${e.message}`; $('runBtn').disabled = false; $('stopBtn').disabled = true; }));
    $('stopBtn').addEventListener('click', () => { state.stop = true; $('stopBtn').disabled = true; });
    $('goBtn').addEventListener('click', go);
    Promise.all([loadBuilds(), loadSamples(), loadRuns()]).catch(e => { $('runStatus').textContent = `The bench service is not answering: ${e.message}`; say("The archive isn't answering. Nothing to read until the lab's file service is back."); });
}
