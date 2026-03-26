export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiUrl = Deno.env.get('CHATBOT_API_URL');
  const apiToken = Deno.env.get('CHATBOT_API_TOKEN');

  if (!apiUrl || !apiToken) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { chat_id, message } = body;
  if (!chat_id || !message || typeof message !== 'string' || message.length > 2000) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ chat_id, message, stream: true }),
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Upstream error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Pipe upstream SSE and inject keep-alive comments every 10s
    // to prevent Netlify from killing the connection during long waits
    const reader = upstream.body.getReader();
    const encoder = new TextEncoder();
    let heartbeatTimer = null;

    const stream = new ReadableStream({
      async start(controller) {
        const sendHeartbeat = () => {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } catch { /* stream closed */ }
        };
        heartbeatTimer = setInterval(sendHeartbeat, 10000);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          controller.error(e);
        } finally {
          clearInterval(heartbeatTimer);
          controller.close();
        }
      },
      cancel() {
        clearInterval(heartbeatTimer);
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Upstream API error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = {
  path: '/api/chat',
};
