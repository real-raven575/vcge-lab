#!/usr/bin/env python3
"""vCGE lab: Tester Voices, where raven575 drops what testers said about an app (standard library only).

One engine, one shelf per app (?app=vcge default, ?app=auto-fixer). Runs as the lab user on 127.0.0.1:8772; Caddy
forwards /vcge/voices/api/* to it. Everything lives outside the web root and outside every git repo:

    <root>/<app>/drops.json             every drop: cleaned words, tester codename, tags, status, notes, times
    <root>/<app>/shots/<sha256>.<ext>   screenshots, by the sha256 of their bytes

Testers are real people. The page swaps the names raven575 lists for codenames (T1, T2...) before anything is sent,
and this service hides e-mail addresses and phone numbers again on arrival, so the words saved here never carry
contact data. Screenshots cannot be cleaned and may show names: they stay on this machine and are only ever shown
to the lab. Logs carry the method and path only, never what a tester said.

    voices-api --root <LAB_ROOT>/voices [--port 8772]
"""
import argparse, hashlib, json, os, re, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

APPS = {'vcge': 'vCGE', 'auto-fixer': 'Auto-Fixer'}
TAGS = ('bug', 'idea', 'praise', 'question', 'confusing')
STATUSES = ('new', 'read', 'sent', 'done')   # sent = passed on to the owning team or pilot
SOURCES = ('chat', 'text', 'email', 'call', 'in-person', 'other')
MAX_TEXT = 60_000
MAX_JSON = 128 * 1024
MAX_SHOT = 15 * 1024 * 1024
MAX_SHOTS = 12
ID_RE = re.compile(r'^d[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$')
HASH_RE = re.compile(r'^[0-9a-f]{64}$')
TESTER_RE = re.compile(r'^[A-Za-z0-9 #._-]{1,24}$')
SHOT_TYPES = {b'\x89PNG\r\n\x1a\n': ('png', 'image/png'), b'\xff\xd8\xff': ('jpg', 'image/jpeg'),
              b'GIF8': ('gif', 'image/gif')}
CTYPE = {'png': 'image/png', 'jpg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp'}

# The same safety net the page uses (voices-core.js): contact data never reaches the disk.
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
PHONE = re.compile(r'(?<![\w])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w])')
HANDLE = re.compile(r'(?<![\w.@])@[A-Za-z0-9_][A-Za-z0-9_.]{1,29}')

ROOT = None
LOCK = threading.Lock()


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def scrub(text):
    """Hides e-mail addresses, @handles and phone numbers (names are swapped on the page, which knows them)."""
    return PHONE.sub('[phone hidden]', HANDLE.sub('[@handle hidden]', EMAIL.sub('[email hidden]', text)))


def shot_kind(data):
    for magic, kind in SHOT_TYPES.items():
        if data.startswith(magic):
            return kind[0]
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp'
    return None


def app_dir(app):
    return os.path.join(ROOT, app)


def load(app):
    try:
        with open(os.path.join(app_dir(app), 'drops.json')) as f:
            rows = json.load(f)
        return rows if isinstance(rows, list) else []
    except (OSError, ValueError):
        return []


def save(app, rows):
    os.makedirs(app_dir(app), exist_ok=True)
    path = os.path.join(app_dir(app), 'drops.json')
    tmp = path + '.part'
    with open(tmp, 'w') as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
    os.replace(tmp, path)   # a crash mid-write never leaves half a file


def new_id():
    return 'd' + time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '-' + os.urandom(2).hex()


def clean_tags(tags):
    if not isinstance(tags, list):
        return None
    out = [t for t in TAGS if t in tags]
    return out if len(out) == len(set(tags)) else None


