// 네이버플레이스·블로그 교습비/등록(신고)번호 게시점검 — 프론트 유틸
//
// 조사는 /api/sns-probe (서버) 가 수행하고, 결과 저장·조회는
// /api/apps-script-proxy 를 통해 구글시트 'SNS게시점검' 탭에 한다.

const PROBE_BATCH = 4;    // api/sns-probe.js 의 MAX_BATCH 와 맞출 것
const SAVE_BATCH = 60;    // 한 번에 저장할 레코드 수

// ── 계산 캐시 ───────────────────────────────────────────
// 결과 객체는 불변이다 — 값이 바뀌면 { ...result } 로 새 객체가 만들어진다.
// 그래서 객체 자체를 키로 삼으면 무효화가 저절로 된다 (바뀐 행만 다시 계산한다).
// 칸 하나를 눌렀을 때 750행이 통째로 JSON.parse 를 다시 돌던 것이 이 캐시로 사라진다.
//
// 여기 담긴 값은 여러 곳이 함께 쓴다 — 받은 쪽에서 절대 고치면 안 된다 (읽기 전용).
const memo = new WeakMap();
function cached(obj, field, compute) {
    // null·문자열처럼 키로 쓸 수 없는 값은 그냥 계산한다
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return compute();
    let box = memo.get(obj);
    if (!box) { box = {}; memo.set(obj, box); }
    if (!(field in box)) box[field] = compute();
    return box[field];
}

// 시트 헤더 (Apps Script 의 SNS_HEADERS 와 순서·이름이 일치해야 함)
// '연락처' 는 조사 결과에 없다 — Apps Script 가 마스터의 핸드폰에서 채우므로 여기서 보내지 않는다.
export const SNS_COLUMNS = [
    '확인일시', '구분', '등록번호', '학원명', '연락처', '매칭상태', '매칭점수',
    '플레이스ID', '플레이스명', '플레이스URL',
    '플레이스_교습비', '플레이스_게시형태', '플레이스_번호', '플레이스_기재번호', '플레이스_번호대조',
    '블로그', '블로그URL', '블로그_교습비', '블로그_번호', '블로그_기재번호', '블로그_번호대조',
    '판정', '미이행사유', '비고',
    // 담당자가 직접 확인해 고친 칸 — {"place|교습비":"O", ...} JSON 문자열
    '수동확인',
    // 플레이스 홈에 걸린 링크(블로그·홈페이지·인스타그램…) 전체 결과 — JSON 문자열
    '채널수', '채널상세',
    // 담당자가 직접 지정한 플레이스 ID (이름만으로는 1호점·2호점을 가려내지 못하는 곳이 있다)
    '플레이스지정',
    // 여러 학원이 블로그·플레이스 하나를 함께 쓰는 곳의 묶음 이름 (예: '페르마')
    '묶음',
    // 담당자가 진행사항·특이사항을 적는 칸 (MEMO_MAX 자). 지우기는 MEMO_CLEARED 로 보낸다
    '적요',
];

// 결과·시트 행 양쪽에서 같은 키를 그대로 옮기는 항목
const PASSTHROUGH = [
    '플레이스ID', '플레이스명', '플레이스URL', '플레이스_교습비', '플레이스_게시형태', '플레이스_번호',
    '플레이스_기재번호', '플레이스_번호대조', '블로그', '블로그URL', '블로그_교습비',
    '블로그_번호', '블로그_기재번호', '블로그_번호대조', '판정', '미이행사유', '채널수', '채널상세',
    // 조사 결과에는 없다. 화면에서 고친 값을 그대로 실어 보내야 시트에 남는다
    // (빈 값으로 가면 Apps Script 가 기존 값을 지키므로 자동 조사가 덮어쓰지 않는다)
    '수동확인', '플레이스지정', '묶음', '적요',
];

/**
 * 채널상세(JSON 문자열) → 배열.
 * 이 컬럼이 생기기 전에 저장된 행에는 블로그 결과만 있으므로, 그 값으로 채널 1건을 만들어 준다.
 */
export function parseChannels(result) {
    return cached(result, 'channels', () => rawParseChannels(result));
}

function rawParseChannels(result) {
    if (!result) return [];
    let list = [];
    try {
        const v = JSON.parse(result.채널상세 || '[]');
        if (Array.isArray(v)) list = v;
    } catch { /* 형식이 깨졌으면 아래 예전 형식으로 대체 */ }
    if (list.length || result.블로그 !== '있음' || !result.블로그URL) return list;
    return [{
        유형: '네이버블로그', 종류: 'blog', url: result.블로그URL,
        교습비: result.블로그_교습비, 번호: result.블로그_번호,
        번호대조: result.블로그_번호대조, 기재번호: result.블로그_기재번호,
        조사범위: '최근 글·사이드바', 비고: '', 소개글: '',
    }];
}

// 표의 채널 열 (순서가 곧 표의 열 순서다)
export const BUCKETS = ['blog', 'homepage', 'cafe', 'youtube', 'instagram', 'etc'];
export const BUCKET_LABEL = {
    blog: '블로그', homepage: '홈페이지', cafe: '카페',
    youtube: '유튜브', instagram: '인스타', etc: '기타',
};

/**
 * 채널 하나가 어느 열에 들어가는지 정한다.
 * 카페·유튜브는 URL 호스트로만 가려낼 수 있다 — cafe.daum.net 이나 youtube.com 은
 * 종류가 'homepage' 로 잡히고, 유형(라벨)은 사업주가 붙인 값이라 믿을 수 없다.
 */
export function channelBucket(c) {
    if (c.종류 === 'blog') return 'blog';
    if (c.종류 === 'instagram') return 'instagram';
    let host = String(c.url || '').toLowerCase();
    try { host = new URL(c.url).hostname.toLowerCase(); } catch { /* 형식이 깨진 URL 은 문자열 그대로 본다 */ }
    if (/(^|\.)cafe\./.test(host)) return 'cafe';
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return 'youtube';
    return 'homepage';
}

/**
 * 채널 목록 → 각 채널이 들어갈 열 (입력과 같은 순서로 돌려준다).
 * 홈페이지가 여러 개면 첫 곳만 '홈페이지' 열에 두고 나머지는 '기타'로 모은다 —
 * 홈페이지 칸 하나에 여러 곳을 뭉쳐 놓으면 어느 곳이 X 인지 알 수 없기 때문이다.
 */
export function assignBuckets(channels) {
    return cached(channels, 'assign', () => rawAssignBuckets(channels));
}

function rawAssignBuckets(channels) {
    let homepageSeen = 0;
    return (channels || []).map((c) => {
        const b = channelBucket(c);
        if (b !== 'homepage') return b;
        return homepageSeen++ === 0 ? 'homepage' : 'etc';
    });
}

// 나쁜 순서 — 같은 종류 채널이 여러 개면 가장 나쁜 값 하나로 합쳐 보여준다
const CELL_RANK = { X: 0, '?': 1, O: 2 };
function worstCell(values) {
    let worst = null;
    for (const v of values) {
        if (CELL_RANK[v] === undefined) continue;
        if (worst === null || CELL_RANK[v] < CELL_RANK[worst]) worst = v;
    }
    return worst;
}

