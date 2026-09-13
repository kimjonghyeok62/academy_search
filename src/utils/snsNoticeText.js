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
import { sortCourses } from './generateTuitionPDF';
import { feeRange } from './tuitionCompareWindow';

// ── 담당자가 고치는 자리 ────────────────────────────────
// 문구를 바꿀 일이 생기면 아래 상수만 고치면 된다. 조립하는 코드는 손대지 않아도 된다.

export const SENDER = '하남교육지원센터';
export const SUBJECT = '학원 온라인 게시 표시 안내';

// 조문 번호. 법제처 본문으로 확인한 값이다 — 제15조 제3항이 '학습자를 모집할 목적으로
// 인쇄물·인터넷 등을 통하여 광고를 하는 경우' 의 표시 의무 조항이고, 같은 항이 학원은
// 등록증명서, 교습소는 신고증명서라고 나눠 적는다. 아래 {번호}·{기관} 이 그 구분이다.
// 조문을 고칠 일이 생기면 반드시 법문을 다시 보고 고칠 것 —
// 틀린 조문 하나가 안내문 전체의 신뢰를 깎는다.
//
// {번호} 는 학원이면 '등록번호', 교습소면 '신고번호' 로, {기관} 은 '학원' / '교습소' 로
// 바뀐다. 교습소는 등록이 아니라 신고라서, 한 글자 틀린 안내문을 314곳에 보내지 않으려면
// 이 자리를 비워 두어야 한다.
export const LEGAL_LINE =
    '「학원법」 제15조 제3항에 따라 {기관} 광고물에는 {번호}와 교습비등을 표시하여야 합니다. (명칭도 교육청에 등록된 명칭으로)';

/** 문구 속 {번호}·{기관} 을 그 학원의 말로 바꾼다 */
const fill = (text, numberLabel, kindLabel) =>
    String(text).split('{번호}').join(numberLabel).split('{기관}').join(kindLabel);

// 3번(인터넷광고 링크) 끝에 붙는 줄. 우리가 본 것은 플레이스에 링크가 걸린 매체뿐이라
// 나머지는 학원이 직접 봐야 한다 — 그래서 목록의 마지막 항목으로 둔다.
export const TAIL_LINE = '· 이 외에 인스타, 카페, 당근 등도 살펴보세요';

// 3번의 플레이스 주소 바로 아래에 붙는 줄 — 플레이스 어느 탭에 무엇을 올리는지와 고치는 법.
// 주소 뒤에 괄호를 붙이지 않는다 — 휴대폰이 ')' 까지 링크로 잡아 열리지 않는다.
export const PLACE_HOWTO_LINE =
    '  [홈] 교습비 이미지, [정보] 등록번호, (수정방법) https://new.smartplace.naver.com/help/guide?menu=edit';

// 2번(신고된 교습비 확인방법) 의 두 줄 — 어디서 확인하는지, 어떻게 뽑는지.
//
// '교습비를 표시하라' 고만 하면 학원은 그 값을 어디서 보는지 모른다. 교습비는 학원이
// 신고한 값이라 나이스에서 직접 보게 한다. 번호는 문자 머리의 '(등록 제N호)' 가 이미 말한다.
//
// 게시표는 참고 자료다 — 길이가 넘치면 가장 먼저 덜어낸다. 예전에는 학원별 주소(/g/<토큰>)를
// 실었는데 유효기간이 10일이라, 문자를 묵혔다 여는 학원에게는 열리지 않는 링크가 됐다.
// 여기 주소는 모든 학원이 같고 기한이 없어 언제 열어도 열린다.
export const PRICE_TOOL_URL = 'https://hakwon-price.vercel.app/';
export const NEIS_URL = 'https://hakwon.neis.go.kr/nxui/index.html';
export const NEIS_LINE = `· 신고된 교습비 : ${NEIS_URL}`;
export const FORM_LINE = `· 출력 도움 : ${PRICE_TOOL_URL} (JPG, HWPX 등)`;

// 길이가 넘쳐 매체를 몇 개 덜어냈을 때만 붙인다. 3번 목록의 한 줄로 들어간다 —
// 문자 맨 아래 '문의' 뒤에 두면, 1번에는 일곱 곳이 적혀 있는데 3번에는 세 곳뿐인 것을
// 학원이 먼저 보고 '왜 빠졌나' 를 묻게 된다. 빠진 자리에서 말해야 한다.
export const TRIMMED_LINE = '· 위에 적지 못한 매체는 직접 확인 부탁드립니다';

