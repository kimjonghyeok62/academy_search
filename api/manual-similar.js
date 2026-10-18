// 학원업무 편람 '비슷한 내용' — 검색어(문장)를 구글 임베딩으로 숫자 768개로 바꿔 돌려준다.
// 편람 조각은 scripts/build_manual_vectors.mjs 가 미리 같은 모델로 바꿔 두었고,
// 어느 조각이 가까운지는 브라우저가 계산한다 (여기서는 질문 한 문장만 바꾼다).
// 키는 서버에만 둔다 — VITE_ 로 두면 빌드 때 자바스크립트에 박혀 누구나 꺼내 쓸 수 있다.
const MODEL = 'gemini-embedding-001'; // build_manual_vectors.mjs 와 같아야 한다
const DIM = 768;
const MAX_LEN = 300;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const q = String(req.body?.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q 필요' });
  if (q.length > MAX_LEN) return res.status(413).json({ error: `검색어는 ${MAX_LEN}자까지입니다` });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "'비슷한 내용' 찾기가 아직 켜지지 않았습니다 — Vercel 환경변수에 GEMINI_API_KEY 를 넣어야 합니다",
    });
  }

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: q }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: DIM,
      }),
    });
    if (!r.ok) {
      const msg = await r.text();
      console.error('manual-similar', r.status, msg.slice(0, 300));
      return res.status(502).json({ error: `임베딩 실패 (${r.status})` });
    }
    const v = (await r.json()).embedding.values;
    // 같은 검색어는 다시 물어도 같은 값 — 브라우저가 잠시 들고 있게 한다
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json({ v });
  } catch (e) {
    console.error('manual-similar', e);
    return res.status(500).json({ error: '임베딩 서버에 닿지 못했습니다' });
  }
}
