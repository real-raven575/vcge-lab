/**
 * vCGE lab: the logo bench, "The Paint Shop" (🦎 Flipside, MOD06, with 🦉 Glyph, MOD04). Lab only; never part of the app.
 *
 * For every card photo: the build's own Snap to card (MOD03 cardFinder.js + perspective.js, or the corners saved as
 * the photo's answer key in the Darkroom) flattens the card; Glyph's reader (the build's bundled Tesseract.js, with
 * MOD04's sparse-text setting; optional) finds where the contact lines are; logoFinder.js points at the likely logo.
 * The person confirms or corrects the pick, and the logo is redrawn as flat shapes: posterize.js with the build's MOD06
 * tracer, beside the app's own one-colour trace.
 * Photos come from the lab's Card Shelf (the ones ticked 🦎 Logo; "Add photos" uploads there, ticked Logo). Without
 * the shelf, photos from this device are kept in this browser's memory only. The person's answers stay in this
 * browser (localStorage). A build's modules load once, so switching builds reloads the page.
 */
import { contactTextBoxes, findLogoCandidates, overlap } from './logoFinder.js';
import { posterize } from './posterize.js';

const ROOT = location.pathname.replace(/logo-bench\/.*$/, '');   // the team's lab root, e.g. "/vcge/"
const EDGE_API = `${ROOT}edge-bench/api/`;                         // the Darkroom's file service (read only here)
const SHELF_API = `${ROOT}shelf/api/`;                             // the Card Shelf, shared by the benches
const FINDER_MAX_SIDE = 1200;     // same as MOD03 cropEditor.js: the edge finder reads a copy no larger than this
const WORK_MAX_SIDE = 800;        // the logo finder reads the flattened card at most this large
const KEYS = 'vcge-logo-bench-keys';
const HIT = 0.5;                  // a pick overlapping the person's box at least this much is right
const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const say = (text) => { $('flipsideSays').textContent = text; };

const state = { build: null, photos: [], results: new Map(), modules: null, stop: false, keys: readKeys(), shelf: false };

function readKeys() {
    try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch (e) { return {}; }
}
function writeKeys() {
    try { localStorage.setItem(KEYS, JSON.stringify(state.keys)); } catch (e) { say("This browser won't let me keep your answers, so they last until the page closes."); }
}

