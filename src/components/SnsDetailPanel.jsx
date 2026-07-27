import { useState, useEffect, useCallback } from 'react';
import {
    fetchSnsCheckFor, probeAll, saveSnsChecks, resultToRecord,
    placeSearchUrl, blogSearchUrl, VERDICT_COLOR,
} from '../utils/snsCheck';

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
                            교습비와 {numberLabel}를 네이버플레이스·블로그에 게시했는지 확인합니다.
                        </div>
                    </div>
                    {runBtn}
                </div>
                {message && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>{message}</div>}
            </div>

            {!result ? (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem', padding: '28px 16px' }}>
                    아직 조사한 적이 없습니다. 위 <b>지금 조사</b> 버튼을 누르면 약 2초 안에 결과가 나옵니다.
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

                    {/* 네이버블로그 */}
                    <div style={card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <div style={{ fontSize: '0.86rem', fontWeight: '800' }}>✍️ 네이버블로그</div>
                            <a href={result.블로그URL || blogSearchUrl(academy.name, region)} target="_blank" rel="noreferrer"
                                style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: '600', textDecoration: 'none' }}>
                                {result.블로그URL ? '열기 ↗' : '검색 ↗'}
                            </a>
                        </div>
                        {result.블로그 !== '있음' ? (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', paddingTop: '8px', borderTop: '1px solid var(--border-color)', lineHeight: 1.6 }}>
                                플레이스에 연결된 블로그가 없습니다. 블로그를 운영하지 않는 것일 수도, 플레이스에 링크만 안 걸어둔 것일 수도 있으니
                                위 <b>검색</b>으로 확인해 보세요.
                            </div>
                        ) : (
                            <>
                                <ObligationRow label="교습비 게시"
                                    value={result.블로그_교습비}
                                    detail={result.블로그_교습비 === 'O'
                                        ? '블로그 본문에서 교습비 안내를 확인했습니다'
                                        : '최근 글·사이드바에서 교습비를 찾지 못했습니다 (이미지로만 올렸을 수 있음)'} />
                                <ObligationRow label={`${numberLabel} 게시`}
                                    value={result.블로그_번호}
                                    detail={result.블로그_번호대조 === '불일치'
                                        ? `블로그 기재: ${result.블로그_기재번호} — 실제 ${numberLabel} ${regNo} 와 다릅니다`
                                        : result.블로그_번호대조 === '일치'
                                            ? `블로그 기재: ${result.블로그_기재번호}`
                                            : '블로그 본문·사이드바에서 번호를 찾지 못했습니다'}
                                    detailColor={result.블로그_번호대조 === '불일치' ? '#ef4444' : undefined} />
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
