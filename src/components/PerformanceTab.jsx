// 성과 — 안내가 실제로 무엇을 바꿨는지 한 화면에서 본다.
//
// 지도점검 시트는 학원 한 곳에 한 줄이라 다시 조사하면 그 칸을 덮어쓴다. 그래서 여기 보이는
// 게시율은 SNS 탭에서 '📌 회차 저장' 을 눌러 쌓아 둔 것만 보여준다 — 저장해 두지 않은 날의
// 이행률은 어디에도 없고, 없는 것을 지어내지 않는다.
//
// 숫자마다 분모를 함께 적는다. 이 화면은 승진 실적 자료로 쓰이는데, 심사 자리에서
// "이 숫자 어떻게 냈나" 를 물으면 자료가 스스로 답해야 한다.
//
// 그래프 라이브러리를 쓰지 않았다. 회차는 두엇에서 서넛이라 막대 몇 개면 되고,
// 그 정도에 차트 묶음(chart.js)을 이 탭에 끌어오면 화면만 무거워진다.
import { useEffect, useMemo, useState } from 'react';
import { fetchSnapshots } from '../utils/snsCheck';
import { ratesByRound, compareRounds } from '../utils/roundStats';

const card = {
    background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color)',
    borderRadius: '12px', padding: '16px', marginBottom: '14px',
};
const h2 = { fontSize: '1rem', fontWeight: 700, margin: '0 0 4px' };
const sub = { fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 12px' };
const num = { fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2 };

const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

/** 가로 막대 하나 — 값이 없으면 자리만 남긴다 */
function Bar({ label, count, total, color = '#4f46e5' }) {
    const w = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '120px', fontSize: '0.85rem', textAlign: 'right', flexShrink: 0 }}>{label}</div>
            <div style={{ flex: 1, background: 'var(--border-color)', borderRadius: '4px', height: '18px', overflow: 'hidden' }}>
                <div style={{ width: `${w}%`, height: '100%', background: color }} />
            </div>
            <div style={{ width: '84px', fontSize: '0.85rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                {count}곳 · {w}%
            </div>
        </div>
    );
}

