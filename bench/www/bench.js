/**
 * vCGE lab: OCR test bench (Glyph, MOD04). Lab only; never part of the app.
 *
 * Runs ONE published build's own code over the sample library, in this browser: MOD03 cardFinder.js (edges) and
 * perspective.js (the crop), MOD04 ocrWorker.js (pre-processing + bundled Tesseract.js + second guesses + icons) and
 * MOD05 formMapper.js (lines to fields), imported by URL from /v/<build>/src/... so nothing is copied or re-implemented.
 * The reading happens on this device; the lab server only stores samples, truth and reports (bench/api, see
 * vcge-bench-api.py). Switching builds reloads the page, because a build's modules can only be loaded once.
 * The page is Glyph's "Reading Room": Glyph comments on the run in #glyphSays (dry, honest, never in the way).
 */
import { keysForSet, versionRow, setScorecard, scorecardMd, MIN_TRUSTED } from './setrun.js';

const ROOT = typeof location === 'undefined' ? '/' : location.pathname.replace(/bench\/.*$/, '');   // the lab root, e.g. "/"
const API = `${ROOT}bench/api/`;
const FUNHOUSE = `${ROOT}funhouse/api/`;   // the Funhouse's variant sets (Run a set)
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

// ---- One answer key for many photos of the same card (raven575, 2026-11-04) ------------------------------------
// A photo uploaded with a card name is stored as "<card>__<photo>"; every photo of that card shares one answer key,
// saved as the truth of "<card>__card". Each photo still keeps its own edges answer and gets its own score.

