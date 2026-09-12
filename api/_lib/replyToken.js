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

// 게시표(/g/)만 만료된다. 학원의 신고 내용(교습과정·금액)이 보이는 자리라 주소가 언제까지나
// 살아 있을 이유가 없다. 회신(/r/)은 만료시키지 않는다 — 기한이 지난 뒤라도 고쳤다고
// 알려 오는 편이 담당자에게 이롭기 때문이다(늦었다는 사실은 발송일시와 회신일시가 말한다).
//
// 이 주소는 이제 문자에 싣지 않는다 (문자는 hakwon-price 로 안내한다). 담당자가 눌러 보는
// 확인용과, 학원이 회신 화면에서 들어오는 길로 남아 있다.
export const FORM_TTL_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 오늘이 며칠째인가 (1970-01-01 부터). 시각은 버린다 — 날짜 단위로만 세면 충분하다 */
export const today = () => Math.floor(Date.now() / DAY_MS);

export const replySecret = () => String(process.env.SNS_REPLY_SECRET || '').trim();

/**
 * 서명 6자 — 6바이트를 36진수로 접는다 (2^48 이라 자바스크립트 정수 범위 안이다).
 * stamp 가 있으면 함께 서명한다. 날짜를 서명 밖에 두면 학원이 주소의 날짜만 고쳐
 * 만료를 지나칠 수 있다.
 */
function sign(code, regNo, secret, stamp = '') {
    const msg = stamp ? `${code}|${regNo}|${stamp}` : `${code}|${regNo}`;
    const raw = crypto.createHmac('sha256', secret).update(msg).digest();
    return (raw.readUIntBE(0, 6) % SIG_SPACE).toString(36).padStart(SIG_LEN, '0');
}

/**
 * 학원 하나를 가리키는 토큰. 만들 수 없으면 빈 문자열 (부르는 쪽이 링크를 빼면 된다).
 * 가운데 토막이 낸 날이다 — a1050-fvo-7bp7c2.
 */
export function signReplyToken(category, regNo) {
    const secret = replySecret();
    const code = CODE[String(category || '').trim()];
    const no = String(regNo || '').trim();
    if (!secret || !code || !no) return '';
    const stamp = today().toString(36);
    return `${code}${no}-${stamp}-${sign(code, no, secret, stamp)}`;
}

/**
 * 토큰 → { category, regNo, issuedDay }. 서명이 안 맞으면 null.
 * issuedDay 가 null 이면 날짜 없이 만든 옛 토큰이다 — 이미 내보낸 문자가 죽지 않게
 * 그대로 받아 준다(만료도 걸리지 않는다).
 */
export function verifyReplyToken(token) {
    const secret = replySecret();
    const s = String(token || '').trim();
    if (!secret || !s) return null;

    // 등록번호에 '-' 가 섞여 있어도 되도록 마지막 '-' 를 구분자로 본다
    const cut = s.lastIndexOf('-');
    if (cut < 2) return null;
    let head = s.slice(0, cut);
    const got = s.slice(cut + 1);
    if (got.length !== SIG_LEN) return null;

    // 가운데 토막이 있으면 낸 날이다
    let stamp = '';
    const cut2 = head.lastIndexOf('-');
    if (cut2 > 0) {
        stamp = head.slice(cut2 + 1);
        head = head.slice(0, cut2);
        if (!/^[0-9a-z]{1,8}$/.test(stamp)) return null;
    }

    const category = CATEGORY[head[0]];
    const regNo = head.slice(1);
    if (!category || !regNo) return null;

    const want = sign(head[0], regNo, secret, stamp);
    // 길이가 같을 때만 timingSafeEqual 을 쓸 수 있다 (위에서 이미 길이를 봤다)
    if (!crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) return null;
    return { category, regNo, issuedDay: stamp ? parseInt(stamp, 36) : null };
}

/** 게시표 주소의 유효기간이 지났나 (날짜 없이 만든 옛 토큰은 지나지 않는다) */
export function formExpired(who) {
    if (!who || who.issuedDay == null) return false;
    return today() - who.issuedDay > FORM_TTL_DAYS;
}

/**
 * 그 토큰을 여는 주소. seg 는 어느 화면인지 — 'r' 회신, 'g' 교습비 게시표 예시.
 * 도메인을 코드에 박지 않는다 — 프리뷰 배포에서도 자기 주소가 나와야 한다.
 * 로컬에서는 앱(5173)과 함수(3000)의 포트가 달라, PUBLIC_BASE_URL 로 앱 쪽을 일러 준다.
 */
export function replyUrlFor(req, token, seg = 'r') {
    if (!token) return '';
    const base = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    if (base) return `${base}/${seg}/${token}`;
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    return `${proto}://${req.headers.host}/${seg}/${token}`;
}
