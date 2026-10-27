#!/usr/bin/env python3
"""vCGE lab: the test bench's tiny file service (standard library only, no third-party packages).

Runs as the lab user on 127.0.0.1:8765; Caddy forwards /bench/api/* to it. It does only what a static web server
cannot: list the published builds and the sample library, accept sample uploads, keep each sample's corrected truth,
and store a run's results and report. Everything lives under <www>/bench/data, except the business cards when
--cards-dir points at the Card Shelf's OCR folder (<shelf>/active/ocr); the page loads every photo through
/bench/api/photo. It logs counts and names only, never what a card says.

    vcge-bench-api --root <LAB_ROOT>/www [--port 8765] [--cards-dir <shelf>/active/ocr]
"""
import argparse, json, os, re, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

SETS = ('business-cards', 'handwriting')
IMAGE_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp')
MAX_UPLOAD = 25 * 1024 * 1024
MAX_JSON = 8 * 1024 * 1024
NAME_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,120}$')
SHORT_RE = re.compile(r'^[0-9a-f]{6,12}$')

ROOT = None   # <www>
DATA = None   # <www>/bench/data
CARDS = None  # the business-card samples: <DATA>/samples/business-cards, or the Card Shelf's OCR folder
TYPES = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp'}


def sample_folder(s):
    return CARDS if s == 'business-cards' else os.path.join(DATA, 'samples', s)


def safe_name(name):
    name = os.path.basename(name or '').strip()
    return name if NAME_RE.match(name) and '..' not in name else None


def builds():
    out = []
    vdir = os.path.join(ROOT, 'v')
    for short in os.listdir(vdir) if os.path.isdir(vdir) else []:
        try:
            with open(os.path.join(vdir, short, 'version.json')) as f:
                m = json.load(f)
        except (OSError, ValueError):
            continue
        # The bench imports the build's own source modules by URL, so a build must be published as source.
        src = os.path.isfile(os.path.join(vdir, short, 'src', 'modules', 'mod04-ocr', 'ocrWorker.js'))
        out.append({'short': m.get('short', short), 'subject': m.get('subject', ''), 'date': m.get('date', ''),
                    'tests': m.get('tests', ''), 'source': src})
    out.sort(key=lambda m: m['date'], reverse=True)
    latest = None
    try:
        latest = os.path.basename(os.path.realpath(os.path.join(ROOT, 'latest')))
    except OSError:
        pass
    return {'builds': out, 'latest': latest}


def samples():
    sets = {}
    for s in SETS:
        folder = sample_folder(s)
        rows = []
        for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
            path = os.path.join(folder, name)
            if not os.path.isfile(path) or not name.lower().endswith(IMAGE_EXT):
                continue
            truth = os.path.isfile(os.path.join(DATA, 'truth', s, name + '.json'))
            rows.append({'name': name, 'size': os.path.getsize(path), 'truth': truth})
        sets[s] = rows
    return {'sets': sets}


def runs():
    out = []
    rdir = os.path.join(DATA, 'runs')
    for build in sorted(os.listdir(rdir)) if os.path.isdir(rdir) else []:
        bdir = os.path.join(rdir, build)
        for ts in sorted(os.listdir(bdir)) if os.path.isdir(bdir) else []:
            try:
                with open(os.path.join(bdir, ts, 'summary.json')) as f:
                    out.append({'build': build, 'when': ts, 'summary': json.load(f)})
            except (OSError, ValueError):
                continue
    out.sort(key=lambda r: r['when'], reverse=True)
    return {'runs': out}


