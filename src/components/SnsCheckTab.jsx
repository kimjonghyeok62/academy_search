import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, useDeferredValue } from 'react';
import {
    probeAll, fetchSnsChecks, saveSnsChecks, resultToRecord, recordKey, rowToResult,
    toProbeTargets, needsRecheck, probeTargetFor,
    BUCKETS, BUCKET_LABEL,
    parseManual, effectiveVerdict, applyManualCell, setManualCell, keepManual,
    isDone, setDone, isNoPlace, setNoPlace, memoText, setMemo, MEMO_MAX,
    buildGroups, placeDuplicates, sharedCellTargets, pinnedPlaceId,
    pinResolvedPlace, parsePlaceInput, placeUrlFromId, PIN_CLEARED,
    RECHECK_DAYS, VERDICT_COLOR, matchesSnsFilter,
} from '../utils/snsCheck';
import { downloadSnsWorkbook } from '../utils/snsWorkbookExcel';
import { readNoticeSettings, writeNoticeSettings, noticeDeadline } from '../utils/snsNoticeText';
import { createSaveQueue } from '../utils/snsSaveQueue';
import {
    W_NUM, W_NAME, W_REGNO, W_CH, W_LINK, W_INS, W_MEMO, W_CHECK,
    CH_GROUPS, BG_STRIPE, DONE_COLOR, INS_OK_COLOR, INS_BAD_COLOR,
} from '../utils/snsTableLayout';
import SnsCheckRow from './SnsCheckRow';

const FILTERS = ['전체', '미이행', '이행', '확인불가', '해당없음', '미조사'];
const DONE_FILTERS = ['전체', '미확인', '확인완료'];

// 점검표 엑셀에서 빼는 판정 — 전화로 할 말이 없는 곳이라 종이만 두꺼워진다.
// 그 칩을 직접 골라 둔 경우에는 일부러 보려는 것이므로 빼지 않는다.
const OFF_PAPER = ['확인불가', '해당없음'];

// 한 번에 그릴 행 수. 750행을 통째로 그리면 첫 화면이 1초 넘게 멈춘다 —
// 보이는 만큼만 그리고 표 끝에 닿으면 이어서 붙인다.
const CHUNK = 60;

// 조회에 몇 초가 걸린다. 탭을 오갈 때마다 빈 화면을 보지 않도록 마지막 결과를 담아 둔다.
// (App.jsx 의 학원 목록 캐시와 같은 방식)
const CACHE_KEY = 'sns_checks_v1';
// 안내문을 폈는지 — 표를 보려고 매번 스크롤하지 않도록 기본은 접어 두고, 사람의 선택을 기억한다.
// (결과 캐시와 달리 취향이므로 세션을 넘겨 남는 localStorage 에 둔다)
const INTRO_KEY = 'sns_intro_open';

function readCache() {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { results } = JSON.parse(raw);
        return results && typeof results === 'object' ? results : null;
    } catch { return null; }
}

function writeCache(results) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ results, timestamp: Date.now() })); }
    catch { /* 용량 초과는 무시 — 캐시가 없으면 그냥 조회한다 */ }
}

// 700행을 통째로 문자열로 만드는 일이라 100ms 가까이 걸린다.
// 조작 중에 끼어들면 그 순간 화면이 멎으므로, 한가할 때를 기다렸다 쓴다.
function writeCacheWhenIdle(results) {
    const run = () => writeCache(results);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 0);
}

