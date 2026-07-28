import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
    probeAll, fetchSnsChecks, saveSnsChecks, resultToRecord, recordKey, rowToResult, regSub,
    toProbeTargets, placeSearchUrl, blogSearchUrl, parseChannels, needsRecheck,
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
        padding: '5px 10px', borderRadius: '999px', fontSize: '0.76rem', cursor: 'pointer',
        border: '1px solid', borderColor: active ? (color || 'var(--primary)') : 'var(--border-color)',
        background: active ? (color || 'var(--primary)') : 'transparent',
        color: active ? 'white' : 'var(--text-muted)', fontWeight: active ? '700' : '500', whiteSpace: 'nowrap',
    }}>{label}{count !== undefined ? ` ${count}` : ''}</button>
);

const Th = ({ children, w }) => (
    <th style={{ padding: '7px 8px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap', width: w }}>{children}</th>
);

const Td = ({ children, style }) => (
    <td style={{ padding: '7px 8px', fontSize: '0.76rem', color: 'var(--text-main)', borderTop: '1px solid var(--border-color)', ...style }}>{children}</td>
);


export default function SnsCheckTab({ region, academies }) {
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

        const { blocked, blockedReason } = await probeAll(list, region, {
            shouldStop: () => stopRef.current,
            onWait: (left, nth, reason) => setWait(left ? { left, nth, reason } : null),
            onProgress: (done, total, chunk) => {
                setProgress({ done, total });
                if (!chunk.length) return;
                setResults(prev => {
                    const next = { ...prev };
                    chunk.forEach(r => { next[recordKey(r.category, r.regNo)] = r; });
                    return next;
                });
                // 저장은 순차 처리(동시 쓰기로 시트 행이 꼬이지 않도록)
                saveQueue = saveQueue.then(async () => {
                    try {
                        await saveSnsChecks(chunk.map(resultToRecord));
                        savedCount += chunk.length;
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
        if (!savedCount && !saveError) return;
        setSaveState(saveError
            ? `⚠ 일부 저장 실패: ${saveError} (저장 ${savedCount}곳, 화면 결과는 유지됩니다)`
            : `✓ ${label} ${savedCount}곳 저장 완료`);
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
        setResults(prev => ({ ...prev, [recordKey(r.category, r.regNo)]: r }));
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
                <div style={{ fontSize: '0.88rem', fontWeight: '800', marginBottom: '6px' }}>📣 네이버 교습비·등록번호 게시점검</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    네이버플레이스의 가격 메뉴·가격표 이미지·소개글과, <b>플레이스 홈에 링크된 블로그·홈페이지·인스타그램</b>을
                    자동으로 조사해 교습비와 등록(신고)번호 게시 여부를 판정합니다. 링크가 없는 채널은 따로 검색하지 않습니다.
                    <b> 자동 판정이므로 확정 위반이 아니라 안내·점검 우선순위 참고 자료</b>이며,
                    동명 학원이나 지점이 있으면 <b>확인불가</b>로 남습니다. 최종 확인은 링크로 직접 보시기 바랍니다.
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>조사 중… {progress.done} / {progress.total}</span>
                            <button onClick={() => { stopRef.current = true; }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.76rem', fontWeight: '700', cursor: 'pointer' }}>중단</button>
                        </div>
                        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: wait ? '#f59e0b' : 'var(--primary)', transition: 'width .3s' }} />
                        </div>
                        {wait && (
                            <div style={{ fontSize: '0.74rem', color: '#f59e0b', marginTop: '6px', lineHeight: 1.6 }}>
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
                {saveState && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px' }}>{saveState}</div>}
                {!running && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.6 }}>
                        <b>조사 필요</b> = 한 번도 안 본 곳 + 조사한 지 {RECHECK_DAYS}일 지난 곳. 게시 상태는 자주 바뀌지 않아서,
                        최근에 본 곳까지 매번 다시 도는 것이 네이버 차단의 가장 큰 원인이었습니다.
                        {stale.length > 30 && <> 지금 대상은 약 {Math.ceil(stale.length * 15 / 60)}분 걸립니다.</>}
                        <br />네이버가 막으면 <b>화면이 알아서 기다렸다 이어서 진행</b>합니다. 지켜보실 필요 없이 탭만 열어두시면 됩니다.
                    </div>
                )}
            </div>

            {/* 결과 표 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)', overflowX: 'auto', boxShadow: 'var(--shadow-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-main)' }}>
                            <Th w="34px">#</Th><Th>학원명</Th><Th w="66px">{numberLabel}</Th>
                            <Th w="66px">판정</Th>
                            <Th w="104px">플레이스<br />교습비</Th><Th w="112px">플레이스<br />{numberLabel}</Th>
                            <Th w="96px">블로그<br />교습비</Th><Th w="112px">블로그<br />{numberLabel}</Th>
                            <Th>사유 / 링크</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.length === 0 && (
                            <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                해당하는 {typeTab}이(가) 없습니다.
                            </td></tr>
                        )}
                        {visible.map(({ target, result }, i) => (
                            <tr key={recordKey(target.category, target.regNo)} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{i + 1}</Td>
                                <Td style={{ fontWeight: '600' }}>
                                    {target.name}
                                    {result?.플레이스명 && result.플레이스명 !== target.name && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>→ {result.플레이스명}</div>
                                    )}
                                </Td>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>{target.regNo}</Td>
                                <Td>
                                    {result
                                        ? <span style={{ color: VERDICT_COLOR[result.판정], fontWeight: '800', fontSize: '0.74rem' }}>{result.판정}</span>
                                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>미조사</span>}
                                </Td>
                                <Td>
                                    <OxBadge value={result?.플레이스_교습비} sub={result?.플레이스_게시형태 !== '없음' ? result?.플레이스_게시형태 : ''} />
                                </Td>
                                <Td>
                                    <OxBadge value={result?.플레이스_번호}
                                        sub={result ? regSub(result.플레이스_기재번호, result.플레이스_번호대조, target.regNo) : ''}
                                        subColor={result?.플레이스_번호대조 === '불일치' ? '#ef4444' : undefined} />
                                </Td>
                                <Td>
                                    {result && result.블로그 !== '있음'
                                        ? <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{result.블로그 || '-'}</span>
                                        : <OxBadge value={result?.블로그_교습비} />}
                                </Td>
                                <Td>
                                    {result && result.블로그 !== '있음'
                                        ? <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>-</span>
                                        : <OxBadge value={result?.블로그_번호}
                                            sub={result ? regSub(result.블로그_기재번호, result.블로그_번호대조, target.regNo) : ''}
                                            subColor={result?.블로그_번호대조 === '불일치' ? '#ef4444' : undefined} />}
                                </Td>
                                <Td>
                                    {result?.미이행사유 && (
                                        <div style={{ fontSize: '0.71rem', color: '#ef4444', marginBottom: '3px' }}>{result.미이행사유}</div>
                                    )}
                                    {result && result.판정 === '확인불가' && (
                                        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                            자동 매칭 실패 — 직접 확인 필요
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '8px', fontSize: '0.71rem', flexWrap: 'wrap' }}>
                                        <a href={result?.플레이스URL || placeSearchUrl(target.name, region)} target="_blank" rel="noreferrer" style={linkStyle}>플레이스</a>
                                        {/* 플레이스 홈에 걸린 링크들 — 실제로 조사한 대상이다 */}
                                        {parseChannels(result).map((c, ci) => (
                                            <a key={`${c.url}-${ci}`} href={c.url} target="_blank" rel="noreferrer" style={linkStyle}
                                                title={`${c.유형} · 교습비 ${c.교습비} / ${numberLabel} ${c.번호}`}>
                                                {c.유형}{c.교습비 === 'O' && c.번호 === 'O' ? '✓' : c.번호대조 === '확인불가' ? '?' : '✕'}
                                            </a>
                                        ))}
                                        {!result && <a href={blogSearchUrl(target.name, region)} target="_blank" rel="noreferrer" style={linkStyle}>블로그검색</a>}
                                        <button onClick={() => runOne(target)} disabled={running} style={{ background: 'none', border: 'none', padding: 0, color: '#0ea5e9', fontSize: '0.71rem', fontWeight: '600', cursor: running ? 'default' : 'pointer' }}>다시확인</button>
                                        {target.contact && <a href={`tel:${target.contact}`} style={linkStyle}>{target.contact}</a>}
                                    </div>
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const btnStyle = (bg) => ({
    padding: '7px 12px', borderRadius: '8px', border: 'none', background: bg,
    color: 'white', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
});

const linkStyle = { color: '#3b82f6', fontWeight: '600', textDecoration: 'none' };