class Handler(BaseHTTPRequestHandler):
    server_version = 'vcge-bench/1'

    def log_message(self, fmt, *args):   # names and counts only
        sys.stdout.write('%s %s\n' % (self.command, urlsplit(self.path).path)); sys.stdout.flush()

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > limit:
            self.send_json(413, {'error': 'body missing or too large'}); return None
        return self.rfile.read(n)

    def route(self):
        u = urlsplit(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        return u.path.rstrip('/'), q

    def do_GET(self):
        path, q = self.route()
        if path == '/bench/api/health':
            return self.send_json(200, {'ok': True, 'data': DATA})
        if path == '/bench/api/builds':
            return self.send_json(200, builds())
        if path == '/bench/api/samples':
            return self.send_json(200, samples())
        if path == '/bench/api/runs':
            return self.send_json(200, runs())
        if path == '/bench/api/photo':
            s, name = q.get('set'), safe_name(q.get('name'))
            if s not in SETS or not name or not name.lower().endswith(IMAGE_EXT):
                return self.send_json(400, {'error': 'bad set or name'})
            try:
                with open(os.path.join(sample_folder(s), name), 'rb') as f:
                    data = f.read()
            except OSError:
                return self.send_json(404, {'error': 'no such sample'})
            self.send_response(200)
            self.send_header('Content-Type', TYPES.get(os.path.splitext(name)[1].lower(), 'application/octet-stream'))
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
            return
        if path == '/bench/api/truth':
            s, name = q.get('set'), safe_name(q.get('name'))
            if s not in SETS or not name:
                return self.send_json(400, {'error': 'bad set or name'})
            try:
                with open(os.path.join(DATA, 'truth', s, name + '.json')) as f:
                    return self.send_json(200, json.load(f))
            except OSError:
                return self.send_json(200, {'truth': None})
        self.send_json(404, {'error': 'unknown'})

    def do_PUT(self):
        path, q = self.route()
        s, name = q.get('set'), safe_name(q.get('name'))
        if path == '/bench/api/upload':
            if s not in SETS or not name or not name.lower().endswith(IMAGE_EXT):
                return self.send_json(400, {'error': 'set must be one of %s; name must be an image file' % (SETS,)})
            body = self.read_body(MAX_UPLOAD)
            if body is None: return
            folder = sample_folder(s)
            os.makedirs(folder, exist_ok=True)
            tmp = os.path.join(folder, '.' + name + '.part')
            with open(tmp, 'wb') as f: f.write(body)
            os.replace(tmp, os.path.join(folder, name))
            return self.send_json(200, {'ok': True, 'set': s, 'name': name, 'size': len(body)})
        if path == '/bench/api/truth':
            if s not in SETS or not name:
                return self.send_json(400, {'error': 'bad set or name'})
            body = self.read_body(MAX_JSON)
            if body is None: return
            try:
                truth = json.loads(body)
            except ValueError:
                return self.send_json(400, {'error': 'not JSON'})
            truth['savedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            folder = os.path.join(DATA, 'truth', s)
            os.makedirs(folder, exist_ok=True)
            tmp = os.path.join(folder, '.' + name + '.json.part')
            with open(tmp, 'w') as f: json.dump(truth, f, indent=1)
            os.replace(tmp, os.path.join(folder, name + '.json'))
            return self.send_json(200, {'ok': True})
        self.send_json(404, {'error': 'unknown'})

    def do_POST(self):
        path, q = self.route()
        if path != '/bench/api/runs':
            return self.send_json(404, {'error': 'unknown'})
        body = self.read_body(MAX_JSON)
        if body is None: return
        try:
            run = json.loads(body)
        except ValueError:
            return self.send_json(400, {'error': 'not JSON'})
        build = str(run.get('build', ''))
        if not SHORT_RE.match(build):
            return self.send_json(400, {'error': 'bad build'})
        ts = time.strftime('%Y-%m-%dT%H-%M-%SZ', time.gmtime())
        folder = os.path.join(DATA, 'runs', build, ts)
        os.makedirs(folder, exist_ok=True)
        report = run.pop('reportHtml', '')
        with open(os.path.join(folder, 'results.json'), 'w') as f: json.dump(run, f, indent=1)
        with open(os.path.join(folder, 'summary.json'), 'w') as f: json.dump(run.get('summary', {}), f, indent=1)
        with open(os.path.join(folder, 'report.html'), 'w') as f: f.write(report)
        with open(os.path.join(folder, 'summary.md'), 'w') as f: f.write(run.get('summaryMd', ''))
        return self.send_json(200, {'ok': True, 'path': 'bench/data/runs/%s/%s/' % (build, ts)})


def main():
    global ROOT, DATA, CARDS
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True, help='the lab web root (the folder with v/, latest/ and bench/)')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--cards-dir', help="business-card samples folder, e.g. the Card Shelf's <shelf>/active/ocr")
    a = ap.parse_args()
    ROOT = os.path.abspath(a.root)
    DATA = os.path.join(ROOT, 'bench', 'data')
    CARDS = os.path.abspath(a.cards_dir) if a.cards_dir else os.path.join(DATA, 'samples', 'business-cards')
    for s in SETS:
        os.makedirs(sample_folder(s), exist_ok=True)
        os.makedirs(os.path.join(DATA, 'truth', s), exist_ok=True)
    os.makedirs(os.path.join(DATA, 'runs'), exist_ok=True)
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    print('vcge-bench-api serving %s on 127.0.0.1:%d' % (DATA, a.port)); sys.stdout.flush()
    srv.serve_forever()


if __name__ == '__main__':
    main()
