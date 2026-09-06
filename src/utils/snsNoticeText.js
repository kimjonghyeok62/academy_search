// 미이행 학원에 보낼 안내 문자 문구.
//
// 학원마다 빠진 것이 다르다. 어떤 곳은 플레이스의 교습비만, 어떤 곳은 플레이스 번호와
// 블로그 교습비가 함께 빠져 있다. 일괄 문구를 보내면 학원은 자기 얘기로 읽지 않는다 —
// '우리 학원의 네이버플레이스에 등록번호가 없다' 고 꼭 집어 말해야 고치러 간다.
// 그 문장을 750번 사람이 지어낼 수는 없으므로 여기서 만든다.
//
// 판정(effectiveVerdict)은 교습비만 보지만 이 문구는 번호도 안내한다 — 판정은 우선순위를
// 가리는 잣대이고, 문구는 학원에 알려야 할 내용이라 축이 다르다.
//
// 값은 rowCells 에서 온다. 담당자가 직접 고친 파란 칸이 그대로 반영되므로,
// 화면에서 O 로 바꾼 칸이 문자에 '빠졌다'고 나가는 일이 없다.

import {
    rowCells, parseChannels, assignBuckets, currentPlaceUrl, noticeItems, DIFFERS,
} from './snsCheck';
import { sortCourses, parseNum } from './generateTuitionPDF';
import { feeRange } from './tuitionCompareWindow';

// ── 담당자가 고치는 자리 ────────────────────────────────
// 문구를 바꿀 일이 생기면 아래 상수만 고치면 된다. 조립하는 코드는 손대지 않아도 된다.

export const SENDER = '하남교육지원센터';
export const SUBJECT = '학원 온라인 게시 표시 안내';

// 조문 번호는 일부러 넣지 않았다. 틀린 조문 하나가 안내문 전체의 신뢰를 깎는다 —
// 담당자가 확인한 뒤 채워 넣을 것.
//
// {번호} 는 학원이면 '등록번호', 교습소면 '신고번호' 로 바뀐다. 교습소는 등록이 아니라
// 신고라서, 한 글자 틀린 안내문을 314곳에 보내지 않으려면 이 자리를 비워 두어야 한다.
export const LEGAL_LINE =
    '「학원의 설립·운영 및 과외교습에 관한 법률」에 따라 학원 광고물에는\n'
    + '{번호}와 교습비등을 표시하여야 합니다.';

/** 문구 속 {번호} 를 등록번호/신고번호로 바꾼다 */
const fill = (text, numberLabel) => String(text).split('{번호}').join(numberLabel);

export const TAIL_LINE = '이 외에도, 다른 모든 인터넷 매체(인스타그램, 카페 등)도 살펴보시기 바랍니다.';

// 회신 창구 안내. 주소(replyUrl)는 그 학원만 여는 것이라 부르는 쪽이 실어 준다.
// 길이가 넘쳐 덜어낼 때도 이 블록은 남긴다 — 이 문자를 보내는 목적이 여기에 있다.
// 없으면 담당자가 750곳을 다시 조사해야 누가 고쳤는지 알 수 있다.
export const REPLY_HEAD = '[수정하셨으면 알려 주세요]';
export const REPLY_LINE = '아래를 눌러 고치신 항목만 표시해 주시면 됩니다 (1분, 로그인 없음).';

// 길이가 넘쳐 매체를 몇 개 덜어냈을 때만 붙인다
export const TRIMMED_LINE = '그 밖의 매체는 직접 확인 부탁드립니다.';

export const DEFAULT_TEL = '02-480-5144';
export const DEFAULT_DAYS = 5;
export const DEFAULT_GUIDE_URL =
    'https://www.goegh.kr/goegh/na/ntt/selectNttInfo.do?mi=8747&bbsId=5083&nttSn=1167255';

// LMS 한도. 넘으면 문자마당이 받아 주지 않는다.
export const LMS_LIMIT = 2000;

// 문자에 싣는 교습과정 줄 수 상한. 과정이 스무 개인 학원 하나 때문에 문자가 통째로
// 잘리면 안 된다 — 넘는 만큼은 '외 N개 과정' 한 줄로 접는다.
export const COURSE_LINES = 8;

