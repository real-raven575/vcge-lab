#!/usr/bin/env node
/**
 * vCGE lab: the Night Shift runner. Lab only; runs as the lab user from the nightly timer (night-shift.sh).
 *
 * For the newest published build and the one before it (a fair comparison: same cards, two builds), it opens the
 * robot page in headless Chromium for tonight's Card Factory set and, when there are Print & Snap photos, for those.
 * Each run's scoreboard is saved under --scores/<build>/ and a numbers-only summary goes to --export, where the
 * morning reader picks it up. Photos and what cards say never leave the lab.
 *
 *   node night-shift.mjs --url http://127.0.0.1:8773 --scores <NIGHT_ROOT>/scores --export <NIGHT_ROOT>/export
 *        [--set night-20261127] [--max 300] [--builds 2] [--dry-run]
 * Chromium: Playwright's own, or the binary in CHROMIUM_PATH.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { scoreboard, drops, scoreboardMd } from './www/score.js';

const require = createRequire(import.meta.url);
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const flag = (name) => process.argv.includes(`--${name}`);
const URL0 = arg('url', 'http://127.0.0.1:8773'), SCORES = arg('scores'), EXPORT = arg('export'), MAX = Number(arg('max', 300));
const NBUILDS = Number(arg('builds', 2)), PER_CARD_MS = 90000;
if (!SCORES || !EXPORT) { console.error('need --scores and --export'); process.exit(2); }

const api = async (p) => { const r = await fetch(`${URL0}/night-shift/api/${p}`); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/** The newest saved scoreboard for (build, job, set), or null. */
function saved(build, job, set) {
    const dir = path.join(SCORES, build);
    if (!fs.existsSync(dir)) return null;
    const hits = fs.readdirSync(dir).filter(f => f.endsWith(`-${job}-${set}.json`)).sort();
    return hits.length ? JSON.parse(fs.readFileSync(path.join(dir, hits[hits.length - 1]), 'utf8')) : null;
}

async function runPage(browser, build, job, set, count) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log(`  page error: ${e.message}`));
    const q = new URLSearchParams({ build, job, set, max: String(MAX) });
    await page.goto(`${URL0}/night-shift/robot.html?${q}`);
    await page.waitForFunction(() => window.robotDone, null, { timeout: Math.max(120000, Math.min(count, MAX) * PER_CARD_MS), polling: 2000 });
    const out = await page.evaluate(() => window.robotDone);
    await page.close();
    return out;
}

async function main() {
    const builds = (await api('builds')).builds.filter(b => b.source).slice(0, NBUILDS);
    if (!builds.length) { console.log('No builds with published source; nothing to do.'); return; }
    const sets = (await api('sets')).sets;
    const cardsSet = arg('set') || (sets.find(s => s.kind === 'cards' && s.name.startsWith('night-')) || sets.find(s => s.kind === 'cards') || {}).name;
    const jobs = [];
    if (cardsSet) jobs.push({ job: 'factory', set: cardsSet, count: (sets.find(s => s.name === cardsSet) || {}).count || 0 });
    const photos = (await api('snaps')).photos;
    if (photos.length && sets.some(s => s.kind === 'printed')) jobs.push({ job: 'snaps', set: `snaps-${photos.length}`, count: photos.length });
    if (!jobs.length) { console.log('No Card Factory set and no Print & Snap photos yet; nothing to do.'); return; }
    console.log(`Builds: ${builds.map(b => b.short).join(', ')}. Jobs: ${jobs.map(j => `${j.job} ${j.set} (${j.count})`).join(', ')}.`);
    if (flag('dry-run')) return;

    const { chromium } = require('playwright');
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const lines = [], exported = [];
    try {
        // Oldest first, so the newest build can compare with the one before it on the same cards
        for (const j of jobs) {
            for (const b of [...builds].reverse()) {
                let s = saved(b.short, j.job, j.set);
                if (!s) {
                    console.log(`Running ${j.job} ${j.set} on ${b.short}…`);
                    const out = await runPage(browser, b.short, j.job === 'snaps' ? 'snaps' : 'factory', j.set, j.count);
                    if (!out.ok) { console.log(`  stopped: ${out.error}`); lines.push(`- ${j.job} ${j.set} on ${b.short}: stopped (${out.error})`); continue; }
                    const board = scoreboard(out.rows);
                    const other = builds.find(x => x.short !== b.short && x.date < b.date);
                    const prev = other ? saved(other.short, j.job, j.set) : null;
                    const dropped = prev ? drops(board, prev.board) : [];
                    const when = stamp();
                    const md = scoreboardMd(board, { job: j.job, set: j.set, build: b.short, when, before: prev ? prev.build : null }, dropped);
                    s = { build: b.short, job: j.job, set: j.set, when, rows: out.rows, board, drops: dropped, before: prev ? prev.build : null, unmatched_count: (out.unmatched || []).length, md };
                    fs.mkdirSync(path.join(SCORES, b.short), { recursive: true });
                    fs.writeFileSync(path.join(SCORES, b.short, `${when.replace(/:/g, '-')}-${j.job}-${j.set}.json`), JSON.stringify(s));
                    console.log(md);
                } else console.log(`Already scored: ${j.job} ${j.set} on ${b.short}`);
                if (b.short === builds[0].short) {
                    lines.push(s.md + (s.unmatched_count ? `\n${s.unmatched_count} photos could not be matched to a printed card (they wait on the Test Bench).` : ''));
                    exported.push({ build: s.build, job: s.job, set: s.set, when: s.when, all: s.board.all, groups: s.board.groups, drops: s.drops, before: s.before, unmatched_count: s.unmatched_count });
                }
            }
        }
    } finally {
        await browser.close();
    }
    fs.mkdirSync(EXPORT, { recursive: true });
    const day = stamp().slice(0, 10);
    // Numbers only, so readable by the other lab users who carry it to the morning reader (mode 644)
    const put = (f, text) => { const p = path.join(EXPORT, f); fs.writeFileSync(p, text, { mode: 0o644 }); fs.chmodSync(p, 0o644); };
    put(`night-shift-${day}.json`, JSON.stringify({ made_utc: stamp(), runs: exported }, null, 1));
    put('night-shift-latest.md', `# 🌙 Night Shift ${day}\n\nScores only: no photos, no card text.\n\n${lines.join('\n\n')}\n`);
    const alerts = exported.filter(e => e.drops.length);
    console.log(alerts.length ? `ALERT: ${alerts.length} run(s) got worse; see ${path.join(EXPORT, 'night-shift-latest.md')}` : 'No drops.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
