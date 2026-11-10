// Unit tests for the Card Inbox page's pure helpers (frame picking and the angle vote). Made-up text only.
// Run: node --test card-inbox/test/inbox.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The page imports ../bench/bench.js as it sits on the lab (www/inbox beside www/bench), so test it laid out that way.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const lab = mkdtempSync(join(tmpdir(), 'inbox-test-'));
cpSync(join(repo, 'bench/www'), join(lab, 'bench'), { recursive: true });
cpSync(join(repo, 'card-inbox/www'), join(lab, 'inbox'), { recursive: true });
process.on('exit', () => rmSync(lab, { recursive: true, force: true }));
const { sharpness, glareShare, toGrey, frameScore, pickFrames, voteLines, angleSummary, fieldTally } = await import(pathToFileURL(join(lab, 'inbox/inbox.js')).href);
const { scoreSample } = await import(pathToFileURL(join(lab, 'bench/bench.js')).href);

const W = 32, H = 32;
const stripes = (blur) => { const g = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = blur ? 128 + (x % 8 < 4 ? 10 : -10) : (x % 2 ? 230 : 20); return g; };

test('sharp edges score higher than soft ones; a flat grey scores zero', () => {
    assert.ok(sharpness(stripes(false), W, H) > sharpness(stripes(true), W, H) * 10);
    assert.equal(sharpness(new Uint8Array(W * H).fill(90), W, H), 0);
});

test('glare is the share of blown-out pixels, and costs the frame its score', () => {
    const g = new Uint8Array(100).fill(100); g.fill(255, 0, 10);
    assert.equal(glareShare(g), 0.1);
    assert.equal(frameScore(1000, 0), 1000);
    assert.equal(frameScore(1000, 0.1), 600);
    assert.equal(frameScore(1000, 0.3), 0, 'a frame with a quarter or more blown out is never kept');
});

test('toGrey weighs green most, like the eye', () => {
    assert.deepEqual(Array.from(toGrey(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]))), [76, 149, 29]);
});

test('pickFrames keeps the best frames, spaced apart, in time order', () => {
    const frames = Array.from({ length: 50 }, (_, i) => ({ t: i * 0.1, score: i === 20 || i === 21 ? 100 : i }));
    const kept = pickFrames(frames, 3, 0.25);
    assert.deepEqual(kept.map(f => Math.round(f.t * 10)), [20, 46, 49]);
    assert.ok(kept.every((f, i) => i === 0 || f.t - kept[i - 1].t >= 0.25 - 1e-9));
    assert.equal(pickFrames([{ t: 0, score: 0 }]).length, 0, 'zero-score frames are never kept');
});

test('voteLines keeps lines most angles agree on, with the usual spelling and role', () => {
    const a = [{ text: 'Velmar Studio', role: 'organization' }, { text: 'Kalo Renmi', role: 'name' }, { text: '555-0123', role: 'phone' }];
    const b = [{ text: 'Velmar  Studio', role: 'organization' }, { text: 'Kal0 Renmi', role: 'name' }, { text: '555-0123', role: 'phone' }];
    const c = [{ text: 'velmar studio', role: 'name' }, { text: 'Kalo Renmi', role: 'name' }, { text: 'noise', role: 'notes' }];
    const v = voteLines([a, b, c, []]);
    assert.deepEqual(v.map(l => [l.text, l.role, l.votes]), [['Velmar Studio', 'organization', 3], ['Kalo Renmi', 'name', 2], ['555-0123', 'phone', 2]]);
    assert.ok(v.every(l => l.of === 3), 'an angle that read nothing does not vote');
    assert.deepEqual(voteLines([]), []);
});

test('angleSummary names the best and weakest angle', () => {
    const s = angleSummary([{ name: 'a', chars: 0.9 }, { name: 'b', chars: 0.5 }, { name: 'c', chars: null }]);
    assert.equal(s.n, 2); assert.equal(s.best.name, 'a'); assert.equal(s.weakest.name, 'b'); assert.ok(Math.abs(s.average - 0.7) < 1e-9);
    assert.equal(angleSummary([]), null);
});

test('fieldTally counts, per field the key has, the angles that got it right and whether the vote did', () => {
    const truth = { lines: [{ text: 'Kalo Renmi', role: 'name' }, { text: '555-0123', role: 'phone' }, { text: 'kalo@velmar.test', role: 'email' }] };
    const score = (lines) => scoreSample({ set: 'inbox', name: '', outcome: 'read', lines: lines.map(([text, role]) => ({ text, role })) }, { ...truth, edgesOk: true, hadQuad: true });
    const a = score([['Kalo Renmi', 'name'], ['555-0123', 'phoneMobile'], ['kalo@velmar.test', 'email']]);
    const b = score([['Kal0 Renmi', 'name'], ['555-0128', 'phone'], ['Kalo@Velmar.test', 'email']]);
    const t = fieldTally([a, b], a, truth);
    assert.deepEqual(t.map(x => [x.field, x.right, x.of, x.vote]), [['name', 1, 2, true], ['phone', 1, 2, true], ['email', 2, 2, true]]);
    assert.deepEqual(fieldTally([b], null, truth).map(x => x.vote), [null, null, null]);
});