// 한 매체에 적어 보낼 '광고 중인 금액' 수 상한 (넘으면 '외 N건')
export const AD_FEES = 6;

// ── 담당자가 화면에서 정하는 값 ─────────────────────────
// 문의 전화·기한·안내 링크는 사람마다·시기마다 달라진다. 시트에 넣을 값은 아니고
// (학원별 값이 아니다) 행마다 prop 으로 실어 나르면 750행의 참조가 흔들려 표가 무거워진다.
// 그래서 브라우저에만 두고 모듈이 들고 있는다 — 행은 부를 때 이 함수만 부르면 된다.
const SETTINGS_KEY = 'sns_notice_v1';
let cached = null;

export function readNoticeSettings() {
    if (cached) return cached;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; }
    catch { /* 값이 깨졌으면 기본값으로 간다 */ }
    const days = Number(saved.days);
    cached = {
        tel: saved.tel || DEFAULT_TEL,
        days: Number.isFinite(days) && days >= 0 ? days : DEFAULT_DAYS,
        // 빈 문자열은 '링크를 빼겠다' 는 뜻이다 — 기본값으로 되돌리면 안 된다
        guideUrl: saved.guideUrl ?? DEFAULT_GUIDE_URL,
        // 교습과정 목록을 넣을지 — 기본은 넣는다. guideUrl 과 같은 이유로 !== false 로 읽는다
        // (?? 나 || 로 읽으면 담당자가 꺼 둔 false 가 기본값으로 되살아난다)
        courses: saved.courses !== false,
    };
    return cached;
}

export function writeNoticeSettings(next) {
    cached = { ...readNoticeSettings(), ...next };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cached)); }
    catch { /* 저장 못 해도 이번 화면에서는 동작한다 */ }
    return cached;
}
// 한도를 넘었을 때 남길 매체 수 (빠진 항목이 많은 곳부터)
const TRIM_KEEP = 3;

// 표의 BUCKET_LABEL 은 열이 좁아 줄인 이름이다 ('인스타'). 문자에는 온전한 이름을 쓴다.
const CHANNEL_NAME = {
    place: '네이버플레이스', blog: '블로그', homepage: '홈페이지',
    cafe: '카페', youtube: '유튜브', instagram: '인스타그램', etc: '그 밖의 매체',
};

// 매체별 고치는 방법. regLabel 은 '등록 제1042호' (교습소는 '신고 제N호').
const HOWTO = {
    place: (regLabel) => [
        '· 네이버플레이스 → 가격 정보에 교습비 등록(또는 가격표 이미지 첨부)',
        `  소개글에 '${regLabel}' 기재 (https://new.smartplace.naver.com/help/guide?menu=edit)`,
    ],
    blog: () => ['· 블로그 : 프로필·공지글에 {번호}, 별도 게시물에 교습비 등록'],
    homepage: () => ['· 홈페이지 : 첫 화면이나 학원 소개 쪽에 {번호}, 교습비 안내 쪽 추가'],
    cafe: () => ['· 카페 : 대문·공지글에 {번호}, 교습비는 별도 게시글로 등록'],
    youtube: () => ['· 유튜브 : 채널 정보(설명)에 {번호}, 교습비는 채널 설명이나 고정 게시물에 기재'],
    instagram: () => ['· 인스타그램 : 프로필 소개글에 {번호}, 교습비는 별도 게시물에 등록'],
    etc: () => ['· 그 밖의 매체 : 첫 화면·소개란에 {번호}와 교습비 기재'],
};

/**
 * 문구를 클립보드에 담는다.
 *
 * navigator.clipboard 는 권한·보안 맥락에 따라 조용히 거절한다. 그때 '복사 실패' 만
 * 띄우면 담당자는 문구를 꺼낼 길이 아예 없다 — 500곳을 도는 일이라 한 번의 막힘도 비싸다.
 * 그래서 옛 방식(execCommand)으로 한 번 더 시도한다.
 */
export async function copyNoticeSms(text) {
    try {
        if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
    } catch { /* 아래 옛 방식으로 다시 해 본다 */ }

    const ta = document.createElement('textarea');
    ta.value = text;
    // 화면 밖에 두되 readOnly 로 — 모바일에서 키보드가 올라오는 것을 막는다
    ta.readOnly = true;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('클립보드에 담지 못했습니다');
}

