#!/usr/bin/env python3
"""vCGE lab: the Card Inbox service (standard library only). Lab only; never part of the app.

One card = one job. Drop a zip of many angles of one card, loose photos, or a short video clip; each photo goes onto
the Card Shelf (ticked for the OCR, Edges and Logo benches) and the job remembers its hashes. Clips stay in the inbox
(the shelf takes photos only); the card page picks the best frames in the browser and sends them back as photos.
The card page runs the benches in the browser and stores each angle's results and the card's one answer key here.
Shelf photos are named "<card>__<photo>", so the Reading Room also sees them as one card (one shared answer key).

Runs as the lab user on 127.0.0.1 (default 8770); Caddy forwards /inbox/api/* to it. Everything lives under --root
(INBOX_ROOT, outside the web root and every git repo):
    <root>/cards/<id>/card.json      the job: name, photos, clips, answer key, results
    <root>/cards/<id>/clips/<hash>   the clips
    <root>/drop/                     a folder pilots can copy a zip (or a folder of photos) into; picked up every 30 s
Logs carry the method and path only, never a file or card name.
"""
import argparse, hashlib, io, json, os, re, threading, time, urllib.parse, urllib.request, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PHOTO_EXT = ('.jpg', '.jpeg', '.png', '.webp')
VIDEO_EXT = ('.mp4', '.mov', '.webm', '.m4v')
VIDEO_TYPE = {'.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'}
BENCHES = ['ocr', 'edges', 'logo']
MAX_UPLOAD = 300 * 1024 * 1024      # one zip or clip
MAX_PHOTO = 25 * 1024 * 1024        # the shelf's own cap
MAX_FILES = 200                     # photos and clips in one zip
MAX_UNZIPPED = 600 * 1024 * 1024    # all members of one zip together
MAX_JSON = 256 * 1024
NAME_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,79}$')
ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,47}$')
ROLE_RE = re.compile(r'^[A-Za-z]{1,20}$')    # the app's line roles (MOD05 LINE_ROLES), e.g. name, jobTitle, email
MAX_LINES = 40

ROOT = '/srv/vcge-lab/inbox'
SHELF_API = 'http://127.0.0.1:8768'
LOCK = threading.Lock()


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def safe_file(name):
    """The bare file name if it is a photo or clip with a plain name, else None (no folders, no odd characters)."""
    base = os.path.basename((name or '').replace('\\', '/')).strip()
    if not NAME_RE.match(base) or '..' in base:
        return None
    return base if base.lower().endswith(PHOTO_EXT + VIDEO_EXT) else None


def card_id(name):
    """A folder-safe id from the card's nickname: lower case, letters, digits and dashes."""
    s = re.sub(r'[^a-z0-9]+', '-', (name or '').lower()).strip('-')[:40]
    return s or None


def card_dir(cid):
    return os.path.join(ROOT, 'cards', cid)


def load(cid):
    p = os.path.join(card_dir(cid), 'card.json')
    if not ID_RE.match(cid or '') or not os.path.isfile(p):
        return None
    with open(p) as f:
        return json.load(f)


def save(card):
    d = card_dir(card['id'])
    os.makedirs(d, exist_ok=True)
    card['updated'] = now()
    tmp = os.path.join(d, '.card.json.part')
    with open(tmp, 'w') as f:
        json.dump(card, f, indent=1)
    os.replace(tmp, os.path.join(d, 'card.json'))


def new_card(name):
    cid = card_id(name)
    if not cid:
        return None
    with LOCK:
        card = load(cid)
        if card is None:
            card = {'id': cid, 'name': name.strip()[:40], 'created': now(), 'photos': [], 'clips': [], 'truth': None, 'results': {}}
            save(card)
    return card


def summary(card):
    done = sum(1 for p in card['photos'] if p['hash'] in card['results'])
    return {'id': card['id'], 'name': card['name'], 'created': card['created'], 'updated': card.get('updated'),
            'photos': len(card['photos']), 'clips': len(card['clips']), 'done': done, 'hasTruth': bool(card['truth'])}


def shelf_put(name, data):
    """Puts one photo on the shelf, ticked for every bench. Returns its sha256."""
    req = urllib.request.Request('%s/shelf/api/upload?to=ocr&name=%s' % (SHELF_API, urllib.parse.quote(name)), data=data, method='PUT')
    with urllib.request.urlopen(req, timeout=60) as r:
        digest = json.load(r)['hash']
    body = json.dumps({'hash': digest, 'to': 'active', 'benches': BENCHES}).encode()
    req = urllib.request.Request(SHELF_API + '/shelf/api/move', data=body, method='POST', headers={'Content-Type': 'application/json'})
    urllib.request.urlopen(req, timeout=60).close()
    return digest


