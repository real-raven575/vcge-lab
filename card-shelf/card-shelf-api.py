#!/usr/bin/env python3
"""vCGE lab: the Card Shelf, one shared place for the benches' test photos (standard library only).

Runs as the lab user on 127.0.0.1:8768; Caddy forwards /shelf/api/* to it. The photos live outside the web root and
outside every git repo, in plain folders, so a bench can simply read its own folder:

    <shelf>/holding/            new photos, not used by any bench yet
    <shelf>/active/<bench>/     photos a bench tests (ocr, logo, edges); one photo in several benches is one file,
                                hard-linked into each (copied when the disk cannot link)
    <shelf>/archive/            kept for good, out of the benches' way
    <shelf>/deleted.json        sha256 and time of each photo deleted for good, so a bench can drop its answer keys
                                (no names)

A photo is known by the sha256 of its bytes, which never change on a move, so answer keys keyed by hash follow it.
Moving between places never deletes a byte; only "delete" does, and it needs the hash sent twice. Logs carry the
method and path only, never a file name or what a card says.

    card-shelf-api --shelf <LAB_ROOT>/shelf [--port 8768]
"""
import argparse, hashlib, json, os, re, shutil, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

BENCHES = ('ocr', 'logo', 'edges')
IMAGE_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp')
TYPES = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp'}
MAX_UPLOAD = 25 * 1024 * 1024
MAX_JSON = 64 * 1024
NAME_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,120}$')
HASH_RE = re.compile(r'^[0-9a-f]{64}$')

SHELF = None
LOCK = threading.Lock()   # one change at a time
_hashes = {}              # path -> (size, mtime_ns, hash)


def safe_name(name):
    name = os.path.basename(name or '').strip()
    return name if NAME_RE.match(name) and '..' not in name and name.lower().endswith(IMAGE_EXT) else None


def places():
    """Every folder a photo can be in, as (place, bench or None, path)."""
    out = [('holding', None, os.path.join(SHELF, 'holding')), ('archive', None, os.path.join(SHELF, 'archive'))]
    out += [('active', b, os.path.join(SHELF, 'active', b)) for b in BENCHES]
    return out


def photo_hash(path):
    st = os.stat(path)
    known = _hashes.get(path)
    if known and known[0] == st.st_size and known[1] == st.st_mtime_ns:
        return known[2]
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    _hashes[path] = (st.st_size, st.st_mtime_ns, h.hexdigest())
    return _hashes[path][2]


def catalogue():
    """{hash: {hash, name, size, added, holding, archive, benches, paths}} over every place."""
    photos = {}
    for place, bench, folder in places():
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            path = os.path.join(folder, name)
            if name.startswith('.') or not name.lower().endswith(IMAGE_EXT) or not os.path.isfile(path):
                continue
            digest = photo_hash(path)
            p = photos.setdefault(digest, {'hash': digest, 'name': name, 'size': os.path.getsize(path),
                                           'added': int(os.path.getmtime(path)), 'holding': False, 'archive': False,
                                           'benches': [], 'paths': []})
            p['paths'].append(path)
            if place == 'active':
                p['benches'].append(bench)
            else:
                p[place] = True
    return photos


def public(p):
    """A photo as the page sees it: where it is, never a disk path."""
    place = 'active' if p['benches'] else 'archive' if p['archive'] else 'holding'
    return {'hash': p['hash'], 'name': p['name'], 'size': p['size'], 'added': p['added'], 'place': place,
            'benches': sorted(p['benches'])}


def free_name(folder, name):
    """`name`, or name-2, name-3... when another photo already uses it in `folder`."""
    stem, ext = os.path.splitext(name)
    candidate, n = name, 1
    while os.path.exists(os.path.join(folder, candidate)):
        n += 1
        candidate = '%s-%d%s' % (stem, n, ext)
    return candidate


def link_or_copy(src, dst):
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def place_photo(p, place, benches):
    """Puts photo `p` (from catalogue) in exactly `place` ('holding', 'archive' or 'active' with `benches`).
    The new copies are made first and the old ones removed after, so a failure halfway never loses the photo."""
    if place == 'active':
        targets = [os.path.join(SHELF, 'active', b) for b in benches]
    else:
        targets = [os.path.join(SHELF, place)]
    source = p['paths'][0]
    keep = set()
    for folder in targets:
        os.makedirs(folder, exist_ok=True)
        already = [q for q in p['paths'] if os.path.dirname(q) == folder]
        if already:
            keep.add(already[0])
            continue
        dst = os.path.join(folder, free_name(folder, p['name']))
        link_or_copy(source, dst)
        if photo_hash(dst) != p['hash']:   # never trust a copy blindly
            os.remove(dst)
            raise OSError('copy did not match')
        keep.add(dst)
    for q in p['paths']:
        if q not in keep:
            os.remove(q)
            _hashes.pop(q, None)


