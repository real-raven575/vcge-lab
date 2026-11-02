// Checks for the Flight Deck front page and team pages. Run: node --test flight-deck/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const www = path.join(__dirname, '..', 'www');
const page = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
const hangars = page.split('<li class="hangar').slice(1);

test('hangars are numbered 01, 02, ... in order, then the open bay', () => {
  const bays = [...page.matchAll(/<div class="bay">([^<]+)<\/div>/g)].map((m) => m[1]);
  const numbered = bays.filter((b) => b.startsWith('HANGAR '));
  numbered.forEach((b, i) => assert.equal(b, `HANGAR ${String(i + 1).padStart(2, '0')}`));
  assert.equal(bays.at(-1), 'OPEN BAY');
  assert.equal(numbered.length, bays.length - 1);
});

test('every team hangar has one comms line, a project line and a PM or crew', () => {
  for (const h of hangars.filter((x) => !x.startsWith(' open'))) {
    assert.equal((h.match(/<p class="comms">/g) || []).length, 1, h.slice(0, 120));
    assert.match(h, /<p class="proj">/);
    assert.match(h, /<p class="(pm|pilots)"/);
  }
});

test('no wording left over from before the teams were running', () => {
  for (const stale of ['Not started yet', "hasn't started yet", 'Not tested yet', 'Reach Inkwell via raven575', 'runs the comms desk']) {
    assert.ok(!page.includes(stale), stale);
  }
  const homelab = fs.readFileSync(path.join(__dirname, '..', 'team-pages', 'homelab', 'index.html'), 'utf8');
  assert.ok(!homelab.includes("hasn't checked in"));
});

test('every tool link stays on the deck (relative, no scheme, no host)', () => {
  const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.includes('vcge/funhouse/'));
  for (const h of hrefs) assert.doesNotMatch(h, /^([a-z]+:|\/\/)/i, h);
});

test('the page keeps its no-internet lock', () => {
  assert.match(page, /default-src 'self'/);
  assert.match(page, /connect-src 'none'/);
});

const teamsDir = path.join(www, 'teams');
const slugs = fs.readdirSync(teamsDir).filter((d) => fs.statSync(path.join(teamsDir, d)).isDirectory());

test('every hangar opens its own team page, and every team page exists', () => {
  assert.equal(slugs.length, 10);
  const linked = [...page.matchAll(/href="teams\/([^/"]+)\/"/g)].map((m) => m[1]);
  assert.deepEqual([...linked].sort(), [...slugs].sort());
  assert.ok(!page.includes('Placeholder'));
});

test('each team page has the five sections, links every other team, and stays offline', () => {
  for (const s of slugs) {
    const t = fs.readFileSync(path.join(teamsDir, s, 'index.html'), 'utf8');
    for (const h of ['What we do', 'Crew', 'The plan', 'What we can reach', 'Logbook']) assert.ok(t.includes(`<h2>${h}</h2>`), `${s}: ${h}`);
    for (const o of slugs) assert.ok(t.includes(`href="../${o}/"`), `${s} -> ${o}`);
    assert.ok(t.includes('href="../../"'), `${s}: back to the deck`);
    assert.match(t, /script-src 'none'/);
    assert.doesNotMatch(t, /style="/, `${s}: inline style would be blocked by the CSP`);
    assert.doesNotMatch(t, /never forget/i);
  }
});
