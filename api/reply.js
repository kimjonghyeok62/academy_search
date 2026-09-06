// 학원 회신 창구 — 로그인 없이 열리는 유일한 자리.
//
// GET  ?t=<토큰>  → 그 학원의 행에서 '학원에게 보여줄 것'만 추려 돌려준다
// POST {t, answers, note} → 그 행의 회신일시·회신내용 두 칸만 쓴다
//
// 두 가지를 지킨다.
//  1. 토큰이 학원을 특정한다 — 학원은 이름도 번호도 입력하지 않으므로 오기가 생길 수 없고,
//     남의 학원 행은 서명 없이 열리지 않는다.
//  2. 담당자 메모(비고·적요·묶음)와 원장 휴대폰(연락처)은 이 응답에 절대 실리지 않는다.
//     보내는 것을 고르는 방식(PUBLIC_FIELDS)이라, 시트에 열이 늘어도 저절로 새 나가지 않는다.
//
// 공개 프록시(/api/apps-script-proxy)를 거치지 않고 Apps Script 를 직접 부른다.
// 회신 액션은 Apps Script 쪽에서도 공유키(REPLY_API_KEY)를 요구한다.
import { verifyReplyToken, replySecret } from './_lib/replyToken.js';
import { replyLine } from './_lib/replyText.js';
import { APPS_SCRIPT_URL } from './apps-script-proxy.js';

// 학원에게 보여줄 열. 여기 없는 열은 나가지 않는다.
const PUBLIC_FIELDS = [
    '확인일시', '구분', '등록번호', '학원명', '매칭상태', '매칭점수',
    '플레이스URL', '플레이스_교습비', '플레이스_번호', '플레이스_기재번호', '플레이스_번호대조',
    '블로그', '블로그URL', '블로그_교습비', '블로그_번호', '블로그_기재번호', '블로그_번호대조',
    '채널수', '채널상세',
    // 담당자가 눈으로 보고 고친 칸 — 이걸 빼면 화면이 이미 O 로 바꿔 둔 항목을 또 물어본다
    '수동확인',
    '회신일시', '회신내용',
];

// 같은 토큰이 연달아 보내는 것만 막는다. 서버리스라 인스턴스가 갈리면 초기화되므로
// 완벽한 제한이 아니다 — 손가락이 미끄러져 두 번 눌린 것을 거르는 정도로만 본다.
const RATE_MS = 3000;
const lastPost = new Map();

async function callAppsScript(action, payload) {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...payload, action, key: process.env.APPS_SCRIPT_REPLY_KEY || '' }),
        redirect: 'follow',
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 200) }; }
}

function pickPublic(row) {
    const out = {};
    PUBLIC_FIELDS.forEach((k) => { out[k] = row[k] || ''; });
    return out;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // 회신 화면은 지금 상태를 물어보는 자리다 — 캐시가 끼면 이미 보낸 회신이 안 보인다
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (!replySecret()) {
        return res.status(500).json({ ok: false, error: '회신 창구가 아직 준비되지 않았습니다. 담당자에게 알려 주세요.' });
    }

    const token = req.method === 'POST'
        ? (typeof req.body === 'string' ? safeJson(req.body).t : req.body && req.body.t)
        : req.query.t;
    const who = verifyReplyToken(token);
    if (!who) {
        return res.status(400).json({ ok: false, error: '주소가 올바르지 않습니다. 문자에 있는 주소를 그대로 열어 주세요.' });
    }

    try {
        if (req.method === 'GET') {
            const json = await callAppsScript('getSnsCheckOne', { category: who.category, regNo: who.regNo });
            if (!json.ok) return res.status(502).json({ ok: false, error: json.error || '자료를 읽지 못했습니다' });
            return res.status(200).json({
                ok: true,
                category: who.category,
                regNo: who.regNo,
                row: json.row ? pickPublic(json.row) : null,
            });
        }

        if (req.method === 'POST') {
            const now = Date.now();
            const prev = lastPost.get(token) || 0;
            if (now - prev < RATE_MS) {
                return res.status(429).json({ ok: false, error: '잠시 뒤 다시 눌러 주세요.' });
            }
            lastPost.set(token, now);

            const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
            const text = replyLine(body.answers, body.note);
            if (!text) return res.status(400).json({ ok: false, error: '표시하신 것이 없습니다.' });

            const repliedAt = new Date().toISOString();
            const json = await callAppsScript('saveSnsReply', {
                category: who.category, regNo: who.regNo, repliedAt, text,
            });
            if (!json.ok) return res.status(502).json({ ok: false, error: json.error || '저장하지 못했습니다' });
            return res.status(200).json({ ok: true, repliedAt, text });
        }

        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    } catch (err) {
        return res.status(502).json({ ok: false, error: err.message });
    }
}

function safeJson(s) {
    try { return JSON.parse(s) || {}; } catch { return {}; }
}
