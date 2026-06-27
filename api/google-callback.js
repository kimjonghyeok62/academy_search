// Google이 로그인 후 credential을 POST로 전송하는 엔드포인트
// 검증 후 앱으로 리다이렉트
export default async function handler(req, res) {
  const { credential } = req.body || {};
  if (!credential) return res.redirect(302, '/?auth_error=no_token');

  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const payload = await verifyRes.json();

    if (!verifyRes.ok || payload.error) {
      return res.redirect(302, '/?auth_error=invalid_token');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId) {
      return res.redirect(302, '/?auth_error=client_mismatch');
    }

    const allowedEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const email = (payload.email || '').toLowerCase();

    if (!allowedEmails.includes(email)) {
      return res.redirect(302, '/?auth_error=not_allowed');
    }

    return res.redirect(302, `/?auth_ok=1&email=${encodeURIComponent(payload.email)}`);
  } catch (err) {
    console.error('Google callback error:', err);
    return res.redirect(302, '/?auth_error=server_error');
  }
}
