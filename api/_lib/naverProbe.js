// 네이버플레이스에 연결된 채널(블로그·홈페이지·인스타그램)의 교습비·등록(신고)번호 게시 여부 자동 조사
//
// 조사 경로 (실측 검증됨)
//   1) m.search.naver.com / search.naver.com 검색 → 플레이스 ID
//   2) pcmap.place.naver.com/place/{id}/home → window.__APOLLO_STATE__.ROOT_QUERY.placeDetail(...)
//      - description(...)  : 정보 탭 소개글 전문        (m.place 는 이 값을 SSR 에 안 실어준다)
//      - menuImages        : 가격표 이미지 ("가격표 이미지로 보기")
//      - menus             : 가격 메뉴
//      - homepages         : 홈 탭에 걸린 링크 목록 (블로그/홈페이지/인스타그램…)
//   3) homepages 에 걸린 링크만 하나씩 조사한다.
//      플레이스에 링크가 없는 채널은 별도로 검색하지 않는다 — 검색으로 찾은 블로그는
//      동명이인·본원 블로그인 경우가 많아 오판의 주범이었다.

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const H_MOBILE = { 'User-Agent': UA_MOBILE, 'Accept-Language': 'ko-KR,ko;q=0.9' };
const H_DESKTOP = { 'User-Agent': UA_DESKTOP, 'Accept-Language': 'ko-KR,ko;q=0.9' };
const H_PCMAP = { ...H_DESKTOP, Referer: 'https://map.naver.com/' };

const FETCH_TIMEOUT_MS = 12000;
// 네이버가 아닌 곳(학원 홈페이지 등)은 응답이 없어도 오래 붙들고 있을 이유가 없다
const FETCH_TIMEOUT_EXTERNAL_MS = 7000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isBlocked(err) {
    return err && err.code === 'BLOCKED';
}

/** 차단이 어느 엔드포인트에서 났는지 — 'search' | 'place' | 'blog' */
export function blockedScope(err) {
    return (err && err.scope) || '';
}

function blockedError(msg, scope) {
    const e = new Error(msg);
    e.code = 'BLOCKED';
    e.scope = scope || '';
    return e;
}

// 403/429 를 차단으로 볼 곳은 네이버뿐이다.
// 인스타그램 API 는 서버(데이터센터 IP)에서 부르면 거의 항상 401/403 을 주고,
// 학원 홈페이지도 Cloudflare 같은 방화벽이 봇을 403 으로 막는 일이 흔하다.
// 이걸 네이버 차단으로 오인하면 아무리 기다려도 안 풀리는 대기에 배치가 갇힌다.
//
// 네이버 안에서도 한 덩어리로 보면 안 된다. 실측상 pcmap.place 는 IP당 허용치가 유난히 빡빡해서
// 열 몇 건이면 429 가 나는데, 그 순간에도 search 와 m.place 는 200 을 준다.
// 예전에는 이걸 전부 '네이버 전면 차단'으로 보고 배치를 3~40분씩 세웠다.
function naverScope(url) {
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return ''; }
    if (!/(^|\.)naver\.com$/.test(host)) return '';
    if (host.endsWith('search.naver.com')) return 'search';
    if (host.endsWith('place.naver.com')) return 'place';
    return 'blog';   // blog / m.blog / rss.blog
}

