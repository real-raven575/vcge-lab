#!/usr/bin/env python3
"""vCGE lab: the save service behind the Trials pages (standard library only, no third-party packages).

Reached only through Caddy at /testing/api/ (it listens on 127.0.0.1). It does three small things a static
server cannot: file a finished report, keep a draft while a tester works, and list the reports already filed.
    GET    health                  -> {"ok": true}
    GET    reports                 -> ["20261017-1741-30_cross-browser-wipe.md", ...] newest first
    POST   reports {name, body}    -> {"name": "..."} written to the reports folder, never over an existing file
    PUT    drafts/<id>  (JSON)     -> saved as drafts/<id>.json
    GET    drafts/latest?trial=x   -> the newest draft for that trial, or 204
    DELETE drafts/<id>             -> 204
Names are checked against the lab's report form YYYYMMDD-HHMM-SS_<trial>; anything else is refused.
    vcge-testing-api.py --reports DIR --drafts DIR [--port 8766] [--serve-www DIR (testing only)]
"""
import argparse, json, os, re, sys, tempfile, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

REPORT_NAME = re.compile(r'^\d{8}-\d{4}-\d{2}_[a-z0-9-]{1,60}\.md$')
DRAFT_ID = re.compile(r'^\d{8}-\d{4}-\d{2}_[a-z0-9-]{1,60}$')
TRIAL_ID = re.compile(r'^[a-z0-9-]{1,60}$')
MAX_BYTES = 2 * 1024 * 1024
PREFIX = '/testing/api/'

def write_atomic(folder, name, data):
    fd, tmp = tempfile.mkstemp(dir=folder, prefix='.tmp-')
    with os.fdopen(fd, 'wb') as f: f.write(data)
    os.chmod(tmp, 0o644)
    return tmp

def unique_name(folder, name):
    """Never overwrite: 20261017-1741-30_x.md, then -2, -3 ... before the extension."""
    base, ext = name[:-3], name[-3:]
    candidate, n = name, 1
    while os.path.exists(os.path.join(folder, candidate)):
        n += 1
        candidate = f'{base}-{n}{ext}'
    return candidate

class Handler(SimpleHTTPRequestHandler):
    reports = drafts = www = None
    server_version = 'vcge-testing-api/1'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), fmt % args))

    def send_json(self, code, obj=None):
        body = b'' if obj is None else json.dumps(obj).encode()
        self.send_response(code)
        if body:
            self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if body: self.wfile.write(body)

    def read_body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX_BYTES: raise ValueError('body missing or too large')
        return self.rfile.read(n)

    def route(self):
        """-> (api path without the prefix) or None when this is not an API request."""
        path = urlparse(self.path).path
        for p in (PREFIX, '/api/'):
            if path.startswith(p): return path[len(p):]
        return None

    def do_GET(self):
        r = self.route()
        if r is None:
            if self.www: return super().do_GET()          # testing only: the page itself
            return self.send_json(404, {'error': 'not an API path'})
        if r == 'health': return self.send_json(200, {'ok': True})
        if r == 'reports':
            names = sorted((n for n in os.listdir(self.reports) if REPORT_NAME.match(n)), reverse=True)
            return self.send_json(200, names)
        if r == 'drafts/latest':
            trial = parse_qs(urlparse(self.path).query).get('trial', [''])[0]
            if not TRIAL_ID.match(trial): return self.send_json(400, {'error': 'bad trial id'})
            names = sorted((n for n in os.listdir(self.drafts) if n.endswith(f'_{trial}.json') and DRAFT_ID.match(n[:-5])), reverse=True)
            if not names: return self.send_json(204)
            with open(os.path.join(self.drafts, names[0]), 'rb') as f: data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_json(404, {'error': 'unknown'})

    def do_POST(self):
        if self.route() != 'reports': return self.send_json(404, {'error': 'unknown'})
        try:
            req = json.loads(self.read_body())
            name, body = req['name'], req['body']
            if not REPORT_NAME.match(name) or not isinstance(body, str): raise ValueError('bad name or body')
        except (ValueError, KeyError, TypeError) as e:
            return self.send_json(400, {'error': str(e)})
        final = unique_name(self.reports, name)
        tmp = write_atomic(self.reports, final, body.encode())
        os.replace(tmp, os.path.join(self.reports, final))
        self.log_message('filed %s (%d bytes)', final, len(body))
        self.send_json(201, {'name': final})

    def draft_path(self):
        r = self.route() or ''
        if not r.startswith('drafts/'): return None
        did = r[len('drafts/'):]
        return os.path.join(self.drafts, did + '.json') if DRAFT_ID.match(did) else None

    def do_PUT(self):
        p = self.draft_path()
        if not p: return self.send_json(404, {'error': 'unknown'})
        try:
            data = self.read_body()
            json.loads(data)                     # must be JSON; stored as sent
        except ValueError as e:
            return self.send_json(400, {'error': str(e)})
        os.replace(write_atomic(self.drafts, os.path.basename(p), data), p)
        self.send_json(204)

    def do_DELETE(self):
        p = self.draft_path()
        if not p: return self.send_json(404, {'error': 'unknown'})
        try: os.remove(p)
        except FileNotFoundError: pass
        self.send_json(204)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--reports', required=True); ap.add_argument('--drafts', required=True)
    ap.add_argument('--port', type=int, default=8766); ap.add_argument('--bind', default='127.0.0.1')
    ap.add_argument('--serve-www', help='testing only: also serve this folder as the site root')
    a = ap.parse_args()
    for d in (a.reports, a.drafts): os.makedirs(d, exist_ok=True)
    Handler.reports, Handler.drafts, Handler.www = a.reports, a.drafts, a.serve_www
    if a.serve_www: os.chdir(a.serve_www)
    srv = ThreadingHTTPServer((a.bind, a.port), Handler)
    sys.stderr.write(f'vcge-testing-api on {a.bind}:{a.port}, reports {a.reports}, drafts {a.drafts}\n')
    try: srv.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == '__main__':
    main()