const fmtWhen = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 16).replace('T', ' ');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtLeft = (sec) => (sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${sec}초`);

const Chip = ({ label, active, onClick, count, color }) => (
    <button onClick={onClick} style={{
        padding: '6px 12px', borderRadius: '999px', fontSize: '0.82rem', cursor: 'pointer',
        border: '1px solid', borderColor: active ? (color || 'var(--primary)') : 'var(--border-color)',
        background: active ? (color || 'var(--primary)') : 'transparent',
        color: active ? 'white' : 'var(--text-muted)', fontWeight: active ? '700' : '500', whiteSpace: 'nowrap',
    }}>{label}{count !== undefined ? ` ${count}` : ''}</button>
);

// sticky 셀은 borderCollapse 표에서 border 가 사라지고 tr 배경도 따라오지 않는다.
// 그래서 배경색과 아래 경계선(inset shadow)을 셀마다 직접 준다.
const thBase = {
    padding: '9px 10px', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)',
    whiteSpace: 'nowrap', background: BG_STRIPE,
    boxShadow: 'inset 0 -1px 0 var(--border-color)',
};

// top 은 호출부에서 넘긴다 — 2행의 위치는 1행 높이를 실제로 재서 정한다(글꼴에 따라 달라진다)
// 열 너비는 colgroup 이 정한다 (table-layout: fixed)
const Th = ({ children, top = 0, colSpan, rowSpan, center, left, tight }) => (
    <th colSpan={colSpan} rowSpan={rowSpan} style={{
        ...thBase,
        ...(tight ? { padding: '9px 3px' } : null),
        textAlign: center ? 'center' : 'left',
        position: 'sticky', top,
        ...(left !== undefined ? { left, zIndex: 20 } : { zIndex: 12 }),
    }}>{children}</th>
);

// 저장 큐 상태 → 화면 문구
const SAVE_LABEL = {
    pending: '저장 대기 중…',
    saving: '저장 중…',
    saved: '✓ 저장됨',
    retrying: '⚠ 저장에 실패해 곧 다시 시도합니다',
    failed: '⚠ 저장하지 못했습니다 — 화면 값은 그대로 두었습니다',
};
const SAVE_COLOR = { retrying: '#f59e0b', failed: '#ef4444' };

const noticeInput = (w) => ({
    // box-sizing 을 주지 않으면 padding·border 만큼 카드 밖으로 삐져나온다
    width: w ? `${w}px` : '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: '0.8rem',
    border: '1px solid var(--border-color)', borderRadius: '7px',
    background: 'var(--bg-card)', color: 'var(--text-main)', fontFamily: 'inherit',
});
const noticeField = { display: 'flex', flexDirection: 'column', gap: '3px' };

export default function SnsCheckTab({ region, academies, onSelectAcademy }) {
    const city = region.endsWith('시') ? region : region + '시';

    // 검토 탭과 동일한 활성 목록 기준 (지역 + 개원 상태)
    const aActiveList = useMemo(
        () => (academies || []).filter(a => (a.address || '').includes(city) && a.category !== '교습소' && (a.status || '') === '개원'),
        [academies, city]);
    const hActiveList = useMemo(
        () => (academies || []).filter(a => (a.address || '').includes(city) && a.category === '교습소' && (a.status || '') === '개원'),
        [academies, city]);

    const targets = useMemo(() => [
        ...toProbeTargets(aActiveList, '학원'),
        ...toProbeTargets(hActiveList, '교습소'),
    ], [aActiveList, hActiveList]);

    // 학원명을 눌러 상세화면으로 갈 때 원본 학원 객체가 필요하다.
    // 조사 대상(target)에 통째로 붙이면 /api/sns-probe 요청 본문까지 커지므로 여기서만 따로 찾는다.
    //
    // 키는 반드시 (구분 + 번호)여야 한다. 등록번호 N번 학원과 신고번호 N번 교습소는 서로 다른 곳인데
    // 번호만으로 키를 잡으면 뒤에 넣은 교습소가 학원을 덮어써, 학원명을 눌렀을 때 엉뚱한 교습소가 열렸다.
    const academyByKey = useMemo(() => {
        const m = new Map();
        aActiveList.forEach(a => { if (a.id) m.set(recordKey('학원', a.id), a); });
        hActiveList.forEach(a => { if (a.id) m.set(recordKey('교습소', a.id), a); });
        return m;
    }, [aActiveList, hActiveList]);

    // 지난번 결과 — 있으면 이것으로 먼저 그리고, 최신 내용은 뒤에서 받아 바꿔 끼운다
    const [cachedBoot] = useState(readCache);
    const [results, setResults] = useState(cachedBoot || {});      // key → result
    // 묶음(공동운영)·플레이스 중복은 조사 결과가 바뀔 때만 다시 계산하면 된다.
    // O/X 를 눌러도 다시 계산하면 그때마다 새 Map·새 묶음 객체가 생겨 750행이 전부 다시 그려진다.
    // 그래서 '조사 결과가 바뀐 시점의 결과'만 따로 붙들어 둔다 (같은 객체를 가리키므로 메모리는 늘지 않는다).
    const [structResults, setStructResults] = useState(cachedBoot || {});
    const [loading, setLoading] = useState(!cachedBoot);
    const [refreshing, setRefreshing] = useState(!!cachedBoot);  // 캐시를 보여주면서 최신 내용을 받아오는 중
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [saveState, setSaveState] = useState('');
    const [saveInfo, setSaveInfo] = useState({ status: 'idle', pending: 0, error: '' });
    // 네이버가 막았을 때 자동으로 쉬는 중인 상태 (남은 초, 몇 번째 대기인지)
    const [wait, setWait] = useState(null);
    const [typeTab, setTypeTab] = useState('학원');
    const numberLabel = typeTab === '교습소' ? '신고번호' : '등록번호';
    const [filter, setFilter] = useState('미이행');
    const [doneFilter, setDoneFilter] = useState('전체');
    const [query, setQuery] = useState('');
    // 입력할 때마다 750행을 다시 거르면 글자가 밀린다 — 한 박자 늦게 반영한다
    const search = useDeferredValue(query);
    // 얼마나 그렸는지 — 거르는 조건(filterKey)과 짝으로 들고 있는다
    const [chunk, setChunk] = useState({ key: '', limit: CHUNK });
    // 비고 칸에서 플레이스 주소를 받는 행 (행키) 과 입력값
    const [pinRow, setPinRow] = useState('');
    const [pinInput, setPinInput] = useState('');
    // 붙여넣은 주소가 잘못됐을 때 입력칸 바로 밑에 띄울 안내 { message, query }
    const [pinError, setPinError] = useState(null);
    // 입력값을 저장 함수의 의존성으로 두면 한 글자 칠 때마다 함수가 새로 만들어져
    // 표의 모든 행이 다시 그려진다 — 값은 ref 로 읽고, 화면 표시만 상태로 둔다
    const pinInputRef = useRef('');
    // 적요를 적고 있는 행(행키)과 입력값 — 플레이스 지정 칸과 같은 방식이다.
    // 값을 ref 로 들고 화면 표시만 상태로 두는 이유도 같다 (한 글자마다 750행이 다시 그려지지 않도록).
    const [memoRow, setMemoRow] = useState('');
    const [memoInput, setMemoInput] = useState('');
    const memoInputRef = useRef('');
    // 안내문을 폈는지
    const [introOpen, setIntroOpen] = useState(() => {
        try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return false; }
    });
    // 공동운영 학원을 눌러 찾아가는 행 (행키) — 잠깐 색을 입혔다 지운다
    const [jumpKey, setJumpKey] = useState('');
    const rowRefs = useRef(new Map());
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const stopRef = useRef(false);
    // 저장 여부를 판단할 때 최신 결과가 필요하다 (setState 갱신함수 안에서 부수효과를 내지 않으려고 ref 로 둔다)
    const resultsRef = useRef(cachedBoot || {});
    // 담당자가 이 화면에서 고친 행 — 뒤늦게 도착한 조회 결과가 덮어쓰지 않도록 표시해 둔다
    const dirtyRef = useRef(new Set());

    // 저장 큐 (합치기 + 자동 재시도). 컴포넌트가 다시 그려져도 하나만 쓴다.
    const [queue] = useState(() => createSaveQueue(setSaveInfo));

    // 새로 조사한 결과에는 담당자가 적어둔 값이 없다. 시트는 Apps Script 가 지켜주지만
    // 화면까지 지워지면 방금 고친 파란 값이 사라진 것처럼 보인다 — 이어 붙여 준다.
    // 비고 단축주소로 찾아낸 플레이스는 지정 열에 굳혀 둔다 (pinResolvedPlace)
    const carryOver = useCallback((fresh) =>
        pinResolvedPlace(keepManual(fresh, resultsRef.current[recordKey(fresh.category, fresh.regNo)])), []);

    /** 조사 결과처럼 '구조'가 바뀐 갱신 — 묶음·중복 계산을 다시 돌린다 */
    const applyStructural = useCallback((next) => {
        resultsRef.current = next;
        setResults(next);
        setStructResults(next);
    }, []);

    /** O/X·마감처럼 사람이 고친 값만 바뀐 갱신 — 묶음 계산은 그대로 둔다 */
    const applyManual = useCallback((next, keys) => {
        resultsRef.current = next;
        setResults(next);
        keys.forEach(k => dirtyRef.current.add(k));
    }, []);

    // 모바일에서는 학원명 열을 왼쪽에 고정하지 않는다 — 좁은 화면에서 옆의 O/X 칸을 가린다.
    // (헤더 위쪽 고정은 그대로 둔다)
    const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640);
    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < 640);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // 헤더 2행의 sticky top = 1행의 실제 높이. 고정값으로 두면 글꼴·확대율에 따라 겹치거나 벌어진다.
    const headRowRef = useRef(null);
    const [headRowH, setHeadRowH] = useState(37);
    useLayoutEffect(() => {
        const el = headRowRef.current;
        if (!el) return undefined;
        const update = () => setHeadRowH(el.getBoundingClientRect().height);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [loading]);

    // 저장된 결과 불러오기 (캐시로 이미 그리고 있어도 최신 내용을 받아 바꿔 끼운다)
    useEffect(() => {
        let alive = true;
        fetchSnsChecks().then(rows => {
            if (!alive) return;
            // 조회에 실패하면 빈 배열이 온다 — 그것으로 캐시를 덮으면 표가 통째로 사라진다
            if (!rows.length && cachedBoot) { setRefreshing(false); return; }
            const map = {};
            rows.forEach(row => {
                const r = rowToResult(row);
                if (r.regNo) map[recordKey(r.category, r.regNo)] = r;
            });
            // 받아오는 사이에 담당자가 고친 행은 화면 값을 지킨다 (저장은 큐가 따로 끝낸다)
            dirtyRef.current.forEach(k => {
                const local = resultsRef.current[k];
                if (local) map[k] = local;
            });
            applyStructural(map);
            writeCacheWhenIdle(map);
            setLoading(false);
            setRefreshing(false);
        });
        return () => { alive = false; };
    }, [applyStructural, cachedBoot]);

    // 캐시 쓰기는 무겁다(수백 행 직렬화) — 조작이 멎고, 브라우저도 한가할 때 한 번만 한다
    useEffect(() => {
        if (loading) return undefined;
        const t = setTimeout(() => writeCacheWhenIdle(resultsRef.current), 3000);
        return () => clearTimeout(t);
    }, [results, loading]);

    // 저장할 것이 남았는데 창을 닫으려 하면 알린다
    useEffect(() => {
        const onLeave = (e) => {
            if (!queue.hasPending()) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onLeave);
        return () => {
            window.removeEventListener('beforeunload', onLeave);
            // 화면을 떠나도 남은 저장은 마저 보낸다 (큐는 리액트와 별개로 돈다)
            if (queue.hasPending()) queue.retry();
        };
    }, [queue]);

    // 학원·교습소를 함께 담은 목록. 표는 한 탭만 보여주지만 점검표 엑셀은 두 탭을 한 파일로
    // 뽑으므로, 양쪽을 다 들고 있는 자리가 하나 필요하다.
    //
    // target 은 원본 그대로 둔다 — 여기서 플레이스ID 를 붙여 새 객체를 만들면 행마다 참조가
    // 바뀌어 React.memo 가 무력해진다. 조사에 넘길 target 은 실제로 조사를 시작할 때
    // probeTargetFor 로 만든다.
    const allRows = useMemo(() => targets.map(t => {
        const key = recordKey(t.category, t.regNo);
        return { key, target: t, result: results[key] || null };
    }), [targets, results]);

    // 표에 그릴 목록 (지금 보고 있는 탭)
    const rows = useMemo(
        () => allRows.filter(x => x.target.category === typeTab),
        [allRows, typeTab]);

    // 같은 블로그·플레이스를 함께 쓰는 학원 묶음 (학원·교습소를 가리지 않고 전체에서 찾는다)
    const groups = useMemo(() => buildGroups(structResults), [structResults]);
    // 같은 플레이스를 물고 있는데 묶음도 아닌 곳 — 지점을 잘못 잡았을 수 있다
    const dupPlaces = useMemo(() => placeDuplicates(structResults, groups), [structResults, groups]);

    const counts = useMemo(() => {
        const c = { 전체: rows.length, 이행: 0, 미이행: 0, 확인불가: 0, 해당없음: 0, 미조사: 0 };
        rows.forEach(({ result }) => {
            if (!result) c.미조사++;
            else { const v = effectiveVerdict(result); c[v] = (c[v] || 0) + 1; }
        });
        return c;
    }, [rows]);

    const doneCount = useMemo(
        () => rows.reduce((n, x) => n + (isDone(x.result) ? 1 : 0), 0),
        [rows]);

    // 기본 조사 대상 — 한 번도 안 본 곳 + 조사한 지 오래된 곳.
    // 확인 마감한 곳은 뺀다. 담당자가 이미 눈으로 확인해 굳힌 곳을 다시 도는 것은
    // 시간만 쓰고 네이버 차단만 부른다 (필요하면 행의 새로고침으로 하나씩 다시 볼 수 있다).
    const stale = useMemo(
        () => rows.filter(x => !isDone(x.result) && !isNoPlace(x.result) && needsRecheck(x.result)),
        [rows]);

    // 표와 점검표 엑셀이 같은 조건을 보도록 한 곳에 모아 둔다
    const filterQuery = useMemo(
        () => ({ filter, doneFilter, q: search.trim().toLowerCase() }),
        [filter, doneFilter, search]);

    const visible = useMemo(
        () => rows.filter(x => matchesSnsFilter(x, filterQuery)),
        [rows, filterQuery]);

    const filterKey = `${typeTab}|${filter}|${doneFilter}|${search}`;

    // 거르는 조건이 바뀌면 처음부터 다시 그린다 — 얼마나 그릴지를 조건과 함께 들고 있으면
    // 조건이 바뀌는 순간 저절로 CHUNK 로 돌아간다 (되돌리는 효과를 따로 두지 않아도 된다).
    const limit = chunk.key === filterKey ? chunk.limit : CHUNK;
    const growMore = useCallback(() => setChunk({ key: filterKey, limit: limit + CHUNK }), [filterKey, limit]);

    // 공동운영에서 눌러 찾아가는 행이 아직 안 그린 뒤쪽에 있으면 거기까지 그린다
    const jumpIndex = useMemo(
        () => (jumpKey ? visible.findIndex(x => x.key === jumpKey) : -1),
        [jumpKey, visible]);
    const effLimit = jumpIndex >= limit ? jumpIndex + CHUNK : limit;

    const shown = useMemo(() => visible.slice(0, effLimit), [visible, effLimit]);
    const more = visible.length - shown.length;

    // 표 끝에 닿으면 다음 묶음을 이어 붙인다
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !more) return undefined;
        const io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) growMore();
        }, { root: scrollRef.current, rootMargin: '400px' });
        io.observe(el);
        return () => io.disconnect();
    }, [more, growMore]);

    const registerRow = useCallback((key, el) => {
        if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key);
    }, []);

    // ── 공동운영 학원으로 이동 ───────────────────────────
    // 상세화면으로 나가면 지금 보던 표(필터·스크롤)를 잃는다. 함께 운영하는 곳은
    // 같은 표에 나란히 있으니 이 표 안에서 그 행으로 옮겨 준다.
    const jumpToRow = useCallback((key) => {
        const cat = key.split('|')[0];
        // 다른 구분(학원↔교습소)이거나 지금 필터에 걸려 안 보이는 곳이면 보이도록 풀어 준다 —
        // 눌렀는데 아무 일도 일어나지 않으면 고장으로 보인다
        if (cat) setTypeTab(cat);
        setFilter('전체');
        setDoneFilter('전체');
        setQuery('');
        setJumpKey(key);
    }, []);

    // 탭·필터가 바뀌어 그 행이 그려진 뒤에 옮겨 가야 한다 (그린 목록이 바뀌면 다시 시도)
    useEffect(() => {
        if (!jumpKey) return undefined;
        const el = rowRefs.current.get(jumpKey);
        if (!el) return undefined;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const t = setTimeout(() => setJumpKey(''), 2500);
        return () => clearTimeout(t);
    }, [jumpKey, shown]);

    const lastCheckedAt = useMemo(() => {
        let latest = '';
        Object.values(results).forEach(r => { if (r.checkedAt > latest) latest = r.checkedAt; });
        return latest;
    }, [results]);

    // ── 자동조사 실행 ───────────────────────────────────
    const runProbe = useCallback(async (list, label) => {
        if (!list.length) return;
        // 손으로 고친 값이 아직 안 나갔으면 먼저 보낸다 (같은 행을 두 곳에서 쓰지 않도록)
        if (queue.hasPending()) queue.retry();
        stopRef.current = false;
        setRunning(true);
        setSaveState('');
        setWait(null);
        setProgress({ done: 0, total: list.length });

        // 조사가 오래 걸리므로(수백 곳) 청크가 끝날 때마다 곧바로 시트에 저장한다.
        // 중간에 탭을 닫거나 통신이 끊겨도 그때까지의 결과는 남는다.
        let saveQueue = Promise.resolve();
        let savedCount = 0;
        let saveError = '';
        let heldBack = 0;   // 플레이스 상세 제한으로 반쪽만 본 결과 — 기존 판정을 지키려고 버린 수

        const { blocked, blockedReason, skipped } = await probeAll(list, region, {
            shouldStop: () => stopRef.current,
            onWait: (left, nth, reason) => setWait(left ? { left, nth, reason } : null),
            onProgress: (done, total, chunk) => {
                setProgress({ done, total });
                if (!chunk.length) return;
                // 네이버 플레이스 상세가 제한 중이면 소개글을 못 읽어 교습비·번호를 확정할 수 없다.
                // 그 반쪽 결과로 이미 제대로 조사해 둔 학원을 덮으면 멀쩡한 '이행'이 '확인불가'가 된다.
                // 아직 한 번도 안 본 학원은 반쪽이라도 없는 것보다 낫다.
                const usable = chunk.filter(r => !r.partial || !resultsRef.current[recordKey(r.category, r.regNo)]);
                heldBack += chunk.length - usable.length;
                if (!usable.length) return;

                // 이어 붙인 값(비고 주소로 굳힌 플레이스지정 포함)을 그대로 저장해야 시트에 남는다.
                // 조사 결과 원본만 보내면 방금 굳힌 지정이 사라져 다음 조사 때 또 단축주소를 편다.
                const merged = usable.map(carryOver);
                const next = { ...resultsRef.current };
                merged.forEach(r => { next[recordKey(r.category, r.regNo)] = r; });
                applyStructural(next);

                // 저장은 순차 처리(동시 쓰기로 시트 행이 꼬이지 않도록)
                saveQueue = saveQueue.then(async () => {
                    try {
                        await saveSnsChecks(merged.map(resultToRecord));
                        savedCount += usable.length;
                        setSaveState(`저장됨 ${savedCount}곳`);
                    } catch (err) {
                        saveError = err.message;
                    }
                });
            },
        });

        await saveQueue;
        setRunning(false);
        setWait(null);
        writeCacheWhenIdle(resultsRef.current);

        if (blocked) {
            setSaveState(`⛔ ${savedCount}곳까지 저장 후 중단 — 네이버 차단이 오래 풀리지 않습니다 (${blockedReason}). `
                + `한참 뒤에 "조사 필요 …곳" 버튼으로 이어서 진행하세요. 남은 학원은 덮어쓰지 않았습니다.`);
            return;
        }
        // 플레이스 상세는 IP당 제한이 빡빡해 일부는 이번에 못 볼 수 있다. 배치를 세우지 않고 지나간 몫이다.
        const leftover = (skipped || 0) + heldBack;
        const leftoverMsg = leftover
            ? ` (${leftover}곳은 네이버 플레이스 상세가 제한 중이라 이번엔 건너뛰었습니다 — 기존 결과는 그대로입니다. 잠시 뒤 다시 돌리면 채워집니다)`
            : '';
        if (!savedCount && !saveError) {
            if (leftover) setSaveState(`이번에는 새로 저장한 곳이 없습니다.${leftoverMsg}`);
            return;
        }
        setSaveState(saveError
            ? `⚠ 일부 저장 실패: ${saveError} (저장 ${savedCount}곳, 화면 결과는 유지됩니다)`
            : `✓ ${label} ${savedCount}곳 저장 완료${leftoverMsg}`);
    }, [region, carryOver, applyStructural, queue]);

    const probeList = (list) => list.map(x => probeTargetFor(x.target, x.result));
    const runStale = () => runProbe(probeList(stale), typeTab);
    const runAll = () => runProbe(probeList(rows), `${typeTab} 전체`);

    // pin: 단축주소로 조사한 경우처럼, 찾아낸 플레이스를 지정 열에 굳혀야 할 때
    const runOne = useCallback(async (target, { pin = false } = {}) => {
        setRunning(true);
        setSaveState('');
        const probeTarget = target.placeId || target.placeHint || target.placePinned !== undefined
            ? target
            : probeTargetFor(target, resultsRef.current[recordKey(target.category, target.regNo)]);
        const { results: [r], blocked, blockedReason } = await probeAll([probeTarget], region, { autoResume: false });
        setRunning(false);
        if (blocked || !r) {
            setSaveState(`⛔ 네이버가 요청을 일시 차단했습니다 (${blockedReason || '차단'}). 잠시 후 다시 시도하세요.`);
            return;
        }
        const key = recordKey(r.category, r.regNo);
        if (r.partial && resultsRef.current[key]) {
            setSaveState('지금은 네이버 플레이스 상세가 제한 중이라 소개글을 읽지 못했습니다 — 기존 결과를 그대로 둡니다. 잠시 뒤 다시 눌러 주세요.');
            return;
        }
        let merged = carryOver(r);
        const foundId = String(r.플레이스ID || '').trim();
        // 지정 열에는 주소를 통째로 남긴다 — 시트를 열어 본 사람도 바로 눌러 확인할 수 있어야 한다
        if (pin && foundId && !pinnedPlaceId(merged)) merged = { ...merged, 플레이스지정: placeUrlFromId(foundId) };
        applyStructural({ ...resultsRef.current, [key]: merged });
        try { await saveSnsChecks([resultToRecord(merged)]); } catch { /* 화면 결과는 유지 */ }
    }, [region, carryOver, applyStructural]);

    // ── 비고 칸에서 플레이스 주소 지정 ───────────────────
    // 이름으로 못 찾는 곳(확인불가)이 많아 시트를 오가지 않고 표에서 바로 넣는다.
    // 값은 시트 '플레이스지정'(AB열)에 남는다 — 상세 패널의 '직접 지정' 과 같은 자리다.
    // raw 를 넘기면 칸에 적지 않고 바로 지정한다 ('이 플레이스 맞음' 버튼이 그렇게 쓴다)
    const savePlacePin = useCallback(async (target, raw) => {
        const parsed = parsePlaceInput(raw);
        if (!parsed.id && !parsed.url) {
            // 오류를 조작부(표 한참 위)에만 띄우면, 아래쪽 행에서 누른 사람은 아무 일도 안 일어난 것처럼 보인다.
            // 입력칸 바로 밑에 띄워 준다.
            setPinError({ message: parsed.error, query: parsed.query || '' });
            return;
        }
        const key = recordKey(target.category, target.regNo);
        setPinRow('');
        setPinError(null);
        pinInputRef.current = '';
        setPinInput('');
        setSaveState('플레이스를 지정하고 다시 조사합니다…');

        // 번호를 바로 아는 경우엔 조사보다 먼저 저장한다 — 네이버가 막혀도 지정은 남는다.
        // (단축주소는 펴 봐야 번호를 알 수 있어 조사 뒤에 굳힌다)
        if (parsed.id) {
            const base = resultsRef.current[key]
                || { category: target.category, regNo: target.regNo, name: target.name, 판정: '', checkedAt: '' };
            const updated = { ...base, 플레이스지정: placeUrlFromId(parsed.id) };
            applyStructural({ ...resultsRef.current, [key]: updated });
            try { await saveSnsChecks([resultToRecord(updated)]); }
            catch (err) { setSaveState(`⚠ 지정을 저장하지 못했습니다: ${err.message}`); return; }
        }
        await runOne(
            { ...target, placeId: parsed.id, placeHint: parsed.url, placePinned: true },
            { pin: !!parsed.url });
    }, [runOne, applyStructural]);

    const savePinFromInput = useCallback((target) => savePlacePin(target, pinInputRef.current), [savePlacePin]);
    const confirmPlace = useCallback((target, placeId) => savePlacePin(target, placeId), [savePlacePin]);

    const clearPlacePin = useCallback(async (target, result) => {
        if (!result) return;
        const key = recordKey(result.category, result.regNo);
        // 빈 값으로 보내면 Apps Script 가 '안 넘어온 것'으로 보고 기존 값을 지킨다 — 해제 표시를 남긴다
        const updated = { ...result, 플레이스지정: PIN_CLEARED };
        applyStructural({ ...resultsRef.current, [key]: updated });
        setSaveState('지정을 풀고 이름으로 다시 찾습니다…');
        try { await saveSnsChecks([resultToRecord(updated)]); }
        catch (err) { setSaveState(`⚠ 해제를 저장하지 못했습니다: ${err.message}`); return; }
        // 저장된 플레이스도 무시해야 새로 검색한다 (그대로 두면 잘못 잡은 그 곳을 다시 물고 온다)
        await runOne({ ...target, placeId: '', placeHint: '', placePinned: false });
    }, [runOne, applyStructural]);

    // 값을 고치는 순간 앞의 오류는 지운다 — 고쳐 놨는데 빨간 글씨가 남아 있으면 아직 틀린 줄 안다
    const changePin = useCallback((v) => { pinInputRef.current = v; setPinInput(v); setPinError(null); }, []);
    const openPin = useCallback((rowKey, curUrl) => { setPinRow(rowKey); changePin(curUrl); }, [changePin]);
    const cancelPin = useCallback(() => { setPinRow(''); changePin(''); }, [changePin]);

    // ── 칸을 눌러 직접 확인한 값 넣기 ────────────────────
    // 자동값 → O → X → 없음 → 자동값. 시트의 '수동확인' 칸에 남아 다시 조사해도 유지된다.
    const cycleCell = useCallback((result, key) => {
        if (!result) return;   // 아직 조사 안 한 학원은 시트에 행이 없다
        const rowKey = recordKey(result.category, result.regNo);
        const updated = applyManualCell(result, key);
        const value = parseManual(updated)[key];

        // 같은 블로그·플레이스를 함께 쓰는 학원은 '교습비를 올렸는가'가 한 몸이다 — 같이 반영한다.
        // 번호는 학원마다 자기 번호가 게시돼 있어야 하므로 전파하지 않는다.
        const shared = sharedCellTargets(resultsRef.current, result, key, groups);
        const next = { ...resultsRef.current, [rowKey]: updated };
        const entries = [[rowKey, resultToRecord(updated)]];
        shared.forEach(({ rowKey: k, result: r, key: cell }) => {
            const u = setManualCell(r, cell, value);
            next[k] = u;
            entries.push([k, resultToRecord(u)]);
        });

        applyManual(next, entries.map(([k]) => k));
        setSaveState(shared.length
            ? `같은 채널을 쓰는 ${shared.map(s => s.name).join('·')} 에도 함께 반영했습니다 (교습비만).`
            : '');
        // 저장은 큐가 맡는다 — 연달아 고쳐도 요청이 겹치지 않고, 실패하면 알아서 다시 시도한다
        queue.pushMany(entries);
    }, [applyManual, groups, queue]);

    // ── 확인 마감 / 해제 ─────────────────────────────────
    const toggleDone = useCallback((result) => {
        if (!result) return;
        const rowKey = recordKey(result.category, result.regNo);
        const updated = setDone(result, !isDone(result));
        applyManual({ ...resultsRef.current, [rowKey]: updated }, [rowKey]);
        setSaveState('');
        queue.push(rowKey, resultToRecord(updated));
    }, [applyManual, queue]);

    // ── 네이버플레이스가 아예 없는 학원 ──────────────────
    // 이름이 달라 못 찾은 것과 정말 없는 것은 자동으로 못 가린다. 사람이 확인해 눌러 주면
    // 물고 온 남의 업체를 버리고, 판정을 '해당없음'으로 빼고, 다시 조사하지 않는다.
    const toggleNoPlace = useCallback((result) => {
        if (!result) return;
        const rowKey = recordKey(result.category, result.regNo);
        const on = !isNoPlace(result);
        const updated = setNoPlace(result, on);
        applyManual({ ...resultsRef.current, [rowKey]: updated }, [rowKey]);
        setSaveState(on
            ? '네이버플레이스가 없는 곳으로 표시했습니다 — 판정에서 빠지고 다시 조사하지 않습니다.'
            : '표시를 되돌렸습니다.');
        queue.push(rowKey, resultToRecord(updated));
    }, [applyManual, queue]);

    // ── 적요 (담당자가 적는 진행사항) ────────────────────
    // 마감한 행에서도 고칠 수 있다 — 마감은 O/X 만 잠근다.
    const changeMemo = useCallback((v) => { memoInputRef.current = v; setMemoInput(v); }, []);
    const openMemo = useCallback((rowKey, cur) => { setMemoRow(rowKey); changeMemo(cur); }, [changeMemo]);
    const cancelMemo = useCallback(() => { setMemoRow(''); changeMemo(''); }, [changeMemo]);

    const saveMemo = useCallback((result) => {
        if (!result) return;   // 아직 조사 안 한 학원은 시트에 행이 없다
        const next = String(memoInputRef.current || '').trim().slice(0, MEMO_MAX);
        setMemoRow('');
        changeMemo('');
        // 안 바뀌었으면 보내지 않는다. 빈 칸에서 그냥 저장을 누른 것까지 요청으로 만들면
        // 비어 있던 셀에 지움 표시('-')만 남는다.
        if (next === memoText(result)) return;
        const rowKey = recordKey(result.category, result.regNo);
        const updated = setMemo(result, next);
        applyManual({ ...resultsRef.current, [rowKey]: updated }, [rowKey]);
        setSaveState('');
        queue.push(rowKey, resultToRecord(updated));
    }, [applyManual, changeMemo, queue]);

    // 갱신함수 안에서 저장하지 않는다 — React 가 그 함수를 두 번 부를 수 있어 부수효과 자리가 아니다
    const toggleIntro = useCallback(() => {
        const next = !introOpen;
        setIntroOpen(next);
        try { localStorage.setItem(INTRO_KEY, next ? '1' : '0'); } catch { /* 저장 못 해도 이번 화면에서는 동작한다 */ }
    }, [introOpen]);

    // ── 점검표 엑셀 ──────────────────────────────────────
    // 보조요원은 화면이 아니라 종이를 보며 전화를 돈다. 화면의 거르개는 그대로 쓰되
    // 탭만 풀어 학원·교습소를 두 시트에 담는다 — 종이 묶음이 하나여야 잃어버리지 않는다.
    const paperRows = useMemo(() => {
        const off = filterQuery.filter === '전체' ? OFF_PAPER : [];
        return allRows.filter(x => matchesSnsFilter(x, filterQuery)
            && !(x.result && off.includes(effectiveVerdict(x.result))));
    }, [allRows, filterQuery]);

    const downloadWorksheet = () => {
        const sheet = (category, label) => ({
            name: category,
            numberLabel: label,
            rows: paperRows
                .filter(x => x.target.category === category)
                .map(x => ({ ...x, academy: academyByKey.get(x.key), dup: dupPlaces.get(x.key) })),
        });
        downloadSnsWorkbook({ region, sheets: [sheet('학원', '등록번호'), sheet('교습소', '신고번호')] })
            .catch(() => setSaveState('⚠ 점검표 엑셀을 만들지 못했습니다.'));
    };

    // ── 문자 설정 ────────────────────────────────────────
    // 문의 전화·기한·안내 링크는 학원별 값이 아니라 담당자별 값이다. 시트에 넣을 것이 아니고,
    // 행마다 prop 으로 실어 나르면 750행의 참조가 흔들려 표가 무거워진다 —
    // 그래서 브라우저에만 두고 snsNoticeText 가 직접 읽는다.
    const [notice, setNotice] = useState(readNoticeSettings);
    const [noticeOpen, setNoticeOpen] = useState(false);
    const changeNotice = (patch) => setNotice(writeNoticeSettings(patch));

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>저장된 점검 결과를 불러오는 중…</div>;
    }

    const donePct = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;
    const saveLabel = SAVE_LABEL[saveInfo.status];

    return (
        <div>
            {/* 안내 — 15줄짜리 설명이 표를 화면 밖으로 밀어냈다.
                제목 줄만 남기고 접어 두되, 편 상태는 기억한다 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '12px 16px', border: '1px solid var(--border-color)', marginBottom: '12px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: '800' }}>📣 네이버 교습비·등록번호 게시점검</span>
                    <button onClick={toggleIntro} style={{
                        background: 'none', border: '1px solid var(--border-color)', borderRadius: '999px',
                        padding: '3px 10px', color: 'var(--text-muted)', fontSize: '0.76rem',
                        fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>{introOpen ? '사용법 접기 ▴' : '사용법 보기 ▾'}</button>
                    {lastCheckedAt && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            최근 조사: <b>{fmtWhen(lastCheckedAt)}</b>
                        </span>
                    )}
                </div>

                {introOpen && (
                    <ol style={{ margin: '10px 0 0', paddingInlineStart: '20px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.75 }}>
                        <li><b>무엇을 보나</b> — 네이버플레이스의 가격 메뉴·가격표 이미지·소개글과,
                            플레이스 홈에 링크된 블로그·홈페이지·카페·인스타그램. 링크가 없는 채널은 따로 검색하지 않습니다.</li>
                        <li><b>표 읽는 법</b> — 채널마다 <b>번호</b>(= 등록·신고번호)와 <b>교습비</b> 두 칸입니다.
                            <b> 이행·미이행은 교습비만으로 판정</b>합니다 — 번호 미게시는 시정명령 사항이라 X 로 보여주되 미이행으로 잡지 않습니다.</li>
                        <li><b>확정 위반이 아닙니다</b> — 자동 판정이라 안내·점검 우선순위 참고 자료입니다.
                            동명 학원이나 지점이 있으면 <b>확인불가</b>로 남습니다.
                            <b> 학원명</b>을 누르면 상세화면(SNS 탭에 판정 근거 전부),
                            비고의 <b style={{ color: '#7c3aed' }}>공동운영</b> 학원명을 누르면 이 표의 그 학원 행으로 옮겨 갑니다.</li>
                        <li><b>주소를 누르면 네이버지도</b>가 열립니다 — ‘이 주소의 장소’를 펼치면 그 건물 업체가 다 보여,
                            이름이 달라 자동으로 못 찾은 플레이스를 찾아 <b>플레이스 지정</b>에 넣을 수 있습니다.</li>
                        <li><b>직접 확인해 고치기</b> — O/X 칸을 누르면 <b>자동값 → O → <span style={{ color: '#d97706' }}>△</span> → X → 없음 → 자동값</b>.
                            <b style={{ color: '#d97706' }}>△</b> 는 <b>올려는 뒀는데 신고한 내용과 다른</b> 경우(허위기재)입니다 — 미이행으로 잡히고, 안내문에도 ‘금액이 다름’이라고 나갑니다.
                            직접 넣은 값은 <b style={{ color: '#2563eb' }}>파란색</b>이고 <b>다시 조사해도 덮이지 않으며</b> 집계에도 반영됩니다.
                            자동 조사가 <b>?</b> 로 남긴 칸이 실제로는 그 채널이 없는 경우라면 <b>없음</b>으로 두세요 — 판정에서 빠집니다.</li>
                        <li><b>🚫 플레이스 없음</b> — 찾아봤는데 이 학원이 플레이스를 아예 만들지 않았다면 비고의 그 단추를 누르세요.
                            판정이 <b>해당없음</b>으로 빠지고, 잘못 물고 온 남의 업체 값도 지워지며, 다시 조사하지 않습니다.</li>
                        <li><b style={{ color: INS_OK_COLOR }}>보험</b> 열 — 배상책임보험 만료일입니다.
                            <b style={{ color: INS_OK_COLOR }}> 파란색</b>이면 유효, <b style={{ color: INS_BAD_COLOR }}>빨간색 ⚠</b>이면 만료·미가입입니다.
                            마스터 자료에서 읽어오는 값이라 이 화면에서는 고칠 수 없습니다 (검토 탭의 ‘보험 만료·미가입’과 같은 기준).</li>
                        <li><b>📝 적요</b> — 진행사항·특이사항을 50자까지 적는 칸입니다. 칸을 눌러 적으면 구글시트 <b>적요</b> 열에 남고
                            다시 조사해도 지워지지 않습니다. <b>마감한 뒤에도 고칠 수 있습니다.</b></li>
                        <li><b style={{ color: DONE_COLOR }}>확인 마감</b> — 한 학원을 다 보셨으면 맨 오른쪽 <b>확인</b> 열의 <b>마감</b>.
                            그 행의 O/X 가 <b>잠겨 잘못 눌러도 바뀌지 않고</b> 진행률로 남습니다. 고치려면 <b>✓ 완료</b>를 눌러 해제하세요.</li>
                    </ol>
                )}
            </div>

            {/* 조작부 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '12px 14px', border: '1px solid var(--border-color)', marginBottom: '12px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    <Chip label={`🏫 학원 ${aActiveList.length}`} active={typeTab === '학원'} onClick={() => setTypeTab('학원')} color="#3b82f6" />
                    <Chip label={`🏠 교습소 ${hActiveList.length}`} active={typeTab === '교습소'} onClick={() => setTypeTab('교습소')} color="#8b5cf6" />
                </div>

                {/* 700곳이 넘는 표에서 한 곳을 찾으려면 눈으로 훑는 수밖에 없었다 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <input value={query} onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                        placeholder={`🔍 학원명 · ${numberLabel} · 플레이스명으로 찾기`}
                        style={{
                            flex: '1 1 220px', minWidth: 0, padding: '7px 11px', fontSize: '0.84rem',
                            border: '1px solid var(--border-color)', borderRadius: '8px',
                            background: 'var(--bg-card)', color: 'var(--text-main)',
                        }} />
                    {query && (
                        <button onClick={() => setQuery('')} style={{
                            background: 'none', border: 'none', color: 'var(--text-muted)',
                            fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}>지우기</button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {FILTERS.map(f => (
                        <Chip key={f} label={f} count={counts[f] || 0} active={filter === f}
                            onClick={() => setFilter(f)} color={VERDICT_COLOR[f]} />
                    ))}
                </div>

                {/* 판정과 별개의 축이다 — '미이행 중 아직 확인 못 한 곳' 같은 조합을 만들 수 있어야 한다 */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '700' }}>확인</span>
                    {DONE_FILTERS.map(f => (
                        <Chip key={f} label={f} active={doneFilter === f}
                            count={f === '확인완료' ? doneCount : f === '미확인' ? rows.length - doneCount : rows.length}
                            onClick={() => setDoneFilter(f)} color={f === '확인완료' ? DONE_COLOR : undefined} />
                    ))}
                    <div style={{ flex: '1 1 140px', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                            확인 완료 <b style={{ color: DONE_COLOR }}>{doneCount}</b> / {rows.length} ({donePct}%)
                        </div>
                        <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${donePct}%`, background: DONE_COLOR, transition: 'width .3s' }} />
                        </div>
                    </div>
                </div>

                {running ? (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>조사 중… {progress.done} / {progress.total}</span>
                            <button onClick={() => { stopRef.current = true; }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' }}>중단</button>
                        </div>
                        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: wait ? '#f59e0b' : 'var(--primary)', transition: 'width .3s' }} />
                        </div>
                        {wait && (
                            <div style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: '6px', lineHeight: 1.7 }}>
                                ⏸ 네이버가 요청을 잠시 막았습니다 — <b>{fmtLeft(wait.left)} 뒤 자동으로 이어서 진행</b>합니다 ({wait.nth}번째 대기).
                                <br />여기 계실 필요 없습니다. 탭만 열어두시면 끝까지 알아서 돕니다. 지금까지 결과는 이미 저장돼 있습니다.
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button onClick={runStale} disabled={!stale.length} style={btnStyle(stale.length ? 'var(--primary)' : 'var(--border-color)')}>
                            🔍 조사 필요 {stale.length}곳
                        </button>
                        <button onClick={runAll} style={btnStyle('#64748b')}>전체 다시 조사 ({rows.length}곳)</button>
                        {paperRows.length > 0 && (
                            <button onClick={downloadWorksheet} style={btnStyle('#0d9488')}
                                title="지금 화면에 걸린 조건 그대로, 학원·교습소를 두 시트에 담아 내려받습니다 (확인불가·해당없음 제외)">
                                📋 점검표 엑셀 ({paperRows.length}곳)
                            </button>
                        )}
                    </div>
                )}

                {/* 문자 문구에 들어가는 값. 한 번 정해 두면 이 브라우저에 남는다 */}
                <div style={{ marginTop: '10px' }}>
                    <button onClick={() => setNoticeOpen(!noticeOpen)} style={{
                        background: 'none', border: '1px solid var(--border-color)', borderRadius: '999px',
                        padding: '3px 10px', color: 'var(--text-muted)', fontSize: '0.76rem',
                        fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
                    }}>{noticeOpen ? '⚙ 문자 설정 접기 ▴' : '⚙ 문자 설정 ▾'}</button>

                    {noticeOpen && (
                        <div style={{
                            marginTop: '8px', display: 'flex', gap: '10px', flexWrap: 'wrap',
                            alignItems: 'flex-end', fontSize: '0.78rem', color: 'var(--text-muted)',
                        }}>
                            <label style={noticeField}>
                                문의 전화
                                <input value={notice.tel} onChange={e => changeNotice({ tel: e.target.value })}
                                    style={noticeInput(140)} />
                            </label>
                            <label style={noticeField}>
                                수정 기한 (오늘부터 며칠)
                                <input type="number" min="0" max="60" value={notice.days}
                                    onChange={e => changeNotice({ days: Math.min(60, Math.max(0, Number(e.target.value) || 0)) })}
                                    style={noticeInput(72)} />
                            </label>
                            <span style={{ paddingBottom: '7px' }}>→ <b>{noticeDeadline(notice.days)}</b>까지</span>
                            <label style={{ ...noticeField, flex: '1 1 260px', minWidth: 0 }}>
                                교육지원청 게시 안내 링크
                                <input value={notice.guideUrl} onChange={e => changeNotice({ guideUrl: e.target.value })}
                                    style={noticeInput()} />
                            </label>
                            <div style={{ flexBasis: '100%', fontSize: '0.76rem', lineHeight: 1.6 }}>
                                표의 <b>✉ 문자</b> 를 누르면 이 값들이 든 문구가 복사됩니다 — 문자마당 창에 붙여넣으세요.
                                문구에는 그 학원에서 <b>X 인 칸만</b> 들어가고, 판정과 달리 <b>번호도 함께</b> 안내합니다.
                                (값은 이 브라우저에만 남습니다)
                            </div>
                        </div>
                    )}
                </div>

                {/* 직접 고친 값의 저장 상태 — 예전에는 실패해도 아무 말 없이 값만 되돌아갔다 */}
                {saveLabel && (
                    <div style={{ fontSize: '0.8rem', marginTop: '8px', color: SAVE_COLOR[saveInfo.status] || 'var(--text-muted)' }}>
                        {saveLabel}
                        {saveInfo.pending > 0 && saveInfo.status !== 'saved' && ` (${saveInfo.pending}건)`}
                        {saveInfo.status === 'failed' && (
                            <>
                                {saveInfo.error ? ` — ${saveInfo.error}` : ''}
                                <button onClick={() => queue.retry()} style={{
                                    marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
                                    border: '1px solid #ef4444', background: 'none', color: '#ef4444',
                                    fontSize: '0.76rem', fontWeight: '700', cursor: 'pointer',
                                }}>다시 저장</button>
                            </>
                        )}
                    </div>
                )}
                {refreshing && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px' }}>저장해 둔 결과를 먼저 보여드리는 중 · 최신 내용을 확인하고 있습니다…</div>}
                {saveState && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>{saveState}</div>}
                {!running && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.7 }}>
                        <b>조사 필요</b> = 한 번도 안 본 곳 + 조사한 지 {RECHECK_DAYS}일 지난 곳
                        + 예전 방식으로 조사해 번호가 <b>오기재로 잘못 남은 곳</b>. 게시 상태는 자주 바뀌지 않아서,
                        최근에 본 곳까지 매번 다시 도는 것이 네이버 차단의 가장 큰 원인이었습니다.
                        <b> 확인 마감한 곳은 대상에서 빠집니다.</b>
                        {stale.length > 30 && <> 지금 대상은 약 {Math.ceil(stale.length * 10 / 60)}분 걸립니다.</>}
                        <br />네이버가 막으면 <b>화면이 알아서 기다렸다 이어서 진행</b>합니다. 지켜보실 필요 없이 탭만 열어두시면 됩니다.
                    </div>
                )}
            </div>

            {/* 결과 표 — 헤더 2줄은 위에, 연번·학원명은 왼쪽에 고정된다 */}
            <div ref={scrollRef} style={{
                background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)',
                overflowX: 'auto', overflowY: 'auto', maxHeight: '72vh', boxShadow: 'var(--shadow-sm)',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '1792px' }}>
                    {/* 열 너비는 여기서 정한다 — 자동 배분에 맡기면 '비고' 가 짜부라져 행이 10줄로 늘어난다.
                        너비를 주지 않은 '비고' 가 남는 폭을 모두 가져간다. */}
                    <colgroup>
                        <col style={{ width: `${W_NUM}px` }} />
                        <col style={{ width: `${W_NAME}px` }} />
                        <col style={{ width: `${W_REGNO}px` }} />
                        {Array.from({ length: CH_GROUPS.length * 2 }, (_, i) => <col key={i} style={{ width: `${W_CH}px` }} />)}
                        <col style={{ width: `${W_LINK}px` }} />
                        <col />
                        <col style={{ width: `${W_INS}px` }} />
                        <col style={{ width: `${W_MEMO}px` }} />
                        <col style={{ width: `${W_CHECK}px` }} />
                    </colgroup>
                    <thead>
                        {/* 1행: 채널 묶음 */}
                        <tr ref={headRowRef}>
                            {/* 좁은 화면에서는 왼쪽 고정을 풀어 옆 칸이 가려지지 않게 한다 */}
                            <Th rowSpan={2} left={isNarrow ? undefined : 0} center>#</Th>
                            <Th rowSpan={2} left={isNarrow ? undefined : W_NUM}>학원명</Th>
                            <Th rowSpan={2}>{numberLabel}</Th>
                            <Th colSpan={2} center>플레이스</Th>
                            {BUCKETS.map(b => <Th key={b} colSpan={2} center>{BUCKET_LABEL[b]}</Th>)}
                            <Th rowSpan={2}>링크</Th>
                            <Th rowSpan={2}>비고</Th>
                            <Th rowSpan={2} center>보험</Th>
                            <Th rowSpan={2}>적요</Th>
                            <Th rowSpan={2} center>확인</Th>
                        </tr>
                        {/* 2행: 묶음별 항목 */}
                        <tr>
                            {/* '등록번호' 를 7묶음에 14번 되풀이하면 칸마다 76px 이 필요하다.
                                무슨 번호인지는 안내문과 왼쪽 '등록번호' 열이 이미 말해 준다 */}
                            {CH_GROUPS.map(g => [
                                <Th key={`${g}-no`} top={headRowH} center tight>번호</Th>,
                                <Th key={`${g}-fee`} top={headRowH} center tight>교습비</Th>,
                            ])}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.length === 0 && (
                            <tr><td colSpan={8 + CH_GROUPS.length * 2} style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                {search.trim() ? `'${search.trim()}' 에 해당하는 ${typeTab}이(가) 없습니다.` : `해당하는 ${typeTab}이(가) 없습니다.`}
                            </td></tr>
                        )}
                        {shown.map(({ key, target, result }, i) => (
                            <SnsCheckRow
                                key={key}
                                index={i + 1}
                                rowKey={key}
                                target={target}
                                result={result}
                                academy={academyByKey.get(key)}
                                group={groups.get(key)}
                                dup={dupPlaces.get(key)}
                                academyByKey={academyByKey}
                                region={region}
                                isNarrow={isNarrow}
                                running={running}
                                highlight={key === jumpKey}
                                pinOpen={pinRow === key}
                                pinInput={pinRow === key ? pinInput : ''}
                                pinError={pinRow === key ? pinError : null}
                                memoOpen={memoRow === key}
                                memoInput={memoRow === key ? memoInput : ''}
                                onSelectAcademy={onSelectAcademy}
                                onCycle={cycleCell}
                                onToggleDone={toggleDone}
                                onToggleNoPlace={toggleNoPlace}
                                onRefresh={runOne}
                                onJump={jumpToRow}
                                onPinOpen={openPin}
                                onPinChange={changePin}
                                onPinSave={savePinFromInput}
                                onPinCancel={cancelPin}
                                onPinClear={clearPlacePin}
                                onPinConfirm={confirmPlace}
                                onMemoOpen={openMemo}
                                onMemoChange={changeMemo}
                                onMemoSave={saveMemo}
                                onMemoCancel={cancelMemo}
                                registerRow={registerRow}
                            />
                        ))}
                        {/* 표 끝에 닿으면 다음 묶음을 이어 붙인다 (한 번에 다 그리면 첫 화면이 멈춘다) */}
                        {more > 0 && (
                            <tr ref={sentinelRef}>
                                <td colSpan={8 + CH_GROUPS.length * 2} style={{ padding: '18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    남은 {more}곳을 불러오는 중…
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const btnStyle = (bg) => ({
    padding: '8px 14px', borderRadius: '8px', border: 'none', background: bg,
    color: 'white', fontSize: '0.84rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
});
