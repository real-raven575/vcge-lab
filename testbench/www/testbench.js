/**
 * Flight Deck: the Test Bench (🐘 Cornerstone, HQ). One engine, one bench per team (vCGE, Auto-Fixer, ...).
 *
 * One running list of every open test. Hands-on cards with steps (each step 👤 human or 🤖 robot); each step keeps
 * Pass / Fail / Skip, a robot's own result line and a "what I saw" box; each card keeps a status, a notes log and
 * photos or screenshots. The bench comes from <meta name="testbench"> or ?bench= (default vcge); its theme from the
 * bench's seed.
 * "Automatic": the newest real GitHub Actions run of each CI line, read by the service. Everything is saved on the lab
 * server through testbench/api/; nothing is kept in the browser, except a voice note until the lab has it. All text
 * from the server is put on the page as text.
 */
const ROOT = typeof location === 'undefined' ? '/' : location.pathname.replace(/testbench\/.*$/, '');
const API = `${ROOT}testbench/api/`;
const BENCH = typeof document === 'undefined' ? 'vcge'
    : new URLSearchParams(location.search).get('bench') || document.querySelector('meta[name=testbench]')?.content || 'vcge';

export const STATUS = {
    ready: ['🟦', 'Ready to test'], waiting: ['⏳', 'Waiting (build or a yes)'], pass: ['✅', 'Passed'],
    fail: ['❌', 'Failed'], blocked: ['⛔', 'Blocked'],
};
export const RESULTS = [['pass', '✅ Pass'], ['fail', '❌ Fail'], ['skip', '⏭ Skip']];

/** A step's text and who does it; a seed step may be a plain string. */
export const stepOf = s => (typeof s === 'string' ? { text: s, who: 'human' } : s);

/** An automatic line's status from its CI result: pass, fail, or waiting when there is no run yet. */
export function autoStatus(item) {
    const ci = item.ci && item.ci.runId ? item.ci : null;
    if (!ci) return 'waiting';
    return ci.total > 0 && ci.passed === ci.total ? 'pass' : 'fail';
}

export const statusOf = item => (item.section === 'auto' ? autoStatus(item) : item.status || 'ready');

/** How many of a test's steps have a result. */
export function stepsDone(item) {
    const n = (item.steps || []).length;
    let done = 0;
    for (let i = 0; i < n; i++) if (item.stepResults?.[i]?.result) done++;
    return { done, n };
}

/** Done steps over all steps of the hands-on cards: the overall progress bar. */
export function progress(items) {
    let done = 0, n = 0;
    for (const it of items) if (it.section !== 'auto') { const d = stepsDone(it); done += d.done; n += d.n; }
    return { done, n, pct: n ? Math.round((100 * done) / n) : 0 };
}

/** Whether a test shows under a filter chip. */
export function matches(item, filter) {
    const s = statusOf(item);
    const who = w => item.section !== 'auto' && (item.steps || []).some(st => stepOf(st).who === w);
    if (filter === 'all') return true;
    if (filter === 'human') return who('human');
    if (filter === 'robot') return item.section === 'auto' || who('robot');
    if (filter === 'interactive') return Boolean(item.interactive);
    if (filter === 'decide') return Boolean(safeLink(item.decision?.link)) && s !== 'pass';
    if (filter === 'open') return s !== 'pass';
    return s === filter;
}

/** A link the page will show: https only, so a seed or an added test can never carry a script link. */
export function safeLink(url) {
    return typeof url === 'string' && /^https:\/\/\S+$/.test(url) ? url : null;
}

/** Counts for the header: hands-on by status, automatic green/red. */
export function tally(items) {
    const t = { raven: { ready: 0, waiting: 0, pass: 0, fail: 0, blocked: 0 }, auto: { pass: 0, fail: 0, waiting: 0 }, interactive: 0, decide: 0 };
    for (const it of items) {
        t[it.section === 'auto' ? 'auto' : 'raven'][statusOf(it)]++;
        if (it.interactive && statusOf(it) !== 'pass') t.interactive++;
        if (safeLink(it.decision?.link) && statusOf(it) !== 'pass') t.decide++;
    }
    return t;
}

