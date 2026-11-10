/**
 * vCGE lab: The Scriptorium, Glyph's handwriting bench (MOD04). Lab only; never part of the app.
 *
 * Reads every sample in the bench's "handwriting" set with ONE published build's own reader (MOD04 ocrWorker.js and the
 * bundled Tesseract.js, imported by URL from /v/<build>/src/...), in this browser. No edge finding: notes are not cards.
 * The person types or confirms what is really written; scoring is in hwscore.js. It uses the Reading Room's file
 * service as it is (bench/api: builds, samples, upload, photo, truth, runs), so no server change is needed.
 * Truth for a handwriting sample: { lines: [{ text, role: 'note' }], hw: { style, case }, checked: true|false }.
 * Runs are saved with summary.kind = 'handwriting' so this page lists only its own.
 */
import { scoreHandwriting, aggregate, guessCase, tagsFromName, norm } from './hwscore.js';

const ROOT = location.pathname.replace(/bench\/.*$/, '');
const API = `${ROOT}bench/api/`;
const SET = 'handwriting';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const say = (t) => { $('glyphSays').textContent = t; };

const state = { build: null, samples: [], truths: {}, results: [], stop: false, ocr: null };

async function api(path, options) {
    const r = await fetch(API + path, { cache: 'no-store', ...options });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `${path}: HTTP ${r.status}`);
    return body;
}
const q = (name) => `set=${SET}&name=${encodeURIComponent(name)}`;

// ---- Builds, samples, saved text -------------------------------------------------------------------------------------

async function loadBuilds() {
    const { builds, latest } = await api('builds');
    const wanted = new URLSearchParams(location.search).get('build') || latest || (builds[0] && builds[0].short);
    const sel = $('buildSelect');
    sel.replaceChildren(...builds.map(b => new Option(`${b.short}  ${b.subject.slice(0, 70)}${b.source ? '' : '  (source not published yet)'}`, b.short, false, b.short === wanted)));
    sel.addEventListener('change', () => { location.search = `?build=${encodeURIComponent(sel.value)}`; });
    state.build = builds.find(b => b.short === sel.value) || null;
    $('buildNote').textContent = state.build ? `${state.build.date.slice(0, 16).replace('T', ' ')} UTC` : 'No builds published yet.';
    if (state.build && !state.build.source) { $('buildNote').textContent += '. Its source is not published yet; pick another build.'; $('runBtn').disabled = true; }
}

async function loadSamples() {
    const { sets } = await api('samples');
    state.samples = sets[SET] || [];
    await Promise.all(state.samples.filter(s => s.truth && !state.truths[s.name]).map(async s => {
        const got = await api(`truth?${q(s.name)}`).catch(() => null);
        if (got && got.lines) state.truths[s.name] = got;
    }));
    showSampleNote();
}

/** Style and case for a sample: saved truth first, then the file name, then (case only) the saved text. */
function tagsFor(name) {
    const t = state.truths[name], fromName = tagsFromName(name);
    const text = t ? t.lines.map(l => l.text).join(' ') : '';
    return { style: (t && t.hw && t.hw.style) || fromName.style || '', case: (t && t.hw && t.hw.case) || fromName.case || (text ? guessCase(text) : '') };
}

function picked() {
    const st = $('fStyle').value, cs = $('fCase').value, only = $('fUnchecked').checked;
    return state.samples.filter(s => { const t = tagsFor(s.name); const truth = state.truths[s.name];
        return (!st || t.style === st) && (!cs || t.case === cs) && (!only || !(truth && truth.checked)); });
}

function showSampleNote() {
    const all = state.samples.length, checked = state.samples.filter(s => (state.truths[s.name] || {}).checked).length;
    const by = (k, v) => state.samples.filter(s => tagsFor(s.name)[k] === v).length;
    $('countHand').textContent = `(${all})`;
    $('sampleNote').textContent = all
        ? `${by('style', 'print')} print, ${by('style', 'cursive')} cursive; ${by('case', 'upper')} UPPER, ${by('case', 'lower')} lower, ${by('case', 'mixed')} Mixed. ${checked} of ${all} checked by you. ${picked().length} will run with these filters.`
        : 'No handwriting samples yet. Add photos above.';
}

