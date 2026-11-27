// Night Shift build choice tests: node --test night-shift/test/plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../night-shift.mjs';

const b = (short, date, main) => ({ short, date: `2026-11-${date}T00:00:00Z`, source: true, main });
const show = (runs) => runs.map(r => `${r.build.short}<${r.before ? r.before.short : '-'}${r.report ? '*' : ''}`);

test('main against main, and a newer branch against main (trial 1: never branch against branch)', () => {
    // newest first, as the file service lists them; br2 is the newest branch, br1 an older one
    const builds = [b('br2', 27, false), b('br1', 26, false), b('m2', 25, true), b('m1', 24, true)];
    assert.deepEqual(show(plan(builds)), ['m1<-', 'm2<m1*', 'br2<m2*']);
});
test('a branch older than main is left out', () => {
    assert.deepEqual(show(plan([b('m2', 27, true), b('br1', 26, false), b('m1', 25, true)])), ['m1<-', 'm2<m1*']);
});
test('when the lab cannot tell branches apart: the newest two by date, as before', () => {
    assert.deepEqual(show(plan([b('x2', 27, null), b('x1', 26, null)])), ['x1<-', 'x2<x1*']);
    assert.deepEqual(show(plan([b('x1', 26, null)])), ['x1<-*']);
});
test('builds without published source are skipped; nothing to do gives nothing', () => {
    assert.deepEqual(show(plan([{ ...b('m3', 28, true), source: false }, b('m2', 27, true)])), ['m2<-*']);
    assert.deepEqual(plan([]), []);
});
