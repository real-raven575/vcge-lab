"""A stand-in lab for the page test: the real voices service at /vcge/voices/api/, the page at /vcge/voices/,
the deck bar at /deckbar.css. python3 stand-in.py <data folder> <port>"""
import importlib.util, os, sys
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..', '..')
spec = importlib.util.spec_from_file_location('voices', os.path.join(HERE, '..', 'voices-api.py'))
voices = importlib.util.module_from_spec(spec); spec.loader.exec_module(voices)
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}


class Lab(voices.Handler):
    def static(self):
        path = self.path.split('?')[0]
        if path in ('/deckbar.css', '/pm-links.js'):
            f = os.path.join(REPO, 'flight-deck', 'www', path[1:])
        elif path.startswith('/vcge/voices/'):
            f = os.path.join(HERE, '..', 'www', path[len('/vcge/voices/'):] or 'index.html')
        else:
            return self.send_json(404, {'error': 'unknown'})
        if not os.path.isfile(f):
            return self.send_json(404, {'error': 'unknown'})
        data = open(f, 'rb').read()
        self.send_response(200)
        self.send_header('Content-Type', TYPES.get(os.path.splitext(f)[1], 'application/octet-stream'))
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_one(self, real):
        if self.path.startswith('/vcge/voices/api/'):
            self.path = self.path[len('/vcge'):]   # Caddy's handle_path strips /vcge the same way
            return real(self)
        return self.static()

    def do_GET(self): self.handle_one(voices.Handler.do_GET)
    def do_POST(self): self.handle_one(voices.Handler.do_POST)
    def do_PUT(self): self.handle_one(voices.Handler.do_PUT)


voices.ROOT = sys.argv[1]
srv = ThreadingHTTPServer(('127.0.0.1', int(sys.argv[2])), Lab)
print('ready', flush=True)
srv.serve_forever()
