// ── CADDIE FUNCTION ──
// Proxies caddie requests to Claude Haiku.
// Supports both the guide (single message) and the PWA (multi-turn history).
// API key stays server-side; origin check prevents third-party abuse.

const https = require('https');

const ALLOWED_ORIGINS = [
  'https://golf.spinvibes.com',
  'https://www.golf.spinvibes.com',
  'https://spinvibes.com',
  'https://www.spinvibes.com',
  'http://localhost:8888',  // netlify dev
  'http://localhost:3000',
];

exports.handler = async (event) => {
  // ── CORS preflight ──
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(event),
      body: '',
    };
  }

  // ── Method check ──
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Origin / Referer check ──
  const origin = event.headers['origin'] || event.headers['referer'] || '';
  const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  if (!isAllowed) {
    console.warn('Blocked origin:', origin);
    return { statusCode: 403, body: 'Forbidden' };
  }

  // ── Parse body ──
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Bad Request: invalid JSON' };
  }

  const { message, messages, systemPrompt, maxTokens } = body;

  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return { statusCode: 400, body: 'Bad Request: systemPrompt missing' };
  }

  // Caddie stays terse (default 80); coaching brief may request more, clamped for safety.
  const tokenCap = Math.min(Math.max(parseInt(maxTokens) || 80, 1), 500);

  // Support both formats:
  //   guide: { message: "string", systemPrompt }  → single-turn
  //   PWA:   { messages: [...], systemPrompt }     → multi-turn history
  let messageArray;
  if (Array.isArray(messages) && messages.length > 0) {
    // Validate multi-turn: each item must have role + content string
    const valid = messages.every(m =>
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.length <= 2000
    );
    if (!valid || messages.length > 20) {
      return { statusCode: 400, body: 'Bad Request: invalid messages array' };
    }
    messageArray = messages;
  } else if (message && typeof message === 'string' && message.length <= 500) {
    messageArray = [{ role: 'user', content: message }];
  } else {
    return { statusCode: 400, body: 'Bad Request: message or messages required' };
  }

  // ── API key ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return { statusCode: 500, body: 'Caddie not configured yet' };
  }

  // ── Call Claude Haiku ──
  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: tokenCap,
    system: systemPrompt,
    messages: messageArray,
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const text =
              parsed.content?.[0]?.text ||
              "Sorry, couldn't read that. Try again.";
            resolve({
              statusCode: 200,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(event),
              },
              body: JSON.stringify({ reply: text }),
            });
          } catch {
            resolve({ statusCode: 500, body: 'Parse error from Claude API' });
          }
        });
      }
    );
    req.on('error', (err) => {
      console.error('Claude API error:', err);
      resolve({ statusCode: 502, body: 'Upstream request failed' });
    });
    req.write(requestBody);
    req.end();
  });
};

function corsHeaders(event) {
  const origin = event.headers['origin'] || '';
  const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
