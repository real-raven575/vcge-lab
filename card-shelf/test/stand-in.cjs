// Test stand-in for the lab's Caddy: static files from <www>; /shelf/api/* to the shelf (8768), /bench/api/* to
// Glyph's bench service (8765). Usage: node stand-in.cjs <www> <port>
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2]), port = Number(process.argv[3]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.svg': 'image/svg+xml' };
const forward = { '/shelf/api/': 8768, '/bench/api/': 8765 };
http.createServer((req, res) => {
  for (const [prefix, to] of Object.entries(forward)) {
    if (req.url.startsWith(prefix)) {
      const p = http.request({ host: '127.0.0.1', port: to, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      p.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(p); return;
    }
  }
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