/** The card a photo belongs to ("card-07" for "card-07__IMG_1.jpg"), or null for a photo on its own. */
export function cardOf(name) {
    const m = /^([A-Za-z0-9-]{1,40})__(?!card$)./.exec(name || '');
    return m ? m[1] : null;
}
/** The name the card's shared answer key is saved under. */
export function cardKeyName(card) { return `${card}__card`; }
/** A card name as typed, made safe for a file name: letters, digits and dashes ("Card 7!" -> "Card-7"), or ''. */
export function cleanCardName(text) {
    return String(text || '').trim().replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
/** The file name a photo is stored under: "<card>__<photo>" when it has a card name, else the photo's own name. */
export function uploadName(card, fileName) {
    const c = cleanCardName(card);
    return c && !cardOf(fileName) ? `${c}__${fileName}` : fileName;
}
/**
 * The truth a photo is scored against: its card's shared lines when it has a card and that key has lines, else its own
 * saved truth. The edges answer always stays the photo's own.
 */
export function mergeTruth(own, key) {
    if (!key || !Array.isArray(key.lines)) return own && own.lines ? own : null;
    return { ...(own || {}), lines: key.lines, sharedFrom: key.card || true };
}
/**
 * At Go, the lines that become a card's key: the first photo of that card whose lines were edited since they were
 * shown (boxes: [{ card, lines, shown }]), else the first photo of it. One entry per card: { card: lines }.
 */
export function pickCardKeys(boxes) {
    const out = {};
    for (const b of boxes) {
        if (!b.card) continue;
        const edited = JSON.stringify(b.lines) !== JSON.stringify(b.shown);
        if (!(b.card in out) || (edited && !out[b.card].edited)) out[b.card] = { lines: b.lines, edited };
    }
    return Object.fromEntries(Object.entries(out).map(([c, v]) => [c, v.lines]));
}
/** Per card, from the scores: photos, average, best and worst photo, and the fields that slipped most. */
export function cardSummary(scores) {
    const by = {};
    for (const s of scores) {
        const name = s.sample.split('/').pop(), card = cardOf(name);
        if (!card) continue;
        (by[card] = by[card] || []).push({ ...s, photo: name.slice(card.length + 2) });
    }
    return Object.entries(by).map(([card, list]) => {
        const read = list.filter(s => s.outcome === 'read');
        const sorted = read.slice().sort((a, b) => b.charAccuracy - a.charAccuracy);
        const slips = {};
        for (const s of read) for (const d of s.diffs) if (d.ops.some(o => o.op !== 'eq') || d.roleRead !== d.roleTruth) slips[d.roleTruth || 'other'] = (slips[d.roleTruth || 'other'] || 0) + 1;
        for (const s of read) if (s.linesMissed) slips['missed lines'] = (slips['missed lines'] || 0) + s.linesMissed;
        return { card, photos: list.length, failed: list.length - read.length,
            average: read.length ? read.reduce((n, s) => n + s.charAccuracy, 0) / read.length : 0,
            best: sorted[0] ? { photo: sorted[0].photo, acc: sorted[0].charAccuracy } : null,
            worst: sorted.length ? { photo: sorted[sorted.length - 1].photo, acc: sorted[sorted.length - 1].charAccuracy } : null,
            slips: Object.entries(slips).sort((a, b) => b[1] - a[1]).slice(0, 4) };
    }).sort((a, b) => a.card.localeCompare(b.card));
}
/** A photo's truth: its own, with its card's shared lines when it has a card. */
async function truthFor(set, name) {
    const get = (n) => api(`truth?set=${encodeURIComponent(set)}&name=${encodeURIComponent(n)}`).catch(() => null);
    const own = await get(name), card = cardOf(name);
    const key = card ? await get(cardKeyName(card)) : null;
    return mergeTruth(own, key && key.lines ? { ...key, card } : null);
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
        if (!rows.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Empty. Glyph is polishing their goggles.'; $(listId).append(li); }
    };
    fill('listCards', 'countCards', 'business-cards');
    fill('listHand', 'countHand', 'handwriting');
    if (!(sets['business-cards'] || []).length && !(sets.handwriting || []).length) say("The in-tray is empty. I'll wait. I'm good at waiting.");
}

async function upload(set, files) {
    for (const file of files) {
        $('runStatus').textContent = `Uploading ${file.name}…`;
        const card = set === 'business-cards' ? ($('cardName') || {}).value : '';
        await api(`upload?set=${encodeURIComponent(set)}&name=${encodeURIComponent(uploadName(card, file.name))}`, { method: 'PUT', body: file });
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

/** A small JPEG of what was read, for the set run's worst versions (a full-size PNG per version would fill memory). */
function thumbOf(canvas) {
    const scale = Math.min(1, 480 / Math.max(canvas.width, canvas.height));
    const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(canvas.width * scale)); t.height = Math.max(1, Math.round(canvas.height * scale));
    t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.7);
}

/**
 * Edges, crop, read, map: one sample through the build's code. Returns a result record (never throws).
 * opts.url reads another photo (a Funhouse version); opts.quad crops at known corners instead of finding edges (the
 * set run's "perfect crop"); opts.statusId names the status line to update; opts.thumb keeps a small JPEG of the crop instead of the full-size PNG.
 */
async function runSample(set, name, snap, opts = {}) {
    const { finder, persp, ocr, mapper } = state.modules;
    const r = { set, name, url: opts.url || `${API}photo?set=${encodeURIComponent(set)}&name=${encodeURIComponent(name)}`, quad: null, cropUrl: null, outcome: 'read', error: null, ms: {}, confidence: null, lines: [], fields: null, width: 0, height: 0 };
    let t = performance.now();
    try {
        const img = await loadImage(r.url);
        r.width = img.naturalWidth; r.height = img.naturalHeight;
        // Whole photo as a data URL (what the app reads when no corner is moved)
        const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
        full.getContext('2d').drawImage(img, 0, 0);
        let shown = full;
        if (opts.quad) {
            r.quad = opts.quad.map(p => ({ x: p.x, y: p.y }));
            r.ms.edges = 0;
        } else if (snap) {
            const scale = Math.min(1, FINDER_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
            const small = document.createElement('canvas'); small.width = Math.max(1, Math.round(img.naturalWidth * scale)); small.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const sctx = small.getContext('2d'); sctx.drawImage(img, 0, 0, small.width, small.height);
            const quad = finder.findCardQuad(sctx.getImageData(0, 0, small.width, small.height));
            r.ms.edges = Math.round(performance.now() - t);
            if (quad) r.quad = quad.map(p => ({ x: p.x / scale, y: p.y / scale }));
        }
        if (r.quad) {
            const { width, height } = persp.quadOutputSize(r.quad);
            const flat = persp.warpPerspective(full.getContext('2d').getImageData(0, 0, full.width, full.height), r.quad, width, height);
            const out = document.createElement('canvas'); out.width = width; out.height = height;
            out.getContext('2d').putImageData(new ImageData(flat.data, width, height), 0, 0);
            shown = out;
        }
        const source = shown.toDataURL('image/png');
        r.cropUrl = opts.thumb ? thumbOf(shown) : source;
        t = performance.now();
        const read = await ocr.executeOCRScan(source, { onStatus: s => { $(opts.statusId || 'runStatus').textContent = `${name}: ${s === 'starting' ? 'preparing the reader' : 'reading'}…`; } });
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
        const truth = await truthFor(set, name);
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
    const card = cardOf(r.name);
    const rh = document.createElement('h3');
    rh.textContent = truth && truth.sharedFrom ? `Answer key for card ${card} (shared by all its photos; edit if wrong)`
        : truth ? 'Truth (saved earlier; edit if wrong)' : card ? `Correct what it got wrong (becomes the key for every photo of card ${card})` : 'Correct what it got wrong';
    const lines = document.createElement('div');
    const base = truth && truth.lines ? truth.lines : r.lines.map(l => ({ text: l.text, role: l.role, drop: false }));
    base.forEach((l, i) => lines.append(truthLineRow(l, (r.lines[i] || {}).text ?? '')));
    const add = document.createElement('button'); add.className = 'add'; add.textContent = '+ missed line';
    add.addEventListener('click', () => lines.append(truthLineRow({ text: '', role: 'notes', drop: false }, null)));
    const score = document.createElement('div'); score.className = 'score';
    right.append(rh, lines, add, score);
    box.append(left, mid, right);
    box.card = card;
    box.shownLines = () => base.map(l => ({ text: (l.text || '').trim(), role: l.role, drop: !!l.drop })).filter(l => l.text || l.drop);
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

/** The same card from every angle: one row per card. */
export function cardsHtml(cards) {
    if (!cards.length) return '';
    const rows = cards.map(c => `<tr><td>${esc(c.card)}</td><td>${c.photos}</td><td>${pct(c.average)}</td><td>${c.best ? `${esc(c.best.photo)} (${pct(c.best.acc)})` : '–'}</td><td>${c.worst ? `${esc(c.worst.photo)} (${pct(c.worst.acc)})` : '–'}</td><td>${c.slips.map(([f, n]) => `${esc(f)} ×${n}`).join(', ') || 'none'}</td><td>${c.failed}</td></tr>`).join('');
    return `<h3>Same card, every angle</h3><table><thead><tr><th>Card</th><th>Photos</th><th>Average</th><th>Best photo</th><th>Weakest photo</th><th>Fields that slipped</th><th>Failed reads</th></tr></thead><tbody>${rows}</tbody></table>`;
}
export function cardsMd(cards) {
    if (!cards.length) return '';
    return ['Same card, every angle:', ...cards.map(c => `- ${c.card}: ${c.photos} photos, average ${pct(c.average)}${c.best ? `, best ${c.best.photo} ${pct(c.best.acc)}` : ''}${c.worst ? `, weakest ${c.worst.photo} ${pct(c.worst.acc)}` : ''}${c.slips.length ? `, slipped: ${c.slips.map(([f, n]) => `${f} x${n}`).join(', ')}` : ''}${c.failed ? `, failed reads ${c.failed}` : ''}`)].join('\n');
}

function summaryHtml(a, build) {
    const row = (label, t) => t.n ? `<tr><td>${label}</td><td>${t.n}</td><td>${pct(t.charAccuracy)}</td><td>${t.linesExact}/${t.linesTotal}</td><td>${t.linesMissed}</td><td>${t.linesInvented}</td><td>${t.linesWrongRole}</td><td>${t.flagsRight} / ${t.flagsFalse} / ${t.flagsMissed}</td><td>${t.edgesTried ? `${t.edgesRight}/${t.edgesTried}` : '–'}</td><td>${t.failed}</td></tr>` : '';
    // Each confusion as it shows on Glyph's wrist scanner: what was read, a "?", what it should have been
    const top = a.all.top.length ? `<p><b>Letters that fooled me (read → truth):</b></p><div class="confusions">${a.all.top.map(([k, n]) => { const [from, to] = k.split(' → '); return `<span class="confusion" title="${esc(k)}">${esc(from)} <span class="q">?</span> ${esc(to)} <span class="n">×${n}</span></span>`; }).join('')}</div>` : '<p>No character confusions. Not one.</p>';
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
        // Photos of the same card share one key: the photo you edited sets it, and every photo of that card is scored on it
        const keys = pickCardKeys(boxes.map(b => ({ card: b.card, lines: b.getTruth().lines, shown: b.shownLines() })));
        for (const [card, lines] of Object.entries(keys)) {
            await api(`truth?set=business-cards&name=${encodeURIComponent(cardKeyName(card))}`, { method: 'PUT', body: JSON.stringify({ lines, card, build: state.build.short }) });
        }
        for (const box of boxes) {
            const r = state.results[Number(box.dataset.index)], own = box.getTruth();
            const truth = box.card && keys[box.card] ? { ...own, lines: keys[box.card] } : own;
            // A photo of a card keeps only its edges answer; its lines live in the card's key
            const saved = box.card ? { edgesOk: own.edgesOk, hadQuad: own.hadQuad } : truth;
            await api(`truth?set=${encodeURIComponent(r.set)}&name=${encodeURIComponent(r.name)}`, { method: 'PUT', body: JSON.stringify({ ...saved, build: state.build.short }) });
            const s = scoreSample(r, truth); scores.push(s); box.showScore(s);
        }
        const a = analyse(scores);
        $('summary').innerHTML = summaryHtml(a, state.build) + cardsHtml(cardSummary(scores));
        const md = [summaryMd(a, state.build, scores), cardsMd(cardSummary(scores))].filter(Boolean).join('\n'); $('summaryMd').value = md;
        $('analysis').classList.remove('hidden');
        const reportHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>vCGE OCR bench ${esc(state.build.short)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#14181f}table{border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e6ea}del{background:#fde2e1;text-decoration:none}ins{background:#dcf5e4;text-decoration:none}.diff{font-family:monospace}</style></head><body><h1>OCR bench report</h1>${summaryHtml(a, state.build)}${cardsHtml(cardSummary(scores))}<h2>Samples</h2>${scores.map(s => `<h3>${esc(s.sample)}</h3>${scoreHtml(s)}`).join('')}<pre>${esc(md)}</pre></body></html>`;
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
        const isSet = s.kind === 'set';
        const tick = isSet ? `<input type="checkbox" class="cmp" aria-label="compare" value="${esc(JSON.stringify({ build: r.build, when: r.when, set: s.set }))}">` : '';
        tr.innerHTML = `<td>${tick}</td><td>${esc(r.when.replace(/T(\d\d)-(\d\d)-\d\dZ/, ' $1:$2'))}</td><td><code>${esc(r.build)}</code></td><td>${isSet ? `${esc(s.set)}${s.mode === 'perfect' ? ' (perfect crop)' : ''}` : '–'}</td><td>${s.samples ?? ''}</td><td>${s.charAccuracy != null ? pct(s.charAccuracy) : ''}</td><td>${s.linesTotal ? `${s.linesExact}/${s.linesTotal}` : ''}</td><td>${s.edgesTried ? `${s.edgesRight}/${s.edgesTried}` : '–'}</td><td><a href="${ROOT}bench/data/runs/${esc(r.build)}/${esc(r.when)}/report.html">report</a></td>`; return tr; }));
    tb.querySelectorAll('input.cmp').forEach(x => x.addEventListener('change', onCompareTick)); onCompareTick();
}

// ---- Run a set: every version of a Funhouse set, scored by effect ----------------------------------------------

async function funhouse(path) {
    const r = await fetch(FUNHOUSE + path, { cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `${path}: HTTP ${r.status}`);
    return body;
}

/** Lists the Funhouse's finished sets; the panel stays hidden when the Funhouse isn't there. */
async function loadSets() {
    let sets;
    try { ({ sets } = await funhouse('sets')); } catch { return; }
    const ready = (sets || []).filter(x => x.status === 'ready' || x.done === x.total);
    $('setSelect').replaceChildren(...ready.map(x => new Option(`${x.name}  (${x.done ?? x.total} versions)`, x.name)));
    if (!ready.length) $('setStatus').textContent = 'No finished sets yet. Make one in the Funhouse first.';
    $('setRunBtn').disabled = !ready.length || $('runBtn').disabled;
    $('setPanel').classList.remove('hidden');
}

const fieldMark = (v) => (v == null ? '<span class="na">–</span>' : v ? '<span class="yes">✓</span>' : '<span class="no">✗</span>');

/** The effects one version used, in words: "warp, background: wood, glare". */
function effectWords(effects) {
    return Object.entries(effects || {}).filter(([k]) => k !== 'size').map(([k, v]) => (k === 'background' ? `background: ${v.kind}` : k)).join(', ') || 'clean';
}

function versionHtml(key, row, r) {
    const v = row.values;
    const outcome = r.outcome === 'read' ? `${Math.round(v.chars * 100)}%` : `<span class="bad">${esc(r.outcome)}</span>`;
    return `<td>#${row.n}</td><td>${esc(key.source)}</td><td class="fx">${esc(effectWords(row.effects))}</td><td>${outcome}</td><td>${fieldMark(v.name)}</td><td>${fieldMark(v.phone)}</td><td>${fieldMark(v.email)}</td>`;
}

function scorecardHtml(card) {
    const p = (x) => (x == null ? '–' : pct(x));
    const tr = (g) => `<tr class="${g.trusted === false ? 'few' : ''}"><td>${esc(g.label)}</td><td>${g.n}</td><td>${p(g.mean.chars)}</td><td>${p(g.mean.name)}</td><td>${p(g.mean.phone)}</td><td>${p(g.mean.email)}</td><td>${p(g.mean.turnedDown)}</td></tr>`;
    return `<table class="card"><thead><tr><th>Group</th><th>Versions</th><th>Characters right</th><th>Name right</th><th>Phone right</th><th>Email right</th><th>Couldn't read</th></tr></thead><tbody>${tr({ ...card.all, label: 'every version', trusted: true })}${card.groups.map(tr).join('')}</tbody></table>`
        + `<p class="note">Worst groups first. Greyed groups have fewer than ${MIN_TRUSTED} versions: too few to trust yet.</p>`;
}

async function runSet() {
    const name = $('setSelect').value, mode = $('setMode').value;
    if (!name) return;
    $('setRunBtn').disabled = true; $('runBtn').disabled = true; $('setStopBtn').disabled = false; state.stop = false;
    $('setProgress').classList.remove('hidden'); $('setProgressFill').style.width = '0';
    $('setResults').classList.add('hidden'); $('setSaved').textContent = ''; $('setMd').value = ''; $('setCard').replaceChildren();
    $('setRows').querySelector('tbody').replaceChildren(); $('setStatus').textContent = 'Starting…';
    const done = () => { $('setRunBtn').disabled = false; $('runBtn').disabled = false; $('setStopBtn').disabled = true; };
    try {
        await loadModules();
    } catch (e) {
        say("I couldn't open this build's reader. Pick another build and I'll try that one.");
        $('setStatus').textContent = `Could not load the build's modules: ${e.message}`; done(); return;
    }
    const set = await funhouse(`set?name=${encodeURIComponent(name)}`);
    // Each source card's answer key is its saved Reading Room truth, found by its Shelf name
    const truthByName = {};
    for (const src of set.sources || []) {
        const got = await truthFor('business-cards', src.name);
        if (got && got.lines) truthByName[src.name] = got;
    }
    const keys = keysForSet(set, truthByName), todo = keys.filter(k => k.truth);
    const noKey = [...new Set(keys.filter(k => !k.truth).map(k => k.source || 'an unknown photo'))];
    say(todo.length ? `Funhouse night. ${plural(todo.length, 'version')} of ${plural(Object.keys(truthByName).length, 'card')} I already know by heart. Let's see what the mirrors do to me.`
        : "None of this set's cards have a saved answer key. Read them once in the in-tray above, press Go, then come back.");
    const rows = [], scores = [], results = [];
    for (let i = 0; i < todo.length && !state.stop; i++) {
        const { version: v, source, truth } = todo[i];
        $('setStatus').textContent = `Version ${i + 1} of ${todo.length}…`;
        const r = await runSample('funhouse', `${name} #${v.n}`, mode === 'app', { url: `${FUNHOUSE}image?set=${encodeURIComponent(name)}&n=${v.n}`, quad: mode === 'perfect' ? v.corners : null, thumb: true, statusId: 'setStatus' });
        const score = scoreSample(r, { ...truth, edgesOk: null, hadQuad: !!r.quad });
        const row = versionRow(v, score, truth);
        rows.push(row); results.push(r);
        const { diffs, confusions: _, ...slim } = score;   // the saved run keeps numbers, not what the card says
        scores.push({ ...slim, n: v.n, source, sample: `${name}/${v.file}` });
        const tr = document.createElement('tr'); tr.innerHTML = versionHtml(todo[i], row, r); $('setRows').querySelector('tbody').append(tr);
        $('setProgressFill').style.width = `${Math.round(((i + 1) / todo.length) * 100)}%`;
    }
    const stopped = state.stop;
    if (!rows.length) { $('setStatus').textContent = noKey.length ? `Nothing scored: no answer key for ${noKey.join(', ')}.` : 'Nothing scored.'; done(); return; }
    const card = setScorecard(rows, set.settings);
    const info = { set: name, build: state.build.short, mode, scored: rows.length, total: keys.length };
    const md = scorecardMd(card, info) + (noKey.length ? `\nSkipped (no answer key yet): ${keys.length - todo.length} versions` : '') + (stopped ? '\nStopped early.' : '');
    $('setCard').innerHTML = scorecardHtml(card); $('setMd').value = md; $('setResults').classList.remove('hidden');
    $('setStatus').textContent = `${stopped ? 'Stopped' : 'Done'}: ${rows.length} of ${keys.length} versions scored${noKey.length ? `, ${keys.length - todo.length} skipped (no answer key for ${noKey.join(', ')})` : ''}.`;
    // Only the ten worst versions keep a picture of what was read
    const worst = rows.map((row, i) => ({ row, r: results[i] })).sort((a, b) => a.row.values.chars - b.row.values.chars).slice(0, 10);
    const reportHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>vCGE set run ${esc(name)} ${esc(state.build.short)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#14181f}table{border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e6ea}tr.few td{color:#8a929c}figure{display:inline-block;margin:8px}img{max-width:320px;border:1px solid #e3e6ea}</style></head><body><h1>Reading Room set run</h1><p>Set <b>${esc(name)}</b> (seed ${esc(set.seed)}), build <code>${esc(state.build.short)}</code>, ${mode === 'perfect' ? 'perfect crop' : 'as the app does it'}.</p>${scorecardHtml(card)}<h2>The ten worst versions</h2>${worst.map(w => `<figure><img src="${w.r.cropUrl}" alt=""><figcaption>#${w.row.n}: ${pct(w.row.values.chars)}, ${esc(effectWords(w.row.effects))}</figcaption></figure>`).join('')}<pre>${esc(md)}</pre></body></html>`;
    const turnedDown = rows.filter(x => x.values.turnedDown).length;
    const summary = { kind: 'set', set: name, seed: set.seed, mode, samples: rows.length, total: keys.length, charAccuracy: card.all.mean.chars, linesExact: scores.reduce((n, x) => n + x.linesExact, 0), linesTotal: scores.reduce((n, x) => n + x.linesTotal, 0), failed: turnedDown };
    try {
        const saved = await api('runs', { method: 'POST', body: JSON.stringify({ build: state.build.short, subject: state.build.subject, when: new Date().toISOString(), kind: 'set', set: name, seed: set.seed, mode, scores, rows, scorecard: card, summary, summaryMd: md, reportHtml }) });
        $('setSaved').innerHTML = `Saved on the lab: <a href="${ROOT}${esc(saved.path)}report.html">report</a> (${esc(saved.path)}).`;
        await loadRuns();
    } catch (e) {
        $('setSaved').textContent = `Not saved: ${e.message}`;
    }
    const all = card.all.mean.chars, worstGroup = card.groups.find(g => g.trusted);
    say(stopped ? "Stopped. The versions I did read are scored below."
        : `${pct(all)} of characters right across the set.${worstGroup ? ` ${worstGroup.label} hurt the most.` : ` No group has ${MIN_TRUSTED} versions yet, so I won't blame any one mirror.`}`);
    done();
}

// ---- Compare two set runs ------------------------------------------------------------------------------------------

/** Two runs' scorecards side by side, by group: characters right in each and the change. */
export function compareCards(a, b) {
    const byKey = new Map(b.groups.map(g => [g.key, g]));
    const rows = [{ label: 'every version', a: a.all, b: b.all }, ...a.groups.map(g => ({ label: g.label, a: g, b: byKey.get(g.key) || null }))];
    for (const g of b.groups) if (!a.groups.some(x => x.key === g.key)) rows.push({ label: g.label, a: null, b: g });
    return rows.map(r => ({ label: r.label, nA: r.a ? r.a.n : 0, nB: r.b ? r.b.n : 0, charsA: r.a ? r.a.mean.chars : null, charsB: r.b ? r.b.mean.chars : null,
        change: r.a && r.b && r.a.mean.chars != null && r.b.mean.chars != null ? r.b.mean.chars - r.a.mean.chars : null }));
}

async function compareRuns() {
    const ticked = Array.from(document.querySelectorAll('#runsTable input.cmp:checked')).map(x => JSON.parse(x.value));
    if (ticked.length !== 2) return;
    const [a, b] = ticked.sort((x, y) => x.when.localeCompare(y.when));
    const get = async (r) => { const res = await fetch(`${ROOT}bench/data/runs/${encodeURIComponent(r.build)}/${encodeURIComponent(r.when)}/scorecard.json`, { cache: 'no-store' }); if (!res.ok) throw new Error(`scorecard for ${r.build} not found`); return res.json(); };
    try {
        const rows = compareCards(await get(a), await get(b));
        const p = (x) => (x == null ? '–' : pct(x));
        const ch = (x) => (x == null ? '–' : `<span class="${x > 0.005 ? 'up' : x < -0.005 ? 'down' : ''}">${x > 0 ? '+' : ''}${Math.round(x * 100)}</span>`);
        $('compare').innerHTML = `<h3>Set ${esc(a.set)}: <code>${esc(a.build)}</code> then <code>${esc(b.build)}</code></h3><table class="card"><thead><tr><th>Group</th><th>Versions</th><th>${esc(a.build)} characters right</th><th>${esc(b.build)} characters right</th><th>Change (points)</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.nA || r.nB}</td><td>${p(r.charsA)}</td><td>${p(r.charsB)}</td><td>${ch(r.change)}</td></tr>`).join('')}</tbody></table>`;
        $('compare').classList.remove('hidden');
    } catch (e) {
        $('compare').textContent = `Could not compare: ${e.message}`; $('compare').classList.remove('hidden');
    }
}

function onCompareTick() {
    const ticked = Array.from(document.querySelectorAll('#runsTable input.cmp:checked')).map(x => JSON.parse(x.value));
    const sameSet = ticked.length === 2 && ticked[0].set === ticked[1].set;
    $('compareBtn').disabled = !sameSet;
    $('compareNote').textContent = ticked.length === 2 && !sameSet ? 'Pick two runs of the same set.' : '';
}

// ---- Boot ----------------------------------------------------------------------------------------------------------
if (typeof document !== 'undefined' && $('buildSelect')) {
    document.querySelectorAll('input[type=file][data-set]').forEach(inp => inp.addEventListener('change', () => upload(inp.dataset.set, Array.from(inp.files)).catch(e => { $('runStatus').textContent = `Upload failed: ${e.message}`; }).finally(() => { inp.value = ''; })));
    $('runBtn').addEventListener('click', () => runAll().catch(e => { $('runStatus').textContent = `Run failed: ${e.message}`; $('runBtn').disabled = false; $('stopBtn').disabled = true; }));
    $('stopBtn').addEventListener('click', () => { state.stop = true; $('stopBtn').disabled = true; });
    $('goBtn').addEventListener('click', go);
    $('setRunBtn').addEventListener('click', () => runSet().catch(e => { $('setStatus').textContent = `Set run failed: ${e.message}`; $('setRunBtn').disabled = false; $('runBtn').disabled = false; $('setStopBtn').disabled = true; }));
    $('setStopBtn').addEventListener('click', () => { state.stop = true; $('setStopBtn').disabled = true; });
    $('compareBtn').addEventListener('click', compareRuns);
    Promise.all([loadBuilds(), loadSamples(), loadRuns()]).then(loadSets).catch(e => { $('runStatus').textContent = `The bench service is not answering: ${e.message}`; say("The archive isn't answering. Nothing to read until the lab's file service is back."); });
}
