const http = require('http');
const fs = require('fs');
const path = require('path');

const API_URL = process.env.CHATBOT_API_URL || 'http://44.201.192.183:5667/v1/chatbot/chat_with_api_token';
const API_TOKEN = process.env.CHATBOT_API_TOKEN || '20fa5866-4839-439f-ba53-8e73cd88b10d';
const PORT = 8080;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // Chat API proxy
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const { chat_id, message } = parsed;
      if (!chat_id || !message || typeof message !== 'string' || message.length > 2000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
        return;
      }

      const postData = JSON.stringify({ chat_id, message, stream: true });
      const apiReq = http.request(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (apiRes) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        // Pipe the SSE stream directly — no buffering
        apiRes.on('data', chunk => {
          res.write(chunk);
        });
        apiRes.on('end', () => {
          res.end();
        });
      });

      apiReq.on('error', (err) => {
        console.error('API error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upstream error' }));
      });

      apiReq.write(postData);
      apiReq.end();
    });
    return;
  }

  // Static file serving
  let filePath = req.url === '/' ? '/demo.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