async function edgeApi(path) {
    const r = await fetch(EDGE_API + path, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
}

// ---- Builds and photos -------------------------------------------------------------------------------------------

async function loadBuilds() {
    const wanted = new URLSearchParams(location.search).get('build');
    let builds = [], latest = null;
    try { ({ builds, latest } = await edgeApi('builds')); } catch (e) { /* no Darkroom: the newest build only */ }
    const sel = $('buildSelect');
    if (builds.length) {
        const pick = wanted || latest || builds[0].short;
        sel.replaceChildren(...builds.map(b => new Option(`${b.short}  ${b.subject.slice(0, 70)}${b.source ? '' : '  (source not published yet)'}`, b.short, false, b.short === pick)));
        state.build = builds.find(b => b.short === sel.value) || null;
    } else {
        sel.replaceChildren(new Option(wanted || 'newest build', wanted || 'latest'));
        state.build = { short: wanted || 'latest', source: true, path: wanted ? `v/${wanted}/` : 'latest/' };
    }
    sel.addEventListener('change', () => { location.search = `?build=${encodeURIComponent(sel.value)}`; });
    if (!state.build) { $('buildNote').textContent = 'No builds published yet.'; $('runBtn').disabled = true; return; }
    state.build.path = state.build.path || `v/${state.build.short}/`;
    $('buildNote').textContent = state.build.date ? `${state.build.date.slice(0, 16).replace('T', ' ')} UTC` : '';
    if (!state.build.source) { $('buildNote').textContent += ' Its source is not published yet; pick another build or wait a few minutes.'; $('runBtn').disabled = true; }
}

/** The photos ticked 🦎 Logo on the Card Shelf, with Iris's saved card corners where the Darkroom has them (by hash). */
async function loadShelf() {
    let got;
    try {
        const r = await fetch(`${SHELF_API}photos?bench=logo`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        got = await r.json();
        state.shelf = true;
    } catch (e) {
        $('photoNote').textContent = "The Card Shelf isn't reachable from here, so photos you add stay in this browser only.";
        countPhotos();
        return;
    }
    const keyed = await Promise.all(got.photos.map(async p => {
        const t = await edgeApi(`truth?hash=${p.hash}`).catch(() => null);
        return { id: `lab:${p.hash}`, name: p.name, url: `${SHELF_API}photo?hash=${p.hash}`,
            corners: t && Array.isArray(t.corners) ? t.corners : null, noCard: !!(t && t.noCard) };
    }));
    state.photos = state.photos.filter(p => !p.id.startsWith('lab:')).concat(keyed.filter(p => !p.noCard));
    $('photoNote').textContent = `${plural(keyed.length, 'photo')} ticked 🦎 Logo on the Card Shelf. Tick more there, or add new ones here (they go on the shelf, ticked Logo).`;
    countPhotos();
}

function countPhotos() {
    $('photoCount').textContent = plural(state.photos.length, 'photo');
    if (!state.photos.length) say("No cards yet. Hand me a stack; different angles are welcome.");
}

async function addFiles(files) {
    if (state.shelf) {
        const images = files.filter(f => /^image\//.test(f.type));
        let n = 0;
        for (const file of images) {
            $('runStatus').textContent = `Adding ${++n} of ${images.length} to the shelf…`;
            const r = await fetch(`${SHELF_API}upload?to=logo&name=${encodeURIComponent(file.name.replace(/[^A-Za-z0-9 ._()-]/g, '_'))}`, { method: 'PUT', body: file });
            if (!r.ok) { $('runStatus').textContent = `${file.name} was not added (HTTP ${r.status}).`; return; }
        }
        $('runStatus').textContent = `${plural(images.length, 'photo')} added to the shelf.`;
        await loadShelf();
        say(`${plural(state.photos.length, 'card')} on the table. Press Run all when you're ready.`);
        return;
    }
    for (const file of files) {
        if (!/^image\//.test(file.type)) continue;
        const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
        state.photos.push({ id: `device:${file.name}:${file.size}`, name: file.name, url, corners: null });
    }
    countPhotos();
    say(`${plural(state.photos.length, 'card')} on the table. Press Run all when you're ready.`);
}

// ---- The build's own modules -------------------------------------------------------------------------------------

/** Loads the build's modules once. Paths inside them resolve from <base>, so the page's base becomes the build. */
async function loadModules() {
    if (state.modules) return state.modules;
    const b = `${ROOT}${state.build.path}`;
    const base = document.createElement('base'); base.href = new URL(b, location.href).href; document.head.prepend(base);
    const [finder, persp, gui] = await Promise.all([
        import(`${b}src/modules/mod03-camera/cardFinder.js`), import(`${b}src/modules/mod03-camera/perspective.js`),
        import(`${b}src/modules/mod06-gui/card3dView.js`)]);
    let ocr = null;
    if ($('useReader').checked) {
        // The app's ocrWorker.js returns the text without where each line is, so the bench runs the build's own engine
        // itself, set up the way MOD04 sets it up (same files, no caching, sparse text), and keeps the line boxes.
        try {
            await new Promise((res, rej) => { const s = document.createElement('script'); s.src = `${b}src/vendor/tesseract/tesseract.min.js`; s.onload = res; s.onerror = () => rej(new Error('no reader in this build')); document.head.append(s); });
            const vendor = new URL(`${b}src/vendor/tesseract/`, location.href).href;
            ocr = await window.Tesseract.createWorker('eng', 1, { workerPath: `${vendor}worker.min.js`, corePath: `${vendor}core/`, langPath: `${vendor}lang/`, gzip: true, cacheMethod: 'none', workerBlobURL: false });
            const mod04 = await import(`${b}src/modules/mod04-ocr/ocrWorker.js`).catch(() => ({}));
            await ocr.setParameters({ tessedit_pageseg_mode: mod04.OCR_PAGE_SEG_MODE || '11' });
        } catch (e) { ocr = null; say(`Glyph couldn't come (${e.message}); I'll go by shapes and colour alone.`); }
    }
    state.modules = { finder, persp, gui, ocr };
    return state.modules;
}

function loadImage(url) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('the photo did not load')); img.src = url; });
}
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** The size the reader gets the card at, as MOD04 does: about 1800 px on the long side (small cards enlarged up to 3x). */
function readerScale(w, h) {
    const longest = Math.max(w, h);
    return longest < 1200 ? Math.min(3, 1800 / longest) : (longest > 2400 ? 2400 / longest : 1);
}

