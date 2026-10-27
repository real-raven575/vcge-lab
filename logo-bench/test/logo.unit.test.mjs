// Logo bench unit tests: the finder and the shape maker on drawn cards (no photos). Run: node test/logo.unit.test.mjs
// The shape maker uses the app's own MOD06 tracer; set VCGE_APP to an app checkout (default ../vCGE-Master beside this repo).
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backgroundOf, contactTextBoxes, findLogoCandidates, overlap, scoreBlob } from '../www/logoFinder.js';
import { clusterColours, loopArea, posterize, simplifyLoop } from '../www/posterize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = process.env.VCGE_APP || path.resolve(here, '../../../vCGE-Master');
const { outlines, soften } = await import(pathToFileURL(path.join(app, 'src/modules/mod06-gui/card3dView.js')).href);

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

// A drawn card: RGBA, white, with shapes painted by `paint(set)`.
function card(w, h, paint, back = [255, 255, 255]) {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { px.set(back, i * 4); px[i * 4 + 3] = 255; }
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) px.set(c, (y * w + x) * 4); };
    paint(set);
    return px;
}
const disc = (set, cx, cy, r, c) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, c); };
const rect = (set, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };
// Text stand-in: a row of small dark "letters" 7 px wide, 12 px tall, 3 px apart.
const textRow = (set, x0, y0, letters) => { for (let i = 0; i < letters; i++) rect(set, x0 + i * 10, y0, 7, 12, [20, 20, 20]); };

const W = 600, H = 340;
const logo = { x: 40 - 1, y: 30 - 1, w: 2 * 45 + 3, h: 2 * 45 + 3 };
const drawn = card(W, H, set => {
    disc(set, 85, 75, 45, [200, 30, 40]);            // a red round logo, top left
    textRow(set, 300, 60, 20); textRow(set, 300, 90, 14); // name and title, top right
    textRow(set, 60, 220, 22); textRow(set, 60, 250, 25); textRow(set, 60, 280, 18);   // contact lines
});

test('the card colour is its most common colour', () => {
    assert.deepEqual(backgroundOf(drawn, W, H), [255, 255, 255]);
    assert.deepEqual(backgroundOf(card(50, 30, () => {}, [10, 40, 90]), 50, 30), [10, 40, 90]);
});

test('the red round logo is the first pick, without the reader', () => {
    const c = findLogoCandidates(drawn, W, H);
    assert.ok(c.length >= 2, 'more than one candidate');
    assert.ok(overlap(c[0], logo) > 0.8, `first pick ${JSON.stringify(c[0])}`);
    assert.ok(c[0].reasons.includes('in colour'));
    assert.ok(c[0].score > c[1].score);
});

test('a black logo still wins over text when the reader blanks the contact lines', () => {
    const black = card(W, H, set => {
        rect(set, 40, 30, 70, 70, [15, 15, 15]); rect(set, 60, 50, 30, 30, [255, 255, 255]);   // a black square ring
        textRow(set, 300, 60, 20); textRow(set, 60, 220, 22); textRow(set, 60, 250, 25);
    });
    const lines = [
        { text: 'Jane Example', confidence: 90, bbox: { x0: 300, y0: 60, x1: 500, y1: 72 } },
        { text: '+1 (312) 555-0100', confidence: 91, bbox: { x0: 60, y0: 220, x1: 280, y1: 232 } },
        { text: 'jane@example.com', confidence: 88, bbox: { x0: 60, y0: 250, x1: 310, y1: 262 } },
    ];
    const boxes = contactTextBoxes(lines);
    assert.equal(boxes.length, 3);
    const c = findLogoCandidates(black, W, H, { textBoxes: boxes });
    assert.equal(c.length, 1, 'only the logo is left');
    assert.ok(overlap(c[0], { x: 40, y: 30, w: 70, h: 70 }) > 0.8);
});

test('Glyph keeps big type (a wordmark) and unsure lines as possible logos', () => {
    const lines = [
        { text: 'ACME', confidence: 95, bbox: { x0: 0, y0: 0, x1: 200, y1: 60 } },          // 5x the usual height
        { text: 'Jane Example', confidence: 92, bbox: { x0: 0, y0: 80, x1: 150, y1: 92 } },
        { text: 'x7Qz', confidence: 30, bbox: { x0: 0, y0: 100, x1: 60, y1: 112 } },          // icon debris, unsure
        { text: 'jane@example.com', confidence: 90, bbox: { x0: 0, y0: 120, x1: 200, y1: 132 } },
    ];
    const texts = contactTextBoxes(lines).map(b => b.text);
    assert.deepEqual(texts, ['Jane Example', 'jane@example.com']);
    assert.deepEqual(contactTextBoxes(lines, 0.5)[0], { x: 0, y: 40, w: 75, h: 6, text: 'Jane Example' });
    assert.deepEqual(contactTextBoxes([]), []);
});

