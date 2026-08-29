import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
    probeAll, fetchSnsChecks, saveSnsChecks, resultToRecord, recordKey, rowToResult,
    toProbeTargets, placeSearchUrl, blogSearchUrl, parseChannels, needsRecheck,
    assignBuckets, bucketCells, snsRemark, BUCKETS, BUCKET_LABEL,
    RECHECK_DAYS, VERDICT_COLOR,
} from '../utils/snsCheck';
import OxBadge from './SnsOxBadge';

const FILTERS = ['전체', '미이행', '이행', '확인불가', '미조사'];

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

// ── 표 치수 ────────────────────────────────────────────
const W_NUM = 40;     // '#' 열 — 학원명 열의 sticky left 값이기도 하다
const W_NAME = 168;
const W_CH = 60;      // 채널 O/X 칸 — 묶음 7개 × (번호·교습비) = 14칸
// 표의 채널 묶음 순서: 플레이스 뒤로 blog·homepage·cafe·youtube·instagram·etc
const CH_GROUPS = ['place', ...BUCKETS];
// 줄무늬·헤더 배경 (--bg-main 은 어디에도 정의돼 있지 않아 투명하게 나온다.
//  sticky 헤더가 투명하면 아래 행이 그대로 비쳐 보이므로 정의된 변수를 쓴다)
const BG_STRIPE = 'var(--bg-light)';
const BG_ROW = 'var(--bg-card)';

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

