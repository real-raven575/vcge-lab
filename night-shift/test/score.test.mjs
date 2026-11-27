// Night Shift scoring tests: node --test night-shift/test/score.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFields, fieldsRight, charsRight, cornerMiss, matchCard, scoreboard, drops, scoreboardMd, editDistance, printedLines, DROP_ALERT } from '../www/score.js';

const truth = { name: 'Glyph the Owl', title: 'Owner', company: 'Reading Room Supply LLC', phone: '(419) 555-0142', mobile: '', fax: '419-555-0199',
    email: 'glyph@vcge.app', web: 'www.vcge.app', street: '12 Flight Deck Way', unit: '', city: 'Toledo', state: 'OH', zip: '43604' };
const app = { firstName: 'Glyph', middleName: 'the', lastName: 'Owl', jobTitle: 'Owner', organization: 'Reading Room Supply LLC',
    phones: [{ type: 'work', value: '(419) 555-0142' }, { type: 'fax', value: '+1 419 555 0199' }], emails: [{ value: 'Glyph@vcge.app' }],
    websites: [{ value: 'https://vcge.app' }], street: '12 Flight Deck Way', city: 'Toledo', state: 'OH', zip: '43604' };

test('every field right when the app read it all', () => {
    assert.deepEqual(fieldsRight(readFields(app), truth), { name: 1, title: 1, company: 1, phone: 1, email: 1, web: 1, address: 1 });
});
test('a missed fax makes phone wrong; a field not on the card is null', () => {
    const f = fieldsRight(readFields({ ...app, phones: [app.phones[0]], jobTitle: '' }), { ...truth, title: '' });
    assert.equal(f.phone, 0); assert.equal(f.title, null);
});
test('suite on the street line or in its own field; a missing final period in the company', () => {
    const t = { ...truth, unit: 'Hangar 01' };
    assert.equal(fieldsRight(readFields({ ...app, street: '12 Flight Deck Way, Hangar 01' }), t).address, 1);
    assert.equal(fieldsRight(readFields({ ...app, unitType: 'Hangar', unitNumber: '01' }), t).address, 1);
    assert.equal(fieldsRight(readFields(app), t).address, 0);
    assert.equal(fieldsRight(readFields({ ...app, organization: 'Reading Room Supply LLC' }), { ...truth, company: 'Reading Room Supply LLC.' }).company, 1);
});
test('one wrong letter in the name is wrong', () => {
    assert.equal(fieldsRight(readFields({ ...app, lastName: 'Ow1' }), truth).name, 0);
});
test('characters right', () => {
    assert.equal(charsRight('Glyph the Owl Owner Reading Room Supply LLC (419) 555-0142 419-555-0199 glyph@vcge.app www.vcge.app 12 Flight Deck Way Toledo, OH 43604', truth) > 0.95, true);
    assert.equal(charsRight('', truth), 0);
    assert.equal(editDistance('kitten', 'sitting'), 3);
});
test('corner miss takes the best starting corner', () => {
    const real = [[0, 0], [100, 0], [100, 50], [0, 50]];
    assert.equal(cornerMiss([{ x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }], real), 0);
    assert.equal(cornerMiss(null, real), null);
});
test('Print & Snap matching needs a clear winner', () => {
    const printed = [{ n: 'p#1', truth }, { n: 'p#2', truth: { ...truth, name: 'Iris the Lynx', phone: '(419) 555-0111', fax: '', email: 'iris@vcge.app', company: 'Darkroom Design' } }];
    assert.equal(matchCard('Glyph the Owl 419 555 0142 glyph@vcge.app', null, printed).n, 'p#1');
    assert.equal(matchCard('Iris the Lynx 419 555 0111', null, printed).n, 'p#2');
    assert.equal(matchCard('blurry nothing', null, printed), null);
});
test('scoreboard groups and drops', () => {
    const row = (chars, name, fx) => ({ group: 'sans', layout: 'band', effects: fx, values: { chars, edges: 1, turnedDown: 0, name, title: null, company: 1, phone: 1, email: 1, web: null, address: null } });
    const before = scoreboard([row(1, 1, { blur: 0.5 }), row(1, 1, {})]);
    const now = scoreboard([row(0.9, 0, { blur: 0.5 }), row(1, 1, {})]);
    assert.equal(now.all.n, 2); assert.equal(now.all.name, 0.5); assert.equal(now.all.allFields, 0.5);
    assert.ok(now.groups.some(g => g.label === 'effect: blur') && now.groups.some(g => g.label === 'effect: none'));
    const d = drops(now, before);
    assert.deepEqual(d.map(x => x.field).sort(), ['allFields', 'chars', 'name']);
    const md = scoreboardMd(now, { job: 'factory', set: 'night-1', build: 'abc1234', when: 'x', before: 'def5678' }, d);
    assert.match(md, /Worse than def5678/);
    assert.doesNotMatch(md, /Glyph|vcge\.app/);   // numbers and labels only
});

test('split the blame: the printed lines come from the answers, in card order (HQ-0427)', () => {
    assert.deepEqual(printedLines(truth), ['Glyph the Owl', 'Owner', 'Reading Room Supply LLC', '(419) 555-0142', '419-555-0199', 'glyph@vcge.app', 'www.vcge.app', '12 Flight Deck Way', 'Toledo, OH 43604']);
    assert.deepEqual(printedLines({ ...truth, unit: 'Hangar 01', street: '' }).slice(-1), ['www.vcge.app']);
});
test('split the blame: the sorter-alone share is scored, shown and watched for drops', () => {
    const rows = [0, 1].map(i => ({ group: 'sans', layout: 'left', effects: {}, values: { chars: 1, sorterAll: i, name: 1 } }));
    const board = scoreboard(rows);
    assert.equal(board.all.sorterAll, 0.5);
    assert.match(scoreboardMd(board, { job: 'factory', set: 's', build: 'abc1234', when: 'now' }), /sorter alone/);
    assert.equal(drops({ all: { sorterAll: 0.9 } }, { all: { sorterAll: 0.95 } }).length, 1);
});
test('a field one point worse is flagged (HQ-0427: block a merge on any 1-point drop)', () => {
    assert.equal(DROP_ALERT, 0.01);
    assert.equal(drops({ all: { name: 0.88 } }, { all: { name: 0.895 } }).length, 1);
});
