// 네이버플레이스 / 네이버블로그 교습비·등록(신고)번호 게시 여부 자동 조사
//
// 조사 경로 (실측 검증됨)
//   1) m.search.naver.com 검색 → 플레이스 ID
//   2) m.place.naver.com/place/{id}/information → window.__APOLLO_STATE__
//      - description(...)  : 정보 탭 소개글 전문
//      - Menu:{id}_N       : 홈 탭 가격 메뉴 (있으면 교습비 게시)
//      - naverBlog.__ref   : 공식 블로그 ID (BaseNaverBlog:{blogId})
//   3) blog.naver.com/PostList.naver?blogId={id} → 사이드바 + 최근 글 본문 텍스트

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const H_MOBILE = { 'User-Agent': UA_MOBILE, 'Accept-Language': 'ko-KR,ko;q=0.9' };
const H_DESKTOP = { 'User-Agent': UA_DESKTOP, 'Accept-Language': 'ko-KR,ko;q=0.9' };

const FETCH_TIMEOUT_MS = 12000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isBlocked(err) {
    return err && err.code === 'BLOCKED';
}

function blockedError(msg) {
    const e = new Error(msg);
    e.code = 'BLOCKED';
    return e;
}

async function getText(url, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
        // 429/403 은 요청이 과했다는 뜻 — 개별 실패가 아니라 배치 전체를 멈춰야 한다
        if (res.status === 403 || res.status === 429) {
            throw blockedError(`네이버 요청 차단 (HTTP ${res.status})`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

// ── 텍스트 유틸 ──────────────────────────────────────────
// src/utils/googleSheets.js 의 normalizeName 과 동일 규칙
export const normalizeName = (name) =>
    (name || '').toString().replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

// 기관 종류명은 매칭 시 노이즈라 제거한 축약형도 함께 비교
const stripSuffix = (s) => s.replace(/(학원|교습소|센터|캠퍼스|점|원)$/g, '');

function bigrams(s) {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
}

// Dice 계수 (0~1)
function diceSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = bigrams(a), B = bigrams(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const g of A) if (B.has(g)) inter++;
    return (2 * inter) / (A.size + B.size);
}

export function nameScore(masterName, placeName) {
    const a = normalizeName(masterName);
    const b = normalizeName(placeName);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    const sa = stripSuffix(a), sb = stripSuffix(b);
    if (sa && sb && (sa.includes(sb) || sb.includes(sa))) return 0.8;
    return diceSimilarity(a, b);
}

// ── 등록(신고)번호 추출 ──────────────────────────────────
// 실측 사례: "제5170호", "학원등록번호 : 제 1185호", "(교육청 제1328호)",
//            "제 1894 호", "(등록번호 : 하남56)"
const RE_HO = /제\s*([가-힣]{0,8})\s*(\d{1,6})\s*호/g;
const RE_LABELED = /(?:등록|신고)\s*번호\s*[:：]?\s*(?:제\s*)?([가-힣]{0,8})\s*(\d{1,6})\s*호?/g;

export function extractRegNos(text) {
    if (!text) return [];
    const found = [];
    for (const re of [RE_HO, RE_LABELED]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
            const prefix = (m[1] || '').trim();
            const digits = m[2];
            found.push({ raw: (prefix ? `${prefix}${digits}` : `제${digits}호`), prefix, digits });
        }
    }
    const seen = new Set();
    return found.filter((f) => {
        const k = f.prefix + f.digits;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

export const FEE_KEYWORD = /교습비|수강료|수업료/;

// ── APOLLO_STATE 추출 ───────────────────────────────────
export function extractApolloState(html) {
    const i = html.indexOf('window.__APOLLO_STATE__');
    if (i < 0) return null;
    const start = html.indexOf('{', i);
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let k = start; k < html.length; k++) {
        const c = html[k];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
        } else if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) {
                try { return JSON.parse(html.slice(start, k + 1)); } catch { return null; }
            }
        }
    }
    return null;
}

