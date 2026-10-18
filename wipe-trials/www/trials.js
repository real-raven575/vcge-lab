/* Wipe Trials (vCGE lab): a step-by-step test guide that files a Markdown report on the lab server.
 * Lab only: nothing here is part of the app. Draft state lives in this page and, when the lab's save service is
 * there, in a draft file on the server, so switching browsers to run the app does not lose the notes. */
(() => {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const API = 'api/';                          // Caddy proxies /testing/api/* to the save service
    const params = new URLSearchParams(location.search);
    const trialId = (params.get('trial') || 'cross-browser-wipe').replace(/[^a-z0-9-]/g, '');

    let trial = null;
    let state = blank();
    let apiOn = false;
    let saveTimer = 0;
    let current = 0;

    function blank() { return { stamp: null, filed: false, header: {}, results: {}, verdict: '', extra: '' }; }
    const pad = (n) => String(n).padStart(2, '0');
    /** 20261017-1741-30 in UTC, the lab's file-name form (no colons). */
    function stampName(iso) {
        const d = new Date(iso);
        return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
    }
    function stampText(iso) {
        const d = new Date(iso);
        const utc = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
        const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find(x => x.type === 'timeZoneName')?.value || '';
        return `${utc} (${pad(d.getHours())}:${pad(d.getMinutes())} ${zone})`;
    }
    const fileName = () => `${stampName(state.stamp)}_${trial.id}.md`;
    const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---- API -------------------------------------------------------------------------------------------------
    async function api(path, opts = {}) {
        const res = await fetch(API + path, { cache: 'no-store', ...opts });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.status === 204 ? null : res.json();
    }
    async function checkApi() {
        try { await api('health'); apiOn = true; } catch { apiOn = false; }
        $('saveState').textContent = apiOn ? 'Lab save service found: drafts and reports go to the server.'
            : 'No save service reached: this draft lives in this tab only, and Submit downloads the report.';
        $('saveState').className = 'save ' + (apiOn ? 'ok' : 'bad');
    }
    function scheduleSave() {
        if (!apiOn || !state.stamp || state.filed) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 1200);
    }
    async function saveDraft() {
        if (!apiOn || !state.stamp || state.filed) return;
        try {
            await api(`drafts/${stampName(state.stamp)}_${trial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
            $('saveState').textContent = `Draft saved ${new Date().toLocaleTimeString()}`;
            $('saveState').className = 'save ok';
        } catch (e) {
            $('saveState').textContent = `Draft not saved (${e.message}); keep this tab open.`;
            $('saveState').className = 'save bad';
        }
    }
    async function loadPast() {
        const ul = $('past');
        ul.innerHTML = '';
        if (!apiOn) { ul.innerHTML = '<li class="empty">Reports are listed here when the save service is running.</li>'; return; }
        try {
            const list = await api('reports');
            if (!list.length) { ul.innerHTML = '<li class="empty">No reports filed yet. Yours will be the first.</li>'; return; }
            for (const name of list.slice(0, 25)) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = `reports/${encodeURIComponent(name)}`;
                a.textContent = name;
                li.appendChild(a);
                ul.appendChild(li);
            }
        } catch (e) { ul.innerHTML = `<li class="empty">Could not list reports (${esc(e.message)}).</li>`; }
    }

    // ---- Rendering -------------------------------------------------------------------------------------------
    function render() {
        $('trialTitle').textContent = trial.title;
        $('trialSubtitle').textContent = trial.subtitle || '';
        document.title = `vCGE Lab: ${trial.title}`;
        const header = $('header');
        header.innerHTML = '';
        for (const h of trial.header) {
            const label = document.createElement('label');
            label.className = 'field';
            label.innerHTML = `<span>${icon(h.icon || 'card')}${esc(h.label)}</span>`;
            const input = document.createElement('input');
            input.type = 'text'; input.id = `h-${h.id}`; input.placeholder = h.placeholder || ''; input.autocomplete = 'off';
            input.value = state.header[h.id] || '';
            input.addEventListener('input', () => { state.header[h.id] = input.value; scheduleSave(); });
            label.appendChild(input);
            header.appendChild(label);
        }
        const tabs = $('tabs'), box = $('scenarios');
        tabs.innerHTML = ''; box.innerHTML = '';
        const total = trial.scenarios.reduce((n, s) => n + s.steps.length, 0);
        const paws = $('paws');
        paws.innerHTML = '';
        for (let i = 0; i < total; i++) paws.insertAdjacentHTML('beforeend', icon('paw'));
        trial.scenarios.forEach((sc, si) => {
            const tab = document.createElement('button');
            tab.type = 'button'; tab.className = 'tab'; tab.id = `tab-${si}`;
            tab.innerHTML = `<span class="n">${si + 1}</span>${icon(sc.icon || 'card')}<span>${esc(sc.title)}</span>`;
            tab.addEventListener('click', () => show(si));
            tabs.appendChild(tab);
            const sec = document.createElement('section');
            sec.className = 'scenario hidden'; sec.id = `sc-${si}`;
            sec.innerHTML = `<h2>${icon(sc.icon || 'card')}${si + 1}. ${esc(sc.title)}</h2><p class="intro">${esc(sc.intro || '')}</p>`;
            state.results[sc.id] ||= sc.steps.map(() => ({ r: '', notes: '' }));
            sc.steps.forEach((st, i) => {
                const res = state.results[sc.id][i];
                const row = document.createElement('div');
                row.className = 'step ' + (res.r || '');
                row.innerHTML = `<div class="num">${i + 1}</div><div class="what">${esc(st.text)}</div>
                    <div class="expect"><b>Expect:</b> ${esc(st.expect)}</div><div class="ctl"></div>`;
                const ctl = row.querySelector('.ctl');
                const seg = document.createElement('div');
                seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', `Result of step ${i + 1}`);
                for (const [val, name, ic] of [['pass', 'Pass', 'check'], ['fail', 'Fail', 'x'], ['skip', 'Skipped', 'skip']]) {
                    const b = document.createElement('button');
                    b.type = 'button'; b.innerHTML = `${icon(ic)}${name}`;
                    b.setAttribute('aria-pressed', String(res.r === val));
                    if (res.r === val) b.classList.add(`on-${val}`);
                    b.addEventListener('click', () => {
                        res.r = res.r === val ? '' : val;
                        for (const x of seg.children) { x.className = ''; x.setAttribute('aria-pressed', 'false'); }
                        if (res.r) { b.classList.add(`on-${val}`); b.setAttribute('aria-pressed', 'true'); }
                        row.className = 'step ' + (res.r || '');
                        progress(); scheduleSave();
                    });
                    seg.appendChild(b);
                }
                const notes = document.createElement('textarea');
                notes.rows = 1; notes.placeholder = 'Notes for this step: what you saw, word for word if it matters'; notes.value = res.notes;
                notes.setAttribute('aria-label', `Notes for step ${i + 1}`);
                notes.addEventListener('input', () => { res.notes = notes.value; scheduleSave(); });
                ctl.append(seg, notes);
                sec.appendChild(row);
            });
            box.appendChild(sec);
        });
        $('verdict').value = state.verdict;
        $('extra').value = state.extra;
        setEnabled(Boolean(state.stamp));
        show(Math.min(current, trial.scenarios.length - 1));
        progress();
        stamp();
    }
    function show(i) {
        current = i;
        trial.scenarios.forEach((_, si) => {
            $(`sc-${si}`).classList.toggle('hidden', si !== i);
            $(`tab-${si}`).classList.toggle('on', si === i);
            $(`tab-${si}`).setAttribute('aria-selected', String(si === i));
        });
    }
    function progress() {
        let done = 0, total = 0;
        trial.scenarios.forEach((sc, si) => {
            const rs = state.results[sc.id];
            const d = rs.filter(x => x.r).length;
            done += d; total += rs.length;
            $(`tab-${si}`).classList.toggle('done', d === rs.length);
        });
        [...$('paws').children].forEach((p, i) => p.classList.toggle('on', i < done));
        $('count').textContent = `${done} / ${total} steps`;
        const lock = $('padlock');
        lock.classList.toggle('locked', total > 0 && done === total);
        lock.querySelector('use').setAttribute('href', done === total && total > 0 ? '#i-lock' : '#i-unlock');
    }
    function stamp() {
        const on = Boolean(state.stamp);
        $('stampBox').classList.toggle('on', on);
        $('stampText').textContent = on ? `Report ${stampName(state.stamp)} started ${stampText(state.stamp)}` : 'No report started';
    }
    function setEnabled(on) {
        for (const el of document.querySelectorAll('#app input, #app textarea, #app .seg button')) el.disabled = !on;
        $('submitBtn').disabled = !on;
        $('downloadBtn').disabled = !on;
        if (!on) { $('submitState').textContent = 'Press "Start a new report" to take the time stamp and unlock the form.'; $('submitState').className = 'save'; }
    }

    // ---- Start new, Submit -----------------------------------------------------------------------------------
    function ask(title, text, yes) {
        const dlg = $('confirm');
        $('confirmTitle').textContent = title;
        $('confirmText').textContent = text;
        dlg.querySelector('.btn-danger').textContent = yes;
        return new Promise(resolve => {
            dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
            dlg.showModal();
        });
    }
    async function startNew() {
        const ok = await ask('Are you sure you want to clear all fields and start new?',
            state.stamp ? 'The current draft is left on the server as it is; a fresh report starts with a new time stamp.' : 'The time stamp is taken the moment you say yes.',
            'Yes, start new');
        if (!ok) return;
        state = blank();
        state.stamp = new Date().toISOString();
        current = 0;
        render();
        $('submitState').textContent = `New report ${fileName()} started. Everything you fill in from here goes into it.`;
        $('submitState').className = 'save ok';
        saveDraft();
        $(`h-${trial.header[0].id}`)?.focus();
    }
    function markdown() {
        const L = [];
        const name = fileName();
        L.push(`# ${trial.title}`, '', `Report \`${name}\` started ${stampText(state.stamp)}; submitted ${stampText(new Date().toISOString())}.`, '');
        L.push('## Setup', '', '| Field | Value |', '|---|---|');
        for (const h of trial.header) L.push(`| ${h.label} | ${(state.header[h.id] || '').replace(/\|/g, '\\|') || '(blank)'} |`);
        let pass = 0, fail = 0, skip = 0, open = 0;
        const word = { pass: 'PASS', fail: 'FAIL', skip: 'skipped', '': 'not done' };
        for (const sc of trial.scenarios) {
            L.push('', `## ${sc.title}`, '', sc.intro ? `_${sc.intro}_` : '', '');
            sc.steps.forEach((st, i) => {
                const r = state.results[sc.id][i];
                ({ pass: () => pass++, fail: () => fail++, skip: () => skip++, '': () => open++ })[r.r]();
                L.push(`${i + 1}. **${word[r.r]}** ${st.text}`, `   - Expected: ${st.expect}`);
                if (r.notes.trim()) L.push(`   - Notes: ${r.notes.trim().replace(/\n/g, '\n     ')}`);
            });
        }
        L.push('', '## Verdict', '', state.verdict.trim() || '(nothing written)', '', '## Anything else', '', state.extra.trim() || '(nothing written)', '');
        L.push('## Tally', '', `| Pass | Fail | Skipped | Not done |`, `|---|---|---|---|`, `| ${pass} | ${fail} | ${skip} | ${open} |`, '');
        L.push(`_Filed from the vCGE lab Wipe Trials page (trial \`${trial.id}\`). Lab only; nothing here was stored by the app._`, '');
        return L.filter(x => x !== undefined).join('\n');
    }
    function download(name, body) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([body], { type: 'text/markdown' }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function filed(text) {
        $('filedText').textContent = text;
        $('filed').classList.remove('hidden');
        setTimeout(() => $('filed').classList.add('hidden'), 6000);
    }
    async function submit() {
        if (!state.stamp) return;
        const open = trial.scenarios.reduce((n, sc) => n + state.results[sc.id].filter(x => !x.r).length, 0);
        if (open && !(await ask(`${open} step${open === 1 ? '' : 's'} still unmarked. File the report anyway?`, 'Unmarked steps are written as "not done". You can keep the draft and finish later instead.', 'Yes, file it'))) return;
        const name = fileName(), body = markdown();
        $('submitBtn').disabled = true;
        try {
            if (!apiOn) throw new Error('no save service');
            const out = await api('reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, body }) });
            state.filed = true;                       // the draft is done with: no more autosaves for this report
            clearTimeout(saveTimer);
            await api(`drafts/${stampName(state.stamp)}_${trial.id}`, { method: 'DELETE' }).catch(() => {});
            $('submitState').innerHTML = `Filed as <a href="reports/${encodeURIComponent(out.name)}">${esc(out.name)}</a> in the lab's testing/reports folder.`;
            $('submitState').className = 'save ok';
            filed(`Report filed: ${out.name}`);
            loadPast();
        } catch (e) {
            download(name, body);
            $('submitState').textContent = apiOn ? `The server did not take it (${e.message}); the report was downloaded instead as ${name}.`
                : `Downloaded as ${name} (no save service reached). Drop it in the lab's testing/reports folder.`;
            $('submitState').className = 'save bad';
            filed('Report downloaded');
        } finally { $('submitBtn').disabled = false; }
    }

    // ---- Boot ------------------------------------------------------------------------------------------------
    async function boot() {
        try {
            const res = await fetch(`trials/${trialId}.json`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            trial = await res.json();
        } catch (e) {
            $('loadError').textContent = `Could not load the trial "${trialId}" (${e.message}).`;
            $('loadError').classList.remove('hidden');
            $('trialTitle').textContent = 'no trial';
            return;
        }
        await checkApi();
        $('app').classList.remove('hidden');
        render();
        loadPast();
        if (apiOn) {
            try {
                const latest = await api(`drafts/latest?trial=${encodeURIComponent(trial.id)}`);
                if (latest && latest.stamp && await ask(`Resume the draft started ${stampText(latest.stamp)}?`, 'It was saved on the lab server as you typed. "No" leaves it there and shows an empty form.', 'Yes, resume')) {
                    state = { ...blank(), ...latest, filed: false };
                    render();
                }
            } catch { /* no draft */ }
        }
        $('newBtn').addEventListener('click', startNew);
        $('submitBtn').addEventListener('click', submit);
        $('downloadBtn').addEventListener('click', () => { if (state.stamp) { download(fileName(), markdown()); filed('Report downloaded'); } });
        $('verdict').addEventListener('input', e => { state.verdict = e.target.value; scheduleSave(); });
        $('extra').addEventListener('input', e => { state.extra = e.target.value; scheduleSave(); });
        window.addEventListener('pagehide', () => { if (apiOn && state.stamp && !state.filed) { clearTimeout(saveTimer); saveDraft(); } });
    }
    boot();
})();
