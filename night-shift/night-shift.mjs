#!/usr/bin/env node
/**
 * vCGE lab: the Night Shift runner. Lab only; runs as the lab user from the nightly timer (night-shift.sh).
 *
 * Fair comparisons only (same cards, two builds): the newest main build against the main build before it, and the
 * newest branch build, if it is newer than main, against the newest main build. A branch is never compared with
 * another branch (trial 1, 11-27: a branch made before a fix looked like main had got worse). For each build it opens
 * the robot page in headless Chromium for tonight's Card Factory set and, when there are Print & Snap photos, for those.
 * Each run's scoreboard is saved under --scores/<build>/ and a numbers-only summary goes to --export, where the
 * morning reader picks it up. Photos and what cards say never leave the lab.
 *
 *   node night-shift.mjs --url http://127.0.0.1:8773 --scores <NIGHT_ROOT>/scores --export <NIGHT_ROOT>/export
 *        [--set night-20261127] [--max 300] [--dry-run]
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
const PER_CARD_MS = 90000;

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

/**
 * Which builds to score and what each is compared with: [{ build, before, report }], oldest first so a "before" is
 * scored first; report = goes into the morning summary (a build scored only as a "before" does not).
 * builds come newest first; b.main is true/false, or null when the lab can't tell (then: newest two by date, as before).
 */
export function plan(builds) {
    builds = builds.filter(b => b.source);
    if (!builds.length) return [];
    if (builds.every(b => b.main == null)) {
        const [now, before] = builds;
        return before ? [{ build: before, before: null, report: false }, { build: now, before, report: true }] : [{ build: now, before: null, report: true }];
    }
    const mains = builds.filter(b => b.main === true);
    const out = [];
    if (mains[1]) out.push({ build: mains[1], before: null, report: false });
    if (mains[0]) out.push({ build: mains[0], before: mains[1] || null, report: true });
    const branch = builds.find(b => b.main === false && (!mains[0] || b.date > mains[0].date));
    if (branch) out.push({ build: branch, before: mains[0] || null, report: true });
    return out;
}

async function main() {
    if (!SCORES || !EXPORT) { console.error('need --scores and --export'); process.exit(2); }
    const runs = plan((await api('builds')).builds);
    if (!runs.length) { console.log('No builds with published source; nothing to do.'); return; }
    const sets = (await api('sets')).sets;
    const cardsSet = arg('set') || (sets.find(s => s.kind === 'cards' && s.name.startsWith('night-')) || sets.find(s => s.kind === 'cards') || {}).name;
    const jobs = [];
    if (cardsSet) jobs.push({ job: 'factory', set: cardsSet, count: (sets.find(s => s.name === cardsSet) || {}).count || 0 });
    const photos = (await api('snaps')).photos;
    if (photos.length && sets.some(s => s.kind === 'printed')) jobs.push({ job: 'snaps', set: `snaps-${photos.length}`, count: photos.length });
    if (!jobs.length) { console.log('No Card Factory set and no Print & Snap photos yet; nothing to do.'); return; }
    console.log(`Builds: ${runs.map(r => r.build.short + (r.before ? ` (against ${r.before.short})` : '')).join(', ')}. Jobs: ${jobs.map(j => `${j.job} ${j.set} (${j.count})`).join(', ')}.`);
    if (flag('dry-run')) return;

    const { chromium } = require('playwright');
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const lines = [], exported = [];
    try {
        // Oldest first, so the newest build can compare with the one before it on the same cards
        for (const j of jobs) {
            for (const { build: b, before: other, report } of runs) {
                let s = saved(b.short, j.job, j.set);
                if (!s) {
                    console.log(`Running ${j.job} ${j.set} on ${b.short}…`);
                    const out = await runPage(browser, b.short, j.job === 'snaps' ? 'snaps' : 'factory', j.set, j.count);
                    if (!out.ok) { console.log(`  stopped: ${out.error}`); lines.push(`- ${j.job} ${j.set} on ${b.short}: stopped (${out.error})`); continue; }
                    const board = scoreboard(out.rows);
                    const prev = other ? saved(other.short, j.job, j.set) : null;
                    const dropped = prev ? drops(board, prev.board) : [];
                    const when = stamp();
                    const md = scoreboardMd(board, { job: j.job, set: j.set, build: b.short, when, before: prev ? prev.build : null }, dropped);
                    s = { build: b.short, job: j.job, set: j.set, when, rows: out.rows, board, drops: dropped, before: prev ? prev.build : null, unmatched_count: (out.unmatched || []).length, md };
                    fs.mkdirSync(path.join(SCORES, b.short), { recursive: true });
                    fs.writeFileSync(path.join(SCORES, b.short, `${when.replace(/:/g, '-')}-${j.job}-${j.set}.json`), JSON.stringify(s));
                    console.log(md);
                } else console.log(`Already scored: ${j.job} ${j.set} on ${b.short}`);
                if (report) {
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
    put('night-shift-latest.md', `# Night Shift ${day}\n\nScores only: no photos, no card text.\n\n${lines.join('\n\n')}\n`);
    const alerts = exported.filter(e => e.drops.length);
    console.log(alerts.length ? `ALERT: ${alerts.length} run(s) got worse; see ${path.join(EXPORT, 'night-shift-latest.md')}` : 'No drops.');
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) main().catch(e => { console.error(e.message); process.exit(1); });
