#!/usr/bin/env python3
"""vCGE lab: the Night Shift's read-only file service (standard library only).

Runs as the lab user on 127.0.0.1 (NIGHT_PORT, default 8773). It never writes anything: the Night Shift runner saves
scoreboards itself. It serves:
  /night-shift/                 the scoreboard page and the robot page (from --page)
  /night-shift/api/health       {"ok": true}
  /night-shift/api/builds       published builds (from <www>/v/*/version.json), newest first; main = on the main branch
                                (true/false), or null when no checkout of the app is found under the lab folder
  /night-shift/api/sets         Card Factory sets: name, kind, count, made
  /night-shift/api/set?name=    one set's manifest (made-up cards and their answers)
  /night-shift/api/image?set=&file=   one picture of a set
  /night-shift/api/sheet?set=   a printed set's PDF (Print & Snap)
  /night-shift/api/snaps        Print & Snap photos waiting in the snaps folder (names and sizes)
  /night-shift/api/snap?name=   one of those photos
  /night-shift/api/scoreboards  saved scoreboards (numbers and labels only), newest first
  /v/<build>/...                the published builds, read-only, so the robot page can load a build's own code
It logs paths only, never what a card says.

    night-shift-api --www <LAB_ROOT>/www --factory <FACTORY_ROOT> --snaps <NIGHT_ROOT>/snaps --scores <NIGHT_ROOT>/scores --page <dir> [--port 8773]
"""
import argparse, glob, json, mimetypes, os, re, subprocess, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs, unquote

NAME_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,160}$')
SET_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$')
IMAGE_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.heic')
TYPES = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json',
         '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.gz': 'application/gzip',
         '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf',
         '.zip': 'application/zip', '.md': 'text/plain; charset=utf-8'}
CFG = {}


def inside(base, rel):
    """The real path of rel under base, or None if it would leave base."""
    base = os.path.realpath(base)
    p = os.path.realpath(os.path.join(base, rel))
    return p if p == base or p.startswith(base + os.sep) else None


def main_commits():
    """Full hashes on the main branch (first parent), from a checkout under the lab folder, like the versions page; set() if none."""
    lab, www = os.path.dirname(os.path.abspath(CFG['www'])), os.path.realpath(CFG['www'])
    found = [g for p in ('.git', '*/.git', '*/*/.git', '*/*/*/.git', '*.git', '*/*.git', '*/*/*.git') for g in glob.glob(os.path.join(lab, p))]
    for repo in sorted({os.path.dirname(g) if os.path.basename(g) == '.git' else g for g in found}):
        if os.path.realpath(repo).startswith(www + os.sep):
            continue
        for ref in ('origin/' + CFG.get('main', 'main'), CFG.get('main', 'main')):
            try:
                r = subprocess.run(['git', '-c', 'safe.directory=*', '-C', repo, 'rev-list', '--first-parent', ref], capture_output=True, text=True, timeout=20)
            except (OSError, subprocess.SubprocessError):
                continue
            if r.returncode == 0 and r.stdout.strip():
                return set(r.stdout.split())
    return set()


def builds():
    out, vdir = [], os.path.join(CFG['www'], 'v')
    mains = main_commits()
    for short in os.listdir(vdir) if os.path.isdir(vdir) else []:
        try:
            with open(os.path.join(vdir, short, 'version.json')) as f:
                m = json.load(f)
        except (OSError, ValueError):
            continue
        src = os.path.isfile(os.path.join(vdir, short, 'src', 'modules', 'mod04-ocr', 'ocrWorker.js'))
        sh = m.get('short', short)
        on_main = any(c.startswith(sh) for c in mains) if mains else None
        out.append({'short': sh, 'date': m.get('date', ''), 'subject': m.get('subject', ''), 'source': src, 'main': on_main})
    out.sort(key=lambda m: m['date'], reverse=True)
    return out


def manifest(name):
    if not SET_RE.match(name or ''):
        return None
    try:
        with open(os.path.join(CFG['factory'], name, 'manifest.json')) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def sets():
    out = []
    root = CFG['factory']
    for name in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        m = manifest(name)
        if m:
            out.append({'name': name, 'kind': m.get('kind'), 'count': len(m.get('cards', [])), 'made_utc': m.get('made_utc'),
                        'pdf': m.get('kind') == 'printed'})
    out.sort(key=lambda s: s.get('made_utc') or '', reverse=True)
    return out