export const DEFAULT_TEL = '02-480-5144';
export const DEFAULT_DAYS = 5;
export const DEFAULT_GUIDE_URL = 'https://buly.kr/BpHq2UV';
// 예전 기본값. 설정을 한 번이라도 저장한 브라우저에는 이 긴 주소가 남아 있어,
// 기본값을 바꿔도 그 담당자의 문자에는 옛 주소가 나간다 — 읽을 때 새 주소로 바꿔 준다.
const OLD_GUIDE_URL =
    'https://www.goegh.kr/goegh/na/ntt/selectNttInfo.do?mi=8747&bbsId=5083&nttSn=1167255';

// LMS 한도. 넘으면 문자마당이 받아 주지 않는다.
export const LMS_LIMIT = 2000;

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
        guideUrl: saved.guideUrl === OLD_GUIDE_URL ? DEFAULT_GUIDE_URL : (saved.guideUrl ?? DEFAULT_GUIDE_URL),
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
    // 무엇이 문제인지를 머리에 적으면 꼬리에서 되풀이할 것이 없다
    return ['지금 광고 중인 금액 — 신고하신 교습비와 다릅니다', ...lines,
        '신고한 금액으로 고치시거나, 교습비가 바뀌었다면 먼저 신고해 주세요.'];
}

/**
 * 문구를 조립한다. keep 이 있으면 그 매체들만 3번(광고 링크) 에 싣는다
 * (길이가 넘쳐 덜어낸 경우 — buildNoticeSms 가 두 번째로 부를 때 쓴다).
 *
 * 문자는 번호 붙인 세 토막이다 — 1 무엇이 빠졌나 / 2 어떻게 고치나 / 3 우리가 본 곳.
 * 학원이 전화로 물어올 때 '2번 보세요' 로 짚어 줄 수 있어야 하므로
 * 번호는 내용이 적어도 건너뛰지 않는다 (3번은 링크를 못 찾아도 머리와 마지막 줄은 남긴다).
 */