/** Glyph's read of the flattened card: [{ text, confidence, bbox }] in the reader copy's pixels, and that copy's scale. */
async function readLines(ocr, flat) {
    const k = readerScale(flat.width, flat.height);
    const copy = canvasOf(Math.round(flat.width * k), Math.round(flat.height * k));
    copy.getContext('2d').drawImage(flat, 0, 0, copy.width, copy.height);
    const { data } = await ocr.recognize(copy);
    copy.width = copy.height = 0;
    return { k, lines: (data.lines || []).map(l => ({ text: (l.text || '').trim(), confidence: l.confidence, bbox: l.bbox })) };
}

/** One photo: flatten the card, let Glyph read it (optional), find the logo. Never throws; errors go on the record. */
async function runPhoto(photo) {
    const { finder, persp, ocr } = state.modules;
    const r = { photo, flat: null, work: null, scale: 1, candidates: [], snap: 'whole photo', reader: 'off', error: null };
    try {
        const img = await loadImage(photo.url);
        const full = canvasOf(img.naturalWidth, img.naturalHeight);
        const fctx = full.getContext('2d', { willReadFrequently: true });
        fctx.drawImage(img, 0, 0);
        let quad = photo.corners;
        if (quad) r.snap = "Iris's saved corners";
        else {
            const k = Math.min(1, FINDER_MAX_SIDE / Math.max(full.width, full.height));
            const small = canvasOf(Math.max(1, Math.round(full.width * k)), Math.max(1, Math.round(full.height * k)));
            const sctx = small.getContext('2d', { willReadFrequently: true }); sctx.drawImage(full, 0, 0, small.width, small.height);
            const found = finder.findCardQuad(sctx.getImageData(0, 0, small.width, small.height));
            if (found) { quad = found.map(p => ({ x: p.x / k, y: p.y / k })); r.snap = 'Snap to card'; }
        }
        let flat = full;
        if (quad) {
            const { width, height } = persp.quadOutputSize(quad);
            const warped = persp.warpPerspective(fctx.getImageData(0, 0, full.width, full.height), quad, width, height);
            flat = canvasOf(width, height); flat.getContext('2d').putImageData(new ImageData(warped.data, width, height), 0, 0);
        }
        r.flat = flat;
        r.scale = Math.min(1, WORK_MAX_SIDE / Math.max(flat.width, flat.height));
        r.work = canvasOf(Math.max(1, Math.round(flat.width * r.scale)), Math.max(1, Math.round(flat.height * r.scale)));
        const wctx = r.work.getContext('2d', { willReadFrequently: true }); wctx.drawImage(flat, 0, 0, r.work.width, r.work.height);
        let textBoxes = [];
        if (ocr) {
            try {
                $('runStatus').textContent = `${photo.name}: Glyph is reading…`;
                const read = await readLines(ocr, flat);
                textBoxes = contactTextBoxes(read.lines, r.scale / read.k);
                r.reader = `${plural(textBoxes.length, 'contact line')} set aside`;
            } catch (e) { r.reader = "couldn't read this one"; }
        }
        const px = wctx.getImageData(0, 0, r.work.width, r.work.height).data;
        r.candidates = findLogoCandidates(px, r.work.width, r.work.height, { textBoxes });
    } catch (e) {
        r.error = e && e.message ? e.message : String(e);
    }
    return r;
}

