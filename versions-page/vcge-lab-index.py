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
    return (f'<tr><td><a href="{link}">{html.escape(label)}</a></td><td><code>{html.escape(m["short"])}</code></td>'
            f'<td class="ver">{html.escape(version_of(m))}</td>'
            f'<td>{html.escape(m["subject"])}</td><td>{when(utc(m["date"]))}</td>'
            f'<td class="{cls}">{tests}</td><td><a href="v/{m["short"]}/build.log">log</a></td></tr>')

now = when(datetime.now(timezone.utc))
# When the lab has a Flight Deck (a front page for several teams, see flight-deck/), link back to it.
back = '<p><a href="/">&larr; Flight Deck</a></p>' if os.path.isdir(os.path.join(os.path.dirname(LAB), 'portal', 'www')) else ''
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>vCGE Lab</title><style>
body{{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;background:#f6f7f9;color:#14181f}}
main{{max-width:1000px;margin:auto}} h1{{margin:0 0 4px}} h2{{margin-top:28px}} p{{color:#5b6472;margin:0}}
.fresh{{margin-top:16px;padding:12px 14px;border:1px solid #e3e6ea;border-radius:10px;background:#fff}} .fresh a.btn{{display:inline-block;margin-top:8px;padding:8px 14px;border-radius:8px;background:#b42318;color:#fff;text-decoration:none;font-weight:600}}
.wrap{{overflow-x:auto}} table{{border-collapse:collapse;width:100%;background:#fff}} th,td{{text-align:left;padding:8px 10px;border-bottom:1px solid #e3e6ea;vertical-align:top}}
th{{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6472}} a{{color:#0b63c5}} .ok{{color:#13803a}} .ver{{white-space:nowrap;font-variant-numeric:tabular-nums}} .local{{display:block;color:#5b6472;font-size:12px}} p .local{{display:inline;font-size:inherit}} p .local::before{{content:' / '}} .bad{{color:#b42318;font-weight:600}}
@media (prefers-color-scheme:dark){{body{{background:#0f1217;color:#e6e8eb}} table,.fresh{{background:#161a21}} .fresh{{border-color:#262c36}} th,td{{border-color:#262c36}} p,th,.local{{color:#9aa3b0}} a{{color:#6cb2ff}}}}
</style></head><body><main>
{back}<h1>vCGE Lab</h1><p>Every pushed version of vCGE, built on this machine. <a href="latest/">Open the newest build</a>. Updated {now}.</p>
<div class="fresh"><p><strong>Start fresh.</strong> All versions on this address share one saved vault and settings (browsers keep data per site, not per folder), so a vault made in one version is the vault every version asks for. This deletes everything this browser saved for the lab: the vault, the session, settings and cached files.</p>
<a class="btn" href="reset.html" onclick="return confirm('Delete everything this browser saved for the vCGE lab (vault, settings, cache)? This cannot be undone.')">Start fresh: clear this browser's lab data</a></div>
<h2>Branches</h2><div class="wrap"><table><tr><th>Branch</th><th>Commit</th><th>Version</th><th>Change</th><th>Committed</th><th>Unit tests</th><th></th></tr>
{''.join(row(f"b/{n}/", n, m) for n, m in branches)}</table></div>
<h2>All versions</h2><div class="wrap"><table><tr><th>Build</th><th>Commit</th><th>Version</th><th>Change</th><th>Committed</th><th>Unit tests</th><th></th></tr>
{''.join(row(f"v/{m['short']}/", m['short'], m) for m in versions)}</table></div>
<script>
// Each time is written in UTC; add the same moment in this device's own time zone, e.g. "08:31 EDT (UTC-4)".
for (const t of document.querySelectorAll('time[datetime]')) {{
  const d = new Date(t.getAttribute('datetime')), p = n => String(n).padStart(2, '0'), off = -d.getTimezoneOffset();
  const zone = new Intl.DateTimeFormat('en-US', {{timeZoneName: 'short'}}).formatToParts(d).find(x => x.type === 'timeZoneName').value;
  const utcOff = 'UTC' + (off < 0 ? '-' : '+') + Math.floor(Math.abs(off) / 60) + (Math.abs(off) % 60 ? ':' + p(Math.abs(off) % 60) : '');
  t.nextElementSibling.textContent = `${{d.getFullYear()}}-${{p(d.getMonth() + 1)}}-${{p(d.getDate())}} ${{p(d.getHours())}}:${{p(d.getMinutes())}} ${{zone}} (${{utcOff}})`;
}}
</script>
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