// 소개글은 정규화 캐시의 중첩 노드에 들어있어 재귀 탐색이 필요하다
function deepFindDescription(root) {
    const stack = [root];
    const seen = new Set();
    while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
        seen.add(cur);
        for (const [k, v] of Object.entries(cur)) {
            if (k.startsWith('description(') && typeof v === 'string' && v.trim()) return v;
            if (v && typeof v === 'object') stack.push(v);
        }
    }
    return null;
}

// ── 1) 플레이스 ID 검색 ─────────────────────────────────
// 검색은 차단에 가장 취약한 구간이다. 실측상 모바일 검색이 403 으로 막힌 동안에도
// PC 검색은 정상이었고 같은 플레이스 ID를 돌려주므로, 두 엔드포인트를 번갈아 쓴다.
const SEARCH_ENDPOINTS = [
    { name: 'pc', url: (q) => `https://search.naver.com/search.naver?query=${q}`, headers: { ...H_DESKTOP, Referer: 'https://www.naver.com/' } },
    { name: 'mobile', url: (q) => `https://m.search.naver.com/search.naver?query=${q}`, headers: { ...H_MOBILE, Referer: 'https://m.naver.com/' } },
];

// 마지막으로 성공한 엔드포인트를 먼저 시도해 막힌 쪽을 반복해서 두드리지 않는다
let preferredEndpoint = 0;

export async function searchPlaceIds(name, city) {
    const q = encodeURIComponent(`${city} ${name}`);
    let lastBlocked = null;

    for (let i = 0; i < SEARCH_ENDPOINTS.length; i++) {
        const idx = (preferredEndpoint + i) % SEARCH_ENDPOINTS.length;
        const ep = SEARCH_ENDPOINTS[idx];
        try {
            const html = await getText(ep.url(q), ep.headers);
            // 차단 판단은 HTTP 상태(403/429)로만 한다.
            // 본문에 'ncaptcha' 같은 문자열은 정상 페이지에도 들어 있어서, 이걸로 차단을 추정하면
            // '플레이스가 없는 학원'을 차단으로 오인해 배치 전체를 중단시킨다.
            preferredEndpoint = idx;
            return [...new Set([...html.matchAll(/place\/(\d+)/g)].map((m) => m[1]))];
        } catch (err) {
            if (!isBlocked(err)) throw err;
            lastBlocked = err;
        }
    }
    // 모든 검색 경로가 막힌 경우에만 배치를 중단시킨다
    throw lastBlocked || blockedError('네이버 검색 차단');
}

// ── 2) 플레이스 상세 조사 ───────────────────────────────
export async function probePlace(placeId) {
    const html = await getText(`https://m.place.naver.com/place/${placeId}/information`, H_MOBILE);
    const state = extractApolloState(html) || {};
    const base = state[`PlaceDetailBase:${placeId}`] || {};

    const menus = Object.entries(state)
        .filter(([k]) => k.startsWith(`Menu:${placeId}`))
        .map(([, v]) => ({
            name: v.name || '',
            price: v.price || '',
            imageCount: Array.isArray(v.images) ? v.images.length : 0,
        }));

    let blogId = null;
    const ref = base.naverBlog && base.naverBlog.__ref;
    if (ref) blogId = String(ref).replace(/^BaseNaverBlog:/, '');
    if (!blogId) {
        const node = Object.keys(state).find((k) => k.startsWith('BaseNaverBlog:'));
        if (node) blogId = node.slice('BaseNaverBlog:'.length);
    }

    return {
        placeId,
        placeName: base.name || '',
        category: base.category || '',
        phone: base.phone || '',
        roadAddress: base.roadAddress || base.address || '',
        intro: deepFindDescription(state) || '',
        menus,
        priceImageCount: menus.reduce((a, m) => a + m.imageCount, 0),
        blogId,
        placeUrl: `https://m.place.naver.com/place/${placeId}/home`,
    };
}

