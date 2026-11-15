#!/usr/bin/env python3
"""vCGE lab: the Test Bench service (standard library only). Lab only; never part of the app.

One running list of every open vCGE test, in two sections: "Needs raven575" (hands-on checks on a real phone or
computer) and "Automatic" (CI jobs, read from the real GitHub Actions runs). Each hands-on test has steps; each step
keeps what raven575 saw (worked / did not / a note); each test keeps a notes log, a status and evidence photos or
screenshots. Tests marked "interactive" need raven575 to report each step's output to a named thread so Claude can
check it step by step.

One engine, one bench per team: each bench is a seed file <seeds>/<bench>.json (kept in git: its title, theme, test
names and steps only; a step may be a plain string or {text, who: human|robot, section, result, resultAt} so a robot's
result rides in with a seed update). Every call names its bench with ?bench= (default vcge). What raven575 records
lives in --root (TESTBENCH_ROOT, outside the web root and every git repo):
    <root>/<bench>/state.json            statuses, step results, notes, evidence list, CI results, tests added on the page
    <root>/<bench>/evidence/<id>/<sha>   the photos and screenshots, by their sha256
Runs as the lab user on 127.0.0.1 (default 8771); Caddy forwards /vcge/testbench/api/* to it. Logs carry the method
and path only. The only outside call is a read of public GitHub Actions results (api.github.com), every 15 minutes.
"""
import argparse, hashlib, json, os, re, threading, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECTIONS = ('raven', 'auto')
STATUSES = ('ready', 'waiting', 'pass', 'fail', 'blocked')
STEP_RESULTS = ('', 'pass', 'fail', 'skip')
IMAGE_TYPES = {b'\x89PNG\r\n\x1a\n': ('png', 'image/png'), b'\xff\xd8\xff': ('jpg', 'image/jpeg'),
               b'GIF87a': ('gif', 'image/gif'), b'GIF89a': ('gif', 'image/gif')}
MAX_IMAGE = 15 * 1024 * 1024
MAX_JSON = 64 * 1024
MAX_NOTE = 4000
MAX_STEPS = 60
ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,47}$')
BENCH_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,23}$')
SHA_RE = re.compile(r'^[0-9a-f]{64}$')
REPO_RE = re.compile(r'^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$')
GITHUB = 'https://api.github.com'
FETCH_EVERY = 15 * 60

ROOT = '/srv/vcge-lab/testbench'
SEEDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'benches')
LOCK = threading.Lock()


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def image_kind(data):
    """('png', 'image/png') etc. from the file's first bytes (never trust the name), or None. WebP: RIFF....WEBP."""
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp', 'image/webp'
    return next((v for k, v in IMAGE_TYPES.items() if data.startswith(k)), None)


def benches():
    return sorted(f[:-5] for f in os.listdir(SEEDS) if f.endswith('.json') and BENCH_RE.match(f[:-5]))


def seed_file(b):
    with open(os.path.join(SEEDS, b + '.json'), encoding='utf-8') as f:
        return json.load(f)


def load_seed(b):
    items = seed_file(b)['items']
    for i in items:   # a step may be a plain string; the page always gets {text, who, ...}
        i['steps'] = [{'who': 'human', **x} if isinstance(x, dict) else {'text': x, 'who': 'human'} for x in i.get('steps', [])]
    return sorted(items, key=lambda i: i.get('order', 0))   # stable: no order keeps the file's order


def bench_dir(b):
    return os.path.join(ROOT, b)


def load_state(b):
    p = os.path.join(bench_dir(b), 'state.json')
    if not os.path.isfile(p):
        return {'items': {}, 'custom': [], 'auto': {}, 'autoFetch': None}
    with open(p, encoding='utf-8') as f:
        s = json.load(f)
    for k, v in (('items', {}), ('custom', []), ('auto', {}), ('autoFetch', None)):
        s.setdefault(k, v)
    return s


def save_state(b, s):
    os.makedirs(bench_dir(b), exist_ok=True)
    tmp = os.path.join(bench_dir(b), '.state.json.part')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(s, f, indent=1, ensure_ascii=False)
    os.replace(tmp, os.path.join(bench_dir(b), 'state.json'))


def blank(item):
    """What raven575 records on one test. status stays None until set on the page, so the seed's status shows."""
    return {'status': None, 'stepResults': {}, 'notes': [], 'evidence': [], 'updated': None}


