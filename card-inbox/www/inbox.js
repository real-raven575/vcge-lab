/**
 * vCGE lab: the Card Inbox (🐘 Cornerstone, HQ). Lab only; never part of the app.
 *
 * One card, many angles. A zip, loose photos or a short clip goes in; every angle lands on the Card Shelf (ticked for
 * the Reading Room, the Darkroom and the Paint Shop), then this page runs ONE published build's own code on each angle
 * in this browser: MOD03 cardFinder.js + perspective.js (edges and crop), MOD04 ocrWorker.js (reading), MOD05
 * formMapper.js (lines to fields), and the Paint Shop's logoFinder.js (is there a logo). The right answers are typed
 * once per card and saved here and as the Reading Room's shared key "<card>__card", so both benches agree.
 * A clip's best frames are picked here (sharp, little glare) with the same kind of code the app would use, and sent back
 * as photos. "All angles voted" keeps the lines most angles agree on: the test of many angles against one good photo.
 */
import { scoreSample } from '../bench/bench.js';

const ROOT = typeof location === 'undefined' ? '/' : location.pathname.replace(/inbox\/.*$/, '');
const API = `${ROOT}inbox/api/`;
const SHELF = `${ROOT}shelf/api/`;
const BENCH = `${ROOT}bench/api/`;
const FINDER_MAX_SIDE = 1200;          // same as MOD03 cropEditor.js
const FRAMES_KEPT = 8;                 // a clip's best frames kept as photos
const FRAME_STEP = 0.1;                // seconds between frames looked at (10 a second)
const FRAME_GAP = 0.25;                // kept frames at least this far apart, so they differ
const SCORE_SIDE = 640;                // frames are scored on a copy this size
const FALLBACK_ROLES = [['name', 'Name'], ['jobTitle', 'Job title'], ['organization', 'Company'], ['phone', 'Phone'], ['phoneMobile', 'Mobile phone'],
    ['phoneFax', 'Fax'], ['email', 'Email'], ['website', 'Website / social'], ['street', 'Street'], ['cityStateZip', 'City / State / ZIP'], ['address', 'Whole address'], ['notes', 'Notes']];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---- Pure helpers (tested in test/inbox.test.mjs) -----------------------------------------------------------------

/** Sharpness of a grey image (Uint8 array, w x h): the variance of the Laplacian. Blurry frames score low. */
export function sharpness(grey, w, h) {
    let sum = 0, sq = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const v = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - w] - grey[i + w];
        sum += v; sq += v * v; n++;
    }
    if (!n) return 0;
    const mean = sum / n;
    return sq / n - mean * mean;
}

/** Share of blown-out pixels (glare): grey at or above 250. */
export function glareShare(grey) {
    let n = 0;
    for (let i = 0; i < grey.length; i++) if (grey[i] >= 250) n++;
    return grey.length ? n / grey.length : 0;
}

/** RGBA pixels to grey (Rec. 601 weights). */
export function toGrey(rgba) {
    const g = new Uint8Array(rgba.length / 4);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    return g;
}

/** One frame's score: sharp is good, glare costs (a frame with a quarter blown out scores zero). */
export function frameScore(sharp, glare) { return sharp * Math.max(0, 1 - 4 * glare); }

/** The best n frames ({t, score}), at least gap seconds apart, returned in time order. */
export function pickFrames(frames, n = FRAMES_KEPT, gap = FRAME_GAP) {
    const kept = [];
    for (const f of [...frames].sort((a, b) => b.score - a.score)) {
        if (kept.length >= n) break;
        if (f.score > 0 && kept.every(k => Math.abs(k.t - f.t) >= gap)) kept.push(f);
    }
    return kept.sort((a, b) => a.t - b.t);
}

/**
 * All angles voted: the lines that more than half of the angles that were read agree on (same text, ignoring case and
 * spacing). Each kept line takes its most common spelling and role. reads = [[{text, role}, ...], ...] per angle.
 */
