// 담당자 화면이 교습비 게시표 예시 주소(/g/<토큰>)를 받아가는 자리.
// 서명 키가 서버에만 있어 화면에서는 주소를 만들 수 없다.
//
// 이름이 reply-link 인 것은 학원 회신(/r/) 을 함께 만들던 때의 흔적이다.
// 회신 기능은 걷어냈고 지금은 게시표 주소만 준다.
import { signReplyToken, replyUrlFor, replySecret } from './_lib/replyToken.js';

// 학원 1,000곳 + 여유. 이보다 많이 오면 우리 화면이 부른 것이 아니다.
const MAX_ITEMS = 2000;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    if (!replySecret()) {
        return res.status(500).json({ ok: false, error: 'SNS_REPLY_SECRET 이 설정되지 않았습니다' });
    }

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'invalid JSON body' }); }
    }
    const items = (body && body.items) || [];
    if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: 'items 배열이 필요합니다' });
    if (items.length > MAX_ITEMS) return res.status(400).json({ ok: false, error: `한 번에 최대 ${MAX_ITEMS}곳` });

    // 키는 화면의 recordKey 와 같은 모양(`구분|등록번호`)이라 그대로 Map 에 담을 수 있다
    const links = {};
    items.forEach((it) => {
        const token = signReplyToken(it && it.category, it && it.regNo);
        if (!token) return;
        links[`${it.category}|${it.regNo}`] = { form: replyUrlFor(req, token, 'g') };
    });
    return res.status(200).json({ ok: true, links });
}
