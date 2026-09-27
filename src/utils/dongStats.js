// 주소 → 법정동 분류와 '동별 기관 분포' 묶음 — 통계 탭과 SNS 게시점검 탭이 함께 쓴다.
// 두 화면의 동 목록(어느 동이 따로 서고 어느 동이 '기타' 로 묶이는지)이 어긋나지 않도록 한 곳에 둔다.

// ── 동 화이트리스트 ──
export const HANAM_DONG_SET = new Set(['신장동','덕풍동','풍산동','미사동','망월동','선동','교산동','학암동','초일동','초이동','광암동','천현동','창우동','배일미동','하산곡동','상산곡동','감이동','감일동','항동','하사창동','상사창동','위례동','순궁동','감북동','춘궁동']);
export const GWANGJU_DONG_SET = new Set(['경안동','광남동','태전동','송정동','역동','삼동','탄벌동','목현동','오포읍','초월읍','곤지암읍','도척면','퇴촌면','남종면','남한산성면']);

export const dongWhitelist = (region) => (region === '하남' ? HANAM_DONG_SET : GWANGJU_DONG_SET);

// 주소→법정동 캐시 (지도 페이지 geocoding 시 채워짐)
export function getAddrDongCache() {
    try { return JSON.parse(localStorage.getItem('academyAddrDongCache') || '{}'); }
    catch { return {}; }
}

// "신장1동" → "신장동", "덕풍2동" → "덕풍동" (행정동→법정동 표준화)
export function normalizeDongName(d) {
    return d.replace(/([가-힣]+)\d+(동|리|읍|면)$/, '$1$2');
}

export function getDongFromAddr(addr, wl) {
    const a = addr || '';
    // 1차: 화이트리스트 동명 직접 검색
    for (const d of wl) {
        if (new RegExp(d + '(?=[\\s\\d,()[\\]]|$)').test(a)) return d;
    }
    // 2차: "시" 이후 동/리/읍/면 패턴 추출 후 화이트리스트 대조 (숫자 포함 행정동명도 정규화)
    const after = a.replace(/^.*?시\s*/, '');
    const tokens = [...after.matchAll(/([가-힣]+(?:\d+)?(?:동|리|읍|면))/g)].map(m => m[1]);
    for (const t of tokens) {
        if (wl.has(t)) return t;
        const norm = normalizeDongName(t);
        if (wl.has(norm)) return norm;
    }
    // 3차: 지도 페이지 geocoding 결과 캐시에서 법정동명 조회
    // (지도 탭 방문 후 자동 채워짐 — 도로명 주소도 정확하게 분류 가능)
    const cached = getAddrDongCache()[a];
    if (cached) {
        if (wl.has(cached)) return cached;
        const norm = normalizeDongName(cached);
        if (wl.has(norm)) return norm;
    }
    return '';
}

// 합계가 이 수 이하인 동(미분류 제외)은 '기타' 로 묶는다
export const DONG_ETC_MAX = 5;
export const DONG_ETC = '기타';
export const DONG_UNCLASSIFIED = '미분류';

const H_CLOSED = ['자진폐원', '직권폐원', '자진폐소', '직권폐소'];

// 동별 기관 분포 — 통계 탭 섹션 5 의 기준 그대로.
//   학원: 지역 내 전체(상태 무관) / 교습소: 폐소 제외 / 과외: 신고상태 '신고'
// 결과: 합계 내림차순 동 목록 → 기타(dongList 포함) → 미분류
export function computeDongStats({ academies, privateTutors, region }) {
    const city = region.endsWith('시') ? region : region + '시';
    const wl = dongWhitelist(region);
    const inCity = (a) => (a.address || '').includes(city);
    const filtered = (academies || []).filter(inCity);
    const aList = filtered.filter(a => a.category !== '교습소');
    const hActiveList = filtered.filter(a => a.category === '교습소' && !H_CLOSED.some(s => (a.status || '').includes(s)));
    const pList = (privateTutors || []).filter(a => inCity(a) && (a.status || '').includes('신고'));

    const map = {};
    const add = (list, key) => list.forEach(a => {
        const dongKey = getDongFromAddr(a.address || '', wl) || DONG_UNCLASSIFIED;
        if (!map[dongKey]) map[dongKey] = { academy: 0, hagwon: 0, priv: 0 };
        map[dongKey][key]++;
    });
    add(aList, 'academy');
    add(hActiveList, 'hagwon');
    add(pList, 'priv');
    const entries = Object.entries(map)
        .map(([dong, v]) => ({ dong, ...v, total: v.academy + v.hagwon + v.priv }));
    const mainEntries = entries.filter(e => e.dong !== DONG_UNCLASSIFIED && e.total > DONG_ETC_MAX);
    const miscEntry = entries.find(e => e.dong === DONG_UNCLASSIFIED) || null;
    const smallEntries = entries.filter(e => e.dong !== DONG_UNCLASSIFIED && e.total <= DONG_ETC_MAX);
    const etcRow = smallEntries.length > 0 ? {
        dong: DONG_ETC,
        dongList: smallEntries.map(e => e.dong).sort(),
        academy: smallEntries.reduce((s, e) => s + e.academy, 0),
        hagwon: smallEntries.reduce((s, e) => s + e.hagwon, 0),
        priv: smallEntries.reduce((s, e) => s + e.priv, 0),
        total: smallEntries.reduce((s, e) => s + e.total, 0),
    } : null;
    const result = mainEntries.sort((a, b) => b.total - a.total);
    if (etcRow) result.push(etcRow);
    if (miscEntry) result.push(miscEntry);
    return result;
}

// 주소 하나가 동별 분포의 어느 칸에 들어가는지 — 따로 선 동이면 그 동, 작은 동이면 '기타', 모르면 '미분류'
export function dongBucketOf(addr, wl, mainDongs) {
    const d = getDongFromAddr(addr, wl);
    if (!d) return DONG_UNCLASSIFIED;
    return mainDongs.has(d) ? d : DONG_ETC;
}