/** What each header count jumps to: tap a count, land on the next card it counted (in list order, wrapping). */
export const JUMPS = {
    ready: it => it.section !== 'auto' && statusOf(it) === 'ready',
    waiting: it => it.section !== 'auto' && statusOf(it) === 'waiting',
    fail: it => it.section !== 'auto' && statusOf(it) === 'fail',
    pass: it => it.section !== 'auto' && statusOf(it) === 'pass',
    interactive: it => Boolean(it.interactive) && statusOf(it) !== 'pass',
    decide: it => Boolean(safeLink(it.decision?.link)) && statusOf(it) !== 'pass',
    green: it => it.section === 'auto' && statusOf(it) === 'pass',
    red: it => it.section === 'auto' && statusOf(it) === 'fail',
};

/** The id of the next card a count points at, after the one it last landed on (null when it counts none). */
export function nextMatch(items, kind, afterId) {
    const order = [...items.filter(it => it.section !== 'auto'), ...items.filter(it => it.section === 'auto')];   // the page's order
    const hits = order.filter(JUMPS[kind]).map(it => it.id);
    if (!hits.length) return null;
    const at = hits.indexOf(afterId);
    return hits[(at + 1) % hits.length];
}

/** Plain text of one test's results, for pasting into its thread. */
export function resultsText(item) {
    const label = Object.fromEntries(RESULTS);
    const lines = [`Test Bench: ${item.title} (${STATUS[statusOf(item)][1]})`];
    (item.steps || []).forEach((s, i) => {
        const r = item.stepResults?.[i], st = stepOf(s);
        lines.push(`${i + 1}. ${st.who === 'robot' ? '🤖 ' : ''}${st.text}`, `   -> ${r?.result ? label[r.result] : 'not done yet'}${r?.note ? `: ${r.note}` : ''}`);
    });
    for (const n of item.notes || []) lines.push(`Note ${n.at.slice(0, 16).replace('T', ' ')} UTC: ${n.text}`);
    const voices = (item.evidence || []).filter(e => String(e.type).startsWith('audio/')), pics = (item.evidence || []).length - voices.length;
    for (const v of voices) lines.push(`Voice note ${v.at.slice(0, 16).replace('T', ' ')} UTC${v.step != null ? ` (step ${v.step + 1})` : ''}: ${v.text || '(not written out yet)'}`);
    if (pics) lines.push(`Pictures on the lab Test Bench: ${pics}`);
    return lines.join('\n');
}

/** "2026-11-14 16:10 UTC" from an ISO time. */
export const when = iso => (iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : '');

// ---- Page ---------------------------------------------------------------------------------------------------------

const $ = id => document.getElementById(id);
const page = { items: [], filter: 'open', open: new Set(), bench: {}, drafts: new Map(), timers: new Map(), chains: new Map(), rec: null, voiceMsg: new Map() };

/* Typed text lives in page.drafts until the server has it, so a redraw (after any save or upload) never wipes it. */
if (typeof window !== 'undefined') window.addEventListener('beforeunload', e => { if (page.drafts.size) { e.preventDefault(); e.returnValue = ''; } });

function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k);
    return e;
}

