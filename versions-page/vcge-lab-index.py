#!/usr/bin/env python3
"""Writes the lab's index page (one row per branch and per published version, newest first) and its Start fresh page.

    vcge-lab-index <LAB_ROOT>/www        (env VCGE_MAIN_BRANCH: the branch that counts for version numbers, default main)
"""
import glob, html, json, os, subprocess, sys
from datetime import datetime, timezone

www = sys.argv[1]
def meta(short):
    try:
        with open(os.path.join(www, 'v', short, 'version.json')) as f: return json.load(f)
    except (OSError, ValueError): return None

branches = []
bdir = os.path.join(www, 'b')
for name in sorted(os.listdir(bdir)) if os.path.isdir(bdir) else []:
    path = os.path.join(bdir, name)
    if os.path.islink(path):
        m = meta(os.path.basename(os.readlink(path)))
        if m: branches.append((name, m))
versions = [m for m in (meta(s) for s in os.listdir(os.path.join(www, 'v'))) if m]
def utc(iso):  # git's commit date carries the committer's own offset; turn it into UTC
    return datetime.fromisoformat(iso.replace('Z', '+00:00')).astimezone(timezone.utc)
versions.sort(key=lambda m: utc(m['date']), reverse=True)

# Human-friendly version, 0.MMM.BB: MMM is the milestone, BB counts the commits on the main
# branch since that milestone began, from 01. Milestones start at the commits listed in milestones.txt (one
# "<commit> <0.MMM>" per line); a build that is not on the main branch shows "branch build".
LAB = os.path.dirname(os.path.abspath(www))
MAIN = os.environ.get('VCGE_MAIN_BRANCH', 'main')
def main_commits():  # oldest first, full hashes; [] if the checkout can't be read
    found = [g for p in ('.git', '*/.git', '*/*/.git', '*/*/*/.git', '*.git', '*/*.git', '*/*/*.git')
             for g in glob.glob(os.path.join(LAB, p))]  # working checkouts and bare clones, up to three folders down
    for repo in sorted({os.path.dirname(g) if os.path.basename(g) == '.git' else g for g in found}):
        if os.path.realpath(repo).startswith(os.path.realpath(www) + os.sep): continue  # published builds, not a checkout
        for ref in ('origin/' + MAIN, MAIN):
            try:
                out = subprocess.run(['git', '-c', 'safe.directory=*', '-C', repo, 'rev-list', '--first-parent', '--reverse', ref],
                                     capture_output=True, text=True, timeout=20)
            except (OSError, subprocess.SubprocessError): continue
            if out.returncode == 0 and out.stdout.strip(): return out.stdout.split()
    return []
starts = []
try:
    with open(os.path.join(LAB, 'milestones.txt')) as f:
        starts = [line.split()[:2] for line in f if len(line.split()) >= 2 and not line.startswith('#')]
except OSError: pass
numbers, label, count = {}, None, 0
for sha in main_commits():
    for start, name in starts:
        if sha.startswith(start): label, count = name, 0
    count += 1
    if label: numbers[sha] = f'{label}.{count:02d}'
def version_of(m):
    for sha, v in numbers.items():
        if sha.startswith(m['short']): return v
    return 'branch build' if numbers else ''

def when(d):  # UTC as text; the script at the end of the page adds the viewer's local time next to it
    return (f'<time datetime="{d.strftime("%Y-%m-%dT%H:%M:%SZ")}">{d.strftime("%Y-%m-%d %H:%M")} UTC</time>'
            '<span class="local"></span>')

