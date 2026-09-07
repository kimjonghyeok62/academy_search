// 교습비 게시표 예시 — 학원이 안내 문자로 받은 주소(/g/<토큰>)를 열면 이곳이 자료를 준다.
//
// 학원이 스스로 게시표를 만들려면 신고한 교습과정·금액·시간이 필요하고, 그것은 마스터
// 스프레드시트에 있다. 회신 창구(api/reply.js)와 같은 토큰을 쓰므로 그 학원 것만 열린다.
//
// 회신 화면(GET /api/reply)과 나누어 둔 이유: 마스터 CSV 는 몇 MB 라 읽는 값이 비싸다.
// 회신하러 들어온 학원마다 이것까지 읽으면 회신 화면이 그만큼 늦어진다.
import { verifyReplyToken, replySecret, formExpired, FORM_TTL_DAYS } from './_lib/replyToken.js';
import { academyRows } from './_lib/masterSheet.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // 신고 내용이 바뀌면 바로 보여야 한다 (게시표는 '지금 신고돼 있는 것' 이어야 뜻이 있다)
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    if (!replySecret()) {
        return res.status(500).json({ ok: false, error: '아직 준비되지 않았습니다. 담당자에게 알려 주세요.' });
    }

    const who = verifyReplyToken(req.query.t);
    if (!who) {
        return res.status(400).json({ ok: false, error: '주소가 올바르지 않습니다. 문자에 있는 주소를 그대로 열어 주세요.' });
    }

    // 게시표는 신고 내용이 보이는 자리라 주소를 오래 살려 두지 않는다.
    // 회신(/r/)은 같은 토큰이라도 만료시키지 않는다 — 늦게라도 고쳤다면 받는 편이 낫다.
    if (formExpired(who)) {
        return res.status(410).json({
            ok: false,
            error: `이 주소는 문자를 보낸 날부터 ${FORM_TTL_DAYS}일까지만 열립니다. `
                + '기간이 지났으니 담당자에게 전화 주시면 다시 보내 드립니다.',
        });
    }

    try {
        const rows = await academyRows(who.category, who.regNo);
        // 마스터에 교습과정이 없는 곳이 있다 — 오류가 아니라 '만들 것이 없다' 이다
        return res.status(200).json({ ok: true, category: who.category, regNo: who.regNo, rows });
    } catch (err) {
        return res.status(502).json({ ok: false, error: err.message });
    }
}
