// ── PARSE SCORECARD FUNCTION ──
// Accepts a base64 scorecard photo + tee color preference.
// Calls Claude Haiku with vision and returns parsed course JSON.

const https = require('https');

const ALLOWED_ORIGINS = [
  'https://golf.spinvibes.com',
  'https://www.golf.spinvibes.com',
  'https://spinvibes.com',
  'https://www.spinvibes.com',
  'http://localhost:8888',
  'http://localhost:3000',
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const origin = event.headers['origin'] || event.headers['referer'] || '';
  const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  if (!isAllowed) {
    console.warn('Blocked origin:', origin);
    return { statusCode: 403, body: 'Forbidden' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Bad Request: invalid JSON' };
  }

  const { image, mediaType = 'image/jpeg', teeColor = 'White' } = body;
  if (!image || typeof image !== 'string') {
    return { statusCode: 400, body: 'Bad Request: image required' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: 'Not configured' };
  }

  const systemPrompt = `You are parsing a golf scorecard photo. Return ONLY valid JSON — no explanation, no markdown, no extra text. Use this exact structure:
{
  "name": "full course name",
  "city": "city or null",
  "state": "state abbreviation or null",
  "teeColor": "${teeColor}",
  "par": total_par_integer,
  "holes": number_of_holes_integer,
  "holePars": [par_hole1, par_hole2, ...],
  "yardages": [yards_hole1, yards_hole2, ...]
}
Rules: holePars and yardages must each have exactly "holes" entries. Use the ${teeColor} tee yardage row if visible, otherwise the shortest tee row. If a yardage is unreadable use null. par = sum of holePars. Return ONLY the JSON object.`;

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: image },
        },
        {
          type: 'text',
          text: `Parse this golf scorecard. Use the ${teeColor} tee yardages. Return only JSON.`,
        },
      ],
    }],
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
            const text = parsed.content?.[0]?.text || '';
            // Extract JSON from response (strip any accidental markdown fences)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              resolve({ statusCode: 422, headers: corsHeaders(event), body: JSON.stringify({ error: 'Could not parse scorecard — try a clearer photo' }) });
              return;
            }
            const course = JSON.parse(jsonMatch[0]);
            resolve({
              statusCode: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
              body: JSON.stringify({ course }),
            });
          } catch (e) {
            console.error('Parse error:', e);
            resolve({ statusCode: 422, headers: corsHeaders(event), body: JSON.stringify({ error: 'Could not read scorecard — try a clearer photo' }) });
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
