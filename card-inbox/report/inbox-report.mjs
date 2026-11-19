// Card Inbox accuracy report (read-only). Scores every saved reading against each card's saved answers with the
// lab's own scoring code (www/inbox/inbox.js + www/bench/*.js), and prints numbers and card nicknames only:
// never what a card says.   Run:  node inbox-report.mjs <INBOX_ROOT> <LAB_ROOT>/www
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, www] = process.argv.slice(2);
if (!root || !www) { console.error('usage: node inbox-report.mjs <INBOX_ROOT> <LAB_ROOT>/www'); process.exit(2); }
const { voteLines, angleSummary } = await import(pathToFileURL(join(www, 'inbox/inbox.js')).href);
const setrun = await import(pathToFileURL(join(www, 'bench/setrun.js')).href);
const { FIELDS, fieldsRight } = setrun;
// sameValue is exported by newer setrun.js; the same rule here for older lab installs.
const sameValue = setrun.sameValue || ((field, read, truth) => {
    const a = String(read || '').replace(/\s+/g, ' ').trim(), b = String(truth || '').replace(/\s+/g, ' ').trim();
    if (field === 'phone' || field === 'fax') { const da = a.replace(/\D/g, ''), db = b.replace(/\D/g, ''); return !!db && da === db; }
    if (field === 'email' || field === 'web') return a.toLowerCase() === b.toLowerCase();
    return a === b;
});
// Own copy of inbox.js fieldTally (added after the lab's Nov 10 install), so the report runs on either version.
const fieldTally = (scores, voted, truth) => {
    const per = scores.map(s => fieldsRight(s, truth)), vote = voted ? fieldsRight(voted, truth) : null;
    return Object.keys(FIELDS).filter(f => per.some(r => r[f] !== null) || (vote && vote[f] !== null))
        .map(f => ({ field: f, right: per.filter(r => r[f] === true).length, of: per.filter(r => r[f] !== null).length, vote: vote ? vote[f] : null }));
};
const { scoreSample } = await import(pathToFileURL(join(www, 'bench/bench.js')).href);
const pct = x => (x == null ? '  -  ' : `${(100 * x).toFixed(0).padStart(3)}%`);
const rows = [], fields = {}, all = [], notRead = [];
for (const id of readdirSync(join(root, 'cards')).sort()) {
    const f = join(root, 'cards', id, 'card.json');
    if (!existsSync(f)) continue;
    const card = JSON.parse(readFileSync(f, 'utf8'));
    const truth = card.truth && card.truth.lines && card.truth.lines.length ? card.truth : null;
    const read = card.photos.map(p => ({ p, r: card.results[p.hash] })).filter(x => x.r && x.r.outcome === 'read');
    const why = {};
    for (const p of card.photos) { const r = card.results[p.hash]; const k = !r ? 'not run' : r.outcome; if (k !== 'read') why[k] = (why[k] || 0) + 1; }
    if (Object.keys(why).length) notRead.push(`${card.name}: ${Object.entries(why).map(([k, n]) => `${n} ${k}`).join(', ')}`);
    if (!truth) { rows.push({ name: card.name, angles: card.photos.length, read: read.length, note: 'no answers saved' }); continue; }
    const sc = r => scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: r.lines }, { ...truth, edgesOk: true, hadQuad: r.edges });
    const scores = read.map(x => sc(x.r));
    const sum = angleSummary(read.map((x, i) => ({ name: x.p.name, chars: scores[i].charAccuracy })));
    const voted = voteLines(read.map(x => x.r.lines));
    const vs = voted.length ? scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: voted }, { ...truth, edgesOk: true, hadQuad: true }) : null;
    const tally = fieldTally(scores, vs, truth);
    for (const t of tally) { const a = (fields[t.field] ||= { right: 0, of: 0, vote: 0, cards: 0 }); a.right += t.right; a.of += t.of; a.cards++; if (t.vote) a.vote++; }
    scores.forEach(s => all.push(s.charAccuracy));
    rows.push({ name: card.name, angles: card.photos.length, read: read.length, avg: sum && sum.average, best: sum && sum.best.chars, worst: sum && sum.weakest.chars,
        vote: vs && vs.charAccuracy, lines: vs ? `${vs.linesExact}/${vs.linesTotal}` : '-', fieldsVote: `${tally.filter(t => t.vote).length}/${tally.length}`,
        edges: read.filter(x => x.r.edges).length });
}
console.log('Card              angles read  avg   best  worst  vote  lines(vote)  fields(vote)  edges');
for (const r of rows) {
    if (r.note) { console.log(`${r.name.padEnd(17)} ${String(r.angles).padStart(5)} ${String(r.read).padStart(4)}  (${r.note})`); continue; }
    console.log(`${r.name.padEnd(17)} ${String(r.angles).padStart(5)} ${String(r.read).padStart(4)} ${pct(r.avg)} ${pct(r.best)} ${pct(r.worst)} ${pct(r.vote)}  ${r.lines.padStart(9)}  ${r.fieldsVote.padStart(11)}  ${String(r.edges).padStart(5)}`);
}
const scored = rows.filter(r => !r.note);
const mean = a => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : null);
console.log(`\nOVERALL  cards ${scored.length}  angles ${all.length}  every-angle avg ${pct(mean(all))}  per-card avg ${pct(mean(scored.filter(r => r.avg != null).map(r => r.avg)))}  vote avg ${pct(mean(scored.filter(r => r.vote != null).map(r => r.vote)))}`);
console.log('\nField     angles right   share  cards right after vote');
for (const [k, a] of Object.entries(fields)) console.log(`${k.padEnd(9)} ${`${a.right}/${a.of}`.padStart(12)}  ${pct(a.of ? a.right / a.of : null)}  ${`${a.vote}/${a.cards}`.padStart(8)}`);
console.log('\nAngles not read (outcome codes):');
for (const l of notRead) console.log('  ' + l);
// Why unreadable: numbers from the error message only (confidence, readable words, sharp/blurry), edges found, build.
console.log('\nUnreadable angles (card, angle#, build, edges, confidence, readable words, photo looked):');
const ucount = { edges: 0, noEdges: 0, sharp: 0, blurry: 0 };
for (const id of readdirSync(join(root, 'cards')).sort()) {
    const f = join(root, 'cards', id, 'card.json');
    if (!existsSync(f)) continue;
    const card = JSON.parse(readFileSync(f, 'utf8'));
    card.photos.forEach((p, i) => {
        const r = card.results[p.hash];
        if (!r || r.outcome !== 'OCR_UNREADABLE') return;
        const m = /confidence (\d+), (\d+) readable words/.exec(r.error || '') || [];
        const sharp = /sharp but/.test(r.error || '');
        ucount[r.edges ? 'edges' : 'noEdges']++; ucount[sharp ? 'sharp' : 'blurry']++;
        console.log(`  ${card.name.padEnd(16)} #${i + 1}  ${String(r.build || '?').padEnd(9)} edges ${r.edges ? 'yes' : 'no '}  conf ${m[1] ?? '?'}  words ${m[2] ?? '?'}  ${sharp ? 'sharp' : 'blurry'}`);
    });
}
console.log(`  totals: edges found ${ucount.edges}, no edges ${ucount.noEdges}; sharp ${ucount.sharp}, blurry ${ucount.blurry}`);
const builds = {};
for (const id of readdirSync(join(root, 'cards'))) { const f = join(root, 'cards', id, 'card.json'); if (!existsSync(f)) continue;
    for (const r of Object.values(JSON.parse(readFileSync(f, 'utf8')).results || {})) builds[r.build || '?'] = (builds[r.build || '?'] || 0) + 1; }
