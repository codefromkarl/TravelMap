const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const WEB_DIR = __dirname;

// mimo3 配置
const MIMO3_CONFIG = {
  baseUrl: 'http://10.200.4.1:8100/v1',
  apiKey: 'sk-mimo3-relay-key',
  model: 'mimo3'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// 代理 LLM API 请求
function proxyLLMRequest(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body);
      const upstreamBody = {
        model: MIMO3_CONFIG.model,
        messages: parsed.messages,
        max_tokens: parsed.max_tokens || 200,
        stream: false
      };

      const response = await fetch(`${MIMO3_CONFIG.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MIMO3_CONFIG.apiKey}`
        },
        body: JSON.stringify(upstreamBody)
      });

      const data = await response.text();
      res.writeHead(response.status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    } catch (err) {
      console.error('LLM API Error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // LLM API 代理
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    return proxyLLMRequest(req, res);
  }

  // 静态文件服务
  let filePath = path.join(WEB_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 本地开发服务器启动成功!`);
  console.log(`   访问地址: http://localhost:${PORT}`);
  console.log(`   API 代理: http://localhost:${PORT}/api/chat → mimo3`);
});