def row(link, label, m):
    tests = html.escape(m.get('tests', ''))
    cls = 'bad' if tests == 'FAILED' else 'ok' if tests == 'passed' else ''
    mark = '<span class="nut" aria-hidden="true">🥜</span> ' if tests == 'passed' else ''
    v = version_of(m)
    tip = f' title="Milestone {html.escape(v.rsplit(".", 1)[0])}, build {html.escape(v.rsplit(".", 1)[1])} on the main trail"' if v.count('.') == 2 else ''
    return (f'<tr><td><a href="{link}">{html.escape(label)}</a></td><td><code>{html.escape(m["short"])}</code></td>'
            f'<td class="ver"{tip}>{html.escape(v)}</td>'
            f'<td>{html.escape(m["subject"])}</td><td>{when(utc(m["date"]))}</td>'
            f'<td class="{cls}">{mark}{tests}</td><td><a href="v/{m["short"]}/build.log">log</a></td></tr>')

# Cornerstone's theme: the versions page is "The Elephant's Memory", kept by Cornerstone (PM,
# elephant). Quips, the peanut jar and the "remember" word are decoration only; every fact stays in plain text.
# On the plain edition this block is replaced by the untitled page.
now = when(datetime.now(timezone.utc))
newest = versions[0] if versions else None
memory = json.dumps({
    'count': len(versions), 'passed': sum(1 for m in versions if m.get('tests') == 'passed'),
    'failed': sum(1 for m in versions if m.get('tests') == 'FAILED'),
    'newest': {k: newest[k] for k in ('short', 'subject', 'tests') if k in newest} if newest else None,
    'oldest': {'short': versions[-1]['short'], 'subject': versions[-1]['subject'],
               'date': utc(versions[-1]['date']).strftime('%Y-%m-%d %H:%M UTC')} if versions else None,
}).replace('<', '\\u003c')
portal = os.path.isdir(os.path.join(os.path.dirname(LAB), 'portal', 'www'))  # the Flight Deck is installed: link back to it
back = '<a class="back" href="/">&larr; Flight Deck</a>' if portal else ''

ELEPHANT = '''<svg viewBox="0 0 96 80" width="76" height="64" aria-hidden="true" class="ele">
<g class="body"><ellipse cx="54" cy="44" rx="30" ry="21"/><rect x="32" y="52" width="10" height="20" rx="4"/><rect x="46" y="54" width="10" height="18" rx="4"/>
<rect x="62" y="54" width="10" height="18" rx="4"/><rect x="74" y="50" width="9" height="22" rx="4"/><path d="M83 40c6 2 8 8 6 12" fill="none" stroke-width="3" class="tail"/></g>
<g class="trunk"><path d="M20 40c-6 8-8 18-4 26 2 3 6 2 6-1-3-6-1-13 4-19"/></g>
<circle cx="28" cy="34" r="16" class="head"/><path d="M34 22c10-6 22 0 20 14-1 8-10 12-18 8" class="ear"/>
<circle cx="24" cy="31" r="2.2" class="eye"/><path d="M19 44c-3 4-8 5-11 3" fill="none" stroke-width="3" class="tusk"/>
<path d="M40 72h-2M54 72h-2" class="toe"/></svg>'''

