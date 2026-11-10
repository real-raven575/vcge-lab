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
  assert.equal(slugs.length, 11);
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
    // The old tagline stays retired; "TEAM Never Forget" is raven575's own team name (11-05) and is the only allowed use.
    assert.doesNotMatch(t.replaceAll('TEAM Never Forget', ''), /never forget/i, `${s}: old tagline`);
  }
});

const menu = fs.readFileSync(path.join(www, 'menu', 'index.html'), 'utf8');

test('the deck and every team page open the menu', () => {
  assert.ok(page.includes('href="menu/"'));
  for (const s of slugs) {
    const t = fs.readFileSync(path.join(teamsDir, s, 'index.html'), 'utf8');
    assert.ok(t.includes('href="../../menu/"'), `${s}: menu link`);
  }
});

test('the menu has every team, and its lab links match the deck tiles', () => {
  for (const s of slugs) {
    assert.ok(menu.includes(`id="${s}"`), `${s}: section`);
    assert.ok(menu.includes(`href="#${s}"`), `${s}: jump link`);
    assert.ok(menu.includes(`href="../teams/${s}/"`), `${s}: team page`);
  }
  const deckTools = new Set([...page.matchAll(/href="(vcge\/[^"]*)"/g)].map((m) => m[1]));
  const menuLab = [...menu.matchAll(/href="\.\.\/(vcge\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(menuLab)].sort(), [...deckTools].sort());
  assert.ok(menu.includes('href="../"'), 'back to the deck');
  assert.match(menu, /script-src 'none'/);
  assert.doesNotMatch(menu, /style="/);
});

test('menu links that leave the lab are marked, never send a referrer, and use https', () => {
  for (const m of menu.matchAll(/<a href="([^"]+)"([^>]*)>(.*?)<\/a>/g)) {
    const [, href, attrs, label] = m;
    if (href.startsWith('#') || href.startsWith('../')) continue;
    assert.match(href, /^https:\/\//, href);
    assert.match(attrs, /rel="noreferrer"/, href);
    assert.match(label, /opens outside the lab/, href);
  }
});

test('every lab tool page has a breadcrumb back to the deck, the lab and the menu', () => {
  const root = path.join(__dirname, '..', '..');
  for (const f of ['bench', 'card-shelf', 'logo-bench', 'wipe-trials']) {
    const t = fs.readFileSync(path.join(root, f, 'www', 'index.html'), 'utf8');
    const crumb = (t.match(/<nav class="back" aria-label="Breadcrumb">(.*?)<\/nav>/) || [])[1];
    assert.ok(crumb, `${f}: breadcrumb`);
    assert.ok(crumb.includes('href="../../"') && crumb.includes('href="../"') && crumb.includes('href="../../menu/"'), f);
    assert.match(crumb, /aria-current="page"/);
  }
});