async function runAll() {
    if (!state.photos.length) { say('Nothing to look at yet. Add some cards first.'); return; }
    $('runBtn').disabled = true; $('stopBtn').disabled = false; state.stop = false;
    $('progress').classList.remove('hidden'); $('progressFill').style.width = '0';
    try {
        $('runStatus').textContent = 'Loading the build…';
        await loadModules();
        $('cards').replaceChildren();
        let i = 0;
        for (const photo of state.photos) {
            if (state.stop) break;
            $('runStatus').textContent = `${photo.name}…`;
            const r = await runPhoto(photo);
            state.results.set(photo.id, r);
            $('cards').append(renderCard(r));
            $('progressFill').style.width = `${Math.round(++i / state.photos.length * 100)}%`;
            tally();
        }
        $('runStatus').textContent = state.stop ? `Stopped after ${plural(i, 'card')}.` : `Done: ${plural(i, 'card')}.`;
        const t = tally();
        say(t.checked ? `Of the ${t.checked} you've checked, I got ${t.first} on the first try. Check the rest and I'll keep score.`
            : 'Done. Tell me which ones I got right; the green box is my first pick.');
    } catch (e) {
        $('runStatus').textContent = `Failed: ${e.message}`;
        say("That build wouldn't load for me. Pick another one, or check its source is published.");
    } finally {
        $('runBtn').disabled = false; $('stopBtn').disabled = true; $('reportBtn').disabled = !state.results.size;
    }
}

// ---- Checking a pick ---------------------------------------------------------------------------------------------

const PICK_COLOURS = ['#2EAD4B', '#F29E4C', '#F29E4C'];

/** The person's box for this photo in work pixels, or null; keys are stored as shares of the flattened card. */
function keyBox(r) {
    const k = state.keys[r.photo.id];
    if (!k || !k.box || !r.work) return null;
    return { x: k.box.x * r.work.width, y: k.box.y * r.work.height, w: k.box.w * r.work.width, h: k.box.h * r.work.height };
}

/** How the first pick did against the person's answer: 'first', 'later' (another candidate), 'drawn', 'none' or null. */
function verdictOf(r) {
    const k = state.keys[r.photo.id];
    if (!k) return null;
    if (k.noLogo) return r.candidates.length ? 'none' : 'first';
    const box = keyBox(r);
    const i = r.candidates.findIndex(c => overlap(c, box) >= HIT);
    return i === 0 ? 'first' : i > 0 ? 'later' : 'drawn';
}

function tally() {
    const t = { cards: 0, checked: 0, first: 0, later: 0, drawn: 0, none: 0 };
    for (const r of state.results.values()) {
        t.cards++;
        const v = verdictOf(r);
        if (!v) continue;
        t.checked++; t[v]++;
    }
    $('tally').textContent = t.cards ? `${t.checked} of ${t.cards} checked: first pick right ${t.first}, a later pick right ${t.later}, drawn by hand ${t.drawn}, no logo ${t.none}; left: ${t.cards - t.checked}` : '';
    return t;
}

function drawStage(r, canvas, drag) {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(r.work, 0, 0);
    const lw = Math.max(2, Math.round(r.work.width / 250));
    ctx.lineWidth = lw;
    r.candidates.forEach((c, i) => { ctx.strokeStyle = PICK_COLOURS[i] || PICK_COLOURS[2]; ctx.setLineDash(i ? [lw * 3, lw * 2] : []); ctx.strokeRect(c.x, c.y, c.w, c.h); });
    const key = drag || keyBox(r);
    if (key) { ctx.setLineDash([]); ctx.strokeStyle = '#4CC3C9'; ctx.lineWidth = lw * 1.5; ctx.strokeRect(key.x, key.y, key.w, key.h); }
}

