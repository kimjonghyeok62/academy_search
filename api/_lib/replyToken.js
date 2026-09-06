// 안내 문자에 실어 보내는 회신 주소의 토큰.
//
//   https://…/r/a1003-7k2xq9
//            └┬┘└─┬─┘ └──┬─┘
//             │   │      └ 서명 6자 (HMAC-SHA256 을 36진수로)
//             │   └ 등록(신고)번호
//             └ a=학원, h=교습소
//
// 시트에 토큰 열을 두지 않는다 — 서명이 곧 자물쇠라 저장할 것이 없고, 열이 하나 늘면
// Apps Script 까지 함께 고쳐야 한다. 만료도 두지 않는다: 기한이 지난 뒤라도 고쳤다고
// 알려 오는 편이 담당자에게 이롭다 (늦었다는 사실은 발송일시와 회신일시가 말해 준다).
//
// 비밀키(SNS_REPLY_SECRET)가 없으면 링크를 만들지도, 열지도 않는다. 조용히 통과시키면
// 등록번호만 아는 사람이 남의 학원 회신을 대신 넣을 수 있어 서명이 무의미해진다.
import crypto from 'node:crypto';

const CODE = { 학원: 'a', 교습소: 'h' };
const CATEGORY = { a: '학원', h: '교습소' };

const SIG_LEN = 6;
const SIG_SPACE = 36 ** SIG_LEN;

export const replySecret = () => String(process.env.SNS_REPLY_SECRET || '').trim();

/** 서명 6자 — 6바이트를 36진수로 접는다 (2^48 이라 자바스크립트 정수 범위 안이다) */
function sign(code, regNo, secret) {
    const raw = crypto.createHmac('sha256', secret).update(`${code}|${regNo}`).digest();
    return (raw.readUIntBE(0, 6) % SIG_SPACE).toString(36).padStart(SIG_LEN, '0');
}

/** 학원 하나를 가리키는 토큰. 만들 수 없으면 빈 문자열 (부르는 쪽이 링크를 빼면 된다) */
export function signReplyToken(category, regNo) {
    const secret = replySecret();
    const code = CODE[String(category || '').trim()];
    const no = String(regNo || '').trim();
    if (!secret || !code || !no) return '';
    return `${code}${no}-${sign(code, no, secret)}`;
}

/** 토큰 → { category, regNo }. 서명이 안 맞으면 null */
export function verifyReplyToken(token) {
    const secret = replySecret();
    const s = String(token || '').trim();
    if (!secret || !s) return null;

    // 등록번호에 '-' 가 섞여 있어도 되도록 마지막 '-' 를 구분자로 본다
    const cut = s.lastIndexOf('-');
    if (cut < 2) return null;
    const head = s.slice(0, cut);
    const got = s.slice(cut + 1);
    const category = CATEGORY[head[0]];
    const regNo = head.slice(1);
    if (!category || !regNo || got.length !== SIG_LEN) return null;

    const want = sign(head[0], regNo, secret);
    // 길이가 같을 때만 timingSafeEqual 을 쓸 수 있다 (위에서 이미 길이를 봤다)
    if (!crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) return null;
    return { category, regNo };
}

/**
 * 그 토큰을 여는 주소.
 * 도메인을 코드에 박지 않는다 — 프리뷰 배포에서도 자기 주소가 나와야 한다.
 * 로컬에서는 앱(5173)과 함수(3000)의 포트가 달라, PUBLIC_BASE_URL 로 앱 쪽을 일러 준다.
 */
export function replyUrlFor(req, token) {
    if (!token) return '';
    const base = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    if (base) return `${base}/r/${token}`;
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    return `${proto}://${req.headers.host}/r/${token}`;
}
