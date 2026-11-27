/**
 * vCGE lab: the Night Shift's scoring (pure functions; the robot page uses them, Node tests them). Lab only.
 *
 * A Card Factory card knows its answers (manifest truth), so a read is scored field by field with no typing. Saved
 * rows keep numbers and labels (font, layout, effects) only, never what a card says.
 */

export const FIELDS = ['name', 'title', 'company', 'phone', 'email', 'web', 'address'];
export const DROP_ALERT = 0.02;      // a field 2 points worse than the build before gets flagged

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const digits = (s) => String(s || '').replace(/\D/g, '');
const low = (s) => norm(s).toLowerCase();
const bareWeb = (s) => low(s).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

/** What the app's MOD05 buildFields() filled, flattened to the scoreboard's fields. */
export function readFields(f) {
    f = f || {};
    const name = [f.namePrefix, f.firstName, f.middleName, f.lastName, f.nameSuffix].map(norm).filter(Boolean).join(' ');
    return {
        name, title: norm(f.jobTitle), company: norm(f.organization),
        phones: (f.phones || []).map(p => digits(p.value)).filter(Boolean),
        emails: (f.emails || []).map(e => low(e.value || e)).filter(Boolean),
        webs: (f.websites || []).map(w => bareWeb(w.value || w)).filter(Boolean),
        street: low(f.street), unit: low([f.unitType, f.unitNumber].filter(Boolean).join(' ')), city: low(f.city), state: low(f.state), zip: digits(f.zip)
    };
}

/** Each field right (1), wrong (0) or not on the card (null). */
export function fieldsRight(read, truth) {
    const t = truth || {};
    const out = {};
    out.name = t.name ? +(low(read.name) === low(t.name)) : null;
    out.title = t.title ? +(low(read.title) === low(t.title)) : null;
    const bareCo = (x) => low(x).replace(/[.,]+$/, '');          // "Inc" and "Inc." are the same company
    out.company = t.company ? +(bareCo(read.company) === bareCo(t.company)) : null;
    const wantPhones = [t.phone, t.mobile, t.fax].map(digits).filter(Boolean);
    out.phone = wantPhones.length ? +wantPhones.every(p => read.phones.some(r => r.endsWith(p) || p.endsWith(r) && r.length >= 10)) : null;
    out.email = t.email ? +read.emails.includes(low(t.email)) : null;
    out.web = t.web ? +read.webs.includes(bareWeb(t.web)) : null;
    if (t.street) {
        // The app may keep the suite on the street line ("12 Main St, Suite 4") or in its own field: both are right
        const flat = (x) => low(x).replace(/[.,]/g, '').replace(/\s+/g, ' ');
        const want = flat(t.street), unit = flat(t.unit), got = flat(read.street), gotUnit = flat(read.unit);
        const streetOk = unit ? (got === `${want} ${unit}` || (got === want && gotUnit === unit)) : got === want;
        out.address = +(streetOk && read.city === low(t.city) && read.state === low(t.state) && read.zip === digits(t.zip));
    } else out.address = null;
    return out;
}

/** Levenshtein distance (characters). */
export function editDistance(a, b) {
    a = String(a); b = String(b);
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[b.length];
}

/** The printed text of a card from its answers, in a fixed order, for characters-right. */
export function truthText(t) {
    return [t.name, t.title, t.company, t.phone, t.mobile, t.fax, t.email, t.web, t.street, t.unit, t.city, t.state, t.zip].map(norm).filter(Boolean).join(' ');
}

/** Characters right (0..1): every word the truth holds, against everything read, order ignored per word. */
export function charsRight(readText, t) {
    const want = truthText(t).toLowerCase().split(' ').filter(Boolean);
    const got = norm(readText).toLowerCase().split(' ').filter(Boolean);
    if (!want.length) return null;
    let total = 0, wrong = 0;
    for (const w of want) {
        total += w.length;
        let best = w.length;
        for (const g of got) { const d = editDistance(w, g); if (d < best) best = d; if (!d) break; }
        wrong += best;
    }
    return Math.max(0, 1 - wrong / total);
}

