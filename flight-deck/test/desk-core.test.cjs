// Unit tests for the Desk's data shaping. Run: node --test flight-deck/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../www/desk/desk-core.js');

const now = new Date(Date.UTC(2026, 9, 26, 2, 47));

test('UTC stamps sort as text and show Eastern too', () => {
  assert.equal(C.utcStamp(now), '2026-10-26 02:47');
  assert.equal(C.showTime('2026-10-26 02:47'), '2026-10-26 02:47 UTC (10:47 PM Eastern)');
  assert.equal(C.showTime('2026-11-02 15:00'), '2026-11-02 15:00 UTC (10:00 AM Eastern)');   // after the clocks change
  assert.equal(C.showTime('soon'), 'soon');
});

test('rules keep their Sheet row and skip blank rows', () => {
  const r = C.parseRules([['HB-01', 'Herd', 'One'], [], ['CS-01', 'Team vCGE', 'Two', 'yes', 'raven575', '2026-10-26 02:47']]);
  assert.deepEqual(r.map(x => [x.row, x.id, x.signed]), [[2, 'HB-01', false], [4, 'CS-01', true]]);
  assert.equal(C.parseRules([['', '', 'No id']])[0].group, 'Herd');
});

test('next rule id per group never reuses a gap', () => {
  const r = C.parseRules([['HB-01', 'Herd', 'a'], ['HB-07', 'Herd', 'b'], ['CS-02', 'Team vCGE', 'c']]);
  assert.equal(C.nextRuleId(r, 'Herd'), 'HB-08');
  assert.equal(C.nextRuleId(r, 'Team vCGE'), 'CS-03');
  assert.equal(C.nextRuleId([], 'Team vCGE'), 'CS-01');
});

test('new wording clears the sign-off; sign-off writes who and when', () => {
  assert.deepEqual(C.editRuleRow('New', 'raven575', now), ['New', '', '', '', 'raven575', '2026-10-26 02:47']);
  assert.deepEqual(C.signRuleRow(true, 'raven575', now), ['yes', 'raven575', '2026-10-26 02:47']);
  assert.deepEqual(C.signRuleRow(false, 'raven575', now), ['', '', '']);
  assert.deepEqual(C.newRuleRow([], 'Herd', 'X', 'raven575', now), ['HB-01', 'Herd', 'X', '', '', '', 'raven575', '2026-10-26 02:47']);
});

test('inbox is newest first, keeps rows, skips empty texts', () => {
  const m = C.parseInbox([
    ['2026-10-25 21:00', 'a', 'old', 'one'], ['2026-10-26 02:00', 'b', 'new', 'two', 'yes'],
    ['2026-10-26 02:00', 'c', 'newer same minute', 'three'], ['2026-10-26 03:00', 'd', 'blank', '  '],
  ]);
  assert.deepEqual(m.map(x => [x.row, x.used]), [[4, false], [3, true], [2, false]]);
});

test('copy-all text groups rules', () => {
  const r = C.parseRules([['HB-01', 'Herd', 'One '], ['CS-01', 'Team vCGE', 'Two']]);
  assert.equal(C.rulesAsText(r), 'Herd rules\nHB-01. One\n\nTeam vCGE rules\nCS-01. Two');
});

test('welcome reads row 2', () => {
  assert.deepEqual(C.parseWelcome([['Hi', 'Text', '2026-10-26 02:47']]), { row: 2, title: 'Hi', text: 'Text', editedUtc: '2026-10-26 02:47' });
  assert.equal(C.parseWelcome([]).text, '');
});

test('Sheets-reformatted times (one-digit hour) still show and sort', () => {
  assert.equal(C.normStamp('2026-10-26 5:47'), '2026-10-26 05:47');
  assert.equal(C.showTime('2026-10-26 5:47'), '2026-10-26 05:47 UTC (1:47 AM Eastern)');
  const m = C.parseInbox([['2026-10-26 5:47', 'a', 'early', 'x'], ['2026-10-26 10:01', 'b', 'late', 'y']]);
  assert.deepEqual(m.map(x => x.about), ['late', 'early']);
  assert.equal(m[1].raw, '2026-10-26 5:47');
});

test('build a block: picked groups in order, sections, roster lines, welcome last, signed-only', () => {
  const r = C.parseRules([['CRTV-01', 'Team vCGE: Creative', 'Directives: House style: soft.', 'yes'], ['HB-01', 'Herd', 'Intro.'],
    ['HB-02', 'Herd', 'Chain of command: A.', 'yes'], ['HB-03', 'Herd', 'Chain of command: B.'], ['CRTV-02', 'Team vCGE: Creative', 'Roster:\n🐼 Inkwell\n🐸 Chapter']]);
  const w = { title: 'Welcome aboard', text: 'Hi.' };
  assert.equal(C.buildBlock(r, w, ['Team vCGE: Creative', 'Herd', 'Welcome'], false),
    '# Herd rules\n\nIntro.\n\n## Chain of command\n- A.\n- B.\n\n# Team vCGE: Creative rules\n\n## Directives\n- House style: soft.\n\n## Roster\n🐼 Inkwell\n🐸 Chapter' +
    '\n\n# Welcome aboard (paste as the first message in the new project)\n\nHi.');
  assert.equal(C.buildBlock(r, w, ['Herd'], true), '# Herd rules\n\n## Chain of command\n- A.');
  assert.equal(C.buildBlock(r, w, [], false), '');
  assert.deepEqual(C.splitSection('Not vCGE-only. Card code HMLB.'), ['', 'Not vCGE-only. Card code HMLB.']);
  assert.equal(C.shortName('Team vCGE: Marketing'), 'Marketing');
  assert.equal(C.nextRuleId(r, 'Team vCGE: Creative'), 'CRTV-03');
});
