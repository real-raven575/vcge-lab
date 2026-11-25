/**
 * vCGE lab: the Tester Voices page. Paste what a tester said, hide their name, tag it, save it to the lab; then read,
 * sort, copy and pass each drop on. All storage is the voices service (voices-api.py); this page keeps nothing, not
 * even the "Names to hide" box. ?app=auto-fixer opens Auto-Fixer's shelf (its own folder and colours).
 */
import { TAGS, STATUSES, SOURCES, parseNames, cleanWords, bothTimes, asText, counts } from './voices-core.js';

const APP = new URLSearchParams(location.search).get('app') === 'auto-fixer' ? 'auto-fixer' : 'vcge';
const LOOK = { vcge: { name: 'vCGE', mark: '💬', other: ['auto-fixer', '🐒 Auto-Fixer\'s voices'] },
    'auto-fixer': { name: 'Auto-Fixer', mark: '🐒', other: ['vcge', '🐘 vCGE\'s voices'] } }[APP];
const API = `${location.pathname.replace(/voices\/.*$/, '')}voices/api/`;
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    for (const k of kids) n.append(k);
    return n;
};
const state = { drops: [], nextTester: 'T1', pick: new Set(), files: [], show: 'all', armed: null };

async function api(path, options = {}) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(`${API}${path}${sep}app=${APP}`, { cache: 'no-store', ...options });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}
const send = (method, path, obj) => api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const say = (t) => { $('status').textContent = t; };

function setup() {
    document.body.classList.add(`app-${APP}`);
    document.title = `${LOOK.name} Lab: Tester Voices`;
    $('appName').textContent = LOOK.name;
    $('mark').textContent = LOOK.mark;
    $('switchApp').href = `?app=${LOOK.other[0]}`;
    $('switchApp').textContent = LOOK.other[1];
    for (const [k, v] of Object.entries(SOURCES)) $('source').append(el('option', { value: k, textContent: v }));
    for (const [k, v] of Object.entries(TAGS)) {
        const b = el('button', { type: 'button', className: 'chip', textContent: v });
        b.setAttribute('aria-pressed', 'false');
        b.onclick = () => { state.pick.has(k) ? state.pick.delete(k) : state.pick.add(k); b.setAttribute('aria-pressed', String(state.pick.has(k))); };
        $('tagPick').append(b);
    }
    for (const id of ['words', 'names', 'tester']) $(id).addEventListener('input', preview);
    $('shots').onchange = () => {
        state.files = [...$('shots').files];
        $('shotList').textContent = state.files.length ? `${state.files.length} screenshot${state.files.length === 1 ? '' : 's'} ready` : '';
    };
    $('save').onclick = saveDrop;
}

function cleaned() {
    const names = parseNames($('names').value, $('tester').value.trim() || state.nextTester);
    // A single listed person with no code of their own takes the codename in the Tester box.
    if (names.length === 1 && !$('names').value.includes('=') && $('tester').value.trim()) names[0].code = $('tester').value.trim();
    return cleanWords($('words').value, names);
}

function preview() {
    const { text, swaps } = cleaned();
    $('preview').textContent = text || 'Paste something above to see it here.';
    const bits = [swaps.names && `${swaps.names} name${swaps.names === 1 ? '' : 's'}`, swaps.emails && `${swaps.emails} e-mail`,
        swaps.handles && `${swaps.handles} @handle`, swaps.phones && `${swaps.phones} phone`].filter(Boolean);
    $('swapLine').textContent = bits.length ? `· hidden: ${bits.join(', ')}` : '';
    $('save').disabled = !text.trim();
}

async function saveDrop() {
    const { text } = cleaned();
    $('save').disabled = true;
    say('Saving…');
    try {
        const { drop } = await send('POST', 'drop', { text, tester: $('tester').value.trim() || state.nextTester,
            tags: [...state.pick], source: $('source').value, said: $('said').value.trim() });
        let bad = 0;
        for (const f of state.files) {
            try { await api(`shot?id=${drop.id}`, { method: 'PUT', body: f }); } catch { bad++; }
        }
        say(`Saved as ${drop.tester} at ${bothTimes(drop.added)}${bad ? `; ${bad} screenshot${bad === 1 ? '' : 's'} not saved (PNG, JPEG, WebP or GIF, up to 15 MB)` : ''}.`);
        $('words').value = ''; $('names').value = ''; $('said').value = ''; $('shots').value = '';
        state.files = []; $('shotList').textContent = '';
        state.pick.clear();
        for (const b of $('tagPick').children) b.setAttribute('aria-pressed', 'false');
        await load();
        $('tester').value = state.nextTester;
        preview();
    } catch (e) {
        say(`Not saved: ${e.message}. Your paste is still in the box.`);
        $('save').disabled = false;
    }
}

async function load() {
    try {
        const r = await api('drops');
        state.drops = r.drops;
        state.nextTester = r.nextTester;
        if (!$('tester').value) $('tester').value = r.nextTester;
    } catch (e) {
        say(`The voices service isn't answering (${e.message}).`);
    }
    draw();
}