export function voteLines(reads) {
    const read = reads.filter(r => Array.isArray(r) && r.length);
    if (!read.length) return [];
    const groups = new Map();
    read.forEach((lines, angle) => {
        const seen = new Set();
        for (const l of lines) {
            const key = norm(l.text).toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            if (!groups.has(key)) groups.set(key, { angles: 0, texts: new Map(), roles: new Map(), first: angle * 1000 + lines.indexOf(l) });
            const g = groups.get(key);
            g.angles++;
            g.texts.set(norm(l.text), (g.texts.get(norm(l.text)) || 0) + 1);
            g.roles.set(l.role, (g.roles.get(l.role) || 0) + 1);
        }
    });
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return [...groups.values()].filter(g => g.angles * 2 > read.length).sort((a, b) => a.first - b.first)
        .map(g => ({ text: top(g.texts), role: top(g.roles), votes: g.angles, of: read.length }));
}

/** Best and weakest angle, and the average, from [{name, chars}] (chars null when not scored). */
export function angleSummary(scored) {
    const s = scored.filter(x => x.chars != null);
    if (!s.length) return null;
    const sorted = [...s].sort((a, b) => b.chars - a.chars);
    return { n: s.length, average: s.reduce((t, x) => t + x.chars, 0) / s.length, best: sorted[0], weakest: sorted[sorted.length - 1] };
}

// ---- Page state and service calls ---------------------------------------------------------------------------------

const state = { builds: [], build: null, modules: null, card: null, running: false, stop: false, roles: FALLBACK_ROLES };

async function call(url, options) {
    const r = await fetch(url, { cache: 'no-store', ...options });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}
const api = (path, options) => call(API + path, options);
const putJson = (url, obj) => call(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

function status(text) { $('status').textContent = text; }

async function loadBuilds() {
    const { builds, latest } = await call(`${BENCH}builds`);
    state.builds = builds.filter(b => b.source);
    const wanted = new URLSearchParams(location.search).get('build') || latest;
    const sel = $('inboxBuild');
    sel.replaceChildren(...state.builds.map(b => new Option(`${b.short}  ${b.subject.slice(0, 60)}`, b.short, false, b.short === wanted)));
    state.build = state.builds.find(b => b.short === sel.value) || state.builds[0] || null;
    sel.addEventListener('change', () => { const q = new URLSearchParams(location.search); q.set('build', sel.value); location.search = q; });
    $('inboxBuildNote').textContent = state.build ? `${state.build.date.slice(0, 16).replace('T', ' ')} UTC` : 'No build with published source yet.';
}

async function loadCards() {
    const { cards } = await api('cards');
    const list = $('cardList');
    if (!cards.length) { list.innerHTML = '<li class="empty">No cards yet. Drop a zip, photos or a clip above.</li>'; return; }
    const open = state.card && state.card.id;
    list.innerHTML = cards.map(c => {
        const mark = c.photos && c.done >= c.photos ? '✓' : c.done ? '✱' : '○';
        return `<li><button class="cardpick${c.id === open ? ' on' : ''}" data-id="${esc(c.id)}"><span class="mark">${mark}</span><b>${esc(c.name)}</b>`
            + `<span class="sub">${c.photos} angle${c.photos === 1 ? '' : 's'}${c.clips ? `, ${c.clips} clip${c.clips === 1 ? '' : 's'}` : ''}, ${c.done} run${c.hasTruth ? ', answers saved' : ''}</span></button></li>`;
    }).join('');
    list.querySelectorAll('.cardpick').forEach(b => b.addEventListener('click', () => openCard(b.dataset.id)));
}

// ---- Drop ---------------------------------------------------------------------------------------------------------

async function dropFiles(files) {
    const name = norm($('cardName').value);
    if (!name) { status('Give the card a nickname first (never a real person\'s name).'); $('cardName').focus(); return; }
    if (!files.length) return;
    const card = await api('card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    let n = 0;
    const tally = { photo: 0, clip: 0, same: 0, skipped: 0 };
    for (const f of files) {
        n++;
        status(`Sending ${n} of ${files.length}: ${f.name}`);
        try {
            const got = await call(`${API}upload?id=${encodeURIComponent(card.id)}&name=${encodeURIComponent(f.name)}`, { method: 'PUT', body: f });
            for (const k of Object.keys(tally)) tally[k] += got[k] || 0;
        } catch (e) { status(`${f.name}: ${e.message}`); return; }
    }
    status(`In: ${tally.photo} photo${tally.photo === 1 ? '' : 's'}, ${tally.clip} clip${tally.clip === 1 ? '' : 's'}${tally.same ? `, ${tally.same} already there` : ''}${tally.skipped ? `, ${tally.skipped} other files skipped` : ''}.`);
    await loadCards();
    await openCard(card.id, { autoRun: true });
}

// ---- The build's own pipeline -------------------------------------------------------------------------------------

async function loadModules() {
    if (state.modules) return state.modules;
    if (!state.build) throw new Error('no build with published source');
    const b = `${ROOT}v/${state.build.short}/`;
    const base = document.createElement('base'); base.href = new URL(b, location.href).href; document.head.prepend(base);
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = `${b}src/vendor/tesseract/tesseract.min.js`; s.onload = res; s.onerror = () => rej(new Error('tesseract.min.js not found in this build')); document.head.append(s); });
    const [finder, persp, ocr, mapper, logo] = await Promise.all([
        import(`${b}src/modules/mod03-camera/cardFinder.js`), import(`${b}src/modules/mod03-camera/perspective.js`),
        import(`${b}src/modules/mod04-ocr/ocrWorker.js`), import(`${b}src/modules/mod05-form/formMapper.js`),
        import(`${ROOT}logo-bench/logoFinder.js`).catch(() => null)]);
    if (mapper.LINE_ROLES) state.roles = mapper.LINE_ROLES.filter(([r]) => r !== 'ignore');
    state.modules = { finder, persp, ocr, mapper: new mapper.ContactFormMapper(), logo };
    return state.modules;
}