def add_file(card, name, data, frame_of=None):
    """Adds one photo (to the shelf) or clip (kept here) to a card. Returns 'photo', 'clip', 'same' or raises ValueError."""
    name = safe_file(name)
    if not name:
        raise ValueError('only photos (%s) and clips (%s) with plain names' % (' '.join(PHOTO_EXT), ' '.join(VIDEO_EXT)))
    if name.lower().endswith(VIDEO_EXT):
        digest = hashlib.sha256(data).hexdigest()
        with LOCK:
            fresh = load(card['id'])
            if any(c['hash'] == digest for c in fresh['clips']):
                return 'same'
            d = os.path.join(card_dir(card['id']), 'clips')
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, digest), 'wb') as f:
                f.write(data)
            fresh['clips'].append({'hash': digest, 'name': name, 'bytes': len(data), 'type': VIDEO_TYPE[os.path.splitext(name)[1].lower()], 'added': now()})
            save(fresh)
        return 'clip'
    if len(data) > MAX_PHOTO:
        raise ValueError('a photo is over %d MB' % (MAX_PHOTO // 1048576))
    digest = shelf_put('%s__%s' % (card['id'], name), data)   # the Reading Room groups "<card>__<photo>" as one card
    with LOCK:
        fresh = load(card['id'])
        if any(p['hash'] == digest for p in fresh['photos']):
            return 'same'
        fresh['photos'].append({'hash': digest, 'name': name, 'kind': 'frame' if frame_of else 'photo', 'from': frame_of, 'added': now()})
        save(fresh)
    return 'photo'


def unzip_into(card, data):
    """Every photo and clip in a zip, by bare name; folders, links and other files are skipped. Returns counts."""
    got = {'photo': 0, 'clip': 0, 'same': 0, 'skipped': 0}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        members = [m for m in z.infolist() if not m.is_dir()]
        wanted = [m for m in members if safe_file(m.filename)]
        got['skipped'] = len(members) - len(wanted)
        if len(wanted) > MAX_FILES:
            raise ValueError('more than %d photos and clips in one zip' % MAX_FILES)
        if sum(m.file_size for m in wanted) > MAX_UNZIPPED:
            raise ValueError('the zip unpacks to more than %d MB' % (MAX_UNZIPPED // 1048576))
        for m in wanted:
            with z.open(m) as f:
                body = f.read(MAX_UPLOAD + 1)
            if len(body) > MAX_UPLOAD:
                raise ValueError('a file in the zip is too big')
            got[add_file(card, m.filename, body)] += 1
    return got


def take_drop():
    """Picks up the drop folder: <drop>/<card>.zip, or <drop>/<card>/ with photos and clips. Moves each to drop/done/."""
    drop = os.path.join(ROOT, 'drop')
    done = os.path.join(drop, 'done')
    os.makedirs(done, exist_ok=True)
    for entry in sorted(os.listdir(drop)):
        src = os.path.join(drop, entry)
        if entry in ('done',) or entry.startswith('.') or os.path.islink(src):
            continue
        try:
            if time.time() - os.path.getmtime(src) < 20:     # still being copied
                continue
            stem = entry[:-4] if entry.lower().endswith('.zip') else entry
            card = new_card(stem)
            if not card:
                continue
            if os.path.isfile(src) and entry.lower().endswith('.zip'):
                with open(src, 'rb') as f:
                    unzip_into(card, f.read(MAX_UPLOAD + 1))
            elif os.path.isdir(src):
                for name in sorted(os.listdir(src)):
                    p = os.path.join(src, name)
                    if os.path.isfile(p) and not os.path.islink(p) and safe_file(name) and os.path.getsize(p) <= MAX_UPLOAD:
                        with open(p, 'rb') as f:
                            add_file(card, name, f.read())
            else:
                continue
            os.replace(src, os.path.join(done, '%s-%s' % (time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()), entry)))
        except Exception as e:  # noqa: BLE001 - one bad drop must not stop the others
            print('drop: one item failed (%s)' % type(e).__name__, flush=True)


def watch_drop(every=30):
    while True:
        try:
            take_drop()
        except Exception as e:  # noqa: BLE001
            print('drop: scan failed (%s)' % type(e).__name__, flush=True)
        time.sleep(every)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):   # method and path only
        print('%s %s' % (self.command, urllib.parse.urlparse(self.path).path), flush=True)

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > limit:
            return None
        return self.rfile.read(n)

    def route(self):
        u = urllib.parse.urlparse(self.path)
        return u.path, {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}

    def do_GET(self):
        path, q = self.route()
        if path == '/inbox/api/health':
            return self.send_json(200, {'ok': True})
        if path == '/inbox/api/cards':
            d = os.path.join(ROOT, 'cards')
            cards = [load(c) for c in sorted(os.listdir(d))] if os.path.isdir(d) else []
            cards = sorted((summary(c) for c in cards if c), key=lambda c: c['updated'] or '', reverse=True)
            return self.send_json(200, {'cards': cards})
        if path == '/inbox/api/card':
            card = load(q.get('id', ''))
            return self.send_json(200, card) if card else self.send_json(404, {'error': 'no such card'})
        if path == '/inbox/api/clip':
            card = load(q.get('id', ''))
            clip = card and next((c for c in card['clips'] if c['hash'] == q.get('hash')), None)
            if not clip:
                return self.send_json(404, {'error': 'no such clip'})
            p = os.path.join(card_dir(card['id']), 'clips', clip['hash'])
            self.send_response(200)
            self.send_header('Content-Type', clip['type'])
            self.send_header('Content-Length', str(os.path.getsize(p)))
            self.end_headers()
            with open(p, 'rb') as f:
                while True:
                    chunk = f.read(1 << 20)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            return None
        return self.send_json(404, {'error': 'unknown'})

    def do_POST(self):
        path, q = self.route()
        if path != '/inbox/api/card':
            return self.send_json(404, {'error': 'unknown'})
        try:
            req = json.loads(self.read_body(MAX_JSON) or b'{}')
        except ValueError:
            return self.send_json(400, {'error': 'send JSON'})
        card = new_card(str(req.get('name') or ''))
        return self.send_json(200, card) if card else self.send_json(400, {'error': 'give the card a nickname (letters or digits)'})

    def do_PUT(self):
        path, q = self.route()
        card = load(q.get('id', ''))
        if not card:
            return self.send_json(404, {'error': 'no such card'})
        if path == '/inbox/api/upload':
            name = q.get('name', '')
            body = self.read_body(MAX_UPLOAD)
            if body is None:
                return self.send_json(413, {'error': 'empty, or over %d MB' % (MAX_UPLOAD // 1048576)})
            try:
                if name.lower().endswith('.zip') and NAME_RE.match(os.path.basename(name)):
                    got = unzip_into(card, body)
                else:
                    kind = add_file(card, name, body, frame_of=q.get('from'))
                    got = {'photo': 0, 'clip': 0, 'same': 0, 'skipped': 0, kind: 1}
            except zipfile.BadZipFile:
                return self.send_json(400, {'error': 'that zip could not be opened'})
            except ValueError as e:
                return self.send_json(400, {'error': str(e)})
            except OSError:
                return self.send_json(502, {'error': 'the Card Shelf did not take the photo; is it running?'})
            return self.send_json(200, {'ok': True, **got, 'card': load(card['id'])})
        try:
            req = json.loads(self.read_body(MAX_JSON) or b'null')
        except ValueError:
            return self.send_json(400, {'error': 'send JSON'})
        if path == '/inbox/api/truth':
            lines = req.get('lines') if isinstance(req, dict) else None
            ok = isinstance(lines, list) and len(lines) <= MAX_LINES and all(
                isinstance(l, dict) and isinstance(l.get('text'), str) and 0 < len(l['text'].strip()) <= 200
                and isinstance(l.get('role'), str) and ROLE_RE.match(l['role']) for l in lines)
            if not ok:
                return self.send_json(400, {'error': 'truth is {lines: [{text, role}]}, up to %d lines' % MAX_LINES})
            with LOCK:
                card = load(card['id'])
                card['truth'] = {'lines': [{'text': l['text'].strip(), 'role': l['role'], 'drop': False} for l in lines], 'at': now()}
                save(card)
            return self.send_json(200, card)
        if path == '/inbox/api/result':
            h = q.get('hash', '')
            if not any(p['hash'] == h for p in card['photos']) or not isinstance(req, dict):
                return self.send_json(400, {'error': 'result for a photo of this card, as JSON'})
            with LOCK:
                card = load(card['id'])
                card['results'][h] = {**req, 'at': now()}
                save(card)
            return self.send_json(200, {'ok': True})
        return self.send_json(404, {'error': 'unknown'})


def main():
    global ROOT, SHELF_API
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--root', default=ROOT)
    ap.add_argument('--port', type=int, default=8770)
    ap.add_argument('--shelf-api', default=SHELF_API)
    ap.add_argument('--no-drop', action='store_true', help='do not watch the drop folder')
    a = ap.parse_args()
    ROOT, SHELF_API = a.root, a.shelf_api.rstrip('/')
    os.makedirs(os.path.join(ROOT, 'cards'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'drop'), exist_ok=True)
    if not a.no_drop:
        threading.Thread(target=watch_drop, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
