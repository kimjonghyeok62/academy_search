import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    fetchSnsCheckFor, probeAll, saveSnsChecks, resultToRecord, parseChannels,
    placeSearchUrl, VERDICT_COLOR,
} from '../utils/snsCheck';

const CHANNEL_ICON = { blog: '✍️', instagram: '📷', homepage: '🌐' };

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

// 게시 의무 항목 한 줄 (교습비 / 등록번호)
function ObligationRow({ label, value, detail, detailColor }) {
    const ok = value === 'O';
    const unknown = value !== 'O' && value !== 'X';
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
            <span style={{
                flexShrink: 0, width: '22px', textAlign: 'center', fontWeight: '800', fontSize: '0.95rem',
                color: unknown ? 'var(--text-muted)' : ok ? '#10b981' : '#ef4444',
            }}>{unknown ? '–' : ok ? '✓' : '✕'}</span>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: '600', color: 'var(--text-main)' }}>{label}</div>
                {detail && <div style={{ fontSize: '0.76rem', color: detailColor || 'var(--text-muted)', marginTop: '2px' }}>{detail}</div>}
            </div>
        </div>
    );
}

export default function SnsDetailPanel({ academy, region = '하남' }) {
    const category = (academy.category || '').includes('교습소') ? '교습소' : '학원';
    const numberLabel = category === '교습소' ? '신고번호' : '등록번호';
    const regNo = academy.id || '';

    const key = `${category}|${regNo}`;
    const [result, setResult] = useState(null);
    const [loadedKey, setLoadedKey] = useState(null);
    const [running, setRunning] = useState(false);
    const [message, setMessage] = useState('');

    // 다른 학원으로 바뀌면 loadedKey 가 어긋나 자동으로 로딩 상태가 된다
    const loading = loadedKey !== key;

    useEffect(() => {
        let alive = true;
        fetchSnsCheckFor(category, regNo)
            .then(r => {
                if (!alive) return;
                setResult(r);
                setLoadedKey(key);
            })
            // 조회 실패도 로딩을 풀어야 한다 (결과 없음으로 표시하고 '지금 조사' 를 쓸 수 있게)
            .catch(() => { if (alive) setLoadedKey(key); });
        return () => { alive = false; };
    }, [category, regNo, key]);

    const runCheck = useCallback(async () => {
        setRunning(true);
        setMessage('');
        const target = {
            id: regNo, name: academy.name || '', category, regNo,
            address: academy.address || '',
            // 이미 찾아둔 플레이스면 검색 단계를 건너뛴다 (차단에 가장 취약한 구간)
            placeId: result?.플레이스ID || '',
        };
        const { results: [r], blocked, blockedReason } = await probeAll([target], region, {});
        setRunning(false);
        if (blocked || !r) {
            setMessage(`⛔ 네이버가 요청을 일시 차단했습니다${blockedReason ? ` (${blockedReason})` : ''}. 잠시 후 다시 시도하세요.`);
            return;
        }
        setResult(r);
        try { await saveSnsChecks([resultToRecord(r)]); setMessage('✓ 조사 결과를 저장했습니다.'); }
        catch (err) { setMessage(`⚠ 저장 실패: ${err.message} (아래 결과는 이번 조사 값입니다)`); }
    }, [academy.name, academy.address, category, regNo, region, result]);

    // 플레이스 홈에 링크가 걸린 채널만 조사 대상이다
    const channels = useMemo(() => parseChannels(result), [result]);

    const runBtn = (
        <button onClick={runCheck} disabled={running} style={{
            padding: '8px 14px', borderRadius: '8px', border: 'none',
            background: running ? 'var(--border-color)' : 'var(--primary)', color: 'white',
            fontSize: '0.82rem', fontWeight: '700', cursor: running ? 'default' : 'pointer',
        }}>{running ? '조사 중…' : result ? '🔄 다시 조사' : '🔍 지금 조사'}</button>
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
                        </div>
                    </div>
                    {runBtn}
                </div>
                {message && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>{message}</div>}
            </div>

            {!result ? (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem', padding: '28px 16px' }}>
                    아직 조사한 적이 없습니다. 위 <b>지금 조사</b> 버튼을 누르면 5~10초 뒤 결과가 나옵니다.
                </div>
            ) : (
                <>
                    {/* 판정 */}
                    <div style={{ ...card, borderLeft: `4px solid ${VERDICT_COLOR[result.판정] || 'var(--border-color)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: '800', color: VERDICT_COLOR[result.판정] }}>{result.판정}</span>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{fmtWhen(result.checkedAt)} 기준</span>
                        </div>
                        {result.미이행사유 && (
                            <div style={{ fontSize: '0.82rem', color: '#ef4444', marginTop: '8px', lineHeight: 1.6 }}>{result.미이행사유}</div>
                        )}
                        {result.판정 === '확인불가' && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.6 }}>
                                자동 매칭이 확실하지 않아 판정을 보류했습니다. 아래 링크로 직접 확인해 주세요.
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
                                {result.matchStatus === 'ambiguous' && <span style={{ color: '#f59e0b' }}> (동일 업체인지 확인 필요)</span>}
                            </div>
                        )}
                        {result.matchStatus === 'no_match' ? (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                                네이버플레이스에서 찾지 못했습니다.
                            </div>
                        ) : (
                            <>
                                <ObligationRow label="교습비 게시"
                                    value={result.플레이스_교습비}
                                    detail={result.플레이스_게시형태 && result.플레이스_게시형태 !== '없음'
                                        ? `게시 형태: ${result.플레이스_게시형태}` : '가격 메뉴·가격표·소개글 어디에도 교습비가 없습니다'} />
                                <ObligationRow label={`${numberLabel} 게시`}
                                    value={result.플레이스_번호}
                                    detail={result.플레이스_번호대조 === '불일치'
                                        ? `소개글 기재: ${result.플레이스_기재번호} — 실제 ${numberLabel} ${regNo} 와 다릅니다`
                                        : result.플레이스_번호대조 === '일치'
                                            ? `소개글 기재: ${result.플레이스_기재번호}`
                                            : '소개글에 번호가 없습니다'}
                                    detailColor={result.플레이스_번호대조 === '불일치' ? '#ef4444' : undefined} />
                            </>
                        )}
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
                    ) : channels.map((c, i) => (
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
                                    <ObligationRow label="교습비 게시" value={c.교습비}
                                        detail={c.교습비 === 'O'
                                            ? `${c.조사범위}에서 교습비 안내를 확인했습니다`
                                            : `${c.조사범위}에서 교습비를 찾지 못했습니다${c.종류 === 'instagram' ? '' : ' (이미지로만 올렸을 수 있음)'}`} />
                                    <ObligationRow label={`${numberLabel} 게시`} value={c.번호}
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
                    ))}
                </>
            )}
        </div>
    );
}
