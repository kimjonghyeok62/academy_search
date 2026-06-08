// Vercel 서버리스 프록시 — CORS 우회용
// 클라이언트가 /api/apps-script-proxy?... 로 요청하면 서버 측에서 Apps Script 호출
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw94rY8I4uynsLRWp2qyBxOK15yYNv7RfB5tPvFoAt8kn_xsEibr3mUzsiOaL3RC61f/exec';

export default async function handler(req, res) {
  const params = new URLSearchParams(req.query).toString();
  const targetUrl = `${APPS_SCRIPT_URL}?${params}`;

  try {
    const upstream = await fetch(targetUrl, { redirect: 'follow' });
    const text = await upstream.text();

    let json;
    try { json = JSON.parse(text); } catch { json = { ok: false, error: text }; }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(upstream.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
}