def note_deleted(digest):
    path = os.path.join(SHELF, 'deleted.json')
    try:
        with open(path) as f:
            rows = json.load(f)
    except (OSError, ValueError):
        rows = []
    rows.append({'hash': digest, 'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
    tmp = path + '.part'
    with open(tmp, 'w') as f:
        json.dump(rows, f, indent=1)
    os.replace(tmp, path)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):   # method and path only
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
        if path == '/shelf/api/health':
            return self.send_json(200, {'ok': True, 'benches': BENCHES})
        if path == '/shelf/api/photos':
            bench = q.get('bench')
            if bench and bench not in BENCHES:
                return self.send_json(400, {'error': 'bench must be one of %s' % (BENCHES,)})
            rows = [public(p) for p in catalogue().values()]
            if bench:
                rows = [r for r in rows if bench in r['benches']]
            rows.sort(key=lambda r: (-r['added'], r['name']))
            return self.send_json(200, {'photos': rows, 'benches': BENCHES})
        if path == '/shelf/api/photo':
            digest = q.get('hash', '')
            if not HASH_RE.match(digest):
                return self.send_json(400, {'error': 'bad hash'})
            p = catalogue().get(digest)
            if not p:
                return self.send_json(404, {'error': 'no such photo'})
            with open(p['paths'][0], 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', TYPES.get(os.path.splitext(p['name'])[1].lower(), 'application/octet-stream'))
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'private, max-age=3600')
            self.end_headers()
            self.wfile.write(data)
            return
        if path == '/shelf/api/deleted':
            try:
                with open(os.path.join(SHELF, 'deleted.json')) as f:
                    return self.send_json(200, {'deleted': json.load(f)})
            except (OSError, ValueError):
                return self.send_json(200, {'deleted': []})
        self.send_json(404, {'error': 'unknown'})

    def do_PUT(self):
        path, q = self.route()
        if path != '/shelf/api/upload':
            return self.send_json(404, {'error': 'unknown'})
        name, to = safe_name(q.get('name')), q.get('to', 'holding')
        if not name or (to != 'holding' and to not in BENCHES):
            return self.send_json(400, {'error': 'name must be an image file; to must be holding or one of %s' % (BENCHES,)})
        body = self.read_body(MAX_UPLOAD)
        if body is None: return
        digest = hashlib.sha256(body).hexdigest()
        with LOCK:
            known = catalogue().get(digest)
            if known:   # the same photo again: put it where asked as well, keep one photo
                if to in BENCHES and to not in known['benches']:
                    place_photo(known, 'active', sorted(set(known['benches']) | {to}))
                return self.send_json(200, {'ok': True, 'hash': digest, 'duplicate': True, **public(catalogue()[digest])})
            folder = os.path.join(SHELF, 'holding') if to == 'holding' else os.path.join(SHELF, 'active', to)
            os.makedirs(folder, exist_ok=True)
            final = os.path.join(folder, free_name(folder, name))
            tmp = os.path.join(folder, '.upload.part')
            with open(tmp, 'wb') as f: f.write(body)
            os.replace(tmp, final)
            return self.send_json(200, {'ok': True, 'hash': digest, 'duplicate': False, **public(catalogue()[digest])})

    def do_POST(self):
        path, q = self.route()
        if path not in ('/shelf/api/move', '/shelf/api/delete'):
            return self.send_json(404, {'error': 'unknown'})
        body = self.read_body(MAX_JSON)
        if body is None: return
        try:
            req = json.loads(body)
        except ValueError:
            return self.send_json(400, {'error': 'not JSON'})
        digest = str(req.get('hash', ''))
        if not HASH_RE.match(digest):
            return self.send_json(400, {'error': 'bad hash'})
        with LOCK:
            p = catalogue().get(digest)
            if not p:
                return self.send_json(404, {'error': 'no such photo'})
            if path == '/shelf/api/delete':
                if req.get('confirm') != digest:
                    return self.send_json(400, {'error': 'deleting needs the hash sent again as confirm'})
                for q_ in p['paths']:
                    os.remove(q_)
                    _hashes.pop(q_, None)
                note_deleted(digest)
                return self.send_json(200, {'ok': True, 'deleted': digest})
            to = req.get('to')
            benches = req.get('benches') or []
            if to not in ('holding', 'archive', 'active') or not isinstance(benches, list) or any(b not in BENCHES for b in benches):
                return self.send_json(400, {'error': 'to must be holding, archive or active; benches from %s' % (BENCHES,)})
            if to == 'active' and not benches:
                to = 'holding'   # active for no bench is simply waiting
            try:
                place_photo(p, to, sorted(set(benches)))
            except OSError:
                return self.send_json(500, {'error': 'could not move it; nothing was lost'})
            return self.send_json(200, {'ok': True, **public(catalogue()[digest])})


def main():
    global SHELF
    ap = argparse.ArgumentParser()
    ap.add_argument('--shelf', required=True, help='the shelf folder (outside the web root and every git repo)')
    ap.add_argument('--port', type=int, default=8768)
    a = ap.parse_args()
    SHELF = os.path.abspath(a.shelf)
    for _, _, folder in places():
        os.makedirs(folder, exist_ok=True)
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    print('card-shelf-api serving on 127.0.0.1:%d' % a.port); sys.stdout.flush()
    srv.serve_forever()


if __name__ == '__main__':
    main()