async function upload(files) {
    for (const f of files) { $('runStatus').textContent = `Uploading ${f.name}…`; await api(`upload?${q(f.name)}`, { method: 'PUT', body: f }); }
    $('runStatus').textContent = `${plural(files.length, 'file')} added.`;
    await loadSamples();
}

// ---- The build's own reader --------------------------------------------------------------------------------------------

async function loadReader() {
    if (state.ocr) return state.ocr;
    const b = `${ROOT}v/${state.build.short}/`;
    const base = document.createElement('base'); base.href = new URL(b, location.href).href; document.head.prepend(base);
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = `${b}src/vendor/tesseract/tesseract.min.js`; s.onload = res; s.onerror = () => rej(new Error('tesseract.min.js not found in this build')); document.head.append(s); });
    state.ocr = await import(`${b}src/modules/mod04-ocr/ocrWorker.js`);
    return state.ocr;
}

const photoUrl = (name) => `${API}photo?${q(name)}`;

/** One sample through the build's reader. Never throws; a reader that gives up returns lines = null. */
async function readSample(name) {
    const r = { name, lines: null, outcome: 'read', error: null, ms: 0, confidence: null };
    const t = performance.now();
    try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('photo failed to load')); i.src = photoUrl(name); });
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
        const read = await state.ocr.executeOCRScan(c.toDataURL('image/png'), { onStatus: s => { $('runStatus').textContent = `${name}: ${s === 'starting' ? 'preparing the reader' : 'reading'}…`; } });
        const lines = read.lines && read.lines.length ? read.lines : String(read.text || '').split('\n');
        r.lines = lines.map(l => norm(typeof l === 'string' ? l : (l && l.text))).filter(Boolean);
        r.confidence = read.confidence;
    } catch (e) {
        r.outcome = (e && e.code) || 'error'; r.error = e && e.message ? e.message : String(e);
    }
    r.ms = Math.round(performance.now() - t);
    return r;
}

async function runAll() {
    const jobs = picked();
    if (!jobs.length) { $('runStatus').textContent = 'No samples match these filters.'; return; }
    $('runBtn').disabled = true; $('stopBtn').disabled = false; state.stop = false;
    $('progress').classList.remove('hidden'); $('progressFill').style.width = '0';
    say(`Reading ${plural(jobs.length, 'sample')}. Cursive makes my feathers itch.`);
    try { await loadReader(); } catch (e) {
        $('runStatus').textContent = `Could not load the build's reader: ${e.message}`; say("I couldn't open this build's reader. Pick another build.");
        $('runBtn').disabled = false; $('stopBtn').disabled = true; return;
    }
    state.results = []; $('rows').replaceChildren(); $('results').classList.remove('hidden'); $('board').classList.add('hidden');
    for (let i = 0; i < jobs.length && !state.stop; i++) {
        const r = await readSample(jobs[i].name);
        state.results.push(r); $('rows').append(renderSample(r));
        $('progressFill').style.width = `${Math.round(((i + 1) / jobs.length) * 100)}%`;
        $('runStatus').textContent = `${i + 1} of ${jobs.length} read`;
    }
    const gaveUp = state.results.filter(r => !r.lines).length;
    $('runStatus').textContent = `${state.stop ? 'Stopped' : 'Done'}: ${state.results.length} of ${jobs.length} read${gaveUp ? `, ${gaveUp} gave up` : ''}.`;
    say(gaveUp ? `Done. I gave up on ${plural(gaveUp, 'sample')} rather than guess. Check the boxes and save.` : 'Done. Check what is really written, then save and I will score myself.');
    $('runBtn').disabled = false; $('stopBtn').disabled = true;
    updateBoard();
}

// ---- One sample on screen ---------------------------------------------------------------------------------------------

function diffHtml(ops) {
    return ops.map(o => o.op === 'eq' ? esc(o.a) : o.op === 'sub' ? `<del title="written: ${esc(o.b)}">${esc(o.a)}</del>` : o.op === 'del' ? `<del title="not written">${esc(o.a)}</del>` : `<ins title="missed">${esc(o.b)}</ins>`).join('');
}