function loadImage(url) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('photo failed to load')); img.src = url; });
}

/** Edges, crop, read, map, logo: one angle through the build's code. Never throws; returns a result record. */
async function runAngle(photo) {
    const { finder, persp, ocr, mapper, logo } = state.modules;
    const r = { build: state.build.short, edges: false, outcome: 'read', error: null, ms: {}, lines: [], logo: null, confidence: null };
    let t = performance.now();
    try {
        const img = await loadImage(`${SHELF}photo?hash=${photo.hash}`);
        const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
        full.getContext('2d').drawImage(img, 0, 0);
        const scale = Math.min(1, FINDER_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const small = document.createElement('canvas'); small.width = Math.max(1, Math.round(img.naturalWidth * scale)); small.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const sctx = small.getContext('2d'); sctx.drawImage(img, 0, 0, small.width, small.height);
        const quad = finder.findCardQuad(sctx.getImageData(0, 0, small.width, small.height));
        r.ms.edges = Math.round(performance.now() - t);
        let shown = full;
        if (quad) {
            r.edges = true;
            const q = quad.map(p => ({ x: p.x / scale, y: p.y / scale }));
            const { width, height } = persp.quadOutputSize(q);
            const flat = persp.warpPerspective(full.getContext('2d').getImageData(0, 0, full.width, full.height), q, width, height);
            shown = document.createElement('canvas'); shown.width = width; shown.height = height;
            shown.getContext('2d').putImageData(new ImageData(flat.data, width, height), 0, 0);
        }
        t = performance.now();
        const read = await ocr.executeOCRScan(shown.toDataURL('image/png'), { onStatus: () => {} });
        r.ms.read = Math.round(performance.now() - t);
        r.confidence = read.confidence;
        const lines = mapper.classifyLines(read.lines && read.lines.length ? read.lines : read.text);
        mapper.buildFields(lines);
        r.lines = lines.map(l => ({ text: l.text, role: l.role, check: l.check || null }));
        if (logo) {
            const px = shown.getContext('2d').getImageData(0, 0, shown.width, shown.height).data;
            const found = logo.findLogoCandidates(px, shown.width, shown.height, { textBoxes: logo.contactTextBoxes(read.lines || []), max: 1 });
            r.logo = found.length > 0;
        }
    } catch (e) {
        r.outcome = (e && e.code) || 'error';
        r.error = e && e.message ? e.message : String(e);
    }
    return r;
}

async function runCard(again = false) {
    if (state.running || !state.card) return;
    const todo = state.card.photos.filter(p => again || !state.card.results[p.hash] || state.card.results[p.hash].build !== state.build.short);
    if (!todo.length) { status('Every angle has been run with this build. Use Run again to repeat.'); return; }
    state.running = true; state.stop = false;
    $('runBtn').disabled = true; $('againBtn').disabled = true; $('stopBtn').disabled = false;
    try {
        status('Loading the build\'s reader…');
        await loadModules();
        let n = 0;
        for (const p of todo) {
            if (state.stop) { status(`Stopped: ${n} of ${todo.length} run; left: ${todo.length - n}.`); break; }
            status(`Running ${n + 1} of ${todo.length}; left: ${todo.length - n - 1}. ${p.name}`);
            setRowState(p.hash, '✱');
            const r = await runAngle(p);
            await putJson(`${API}result?id=${encodeURIComponent(state.card.id)}&hash=${p.hash}`, r);
            state.card.results[p.hash] = r;
            n++;
            renderAngles();
        }
        if (!state.stop) status(`Done: ${n} of ${todo.length} angles run with ${state.build.short}.`);
    } catch (e) {
        status(`Run failed: ${e.message}`);
    } finally {
        state.running = false;
        $('runBtn').disabled = false; $('againBtn').disabled = false; $('stopBtn').disabled = true;
        loadCards().catch(() => {});
    }
}

// ---- Clips: pick the best frames ----------------------------------------------------------------------------------

function seek(video, t) {
    return new Promise((res, rej) => {
        const done = () => { video.removeEventListener('seeked', done); res(); };
        video.addEventListener('seeked', done);
        video.addEventListener('error', () => rej(new Error('the browser cannot play this clip')), { once: true });
        video.currentTime = t;
    });
}

async function pickFromClip(clip) {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.src = `${API}clip?id=${encodeURIComponent(state.card.id)}&hash=${clip.hash}`;
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('the browser cannot play this clip')); });
    const w = video.videoWidth, h = video.videoHeight;
    const k = Math.min(1, SCORE_SIDE / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const frames = [];
    const total = Math.floor(video.duration / FRAME_STEP);
    for (let i = 0; i <= total; i++) {
        const t = Math.min(video.duration - 0.01, i * FRAME_STEP);
        await seek(video, t);
        ctx.drawImage(video, 0, 0, c.width, c.height);
        const grey = toGrey(ctx.getImageData(0, 0, c.width, c.height).data);
        const sharp = sharpness(grey, c.width, c.height), glare = glareShare(grey);
        frames.push({ t, sharp, glare, score: frameScore(sharp, glare) });
        status(`${clip.name}: looking at frame ${i + 1} of ${total + 1}`);
    }
    const kept = pickFrames(frames);
    const big = document.createElement('canvas'); big.width = w; big.height = h;
    let n = 0;
    for (const f of kept) {
        await seek(video, f.t);
        big.getContext('2d').drawImage(video, 0, 0);
        const blob = await new Promise(res => big.toBlob(res, 'image/jpeg', 0.92));
        const stem = clip.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40);
        const name = `${stem}-${String(Math.round(f.t * 1000)).padStart(5, '0')}ms.jpg`;
        await call(`${API}upload?id=${encodeURIComponent(state.card.id)}&name=${encodeURIComponent(name)}&from=${clip.hash}`, { method: 'PUT', body: blob });
        n++;
        status(`${clip.name}: kept ${n} of ${kept.length} frames`);
    }
    video.removeAttribute('src'); video.load();
    clip.picked = { looked: frames.length, kept: kept.map(f => ({ t: f.t, sharp: Math.round(f.sharp), glare: f.glare })), size: `${w}×${h}` };
    return clip.picked;
}

