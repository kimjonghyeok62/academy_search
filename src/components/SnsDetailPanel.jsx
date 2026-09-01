import { useState, useEffect } from 'react';
import {
    fetchSnsCheckContext, probeAll, saveSnsChecks, resultToRecord, parseChannels,
    placeSearchUrl, VERDICT_COLOR, rowCells, cellKey, assignBuckets, effectiveVerdict,
    applyManualCell, setManualCell, keepManual, parseManual, manualCells, parsePlaceId, pinnedPlaceId,
    isDone, doneAt, setDone,
    remarkPlaceHint, pinResolvedPlace, hasPlaceCandidate,
    effectivePlaceId, sharedCellTargets, buildGroups, recordKey, PIN_CLEARED,
    currentPlaceUrl, placeSource, placeUrlFromId, pinnedPlaceUrl,
} from '../utils/snsCheck';

const CHANNEL_ICON = { blog: '✍️', instagram: '📷', homepage: '🌐' };
const MANUAL_COLOR = '#2563eb';
const DONE_COLOR = '#10b981';

const CYCLE_HINT = '눌러서 직접 확인한 값으로 바꿉니다 (자동값 → O → X → 없음 → 자동값)';
const LOCKED_HINT = '확인 완료로 마감된 학원입니다 — 고치려면 위의 ✓ 확인완료 를 눌러 해제하세요';

const fmtWhen = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 16).replace('T', ' ');
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const card = {
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: '12px', padding: '14px 16px', marginBottom: '12px',
};

const shortUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

const AUTO_LABEL = { O: '게시', X: '미게시', '?': '확인 못 함', 없음: '링크 없음', 안함: '자동 조사 안 함' };

/**
 * 게시 의무 항목 한 줄 (교습비 / 등록번호).
 * cell 은 rowCells() 가 만든 칸 — 담당자가 직접 고친 값이면 파란색으로 보이고,
 * 눌러서 자동값 → O → X → 없음 → 자동값 으로 바꿀 수 있다 (목록 화면과 같은 동작).
 */
function ObligationRow({ label, cell, detail, detailColor, onToggle, disabled, lockedHint }) {
    const value = cell ? cell.value : '';
    const manual = cell && cell.manual !== undefined;
    const ok = value === 'O';
    const unknown = value !== 'O' && value !== 'X';
    return (
        <div
            onClick={disabled ? undefined : onToggle}
            title={disabled ? lockedHint : CYCLE_HINT}
            style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0',
                borderTop: '1px solid var(--border-color)',
                cursor: disabled ? 'default' : 'pointer', userSelect: 'none',
            }}>
            <span style={{
                flexShrink: 0, width: '22px', textAlign: 'center', fontWeight: '800', fontSize: '0.95rem',
                color: manual ? MANUAL_COLOR : unknown ? 'var(--text-muted)' : ok ? '#10b981' : '#ef4444',
                borderBottom: manual ? `2px solid ${MANUAL_COLOR}` : 'none',
            }}>{manual ? value : unknown ? '–' : ok ? '✓' : '✕'}</span>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: '600', color: 'var(--text-main)' }}>
                    {label}
                    {manual && (
                        <span style={{
                            marginLeft: '6px', fontSize: '0.7rem', fontWeight: '800', color: 'white',
                            background: MANUAL_COLOR, borderRadius: '999px', padding: '1px 7px',
                        }}>직접 확인함</span>
                    )}
                </div>
                {manual ? (
                    <div style={{ fontSize: '0.76rem', color: MANUAL_COLOR, marginTop: '2px' }}>
                        담당자가 직접 확인해 <b>{value}</b> 로 두었습니다
                        {cell.auto && cell.auto !== value && ` (자동 조사값: ${AUTO_LABEL[cell.auto] || cell.auto})`}
                    </div>
                ) : (
                    detail && <div style={{ fontSize: '0.76rem', color: detailColor || 'var(--text-muted)', marginTop: '2px' }}>{detail}</div>
                )}
            </div>
        </div>
    );
}