def all_items(b, s):
    """Seed items, then tests added on the page; an id in both keeps the seed's wording."""
    seed = load_seed(b)
    ids = {i['id'] for i in seed}
    return seed + [c for c in s['custom'] if c['id'] not in ids]


def view(b, s):
    """The page's whole picture: the bench's title and theme, every item with what was recorded on it, the CI results."""
    out = []
    for item in all_items(b, s):
        rec = s['items'].get(item['id']) or blank(item)
        v = {**item, **{k: x for k, x in rec.items() if x is not None}}
        v.setdefault('status', 'ready')
        results = dict(rec['stepResults'])
        for n, st in enumerate(item.get('steps', [])):   # a seed step's own state (a robot's pass) shows until changed
            if str(n) not in results and st.get('state') in STEP_RESULTS[1:]:
                results[str(n)] = {'result': st['state'], 'note': '', 'at': st.get('resultAt'), 'fromSeed': True}
        v['stepResults'] = results
        if item['section'] == 'auto':
            v['ci'] = s['auto'].get(item['id'])
        out.append(v)
    meta = {k: v for k, v in seed_file(b).items() if k in ('title', 'emoji', 'intro', 'theme', 'team', 'sections')}
    return {'bench': {'id': b, **meta}, 'benches': benches(), 'items': out, 'autoFetch': s['autoFetch'], 'now': now()}


def find(b, s, iid):
    return next((i for i in all_items(b, s) if i['id'] == iid), None)


def touch(s, item):
    rec = s['items'].setdefault(item['id'], blank(item))
    rec['updated'] = now()
    return rec


# ---- CI results (public GitHub Actions, read only) ----------------------------------------------------------------

