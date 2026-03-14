import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import {
    fetchStatRawRows, fetchRecentRawRows, APPS_SCRIPT_URL,
    fetchHanamAcademyRawRows, fetchHanamHagwonRawRows,
    fetchNiceAcademyRawRows, fetchNiceHagwonRawRows, fetchNicePrivateRawRows,
} from '../utils/inspectionSheets';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title);

// ── 색상 팔레트 ──
const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#84cc16'];
const VIOL_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'];
const CURRENT_YEAR = '2026';

// ── 유틸 ──
function colVal(row, keys) {
    if (!row) return '';
    for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.replace(/\s/g, '').includes(k.replace(/\s/g, '')));
        if (found && row[found] && row[found].trim() !== '') return row[found].trim();
    }
    return '';
}
function getYear(dateStr) {
    if (!dateStr) return null;
    const m = dateStr.match(/(\d{4})/);
    return m ? m[1] : null;
}
function parseRows(rawRows) {
    if (!rawRows || rawRows.length < 2) return { headers: [], bodyRows: [] };
    let hIdx = 0, maxF = 0;
    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const f = rawRows[i].filter(c => c && c.trim()).length;
        if (f > maxF) { maxF = f; hIdx = i; }
    }
    const headers = rawRows[hIdx].map(h => h.trim());
    const bodyRows = rawRows.slice(hIdx + 1)
        .filter(row => row.some(c => c && c.trim()))
        .map(row => { const obj = {}; headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); }); return obj; });
    return { headers, bodyRows };
}
function filterByRegion(rows, region) {
    if (!region) return rows;
    return rows.filter(r => {
        const addr = colVal(r, ['주소', '소재지', '학원주소', '지역']);
        const reg = colVal(r, ['지역구분', '시군', '시군구', '지역']);
        return addr.includes(region) || reg.includes(region) || reg === '';
    });
}
function parseAcademyRawRows(rawRows) {
    if (!rawRows || rawRows.length < 2) return { headers: [], dataRows: [] };
    let hIdx = 0, maxF = 0;
    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const f = rawRows[i].filter(c => c && c.trim()).length;
        if (f > maxF) { maxF = f; hIdx = i; }
    }
    const headers = rawRows[hIdx].map(h => h.trim());
    const dataRows = rawRows.slice(hIdx + 1).filter(r => r.some(c => c && c.trim()));
    return { headers, dataRows };
}

// ── 차트 컴포넌트 ──
function DoughnutChart({ title, labels, data, colors }) {
    const bg = colors || COLORS;
    return (
        <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>{title}</div>
            <Doughnut
                data={{ labels, datasets: [{ data, backgroundColor: labels.map((_, i) => bg[i % bg.length] + 'cc'), borderColor: labels.map((_, i) => bg[i % bg.length]), borderWidth: 1 }] }}
                options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, color: '#94a3b8', padding: 6 } } } }}
            />
        </div>
    );
}

// ── StatCard ──
function StatCard({ icon, label, value, color }) {
    return (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '14px 16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>{icon}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: color || 'var(--text-main)' }}>{value}</div>
        </div>
    );
}

// ── 주소에서 "동" 단위만 추출 ──
function extractDong(addr) {
    if (!addr) return '';
    // 한글만으로 구성된 동/리/읍/면 추출 (괄호·공백 제외)
    const m = addr.match(/[가-힣]+[동리읍면]/);
    return m ? `(${m[0]})` : '';
}