// ── 3) 블로그 본문 조사 ─────────────────────────────────
export function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function probeBlog(blogId) {
    const html = await getText(
        `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}`,
        H_DESKTOP
    );
    const text = htmlToText(html);
    return {
        blogId,
        blogUrl: `https://blog.naver.com/${blogId}`,
        textLength: text.length,
        feeMentioned: FEE_KEYWORD.test(text),
        regNos: extractRegNos(text),
    };
}

// 주소에서 도로명/동 토큰을 뽑아 대조 (0~1)
export function addressScore(masterAddr, placeAddr) {
    const a = (masterAddr || '').replace(/\s+/g, ' ').trim();
    const b = (placeAddr || '').replace(/\s+/g, ' ').trim();
    if (!a || !b) return 0;
    const tok = (s) => (s.match(/[가-힣]+(?:로|길|동|가)\d*/g) || []).map((t) => t.replace(/\d+$/, ''));
    const ta = new Set(tok(a)), tb = new Set(tok(b));
    if (!ta.size || !tb.size) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    return inter / Math.min(ta.size, tb.size);
}

// ── 판정 ────────────────────────────────────────────────
const MATCH_OK = 0.75;
const MATCH_MAYBE = 0.45;

export function buildResult({ academy, place, blog, matchScore, error }) {
    const masterDigits = String(academy.regNo || '').replace(/\D/g, '');
    const isHagwon = academy.category === '교습소';
    const numberLabel = isHagwon ? '신고번호' : '등록번호';

    if (error) {
        return {
            id: academy.id, name: academy.name, category: academy.category, regNo: academy.regNo,
            matchStatus: 'error', 판정: '확인불가', error: String(error), checkedAt: new Date().toISOString(),
        };
    }
    if (!place) {
        return {
            id: academy.id, name: academy.name, category: academy.category, regNo: academy.regNo,
            matchStatus: 'no_match', 판정: '확인불가',
            미이행사유: '네이버플레이스를 찾지 못함 — 직접 확인 필요',
            checkedAt: new Date().toISOString(),
        };
    }

    const matchStatus = matchScore >= MATCH_OK ? 'matched' : matchScore >= MATCH_MAYBE ? 'ambiguous' : 'no_match';

    // ── 플레이스: 교습비 / 등록(신고)번호 각각 판정 ──
    const introHasFee = FEE_KEYWORD.test(place.intro);
    const hasMenu = place.menus.length > 0;
    const hasPriceImage = place.priceImageCount > 0;
    const placeFee = hasMenu || hasPriceImage || introHasFee;

    const 플레이스_게시형태 = hasMenu && hasPriceImage ? '가격메뉴+이미지'
        : hasMenu ? '가격메뉴'
            : hasPriceImage ? '가격표이미지'
                : introHasFee ? '소개글텍스트'
                    : '없음';

    const introRegs = extractRegNos(place.intro);
    const 플레이스_기재번호 = [...new Set(introRegs.map((r) => r.raw))].join(',');
    const 플레이스_번호대조 = !introRegs.length ? '미기재'
        : introRegs.some((r) => r.digits === masterDigits) ? '일치' : '불일치';

    // ── 블로그: 교습비 / 등록(신고)번호 각각 판정 ──
    const blogRegs = blog ? blog.regNos : [];
    const 블로그_기재번호 = [...new Set(blogRegs.map((r) => r.raw))].join(',');
    const 블로그_번호대조 = !blog ? ''
        : !blogRegs.length ? '미기재'
            : blogRegs.some((r) => r.digits === masterDigits) ? '일치' : '불일치';

    // ── 종합 판정 ──
    // 확정 판정은 매칭이 확실할 때만. 애매하면 사람이 검수하도록 확인불가로 남긴다.
    // 블로그는 운영하는 곳만 대상 — 블로그가 없다는 사실 자체는 위반이 아니다.
    const 미이행사유 = [];
    if (matchStatus === 'matched') {
        if (!placeFee) 미이행사유.push('플레이스 교습비 미게시');
        if (플레이스_번호대조 === '미기재') 미이행사유.push(`플레이스 ${numberLabel} 미기재`);
        if (플레이스_번호대조 === '불일치') 미이행사유.push(`플레이스 ${numberLabel} 오기재(${플레이스_기재번호} ≠ ${academy.regNo})`);
        if (blog) {
            if (!blog.feeMentioned) 미이행사유.push('블로그 교습비 미게시');
            if (블로그_번호대조 === '미기재') 미이행사유.push(`블로그 ${numberLabel} 미기재`);
            if (블로그_번호대조 === '불일치') 미이행사유.push(`블로그 ${numberLabel} 오기재(${블로그_기재번호} ≠ ${academy.regNo})`);
        }
    }
    const 판정 = matchStatus !== 'matched' ? '확인불가'
        : 미이행사유.length ? '미이행' : '이행';

    return {
        id: academy.id,
        name: academy.name,
        category: academy.category,
        regNo: academy.regNo,
        matchStatus,
        matchScore: Math.round(matchScore * 100) / 100,
        플레이스ID: place.placeId,
        플레이스명: place.placeName,
        플레이스URL: place.placeUrl,
        플레이스_교습비: placeFee ? 'O' : 'X',
        플레이스_게시형태,
        플레이스_번호: 플레이스_번호대조 === '일치' ? 'O' : 'X',
        플레이스_기재번호,
        플레이스_번호대조,
        블로그: blog ? '있음' : '없음',
        블로그URL: blog ? blog.blogUrl : '',
        블로그_교습비: blog ? (blog.feeMentioned ? 'O' : 'X') : '',
        블로그_번호: !blog ? '' : 블로그_번호대조 === '일치' ? 'O' : 'X',
        블로그_기재번호,
        블로그_번호대조,
        판정,
        미이행사유: 미이행사유.join(' / '),
        checkedAt: new Date().toISOString(),
    };
}

