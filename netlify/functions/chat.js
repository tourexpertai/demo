const https = require('https');
const http = require('http');

function makeRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiUrl = process.env.CHATBOT_API_URL;
  const apiToken = process.env.CHATBOT_API_TOKEN;

  if (!apiUrl || !apiToken) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfiguration' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { chat_id, message } = body;
  if (!chat_id || !message || typeof message !== 'string' || message.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  try {
    const postData = JSON.stringify({ chat_id, message });
    const response = await makeRequest(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, postData);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: response.body
    };
  } catch (error) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Upstream API error', detail: error.message })
    };
  }
};