def next_tester(rows):
    """The next free codename, T1, T2..., so raven575 never has to remember who was T7."""
    used = {int(m.group(1)) for r in rows for m in [re.match(r'^T(\d+)$', r.get('tester', ''))] if m}
    n = 1
    while n in used:
        n += 1
    return 'T%d' % n


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):   # method and path only
        sys.stdout.write('%s %s\n' % (self.command, urlsplit(self.path).path)); sys.stdout.flush()

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > limit:
            self.send_json(413, {'error': 'body missing or too large'}); return None
        return self.rfile.read(n)

    def read_json(self):
        body = self.read_body(MAX_JSON)
        if body is None:
            return None
        try:
            obj = json.loads(body)
            if isinstance(obj, dict):
                return obj
        except ValueError:
            pass
        self.send_json(400, {'error': 'not a JSON object'})
        return None

    def route(self):
        """(path, query, app); app is None when ?app= names no app this engine knows."""
        u = urlsplit(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        app = q.get('app', 'vcge')
        return u.path.rstrip('/'), q, (app if app in APPS else None)

    def find(self, rows, q):
        did = q.get('id', '')
        if not ID_RE.match(did):
            self.send_json(400, {'error': 'bad id'}); return None
        for r in rows:
            if r['id'] == did:
                return r
        self.send_json(404, {'error': 'no such drop'}); return None

    def do_GET(self):
        path, q, app = self.route()
        if path == '/voices/api/health':
            return self.send_json(200, {'ok': True, 'apps': list(APPS)})
        if app is None:
            return self.send_json(404, {'error': 'no such app'})
        if path == '/voices/api/drops':
            rows = sorted(load(app), key=lambda r: r['added'], reverse=True)
            return self.send_json(200, {'app': {'id': app, 'name': APPS[app]}, 'drops': rows, 'tags': TAGS,
                                        'statuses': STATUSES, 'sources': SOURCES, 'nextTester': next_tester(rows),
                                        'now': now()})
        if path == '/voices/api/shot':
            digest = q.get('hash', '')
            if not HASH_RE.match(digest):
                return self.send_json(400, {'error': 'bad hash'})
            r = self.find(load(app), q)
            if r is None:
                return
            shot = next((s for s in r.get('shots', []) if s['hash'] == digest), None)
            if not shot:
                return self.send_json(404, {'error': 'no such screenshot'})
            with open(os.path.join(app_dir(app), 'shots', '%s.%s' % (digest, shot['ext'])), 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', CTYPE[shot['ext']])
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'private, max-age=3600')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_json(404, {'error': 'unknown'})

    def do_POST(self):
        path, q, app = self.route()
        if app is None:
            return self.send_json(404, {'error': 'no such app'})
        req = self.read_json()
        if req is None:
            return
        with LOCK:
            rows = load(app)
            if path == '/voices/api/drop':
                text = scrub(str(req.get('text', '')).strip())
                tags = clean_tags(req.get('tags', []))
                tester = str(req.get('tester') or next_tester(rows)).strip()
                source = req.get('source', 'chat')
                if not text or len(text) > MAX_TEXT:
                    return self.send_json(400, {'error': 'paste the words first (at most %d characters)' % MAX_TEXT})
                if tags is None or not TESTER_RE.match(tester) or source not in SOURCES:
                    return self.send_json(400, {'error': 'tags from %s; tester a codename like T7; source from %s' % (TAGS, SOURCES)})
                said = str(req.get('said', ''))[:40]   # when the tester said it, as raven575 typed it (free text)
                r = {'id': new_id(), 'added': now(), 'tester': tester, 'tags': tags, 'source': source,
                     'said': scrub(said), 'text': text, 'status': 'new', 'notes': [], 'shots': []}
                rows.append(r)
                save(app, rows)
                return self.send_json(200, {'ok': True, 'drop': r})
            if path == '/voices/api/note':
                r = self.find(rows, q)
                if r is None:
                    return
                text = scrub(str(req.get('text', '')).strip())[:4000]
                if not text:
                    return self.send_json(400, {'error': 'empty note'})
                r['notes'].append({'at': now(), 'text': text})
                save(app, rows)
                return self.send_json(200, {'ok': True, 'drop': r})
            if path == '/voices/api/delete':
                r = self.find(rows, q)
                if r is None:
                    return
                if req.get('confirm') != r['id']:
                    return self.send_json(400, {'error': 'deleting needs the id sent again as confirm'})
                rows.remove(r)
                save(app, rows)
                still = {s['hash'] for x in rows for s in x.get('shots', [])}
                for s in r.get('shots', []):
                    if s['hash'] not in still:
                        try:
                            os.remove(os.path.join(app_dir(app), 'shots', '%s.%s' % (s['hash'], s['ext'])))
                        except OSError:
                            pass
                return self.send_json(200, {'ok': True, 'deleted': r['id']})
        self.send_json(404, {'error': 'unknown'})

    def do_PUT(self):
        path, q, app = self.route()
        if app is None:
            return self.send_json(404, {'error': 'no such app'})
        if path == '/voices/api/shot':
            data = self.read_body(MAX_SHOT)
            if data is None:
                return
            ext = shot_kind(data)
            if not ext:
                return self.send_json(400, {'error': 'a screenshot must be a PNG, JPEG, WebP or GIF'})
            digest = hashlib.sha256(data).hexdigest()
            with LOCK:
                rows = load(app)
                r = self.find(rows, q)
                if r is None:
                    return
                if any(s['hash'] == digest for s in r['shots']):
                    return self.send_json(200, {'ok': True, 'drop': r, 'duplicate': True})
                if len(r['shots']) >= MAX_SHOTS:
                    return self.send_json(400, {'error': 'at most %d screenshots on one drop' % MAX_SHOTS})
                folder = os.path.join(app_dir(app), 'shots')
                os.makedirs(folder, exist_ok=True)
                final = os.path.join(folder, '%s.%s' % (digest, ext))
                if not os.path.exists(final):
                    with open(final + '.part', 'wb') as f:
                        f.write(data)
                    os.replace(final + '.part', final)
                r['shots'].append({'hash': digest, 'ext': ext, 'added': now()})
                save(app, rows)
                return self.send_json(200, {'ok': True, 'drop': r})
        if path == '/voices/api/drop':
            req = self.read_json()
            if req is None:
                return
            with LOCK:
                rows = load(app)
                r = self.find(rows, q)
                if r is None:
                    return
                if 'tags' in req:
                    tags = clean_tags(req['tags'])
                    if tags is None:
                        return self.send_json(400, {'error': 'tags from %s' % (TAGS,)})
                    r['tags'] = tags
                if 'status' in req:
                    if req['status'] not in STATUSES:
                        return self.send_json(400, {'error': 'status from %s' % (STATUSES,)})
                    r['status'] = req['status']
                if 'tester' in req:
                    if not TESTER_RE.match(str(req['tester'])):
                        return self.send_json(400, {'error': 'tester a codename like T7'})
                    r['tester'] = str(req['tester'])
                r['changed'] = now()
                save(app, rows)
                return self.send_json(200, {'ok': True, 'drop': r})
        self.send_json(404, {'error': 'unknown'})


def main():
    global ROOT
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True, help='where the drops live (outside the web root and every git repo)')
    ap.add_argument('--port', type=int, default=8772)
    a = ap.parse_args()
    ROOT = os.path.abspath(a.root)
    for app in APPS:
        os.makedirs(os.path.join(ROOT, app, 'shots'), exist_ok=True)
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    print('voices-api serving on 127.0.0.1:%d' % a.port); sys.stdout.flush()
    srv.serve_forever()


if __name__ == '__main__':
    main()
