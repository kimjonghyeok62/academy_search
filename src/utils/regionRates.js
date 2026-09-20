// 기준단가는 앱 웹앱(Apps Script)에서 받아온다 — 구글시트 읽기(googleSheets.js)와는 다른 길이라
// 시간 제한만 여기서 따로 둔다 (응답이 없으면 캐시·내장값으로 넘어가야 한다)
function fetchWithTimeout(url, timeoutMs = 15000, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// 지역(교육지원청)별 교습비 기준 — 운영자 구글시트를 Apps Script 웹앱(apps-script/regionRates.gs)으로 읽고 쓴다
// 웹앱 주소가 비어 있거나 불러오기에 실패하면: 마지막으로 받은 값(브라우저 캐시) → 광주하남 내장값 순으로 사용

export const RATES_API_URL = 'https://script.google.com/macros/s/AKfycbw7NScwgubWdo_kpWNyyuBzUCTtmqRxtCntaZc-s_by9uXi5Fj0yS0skaf4xlsTOJ8o/exec';

export const REGION_NAMES = [
  '수원', '성남', '고양', '용인', '부천', '안산', '화성오산', '안양과천', '평택', '시흥', '광명', '군포의왕', '의정부',
  '구리남양주', '파주', '김포', '광주하남', '이천', '안성', '양평', '여주', '포천', '동두천양주', '가평', '연천',
];

export const officeNameOf = (region) => `경기도${region}교육지원청`;

// 광주하남 기준 (2024-12-26 교습비등 조정위원회) — 다른 지역 주무관이 "과정 목록 불러오기"로 틀만 가져다 쓴다
const GWANGJU_HANAM_ROWS = [
  { id: 'gh01', field: '입시·보습', process: '보습', subject: '초등', rate: 210, keywords: '' },
  { id: 'gh02', field: '입시·보습', process: '보습', subject: '중등', rate: 222, keywords: '' },
  { id: 'gh03', field: '입시·보습', process: '보습', subject: '고등', rate: 234, keywords: '' },
  { id: 'gh04', field: '입시·보습', process: '진학상담·지도', subject: '', rate: 234, keywords: '' },
  { id: 'gh05', field: '국제화', process: '어학', subject: '', rate: 259, keywords: '' },
  { id: 'gh06', field: '예능', process: '음악', subject: '', rate: 224, keywords: '' },
  { id: 'gh07', field: '예능', process: '음악', subject: '입시', rate: 336, keywords: '' },
  { id: 'gh08', field: '예능', process: '미술', subject: '', rate: 212, keywords: '' },
  { id: 'gh09', field: '예능', process: '미술', subject: '입시', rate: 255, keywords: '' },
  { id: 'gh10', field: '예능', process: '무용', subject: '', rate: 212, keywords: '' },
  { id: 'gh11', field: '예능', process: '무용', subject: '입시', rate: 255, keywords: '' },
  { id: 'gh12', field: '정보', process: '정보', subject: '', rate: 230, keywords: '' },
  { id: 'gh13', field: '기타', process: '기타', subject: '', rate: 230, keywords: '' },
];

export const BUILTIN_REGIONS = REGION_NAMES.map(region => (
  region === '광주하남'
    ? { region, officeName: officeNameOf(region), tutoringHourly: 20000, effectiveDate: '2024-12-26', updatedAt: '', rows: GWANGJU_HANAM_ROWS }
    : { region, officeName: officeNameOf(region), tutoringHourly: 0, effectiveDate: '', updatedAt: '', rows: [] }
));

/** 주무관 입력 화면의 "과정 목록 불러오기" — 단가는 비워서 반드시 새로 적게 한다 */
export function templateRows() {
  return GWANGJU_HANAM_ROWS.map(r => ({ ...r, id: newRowId(), rate: '' }));
}

export function newRowId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 드롭다운·신청서에 쓰는 교습과정 이름 — 예) 보습(초등), 음악(입시), 어학 */
export function rowLabel(row) {
  if (!row) return '';
  return row.subject ? `${row.process}(${row.subject})` : row.process;
}

/** 지역 자료가 판정에 쓸 만큼 채워졌는지 */
export function isRegionReady(info) {
  return !!info && info.rows.length > 0 && info.rows.every(r => r.rate > 0);
}

