// 사진 속 간판에서 학원 상호명을 읽는다 (사진 이름바꾸기).
//
// 이 일을 왜 서버가 하는가: 예전에는 브라우저가 api.anthropic.com 을 직접 불렀고, 그러려면
// 키가 브라우저에 있어야 했다. VITE_ 로 시작하는 환경변수는 빌드 때 자바스크립트에 박혀
// 배포되므로, 사이트를 연 사람이면 누구나 그 키를 꺼내 쓸 수 있었다 (요금은 이쪽 계정으로).
// 키를 서버에만 두면 브라우저로는 사진만 오가고 키는 나가지 않는다.
import Anthropic from '@anthropic-ai/sdk';

// 간판에 큼직하게 적힌 상호 한 줄을 읽는 일이다 — 가장 싼 모델로 충분하다
const MODEL = 'claude-haiku-4-5';
// 사진 한 장은 400KB 로 줄여서 온다(클라이언트 compressToJpeg). base64 는 약 4/3 이므로
// 1MB 면 충분히 넉넉하다 — 그보다 크면 줄이지 않고 보낸 것이라 되돌려보낸다.
const MAX_BASE64 = 1_400_000;

const PROMPT = [
  '이 사진에서 학원, 교습소, 개인과외교습소의 공식 상호명을 찾아주세요.',
  '규칙:',
  '- 간판이나 현수막에 적힌 공식 명칭만 추출',
  "- '학원', '교습소' 등 기관 종류명 포함",
  '- 이름만 한 줄로 답변 (예: 하남수학학원)',
  '- 파일명으로 쓸 수 없는 특수문자(/ \\ : * ? " < > |)는 제외',
  "- 확인 불가능하면 '알수없음' 으로만 답변",
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: 'imageBase64, mimeType 필요' });
  }
  if (!/^image\/(jpeg|png|gif|webp)$/.test(mimeType)) {
    return res.status(400).json({ error: `읽을 수 없는 형식입니다 (${mimeType})` });
  }
  if (imageBase64.length > MAX_BASE64) {
    return res.status(413).json({ error: '사진이 너무 큽니다 — 줄여서 보내세요' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: '사진 인식이 아직 켜지지 않았습니다 — Vercel 환경변수에 ANTHROPIC_API_KEY 를 넣어야 합니다',
    });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: MODEL,
      // 이 모델은 생각을 켜지 않으면 답만 쓴다 (effort 는 이 모델에서 못 쓴다).
      // 이름 한 줄이라 200 이면 넉넉하다.
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });

    if (resp.stop_reason === 'refusal') {
      return res.status(502).json({ error: '모델이 이 사진에 답하지 않았습니다' });
    }
    // 첫 블록이 답이라는 보장이 없다 (생각 블록이 앞에 올 수 있다)
    const raw = (resp.content || [])
      .filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    const name = raw.replace(/[\\/:*?"<>|]/g, '').trim();
    return res.json({ name: name === '알수없음' ? '' : name });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
}
