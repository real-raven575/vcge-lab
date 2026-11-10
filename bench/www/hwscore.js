/**
 * vCGE lab: handwriting bench scoring (Glyph, MOD04). Lab only; never part of the app.
 * Pure functions, no page access, so node can test them (bench/test/hwscore.test.mjs).
 *
 * A handwriting sample is scored as one passage: every line the reader returned, joined, against every line that is
 * really written, joined. Line breaks are ignored on purpose: a reader that splits one written line in two still read
 * the words. Three numbers come out of it:
 *   - characters right, exact (capitals count),
 *   - characters right, ignoring capitals (so "HELLO" read as "Hello" shows as a case problem, not a reading problem),
 *   - words right, aligned in order (a word counts only if it is spelled exactly, ignoring capitals).
 */

export const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Edit distance between two sequences (strings or arrays), with the edit list for confusions. */
export function editOps(a, b) {
    const n = a.length, m = b.length, d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) d[i][0] = i;
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const ops = []; let i = n, j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { ops.push({ op: a[i - 1] === b[j - 1] ? 'eq' : 'sub', a: a[i - 1], b: b[j - 1] }); i--; j--; }
        else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'del', a: a[i - 1], b: '' }); i--; }
        else { ops.push({ op: 'ins', a: '', b: b[j - 1] }); j--; }
    }
    return { distance: d[n][m], ops: ops.reverse() };
}

/** Runs of edits as "read → written" pairs, e.g. { from: 'rn', to: 'm' }. */
export function confusions(ops) {
    const out = []; let cur = null;
    for (const o of ops) {
        if (o.op === 'eq') { if (cur) { out.push(cur); cur = null; } continue; }
        cur = cur || { from: '', to: '' }; cur.from += o.a; cur.to += o.b;
    }
    if (cur) out.push(cur);
    return out;
}

/**
 * Scores one sample. readLines: what the reader returned (strings), or null when it gave up.
 * truthLines: what is really written (strings). Returns counts, so many samples can be added up fairly.
 */
export function scoreHandwriting(readLines, truthLines) {
    const truth = norm((truthLines || []).join(' '));
    const read = norm((readLines || []).join(' '));
    const exact = editOps(read, truth);
    const noCase = editOps(read.toLowerCase(), truth.toLowerCase());
    const tw = truth ? truth.toLowerCase().split(' ') : [];
    const rw = read ? read.toLowerCase().split(' ') : [];
    const words = editOps(rw, tw);
    const wordsRight = words.ops.filter(o => o.op === 'eq').length;
    const want = (truthLines || []).map(norm).filter(Boolean);
    const got = new Set((readLines || []).map(norm));
    const chars = truth.length;
    return {
        failed: readLines == null,
        chars, errors: exact.distance, errorsNoCase: noCase.distance,
        words: tw.length, wordsRight,
        lines: want.length, linesExact: want.filter(l => got.has(l)).length,
        charAccuracy: chars ? Math.max(0, 1 - exact.distance / chars) : (read ? 0 : 1),
        charAccuracyNoCase: chars ? Math.max(0, 1 - noCase.distance / chars) : (read ? 0 : 1),
        wordAccuracy: tw.length ? wordsRight / tw.length : (rw.length ? 0 : 1),
        confusions: confusions(exact.ops),
        ops: exact.ops,
    };
}

/** Adds up scored samples. Accuracies are weighted by characters / words, so a long note counts more than one word. */
export function aggregate(scores) {
    const t = { n: scores.length, failed: 0, chars: 0, errors: 0, errorsNoCase: 0, words: 0, wordsRight: 0, lines: 0, linesExact: 0, confusions: {} };
    for (const s of scores) {
        t.failed += s.failed ? 1 : 0; t.chars += s.chars; t.errors += Math.min(s.errors, s.chars); t.errorsNoCase += Math.min(s.errorsNoCase, s.chars);
        t.words += s.words; t.wordsRight += s.wordsRight; t.lines += s.lines; t.linesExact += s.linesExact;
        if (s.failed) continue;   // a gave-up read has no letters to confuse; it is counted in failed
        for (const c of s.confusions) { const k = `${c.from || '∅'} → ${c.to || '∅'}`; t.confusions[k] = (t.confusions[k] || 0) + 1; }
    }
    t.charAccuracy = t.chars ? 1 - t.errors / t.chars : 0;
    t.charAccuracyNoCase = t.chars ? 1 - t.errorsNoCase / t.chars : 0;
    t.wordAccuracy = t.words ? t.wordsRight / t.words : 0;
    t.topConfusions = Object.entries(t.confusions).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return t;
}

/** Guesses the letter case of a passage: 'upper', 'lower' or 'mixed' (digits and symbols do not count). */
export function guessCase(text) {
    const letters = String(text || '').replace(/[^A-Za-z]/g, '');
    if (!letters) return 'mixed';
    if (letters === letters.toUpperCase()) return 'upper';
    if (letters === letters.toLowerCase()) return 'lower';
    return 'mixed';
}

/** Guesses style and case from a sample's file name, e.g. "hw-cursive-lower-zeyada.jpg". Unknown parts stay ''. */
export function tagsFromName(name) {
    const m = /(?:^|[-_ ])(print|cursive)(?:[-_ ]+(upper|lower|mixed))?/i.exec(String(name || ''));
    return { style: m ? m[1].toLowerCase() : '', case: m && m[2] ? m[2].toLowerCase() : '' };
}
