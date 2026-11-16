// Test Bench page helpers:  node --test testbench/test/testbench.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMatch, safeLink, autoStatus, statusOf, stepsDone, matches, tally, resultsText, when, progress, stepOf } from '../www/testbench.js';

const hand = { id: 'h', section: 'raven', title: 'Hands-on', status: 'ready', steps: ['open it', 'press GO', 'look'],
    stepResults: { 0: { result: 'pass', note: '' }, 1: { result: 'fail', note: 'froze' } },
    notes: [{ at: '2026-11-14T16:20:05Z', text: 'tried on the phone' }], evidence: [{ hash: 'a' }] };
const inter = { id: 'i', section: 'raven', title: 'Talk it through', status: 'waiting', steps: [{ text: 'x', who: 'robot' }], interactive: { thread: 't' } };
const green = { id: 'g', section: 'auto', ci: { runId: 1, passed: 12, total: 12 } };
const red = { id: 'r', section: 'auto', ci: { runId: 2, passed: 11, total: 12 } };
const none = { id: 'n', section: 'auto', ci: null };

test('automatic lines are green only when every job passed', () => {
    assert.equal(autoStatus(green), 'pass');
    assert.equal(autoStatus(red), 'fail');
    assert.equal(autoStatus(none), 'waiting');
    assert.equal(autoStatus({ section: 'auto', ci: { runId: 3, passed: 0, total: 0 } }), 'fail');
    assert.equal(statusOf(hand), 'ready');
});

test('steps done counts only steps with a result', () => {
    assert.deepEqual(stepsDone(hand), { done: 2, n: 3 });
    assert.deepEqual(stepsDone(inter), { done: 0, n: 1 });
});

test('filters', () => {
    const all = [hand, inter, green, red, { ...hand, id: 'p', status: 'pass' }];
    assert.deepEqual(all.filter(i => matches(i, 'open')).map(i => i.id), ['h', 'i', 'r']);
    assert.deepEqual(all.filter(i => matches(i, 'interactive')).map(i => i.id), ['i']);
    assert.deepEqual(all.filter(i => matches(i, 'fail')).map(i => i.id), ['r']);
    assert.deepEqual(all.filter(i => matches(i, 'pass')).map(i => i.id), ['g', 'p']);
    assert.equal(all.filter(i => matches(i, 'all')).length, 5);
});

test('tally for the header', () => {
    const t = tally([hand, inter, green, red, none]);
    assert.deepEqual(t.raven, { ready: 1, waiting: 1, pass: 0, fail: 0, blocked: 0 });
    assert.deepEqual(t.auto, { pass: 1, fail: 1, waiting: 1 });
    assert.equal(t.interactive, 1);
    assert.equal(t.decide, 0);
});

test('decision links: https only, counted and filtered while open', () => {
    const ask = { ...hand, id: 'd', decision: { ask: 'Run it?', link: 'https://example.org/run' } };
    const done = { ...ask, id: 'dp', status: 'pass' };
    const bad = { ...hand, id: 'db', decision: { link: 'javascript:alert(1)' } };
    assert.equal(safeLink('https://example.org/x'), 'https://example.org/x');
    for (const u of ['javascript:alert(1)', 'http://example.org', 'https://a b', '', null, 7]) assert.equal(safeLink(u), null);
    assert.deepEqual([hand, ask, done, bad].filter(i => matches(i, 'decide')).map(i => i.id), ['d']);
    assert.equal(tally([hand, ask, done, bad]).decide, 1);
});

test('results text to paste into a thread', () => {
    const txt = resultsText(hand);
    assert.match(txt, /^Test Bench: Hands-on \(Ready to test\)/);
    assert.match(txt, /1\. open it\n {3}-> ✅ Pass\n/);
    assert.match(txt, /2\. press GO\n {3}-> ❌ Fail: froze/);
    assert.match(resultsText(inter), /1\. 🤖 x\n/);
    assert.match(txt, /3\. look\n {3}-> not done yet/);
    assert.match(txt, /Note 2026-11-14 16:20 UTC: tried on the phone/);
    assert.match(txt, /Pictures on the lab Test Bench: 1/);
    assert.equal(when('2026-11-14T16:20:05Z'), '2026-11-14 16:20 UTC');
});

test('mine / robot filters and the overall bar', () => {
    assert.deepEqual([hand, inter, green].filter(i => matches(i, 'human')).map(i => i.id), ['h']);
    assert.deepEqual([hand, inter, green].filter(i => matches(i, 'robot')).map(i => i.id), ['i', 'g']);
    assert.deepEqual(progress([hand, inter, green]), { done: 2, n: 4, pct: 50 });
    assert.deepEqual(stepOf('plain'), { text: 'plain', who: 'human' });
});

test('a tapped count goes to the next card it counted, in page order, and wraps', () => {
    const items = [{ id: 'a1', section: 'auto', ci: {} }, { id: 'w1', section: 'raven', status: 'waiting' }, { id: 'r1', section: 'raven', status: 'ready' },
        { id: 'w2', section: 'raven', status: 'waiting', interactive: { thread: 't' } }];
    assert.equal(nextMatch(items, 'waiting'), 'w1');
    assert.equal(nextMatch(items, 'waiting', 'w1'), 'w2');
    assert.equal(nextMatch(items, 'waiting', 'w2'), 'w1');
    assert.equal(nextMatch(items, 'interactive'), 'w2');
    assert.equal(nextMatch(items, 'fail'), null);
});