function renderCard(r) {
    const el = document.createElement('article');
    el.className = 'card';
    const h = document.createElement('h3'); h.textContent = r.photo.name;
    el.append(h);
    if (r.error) { const p = document.createElement('p'); p.className = 'why'; p.textContent = `Couldn't do this one: ${r.error}`; el.append(p); return el; }
    const info = document.createElement('p'); info.className = 'why';
    info.textContent = `Card from ${r.snap}; Glyph: ${r.reader}.`;
    const stage = document.createElement('div'); stage.className = 'stage';
    const canvas = canvasOf(r.work.width, r.work.height);
    canvas.setAttribute('aria-label', `Card ${r.photo.name} with the logo picks drawn on it`);
    stage.append(canvas);
    const why = document.createElement('ul'); why.className = 'why';
    r.candidates.forEach((c, i) => { const li = document.createElement('li'); li.textContent = `#${i + 1} (${Math.round(c.score * 100)}%): ${c.reasons.join(', ') || 'no strong signs'}`; why.append(li); });
    if (!r.candidates.length) { const li = document.createElement('li'); li.textContent = 'I found nothing that looks like a logo.'; why.append(li); }
    const picks = document.createElement('div'); picks.className = 'picks';
    const verdict = document.createElement('p'); verdict.className = 'verdict';
    const shapes = document.createElement('div'); shapes.className = 'shapes';
    const button = (label, fn) => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = label; b.addEventListener('click', fn); picks.append(b); return b; };

    const refresh = () => {
        drawStage(r, canvas);
        const v = verdictOf(r);
        verdict.className = `verdict${v === 'first' ? ' hit' : v ? ' miss' : ''}`;
        verdict.textContent = { first: 'Checked: my first pick was right.', later: 'Checked: one of my later picks was right.', drawn: 'Checked: you drew it; I missed.', none: 'Checked: no logo on this card.' }[v] || 'Not checked yet.';
        makeShapes(r, shapes);
        tally();
    };
    const save = (box) => {
        state.keys[r.photo.id] = box
            ? { box: { x: box.x / r.work.width, y: box.y / r.work.height, w: box.w / r.work.width, h: box.h / r.work.height }, name: r.photo.name, at: new Date().toISOString() }
            : { noLogo: true, name: r.photo.name, at: new Date().toISOString() };
        writeKeys(); refresh();
    };
    if (r.candidates[0]) button('Right', () => save(r.candidates[0]));
    r.candidates.slice(1).forEach((c, i) => button(`No, #${i + 2}`, () => save(c)));
    const draw = button('Draw it', () => { stage.classList.toggle('drawing'); draw.classList.toggle('on'); });
    button('No logo', () => save(null));

    // Drawing a box: drag on the card while "Draw it" is on (mouse, pen or finger).
    let start = null;
    const at = (e) => { const b = canvas.getBoundingClientRect(); return { x: (e.clientX - b.left) * canvas.width / b.width, y: (e.clientY - b.top) * canvas.height / b.height }; };
    const boxOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
    canvas.addEventListener('pointerdown', e => { if (!stage.classList.contains('drawing')) return; start = at(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (start) drawStage(r, canvas, boxOf(start, at(e))); });
    canvas.addEventListener('pointerup', e => {
        if (!start) return;
        const box = boxOf(start, at(e)); start = null;
        stage.classList.remove('drawing'); draw.classList.remove('on');
        if (box.w >= 6 && box.h >= 6) save(box); else refresh();
    });

    el.addEventListener('recolour', () => makeShapes(r, shapes));
    el.append(info, stage, why, picks, verdict, shapes);
    refresh();
    return el;
}

