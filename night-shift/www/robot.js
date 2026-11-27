/**
 * vCGE lab: the Night Shift robot (headless page). Lab only; never part of the app.
 *
 * Reads Card Factory cards (job=factory) or Print & Snap photos (job=snaps) with ONE published build's own code, the
 * same steps as the Reading Room's "as the app does it": MOD03 edge finder + crop, MOD04 reader, MOD05 field mapper,
 * imported from /v/<build>/src/... Results go to window.robotDone as rows of numbers and labels; what a card says is
 * never kept. The Night Shift runner (night-shift.mjs) waits for robotDone and saves the scoreboard.
 */
import { readFields, fieldsRight, charsRight, cornerMiss, matchCard } from './score.js';

const FINDER_MAX_SIDE = 1200;            // same as MOD03 cropEditor.js
const EDGE_OK = 0.05;                    // corners within 5% of the card's diagonal count as found
const q = new URLSearchParams(location.search);
const build = q.get('build'), job = q.get('job') || 'factory', setName = q.get('set') || '', max = Math.max(1, Math.min(20000, Number(q.get('max')) || 300));
const API = new URL('api/', location.href).href;
const status = (t) => { document.getElementById('status').textContent = t; };

async function getJson(path) {
    const r = await fetch(API + path, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
}

async function loadModules() {
    const b = `/v/${build}/`;
    const base = document.createElement('base'); base.href = new URL(b, location.href).href; document.head.prepend(base);
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = `${b}src/vendor/tesseract/tesseract.min.js`; s.onload = res; s.onerror = () => rej(new Error('tesseract.min.js not found in this build')); document.head.append(s); });
    const [finder, persp, ocr, mapper] = await Promise.all([
        import(`${b}src/modules/mod03-camera/cardFinder.js`), import(`${b}src/modules/mod03-camera/perspective.js`),
        import(`${b}src/modules/mod04-ocr/ocrWorker.js`), import(`${b}src/modules/mod05-form/formMapper.js`)]);
    return { finder, persp, ocr, mapper: new mapper.ContactFormMapper() };
}

function loadImage(url) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('image failed to load')); img.src = url; });
}

/** Edges, crop, read, map: one picture through the build's code. Never throws. */
async function readPicture(m, url) {
    const r = { quad: null, outcome: 'read', text: '', fields: null, ms: 0 };
    const t0 = performance.now();
    try {
        const img = await loadImage(url);
        const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
        full.getContext('2d').drawImage(img, 0, 0);
        const scale = Math.min(1, FINDER_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const small = document.createElement('canvas'); small.width = Math.max(1, Math.round(img.naturalWidth * scale)); small.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const sctx = small.getContext('2d'); sctx.drawImage(img, 0, 0, small.width, small.height);
        const quad = m.finder.findCardQuad(sctx.getImageData(0, 0, small.width, small.height));
        let shown = full;
        if (quad) {
            r.quad = quad.map(p => ({ x: p.x / scale, y: p.y / scale }));
            const { width, height } = m.persp.quadOutputSize(r.quad);
            const flat = m.persp.warpPerspective(full.getContext('2d').getImageData(0, 0, full.width, full.height), r.quad, width, height);
            const out = document.createElement('canvas'); out.width = width; out.height = height;
            out.getContext('2d').putImageData(new ImageData(flat.data, width, height), 0, 0);
            shown = out;
        }
        const read = await m.ocr.executeOCRScan(shown.toDataURL('image/png'), {});
        const lines = m.mapper.classifyLines(read.lines && read.lines.length ? read.lines : read.text);
        r.text = lines.map(l => l.text).join(' ');
        r.fields = m.mapper.buildFields(lines).fields;
        if (q.get('debug')) console.log('robot debug', JSON.stringify({ lines: lines.map(l => [l.role, l.text]), fields: r.fields }));
    } catch (e) {
        r.outcome = (e && e.code) || 'error';
    }
    r.ms = Math.round(performance.now() - t0);
    return r;
}

function row(card, r, extra = {}) {
    const read = readFields(r.fields);
    const f = r.outcome === 'read' ? fieldsRight(read, card.truth) : Object.fromEntries(Object.entries(fieldsRight(readFields(null), card.truth)).map(([k, v]) => [k, v == null ? null : 0]));
    const miss = card.corners ? cornerMiss(r.quad, card.corners) : null;
    return {
        n: card.n, font: card.font, group: card.group, layout: card.layout, nameStyle: / the /.test(card.truth?.name || '') ? 'Herd style (X the Animal)' : 'everyday', effects: card.effects || {}, ms: r.ms, ...extra,
        values: { chars: r.outcome === 'read' ? charsRight(r.text, card.truth) : 0, edges: card.corners ? +(miss != null && miss <= EDGE_OK) : null,
            turnedDown: r.outcome !== 'read' && r.outcome !== 'error' ? 1 : 0, ...f }
    };
}

async function factory(m) {
    const man = await getJson(`set?name=${encodeURIComponent(setName)}`);
    if (man.kind !== 'cards') throw new Error(`set ${setName} is ${man.kind}, not cards`);
    const cards = man.cards.slice(0, max), rows = [];
    for (let i = 0; i < cards.length; i++) {
        status(`${setName}: card ${i + 1} of ${cards.length}`);
        const r = await readPicture(m, `${API}image?set=${encodeURIComponent(setName)}&file=${encodeURIComponent(cards[i].file)}`);
        rows.push(row(cards[i], r));
    }
    return { rows, unmatched: [] };
}

async function snaps(m) {
    const { sets } = await getJson('sets');
    const printed = [];
    for (const s of sets.filter(s => s.kind === 'printed')) {
        const man = await getJson(`set?name=${encodeURIComponent(s.name)}`);
        for (const c of man.cards) printed.push({ ...c, n: `${s.name}#${c.n}` });
    }
    const { photos } = await getJson('snaps');
    const rows = [], unmatched = [];
    for (let i = 0; i < Math.min(photos.length, max); i++) {
        status(`snaps: photo ${i + 1} of ${photos.length}`);
        const r = await readPicture(m, `${API}snap?name=${encodeURIComponent(photos[i].name)}`);
        const hit = r.outcome === 'read' ? matchCard(r.text, readFields(r.fields), printed) : null;
        if (!hit) { unmatched.push(photos[i].name); continue; }
        const card = printed.find(c => c.n === hit.n);
        rows.push(row({ ...card, corners: null, effects: { 'snap: real photo': 1 } }, r, { photo: photos[i].name }));
    }
    return { rows, unmatched };
}

(async () => {
    try {
        if (!/^[0-9a-f]{6,12}$/.test(build || '')) throw new Error('build missing or not a short commit id');
        status(`Loading build ${build}…`);
        const m = await loadModules();
        const out = job === 'snaps' ? await snaps(m) : await factory(m);
        status(`Done: ${out.rows.length} scored${out.unmatched.length ? `, ${out.unmatched.length} photos not matched` : ''}.`);
        window.robotDone = { ok: true, build, job, set: job === 'snaps' ? 'snaps' : setName, ...out };
    } catch (e) {
        status(`Stopped: ${e.message}`);
        window.robotDone = { ok: false, build, job, set: setName, error: String(e.message || e) };
    }
})();
