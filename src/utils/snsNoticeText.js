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
    rowCells, parseChannels, assignBuckets, currentPlaceUrl, DIFFERS,
} from './snsCheck';
import { sortCourses } from './generateTuitionPDF';
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

// 길이가 넘쳐 매체를 몇 개 덜어냈을 때만 붙인다
export const TRIMMED_LINE = '그 밖의 매체는 직접 확인 부탁드립니다.';

export const DEFAULT_TEL = '02-480-5144';
export const DEFAULT_DAYS = 5;
export const DEFAULT_GUIDE_URL =
    'https://www.goegh.kr/goegh/na/ntt/selectNttInfo.do?mi=8747&bbsId=5083&nttSn=1167255';

// LMS 한도. 넘으면 문자마당이 받아 주지 않는다.
export const LMS_LIMIT = 2000;

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

/**
 * 그 학원에서 고쳐야 할 칸 — [{ bucket, field, differs }], 표의 열 순서 그대로.
 *
 * 빠진 것(X)과 다른 것(△)을 함께 싣되 구분해 둔다. 학원 입장에서는 전혀 다른 말이다 —
 * 없는 것은 올리라는 말이고, 다른 것은 이미 올린 것을 고치라는 말이다. 이걸 뭉뚱그려
 * '확인되지 않았습니다' 라고 보내면, 올려 둔 학원은 무슨 소린가 하고 되묻는다.
 *
 * 인스타그램을 따로 빼지 않는다. 자동 조사는 인스타를 '안함' 으로 두므로 여기 걸릴 일이
 * 없고, 담당자가 직접 X 로 바꿔 둔 곳은 눈으로 보고 판단한 것이라 알려야 한다.
 */
export function noticeItems(result) {
    if (!result) return [];
    return rowCells(result)
        .filter((c) => c.value === 'X' || c.value === DIFFERS)
        .map((c) => ({ bucket: c.bucket, field: c.field, differs: c.value === DIFFERS }));
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
 * 문구를 조립한다. keep 이 있으면 그 매체들만 [수정 방법]·[관련링크] 에 싣는다
 * (길이가 넘쳐 덜어낸 경우 — buildNoticeSms 가 두 번째로 부를 때 쓴다).
 */
function compose(target, result, academy, opts, keep) {
    const { tel, days, guideUrl } = opts;
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

    L.push(`${noticeDeadline(days)}까지 수정 부탁드리며, 이후 담당자가 다시 확인합니다.`);
    L.push(TAIL_LINE, '');

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
 * LMS 한도를 넘으면 빠진 항목이 많은 매체 3곳만 [수정 방법]·[관련링크] 에 남기고
 * 나머지는 덜어낸다 — 목록(무엇이 빠졌는지)은 그대로 둔다. 그건 이 문자의 본론이라
 * 줄이면 학원이 무엇을 고쳐야 하는지 알 수 없게 된다.
 */
export function buildNoticeSms(target, result, academy, opts) {
    if (!target || !noticeItems(result).length) return '';
    const o = { ...readNoticeSettings(), ...(opts || {}) };
    const full = compose(target, result, academy, o, null);
    if (smsBytes(full) <= LMS_LIMIT) return full;

    const keep = bucketsByWeight(noticeItems(result)).slice(0, TRIM_KEEP);
    return compose(target, result, academy, o, keep);
}