test('a thin rule or a whole-card border is not a logo', () => {
    const ruled = card(W, H, set => {
        rect(set, 0, 0, W, 6, [30, 60, 160]); rect(set, 0, H - 6, W, 6, [30, 60, 160]);   // a coloured frame top and bottom
        rect(set, 40, 170, 520, 3, [200, 30, 40]);                                         // a red rule
        disc(set, 300, 80, 40, [20, 120, 60]);                                              // a green logo
    });
    const c = findLogoCandidates(ruled, W, H);
    assert.ok(overlap(c[0], { x: 260, y: 40, w: 81, h: 81 }) > 0.7, `first pick ${JSON.stringify(c[0])}`);
    const rule = scoreBlob({ x: 40, y: 170, w: 520, h: 3, ink: 1560, saturation: 0.8 }, W, H, 12);
    assert.ok(rule.reasons.includes('a thin line, probably a rule or border'));
});

test('an empty card has no candidates', () => {
    assert.deepEqual(findLogoCandidates(card(200, 120, () => {}), 200, 120), []);
});

test('overlap is 1 for the same box and 0 apart', () => {
    assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }), 1);
    assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), 0);
    assert.equal(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 }), 50 / 150);
});

// ---- The shape maker ------------------------------------------------------------------------------------------

const two = card(200, 200, set => { disc(set, 100, 100, 70, [200, 30, 40]); rect(set, 75, 75, 50, 50, [20, 60, 180]); });
const box = { x: 0, y: 0, w: 200, h: 200 };

test('two colours keep the red and the blue, and leave the card out', () => {
    const r = posterize(two, 200, box, { colours: 2, outlines, soften });
    assert.equal(r.reason, null);
    assert.equal(r.inks.length, 2);
    const near = (hexColour, rgb) => { const v = [1, 3, 5].map(i => parseInt(hexColour.slice(i, i + 2), 16)); return v.every((c, i) => Math.abs(c - rgb[i]) < 30); };
    assert.ok(r.inks.some(i => near(i.colour, [200, 30, 40])), JSON.stringify(r.inks));
    assert.ok(r.inks.some(i => near(i.colour, [20, 60, 180])), JSON.stringify(r.inks));
    assert.ok(!r.inks.some(i => near(i.colour, [255, 255, 255])));
    assert.match(r.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100" height="100" viewBox="0 0 100 100"><path /);
    assert.equal((r.svg.match(/<path /g) || []).length, 2);
    assert.ok(!/script|href|style|on\w+=/i.test(r.svg), 'paths only');
    assert.ok(r.bytes < 8000, `small: ${r.bytes} bytes`);
});

test('one colour gives one ink', () => {
    const r = posterize(two, 200, box, { colours: 1, outlines, soften });
    assert.equal(r.inks.length, 1);
    assert.equal((r.svg.match(/<path /g) || []).length, 1);
});

test('specks are dropped and a blank box says why', () => {
    const specks = card(100, 100, set => { set(20, 20, [0, 0, 0]); set(70, 50, [0, 0, 0]); });
    const r = posterize(specks, 100, { x: 0, y: 0, w: 100, h: 100 }, { colours: 1, outlines, soften });
    assert.equal(r.svg, null);
    assert.match(r.reason, /nothing stands out/);
});

test('the colour groups start the same way every time', () => {
    const cells = [[255, 255, 255], [250, 250, 250], [200, 30, 40], [190, 35, 45], [20, 60, 180]];
    const a = clusterColours(cells, 3, [255, 255, 255]), b = clusterColours(cells, 3, [255, 255, 255]);
    assert.deepEqual(Array.from(a.assign), Array.from(b.assign));
    assert.equal(a.assign[0], a.assign[1]); assert.equal(a.assign[2], a.assign[3]); assert.notEqual(a.assign[2], a.assign[4]);
});

test('simplifying keeps the corners of a square and drops repeats and stair noise', () => {
    const square = [[0, 0], [0, 0], [5, 0], [10, 0], [10, 0.2], [10, 10], [5, 10.3], [0, 10]];
    assert.deepEqual(simplifyLoop(square), [[0, 0], [10, 0], [10, 10], [0, 10]]);
    assert.equal(simplifyLoop(square, 0).length, 7);
    const soft = posterize(two, 200, box, { colours: 1, outlines, soften, tolerance: 0 });
    const lean = posterize(two, 200, box, { colours: 1, outlines, soften });
    assert.ok(lean.bytes < soft.bytes * 0.7, `simplified ${lean.bytes} vs ${soft.bytes} bytes`);
});

test('loop area', () => {
    assert.equal(Math.abs(loopArea([[0, 0], [4, 0], [4, 3], [0, 3]])), 12);
});

test('posterize needs the build\'s tracer', () => {
    assert.throws(() => posterize(two, 200, box, {}), /outlines and soften/);
});

console.log(`${passed} passed`);