async function call(path, options) {
    const r = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}bench=${encodeURIComponent(BENCH)}`, { cache: 'no-store', ...options });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}
const send = (method, path, obj) => call(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const q = (id, extra = '') => `id=${encodeURIComponent(id)}${extra}`;

async function load() {
    const data = await call('items');
    page.items = data.items;
    page.fetch = data.autoFetch;
    page.bench = data.bench || {};
    render();
    renderTakes();
}

function render() {
    const b = page.bench;
    document.documentElement.dataset.bench = b.theme || b.id || 'vcge';
    if (b.title) { document.title = `Flight Deck: ${b.title}`; $('benchTitle').textContent = `${b.emoji || '🧪'} ${b.title}`; }
    if (b.intro) $('benchIntro').textContent = b.intro;
    if (b.sections?.raven) $('ravenName').textContent = b.sections.raven;
    if (b.sections?.auto) $('autoName').textContent = b.sections.auto;
    $('autoPanel').hidden = !page.items.some(it => it.section === 'auto');
    const p = progress(page.items);
    $('allBar').style.width = `${p.pct}%`;
    $('allBar').parentElement.setAttribute('aria-valuenow', String(p.pct));
    $('allNote').textContent = `${p.done} of ${p.n} steps done (${p.pct}%)`;
    const t = tally(page.items);
    const go = (kind, n, text, cls = '') => el('button', { type: 'button', class: `jump ${cls}`, 'data-jump': kind, text, disabled: !n,
        title: n ? 'Tap to go to the next one' : 'None right now', onclick: () => jump(kind) });
    // (replaceChildren writes a null as the text "null": the yes/no count is left out with filter, not null)
    $('tally').replaceChildren(...[
        go('ready', t.raven.ready, `🙋 ${t.raven.ready} ready`), go('waiting', t.raven.waiting, `⏳ ${t.raven.waiting} waiting`),
        go('fail', t.raven.fail, `❌ ${t.raven.fail} failed`), go('pass', t.raven.pass, `✅ ${t.raven.pass} passed`),
        go('interactive', t.interactive, `🔁 ${t.interactive} interactive open`),
        t.decide ? go('decide', t.decide, `👉 ${t.decide} need your yes or no`, 'decide-count') : null,
        go('green', t.auto.pass, `🤖 ${t.auto.pass} green`), go('red', t.auto.fail, `🤖 ${t.auto.fail} red`)].filter(Boolean));
    const show = page.items.filter(it => matches(it, page.filter));
    const raven = show.filter(it => it.section !== 'auto');
    const auto = show.filter(it => it.section === 'auto');
    $('ravenList').replaceChildren(...(raven.length ? raven.map((it, i) => ravenItem(it, i + 1)) : [el('li', { class: 'empty', text: 'Nothing here under this filter.' })]));
    $('autoList').replaceChildren(...(auto.length ? auto.map(autoItem) : [el('li', { class: 'empty', text: 'Nothing here under this filter.' })]));
    const f = page.fetch;
    jumpBar();
    $('fetchNote').textContent = f ? `Last read ${when(f.at)}${f.errors?.length ? ` · could not read: ${f.errors.join(', ')}` : ''}` : 'Not read yet; the service reads GitHub every 15 minutes.';
}

/** A count was tapped: show its next card (switching to All if the filter hides it), open it, scroll to it, flash it. */
function jump(kind) {
    const id = nextMatch(page.items, kind, page.jumped?.[kind]);
    if (!id) return;
    page.jumped = { ...page.jumped, [kind]: id };
    page.jumpKind = kind;
    if (!matches(page.items.find(it => it.id === id), page.filter)) {
        page.filter = 'all';
        for (const c of document.querySelectorAll('[data-filter]')) c.classList.toggle('on', c.dataset.filter === 'all');
    }
    page.open.add(id);
    render();
    const li = document.querySelector(`li.item[data-id="${CSS.escape(id)}"]`);
    if (!li) return;
    li.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1600);
    li.querySelector('summary')?.focus({ preventScroll: true });
}

const JUMP_NAMES = { ready: '🙋 ready', waiting: '⏳ waiting', fail: '❌ failed', pass: '✅ passed', interactive: '🔁 interactive',
    decide: '👉 needs your yes or no', green: '🤖 green', red: '🤖 red' };

/** After a jump, a bar at the bottom: which one of how many, Next, back to the counts. */
function jumpBar() {
    const bar = $('jumpBar');
    const kind = page.jumpKind;
    const hits = kind ? [...page.items.filter(it => it.section !== 'auto'), ...page.items.filter(it => it.section === 'auto')].filter(JUMPS[kind]) : [];
    if (!kind || !hits.length) { bar.hidden = true; return; }
    const at = hits.findIndex(it => it.id === page.jumped?.[kind]) + 1;
    bar.hidden = false;
    bar.replaceChildren(el('span', { class: 'where', text: `${JUMP_NAMES[kind]}: ${at || 1} of ${hits.length}` }),
        el('button', { type: 'button', class: 'btn small primary', text: 'Next ▸', onclick: () => jump(kind) }),
        el('button', { type: 'button', class: 'btn small', text: '↑ Counts', onclick: () => $('tally').scrollIntoView({ block: 'center' }) }),
        el('button', { type: 'button', class: 'btn small', text: '✕', 'aria-label': 'Close', onclick: () => { page.jumpKind = null; bar.hidden = true; } }));
}

function shell(it, num, summaryKids, bodyKids) {
    const s = statusOf(it);
    const d = el('details', { open: page.open.has(it.id), ontoggle: () => (d.open ? page.open.add(it.id) : page.open.delete(it.id)) },
        el('summary', {}, el('span', { class: 'num', text: num }), el('span', { class: 'ttl' }, it.title,
            it.interactive ? el('span', { class: 'badge', text: '🔁 Interactive' }) : null),
        el('span', { class: `pill ${s}`, text: `${STATUS[s][0]} ${STATUS[s][1]}` }), ...summaryKids, decideLink(it, 'decide-sum'), askRow(it, 'ask-sum'), pmButton(it, 'pm-sum')),
        el('div', { class: 'body' }, ...bodyKids));
    return el('li', { class: 'item', 'data-status': s, 'data-id': it.id }, d);
}

/** The threads raven575 can ask about a step in, as safe {label, href} pairs (seed field ask: [{label, link}]). */
export function askLinks(it) {
    return (Array.isArray(it.ask) ? it.ask : []).map(a => ({ label: String(a?.label || 'the thread'), href: safeLink(a?.link) })).filter(a => a.href);
}

function askRow(it, cls) {
    const links = askLinks(it);
    if (!links.length) return null;
    return el('span', { class: `ask-row ${cls}` }, ...links.map(a => el('a', { class: 'ask', href: a.href, target: '_blank', rel: 'noopener noreferrer',
        onclick: e => e.stopPropagation(), text: `💬 Ask in ${a.label} ↗` })));
}

/** Which team's PM chat an item taps through to: its own seed field pm, else the bench's pm (keys as in /pm-links.js). */
export function pmKey(it, bench) {
    const k = (it && typeof it.pm === 'string' && it.pm) || (bench && typeof bench.pm === 'string' && bench.pm) || '';
    return /^[a-z0-9-]{1,24}$/.test(k) ? k : null;
}

/** The owning PM's chat button from /pm-links.js (one list for the whole deck); nothing if that file or the key is missing. */
function pmButton(it, cls) {
    const pm = globalThis.HERD_PM, key = pmKey(it, page.bench);
    if (!pm || !key || it.section === 'auto') return null;
    const node = pm.element(document, key, cls);
    if (node && node.tagName === 'A') node.addEventListener('click', e => e.stopPropagation());
    return node;
}

/** The one-tap link to where raven575 answers a yes or no (claude.ai, a PR, a Run button). */
function decideLink(it, cls) {
    const href = safeLink(it.decision?.link);
    if (!href || statusOf(it) === 'pass') return null;
    return el('a', { class: `decide ${cls}`, href, target: '_blank', rel: 'noopener noreferrer', onclick: e => e.stopPropagation(),
        text: `👉 ${it.decision.label || 'Answer here'} ↗` });
}

function ravenItem(it, num) {
    const { done, n } = stepsDone(it);
    const bar = el('span', { class: 'bar mini', role: 'img', 'aria-label': `${done} of ${n} steps done` }, el('i', { style: `width:${n ? (100 * done) / n : 0}%` }));
    let section = null;
    const steps = [];
    (it.steps || []).forEach((s, i) => {
        const st = stepOf(s);
        if (page.filter === 'human' && st.who !== 'human') return;
        if (page.filter === 'robot' && st.who !== 'robot') return;
        if (st.section && st.section !== section) { section = st.section; steps.push(el('li', { class: 'sec', text: section })); }
        steps.push(stepRow(it, st, i));
    });
    return shell(it, `${num}.`, [el('span', { class: 'sub', text: `${it.area || ''} · ${done} of ${n} steps done${it.updated ? ` · last ${when(it.updated)}` : ''}` }), bar], [
        safeLink(it.decision?.link) ? el('p', { class: 'decide-box' }, el('b', { text: '👉 Needs your yes or no: ' }),
            it.decision.ask || it.title, it.decision.where ? ` (${it.decision.where})` : '', ' ', decideLink(it, 'decide-body')) : null,
        it.why ? el('p', { class: 'note', text: it.why }) : null,
        safeLink(it.link) ? el('p', {}, el('a', { href: it.link, target: '_blank', rel: 'noopener noreferrer', text: 'Open the PR ↗' })) : null,
        it.where ? el('p', {}, el('b', { text: 'Where: ' }), it.where) : null,
        it.interactive ? el('p', { class: 'inter' }, el('b', { text: `🔁 Interactive: report each step in ${it.interactive.thread}. ` }), it.interactive.how || '') : null,
        el('h4', { text: 'Steps' }),
        el('ol', { class: 'steps' }, steps),
        statusRow(it), notesBox(it), evidenceBox(it),
        el('div', { class: 'row' }, el('button', { class: 'btn small', type: 'button', text: '📋 Copy my results', onclick: e => copy(e.target, resultsText(it)) })),
    ]);
}

function stepRow(it, st, i) {
    const rec = it.stepResults?.[i] || {};
    const robotLine = rec.robot || st.robot;
    const key = `${it.id}|${i}`;
    const note = el('textarea', { rows: 2, placeholder: 'What I saw (or paste the output). Saves by itself.', 'aria-label': `What I saw at step ${i + 1}`, 'data-key': key });
    note.value = page.drafts.has(key) ? page.drafts.get(key) : rec.note || '';
    const saved = el('span', { class: 'saved', role: 'status',
        text: page.drafts.has(key) ? 'not saved yet' : rec.at ? `✓ saved ${when(rec.at)}` : '' });
    // One save at a time per step, in order: leaving the box (an autosave) and the Pass tap that caused it must not race,
    // or the older one could land last and undo the result.
    const put = result => {
        const run = (page.chains.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
            const text = page.drafts.has(key) ? page.drafts.get(key) : note.value;
            await send('PUT', `step?${q(it.id, `&n=${i}`)}`, { result: typeof result === 'function' ? result() : result, note: text });
            if (page.drafts.get(key) === text) page.drafts.delete(key);
        });
        page.chains.set(key, run);
        return run;
    };
    const save = async result => {   // a Pass / Fail / Skip tap: save, then redraw
        clearTimeout(page.timers.get(key));
        saved.textContent = 'saving…';
        try { await put(result); await load(); } catch (e) { saved.textContent = `⚠ not saved: ${e.message}`; }
    };
    const autosave = async () => {   // typing: save quietly, no redraw, so the keyboard stays up
        clearTimeout(page.timers.get(key));
        if (!page.drafts.has(key)) return;
        try {
            let r = '';
            await put(() => (r = it.stepResults?.[i]?.result || ''));
            it.stepResults = { ...(it.stepResults || {}), [i]: { ...(it.stepResults?.[i] || {}), result: r, note: note.value, at: new Date().toISOString() } };
            if (!page.drafts.has(key)) saved.textContent = '✓ saved';
        } catch (e) { saved.textContent = `⚠ not saved: ${e.message}`; }
    };
    note.addEventListener('input', () => {
        page.drafts.set(key, note.value); saved.textContent = 'saving soon…';
        clearTimeout(page.timers.get(key)); page.timers.set(key, setTimeout(autosave, 1200));
    });
    note.addEventListener('blur', autosave);
    return el('li', { class: `step ${st.who}`, value: i + 1 }, el('span', { class: 'what' },
            el('span', { class: `who ${st.who}`, text: st.who === 'robot' ? '🤖 ROBOT' : '👤 YOU' }), `${i + 1}. ${st.text}`),
        robotLine ? el('span', { class: 'res', text: `🤖 ${robotLine}${st.resultAt && !rec.robot ? `  (${when(st.resultAt)})` : ''}` }) : null,
        el('div', { class: 'row' }, RESULTS.map(([v, label]) => el('button', {
            class: `btn small ${v}`, type: 'button', text: label, 'aria-pressed': String(rec.result === v),
            onclick: () => save(rec.result === v ? '' : v),
        }))),
        note, el('div', { class: 'row' }, voiceButton(it, i, key), saved,
            uploader(it, i, '📎 Picture for this step')));
}

function statusRow(it) {
    const msg = el('span', { class: 'note', role: 'status' });
    const sel = el('select', { 'aria-label': 'Status of this test', onchange: async () => {
        try { await send('PUT', `status?${q(it.id)}`, { status: sel.value }); await load(); } catch (e) { msg.textContent = `not saved: ${e.message}`; } } },
    Object.entries(STATUS).map(([v, [icon, label]]) => el('option', { value: v, selected: v === statusOf(it), text: `${icon} ${label}` })));
    return el('div', { class: 'row' }, el('b', { text: 'Status' }), sel, msg);
}

function notesBox(it) {
    const key = `${it.id}|notes`;
    const box = el('textarea', { rows: 3, placeholder: 'What you found overall', 'aria-label': `Note on ${it.title}`, 'data-key': key });
    box.value = page.drafts.get(key) || '';
    const msg = el('span', { class: 'note', role: 'status', text: page.drafts.has(key) ? 'not saved yet: tap Add note' : '' });
    box.addEventListener('input', () => {
        if (box.value.trim()) { page.drafts.set(key, box.value); msg.textContent = 'not saved yet: tap Add note'; } else { page.drafts.delete(key); msg.textContent = ''; }
    });
    return el('div', { class: 'notes' }, el('h4', { text: '📝 Notes' }),
        (it.notes || []).length ? el('ul', { class: 'log' }, it.notes.map(n => el('li', {}, el('time', { text: when(n.at) }), n.text))) : null,
        box, el('div', { class: 'row' }, voiceButton(it, null, key), el('button', { class: 'btn small primary', type: 'button', text: 'Add note', onclick: async () => {
            try { await send('POST', `note?${q(it.id)}`, { text: box.value }); page.drafts.delete(key); await load(); } catch (e) { msg.textContent = `⚠ not saved: ${e.message}`; } } }), msg));
}

function evidenceBox(it) {
    const ev = it.evidence || [];
    const pics = ev.filter(e => !String(e.type).startsWith('audio/')), voices = ev.filter(e => String(e.type).startsWith('audio/'));
    const src = e => `${API}evidence?${q(it.id, `&hash=${e.hash}`)}`;
    const where = e => `${e.step != null ? `step ${e.step + 1} · ` : ''}${when(e.at)}`;
    return el('div', {}, el('h4', { text: `📷 Pictures (${pics.length})` }),
        pics.length ? el('div', { class: 'shots' }, pics.map(e => el('a', { href: src(e), target: '_blank', rel: 'noopener' },
            el('img', { src: src(e), alt: e.name, loading: 'lazy' }), where(e)))) : null,
        voices.length ? el('h4', { text: `🎙 Voice notes (${voices.length})` }) : null,
        voices.length ? el('ul', { class: 'voices' }, voices.map(e => {
            const msg = el('span', { class: 'note', role: 'status' });
            return el('li', {}, el('span', { class: 'note', text: where(e) }), el('audio', { controls: true, preload: 'none', src: src(e) }),
                e.text ? el('p', { class: 'said', text: e.text }) : el('span', {}, el('button', { class: 'btn small', type: 'button', text: '✍ Write it out',
                    onclick: async ev2 => { ev2.target.disabled = true; msg.textContent = 'writing it out on the lab…';
                        try { await call(`transcribe?${q(it.id, `&hash=${e.hash}`)}`, { method: 'POST' }); await load(); }
                        catch (err) { msg.textContent = `⚠ ${err.message}`; ev2.target.disabled = false; } } }), msg));
        })) : null,
        uploader(it, null, '📷 Drop or pick photos or screenshots'));
}

function uploader(it, step, label) {
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true });
    const msg = el('span', { class: 'note', role: 'status' });
    const box = el('label', { class: step == null ? 'drop' : 'btn small' }, label, input);
    const up = async files => {
        let n = 0;
        for (const f of files) {
            try {
                msg.textContent = `sending ${f.name}…`;
                await call(`evidence?${q(it.id, `&name=${encodeURIComponent(f.name)}${step == null ? '' : `&step=${step}`}`)}`, { method: 'PUT', body: f });
                n++;
            } catch (e) { msg.textContent = `${f.name}: ${e.message}`; return; }
        }
        msg.textContent = `✓ ${n} added`; await load();
    };
    input.addEventListener('change', () => up([...input.files]));
    if (step == null) {
        box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
        box.addEventListener('dragleave', () => box.classList.remove('over'));
        box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('over'); up([...e.dataTransfer.files]); });
    }
    return el('span', {}, box, msg);
}

/* ---- Voice notes. Never lose a take: the recording is kept in this browser (IndexedDB) every second while you talk,
 * sent to the lab as soon as you stop, and only then forgotten here. The lab writes it out on its own CPU
 * (testbench-transcribe.py, faster-whisper): no audio goes to Google or anyone else. The words land in the box they
 * were spoken for, where they save like typing. ---- */
const TAKES = 'testbench-takes';
function takesDb() {
    return new Promise((ok, no) => {
        const r = indexedDB.open(TAKES, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('takes', { keyPath: 'id' });
        r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
    });
}
async function takes(mode, fn) {
    try {
        const db = await takesDb();
        return await new Promise((ok, no) => { const t = db.transaction('takes', mode); const r = fn(t.objectStore('takes')); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); });
    } catch { return undefined; }   // private mode or no IndexedDB: the take still goes to the lab when you stop
}
const keepTake = take => takes('readwrite', st => st.put(take));
const dropTake = id => takes('readwrite', st => st.delete(id));
const unsentTakes = async () => (await takes('readonly', st => st.getAll())) || [];

function voiceSay(key, text) { page.voiceMsg.set(key, text); const m = document.querySelector(`[data-voice-msg="${CSS.escape(key)}"]`); if (m) m.textContent = text; }

/** Puts the words at the end of the box they were spoken for, and lets the box save them like typing. */
function putWords(key, text) {
    const box = document.querySelector(`textarea[data-key="${CSS.escape(key)}"]`);
    const base = box ? box.value : page.drafts.get(key) || '';
    const value = base.trim() ? `${base.replace(/\s+$/, '')} ${text}` : text;
    if (box) { box.value = value; box.dispatchEvent(new Event('input')); } else page.drafts.set(key, value);
}

/** Sends one take, then has the lab write it out. A take stays in this browser until the lab has it. */
async function sendTake(take) {
    const ext = take.mime.includes('mp4') ? 'm4a' : take.mime.includes('ogg') ? 'ogg' : 'webm';
    voiceSay(take.key, 'sending your recording…');
    let hash;
    try {
        ({ hash } = await call(`evidence?${q(take.itemId, `&name=voice-note.${ext}${take.step == null ? '' : `&step=${take.step}`}`)}`, { method: 'PUT', body: take.blob }));
        await dropTake(take.id);
    } catch (e) { voiceSay(take.key, `⚠ not sent yet (${e.message}); it is kept in this browser, tap 🎙 Send again`); renderTakes(); return; }
    voiceSay(take.key, '✓ recording saved on the lab · writing it out…');
    let text = '';
    try {
        ({ text } = await call(`transcribe?${q(take.itemId, `&hash=${hash}`)}`, { method: 'POST' }));
        voiceSay(take.key, text ? '✓ words added to the box; check them, they save by themselves' : '✓ saved; no words heard');
    } catch (e) { voiceSay(take.key, `✓ recording saved · ⚠ ${e.message}`); }
    await load();   // redraw first (the recording shows up), then type the words into the fresh box so it saves them
    if (text) putWords(take.key, text);
}

async function startVoice(it, step, key) {
    if (page.rec) return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { voiceSay(key, `⚠ no microphone: ${e.message}`); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', ''].find(m => !m || (window.MediaRecorder?.isTypeSupported?.(m)));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const take = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, key, itemId: it.id, step, mime: rec.mimeType || mime || 'audio/webm', at: new Date().toISOString(), blob: null };
    const chunks = [];
    page.rec = { rec, stream, key, started: Date.now(), tick: setInterval(() => {
        const b = document.querySelector(`button[data-voice="${CSS.escape(key)}"]`);
        if (b) b.textContent = `⏹ Stop (${clock((Date.now() - page.rec.started) / 1000)})`;
    }, 500) };
    rec.addEventListener('dataavailable', e => { if (e.data.size) { chunks.push(e.data); take.blob = new Blob(chunks, { type: take.mime }); keepTake({ ...take }); } });
    rec.addEventListener('stop', async () => {
        clearInterval(page.rec.tick); stream.getTracks().forEach(t => t.stop()); page.rec = null;
        take.blob = new Blob(chunks, { type: take.mime });
        render();
        if (!take.blob.size) { voiceSay(key, '⚠ nothing was recorded'); await dropTake(take.id); return; }
        await keepTake(take);
        await sendTake(take);
    });
    rec.start(1000);   // a chunk every second, each one kept in this browser at once
    voiceSay(key, '🔴 recording: talk, then tap Stop');
    render();
}
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function voiceButton(it, step, key) {
    const live = page.rec?.key === key;
    const msg = el('span', { class: 'vmsg', role: 'status', 'data-voice-msg': key, text: page.voiceMsg.get(key) || '' });
    const btn = el('button', { class: `btn small voice${live ? ' live' : ''}`, type: 'button', 'data-voice': key,
        'aria-label': live ? 'Stop recording' : 'Speak a note instead of typing', disabled: !!page.rec && !live,
        text: live ? `⏹ Stop (${clock((Date.now() - page.rec.started) / 1000)})` : '🎙 Speak',
        onclick: () => (live ? page.rec.rec.stop() : startVoice(it, step, key)) });
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { btn.disabled = true; btn.title = 'This browser cannot record'; }
    return el('span', { class: 'voicebox' }, btn, msg);
}

/** Takes still in this browser (the lab was not reached): one Send button each, at the top of the list. */
async function renderTakes() {
    const box = $('takes');
    if (!box) return;
    const list = (await unsentTakes()).filter(t => t.blob && t.blob.size && page.rec?.key !== t.key);
    box.hidden = !list.length;
    box.replaceChildren(...(list.length ? [el('b', { text: `🎙 ${list.length} voice note${list.length === 1 ? '' : 's'} not sent to the lab yet: ` }),
        ...list.map(t => el('button', { class: 'btn small', type: 'button', text: `Send the one from ${when(t.at)}`,
            onclick: async e => { e.target.disabled = true; await sendTake(t); renderTakes(); } }))] : []));
}

function autoItem(it) {
    const ci = it.ci && it.ci.runId ? it.ci : null;
    const sub = ci ? `${it.area || ''} · ${ci.passed} of ${ci.total} jobs green · build ${ci.sha} · finished ${when(ci.finished)}` : `${it.area || ''} · no finished run read yet`;
    return shell(it, '🤖', [el('span', { class: 'sub', text: sub })], [
        it.why ? el('p', { class: 'note', text: it.why }) : null,
        ci ? el('p', {}, el('b', { text: 'Newest run: ' }), `${ci.title} (attempt ${ci.attempt}) `,
            el('a', { href: ci.url, target: '_blank', rel: 'noopener noreferrer', text: 'open on GitHub ↗' })) : null,
        ci ? el('ul', { class: 'jobs' }, ci.jobs.map(j => el('li', {}, el('span', { class: j.conclusion === 'success' ? 'ok' : 'bad', text: j.conclusion === 'success' ? '✓ ' : '✗ ' }),
            `${j.name}${j.conclusion !== 'success' ? ` (${j.conclusion || 'not finished'}${j.failedStep ? `, at "${j.failedStep}"` : ''})` : ''}`))) : null,
        notesBox(it),
    ]);
}

async function copy(btn, text) {
    try { await navigator.clipboard.writeText(text); btn.textContent = '📋 Copied'; } catch { prompt('Copy this:', text); }
}

function wire() {
    for (const c of document.querySelectorAll('[data-filter]')) {
        c.addEventListener('click', () => {
            page.filter = c.dataset.filter;
            for (const o of document.querySelectorAll('[data-filter]')) o.classList.toggle('on', o === c);
            render();
        });
    }
    $('refreshBtn').addEventListener('click', async () => {
        $('fetchNote').textContent = 'Reading GitHub…';
        try { await call('refresh', { method: 'POST' }); await load(); } catch (e) { $('fetchNote').textContent = `Could not read: ${e.message}`; }
    });
    $('addForm').addEventListener('submit', async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
            const r = await send('POST', 'item', { title: f.get('title'), area: f.get('area'), why: f.get('why'),
                steps: String(f.get('steps')).split('\n').map(s => s.trim()).filter(Boolean), interactive: f.get('interactive') === 'on', thread: f.get('thread'),
                decisionLink: f.get('decisionLink') });
            e.target.reset(); $('addNote').textContent = 'Added.'; page.open.add(r.id); await load();
        } catch (err) { $('addNote').textContent = err.message; }
    });
}

if (typeof document !== 'undefined') {
    wire();
    load().catch(e => { $('ravenList').replaceChildren(el('li', { class: 'empty', text: `Could not reach the Test Bench service: ${e.message}` })); });
}
