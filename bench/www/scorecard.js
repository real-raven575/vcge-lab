/**
 * vCGE lab: the scorecard by effect for Funhouse variant sets (raven575 asked 2026-10-30). Shared by the benches that
 * run sets (the Darkroom now; the Reading Room can import the same file), so it knows the Funhouse's set.json and
 * nothing about any bench.
 *
 * Every version records the effects it used (`effects` in set.json); the set records the ranges it drew from
 * (`settings`). Each version falls into one group per effect setting: "off" when the effect wasn't used, otherwise the
 * third of the set's range its value fell in. Categories (the background kind) group by name. The bench gives each
 * version some numbers (found, good, corner miss ...); the scorecard averages them per group, worst groups first.
 */

/** Rotation folded to -90..90 degrees, and whether the card was upside down (the Funhouse adds 180 for that). */
export function foldTurn(deg) {
    let r = ((((deg + 180) % 360) + 360) % 360) - 180;
    const upside = Math.abs(r) > 90;
    if (upside) r -= Math.sign(r) * 180;
    return { turn: Math.round(Math.abs(r) * 10) / 10, upside };
}

const fmt = (n) => (Math.abs(n) >= 10 || Number.isInteger(n) ? String(Math.round(n)) : String(Math.round(n * 100) / 100));

/** The number ranges a set drew from, per effect setting: { 'warp tilt': [0, 30], 'glare strength': [0.3, 0.9], ... }. */
function ranges(settings) {
    const out = {};
    for (const [effect, s] of Object.entries(settings || {})) {
        if (!s || s.on === false) continue;
        for (const [param, v] of Object.entries(s)) {
            if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number') continue;
            if (effect === 'warp' && param === 'rotate') out['warp turn'] = [0, Math.max(Math.abs(v[0]), Math.abs(v[1]))];
            else out[`${effect} ${param}`] = [Math.min(...v), Math.max(...v)];
        }
    }
    return out;
}

/** The groups one version belongs to: [{ dim, key, label, order }]. */
export function groupsOf(effects, settings) {
    const out = [], rs = ranges(settings), used = effects || {};
    for (const [dim, [lo, hi]] of Object.entries(rs)) {
        const [effect, param] = dim.split(' ');
        const got = used[effect];
        if (!got) {   // one "off" group per effect, however many settings it has
            if (!out.some(g => g.key === `${effect} off`)) out.push({ dim: effect, key: `${effect} off`, label: `${effect} off`, order: -1 });
            continue;
        }
        // set.json records the long side as width and height, and the turn with any upside-down 180 added
        const v = param === 'turn' ? (typeof got.rotate === 'number' ? foldTurn(got.rotate).turn : undefined)
            : effect === 'size' && param === 'long' ? Math.max(got.width || 0, got.height || 0) || undefined : got[param];
        if (typeof v !== 'number') continue;   // a value this version didn't record: no group rather than a wrong one
        const span = hi - lo, third = span > 0 ? Math.min(2, Math.max(0, Math.floor(((v - lo) / span) * 3))) : 0;
        const a = lo + (span * third) / 3, b = lo + (span * (third + 1)) / 3;
        out.push({ dim, key: `${dim} ${third}`, label: `${dim} ${fmt(a)} to ${fmt(b)}`, order: third });
    }
    if (settings && settings.warp && settings.warp.on !== false && typeof settings.warp.upside === 'number' && settings.warp.upside > 0) {
        const up = used.warp && typeof used.warp.rotate === 'number' && foldTurn(used.warp.rotate).upside;
        out.push({ dim: 'warp upside down', key: `warp upside down ${up ? 1 : 0}`, label: up ? 'card upside down' : 'card right way up', order: up ? 1 : 0 });
    }
    if (settings && settings.background && settings.background.on !== false) {
        const kind = used.background && used.background.kind;
        out.push({ dim: 'background', key: `background ${kind || 'none'}`, label: `background: ${kind || 'none'}`, order: 0 });
    }
    return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * The scorecard. rows: [{ effects, values: { name: number | null } }] (null values are left out of that average).
 * Returns { all, groups }: `all` is every row together; `groups` has one entry per group with at least one version,
 * worst first by `worst` (a value name; higher is better unless `higherIsWorse`).
 * Each entry: { key, dim, label, n, mean: { name: x }, median: { name: x } }.
 */
export function scorecard(rows, settings, { worst, higherIsWorse = false } = {}) {
    const names = [...new Set(rows.flatMap(r => Object.keys(r.values || {})))];
    const sum = (key, dim, label, order, members) => {
        const m = {}, md = {};
        for (const name of names) {
            const xs = members.map(r => r.values[name]).filter(x => typeof x === 'number');
            m[name] = mean(xs); md[name] = median(xs);
        }
        return { key, dim, label, order, n: members.length, mean: m, median: md };
    };
    const byKey = new Map();
    for (const r of rows) {
        for (const g of groupsOf(r.effects, settings)) {
            if (!byKey.has(g.key)) byKey.set(g.key, { ...g, members: [] });
            byKey.get(g.key).members.push(r);
        }
    }
    const groups = [...byKey.values()].map(g => sum(g.key, g.dim, g.label, g.order, g.members));
    if (worst) {
        const sign = higherIsWorse ? -1 : 1, v = (g) => g.mean[worst];
        groups.sort((a, b) => (v(a) == null) - (v(b) == null) || sign * (v(a) - v(b)) || b.n - a.n || a.key.localeCompare(b.key));
    }
    return { all: sum('all', 'all', 'every version', 0, rows), groups };
}
