import { useState, useEffect, useMemo } from 'react';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import {
    fetchStatRawRows, fetchRecentRawRows, APPS_SCRIPT_URL,
    fetchHanamAcademyRawRows, fetchHanamHagwonRawRows,
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
            {/* 툴바 */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <a href="https://docs.google.com/spreadsheets/d/1zSGd9TBcJRculSJzUoZ2N8bB2iENuCI0x9KBpyfXMUo/edit?gid=1946422008#gid=1946422008"
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding: '8px 14px', borderRadius: '10px', background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', textDecoration: 'none', fontWeight: '600', fontSize: '0.83rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📊</span> 구글 시트 열기
                </a>
            </div>

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
                        <div style={{ flex: 1, minWidth: '160px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                                    전체 점검률 <span style={{ fontSize: '0.7rem' }}>(전체 {TOTAL_ACADEMY_COUNT}개 기준)</span>
                                </span>
                                <span style={{ fontSize: '1rem', fontWeight: '800', color: '#6366f1' }}>{inspRate}%</span>
                            </div>
                            <div style={{ height: '8px', borderRadius: '99px', background: 'var(--bg-main)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(inspRate, 100)}%`, background: 'linear-gradient(90deg, #6366f1, #3b82f6)', transition: 'width 0.6s ease' }} />
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                점검 완료 {uniqueAcademyCount}개소 / 전체 {TOTAL_ACADEMY_COUNT}개소
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
// 탭2/탭3: 학원 or 교습소 통계

// ───────────────────────────────────────────────

function TabAcademyOnly({ rows, region, type }) {
    const [academyRaw, setAcademyRaw] = useState([]);
    const [filterViolType, setFilterViolType] = useState(null);

    useEffect(() => {
        if (region !== '하남') return;
        (type === '학원' ? fetchHanamAcademyRawRows() : fetchHanamHagwonRawRows())
            .then(raw => setAcademyRaw(raw)).catch(() => { });
    }, [region, type]);

    const typeRows = useMemo(() => rows.filter(row => {
        const t = colVal(row, ['대상', '유형', '학원종류', '점검유형', '구분']);
        if (!t.includes(type)) return false;

        // 최근 5년 이내 (2022 ~ 2026)
        const year = getYear(colVal(row, ['점검일자', '점검일', '지도점검일']));
        if (!year) return false;

        const yNum = parseInt(year, 10);
        const currentYearNum = parseInt(CURRENT_YEAR, 10);
        return yNum >= currentYearNum - 4 && yNum <= currentYearNum;
    }), [rows, type]);

    const years = useMemo(() =>
        [...new Set(typeRows.map(r => getYear(colVal(r, ['점검일자', '점검일', '지도점검일']))).filter(Boolean))].sort()
        , [typeRows]);

    // 연도별 학원수 (설립일/폐원일 기반)
    const academyByYear = useMemo(() => {
        const { headers, dataRows } = parseAcademyRawRows(academyRaw);
        if (!dataRows.length) return {};
        const nameIdx = headers.findIndex(h => h.includes('학원명') || h.includes('명칭') || h.includes('기관명') || h.includes('상호'));
        const startIdx = headers.findIndex(h => h.includes('설립') || h.includes('개원일') || h.includes('등록일') || h.includes('인가'));
        const endIdx = headers.findIndex(h => h.includes('폐원') || h.includes('종료') || h.includes('폐쇄') || h.includes('말소'));
        const statusIdx = headers.findIndex(h => h.includes('현황') || h.includes('상태') || h.includes('운영구분'));
        const allYears = [...new Set([...years, CURRENT_YEAR])];
        const result = {};
        allYears.forEach(y => {
            const yNum = parseInt(y);
            const nameSet = new Set();
            dataRows.forEach(row => {
                const name = nameIdx >= 0 ? (row[nameIdx] || '').trim() : '';
                if (!name) return;
                const startDate = startIdx >= 0 ? (row[startIdx] || '') : '';
                const endDate = endIdx >= 0 ? (row[endIdx] || '') : '';
                const status = statusIdx >= 0 ? (row[statusIdx] || '') : '';
                const startY = getYear(startDate);
                const endY = getYear(endDate);
                const startOk = !startY || parseInt(startY) <= yNum;
                const endOk = !endY || parseInt(endY) >= yNum;
                const statusOk = !status.includes('폐원') || (endY && parseInt(endY) >= yNum);
                if (startOk && endOk && statusOk) nameSet.add(name);
            });
            result[y] = nameSet.size;
        });
        return result;
    }, [academyRaw, years]);

    // 2026년 기준 요약
    const summary = useMemo(() => {
        const y26 = typeRows.filter(r => getYear(colVal(r, ['점검일자', '점검일', '지도점검일'])) === CURRENT_YEAR);
        const viols = y26.filter(r => { const v = colVal(r, ['위반여부', '위반사항', '결과', '점검결과']); return v && v.trim().toUpperCase() === 'Y'; });
        const inspected = new Set(y26.map(r => colVal(r, ['학원(교습소)명', '학원명', '명칭', '기관명'])).filter(Boolean));
        const total = academyByYear[CURRENT_YEAR] || 0;
        return {
            inspCount: y26.length, inspAcad: inspected.size, violCount: viols.length, totalAcad: total,
            inspRate: total > 0 ? Math.round(inspected.size / total * 100) : 0,
            violRate: total > 0 ? Math.round(viols.length / total * 100) : 0
        };
    }, [typeRows, academyByYear]);

    // 연도별 통계
    const yearStats = useMemo(() => years.map(y => {
        const yRows = typeRows.filter(r => getYear(colVal(r, ['점검일자', '점검일', '지도점검일'])) === y);
        const viols = yRows.filter(r => { const v = colVal(r, ['위반여부', '위반사항', '결과', '점검결과']); return v && v.trim().toUpperCase() === 'Y'; });
        const violTypeMap = {};
        viols.forEach(r => { const t = colVal(r, ['위반사항', '위반유형', '위반내용', '현지조치']) || '기타'; violTypeMap[t] = (violTypeMap[t] || 0) + 1; });
        const punishMap = {};
        viols.forEach(r => { const p = colVal(r, ['행정처분', '행정처분종류', '처분종류', '처분내용']); if (p && p !== '-' && p !== '') punishMap[p] = (punishMap[p] || 0) + 1; });
        const fine = yRows.reduce((s, r) => { const f = parseInt((colVal(r, ['과태료', '과태료금액', '부과금액', '과태료부과금액']) || '').replace(/[^0-9]/g, '')); return s + (isNaN(f) ? 0 : f); }, 0);
        return { year: y, total: yRows.length, violCount: viols.length, violTypeMap, punishMap, fine, totalAcad: academyByYear[y] || 0 };
    }), [typeRows, years, academyByYear]);

    const allViolTypes = useMemo(() => { const s = new Set(); yearStats.forEach(ys => Object.keys(ys.violTypeMap).forEach(t => s.add(t))); return [...s]; }, [yearStats]);
    const allPunishTypes = useMemo(() => { const s = new Set(); yearStats.forEach(ys => Object.keys(ys.punishMap).forEach(t => s.add(t))); return [...s]; }, [yearStats]);
    const violColorMap = useMemo(() => { const m = {}; allViolTypes.forEach((t, i) => { m[t] = VIOL_COLORS[i % VIOL_COLORS.length]; }); return m; }, [allViolTypes]);

    const filteredByViolType = useMemo(() => {
        if (!filterViolType) return null;
        return typeRows.filter(r => {
            const v = colVal(r, ['위반여부', '위반사항', '결과', '점검결과']);
            if (!v || v.trim().toUpperCase() !== 'Y') return false;
            return colVal(r, ['위반사항', '위반유형', '위반내용', '현지조치']) === filterViolType;
        }).sort((a, b) => colVal(a, ['점검일', '점검일자']).localeCompare(colVal(b, ['점검일', '점검일자'])));
    }, [typeRows, filterViolType]);

    const detailByYear = useMemo(() => {
        const g = {};
        typeRows.forEach(row => {
            const y = getYear(colVal(row, ['점검일자', '점검일', '지도점검일'])) || '미상';
            if (!g[y]) g[y] = [];
            g[y].push(row);
        });
        Object.keys(g).forEach(y => g[y].sort((a, b) => colVal(a, ['점검일', '점검일자', '지도점검일']).localeCompare(colVal(b, ['점검일', '점검일자', '지도점검일']))));
        return g;
    }, [typeRows]);

    const color = type === '학원' ? '#3b82f6' : '#10b981';
    const icon = type === '학원' ? '🏫' : '📖';

    const baseOpts = {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, color: '#94a3b8', padding: 6 } } },
        scales: { x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b20' } }, y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' }, beginAtZero: true } }
    };
    const stackedOpts = { ...baseOpts, scales: { ...baseOpts.scales, x: { ...baseOpts.scales.x, stacked: true }, y: { ...baseOpts.scales.y, stacked: true } } };

    return (
        <div>
            {/* 2026 배지 */}
            <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', padding: '4px 12px', borderRadius: '20px', fontWeight: '700' }}>
                    📅 요약 카드는 {CURRENT_YEAR}년 기준
                </span>
            </div>

            {/* 요약 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '10px', marginBottom: '20px' }}>
                <StatCard icon={icon} label={`${type} 점검건수`} value={summary.inspCount + '건'} color={color} />
                {summary.totalAcad > 0 && <StatCard icon="🏢" label={`전체 ${type}수`} value={summary.totalAcad.toLocaleString() + '개'} color="#64748b" />}
                <StatCard icon="⚠️" label="위반건수" value={summary.violCount + '건'} color="#ef4444" />
                <StatCard icon="🔍" label="점검율" value={summary.inspRate + '%'} color="#f59e0b" />
                <StatCard icon="📋" label="위반율" value={summary.violRate + '%'} color="#ef4444" />
            </div>

            {/* 연도별 차트 4종 */}
            {yearStats.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>① 연도별 점검 · 위반 건수</div>
                        <Line data={{
                            labels: yearStats.map(s => s.year + '년'), datasets: [
                                { label: '점검건수', data: yearStats.map(s => s.total), borderColor: '#6366f1', backgroundColor: '#6366f122', tension: 0.3, pointRadius: 4 },
                                { label: '위반건수', data: yearStats.map(s => s.violCount), borderColor: '#ef4444', backgroundColor: '#ef444422', tension: 0.3, pointRadius: 4 },
                            ]
                        }} options={baseOpts} />
                    </div>
                    {allViolTypes.length > 0 && (
                        <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>② 연도별 위반유형별 건수</div>
                            <Bar data={{ labels: yearStats.map(s => s.year + '년'), datasets: allViolTypes.slice(0, 10).map((t, i) => ({ label: t, data: yearStats.map(s => s.violTypeMap[t] || 0), backgroundColor: VIOL_COLORS[i % VIOL_COLORS.length] + 'cc', borderColor: VIOL_COLORS[i % VIOL_COLORS.length], borderWidth: 1, borderRadius: 3, stack: 'v' })) }} options={stackedOpts} />
                        </div>
                    )}
                    {allPunishTypes.length > 0 && (
                        <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>③ 연도별 행정처분 종류</div>
                            <Bar data={{ labels: yearStats.map(s => s.year + '년'), datasets: allPunishTypes.map((t, i) => ({ label: t, data: yearStats.map(s => s.punishMap[t] || 0), backgroundColor: COLORS[i % COLORS.length] + 'cc', borderColor: COLORS[i % COLORS.length], borderWidth: 1, borderRadius: 3, stack: 'p' })) }} options={stackedOpts} />
                        </div>
                    )}
                    {yearStats.some(s => s.fine > 0) && (
                        <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>④ 연도별 과태료 부과액 (만원)</div>
                            <Line data={{ labels: yearStats.map(s => s.year + '년'), datasets: [{ label: '과태료(만원)', data: yearStats.map(s => Math.round(s.fine / 10000)), borderColor: '#f59e0b', backgroundColor: '#f59e0b22', tension: 0.3, pointRadius: 4, fill: true }] }} options={baseOpts} />
                        </div>
                    )}
                </div>
            )}

            {/* 위반유형 필터 상세 */}
            {filterViolType && filteredByViolType && (
                <div style={{ background: '#fef2f2', borderRadius: '14px', padding: '18px', border: '1px solid #fecaca', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#ef4444' }}>
                            ⚠️ 위반유형: <span style={{ borderBottom: '2px solid #ef4444' }}>{filterViolType}</span> — {filteredByViolType.length}건 (연도 오름차순)
                        </h3>
                        <button onClick={() => setFilterViolType(null)} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', padding: '5px 14px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '700' }}>✕ 닫기</button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#fee2e2', borderBottom: '2px solid #fecaca' }}>
                                    {['연도', '점검일', `${type}명`, '위반내용', '행정처분'].map(h => (
                                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: '#991b1b', fontWeight: '700', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredByViolType.map((row, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #fecaca', background: i % 2 === 0 ? 'transparent' : '#fff5f5' }}>
                                        <td style={{ padding: '8px 12px', color: '#64748b', fontWeight: '700', whiteSpace: 'nowrap' }}>{getYear(colVal(row, ['점검일', '점검일자', '지도점검일'])) || '-'}년</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{colVal(row, ['점검일', '점검일자', '지도점검일']) || '-'}</td>
                                        <td style={{ padding: '8px 12px', color: '#2563eb', fontWeight: '600', whiteSpace: 'nowrap' }}>{colVal(row, ['학원(교습소)명', '학원명', '명칭', '기관명']) || '-'}</td>
                                        <td style={{ padding: '8px 12px', color: '#ef4444', fontWeight: '600' }}>{colVal(row, ['위반사항', '위반유형', '위반내용', '현지조치']) || '-'}</td>
                                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{colVal(row, ['행정처분', '처분종류', '처분내용']) || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 연도별 상세 점검 내역 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: '700' }}>📋 연도별 상세 점검 내역</h3>
                {Object.keys(detailByYear).sort().map(year => {
                    const yRows = detailByYear[year];
                    const yViols = yRows.filter(r => { const v = colVal(r, ['위반여부', '위반사항', '결과', '점검결과']); return v && v.trim().toUpperCase() === 'Y'; });
                    const yViolMap = {};
                    yViols.forEach(r => { const t = colVal(r, ['위반사항', '위반유형', '위반내용', '현지조치']) || '기타'; yViolMap[t] = (yViolMap[t] || 0) + 1; });
                    const yFine = yRows.reduce((s, r) => { const f = parseInt((colVal(r, ['과태료', '과태료금액', '부과금액']) || '').replace(/[^0-9]/g, '')); return s + (isNaN(f) ? 0 : f); }, 0);
                    return (
                        <div key={year} style={{ marginBottom: '32px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '3px solid var(--primary)' }}>
                                <span style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--primary)' }}>📅 {year}년</span>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '3px 12px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                                    총 {yRows.length}건 · 위반 {yViols.length}건
                                </span>
                            </div>
                            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                        <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border-color)' }}>
                                            {['점검일', `${type}명`, '위반내용', '행정처분', '비고'].map(h => (
                                                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '700', whiteSpace: 'nowrap', fontSize: '0.82rem', background: 'var(--bg-main)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {yRows.map((row, i) => {
                                            const name = colVal(row, ['학원(교습소)명', '학원명', '명칭', '기관명']);
                                            const date = colVal(row, ['점검일', '점검일자', '지도점검일']);
                                            const viol = colVal(row, ['위반사항', '위반유형', '위반내용', '현지조치']);
                                            const punish = colVal(row, ['행정처분', '처분종류', '처분내용', '행정처분종류']);
                                            const note = colVal(row, ['비고', '기타']);
                                            const isY = colVal(row, ['위반여부', '위반사항', '결과', '점검결과']).toUpperCase() === 'Y';
                                            const vc = violColorMap[viol] || '#ef4444';
                                            return (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}
                                                    onMouseOver={e => e.currentTarget.style.background = 'var(--primary-glow)'}
                                                    onMouseOut={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-main)'}>
                                                    <td style={{ padding: '9px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{date || '-'}</td>
                                                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                                                        <span style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontWeight: '700', fontSize: '0.9rem' }}
                                                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(name + ' ' + region + ' 학원')}`, '_blank')}>{name || '-'}</span>
                                                    </td>
                                                    <td style={{ padding: '9px 14px', maxWidth: '260px' }}>
                                                        {isY && viol
                                                            ? <span style={{ color: vc, textDecoration: 'underline', cursor: 'pointer', fontWeight: '700', fontSize: '0.87rem' }} onClick={() => setFilterViolType(viol === filterViolType ? null : viol)}>{viol}</span>
                                                            : <span style={{ color: '#10b981', fontSize: '0.85rem' }}>{viol || '이상없음'}</span>}
                                                    </td>
                                                    <td style={{ padding: '9px 14px', color: isY && punish ? '#ef4444' : 'var(--text-muted)', fontWeight: isY && punish ? '700' : '400', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{punish || '-'}</td>
                                                    <td style={{ padding: '9px 14px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{note || '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {/* 연도 브리핑 */}
                            <div style={{ background: 'linear-gradient(135deg,#f8fafc,#eef2ff)', borderRadius: '12px', padding: '14px 18px', border: '1px solid #c7d2fe' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#312e81', marginBottom: '10px' }}>📊 {year}년 종합 브리핑</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.83rem' }}>
                                    {academyByYear[year] > 0 && <span>🏢 전체 {type}수: <b style={{ color: 'var(--text-main)' }}>{academyByYear[year].toLocaleString()}개</b></span>}
                                    <span>📋 총 점검: <b style={{ color: '#6366f1' }}>{yRows.length}건</b></span>
                                    <span>⚠️ 위반: <b style={{ color: '#ef4444' }}>{yViols.length}건</b></span>
                                    {yFine > 0 && <span>💰 과태료: <b style={{ color: '#f59e0b' }}>{Math.round(yFine / 10000).toLocaleString()}만원</b></span>}
                                    {Object.entries(yViolMap).map(([t, c]) => (
                                        <span key={t} style={{ color: violColorMap[t] || '#ef4444', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setFilterViolType(t === filterViolType ? null : t)}>[{t}: {c}건]</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ───────────────────────────────────────────────
// 탭4: 개인과외 통계
// ───────────────────────────────────────────────
function TabPrivate({ rows }) {
    const filtered = useMemo(() => rows.filter(row => {
        const type = colVal(row, ['대상', '유형', '학원종류', '점검유형', '구분']);
        if (!(type.includes('개인') || type.includes('과외') || type.includes('교습자'))) return false;

        const year = getYear(colVal(row, ['점검일자', '점검일', '지도점검일']));
        if (!year) return false;

        const yNum = parseInt(year, 10);
        const currentYearNum = parseInt(CURRENT_YEAR, 10);
        return yNum >= currentYearNum - 4 && yNum <= currentYearNum;
    }), [rows]);

    const viols = filtered.filter(r => { const v = colVal(r, ['위반여부', '결과', '점검결과', '위반사항']); return v && v.trim().toUpperCase() === 'Y'; });
    const typeMap = {}, punishMap = {};
    viols.forEach(r => { const t = colVal(r, ['위반사항', '결과', '위반내역']) || '기타'; typeMap[t] = (typeMap[t] || 0) + 1; });
    filtered.forEach(r => { const p = colVal(r, ['처분결과', '행정처분', '처분종류']); if (p && p !== '-' && p !== '') punishMap[p] = (punishMap[p] || 0) + 1; });

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '12px', marginBottom: '20px' }}>
                <StatCard icon="👤" label="개인과외 점검" value={filtered.length + '건'} color="#8b5cf6" />
                <StatCard icon="⚠️" label="위반(Y)" value={viols.length + '건'} color="#ef4444" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '12px', marginBottom: '16px' }}>
                {Object.keys(typeMap).length > 0 && <DoughnutChart title="위반 유형" labels={Object.keys(typeMap)} data={Object.values(typeMap)} />}
                {Object.keys(punishMap).length > 0 && <DoughnutChart title="처분 현황" labels={Object.keys(punishMap)} data={Object.values(punishMap)} />}
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>총 {filtered.length}건 중 위반(Y) {viols.length}건</div>
            </div>
        </div>
    );
}

// ───────────────────────────────────────────────
// 탭5: 과태료 통계
// ───────────────────────────────────────────────
function TabFine({ rows }) {
    const fineRows = rows.filter(r => {
        // 최근 5년 이내 (2022 ~ 2026) 필터링
        const year = getYear(colVal(r, ['점검일자', '점검일', '지도점검일']));
        if (!year) return false;
        const yNum = parseInt(year, 10);
        const currentYearNum = parseInt(CURRENT_YEAR, 10);
        if (yNum < currentYearNum - 4 || yNum > currentYearNum) return false;

        const fine = colVal(r, ['과태료부과금액', '과태료', '부과금액', '과태료금액']);
        return parseInt((fine || '').replace(/[^0-9]/g, '')) > 0;
    });
    const totalFine = fineRows.reduce((s, r) => { const v = parseInt((colVal(r, ['과태료부과금액', '과태료', '부과금액']) || '').replace(/[^0-9]/g, '')); return s + (isNaN(v) ? 0 : v); }, 0);
    const reasonMap = {};
    fineRows.forEach(r => { const t = colVal(r, ['위반사항', '사유', '위반내역']) || '기타'; reasonMap[t] = (reasonMap[t] || 0) + 1; });
    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '12px', marginBottom: '20px' }}>
                <StatCard icon="💰" label="과태료 건수" value={fineRows.length + '건'} color="#f59e0b" />
                <StatCard icon="💵" label="총 부과액(만원)" value={Math.round(totalFine / 10000).toLocaleString() + '만원'} color="#f59e0b" />
            </div>
            {Object.keys(reasonMap).length > 0 && <DoughnutChart title="위반사항별 과태료" labels={Object.keys(reasonMap)} data={Object.values(reasonMap)} />}
        </div>
    );
}

// ───────────────────────────────────────────────
// 탭6: 무등록 통계
// ───────────────────────────────────────────────
function TabUnregistered({ rows }) {
    const filtered = rows.filter(r => {
        // 최근 5년 이내 (2022 ~ 2026) 필터링
        const year = getYear(colVal(r, ['점검일자', '점검일', '지도점검일']));
        if (!year) return false;
        const yNum = parseInt(year, 10);
        const currentYearNum = parseInt(CURRENT_YEAR, 10);
        if (yNum < currentYearNum - 4 || yNum > currentYearNum) return false;

        const t = colVal(r, ['대상', '유형', '점검유형', '위반사항', '결과', '점검결과']);
        return t.includes('무등록') || t.includes('미등록') || t.includes('불법');
    });
    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '12px', marginBottom: '20px' }}>
                <StatCard icon="🚫" label="무등록 적발" value={filtered.length + '건'} color="#ef4444" />
            </div>
            {filtered.length === 0
                ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>✨ 무등록 적발 데이터가 없습니다</div>
                : <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>총 {filtered.length}건 무등록 적발 내역</div>
                </div>
            }
        </div>
    );
}

// ───────────────────────────────────────────────
// 메인 InspectionPage
// ───────────────────────────────────────────────
export default function InspectionPage({ onBack, academies, onSelectAcademy }) {
    const [region, setRegion] = useState('하남');
    const [activeTab, setActiveTab] = useState(0);
    const [statRows, setStatRows] = useState([]);
    const [loadingStat, setLoadingStat] = useState(false);
    const [errorStat, setErrorStat] = useState('');

    const TABS = ['2026 지도점검', '학원', '교습소', '개인과외', '과태료', '무등록'];
    const TAB_ICONS = ['🕐', '🏫', '📖', '👤', '💰', '🚫'];

    useEffect(() => {
        if (!region) return;
        setLoadingStat(true);
        setErrorStat('');
        setActiveTab(0);
        fetchStatRawRows()
            .then(raw => {
                const { bodyRows } = parseRows(raw);
                const filtered = filterByRegion(bodyRows, region);
                setStatRows(filtered);
            })
            .catch(() => setErrorStat('통계 데이터를 불러오는데 실패했습니다.'))
            .finally(() => setLoadingStat(false));
    }, [region]);



    // 메인 뷰
    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-main)', padding: '0 0 60px 0' }}>
            {/* 헤더 */}
            <div style={{ padding: '0 16px', position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0' }}>
                    <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: '600', padding: '6px 0' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        홈
                    </button>
                    <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)' }}>🔍 지도점검 업무관리 (하남)</span>
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
                {loadingStat ? (
                    <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>⏳ 데이터 로딩 중...</div>
                ) : errorStat ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>{errorStat}</div>
                ) : (
                    <div>
                        {activeTab === 0 && <TabRecent region={region} academies={academies} onSelectAcademy={onSelectAcademy} />}
                        {activeTab === 1 && <TabAcademyOnly rows={statRows} region={region} type="학원" />}
                        {activeTab === 2 && <TabAcademyOnly rows={statRows} region={region} type="교습소" />}
                        {activeTab === 3 && <TabPrivate rows={statRows} />}
                        {activeTab === 4 && <TabFine rows={statRows} />}
                        {activeTab === 5 && <TabUnregistered rows={statRows} />}
                    </div>
                )}
            </div>
        </div>
    );
}
