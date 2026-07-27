// Vercel 서버리스 프록시 — CORS 우회용
// 클라이언트가 /api/apps-script-proxy?... 로 요청하면 서버 측에서 Apps Script 호출
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyv393nKJ_S_a-Odi5omfTuU29WVu4qIeg6ScUyPsOMmJ3gz0rpbhBkaAfxwIa1g0lg/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const params = new URLSearchParams(req.query).toString();
  const targetUrl = params ? `${APPS_SCRIPT_URL}?${params}` : APPS_SCRIPT_URL;

  try {
    // POST 는 본문을 그대로 전달 (레코드가 많아 쿼리스트링 길이 제한을 넘는 저장용)
    // Apps Script 는 text/plain 이어야 preflight 없이 postData.contents 로 받는다
    const init = req.method === 'POST'
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
          redirect: 'follow',
        }
      : { redirect: 'follow' };

    const upstream = await fetch(targetUrl, init);
    const text = await upstream.text();

    let json;
    try { json = JSON.parse(text); } catch { json = { ok: false, error: text }; }

    res.status(upstream.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
}