/** The confirmed logo redrawn: Flipside's flat colours and the app's own one-colour trace, each with its size. */
async function makeShapes(r, holder) {
    holder.replaceChildren();
    const k = state.keys[r.photo.id];
    if (!k || !k.box) return;
    // Cut from the full-size flattened card, so the shapes are drawn from the sharpest copy.
    const box = { x: Math.round(k.box.x * r.flat.width), y: Math.round(k.box.y * r.flat.height), w: Math.max(1, Math.round(k.box.w * r.flat.width)), h: Math.max(1, Math.round(k.box.h * r.flat.height)) };
    const cut = canvasOf(box.w, box.h);
    const cctx = cut.getContext('2d', { willReadFrequently: true });
    cctx.drawImage(r.flat, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    const { gui } = state.modules;
    const tile = (title, svg, note) => {
        const d = document.createElement('div'); d.className = 'shape checker';
        const t = document.createElement('b'); t.textContent = title; d.append(t);
        if (svg) {
            const url = gui.svgDataUrl(svg);
            const img = new Image(); img.src = url; img.alt = title; d.append(img);
            const a = document.createElement('a'); a.href = url; a.download = `${r.photo.name.replace(/\.[^.]+$/, '')}-logo.svg`; a.textContent = `Save SVG (${(new TextEncoder().encode(svg).length / 1024).toFixed(1)} KB)`; d.append(a);
        } else {
            const p = document.createElement('span'); p.textContent = note; d.append(p);
        }
        holder.append(d);
    };
    const colours = Number($('colourCount').value);
    const flatColours = posterize(cctx.getImageData(0, 0, box.w, box.h).data, box.w, { x: 0, y: 0, w: box.w, h: box.h }, { colours, outlines: gui.outlines, soften: gui.soften });
    tile(`Flipside: ${plural(colours, 'colour')}`, flatColours.svg, flatColours.reason);
    try {
        const app = await gui.prepareLogo(cut.toDataURL('image/png'));
        const text = app.traced ? atob(app.display.split(',')[1]) : null;
        tile("The app's own trace", text, `The app would keep the picture here (${app.reason || 'not traced'}).`);
    } catch (e) {
        tile("The app's own trace", null, `Didn't work: ${e.message}`);
    }
}

function report() {
    const cards = [...state.results.values()].map(r => ({
        name: r.photo.name, card: r.snap, reader: r.reader, error: r.error,
        picks: r.candidates.map(c => ({ score: c.score, reasons: c.reasons, box: r.work ? { x: c.x / r.work.width, y: c.y / r.work.height, w: c.w / r.work.width, h: c.h / r.work.height } : null })),
        answer: state.keys[r.photo.id] || null, verdict: verdictOf(r),
    }));
    const body = JSON.stringify({ bench: 'logo', build: state.build && state.build.short, at: new Date().toISOString(), tally: tally(), cards }, null, 2);
    const a = document.createElement('a');
    a.href = `data:application/json;charset=utf-8,${encodeURIComponent(body)}`;
    a.download = `logo-bench-${(state.build && state.build.short) || 'run'}.json`;
    document.body.append(a); a.click(); a.remove();
}

// ---- Wiring ------------------------------------------------------------------------------------------------------

$('addPhotos').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
const drop = $('dropZone');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
$('runBtn').addEventListener('click', runAll);
$('stopBtn').addEventListener('click', () => { state.stop = true; $('runStatus').textContent = 'Stopping after this card…'; });
$('reportBtn').addEventListener('click', report);
$('colourCount').addEventListener('change', () => { for (const card of $('cards').children) card.dispatchEvent(new Event('recolour')); });
$('forgetBtn').addEventListener('click', () => {
    if (!confirm('Forget every answer you gave on this bench, in this browser? This cannot be undone.')) return;
    state.keys = {}; writeKeys(); runAll();
});

await loadBuilds();
await loadShelf();
