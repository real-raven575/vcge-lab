/** vCGE lab: the Night Shift scoreboard page. Reads the service's lists; shows numbers and labels only. */
const API = new URL('api/', location.href).href;
const $ = (id) => document.getElementById(id);
const pct = (x) => (x == null ? '–' : `${Math.round(x * 1000) / 10}%`);
const get = async (p) => { const r = await fetch(API + p, { cache: 'no-store' }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

async function main() {
    const [{ scoreboards }, { sets }, { photos }] = await Promise.all([get('scoreboards'), get('sets'), get('snaps')]);
    const latest = $('latest'); latest.replaceChildren();
    const newest = scoreboards.filter(s => s.when && s.when.slice(0, 10) === (scoreboards[0] || {}).when?.slice(0, 10));
    if (!newest.length) latest.append(el('p', 'No runs yet. The first one happens tonight at 2 AM Eastern.', 'muted'));
    for (const s of newest) latest.append(el('pre', s.md || ''));
    const sheets = $('sheets'); sheets.replaceChildren();
    const printed = sets.filter(s => s.kind === 'printed');
    if (!printed.length) sheets.append(el('li', 'No sheets yet. Ask Cornerstone for a printed set.', 'muted'));
    for (const s of printed) {
        const li = el('li'); const a = el('a', `${s.name}: ${s.count} cards (PDF)`); a.href = `${API}sheet?set=${encodeURIComponent(s.name)}`; li.append(a); sheets.append(li);
    }
    $('snaps').textContent = `${photos.length} Print & Snap photo${photos.length === 1 ? '' : 's'} on the lab.`;
    const rows = $('rows'); rows.replaceChildren();
    for (const s of scoreboards) {
        const tr = el('tr');
        const change = s.drops && s.drops.length ? el('td', `worse: ${s.drops.map(d => d.field).join(', ')}`, 'drop') : el('td', s.before ? `no drop vs ${s.before}` : '–', s.before ? 'same' : '');
        [s.when.replace('T', ' ').slice(0, 16), s.build, s.job, s.set, String(s.board.all.n), pct(s.board.all.chars), pct(s.board.all.allFields)].forEach(t => tr.append(el('td', t)));
        tr.append(change); rows.append(tr);
    }
}
main().catch(e => { $('latest').replaceChildren(el('p', `Could not load: ${e.message}`, 'drop')); });