CSS = '''
:root{--bg:#F5F1E8;--panel:#FFFDF8;--panel2:#F9F5EC;--ink:#23262D;--dim:#62676F;--line:#E4DCCB;--accent:#A64B22;--gold:#9A6A0E;
--hide:#7A8696;--hide2:#5F6B7A;--ear:#C9A1A1;--link:#1F5FAE;--ok:#2B7340;--bad:#B42318;--shadow:0 1px 2px rgba(35,38,45,.05),0 8px 22px rgba(35,38,45,.06)}
@media (prefers-color-scheme:dark){:root{--bg:#14161B;--panel:#1C1F26;--panel2:#22262E;--ink:#E8E4DA;--dim:#A39D90;--line:#2E333D;
--accent:#E8946A;--gold:#E2B04A;--hide:#8F9BAB;--hide2:#AAB5C3;--ear:#B98E8E;--link:#8CBCFF;--ok:#72CF8C;--bad:#FF8A7A;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 22px rgba(0,0,0,.25)}}
*{box-sizing:border-box} html{color-scheme:light dark}
body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:0 0 32px;background:var(--bg);color:var(--ink);
background-image:radial-gradient(ellipse 80% 40% at 50% -10%,color-mix(in srgb,var(--gold) 16%,transparent),transparent 70%)}
main{max-width:1040px;margin:auto;padding:0 16px} a{color:var(--link)} p{margin:0} h2{margin:28px 0 2px;font-size:1.15rem}
.top{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 0 10px} .back{color:var(--dim);text-decoration:none;font-size:.9rem;width:100%}
.back:hover{color:var(--ink)}
h1{margin:0;font:700 1.8rem/1.1 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;color:var(--accent)}
.tag{color:var(--dim);font-size:.9rem} .mast{display:flex;align-items:center;gap:14px;flex:1;min-width:260px}
.cs{border:0;background:none;padding:4px;cursor:pointer;border-radius:14px;color:inherit}
.cs:focus-visible{outline:3px solid var(--link);outline-offset:2px}
.ele .body,.ele .head{fill:var(--hide)} .ele .trunk path{fill:var(--hide2)} .ele .ear{fill:var(--ear);stroke:var(--hide2);stroke-width:2}
.ele .eye{fill:var(--ink)} .ele .tusk{stroke:var(--panel)} .ele .tail{stroke:var(--hide2)} .ele .toe{stroke:var(--panel);stroke-width:2}
.ele .trunk{transform-origin:22px 40px;transition:transform .5s ease} .cs.wave .trunk{transform:rotate(28deg)}
.cs:hover .ele .ear{transform-origin:36px 30px;transform:rotate(-6deg);transition:transform .4s ease}
.speech{position:relative;display:flex;gap:10px;align-items:flex-start;margin:6px 0 16px;padding:12px 14px;background:var(--panel);
border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:1rem}
.speech::before{content:"🐘";font-family:system-ui,sans-serif}
.updated{color:var(--dim);font-size:.85rem}
.tiles{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-top:12px}
.tile{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:12px;background:var(--panel);border:1px solid var(--line);
text-decoration:none;color:var(--ink);box-shadow:var(--shadow);transition:transform .2s,border-color .2s;min-height:60px}
.tile:hover{transform:translateY(-2px);border-color:var(--accent)} .tile:focus-visible{outline:3px solid var(--link);outline-offset:2px}
.tile .ic{font-size:1.5rem} .tile b{display:block} .tile small{color:var(--dim)} .tile.fresh{border-color:color-mix(in srgb,var(--bad) 45%,var(--line))}
.tile.fresh b{color:var(--bad)}
.note{margin-top:10px;color:var(--dim);font-size:.85rem}
.sub{color:var(--dim);font-style:italic;margin-bottom:8px}
.trail{height:14px;margin:22px 0 0;background:radial-gradient(circle,color-mix(in srgb,var(--hide) 40%,transparent) 3px,transparent 4px) 0 0/28px 14px repeat-x;opacity:.7}
.wrap{overflow-x:auto;border-radius:12px;box-shadow:var(--shadow)} table{border-collapse:collapse;width:100%;background:var(--panel)}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);background:var(--panel2)}
tr:hover td{background:color-mix(in srgb,var(--gold) 6%,transparent)}
.ok{color:var(--ok);white-space:nowrap} .bad{color:var(--bad);font-weight:600} .ver{white-space:nowrap;font-variant-numeric:tabular-nums}
.local{display:block;color:var(--dim);font-size:12px} .updated .local{display:inline;font-size:inherit} .updated .local::before{content:' / '}
.nut{display:inline-block;transition:transform .3s} tr:hover .nut{transform:rotate(-20deg)}
.jar{margin-top:20px;color:var(--dim);font-size:.85rem;cursor:help}
.lane{margin:12px 0 0;padding:12px 14px;border-radius:12px;border:2px dashed var(--gold);background:var(--panel)}
.hidden{display:none}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
'''