/**
 * EUC-KR 기준 바이트 수 — 문자 서비스가 길이를 세는 방식이다 (한글 2, 나머지 1).
 * UTF-8 로 세면 한글이 3바이트라 실제보다 길게 나와, 보낼 수 있는 문자를 못 보낸다고 막는다.
 */
export function smsBytes(text) {
    let n = 0;
    for (const ch of String(text || '')) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
    return n;
}

/** 오늘 + days → '2026. 9. 10.' */
export function noticeDeadline(days) {
    const d = new Date();
    d.setDate(d.getDate() + (Number(days) || 0));
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** 매체별 주소 — 플레이스는 조사에 실제로 쓴 곳, 나머지는 플레이스 홈에 걸린 링크 */
function bucketUrls(result) {
    const out = {};
    // 꼬리 '/home' 은 없어도 같은 곳이다 — 문자에서는 다섯 자가 아깝다.
    // 'https://' 는 남긴다. 떼면 휴대폰에 따라 링크로 잡히지 않는다.
    const place = String(currentPlaceUrl(result) || '').replace(/\/home$/, '');
    if (place) out.place = [place];

    const chs = parseChannels(result);
    const at = assignBuckets(chs);
    chs.forEach((c, i) => {
        if (!c.url) return;
        (out[at[i]] = out[at[i]] || []).push(c.url);
    });
    return out;
}

/** 빠진 항목이 많은 매체부터 — 같으면 표의 열 순서를 지킨다 */
function bucketsByWeight(items) {
    const order = [];
    const count = {};
    items.forEach(({ bucket }) => {
        if (!(bucket in count)) { count[bucket] = 0; order.push(bucket); }
        count[bucket]++;
    });
    return [...order].sort((a, b) => count[b] - count[a] || order.indexOf(a) - order.indexOf(b));
}

/**
 * [신고하신 교습과정] 블록 — '· 보통교과 / 초등수학 : 월 250,000원'.
 *
 * 범위 한 줄('25만원 ~ 35만원')만 보내면 학원은 어느 과정을 얼마로 신고했는지 몰라
 * 게시할 금액을 정하지 못한다. 앱은 통째로 로그인 뒤에 있어 학원에 링크를 걸어 줄 수
 * 없으므로 문자 본문에 적어 보낸다.
 *
 * 금액은 대조창·게시표와 같은 함수(parseNum)로 읽는다 — 같은 학원에 대고 화면과 문자가
 * 다른 금액을 말하면 어느 쪽이 맞는지 알 수 없다 (feeRange 를 함께 쓰는 이유와 같다).
 */
function courseBlock(academy) {
    const rows = sortCourses(academy?.courses || [])
        .map((c) => ({
            name: [c.process, c.subject].filter(Boolean).join(' / '),
            fee: parseNum(c.tuitionFee || c.totalFee),
        }))
        .filter((r) => r.name);
    if (!rows.length) return [];

    const L = ['[신고하신 교습과정]'];
    rows.slice(0, COURSE_LINES).forEach((r) => {
        // 금액을 빈칸으로 두면 무료로 읽는다 — 모르면 모른다고 적는다
        L.push(`· ${r.name} : ${r.fee > 0 ? `월 ${r.fee.toLocaleString('ko-KR')}원` : '월 금액 미상'}`);
    });
    if (rows.length > COURSE_LINES) L.push(`· 외 ${rows.length - COURSE_LINES}개 과정`);
    return L;
}

/**
 * 조사할 때 플레이스에서 읽어 둔 금액.
 *
 * 시트에 따로 열을 두지 않고 '플레이스_게시형태' 꼬리에 '· 적힌 금액 260,000·300,000' 으로
 * 붙여 둔 값이다 (naverProbe 의 wonList). 열을 늘리려면 Apps Script 까지 손대야 해서
 * 그렇게 남겼고, 여기서는 그 꼬리를 도로 숫자로 되돌린다.
 */
const PLACE_FEE_MARK = '적힌 금액 ';
function placeAdFees(result) {
    const s = String(result?.플레이스_게시형태 || '');
    const i = s.indexOf(PLACE_FEE_MARK);
    if (i < 0) return [];
    return s.slice(i + PLACE_FEE_MARK.length).split('·')
        .map((t) => Number(String(t).replace(/[^0-9]/g, '')))
        .filter((n) => n > 0);
}

/** 매체별로 '지금 올라와 있는 금액' — 플레이스는 게시형태 꼬리에, 나머지는 채널상세의 기재금액에 있다 */
function adFees(result) {
    const out = {};
    const place = placeAdFees(result);
    if (place.length) out.place = place;

    const chs = parseChannels(result);
    const at = assignBuckets(chs);
    chs.forEach((c, i) => {
        const nums = String(c.기재금액 || '').split(',').map((n) => Number(n)).filter((n) => n > 0);
        if (!nums.length) return;
        out[at[i]] = [...new Set([...(out[at[i]] || []), ...nums])].sort((x, y) => x - y);
    });
    return out;
}

/**
 * [현재 광고 중인 교습비] 블록 — '· 네이버플레이스 : 260,000원 · 300,000원'.
 *
 * 금액이 다른(△) 매체만 싣는다. 학원이 알아야 하는 것은 '무엇을 고쳐야 하는가' 이고,
 * 신고액과 같은 금액을 되읊어 주는 것은 그 말을 흐릴 뿐이다. △ 는 자동 조사가
 * '읽어낸 금액 중 신고액과 같은 것이 하나도 없다' 고 본 경우다(naverProbe 의 compareFees).
 *
 * 과정 이름은 넣지 않는다 — 조사 때 남기는 것은 숫자뿐이고, 이름까지 읽으려면 그때마다
 * 네이버를 다시 열어야 한다(대조창의 ③ 카드가 하는 일). 750곳에 보낼 문자를 짓느라
 * 할 일은 아니다.
 */
function adBlock(result) {
    const by = adFees(result);
    const lines = rowCells(result)
        .filter((c) => c.field === '교습비' && c.value === DIFFERS)
        .map((c) => ({ bucket: c.bucket, nums: by[c.bucket] || [] }))
        .filter((x) => x.nums.length)
        .map(({ bucket, nums }) => {
            const shown = nums.slice(0, AD_FEES);
            const list = shown.map((n) => `${n.toLocaleString('ko-KR')}원`).join(' · ')
                + (nums.length > shown.length ? ` 외 ${nums.length - shown.length}건` : '');
            return `· ${CHANNEL_NAME[bucket]} : ${list}`;
        });
    if (!lines.length) return [];
    return ['[현재 광고 중인 교습비]', ...lines,
        '위 금액은 신고하신 교습비와 다릅니다 — 신고한 금액으로 고치시거나, 교습비가 바뀌었다면 먼저 신고해 주세요.'];
}

/**
 * 문구를 조립한다. keep 이 있으면 그 매체들만 [수정 방법]·[관련링크] 에 싣는다
 * (길이가 넘쳐 덜어낸 경우 — buildNoticeSms 가 두 번째로 부를 때 쓴다).
 * withCourses 가 거짓이면 교습과정 목록을 뺀다 (담당자가 꺼 두었거나, 그래도 길이가 넘칠 때).
 */
function compose(target, result, academy, opts, keep, withCourses) {
    const { tel, days, guideUrl, replyUrl } = opts;
    const isHagwonso = String(target.category || '').includes('교습소');
    const numberLabel = isHagwonso ? '신고번호' : '등록번호';
    const regLabel = `${isHagwonso ? '신고' : '등록'} 제${target.regNo}호`;

    const items = noticeItems(result);
    const order = [];
    items.forEach(({ bucket }) => { if (!order.includes(bucket)) order.push(bucket); });
    const shown = keep ? order.filter((b) => keep.includes(b)) : order;

    const urls = bucketUrls(result);
    const range = feeRange(sortCourses(academy?.courses || []));

    const L = [];
    L.push(`[${SENDER}] ${SUBJECT}`, '');
    L.push(`${target.name} (${regLabel})`, '');

    // 다른 것이 하나라도 있으면 머리말도 그렇게 말해야 한다 — 올려 둔 것을 두고
    // '확인되지 않았다' 고 하면 학원은 되묻고, 담당자가 전화를 한 번 더 받는다.
    L.push(items.some((it) => it.differs)
        ? '아래 광고물에서 다음이 확인되지 않았거나, 신고하신 내용과 다릅니다.'
        : '아래 광고물에서 다음이 확인되지 않았습니다.');
    items.forEach(({ bucket, field, differs }, i) => {
        const what = field === '번호' ? numberLabel : field;
        const tail = differs ? (field === '번호' ? ' (적힌 번호가 다름)' : ' (교습비 금액이 다름)') : '';
        L.push(`${i + 1}. ${CHANNEL_NAME[bucket]} : ${what}${tail}`);
    });
    L.push('');

    L.push(fill(LEGAL_LINE, numberLabel), '');

    L.push('[수정 방법]');
    shown.forEach((b) => { HOWTO[b](regLabel).forEach((line) => L.push(fill(line, numberLabel))); });
    L.push('');

    // 마스터에 교습과정이 없는 학원은 신고 금액을 모른다 — 없는 값을 넣어 말하지 않는다
    if (range) {
        L.push(`신고하신 월 교습비는 ${range}입니다.`);
        L.push('게시하신 금액이 이와 같은지도 함께 확인해 주세요.', '');
    }

    // 범위 뒤에 과정별 금액을 붙인다. 범위는 요약이고 이 목록은 명세라 쓰임이 다르다 —
    // 학원이 무엇을 얼마로 올려야 하는지는 이 목록을 봐야 안다.
    if (withCourses) {
        const block = courseBlock(academy);
        if (block.length) L.push(...block, '');
    }

    // 신고한 것 바로 아래에 지금 올라와 있는 것을 둔다 — 두 목록이 붙어 있어야
    // 어디가 어긋났는지 학원이 스스로 짚는다. 길이가 넘쳐도 이건 덜어내지 않는다
    // (몇 줄뿐이고, 위에 적은 '금액이 다름' 이 무슨 말인지 설명하는 자리다).
    const ad = adBlock(result);
    if (ad.length) L.push(...ad, '');

    L.push(`${noticeDeadline(days)}까지 수정 부탁드리며, 이후 담당자가 다시 확인합니다.`);
    L.push(TAIL_LINE, '');

    // 주소를 못 받아왔으면 블록을 통째로 뺀다 — 안내는 나가야 하고, 빈 링크는 없느니만 못하다
    if (replyUrl) L.push(REPLY_HEAD, REPLY_LINE, replyUrl, '');

    L.push('[관련링크]');
    shown.forEach((b) => {
        (urls[b] || []).forEach((u) => L.push(`· ${CHANNEL_NAME[b]} : ${u}`));
    });
    if (guideUrl) L.push(`· 교육지원청 게시 안내 : ${guideUrl}`);
    L.push('');

    L.push(`문의 : ${tel}`);
    if (keep) L.push('', TRIMMED_LINE);

    return L.join('\n');
}

/**
 * 그 학원에 보낼 문자 문구. 빠진 것이 없으면 빈 문자열.
 *
 * LMS 한도를 넘으면 두 번에 걸쳐 덜어낸다.
 *   ① 빠진 항목이 많은 매체 3곳만 [수정 방법]·[관련링크] 에 남긴다
 *   ② 그래도 넘치면 교습과정 목록까지 뺀다
 * 덜어내는 차례는 급한 것을 뒤에 둔 것이다 — 교습과정은 참고 자료이지만 '무엇을 고쳐야
 * 하는지'는 이 문자의 본론이라, 목록(무엇이 빠졌는지)은 어느 단계에서도 줄이지 않는다.
 */
export function buildNoticeSms(target, result, academy, opts) {
    if (!target || !noticeItems(result).length) return '';
    const o = { ...readNoticeSettings(), ...(opts || {}) };
    const withCourses = o.courses !== false;

    const full = compose(target, result, academy, o, null, withCourses);
    if (smsBytes(full) <= LMS_LIMIT) return full;

    const keep = bucketsByWeight(noticeItems(result)).slice(0, TRIM_KEEP);
    const trimmed = compose(target, result, academy, o, keep, withCourses);
    if (!withCourses || smsBytes(trimmed) <= LMS_LIMIT) return trimmed;

    return compose(target, result, academy, o, keep, false);
}
