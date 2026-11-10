// Unit tests for the handwriting bench scoring. Run: node bench/test/hwscore.test.mjs
import assert from 'node:assert/strict';
import { scoreHandwriting, aggregate, guessCase, tagsFromName, editOps } from '../www/hwscore.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('perfect read scores 100%', () => {
    const s = scoreHandwriting(['THE QUICK BROWN FOX', 'JUMPS OVER THE LAZY DOG'], ['THE QUICK BROWN FOX', 'JUMPS OVER THE LAZY DOG']);
    assert.equal(s.charAccuracy, 1); assert.equal(s.wordAccuracy, 1); assert.equal(s.linesExact, 2); assert.equal(s.failed, false);
});
t('line breaks do not count against the reader', () => {
    const s = scoreHandwriting(['see you', 'on friday'], ['see you on friday']);
    assert.equal(s.charAccuracy, 1); assert.equal(s.wordAccuracy, 1); assert.equal(s.linesExact, 0);
});
t('capitals: exact score drops, no-case score does not', () => {
    const s = scoreHandwriting(['Hello There'], ['HELLO THERE']);
    assert.ok(s.charAccuracy < 0.3); assert.equal(s.charAccuracyNoCase, 1); assert.equal(s.wordAccuracy, 1);
});
t('a gave-up read is all wrong and marked failed', () => {
    const s = scoreHandwriting(null, ['buy milk']);
    assert.equal(s.failed, true); assert.equal(s.charAccuracy, 0); assert.equal(s.wordsRight, 0); assert.equal(s.errors, 8);
});
t('one wrong letter: word lost, confusion recorded', () => {
    const s = scoreHandwriting(['fhe owl'], ['the owl']);
    assert.equal(s.errors, 1); assert.equal(s.wordsRight, 1); assert.deepEqual(s.confusions, [{ from: 'f', to: 't' }]);
});
t('invented text cannot push accuracy below 0', () => {
    const s = scoreHandwriting(['xxxxxxxxxxxxxxxxxxxxxxxx'], ['hi']);
    assert.equal(s.charAccuracy, 0);
});
t('aggregate weights by characters and caps errors per sample', () => {
    const a = aggregate([scoreHandwriting(['abcd'], ['abcd']), scoreHandwriting(['zzzzzzzzzz'], ['ab'])]);
    assert.equal(a.chars, 6); assert.equal(a.errors, 2); assert.ok(Math.abs(a.charAccuracy - 4 / 6) < 1e-9); assert.equal(a.n, 2);
});
t('aggregate counts failed reads and top confusions', () => {
    const a = aggregate([scoreHandwriting(null, ['x']), scoreHandwriting(['rn'], ['m']), scoreHandwriting(['rn'], ['m'])]);
    assert.equal(a.failed, 1); assert.equal(a.topConfusions[0][0], 'rn → m'); assert.equal(a.topConfusions[0][1], 2);
});
t('guessCase', () => {
    assert.equal(guessCase('CALL 555-0142'), 'upper'); assert.equal(guessCase('glyph@example.com'), 'lower');
    assert.equal(guessCase('Meet at Noon'), 'mixed'); assert.equal(guessCase('123'), 'mixed');
});
t('tagsFromName', () => {
    assert.deepEqual(tagsFromName('hw-cursive-lower-zeyada.jpg'), { style: 'cursive', case: 'lower' });
    assert.deepEqual(tagsFromName('hw-print-upper-kalam.jpg'), { style: 'print', case: 'upper' });
    assert.deepEqual(tagsFromName('my note.jpg'), { style: '', case: '' });
});
t('editOps works on word arrays', () => {
    assert.equal(editOps(['a', 'b'], ['a', 'c']).distance, 1);
});
console.log(`${n} tests passed`);