JS = '''
// Each time is written in UTC; add the same moment in this device's own time zone, e.g. "08:31 EDT (UTC-4)".
for (const t of document.querySelectorAll('time[datetime]')) {
  const d = new Date(t.getAttribute('datetime')), p = n => String(n).padStart(2, '0'), off = -d.getTimezoneOffset();
  const zone = new Intl.DateTimeFormat('en-US', {timeZoneName: 'short'}).formatToParts(d).find(x => x.type === 'timeZoneName').value;
  const utcOff = 'UTC' + (off < 0 ? '-' : '+') + Math.floor(Math.abs(off) / 60) + (Math.abs(off) % 60 ? ':' + p(Math.abs(off) % 60) : '');
  t.nextElementSibling.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} ${zone} (${utcOff})`;
}
// Cornerstone: a quip on arrival that fits the newest build, another each time the elephant is pressed, and one hidden phrase.
(() => {
  const mem = JSON.parse(document.getElementById('memory').textContent);
  const says = document.getElementById('says'), cs = document.getElementById('cs');
  const quips = [
    'An elephant remembers. Every build that landed here is still on the shelf.',
    'I hold the formation. You pick the build.',
    'Newest at the top, oldest at the bottom. Nobody gets lost in my herd.',
    'Every row was built here and tested here, and nothing was sent anywhere.',
    'Forgetful people are the reason we exist. I remember so they don\\'t have to.',
    'One vault per browser, shared by every build. If things get tangled, Start fresh.',
    'When a build fails its tests I say so out loud. An honest failure beats a quiet one.',
    'Glyph is reading cards next door. Ghost is wiping things. I am counting.',
    'Peanuts go in the jar for every build that passes. I\\'m saving them for release day.',
  ];
  const first = !mem.newest ? 'No builds on the shelf yet. I will remember the first one.'
    : mem.newest.tests === 'FAILED' ? `The newest build, ${mem.newest.short}, failed its unit tests. I won't pretend otherwise. Its log is in the first row.`
    : `${mem.count} builds remembered. The newest, ${mem.newest.short}, ${mem.newest.tests === 'passed' ? 'passed its tests' : 'is on the shelf'}. Trunk's up, ready when you are.`;
  const h = new Date().getHours();
  says.textContent = (h < 5 || h >= 23) ? `Late shift. ${first}` : first;
  let i = -1;
  cs.addEventListener('click', () => {
    i = (i + 1) % quips.length; says.textContent = quips[i];
    cs.classList.add('wave'); setTimeout(() => cs.classList.remove('wave'), 700);
  });
  const jar = document.getElementById('jar');
  jar.textContent = `🫙 Peanut jar: ${mem.passed} of ${mem.count} builds passed their unit tests` + (mem.failed ? `, ${mem.failed} did not.` : '.');
  jar.title = 'Cornerstone is saving them for release day.';
  // Type "remember" anywhere to walk down memory lane to the oldest build still on the shelf.
  const phrase = 'remember'; let typed = '';
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select') || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-phrase.length);
    if (typed !== phrase || !mem.oldest) return;
    const lane = document.getElementById('lane');
    lane.textContent = `🐘 Memory lane: the oldest build I still keep is ${mem.oldest.short}, "${mem.oldest.subject}", from ${mem.oldest.date}. I remember everything. I just tidy the shelf sometimes.`;
    lane.classList.remove('hidden');
    says.textContent = 'You said the words. Down memory lane we go.';
  });
})();
'''

head = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        "<title>vCGE Lab: The Elephant's Memory</title><style>" + CSS + '</style></head><body><main>')
page = head + f'''
<header class="top">{back}<div class="mast"><button type="button" class="cs" id="cs" aria-label="Ask Cornerstone for another thought">{ELEPHANT}</button>
<div><h1>The Elephant's Memory</h1><p class="tag">vCGE Lab &middot; kept by Cornerstone, PM &middot; every pushed version of vCGE, built on this machine</p></div></div></header>
<p class="speech" role="status" aria-live="polite"><span id="says">Every build that landed here is still on the shelf.</span></p>
<p class="updated">Page updated {now}.</p>
<nav class="tiles" aria-label="Lab tools">
<a class="tile" href="latest/"><span class="ic" aria-hidden="true">🛫</span><span><b>Newest build</b><small>Open the app as it is right now</small></span></a>
<a class="tile" href="bench/"><span class="ic" aria-hidden="true">🦉</span><span><b>The Reading Room</b><small>Glyph's OCR bench</small></span></a>
<a class="tile" href="testing/"><span class="ic" aria-hidden="true">🦝</span><span><b>Wipe Trials</b><small>Ghost's test range</small></span></a>
<a class="tile fresh" href="reset.html" onclick="return confirm('Delete everything this browser saved for the vCGE lab (vault, settings, cache)? This cannot be undone.')"><span class="ic" aria-hidden="true">🧹</span><span><b>Start fresh</b><small>Clear this browser's lab data</small></span></a>
</nav>
<p class="note"><strong>About Start fresh:</strong> all versions on this address share one saved vault and settings (browsers keep data per site, not per folder), so a vault made in one version is the vault every version asks for. Start fresh deletes everything this browser saved for the lab: the vault, the session, settings and cached files.</p>
<p class="lane hidden" id="lane" role="status"></p>
<div class="trail" aria-hidden="true"></div>
<h2>Branches</h2><p class="sub">Where each trail ends right now.</p><div class="wrap"><table><tr><th>Branch</th><th>Commit</th><th>Version</th><th>Change</th><th>Committed</th><th>Unit tests</th><th></th></tr>
{''.join(row(f"b/{n}/", n, m) for n, m in branches)}</table></div>
<div class="trail" aria-hidden="true"></div>
<h2>All versions</h2><p class="sub">The long memory: every build still on the shelf, newest first.</p><div class="wrap"><table><tr><th>Build</th><th>Commit</th><th>Version</th><th>Change</th><th>Committed</th><th>Unit tests</th><th></th></tr>
{''.join(row(f"v/{m['short']}/", m['short'], m) for m in versions)}</table></div>
<p class="jar" id="jar"></p>
<script type="application/json" id="memory">{memory}</script>
<script>{JS}</script>
</main></body></html>'''
# The Start fresh page. The web server sends it with "Clear-Site-Data", so the browser deletes this site's storage,
# cookies and cache as it opens; the script below clears the same things itself for browsers without that header.
reset = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>vCGE Lab: start fresh</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;background:#f6f7f9;color:#14181f} main{max-width:640px;margin:auto}
a{color:#0b63c5} .done{color:#13803a;font-weight:600} @media (prefers-color-scheme:dark){body{background:#0f1217;color:#e6e8eb} a{color:#6cb2ff}}
</style></head><body><main><h1>Start fresh</h1><p id="status">Clearing this browser's lab data...</p>
<p>Passkeys you added are kept by your device's password manager, not by this page. To remove one, delete the entry for this address there (on Android: Google Password Manager).</p>
<p><a href="./">Back to the lab</a> &middot; <a href="latest/">Open the newest build</a></p>
<script>
(async () => {
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
  try { if (indexedDB.databases) for (const db of await indexedDB.databases()) indexedDB.deleteDatabase(db.name); } catch (e) {}
  try { if (window.caches) for (const key of await caches.keys()) await caches.delete(key); } catch (e) {}
  try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch (e) {}
  document.cookie.split(';').forEach(c => { const n = c.split('=')[0].trim(); if (n) document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });
  const s = document.getElementById('status'); s.textContent = 'Done: this browser has no saved vCGE lab data now. The next build you open starts with a new vault.'; s.className = 'done';
})();
</script></main></body></html>'''
tmp = os.path.join(www, 'reset.html.tmp')
with open(tmp, 'w') as f: f.write(reset)
os.replace(tmp, os.path.join(www, 'reset.html'))

tmp = os.path.join(www, 'index.html.tmp')
with open(tmp, 'w') as f: f.write(page)
os.replace(tmp, os.path.join(www, 'index.html'))