async function pickAllClips() {
    if (!state.card || !state.card.clips.length) return;
    $('pickBtn').disabled = true;
    try {
        for (const clip of state.card.clips) {
            if (state.card.photos.some(p => p.from === clip.hash)) continue;
            const got = await pickFromClip(clip);
            status(`${clip.name}: looked at ${got.looked} frames (${got.size}), kept the best ${got.kept.length}.`);
        }
        await openCard(state.card.id, { autoRun: true });
    } catch (e) {
        status(`Frame picking failed: ${e.message}`);
    } finally { $('pickBtn').disabled = false; }
}

// ---- One card -----------------------------------------------------------------------------------------------------

function truthOf(card) { return card.truth && card.truth.lines && card.truth.lines.length ? card.truth : null; }

function scoreOf(result) {
    const truth = truthOf(state.card);
    if (!truth || !result || result.outcome !== 'read') return null;
    return scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: result.lines }, { ...truth, edgesOk: true, hadQuad: result.edges });
}

function setRowState(hash, mark) { const el = document.querySelector(`tr[data-hash="${hash}"] .state`); if (el) el.textContent = mark; }

function renderAngles() {
    const card = state.card;
    const yes = (v) => (v == null ? '<span class="na">–</span>' : v ? '<span class="yes">✓</span>' : '<span class="no">✗</span>');
    const rows = card.photos.map(p => {
        const r = card.results[p.hash];
        const s = scoreOf(r);
        const kind = p.kind === 'frame' ? '<span class="pill">frame</span>' : '';
        return `<tr data-hash="${p.hash}"><td class="state">${r ? (r.outcome === 'read' ? '✓' : '✗') : '○'}</td>`
            + `<td><img class="thumb" loading="lazy" alt="" src="${SHELF}thumb?hash=${p.hash}"></td><td>${esc(p.name)} ${kind}</td>`
            + `<td>${r ? yes(r.edges) : yes(null)}</td><td>${r ? `${r.lines.length} line${r.lines.length === 1 ? '' : 's'}` : '–'}</td>`
            + `<td class="num">${s ? pct(s.charAccuracy) : '–'}</td><td class="num">${s ? `${s.linesExact} of ${s.linesTotal}` : '–'}</td>`
            + `<td>${r ? yes(r.logo) : yes(null)}</td><td class="err">${r && r.error ? esc(r.error) : ''}</td></tr>`;
    }).join('');
    $('angleRows').innerHTML = rows || '<tr><td colspan="9" class="empty">No angles yet.</td></tr>';
    renderSummary();
}

