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
import { fetchSnapshots, fetchSurveys, fetchSnsChecksOrThrow } from '../utils/snsCheck';
import { ratesByRound, compareRounds, surveyStats, HELP_ORDER, FORM_USE_ORDER } from '../utils/surveyStats';

const filled = (v) => {
    const s = String(v || '').trim();
    return !!s && s !== '-';
};

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
    const [data, setData] = useState({ loading: true, snapshots: [], surveys: [], checks: [], counted: 'wait' });
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    // 차례로 부른다. 앱스 스크립트는 한 계정의 실행을 줄 세워 돌리므로 세 요청을 한꺼번에
    // 보내면 하나가 물려 빈 값으로 돌아온다 — 실제로 응답률의 분모가 0곳으로 떴다.
    //
    // 다만 셋을 다 기다린 뒤에 그리면 30초 남짓 흰 화면이다. 그래서 두 번에 나눠 그린다 —
    // 게시율과 만족도를 먼저 내놓고, 응답률의 분모(발송·회신 곳수)만 뒤따라 채운다.
    // 그 분모는 점검 시트 1,070줄을 통째로 읽어야 나오는데, 그것 때문에 나머지가 기다릴 이유가 없다.
    useEffect(() => {
        (async () => {
            try {
                const snapshots = await fetchSnapshots();
                const surveys = await fetchSurveys();
                setData((d) => ({ ...d, loading: false, snapshots, surveys }));
            } catch (err) {
                setData((d) => ({ ...d, loading: false, error: err.message }));
                return;
            }

            try {
                const checks = await fetchSnsChecksOrThrow();
                setData((d) => ({ ...d, checks, counted: 'ok' }));
            } catch {
                // 못 읽은 것을 0곳으로 적으면 안 된다 — 없는 것과 못 본 것은 다르다
                setData((d) => ({ ...d, counted: 'fail' }));
            }
        })();
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

    const counts = useMemo(() => ({
        sent: data.checks.filter((r) => filled(r.발송일시)).length,
        replied: data.checks.filter((r) => filled(r.회신일시)).length,
    }), [data.checks]);

    const stats = useMemo(
        () => surveyStats(data.surveys, { sentCount: counts.sent, repliedCount: counts.replied }),
        [data.surveys, counts],
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

        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['문항', '보기', '응답 수'],
            ...stats.help.map((x) => ['이번 안내가 도움이 되었습니까?', x.label, x.count]),
            ...stats.formUse.map((x) => ['교습비 게시표를 어떻게 쓰셨습니까?', x.label, x.count]),
            [],
            ['응답 곳수', stats.total],
            ['평균(5점)', stats.avgHelp],
            ['도움 이상 비율(%)', stats.helpfulRate],
            ['게시표 활용률(%)', stats.formUsedRate],
            ['문자 보낸 곳', stats.sentCount],
            ['회신한 곳', stats.repliedCount],
            ['응답률 — 보낸 곳 대비(%)', stats.rateOfSent],
            ['응답률 — 회신한 곳 대비(%)', stats.rateOfReplied],
        ]), '만족도');

        // 의견은 학원 이름 없이 — 화면과 같은 규칙이다
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['응답일시', '의견'],
            ...stats.notes.map((n) => [n.at, n.text]),
        ]), '의견');

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

            {/* ── 만족도 ────────────────────────────────── */}
            <div style={card}>
                <h3 style={h2}>만족도</h3>
                <p style={sub}>
                    학원이 회신을 보낸 뒤 완료 화면에서 답한 것입니다. <b>어느 학원이 무엇을 골랐는지는 보이지 않습니다</b> —
                    그렇게 하겠다고 학원에 적어 두었고, 그래야 답이 솔직해집니다.
                </p>

                {!stats.total ? (
                    <div style={{ color: 'var(--text-muted)' }}>아직 응답이 없습니다.</div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '14px' }}>
                            <div>
                                <div style={num}>{stats.total}곳</div>
                                <div style={sub}>응답</div>
                            </div>
                            <div>
                                <div style={num}>{stats.avgHelp ?? '—'}</div>
                                <div style={sub}>평균 (5점 만점)</div>
                            </div>
                            <div>
                                <div style={num}>{fmtPct(stats.helpfulRate)}</div>
                                <div style={sub}>‘도움’ 이상</div>
                            </div>
                            <div>
                                <div style={num}>{fmtPct(stats.formUsedRate)}</div>
                                <div style={sub}>게시표 활용</div>
                            </div>
                        </div>

                        <div style={{ fontWeight: 600, marginBottom: '6px' }}>이번 안내가 도움이 되었습니까?</div>
                        {stats.help.map((x) => (
                            <Bar key={x.label} label={x.label} count={x.count} total={stats.total} />
                        ))}

                        <div style={{ fontWeight: 600, margin: '14px 0 6px' }}>교습비 게시표를 어떻게 쓰셨습니까?</div>
                        {stats.formUse.map((x) => (
                            <Bar key={x.label} label={x.label} count={x.count} total={stats.formAnswered} color="#0d9488" />
                        ))}

                        <p style={{ ...sub, marginTop: '14px', marginBottom: '6px' }}>
                            {data.counted === 'wait' ? (
                                <><b>응답률</b> — 문자 보낸 곳과 회신한 곳을 세는 중입니다…</>
                            ) : data.counted === 'fail' ? (
                                <><b>응답률</b> — 점검 시트를 읽지 못해 셈하지 못했습니다.
                                    잠시 뒤 이 탭을 다시 열어 주세요.</>
                            ) : (
                                <>
                                    <b>응답률</b> — 문자 보낸 {stats.sentCount}곳 대비 <b>{fmtPct(stats.rateOfSent)}</b>,
                                    회신한 {stats.repliedCount}곳 대비 <b>{fmtPct(stats.rateOfReplied)}</b>.
                                    만족도에 답한 곳은 회신까지 한 곳이라 <b>스스로 고른 분들</b>입니다 — 두 분모를 함께 적는 이유입니다.
                                </>
                            )}
                        </p>

                        {stats.notes.length > 0 && (
                            <>
                                <div style={{ fontWeight: 600, margin: '14px 0 6px' }}>
                                    하고 싶은 말씀 ({stats.notes.length}건)
                                </div>
                                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                    {stats.notes.map((n, i) => (
                                        <div key={`${n.at}-${i}`} style={{
                                            padding: '8px 10px', marginBottom: '6px', borderRadius: '8px',
                                            background: 'var(--bg-subtle, #f8fafc)', fontSize: '0.9rem',
                                        }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {String(n.at).slice(0, 10)}
                                            </div>
                                            {n.text}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* ── 내보내기 ──────────────────────────────── */}
            <div style={{ ...card, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={exportExcel} disabled={data.counted !== 'ok'} style={{
                    padding: '9px 14px', borderRadius: '8px', border: 'none',
                    cursor: data.counted === 'ok' ? 'pointer' : 'default',
                    background: data.counted === 'ok' ? '#0d9488' : 'var(--border-color)',
                    color: data.counted === 'ok' ? '#fff' : 'var(--text-muted)',
                    fontWeight: 700, fontSize: '0.85rem',
                }}>
                    📊 성과 엑셀 내려받기
                </button>
                <span style={{ ...sub, margin: 0 }}>
                    {data.counted === 'ok'
                        ? '회차별 게시율 · 개선한 곳 명단 · 만족도 집계 · 의견이 시트 넷으로 들어갑니다.'
                        : '응답률까지 다 센 뒤에 눌러 주세요 — 지금 내려받으면 분모가 0곳으로 박힙니다.'}
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
