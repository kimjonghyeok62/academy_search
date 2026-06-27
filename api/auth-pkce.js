export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { code, code_verifier, redirect_uri } = req.body || {};
  if (!code || !code_verifier || !redirect_uri) {
    return res.status(400).json({ ok: false, error: '필수 파라미터가 없습니다.' });
  }

  try {
    // 1. code → tokens 교환
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: 'authorization_code',
        code_verifier,
      }),
    });
    const tokens = await tokenRes.json();

    if (!tokenRes.ok || tokens.error) {
      console.error('Token exchange error:', tokens);
      const detail = tokens.error_description || tokens.error || 'unknown';
      return res.status(401).json({ ok: false, error: `토큰 교환 실패: ${detail}` });
    }

    // 2. id_token 검증
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${tokens.id_token}`);
    const payload = await verifyRes.json();

    if (!verifyRes.ok || payload.error) {
      return res.status(401).json({ ok: false, error: '유효하지 않은 토큰입니다.' });
    }

    // 3. 허용 이메일 확인
    const allowedEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const email = (payload.email || '').toLowerCase();

    if (allowedEmails.length === 0) {
      return res.status(500).json({ ok: false, error: '서버 설정 오류: 허용 이메일이 없습니다.' });
    }
    if (!allowedEmails.includes(email)) {
      return res.status(403).json({ ok: false, error: '접근 권한이 없는 계정입니다.' });
    }

    return res.status(200).json({ ok: true, email: payload.email, name: payload.name });
  } catch (err) {
    console.error('PKCE auth error:', err);
    return res.status(500).json({ ok: false, error: '인증 처리 중 오류가 발생했습니다.' });
  }
}