// ─── 교습과정/과목명에서 분야 추정 ────────────────────────────
// 글자에서 분야 번호를 뽑고, 같은 번호가 나오는 지역 줄을 고른다 (지역마다 줄 구성이 달라도 동작)
function rateCategory(text) {
  if (!text) return '';
  const p = text.toLowerCase();
  if (p.includes('어학') || p.includes('외국어')) return 'lang';
  if (p.includes('음악')) return p.includes('입시') ? 'music-exam' : 'music';
  if (p.includes('미술')) return p.includes('입시') ? 'art-exam' : 'art';
  if (p.includes('무용') || p.includes('댄스') || p.includes('체육')) return p.includes('입시') ? 'dance-exam' : 'dance';
  if (p.includes('정보') || p.includes('컴퓨터') || p.includes('코딩')) return 'info';
  if (p.includes('진학') || p.includes('상담')) return 'counsel';
  const isHabeop = p.includes('보습') || p.includes('단과') || p.includes('보통교과');
  if (isHabeop || p.includes('고등') || p.includes('고교') || p.includes('수능') ||
      p.includes('중등') || p.includes('중학') || p.includes('초등')) {
    if (p.includes('고등') || p.includes('고교') || p.includes('수능')) return 'high';
    if (p.includes('중등') || p.includes('중학')) return 'middle';
    if (isHabeop) return 'elementary';
  }
  return '';
}

const splitKeywords = (kw) => String(kw || '').split(/[,，]/).map(k => k.trim().toLowerCase()).filter(Boolean);

/** 글자(교습과정·과목명)에 맞는 지역 줄 id — 못 찾으면 '' */
export function guessRateId(text, rows) {
  if (!text || !rows?.length) return '';
  const t = text.toLowerCase();
  const byKeyword = rows.find(r => splitKeywords(r.keywords).some(k => t.includes(k)));
  if (byKeyword) return byKeyword.id;
  const cat = rateCategory(text);
  if (!cat) return '';
  const hit = rows.find(r => rateCategory(`${r.process} ${r.subject}`) === cat);
  return hit ? hit.id : '';
}

// ─── 불러오기 / 캐시 ──────────────────────────────────────────
const CACHE_KEY = 'regionRates:v1';
const SELECTED_KEY = 'regionRates:selected';

function toNumber(v) {
  const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/** 서버·캐시 자료를 25개 지역이 모두 있는 모양으로 정리 */
function normalizeRegions(list) {
  const byName = new Map((Array.isArray(list) ? list : []).map(r => [String(r.region || '').trim(), r]));
  return REGION_NAMES.map(region => {
    const r = byName.get(region);
    if (!r) return BUILTIN_REGIONS.find(b => b.region === region);
    return {
      region,
      officeName: String(r.officeName || '').trim() || officeNameOf(region),
      tutoringHourly: toNumber(r.tutoringHourly),
      effectiveDate: String(r.effectiveDate || ''),
      updatedAt: String(r.updatedAt || ''),
      rows: (Array.isArray(r.rows) ? r.rows : [])
        .filter(row => String(row.process || '').trim())
        .map(row => ({
          id: String(row.id || '') || newRowId(),
          field: String(row.field || ''),
          process: String(row.process || '').trim(),
          subject: String(row.subject || '').trim(),
          rate: toNumber(row.rate),
          keywords: String(row.keywords || ''),
        })),
    };
  });
}

export function readCachedRegions() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalizeRegions(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** { regions, source: 'server' | 'cache' | 'builtin' } */
export async function loadRegionRates() {
  if (RATES_API_URL) {
    try {
      const res = await fetchWithTimeout(RATES_API_URL, 20000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || '불러오기 실패');
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(json.regions)); } catch { /* 저장 못 해도 동작 */ }
      return { regions: normalizeRegions(json.regions), source: 'server' };
    } catch {
      const cached = readCachedRegions();
      if (cached) return { regions: cached, source: 'cache' };
    }
  }
  return { regions: BUILTIN_REGIONS, source: 'builtin' };
}

export function readSelectedRegion() {
  try {
    const v = localStorage.getItem(SELECTED_KEY) || '';
    return REGION_NAMES.includes(v) ? v : '';
  } catch {
    return '';
  }
}

export function writeSelectedRegion(region) {
  try { localStorage.setItem(SELECTED_KEY, region); } catch { /* 무시 */ }
}

// ─── 주무관 입력 (비밀번호 확인·저장) ─────────────────────────
async function postApi(body) {
  if (!RATES_API_URL) throw new Error('아직 기준단가 시트가 연결되지 않았습니다. 운영자에게 문의하세요.');
  // text/plain으로 보내야 Apps Script 웹앱이 브라우저 사전 요청(CORS preflight) 없이 받는다
  const res = await fetchWithTimeout(RATES_API_URL, 30000, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`서버 오류 (HTTP ${res.status})`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '처리하지 못했습니다.');
  return json;
}

export const verifyRegionPassword = (region, password) => postApi({ action: 'verify', region, password });

export const saveRegionRates = (region, password, data) => postApi({ action: 'save', region, password, ...data });