/** How far the found corners are from the real ones, as a share of the card's diagonal (null when none found). */
export function cornerMiss(found, real) {
    if (!found || !real || found.length !== 4) return null;
    const diag = Math.hypot(real[2][0] - real[0][0], real[2][1] - real[0][1]) || 1;
    // The finder may start at any corner: take the best rotation
    let best = Infinity;
    for (let s = 0; s < 4; s++) {
        let m = 0;
        for (let i = 0; i < 4; i++) { const f = found[(i + s) % 4]; m = Math.max(m, Math.hypot((f.x ?? f[0]) - real[i][0], (f.y ?? f[1]) - real[i][1])); }
        best = Math.min(best, m);
    }
    return best / diag;
}

/**
 * Print & Snap: which printed card a photo shows, from what was read. Phone digits and email addresses count most,
 * then name and company words. Returns { n, score } or null when nothing is a clear match.
 */
export function matchCard(readText, read, printed) {
    const text = low(readText), dig = digits(readText);
    let best = null, second = 0;
    for (const c of printed) {
        const t = c.truth || {};
        let s = 0;
        for (const p of [t.phone, t.mobile, t.fax].map(digits).filter(Boolean)) if (dig.includes(p.slice(-7))) s += 3;
        if (t.email && (text.includes(low(t.email)) || (read && read.emails.includes(low(t.email))))) s += 3;
        for (const w of `${t.name} ${t.company}`.toLowerCase().split(/\W+/).filter(w => w.length > 3)) if (text.includes(w)) s += 1;
        if (!best || s > best.score) { second = best ? best.score : 0; best = { n: c.n, score: s }; }
        else if (s > second) second = s;
    }
    return best && best.score >= 4 && best.score - second >= 2 ? best : null;
}

/** Averages per field over rows; a field a row lacks (null) is left out of that field's average. */
export function mean(rows) {
    const out = { n: rows.length };
    for (const k of ['chars', 'edges', 'turnedDown', ...FIELDS]) {
        const vals = rows.map(r => r.values[k]).filter(v => v != null);
        out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    out.allFields = rows.length ? rows.filter(r => FIELDS.every(f => r.values[f] == null || r.values[f] === 1)).length / rows.length : null;
    return out;
}

/** The scoreboard: everything, then grouped by font group, layout and each effect present. */
export function scoreboard(rows) {
    const groups = {};
    const add = (key, r) => (groups[key] = groups[key] || []).push(r);
    for (const r of rows) {
        add(`font: ${r.group || 'unknown'}`, r);
        add(`layout: ${r.layout || 'unknown'}`, r);
        if (r.nameStyle) add(`names: ${r.nameStyle}`, r);
        for (const e of Object.keys(r.effects || {})) add(`effect: ${e}`, r);
        if (!Object.keys(r.effects || {}).some(e => !e.startsWith('background:'))) add('effect: none', r);
    }
    return { all: mean(rows), groups: Object.entries(groups).map(([label, rs]) => ({ label, ...mean(rs) })).sort((a, b) => (a.chars ?? 1) - (b.chars ?? 1)) };
}

/** Fields that got worse by DROP_ALERT or more from the previous build's scoreboard on the same set kind. */
export function drops(now, before) {
    if (!before) return [];
    const out = [];
    for (const k of ['chars', 'edges', 'allFields', ...FIELDS]) {
        const a = now.all[k], b = before.all[k];
        if (a != null && b != null && b - a >= DROP_ALERT) out.push({ field: k, before: b, now: a });
    }
    return out;
}

const pct = (x) => (x == null ? '–' : `${Math.round(x * 1000) / 10}%`);

/** The text the morning reader gets: numbers and labels only. */
export function scoreboardMd(board, info, dropped = []) {
    const line = (g) => `- ${g.label}: ${g.n} cards, ${pct(g.chars)} characters, every field right ${pct(g.allFields)}; ${FIELDS.map(f => `${f} ${pct(g[f])}`).join(', ')}${g.edges != null ? `, edges ${pct(g.edges)}` : ''}${g.turnedDown ? `, turned down ${pct(g.turnedDown)}` : ''}`;
    return [`Night Shift ${info.job} run: set ${info.set}, build ${info.build}, ${info.when}`,
        line({ ...board.all, label: 'every card' }),
        dropped.length ? `⚠️ Worse than ${info.before}: ${dropped.map(d => `${d.field} ${pct(d.before)} → ${pct(d.now)}`).join(', ')}` : (info.before ? `No drop against ${info.before}.` : 'First run on this set kind; nothing to compare yet.'),
        'Hardest groups (10+ cards):', ...board.groups.filter(g => g.n >= 10).slice(0, 6).map(line)].join('\n');
}
