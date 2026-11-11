"""Card Inbox service tests, against the real Card Shelf service (standard library only):
    python3 card-inbox/test/test_inbox_api.py
Drawn bytes only; no card photos."""
import importlib.util, io, json, os, shutil, tempfile, threading, time, unittest, urllib.error, urllib.request, zipfile
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))


def mod(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, '..', '..', path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


shelf = mod('shelf', 'card-shelf/card-shelf-api.py')
inbox = mod('inbox', 'card-inbox/card-inbox-api.py')

PNG = lambda tag: bytes.fromhex('89504e470d0a1a0a') + tag * 60
CLIP = b'\x00\x00\x00\x18ftypmp42' + b'drawn-clip' * 100


def serve(handler):
    srv = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d' % srv.server_address[1]


def call(base, method, path, body=None, raw=False):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            out = r.read()
            return r.status, (out if raw else json.loads(out))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def zip_of(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        for name, data in files:
            z.writestr(name, data)
    return buf.getvalue()


class InboxTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        shelf.SHELF = os.path.join(cls.tmp, 'shelf')
        for d in ('holding', 'archive', 'active/ocr', 'active/logo', 'active/edges'):
            os.makedirs(os.path.join(shelf.SHELF, d))
        cls.shelf_srv, shelf_url = serve(shelf.Handler)
        inbox.ROOT, inbox.SHELF_API = os.path.join(cls.tmp, 'inbox'), shelf_url
        os.makedirs(os.path.join(inbox.ROOT, 'drop'))
        cls.srv, cls.url = serve(inbox.Handler)
        cls.shelf_url = shelf_url

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.shelf_srv.shutdown()
        shutil.rmtree(cls.tmp)

    def new(self, name):
        code, card = call(self.url, 'POST', '/inbox/api/card', {'name': name})
        self.assertEqual(code, 200)
        return card

    def test_health(self):
        self.assertEqual(call(self.url, 'GET', '/inbox/api/health'), (200, {'ok': True}))

    def test_card_needs_a_nickname(self):
        self.assertEqual(call(self.url, 'POST', '/inbox/api/card', {'name': '!!!'})[0], 400)
        self.assertEqual(self.new('Card 7!')['id'], 'card-7')
        self.assertEqual(self.new('card 7')['id'], 'card-7', 'same nickname, same card')

    def test_zip_goes_to_the_shelf_for_every_bench(self):
        card = self.new('zip-card')
        z = zip_of([('angle-1.jpg', PNG(b'a')), ('sub/angle-2.png', PNG(b'b')), ('angle-1-again.jpg', PNG(b'a')),
                    ('notes.txt', b'hi'), ('../escape.jpg', PNG(b'c')), ('clip.mp4', CLIP)])
        code, got = call(self.url, 'PUT', '/inbox/api/upload?id=%s&name=angles.zip' % card['id'], z)
        self.assertEqual(code, 200, got)
        self.assertEqual((got['photo'], got['clip'], got['same'], got['skipped']), (3, 1, 1, 1))
        names = sorted(p['name'] for p in got['card']['photos'])
        self.assertEqual(names, ['angle-1.jpg', 'angle-2.png', 'escape.jpg'], 'folders and ../ are stripped to bare names')
        listed = call(self.shelf_url, 'GET', '/shelf/api/photos')[1]['photos']
        mine = [p for p in listed if p['name'].startswith('zip-card__')]
        self.assertEqual(len(mine), 3)
        for p in mine:
            self.assertEqual(sorted(p['benches']), ['edges', 'logo', 'ocr'])
        self.assertFalse(os.path.exists(os.path.join(self.tmp, 'escape.jpg')))

    def test_clip_is_kept_and_served_back(self):
        card = self.new('clip-card')
        code, got = call(self.url, 'PUT', '/inbox/api/upload?id=clip-card&name=hold.mov', CLIP)
        self.assertEqual((code, got['clip']), (200, 1))
        h = got['card']['clips'][0]['hash']
        code, body = call(self.url, 'GET', '/inbox/api/clip?id=clip-card&hash=%s' % h, raw=True)
        self.assertEqual((code, body), (200, CLIP))
        # a frame picked from it comes back as a photo, marked as a frame of that clip
        code, got = call(self.url, 'PUT', '/inbox/api/upload?id=clip-card&name=frame-012.jpg&from=%s' % h, PNG(b'f'))
        self.assertEqual(got['card']['photos'][0]['kind'], 'frame')
        self.assertEqual(got['card']['photos'][0]['from'], h)

    def test_bad_uploads_are_refused(self):
        self.new('bad-card')
        self.assertEqual(call(self.url, 'PUT', '/inbox/api/upload?id=bad-card&name=x.exe', b'MZ')[0], 400)
        self.assertEqual(call(self.url, 'PUT', '/inbox/api/upload?id=bad-card&name=x.zip', b'not a zip')[0], 400)
        self.assertEqual(call(self.url, 'PUT', '/inbox/api/upload?id=nope&name=x.jpg', PNG(b'x'))[0], 404)
        self.assertEqual(call(self.url, 'PUT', '/inbox/api/upload?id=..%2Fx&name=x.jpg', PNG(b'x'))[0], 404)

    def test_too_many_files_in_a_zip(self):
        self.new('big-card')
        z = zip_of([('p%03d.jpg' % i, PNG(b'%d' % i)) for i in range(inbox.MAX_FILES + 1)])
        code, got = call(self.url, 'PUT', '/inbox/api/upload?id=big-card&name=big.zip', z)
        self.assertEqual(code, 400)
        self.assertIn('more than', got['error'])

    def test_truth_once_and_results_per_angle(self):
        card = self.new('truth-card')
        got = call(self.url, 'PUT', '/inbox/api/upload?id=truth-card&name=a.jpg', PNG(b't'))[1]
        h = got['card']['photos'][0]['hash']
        lines = [{'text': 'Kalo Renmi', 'role': 'name'}, {'text': '555-0123', 'role': 'phone'}]
        code, saved = call(self.url, 'PUT', '/inbox/api/truth?id=truth-card', {'lines': lines})
        self.assertEqual(code, 200)
        self.assertEqual(saved['truth']['lines'][0], {'text': 'Kalo Renmi', 'role': 'name', 'drop': False})
        self.assertEqual(call(self.url, 'PUT', '/inbox/api/truth?id=truth-card', {'lines': [{'text': 'x', 'role': 'no role!'}]})[0], 400)
        self.assertEqual(call(self.url, 'PUT', '/inbox/api/result?id=truth-card&hash=%s' % h, {'edges': True, 'chars': 0.9})[0], 200)
        self.assertEqual(call(self.url, 'PUT', '/inbox/api/result?id=truth-card&hash=beef', {'edges': True})[0], 400)
        cards = call(self.url, 'GET', '/inbox/api/cards')[1]['cards']
        mine = next(c for c in cards if c['id'] == 'truth-card')
        self.assertEqual((mine['photos'], mine['done'], mine['hasTruth']), (1, 1, True))

    def test_drop_folder_zip_and_folder(self):
        drop = os.path.join(inbox.ROOT, 'drop')
        with open(os.path.join(drop, 'Drop Card.zip'), 'wb') as f:
            f.write(zip_of([('d1.jpg', PNG(b'd1')), ('d2.jpg', PNG(b'd2'))]))
        os.makedirs(os.path.join(drop, 'folder-card'))
        with open(os.path.join(drop, 'folder-card', 'e1.jpg'), 'wb') as f:
            f.write(PNG(b'e1'))
        old = time.time() - 60
        for p in ('Drop Card.zip', 'folder-card'):
            os.utime(os.path.join(drop, p), (old, old))
        inbox.take_drop()
        self.assertEqual(len(inbox.load('drop-card')['photos']), 2)
        self.assertEqual(len(inbox.load('folder-card')['photos']), 1)
        self.assertEqual(sorted(x for x in os.listdir(drop) if x != 'done'), [], 'picked-up drops move to done/')
        self.assertEqual(len(os.listdir(os.path.join(drop, 'done'))), 2)

    def test_drop_skips_fresh_files(self):
        drop = os.path.join(inbox.ROOT, 'drop')
        with open(os.path.join(drop, 'fresh.zip'), 'wb') as f:
            f.write(zip_of([('f.jpg', PNG(b'fresh'))]))
        inbox.take_drop()
        self.assertTrue(os.path.exists(os.path.join(drop, 'fresh.zip')), 'a file still being copied waits')
        os.remove(os.path.join(drop, 'fresh.zip'))


if __name__ == '__main__':
    unittest.main(verbosity=1)
