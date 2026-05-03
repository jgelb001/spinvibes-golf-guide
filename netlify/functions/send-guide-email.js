exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return { statusCode: 500, body: 'Email not configured' };
  }

  let email, name, guideUrl;
  try {
    ({ email, name, guideUrl } = JSON.parse(event.body));
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (!email || !name || !guideUrl) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const html = `
    <div style="font-family:'Helvetica Neue',sans-serif;max-width:480px;margin:0 auto;background:#0a1a0e;padding:32px 24px;border-radius:16px;">
      <div style="font-family:Georgia,serif;font-size:2rem;color:#c9a84c;letter-spacing:4px;text-align:center;margin-bottom:4px;">⛳ GOLFGUIDE</div>
      <div style="font-size:0.7rem;color:#6a8a6e;letter-spacing:2px;text-transform:uppercase;text-align:center;margin-bottom:28px;">SpinVibes</div>

      <p style="color:#f0ead8;font-size:1rem;margin-bottom:8px;">Hey ${name}!</p>
      <p style="color:#c8c0aa;font-size:0.92rem;line-height:1.6;margin-bottom:24px;">
        Your personalized golf guide is ready. Bookmark the link below or come back to this email anytime — it's your permanent guide.
      </p>

      <div style="text-align:center;margin-bottom:28px;">
        <a href="${guideUrl}" style="display:inline-block;background:linear-gradient(135deg,#2d6a3f,#1e4d2b);color:#c9a84c;padding:16px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:1rem;letter-spacing:1px;">
          ⛳ Open My Golf Guide →
        </a>
      </div>

      <p style="color:#6a8a6e;font-size:0.75rem;line-height:1.5;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;margin:0;">
        You're receiving this because you created a guide at golf.spinvibes.com. We'll never spam you — this is a one-time link email.
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
        from: 'SpinVibes Golf Guide <guide@spinvibes.com>',
        to: [email],
        subject: `⛳ ${name}'s Golf Guide — your link is here`,
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