def snaps():
    out, root = [], CFG['snaps']
    for dirpath, _, files in os.walk(root):
        for fn in sorted(files):
            if fn.lower().endswith(IMAGE_EXT):
                rel = os.path.relpath(os.path.join(dirpath, fn), root)
                out.append({'name': rel, 'size': os.path.getsize(os.path.join(dirpath, fn))})
    out.sort(key=lambda s: s['name'])
    return out


def scoreboards():
    out, root = [], CFG['scores']
    for build in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        bdir = os.path.join(root, build)
        for fn in sorted(os.listdir(bdir)) if os.path.isdir(bdir) else []:
            if not fn.endswith('.json'):
                continue
            try:
                with open(os.path.join(bdir, fn)) as f:
                    s = json.load(f)
                out.append({k: s.get(k) for k in ('build', 'job', 'set', 'when', 'board', 'drops', 'before', 'unmatched_count', 'md')})
            except (OSError, ValueError):
                continue
    out.sort(key=lambda s: s.get('when') or '', reverse=True)
    return out[:200]


class Handler(BaseHTTPRequestHandler):
    server_version = 'vcge-night-shift/1'

    def log_message(self, fmt, *args):
        sys.stdout.write('%s %s\n' % (self.command, urlsplit(self.path).path)); sys.stdout.flush()

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path):
        if not path or not os.path.isfile(path):
            return self.send_json(404, {'error': 'not found'})
        ext = os.path.splitext(path)[1].lower()
        self.send_response(200)
        self.send_header('Content-Type', TYPES.get(ext) or mimetypes.guess_type(path)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(os.path.getsize(path)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        with open(path, 'rb') as f:
            while True:
                chunk = f.read(1 << 16)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def do_GET(self):
        u = urlsplit(self.path)
        path = unquote(u.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if path.startswith('/v/'):
            return self.send_file(inside(os.path.join(CFG['www'], 'v'), path[3:]))
        if not path.startswith('/night-shift/'):
            return self.send_json(404, {'error': 'unknown'})
        rest = path[len('/night-shift/'):]
        if not rest.startswith('api/'):
            return self.send_file(inside(CFG['page'], rest or 'index.html'))
        api = rest[4:].rstrip('/')
        if api == 'health':
            return self.send_json(200, {'ok': True})
        if api == 'builds':
            return self.send_json(200, {'builds': builds()})
        if api == 'sets':
            return self.send_json(200, {'sets': sets()})
        if api == 'set':
            m = manifest(q.get('name'))
            return self.send_json(200, m) if m else self.send_json(404, {'error': 'no such set'})
        if api == 'image':
            name, fn = q.get('set', ''), os.path.basename(q.get('file', ''))
            if not SET_RE.match(name) or not NAME_RE.match(fn):
                return self.send_json(400, {'error': 'bad name'})
            return self.send_file(inside(os.path.join(CFG['factory'], name), fn))
        if api == 'sheet':
            name = q.get('set', '')
            m = manifest(name)
            if not m or m.get('kind') != 'printed':
                return self.send_json(404, {'error': 'no printed set'})
            return self.send_file(inside(os.path.join(CFG['factory'], name), name + '.pdf'))
        if api == 'snaps':
            return self.send_json(200, {'photos': snaps()})
        if api == 'snap':
            rel = q.get('name', '')
            if any(not NAME_RE.match(p) for p in rel.split('/')):
                return self.send_json(400, {'error': 'bad name'})
            return self.send_file(inside(CFG['snaps'], rel))
        if api == 'scoreboards':
            return self.send_json(200, {'scoreboards': scoreboards()})
        return self.send_json(404, {'error': 'unknown'})


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--www', required=True)
    ap.add_argument('--factory', required=True)
    ap.add_argument('--snaps', required=True)
    ap.add_argument('--scores', required=True)
    ap.add_argument('--page', required=True)
    ap.add_argument('--port', type=int, default=8773)
    a = ap.parse_args(argv)
    CFG.update({k: os.path.abspath(getattr(a, k)) for k in ('www', 'factory', 'snaps', 'scores', 'page')})
    CFG['main'] = os.environ.get('VCGE_MAIN_BRANCH', 'main')
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    print('night-shift-api on 127.0.0.1:%d' % a.port); sys.stdout.flush()
    srv.serve_forever()


if __name__ == '__main__':
    main()