/**
 * 채널 목록 → 표의 블로그·홈페이지·카페 칸 값.
 * 링크가 없는 종류는 null 로 남겨 화면에서 '없음' 으로 표시한다.
 */
export function bucketCells(channels) {
    return cached(channels, 'cells', () => rawBucketCells(channels));
}

function rawBucketCells(channels) {
    const out = {};
    BUCKETS.forEach((b) => { out[b] = null; });
    const at = assignBuckets(channels);
    (channels || []).forEach((c, i) => {
        const b = at[i];
        if (!out[b]) out[b] = { 교습비: [], 번호: [], count: 0, notProbed: true };
        out[b].교습비.push(c.교습비);
        out[b].번호.push(c.번호);
        out[b].count++;
        if (c.번호대조 !== '조사안함') out[b].notProbed = false;
    });
    Object.keys(out).forEach((k) => {
        if (!out[k]) return;
        out[k] = {
            교습비: worstCell(out[k].교습비),
            번호: worstCell(out[k].번호),
            count: out[k].count,
            notProbed: out[k].notProbed,
        };
    });
    return out;
}

/**
 * 비고 — 표의 O/X 칸만 봐서는 알 수 없는 것만 적는다.
 * '교습비 미게시 / 번호 미기재' 는 이미 칸이 X 로 보여주므로 넣지 않고, URL 도 링크 열에 있으므로 뺀다.
 */
export function snsRemark(result, dupNames) {
    if (!result) return '';
    const notes = [];

    // 같은 플레이스를 여러 학원이 물고 있다 — 지점(1호점·2호점)을 잘못 잡았을 수 있다.
    // 한 행만 봐서는 알 수 없으므로 목록에서 계산해 넘겨준다.
    if (dupNames && dupNames.length) {
        notes.push(`⚠ ${dupNames.join('·')}와 같은 플레이스 — 확인 필요`);
    }

    // 담당자가 비고에 적어둔 주소가 실제로 쓰였는지 — 적어놨는데 조용히 무시되면 알 길이 없다
    const hint = remarkPlaceHint(result);
    if (hint.id || hint.url) {
        const wanted = hint.id || pinnedPlaceId(result);
        notes.push(wanted && String(result.플레이스ID || '') === wanted
            ? '📍 비고에 적은 플레이스로 조사함'
            : '⚠ 비고에 적은 주소를 쓰지 못했습니다 — 주소 확인 필요');
    }

    // 사람이 직접 보고 없다고 확인해 준 곳 — 자동 조사가 무엇을 물고 왔든 그 사실이 이긴다.
    // '이름이 달라 미확정' 같은 안내는 이제 틀린 말이므로 여기서 끊는다.
    // ('네이버플레이스 없음' 이라는 사실 자체는 바로 아래 줄이 날짜와 함께 보여주므로 여기 적지 않는다)
    if (isNoPlace(result)) return notes.join(' / ');

    // 후보를 하나도 못 찾은 것과, 찾긴 했는데 이름이 달라 확정을 못 한 것은 다른 상태다.
    // 후자를 '못 찾음'으로 적으면 담당자가 찾아볼 곳이 없다고 읽고 그냥 넘긴다.
    if (result.matchStatus === 'no_match') {
        notes.push(hasPlaceCandidate(result)
            ? '이름이 달라 동일 업체 미확정 — 맞는지 확인 필요'
            : '네이버플레이스 못 찾음');
    } else if (result.matchStatus === 'address') {
        // 이름으로는 못 찾고 주소(같은 건물 업체 목록)로 골라온 곳 — 자동으로 확정하지 않는다.
        // 어떤 근거로 고른 것인지 적어 줘야 담당자가 '맞음'을 누를지 판단할 수 있다.
        notes.push(`📍 주소로 찾은 후보${result.플레이스명 ? ` — ${result.플레이스명}` : ''} — 맞는지 확인 필요`);
    } else if (result.matchStatus === 'ambiguous') notes.push('동명 업체 가능성 — 직접 확인');
    else if (result.matchStatus === 'error') notes.push('조사 중 오류 — 다시 확인 필요');

    if (result.플레이스_번호대조 === '불일치') {
        notes.push(`플레이스 번호 오기재(${result.플레이스_기재번호} ≠ ${result.regNo})`);
    }

    const channels = parseChannels(result);
    const at = assignBuckets(channels);
    const counted = {};
    channels.forEach((c, i) => {
        const b = at[i];
        const name = BUCKET_LABEL[b];
        counted[b] = (counted[b] || 0) + 1;
        // 인스타그램은 자동 조사 대상이 아니다 — 링크 열에만 두고 비고에는 쓰지 않는다
        if (c.번호대조 === '조사안함') return;
        if (c.번호대조 === '확인불가') notes.push(`${name} 확인불가${c.비고 ? ` — ${c.비고}` : ''}`);
        else if (c.번호대조 === '불일치') notes.push(`${name} 번호 오기재(${c.기재번호} ≠ ${result.regNo})`);
    });

    // 같은 종류가 여러 곳이면 한 칸에 합쳐 보여준다는 사실을 알려준다
    // 한 칸에 여러 곳을 합쳐 보여주는 경우만 알려준다 (홈페이지 2번째부터는 '기타'로 따로 빠진다)
    Object.entries(counted).forEach(([b, n]) => {
        if (n > 1 && b !== 'instagram') notes.push(`${BUCKET_LABEL[b]} ${n}곳`);
    });

    return notes.join(' / ');
}

// ── 담당자가 직접 확인해 고친 칸 ────────────────────────
// 자동 판정이 X 인데 직접 보니 O 인 경우가 있다. 그 값을 시트에 따로 남겨
// 다시 조사해도 유지되게 한다. 키는 `${열}|${항목}` (예: 'place|교습비').

export function parseManual(result) {
    return cached(result, 'manual', () => rawParseManual(result));
}

