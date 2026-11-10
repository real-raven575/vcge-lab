// Unit tests for the Reading Room's set run (setrun.js) and the compare helper in bench.js, on the Funhouse's drawn
// sample set (made-up cards, no real people; kept outside git). Run: FUNHOUSE_DIR=<the Funhouse source folder> node --test bench/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FIELDS, MIN_TRUSTED, fieldsRight, keysForSet, versionRow, setScorecard, scorecardMd } from '../www/setrun.js';
import { scoreSample, compareCards } from '../www/bench.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FUNHOUSE = process.env.FUNHOUSE_DIR || here('../../funhouse');
const set = JSON.parse(readFileSync(FUNHOUSE + '/sample-set/set.json', 'utf8'));
const truthOf = (name) => ({ edgesOk: null, hadQuad: false, lines: [
    { text: 'Velmar Studio', role: 'organization', drop: false }, { text: name, role: 'name', drop: false },
    { text: '555-0123', role: 'phone', drop: false }, { text: 'kalo@velmar.test', role: 'email', drop: false },
    { text: '42 Tesqu St, Marpo', role: 'address', drop: false }, { text: '~~~', role: 'ignore', drop: true }] });
const truths = { 'drawn-scan.jpg': truthOf('Kalo Renmi') };   // drawn-photo.jpg has no key: its versions are skipped
const readAs = (lines, outcome = 'read') => ({ set: 'funhouse', name: 'x', outcome, lines: lines.map(([text, role]) => ({ text, role, check: null })) });
const perfect = readAs([['Velmar Studio', 'organization'], ['Kalo Renmi', 'name'], ['555-0123', 'phone'], ['kalo@velmar.test', 'email'], ['42 Tesqu St, Marpo', 'address']]);

test('the scorecard is a byte copy of Iris\'s shared file', () => {
    const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
    const EDGE = process.env.EDGE_BENCH_DIR || here('../../edge-bench');
    assert.equal(sha(here('../www/scorecard.js')), sha(EDGE + '/www/scorecard.js'));
    assert.equal(sha(here('../www/scorecard.js')), 'a3fc0ac0a1821e33aba0a1122a17ee1089b8fd88422c786286baefc19f722ff4');
});

test('each version finds its source card by Shelf name; a source with no key is marked, not guessed', () => {
    const keys = keysForSet(set, truths);
    assert.equal(keys.length, set.versions.length);
    const byName = Object.fromEntries(set.sources.map(s => [s.hash, s.name]));
    for (const k of keys) {
        assert.equal(k.source, byName[k.version.source]);
        assert.equal(k.truth, k.source === 'drawn-scan.jpg' ? truths['drawn-scan.jpg'] : null);
    }
    assert.ok(keys.some(k => k.truth) && keys.some(k => !k.truth), 'the sample set has versions of both sources');
    assert.equal(keysForSet({ versions: [{ n: 1, source: 'unknown' }] }, truths)[0].source, null);
});

test('fields: right only when every key line of that field reads exactly and lands in that field', () => {
    const t = truths['drawn-scan.jpg'];
    assert.deepEqual(fieldsRight(scoreSample(perfect, t), t), { name: true, company: true, phone: true, email: true, web: null });
    const typo = readAs([['Velmar Studio', 'organization'], ['Kalo Renmi', 'name'], ['555-O123', 'phone'], ['kalo@velmar.test', 'notes']]);
    assert.deepEqual(fieldsRight(scoreSample(typo, t), t), { name: true, company: true, phone: false, email: false, web: null });
    // A phone read as a mobile number still counts as the phone field
    const mobile = readAs([['555-0123', 'phoneMobile']]);
    assert.equal(fieldsRight(scoreSample(mobile, t), t).phone, true);
    // A refused read gets every keyed field wrong
    assert.deepEqual(fieldsRight(scoreSample(readAs([], 'blurry'), t), t), { name: false, company: false, phone: false, email: false, web: null });
    assert.deepEqual(Object.keys(FIELDS), ['name', 'company', 'phone', 'email', 'web']);
});

test('a version row: characters right, fields, and a refusal is "couldn\'t read", not an error', () => {
    const t = truths['drawn-scan.jpg'], v = set.versions[0];
    const ok = versionRow(v, scoreSample(perfect, t), t);
    assert.deepEqual(ok, { n: v.n, effects: v.effects, values: { chars: 1, turnedDown: 0, name: 1, company: 1, phone: 1, email: 1, web: null } });
    const refused = versionRow(v, scoreSample(readAs([], 'blurry'), t), t).values;
    assert.equal(refused.chars, 0); assert.equal(refused.turnedDown, 1);
    const crashed = versionRow(v, scoreSample(readAs([], 'error'), t), t).values;
    assert.equal(crashed.turnedDown, 0);
});

test('the set scorecard: worst characters first, groups under 10 versions sink and are marked', () => {
    const t = truths['drawn-scan.jpg'];
    const rows = set.versions.map((v, i) => versionRow(v, scoreSample(i % 3 ? perfect : readAs([['Velmar Studio', 'organization']]), t), t));
    const card = setScorecard(rows, set.settings);
    assert.equal(card.all.n, rows.length);
    assert.ok(card.groups.length > 0);
    const firstFew = card.groups.findIndex(g => !g.trusted);
    if (firstFew >= 0) assert.ok(card.groups.slice(firstFew).every(g => !g.trusted && g.n < MIN_TRUSTED));
    for (const g of card.groups) assert.equal(g.trusted, g.n >= MIN_TRUSTED);
    // 12 copies of the set make every group trusted; then the order is worst first
    const big = setScorecard(Array.from({ length: 12 }, () => rows).flat(), set.settings);
    const trusted = big.groups.filter(g => g.trusted).map(g => g.mean.chars);
    assert.deepEqual(trusted, [...trusted].sort((a, b) => a - b));
});

test('the text summary carries numbers and effect names only, never what a card says', () => {
    const t = truths['drawn-scan.jpg'];
    const rows = set.versions.map(v => versionRow(v, scoreSample(perfect, t), t));
    const md = scorecardMd(setScorecard(rows, set.settings), { set: set.name, build: '656ffc7', mode: 'perfect', scored: rows.length, total: rows.length });
    assert.match(md, /perfect crop, 12 of 12 versions scored/);
    assert.match(md, /every version: 12 versions, 100% characters right/);
    for (const secret of ['Velmar', 'Kalo', '555', 'velmar.test', 'Tesqu']) assert.ok(!md.includes(secret), secret);
});

test('compare: groups side by side with the change in characters right', () => {
    const g = (key, chars, n = 10) => ({ key, label: key, n, mean: { chars } });
    const a = { all: g('all', 0.8, 20), groups: [g('glare off', 0.9), g('blur strength 0', 0.5)] };
    const b = { all: g('all', 0.85, 20), groups: [g('glare off', 0.9), g('noise off', 0.7)] };
    const rows = compareCards(a, b);
    assert.deepEqual(rows.map(r => r.label), ['all', 'glare off', 'blur strength 0', 'noise off'].map((x, i) => (i ? x : 'every version')));
    assert.ok(Math.abs(rows[0].change - 0.05) < 1e-9);
    assert.equal(rows[1].change, 0);
    assert.equal(rows[2].charsB, null); assert.equal(rows[2].change, null);
    assert.equal(rows[3].charsA, null);
});
