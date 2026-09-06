// 담당자 화면이 회신 링크를 한꺼번에 받아가는 자리.
//
// 행마다 부르면 750번 왕복한다. 점검표는 결과를 읽은 뒤 '보낼 것이 있는 행' 전부를
// 한 번에 물어보고 Map 으로 들고 있다가, 문자를 지을 때 그 주소를 실어 보낸다.
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
        if (token) links[`${it.category}|${it.regNo}`] = replyUrlFor(req, token);
    });
    return res.status(200).json({ ok: true, links });
}
