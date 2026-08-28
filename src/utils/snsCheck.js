// 네이버플레이스·블로그 교습비/등록(신고)번호 게시점검 — 프론트 유틸
//
// 조사는 /api/sns-probe (서버) 가 수행하고, 결과 저장·조회는
// /api/apps-script-proxy 를 통해 구글시트 'SNS게시점검' 탭에 한다.

const PROBE_BATCH = 4;    // api/sns-probe.js 의 MAX_BATCH 와 맞출 것
const SAVE_BATCH = 60;    // 한 번에 저장할 레코드 수

// 시트 헤더 (Apps Script 의 SNS_HEADERS 와 순서·이름이 일치해야 함)
// '연락처' 는 조사 결과에 없다 — Apps Script 가 마스터의 핸드폰에서 채우므로 여기서 보내지 않는다.
export const SNS_COLUMNS = [
    '확인일시', '구분', '등록번호', '학원명', '연락처', '매칭상태', '매칭점수',
    '플레이스ID', '플레이스명', '플레이스URL',
    '플레이스_교습비', '플레이스_게시형태', '플레이스_번호', '플레이스_기재번호', '플레이스_번호대조',
    '블로그', '블로그URL', '블로그_교습비', '블로그_번호', '블로그_기재번호', '블로그_번호대조',
    '판정', '미이행사유', '비고',
    // 플레이스 홈에 걸린 링크(블로그·홈페이지·인스타그램…) 전체 결과 — JSON 문자열
    '채널수', '채널상세',
];

// 결과·시트 행 양쪽에서 같은 키를 그대로 옮기는 항목
const PASSTHROUGH = [
    '플레이스ID', '플레이스명', '플레이스URL', '플레이스_교습비', '플레이스_게시형태', '플레이스_번호',
    '플레이스_기재번호', '플레이스_번호대조', '블로그', '블로그URL', '블로그_교습비',
    '블로그_번호', '블로그_기재번호', '블로그_번호대조', '판정', '미이행사유', '채널수', '채널상세',
];

/**
 * 채널상세(JSON 문자열) → 배열.
 * 이 컬럼이 생기기 전에 저장된 행에는 블로그 결과만 있으므로, 그 값으로 채널 1건을 만들어 준다.
 */
export function parseChannels(result) {
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

// 표의 채널 열 이름 — 인스타그램은 열이 없고 비고·링크에만 나온다
export const BUCKET_LABEL = { blog: '블로그', homepage: '홈페이지', cafe: '카페', instagram: '인스타' };

/**
 * 채널 하나가 표의 어느 열에 들어가는지 정한다.
 * 카페는 URL 호스트로만 가려낼 수 있다 — cafe.daum.net 은 종류가 'homepage' 이고
 * 유형(라벨)은 사업주가 붙인 값(카페/홈페이지…)이라 믿을 수 없다.
 */
export function channelBucket(c) {
    if (c.종류 === 'blog') return 'blog';
    if (c.종류 === 'instagram') return 'instagram';
    let host = String(c.url || '').toLowerCase();
    try { host = new URL(c.url).hostname.toLowerCase(); } catch { /* 형식이 깨진 URL 은 문자열 그대로 본다 */ }
    return /(^|\.)cafe\./.test(host) ? 'cafe' : 'homepage';
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
    const out = { blog: null, homepage: null, cafe: null, instagram: null };
    (channels || []).forEach((c) => {
        const b = channelBucket(c);
        if (!out[b]) out[b] = { 교습비: [], 번호: [], count: 0 };
        out[b].교습비.push(c.교습비);
        out[b].번호.push(c.번호);
        out[b].count++;
    });
    Object.keys(out).forEach((k) => {
        if (!out[k]) return;
        out[k] = { 교습비: worstCell(out[k].교습비), 번호: worstCell(out[k].번호), count: out[k].count };
    });
    return out;
}

/**
 * 비고 — 표의 O/X 칸만 봐서는 알 수 없는 것만 적는다.
 * '교습비 미게시 / 번호 미기재' 는 이미 칸이 X 로 보여주므로 넣지 않고, URL 도 링크 열에 있으므로 뺀다.
 */
export function snsRemark(result) {
    if (!result) return '';
    const notes = [];

    if (result.matchStatus === 'no_match') notes.push('네이버플레이스 못 찾음');
    else if (result.matchStatus === 'ambiguous') notes.push('동명 업체 가능성 — 직접 확인');
    else if (result.matchStatus === 'error') notes.push('조사 중 오류 — 다시 확인 필요');

    if (result.플레이스_번호대조 === '불일치') {
        notes.push(`플레이스 번호 오기재(${result.플레이스_기재번호} ≠ ${result.regNo})`);
    }

    const channels = parseChannels(result);
    const counted = {};
    channels.forEach((c) => {
        const b = channelBucket(c);
        const name = BUCKET_LABEL[b];
        counted[b] = (counted[b] || 0) + 1;
        if (c.번호대조 === '확인불가') notes.push(`${name} 확인불가${c.비고 ? ` — ${c.비고}` : ''}`);
        else if (c.번호대조 === '불일치') notes.push(`${name} 번호 오기재(${c.기재번호} ≠ ${result.regNo})`);
        // 인스타그램은 열이 없으므로 결과를 비고에 적는다
        if (b === 'instagram' && c.번호대조 !== '확인불가') notes.push(`인스타 교습비${c.교습비}·번호${c.번호}`);
    });

    // 같은 종류가 여러 곳이면 한 칸에 합쳐 보여준다는 사실을 알려준다
    Object.entries(counted).forEach(([b, n]) => { if (n > 1) notes.push(`${BUCKET_LABEL[b]} ${n}곳`); });

    return notes.join(' / ');
}

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

export function needsRecheck(result, days = RECHECK_DAYS) {
    if (!result || !result.checkedAt) return true;
    if (String(result.미이행사유 || '').includes(HELD_BACK_MARK)) return true;
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