function renderSample(r) {
    const truth = state.truths[r.name], tags = tagsFor(r.name);
    const el = document.createElement('article'); el.className = 'hwcard'; el.dataset.name = r.name;
    const prefill = truth ? truth.lines.map(l => l.text).join('\n') : (r.lines || []).join('\n');
    el.innerHTML = `
      <h3>${esc(r.name)} <span class="tagchip"></span> <span class="outcome ${r.lines ? '' : 'bad'}">${r.lines ? `read in ${(r.ms / 1000).toFixed(1)} s${r.confidence != null ? `, confidence ${Math.round(r.confidence)}` : ''}` : `gave up (${esc(r.outcome)})`}</span></h3>
      <div class="hw-grid">
        <img class="hw-photo" alt="sample ${esc(r.name)}" loading="lazy" src="${photoUrl(r.name)}">
        <div class="hw-read"><b>Reader got</b><pre class="readout"></pre><p class="note err">${esc(r.error || '')}</p></div>
        <div class="hw-truth">
          <label><b>Really written</b> <span class="src note">${truth ? (truth.checked ? 'checked by you' : 'from the sample\'s saved text, not checked yet') : 'started from what the reader got: fix it'}</span>
            <textarea rows="4" spellcheck="false"></textarea></label>
          <div class="row tight">
            <label class="field-inline">Style <select class="st"><option value="">?</option><option value="print">print</option><option value="cursive">cursive</option></select></label>
            <label class="field-inline">Case <select class="cs"><option value="">?</option><option value="upper">UPPER</option><option value="lower">lower</option><option value="mixed">Mixed</option></select></label>
            <button class="btn quiet ok" type="button">Looks right</button>
            <label class="check"><input type="checkbox" class="unreadable"> I can't read it either</label>
          </div>
          <p class="score note"></p>
        </div>
      </div>`;
    const ta = el.querySelector('textarea'); ta.value = prefill;
    el.querySelector('.st').value = tags.style; el.querySelector('.cs').value = tags.case;
    el.querySelector('.unreadable').checked = !!(truth && truth.unreadable);
    el.checked = !!(truth && truth.checked);
    const refresh = () => {
        const want = ta.value.split('\n').map(norm).filter(Boolean);
        const s = scoreHandwriting(r.lines, want);
        el.querySelector('.readout').innerHTML = r.lines ? diffHtml(s.ops) || '<i>nothing</i>' : '<i>nothing: the reader gave up</i>';
        el.querySelector('.score').innerHTML = el.querySelector('.unreadable').checked ? 'Left out of the score (unreadable to a person too).'
            : `<span class="acc ${s.charAccuracy >= 0.95 ? 'good' : ''}">${pct(s.charAccuracy)}</span> characters, ${pct(s.charAccuracyNoCase)} ignoring capitals, ${s.wordsRight}/${s.words} words`;
        const t = el.querySelector('.tagchip'); const st = el.querySelector('.st').value, cs = el.querySelector('.cs').value;
        t.textContent = [st, cs === 'upper' ? 'UPPER' : cs === 'mixed' ? 'Mixed' : cs].filter(Boolean).join(' · ');
        el.classList.toggle('checked', el.checked);
        el.querySelector('.src').textContent = el.checked ? 'checked by you' : el.querySelector('.src').textContent;
    };
    ta.addEventListener('input', () => { el.checked = true; refresh(); updateBoard(); });
    el.querySelectorAll('select, .unreadable').forEach(x => x.addEventListener('change', () => { el.checked = true; refresh(); updateBoard(); }));
    el.querySelector('.ok').addEventListener('click', () => { el.checked = true; refresh(); updateBoard(); });
    el.read = r;
    el.getTruth = () => ({ lines: ta.value.split('\n').map(norm).filter(Boolean).map(text => ({ text, role: 'note' })),
        hw: { style: el.querySelector('.st').value, case: el.querySelector('.cs').value || guessCase(ta.value) },
        checked: !!el.checked, unreadable: el.querySelector('.unreadable').checked });
    refresh();
    return el;
}

// ---- Scoreboard ------------------------------------------------------------------------------------------------------

function scoredRows() {
    return [...document.querySelectorAll('#rows .hwcard')].map(el => ({ el, truth: el.getTruth() }))
        .filter(x => !x.truth.unreadable && x.truth.lines.length)
        .map(x => ({ name: x.el.dataset.name, checked: x.truth.checked, style: x.truth.hw.style || '?', case: x.truth.hw.case || '?',
            score: scoreHandwriting(x.el.read.lines, x.truth.lines.map(l => l.text)), ms: x.el.read.ms }));
}