def gh(path):
    req = urllib.request.Request(GITHUB + path, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'vcge-lab-testbench'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def ci_result(ci):
    """The newest finished run of one workflow on one branch, with its jobs (or one job). None when there is none."""
    q = urllib.parse.urlencode({'branch': ci['branch'], 'status': 'completed', 'per_page': 1})
    runs = gh('/repos/%s/actions/workflows/%s/runs?%s' % (ci['repo'], urllib.parse.quote(ci['workflow']), q))['workflow_runs']
    if not runs:
        return None
    run = runs[0]
    jobs = gh('/repos/%s/actions/runs/%d/jobs?per_page=50' % (ci['repo'], run['id']))['jobs']
    if ci.get('job'):
        jobs = [j for j in jobs if j['name'] == ci['job']]
    jobs = [{'name': j['name'], 'conclusion': j['conclusion'],
             'failedStep': next((st['name'] for st in j.get('steps') or [] if st.get('conclusion') == 'failure'), None)} for j in jobs]
    passed = sum(1 for j in jobs if j['conclusion'] == 'success')
    conclusion = run['conclusion'] if not ci.get('job') else ('success' if jobs and passed == len(jobs) else 'failure')
    return {'runId': run['id'], 'url': run['html_url'], 'sha': run['head_sha'][:7], 'title': (run.get('display_title') or '')[:120],
            'finished': run['updated_at'], 'attempt': run.get('run_attempt', 1), 'conclusion': conclusion,
            'jobs': jobs, 'passed': passed, 'total': len(jobs), 'checked': now()}


def fetch_ci(b):
    """Reads every automatic item's CI. A failure is kept and shown on the page as it is; old results stay."""
    with LOCK:
        items = [i for i in all_items(b, load_state(b)) if i['section'] == 'auto' and i.get('ci')]
    got, errors = {}, []
    for item in items:
        try:
            got[item['id']] = ci_result(item['ci'])
        except Exception as e:  # noqa: BLE001 - one unreachable run must not stop the others
            errors.append('%s: %s' % (item['id'], type(e).__name__))
    with LOCK:
        s = load_state(b)
        s['auto'].update({k: v for k, v in got.items() if v})
        s['autoFetch'] = {'at': now(), 'ok': len(got), 'errors': errors}
        save_state(b, s)
    return s['autoFetch']


def watch_ci(every=FETCH_EVERY):
    while True:
        for b in benches():
            try:
                fetch_ci(b)
            except Exception as e:  # noqa: BLE001
                print('ci: fetch failed (%s)' % type(e).__name__, flush=True)
        time.sleep(every)


# ---- Checks on what the page sends --------------------------------------------------------------------------------

def clean_text(v, limit):
    return v.strip()[:limit] if isinstance(v, str) else None


def new_item(b, s, req):
    """A test added on the page (hands-on only; automatic ones come from the seed). Returns (item, error)."""
    title = clean_text(req.get('title'), 120)
    steps = req.get('steps')
    if not title:
        return None, 'give the test a title'
    if not isinstance(steps, list) or not 0 < len(steps) <= MAX_STEPS or not all(isinstance(x, str) and x.strip() for x in steps):
        return None, 'give it 1 to %d steps' % MAX_STEPS
    robot = req.get('robotSteps') if isinstance(req.get('robotSteps'), list) else []
    base = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:36] or 'test'
    iid, n = 'p-' + base, 2
    while find(b, s, iid):
        iid, n = 'p-%s-%d' % (base, n), n + 1
    item = {'id': iid, 'section': 'raven', 'title': title, 'area': clean_text(req.get('area'), 60) or 'Added on the page',
            'why': clean_text(req.get('why'), 600) or '', 'where': clean_text(req.get('where'), 300) or '',
            'steps': [{'text': x.strip()[:400], 'who': 'robot' if n in robot else 'human'} for n, x in enumerate(steps)],
            'status': 'ready', 'added': now()}
    link = clean_text(req.get('link'), 300)
    if link and link.startswith('https://'):
        item['link'] = link
    thread = clean_text(req.get('thread'), 120)
    if req.get('interactive') and thread:
        item['interactive'] = {'thread': thread, 'how': 'Report what each step shows in that thread before going on.'}
    dlink = clean_text(req.get('decisionLink'), 300)
    if dlink and dlink.startswith('https://'):   # a yes or no waits on raven575: the page shows a one-tap link to answer it
        item['decision'] = {'ask': title, 'link': dlink}
    return item, None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):   # method and path only (never the query, a note or a picture)
        print('%s %s' % (self.command, urllib.parse.urlparse(self.path).path), flush=True)

    def log_request(self, code='-', size='-'):   # one line per call, with its answer, so a refused save shows in the journal
        print('%s %s %s' % (self.command, urllib.parse.urlparse(self.path).path, getattr(code, 'value', code)), flush=True)

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > limit:
            return None
        return self.rfile.read(n)

    def read_json(self):
        try:
            v = json.loads(self.read_body(MAX_JSON) or b'null')
        except ValueError:
            return None
        return v if isinstance(v, dict) else None

    def route(self):
        """(path, query, bench); bench is None when ?bench= names no bench this engine has."""
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        b = q.get('bench', 'vcge')
        return u.path, q, (b if BENCH_RE.match(b) and b in benches() else None)

    def do_GET(self):
        path, q, b = self.route()
        if path == '/testbench/api/health':
            return self.send_json(200, {'ok': True})
        if not b:
            return self.send_json(404, {'error': 'no such bench'})
        if path == '/testbench/api/items':
            with LOCK:
                return self.send_json(200, view(b, load_state(b)))
        if path == '/testbench/api/evidence':
            with LOCK:
                s = load_state(b)
            rec = s['items'].get(q.get('id', '')) or {}
            ev = next((e for e in rec.get('evidence', []) if e['hash'] == q.get('hash')), None)
            if not ev or not ID_RE.match(q['id']) or not SHA_RE.match(ev['hash']):
                return self.send_json(404, {'error': 'no such picture'})
            p = os.path.join(bench_dir(b), 'evidence', q['id'], ev['hash'])
            if not os.path.isfile(p):
                return self.send_json(404, {'error': 'the picture file is missing'})
            self.send_response(200)
            self.send_header('Content-Type', ev['type'])
            self.send_header('Content-Length', str(os.path.getsize(p)))
            self.send_header('Content-Security-Policy', "default-src 'none'")
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            with open(p, 'rb') as f:
                self.wfile.write(f.read())
            return None
        return self.send_json(404, {'error': 'unknown'})

    def do_POST(self):
        path, q, b = self.route()
        if not b:
            return self.send_json(404, {'error': 'no such bench'})
        if path == '/testbench/api/refresh':
            return self.send_json(200, fetch_ci(b))
        req = self.read_json()
        if req is None:
            return self.send_json(400, {'error': 'send JSON'})
        with LOCK:
            s = load_state(b)
            if path == '/testbench/api/item':
                item, err = new_item(b, s, req)
                if err:
                    return self.send_json(400, {'error': err})
                s['custom'].append(item)
                save_state(b, s)
                return self.send_json(200, {'ok': True, 'id': item['id']})
            item = find(b, s, q.get('id', ''))
            if not item:
                return self.send_json(404, {'error': 'no such test'})
            if path == '/testbench/api/note':
                text = clean_text(req.get('text'), MAX_NOTE)
                if not text:
                    return self.send_json(400, {'error': 'the note is empty'})
                touch(s, item)['notes'].append({'at': now(), 'text': text})
                save_state(b, s)
                return self.send_json(200, {'ok': True})
        return self.send_json(404, {'error': 'unknown'})

    def do_PUT(self):
        path, q, b = self.route()
        if not b:
            return self.send_json(404, {'error': 'no such bench'})
        with LOCK:
            item = find(b, load_state(b), q.get('id', ''))
        if not item:
            return self.send_json(404, {'error': 'no such test'})
        if path == '/testbench/api/evidence':
            body = self.read_body(MAX_IMAGE)
            if body is None:
                return self.send_json(413, {'error': 'empty, or over %d MB' % (MAX_IMAGE // 1048576)})
            kind = image_kind(body)
            if not kind:
                return self.send_json(400, {'error': 'photos and screenshots only (PNG, JPEG, WebP, GIF)'})
            digest = hashlib.sha256(body).hexdigest()
            step = q.get('step', '')
            with LOCK:
                s = load_state(b)
                rec = touch(s, item)
                if not any(e['hash'] == digest for e in rec['evidence']):
                    d = os.path.join(bench_dir(b), 'evidence', item['id'])
                    os.makedirs(d, exist_ok=True)
                    with open(os.path.join(d, digest), 'wb') as f:
                        f.write(body)
                    name = re.sub(r'[^A-Za-z0-9 ._()-]', '_', os.path.basename(q.get('name', '')))[:80] or 'picture.' + kind[0]
                    rec['evidence'].append({'hash': digest, 'name': name, 'type': kind[1], 'bytes': len(body), 'at': now(),
                                            'step': int(step) if step.isdigit() and int(step) < len(item.get('steps', [])) else None})
                save_state(b, s)
            return self.send_json(200, {'ok': True, 'hash': digest})
        req = self.read_json()
        if req is None:
            return self.send_json(400, {'error': 'send JSON'})
        with LOCK:
            s = load_state(b)
            if path == '/testbench/api/status':
                if req.get('status') not in STATUSES:
                    return self.send_json(400, {'error': 'status is one of %s' % ', '.join(STATUSES)})
                touch(s, item)['status'] = req['status']
                save_state(b, s)
                return self.send_json(200, {'ok': True})
            if path == '/testbench/api/step':
                n = q.get('n', '')
                if not n.isdigit() or int(n) >= len(item.get('steps', [])):
                    return self.send_json(400, {'error': 'no such step'})
                result, note, robot = req.get('result', ''), req.get('note', ''), req.get('robot')
                if result not in STEP_RESULTS or not isinstance(note, str) or not (robot is None or isinstance(robot, str)):
                    return self.send_json(400, {'error': 'a step is {result: pass|fail|skip|"", note, robot?}'})
                rec = {'result': result, 'note': note.strip()[:MAX_NOTE], 'at': now()}
                old = touch(s, item)['stepResults'].get(n) or {}
                if robot is not None or old.get('robot'):   # a robot run's own line, kept when raven575 adds a note
                    rec['robot'] = (robot if robot is not None else old['robot']).strip()[:MAX_NOTE]
                s['items'][item['id']]['stepResults'][n] = rec
                save_state(b, s)
                return self.send_json(200, {'ok': True})
        return self.send_json(404, {'error': 'unknown'})


def main():
    global ROOT, SEEDS, GITHUB
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--root', default=ROOT)
    ap.add_argument('--seeds', default=SEEDS, help='folder of <bench>.json seed files')
    ap.add_argument('--port', type=int, default=8771)
    ap.add_argument('--no-ci', action='store_true', help='do not read GitHub Actions results')
    ap.add_argument('--github', default=GITHUB, help=argparse.SUPPRESS)   # tests point this at a stand-in
    a = ap.parse_args()
    ROOT, SEEDS, GITHUB = a.root, a.seeds, a.github.rstrip('/')
    if not benches():
        raise SystemExit('no <bench>.json seed in %s' % SEEDS)
    for b in benches():
        load_seed(b)   # a broken seed stops the start, loudly
        os.makedirs(os.path.join(bench_dir(b), 'evidence'), exist_ok=True)
    if not a.no_ci:
        threading.Thread(target=watch_ci, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
