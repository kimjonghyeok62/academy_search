// 네이버플레이스·블로그 교습비/등록(신고)번호 게시점검 — 프론트 유틸
//
// 조사는 /api/sns-probe (서버) 가 수행하고, 결과 저장·조회는
// /api/apps-script-proxy 를 통해 구글시트 'SNS게시점검' 탭에 한다.

const PROBE_BATCH = 20;   // api/sns-probe.js 의 MAX_BATCH 와 맞출 것
const SAVE_BATCH = 60;    // 한 번에 저장할 레코드 수

// 시트 헤더 (Apps Script 의 SNS_HEADERS 와 순서·이름이 일치해야 함)
export const SNS_COLUMNS = [
    '확인일시', '구분', '등록번호', '학원명', '매칭상태', '매칭점수',
    '플레이스ID', '플레이스명', '플레이스URL',
    '플레이스_교습비', '플레이스_게시형태', '플레이스_번호', '플레이스_기재번호', '플레이스_번호대조',
    '블로그', '블로그URL', '블로그_교습비', '블로그_번호', '블로그_기재번호', '블로그_번호대조',
    '판정', '미이행사유', '비고',
];

export const VERDICTS = ['이행', '미이행', '확인불가'];

export const VERDICT_COLOR = {
    이행: '#10b981',
    미이행: '#ef4444',
    확인불가: '#94a3b8',
};

// ── 딥링크 (담당자가 눈으로 확인할 때) ──────────────────
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
    ['플레이스ID', '플레이스명', '플레이스URL', '플레이스_교습비', '플레이스_게시형태', '플레이스_번호',
        '플레이스_기재번호', '플레이스_번호대조', '블로그', '블로그URL', '블로그_교습비',
        '블로그_번호', '블로그_기재번호', '블로그_번호대조', '판정', '미이행사유',
    ].forEach((k) => { rec[k] = r[k] || ''; });
    return rec;
}

export const recordKey = (category, regNo) => `${category}|${regNo}`;

/** 기재된 번호 요약 — '제436호 ≠1867' 처럼 왜 X 인지 한눈에 보이게 */
export function regSub(기재번호, 대조, master) {
    if (대조 === '일치') return 기재번호;
    if (대조 === '불일치') return `${기재번호} ≠${master}`;
    if (대조 === '미기재') return '미기재';
    return '';
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
    ['플레이스ID', '플레이스명', '플레이스URL', '플레이스_교습비', '플레이스_게시형태', '플레이스_번호',
        '플레이스_기재번호', '플레이스_번호대조', '블로그', '블로그URL', '블로그_교습비',
        '블로그_번호', '블로그_기재번호', '블로그_번호대조', '판정', '미이행사유', '비고',
    ].forEach((k) => { r[k] = row[k] || ''; });
    return r;
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

/**
 * 대상을 청크로 나눠 순차 조사한다.
 * onProgress(done, total, results) 로 진행 상황을 흘려보내 화면에 즉시 반영할 수 있게 한다.
 * shouldStop() 이 true 를 반환하면 다음 청크로 넘어가지 않고 중단한다.
 *
 * 네이버가 차단(403/캡차)하면 즉시 멈춘다. 남은 학원을 '확인불가'로 채우면
 * 이전에 제대로 조사해 둔 결과까지 덮어써 버리기 때문이다.
 * 반환값의 blocked 로 호출부가 사용자에게 알릴 수 있다.
 */
export async function probeAll(targets, city, { onProgress, shouldStop } = {}) {
    const all = [];
    let blocked = false;
    let blockedReason = '';

    for (let i = 0; i < targets.length; i += PROBE_BATCH) {
        if (shouldStop?.()) break;
        const chunk = targets.slice(i, i + PROBE_BATCH);
        let json;
        try {
            json = await probeChunk(chunk, city);
        } catch (err) {
            // 통신 오류는 해당 청크만 건너뛴다 (결과를 만들어 덮어쓰지 않음)
            blockedReason = err.message;
            onProgress?.(Math.min(i + PROBE_BATCH, targets.length), targets.length, []);
            continue;
        }
        const results = json.results || [];
        all.push(...results);
        onProgress?.(Math.min(i + PROBE_BATCH, targets.length), targets.length, results);

        if (json.blocked) {
            blocked = true;
            blockedReason = json.blockedReason || '네이버 요청 차단';
            break;
        }
    }
    return { results: all, blocked, blockedReason };
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