function filters() {
    const c = counts(state.drops);
    const opts = [['all', `All ${c.all}`], ...Object.entries(STATUSES).filter(([k]) => k !== 'done').map(([k, v]) => [`s:${k}`, `${v} ${c.status[k] || 0}`]),
        ...Object.entries(TAGS).map(([k, v]) => [`t:${k}`, `${v} ${c.tag[k] || 0}`]), ['s:done', `${STATUSES.done} ${c.status.done || 0}`]];
    $('filters').replaceChildren(...opts.map(([k, label]) => {
        const b = el('button', { type: 'button', className: 'chip', textContent: label });
        b.setAttribute('aria-pressed', String(state.show === k));
        b.onclick = () => { state.show = k; draw(); };
        return b;
    }));
    $('total').textContent = `· ${c.all} saved`;
}

function shown() {
    const [kind, v] = state.show.split(':');
    if (kind === 's') return state.drops.filter(d => d.status === v);
    if (kind === 't') return state.drops.filter(d => d.tags.includes(v));
    return state.drops;
}

function draw() {
    filters();
    const rows = shown();
    $('empty').classList.toggle('hidden', rows.length > 0);
    $('list').replaceChildren(...rows.map(card));
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* plain http on the tailnet: old way */ }
    const t = el('textarea', { value: text });
    document.body.append(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    return ok;
}

async function change(drop, patch) {
    try {
        const r = await send('PUT', `drop?id=${drop.id}`, patch);
        Object.assign(drop, r.drop);
    } catch (e) { say(`Not changed: ${e.message}`); }
    draw();
}

function card(d) {
    const tags = el('div', { className: 'chips' }, ...Object.entries(TAGS).map(([k, v]) => {
        const b = el('button', { type: 'button', className: 'chip small', textContent: v });
        b.setAttribute('aria-pressed', String(d.tags.includes(k)));
        b.onclick = () => change(d, { tags: d.tags.includes(k) ? d.tags.filter(t => t !== k) : [...d.tags, k] });
        return b;
    }));
    const status = el('select', {}, ...Object.entries(STATUSES).map(([k, v]) => el('option', { value: k, textContent: v, selected: d.status === k })));
    status.setAttribute('aria-label', 'Status');
    status.onchange = () => change(d, { status: status.value });
    const shots = el('div', { className: 'shots' }, ...d.shots.map(s => {
        const src = `${API}shot?app=${APP}&id=${d.id}&hash=${s.hash}`;
        return el('a', { href: src, target: '_blank', rel: 'noopener' }, el('img', { src, alt: `Screenshot from ${d.tester}`, loading: 'lazy' }));
    }));
    const notes = el('ul', { className: 'notes' }, ...(d.notes || []).map(n => el('li', {}, el('small', { textContent: bothTimes(n.at) }), ` ${n.text}`)));
    const noteBox = el('input', { placeholder: 'Add a note (who it went to, what we did)', maxLength: 4000 });
    const addNote = el('button', { type: 'button', className: 'btn small', textContent: '📝 Add note' });
    addNote.onclick = async () => {
        if (!noteBox.value.trim()) return;
        try { const r = await send('POST', `note?id=${d.id}`, { text: noteBox.value }); Object.assign(d, r.drop); draw(); } catch (e) { say(`Note not saved: ${e.message}`); }
    };
    const copy = el('button', { type: 'button', className: 'btn small', textContent: '📋 Copy' });
    copy.onclick = async () => {
        copy.textContent = (await copyText(asText(d, LOOK.name))) ? '✅ Copied' : 'Copy blocked here';
        setTimeout(() => { copy.textContent = '📋 Copy'; }, 2000);
    };
    const del = el('button', { type: 'button', className: 'btn small danger' });
    const step = state.armed?.id === d.id ? state.armed.step : 0;
    del.textContent = ['🗑 Delete', 'Tap again to delete for good', 'Are you sure? Delete now'][step];
    del.onclick = async () => {
        if (step < 2) { state.armed = { id: d.id, step: step + 1 }; return draw(); }
        state.armed = null;
        try { await send('POST', `delete?id=${d.id}`, { confirm: d.id }); state.drops = state.drops.filter(x => x !== d); say(`Deleted ${d.tester}'s drop.`); } catch (e) { say(`Not deleted: ${e.message}`); }
        draw();
    };
    const body = el('pre', { className: 'words', textContent: d.text });
    const more = el('details', { open: d.text.length < 600 }, el('summary', { textContent: d.text.length < 600 ? 'Words' : `Words (${d.text.length} characters)` }), body);
    return el('li', { className: `drop st-${d.status}` },
        el('div', { className: 'head' }, el('b', { textContent: `🧑 ${d.tester}` }), el('span', { className: 'note', textContent: `${SOURCES[d.source] || d.source} · ${bothTimes(d.added)}${d.said ? ` · said ${d.said}` : ''}` })),
        tags, more, shots, notes,
        el('div', { className: 'row' }, status, copy, del),
        el('div', { className: 'row' }, noteBox, addNote));
}

setup();
preview();
load();
