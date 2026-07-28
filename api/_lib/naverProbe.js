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
const ADDR_UNIT = /(층|동|가|로|길|번지|아파트|빌라|빌딩|상가|타워|프라자|플라자|오피스텔|타운|관|실|룸|객실|세대)$/;

export function extractRegNos(text) {
    if (!text) return [];
    const found = [];
    for (const [re, loose] of [[RE_HO, false], [RE_LABELED, false], [RE_BARE, true]]) {
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

// '포도나무수학초중등관학원' 처럼 관·캠퍼스 이름이 붙은 곳은 그 이름으로는 플레이스가 안 잡힌다.
// (플레이스·블로그는 본관과 같이 쓰는 경우가 많다) 검색이 빈손일 때 한 번 더 시도할 축약형을 만든다.
const BRANCH_TOKEN = /(초중등관|중고등관|초등관|중등관|고등관|영어관|수학관|본관|분관|별관|제\d+관|\d+관|캠퍼스)/g;

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
    try {
        state = extractApolloState(await getText(`https://pcmap.place.naver.com/place/${placeId}/home`, H_PCMAP));
    } catch (err) {
        if (isBlocked(err)) throw err;
    }
    if (!state) {
        // pcmap 이 실패하면 정보가 적더라도 모바일로 대체 (완전 실패보다 낫다)
        state = extractApolloState(await getText(`https://m.place.naver.com/place/${placeId}/information`, H_MOBILE)) || {};
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

// 블로그 목록 페이지(PostList)에는 글 본문이 안 들어 있다 — 본문은 iframe 으로 따로 불러온다.
// RSS 는 최근 글 본문을 통째로 주므로, 둘을 합쳐야 '본문에만 적어둔 교습비'를 잡을 수 있다.
async function probeBlogChannel(link) {
    const id = encodeURIComponent(link.id);
    const parts = [];
    for (const url of [
        `https://rss.blog.naver.com/${id}.xml`,
        `https://blog.naver.com/PostList.naver?blogId=${id}`,
    ]) {
        try { parts.push(htmlToText(await getText(url, H_DESKTOP))); }
        catch (err) { if (isBlocked(err)) throw err; }
    }
    if (!parts.length) throw new Error('블로그를 열지 못했습니다');
    const text = parts.join(' ');
    return {
        feeMentioned: FEE_KEYWORD.test(text),
        regNos: extractRegNos(text),
        scope: '최근 글 본문·사이드바',
    };
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
    const introHasFee = FEE_KEYWORD.test(place.intro);
    const hasMenu = place.menus.length > 0;
    const hasPriceImage = place.priceImageCount > 0;
    const placeFee = hasMenu || hasPriceImage || introHasFee;

    const 플레이스_게시형태 = hasMenu && hasPriceImage ? '가격메뉴+가격표이미지'
        : hasMenu ? '가격메뉴'
            : hasPriceImage ? '가격표이미지'
                : introHasFee ? '소개글텍스트'
                    : '없음';

    const introRegs = extractRegNos(place.intro);
    const 플레이스_기재번호 = [...new Set(introRegs.map((r) => r.raw))].join(',');
    const 플레이스_번호대조 = compareRegNos(introRegs, masterDigits);

    // ── 연결 채널별 판정 ──
    const 채널 = channels.map((c) => {
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
        if (!placeFee) 미이행사유.push('플레이스 교습비 미게시');
        if (플레이스_번호대조 === '미기재') 미이행사유.push(`플레이스 ${numberLabel} 미기재`);
        if (플레이스_번호대조 === '불일치') 미이행사유.push(`플레이스 ${numberLabel} 오기재(${플레이스_기재번호} ≠ ${academy.regNo})`);
        for (const c of 채널) {
            if (c.번호대조 === '확인불가') continue;   // 열지 못한 채널은 판정하지 않는다
            const 이름 = c.종류 === 'instagram' ? '인스타그램 소개글' : `${c.유형}(${shortUrl(c.url)})`;
            if (c.교습비 === 'X') 미이행사유.push(`${이름} 교습비 미게시`);
            if (c.번호대조 === '미기재') 미이행사유.push(`${이름} ${numberLabel} 미기재`);
            if (c.번호대조 === '불일치') 미이행사유.push(`${이름} ${numberLabel} 오기재(${c.기재번호} ≠ ${academy.regNo})`);
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
        블로그: blogCh ? '있음' : '없음',
        블로그URL: blogCh ? blogCh.url : '',
        블로그_교습비: blogCh ? blogCh.교습비 : '',
        블로그_번호: blogCh ? blogCh.번호 : '',
        블로그_기재번호: blogCh ? blogCh.기재번호 : '',
        블로그_번호대조: blogCh ? blogCh.번호대조 : '',
        채널수: 채널.length,
        채널상세: JSON.stringify(채널),
        판정,
        미이행사유: 미이행사유.join(' / '),
        checkedAt: new Date().toISOString(),
    };
}

// ── 학원 1곳 전체 조사 ──────────────────────────────────
// academy.placeId 가 있으면 검색 단계를 건너뛴다. 검색 엔드포인트가 차단에 가장 취약하므로,
// 한 번 찾아둔 플레이스 ID를 재사용하면 재조사 시 요청 수와 차단 위험이 크게 줄어든다.
const MAX_CHANNELS = 4;   // 링크를 잔뜩 걸어둔 곳에서 요청이 폭증하지 않도록

export async function probeAcademy(academy, city) {
    try {
        let ids = academy.placeId
            ? [String(academy.placeId)]
            : await searchPlaceIds(academy.name, city);
        if (!ids.length && !academy.placeId) {
            // 본관과 플레이스·블로그를 함께 쓰는 '○○관' 학원을 위한 재시도
            const alt = shortenName(academy.name);
            if (alt) {
                await sleep(300);
                ids = await searchPlaceIds(alt, city);
            }
        }
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

        // 플레이스 홈에 링크가 걸린 채널만 조사한다 (별도 검색 없음)
        const channels = [];
        if (best) {
            for (const link of best.links.slice(0, MAX_CHANNELS)) {
                channels.push(await probeChannel(link));
                await sleep(300);
            }
        }
        return buildResult({ academy, place: best, channels, matchScore: bestScore });
    } catch (err) {
        // 차단은 이 학원의 문제가 아니라 배치 전체의 문제 — 호출부가 중단하도록 그대로 올린다.
        // (여기서 '확인불가'로 삼키면 멀쩡한 기존 결과를 차단 결과로 덮어쓰게 된다)
        if (isBlocked(err)) throw err;
        return buildResult({ academy, error: err.message });
    }
}