// ── 학원 1곳 전체 조사 ──────────────────────────────────
// academy.placeId 가 있으면 검색 단계를 건너뛴다. 검색 엔드포인트가 차단에 가장 취약하므로,
// 한 번 찾아둔 플레이스 ID를 재사용하면 재조사 시 요청 수와 차단 위험이 크게 줄어든다.
export async function probeAcademy(academy, city) {
    try {
        const ids = academy.placeId
            ? [String(academy.placeId)]
            : await searchPlaceIds(academy.name, city);
        if (!ids.length) return buildResult({ academy, place: null });

        // 상위 후보를 순회하며 가장 그럴듯한 곳을 채택 (최대 3곳)
        // 점수 = 이름 유사도 0.7 + 주소 일치 0.3, 등록번호가 실제로 일치하면 강한 증거로 가산
        const masterDigits = String(academy.regNo || '').replace(/\D/g, '');
        let best = null, bestScore = -1;
        for (const id of ids.slice(0, 3)) {
            const place = await probePlace(id);
            const nScore = nameScore(academy.name, place.placeName);
            const aScore = addressScore(academy.address, place.roadAddress);
            // 주소를 대조할 수 없으면(둘 중 하나가 비었거나 토큰이 안 겹치면) 이름만으로 판단한다.
            // 주소 미확보를 '불일치'로 취급해 정상 매칭을 깎아내리면 안 되기 때문.
            let score = aScore > 0 ? nScore * 0.7 + aScore * 0.3 : nScore;
            if (masterDigits && extractRegNos(place.intro).some((r) => r.digits === masterDigits)) {
                score = Math.min(1, score + 0.3);
            }
            if (score > bestScore) { bestScore = score; best = place; }
            if (score >= MATCH_OK) break;
            await sleep(300);
        }

        let blog = null;
        if (best && best.blogId) {
            try { blog = await probeBlog(best.blogId); } catch { blog = null; }
        }
        return buildResult({ academy, place: best, blog, matchScore: bestScore });
    } catch (err) {
        // 차단은 이 학원의 문제가 아니라 배치 전체의 문제 — 호출부가 중단하도록 그대로 올린다.
        // (여기서 '확인불가'로 삼키면 멀쩡한 기존 결과를 차단 결과로 덮어쓰게 된다)
        if (isBlocked(err)) throw err;
        return buildResult({ academy, error: err.message });
    }
}
