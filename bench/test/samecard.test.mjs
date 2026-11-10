// Unit tests for "one answer key for many photos of the same card" (raven575, 2026-11-04). Made-up cards only.
// Run: node --test lab/bench-samecard/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardOf, cardKeyName, cleanCardName, uploadName, mergeTruth, pickCardKeys, cardSummary, cardsMd, scoreSample } from '../www/bench.js';

const key = [{ text: 'Dana Quill', role: 'name', drop: false }, { text: '616-555-0142', role: 'phoneWork', drop: false }, { text: 'dquill@example.test', role: 'email', drop: false }];
const readAs = (name, lines) => ({ set: 'business-cards', name, outcome: 'read', lines: lines.map(([text, role]) => ({ text, role, check: null })) });

test('a photo uploaded with a card name belongs to that card; the key file and plain photos do not', () => {
    assert.equal(uploadName('card 07!', 'IMG_1.jpg'), 'card-07__IMG_1.jpg');
    assert.equal(uploadName('', 'IMG_1.jpg'), 'IMG_1.jpg');
    assert.equal(uploadName('card-07', 'card-07__IMG_1.jpg'), 'card-07__IMG_1.jpg');   // never named twice
    assert.equal(cardOf('card-07__IMG_1.jpg'), 'card-07');
    assert.equal(cardOf('20261020_184516.jpg'), null);
    assert.equal(cardOf(cardKeyName('card-07')), null);
    assert.equal(cleanCardName('  --  '), '');
    assert.match(uploadName('card 07', 'IMG_1.jpg'), /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,120}$/);   // the lab service's NAME_RE
});

test('a photo of a card is scored on the card key; its own edges answer stays', () => {
    const own = { edgesOk: false, hadQuad: true };
    const t = mergeTruth(own, { lines: key, card: 'card-07' });
    assert.deepEqual(t.lines, key); assert.equal(t.edgesOk, false); assert.equal(t.sharedFrom, 'card-07');
    assert.equal(mergeTruth(null, null), null);
    assert.deepEqual(mergeTruth({ lines: key, edgesOk: true }, null).lines, key);   // a photo on its own keeps its truth
});

test('the photo you edited sets the card key; one key per card', () => {
    const shown = key.map(l => ({ ...l, text: l.text.replace('Quill', 'Qu1ll') }));
    const keys = pickCardKeys([
        { card: 'card-07', lines: shown, shown },     // untouched
        { card: 'card-07', lines: key, shown },       // corrected
        { card: null, lines: key, shown },
        { card: 'card-08', lines: shown, shown }]);
    assert.deepEqual(Object.keys(keys).sort(), ['card-07', 'card-08']);
    assert.deepEqual(keys['card-07'], key);
    assert.deepEqual(keys['card-08'], shown);
});

test('every angle scored on one key: average, best and weakest photo, and the fields that slipped', () => {
    const truth = { lines: key, edgesOk: true, hadQuad: true };
    const scores = [
        scoreSample(readAs('card-07__front.jpg', [['Dana Quill', 'name'], ['616-555-0142', 'phoneWork'], ['dquill@example.test', 'email']]), truth),
        scoreSample(readAs('card-07__tilted.jpg', [['Dana Qu1ll', 'name'], ['616-555-0142', 'phoneWork'], ['dquill@exarnple.test', 'email']]), truth),
        scoreSample(readAs('solo.jpg', [['Dana Quill', 'name']]), truth)];
    const [c] = cardSummary(scores);
    assert.equal(cardSummary(scores).length, 1);
    assert.equal(c.card, 'card-07'); assert.equal(c.photos, 2);
    assert.equal(c.best.photo, 'front.jpg'); assert.equal(c.best.acc, 1);
    assert.equal(c.worst.photo, 'tilted.jpg'); assert.ok(c.worst.acc < 1);
    assert.deepEqual(c.slips.map(([f]) => f).sort(), ['email', 'name']);
    assert.match(cardsMd(cardSummary(scores)), /card-07: 2 photos, average \d+%, best front\.jpg 100%, weakest tilted\.jpg/);
});