function rawParseManual(result) {
    if (!result) return {};
    try {
        const v = JSON.parse(result.수동확인 || '{}');
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch { return {}; }
}

export const CELL_FIELDS = ['번호', '교습비'];
// 그 채널이 아예 없다는 뜻 — 자동값으로도(링크 없음), 직접 고른 값으로도 쓴다
export const NONE = '없음';
export const cellKey = (bucket, field) => `${bucket}|${field}`;

/**
 * 한 학원 행의 칸 값 — 표와 판정이 같은 값을 보도록 여기 한 곳에서 만든다.
 * auto 는 자동 조사값, value 는 직접 고친 값이 있으면 그것.
 *   'O'/'X'/'?' 판정값 · '없음' 링크 없음 · '안함' 자동 조사 대상 아님 · '' 아직 조사 전
 */
export function rowCells(result) {
    return cached(result, 'rowCells', () => rawRowCells(result));
}

function rawRowCells(result) {
    const manual = parseManual(result);
    const cells = bucketCells(parseChannels(result));
    // 후보 플레이스를 물고 온 경우에는 실제로 읽어 본 값이 있다 — '못 봤다'로 지우지 않는다.
    // (같은 곳인지 확정되지 않았다는 사실은 판정(확인불가)과 비고가 따로 알린다)
    // 사람이 '플레이스 없음'을 눌러 두었으면 물고 온 후보는 남의 업체다 — 그 값을 보여주면 안 된다
    const marked = isNoPlace(result);
    const noPlace = result && result.matchStatus === 'no_match' && !hasPlaceCandidate(result);
    const out = [];
    const push = (bucket, field, auto) => {
        const key = cellKey(bucket, field);
        out.push({ key, bucket, field, auto, manual: manual[key], value: manual[key] ?? auto });
    };

    // 플레이스를 못 찾은 것은 '없다'가 아니라 '못 봤다' — 이름이 달라 검색에 안 걸렸을 뿐이다.
    // 사람이 직접 보고 '없음'을 눌러 준 곳만 '없음'이다.
    const placeAuto = (v) => (!result ? '' : marked ? '없음' : noPlace ? '?' : v);
    push('place', '번호', placeAuto(result?.플레이스_번호));
    push('place', '교습비', placeAuto(result?.플레이스_교습비));
    BUCKETS.forEach((b) => {
        const c = cells[b];
        CELL_FIELDS.forEach((f) => {
            push(b, f, !result ? '' : !c ? '없음' : c.notProbed ? '안함' : c[f]);
        });
    });
    return out;
}

// 칸을 누를 때마다 자동값 → O → X → 없음 → 자동값.
// '없음' 이 필요한 이유 — 자동 조사가 '?' 로 남긴 칸(플레이스를 못 찾았거나 글을 못 읽은 곳) 중에는
// 실제로 그 채널이 아예 없는 곳이 있다. '없음' 으로 두면 판정에서 빠져(X 도 ? 도 아니다)
// 멀쩡한 학원이 '확인불가' 로 계속 남지 않는다.
export function nextManual(current) {
    if (current === undefined) return 'O';
    if (current === 'O') return 'X';
    if (current === 'X') return NONE;
    return undefined;
}

/**
 * 화면에 보이는 판정 — 교습비 칸만 보고 정한다.
 *
 * 등록(신고)번호 미게시는 시정명령 사항이지 과태료 사항이 아니다. 번호까지 미이행으로 잡으면
 * 대부분의 학원이 빨갛게 떠서 정작 반드시 게시해야 하는 교습비 미게시가 눈에 안 띈다.
 * 번호 상태는 표의 번호 칸과 비고에 그대로 남아 있으므로 정보를 잃지 않는다.
 *
 * 저장된 칸 값에서 매번 다시 계산한다 — 예전 규칙(번호 포함)으로 저장된 행도
 * 756곳을 다시 조사하지 않고 바로 새 기준으로 보이게 하기 위해서다.
 * 인스타그램은 서버도 교습비 판정에서 뺀다 (소개글 150자라 교습비를 적는 자리가 아니다).
 */
export function effectiveVerdict(result) {
    return cached(result, 'verdict', () => rawEffectiveVerdict(result));
}

function rawEffectiveVerdict(result) {
    if (!result) return '미조사';
    if (!result.checkedAt) return result.판정 || '미조사';
    // 동일 업체인지 자체가 불확실한 건 칸을 고친다고 풀리지 않는다.
    // 다만 사람이 직접 보고 '플레이스 없음'이라고 확인해 준 곳은 더 볼 것이 없으므로 예외다 —
    // 그러지 않으면 플레이스를 만들지 않은 학원이 영영 확인불가로 남아 목록이 줄지 않는다.
    if (!isNoPlace(result) && result.matchStatus !== 'matched') return '확인불가';

    const fee = rowCells(result).filter((c) => c.field === '교습비' && c.bucket !== 'instagram');
    if (fee.some((c) => c.value === 'X')) return '미이행';
    // 못 본 곳이 남아 있으면 '이행'이라고 단정하지 않는다
    if (fee.some((c) => c.value === '?')) return '확인불가';
    // 올릴 자리가 아예 없는 곳 — 게시했다는 뜻의 '이행'과 섞으면 이행률이 실제보다 좋아 보인다
    if (fee.every((c) => c.value === '없음')) return '해당없음';
    return '이행';
}

/** 칸에 특정 값을 넣는다 (undefined 면 자동값으로 되돌린다). 저장은 부르는 쪽이 한다. */
export function setManualCell(result, key, value) {
    // parseManual 은 캐시된 객체를 돌려준다 — 그대로 고치면 다른 곳이 보는 값까지 바뀐다
    const manual = { ...parseManual(result) };
    if (value === undefined) delete manual[key]; else manual[key] = value;
    // 다 지웠을 때도 빈 문자열로 보내면 안 된다 — Apps Script 는 빈 값을 '안 넘어온 것'으로 보고
    // 기존 값을 지켜주므로, 되돌리기가 영영 저장되지 않는다. 빈 객체를 명시해 보낸다.
    return { ...result, 수동확인: JSON.stringify(manual) };
}

/** 칸을 한 번 눌렀을 때 — 자동값 → O → X → 자동값 */
export function applyManualCell(result, key) {
    return setManualCell(result, key, nextManual(parseManual(result)[key]));
}

// ── 확인 마감 ───────────────────────────────────────────
// 담당자가 그 학원을 다 보고 '이제 됐다' 고 굳히는 표시.
// 값은 새 시트 열을 만들지 않고 기존 '수동확인' JSON 안에 예약 키로 넣는다 —
// 시트에 붙은 Apps Script 를 고치지 않아도 바로 쓸 수 있고, KEEP_KEYS 에 '수동확인' 이
// 이미 들어 있어 다시 조사해도 마감이 지워지지 않는다.
// 예약 키는 '__' 로 시작한다. 칸 키는 언제나 `${열}|${항목}` 형태라 서로 부딪히지 않는다.
export const DONE_KEY = '__done';
const RESERVED = (k) => k.startsWith('__');

/** 직접 고친 '칸' 값만 (마감 같은 예약 키는 뺀다) */
export function manualCells(result) {
    const out = {};
    Object.entries(parseManual(result)).forEach(([k, v]) => { if (!RESERVED(k)) out[k] = v; });
    return out;
}

export const isDone = (result) => !!parseManual(result)[DONE_KEY];
export const doneAt = (result) => String(parseManual(result)[DONE_KEY] || '');

/** 마감/해제 — 저장은 부르는 쪽이 한다 */
export const setDone = (result, on) =>
    setManualCell(result, DONE_KEY, on ? new Date().toISOString() : undefined);

// ── 네이버플레이스가 아예 없는 학원 ─────────────────────
// 이름이 달라 검색에 안 걸린 것과, 정말로 플레이스를 안 만든 것은 자동으로 가릴 수 없다.
// 앞의 것으로 보고 '확인불가'에 두면 담당자가 아무리 봐도 풀리지 않는 행이 쌓이고,
// 30일마다 다시 조사해 매번 같은 엉뚱한 후보를 붙인다. 그래서 사람이 직접 확인한 뒤
// 눌러 표시하게 한다. 표시해 두면 후보를 버리고, 판정을 '해당없음'으로 빼고, 다시 조사하지 않는다.
export const NOPLACE_KEY = '__noplace';

export const isNoPlace = (result) => !!parseManual(result)[NOPLACE_KEY];
export const noPlaceAt = (result) => String(parseManual(result)[NOPLACE_KEY] || '');

/** '플레이스 없음' 표시/해제 — 저장은 부르는 쪽이 한다 */
export const setNoPlace = (result, on) =>
    setManualCell(result, NOPLACE_KEY, on ? new Date().toISOString() : undefined);

// 자동 조사 결과에는 없는, 사람이 넣은 값 — 새 결과에 이어 붙여야 화면에서 사라지지 않는다
const KEEP_KEYS = ['수동확인', '비고', '연락처', '플레이스지정', '묶음', '적요'];

/** 새로 조사한 결과(fresh)에 이전 행(prev)의 사람이 넣은 값을 이어 붙인다 */
export function keepManual(fresh, prev) {
    if (!prev) return fresh;
    const out = { ...fresh };
    KEEP_KEYS.forEach((k) => { out[k] = prev[k] || ''; });
    return out;
}

// ── 적요 (담당자가 적는 진행사항) ───────────────────────
// 한 학원을 보다가 알게 된 것 — '전화했더니 다음 주에 올린다더라', '원장이 바뀜' —
// 을 적어 두는 칸. 시트 '적요' 열(AD)에 그대로 남는다.
//
// 마감(__done)과 달리 수동확인 JSON 이 아니라 진짜 시트 열을 쓴다. 사람이 시트를 열어
// 읽고 고칠 수 있어야 하는 값이기 때문이다 (JSON 안에 넣으면 시트에서는 못 읽는다).

export const MEMO_MAX = 50;

// 지운 자리는 빈 값이 아니라 '-' 로 남긴다 — Apps Script 는 빈 값을 '안 넘어온 것'으로 보고
// 기존 값을 지켜주므로, 빈 문자열로 보내면 지우기가 영영 저장되지 않는다 (PIN_CLEARED 와 같은 규약).
export const MEMO_CLEARED = '-';

/** 시트에 저장된 적요 → 화면에 보일 글자 (지움 표시는 빈 문자열로) */
export function memoText(result) {
    const v = String(result?.적요 || '').trim();
    return v === MEMO_CLEARED ? '' : v;
}

/** 적요를 고친 결과 — 저장은 부르는 쪽이 한다 */
export function setMemo(result, text) {
    const v = String(text || '').trim().slice(0, MEMO_MAX);
    return { ...result, 적요: v || MEMO_CLEARED };
}

// ── 플레이스 직접 지정 ──────────────────────────────────
// 이름만으로는 '나룰음악학원'과 '나룰음악학원 2호점'을 가려내지 못한다.
// 담당자가 플레이스 주소를 넣어 두면 그 ID를 시트에 남겨, 다시 조사해도 그 플레이스만 본다.

export function parsePlaceId(input) {
    const s = String(input || '').trim();
    if (!s) return '';
    if (/^\d+$/.test(s)) return s;
    const m = s.match(/place\/(\d+)/) || s.match(/[?&]id=(\d+)/) || s.match(/(\d{6,})/);
    return m ? m[1] : '';
}

// 지정을 푼 자리는 빈 값이 아니라 '-' 로 남긴다 — Apps Script 는 빈 값을 '안 넘어온 것'으로 보고
// 기존 값을 지켜주므로, 빈 문자열로 보내면 해제가 영영 저장되지 않는다.
export const PIN_CLEARED = '-';

/** 플레이스 번호 → 조사 결과가 쓰는 것과 같은 형식의 주소 (naverProbe.js 의 placeUrl) */
export const placeUrlFromId = (id) => {
    const s = String(id || '').trim();
    return s ? `https://m.place.naver.com/place/${s}/home` : '';
};

/**
 * 담당자가 지정해 둔 플레이스 번호.
 * 지정 열에는 사람이 읽을 수 있게 주소를 통째로 남기지만(시트를 열어 바로 눌러볼 수 있어야 한다),
 * 예전에 번호만 저장된 행도 있으므로 어느 쪽이든 번호를 뽑아낸다.
 */
export function pinnedPlaceId(result) {
    const v = String(result?.플레이스지정 || '').trim();
    return v === PIN_CLEARED ? '' : parsePlaceId(v);
}

/** 지정해 둔 플레이스 주소 (번호만 저장된 예전 행은 주소로 만들어 준다) */
export function pinnedPlaceUrl(result) {
    const v = String(result?.플레이스지정 || '').trim();
    if (!v || v === PIN_CLEARED) return '';
    return /^https?:\/\//i.test(v) ? v : placeUrlFromId(parsePlaceId(v));
}

/**
 * 지금 이 학원의 플레이스로 실제 쓰이고 있는 주소 — 표·상세화면이 같은 값을 보여주기 위한 것.
 * 우선순위는 effectivePlaceId 와 같다: 직접 지정 → 시트 비고에 적어둔 주소 → 지난 조사에서 찾은 곳.
 */
export function currentPlaceUrl(result) {
    const pinned = pinnedPlaceUrl(result);
    if (pinned) return pinned;
    const hint = remarkPlaceHint(result);
    if (hint.id) return placeUrlFromId(hint.id);
    if (hint.url) return hint.url;
    return String(result?.플레이스URL || '').trim() || placeUrlFromId(result?.플레이스ID);
}

/** 그 주소가 어디서 온 것인지 — 화면에 한 줄로 알려 준다 */
export function placeSource(result) {
    if (pinnedPlaceUrl(result)) return '직접 지정함';
    const hint = remarkPlaceHint(result);
    if (hint.id || hint.url) return '시트 비고에 적은 주소';
    return '이름으로 자동 검색한 결과';
}

/**
 * 후보 플레이스를 하나라도 물고 왔는지.
 * matchStatus 가 'no_match' 여도 두 가지가 섞여 있다 —
 * (1) 검색에서 아무것도 못 찾음(플레이스ID 없음), (2) 찾긴 했는데 이름 유사도가 낮아 확정 보류.
 * (2)는 조사한 값이 실제로 있으므로 화면에서 (1)과 같이 다루면 안 된다.
 */
export const hasPlaceCandidate = (result) => !!String(result?.플레이스ID || '').trim();

/** 조사에 쓸 플레이스 ID — 직접 지정한 값이 항상 이긴다 */
export const effectivePlaceId = (result) =>
    pinnedPlaceId(result) || remarkPlaceHint(result).id || String(result?.플레이스ID || '').trim();

// ── 비고에 적어둔 플레이스 주소 ─────────────────────────
// 이름으로 못 찾는 곳(하남 학원 131곳이 확인불가)은 담당자가 시트 '비고' 칸에
// 네이버플레이스 주소를 붙여넣어 알려준다. 지정 열과 달리 비고는 자유 텍스트라 주소 형태만 받는다 —
// parsePlaceId 처럼 '6자리 이상 숫자'까지 받으면 사업자번호·전화번호가 플레이스 번호로 둔갑한다.
// http:// 를 떼고 붙여넣는 경우가 흔해 앞머리는 요구하지 않는다.
// 대신 'naver.com/…place/숫자' 를 통째로 요구한다 — 메모 속 숫자가 번호로 둔갑하지 않는다.
const REMARK_PLACE_URL = /naver\.com\/[^\s,<>]*place\/(\d+)/i;
// 휴대폰 네이버지도의 '공유'는 번호가 없는 단축주소를 준다 — 서버가 펴서 번호를 알아낸다
const REMARK_PLACE_SHORT = /(?:https?:\/\/)?naver\.me\/[A-Za-z0-9]+/i;

/** 비고에서 플레이스 주소를 뽑는다 → { id } 또는 { url }(단축주소) */
export function remarkPlaceHint(result) {
    return cached(result, 'placeHint', () => rawRemarkPlaceHint(result));
}

function rawRemarkPlaceHint(result) {
    const s = String(result?.비고 || '');
    const m = s.match(REMARK_PLACE_URL);
    if (m) return { id: m[1], url: '' };
    const short = s.match(REMARK_PLACE_SHORT);
    if (!short) return { id: '', url: '' };
    // 서버가 그대로 부를 수 있게 주소 형태를 갖춰 준다
    return { id: '', url: /^https?:/i.test(short[0]) ? short[0] : `https://${short[0]}` };
}

/**
 * 담당자가 칸에 붙여넣은 값 → 조사에 쓸 것.
 * 번호를 바로 알 수 있으면 { id }, 단축주소(naver.me)면 { url } — 단축주소는 서버가 펴야 한다.
 * 비고와 달리 '여기에 주소를 넣겠다'고 작정하고 넣은 값이라 숫자만 적어도 받는다.
 */
export function parsePlaceInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return { id: '', url: '', error: '플레이스 주소를 붙여넣어 주세요.' };
    const short = s.match(REMARK_PLACE_SHORT);
    if (short && !/place\/\d+/i.test(s)) {
        return { id: '', url: /^https?:/i.test(short[0]) ? short[0] : `https://${short[0]}`, error: '' };
    }
    const id = parsePlaceId(s);
    if (id) return { id, url: '', error: '' };

    // 왜 못 찾았는지를 갈라 준다. 가장 흔한 실수가 '지도에서 검색만 한 주소'인데,
    // 그 주소에는 플레이스 번호가 아예 들어 있지 않아 여기서 아무리 뜯어봐도 나오지 않는다.
    // '주소를 그대로 붙여넣어라'고만 하면 이미 그렇게 한 사람은 무엇이 잘못인지 알 수 없다.
    const query = placeSearchQuery(s);
    return {
        id: '', url: '', query,
        error: query
            ? `‘${query}’ 검색 결과 주소라 플레이스 번호가 없습니다. `
              + `검색 결과에서 그 학원을 눌러 상세가 열린 뒤의 주소를 복사해 주세요 (주소에 place/숫자 가 들어 있어야 합니다). `
              + `지도앱이라면 공유 → 주소 복사(naver.me)도 됩니다.`
            : `플레이스 번호를 찾지 못했습니다. 네이버플레이스 주소(place/숫자) 나 지도앱 공유주소(naver.me) 를 붙여넣어 주세요.`,
    };
}

