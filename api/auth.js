// Google ID 토큰 검증 + 허용 이메일 확인
// ALLOWED_EMAILS, GOOGLE_CLIENT_ID 는 Vercel 환경변수에 저장 (코드/깃허브에 없음)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ ok: false, error: '토큰이 없습니다.' });

  try {
    // 구글 서버에서 토큰 진위 확인
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const payload = await verifyRes.json();

    if (!verifyRes.ok || payload.error) {
      return res.status(401).json({ ok: false, error: '유효하지 않은 구글 토큰입니다.' });
    }

    // 발급처(Client ID) 검증
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId) {
      return res.status(401).json({ ok: false, error: '토큰 발급처가 일치하지 않습니다.' });
    }

    // 허용 이메일 목록 확인 (Vercel 환경변수: 쉼표 구분)
    const allowedEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    const email = (payload.email || '').toLowerCase();

    if (allowedEmails.length === 0) {
      return res.status(500).json({ ok: false, error: '서버 설정 오류: 허용 이메일이 지정되지 않았습니다.' });
    }

    if (!allowedEmails.includes(email)) {
      return res.status(403).json({ ok: false, error: '접근 권한이 없는 계정입니다.' });
    }

    return res.status(200).json({ ok: true, email: payload.email, name: payload.name });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ ok: false, error: '인증 처리 중 오류가 발생했습니다.' });
  }
}