/** 파일 하나 내려받기 */
function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function PerformanceTab() {
    const [data, setData] = useState({ loading: true, snapshots: [] });
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    useEffect(() => {
        fetchSnapshots()
            .then((snapshots) => setData({ loading: false, snapshots }))
            .catch((err) => setData({ loading: false, snapshots: [], error: err.message }));
    }, []);

    const rounds = useMemo(() => ratesByRound(data.snapshots), [data.snapshots]);

    // 처음 열면 맨 앞 회차와 맨 끝 회차를 견준다 — 보통 그것이 알고 싶은 것이다
    useEffect(() => {
        if (rounds.length < 2) return;
        setFrom((f) => f || rounds[0].round);
        setTo((t) => t || rounds[rounds.length - 1].round);
    }, [rounds]);

    const diff = useMemo(
        () => (from && to && from !== to ? compareRounds(data.snapshots, from, to) : null),
        [data.snapshots, from, to],
    );

    const exportExcel = async () => {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['회차', '저장일시', '전체', '이행', '미이행', '확인불가', '해당없음', '미조사',
                '게시율(이행/이행+미이행)', '게시율(이행/전체)'],
            ...rounds.map((r) => [r.round, r.savedAt, r.전체, r.이행, r.미이행, r.확인불가, r.해당없음, r.미조사,
                r.rate, r.rateAll]),
        ]), '회차별게시율');

        if (diff) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                ['구분', '등록번호', '학원명', `${from} 판정`, `${to} 판정`, `${from} 미이행매체`],
                ...diff.improved.map((r) => [r.구분, r.등록번호, r.학원명, r.이전판정, r.판정, r.이전미이행매체 || '']),
            ]), '개선한곳');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                ['구분', '등록번호', '학원명', `${from} 판정`, `${to} 판정`, '지금 미이행매체'],
                ...diff.stillBad.map((r) => [r.구분, r.등록번호, r.학원명, r.이전판정, r.판정, r.미이행매체 || '']),
            ]), '아직 미이행');
        }

        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const stamp = new Date().toISOString().slice(0, 10);
        download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `온라인게시_성과_${stamp}.xlsx`);
    };

    if (data.loading) {
        return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>성과 자료를 불러오는 중…</div>;
    }

    if (data.error) {
        return (
            <div style={{ textAlign: 'center', padding: '40px', color: '#dc2626' }}>
                성과 자료를 읽지 못했습니다 — {data.error}
                <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    잠시 뒤 이 탭을 다시 열어 주세요.
                </div>
            </div>
        );
    }

    const last = rounds[rounds.length - 1];

    return (
        <div style={{ maxWidth: '900px' }}>
            {/* ── 게시율 ────────────────────────────────── */}
            <div style={card}>
                <h3 style={h2}>온라인 게시율</h3>
                <p style={sub}>
                    SNS 탭에서 <b>📌 회차 저장</b>을 누른 날의 판정입니다. 저장해 두지 않은 날은 남아 있지 않습니다
                    (조사할 때마다 칸을 덮어쓰기 때문입니다).
                </p>

                {!rounds.length ? (
                    <div style={{ color: 'var(--text-muted)' }}>
                        아직 저장된 회차가 없습니다. SNS 탭에서 <b>📌 회차 저장</b>을 한 번 눌러 두시면
                        그때부터 견줄 수 있습니다. <b>재조사를 시작하기 전에</b> 눌러 두셔야 앞 자리가 남습니다.
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>회차</th>
                                        <th style={{ textAlign: 'right', padding: '6px' }}>이행</th>
                                        <th style={{ textAlign: 'right', padding: '6px' }}>미이행</th>
                                        <th style={{ textAlign: 'right', padding: '6px' }}>게시율</th>
                                        <th style={{ textAlign: 'right', padding: '6px', color: 'var(--text-muted)' }}>확인불가</th>
                                        <th style={{ textAlign: 'right', padding: '6px', color: 'var(--text-muted)' }}>해당없음</th>
                                        <th style={{ textAlign: 'right', padding: '6px', color: 'var(--text-muted)' }}>전체 대비</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rounds.map((r) => (
                                        <tr key={r.round} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '6px', fontWeight: 600 }}>{r.round}</td>
                                            <td style={{ padding: '6px', textAlign: 'right' }}>{r.이행}</td>
                                            <td style={{ padding: '6px', textAlign: 'right' }}>{r.미이행}</td>
                                            <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>{fmtPct(r.rate)}</td>
                                            <td style={{ padding: '6px', textAlign: 'right', color: 'var(--text-muted)' }}>{r.확인불가}</td>
                                            <td style={{ padding: '6px', textAlign: 'right', color: 'var(--text-muted)' }}>{r.해당없음}</td>
                                            <td style={{ padding: '6px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmtPct(r.rateAll)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginTop: '12px' }}>
                            {rounds.map((r) => (
                                <Bar key={r.round} label={r.round} count={r.이행} total={r.대상} color="#059669" />
                            ))}
                        </div>

                        <p style={{ ...sub, marginTop: '10px', marginBottom: 0 }}>
                            <b>게시율</b>은 <b>이행 ÷ (이행 + 미이행)</b> 입니다 — 올릴 자리가 아예 없는 곳(해당없음)과
                            못 본 곳(확인불가)은 분모에서 뺐습니다. 그 둘까지 넣은 값은 오른쪽 끝 <b>전체 대비</b> 열입니다.
                        </p>
                    </>
                )}
            </div>

            {/* ── 개선 ──────────────────────────────────── */}
            {rounds.length >= 2 && (
                <div style={card}>
                    <h3 style={h2}>안내를 받고 고친 곳</h3>
                    <p style={sub}>앞 회차에 미이행이던 곳 가운데 뒤 회차에 이행이 된 곳입니다.</p>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <select value={from} onChange={(e) => setFrom(e.target.value)}
                            style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            {rounds.map((r) => <option key={r.round} value={r.round}>{r.round}</option>)}
                        </select>
                        <span>→</span>
                        <select value={to} onChange={(e) => setTo(e.target.value)}
                            style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            {rounds.map((r) => <option key={r.round} value={r.round}>{r.round}</option>)}
                        </select>
                    </div>

                    {!diff ? (
                        <div style={{ color: 'var(--text-muted)' }}>서로 다른 두 회차를 골라 주세요.</div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                <div>
                                    <div style={{ ...num, color: '#059669' }}>{diff.improved.length}곳</div>
                                    <div style={sub}>고쳤습니다</div>
                                </div>
                                <div>
                                    <div style={num}>{fmtPct(diff.improvedRate)}</div>
                                    <div style={sub}>앞 회차 미이행 중</div>
                                </div>
                                <div>
                                    <div style={{ ...num, color: '#dc2626' }}>{diff.stillBad.length}곳</div>
                                    <div style={sub}>아직 미이행</div>
                                </div>
                                {diff.worsened.length > 0 && (
                                    <div>
                                        <div style={{ ...num, color: '#d97706' }}>{diff.worsened.length}곳</div>
                                        <div style={sub}>이행 → 미이행</div>
                                    </div>
                                )}
                            </div>
                            <p style={{ ...sub, marginBottom: 0 }}>
                                두 회차에 모두 있는 {diff.matched}곳을 견주었습니다. 명단은 엑셀로 내려받으시면 있습니다.
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* ── 내보내기 ──────────────────────────────── */}
            <div style={{ ...card, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={exportExcel} style={{
                    padding: '9px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: '#0d9488', color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                }}>
                    📊 성과 엑셀 내려받기
                </button>
                <span style={{ ...sub, margin: 0 }}>
                    회차별 게시율과, 두 회차를 골랐다면 개선한 곳·아직 미이행인 곳 명단이 들어갑니다.
                </span>
            </div>

            {last && (
                <p style={{ ...sub, textAlign: 'right' }}>
                    가장 최근 회차: {last.round} ({String(last.savedAt).slice(0, 10)}) · 전체 {last.전체}곳
                </p>
            )}
        </div>
    );
}