function board() {
    const rows = scoredRows();
    const group = (f) => aggregate(rows.filter(f).map(r => r.score));
    const all = group(() => true);
    const cells = [];
    for (const st of ['print', 'cursive']) for (const cs of ['upper', 'lower', 'mixed']) cells.push({ st, cs, t: group(r => r.style === st && r.case === cs) });
    return { rows, all, cells, byStyle: { print: group(r => r.style === 'print'), cursive: group(r => r.style === 'cursive') },
        byCase: { upper: group(r => r.case === 'upper'), lower: group(r => r.case === 'lower'), mixed: group(r => r.case === 'mixed') },
        checked: rows.filter(r => r.checked).length };
}

const cell = (t) => t.n ? `<b>${pct(t.charAccuracy)}</b><small>${pct(t.wordAccuracy)} words · n ${t.n}${t.failed ? ` · ${t.failed} gave up` : ''}</small>` : '<small>–</small>';

function updateBoard() {
    const b = board();
    if (!b.rows.length) { $('board').classList.add('hidden'); return; }
    $('board').classList.remove('hidden');
    const caseName = { upper: 'UPPER', lower: 'lower', mixed: 'Mixed' };
    $('boardBody').innerHTML = `
      <p class="big"><span class="acc ${b.all.charAccuracy >= 0.95 ? 'good' : ''}">${pct(b.all.charAccuracy)}</span> of characters right
        (${pct(b.all.charAccuracyNoCase)} ignoring capitals), ${pct(b.all.wordAccuracy)} of words, over ${plural(b.all.n, 'sample')};
        the reader gave up on ${b.all.failed}. ${b.checked < b.rows.length ? `<span class="warn">${b.rows.length - b.checked} not checked by you yet.</span>` : 'All checked by you.'}</p>
      <table class="grid"><thead><tr><th></th>${['upper', 'lower', 'mixed'].map(c => `<th>${caseName[c]}</th>`).join('')}<th>All</th></tr></thead><tbody>
        ${['print', 'cursive'].map(st => `<tr><th>${st}</th>${b.cells.filter(c => c.st === st).map(c => `<td>${cell(c.t)}</td>`).join('')}<td>${cell(b.byStyle[st])}</td></tr>`).join('')}
        <tr><th>All</th>${['upper', 'lower', 'mixed'].map(c => `<td>${cell(b.byCase[c])}</td>`).join('')}<td>${cell(b.all)}</td></tr>
      </tbody></table>
      <h3>Most common misreads (read → written)</h3>
      <div class="confusions">${b.all.topConfusions.map(([k, n]) => `<span class="confusion"><span class="q">${esc(k)}</span> <span class="n">×${n}</span></span>`).join('') || '<span class="note">none</span>'}</div>`;
    $('boardMd').value = boardMd(b);
}