const Td = ({ children, style }) => (
    <td style={{
        padding: '10px', fontSize: '0.86rem', lineHeight: 1.5, color: 'var(--text-main)',
        borderTop: '1px solid var(--border-color)', ...style,
    }}>{children}</td>
);

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
    const academyById = useMemo(() => {
        const m = new Map();
        [...aActiveList, ...hActiveList].forEach(a => { if (a.id) m.set(a.id, a); });
        return m;
    }, [aActiveList, hActiveList]);

    const [results, setResults] = useState({});      // key → result
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [saveState, setSaveState] = useState('');
    // 네이버가 막았을 때 자동으로 쉬는 중인 상태 (남은 초, 몇 번째 대기인지)
    const [wait, setWait] = useState(null);
    const [typeTab, setTypeTab] = useState('학원');
    const numberLabel = typeTab === '교습소' ? '신고번호' : '등록번호';
    const [filter, setFilter] = useState('미이행');
    const stopRef = useRef(false);
    // 저장 여부를 판단할 때 최신 결과가 필요하다 (setState 갱신함수 안에서 부수효과를 내지 않으려고 ref 로 둔다)
    const resultsRef = useRef({});

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

    // 저장된 결과 불러오기
    useEffect(() => {
        let alive = true;
        fetchSnsChecks().then(rows => {
            if (!alive) return;
            const map = {};
            rows.forEach(row => {
                const r = rowToResult(row);
                if (r.regNo) map[recordKey(r.category, r.regNo)] = r;
            });
            setResults(map);
            resultsRef.current = map;
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    const scoped = useMemo(
        () => targets.filter(t => t.category === typeTab),
        [targets, typeTab]);

    // 이미 찾아둔 플레이스 ID는 재조사 때 넘겨 검색 단계를 건너뛴다 (차단 위험·소요시간 감소)
    const withResult = useMemo(
        () => scoped.map(t => {
            const result = results[recordKey(t.category, t.regNo)] || null;
            return { target: result?.플레이스ID ? { ...t, placeId: result.플레이스ID } : t, result };
        }),
        [scoped, results]);

    const counts = useMemo(() => {
        const c = { 전체: withResult.length, 이행: 0, 미이행: 0, 확인불가: 0, 미조사: 0 };
        withResult.forEach(({ result }) => {
            if (!result) c.미조사++;
            else c[result.판정] = (c[result.판정] || 0) + 1;
        });
        return c;
    }, [withResult]);

    // 기본 조사 대상 — 한 번도 안 본 곳 + 조사한 지 오래된 곳
    const stale = useMemo(
        () => withResult.filter(x => needsRecheck(x.result)),
        [withResult]);

    const visible = useMemo(() => {
        if (filter === '전체') return withResult;
        if (filter === '미조사') return withResult.filter(x => !x.result);
        return withResult.filter(x => x.result && x.result.판정 === filter);
    }, [withResult, filter]);

    const lastCheckedAt = useMemo(() => {
        let latest = '';
        Object.values(results).forEach(r => { if (r.checkedAt > latest) latest = r.checkedAt; });
        return latest;
    }, [results]);

    // ── 자동조사 실행 ───────────────────────────────────
    const runProbe = useCallback(async (list, label) => {
        if (!list.length) return;
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

                const next = { ...resultsRef.current };
                usable.forEach(r => { next[recordKey(r.category, r.regNo)] = r; });
                resultsRef.current = next;
                setResults(next);

                // 저장은 순차 처리(동시 쓰기로 시트 행이 꼬이지 않도록)
                saveQueue = saveQueue.then(async () => {
                    try {
                        await saveSnsChecks(usable.map(resultToRecord));
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
    }, [region]);

    const runStale = () => runProbe(stale.map(x => x.target), typeTab);
    const runAll = () => runProbe(withResult.map(x => x.target), `${typeTab} 전체`);
    const runOne = async (target) => {
        setRunning(true);
        setSaveState('');
        const { results: [r], blocked, blockedReason } = await probeAll([target], region, { autoResume: false });
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
        const next = { ...resultsRef.current, [key]: r };
        resultsRef.current = next;
        setResults(next);
        try { await saveSnsChecks([resultToRecord(r)]); } catch { /* 화면 결과는 유지 */ }
    };

    // ── 미이행 연락처 엑셀 ──────────────────────────────
    const downloadNonCompliantExcel = () => {
        const items = withResult.filter(x => x.result && x.result.판정 === '미이행');
        if (!items.length) return;
        const rows = items.map(({ target, result }, i) => ({
            '순번': i + 1,
            '학원명': target.name,
            [numberLabel]: target.regNo,
            '설립자': target.founderName,
            '연락처': target.contact,
            '미이행사유': result.미이행사유 || '',
            '플레이스 교습비': result.플레이스_교습비 || '',
            '플레이스 게시형태': result.플레이스_게시형태 || '',
            [`플레이스 ${numberLabel}`]: result.플레이스_번호 || '',
            '플레이스 기재번호': result.플레이스_기재번호 || '',
            '블로그': result.블로그 || '',
            '블로그 교습비': result.블로그_교습비 || '',
            [`블로그 ${numberLabel}`]: result.블로그_번호 || '',
            '블로그 기재번호': result.블로그_기재번호 || '',
            // 플레이스 홈에 걸린 링크 전체 (블로그·홈페이지·인스타그램…)
            '연결채널': parseChannels(result)
                .map(c => `${c.유형} 교습비${c.교습비}/번호${c.번호} ${c.url}`).join('\n'),
            '플레이스URL': result.플레이스URL || '',
            '확인일시': fmtWhen(result.checkedAt),
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 40 },
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 50 }, { wch: 40 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, typeTab);
        const d = new Date();
        const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        XLSX.writeFile(wb, `SNS미이행_${region}_${typeTab}_${ymd}.xlsx`);
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>저장된 점검 결과를 불러오는 중…</div>;
    }

    return (
        <div>
            {/* 안내 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px', border: '1px solid var(--border-color)', marginBottom: '12px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '6px' }}>📣 네이버 교습비·등록번호 게시점검</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    네이버플레이스의 가격 메뉴·가격표 이미지·소개글과, <b>플레이스 홈에 링크된 블로그·홈페이지·카페·인스타그램</b>을
                    자동으로 조사해 교습비와 등록(신고)번호 게시 여부를 판정합니다. 링크가 없는 채널은 따로 검색하지 않습니다.
                    <b> 자동 판정이므로 확정 위반이 아니라 안내·점검 우선순위 참고 자료</b>이며,
                    동명 학원이나 지점이 있으면 <b>확인불가</b>로 남습니다.
                    <b> 학원명을 누르면</b> 그 학원의 상세 SNS 화면에서 판정 근거를 전부 볼 수 있습니다.
                    {lastCheckedAt && <><br />최근 조사: <b>{fmtWhen(lastCheckedAt)}</b></>}
                </div>
            </div>

            {/* 조작부 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '12px 14px', border: '1px solid var(--border-color)', marginBottom: '12px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    <Chip label={`🏫 학원 ${aActiveList.length}`} active={typeTab === '학원'} onClick={() => setTypeTab('학원')} color="#3b82f6" />
                    <Chip label={`🏠 교습소 ${hActiveList.length}`} active={typeTab === '교습소'} onClick={() => setTypeTab('교습소')} color="#8b5cf6" />
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {FILTERS.map(f => (
                        <Chip key={f} label={f} count={counts[f] || 0} active={filter === f}
                            onClick={() => setFilter(f)} color={VERDICT_COLOR[f]} />
                    ))}
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
                        <button onClick={runAll} style={btnStyle('#64748b')}>전체 다시 조사 ({scoped.length}곳)</button>
                        {counts.미이행 > 0 && <button onClick={downloadNonCompliantExcel} style={btnStyle('#ef4444')}>📥 미이행 연락처 ({counts.미이행})</button>}
                    </div>
                )}
                {saveState && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>{saveState}</div>}
                {!running && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.7 }}>
                        <b>조사 필요</b> = 한 번도 안 본 곳 + 조사한 지 {RECHECK_DAYS}일 지난 곳. 게시 상태는 자주 바뀌지 않아서,
                        최근에 본 곳까지 매번 다시 도는 것이 네이버 차단의 가장 큰 원인이었습니다.
                        {stale.length > 30 && <> 지금 대상은 약 {Math.ceil(stale.length * 10 / 60)}분 걸립니다.</>}
                        <br />네이버가 막으면 <b>화면이 알아서 기다렸다 이어서 진행</b>합니다. 지켜보실 필요 없이 탭만 열어두시면 됩니다.
                    </div>
                )}
            </div>

            {/* 결과 표 — 헤더 2줄은 위에, 연번·학원명은 왼쪽에 고정된다 */}
            <div style={{
                background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)',
                overflowX: 'auto', overflowY: 'auto', maxHeight: '72vh', boxShadow: 'var(--shadow-sm)',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '1740px' }}>
                    {/* 열 너비는 여기서 정한다 — 자동 배분에 맡기면 '비고' 가 짜부라져 행이 10줄로 늘어난다.
                        너비를 주지 않은 '비고' 가 남는 폭을 모두 가져간다. */}
                    <colgroup>
                        <col style={{ width: `${W_NUM}px` }} />
                        <col style={{ width: `${W_NAME}px` }} />
                        <col style={{ width: '76px' }} />
                        {Array.from({ length: CH_GROUPS.length * 2 }, (_, i) => <col key={i} style={{ width: `${W_CH}px` }} />)}
                        <col style={{ width: '130px' }} />
                        <col />
                        <col style={{ width: '118px' }} />
                        <col style={{ width: '84px' }} />
                    </colgroup>
                    <thead>
                        {/* 1행: 채널 묶음 */}
                        <tr ref={headRowRef}>
                            <Th rowSpan={2} left={0} center>#</Th>
                            <Th rowSpan={2} left={W_NUM}>학원명</Th>
                            <Th rowSpan={2}>{numberLabel}</Th>
                            <Th colSpan={2} center>플레이스</Th>
                            {BUCKETS.map(b => <Th key={b} colSpan={2} center>{BUCKET_LABEL[b]}</Th>)}
                            <Th rowSpan={2}>링크</Th>
                            <Th rowSpan={2}>비고</Th>
                            <Th rowSpan={2}>전화번호</Th>
                            <Th rowSpan={2} center>새로고침</Th>
                        </tr>
                        {/* 2행: 묶음별 항목 */}
                        <tr>
                            {CH_GROUPS.map(g => [
                                <Th key={`${g}-no`} top={headRowH} center tight>{numberLabel}</Th>,
                                <Th key={`${g}-fee`} top={headRowH} center tight>교습비</Th>,
                            ])}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.length === 0 && (
                            <tr><td colSpan={7 + CH_GROUPS.length * 2} style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                해당하는 {typeTab}이(가) 없습니다.
                            </td></tr>
                        )}
                        {visible.map(({ target, result }, i) => {
                            const rowBg = i % 2 === 0 ? BG_ROW : BG_STRIPE;
                            const channels = parseChannels(result);
                            const cells = bucketCells(channels);
                            const at = assignBuckets(channels);
                            const academy = academyById.get(target.id);
                            const remark = snsRemark(result);
                            // 아직 조사 전이면 빈 값(–), 조사했는데 그 채널 링크가 없으면 '없음'
                            const ch = (key, field) => {
                                if (!result) return '';
                                const c = cells[key];
                                if (!c) return '없음';
                                return c.notProbed ? '조사안함' : c[field];
                            };
                            // 플레이스를 못 찾은 것은 '없다'는 뜻이 아니다 — 이름이 달라 검색에 안 걸렸을 뿐
                            // 실제로는 거의 다 플레이스가 있으므로 '없음'이 아니라 '?'로 남긴다
                            const place = (field) => (!result ? '' : result.matchStatus === 'no_match' ? '?' : result[field]);
                            return (
                                <tr key={recordKey(target.category, target.regNo)} style={{ background: rowBg }}>
                                    <Td style={{ ...stickyTd(0, rowBg), color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>{i + 1}</Td>
                                    <Td style={{ ...stickyTd(W_NUM, rowBg), wordBreak: 'keep-all' }}>
                                        {academy && onSelectAcademy ? (
                                            <span onClick={() => onSelectAcademy(academy, 'sns')}
                                                style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                                                {target.name}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>{target.name}</span>
                                        )}
                                        {result?.플레이스명 && result.플레이스명 !== target.name && (
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>→ {result.플레이스명}</div>
                                        )}
                                    </Td>
                                    <Td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{target.regNo}</Td>

                                    <Td style={CENTER}><OxBadge value={place('플레이스_번호')} /></Td>
                                    <Td style={CENTER}><OxBadge value={place('플레이스_교습비')} /></Td>
                                    {BUCKETS.map(b => [
                                        <Td key={`${b}-no`} style={CENTER}><OxBadge value={ch(b, '번호')} /></Td>,
                                        <Td key={`${b}-fee`} style={CENTER}><OxBadge value={ch(b, '교습비')} /></Td>,
                                    ])}

                                    <Td>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                            <a href={result?.플레이스URL || placeSearchUrl(target.name, region)} target="_blank" rel="noreferrer" style={linkStyle}>
                                                {result?.플레이스URL ? '플레이스' : '플레이스검색'}
                                            </a>
                                            {/* 플레이스 홈에 걸린 링크들 — 실제로 조사한 대상이다 */}
                                            {channels.map((c, ci) => (
                                                <a key={`${c.url}-${ci}`} href={c.url} target="_blank" rel="noreferrer" style={linkStyle}>
                                                    {BUCKET_LABEL[at[ci]]}
                                                </a>
                                            ))}
                                            {!result && <a href={blogSearchUrl(target.name, region)} target="_blank" rel="noreferrer" style={linkStyle}>블로그검색</a>}
                                        </div>
                                    </Td>
                                    <Td style={{ fontSize: '0.8rem', color: '#ef4444', wordBreak: 'keep-all' }}>{remark}</Td>
                                    <Td style={{ whiteSpace: 'nowrap' }}>
                                        {target.contact
                                            ? <a href={`tel:${target.contact}`} style={{ ...linkStyle, fontSize: '0.84rem' }}>{target.contact}</a>
                                            : <span style={{ color: 'var(--text-muted)' }}>–</span>}
                                    </Td>
                                    <Td style={CENTER}>
                                        <button onClick={() => runOne(target)} disabled={running} style={{
                                            background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px',
                                            padding: '5px 9px', color: running ? 'var(--text-muted)' : '#0ea5e9',
                                            fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap',
                                            cursor: running ? 'default' : 'pointer',
                                        }}>새로고침</button>
                                    </Td>
                                </tr>
                            );
                        })}
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

const linkStyle = { color: '#3b82f6', fontWeight: '600', textDecoration: 'none' };
const CENTER = { textAlign: 'center' };

// 가로로 스크롤해도 남는 왼쪽 고정 칸 — 배경이 투명하면 뒤 칸이 비쳐 보인다
const stickyTd = (left, background) => ({ position: 'sticky', left, zIndex: 2, background });
