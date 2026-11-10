/**
 * vCGE lab: Run a set (Glyph, MOD04). Lab only; never part of the app.
 *
 * Scores a Funhouse variant set in the Reading Room. Each version (set.json versions[]) is read like any sample; its
 * answer key is its source card's saved Reading Room truth, found by the source's Shelf name (set.json sources[]), so
 * nothing is typed (raven575, 2026-10-30: "a battery of tests to see what it got right and wrong"). The grouping by
 * effect and strength is 🐈 Iris's shared scorecard.js (a byte-for-byte copy sits beside this file); this file only
 * turns a Reading Room score into her rows. Pure functions: the page wires them up, Node tests them.
 */
import { scorecard } from './scorecard.js';

// Line roles grouped into the fields the scorecard reports (MOD05 LINE_ROLES).
export const FIELDS = Object.freeze({
    name: ['name'],
    company: ['organization'],
    phone: ['phone', 'phoneWork', 'phoneMobile', 'phoneHome'],
    email: ['email'],
    web: ['website']
});
export const MIN_TRUSTED = 10;   // groups with fewer versions are shown greyed: too few to trust

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * Which fields came out right, from a bench scoreSample() result: a field is right when every key line with one of its
 * roles was paired with a read line of the same field that reads exactly the same. null when the key has no such line.
 */
export function fieldsRight(score, truth) {
    const want = (truth.lines || []).filter(l => !l.drop);
    const out = {};
    for (const [field, roles] of Object.entries(FIELDS)) {
        const keyLines = want.filter(l => roles.includes(l.role));
        if (!keyLines.length) { out[field] = null; continue; }
        if (score.outcome !== 'read') { out[field] = false; continue; }
        out[field] = keyLines.every(k => (score.diffs || []).some(d => d.truth === norm(k.text) && roles.includes(d.roleRead) && d.ops.every(o => o.op === 'eq')));
    }
    return out;
}

/** Each version with its source's Shelf name and that name's saved truth (null when the source has no key yet). */
export function keysForSet(set, truthByName) {
    const names = Object.fromEntries((set.sources || []).map(s => [s.hash, s.name]));
    return (set.versions || []).map(v => {
        const name = names[v.source] || null;
        return { version: v, source: name, truth: (name && truthByName[name]) || null };
    });
}

/**
 * One version as a scorecard row: characters right (0-1), each field right (1, 0, or null when the key has none) and
 * turned down (1 when the reader refused the photo: too blurry, lettering, timed out; a refusal is not a misread).
 */
export function versionRow(version, score, truth) {
    const f = fieldsRight(score, truth);
    const v = { chars: score.outcome === 'read' ? score.charAccuracy : 0, turnedDown: score.outcome !== 'read' && score.outcome !== 'error' ? 1 : 0 };
    for (const [k, ok] of Object.entries(f)) v[k] = ok === null ? null : ok ? 1 : 0;
    return { n: version.n, effects: version.effects || {}, values: v };
}

/** The set's scorecard, worst characters-right first; groups under MIN_TRUSTED versions sink to the end. */
export function setScorecard(rows, settings) {
    const card = scorecard(rows, settings, { worst: 'chars' });
    const trusted = card.groups.filter(g => g.n >= MIN_TRUSTED), few = card.groups.filter(g => g.n < MIN_TRUSTED);
    return { all: card.all, groups: [...trusted.map(g => ({ ...g, trusted: true })), ...few.map(g => ({ ...g, trusted: false }))] };
}

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);

/** The text summary for a thread: numbers and effect names only, never what a card says. */
export function scorecardMd(card, { set, build, mode, scored, total }) {
    const line = (g) => `- ${g.label}: ${g.n} versions, ${pct(g.mean.chars)} characters right, name ${pct(g.mean.name)}, phone ${pct(g.mean.phone)}, email ${pct(g.mean.email)}, turned down ${pct(g.mean.turnedDown)}`;
    const worst = card.groups.filter(g => g.trusted).slice(0, 5);
    return [`Reading Room set run: set ${set}, build ${build}, ${mode === 'perfect' ? 'perfect crop' : 'as the app does it'}, ${scored} of ${total} versions scored`,
        line({ ...card.all, label: 'every version' }),
        worst.length ? `Worst groups (${MIN_TRUSTED}+ versions):` : `No group has ${MIN_TRUSTED} versions yet; make a bigger set to trust the groups.`, ...worst.map(line)].join('\n');
}