function boardMd(b) {
    const line = (label, t) => t.n ? `- ${label}: ${pct(t.charAccuracy)} characters (${pct(t.charAccuracyNoCase)} ignoring capitals), ${pct(t.wordAccuracy)} words, ${t.n} samples, gave up ${t.failed}` : '';
    return [`Handwriting bench (The Scriptorium), build ${state.build ? state.build.short : '?'}, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        `Checked by a person: ${b.checked} of ${b.rows.length}`,
        line('All', b.all), line('Print', b.byStyle.print), line('Cursive', b.byStyle.cursive),
        ...b.cells.map(c => line(`${c.st} ${c.cs}`, c.t)),
        `- Top misreads: ${b.all.topConfusions.slice(0, 8).map(([k, n]) => `${k} ×${n}`).join(', ') || 'none'}`].filter(Boolean).join('\n');
}

async function save() {
    const els = [...document.querySelectorAll('#rows .hwcard')];
    if (!els.length) return;
    $('saveBtn').disabled = true; $('saveStatus').textContent = 'Saving…';
    try {
        for (const el of els) {
            const t = el.getTruth();
            if (!t.lines.length && !t.unreadable) continue;
            await api(`truth?${q(el.dataset.name)}`, { method: 'PUT', body: JSON.stringify(t) });
            state.truths[el.dataset.name] = t;
        }
        const b = board();
        const summary = { kind: 'handwriting', samples: b.all.n, checked: b.checked, charAccuracy: b.all.charAccuracy, charAccuracyNoCase: b.all.charAccuracyNoCase,
            wordAccuracy: b.all.wordAccuracy, gaveUp: b.all.failed, linesExact: b.all.linesExact, linesTotal: b.all.lines,
            print: b.byStyle.print.n ? b.byStyle.print.charAccuracy : null, cursive: b.byStyle.cursive.n ? b.byStyle.cursive.charAccuracy : null };
        const report = `<!doctype html><meta charset="utf-8"><title>Handwriting run ${esc(state.build.short)}</title><body style="font:15px system-ui;background:#0E1626;color:#D9DFE8;padding:16px"><pre>${esc(boardMd(b))}</pre>
          <table border="1" cellpadding="4" style="border-collapse:collapse">${b.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.style)} ${esc(r.case)}</td><td>${pct(r.score.charAccuracy)}</td><td>${r.score.wordsRight}/${r.score.words} words</td><td>${r.checked ? 'checked' : 'not checked'}</td></tr>`).join('')}</table></body>`;
        const res = await api('runs', { method: 'POST', body: JSON.stringify({ build: state.build.short, kind: 'handwriting', summary, summaryMd: boardMd(b), reportHtml: report,
            results: b.rows.map(r => ({ name: r.name, style: r.style, case: r.case, checked: r.checked, charAccuracy: r.score.charAccuracy, charAccuracyNoCase: r.score.charAccuracyNoCase, words: r.score.words, wordsRight: r.score.wordsRight, failed: r.score.failed, ms: r.ms, read: (state.results.find(x => x.name === r.name) || {}).lines || null })) }) });
        $('saveStatus').textContent = `Saved ${plural(els.length, 'sample')}' text and the run (${res.path}).`;
        say(`Scored and filed. ${pct(b.all.charAccuracy)} of characters. I'll do better; owls are patient.`);
        showSampleNote(); await loadRuns();
    } catch (e) {
        $('saveStatus').textContent = `Failed: ${e.message}`;
    }
    $('saveBtn').disabled = false;
}

async function loadRuns() {
    const { runs } = await api('runs');
    const mine = runs.filter(r => r.summary && r.summary.kind === 'handwriting');
    $('runsTable').querySelector('tbody').replaceChildren(...mine.map(r => { const s = r.summary, tr = document.createElement('tr');
        tr.innerHTML = `<td>${esc(r.when.replace(/T(\d\d)-(\d\d)-\d\dZ/, ' $1:$2'))}</td><td><code>${esc(r.build)}</code></td><td>${s.samples}</td><td>${pct(s.charAccuracy)}</td><td>${pct(s.charAccuracyNoCase)}</td><td>${pct(s.wordAccuracy)}</td><td>${s.gaveUp}</td><td><a href="${ROOT}bench/data/runs/${esc(r.build)}/${esc(r.when)}/report.html">report</a></td>`; return tr; }));
    if (!mine.length) { const tr = document.createElement('tr'); tr.innerHTML = '<td colspan="8" class="note">No handwriting runs saved yet.</td>'; $('runsTable').querySelector('tbody').append(tr); }
}

// ---- Boot ------------------------------------------------------------------------------------------------------------
$('uploadHand').addEventListener('change', (e) => upload([...e.target.files]).catch(err => { $('runStatus').textContent = `Upload failed: ${err.message}`; }).finally(() => { e.target.value = ''; }));
['fStyle', 'fCase', 'fUnchecked'].forEach(id => $(id).addEventListener('change', showSampleNote));
$('runBtn').addEventListener('click', () => runAll().catch(e => { $('runStatus').textContent = `Run failed: ${e.message}`; $('runBtn').disabled = false; $('stopBtn').disabled = true; }));
$('stopBtn').addEventListener('click', () => { state.stop = true; $('stopBtn').disabled = true; });
$('saveBtn').addEventListener('click', save);
Promise.all([loadBuilds(), loadSamples(), loadRuns()]).catch(e => { $('runStatus').textContent = `The bench service is not answering: ${e.message}`; say("The lab's file service isn't answering. Nothing to read until it's back."); });