console.log('Builds used: ' + Object.entries(builds).map(([b, n]) => `${b} x${n}`).join(', '));

// If the unreadable check were off: builds that know gate: false keep the lines of a reading the app would reject
// (result.failedGate). Score those against the answers, one row per angle, so a fairer check can be picked from data.
console.log('\nIf the unreadable check were off (angles the app rejects but read anyway):');
console.log('Card              angle  conf  words  look     chars  fields');
const off = [], offCards = [];
for (const id of readdirSync(join(root, 'cards')).sort()) {
    const f = join(root, 'cards', id, 'card.json');
    if (!existsSync(f)) continue;
    const card = JSON.parse(readFileSync(f, 'utf8'));
    const truth = card.truth && card.truth.lines && card.truth.lines.length ? card.truth : null;
    if (!truth) continue;
    const sc = r => scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: r.lines }, { ...truth, edgesOk: true, hadQuad: r.edges });
    const every = [];
    card.photos.forEach((p, i) => {
        const r = card.results[p.hash];
        if (!r || !(r.outcome === 'read' || r.failedGate) || !Array.isArray(r.lines)) return;
        every.push(r.lines);
        if (!r.failedGate) return;
        const s1 = sc(r), ft = fieldTally([s1], null, truth);
        off.push({ ...r.failedGate, chars: s1.charAccuracy });
        console.log(`${card.name.padEnd(17)} #${String(i + 1).padEnd(4)} ${String(r.failedGate.confidence).padStart(4)}  ${String(r.failedGate.readableWords).padStart(5)}  ${r.failedGate.sharp ? 'sharp ' : 'blurry'}  ${pct(s1.charAccuracy)}  ${ft.filter(t => t.right).length}/${ft.length}`);
    });
    if (every.length) {
        const v = voteLines(every);
        const vs = v.length ? scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: v }, { ...truth, edgesOk: true, hadQuad: true }) : null;
        const ft = fieldTally([], vs, truth);
        offCards.push({ name: card.name, n: every.length, vote: vs && vs.charAccuracy, fields: `${ft.filter(t => t.vote).length}/${ft.length}` });
    }
}
if (!off.length) console.log('  none: no result has failedGate yet (rerun the cards with a build that has gate: false)');
console.log('\nVote over every angle with the check off:');
for (const c of offCards) console.log(`  ${c.name.padEnd(17)} angles ${c.n}  vote ${pct(c.vote)}  fields ${c.fields}`);
const band = (lo, hi) => off.filter(x => x.sharp && x.readableWords >= lo && x.readableWords < hi).map(x => x.chars);
console.log('\nSharp rejected angles by readable words: ' + [[0, 3], [3, 6], [6, 10], [10, 999]].map(([lo, hi]) => { const a = band(lo, hi); return `${lo}-${hi === 999 ? '+' : hi - 1}: ${a.length} angles avg ${pct(mean(a))}`; }).join('; '));

