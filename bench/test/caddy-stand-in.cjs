// Test stand-in for Caddy: static files from www/, /bench/api/* proxied to the bench service on 8765.
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2], port = Number(process.argv[3]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  if (req.url.startsWith('/bench/api/')) {
    const p = http.request({ host: '127.0.0.1', port: 8765, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(p); return;
  }
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