/** 지도 검색 주소(map.naver.com/p/search/…)에서 검색어를 되돌린다 — 없으면 빈 문자열 */
export function placeSearchQuery(input) {
    const m = String(input || '').match(/naver\.com\/[^\s]*\/search\/([^/?#]+)/i);
    if (!m) return '';
    try { return decodeURIComponent(m[1]).trim(); } catch { return m[1]; }
}

/**
 * 비고에 적어둔 주소로 찾아낸 플레이스는 지정 열에 굳혀 둔다.
 * 그러지 않으면 단축주소를 조사할 때마다 다시 펴야 하고(요청 1건 추가),
 * 무엇보다 표·상세화면·시트가 서로 다른 값을 보여 어느 것이 맞는지 알 수 없다.
 * 굳히고 나면 세 곳이 모두 같은 주소를 가리킨다.
 */
export function pinResolvedPlace(result) {
    if (!result || pinnedPlaceId(result)) return result;
    const hint = remarkPlaceHint(result);
    if (!hint.url && !hint.id) return result;
    const id = String(result.플레이스ID || '').trim();
    return id ? { ...result, 플레이스지정: placeUrlFromId(id) } : result;
}

/**
 * 조사에 넘길 target — 이미 알고 있는 플레이스를 실어 검색 단계를 건너뛴다 (차단 위험·시간 감소).
 * 표를 그릴 때가 아니라 실제로 조사를 시작할 때만 부른다. 렌더 때마다 부르면
 * 행마다 새 target 객체가 생겨 React.memo 가 무력해진다.
 */
export function probeTargetFor(target, result) {
    // 비고에 단축주소를 적어뒀으면 번호는 서버가 펴서 알아낸다 —
    // 예전에 잘못 잡아둔 플레이스를 그대로 넘기면 담당자가 알려준 주소가 무시된다.
    const hint = remarkPlaceHint(result);
    if (hint.url) return { ...target, placeHint: hint.url, placePinned: true };
    const placeId = effectivePlaceId(result);
    if (!placeId) return target;
    return { ...target, placeId, placePinned: !!pinnedPlaceId(result) || !!hint.id };
}

// ── 공동 운영 묶음 ──────────────────────────────────────
// 원장이 같거나 분관이라 여러 학원이 블로그·플레이스 하나를 함께 쓰는 곳이 있다.
// 그런 곳은 '교습비를 올렸는가'가 한 몸이라, 학원마다 따로 고치면 값이 어긋난다.

/** m.·www. 와 꼬리 슬래시만 떼어 두 URL 이 같은 곳인지 비교할 수 있게 한다 */
export function channelUrlKey(url) {
    const s = String(url || '').trim().toLowerCase();
    if (!s) return '';
    return s.replace(/^https?:\/\//, '').replace(/^(m|www)\./, '').replace(/\/+$/, '');
}

// 이름에 붙은 지점 번호 ('나룰음악학원(2호)' → 2). 없으면 null.
// naverProbe.js 의 branchNo 와 같은 규칙이다 — 한쪽만 고치면 화면과 조사 결과가 갈라진다.
// '2관'·'중등관'·'캠퍼스'는 지점 번호로 보지 않는다. 본관과 플레이스·블로그를 함께 쓰는 곳이 많아서다.
const BRANCH_NO = /(?:^|[^0-9])(\d{1,2})\s*호점|\(\s*(\d{1,2})\s*호\s*\)|제\s*(\d{1,2})\s*호점/;

export function branchNo(name) {
    const m = String(name || '').match(BRANCH_NO);
    if (!m) return null;
    const n = Number(m[1] || m[2] || m[3]);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** '묶음' 열 값 — 해제한 자리(PIN_CLEARED)는 빈 값으로 본다 */
export function groupTag(result) {
    const v = String(result?.묶음 || '').trim();
    return v === PIN_CLEARED ? '' : v;
}

const rowsOf = (results) => (Array.isArray(results) ? results : Object.values(results || {}));

/**
 * 같은 채널을 쓰는 학원들을 묶는다 → Map(행키 → 묶음).
 *   1) '묶음' 열 값이 같으면 확정 (사람이 정한 값이 항상 이긴다)
 *   2) 플레이스 홈에 걸린 블로그 URL 이 같으면 자동으로 묶는다
 *   3) 같은 플레이스를 쓰고 지점 번호도 어긋나지 않으면 묶는다
 *      ('루나영어학원'과 '루나영어2관학원'처럼 본관·2관이 플레이스를 함께 쓰는 곳)
 * 다만 지점 번호가 어긋나면(1호점 학원이 2호점 플레이스를 물고 있으면) 묶지 않는다 —
 * 함께 쓰는 게 아니라 잘못 잡았을 가능성이 크므로 placeDuplicates() 로 '확인 필요'라고 알린다.
 */
export function buildGroups(results) {
    const rows = rowsOf(results).filter((r) => r && r.regNo);
    const keyOf = (r) => recordKey(r.category, r.regNo);
    const parent = new Map();
    const find = (x) => {
        while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
        return x;
    };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

    rows.forEach((r) => parent.set(keyOf(r), keyOf(r)));
    const firstTag = new Map();
    const firstBlog = new Map();
    const firstPlace = new Map();   // 플레이스ID + 지점번호
    rows.forEach((r) => {
        const k = keyOf(r);
        const tag = groupTag(r);
        // 사람이 적은 묶음 이름은 지점이 달라도 그대로 따른다
        if (tag) { if (firstTag.has(tag)) union(k, firstTag.get(tag)); else firstTag.set(tag, k); }

        // 자동으로 묶을 때는 지점 번호를 키에 넣는다. 1호점이 2호점 플레이스를 잘못 물면
        // 블로그까지 따라오므로, 채널이 같다는 것만으로 묶으면 오매칭이 '공동 운영'으로 굳어버린다.
        const branch = branchNo(r.name) ?? '';
        parseChannels(r).forEach((c) => {
            if (c.종류 !== 'blog') return;
            const u = channelUrlKey(c.url);
            if (!u) return;
            const b = `${u}|${branch}`;
            if (firstBlog.has(b)) union(k, firstBlog.get(b)); else firstBlog.set(b, k);
        });
        const pid = String(r.플레이스ID || '');
        if (pid) {
            const p = `${pid}|${branch}`;
            if (firstPlace.has(p)) union(k, firstPlace.get(p)); else firstPlace.set(p, k);
        }
    });

    const byRoot = new Map();
    rows.forEach((r) => {
        const root = find(keyOf(r));
        if (!byRoot.has(root)) byRoot.set(root, { key: root, members: [], names: [], via: 'auto', label: '' });
        const g = byRoot.get(root);
        g.members.push(keyOf(r));
        g.names.push(r.name || r.regNo);
        const tag = groupTag(r);
        if (tag) { g.via = 'manual'; g.label = g.label || tag; }
    });

    const out = new Map();
    byRoot.forEach((g) => { if (g.members.length > 1) g.members.forEach((m) => out.set(m, g)); });
    return out;
}

/**
 * 같은 플레이스를 물고 있는데 묶음으로도 안 묶인 경우 → 지점을 잘못 잡았을 가능성.
 * 본관·2관처럼 함께 쓰는 곳은 buildGroups 가 이미 묶으므로, 여기 남는 것은
 * '1호점 학원이 2호점 플레이스를 물고 있는' 같은 어긋난 짝이다.
 * Map(행키 → 같은 플레이스를 쓰는 다른 학원 이름들)
 */
export function placeDuplicates(results, groups) {
    const rows = rowsOf(results).filter((r) => r && r.regNo && r.플레이스ID);
    const byPlace = new Map();
    rows.forEach((r) => {
        const id = String(r.플레이스ID);
        if (!byPlace.has(id)) byPlace.set(id, []);
        byPlace.get(id).push(r);
    });
    const out = new Map();
    byPlace.forEach((list) => {
        if (list.length < 2) return;
        list.forEach((r) => {
            // 직접 지정한 곳은 사람이 이미 확인한 것이다
            if (pinnedPlaceId(r)) return;
            const k = recordKey(r.category, r.regNo);
            const g = groups?.get(k);
            const others = list.filter((o) => o !== r && !(g && g.members.includes(recordKey(o.category, o.regNo))));
            if (others.length) out.set(k, others.map((o) => o.name || o.regNo));
        });
    });
    return out;
}

/**
 * 묶음 형제 중 '같은 채널'을 쓰는 행의 같은 칸을 찾아 준다 (교습비 전파용).
 * 형제마다 링크 순서가 달라 열이 어긋날 수 있으므로 열 이름이 아니라 URL 로 찾는다.
 * 번호 칸은 학원마다 자기 번호가 게시돼 있어야 하므로 전파하지 않는다.
 */
export function sharedCellTargets(results, source, key, groups) {
    const [bucket, field] = String(key).split('|');
    if (field !== '교습비' || !source) return [];
    const selfKey = recordKey(source.category, source.regNo);
    const group = groups?.get(selfKey);
    if (!group) return [];

    const placeId = bucket === 'place' ? String(source.플레이스ID || '') : '';
    let urls = [];
    if (bucket !== 'place') {
        const chs = parseChannels(source);
        const at = assignBuckets(chs);
        urls = chs.filter((c, i) => at[i] === bucket).map((c) => channelUrlKey(c.url)).filter(Boolean);
    }
    if (!placeId && !urls.length) return [];

    const byKey = {};
    rowsOf(results).forEach((r) => { if (r && r.regNo) byKey[recordKey(r.category, r.regNo)] = r; });

    const out = [];
    group.members.forEach((m) => {
        if (m === selfKey) return;
        const r = byKey[m];
        if (!r) return;
        if (bucket === 'place') {
            if (placeId && String(r.플레이스ID || '') === placeId) {
                out.push({ rowKey: m, result: r, key: cellKey('place', '교습비'), name: r.name });
            }
            return;
        }
        const chs = parseChannels(r);
        const at = assignBuckets(chs);
        const hit = chs.findIndex((c) => urls.includes(channelUrlKey(c.url)));
        if (hit >= 0) out.push({ rowKey: m, result: r, key: cellKey(at[hit], '교습비'), name: r.name });
    });
    return out;
}

export const VERDICTS = ['이행', '미이행', '확인불가', '해당없음'];

export const VERDICT_COLOR = {
    이행: '#10b981',
    미이행: '#ef4444',
    확인불가: '#94a3b8',
    // 네이버에 올릴 자리가 아예 없어 이 점검의 대상이 아닌 곳
    해당없음: '#64748b',
};

/**
 * 화면의 세 가지 거르개(판정 칩 · 확인 칩 · 검색어)를 한 행에 적용한다.
 *
 * 표와 엑셀이 같은 함수를 써야 한다 — 종이로 뽑은 목록이 화면에서 본 목록과 다르면
 * 어느 쪽을 믿어야 하는지 알 수 없다. q 는 이미 소문자로 다듬어 넘긴다.
 */
export function matchesSnsFilter({ target, result }, { filter, doneFilter, q }) {
    if (filter === '미조사') { if (result) return false; }
    else if (filter !== '전체') { if (!result || effectiveVerdict(result) !== filter) return false; }
    if (doneFilter === '확인완료' && !isDone(result)) return false;
    if (doneFilter === '미확인' && isDone(result)) return false;
    if (!q) return true;
    // 플레이스명까지 훑는다 — 학원명과 간판이 다른 곳을 찾을 때 필요하다
    return `${target.name} ${target.regNo} ${result?.플레이스명 || ''}`.toLowerCase().includes(q);
}

/**
 * 표에 한 줄로 붙일 짧은 주소.
 *   '경기도 하남시 미사강변대로 206, 301호 (망월동, 하남리더스프라자)'
 *     → '미사강변대로 206, 301호'
 *
 * 플레이스에 뜬 주소와 이 학원의 주소가 같은 곳인지 눈으로 맞춰 보는 용도다.
 * 앞의 시·도는 이 표가 어차피 한 시(市) 안만 보므로 모든 행에 똑같이 붙어 자리만 차지하고,
 * 뒤의 (법정동, 건물명) 괄호는 도로명 주소를 이미 읽은 뒤라 판단에 보태는 것이 없다.
 * 남는 도로명·번지·호수가 두 주소를 가르는 부분이다.
 */
export function shortAddress(address) {
    const s = String(address || '').trim();
    if (!s) return '';
    // '경기도 하남시 ' 처럼 앞에 붙는 시·군·구까지 떼어낸다 (DetailView 의 getShortAddress 와 같은 규칙)
    const m = s.match(/^.+?[시군구]\s+(.+)$/);
    // 뒤에 붙은 '(망월동, 하남리더스프라자)' 를 뗀다. 괄호가 둘 이상 이어질 수도 있어 반복해 지운다
    // (한 번에 지우는 정규식은 중첩 반복이라 주소가 길어지면 폭주한다)
    let body = (m ? m[1] : s).trim();
    let prev = '';
    while (body !== prev) { prev = body; body = body.replace(/\s*\([^)]*\)$/, '').trim(); }
    return body;
}

// ── 딥링크 (담당자가 눈으로 확인할 때) ──────────────────

/**
 * 주소에서 도로명+건물번호까지만 남긴다 ('경기도 하남시 감일백제로 109 , 403호~405호'
 * → '경기도 하남시 감일백제로 109'). 호수를 붙이면 지도 검색이 오히려 안 잡힌다.
 *
 * 서버의 api/_lib/naverProbe.js 의 addressQuery 와 같은 규칙이다 —
 * api/ 는 Vercel 함수, src/ 는 브라우저 번들이라 모듈을 공유하지 않아 양쪽에 둔다.
 * 한쪽을 고치면 다른 쪽도 함께 고칠 것.
 */
export function roadAddressQuery(address) {
    // 탐욕적으로 잡아 '위례대로 21길 15-3' 처럼 뒤에 오는 길 번호까지 살린다
    const m = String(address || '').match(/^(.*(?:로|길)\s*\d+(?:-\d+)?)/);
    return (m ? m[1] : String(address || '')).trim();
}

/**
 * 네이버지도에서 이 주소를 여는 주소.
 * 지도 화면의 '이 주소의 장소' 목록을 펼치면 그 건물에 든 업체가 다 보여,
 * 이름이 달라 자동으로 못 찾은 플레이스를 눈으로 찾아 지정할 수 있다.
 */
export function mapSearchUrl(address) {
    const q = roadAddressQuery(address);
    return q ? `https://map.naver.com/p/search/${encodeURIComponent(q)}` : '';
}

export const placeSearchUrl = (name, city) =>
    `https://m.search.naver.com/search.naver?query=${encodeURIComponent(`${city} ${name}`)}`;

export const blogSearchUrl = (name, city) =>
    `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(`${city} ${name}`)}`;

// ── 조사 대상 목록 만들기 ───────────────────────────────
// aActiveList / hActiveList (지역·개원 필터가 이미 적용된 목록)를 그대로 받는다.
export function toProbeTargets(list, category) {
    return (list || []).map((a) => ({
        id: a.id,
        name: a.name || '',
        category,
        regNo: a.id || '',
        address: a.address || '',
        contact: a.founder?.mobile || a.founder?.phone || '',
        founderName: a.founder?.name || '',
    }));
}

// ── 조사 결과 → 시트 레코드 ─────────────────────────────
export function resultToRecord(r) {
    const rec = {
        확인일시: r.checkedAt || new Date().toISOString(),
        구분: r.category || '',
        등록번호: r.regNo || '',
        학원명: r.name || '',
        매칭상태: r.matchStatus || '',
        매칭점수: r.matchScore ?? '',
        비고: '', // 수기 입력 항목 — 빈 값이면 Apps Script 가 기존 값을 보존한다
    };
    // 나머지는 컬럼명이 결과 키와 같으므로 그대로 옮긴다
    PASSTHROUGH.forEach((k) => { rec[k] = r[k] ?? ''; });
    return rec;
}

export const recordKey = (category, regNo) => `${category}|${regNo}`;

// 게시 상태는 자주 바뀌지 않는다. 최근에 본 곳을 매번 다시 도는 게 차단의 가장 큰 원인이라
// 기본 조사 대상은 '한 번도 안 본 곳 + 오래된 곳'으로 잡는다.
export const RECHECK_DAYS = 30;

// 소개글을 못 읽어 보류된 행은 '조사한 셈' 치면 안 된다.
// 그대로 두면 반쪽 판정이 30일 동안 굳어 버린다 (naverProbe.js 의 보류 사유 문구와 짝)
const HELD_BACK_MARK = '읽지 못해 보류';

// 학원 이름 뒤 괄호에 적은 번호('하남정상어학원(1068호)')를 못 읽던 때가 있었다.
// 그때 조사한 곳은 번호를 제대로 적어뒀는데도 '번호 오기재'로 굳어 있다.
// 전체를 다시 도는 것은 차단을 부르니, 그 시절 결과 중 '오기재'로 남은 곳만 골라 다시 본다.
const REGNO_PARSER_FIXED_AT = Date.parse('2026-08-30T09:00:00+09:00');

function staleRegNoMismatch(result) {
    const t = Date.parse(result.checkedAt);
    if (isNaN(t) || t >= REGNO_PARSER_FIXED_AT) return false;
    if (result.플레이스_번호대조 === '불일치') return true;
    return parseChannels(result).some((c) => c.번호대조 === '불일치');
}

export function needsRecheck(result, days = RECHECK_DAYS) {
    if (!result || !result.checkedAt) return true;
    if (String(result.미이행사유 || '').includes(HELD_BACK_MARK)) return true;
    if (staleRegNoMismatch(result)) return true;
    // 시트 비고에 플레이스 주소를 적어둔 곳은 30일을 기다리지 않는다.
    // 적어두고 '조사 필요' 를 눌렀는데 대상에서 빠지면, 756곳을 통째로 돌리는 수밖에 없다.
    const hint = remarkPlaceHint(result);
    if (hint.url && !pinnedPlaceId(result)) return true;
    if (hint.id && String(result.플레이스ID || '') !== hint.id) return true;
    const t = new Date(result.checkedAt).getTime();
    if (isNaN(t)) return true;
    return Date.now() - t > days * 86400000;
}

// 시트에서 읽어온 행 → 화면이 쓰는 결과 형태
export function rowToResult(row) {
    const r = {
        regNo: row['등록번호'] || '',
        category: row['구분'] || '',
        name: row['학원명'] || '',
        matchStatus: row['매칭상태'] || '',
        matchScore: row['매칭점수'] === '' ? null : Number(row['매칭점수']),
        checkedAt: row['확인일시'] || '',
    };
    [...PASSTHROUGH, '비고'].forEach((k) => { r[k] = row[k] || ''; });
    return r;
}

/**
 * 학원 상세화면용 — 해당 학원 1건과, 묶음 판정에 필요한 전체 결과를 함께 돌려준다.
 * (fetchSnsChecks 가 어차피 전체를 읽어오므로 요청이 늘지 않는다)
 */
export async function fetchSnsCheckContext(category, regNo) {
    const rows = await fetchSnsChecks();
    const map = {};
    rows.forEach((row) => {
        const r = rowToResult(row);
        if (r.regNo) map[recordKey(r.category, r.regNo)] = r;
    });
    const key = recordKey(category, String(regNo || '').trim());
    return { result: map[key] || null, results: map, groups: buildGroups(map) };
}

/** 학원 상세화면용 — 저장된 결과에서 해당 학원 1건만 찾아 준다 */
export async function fetchSnsCheckFor(category, regNo) {
    const rows = await fetchSnsChecks();
    const key = recordKey(category, String(regNo || '').trim());
    const hit = rows.find((row) => recordKey(row['구분'], row['등록번호']) === key);
    return hit ? rowToResult(hit) : null;
}

// ── 서버 조사 호출 ──────────────────────────────────────
async function probeChunk(academies, city) {
    const res = await fetch('/api/sns-probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academies, city }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

// ── 조사 속도 ───────────────────────────────────────────
// 네이버는 데이터센터 IP 한 곳에서 요청이 몰리면 429 로 막고 15분 넘게 안 풀어준다.
// 그래서 청크 사이를 일부러 쉬고, 한 번 막히면 그 뒤로는 더 느리게 간다(다시 빨라지지 않는다).
const CHUNK_GAP_MS = 5000;
const MAX_CHUNK_GAP_MS = 60000;
// 차단됐을 때 기다릴 시간(분). 막힐 때마다 다음 단계로 넘어간다.
// 첫 대기는 짧게 — 진짜 차단이면 어차피 다음 단계로 올라가고, 일시적인 것이면 몇 분에 풀린다.
// 처음부터 10분씩 세워두면 아닌 경우에도 무조건 10분을 버리게 된다.
const BLOCK_WAIT_MIN = [3, 8, 15, 20, 30, 40];

/** ms 만큼 기다린다. 중단을 누르면 false 를 돌려주고 즉시 빠져나온다. */
async function waitOrStop(ms, shouldStop, onTick) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (shouldStop?.()) return false;
        onTick?.(Math.ceil((end - Date.now()) / 1000));
        await new Promise((r) => setTimeout(r, 1000));
    }
    return !shouldStop?.();
}

/**
 * 대상을 청크로 나눠 순차 조사한다.
 * onProgress(done, total, results) 로 진행 상황을 흘려보내 화면에 즉시 반영할 수 있게 한다.
 * onWait(남은초, 차단횟수, 사유) 는 차단돼서 쉬는 동안 호출된다 (끝나면 남은초 0).
 * shouldStop() 이 true 를 반환하면 즉시 중단한다 (대기 중에도).
 *
 * 네이버가 차단(403/429)하면 조사된 곳까지만 반영하고 기다렸다가 같은 자리에서 이어간다.
 * 남은 학원을 '확인불가'로 채우면 이전에 제대로 조사해 둔 결과까지 덮어써 버리므로,
 * 못 돌린 학원은 건드리지 않는다.
 */
export async function probeAll(targets, city, { onProgress, shouldStop, onWait, autoResume = true } = {}) {
    const all = [];
    let blocked = false;
    let blockedReason = '';
    // 플레이스·블로그 제한으로 이번엔 못 본 학원 수 (배치는 멈추지 않고 지나간다)
    let skipped = 0;
    let chunkGap = CHUNK_GAP_MS;
    let blockCount = 0;
    let i = 0;
    // 같은 자리에서 반복해서 막히는지 추적한다 (아래 '건너뛰기' 참고)
    let lastBlockedAt = -1;

    while (i < targets.length) {
        if (shouldStop?.()) break;
        const chunk = targets.slice(i, i + PROBE_BATCH);
        let json;
        try {
            json = await probeChunk(chunk, city);
        } catch (err) {
            // 통신 오류는 해당 청크만 건너뛴다 (결과를 만들어 덮어쓰지 않음)
            blockedReason = err.message;
            i += chunk.length;
            onProgress?.(Math.min(i, targets.length), targets.length, []);
            continue;
        }
        const results = json.results || [];
        skipped += json.skipped || 0;
        all.push(...results);

        if (json.blocked) {
            // 서버는 순서대로 조사하다 막힌 지점에서 멈춘다 — 조사된 만큼만 전진한다
            i += results.length;
            onProgress?.(Math.min(i, targets.length), targets.length, results);
            blockedReason = json.blockedReason || '네이버 요청 차단';
            if (i >= targets.length) break;

            // 1곳만 조사하는 화면(학원 상세)에서는 기다리지 않고 바로 알려준다
            if (!autoResume || blockCount >= BLOCK_WAIT_MIN.length) { blocked = true; break; }

            // 기다렸다 재개했는데 같은 자리에서 또 막혔다면, 네이버 전체 차단이 아니라
            // 이 학원이(정확히는 연결된 링크 중 하나가) 계속 거부당하는 것이다.
            // 더 기다려도 안 풀리므로 이 곳만 건너뛴다 — 결과를 만들지 않으니 기존 값은 그대로 남는다.
            if (i === lastBlockedAt) {
                i += 1;
                lastBlockedAt = -1;
                onProgress?.(Math.min(i, targets.length), targets.length, []);
                continue;
            }
            lastBlockedAt = i;
            const waitMs = BLOCK_WAIT_MIN[blockCount] * 60000;
            blockCount++;
            chunkGap = Math.min(chunkGap * 2, MAX_CHUNK_GAP_MS);

            const resumed = await waitOrStop(waitMs, shouldStop,
                (left) => onWait?.(left, blockCount, blockedReason));
            onWait?.(0, blockCount, '');
            if (!resumed) break;
            continue;   // 같은 자리에서 다시
        }

        // 청크를 통째로 성공했으면 차단 단계를 한 칸 되돌린다. 수백 곳을 도는 동안
        // 드문드문 막히는 것까지 누적하면 멀쩡히 진행되는데도 대기 단계가 40분까지 올라간다.
        lastBlockedAt = -1;
        if (blockCount > 0) blockCount--;

        i += chunk.length;
        onProgress?.(Math.min(i, targets.length), targets.length, results);
        if (i < targets.length && !(await waitOrStop(chunkGap, shouldStop))) break;
    }
    return { results: all, blocked, blockedReason, skipped };
}

// ── 구글시트 저장 / 조회 ────────────────────────────────
export async function fetchSnsChecks() {
    try {
        const res = await fetch('/api/apps-script-proxy?action=getSnsChecks');
        const json = await res.json();
        return json.ok ? (json.rows || []) : [];
    } catch {
        return [];
    }
}

export async function saveSnsChecks(records) {
    let saved = 0;
    for (let i = 0; i < records.length; i += SAVE_BATCH) {
        const chunk = records.slice(i, i + SAVE_BATCH);
        const res = await fetch('/api/apps-script-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'saveSnsChecks', records: chunk }),
        });
        const json = await res.json().catch(() => ({ ok: false }));
        if (!json.ok) throw new Error(json.error || '저장 실패');
        saved += chunk.length;
    }
    return saved;
}
