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
  assert.ok(page.includes('>TEAM 9to5</a></h2>'));
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

const teamsDir = path.join(www, 'teams');
const slugs = fs.readdirSync(teamsDir).filter((d) => fs.statSync(path.join(teamsDir, d)).isDirectory());

test('every team name opens its own team page, and every team page exists', () => {
  assert.equal(slugs.length, 11);
  const linked = [...page.matchAll(/href="teams\/([^/"]+)\/"/g)].map((m) => m[1]);
  assert.deepEqual([...linked].sort(), [...slugs].sort());
  assert.ok(!page.includes('Placeholder'));
});

test('each plain team page has the five sections, links every team, stays offline and plain', () => {
  for (const s of slugs) {
    const t = fs.readFileSync(path.join(teamsDir, s, 'index.html'), 'utf8');
    for (const h of ['What we do', 'Crew', 'The plan', 'What we can reach', 'Logbook']) assert.ok(t.includes(`<h2>${h}</h2>`), `${s}: ${h}`);
    for (const o of slugs) assert.ok(t.includes(`href="../${o}/"`), `${s} -> ${o}`);
    assert.ok(t.includes('<nav class="deckbar"') && t.includes('href="/"'), `${s}: deck bar back to the deck`);
    assert.match(t, /script-src 'none'/);
    assert.doesNotMatch(t, /style="/);
    assert.doesNotMatch(t, /\p{Extended_Pictographic}/u, `${s}: plain has no emoji`);
    assert.doesNotMatch(t, /HANGAR|class="lights"|class="motto"/, `${s}: plain has no hangar wording`);
    // The old tagline stays retired; "TEAM Never Forget" is raven575's own team name (11-05) and is the only allowed use.
    assert.doesNotMatch(t.replaceAll('TEAM Never Forget', ''), /never forget/i, `${s}: old tagline`);
  }
});

const menu = fs.readFileSync(path.join(www, 'menu', 'index.html'), 'utf8');

test('the deck and every team page open the menu', () => {
  assert.ok(page.includes('href="menu/"'));
  for (const s of slugs) {
    const t = fs.readFileSync(path.join(teamsDir, s, 'index.html'), 'utf8');
    assert.ok(t.includes('href="/menu/"'), `${s}: menu link`);
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
  assert.ok(menu.includes('<nav class="deckbar"'), 'back to the deck');
  assert.match(menu, /script-src 'none'/);
  assert.doesNotMatch(menu, /style="/);
});

test('menu links that leave the lab are marked, never send a referrer, and use https', () => {
  for (const m of menu.matchAll(/<a href="([^"]+)"([^>]*)>(.*?)<\/a>/g)) {
    const [, href, attrs, label] = m;
    if (href.startsWith('#') || href.startsWith('../') || href.startsWith('/')) continue;
    assert.match(href, /^https:\/\//, href);
    assert.match(attrs, /rel="noreferrer"/, href);
    assert.match(label, /outside the lab/, href);
  }
});

test('every page carries the same deck bar: deck, Menu, Desk, all 11 teams and every lab tool (plain, no emoji)', () => {
  const root = path.join(__dirname, '..', '..');
  const files = ['flight-deck/www/index.html', 'flight-deck/www/desk/index.html', 'flight-deck/www/menu/index.html',
    'bench/www/index.html', 'card-shelf/www/index.html', 'logo-bench/www/index.html', 'wipe-trials/www/index.html',
    ...slugs.map((s) => `flight-deck/www/teams/${s}/index.html`)];
  const strip = (b) => b.replace(/ aria-current="page"/g, '').replace(/<span class="db-here">.*?<\/span>/, '');
  let first;
  for (const f of files) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    const bar = (t.match(/<nav class="deckbar"[^]*?<\/nav>/) || [])[0];
    assert.ok(bar, `${f}: deck bar`);
    assert.doesNotMatch(bar, /\p{Extended_Pictographic}/u, `${f}: plain bar has no emoji`);
    assert.ok(t.includes('<link rel="stylesheet" href="/deckbar.css">'), `${f}: bar style`);
    assert.doesNotMatch(t, /<nav class="back"/, `${f}: old breadcrumb left`);
    for (const h of ['/', '/menu/', '/desk/', '/vcge/', '/vcge/shelf/', ...slugs.map((s) => `/teams/${s}/`)]) assert.ok(bar.includes(`href="${h}"`), `${f}: ${h}`);
    first ??= strip(bar);
    assert.equal(strip(bar), first, `${f}: bar differs from the deck's`);
  }
  assert.ok(fs.readFileSync(path.join(root, 'versions-page', 'vcge-lab-index.py'), 'utf8').includes('<nav class="deckbar"'));
});

// Windows 10 draws emoji only up to Emoji 12.0; newer ones show as an empty box (raven575, 11-10: the Team page
// card 🪪 14.0, the Funhouse mirror 🪞 13.0, the peanut jar 🫙 14.0). These ranges hold the Emoji 13.0+ pictographs.
const TOO_NEW = [[0x1FA74, 0x1FA77], [0x1FA7B, 0x1FA7F], [0x1FA83, 0x1FA8F], [0x1FA96, 0x1FAFF], [0x1F6D6, 0x1F6DF],
  [0x1F6FB, 0x1F6FF], [0x1F7F0, 0x1F7F0], [0x1F90C, 0x1F90C], [0x1F972, 0x1F972], [0x1F977, 0x1F979], [0x1F9A3, 0x1F9A4],
  [0x1F9AB, 0x1F9AD], [0x1F9CB, 0x1F9CC], [0x1F9DE, 0x1F9DF]];
test('no page uses an emoji newer than Emoji 12.0 (Windows 10 shows a box)', () => {
  const root = path.join(__dirname, '..', '..');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return ['.git', 'node_modules', 'test'].includes(e.name) ? [] : walk(p);
    return /\.(html|css|js|py|json|sh)$/.test(e.name) ? [p] : [];
  });
  for (const f of walk(root)) {
    const t = fs.readFileSync(f, 'utf8').replace(/&#(x?)([0-9a-f]+);/gi, (_, x, n) => String.fromCodePoint(parseInt(n, x ? 16 : 10)));
    for (const ch of t) {
      const c = ch.codePointAt(0);
      if (c < 0x1F000) continue;
      const bad = TOO_NEW.find(([a, b]) => c >= a && c <= b);
      assert.ok(!bad, `${path.relative(root, f)}: U+${c.toString(16).toUpperCase()} ${ch} is newer than Emoji 12.0`);
    }
  }
});