// ── 연번 생성 키 (같은날+같은학원명 → 동일 그룹) ──
function deduplicateRecent(rows) {
    const seen = new Set();
    const result = [];
    for (const row of rows) {
        const name = colVal(row, ['학원(교습소)명', '학원명', '명칭', '기관명']);
        const date = colVal(row, ['점검일', '점검일자', '지도점검일']);
        const key = `${date}__${name}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(row);
        }
    }
    return result;
}

// ── 상세 모달 ──
function DetailModal({ row, index, onClose }) {
    if (!row) return null;
    const name = colVal(row, ['학원(교습소)명', '학원명', '명칭', '기관명']);
    const date = colVal(row, ['점검일', '점검일자', '지도점검일']);
    const type = colVal(row, ['구분', '유형', '대상']);
    const addr = colVal(row, ['주소', '소재지']);
    const checker = colVal(row, ['점검자', '담당자']);
    const viol = colVal(row, ['현지조치', '위반사항', '위반내용', '처분내용']);
    const hasViol = viol && viol !== '-' && viol !== '';

    // 추가 상세 필드
    const regNo = colVal(row, ['등록번호', '인가번호', '학원번호']);
    const owner = colVal(row, ['운영자', '원장', '대표자', '설립자']);
    const phone = colVal(row, ['연락처', '전화번호', '전화', '연락']);
    const recentHistory = colVal(row, ['최근점검', '최근이력', '이전점검', '점검이력']);
    const adminAction = colVal(row, ['행정처분', '처분종류', '처분내용', '행정처분종류']);
    const fine = colVal(row, ['과태료', '과태료금액', '부과금액', '과태료부과금액']);
    const preHearing = colVal(row, ['사전의견청취일', '사전청취', '의견청취일']);
    const actionDate = colVal(row, ['행정처분일', '처분일자', '처분일']);
    const note = colVal(row, ['비고', '기타']);

    const fields = [
        { label: '등록번호', value: regNo, icon: '🔢' },
        { label: '상세 주소', value: addr, icon: '📍' },
        { label: '운영자', value: owner, icon: '👤' },
        { label: '연락처', value: phone, icon: '📞' },
        { label: '최근 점검 이력', value: recentHistory, icon: '📅' },
        { label: '위반내용', value: viol, icon: '⚠️', highlight: hasViol },
        { label: '행정처분', value: adminAction, icon: '🏛️', highlight: !!adminAction && adminAction !== '-' },
        { label: '과태료', value: fine, icon: '💰', highlight: !!fine && fine !== '-' && fine !== '0' },
        { label: '사전의견청취일', value: preHearing, icon: '🗓️' },
        { label: '행정처분일', value: actionDate, icon: '📆' },
        { label: '비고', value: note, icon: '📝' },
        { label: '점검자', value: checker, icon: '🔍' },
    ].filter(f => f.value && f.value !== '-' && f.value !== '');

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
            }}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--bg-card)', borderRadius: '20px', width: '100%', maxWidth: '520px',
                    maxHeight: '85vh', overflowY: 'auto',
                    border: `2px solid ${hasViol ? '#fecaca' : 'var(--border-color)'}`,
                    boxShadow: '0 24px 60px rgba(0,0,0,0.3)'
                }}>
                {/* 모달 헤더 */}
                <div style={{
                    padding: '20px 20px 16px', borderBottom: '1px solid var(--border-color)',
                    position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
                    borderRadius: '20px 20px 0 0'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>#{index + 1}</span>
                                {type && <span style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: '10px', background: 'var(--primary-glow)', color: 'var(--primary)', fontWeight: '700' }}>{type}</span>}
                                {hasViol && <span style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: '10px', background: '#fef2f2', color: '#ef4444', fontWeight: '700' }}>⚠️ 위반</span>}
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '4px' }}>{name || '(이름없음)'}</div>
                            <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>📅 {date}</div>
                        </div>
                        <button onClick={onClose} style={{
                            background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                            borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer',
                            fontSize: '1.1rem', color: 'var(--text-muted)', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>✕</button>
                    </div>
                </div>
                {/* 모달 바디 */}
                <div style={{ padding: '16px 20px 24px' }}>
                    {fields.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>상세 정보가 없습니다</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {fields.map((f, i) => (
                                <div key={i} style={{
                                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                                    padding: '10px 14px', borderRadius: '10px',
                                    background: f.highlight ? '#fef2f2' : 'var(--bg-main)',
                                    border: `1px solid ${f.highlight ? '#fecaca' : 'var(--border-color)'}`
                                }}>
                                    <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>{f.icon}</span>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '2px' }}>{f.label}</div>
                                        <div style={{ fontSize: '0.9rem', color: f.highlight ? '#dc2626' : 'var(--text-main)', fontWeight: f.highlight ? '700' : '500', lineHeight: 1.5 }}>{f.value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ───────────────────────────────────────────────
// 탭1: 2026 지도점검
// ───────────────────────────────────────────────
const TOTAL_ACADEMY_COUNT = 751; // 전체 학원 수 (고정값)

// 점검목적 분류 (컬럼값 → 표시명 매핑)
function classifyPurpose(row) {
    const purpose = colVal(row, ['점검목적', '점검구분', '방문목적', '민원구분']);
    if (!purpose) {
        // 구분 컬럼으로 추론
        const div = colVal(row, ['구분', '유형']);
        if (div.includes('신문고') || div.includes('민원')) return '국민신문고';
        if (div.includes('특별')) return '특별점검';
        return '지도점검';
    }
    if (purpose.includes('신문고') || purpose.includes('민원')) return '국민신문고';
    if (purpose.includes('특별')) return '특별점검';
    if (purpose.includes('야간') || purpose.includes('기획')) return '기획점검';
    return '지도점검';
}

function TabRecent({ region, academies, onSelectAcademy }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRow, setSelectedRow] = useState(null);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [page, setPage] = useState(0);
    const [showMonthlyDrop, setShowMonthlyDrop] = useState(false);
    const PAGE_SIZE = 30;

    useEffect(() => {
        setLoading(true);
        setPage(0);
        fetchRecentRawRows()
            .then(({ bodyRows }) => {
                setRows(bodyRows); // 원본 전체 유지 (그룹핑은 useMemo에서)
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [region]);

    // 점검 학원 수 (중복 없는 학원명 기준)
    const uniqueAcademyCount = useMemo(() =>
        new Set(rows.map(r => colVal(r, ['학원(교습소)명', '학원명', '명칭', '기관명'])).filter(Boolean)).size
        , [rows]);

    // ── 학원명+점검일 기준으로 그룹핑 ──
    const groupedRows = useMemo(() => {
        const groups = [];
        const keyToIdx = new Map();
        // 위반 아닌 텍스트 목록
        const NON_VIOL = ['', '-', '없음', '이상없음', 'none', 'n/a'];

        rows.forEach(row => {
            const name = colVal(row, ['학원(교습소)명', '명칭', '학원명', '기관명']);
            const date = colVal(row, ['점검일', '점검일자', '지도점검일']);
            const addr = colVal(row, ['주소', '소재지']);

            // 실제 컬럼명 기준: '위반내용', '지도내용'
            const violRaw = colVal(row, ['위반내용', '위반사항']);
            const guidRaw = colVal(row, ['지도내용', '지도사항', '현지조치', '현지지도']);

            const isViol = violRaw && !NON_VIOL.includes(violRaw.trim().toLowerCase());
            const isGuide = guidRaw && !NON_VIOL.includes(guidRaw.trim().toLowerCase());

            // 표시할 아이템 생성 (위반, 지도 각각)
            const items = [];
            if (isViol) items.push({ content: violRaw, isViol: true });
            if (isGuide) items.push({ content: guidRaw, isViol: false });
            if (items.length === 0) items.push({ content: '이상없음', isViol: false });

            const key = `${name}__${date}`;
            if (keyToIdx.has(key)) {
                const g = groups[keyToIdx.get(key)];
                items.forEach(item => {
                    if (!g.items.some(it => it.content === item.content && it.isViol === item.isViol)) {
                        g.items.push(item);
                        if (item.isViol) g.hasViol = true;
                    }
                });
            } else {
                keyToIdx.set(key, groups.length);
                groups.push({ name, date, addr, items, hasViol: isViol, row });
            }
        });
        return groups;
    }, [rows]);


    // 점검목적별 집계 (그룹 기준)
    const purposeMap = useMemo(() => {
        const map = {};
        groupedRows.forEach(g => {
            const p = classifyPurpose(g.row);
            map[p] = (map[p] || 0) + 1;
        });
        return map;
    }, [groupedRows]);

    const inspRate = Math.round(uniqueAcademyCount / TOTAL_ACADEMY_COUNT * 100);
    const targetAcademyCount = Math.round(TOTAL_ACADEMY_COUNT * 0.5); // 50% 목표수치
    const targetRate = Math.round(uniqueAcademyCount / targetAcademyCount * 100); // 목표수치 대비 달성률

    // ── 월별 1차, 2차 통계 계산 ──
    const monthlyStats = useMemo(() => {
        const stats = {};
        groupedRows.forEach(g => {
            const d = (g.date || '').trim();
            const m = d.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
            if (m) {
                const month = parseInt(m[2], 10);
                const day = parseInt(m[3], 10);
                const isFirstHalf = day <= 15;
                const key = `${month}월 ${isFirstHalf ? '1' : '2'}차`;
                stats[key] = (stats[key] || 0) + 1;
            }
        });

        // 1월 1차 ~ 12월 2차 순서대로 정렬하기 위한 키 배열
        const sortedKeys = Object.keys(stats).sort((a, b) => {
            const parseKey = (k) => {
                const parts = k.match(/(\d+)월\s+(\d+)차/);
                return parts ? parseInt(parts[1], 10) * 10 + parseInt(parts[2], 10) : 0;
            };
            return parseKey(a) - parseKey(b);
        });

        return sortedKeys.map(k => {
            const month = k.split('월')[0];
            const isFirst = k.includes('1차');
            const periodStr = isFirst ? `(${month}.1.~${month}.15.)` :
                `(${month}.16.~${month}.${month === '2' ? '28(29)' : ['4', '6', '9', '11'].includes(month) ? '30' : '31'}.)`;
            return {
                label: `${k} ${periodStr}`,
                count: stats[k]
            };
        });
    }, [groupedRows]);

    // 학원별 교차 배경 (학원명이 바뀔 때마다 0/1 토글)
    const academyBgMap = useMemo(() => {
        const map = new Map();
        let idx = 0;
        groupedRows.forEach(g => {
            if (!map.has(g.name)) { map.set(g.name, idx % 2); idx++; }
        });
        return map;
    }, [groupedRows]);

    const PURPOSE_COLORS = {
        '국민신문고': { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', dot: '#f97316' },
        '특별점검': { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444' },
        '기획점검': { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#22c55e' },
        '지도점검': { bg: '#eef2ff', border: '#c7d2fe', text: '#3730a3', dot: '#6366f1' },
    };
    const PURPOSE_ORDER = ['국민신문고', '특별점검', '기획점검', '지도점검'];

    // 페이지네이션
    const totalPages = Math.ceil(groupedRows.length / PAGE_SIZE);
    const pagedRows = groupedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return (
        <div>
            {/* 툴바 (구글 시트 열기 삭제됨) */}

            {/* ── 상단 요약 패널 ── */}
            {!loading && groupedRows.length > 0 && (
                <div style={{
                    background: 'var(--bg-card)', borderRadius: '16px', padding: '18px 20px',
                    border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', marginBottom: '18px'
                }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
                        {PURPOSE_ORDER.filter(p => purposeMap[p]).map(p => {
                            const c = PURPOSE_COLORS[p];
                            return (
                                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', background: c.bg, border: `1px solid ${c.border}` }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.78rem', color: c.text, fontWeight: '700' }}>{p}</span>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '800', color: c.text }}>{purposeMap[p]}건</span>
                                </div>
                            );
                        })}
                        {Object.entries(purposeMap).filter(([p]) => !PURPOSE_ORDER.includes(p)).map(([p, cnt]) => (
                            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '700' }}>{p}</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#475569' }}>{cnt}건</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>총 점검</span>
                            <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#6366f1' }}>{groupedRows.length}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>건</span>
                        </div>
                        <div style={{ width: '1px', height: '28px', background: 'var(--border-color)' }} />
                        <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* 전체 점검률 */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                                        전체 점검률 <span style={{ fontSize: '0.7rem' }}>(전체 {TOTAL_ACADEMY_COUNT}개 기준)</span>
                                    </span>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#6366f1' }}>{inspRate}%</span>
                                </div>
                                <div style={{ height: '6px', borderRadius: '99px', background: '#bfdbfe', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(inspRate, 100)}%`, background: '#6366f1', transition: 'width 0.6s ease' }} />
                                </div>
                            </div>
                            {/* 목표 점검률 */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                                        목표 점검률 <span style={{ fontSize: '0.7rem' }}>(목표 {targetAcademyCount}개 기준)</span>
                                    </span>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#10b981' }}>{targetRate}%</span>
                                </div>
                                <div style={{ height: '6px', borderRadius: '99px', background: '#d1fae5', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(targetRate, 100)}%`, background: '#10b981', transition: 'width 0.6s ease' }} />
                                </div>
                            </div>
                            {/* 텍스트 코멘트 및 월별 아코디언 */}
                            <div style={{ marginTop: '2px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                <div
                                    onClick={() => setShowMonthlyDrop(!showMonthlyDrop)}
                                    style={{
                                        padding: '6px 10px',
                                        background: '#f8fafc',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '0.75rem',
                                        color: 'var(--text-main)',
                                        fontWeight: '600'
                                    }}
                                >
                                    <span>🎯 목표: 전체의 50%({targetAcademyCount}개소) 점검</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showMonthlyDrop ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </div>
                                {showMonthlyDrop && (
                                    <div style={{ padding: '8px 10px', background: 'white', borderTop: '1px solid #e2e8f0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <div style={{ marginBottom: '6px', fontWeight: '700', color: 'var(--primary)' }}>📊 점검 완료: 총 {uniqueAcademyCount}개소</div>
                                        {monthlyStats.length > 0 ? (
                                            <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                {monthlyStats.map((stat, idx) => (
                                                    <li key={idx}>
                                                        {stat.label} : <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{stat.count}건</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div style={{ paddingLeft: '4px' }}>점검 이력이 없습니다.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 세부 목록 (표 형식) ── */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>⏳ 데이터 로딩 중...</div>
            ) : groupedRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>📭 점검 데이터가 없습니다</div>
            ) : (
                <>
                    {/* 가로 스크롤 래퍼 */}
                    <div style={{ borderRadius: '16px', border: '1px solid var(--border-color)', overflowX: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                        <table style={{ width: '100%', minWidth: '300px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%)', borderBottom: '2px solid var(--border-color)' }}>
                                    {/* 점검일+학원명 통합 sticky 헤더 */}
                                    <th style={{
                                        padding: '9px 12px', width: '120px', color: '#64748b', fontWeight: '700', fontSize: '0.72rem',
                                        whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 2,
                                        boxShadow: '2px 0 6px rgba(0,0,0,0.07)',
                                        backgroundImage: 'linear-gradient(180deg,#f8fafc,#f1f5f9)'
                                    }}>점검일 · 학원명</th>
                                    <th style={{ padding: '9px 12px', color: '#64748b', fontWeight: '700', fontSize: '0.72rem', whiteSpace: 'nowrap', background: 'transparent' }}>지도·위반 내용</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedRows.map((g, i) => {
                                    const bgTone = academyBgMap.get(g.name) === 0 ? '#ffffff' : '#f8faff';
                                    const rowBg = g.hasViol ? '#fff5f5' : bgTone;
                                    const globalIdx = page * PAGE_SIZE + i;
                                    // 날짜 포맷: "2026. 1. 7" → "2026.1.7."
                                    const dateFmt = (() => {
                                        const d = (g.date || '').trim();
                                        const m = d.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
                                        return m ? `${m[1]}.${parseInt(m[2])}.${parseInt(m[3])}.` : d;
                                    })();

                                    return (
                                        <tr
                                            key={i}
                                            onClick={() => { setSelectedRow(g.row); setSelectedIndex(globalIdx); }}
                                            style={{ borderBottom: `1px solid ${g.hasViol ? '#fce4e4' : 'var(--border-color)'}`, background: rowBg, cursor: 'pointer', transition: 'all 0.12s' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.boxShadow = 'inset 0 0 0 1px #c7d2fe'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = rowBg; e.currentTarget.style.boxShadow = 'none'; }}
                                        >
                                            {/* 점검일 + 학원명 통합 sticky */}
                                            <td style={{
                                                padding: '8px 12px',
                                                position: 'sticky', left: 0, zIndex: 1,
                                                background: rowBg,
                                                boxShadow: '2px 0 6px rgba(0,0,0,0.06)',
                                                width: '120px', maxWidth: '120px',
                                                verticalAlign: 'middle',
                                            }}>
                                                {/* 날짜 */}
                                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600', marginBottom: '2px', letterSpacing: '0.01em' }}>
                                                    {dateFmt}
                                                </div>
                                                {/* 학원명 */}
                                                {(() => {
                                                    const nameStyle = {
                                                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        fontSize: '0.84rem', fontWeight: '800', color: 'var(--text-main)'
                                                    };
                                                    if (!academies || !onSelectAcademy) {
                                                        return <span style={nameStyle} title={g.name}>{g.name || '-'}</span>;
                                                    }
                                                    const normTarget = (g.name || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
                                                    const matched = academies.find(a => a.name.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase() === normTarget);
                                                    return matched ? (
                                                        <span
                                                            onClick={e => { e.stopPropagation(); onSelectAcademy(matched); }}
                                                            title={`${g.name} 상세보기`}
                                                            style={{ ...nameStyle, color: '#2563eb', textDecoration: 'underline', textDecorationColor: '#bfdbfe', cursor: 'pointer' }}
                                                        >{g.name || '-'}</span>
                                                    ) : <span style={nameStyle} title={g.name}>{g.name || '-'}</span>;
                                                })()}
                                            </td>
                                            {/* 지도·위반 내용 */}
                                            <td style={{ padding: '8px 12px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {g.items.map((item, ii) => (
                                                        <div key={ii} style={{
                                                            display: 'inline-flex', alignItems: 'flex-start', gap: '5px',
                                                            fontSize: '0.79rem', lineHeight: 1.45,
                                                        }}>
                                                            {item.isViol ? (
                                                                <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '5px', background: '#fee2e2', color: '#dc2626', fontSize: '0.65rem', fontWeight: '800', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>위반</span>
                                                            ) : (
                                                                <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '5px', background: '#e0f2fe', color: '#0369a1', fontSize: '0.65rem', fontWeight: '700', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>지도</span>
                                                            )}
                                                            <span style={{ color: item.isViol ? '#991b1b' : '#374151', fontWeight: item.isViol ? '600' : '400' }}>
                                                                {item.content}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ── 페이지네이션 ── */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                            <button onClick={() => setPage(0)} disabled={page === 0}
                                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: page === 0 ? '#cbd5e1' : 'var(--text-main)', cursor: page === 0 ? 'default' : 'pointer', fontSize: '0.8rem' }}>«</button>
                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: page === 0 ? '#cbd5e1' : 'var(--text-main)', cursor: page === 0 ? 'default' : 'pointer', fontSize: '0.8rem' }}>‹ 이전</button>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0 4px' }}>
                                {page + 1} / {totalPages}
                                <span style={{ fontSize: '0.75rem', marginLeft: '4px' }}>(총 {groupedRows.length}건)</span>
                            </span>
                            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                                style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: page >= totalPages - 1 ? '#cbd5e1' : 'var(--text-main)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: '0.8rem' }}>다음 ›</button>
                            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: page >= totalPages - 1 ? '#cbd5e1' : 'var(--text-main)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: '0.8rem' }}>»</button>
                        </div>
                    )}
                </>
            )}

            {/* 상세 모달 */}
            {selectedRow && (
                <DetailModal row={selectedRow} index={selectedIndex} onClose={() => { setSelectedRow(null); setSelectedIndex(null); }} />
            )}
        </div>
    );
}

// ───────────────────────────────────────────────
// 탭: 통계 (5개 섹션)
// ───────────────────────────────────────────────

function TabStats({ region, statRows, academies, privateTutors }) {
    const [recentRows, setRecentRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchRecentRawRows()
            .then(rec => setRecentRows(rec.bodyRows || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const city = region.endsWith('시') ? region : region + '시';

    // 하남시 / 광주시 법정동 화이트리스트
    const HANAM_DONGS = useMemo(() => new Set([
        '신장동','덕풍동','풍산동','미사동','망월동','선동','교산동','학암동',
        '초일동','초이동','광암동','천현동','창우동','배일미동','하산곡동',
        '상산곡동','감이동','감일동','항동','하사창동','상사창동','위례동','순궁동',
    ]), []);
    const GWANGJU_DONGS = useMemo(() => new Set([
        '경안동','광남동','태전동','송정동','역동','삼동','탄벌동','목현동',
        '오포읍','초월읍','곤지암읍','도척면','퇴촌면','남종면','남한산성면',
    ]), []);
    const DONG_WL = region === '하남' ? HANAM_DONGS : GWANGJU_DONGS;

    // academies prop 기반으로 기관 분류 (지도 데이터와 동일)
    const filtered = useMemo(() => (academies || []).filter(a => (a.address || '').includes(city)), [academies, city]);
    const aList = useMemo(() => filtered.filter(a => a.category !== '교습소'), [filtered]);
    const hList = useMemo(() => filtered.filter(a => a.category === '교습소'), [filtered]);
    // 과외는 별도 privateTutors 배열에서 지역 필터링
    const pList = useMemo(() => (privateTutors || []).filter(a => (a.address || '').includes(city)), [privateTutors, city]);

    // 섹션 2: 연도별 등록 추이 — regDate 기반
    const YEARS = useMemo(() => {
        const cur = parseInt(CURRENT_YEAR);
        return Array.from({ length: 8 }, (_, i) => String(cur - 7 + i));
    }, []);

    const yearStats = useMemo(() => {
        const getY = d => { const m = (d || '').match(/(\d{4})/); return m ? m[1] : ''; };
        const countByYear = (list, dateKey = 'regDate') => list.reduce((m, a) => { const y = getY(a[dateKey] || a.regDate || ''); if (y) m[y] = (m[y] || 0) + 1; return m; }, {});
        const aYearCnt       = countByYear(aList);
        // 점검률 분모용: 학교교과교습학원만 (평생직업교육학원 제외)
        const aSchoolYearCnt = countByYear(aList.filter(a => a.category === '학교교과교습학원'));
        const hYearCnt       = countByYear(hList);
        const pYearCnt       = countByYear(pList, 'reportDate');
        const cumul = (cnt, yNum) => Object.entries(cnt).filter(([yr]) => parseInt(yr) <= yNum).reduce((s, [, c]) => s + c, 0);
        return YEARS.map(y => {
            const yNum = parseInt(y);
            const aNew          = aYearCnt[y] || 0;
            const aActive       = cumul(aYearCnt, yNum);
            const aSchoolActive = cumul(aSchoolYearCnt, yNum); // 점검률 분모용
            const hNew          = hYearCnt[y] || 0;
            const hActive       = cumul(hYearCnt, yNum);
            const pNew          = pYearCnt[y] || 0;
            const pActive       = cumul(pYearCnt, yNum);
            return { year: y, aNew, aActive, aSchoolActive, hNew, hActive, pNew, pActive };
        });
    }, [YEARS, aList, hList, pList]);

    // 섹션 3: 분야별 분포 — 기관 단위 집계 (과외 포함)
    const categoryStats = useMemo(() => {
        const map = {};
        const add = (list, key) => list.forEach(a => {
            const raw = key === 'priv'
                ? (a.subjects?.[0]?.field || a.field || '기타')
                : (a.field || '기타');
            const c = raw.trim() || '기타';
            if (!map[c]) map[c] = { academy: 0, hagwon: 0, priv: 0 };
            map[c][key]++;
        });
        add(aList, 'academy');
        add(hList, 'hagwon');
        add(pList, 'priv');
        const total = (aList.length + hList.length + pList.length) || 1;
        return Object.entries(map)
            .map(([cat, v]) => ({
                cat, ...v,
                total: v.academy + v.hagwon + v.priv,
                pct: Math.round((v.academy + v.hagwon + v.priv) / total * 100),
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 15);
    }, [aList, hList, pList]);

    // 섹션 4: 지도점검 현황 — 학원 단위로 그룹핑 후 집계
    const inspStats = useMemo(() => {
        // recentRows = 하남 최근 지도점검 현황 (현재연도, 과태료 만원 단위)
        // statRows   = 통계 시트 (광주 전체 + 하남 역대, 과태료 원 단위)
        // 하남: 현재연도는 recentRows가 정본 → statRows에서 제외
        // 광주: 통계 시트가 전체 정본 → 연도 제한 없이 사용
        const isHanam = region === '하남';
        const allInsp = [
            ...statRows
                .filter(r => !isHanam || getYear(colVal(r, ['점검일자', '점검일', '지도점검일'])) !== CURRENT_YEAR)
                .map(r => ({ ...r, _fineUnit: 'won' })),
            ...(isHanam
                ? recentRows
                    .filter(r => colVal(r, ['주소', '소재지']).includes(region))
                    .map(r => ({ ...r, _fineUnit: 'manwon' }))
                : []),
        ];

        // 1단계: 연번+점검일 (또는 명칭+점검일 fallback) 단위로 그룹핑
        const groups = {};
        allInsp.forEach(r => {
            const date = colVal(r, ['점검일자', '점검일', '지도점검일']).trim();
            const y = getYear(date);
            if (!y || parseInt(y) < 2019) return;
            // 연번이 있으면 우선 사용 (recentRows 구조), 없으면 명칭+점검일 fallback
            const num  = colVal(r, ['연번', '번호']).trim();
            const name = colVal(r, ['명칭', '학원명', '교습소명', '기관명', '업소명']).trim();
            const key  = num ? `${y}|seq${num}|${date}` : `${y}|${name}|${date}`;
            if (!groups[key]) {
                const typeV = colVal(r, ['학원종류', '종류', '기관유형', '구분']).trim();
                groups[key] = {
                    year: y,
                    type: typeV.includes('교습소') ? 'hagwon' : (typeV.includes('과외') || typeV.includes('개인') ? 'priv' : 'academy'),
                    viol: false,
                    punishSet: new Set(),
                    fine: 0,
                };
            }
            const g = groups[key];
            // 위반 여부: 위반여부(Y/N)=Y 이거나, 위반사항이 실질 내용이면 위반
            const NON_VIOL_VALS = ['', '-', '없음', '이상없음', '해당없음', 'n', 'N'];
            const vRaw = colVal(r, ['위반내용', '위반사항']).trim();
            const vY   = colVal(r, ['위반여부', '결과', '점검결과']).toUpperCase() === 'Y';
            if (vY || (vRaw && !NON_VIOL_VALS.includes(vRaw.toLowerCase()))) {
                g.viol = true;
            }
            // 행정처분: 같은 그룹 내 중복 제거 (Set으로 값 수집 후 나중에 size로 판단)
            // STAT 시트는 행정처분코드(숫자), recentRows는 처분명 — 둘 다 처리
            const p = colVal(r, ['행정처분', '처분종류', '처분결과']).trim();
            if (p && p !== '-' && p !== '없음' && p !== '' && p !== '0') g.punishSet.add(p);
            // 과태료: recentRows는 만원 단위, statRows는 원 단위
            const fStr = colVal(r, ['과태료', '과태료금액', '부과금액']).replace(/[^0-9]/g, '');
            const fRaw = fStr ? parseInt(fStr) : 0;
            const f = r._fineUnit === 'won' ? Math.round(fRaw / 10000) : fRaw;
            if (!isNaN(f) && f > 0) g.fine += f;
        });

        // 2단계: 연도별로 합산
        const byYear = {};
        Object.values(groups).forEach(g => {
            const y = g.year;
            if (!byYear[y]) byYear[y] = { total: 0, academy: 0, hagwon: 0, priv: 0, viol: 0, punish: 0, fine: 0 };
            byYear[y].total++;
            byYear[y][g.type]++;
            if (g.viol) byYear[y].viol++;
            if (g.punishSet.size > 0) byYear[y].punish++;
            byYear[y].fine += g.fine;
        });

        return Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b))
            .map(([year, v]) => ({ year, ...v, violRate: v.total > 0 ? Math.round(v.viol / v.total * 100) : 0 }));
    }, [statRows, recentRows, region]);

    // 섹션 5: 동별 기관 분포 — 법정동 화이트리스트 적용 + 미분류 보완
    const dongStats = useMemo(() => {
        const map = {};
        const getDong = addr => {
            const a = addr || '';
            // 1차: 화이트리스트 동 이름을 주소에서 직접 검색
            //      동 이름 뒤가 공백·숫자·구두점·괄호 또는 문자열 끝이어야 함
            //      → 도로명 주소 (미사대로, 역동로 등) 와 구분
            for (const d of DONG_WL) {
                if (new RegExp(d + '(?=[\\s\\d,()[\\]]|$)').test(a)) return d;
            }
            // 2차: "시" 이후 동/리/읍/면 패턴을 모두 추출 후 화이트리스트 대조
            const after = a.replace(/^.*?시\s*/, '');
            const tokens = [...after.matchAll(/([가-힣]+(?:동|리|읍|면))/g)].map(m => m[1]);
            for (const t of tokens) {
                if (DONG_WL.has(t)) return t;
            }
            // 매칭 실패 → 미분류
            return '';
        };
        const add = (list, key) => list.forEach(a => {
            const d = getDong(a.address || '');
            const dongKey = d || '미분류';
            if (!map[dongKey]) map[dongKey] = { academy: 0, hagwon: 0, priv: 0 };
            map[dongKey][key]++;
        });
        add(aList, 'academy');
        add(hList, 'hagwon');
        add(pList, 'priv');
        return Object.entries(map)
            .map(([dong, v]) => ({ dong, ...v, total: v.academy + v.hagwon + v.priv }))
            .sort((a, b) => {
                if (a.dong === '미분류') return 1;   // 미분류는 항상 맨 아래
                if (b.dong === '미분류') return -1;
                return b.total - a.total;
            });
    }, [aList, hList, pList, DONG_WL]);

    if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>⏳ 데이터 로딩 중...</div>;

    const Th = ({ children, colSpan, rowSpan, style }) => (
        <th colSpan={colSpan} rowSpan={rowSpan} style={{ padding: '9px 12px', fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', background: 'var(--bg-main)', borderBottom: '2px solid var(--border-color)', textAlign: 'left', whiteSpace: 'nowrap', ...style }}>{children}</th>
    );
    const Td = ({ children, style }) => (
        <td style={{ padding: '8px 12px', fontSize: '0.84rem', borderBottom: '1px solid var(--border-color)', ...style }}>{children}</td>
    );
    const Section = ({ title, children }) => (
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '18px 20px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '14px', paddingBottom: '8px', borderBottom: '2px solid var(--primary)' }}>{title}</div>
            {children}
        </div>
    );

    return (
        <div>
            {/* 섹션 1 */}
            <Section title="📊 기관 현황 요약">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '10px' }}>
                    <StatCard icon="🏫" label="학원"     value={aList.length.toLocaleString() + '개'} color="#3b82f6" />
                    <StatCard icon="📖" label="교습소"   value={hList.length.toLocaleString() + '개'} color="#10b981" />
                    <StatCard icon="👤" label="개인과외" value={pList.length.toLocaleString() + '명'} color="#8b5cf6" />
                    <StatCard icon="🏢" label="합계"     value={(aList.length + hList.length + pList.length).toLocaleString() + '개'} color="#f59e0b" />
                </div>
            </Section>

            {/* 섹션 2 */}
            <Section title="📅 연도별 등록 추이">
                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '380px' }}>
                        <thead>
                            <tr>
                                <Th rowSpan={2}>연도</Th>
                                <Th colSpan={2} style={{ textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: '#3b82f6' }}>학원</Th>
                                <Th colSpan={2} style={{ textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: '#10b981', borderLeft: '2px solid var(--border-color)' }}>교습소</Th>
                                <Th colSpan={2} style={{ textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: '#8b5cf6', borderLeft: '2px solid var(--border-color)' }}>과외</Th>
                            </tr>
                            <tr>
                                <Th style={{ padding: '9px 3px 9px 12px' }}>누적<span style={{ fontSize: '0.72em', opacity: 0.75, marginLeft: '2px' }}>(교과)</span></Th>
                                <Th style={{ padding: '9px 12px 9px 3px' }}>신규</Th>
                                <Th style={{ padding: '9px 3px 9px 14px', borderLeft: '2px solid var(--border-color)' }}>누적</Th>
                                <Th style={{ padding: '9px 12px 9px 3px' }}>신규</Th>
                                <Th style={{ padding: '9px 3px 9px 14px', borderLeft: '2px solid var(--border-color)' }}>누적</Th>
                                <Th style={{ padding: '9px 12px 9px 3px' }}>신규</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {yearStats.map((s, i) => (
                                <tr key={s.year} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                    <Td style={{ fontWeight: '700', color: s.year === CURRENT_YEAR ? 'var(--primary)' : 'var(--text-main)' }}>{s.year}년</Td>
                                    <Td style={{ color: s.aActive > 0 ? '#3b82f6' : 'var(--text-muted)', fontWeight: '700', padding: '8px 3px 8px 12px' }}>
                                        {s.aActive > 0 ? (
                                            <>
                                                {s.aActive.toLocaleString()}
                                                {s.aSchoolActive > 0 && (
                                                    <span style={{ fontSize: '0.78em', color: '#60a5fa', fontWeight: '400', marginLeft: '3px', opacity: 0.85 }}>
                                                        ({s.aSchoolActive.toLocaleString()})
                                                    </span>
                                                )}
                                            </>
                                        ) : '-'}
                                    </Td>
                                    <Td style={{ color: s.aNew > 0 ? '#3b82f6' : 'var(--text-muted)', fontWeight: '400', padding: '8px 12px 8px 3px' }}>{s.aNew > 0 ? '+' + s.aNew : '-'}</Td>
                                    <Td style={{ color: s.hActive > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: '700', padding: '8px 3px 8px 14px', borderLeft: '2px solid var(--border-color)' }}>{s.hActive > 0 ? s.hActive.toLocaleString() : '-'}</Td>
                                    <Td style={{ color: s.hNew > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: '400', padding: '8px 12px 8px 3px' }}>{s.hNew > 0 ? '+' + s.hNew : '-'}</Td>
                                    <Td style={{ color: s.pActive > 0 ? '#8b5cf6' : 'var(--text-muted)', fontWeight: '700', padding: '8px 3px 8px 14px', borderLeft: '2px solid var(--border-color)' }}>{s.pActive > 0 ? s.pActive.toLocaleString() : '-'}</Td>
                                    <Td style={{ color: s.pNew > 0 ? '#8b5cf6' : 'var(--text-muted)', fontWeight: '400', padding: '8px 12px 8px 3px' }}>{s.pNew > 0 ? '+' + s.pNew : '-'}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '2px' }}>
                    ※ (교과)는 학교교과교습학원의 갯수를 말함.
                </div>
            </Section>

            {/* 섹션 3 */}
            <Section title="📚 교습 분야별 분포 (상위 15)">
                {categoryStats.length === 0
                    ? <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '16px 0' }}>분야 데이터 없음</div>
                    : <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><Th>순위</Th><Th>분야</Th><Th>학원</Th><Th>교습소</Th><Th>과외</Th><Th>합계</Th><Th>비율</Th></tr></thead>
                            <tbody>
                                {categoryStats.map((s, i) => (
                                    <tr key={s.cat} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                        <Td style={{ color: 'var(--text-muted)', fontWeight: '700' }}>{i + 1}</Td>
                                        <Td style={{ fontWeight: '700' }}>{s.cat}</Td>
                                        <Td style={{ color: '#3b82f6' }}>{s.academy > 0 ? s.academy : '-'}</Td>
                                        <Td style={{ color: '#10b981' }}>{s.hagwon  > 0 ? s.hagwon  : '-'}</Td>
                                        <Td style={{ color: '#8b5cf6' }}>{s.priv    > 0 ? s.priv    : '-'}</Td>
                                        <Td style={{ fontWeight: '700' }}>{s.total}</Td>
                                        <Td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <div style={{ height: '6px', width: Math.max(2, s.pct * 0.8) + 'px', background: 'var(--primary)', borderRadius: '3px' }} />
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.pct}%</span>
                                            </div>
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                }
            </Section>

            {/* 섹션 4 */}
            <Section title="🔍 지도점검 현황 (2019~)">
                {(() => {
                    // 연도별 분모: 학원 누적 + 교습소 누적 (yearStats에서 참조)
                    const ysMap = new Map(yearStats.map(s => [s.year, s]));
                    return (
                        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '580px' }}>
                                <thead><tr>
                                    <Th>연도</Th>
                                    <Th>학원</Th><Th>교습소</Th><Th>과외</Th><Th>합계</Th>
                                    <Th>점검률</Th><Th>위반건수</Th><Th>행정처분</Th><Th>과태료(만원)</Th>
                                </tr></thead>
                                <tbody>
                                    {inspStats.map((s, i) => {
                                        const ys = ysMap.get(s.year);
                                        const denom = ys ? (ys.aSchoolActive + ys.hActive) : 0;
                                        const checkRate = denom > 0 ? Math.round(s.total / denom * 100) : null;
                                        const crColor = checkRate === null ? 'var(--text-muted)'
                                            : checkRate >= 80 ? '#10b981'
                                            : checkRate >= 50 ? '#f59e0b'
                                            : '#3b82f6';
                                        return (
                                            <tr key={s.year} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                                <Td style={{ fontWeight: '700', color: s.year === CURRENT_YEAR ? 'var(--primary)' : 'var(--text-main)' }}>{s.year}년{s.year === CURRENT_YEAR ? ' ★' : ''}</Td>
                                                <Td style={{ color: '#3b82f6' }}>{s.academy > 0 ? s.academy : '-'}</Td>
                                                <Td style={{ color: '#10b981' }}>{s.hagwon  > 0 ? s.hagwon  : '-'}</Td>
                                                <Td style={{ color: '#8b5cf6' }}>{s.priv    > 0 ? s.priv    : '-'}</Td>
                                                <Td style={{ fontWeight: '700' }}>{s.total}</Td>
                                                <Td><span style={{ color: crColor, fontWeight: '700' }}>{checkRate !== null ? checkRate + '%' : '-'}</span></Td>
                                                <Td style={{ color: s.viol > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: s.viol > 0 ? '700' : '400' }}>{s.viol > 0 ? s.viol : '-'}</Td>
                                                <Td style={{ color: s.punish > 0 ? '#8b5cf6' : 'var(--text-muted)' }}>{s.punish > 0 ? s.punish + '건' : '-'}</Td>
                                                <Td style={{ color: s.fine > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: s.fine > 0 ? '700' : '400' }}>{s.fine > 0 ? s.fine.toLocaleString() : '-'}</Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    );
                })()}
            </Section>

            {/* 섹션 5 */}
            <Section title="🗺️ 동별 기관 분포">
                {dongStats.length === 0
                    ? <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>동 데이터 없음</div>
                    : <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><Th>동/읍/면</Th><Th>학원</Th><Th>교습소</Th><Th>과외</Th><Th>합계</Th></tr></thead>
                            <tbody>
                                {dongStats.map((s, i) => {
                                    const isMisc = s.dong === '미분류';
                                    return (
                                    <tr key={s.dong} style={{ background: isMisc ? 'rgba(0,0,0,0.04)' : (i % 2 === 0 ? 'transparent' : 'var(--bg-main)') }}>
                                        <Td style={{ fontWeight: isMisc ? '400' : '700', color: isMisc ? 'var(--text-muted)' : undefined, fontStyle: isMisc ? 'italic' : undefined }}>
                                            {isMisc ? '미분류 (주소 불명확)' : s.dong}
                                        </Td>
                                        <Td style={{ color: isMisc ? 'var(--text-muted)' : '#3b82f6' }}>{s.academy > 0 ? s.academy : '-'}</Td>
                                        <Td style={{ color: isMisc ? 'var(--text-muted)' : '#10b981' }}>{s.hagwon  > 0 ? s.hagwon  : '-'}</Td>
                                        <Td style={{ color: isMisc ? 'var(--text-muted)' : '#8b5cf6' }}>{s.priv    > 0 ? s.priv    : '-'}</Td>
                                        <Td style={{ fontWeight: '800', color: isMisc ? 'var(--text-muted)' : undefined }}>{s.total}</Td>
                                    </tr>
                                    );
                                })}
                                <tr style={{ background: 'rgba(99,102,241,0.06)', borderTop: '2px solid var(--border-color)' }}>
                                    <Td style={{ fontWeight: '800' }}>합계</Td>
                                    <Td style={{ color: '#3b82f6', fontWeight: '800' }}>{dongStats.reduce((s, r) => s + r.academy, 0).toLocaleString()}</Td>
                                    <Td style={{ color: '#10b981', fontWeight: '800' }}>{dongStats.reduce((s, r) => s + r.hagwon,  0).toLocaleString()}</Td>
                                    <Td style={{ color: '#8b5cf6', fontWeight: '800' }}>{dongStats.reduce((s, r) => s + r.priv,    0).toLocaleString()}</Td>
                                    <Td style={{ fontWeight: '800' }}>{dongStats.reduce((s, r) => s + r.total, 0).toLocaleString()}</Td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                }
            </Section>
        </div>
    );
}

function TabPlaceholder({ label }) {
    return (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>🚧</div>
            <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>{label} 탭</div>
            <div style={{ fontSize: '0.85rem', marginTop: '8px' }}>곧 추가될 기능입니다</div>
        </div>
    );
}


// ───────────────────────────────────────────────
// 메인 InspectionPage
// ───────────────────────────────────────────────
export default function InspectionPage({ onBack, academies, privateTutors, onSelectAcademy }) {
    const [region, setRegion] = useState('하남');
    const [activeTab, setActiveTab] = useState(0);
    const [statRows, setStatRows] = useState([]);
    const [loadingStat, setLoadingStat] = useState(false);
    const [errorStat, setErrorStat] = useState('');

    const TABS      = ['2026 지도점검', '통계', '검토', '주의'];
    const TAB_ICONS = ['🕐', '📊', '🔬', '⚠️'];

    useEffect(() => {
        if (!region) return;
        setLoadingStat(true);
        setErrorStat('');
        fetchStatRawRows()
            .then(raw => {
                const { bodyRows } = parseRows(raw);
                setStatRows(filterByRegion(bodyRows, region));
            })
            .catch(() => setErrorStat('통계 데이터를 불러오는데 실패했습니다.'))
            .finally(() => setLoadingStat(false));
    }, [region]);

    const regionBtn = (r) => (
        <button key={r} onClick={() => setRegion(r)} style={{
            padding: '5px 16px', borderRadius: '20px', border: '1.5px solid',
            borderColor: region === r ? 'var(--primary)' : 'var(--border-color)',
            background: region === r ? 'var(--primary)' : 'transparent',
            color: region === r ? 'white' : 'var(--text-muted)',
            fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer',
        }}>{r}</button>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-main)', padding: '0 0 60px 0' }}>
            {/* 헤더 */}
            <div style={{ padding: '0 16px', position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: '600', padding: '4px 0' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            홈
                        </button>
                        <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)' }}>🔍 지도점검 업무관리</span>
                    </div>
                    {/* 지역 토글 */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {['하남', '광주'].map(regionBtn)}
                    </div>
                </div>
                {/* 탭 */}
                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
                    {TABS.map((tab, i) => (
                        <button key={tab} onClick={() => setActiveTab(i)} style={{ padding: '8px 14px', borderRadius: '8px 8px 0 0', border: '1px solid', borderBottom: 'none', borderColor: activeTab === i ? 'var(--primary)' : 'var(--border-color)', background: activeTab === i ? 'var(--primary)' : 'transparent', color: activeTab === i ? 'white' : 'var(--text-muted)', fontWeight: activeTab === i ? '700' : '500', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>{TAB_ICONS[i]}</span><span>{tab}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 탭 콘텐츠 */}
            <div style={{ padding: '20px 16px' }}>
                {errorStat ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>{errorStat}</div>
                ) : (
                    <div>
                        {activeTab === 0 && <TabRecent region={region} academies={academies} onSelectAcademy={onSelectAcademy} />}
                        {activeTab === 1 && <TabStats region={region} statRows={statRows} academies={academies} privateTutors={privateTutors} />}
                        {activeTab === 2 && <TabPlaceholder label="검토" />}
                        {activeTab === 3 && <TabPlaceholder label="주의" />}
                    </div>
                )}
            </div>
        </div>
    );
}