// Why a field missed, on the angles the app read: each answer-key line of a field is either not found at all, found but
// put in another box (which one), or in the right box with a slip (how many characters, and where). Role names and
// counts only, never the text.
console.log('\nWhy fields missed (answer-key lines on read angles):');
const why = {};
const add = (field, k) => { const w = (why[field] ||= {}); w[k] = (w[k] || 0) + 1; };
const nrm = t => String(t || '').replace(/\s+/g, ' ').trim();
for (const id of readdirSync(join(root, 'cards')).sort()) {
    const f = join(root, 'cards', id, 'card.json');
    if (!existsSync(f)) continue;
    const card = JSON.parse(readFileSync(f, 'utf8'));
    const truth = card.truth && card.truth.lines && card.truth.lines.length ? card.truth : null;
    if (!truth) continue;
    for (const p of card.photos) {
        const r = card.results[p.hash];
        if (!r || r.outcome !== 'read') continue;
        const sc = scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: r.lines }, { ...truth, edgesOk: true, hadQuad: r.edges });
        for (const [field, roles] of Object.entries(FIELDS)) {
            for (const k of truth.lines.filter(l => !l.drop && roles.includes(l.role))) {
                const d = sc.diffs.find(x => x.truth === nrm(k.text));
                if (!d) { add(field, 'not found'); continue; }
                const box = roles.includes(d.roleRead);
                if (box && sameValue(field, d.read, d.truth)) { add(field, 'right'); continue; }
                if (!box) { add(field, `in box "${d.roleRead}"${sameValue(field, d.read, d.truth) ? ' (text right)' : ''}`); continue; }
                const off = d.ops.filter(o => o.op !== 'eq').length, first = d.ops.findIndex(o => o.op !== 'eq'), last = d.ops.length - 1 - [...d.ops].reverse().findIndex(o => o.op !== 'eq');
                const at = first === 0 ? 'start' : last === d.ops.length - 1 ? 'end' : 'middle';
                add(field, `right box, ${off <= 2 ? '1-2' : off <= 5 ? '3-5' : '6+'} chars off at the ${at}`);
            }
        }
    }
}
for (const [field, w] of Object.entries(why)) console.log(`  ${field.padEnd(8)} ` + Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join('; '));

// Colour experiment (cards rerun with ?variants=1): each rejected angle read again inverted, per colour channel and
// contrast-stretched. Per variant: how many passed the app's check, and characters right.
const vt = {};
for (const id of readdirSync(join(root, 'cards')).sort()) {
    const f = join(root, 'cards', id, 'card.json');
    if (!existsSync(f)) continue;
    const card = JSON.parse(readFileSync(f, 'utf8'));
    const truth = card.truth && card.truth.lines && card.truth.lines.length ? card.truth : null;
    if (!truth) continue;
    for (const p of card.photos) {
        const r = card.results[p.hash];
        for (const v of (r && r.variants) || []) {
            const row = ((vt[card.name] ||= {})[v.kind] ||= { n: 0, passed: 0, chars: [] });
            row.n++;
            if (v.error || !Array.isArray(v.lines)) continue;
            if (v.passed) row.passed++;
            row.chars.push(scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: v.lines }, { ...truth, edgesOk: true, hadQuad: true }).charAccuracy);
        }
    }
}
if (Object.keys(vt).length) {
    console.log('\nColour variants on rejected angles (passed the check / tried, characters right):');
    for (const [name, kinds] of Object.entries(vt)) console.log(`  ${name.padEnd(16)} ` + Object.entries(kinds).map(([k, r]) => `${k} ${r.passed}/${r.n} ${pct(mean(r.chars))}`).join('; '));
}
