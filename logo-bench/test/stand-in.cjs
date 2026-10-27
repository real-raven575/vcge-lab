// Test stand-in for the lab's Caddy: static files from <www> on 127.0.0.1:<port>. No Darkroom service, so the bench
// falls back to the newest build and photos from this device.
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2], port = Number(process.argv[3]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(path.resolve(root))) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' data: blob:" });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