async function getText(url, headers, timeoutMs) {
    const scope = naverScope(url);
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(),
        timeoutMs || (scope ? FETCH_TIMEOUT_MS : FETCH_TIMEOUT_EXTERNAL_MS)
    );
    try {
        const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
        // 네이버의 429/403 은 요청이 과했다는 뜻 — 어느 엔드포인트가 막혔는지까지 실어 보낸다.
        // 그 외 호스트의 403 은 그 채널 하나만 '확인불가'로 두고 계속 간다.
        if (res.status === 403 || res.status === 429) {
            if (scope) throw blockedError(`네이버 ${scope} 요청 제한 (HTTP ${res.status})`, scope);
            throw new Error(`HTTP ${res.status} (차단 아님 — 해당 사이트가 봇 접근을 막음)`);
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

// HTML 엔티티 복원 — 인스타그램 소개글은 &#xd559; 같은 16진 엔티티로만 들어온다
export function decodeEntities(s) {
    return String(s || '')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

// ── 등록(신고)번호 추출 ──────────────────────────────────
// 실측 사례
//   "제5170호", "학원등록번호 : 제 1185호", "(교육청 제1328호)", "제 1894 호",
//   "(등록번호 : 하남56)", "(송파클릭직영/하남383호)"  ← '제' 없이 지역명+번호+호
const RE_HO = /제\s*([가-힣]{0,8})\s*(\d{1,6})\s*호/g;
const RE_LABELED = /(?:등록|신고)\s*번호\s*[:：]?\s*(?:제\s*)?([가-힣]{0,8})\s*(\d{1,6})\s*호?/g;
// '제' 없이 쓰는 형태. 주소의 호실(2층 219, 220호 / 101동 1503호)과 섞이지 않도록
// 숫자 바로 앞에 한글 접두어가 붙어 있을 때만 인정하고, 아래 단위어는 걸러낸다.
const RE_BARE = /([가-힣]{2,8})\s*(\d{1,6})\s*호/g;
// 학원 이름 뒤 괄호 안에 번호를 적는 곳이 많다 — '하남정상어학원(1068호)'.
// 괄호를 건너뛰지 않으면 이런 번호를 통째로 놓친다. 실제로 한 블로그에 8곳 번호가 다 적혀
// 있는데 접두어가 붙은 '하남342호' 둘만 읽혀 나머지 학원이 '오기재'로 몰렸다.
// 다만 '나룰음악학원(2호)' 처럼 괄호 안 한 자리 숫자는 지점 표시다 — 두 자리부터 번호로 본다.
// (한 자리 등록번호는 '하남9' 처럼 지역 접두어를 달고 있어 위 RE_BARE 가 잡는다)
const RE_PAREN = /([가-힣]{2,8})\s*[([{（［]\s*(\d{2,6})\s*호/g;
const ADDR_UNIT = /(층|동|가|로|길|번지|아파트|빌라|빌딩|상가|타워|프라자|플라자|오피스텔|타운|관|실|룸|객실|세대)$/;

export function extractRegNos(text) {
    if (!text) return [];
    const found = [];
    for (const [re, loose] of [[RE_HO, false], [RE_LABELED, false], [RE_BARE, true], [RE_PAREN, true]]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
            const prefix = (m[1] || '').trim();
            const digits = m[2];
            // 느슨한 패턴은 '3층 201호' 같은 주소 표기를 등록번호로 오인하기 쉽다
            if (loose && (!prefix || ADDR_UNIT.test(prefix))) continue;
            found.push({ raw: (prefix ? `${prefix}${digits}호` : `제${digits}호`), prefix, digits });
        }
    }
    const seen = new Set();
    return found.filter((f) => {
        const k = f.digits;   // 같은 번호를 접두어만 달리 잡은 중복 제거
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

export const FEE_KEYWORD = /교습비|수강료|수업료|학원비|원비/;

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

// Apollo 캐시 키는 인자가 붙어 있어서(예: description({"source":[...]})) 이름만으로 찾는다
function fieldByName(node, name) {
    if (!node) return undefined;
    const key = Object.keys(node).find((k) => k === name || k.startsWith(`${name}(`));
    return key === undefined ? undefined : node[key];
}

// 소개글이 중첩 노드에 들어가는 경우도 있어 재귀 탐색을 백업으로 둔다
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
    const q = encodeURIComponent(`${city} ${name}`.trim());
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

// '포도나무수학초중등관학원' 처럼 관·캠퍼스 이름이 붙은 곳은 그 이름으로는 플레이스가 안 잡힌다.
// (플레이스·블로그는 본관과 같이 쓰는 경우가 많다) 검색이 빈손일 때 한 번 더 시도할 축약형을 만든다.
const BRANCH_TOKEN = /(초중등관|중고등관|초등관|중등관|고등관|영어관|수학관|본관|분관|별관|제\d+관|\d+관|캠퍼스)/g;

/**
 * 주소에서 도로명+건물번호까지만 남긴다.
 * '경기도 하남시 미사강변대로 216 403호' → '경기도 하남시 미사강변대로 216'
 * 상세주소(동·호)가 붙어 있으면 검색이 오히려 안 잡힌다.
 */
export function addressQuery(address) {
    // 탐욕적으로 잡아 '위례대로 21길 15-3' 처럼 뒤에 오는 길 번호까지 살린다
    // (비탐욕이면 '위례대로 21' 에서 끊겨 엉뚱한 주소가 된다)
    const m = String(address || '').match(/^(.*(?:로|길)\s*\d+(?:-\d+)?)/);
    return (m ? m[1] : String(address || '')).trim();
}

export function shortenName(name) {
    const s = String(name || '').trim();
    const tail = s.endsWith('교습소') ? '교습소' : s.endsWith('학원') ? '학원' : '';
    const body = tail ? s.slice(0, -tail.length) : s;
    const cut = body.replace(BRANCH_TOKEN, '').trim();
    if (!cut || cut === body) return '';
    return cut + tail;
}

// ── 링크 분류 ───────────────────────────────────────────
// 플레이스 홈에 걸린 링크만 대상으로 한다. type 은 사업주가 고른 라벨이라 믿을 수 없어서
// (블로그를 '홈페이지'로 등록해 둔 사례가 흔하다) URL 을 보고 다시 판정한다.
export function classifyLink(url, declaredType) {
    const raw = String(url || '').trim();
    if (!raw) return null;
    let u;
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const seg = u.pathname.split('/').filter(Boolean);

    if (host === 'blog.naver.com' || host === 'm.blog.naver.com') {
        const blogId = u.searchParams.get('blogId') || seg[0] || '';
        if (!blogId) return null;
        return { kind: 'blog', label: '네이버블로그', id: blogId, url: `https://blog.naver.com/${blogId}`, declaredType };
    }
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
        const handle = (seg[0] || '').replace(/^@/, '');
        if (!handle || ['p', 'reel', 'explore', 'stories'].includes(handle)) return null;
        return { kind: 'instagram', label: '인스타그램', id: handle, url: `https://www.instagram.com/${handle}/`, declaredType };
    }
    if (host === 'cafe.naver.com') {
        return { kind: 'homepage', label: '네이버카페', url: u.toString(), declaredType };
    }
    return { kind: 'homepage', label: declaredType || '홈페이지', url: u.toString(), declaredType };
}

// ── 2) 플레이스 상세 조사 ───────────────────────────────
// pcmap(PC) 은 소개글·가격표·연결 링크를 SSR 로 다 실어준다. m.place(모바일) 는
// 이것들을 클라이언트에서 따로 불러오기 때문에 SSR 캐시에 없다 — 이게 '교습비 있는데 미게시',
// '소개글에 등록번호 있는데 미기재' 오판의 원인이었다.
export async function probePlace(placeId) {
    let state = null;
    let introUnavailable = false;
    try {
        state = extractApolloState(await getText(`https://pcmap.place.naver.com/place/${placeId}/home`, H_PCMAP));
    } catch (err) {
        // pcmap 이 429 로 막혀도 m.place 는 살아 있는 경우가 대부분이다.
        // 예전에는 여기서 그대로 올려버려 바로 아래 대체 경로에 닿지도 못했다.
        if (isBlocked(err) && blockedScope(err) !== 'place') throw err;
    }
    if (!state) {
        // m.place 는 가격 메뉴와 연결 링크는 실어주지만 소개글(description)은 안 준다.
        // 등록번호는 소개글에서 뽑으므로, 이 경로로 온 결과는 번호를 판정하지 않고 보류한다.
        state = extractApolloState(await getText(`https://m.place.naver.com/place/${placeId}/information`, H_MOBILE)) || {};
        introUnavailable = true;
    }

    const base = state[`PlaceDetailBase:${placeId}`] || {};
    const detail = fieldByName(state.ROOT_QUERY || {}, 'placeDetail') || {};

    // 가격 메뉴 (구형 Menu 노드 / placeDetail.menus 둘 다 지원)
    const menuNodes = Object.entries(state)
        .filter(([k]) => k.startsWith(`Menu:${placeId}`))
        .map(([, v]) => v);
    const menusField = fieldByName(detail, 'menus');
    const menuList = Array.isArray(menusField) ? menusField : menuNodes;
    const menus = menuList.map((v) => ({
        name: (v && v.name) || '',
        price: (v && v.price) || '',
        imageCount: Array.isArray(v && v.images) ? v.images.length : 0,
    }));

    // "가격표 이미지로 보기" — 이미지로만 올린 교습비도 게시로 본다
    const menuImages = fieldByName(detail, 'menuImages');
    const priceImageCount = (Array.isArray(menuImages) ? menuImages.length : 0)
        + menus.reduce((a, m) => a + m.imageCount, 0);

    const intro = fieldByName(detail, 'description') || deepFindDescription(state) || '';

    // 홈 탭에 걸린 링크 (대표 1개 + 기타 N개)
    const hp = fieldByName(detail, 'homepages') || {};
    const rawLinks = [hp.repr, ...(Array.isArray(hp.etc) ? hp.etc : [])].filter(Boolean);
    const links = [];
    const seenUrl = new Set();
    for (const l of rawLinks) {
        if (l.isDeadUrl) continue;
        const c = classifyLink(l.landingUrl || l.url, l.typeI18n || l.type);
        if (!c || seenUrl.has(c.url)) continue;
        seenUrl.add(c.url);
        links.push(c);
    }
    // 링크 목록이 비었을 때만 naverBlog 연결 정보를 백업으로 쓴다
    if (!links.length) {
        const ref = base.naverBlog && base.naverBlog.__ref;
        const blogId = ref ? String(ref).replace(/^BaseNaverBlog:/, '')
            : (Object.keys(state).find((k) => k.startsWith('BaseNaverBlog:')) || '').slice('BaseNaverBlog:'.length);
        if (blogId) links.push({ kind: 'blog', label: '네이버블로그', id: blogId, url: `https://blog.naver.com/${blogId}` });
    }

    return {
        placeId,
        placeName: base.name || '',
        category: base.category || '',
        phone: base.virtualPhone || base.phone || '',
        roadAddress: base.roadAddress || base.address || '',
        intro,
        // 소개글을 못 받은 경로로 왔다 — 소개글이 실제로 딸려왔다면 굳이 보류할 것 없다
        introUnavailable: introUnavailable && !intro,
        menus,
        priceImageCount,
        links,
        placeUrl: `https://m.place.naver.com/place/${placeId}/home`,
    };
}

// ── 3) 연결 채널 조사 ───────────────────────────────────
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

// 블로그에서 교습비·등록번호를 어디에 적어두는지가 제각각이라 세 군데를 본다.
//   1) m.blog        — 사이드바 '소개'. PC PostList 에는 이 글이 안 들어온다.
//                      (예: "[학원등록번호:제1537호]")
//   2) RSS           — 최근 글 본문. PostList 는 본문을 iframe 으로 따로 불러와 껍데기뿐이다.
//   3) 블로그 내 검색 — 오래된 '교습비' 글은 최근 글에도 사이드바에도 안 잡힌다.
//                      블로그 자체 검색이 이런 글을 정확히 찾아준다.
async function fetchTextOrNull(url, headers) {
    try { return htmlToText(await getText(url, headers)); }
    catch (err) { if (isBlocked(err)) throw err; return null; }
}

/** 블로그 안에서 keyword 로 글을 검색한다. { count, text } — text 는 검색결과 요약(본문 일부 포함) */
async function searchInBlog(blogId, keyword) {
    const text = await fetchTextOrNull(
        `https://blog.naver.com/PostSearchList.naver?blogId=${encodeURIComponent(blogId)}&SearchText=${encodeURIComponent(keyword)}`,
        H_DESKTOP
    );
    if (text === null) return null;
    const m = text.match(/검색결과\s*([\d,]+)\s*건/);
    return { count: m ? Number(m[1].replace(/,/g, '')) : 0, text };
}

async function probeBlogChannel(link) {
    const id = link.id;
    // 소개(m.blog)와 최근 글(RSS)은 서로 독립이라 동시에 받는다 — 순차로 받으면 이유 없이 두 배 걸린다
    const settled = await Promise.allSettled([
        fetchTextOrNull(`https://m.blog.naver.com/${encodeURIComponent(id)}`, H_MOBILE),
        fetchTextOrNull(`https://rss.blog.naver.com/${encodeURIComponent(id)}.xml`, H_DESKTOP),
    ]);
    const blockedHit = settled.find((s) => s.status === 'rejected' && isBlocked(s.reason));
    if (blockedHit) throw blockedHit.reason;
    const parts = settled.filter((s) => s.status === 'fulfilled' && s.value).map((s) => s.value);
    if (!parts.length) throw new Error('블로그를 열지 못했습니다');

    let feeMentioned = FEE_KEYWORD.test(parts.join(' '));
    let regNos = extractRegNos(parts.join(' '));

    // 소개·최근 글에서 못 찾았을 때만 검색한다 (요청 수를 아끼기 위해)
    if (!feeMentioned) {
        for (const kw of ['교습비', '수강료']) {
            const hit = await searchInBlog(id, kw);
            if (!hit) break;
            if (hit.count > 0) {
                feeMentioned = true;
                // 검색 결과 미리보기에 등록번호가 같이 적혀 있는 경우가 많다
                if (!regNos.length) regNos = extractRegNos(hit.text);
                break;
            }
        }
    }
    if (!regNos.length) {
        const hit = await searchInBlog(id, '등록번호');
        // 검색 건수는 '등록'만 걸려도 올라가므로, 실제로 번호가 적힌 경우만 인정한다
        if (hit) regNos = extractRegNos(hit.text);
    }

    return { feeMentioned, regNos, scope: '소개·최근 글·블로그 내 검색' };
}

// 인스타그램은 로그인 없이 게시물 본문을 볼 수 없다. 첫 화면 소개글(bio)만 판정 대상으로 삼는다.
// bio 는 <meta name="description"> 안에 "… Instagram 계정: '<소개글>'" 형태로 들어 있다.
export function extractInstagramBio(html) {
    const metas = [...html.matchAll(/<meta[^>]+name="description"[^>]*>/gi)]
        .concat([...html.matchAll(/<meta[^>]+property="og:description"[^>]*>/gi)]);
    for (const m of metas) {
        const c = m[0].match(/content="([^"]*)"/i);
        if (!c) continue;
        const txt = decodeEntities(c[1]);
        const quoted = txt.match(/[:：]\s*'([\s\S]*)'\s*$/);
        if (quoted) return quoted[1].trim();
    }
    return '';
}

// 인스타그램 웹이 자기 프로필을 그릴 때 쓰는 엔드포인트. HTML 은 로그인 벽에 막히는 경우가 있는데
// (서버에서 부르면 특히) 이쪽은 소개글을 그대로 준다.
async function fetchInstagramBioViaApi(handle) {
    const json = await getText(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
        {
            ...H_DESKTOP,
            'x-ig-app-id': '936619743392459',
            Accept: '*/*',
            Referer: `https://www.instagram.com/${handle}/`,
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
        }
    );
    return (JSON.parse(json)?.data?.user?.biography || '').trim();
}

async function probeInstagramChannel(link) {
    let bio = '';
    if (link.id) {
        try { bio = await fetchInstagramBioViaApi(link.id); }
        catch (err) { if (isBlocked(err)) throw err; }
    }
    if (!bio) bio = extractInstagramBio(await getText(link.url, H_MOBILE));
    if (!bio) {
        return { unavailable: true, scope: '첫 화면 소개글', note: '소개글을 읽지 못했습니다 (비공개이거나 인스타그램이 차단)' };
    }
    return {
        feeMentioned: FEE_KEYWORD.test(bio),
        regNos: extractRegNos(bio),
        scope: '첫 화면 소개글',
        excerpt: bio.slice(0, 200),
    };
}

async function probeHomepageChannel(link) {
    const html = await getText(link.url, H_DESKTOP);
    const text = htmlToText(html).slice(0, 200000);
    return {
        feeMentioned: FEE_KEYWORD.test(text),
        regNos: extractRegNos(text),
        scope: '첫 페이지',
    };
}

/** 플레이스에 연결된 링크 1개를 조사한다. 실패해도 배치를 멈추지 않는다(차단 제외). */
export async function probeChannel(link) {
    const out = { kind: link.kind, label: link.label, url: link.url, id: link.id || '' };
    try {
        const r = link.kind === 'blog' ? await probeBlogChannel(link)
            : link.kind === 'instagram' ? await probeInstagramChannel(link)
                : await probeHomepageChannel(link);
        return { ...out, ...r, ok: !r.unavailable };
    } catch (err) {
        if (isBlocked(err)) throw err;
        return { ...out, ok: false, unavailable: true, note: `열지 못했습니다 (${err.message})` };
    }
}

// ── 지점(호점) 구분 ─────────────────────────────────────
// '나룰음악학원'과 '나룰음악학원(2호)'는 등록번호가 다른 별개의 학원이고 플레이스·블로그도 따로다.
// 그런데 이름이 거의 같아 유사도만 보면 1호점이 '나룰음악학원 2호점' 플레이스에 붙어버린다.
//
// 반면 '○○2관학원'·'중심관'·'기백고등수학관' 같은 관·캠퍼스 이름은 본관과 플레이스·블로그를
// 함께 쓰는 곳이 많다(shortenName 재검색이 그것을 노린 것이다). 그래서 벌점은 '호점'에만 준다.
const BRANCH_NO = /(?:^|[^0-9])(\d{1,2})\s*호점|\(\s*(\d{1,2})\s*호\s*\)|제\s*(\d{1,2})\s*호점/;

export function branchNo(name) {
    const m = String(name || '').match(BRANCH_NO);
    if (!m) return null;
    const n = Number(m[1] || m[2] || m[3]);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 마스터 학원명과 플레이스명의 지점 번호를 견줘 점수 배수를 돌려준다.
 * 1호점(번호 없음) 학원이 '2호점' 플레이스를 잡는 것을 막는 것이 목적이다.
 */
export function branchPenalty(masterName, placeName) {
    const a = branchNo(masterName);
    const b = branchNo(placeName);
    if (a === b) return 1;              // 둘 다 없거나 같은 지점
    if (a !== null && b !== null) return 0.4;   // 2호점 ↔ 3호점
    return 0.6;                          // 한쪽에만 지점 표시가 있다
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

const shortUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function compareRegNos(regNos, masterDigits) {
    if (!regNos || !regNos.length) return '미기재';
    return regNos.some((r) => r.digits === masterDigits) ? '일치' : '불일치';
}

export function buildResult({ academy, place, channels = [], matchScore, error }) {
    const masterDigits = String(academy.regNo || '').replace(/\D/g, '');
    const isGyoseupso = academy.category === '교습소';
    const numberLabel = isGyoseupso ? '신고번호' : '등록번호';

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
    // pcmap 이 막혀 m.place 로 받아온 경우 소개글이 없다.
    // 소개글에만 교습비를 적어둔 곳도, 등록번호를 적어둔 곳도 있으므로
    // '못 봤다'를 '없다'로 바꿔 읽으면 멀쩡한 학원을 미이행으로 몰게 된다. 보류한다.
    const introUnknown = !!place.introUnavailable;
    const introHasFee = FEE_KEYWORD.test(place.intro);
    const hasMenu = place.menus.length > 0;
    const hasPriceImage = place.priceImageCount > 0;
    // 메뉴·가격표가 있으면 소개글을 못 봐도 게시가 확실하다. 없을 때만 판정을 보류한다.
    const feeConfirmed = hasMenu || hasPriceImage || introHasFee;
    const placeFee = feeConfirmed || (introUnknown ? null : false);

    const 플레이스_게시형태 = hasMenu && hasPriceImage ? '가격메뉴+가격표이미지'
        : hasMenu ? '가격메뉴'
            : hasPriceImage ? '가격표이미지'
                : introHasFee ? '소개글텍스트'
                    : introUnknown ? '확인불가'
                        : '없음';

    const introRegs = extractRegNos(place.intro);
    const 플레이스_기재번호 = introUnknown ? '' : [...new Set(introRegs.map((r) => r.raw))].join(',');
    const 플레이스_번호대조 = introUnknown ? '확인불가' : compareRegNos(introRegs, masterDigits);

    // ── 연결 채널별 판정 ──
    const 채널 = channels.map((c) => {
        // 아예 부르지 않은 채널(인스타그램)은 '확인불가'와도 구분한다.
        // 확인불가는 '열려다 실패'라 다시 시도할 값이 있지만, 이쪽은 의도적으로 안 본 것이다.
        if (c.notProbed) {
            return {
                유형: c.label, 종류: c.kind, url: c.url,
                교습비: '-', 번호: '-', 번호대조: '조사안함', 기재번호: '',
                조사범위: '조사 안 함',
                비고: '소개글 한 줄만 보이고 서버에서는 거의 열리지 않아 자동 조사 대상에서 뺐습니다 — 링크로 직접 확인하세요',
                소개글: '',
            };
        }
        const 대조 = c.unavailable ? '확인불가' : compareRegNos(c.regNos, masterDigits);
        return {
            유형: c.label,
            종류: c.kind,
            url: c.url,
            교습비: c.unavailable ? '?' : c.feeMentioned ? 'O' : 'X',
            번호: c.unavailable ? '?' : 대조 === '일치' ? 'O' : 'X',
            번호대조: 대조,
            기재번호: c.unavailable ? '' : [...new Set((c.regNos || []).map((r) => r.raw))].join(','),
            조사범위: c.scope || '',
            비고: c.note || '',
            소개글: c.excerpt || '',
        };
    });

    // 표·시트의 '블로그' 칸은 대표 블로그(플레이스 홈의 블로그 링크) 기준으로 채운다
    const blogCh = 채널.find((c) => c.종류 === 'blog') || null;

    // ── 종합 판정 ──
    // 확정 판정은 매칭이 확실할 때만. 애매하면 사람이 검수하도록 확인불가로 남긴다.
    // 채널은 플레이스에 링크가 걸린 곳만 대상 — 블로그가 없다는 사실 자체는 위반이 아니다.
    const 미이행사유 = [];
    if (matchStatus === 'matched') {
        if (placeFee === false) 미이행사유.push('플레이스 교습비 미게시');
        if (플레이스_번호대조 === '미기재') 미이행사유.push(`플레이스 ${numberLabel} 미기재`);
        if (플레이스_번호대조 === '불일치') 미이행사유.push(`플레이스 ${numberLabel} 오기재(${플레이스_기재번호} ≠ ${academy.regNo})`);
        for (const c of 채널) {
            // 열지 못한 채널도, 아예 안 본 채널도 판정하지 않는다
            if (c.번호대조 === '확인불가' || c.번호대조 === '조사안함') continue;
            const 이름 = c.종류 === 'instagram' ? '인스타그램 소개글' : `${c.유형}(${shortUrl(c.url)})`;
            // 인스타그램 프로필 소개글은 150자 한 줄이라 교습비를 적는 자리가 아니다.
            // 표본 14곳 중 교습비를 적어둔 곳은 1곳뿐이었는데 14곳 모두 미이행이 됐다 —
            // 학원이 안 지킨 게 아니라 근거로 삼을 자리가 아니어서 생기는 오판이다.
            // 반면 등록번호는 짧아서 실제로 36%가 적어두므로 판정에 반영한다.
            if (c.교습비 === 'X' && c.종류 !== 'instagram') 미이행사유.push(`${이름} 교습비 미게시`);
            if (c.번호대조 === '미기재') 미이행사유.push(`${이름} ${numberLabel} 미기재`);
            if (c.번호대조 === '불일치') 미이행사유.push(`${이름} ${numberLabel} 오기재(${c.기재번호} ≠ ${academy.regNo})`);
        }
    }
    const 판정 = matchStatus !== 'matched' ? '확인불가'
        : 미이행사유.length ? '미이행'
            : introUnknown ? '확인불가' : '이행';

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
        플레이스_교습비: placeFee === null ? '?' : placeFee ? 'O' : 'X',
        플레이스_게시형태,
        플레이스_번호: 플레이스_번호대조 === '확인불가' ? '?'
            : 플레이스_번호대조 === '일치' ? 'O' : 'X',
        플레이스_기재번호,
        플레이스_번호대조,
        블로그: blogCh ? '있음' : '없음',
        블로그URL: blogCh ? blogCh.url : '',
        블로그_교습비: blogCh ? blogCh.교습비 : '',
        블로그_번호: blogCh ? blogCh.번호 : '',
        블로그_기재번호: blogCh ? blogCh.기재번호 : '',
        블로그_번호대조: blogCh ? blogCh.번호대조 : '',
        채널수: 채널.length,
        채널상세: JSON.stringify(채널),
        판정,
        미이행사유: 미이행사유.join(' / ')
            || (introUnknown ? '플레이스 소개글을 읽지 못해 보류 — 잠시 뒤 다시 확인' : ''),
        checkedAt: new Date().toISOString(),
        // 소개글을 못 봐 반쪽만 본 결과. 시트에는 저장되지 않고(resultToRecord 가 아는 키만 옮긴다)
        // 이미 제대로 조사해 둔 행을 덮어쓰지 않도록 프론트가 판단하는 데 쓴다.
        partial: introUnknown,
    };
}

// ── 학원 1곳 전체 조사 ──────────────────────────────────
// academy.placeId 가 있으면 검색 단계를 건너뛴다. 검색 엔드포인트가 차단에 가장 취약하므로,
// 한 번 찾아둔 플레이스 ID를 재사용하면 재조사 시 요청 수와 차단 위험이 크게 줄어든다.
const MAX_CHANNELS = 4;   // 링크를 잔뜩 걸어둔 곳에서 요청이 폭증하지 않도록
// 플레이스 상세(pcmap)는 IP당 허용치가 가장 빡빡한 엔드포인트다. 후보를 3곳씩 훑으면
// 학원 한 곳에 요청 3건이 몰려 금방 429 가 난다. 기본 2곳으로 줄이고 사이도 넉넉히 벌린다.
// 다만 2곳을 봐도 그럴듯한 곳이 없으면(=어차피 확인불가로 남을 판이면) 마지막 한 곳은 더 본다.
const MAX_PLACE_CANDIDATES = 2;
const MAX_PLACE_CANDIDATES_HARD = 3;
const PLACE_GAP_MS = 1200;

/**
 * 후보 플레이스를 순서대로 훑어 가장 그럴듯한 곳을 고른다.
 * 점수 = 이름 유사도 0.7 + 주소 일치 0.3 → 지점 어긋남 벌점 → 등록번호가 실제로 적혀 있으면 가산.
 */
async function pickPlace(ids, academy) {
    const masterDigits = String(academy.regNo || '').replace(/\D/g, '');
    let best = null, bestScore = -1, seen = 0;
    for (const id of ids) {
        // 앞의 두 곳 중 하나라도 그럴듯했다면 세 번째는 보지 않는다
        if (seen >= MAX_PLACE_CANDIDATES && bestScore >= MATCH_MAYBE) break;
        seen++;
        const place = await probePlace(id);
        const nScore = nameScore(academy.name, place.placeName);
        const aScore = addressScore(academy.address, place.roadAddress);
        // 주소를 대조할 수 없으면(둘 중 하나가 비었거나 토큰이 안 겹치면) 이름만으로 판단한다.
        // 주소 미확보를 '불일치'로 취급해 정상 매칭을 깎아내리면 안 되기 때문.
        let score = aScore > 0 ? nScore * 0.7 + aScore * 0.3 : nScore;
        // 지점이 어긋나면 크게 깎는다 — 1호점 학원이 2호점 플레이스를 잡는 것을 막는다
        score *= branchPenalty(academy.name, place.placeName);
        // 소개글에 이 학원의 등록번호가 실제로 적혀 있으면 가장 강한 증거다 (벌점 뒤에 더한다)
        if (masterDigits && extractRegNos(place.intro).some((r) => r.digits === masterDigits)) {
            score = Math.min(1, score + 0.3);
        }
        if (score > bestScore) { bestScore = score; best = place; }
        if (score >= MATCH_OK) break;
        await sleep(PLACE_GAP_MS);
    }
    return { best, bestScore };
}

/**
 * 담당자가 비고에 붙여넣은 단축주소(naver.me)를 실제 플레이스 번호로 편다.
 * 휴대폰 네이버지도의 '공유'가 이 형태를 주므로 실사용에서 가장 흔한데, 주소 안에 번호가 없다.
 * 못 펴면 빈 값을 돌려준다 — 호출부는 평소대로 이름으로 검색한다.
 */
export async function resolvePlaceShortUrl(url) {
    const s = String(url || '').trim();
    if (!/^https?:\/\/naver\.me\/[A-Za-z0-9]+$/i.test(s)) return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(s, { headers: H_MOBILE, signal: controller.signal, redirect: 'follow' });
        if (!res.ok) return '';
        const fromUrl = String(res.url || '').match(/place\/(\d+)/);
        if (fromUrl) return fromUrl[1];
        // 중간 페이지를 거치면 최종 주소에 번호가 없다 — 본문에서 찾는다
        const body = await res.text();
        const m = body.match(/place\/(\d+)/) || body.match(/[?&]id=(\d{6,})/);
        return m ? m[1] : '';
    } catch {
        return '';
    } finally {
        clearTimeout(timer);
    }
}

export async function probeAcademy(academy, city) {
    try {
        // 비고에 적어둔 단축주소는 먼저 펴서 번호로 바꾼다. 못 펴면 이름으로 찾는 평소 길로 간다.
        const placeId = String(academy.placeId || '')
            || (academy.placeHint ? await resolvePlaceShortUrl(academy.placeHint) : '');
        let ids = placeId
            ? [placeId]
            : await searchPlaceIds(academy.name, city);
        if (!ids.length && !placeId) {
            // 본관과 플레이스·블로그를 함께 쓰는 '○○관' 학원을 위한 재시도
            const alt = shortenName(academy.name);
            if (alt) {
                await sleep(300);
                ids = await searchPlaceIds(alt, city);
            }
        }
        if (!ids.length && !placeId) {
            // 이름으로 못 찾는 곳이 꽤 있다. 마스터 상호가 두 학원을 합쳐 놓은 경우
            // ('대치메이드세이노미사점학원' ← 플레이스는 '대치메이드학원 미사점', '대치세이노학원 미사점')
            // 이름은 안 걸려도 주소로는 잡힌다. 실제로 플레이스가 아예 없는 학원은 드물다.
            const addr = addressQuery(academy.address);
            if (addr) {
                await sleep(300);
                // 주소는 그 자체로 지역을 담고 있어 도시명을 덧붙이지 않는다
                ids = await searchPlaceIds(addr, '');
            }
        }
        if (!ids.length) return buildResult({ academy, place: null });

        let { best, bestScore } = await pickPlace(ids.slice(0, MAX_PLACE_CANDIDATES_HARD), academy);

        // 저장해 둔 플레이스를 그대로 다시 쓰는 길(검색 생략)에서는 예전에 잘못 잡은 곳이 계속 굳는다.
        // 지점이 어긋나 있으면(1호점 학원인데 '2호점' 플레이스) 그 값을 버리고 이름으로 다시 찾는다.
        // 담당자가 직접 지정한 곳은 건드리지 않는다.
        if (placeId && !academy.placePinned && best && branchPenalty(academy.name, best.placeName) < 1) {
            const wrong = placeId;
            await sleep(300);
            const fresh = (await searchPlaceIds(academy.name, city)).filter((id) => id !== wrong);
            if (fresh.length) {
                const alt = await pickPlace(fresh.slice(0, MAX_PLACE_CANDIDATES), academy);
                if (alt.best && alt.bestScore > bestScore) { best = alt.best; bestScore = alt.bestScore; }
            }
        }

        // 담당자가 직접 지정한 플레이스는 이름이 달라도 맞는 곳이다 (지점명·상호가 다른 경우가 흔하다).
        // 이름 유사도로 깎아 '확인불가'로 남기면 지정한 의미가 없다.
        if (academy.placePinned && best) bestScore = 1;

        // 플레이스 홈에 링크가 걸린 채널만 조사한다 (별도 검색 없음)
        // 채널은 대부분 서로 다른 호스트(블로그·인스타그램·홈페이지)라 동시에 받아도
        // 어느 한 곳에 요청이 몰리지 않는다. 다만 네이버 블로그끼리는 순차로 둔다.
        //
        // 인스타그램은 부르지 않는다. 데이터센터 IP 에서는 401/403 이라 실측 262건이 전부
        // '확인불가'로 끝났다 — 못 읽을 요청을 학원마다 1~2건씩 보내 조사 시간과 차단 위험만 늘렸다.
        // 링크는 그대로 남겨 담당자가 직접 눌러 볼 수 있게 한다.
        const all = best ? best.links : [];
        const skipList = all.filter((l) => l.kind === 'instagram');
        const links = all.filter((l) => l.kind !== 'instagram').slice(0, MAX_CHANNELS);
        const channels = new Array(links.length);
        if (links.length) {
            const blogIdx = links.map((l, i) => [l, i]).filter(([l]) => l.kind === 'blog');
            const otherIdx = links.map((l, i) => [l, i]).filter(([l]) => l.kind !== 'blog');
            const settled = await Promise.allSettled([
                (async () => {
                    for (const [link, i] of blogIdx) {
                        channels[i] = await probeChannel(link);
                        if (blogIdx.length > 1) await sleep(300);
                    }
                })(),
                ...otherIdx.map(async ([link, i]) => { channels[i] = await probeChannel(link); }),
            ]);
            const blockedHit = settled.find((s) => s.status === 'rejected' && isBlocked(s.reason));
            if (blockedHit) throw blockedHit.reason;
        }
        const probed = channels.filter(Boolean);
        const skipped = skipList.map((l) => ({ ...l, notProbed: true, scope: '조사 안 함' }));
        return buildResult({ academy, place: best, channels: [...probed, ...skipped], matchScore: bestScore });
    } catch (err) {
        // 차단은 이 학원의 문제가 아니라 배치 전체의 문제 — 호출부가 중단하도록 그대로 올린다.
        // (여기서 '확인불가'로 삼키면 멀쩡한 기존 결과를 차단 결과로 덮어쓰게 된다)
        if (isBlocked(err)) throw err;
        return buildResult({ academy, error: err.message });
    }
}
