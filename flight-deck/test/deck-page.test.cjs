// Checks for the Flight Deck front page and team pages (plain edition). Run: node --test flight-deck/test/deck-page.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const www = path.join(__dirname, '..', 'www');
const page = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
const teams = page.split('<li class="team">').slice(1);

test('every team has a name and one line about it', () => {
  assert.ok(teams.length >= 10);
  for (const t of teams) {
    assert.equal((t.match(/<h2>/g) || []).length, 1, t.slice(0, 80));
    assert.match(t, /<p>[^<]+/);
  }
  assert.ok(page.includes('<h2>TEAM 9to5</h2>'));
});

test('no wording left over from before the teams were running', () => {
  for (const stale of ['project not started', 'the HQ mailbox', 'comics and characters']) {
    assert.ok(!page.includes(stale), stale);
  }
  const homelab = fs.readFileSync(path.join(__dirname, '..', 'team-pages', 'homelab', 'index.html'), 'utf8');
  assert.ok(!homelab.includes('HQ mailbox'));
});

test('plain stays plain: no characters, emoji or hangar wording', () => {
  assert.doesNotMatch(page, /\p{Extended_Pictographic}/u);
  assert.doesNotMatch(page, /HANGAR|Hangar|class="lights"/);
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
