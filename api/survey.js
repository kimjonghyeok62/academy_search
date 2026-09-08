// 만족도 조사 — 학원이 회신을 보낸 뒤 완료 화면에서 고른 것을 받는다.
//
// 회신 창구(api/reply.js)와 같은 토큰을 쓴다. 그래서 학원은 이름도 번호도 입력하지 않고,
// 우리는 어느 곳이 답했는지 알 수 있어 응답률을 셀 수 있다.
//
// 다만 **담당자 화면에는 학원별로 보여주지 않는다**(성과 탭은 합계와 의견만 그린다).
// 지도점검을 한 사람이 만족도를 묻는 자리라, 실명이 그대로 보이면 점수가 높게 몰려
// 오히려 자료의 힘이 떨어진다. 학원 화면에도 그렇게 적어 두었다.
import { verifyReplyToken, replySecret } from './_lib/replyToken.js';
import { surveyValues } from './_lib/surveyText.js';
import { APPS_SCRIPT_URL } from './apps-script-proxy.js';

// 손가락이 미끄러져 두 번 눌린 것만 거른다. 서버리스라 인스턴스가 갈리면 초기화되므로
// 완벽한 제한이 아니다 — 다시 보내면 시트에서 덮어쓰므로 줄이 늘지도 않는다.
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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    if (!replySecret()) {
        return res.status(500).json({ ok: false, error: '아직 준비되지 않았습니다. 담당자에게 알려 주세요.' });
    }

    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    const who = verifyReplyToken(body.t);
    if (!who) {
        return res.status(400).json({ ok: false, error: '주소가 올바르지 않습니다. 문자에 있는 주소를 그대로 열어 주세요.' });
    }

    const now = Date.now();
    if (now - (lastPost.get(body.t) || 0) < RATE_MS) {
        return res.status(429).json({ ok: false, error: '잠시 뒤 다시 눌러 주세요.' });
    }
    lastPost.set(body.t, now);

    const values = surveyValues(body);
    // 아무것도 고르지 않았으면 조용히 넘어간다. 오류로 되돌리면 '답하지 않고 마치기' 를
    // 누른 것과 다를 바 없는 일에 학원이 빨간 글씨를 본다.
    if (!values) return res.status(200).json({ ok: true, skipped: true });

    try {
        const json = await callAppsScript('saveSurvey', {
            category: who.category,
            regNo: who.regNo,
            answeredAt: new Date().toISOString(),
            ...values,
        });
        if (!json.ok) return res.status(502).json({ ok: false, error: json.error || '저장하지 못했습니다' });
        return res.status(200).json({ ok: true });
    } catch (err) {
        return res.status(502).json({ ok: false, error: err.message });
    }
}

function safeJson(s) {
    try { return JSON.parse(s) || {}; } catch { return {}; }
}