export default function SnsDetailPanel({ academy, region = '하남', allAcademies = [], onSelectAcademy }) {
    const category = (academy.category || '').includes('교습소') ? '교습소' : '학원';
    const numberLabel = category === '교습소' ? '신고번호' : '등록번호';
    const regNo = academy.id || '';

    const key = recordKey(category, regNo);
    const [result, setResult] = useState(null);
    // 묶음(같은 블로그·플레이스를 함께 쓰는 학원) 판정과 교습비 전파에 전체 결과가 필요하다
    const [results, setResults] = useState({});
    const [loadedKey, setLoadedKey] = useState(null);
    const [running, setRunning] = useState(false);
    const [message, setMessage] = useState('');
    const [pinOpen, setPinOpen] = useState(false);
    const [pinInput, setPinInput] = useState('');

    // 다른 학원으로 바뀌면 loadedKey 가 어긋나 자동으로 로딩 상태가 된다
    const loading = loadedKey !== key;

    useEffect(() => {
        let alive = true;
        fetchSnsCheckContext(category, regNo)
            .then(({ result: r, results: all }) => {
                if (!alive) return;
                setResult(r);
                setResults(all);
                setLoadedKey(key);
            })
            // 조회 실패도 로딩을 풀어야 한다 (결과 없음으로 표시하고 '지금 조사' 를 쓸 수 있게)
            .catch(() => { if (alive) setLoadedKey(key); });
        return () => { alive = false; };
    }, [category, regNo, key]);

    const groups = buildGroups(results);
    const group = groups.get(key);
    // 플레이스·블로그를 함께 쓰는 다른 학원 — 이름을 누르면 그 학원 상세로 간다
    // (members 와 names 는 buildGroups 에서 같은 순서로 쌓인다)
    const siblings = (group?.members || [])
        .map((m, i) => {
            const [cat, no] = m.split('|');
            return {
                key: m,
                name: group.names[i] || no,
                academy: (allAcademies || []).find((a) => a.id === no
                    && ((a.category || '').includes('교습소') ? '교습소' : '학원') === cat),
            };
        })
        .filter((x) => x.key !== key);

    const runCheck = async (base, { ignoreStoredPlace = false } = {}) => {
        const from = base || result;
        setRunning(true);
        setMessage('');
        const pinned = pinnedPlaceId(from);
        // 시트 비고에 적어둔 단축주소 — 번호가 없어 서버가 펴야 한다 (지정·저장된 플레이스가 없을 때만)
        const hintUrl = pinned ? '' : remarkPlaceHint(from).url;
        const target = {
            id: regNo, name: academy.name || '', category, regNo,
            address: academy.address || '',
            // 직접 지정한 플레이스가 있으면 그것만 본다. 지정을 푼 직후에는 저장된 플레이스도
            // 무시해야 새로 검색한다 (그대로 두면 잘못 잡은 그 플레이스를 다시 물고 온다).
            placeId: hintUrl ? '' : (pinned || (ignoreStoredPlace ? '' : effectivePlaceId(from))),
            placeHint: hintUrl,
            placePinned: !!pinned || !!hintUrl,
        };
        // 1곳짜리 조사는 막혔다고 10분씩 기다릴 게 아니라 바로 알려준다
        const { results: [r], blocked, blockedReason } = await probeAll([target], region, { autoResume: false });
        setRunning(false);
        if (blocked || !r) {
            setMessage(`⛔ 네이버가 요청을 일시 차단했습니다${blockedReason ? ` (${blockedReason})` : ''}. 잠시 후 다시 시도하세요.`);
            return;
        }
        // 담당자가 직접 고친 값·지정·묶음은 새 조사 결과에 없다 — 이어 붙이지 않으면 화면에서 사라진다
        const merged = pinResolvedPlace(keepManual(r, from));
        setResult(merged);
        setResults((prev) => ({ ...prev, [key]: merged }));
        try { await saveSnsChecks([resultToRecord(merged)]); setMessage('✓ 조사 결과를 저장했습니다.'); }
        catch (err) { setMessage(`⚠ 저장 실패: ${err.message} (아래 결과는 이번 조사 값입니다)`); }
    };

    // ── 칸을 눌러 직접 확인한 값 넣기 ────────────────────
    // 목록 화면과 같은 규칙이다. 같은 블로그·플레이스를 함께 쓰는 학원에는 교습비만 함께 반영한다.
    const cycle = async (cell) => {
        if (!result) return;
        const updated = applyManualCell(result, cell.key);
        const value = parseManual(updated)[cell.key];
        const shared = sharedCellTargets(results, result, cell.key, groups);

        const before = { result, results };
        const nextResults = { ...results, [key]: updated };
        const records = [resultToRecord(updated)];
        shared.forEach(({ rowKey, result: r, key: k }) => {
            const u = setManualCell(r, k, value);
            nextResults[rowKey] = u;
            records.push(resultToRecord(u));
        });

        setResult(updated);
        setResults(nextResults);
        setMessage(shared.length
            ? `같은 채널을 쓰는 ${shared.map((s) => s.name).join('·')} 에도 함께 반영했습니다 (교습비만).`
            : '');
        try {
            await saveSnsChecks(records);
        } catch (err) {
            // 저장이 안 됐는데 화면만 바뀌어 있으면 고쳤다고 착각하게 된다 — 되돌린다
            setResult(before.result);
            setResults(before.results);
            setMessage(`⚠ 직접 입력한 값을 저장하지 못했습니다: ${err.message}`);
        }
    };

    // ── 플레이스 직접 지정 ───────────────────────────────
    const savePin = async (raw) => {
        const id = parsePlaceId(raw);
        if (!id) {
            setMessage('플레이스 주소에서 번호를 찾지 못했습니다. 네이버플레이스 주소를 그대로 붙여넣어 주세요.');
            return;
        }
        const base = result || { category, regNo, name: academy.name || '', 판정: '', checkedAt: '' };
        const updated = { ...base, 플레이스지정: placeUrlFromId(id) };
        setResult(updated);
        setResults((prev) => ({ ...prev, [key]: updated }));
        setPinOpen(false);
        setPinInput('');
        setMessage('플레이스를 지정했습니다. 이어서 그 플레이스로 다시 조사합니다…');
        try { await saveSnsChecks([resultToRecord(updated)]); }
        catch (err) { setMessage(`⚠ 지정을 저장하지 못했습니다: ${err.message}`); return; }
        runCheck(updated);
    };

    // ── 찾아온 플레이스가 맞다고 확정 ────────────────────
    // 상호와 간판·브랜드명이 다른 곳이 흔하다('THE영어학원' ↔ '이화더영어').
    // 이름 유사도가 낮으면 교습비·번호를 다 읽어 놓고도 판정을 보류하는데,
    // 담당자가 맞다고 눌러 주면 지정으로 굳혀(다시 조사해도 유지) 판정까지 낸다.
    const confirmPlace = () => savePin(String(result?.플레이스ID || ''));

    const clearPin = async () => {
        if (!result) return;
        // 빈 값으로 보내면 Apps Script 가 '안 넘어온 것'으로 보고 기존 값을 지킨다 — 해제 표시를 남긴다
        const updated = { ...result, 플레이스지정: PIN_CLEARED };
        setResult(updated);
        setResults((prev) => ({ ...prev, [key]: updated }));
        setMessage('지정을 풀고 이름으로 다시 찾습니다…');
        try { await saveSnsChecks([resultToRecord(updated)]); }
        catch (err) { setMessage(`⚠ 해제를 저장하지 못했습니다: ${err.message}`); return; }
        runCheck(updated, { ignoreStoredPlace: true });
    };

    // ── 확인 마감 / 해제 ─────────────────────────────────
    // 목록 화면의 '확인' 열과 같은 값이다 (시트 '수동확인' 칸에 함께 들어간다).
    // 한쪽에서만 잠그면 잠금이 새어 나가므로 여기서도 똑같이 잠근다.
    const toggleDone = async () => {
        if (!result) return;
        const on = !isDone(result);
        const updated = setDone(result, on);
        setResult(updated);
        setResults((prev) => ({ ...prev, [key]: updated }));
        setMessage(on
            ? '✓ 확인 완료로 마감했습니다 — O/X 가 잠겨 잘못 눌러도 바뀌지 않습니다.'
            : '마감을 해제했습니다 — 다시 고칠 수 있습니다.');
        try { await saveSnsChecks([resultToRecord(updated)]); }
        catch (err) { setMessage(`⚠ 마감 상태를 저장하지 못했습니다: ${err.message}`); }
    };

    // 플레이스 홈에 링크가 걸린 채널만 조사 대상이다
    const channels = parseChannels(result);
    const buckets = assignBuckets(channels);
    const cells = new Map();
    rowCells(result).forEach((c) => cells.set(c.key, c));

    const verdict = result ? effectiveVerdict(result) : '';
    // 마감 표시는 칸 값이 아니다 — 직접 고친 칸이 있는지 셀 때 빼야 한다
    const hasManual = Object.keys(manualCells(result)).length > 0;
    const done = isDone(result);
    const lockedHint = done ? LOCKED_HINT : undefined;
    const pinned = pinnedPlaceId(result);
    // 지금 조사에 쓰는 플레이스 주소 — 표·구글시트('플레이스지정')와 같은 값이다
    const curUrl = result ? currentPlaceUrl(result) : '';
    // 플레이스를 물고 왔는지 / 물고 왔지만 같은 곳인지 확정되지 않았는지
    const placeFound = hasPlaceCandidate(result);
    const placeUnconfirmed = placeFound && result.matchStatus !== 'matched';

    const runBtn = (
        <button onClick={() => runCheck()} disabled={running} style={{
            padding: '8px 14px', borderRadius: '8px', border: 'none',
            background: running ? 'var(--border-color)' : 'var(--primary)', color: 'white',
            fontSize: '0.82rem', fontWeight: '700', cursor: running ? 'default' : 'pointer',
        }}>{running ? '조사 중…' : result ? '🔄 다시 조사' : '🔍 지금 조사'}</button>
    );

    const doneBtn = result && (
        <button onClick={toggleDone}
            title={done ? '눌러서 해제하면 다시 고칠 수 있습니다' : '다 확인했다면 눌러 마감하세요 (O/X 가 잠깁니다)'}
            style={{
                padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700',
                cursor: 'pointer', whiteSpace: 'nowrap',
                border: done ? 'none' : '1px solid var(--border-color)',
                background: done ? DONE_COLOR : 'transparent',
                color: done ? 'white' : 'var(--text-muted)',
            }}>{done ? '✓ 확인완료' : '마감'}</button>
    );

    if (loading) {
        return <div className="tab-content animate-enter"><div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중…</div></div>;
    }

    return (
        <div className="tab-content animate-enter">
            {/* 요약 */}
            <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)' }}>📣 네이버 게시 의무 점검</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            네이버플레이스와, 플레이스 홈에 링크된 블로그·홈페이지·인스타그램에
                            교습비와 {numberLabel}를 게시했는지 확인합니다.
                            {result && <><br />O/X 줄을 <b>누르면</b> 직접 확인한 값으로 바꿀 수 있습니다 (자동값 → O → X → 없음 → 자동값).</>}
                            {done && <><br /><b style={{ color: DONE_COLOR }}>✓ {fmtWhen(doneAt(result))} 에 확인 완료로 마감</b> — 고치려면 마감을 해제하세요.</>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {doneBtn}
                        {runBtn}
                    </div>
                </div>
                {message && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>{message}</div>}
            </div>

            {/* 공동 운영 — 플레이스·블로그를 함께 쓰는 학원 */}
            {siblings.length > 0 && (
                <div style={{ ...card, borderLeft: '4px solid #7c3aed' }}>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
                        <b style={{ color: '#7c3aed' }}>🔗 공동운영</b> — {siblings.map((sib, i) => (
                            <span key={sib.key}>
                                {i > 0 && ' · '}
                                {sib.academy && onSelectAcademy
                                    ? <span onClick={() => onSelectAcademy(sib.academy)}
                                        style={{ color: 'var(--primary)', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{sib.name}</span>
                                    : <b>{sib.name}</b>}
                            </span>
                        ))} 와(과) 플레이스·블로그를 함께 씁니다.
                        <br /><span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            같은 채널을 보고 판정하므로 교습비 값은 서로 같습니다. {numberLabel}는 학원마다 자기 번호가 게시돼 있어야 하므로 따로 봅니다.
                        </span>
                    </div>
                </div>
            )}

            {!result ? (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem', padding: '28px 16px' }}>
                    아직 조사한 적이 없습니다. 위 <b>지금 조사</b> 버튼을 누르면 5~10초 뒤 결과가 나옵니다.
                </div>
            ) : (
                <>
                    {/* 판정 */}
                    <div style={{ ...card, borderLeft: `4px solid ${VERDICT_COLOR[verdict] || 'var(--border-color)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: '800', color: VERDICT_COLOR[verdict] }}>{verdict}</span>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{fmtWhen(result.checkedAt)} 기준</span>
                        </div>
                        {result.미이행사유 && (
                            <div style={{ fontSize: '0.82rem', color: '#ef4444', marginTop: '8px', lineHeight: 1.6 }}>{result.미이행사유}</div>
                        )}
                        {hasManual && (
                            <div style={{ fontSize: '0.78rem', color: MANUAL_COLOR, marginTop: '8px', lineHeight: 1.6 }}>
                                담당자가 직접 확인한 값이 반영된 판정입니다
                                {verdict !== result.판정 && ` (자동 판정은 ${result.판정})`}.
                            </div>
                        )}
                        {verdict === '확인불가' && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.6 }}>
                                {placeUnconfirmed
                                    ? <>찾아온 플레이스가 이 학원이 맞는지 확정되지 않아 판정만 보류했습니다.
                                        아래 <b>맞습니다 — 이 플레이스로 확정</b>을 누르면 판정까지 나옵니다.</>
                                    : '자동 매칭이 확실하지 않아 판정을 보류했습니다. 아래 링크로 직접 확인해 주세요.'}
                            </div>
                        )}
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                            자동 판정이라 확정 위반이 아닙니다. 안내·점검 우선순위 참고용으로만 쓰세요.
                        </div>
                    </div>

                    {/* 네이버플레이스 */}
                    <div style={card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <div style={{ fontSize: '0.86rem', fontWeight: '800' }}>📍 네이버플레이스</div>
                            <a href={result.플레이스URL || placeSearchUrl(academy.name, region)} target="_blank" rel="noreferrer"
                                style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: '600', textDecoration: 'none' }}>열기 ↗</a>
                        </div>
                        {result.플레이스명 && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                검색된 업체: {result.플레이스명}
                                {placeUnconfirmed && <span style={{ color: '#f59e0b' }}> (동일 업체인지 확인 필요)</span>}
                                {pinned && <span style={{ color: MANUAL_COLOR, fontWeight: '700' }}> · 직접 지정함</span>}
                            </div>
                        )}
                        {/* 이름이 달라 확정을 못 했을 뿐, 아래 값은 이 플레이스를 실제로 읽은 결과다.
                            맞다고 눌러 확정해야 판정에 반영된다. */}
                        {placeUnconfirmed && (
                            <div style={{
                                background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.45)',
                                borderRadius: '10px', padding: '10px 12px', margin: '6px 0 2px',
                            }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                                    <b>이 업체가 {academy.name || '이 학원'} 이 맞습니까?</b> 상호가 많이 달라 자동으로 확정하지 못했습니다
                                    (간판·브랜드 이름이 등록 상호와 다른 곳이 많습니다).
                                    <br />아래 교습비·{numberLabel} 값은 <b>이 플레이스를 실제로 읽은 결과</b>이고, 맞다고 확정해야 <b>판정</b>에 반영됩니다.
                                </div>
                                <div style={{ marginTop: '8px' }}>
                                    <button onClick={confirmPlace} disabled={running} style={{
                                        padding: '6px 12px', borderRadius: '8px', border: 'none',
                                        background: running ? 'var(--border-color)' : '#10b981', color: 'white',
                                        fontSize: '0.8rem', fontWeight: '700', cursor: running ? 'default' : 'pointer',
                                    }}>맞습니다 — 이 플레이스로 확정</button>
                                </div>
                            </div>
                        )}
                        {!placeFound ? (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                                네이버플레이스에서 찾지 못했습니다. 아래 <b>직접 지정</b>에 플레이스 주소를 붙여넣으면 그 플레이스로 조사합니다.
                            </div>
                        ) : (
                            <>
                                <ObligationRow label="교습비 게시"
                                    cell={cells.get(cellKey('place', '교습비'))}
                                    onToggle={() => cycle(cells.get(cellKey('place', '교습비')))}
                                    disabled={running || done} lockedHint={lockedHint}
                                    detail={result.플레이스_게시형태 && result.플레이스_게시형태 !== '없음'
                                        ? `게시 형태: ${result.플레이스_게시형태}` : '가격 메뉴·가격표·소개글 어디에도 교습비가 없습니다'} />
                                <ObligationRow label={`${numberLabel} 게시`}
                                    cell={cells.get(cellKey('place', '번호'))}
                                    onToggle={() => cycle(cells.get(cellKey('place', '번호')))}
                                    disabled={running || done} lockedHint={lockedHint}
                                    detail={result.플레이스_번호대조 === '불일치'
                                        ? `소개글 기재: ${result.플레이스_기재번호} — 실제 ${numberLabel} ${regNo} 와 다릅니다`
                                        : result.플레이스_번호대조 === '일치'
                                            ? `소개글 기재: ${result.플레이스_기재번호}`
                                            : '소개글에 번호가 없습니다'}
                                    detailColor={result.플레이스_번호대조 === '불일치' ? '#ef4444' : undefined} />
                            </>
                        )}

                        {/* 지금 무엇으로 조사하고 있는지 + 다른 학원(지점)의 플레이스를 잡았을 때 바로잡는 자리.
                            여기 보이는 주소가 곧 표의 '플레이스 지정' 이고 구글시트 '플레이스지정' 열의 값이다. */}
                        <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '4px', paddingTop: '8px' }}>
                            {curUrl && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px', wordBreak: 'break-all' }}>
                                    현재 조사에 쓰는 플레이스{' '}
                                    <a href={curUrl} target="_blank" rel="noreferrer"
                                        style={{ color: '#3b82f6', fontWeight: '600', textDecoration: 'none' }}>
                                        {curUrl.replace(/^https?:\/\//, '').replace(/\/home$/, '')}
                                    </a>
                                    <span style={{ color: pinnedPlaceUrl(result) ? MANUAL_COLOR : 'var(--text-muted)', fontWeight: pinnedPlaceUrl(result) ? '700' : '400' }}>
                                        {' '}({placeSource(result)})
                                    </span>
                                </div>
                            )}
                            {pinOpen ? (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <input value={pinInput} onChange={(e) => setPinInput(e.target.value)}
                                        placeholder="네이버플레이스 주소 붙여넣기 (또는 번호)"
                                        style={{
                                            flex: '1 1 220px', minWidth: 0, padding: '6px 9px', fontSize: '0.8rem',
                                            border: '1px solid var(--border-color)', borderRadius: '8px',
                                            background: 'var(--bg-card)', color: 'var(--text-main)',
                                        }} />
                                    <button onClick={() => savePin(pinInput)} disabled={running} style={{
                                        padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'var(--primary)',
                                        color: 'white', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer',
                                    }}>지정하고 다시 조사</button>
                                    <button onClick={() => { setPinOpen(false); setPinInput(''); }} style={{
                                        padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-color)',
                                        background: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer',
                                    }}>취소</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <button onClick={() => { setPinOpen(true); setPinInput(curUrl); }} style={{
                                        background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px',
                                        padding: '5px 10px', color: '#3b82f6', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer',
                                    }}>이 플레이스가 아닐 경우 — 직접 지정</button>
                                    {pinned && (
                                        <button onClick={clearPin} disabled={running} style={{
                                            background: 'none', border: 'none', color: 'var(--text-muted)',
                                            fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline',
                                        }}>지정 해제</button>
                                    )}
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        1호점·2호점처럼 이름이 비슷한 곳은 잘못 잡힐 수 있습니다. 지정하면 다시 조사해도 그 플레이스만 봅니다.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 플레이스 홈에 걸린 링크 — 블로그·홈페이지·인스타그램 각각 */}
                    {channels.length === 0 ? (
                        <div style={card}>
                            <div style={{ fontSize: '0.86rem', fontWeight: '800', marginBottom: '6px' }}>🔗 연결된 채널</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                네이버플레이스 홈에 걸린 블로그·홈페이지·인스타그램 링크가 없습니다.
                                링크가 없는 채널은 <b>따로 검색하지 않습니다</b> — 이름이 비슷한 다른 학원의 블로그를 잘못 집는 일을 막기 위해서입니다.
                            </div>
                        </div>
                    ) : channels.map((c, i) => {
                        const bucket = buckets[i];
                        const feeCell = cells.get(cellKey(bucket, '교습비'));
                        const noCell = cells.get(cellKey(bucket, '번호'));
                        return (
                            <div key={`${c.url}-${i}`} style={card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ fontSize: '0.86rem', fontWeight: '800' }}>
                                        {CHANNEL_ICON[c.종류] || '🔗'} {c.유형}
                                    </div>
                                    <a href={c.url} target="_blank" rel="noreferrer"
                                        style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: '600', textDecoration: 'none' }}>열기 ↗</a>
                                </div>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px', wordBreak: 'break-all' }}>
                                    {shortUrl(c.url)}
                                    {c.조사범위 && <span> · 조사 범위: {c.조사범위}</span>}
                                </div>
                                {c.번호대조 === '확인불가' ? (
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', paddingTop: '8px', borderTop: '1px solid var(--border-color)', lineHeight: 1.6 }}>
                                        {c.비고 || '내용을 읽지 못해 판정을 보류했습니다.'} 위 <b>열기</b>로 직접 확인해 주세요.
                                    </div>
                                ) : (
                                    <>
                                        <ObligationRow label="교습비 게시" cell={feeCell}
                                            onToggle={() => cycle(feeCell)} disabled={running || done} lockedHint={lockedHint}
                                            detail={c.교습비 === 'O'
                                                ? `${c.조사범위}에서 교습비 안내를 확인했습니다`
                                                : `${c.조사범위}에서 교습비를 찾지 못했습니다${c.종류 === 'instagram' ? '' : ' (이미지로만 올렸을 수 있음)'}`} />
                                        <ObligationRow label={`${numberLabel} 게시`} cell={noCell}
                                            onToggle={() => cycle(noCell)} disabled={running || done} lockedHint={lockedHint}
                                            detail={c.번호대조 === '불일치'
                                                ? `기재: ${c.기재번호} — 실제 ${numberLabel} ${regNo} 와 다릅니다`
                                                : c.번호대조 === '일치'
                                                    ? `기재: ${c.기재번호}`
                                                    : `${c.조사범위}에서 번호를 찾지 못했습니다`}
                                            detailColor={c.번호대조 === '불일치' ? '#ef4444' : undefined} />
                                        {c.소개글 && (
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '6px', whiteSpace: 'pre-wrap', background: 'var(--bg-main)', borderRadius: '8px', padding: '8px 10px' }}>
                                                {c.소개글}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}
