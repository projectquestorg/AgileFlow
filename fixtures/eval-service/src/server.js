import http from 'node:http';
import { handle } from './app.js';

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = rawBody && req.headers['content-type']?.includes('json') ? JSON.parse(rawBody) : undefined;
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"malformed JSON"}');
      return;
    }
    const result = handle({ method: req.method, url: req.url, headers: req.headers, body, rawBody, ip: req.socket.remoteAddress });
    res.writeHead(result.status, { 'content-type': 'application/json' }).end(JSON.stringify(result.body));
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`listening on http://localhost:${port}`));
