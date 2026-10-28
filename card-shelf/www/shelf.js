/**
 * vCGE lab: the Card Shelf page. Lists the shared test photos by place (Holding, Active, Archive), moves them between
 * places and benches, and deletes a wrong file for good after asking twice. All storage is the shelf service
 * (card-shelf-api.py); this page keeps nothing.
 */
const ROOT = location.pathname.replace(/shelf\/.*$/, '');   // the team's lab root, e.g. "/vcge/"
const API = `${ROOT}shelf/api/`;
const BENCH_LABEL = { ocr: '🦉 OCR', logo: '🦎 Logo', edges: '🐈 Edges' };
const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const state = { photos: [], place: 'holding', selected: new Set() };

async function api(path, options) {
    const r = await fetch(API + path, { cache: 'no-store', ...options });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}
const post = (path, obj) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const status = (text) => { $('status').textContent = text; };

async function load() {
    try {
        state.photos = (await api('photos')).photos;
    } catch (e) {
        status(`The shelf service isn't answering (${e.message}).`);
        state.photos = [];
    }
    const ids = new Set(state.photos.map(p => p.hash));
    state.selected = new Set([...state.selected].filter(h => ids.has(h)));
    render();
}

function render() {
    const count = (place) => state.photos.filter(p => p.place === place).length;
    $('countHolding').textContent = `(${count('holding')})`;
    $('countActive').textContent = `(${count('active')})`;
    $('countArchive').textContent = `(${count('archive')})`;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.place === state.place));
    const shown = state.photos.filter(p => p.place === state.place);
    $('grid').replaceChildren(...shown.map(tile));
    $('empty').classList.toggle('hidden', shown.length > 0);
    const sel = shown.filter(p => state.selected.has(p.hash)).length;
    $('selCount').textContent = `${sel} selected`;
    $('selectAll').checked = shown.length > 0 && sel === shown.length;
    document.querySelectorAll('[data-bulk]').forEach(b => { b.disabled = !sel; });
}

function tile(p) {
    const el = document.createElement('article');
    el.className = `tile${state.selected.has(p.hash) ? ' sel' : ''}`;
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = p.name; img.src = `${API}photo?hash=${p.hash}`;
    const pick = document.createElement('label'); pick.className = 'check name';
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = state.selected.has(p.hash);
    box.addEventListener('change', () => { box.checked ? state.selected.add(p.hash) : state.selected.delete(p.hash); render(); });
    pick.append(box, document.createTextNode(p.name));
    const meta = document.createElement('p'); meta.className = 'meta';
    meta.textContent = `${Math.round(p.size / 1024)} KB, added ${new Date(p.added * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    const acts = document.createElement('div'); acts.className = 'acts';
    for (const b of Object.keys(BENCH_LABEL)) {
        const on = p.benches.includes(b);
        const btn = document.createElement('button'); btn.className = `btn small${on ? ' on' : ''}`; btn.textContent = BENCH_LABEL[b];
        btn.setAttribute('aria-pressed', String(on));
        btn.title = on ? 'Stop testing it on this bench' : 'Test it on this bench';
        btn.addEventListener('click', () => setBenches([p], on ? p.benches.filter(x => x !== b) : [...p.benches, b]));
        acts.append(btn);
    }
    const btn = (label, fn, cls = '') => { const x = document.createElement('button'); x.className = `btn small ${cls}`; x.textContent = label; x.addEventListener('click', fn); acts.append(x); };
    if (p.place === 'archive') btn('📥 Restore', () => move([p], 'holding'));
    else btn('📦 Archive', () => move([p], 'archive'));
    btn('🗑 Delete', () => remove([p]), 'danger');
    el.append(img, pick, meta, acts);
    return el;
}

async function run(list, word, fn) {
    let done = 0;
    for (const p of list) {
        try { await fn(p); done++; } catch (e) { status(`${p.name}: ${e.message}`); await load(); return; }
        status(`${word} ${done} of ${list.length}…`);
    }
    status(`${word} ${plural(done, 'photo')}.`);
    await load();
}
const setBenches = (list, benches) => run(list, 'Updated', p => post('move', { hash: p.hash, to: benches.length ? 'active' : 'holding', benches }));
const move = (list, to) => run(list, to === 'archive' ? 'Archived' : 'Moved', p => post('move', { hash: p.hash, to, benches: [] }));

async function remove(list) {
    const what = list.length === 1 ? `"${list[0].name}"` : plural(list.length, 'photo');
    if (!confirm(`Delete ${what} for good? To keep a photo but put it away, use Archive instead.`)) return;
    if (!confirm(`Are you sure? ${what} will be gone from the lab and cannot be brought back.`)) return;
    await run(list, 'Deleted', p => post('delete', { hash: p.hash, confirm: p.hash }));
}

async function addFiles(files) {
    const images = files.filter(f => /^image\//.test(f.type));
    let n = 0, again = 0;
    for (const f of images) {
        status(`Adding ${++n} of ${images.length}…`);
        try {
            const r = await api(`upload?to=holding&name=${encodeURIComponent(f.name.replace(/[^A-Za-z0-9 ._()-]/g, '_'))}`, { method: 'PUT', body: f });
            if (r.duplicate) again++;
        } catch (e) { status(`${f.name}: ${e.message}`); }
    }
    status(`${plural(images.length - again, 'photo')} added to Holding${again ? `; ${again} already on the shelf, kept once` : ''}.`);
    state.place = 'holding';
    await load();
}

function selectedShown() { return state.photos.filter(p => p.place === state.place && state.selected.has(p.hash)); }

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { state.place = t.dataset.place; render(); }));
$('selectAll').addEventListener('change', e => {
    state.photos.filter(p => p.place === state.place).forEach(p => (e.target.checked ? state.selected.add(p.hash) : state.selected.delete(p.hash)));
    render();
});
document.querySelectorAll('[data-bulk]').forEach(b => b.addEventListener('click', () => {
    const list = selectedShown(), what = b.dataset.bulk;
    if (!list.length) return;
    if (what === 'delete') return remove(list);
    if (what === 'holding' || what === 'archive') return move(list, what);
    return run(list, 'Updated', p => post('move', { hash: p.hash, to: 'active', benches: [...new Set([...p.benches, what])] }));
}));
$('addPhotos').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
const drop = $('dropZone');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });

load();
