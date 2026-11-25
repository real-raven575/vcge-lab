// Tester Voices page logic: node --test tester-voices/test/voices-core.test.mjs  (every name here is made up)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNames, cleanWords, bothTimes, asText, counts } from '../www/voices-core.js';

test('names box: codenames given or counted up', () => {
    assert.deepEqual(parseNames('Jane Doe\nSam Ple = T4\n\nAl', 'T7'),
        [{ name: 'Jane Doe', code: 'T7' }, { name: 'Sam Ple', code: 'T4' }, { name: 'Al', code: 'T8' }]);
    assert.deepEqual(parseNames('', 'T1'), []);
});

test('whole name, then each part, any case, whole words only', () => {
    const { text, swaps } = cleanWords('[11/24 3:02 PM] Jane Doe: love it!\nJANE said doe-eyed. Janet is someone else. jane.', [{ name: 'Jane Doe', code: 'T7' }]);
    assert.equal(text, '[11/24 3:02 PM] T7: love it!\nT7 said T7-eyed. Janet is someone else. T7.');
    assert.equal(swaps.names, 4);
});

test('accented names and contact data', () => {
    const { text, swaps } = cleanWords('José wrote from jose@example.com, text 555-123-4567, IG @jose_r', [{ name: 'José', code: 'T2' }]);
    assert.equal(text, 'T2 wrote from [email hidden], text [phone hidden], IG [@handle hidden]');
    assert.deepEqual(swaps, { names: 1, emails: 1, handles: 1, phones: 1 });
});

test('times read in UTC and Eastern', () => {
    assert.equal(bothTimes('2026-11-25T02:13:00Z'), '02:13 UTC · 9:13 PM Eastern, Tue Nov 24');
    assert.equal(bothTimes('2026-07-01T16:05:00Z'), '16:05 UTC · 12:05 PM Eastern, Wed Jul 1');
    assert.equal(bothTimes('nope'), '');
});

test('copy text and counts', () => {
    const d = { tester: 'T3', source: 'chat', tags: ['bug', 'idea'], added: '2026-11-25T02:13:00Z', said: '', text: 'It froze.', notes: [], status: 'new' };
    assert.match(asText(d, 'vCGE'), /^vCGE tester T3 \(💬 Chat app\) · 🐞 Bug, 💡 Idea\nDropped 02:13 UTC/);
    assert.deepEqual(counts([d, { ...d, tags: ['bug'], status: 'done' }]), { all: 2, tag: { bug: 2, idea: 1 }, status: { new: 1, done: 1 } });
});
