exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return { statusCode: 500, body: 'Email not configured' };
  }

  let email, name, guideUrl, appUrl;
  try {
    ({ email, name, guideUrl, appUrl } = JSON.parse(event.body));
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (!email || !guideUrl) {
    return { statusCode: 400, body: 'Missing required fields' };
  }
  name = name || 'Golfer';

  // App URL: if not provided, fall back to guide URL
  const finalAppUrl = appUrl || guideUrl;

  const html = `
    <div style="font-family:'Helvetica Neue',sans-serif;max-width:480px;margin:0 auto;background:#0a1a0e;padding:32px 24px;border-radius:16px;">
      <div style="font-family:Georgia,serif;font-size:2rem;color:#c9a84c;letter-spacing:4px;text-align:center;margin-bottom:4px;">⛳ SPINVIBES</div>
      <div style="font-size:0.7rem;color:#6a8a6e;letter-spacing:2px;text-transform:uppercase;text-align:center;margin-bottom:28px;">Your Personal Golf App</div>

      <p style="color:#f0ead8;font-size:1rem;margin-bottom:8px;">Hey ${name}!</p>
      <p style="color:#c8c0aa;font-size:0.92rem;line-height:1.6;margin-bottom:24px;">
        Your personalized SpinVibes app is ready. It's built around your game — your goals, your bag, your caddie. Add it to your home screen and it works offline.
      </p>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="${finalAppUrl}" style="display:inline-block;background:linear-gradient(135deg,#2d6a3f,#1e4d2b);color:#c9a84c;padding:16px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:1rem;letter-spacing:1px;">
          📱 Open My SpinVibes App →
        </a>
      </div>

      <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:14px 16px;margin-bottom:24px;">
        <div style="font-size:0.72rem;font-weight:700;color:#c9a84c;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">To install on your phone:</div>
        <div style="color:#c8c0aa;font-size:0.82rem;line-height:1.8;">
          <strong style="color:#f0ead8;">iPhone:</strong> Open in Safari → tap Share → "Add to Home Screen"<br>
          <strong style="color:#f0ead8;">Android:</strong> Open in Chrome → tap menu → "Add to Home Screen"
        </div>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;margin-top:8px;">
        <div style="font-size:0.72rem;color:#6a8a6e;margin-bottom:8px;">Also: your personalized coaching guide</div>
        <a href="${guideUrl}" style="color:#c9a84c;font-size:0.82rem;text-decoration:underline;">View my guide →</a>
      </div>

      <p style="color:#6a8a6e;font-size:0.72rem;line-height:1.5;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;margin-top:16px;margin-bottom:0;">
        You're receiving this because you created a guide at golf.spinvibes.com. This is a one-time email — we'll never spam you.
      </p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SpinVibes <guide@spinvibes.com>',
        to: [email],
        subject: `📱 ${name}, your SpinVibes app is ready`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { statusCode: 500, body: 'Failed to send email' };
    }

    return { statusCode: 200, body: 'Email sent' };
  } catch (err) {
    console.error('Send error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
};