function renderSummary() {
    const card = state.card;
    const results = card.photos.map(p => ({ p, r: card.results[p.hash] })).filter(x => x.r && x.r.outcome === 'read');
    const voted = voteLines(results.map(x => x.r.lines));
    state.voted = voted;
    const truth = truthOf(card);
    const parts = [];
    const ran = results.length, total = card.photos.length;
    parts.push(`<p><b>${ran} of ${total}</b> angles read${ran < total ? `; left: ${total - ran}` : ''}. Edges found on ${results.filter(x => x.r.edges).length}; a logo on ${results.filter(x => x.r.logo).length}.</p>`);
    if (truth) {
        const scored = results.map(x => ({ name: x.p.name, chars: scoreOf(x.r).charAccuracy, frame: x.p.kind === 'frame' }));
        const all = angleSummary(scored), photos = angleSummary(scored.filter(x => !x.frame)), frames = angleSummary(scored.filter(x => x.frame));
        const vs = voted.length ? scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: voted }, { ...truth, edgesOk: true, hadQuad: true }) : null;
        const row = (label, a) => (a ? `<tr><td>${label}</td><td class="num">${a.n}</td><td class="num">${pct(a.average)}</td><td>${esc(a.best.name)} ${pct(a.best.chars)}</td><td>${esc(a.weakest.name)} ${pct(a.weakest.chars)}</td></tr>` : '');
        parts.push(`<div class="scroll"><table class="sum"><thead><tr><th>Characters right</th><th>Angles</th><th>Average</th><th>Best</th><th>Weakest</th></tr></thead><tbody>${row('Every angle', all)}${row('Photos', photos)}${row('Video frames', frames)}`
            + `${vs ? `<tr class="vote"><td>All angles voted</td><td class="num">${results.length}</td><td class="num">${pct(vs.charAccuracy)}</td><td colspan="2">${vs.linesExact} of ${vs.linesTotal} lines exact, ${vs.linesMissed} missed, ${vs.linesInvented} extra</td></tr>` : ''}</tbody></table></div>`);
    } else if (ran) {
        parts.push('<p class="note">Type the right answers below (or fill them from the vote and fix them) and press Save to see scores.</p>');
    }
    $('summary').innerHTML = parts.join('');
}

