"""Card Shelf service tests (standard library only): python3 card-shelf/test/test_shelf_api.py"""
import importlib.util, json, os, shutil, tempfile, threading, unittest, urllib.request, urllib.error
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('shelf', os.path.join(HERE, '..', 'card-shelf-api.py'))
shelf = importlib.util.module_from_spec(spec); spec.loader.exec_module(shelf)

PNG_A = bytes.fromhex('89504e470d0a1a0a') + b'photo-a' * 50
PNG_B = bytes.fromhex('89504e470d0a1a0a') + b'photo-b' * 50


class ShelfTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        shelf.SHELF = self.dir
        shelf._hashes.clear()
        for _, _, folder in shelf.places(): os.makedirs(folder, exist_ok=True)
        self.srv = ThreadingHTTPServer(('127.0.0.1', 0), shelf.Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = 'http://127.0.0.1:%d/shelf/api/' % self.srv.server_address[1]

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close(); shutil.rmtree(self.dir)

    def call(self, method, path, body=None, raw=False):
        data = body if isinstance(body, bytes) else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, (r.read() if raw else json.loads(r.read()))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def files(self, *parts):
        folder = os.path.join(self.dir, *parts)
        return sorted(os.listdir(folder)) if os.path.isdir(folder) else []

    def test_upload_lands_in_holding_and_is_served(self):
        code, r = self.call('PUT', 'upload?name=card%201.png', PNG_A)
        self.assertEqual((code, r['place'], r['benches']), (200, 'holding', []))
        self.assertEqual(self.files('holding'), ['card 1.png'])
        code, data = self.call('GET', 'photo?hash=' + r['hash'], raw=True)
        self.assertEqual(data, PNG_A)

    def test_same_photo_twice_is_kept_once(self):
        self.call('PUT', 'upload?name=a.png', PNG_A)
        code, r = self.call('PUT', 'upload?name=copy.png&to=logo', PNG_A)
        self.assertTrue(r['duplicate'])
        self.assertEqual(r['benches'], ['logo'])
        self.assertEqual(self.files('holding'), [])
        self.assertEqual(len(self.call('GET', 'photos')[1]['photos']), 1)

    def test_active_in_two_benches_is_one_file_linked(self):
        h = self.call('PUT', 'upload?name=a.png', PNG_A)[1]['hash']
        code, r = self.call('POST', 'move', {'hash': h, 'to': 'active', 'benches': ['ocr', 'logo']})
        self.assertEqual((r['place'], r['benches']), ('active', ['logo', 'ocr']))
        a, b = os.path.join(self.dir, 'active', 'ocr', 'a.png'), os.path.join(self.dir, 'active', 'logo', 'a.png')
        self.assertTrue(os.path.samefile(a, b))
        self.assertEqual(self.files('holding'), [])
        self.assertEqual([p['name'] for p in self.call('GET', 'photos?bench=ocr')[1]['photos']], ['a.png'])
        self.assertEqual(self.call('GET', 'photos?bench=edges')[1]['photos'], [])

    def test_archive_and_restore_keep_the_bytes(self):
        h = self.call('PUT', 'upload?name=a.png&to=ocr', PNG_A)[1]['hash']
        self.assertEqual(self.call('POST', 'move', {'hash': h, 'to': 'archive'})[1]['place'], 'archive')
        self.assertEqual((self.files('active', 'ocr'), self.files('archive')), ([], ['a.png']))
        r = self.call('POST', 'move', {'hash': h, 'to': 'holding'})[1]
        self.assertEqual((r['place'], r['hash']), ('holding', h))
        self.assertEqual(self.call('GET', 'photo?hash=' + h, raw=True)[1], PNG_A)

    def test_unticking_every_bench_goes_back_to_holding(self):
        h = self.call('PUT', 'upload?name=a.png&to=logo', PNG_A)[1]['hash']
        self.assertEqual(self.call('POST', 'move', {'hash': h, 'to': 'active', 'benches': []})[1]['place'], 'holding')

    def test_name_clash_gets_a_new_name(self):
        self.call('PUT', 'upload?name=a.png', PNG_A)
        self.call('PUT', 'upload?name=a.png', PNG_B)
        self.assertEqual(self.files('holding'), ['a-2.png', 'a.png'])

    def test_delete_needs_the_hash_twice_and_logs_no_name(self):
        h = self.call('PUT', 'upload?name=wrong.png&to=edges', PNG_A)[1]['hash']
        self.assertEqual(self.call('POST', 'delete', {'hash': h})[0], 400)
        self.assertEqual(self.files('active', 'edges'), ['wrong.png'])
        self.assertEqual(self.call('POST', 'delete', {'hash': h, 'confirm': h})[0], 200)
        self.assertEqual(self.call('GET', 'photos')[1]['photos'], [])
        deleted = self.call('GET', 'deleted')[1]['deleted']
        self.assertEqual([d['hash'] for d in deleted], [h])
        self.assertNotIn('wrong', open(os.path.join(self.dir, 'deleted.json')).read())

    def test_refuses_bad_input(self):
        self.assertEqual(self.call('PUT', 'upload?name=../x.png', PNG_A)[0], 200)   # the folder part is dropped
        self.assertEqual(self.files('holding'), ['x.png'])
        self.assertEqual(self.call('PUT', 'upload?name=notes.txt', b'hi')[0], 400)
        self.assertEqual(self.call('PUT', 'upload?name=a.png&to=vault', PNG_A)[0], 400)
        self.assertEqual(self.call('GET', 'photo?hash=../../etc/passwd')[0], 400)
        self.assertEqual(self.call('GET', 'photos?bench=vault')[0], 400)
        h = self.call('GET', 'photos')[1]['photos'][0]['hash']
        self.assertEqual(self.call('POST', 'move', {'hash': h, 'to': 'active', 'benches': ['vault']})[0], 400)
        self.assertEqual(self.call('POST', 'move', {'hash': '0' * 64, 'to': 'archive'})[0], 404)
        self.assertEqual(self.call('POST', 'delete', b'not json')[0], 400)


if __name__ == '__main__':
    unittest.main(verbosity=2)