function compose(target, result, academy, opts, keep, withForm) {
    const { tel, days, guideUrl } = opts;
    const isHagwonso = String(target.category || '').includes('교습소');
    const numberLabel = isHagwonso ? '신고번호' : '등록번호';
    // 학원에게는 '귀 학원', 교습소에게는 '귀 교습소' 라고 불러야 한다. 314곳에 남의
    // 이름으로 말하면, 정작 고치라는 말보다 그 한 글자가 먼저 눈에 띈다.
    const kindLabel = isHagwonso ? '교습소' : '학원';
    const regLabel = `${isHagwonso ? '신고' : '등록'} 제${target.regNo}호`;
    const say = (line) => fill(line, numberLabel, kindLabel);

    const items = noticeItems(result);
    const order = [];
    items.forEach(({ bucket }) => { if (!order.includes(bucket)) order.push(bucket); });
    const shown = keep ? order.filter((b) => keep.includes(b)) : order;

    const urls = bucketUrls(result);
    const range = feeRange(sortCourses(academy?.courses || []));

    const L = [];
    L.push(`[${SENDER}] ${SUBJECT}`, '');
    L.push(`${target.name} (${regLabel})`, '');

    // ── 1. 무엇을 확인하나 ──────────────────────────────
    // '확인되지 않았습니다' 라고 단정하지 않고 '확인해 보시라' 고 권한다. 자동 조사가
    // 놓친 곳에 단정해 보내면 학원은 되묻고, 담당자가 전화를 한 번 더 받는다.
    L.push(`1. 귀 ${kindLabel} 온라인 광고에서 다음을 확인해 보시기 바랍니다.`);
    // 한 매체의 항목은 한 줄로 묶는다 ('· 네이버플레이스 : 등록번호 및 교습비').
    // 따로 서면 매체가 넷일 때 여덟 줄이 되어 '몇 군데를 손봐야 하는가' 가 안 보인다.
    // 없음·다름을 가르지 않는다 — 금액이 다른 곳은 아래 '지금 광고 중인 금액' 이 따로 말한다.
    const byBucket = new Map();
    items.forEach(({ bucket, field }) => {
        if (!byBucket.has(bucket)) byBucket.set(bucket, []);
        const label = field === '번호' ? numberLabel : field;
        if (!byBucket.get(bucket).includes(label)) byBucket.get(bucket).push(label);
    });
    byBucket.forEach((fields, bucket) => {
        L.push(`· ${CHANNEL_NAME[bucket]} : ${fields.join(' 및 ')}`);
    });
    // '위 N개 사항이 모두 표시될 수 있도록' 은 바로 위 목록을 세어 되읊는 줄이었다.
    // 무엇을 해야 하는지는 목록이 이미 말하고, 언제까지인지는 3번 아래 기한이 말한다.
    L.push('');

    // 근거를 말한 자리에 그 근거를 볼 곳을 함께 둔다. 3번에 두면 학원의 광고 주소와
    // 섞여 '우리 것' 처럼 보인다 — 성격이 다른 링크다.
    // 안내문 주소는 짧은 주소라 근거 문장 끝에 이어 붙인다.
    L.push(guideUrl ? `${say(LEGAL_LINE)} 교육지원청 안내문 : ${guideUrl}` : say(LEGAL_LINE));
    L.push('');

    // ── 2. 신고된 교습비 확인방법 ───────────────────────
    // 번호 다음에 빈 줄을 두지 않는다 (3번도 그렇다) — 머리와 목록은 한 덩어리다.
    //
    // 매체마다 '어디에 어떻게 적는지' 를 여기 늘어놓지 않는다. 매체가 일곱인 학원은
    // 그것만 일곱 줄이고, 정작 학원이 알아야 할 '내가 신고한 교습비가 얼마인지' 가 묻혔다.
    L.push('2. 신고된 교습비 확인방법');
    L.push(say(NEIS_LINE));
    if (withForm) L.push(FORM_LINE);
    L.push('');

    // 과정별 금액은 문자에 싣지 않는다 — 과정이 열둘인 학원은 그것만 열두 줄이고,
    // 그 목록이 하던 일(무엇을 얼마로 올려야 하는가)은 2번의 나이스 주소가 대신한다.
    // 여기서는 범위 한 줄로 '어느 만큼인지' 만 짚어 준다.
    // 마스터에 교습과정이 없는 곳은 이 줄도 뺀다 (없는 값을 넣어 말하지는 않는다).
    if (range) {
        L.push(`신고하신 월 교습비는 ${range}입니다.`);
        L.push('게시하신 금액이 이와 같은지도 함께 확인해 주세요.', '');
    }

    // 신고한 것 바로 아래에 지금 올라와 있는 것을 둔다 — 두 목록이 붙어 있어야
    // 어디가 어긋났는지 학원이 스스로 짚는다. 길이가 넘쳐도 이건 덜어내지 않는다
    // (몇 줄뿐이고, 1번에 적은 '다름' 이 무슨 말인지 설명하는 자리다).
    const ad = adBlock(result);
    if (ad.length) L.push(...ad, '');

    // ── 3. 우리가 본 곳 ────────────────────────────────
    // 링크를 하나도 못 찾았어도 머리는 남긴다. 번호를 건너뛰면 2번 다음이 끝이 되어
    // 전화로 '3번 보세요' 라고 짚어 줄 수가 없다. 마지막 줄만으로도 할 말은 있다.
    L.push(`3. 귀 ${kindLabel} 인터넷광고 링크`);
    shown.forEach((b) => {
        (urls[b] || []).forEach((u) => {
            L.push(`· ${CHANNEL_NAME[b]} : ${u}`);
            if (b === 'place') L.push(PLACE_HOWTO_LINE);
        });
    });
    // 길이 때문에 몇 곳을 덜어냈으면 그 사실을 이 목록 안에서 말한다
    if (keep) L.push(TRIMMED_LINE);
    L.push(TAIL_LINE, '');

    L.push(`${noticeDeadline(days)} 즈음에 다시 확인하도록 하겠습니다.`, '');

    L.push(`문의 : ${tel}`);

    return L.join('\n');
}

/**
 * 그 학원에 보낼 문자 문구. 빠진 것이 없으면 빈 문자열.
 *
 * LMS 한도를 넘으면 차례로 덜어낸다.
 *   ① 교습비 출력 도움 줄 (참고 자료다)
 *   ② 빠진 항목이 많은 매체 3곳만 3번(광고 링크) 에 남긴다
 * 덜어내는 차례는 급한 것을 뒤에 둔 것이다. 빠진 항목 목록(무엇을 고쳐야 하는지)은
 * 이 문자의 본론이라 어느 단계에서도 줄이지 않는다.
 */
export function buildNoticeSms(target, result, academy, opts) {
    if (!target || !noticeItems(result).length) return '';
    const o = { ...readNoticeSettings(), ...(opts || {}) };
    const keep = bucketsByWeight(noticeItems(result)).slice(0, TRIM_KEEP);

    // 덜어내는 차례대로 지어 보고, 한도 안에 드는 첫 번째를 쓴다
    const steps = [[null, true], [null, false], [keep, false]];
    let text = '';
    for (const [k, f] of steps) {
        text = compose(target, result, academy, o, k, f);
        if (smsBytes(text) <= LMS_LIMIT) return text;
    }
    return text;   // 다 덜어내도 넘치면 마지막 것을 낸다 (화면이 바이트 수로 알린다)
}