function roleOptions(value) {
    return state.roles.map(([r, label]) => `<option value="${r}"${r === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

function lineRow(l = { text: '', role: 'name' }) {
    const row = document.createElement('div');
    row.className = 'tline';
    row.innerHTML = `<input class="ttext" type="text" maxlength="200" value="${esc(l.text)}" aria-label="Line text"><select class="trole" aria-label="What it is">${roleOptions(l.role)}</select><button class="btn quiet tdel" type="button" aria-label="Remove this line">✕</button>`;
    row.querySelector('.tdel').addEventListener('click', () => row.remove());
    return row;
}

function renderTruth(lines) {
    const box = $('truthLines');
    box.replaceChildren(...(lines && lines.length ? lines : [{ text: '', role: 'name' }]).map(lineRow));
}

async function saveTruth() {
    const lines = Array.from(document.querySelectorAll('#truthLines .tline')).map(r => ({ text: norm(r.querySelector('.ttext').value), role: r.querySelector('.trole').value })).filter(l => l.text);
    if (!lines.length) { $('truthNote').textContent = 'Add at least one line.'; return; }
    try {
        state.card = await putJson(`${API}truth?id=${encodeURIComponent(state.card.id)}`, { lines });
        // The Reading Room's shared key for this card, so its "same card, every angle" table agrees with this page
        let bench = '';
        try { await putJson(`${BENCH}truth?set=business-cards&name=${encodeURIComponent(`${state.card.id}__card`)}`, { lines: state.card.truth.lines, edgesOk: true, hadQuad: false }); bench = ' and in the Reading Room'; }
        catch (e) { bench = ` (the Reading Room did not take it: ${e.message})`; }
        $('truthNote').textContent = `Saved here${bench}.`;
        renderAngles();
        loadCards().catch(() => {});
    } catch (e) { $('truthNote').textContent = `Not saved: ${e.message}`; }
}

async function openCard(id, { autoRun = false } = {}) {
    state.card = await api(`card?id=${encodeURIComponent(id)}`);
    $('cardPanel').hidden = false;
    $('cardTitle').textContent = state.card.name;
    $('clipNote').textContent = state.card.clips.length
        ? `${state.card.clips.length} clip${state.card.clips.length === 1 ? '' : 's'}: ${state.card.clips.map(c => `${c.name} (${(c.bytes / 1048576).toFixed(1)} MB${state.card.photos.some(p => p.from === c.hash) ? ', frames picked' : ''})`).join(', ')}`
        : '';
    $('pickBtn').hidden = !state.card.clips.length;
    renderAngles();
    renderTruth(truthOf(state.card) ? state.card.truth.lines : null);
    $('truthNote').textContent = truthOf(state.card) ? `Saved ${state.card.truth.at ? state.card.truth.at.slice(0, 16).replace('T', ' ') + ' UTC' : ''}.` : '';
    const q = new URLSearchParams(location.search); q.set('card', id); history.replaceState(null, '', `?${q}`);
    document.querySelectorAll('.cardpick').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    if (autoRun) {
        if (state.card.clips.some(c => !state.card.photos.some(p => p.from === c.hash))) return pickAllClips();
        runCard();
    }
}

// ---- Boot ---------------------------------------------------------------------------------------------------------
if (typeof document !== 'undefined' && $('dropZone')) {
    const input = $('fileInput'), zone = $('dropZone');
    input.addEventListener('change', () => dropFiles(Array.from(input.files)).catch(e => status(e.message)).finally(() => { input.value = ''; }));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); dropFiles(Array.from(e.dataTransfer.files)).catch(err => status(err.message)); });
    $('runBtn').addEventListener('click', () => runCard(false));
    $('againBtn').addEventListener('click', () => runCard(true));
    $('stopBtn').addEventListener('click', () => { state.stop = true; $('stopBtn').disabled = true; });
    $('pickBtn').addEventListener('click', pickAllClips);
    $('addLine').addEventListener('click', () => $('truthLines').append(lineRow()));
    $('fillVote').addEventListener('click', () => { if (state.voted && state.voted.length) renderTruth(state.voted); else $('truthNote').textContent = 'Run the angles first; the vote fills from what they read.'; });
    $('saveTruth').addEventListener('click', saveTruth);
    Promise.all([loadBuilds().catch(e => { $('inboxBuildNote').textContent = `The Reading Room's build list is not answering: ${e.message}`; }), loadCards()])
        .then(() => { const id = new URLSearchParams(location.search).get('card'); if (id) return openCard(id, { autoRun: true }); })
        .catch(e => status(`The inbox service is not answering: ${e.message}`));
}
