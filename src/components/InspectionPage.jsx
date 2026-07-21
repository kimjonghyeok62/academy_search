import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import AreaCalculatorApp from './AreaCalculatorApp';
import PhotoRenamePage from './PhotoRenamePage';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import {
    fetchStatRawRows, fetchRecentRawRows,
    fetchHanamAcademyRawRows, fetchHanamHagwonRawRows,
    fetchNiceAcademyRawRows, fetchNiceHagwonRawRows, fetchNicePrivateRawRows,
    fetchInspectionDeferRawRows,
} from '../utils/inspectionSheets';
import { fetchAcademyClosureData } from '../utils/googleSheets';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title);

// ── 색상 팔레트 ──
const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#84cc16'];
const VIOL_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'];
const CURRENT_YEAR = '2026';

// ── 동 화이트리스트 (동별 분포 + 검토 탭 공유) ──
const HANAM_DONG_SET = new Set(['신장동','덕풍동','풍산동','미사동','망월동','선동','교산동','학암동','초일동','초이동','광암동','천현동','창우동','배일미동','하산곡동','상산곡동','감이동','감일동','항동','하사창동','상사창동','위례동','순궁동','감북동','춘궁동']);
const GWANGJU_DONG_SET = new Set(['경안동','광남동','태전동','송정동','역동','삼동','탄벌동','목현동','오포읍','초월읍','곤지암읍','도척면','퇴촌면','남종면','남한산성면']);
// 주소→법정동 캐시 (지도 페이지 geocoding 시 채워짐, 모듈 로드 시 1회 읽기)
function getAddrDongCache() {
    try { return JSON.parse(localStorage.getItem('academyAddrDongCache') || '{}'); }
    catch (e) { return {}; }
}

// "신장1동" → "신장동", "덕풍2동" → "덕풍동" (행정동→법정동 표준화)
function normalizeDongName(d) {
    return d.replace(/([가-힣]+)\d+(동|리|읍|면)$/, '$1$2');
}

function getDongFromAddr(addr, wl) {
    const a = addr || '';
    // 1차: 화이트리스트 동명 직접 검색
    for (const d of wl) {
        if (new RegExp(d + '(?=[\\s\\d,()[\\]]|$)').test(a)) return d;
    }
    // 2차: "시" 이후 동/리/읍/면 패턴 추출 후 화이트리스트 대조 (숫자 포함 행정동명도 정규화)
    const after = a.replace(/^.*?시\s*/, '');
    const tokens = [...after.matchAll(/([가-힣]+(?:\d+)?(?:동|리|읍|면))/g)].map(m => m[1]);
    for (const t of tokens) {
        if (wl.has(t)) return t;
        const norm = normalizeDongName(t);
        if (wl.has(norm)) return norm;
    }
    // 3차: 지도 페이지 geocoding 결과 캐시에서 법정동명 조회
    // (지도 탭 방문 후 자동 채워짐 — 도로명 주소도 정확하게 분류 가능)
    const cached = getAddrDongCache()[a];
    if (cached) {
        if (wl.has(cached)) return cached;
        const norm = normalizeDongName(cached);
        if (wl.has(norm)) return norm;
    }
    return '';
}

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
function StatCard({ icon, label, value, color, sub }) {
    return (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '14px 16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>{icon}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: color || 'var(--text-main)' }}>{value}</div>
            {sub && sub.length > 0 && (
                <div style={{ marginTop: '7px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {sub.map((s, i) => (
                        <div key={i} style={{ fontSize: '0.68rem', fontWeight: '700', color: s.color || '#64748b', background: s.bg || '#f1f5f9', borderRadius: '4px', padding: '2px 6px', border: `1px solid ${s.border || '#e2e8f0'}` }}>
                            {s.label} <span>{s.value}</span>
                        </div>
                    ))}
                </div>
            )}
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
const INSP_H_CLOSED = ['자진폐원', '직권폐원', '자진폐소', '직권폐소']; // 폐소 교습소 제외용

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

// ───────────────────────────────────────────────
// 통계 카드: 학원 행정처분 및 적발 현황
// ───────────────────────────────────────────────

// 공문상 코드별 세부 항목 정의 (코드, 축약 레이블, 상위 카테고리)
const STAT_VIOL_ITEMS = [
    { code: '1-1', label: '1-1 시설미등록', cat: '시설' },
    { code: '2-1', label: '2-1 교습비 초과징수', cat: '교습비등' },
    { code: '2-2', label: '2-2 교습비 변경미등록', cat: '교습비등' },
    { code: '2-3', label: '2-3 교습비 게시위반', cat: '교습비등' },
    { code: '3-1', label: '3-1 강사 채용·해임', cat: '강사등' },
    { code: '3-2', label: '3-2 성범죄 미조회', cat: '강사등' },
    { code: '3-3', label: '3-3 아동학대 미조회', cat: '강사등' },
    { code: '3-4', label: '3-4 강사 미게시', cat: '강사등' },
    { code: '3-5', label: '3-5 교습소강사', cat: '강사등' },
    { code: '4-1', label: '4-1 미등록운영', cat: '운영' },
    { code: '4-2', label: '4-2 교습과정', cat: '운영' },
    { code: '4-3', label: '4-3 광고표시', cat: '운영' },
    { code: '4-4', label: '4-4 장부미비치', cat: '운영' },
    { code: '4-5', label: '4-5 등록증미게시', cat: '운영' },
    { code: '4-6', label: '4-6 명칭위반', cat: '운영' },
    { code: '4-7', label: '4-7 선행학습', cat: '운영' },
    { code: '4-8', label: '4-8 교습시간', cat: '운영' },
    { code: '4-9', label: '4-9 과대광고', cat: '운영' },
    { code: '4-10', label: '4-10 연수불참', cat: '운영' },
    { code: '4-11', label: '4-11 휴·폐원', cat: '운영' },
    { code: '4-12', label: '4-12 안전보험', cat: '운영' },
    { code: '5-1', label: '5-1 기타', cat: '기타' },
];
const STAT_VIOL_CATS_ORDER = ['시설', '교습비등', '강사등', '운영', '기타'];
const STAT_VIOL_CODES = STAT_VIOL_ITEMS.map(i => i.code);
const STAT_ADMIN_TYPES = ['등록말소/폐지', '교습정지', '벌점부과/시정명령/경고', '행정지도', '과태료', '고발(수사의뢰)'];
const STAT_PURPOSES = ['국민신문고', '불법사교육', '특별점검', '지도점검'];

// 위반 텍스트 → 공문 코드 매핑 (코드 접두어 우선, 키워드 fallback)
function classifyViolCode(text) {
    if (!text) return '5-1';
    const m = text.match(/^(\d+)-(\d+)/);
    if (m) {
        const code = `${m[1]}-${m[2]}`;
        if (STAT_VIOL_CODES.includes(code)) return code;
    }
    if (/시설.{0,10}설비|숙박시설|위치.{0,5}무단/.test(text)) return '1-1';
    if (/초과징수/.test(text)) return '2-1';
    if (/교습비.{0,5}변경.{0,5}미등록|교습비.{0,3}미반환|조정명령|영수증.{0,5}미교부/.test(text)) return '2-2';
    if (/교습비.{0,10}(게시|표시|고지)|(미게시|미표시).{0,5}교습비/.test(text)) return '2-3';
    if (/채용.{0,5}해임|무자격.{0,5}강사/.test(text)) return '3-1';
    if (/성범죄/.test(text)) return '3-2';
    if (/아동학대/.test(text)) return '3-3';
    if (/강사.{0,5}인적사항/.test(text)) return '3-4';
    if (/교습소.{0,5}(강사|임시교습자)|보조요원/.test(text)) return '3-5';
    if (/미등록.{0,5}(신고)?.{0,5}(학원|교습소)|거짓.{0,10}(등록|신고)|부정한.{0,5}방법/.test(text)) return '4-1';
    if (/교습과정/.test(text)) return '4-2';
    if (/광고.{0,10}(교습비|등록.{0,3}증명|표시)/.test(text)) return '4-3';
    if (/제장부|장부.{0,5}미비치|부실기재/.test(text)) return '4-4';
    if (/등록.{0,5}증명서.{0,5}미게시/.test(text)) return '4-5';
    if (/명칭.{0,5}(사용|위반)/.test(text)) return '4-6';
    if (/선행학습/.test(text)) return '4-7';
    if (/교습.{0,2}시간/.test(text)) return '4-8';
    if (/거짓.{0,3}광고|과대광고/.test(text)) return '4-9';
    if (/정기.{0,3}연수/.test(text)) return '4-10';
    if (/휴원|폐원|휴소|폐소/.test(text)) return '4-11';
    if (/안전보험/.test(text)) return '4-12';
    return '5-1';
}

function classifyAdminActionType(text) {
    if (!text || text === '-') return null;
    const t = text.trim();
    if (/말소|폐지/.test(t)) return '등록말소/폐지';
    if (/교습정지|수업정지/.test(t)) return '교습정지';
    if (/벌점|시정명령|경고/.test(t)) return '벌점부과/시정명령/경고';
    if (/행정지도/.test(t)) return '행정지도';
    if (/과태료/.test(t)) return '과태료';
    if (/고발|수사의뢰/.test(t)) return '고발(수사의뢰)';
    return null;
}

function classifyPurposeStat(row) {
    const p = colVal(row, ['점검목적', '점검구분', '방문목적', '민원구분']);
    const d = colVal(row, ['구분', '유형']);
    const c = p + ' ' + d;
    if (c.includes('신문고') || c.includes('민원')) return '국민신문고';
    if (c.includes('불법사교육') || (c.includes('불법') && c.includes('사교육'))) return '불법사교육';
    if (c.includes('특별')) return '특별점검';
    return '지도점검';
}

function statWeekNum(day) { return Math.ceil(day / 7); }

// ── 제네릭 통계 헬퍼 팩토리 (학원·교습소 / 개인과외 공용) ──
function makeStatHelpers(violItemsCfg, violCatsOrderCfg) {
    const codes = violItemsCfg.map(i => i.code);

    const newEntry = () => ({
        inspectorCount: 0,
        institutions: new Set(),
        violInstitutions: new Set(),
        violItems: Object.fromEntries(codes.map(c => [c, 0])),
        violItemInst: Object.fromEntries(codes.map(c => [c, new Set()])),
        adminTypes: Object.fromEntries(STAT_ADMIN_TYPES.map(t => [t, 0])),
        adminTypeInst: Object.fromEntries(STAT_ADMIN_TYPES.map(t => [t, new Set()])),
        fine: 0,
    });

    const merge = (acc, src) => {
        acc.inspectorCount += src.inspectorCount;
        src.institutions.forEach(i => acc.institutions.add(i));
        src.violInstitutions.forEach(i => acc.violInstitutions.add(i));
        codes.forEach(c => {
            acc.violItems[c] += src.violItems[c];
            src.violItemInst[c].forEach(n => acc.violItemInst[c].add(n));
        });
        STAT_ADMIN_TYPES.forEach(t => {
            acc.adminTypes[t] += src.adminTypes[t];
            src.adminTypeInst[t].forEach(n => acc.adminTypeInst[t].add(n));
        });
        acc.fine += src.fine;
    };

    const toDisplay = (s) => {
        const violCats = Object.fromEntries(violCatsOrderCfg.map(cat => {
            const sum = violItemsCfg.filter(i => i.cat === cat).reduce((a, i) => a + s.violItems[i.code], 0);
            return [cat, sum];
        }));
        const violCatInst = Object.fromEntries(violCatsOrderCfg.map(cat => {
            const names = new Set();
            violItemsCfg.filter(i => i.cat === cat).forEach(i => s.violItemInst[i.code].forEach(n => names.add(n)));
            return [cat, [...names]];
        }));
        return {
            inspector: s.inspectorCount,
            instList: [...s.institutions],
            institution: s.institutions.size,
            violInstList: [...s.violInstitutions],
            violation: s.violInstitutions.size,
            violTotal: codes.reduce((sum, c) => sum + s.violItems[c], 0),
            violItems: { ...s.violItems },
            violItemInst: Object.fromEntries(codes.map(c => [c, [...s.violItemInst[c]]])),
            violCats,
            violCatInst,
            adminTotal: STAT_ADMIN_TYPES.reduce((sum, t) => sum + s.adminTypes[t], 0),
            adminTypes: { ...s.adminTypes },
            adminTypeInst: Object.fromEntries(STAT_ADMIN_TYPES.map(t => [t, [...s.adminTypeInst[t]]])),
            fine: s.fine,
        };
    };

    return { newEntry, merge, toDisplay };
}

// ── 개인과외교습자 위반 항목 정의 ──
const STAT_PT_VIOL_ITEMS = [
    { code: '1-1', label: '1-1 교습비 초과징수',    cat: '교습비등' },
    { code: '1-2', label: '1-2 교습비 변경미신고',   cat: '교습비등' },
    { code: '1-3', label: '1-3 교습비 게시위반',     cat: '교습비등' },
    { code: '2-1', label: '2-1 채용미신고·거짓신고', cat: '강사' },
    { code: '3-1', label: '3-1 위치 무단변경',       cat: '운영' },
    { code: '3-2', label: '3-2 신고외 교습과목',     cat: '운영' },
    { code: '3-3', label: '3-3 선행학습 광고',       cat: '운영' },
    { code: '3-4', label: '3-4 교습시간 위반',       cat: '운영' },
    { code: '3-5', label: '3-5 신고증명서 미게시',   cat: '운영' },
    { code: '3-6', label: '3-6 광고 표시위반',       cat: '운영' },
    { code: '3-7', label: '3-7 장소표지 미부착',     cat: '운영' },
    { code: '3-8', label: '3-8 장부 미비치',         cat: '운영' },
    { code: '3-9', label: '3-9 기타운영',            cat: '운영' },
    { code: '4-1', label: '4-1 기타',               cat: '기타' },
];
const STAT_PT_VIOL_CATS_ORDER = ['교습비등', '강사', '운영', '기타'];
const STAT_PT_VIOL_CODES = STAT_PT_VIOL_ITEMS.map(i => i.code);

function classifyPtViolCode(text) {
    if (!text) return '4-1';
    const m = text.match(/^(\d+)-(\d+)/);
    if (m) { const c = `${m[1]}-${m[2]}`; if (STAT_PT_VIOL_CODES.includes(c)) return c; }
    if (/초과징수/.test(text)) return '1-1';
    if (/교습비.{0,5}변경.{0,5}미신고|교습비.{0,3}미반환|조정명령|영수증.{0,5}미교부/.test(text)) return '1-2';
    if (/교습비.{0,10}(게시|표시|고지)|(미게시|미표시).{0,5}교습비/.test(text)) return '1-3';
    if (/채용.{0,5}미신고|거짓.{0,10}(신고|방법)/.test(text)) return '2-1';
    if (/위치.{0,5}무단/.test(text)) return '3-1';
    if (/신고.{0,3}외.{0,5}교습과목|교습과목.{0,3}외/.test(text)) return '3-2';
    if (/선행학습/.test(text)) return '3-3';
    if (/교습.{0,2}시간/.test(text)) return '3-4';
    if (/신고.{0,5}증명서.{0,5}미게시|증명서.{0,5}미게시|제시.{0,3}불응/.test(text)) return '3-5';
    if (/광고.{0,10}(교습비|신고.{0,3}증명|미표시|거짓)/.test(text)) return '3-6';
    if (/장소.{0,3}표지/.test(text)) return '3-7';
    if (/제장부|장부.{0,5}미비치|부실기재/.test(text)) return '3-8';
    return '4-1';
}

// ────────────────────────────────────────────────────────
// 공통 통계 테이블 카드 (학원·교습소 / 개인과외 모두 사용)
// ────────────────────────────────────────────────────────
function StatsTableCard({ pastGroupedRows, title, subtitle, typeFilter, violItemsCfg, violCatsOrderCfg, classifyViol }) {
    const [expandedMonths, setExpandedMonths] = useState(new Set());
    const [showDetail, setShowDetail] = useState(false);
    const [popup, setPopup] = useState(null);
    const showPopup = (e, title, names) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.min(rect.left, window.innerWidth - 280);
        const y = Math.min(rect.bottom + 4, window.innerHeight - 320);
        setPopup({ title, names: names.slice().sort(), x, y });
    };

    // 헬퍼는 설정이 바뀔 때만 재생성
    const helpers = useMemo(() => makeStatHelpers(violItemsCfg, violCatsOrderCfg), [violItemsCfg, violCatsOrderCfg]); // eslint-disable-line react-hooks/exhaustive-deps

    const parseStatDate = (dateStr) => {
        const m = (dateStr || '').match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
        return m ? { year: m[1], month: +m[2], day: +m[3] } : null;
    };

    const filteredGroups = useMemo(() =>
        (pastGroupedRows || []).filter(g => {
            const d = parseStatDate(g.date);
            if (!d || d.year !== CURRENT_YEAR) return false;
            return typeFilter(g.row);
        })
    , [pastGroupedRows]); // eslint-disable-line react-hooks/exhaustive-deps

    const statMap = useMemo(() => {
        const map = {};
        filteredGroups.forEach(g => {
            const d = parseStatDate(g.date);
            if (!d) return;
            const mo = d.month, wk = statWeekNum(d.day);
            const purpose = classifyPurposeStat(g.row);
            if (!map[mo]) map[mo] = {};
            if (!map[mo][wk]) map[mo][wk] = {};
            if (!map[mo][wk][purpose]) map[mo][wk][purpose] = helpers.newEntry();
            const s = map[mo][wk][purpose];

            const insp = colVal(g.row, ['점검자', '담당자']);
            const inspNames = insp ? insp.split(/[,/·]+/).map(n => n.trim()).filter(n => n.length > 1) : [];
            s.inspectorCount += inspNames.length || 0;

            s.institutions.add(g.name);

            const violItems = g.items.filter(i => i.isViol);
            if (violItems.length > 0) {
                s.violInstitutions.add(g.name);
                violItems.forEach(item => {
                    const code = classifyViol(item.content);
                    s.violItems[code]++;
                    s.violItemInst[code].add(g.name);
                });
            }

            const adminStr = colVal(g.row, ['행정처분', '처분종류', '처분결과', '행정처분종류']);
            if (adminStr && adminStr !== '-') {
                adminStr.split(/[,\n·]+/).forEach(a => {
                    const t = classifyAdminActionType(a.trim());
                    if (t) {
                        s.adminTypes[t]++;
                        s.adminTypeInst[t].add(g.name);
                    }
                });
            }

            const fineStr = colVal(g.row, ['과태료', '과태료금액', '부과금액', '과태료부과금액']);
            if (fineStr && fineStr !== '-') {
                const raw = parseFloat((fineStr).replace(/[^0-9.]/g, ''));
                if (!isNaN(raw) && raw > 0) s.fine += raw;
            }
        });
        return map;
    }, [filteredGroups, helpers, classifyViol]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 월별 계층 구조로 데이터 빌드 ──
    const { monthData, usedViolItems, usedViolCats, catGroups, usedAdminTypes, anyInspector, anyFine, grandD } = useMemo(() => {
        const months = Object.keys(statMap).map(Number).sort((a, b) => a - b);
        const grand = helpers.newEntry();

        const monthData = months.map(mo => {
            const monthAcc = helpers.newEntry();
            const weeks = Object.keys(statMap[mo]).map(Number).sort((a, b) => a - b);

            const weekData = weeks.map(wk => {
                const weekAcc = helpers.newEntry();
                const activePurposes = STAT_PURPOSES.filter(p => statMap[mo][wk][p]);
                const purposeRows = activePurposes.map(p => {
                    const s = statMap[mo][wk][p];
                    helpers.merge(weekAcc, s);
                    return { purpose: p, d: helpers.toDisplay(s) };
                });
                helpers.merge(monthAcc, weekAcc);
                return { wk, purposes: purposeRows, weekTotal: purposeRows.length > 1 ? helpers.toDisplay(weekAcc) : null };
            });

            helpers.merge(grand, monthAcc);
            return { mo, monthTotal: helpers.toDisplay(monthAcc), weeks: weekData };
        });

        // 사용 중인 컬럼 계산
        const allD = [];
        monthData.forEach(m => {
            allD.push(m.monthTotal);
            m.weeks.forEach(w => { w.purposes.forEach(p => allD.push(p.d)); if (w.weekTotal) allD.push(w.weekTotal); });
        });
        const usedViolItems = violItemsCfg.filter(item => allD.some(d => d.violItems[item.code] > 0));
        const catGroups = violCatsOrderCfg
            .map(cat => ({ cat, items: usedViolItems.filter(i => i.cat === cat) }))
            .filter(g => g.items.length > 0);
        const usedViolCats = catGroups.map(g => g.cat);
        const usedAdminTypes = STAT_ADMIN_TYPES.filter(t => allD.some(d => d.adminTypes[t] > 0));
        const anyInspector = allD.some(d => d.inspector > 0);
        const anyFine = allD.some(d => d.fine > 0);

        return { monthData, usedViolItems, usedViolCats, catGroups, usedAdminTypes, anyInspector, anyFine, grandD: helpers.toDisplay(grand) };
    }, [statMap, helpers, violItemsCfg, violCatsOrderCfg]); // eslint-disable-line react-hooks/exhaustive-deps

    if (monthData.length === 0) return (
        <div style={{ marginTop: '24px', background: 'var(--bg-card)', borderRadius: '16px', padding: '24px 16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '10px' }}>{title}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({CURRENT_YEAR}년 등록된 데이터가 없습니다)</div>
        </div>
    );

    const toggleMonth = (mo) => setExpandedMonths(prev => {
        const next = new Set(prev); next.has(mo) ? next.delete(mo) : next.add(mo); return next;
    });
    const expandAll = () => setExpandedMonths(new Set(monthData.map(m => m.mo)));
    const collapseAll = () => setExpandedMonths(new Set());

    // ── CSV 다운로드 ──
    const downloadCSV = () => {
        const BOM = '\uFEFF';
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const dToArr = (d) => {
            const cols = [];
            if (anyInspector) cols.push(d.inspector || '');
            cols.push(d.institution || '', d.violation || '', d.violTotal || '');
            usedViolItems.forEach(item => cols.push(d.violItems[item.code] || ''));
            cols.push(d.adminTotal || '');
            usedAdminTypes.forEach(t => cols.push(d.adminTypes[t] || ''));
            if (anyFine) cols.push(d.fine || '');
            return cols;
        };
        const header = ['월', '주차', '점검유형'];
        if (anyInspector) header.push('지도점검 인원(명)');
        header.push('점검 학원수', '적발 학원수', '적발건수 계');
        usedViolItems.forEach(item => header.push(item.label));
        header.push('행정처분 계');
        usedAdminTypes.forEach(t => header.push(t));
        if (anyFine) header.push('과태료 금액(천원)');

        const lines = [header.map(esc).join(',')];
        monthData.forEach(mData => {
            lines.push([esc(`${mData.mo}월`), esc('소계'), esc('합계'), ...dToArr(mData.monthTotal).map(esc)].join(','));
            mData.weeks.forEach(wData => {
                wData.purposes.forEach(p => {
                    lines.push([esc(`${mData.mo}월`), esc(`${wData.wk}주`), esc(p.purpose), ...dToArr(p.d).map(esc)].join(','));
                });
                if (wData.weekTotal) lines.push([esc(''), esc(`${wData.wk}주 소계`), esc(''), ...dToArr(wData.weekTotal).map(esc)].join(','));
            });
        });
        lines.push([esc('합계'), esc(''), esc(''), ...dToArr(grandD).map(esc)].join(','));

        const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `지도점검_통계_${CURRENT_YEAR}.csv`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    // ── 스타일 상수 ──
    const HEADER_H = 30; // 헤더 행 높이(px) - sticky top 계산용
    const W_MO = 40, W_WK = 40, W_TYPE = 80;

    const BASE_TH = { padding: '5px 7px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.68rem', fontWeight: '700', lineHeight: 1.4 };
    const BASE_TD = { padding: '4px 7px', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: '0.7rem', whiteSpace: 'nowrap' };
    const nv = (v) => (v > 0 ? v : '');

    // sticky 헤더 (top 위치는 행 번호 × 행높이)
    const sTH = (row, extra = {}) => ({ ...BASE_TH, position: 'sticky', top: row * HEADER_H, zIndex: 12, ...extra });
    // sticky 왼쪽 열 (데이터 행용)
    const sTD_L = (left, extra = {}) => ({ ...BASE_TD, position: 'sticky', left, zIndex: 4, background: 'inherit', ...extra });
    // sticky 헤더 + 왼쪽 모서리 (헤더의 고정 열)
    const sTH_L = (row, left, extra = {}) => ({ ...sTH(row, extra), left, zIndex: 20 });

    const CAT_BG = { '시설': '#fef9f9', '교습비등': '#fff7f0', '강사등': '#f0fdf4', '운영': '#f5f3ff', '기타': '#f8fafc' };
    const CAT_COLOR = { '시설': '#b91c1c', '교습비등': '#c2410c', '강사등': '#15803d', '운영': '#6d28d9', '기타': '#475569' };
    const PURPOSE_STYLE = {
        '국민신문고': { background: '#fff7ed', color: '#c2410c' },
        '불법사교육': { background: '#fdf4ff', color: '#7c3aed' },
        '특별점검':  { background: '#fef2f2', color: '#b91c1c' },
        '지도점검':  { background: '#eef2ff', color: '#3730a3' },
    };

    const headerRows = showDetail ? 3 : 2;
    const violColCount = showDetail ? usedViolItems.length : usedViolCats.length;

    const clickable = (v, title, names, color) => v > 0
        ? <span style={{ cursor: 'pointer', color: color || 'inherit', fontWeight: 'inherit', textDecoration: 'underline dotted', textUnderlineOffset: '2px' }} onClick={e => showPopup(e, title, names)}>{v}</span>
        : '';

    // 위반 데이터 셀 (요약/상세 모드)
    const violCells = (d, key) => showDetail
        ? usedViolItems.map(item => <td key={`${key}-vi-${item.code}`} style={BASE_TD}>{clickable(d.violItems[item.code], item.label, d.violItemInst?.[item.code] || [], '#dc2626')}</td>)
        : usedViolCats.map(cat => <td key={`${key}-vc-${cat}`} style={BASE_TD}>{clickable(d.violCats[cat], cat + ' 위반', d.violCatInst?.[cat] || [], CAT_COLOR[cat])}</td>);

    const dataCells = (d, key) => [
        anyInspector ? <td key={`${key}-i`} style={BASE_TD}>{nv(d.inspector)}</td> : null,
        <td key={`${key}-s`} style={BASE_TD}>{clickable(d.institution, '점검 학원·교습소', d.instList || [], '#1d4ed8')}</td>,
        <td key={`${key}-v`} style={{ ...BASE_TD, color: d.violation > 0 ? '#dc2626' : undefined }}>{clickable(d.violation, '적발 학원·교습소', d.violInstList || [], '#dc2626')}</td>,
        <td key={`${key}-vt`} style={{ ...BASE_TD, fontWeight: '700', color: d.violTotal > 0 ? '#dc2626' : undefined }}>{clickable(d.violTotal, '적발 학원·교습소 (전체)', d.violInstList || [], '#dc2626')}</td>,
        ...violCells(d, key),
        <td key={`${key}-at`} style={{ ...BASE_TD, fontWeight: '700', color: d.adminTotal > 0 ? '#1d4ed8' : undefined }}>{clickable(d.adminTotal, '행정처분 전체', d.violInstList || [], '#1d4ed8')}</td>,
        ...usedAdminTypes.map(t => <td key={`${key}-ad-${t}`} style={BASE_TD}>{clickable(d.adminTypes[t], t, d.adminTypeInst?.[t] || [], '#1d4ed8')}</td>),
        anyFine ? <td key={`${key}-f`} style={BASE_TD}>{nv(d.fine)}</td> : null,
    ].filter(Boolean);

    // 버튼 공통 스타일
    const btnBase = { padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.72rem', cursor: 'pointer', fontWeight: '600', transition: 'all 0.15s' };
    const btnActive = { ...btnBase, background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' };
    const btnGhost = { ...btnBase, background: '#f8fafc', color: '#64748b' };

    return (
        <div style={{ marginTop: '24px', background: 'var(--bg-card)', borderRadius: '16px', padding: '18px 16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>

            {/* ── 카드 헤더 ── */}
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-main)' }}>{title}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '400' }}>{subtitle}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* 요약/상세 토글 */}
                    <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '7px', overflow: 'hidden' }}>
                        <button style={!showDetail ? btnActive : { ...btnGhost, borderRadius: 0, border: 'none' }} onClick={() => setShowDetail(false)}>요약</button>
                        <button style={showDetail  ? btnActive : { ...btnGhost, borderRadius: 0, border: 'none', borderLeft: '1px solid #cbd5e1' }} onClick={() => setShowDetail(true)}>상세코드</button>
                    </div>
                    {/* 펼치기/접기 */}
                    <button style={btnGhost} onClick={expandAll}>▼ 전체 펼치기</button>
                    <button style={btnGhost} onClick={collapseAll}>▶ 전체 접기</button>
                    {/* CSV 다운로드 */}
                    <button style={{ ...btnGhost, color: '#15803d', borderColor: '#86efac' }} onClick={downloadCSV}>⬇ CSV 다운로드</button>
                </div>
            </div>

            {/* ── 테이블 (가로+세로 스크롤, 헤더/열 고정) ── */}
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '72vh', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                    <thead>
                        {/* 행1: 최상위 헤더 */}
                        <tr style={{ background: '#dde4ef' }}>
                            <th style={sTH_L(0, 0,              { background: '#dde4ef', minWidth: `${W_MO}px` })}>월</th>
                            <th style={sTH_L(0, W_MO,           { background: '#dde4ef', minWidth: `${W_WK}px` })}>주차</th>
                            <th style={sTH_L(0, W_MO + W_WK,    { background: '#dde4ef', minWidth: `${W_TYPE}px` })}>점검유형</th>
                            {anyInspector && <th rowSpan={headerRows} style={sTH(0, { background: '#dde4ef', minWidth: '52px', whiteSpace: 'normal' })}>지도점검<br/>인원(명)</th>}
                            <th rowSpan={headerRows} style={sTH(0, { background: '#dde4ef', minWidth: '50px', whiteSpace: 'normal' })}>점검<br/>학원수</th>
                            <th rowSpan={headerRows} style={sTH(0, { background: '#dde4ef', minWidth: '50px', whiteSpace: 'normal' })}>적발<br/>학원수</th>
                            <th colSpan={1 + violColCount} style={sTH(0, { background: '#fef2f2', color: '#dc2626' })}>적발건수</th>
                            <th colSpan={1 + usedAdminTypes.length} style={sTH(0, { background: '#dbeafe', color: '#1d4ed8' })}>행정처분 현황(건수)</th>
                            {anyFine && <th rowSpan={headerRows} style={sTH(0, { background: '#dde4ef', minWidth: '60px', whiteSpace: 'normal' })}>과태료<br/>금액(천원)</th>}
                        </tr>

                        {/* 행2: 카테고리/요약열 헤더 */}
                        <tr style={{ background: '#f8fafc' }}>
                            {/* 월/주차/유형 sticky 헤더 2행 */}
                            <th style={sTH_L(1, 0,           { background: '#dde4ef', minWidth: `${W_MO}px` })}></th>
                            <th style={sTH_L(1, W_MO,        { background: '#dde4ef', minWidth: `${W_WK}px` })}></th>
                            <th style={sTH_L(1, W_MO + W_WK,{ background: '#dde4ef', minWidth: `${W_TYPE}px` })}></th>

                            <th rowSpan={showDetail ? 2 : 1} style={sTH(1, { background: '#fef2f2', minWidth: '34px' })}>계</th>
                            {showDetail
                                ? catGroups.map(g => (
                                    <th key={g.cat} colSpan={g.items.length} style={sTH(1, { background: CAT_BG[g.cat] || '#f8fafc', color: CAT_COLOR[g.cat] || '#475569', fontSize: '0.65rem' })}>{g.cat}</th>
                                ))
                                : usedViolCats.map(cat => (
                                    <th key={cat} style={sTH(1, { background: CAT_BG[cat] || '#f8fafc', color: CAT_COLOR[cat] || '#475569', fontSize: '0.65rem', minWidth: '48px' })}>{cat}</th>
                                ))
                            }
                            <th rowSpan={showDetail ? 2 : 1} style={sTH(1, { background: '#eff6ff', minWidth: '34px' })}>계</th>
                            {usedAdminTypes.map(t => (
                                <th key={t} rowSpan={showDetail ? 2 : 1} style={sTH(1, { background: '#f0f6ff', color: '#374151', fontSize: '0.62rem', minWidth: '54px', whiteSpace: 'normal' })}>{t}</th>
                            ))}
                        </tr>

                        {/* 행3: 세부 코드 헤더 (상세 모드만) */}
                        {showDetail && (
                            <tr style={{ background: '#fafafa' }}>
                                {/* 3행에도 sticky 고정열 placeholder */}
                                <th style={sTH_L(2, 0,           { background: '#dde4ef', minWidth: `${W_MO}px` })}></th>
                                <th style={sTH_L(2, W_MO,        { background: '#dde4ef', minWidth: `${W_WK}px` })}></th>
                                <th style={sTH_L(2, W_MO + W_WK,{ background: '#dde4ef', minWidth: `${W_TYPE}px` })}></th>

                                {usedViolItems.map(item => (
                                    <th key={item.code} style={sTH(2, { background: CAT_BG[item.cat] || '#f8fafc', color: CAT_COLOR[item.cat] || '#475569', fontSize: '0.62rem', minWidth: '64px', whiteSpace: 'normal', fontWeight: '600' })}>{item.label}</th>
                                ))}
                            </tr>
                        )}
                    </thead>

                    <tbody>
                        {monthData.map(mData => {
                            const isExpanded = expandedMonths.has(mData.mo);
                            return (
                                <React.Fragment key={mData.mo}>
                                    {/* ── 월 소계 행 (항상 표시, 클릭으로 펼치기) ── */}
                                    <tr style={{ background: '#eef2ff', borderTop: '2px solid #c7d2fe', cursor: 'pointer' }}
                                        onClick={() => toggleMonth(mData.mo)}>
                                        <td style={sTD_L(0, { background: '#dde4ef', fontWeight: '800', color: '#1e3a8a', textAlign: 'center', minWidth: `${W_MO}px` })}>
                                            {mData.mo}월
                                        </td>
                                        <td style={sTD_L(W_MO, { background: '#dde4ef', textAlign: 'center', fontSize: '1rem', minWidth: `${W_WK}px` })}>
                                            {isExpanded ? '▼' : '▶'}
                                        </td>
                                        <td style={sTD_L(W_MO + W_WK, { background: '#eef2ff', fontWeight: '700', color: '#3730a3', textAlign: 'center', fontSize: '0.68rem', minWidth: `${W_TYPE}px` })}>
                                            월 소계
                                        </td>
                                        {dataCells(mData.monthTotal, `m${mData.mo}`)}
                                    </tr>

                                    {/* ── 펼쳐진 경우: 주차 + 점검유형 행 ── */}
                                    {isExpanded && mData.weeks.map(wData => (
                                        <React.Fragment key={`${mData.mo}-${wData.wk}`}>
                                            {wData.purposes.map(p => {
                                                const ps = PURPOSE_STYLE[p.purpose] || { background: '#f8fafc', color: '#64748b' };
                                                return (
                                                    <tr key={p.purpose} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={sTD_L(0, { background: '#f8fafc', minWidth: `${W_MO}px` })}></td>
                                                        <td style={sTD_L(W_MO, { background: '#f8fafc', color: '#94a3b8', fontSize: '0.67rem', minWidth: `${W_WK}px` })}>{wData.wk}주</td>
                                                        <td style={sTD_L(W_MO + W_WK, { ...ps, fontWeight: '700', fontSize: '0.68rem', minWidth: `${W_TYPE}px` })}>{p.purpose}</td>
                                                        {dataCells(p.d, `${mData.mo}-${wData.wk}-${p.purpose}`)}
                                                    </tr>
                                                );
                                            })}
                                            {/* 주차 소계 (2개 이상 유형이 있을 때) */}
                                            {wData.weekTotal && (
                                                <tr style={{ background: '#f1f5f9', borderTop: '1px dashed #cbd5e1' }}>
                                                    <td style={sTD_L(0, { background: '#f1f5f9', minWidth: `${W_MO}px` })}></td>
                                                    <td style={sTD_L(W_MO, { background: '#f1f5f9', color: '#475569', fontSize: '0.67rem', fontWeight: '600', minWidth: `${W_WK}px` })}>{wData.wk}주</td>
                                                    <td style={sTD_L(W_MO + W_WK, { background: '#f1f5f9', color: '#475569', fontWeight: '600', fontSize: '0.67rem', minWidth: `${W_TYPE}px` })}>소계</td>
                                                    {dataCells(wData.weekTotal, `wt-${mData.mo}-${wData.wk}`)}
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            );
                        })}

                        {/* ── 합계 행 ── */}
                        <tr style={{ background: '#dde4ef', borderTop: '2px solid #94a3b8' }}>
                            <td style={sTD_L(0, { background: '#c7d2e8', fontWeight: '800', textAlign: 'center', minWidth: `${W_MO}px` })}></td>
                            <td style={sTD_L(W_MO, { background: '#c7d2e8', minWidth: `${W_WK}px` })}></td>
                            <td style={sTD_L(W_MO + W_WK, { background: '#c7d2e8', fontWeight: '800', textAlign: 'center', minWidth: `${W_TYPE}px` })}>합 계</td>
                            {dataCells(grandD, 'grand')}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ── 기관명 팝업 ── */}
            {popup && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 999 }} onClick={() => setPopup(null)}>
                    <div
                        style={{ position: 'fixed', left: popup.x, top: popup.y, background: 'var(--bg-card)', borderRadius: '10px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)', padding: '12px 14px', minWidth: '190px', maxWidth: '280px', maxHeight: '60vh', overflow: 'auto', zIndex: 1000, border: '1px solid var(--border-color)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontWeight: '800', fontSize: '0.78rem', color: 'var(--text-main)' }}>{popup.title}</span>
                            <button onClick={() => setPopup(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1, padding: '0 2px' }}>✕</button>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{popup.names.length}개 기관</div>
                        {popup.names.length === 0
                            ? <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>목록 없음</div>
                            : popup.names.map((n, i) => (
                                <div key={i} style={{ padding: '4px 0', borderBottom: i < popup.names.length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '0.74rem', color: 'var(--text-main)' }}>{n}</div>
                            ))
                        }
                    </div>
                </div>
            )}
        </div>
    );
}

// ── 래퍼: 학원·교습소 통계 카드 ──
function InspectionStatsTableCard({ pastGroupedRows }) {
    return (
        <StatsTableCard
            title="📊 학원 행정처분 및 적발 현황"
            subtitle={`(${CURRENT_YEAR}년 1월~12월 / 학원·교습소 합계)`}
            pastGroupedRows={pastGroupedRows}
            typeFilter={(row) => {
                const t = colVal(row, ['구분', '유형', '대상']);
                return !t.includes('개인과외') && !t.includes('과외교습자');
            }}
            violItemsCfg={STAT_VIOL_ITEMS}
            violCatsOrderCfg={STAT_VIOL_CATS_ORDER}
            classifyViol={classifyViolCode}
        />
    );
}

// ── 래퍼: 개인과외교습자 통계 카드 ──
function PrivateTutorStatsTableCard({ pastGroupedRows }) {
    return (
        <StatsTableCard
            title="📊 개인과외교습자 행정처분 및 적발 현황"
            subtitle={`(${CURRENT_YEAR}년 1월~12월)`}
            pastGroupedRows={pastGroupedRows}
            typeFilter={(row) => {
                const t = colVal(row, ['구분', '유형', '대상']);
                return t.includes('개인과외') || t.includes('과외교습자');
            }}
            violItemsCfg={STAT_PT_VIOL_ITEMS}
            violCatsOrderCfg={STAT_PT_VIOL_CATS_ORDER}
            classifyViol={classifyPtViolCode}
        />
    );
}

function TabRecent({ region, academies, onSelectAcademy, initialPage = 0, initialScrollY = null, onPageChange }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRow, setSelectedRow] = useState(null);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [page, setPage] = useState(initialPage);
    const [showMonthlyDrop, setShowMonthlyDrop] = useState(false);
    const PAGE_SIZE = 30;
    const scrollRestoredRef = useRef(false);
    const isFirstFetchRef = useRef(true); // 첫 마운트와 region 변경 구분
    const TODAY_DATE = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
    const parseInspDate = (dateStr) => {
        const m = (dateStr || '').trim().match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
        if (!m) return null;
        return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    };

    // 페이지 변경 시 부모 ref 동기 업데이트 (useEffect는 비동기라 클릭 직전에 반영 안 될 수 있음)
    useEffect(() => { onPageChange?.(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

    // 데이터 로드 완료 후 스크롤 복원 (한 번만)
    useEffect(() => {
        if (!loading && initialScrollY != null && !scrollRestoredRef.current) {
            scrollRestoredRef.current = true;
            window.scrollTo({ top: initialScrollY, behavior: 'instant' });
        }
    }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setLoading(true);
        // 첫 마운트: initialPage 유지 / region 변경: 0으로 리셋
        if (isFirstFetchRef.current) {
            isFirstFetchRef.current = false;
        } else {
            setPage(0);
        }
        fetchRecentRawRows()
            .then(({ bodyRows }) => {
                setRows(bodyRows); // 원본 전체 유지 (그룹핑은 useMemo에서)
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [region]);

    // 점검 학원 수 (오늘 이전 점검만, 중복 없는 학원명 기준)
    const uniqueAcademyCount = useMemo(() =>
        new Set(
            rows
                .filter(r => {
                    const d = parseInspDate(colVal(r, ['점검일', '점검일자', '지도점검일']));
                    return d && d <= TODAY_DATE;
                })
                .map(r => colVal(r, ['학원(교습소)명', '학원명', '명칭', '기관명']))
                .filter(Boolean)
        ).size
    , [rows]); // eslint-disable-line react-hooks/exhaustive-deps

    // 전체 점검 대상: 학교교과교습학원 + 활성 교습소 (academies prop 기반, 동적)
    const { totalInspTarget, inspSubjectCount, inspHagwonCount } = useMemo(() => {
        const city = region.endsWith('시') ? region : region + '시';
        const ac = (academies || []).filter(a => (a.address || '').includes(city));
        const subjectCount = ac.filter(a => a.category === '학교교과교습학원').length;
        const hagwonCount  = ac.filter(a => a.category === '교습소' && !INSP_H_CLOSED.some(s => (a.status || '').includes(s))).length;
        return { totalInspTarget: subjectCount + hagwonCount, inspSubjectCount: subjectCount, inspHagwonCount: hagwonCount };
    }, [academies, region]);

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
        // 점검일 내림차순 정렬 (최신순), 날짜 없는 것은 맨 뒤
        groups.sort((a, b) => {
            const da = parseInspDate(a.date);
            const db = parseInspDate(b.date);
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return db - da;
        });
        return groups;
    }, [rows]);


    // 오늘 이전(포함) 완료된 점검만 (통계 표시용)
    const pastGroupedRows = useMemo(() =>
        groupedRows.filter(g => { const d = parseInspDate(g.date); return d && d <= TODAY_DATE; })
    , [groupedRows]); // eslint-disable-line react-hooks/exhaustive-deps

    // 점검목적별 집계 (오늘까지 완료된 점검 기준)
    const purposeMap = useMemo(() => {
        const map = {};
        pastGroupedRows.forEach(g => {
            const p = classifyPurpose(g.row);
            map[p] = (map[p] || 0) + 1;
        });
        return map;
    }, [pastGroupedRows]);

    const inspRate = totalInspTarget > 0 ? Math.round(uniqueAcademyCount / totalInspTarget * 100) : 0;
    const targetAcademyCount = Math.round(totalInspTarget * 0.49); // 49% 목표수치
    const targetRate = targetAcademyCount > 0 ? Math.round(uniqueAcademyCount / targetAcademyCount * 100) : 0;

    // ── 월별 1차, 2차 통계 계산 (오늘까지 완료된 점검 기준) ──
    const monthlyStats = useMemo(() => {
        const stats = {};
        pastGroupedRows.forEach(g => {
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
    }, [pastGroupedRows]);

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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>총 점검</span>
                                <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#6366f1' }}>{pastGroupedRows.length}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>건</span>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '6px' }}>기준일: {TODAY_DATE.getFullYear()}.{String(TODAY_DATE.getMonth()+1).padStart(2,'0')}.{String(TODAY_DATE.getDate()).padStart(2,'0')}.</span>
                            </div>
                            {totalInspTarget > 0 && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.67rem', color: '#3b82f6', fontWeight: '700' }}>교과학원 {inspSubjectCount}</span>
                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>+</span>
                                    <span style={{ fontSize: '0.67rem', color: '#10b981', fontWeight: '700' }}>교습소 {inspHagwonCount}</span>
                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>=</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-main)', fontWeight: '800' }}>{totalInspTarget}개</span>
                                    <span style={{ fontSize: '0.63rem', color: '#94a3b8' }}>대상</span>
                                </div>
                            )}
                        </div>
                        <div style={{ width: '1px', height: '44px', background: 'var(--border-color)' }} />
                        <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* 전체 점검률 */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                                        전체 점검률
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
                                        목표 점검률 <span style={{ fontSize: '0.7rem' }}>(목표 {targetAcademyCount}개, 49% 기준)</span>
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
                                    <span>🎯 목표: 전체의 49%({targetAcademyCount}개소) 점검</span>
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
            ) : pastGroupedRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>📭 점검 데이터가 없습니다</div>
            ) : (
                <>
                    {/* 가로 스크롤 래퍼 */}
                    <div style={{ borderRadius: '16px', border: '1px solid var(--border-color)', overflowX: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                        <table style={{ width: '100%', minWidth: '580px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%)', borderBottom: '2px solid var(--border-color)' }}>
                                    <th style={{ padding: '9px 8px', width: '28px', color: '#64748b', fontWeight: '700', fontSize: '0.72rem', whiteSpace: 'nowrap', textAlign: 'center', background: 'transparent', position: 'sticky', left: 0, zIndex: 2, backgroundImage: 'linear-gradient(180deg,#f8fafc,#f1f5f9)' }}>#</th>
                                    <th style={{
                                        padding: '9px 10px', width: '90px', color: '#64748b', fontWeight: '700', fontSize: '0.72rem',
                                        whiteSpace: 'nowrap',
                                        backgroundImage: 'linear-gradient(180deg,#f8fafc,#f1f5f9)'
                                    }}>점검일</th>
                                    <th style={{
                                        padding: '9px 10px', width: '120px', color: '#64748b', fontWeight: '700', fontSize: '0.72rem',
                                        whiteSpace: 'nowrap', position: 'sticky', left: '28px', zIndex: 2,
                                        boxShadow: '2px 0 6px rgba(0,0,0,0.07)',
                                        backgroundImage: 'linear-gradient(180deg,#f8fafc,#f1f5f9)'
                                    }}>학원명</th>
                                    <th style={{ padding: '9px 12px', color: '#64748b', fontWeight: '700', fontSize: '0.72rem', whiteSpace: 'nowrap', background: 'transparent' }}>지도·위반 내용</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedRows.map((g, i) => {
                                    const bgTone = academyBgMap.get(g.name) === 0 ? '#ffffff' : '#f8faff';
                                    const isFuture = (() => { const d = parseInspDate(g.date); return d ? d > TODAY_DATE : false; })();
                                    const rowBg = isFuture ? '#f8f9fa' : (g.hasViol ? '#fff5f5' : bgTone);
                                    const globalIdx = page * PAGE_SIZE + i;
                                    // 연번: 가장 오래된 항목이 1번 (내림차순 표시이므로 역산)
                                    const rowNum = groupedRows.length - globalIdx;
                                    // 날짜 포맷: "2026. 1. 7" → "2026.3.20.(금)"
                                    const dateFmt = (() => {
                                        const d = (g.date || '').trim();
                                        const m = d.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
                                        if (!m) return d;
                                        const dt = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
                                        const dayChar = '일월화수목금토'[dt.getDay()];
                                        return `${m[1]}.${parseInt(m[2])}.${parseInt(m[3])}.(${dayChar})`;
                                    })();

                                    return (
                                        <tr
                                            key={i}
                                            onClick={isFuture ? undefined : () => { setSelectedRow(g.row); setSelectedIndex(globalIdx); }}
                                            style={{ borderBottom: `1px solid ${g.hasViol && !isFuture ? '#fce4e4' : 'var(--border-color)'}`, background: rowBg, cursor: isFuture ? 'default' : 'pointer', transition: 'all 0.12s', opacity: isFuture ? 0.55 : 1 }}
                                            onMouseEnter={isFuture ? undefined : (e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.boxShadow = 'inset 0 0 0 1px #c7d2fe'; })}
                                            onMouseLeave={isFuture ? undefined : (e => { e.currentTarget.style.background = rowBg; e.currentTarget.style.boxShadow = 'none'; })}
                                        >
                                            {/* 연번 */}
                                            <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', verticalAlign: 'middle', position: 'sticky', left: 0, zIndex: 1, background: rowBg }}>{rowNum}</td>
                                            {/* 점검일 */}
                                            <td style={{
                                                padding: '8px 10px',
                                                background: rowBg,
                                                width: '90px', minWidth: '90px',
                                                verticalAlign: 'middle',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                <div style={{ fontSize: '0.72rem', color: isFuture ? '#94a3b8' : '#64748b', fontWeight: '600', letterSpacing: '0.01em' }}>
                                                    {dateFmt}
                                                </div>
                                                {isFuture && <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '2px' }}>예정</div>}
                                            </td>
                                            {/* 학원명 sticky */}
                                            <td style={{
                                                padding: '8px 10px',
                                                position: 'sticky', left: '28px', zIndex: 1,
                                                background: rowBg,
                                                boxShadow: '2px 0 6px rgba(0,0,0,0.06)',
                                                width: '120px', minWidth: '120px',
                                                verticalAlign: 'middle',
                                            }}>
                                                {(() => {
                                                    const nameStyle = {
                                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden', wordBreak: 'break-all',
                                                        fontSize: '0.82rem', fontWeight: '800',
                                                        color: isFuture ? '#94a3b8' : 'var(--text-main)'
                                                    };
                                                    if (!academies || !onSelectAcademy || isFuture) {
                                                        return <span style={nameStyle} title={g.name}>{g.name || '-'}</span>;
                                                    }
                                                    const normTarget = (g.name || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
                                                    const matched = academies.find(a => a.name.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase() === normTarget);
                                                    return matched ? (
                                                        <span
                                                            onClick={e => { e.stopPropagation(); onPageChange?.(page); onSelectAcademy(matched); }}
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
                                                            <span style={{
                                                                color: item.isViol ? '#991b1b' : '#374151',
                                                                fontWeight: item.isViol ? '600' : '400',
                                                                display: '-webkit-box',
                                                                WebkitLineClamp: 2,
                                                                WebkitBoxOrient: 'vertical',
                                                                overflow: 'hidden',
                                                            }}>
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
                            <button onClick={() => { setPage(0); onPageChange?.(0); }} disabled={page === 0}
                                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: page === 0 ? '#cbd5e1' : 'var(--text-main)', cursor: page === 0 ? 'default' : 'pointer', fontSize: '0.8rem' }}>«</button>
                            <button onClick={() => { const np = Math.max(0, page - 1); setPage(np); onPageChange?.(np); }} disabled={page === 0}
                                style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: page === 0 ? '#cbd5e1' : 'var(--text-main)', cursor: page === 0 ? 'default' : 'pointer', fontSize: '0.8rem' }}>‹ 이전</button>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0 4px' }}>
                                {page + 1} / {totalPages}
                                <span style={{ fontSize: '0.75rem', marginLeft: '4px' }}>(총 {groupedRows.length}건)</span>
                            </span>
                            <button onClick={() => { const np = Math.min(totalPages - 1, page + 1); setPage(np); onPageChange?.(np); }} disabled={page >= totalPages - 1}
                                style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: page >= totalPages - 1 ? '#cbd5e1' : 'var(--text-main)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: '0.8rem' }}>다음 ›</button>
                            <button onClick={() => { const np = totalPages - 1; setPage(np); onPageChange?.(np); }} disabled={page >= totalPages - 1}
                                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: page >= totalPages - 1 ? '#cbd5e1' : 'var(--text-main)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: '0.8rem' }}>»</button>
                        </div>
                    )}
                </>
            )}

            {/* ── 통계 카드 ── */}
            {!loading && <InspectionStatsTableCard pastGroupedRows={pastGroupedRows} />}
            {!loading && <PrivateTutorStatsTableCard pastGroupedRows={pastGroupedRows} />}

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

function TabStats({ region, statRows, academies, privateTutors, academyClosures, addrDongCacheVer }) {
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

    // 동 화이트리스트 — 모듈 상수(HANAM_DONG_SET/GWANGJU_DONG_SET)와 동일하게 유지
    const DONG_WL = useMemo(() => region === '하남' ? HANAM_DONG_SET : GWANGJU_DONG_SET, [region]);

    // academies prop 기반으로 기관 분류 (지도 데이터와 동일)
    const filtered = useMemo(() => (academies || []).filter(a => (a.address || '').includes(city)), [academies, city]);
    const aList = useMemo(() => filtered.filter(a => a.category !== '교습소'), [filtered]);
    const hList = useMemo(() => filtered.filter(a => a.category === '교습소'), [filtered]);
    // 요약 카드용: 개원/개소 상태만 포함
    const H_CLOSED = ['자진폐원', '직권폐원', '자진폐소', '직권폐소'];
    const hActiveList = useMemo(() => hList.filter(h => !H_CLOSED.some(s => (h.status || '').includes(s))), [hList]);
    const aActiveList = useMemo(() => aList.filter(a => (a.status || '').includes('개원')), [aList]);
    // 과외는 별도 privateTutors 배열에서 지역 필터링 + 신고상태 "신고"인 것만
    const pList = useMemo(() => (privateTutors || []).filter(a => (a.address || '').includes(city) && (a.status || '').includes('신고')), [privateTutors, city]);
    // 증감 계산용: 지역 내 전체 과외 (상태 무관)
    const pAllList = useMemo(() => (privateTutors || []).filter(a => (a.address || '').includes(city)), [privateTutors, city]);

    // academyClosures 중 해당 시 + aList 중복 제거
    const cityClosures = useMemo(() => {
        const aListIds = new Set(aList.map(a => a.id).filter(Boolean));
        return (academyClosures || [])
            .filter(a => (a.address || '').includes(city))
            .filter(a => !a.regNum || !aListIds.has(a.regNum));
    }, [academyClosures, aList, city]);

    // 증감 드릴다운 state
    const [yearDrill, setYearDrill] = useState(null); // { year, kind: 'academy'|'hagwon'|'priv' }

    const yearDrillData = useMemo(() => {
        if (!yearDrill) return null;
        const { year, kind } = yearDrill;
        const getY = d => { const m = (d || '').match(/(\d{4})/); return m ? m[1] : ''; };
        const CLOSED_STATUSES = ['자진폐원', '직권폐원', '자진폐소', '직권폐소'];
        if (kind === 'academy') {
            const opened = [
                ...aList.filter(a => getY(a.regDate) === year),
                ...cityClosures.filter(a => getY(a.regDate) === year),
            ].map(a => a.name || '-');
            const closed = cityClosures.filter(a => getY(a.closeDate) === year).map(a => a.name || '-');
            return { opened, closed };
        }
        if (kind === 'hagwon') {
            const opened = hList.filter(a => getY(a.regDate) === year).map(a => a.name || '-');
            const closed = hList
                .filter(h => CLOSED_STATUSES.some(s => (h.status || '').includes(s)) && getY(h.statusDate) === year)
                .map(h => h.name || '-');
            return { opened, closed };
        }
        if (kind === 'priv') {
            const P_CLOSE = ['자진반납', '직권폐지'];
            const opened = pAllList.filter(a => getY(a.reportDate) === year).map(a => a.name || '-');
            const closed = pAllList.filter(a => P_CLOSE.some(s => (a.status || '').includes(s)) && getY(a.changeDate) === year).map(a => a.name || '-');
            return { opened, closed };
        }
        return null;
    }, [yearDrill, aList, hList, pAllList, cityClosures]);

    // 섹션 2: 연도별 등록 추이 — regDate 기반 + 폐원/폐소 차감
    const YEARS = useMemo(() => {
        const cur = parseInt(CURRENT_YEAR);
        return Array.from({ length: 8 }, (_, i) => String(cur - 7 + i));
    }, []);

    const yearStats = useMemo(() => {
        const getY = d => { const m = (d || '').match(/(\d{4})/); return m ? m[1] : ''; };
        const addToMap = (map, year) => { if (year) map[year] = (map[year] || 0) + 1; };

        const CLOSED_STATUSES = ['자진폐원', '직권폐원', '자진폐소', '직권폐소'];

        // ── 학원 ──
        const aNewByYear = {};
        aList.forEach(a => addToMap(aNewByYear, getY(a.regDate)));
        cityClosures.forEach(a => addToMap(aNewByYear, getY(a.regDate)));
        // 폐원 연도별 카운트: 별도 폐원 시트 + 메인 시트에 폐원 상태로 남아있는 학원의 statusDate
        const aCloseByYear = {};
        cityClosures.forEach(a => addToMap(aCloseByYear, getY(a.closeDate)));
        aList
            .filter(a => CLOSED_STATUSES.some(s => (a.status || '').includes(s)))
            .forEach(a => addToMap(aCloseByYear, getY(a.statusDate)));

        // 학교교과교습학원 (점검률 분모용): 같은 방식
        const aSchoolNewByYear = {};
        aList.filter(a => a.category === '학교교과교습학원').forEach(a => addToMap(aSchoolNewByYear, getY(a.regDate)));
        cityClosures.filter(a => a.category === '학교교과교습학원').forEach(a => addToMap(aSchoolNewByYear, getY(a.regDate)));
        const aSchoolCloseByYear = {};
        cityClosures.filter(a => a.category === '학교교과교습학원').forEach(a => addToMap(aSchoolCloseByYear, getY(a.closeDate)));
        aList
            .filter(a => a.category === '학교교과교습학원' && CLOSED_STATUSES.some(s => (a.status || '').includes(s)))
            .forEach(a => addToMap(aSchoolCloseByYear, getY(a.statusDate)));

        // ── 교습소 ──
        // hList에는 현재 활성 + 폐소된 교습소가 모두 포함됨
        const hNewByYear = {};
        hList.forEach(a => addToMap(hNewByYear, getY(a.regDate)));
        const hCloseByYear = {};
        hList
            .filter(h => CLOSED_STATUSES.some(s => (h.status || '').includes(s)))
            .forEach(h => addToMap(hCloseByYear, getY(h.statusDate)));

        // ── 과외: 신규=reportDate 기준 전체 집계, 반납=changeDate 기준 차감
        const P_CLOSE_ST = ['자진반납', '직권폐지'];
        const pNewByYear = {};
        pAllList.forEach(a => addToMap(pNewByYear, getY(a.reportDate)));
        const pCloseByYear = {};
        pAllList
            .filter(a => P_CLOSE_ST.some(s => (a.status || '').includes(s)))
            .forEach(a => addToMap(pCloseByYear, getY(a.changeDate)));
        const pCurrentActive = pAllList.filter(a => (a.status || '').includes('신고')).length;

        // 누적 순증(순감) 계산
        const netCumul = (newCnt, closeCnt, yNum) => {
            let total = 0;
            Object.entries(newCnt).forEach(([yr, c]) => { if (parseInt(yr) <= yNum) total += c; });
            Object.entries(closeCnt).forEach(([yr, c]) => { if (parseInt(yr) <= yNum) total -= c; });
            return total;
        };
        const cumul = (cnt, yNum) => Object.entries(cnt).filter(([yr]) => parseInt(yr) <= yNum).reduce((s, [, c]) => s + c, 0);

        return YEARS.map(y => {
            const yNum = parseInt(y);
            const aNew          = (aNewByYear[y] || 0) - (aCloseByYear[y] || 0);   // 증감
            const aActive       = netCumul(aNewByYear, aCloseByYear, yNum);
            const aSchoolActive = netCumul(aSchoolNewByYear, aSchoolCloseByYear, yNum);
            const hNew          = (hNewByYear[y] || 0) - (hCloseByYear[y] || 0);   // 증감
            const hActive       = netCumul(hNewByYear, hCloseByYear, yNum);
            // 과외 누적: 현재연도는 실제 활성 수, 과거는 netCumul
            const pActive = yNum >= parseInt(CURRENT_YEAR)
                ? pCurrentActive
                : netCumul(pNewByYear, pCloseByYear, yNum);
            // 과외 증감: 해당 연도 신규 - 반납/폐지 (드릴다운 건수와 일치)
            const pNew = (pNewByYear[y] || 0) - (pCloseByYear[y] || 0);
            return { year: y, aNew, aActive, aSchoolActive, hNew, hActive, pNew, pActive };
        });
    }, [YEARS, aList, hList, pAllList, cityClosures]);

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
        const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
        const parseInspDateMs = (str) => {
            const m = (str || '').trim().match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
            if (!m) return null;
            return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).getTime();
        };
        const allInsp = [
            ...statRows
                .filter(r => !isHanam || getYear(colVal(r, ['점검일자', '점검일', '지도점검일'])) !== CURRENT_YEAR)
                .map(r => ({ ...r, _fineUnit: 'won' })),
            ...(isHanam
                ? recentRows
                    .filter(r => {
                        // recentRows는 하남 전용 시트 → 주소 필터 불필요
                        const ms = parseInspDateMs(colVal(r, ['점검일자', '점검일', '지도점검일']));
                        return ms === null || ms <= todayMs; // 완료 탭과 동일: 오늘 이하만
                    })
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

    // 섹션 5: 동별 기관 분포 — 법정동 화이트리스트 적용 + 미분류 보완 + 소규모 동 기타 묶기
    const dongStats = useMemo(() => {
        const map = {};
        const getDong = addr => getDongFromAddr(addr, DONG_WL);
        const add = (list, key) => list.forEach(a => {
            const d = getDong(a.address || '');
            const dongKey = d || '미분류';
            if (!map[dongKey]) map[dongKey] = { academy: 0, hagwon: 0, priv: 0 };
            map[dongKey][key]++;
        });
        add(aList, 'academy');
        add(hActiveList, 'hagwon');
        add(pList, 'priv');
        const entries = Object.entries(map)
            .map(([dong, v]) => ({ dong, ...v, total: v.academy + v.hagwon + v.priv }));
        // 합계 ≤ 5인 동(미분류 제외)은 "기타"로 묶기
        const mainEntries = entries.filter(e => e.dong !== '미분류' && e.total > 5);
        const miscEntry = entries.find(e => e.dong === '미분류') || null;
        const smallEntries = entries.filter(e => e.dong !== '미분류' && e.total <= 5);
        const etcRow = smallEntries.length > 0 ? {
            dong: '기타',
            dongList: smallEntries.map(e => e.dong).sort(),
            academy: smallEntries.reduce((s, e) => s + e.academy, 0),
            hagwon: smallEntries.reduce((s, e) => s + e.hagwon, 0),
            priv: smallEntries.reduce((s, e) => s + e.priv, 0),
            total: smallEntries.reduce((s, e) => s + e.total, 0),
        } : null;
        const result = mainEntries.sort((a, b) => b.total - a.total);
        if (etcRow) result.push(etcRow);
        if (miscEntry) result.push(miscEntry);
        return result;
    }, [aList, hList, pList, DONG_WL, addrDongCacheVer]);

    // 학원 카테고리 분류
    const aSchoolCount = aActiveList.filter(a => a.category === '학교교과교습학원').length;
    const aLifeCount   = aActiveList.filter(a => a.category === '평생직업교육학원').length;
    const ahCombined   = aActiveList.length + hActiveList.length;

    if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>⏳ 데이터 로딩 중...</div>;

    const Th = ({ children, colSpan, rowSpan, style }) => (
        <th colSpan={colSpan} rowSpan={rowSpan} style={{ padding: '9px 12px', fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', background: 'var(--bg-main)', borderBottom: '2px solid var(--border-color)', textAlign: 'left', whiteSpace: 'nowrap', ...style }}>{children}</th>
    );
    const Td = ({ children, style, onClick }) => (
        <td onClick={onClick} style={{ padding: '8px 12px', fontSize: '0.84rem', borderBottom: '1px solid var(--border-color)', ...style }}>{children}</td>
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
                    <StatCard icon="🏫" label="학원"     value={aActiveList.length.toLocaleString() + '개'} color="#3b82f6" />
                    <StatCard icon="📖" label="교습소"   value={hActiveList.length.toLocaleString() + '개'} color="#10b981" />
                    <StatCard icon="👤" label="개인과외" value={pList.length.toLocaleString() + '명'} color="#8b5cf6" />
                    <StatCard icon="🏢" label="합계"     value={(aActiveList.length + hActiveList.length + pList.length).toLocaleString() + '개'} color="#f59e0b" />
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
                                <Th style={{ padding: '9px 12px 9px 3px' }}>증감</Th>
                                <Th style={{ padding: '9px 3px 9px 14px', borderLeft: '2px solid var(--border-color)' }}>누적</Th>
                                <Th style={{ padding: '9px 12px 9px 3px' }}>증감</Th>
                                <Th style={{ padding: '9px 3px 9px 14px', borderLeft: '2px solid var(--border-color)' }}>누적</Th>
                                <Th style={{ padding: '9px 12px 9px 3px' }}>증감</Th>
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
                                    <Td onClick={() => setYearDrill({ year: s.year, kind: 'academy' })} style={{ color: s.aNew > 0 ? '#3b82f6' : s.aNew < 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: '400', padding: '8px 12px 8px 3px', cursor: 'pointer', textDecoration: 'underline dotted' }}>{s.aNew > 0 ? '+' + s.aNew : s.aNew < 0 ? String(s.aNew) : '-'}</Td>
                                    <Td style={{ color: s.hActive > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: '700', padding: '8px 3px 8px 14px', borderLeft: '2px solid var(--border-color)' }}>{s.hActive > 0 ? s.hActive.toLocaleString() : '-'}</Td>
                                    <Td onClick={() => setYearDrill({ year: s.year, kind: 'hagwon' })} style={{ color: s.hNew > 0 ? '#10b981' : s.hNew < 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: '400', padding: '8px 12px 8px 3px', cursor: 'pointer', textDecoration: 'underline dotted' }}>{s.hNew > 0 ? '+' + s.hNew : s.hNew < 0 ? String(s.hNew) : '-'}</Td>
                                    <Td style={{ color: s.pActive > 0 ? '#8b5cf6' : 'var(--text-muted)', fontWeight: '700', padding: '8px 3px 8px 14px', borderLeft: '2px solid var(--border-color)' }}>{s.pActive > 0 ? s.pActive.toLocaleString() : '-'}</Td>
                                    <Td onClick={() => s.pNew !== 0 && setYearDrill({ year: s.year, kind: 'priv' })} style={{ color: s.pNew > 0 ? '#8b5cf6' : s.pNew < 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: '400', padding: '8px 12px 8px 3px', cursor: s.pNew !== 0 ? 'pointer' : 'default', textDecoration: s.pNew !== 0 ? 'underline dotted' : 'none' }}>{s.pNew > 0 ? '+' + s.pNew : s.pNew < 0 ? String(s.pNew) : '-'}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '2px' }}>
                    ※ (교과)는 학교교과교습학원의 갯수를 말함. 증감 = 해당 연도 개원 − 폐원 순증감 (학원·교습소). 증감 숫자를 누르면 목록을 볼 수 있습니다.
                </div>
                {yearDrill && yearDrillData && (() => {
                    const kindLabel = { academy: '학원', hagwon: '교습소', priv: '과외' };
                    return (
                        <div style={{ marginTop: '10px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px', background: 'var(--bg-card)', fontSize: '0.82rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong style={{ fontSize: '0.85rem' }}>{yearDrill.year}년 {kindLabel[yearDrill.kind]} 상세</strong>
                                <button onClick={() => setYearDrill(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 2px' }}>✕</button>
                            </div>
                            {yearDrillData.opened.length > 0 && (
                                <div style={{ marginBottom: yearDrillData.closed.length > 0 ? '8px' : 0 }}>
                                    <span style={{ color: '#3b82f6', fontWeight: '600' }}>▲ 개원/신규 {yearDrillData.opened.length}건 </span>
                                    <span style={{ color: 'var(--text-main)', lineHeight: 1.6 }}>{yearDrillData.opened.join(' · ')}</span>
                                </div>
                            )}
                            {yearDrillData.closed.length > 0 && (
                                <div>
                                    <span style={{ color: '#ef4444', fontWeight: '600' }}>▼ 폐원 {yearDrillData.closed.length}건 </span>
                                    <span style={{ color: 'var(--text-main)', lineHeight: 1.6 }}>{yearDrillData.closed.join(' · ')}</span>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </Section>

            {/* 섹션 3 */}
            <Section title="📚 교습 분야별 분포 (상위 15)">
                {categoryStats.length === 0
                    ? <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '16px 0' }}>분야 데이터 없음</div>
                    : <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
                            <thead><tr>
                                <Th style={{ whiteSpace: 'nowrap' }}>순위</Th>
                                <Th style={{ whiteSpace: 'nowrap', minWidth: '90px' }}>분야</Th>
                                <Th style={{ whiteSpace: 'nowrap' }}>학원</Th>
                                <Th style={{ whiteSpace: 'nowrap' }}>교습소</Th>
                                <Th style={{ whiteSpace: 'nowrap' }}>과외</Th>
                                <Th style={{ whiteSpace: 'nowrap' }}>합계</Th>
                                <Th style={{ whiteSpace: 'nowrap' }}>비율</Th>
                            </tr></thead>
                            <tbody>
                                {categoryStats.map((s, i) => (
                                    <tr key={s.cat} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                        <Td style={{ color: 'var(--text-muted)', fontWeight: '700', whiteSpace: 'nowrap' }}>{i + 1}</Td>
                                        <Td style={{ fontWeight: '700', whiteSpace: 'nowrap' }}>{s.cat}</Td>
                                        <Td style={{ color: '#3b82f6', whiteSpace: 'nowrap' }}>{s.academy > 0 ? s.academy : '-'}</Td>
                                        <Td style={{ color: '#10b981', whiteSpace: 'nowrap' }}>{s.hagwon  > 0 ? s.hagwon  : '-'}</Td>
                                        <Td style={{ color: '#8b5cf6', whiteSpace: 'nowrap' }}>{s.priv    > 0 ? s.priv    : '-'}</Td>
                                        <Td style={{ fontWeight: '700', whiteSpace: 'nowrap' }}>{s.total}</Td>
                                        <Td style={{ whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <div style={{ height: '6px', width: Math.max(2, s.pct * 0.6) + 'px', background: 'var(--primary)', borderRadius: '3px', flexShrink: 0 }} />
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
                                    <Th style={{ color: '#64748b' }}>대상<br/><span style={{ fontSize: '0.65rem', fontWeight: '500', opacity: 0.8 }}>교과+교습소</span></Th>
                                    <Th>점검률</Th><Th>위반건수</Th><Th>행정처분</Th><Th>과태료(만원)</Th>
                                </tr></thead>
                                <tbody>
                                    {inspStats.map((s, i) => {
                                        const ys = ysMap.get(s.year);
                                        const denom = ys ? (ys.aSchoolActive + ys.hActive) : 0;
                                        const numerator = s.academy + s.hagwon;
                                        const checkRate = denom > 0 ? Math.round(numerator / denom * 100) : null;
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
                                                <Td style={{ whiteSpace: 'nowrap' }}>
                                                    {denom > 0 ? (
                                                        <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600' }}>
                                                            {ys?.aSchoolActive > 0 && (
                                                                <span style={{ color: '#3b82f6' }}>{ys.aSchoolActive}</span>
                                                            )}
                                                            {ys?.aSchoolActive > 0 && ys?.hActive > 0 && (
                                                                <span style={{ color: '#94a3b8', margin: '0 2px' }}>+</span>
                                                            )}
                                                            {ys?.hActive > 0 && (
                                                                <span style={{ color: '#10b981' }}>{ys.hActive}</span>
                                                            )}
                                                            <span style={{ color: '#64748b', marginLeft: '3px' }}>={denom}</span>
                                                        </span>
                                                    ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                                </Td>
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
                                    const isEtc = s.dong === '기타';
                                    const dimStyle = isMisc || isEtc;
                                    return (
                                    <tr key={s.dong} style={{ background: isMisc ? 'rgba(0,0,0,0.04)' : (i % 2 === 0 ? 'transparent' : 'var(--bg-main)') }}>
                                        <Td style={{ fontWeight: dimStyle ? '400' : '700', color: dimStyle ? 'var(--text-muted)' : undefined, fontStyle: dimStyle ? 'italic' : undefined }}
                                            title={isEtc && s.dongList ? `포함: ${s.dongList.join(', ')}` : undefined}>
                                            {isMisc ? '미분류 (주소 불명확)' : isEtc ? `기타 (${s.dongList?.length || 0}개 동, 각 5개 이하)` : s.dong}
                                        </Td>
                                        <Td style={{ color: dimStyle ? 'var(--text-muted)' : '#3b82f6' }}>{s.academy > 0 ? s.academy : '-'}</Td>
                                        <Td style={{ color: dimStyle ? 'var(--text-muted)' : '#10b981' }}>{s.hagwon  > 0 ? s.hagwon  : '-'}</Td>
                                        <Td style={{ color: dimStyle ? 'var(--text-muted)' : '#8b5cf6' }}>{s.priv    > 0 ? s.priv    : '-'}</Td>
                                        <Td style={{ fontWeight: '800', color: dimStyle ? 'var(--text-muted)' : undefined }}>{s.total}</Td>
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

// ───────────────────────────────────────────────
// 탭: 검토 (데이터 품질 7개 검사)
// ───────────────────────────────────────────────
const toDateRev = (s) => {
    // Allow optional spaces after separators (e.g. "2026. 2. 20")
    const m = (s || '').match(/(\d{4})[\.\-\/]\s*(\d{1,2})[\.\-\/]\s*(\d{1,2})/);
    return m ? new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])) : null;
};

function TabReview({ region, academies, privateTutors, academyClosures, onSelectAcademy, addrDongCacheVer, initialOpenSections, onSubStateChange }) {
    const city = region.endsWith('시') ? region : region + '시';
    const DEFAULT_SECTIONS_REVIEW = { dateReverse: false, geoFail: false, dongUnclassified: false, noContact: false, hagwonClosure: false, dupReg: false, missingInfo: false, zipIssues: false, insurance: false, insCountMismatch: false, feeExceed: false };
    const [openSections, setOpenSections] = useState(() => initialOpenSections || DEFAULT_SECTIONS_REVIEW);
    const toggleSection = (key) => setOpenSections(prev => {
        const next = { ...prev, [key]: !prev[key] };
        onSubStateChange?.(next);
        return next;
    });

    const aList = useMemo(() => (academies || []).filter(a => (a.address || '').includes(city) && a.category !== '교습소'), [academies, city]);
    const hList = useMemo(() => (academies || []).filter(a => (a.address || '').includes(city) && a.category === '교습소'), [academies, city]);
    const pList = useMemo(() => (privateTutors || []).filter(a => (a.address || '').includes(city)), [privateTutors, city]);
    // 검토 대상: 학원·교습소는 '개원', 개인과외교습자는 '신고' 상태만
    const H_CLOSED_R = ['자진폐원', '직권폐원', '자진폐소', '직권폐소'];
    const aActiveList = useMemo(() => aList.filter(a => (a.status || '') === '개원'), [aList]);
    const hActiveList = useMemo(() => hList.filter(h => (h.status || '') === '개원'), [hList]);
    const pActiveList = useMemo(() => pList.filter(p => (p.status || '') === '신고'), [pList]);

    // 1. 폐원 시트 날짜 오류 (등록 후 1개월 이내 폐원 또는 역전)
    const dateReversals = useMemo(() => (academyClosures || [])
        .filter(a => (a.address || '').includes(city))
        .filter(a => {
            const reg = toDateRev(a.regDate);
            const close = toDateRev(a.closeDate);
            if (!reg || !close) return false;
            const regPlus1M = new Date(reg);
            regPlus1M.setMonth(regPlus1M.getMonth() + 1);
            return regPlus1M >= close;
        }), [academyClosures, city]);

    // 2. 지도 주소 변환 실패 (localStorage 캐시 기반)
    const geoFailures = useMemo(() => {
        try {
            const raw = localStorage.getItem('academyMapLocations');
            if (!raw) return [];
            const cache = JSON.parse(raw);
            const allAc = [...aActiveList, ...hActiveList];
            const results = [];
            Object.entries(cache).forEach(([key, val]) => {
                if (val !== null) return;
                if (key.startsWith('tutor-')) {
                    const id = key.slice(6);
                    const t = pActiveList.find(p => p.id === id);
                    if (t) results.push({ type: '과외', id, name: t.name, address: t.address });
                } else {
                    const ac = allAc.find(a => `${a.id}-${a.category}` === key);
                    if (ac) results.push({ type: ac.category === '교습소' ? '교습소' : '학원', id: ac.id, name: ac.name, address: ac.address });
                }
            });
            return results;
        } catch { return []; }
    }, [aActiveList, hActiveList, pActiveList]);

    // 2b. 동별 분류 미분류 (주소 불명확)
    const dongUnclassified = useMemo(() => {
        const wl = region === '하남' ? HANAM_DONG_SET : GWANGJU_DONG_SET;
        const result = [];
        aActiveList.forEach(a => { if (!getDongFromAddr(a.address, wl)) result.push({ type: '학원', id: a.id, name: a.name, address: a.address }); });
        hActiveList.forEach(a => { if (!getDongFromAddr(a.address, wl)) result.push({ type: '교습소', id: a.id, name: a.name, address: a.address }); });
        pActiveList.forEach(a => { if (!getDongFromAddr(a.address, wl)) result.push({ type: '과외', id: a.id, name: a.name, address: a.address }); });
        return result;
    }, [aActiveList, hActiveList, pActiveList, region, addrDongCacheVer]);

    // 3. 연락처 누락
    const noContact = useMemo(() => {
        const r = [];
        aActiveList.forEach(a => {
            const hp = !!(a.founder?.phone), hm = !!(a.founder?.mobile);
            if (!hp && !hm) r.push({ type: '학원', id: a.id, name: a.name, issue: '전화+핸드폰 없음' });
            else if (!hm) r.push({ type: '학원', id: a.id, name: a.name, issue: '핸드폰 없음' });
        });
        hActiveList.forEach(a => {
            const hp = !!(a.founder?.phone), hm = !!(a.founder?.mobile);
            if (!hp && !hm) r.push({ type: '교습소', id: a.id, name: a.name, issue: '전화+핸드폰 없음' });
            else if (!hm) r.push({ type: '교습소', id: a.id, name: a.name, issue: '핸드폰 없음' });
        });
        pActiveList.forEach(a => {
            const hp = !!(a.phone), hm = !!(a.mobile);
            if (!hp && !hm) r.push({ type: '과외', id: a.id, name: a.name, issue: '전화+핸드폰 없음' });
            else if (!hm) r.push({ type: '과외', id: a.id, name: a.name, issue: '핸드폰 없음' });
        });
        return r;
    }, [aActiveList, hActiveList, pActiveList]);

    // 4(이전됨). 보험 만료/미가입 → 주의 탭으로 이전

    // 5. 교습소 폐소 상태이나 날짜 누락
    const hagwonClosureMissing = useMemo(() => {
        const CLOSED = ['자진폐원', '직권폐원', '자진폐소', '직권폐소'];
        return hList.filter(h => CLOSED.some(s => (h.status || '').includes(s)) && !h.statusDate);
    }, [hList]);

    // 6. 등록번호 중복 (현행 + 폐원 시트 모두 존재)
    const duplicateRegs = useMemo(() => {
        const closureIds = new Set(
            (academyClosures || []).filter(a => (a.address || '').includes(city)).map(a => a.regNum).filter(Boolean)
        );
        return aList.filter(a => a.id && closureIds.has(a.id));
    }, [aList, academyClosures, city]);

    // 7. 필수 정보 누락
    const missingInfo = useMemo(() => {
        const r = [];
        [...aActiveList, ...hActiveList].forEach(a => {
            const ms = [];
            if (!a.regDate) ms.push('등록일');
            if (!a.address) ms.push('주소');
            if (!a.founder?.name) ms.push('설립자');
            if (!a.zip) ms.push('우편번호');
            if (ms.length > 0) r.push({ type: a.category === '교습소' ? '교습소' : '학원', id: a.id, name: a.name, missing: ms.join(', ') });
        });
        pActiveList.forEach(a => {
            const ms = [];
            if (!a.reportDate) ms.push('신고일');
            if (!a.address) ms.push('주소');
            if (ms.length > 0) r.push({ type: '과외', id: a.id, name: a.name, missing: ms.join(', ') });
        });
        return r;
    }, [aActiveList, hActiveList, pActiveList]);

    // 8. 우편번호 검증
    // zipAllItems: 전체 학원·교습소 (API 조회 대상)
    const zipAllItems = useMemo(() =>
        [...aActiveList, ...hActiveList].map(a => ({
            type: a.category === '교습소' ? '교습소' : '학원',
            id: a.id, name: a.name,
            currentZip: a.zip || '',
            address: a.address,
        }))
    , [aActiveList, hActiveList]);
    const [zipLookups, setZipLookups] = useState({});
    const [zipLoading, setZipLoading] = useState(false);
    const [zipProgress, setZipProgress] = useState(0);
    // zipDisplayed: 조회 전 = 5자리 아닌 것, 조회 후 = 5자리 아닌 것 + 불일치 5자리
    const zipDisplayed = useMemo(() => {
        const lookupDone = Object.keys(zipLookups).length > 0;
        return zipAllItems.filter(a => {
            const key = `${a.id}-${a.type}`;
            if (!/^\d{5}$/.test(a.currentZip)) return true;
            if (!lookupDone) return false;
            const correct = zipLookups[key];
            return correct && correct !== '조회실패' && correct !== '-' && correct !== a.currentZip;
        });
    }, [zipAllItems, zipLookups]);
    const startZipLookup = useCallback(async () => {
        if (zipLoading || zipAllItems.length === 0) return;
        setZipLoading(true); setZipProgress(0);
        let kakao = window.kakao?.maps?.services ? window.kakao : null;
        if (!kakao) {
            const apiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY || localStorage.getItem('kakao_api_key');
            if (!apiKey) {
                alert('학원 분포지도 페이지를 먼저 방문하거나 Kakao API 키를 등록하세요.');
                setZipLoading(false); return;
            }
            try {
                kakao = await new Promise((resolve, reject) => {
                    if (window.kakao?.maps?.services) { resolve(window.kakao); return; }
                    const existing = document.getElementById('kakao-map-script') || document.getElementById('kakao-zip-script');
                    if (existing && window.kakao) { window.kakao.maps.load(() => resolve(window.kakao)); return; }
                    const script = document.createElement('script');
                    script.id = 'kakao-zip-script';
                    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&libraries=services&autoload=false`;
                    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
                    script.onerror = () => reject(new Error('SDK 로드 실패'));
                    document.head.appendChild(script);
                });
            } catch { alert('Kakao SDK 로드 실패. API 키를 확인하세요.'); setZipLoading(false); return; }
        }
        const geocoder = new kakao.maps.services.Geocoder();
        const newLookups = { ...zipLookups };
        for (let i = 0; i < zipAllItems.length; i++) {
            const item = zipAllItems[i];
            const key = `${item.id}-${item.type}`;
            if (newLookups[key] !== undefined) { setZipProgress(i + 1); continue; }
            if (!item.address) { newLookups[key] = '-'; setZipProgress(i + 1); setZipLookups({ ...newLookups }); continue; }
            const cleanAddr = item.address.split(',')[0].trim();
            const zone = await new Promise(resolve => {
                geocoder.addressSearch(cleanAddr, (result, status) => {
                    if (status === kakao.maps.services.Status.OK)
                        resolve(result[0]?.road_address?.zone_no || '조회실패');
                    else resolve('조회실패');
                });
            });
            newLookups[key] = zone;
            setZipLookups({ ...newLookups });
            setZipProgress(i + 1);
            await new Promise(r => setTimeout(r, 40));
        }
        setZipLoading(false);
    }, [zipAllItems, zipLookups, zipLoading]);

    const Th = ({ children, style }) => (
        <th style={{ padding: '7px 10px', fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-muted)', background: 'var(--bg-main)', borderBottom: '2px solid var(--border-color)', textAlign: 'left', whiteSpace: 'nowrap', ...style }}>{children}</th>
    );
    const Td = ({ children, style, onClick }) => (
        <td style={{ padding: '6px 10px', fontSize: '0.8rem', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', ...style }} onClick={onClick}>{children}</td>
    );
    const Badge = ({ count, color }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '22px', height: '20px', borderRadius: '10px', padding: '0 6px', background: count > 0 ? (color || '#ef4444') : '#94a3b8', color: 'white', fontSize: '0.72rem', fontWeight: '800' }}>{count}</span>
    );
    const typeColor = (t) => t === '학원' ? '#3b82f6' : t === '교습소' ? '#10b981' : '#8b5cf6';

    // 학원명 클릭 → 상세화면 이동
    const NameLink = ({ id, type, name }) => {
        if (!onSelectAcademy || !id) return <span style={{ fontWeight: '600' }}>{name || '-'}</span>;
        const pool = type === '과외' ? pList : (type === '교습소' ? hList : aList);
        const item = pool.find(a => a.id === id);
        if (!item) return <span style={{ fontWeight: '600' }}>{name || '-'}</span>;
        return (
            <span
                onClick={(e) => { e.stopPropagation(); onSelectAcademy(item); }}
                style={{ fontWeight: '700', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >{name || '-'}</span>
        );
    };

    // 주소 클릭 → 네이버지도 새 탭
    const AddrLink = ({ address }) => {
        if (!address) return <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>-</span>;
        return (
            <a
                href={`https://map.naver.com/p/search/${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: '0.74rem', color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: '2px', lineHeight: '1.4', wordBreak: 'keep-all' }}
            >{address}</a>
        );
    };

    // 8b. 보험 만료/미가입
    const insuranceIssues = useMemo(() => {
        const today = new Date();
        const check = (list, type) => list.map(a => {
            if (!a.insurances || a.insurances.length === 0)
                return { type, id: a.id, name: a.name, phone: a.founder?.phone || '', mobile: a.founder?.mobile || '', issue: '미가입' };
            const hasActive = a.insurances.some(ins => { const e = toDateRev(ins.endDate); return e && e >= today; });
            if (hasActive) return null;
            const latest = a.insurances.reduce((b, ins) => {
                const d = toDateRev(ins.endDate), bd = b ? toDateRev(b.endDate) : null;
                return d && (!bd || d > bd) ? ins : b;
            }, null);
            return { type, id: a.id, name: a.name, phone: a.founder?.phone || '', mobile: a.founder?.mobile || '', issue: `만료 (${latest?.endDate || '-'})` };
        }).filter(Boolean);
        return [...check(aActiveList, '학원'), ...check(hActiveList, '교습소')];
    }, [aActiveList, hActiveList]);

    // 8c-1. 보험 강사수 vs 등록 강사수 불일치
    const insCountMismatch = useMemo(() => {
        const today = new Date();
        const check = (list, type) => list.map(a => {
            // 현재 유효한 보험 중 가장 최신 것의 강사수
            const activeIns = (a.insurances || []).filter(ins => { const e = toDateRev(ins.endDate); return e && e >= today; });
            const ins = activeIns.length > 0
                ? activeIns.reduce((b, i) => { const d = toDateRev(i.endDate), bd = b ? toDateRev(b.endDate) : null; return d && (!bd || d > bd) ? i : b; }, null)
                : null;
            if (!ins) return null;
            const insCount = parseInt((ins.teachersCount || '').toString().replace(/,/g, ''), 10);
            if (isNaN(insCount) || insCount <= 0) return null;
            // 해임일 없는 강사 수 = 현재 등록된 강사 수
            const regCount = (a.instructors || []).filter(i => !i.dismissDate).length;
            if (insCount === regCount) return null;
            return { type, id: a.id, name: a.name, mobile: a.founder?.mobile || '', phone: a.founder?.phone || '', insCount, regCount, diff: regCount - insCount };
        }).filter(Boolean);
        return [...check(aActiveList, '학원'), ...check(hActiveList, '교습소')];
    }, [aActiveList, hActiveList]);

    // 8c. 교습비 단가 기준 초과
    const ADULT_KEYWORDS_R = ['성인', '일반인', '직장', '주부', '노인'];
    const procLevel = (proc) => {
        if (proc.includes('유아')) return '유';
        if (proc.includes('초등')) return '초';
        if (proc.includes('중등')) return '중';
        if (proc.includes('고등')) return '고';
        return '';
    };
    const getStdLabel = (std, track, process) => {
        const p = Math.round(std); const t = (track || ''); const proc = (process || '');
        if (p === 210) return '보습-단과(초등)'; if (p === 222) return '보습-단과(중등)';
        if (p === 259) return '어학'; if (p === 336) return '음악-입시';
        if (p === 234) return t.includes('진학') ? '진학상담' : '보습-단과(고등)';
        if (p === 224) { const lv = procLevel(proc); return lv ? `음악-${lv}` : '음악'; }
        if (p === 212) { const lv = procLevel(proc); if (t.includes('미술')) return lv ? `미술-${lv}` : '미술'; if (t.includes('무용')) return lv ? `무용-${lv}` : '무용'; return lv || ''; }
        if (p === 255) { if (t.includes('미술')) return '미술-입시'; if (t.includes('무용')) return '무용-입시'; return '입시'; }
        if (p === 230) return t.includes('정보') ? '정보-일반' : '기타-일반';
        return '';
    };
    const feeExceed = useMemo(() => {
        const results = [];
        [...aActiveList, ...hActiveList].forEach(a => {
            if ((a.category || '').includes('평생직업')) return;
            (a.courses || []).forEach(course => {
                const proc = course.process || ''; const subj = course.subject || '';
                if (ADULT_KEYWORDS_R.some(k => proc.includes(k) || subj.includes(k))) return;
                const unit = parseFloat((course.unitPrice || '').toString().replace(/,/g, ''));
                const std  = parseFloat((course.standardUnitPrice || '').toString().replace(/,/g, ''));
                if (unit > 0 && std > 0 && unit > std) {
                    results.push({ type: a.category === '교습소' ? '교습소' : '학원', id: a.id, name: a.name, subject: course.subject || '-', stdLabel: getStdLabel(std, course.track, course.process), unit, std, diff: Math.round(unit - std) });
                }
            });
        });
        return results;
    }, [aActiveList, hActiveList]);

    const ReviewSection = ({ id, title, badge, badgeColor, children, alwaysShow }) => {
        const isOpen = openSections[id];
        if (badge === 0 && !alwaysShow) return null;
        return (
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', marginBottom: '12px' }}>
                <button onClick={() => toggleSection(id)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Badge count={badge} color={badgeColor} />
                        <span style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-main)', textAlign: 'left' }}>{title}</span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '8px', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                    <div style={{ marginTop: '10px' }}>
                        {badge === 0
                            ? <div style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: '600', padding: '4px 0' }}>✓ 이상 없음</div>
                            : <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>{children}</div>
                        }
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            {/* 요약 헤더 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px', border: '1px solid var(--border-color)', marginBottom: '14px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px' }}>🔬 데이터 품질 검토</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    학원 {aList.length}개 · 교습소 {hActiveList.length}개 · 개인과외 {pList.length}명 대상 검토 중.
                    주소 변환 실패 항목은 지도 페이지를 먼저 방문한 경우에만 표시됩니다.
                </div>
            </div>

            {/* 1. 날짜 오류 */}
            <ReviewSection id="dateReverse" title="폐원시트 날짜 오류 가능 학원 (등록 후 1개월 이내 폐원)" badge={dateReversals.length} badgeColor="#ef4444">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>등록번호</Th><Th>학원명</Th><Th style={{ color: '#ef4444' }}>등록일</Th><Th style={{ color: '#f59e0b' }}>폐원일</Th><Th>주소</Th>
                    </tr></thead>
                    <tbody>
                        {dateReversals.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{a.regNum || '-'}</Td>
                                <Td style={{ fontWeight: '600' }}>{a.name || '-'}</Td>
                                <Td style={{ color: '#ef4444', fontWeight: '600' }}>{a.regDate}</Td>
                                <Td style={{ color: '#f59e0b', fontWeight: '600' }}>{a.closeDate}</Td>
                                <Td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{a.address}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 2. 주소 변환 실패 */}
            <ReviewSection id="geoFail" title="지도 주소 변환 실패" badge={geoFailures.length} badgeColor="#f59e0b">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>구분</Th><Th>등록번호</Th><Th>명칭</Th><Th>주소</Th>
                    </tr></thead>
                    <tbody>
                        {geoFailures.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td><span style={{ color: typeColor(a.type), fontWeight: '700', fontSize: '0.78rem' }}>{a.type}</span></Td>
                                <Td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{a.id || '-'}</Td>
                                <Td><NameLink id={a.id} type={a.type} name={a.name} /></Td>
                                <Td><AddrLink address={a.address} /></Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 2b. 동별 미분류 */}
            <ReviewSection id="dongUnclassified" title="동별 분류 미분류 (주소 불명확)" badge={dongUnclassified.length} badgeColor="#64748b">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th style={{ whiteSpace: 'nowrap', width: '3.5rem' }}>구분</Th><Th>등록번호</Th><Th>명칭</Th><Th>주소</Th>
                    </tr></thead>
                    <tbody>
                        {dongUnclassified.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td style={{ whiteSpace: 'nowrap' }}><span style={{ color: typeColor(a.type), fontWeight: '700', fontSize: '0.78rem' }}>{a.type}</span></Td>
                                <Td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{a.id || '-'}</Td>
                                <Td><NameLink id={a.id} type={a.type} name={a.name} /></Td>
                                <Td><AddrLink address={a.address} /></Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 3. 연락처 누락 */}
            <ReviewSection id="noContact" title="연락처 누락 (전화번호·핸드폰)" badge={noContact.length} badgeColor="#8b5cf6">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>구분</Th><Th>등록번호</Th><Th>명칭</Th><Th>누락 항목</Th>
                    </tr></thead>
                    <tbody>
                        {noContact.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td><span style={{ color: typeColor(a.type), fontWeight: '700', fontSize: '0.78rem' }}>{a.type}</span></Td>
                                <Td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{a.id || '-'}</Td>
                                <Td><NameLink id={a.id} type={a.type} name={a.name} /></Td>
                                <Td style={{ color: '#8b5cf6', fontWeight: '600' }}>{a.issue}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 5. 교습소 폐소일 누락 */}
            <ReviewSection id="hagwonClosure" title="교습소 폐소 상태이나 날짜 누락" badge={hagwonClosureMissing.length} badgeColor="#f59e0b">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>등록번호</Th><Th>교습소명</Th><Th>등록상태</Th>
                    </tr></thead>
                    <tbody>
                        {hagwonClosureMissing.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{a.id || '-'}</Td>
                                <Td><NameLink id={a.id} type="교습소" name={a.name} /></Td>
                                <Td style={{ color: '#f59e0b', fontWeight: '600' }}>{a.status}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 6. 등록번호 중복 */}
            <ReviewSection id="dupReg" title="등록번호 중복 (현행 + 폐원 시트 모두 존재)" badge={duplicateRegs.length} badgeColor="#ef4444">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>등록번호</Th><Th>학원명</Th><Th>주소</Th>
                    </tr></thead>
                    <tbody>
                        {duplicateRegs.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td style={{ fontSize: '0.74rem', color: '#ef4444', fontWeight: '700' }}>{a.id}</Td>
                                <Td><NameLink id={a.id} type="학원" name={a.name} /></Td>
                                <Td><AddrLink address={a.address} /></Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 8. 우편번호 불일치 */}
            <ReviewSection id="zipIssues" title="우편번호 불일치 (Kakao 검증)" badge={zipDisplayed.length} badgeColor="#f59e0b" alwaysShow>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={startZipLookup} disabled={zipLoading} style={{ padding: '5px 14px', borderRadius: '8px', border: 'none', background: zipLoading ? '#94a3b8' : 'var(--primary)', color: 'white', fontWeight: '700', fontSize: '0.8rem', cursor: zipLoading ? 'default' : 'pointer' }}>
                        {zipLoading ? `조회 중... (${zipProgress}/${zipAllItems.length})` : `Kakao API로 전체 ${zipAllItems.length}건 우편번호 검증`}
                    </button>
                    {Object.keys(zipLookups).length > 0 && !zipLoading && (
                        <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: '600' }}>✓ {Object.keys(zipLookups).length}건 조회 완료 · 불일치 {zipDisplayed.length}건</span>
                    )}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>구분</Th><Th>등록(신고)번호</Th><Th>학원(교습소)명</Th><Th>현재값</Th><Th>올바른값</Th>
                    </tr></thead>
                    <tbody>
                        {zipDisplayed.map((a, i) => {
                            const key = `${a.id}-${a.type}`;
                            const correct = zipLookups[key];
                            return (
                                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                    <Td><span style={{ color: typeColor(a.type), fontWeight: '700', fontSize: '0.78rem' }}>{a.type}</span></Td>
                                    <Td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{a.id || '-'}</Td>
                                    <Td><NameLink id={a.id} type={a.type} name={a.name} /></Td>
                                    <Td style={{ color: '#ef4444', fontWeight: '600' }}>{a.currentZip || '(없음)'}</Td>
                                    <Td style={{ color: correct === '조회실패' ? '#ef4444' : correct ? '#10b981' : 'var(--text-muted)', fontWeight: correct && correct !== '조회실패' ? '700' : '400' }}>
                                        {correct === undefined ? '-' : correct}
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 7. 필수 정보 누락 */}
            <ReviewSection id="missingInfo" title="필수 정보 누락 (등록일·주소·설립자·우편번호)" badge={missingInfo.length} badgeColor="#8b5cf6">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>구분</Th><Th>등록번호</Th><Th>명칭</Th><Th>누락 항목</Th>
                    </tr></thead>
                    <tbody>
                        {missingInfo.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td><span style={{ color: typeColor(a.type), fontWeight: '700', fontSize: '0.78rem' }}>{a.type}</span></Td>
                                <Td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{a.id || '-'}</Td>
                                <Td><NameLink id={a.id} type={a.type} name={a.name} /></Td>
                                <Td style={{ color: '#8b5cf6' }}>{a.missing}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 8b. 보험 만료/미가입 */}
            <ReviewSection id="insurance" title="보험 만료 · 미가입 (학원·교습소)" badge={insuranceIssues.length} badgeColor="#ef4444">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>구분</Th><Th>등록(신고)번호</Th><Th>학원명(교습소명)</Th><Th>연락처(휴대폰)</Th><Th>보험 상태</Th>
                    </tr></thead>
                    <tbody>
                        {insuranceIssues.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td><span style={{ color: typeColor(a.type), fontWeight: '700', fontSize: '0.78rem' }}>{a.type}</span></Td>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{a.id || '-'}</Td>
                                <Td><NameLink id={a.id} type={a.type} name={a.name} /></Td>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{a.mobile || a.phone || '-'}</Td>
                                <Td style={{ color: '#ef4444', fontWeight: '700' }}>{a.issue}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 8c-1. 보험 강사수 vs 등록 강사수 불일치 */}
            <ReviewSection id="insCountMismatch" title="보험 강사수 ≠ 등록 강사수" badge={insCountMismatch.length} badgeColor="#f59e0b">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>구분</Th><Th>등록번호</Th><Th>명칭</Th><Th>보험 강사수</Th><Th>등록 강사수</Th><Th>차이</Th>
                    </tr></thead>
                    <tbody>
                        {insCountMismatch.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td><span style={{ color: typeColor(a.type), fontWeight: '700', fontSize: '0.78rem' }}>{a.type}</span></Td>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{a.id || '-'}</Td>
                                <Td><NameLink id={a.id} type={a.type} name={a.name} /></Td>
                                <Td style={{ fontWeight: '700', color: '#0369a1', textAlign: 'center' }}>{a.insCount}명</Td>
                                <Td style={{ fontWeight: '700', color: '#7c3aed', textAlign: 'center' }}>{a.regCount}명</Td>
                                <Td style={{ fontWeight: '700', color: a.diff > 0 ? '#10b981' : '#ef4444', textAlign: 'center' }}>
                                    {a.diff > 0 ? `+${a.diff}` : a.diff}명
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>

            {/* 8c. 교습비 단가 기준 초과 */}
            <ReviewSection id="feeExceed" title="교습비 단가 기준 초과 (학원·교습소)" badge={feeExceed.length} badgeColor="#f97316">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <Th>구분</Th><Th>등록번호</Th><Th>명칭</Th><Th>교습과목</Th><Th>기준단가(분당)</Th><Th>신고단가(분당)</Th><Th>초과액</Th>
                    </tr></thead>
                    <tbody>
                        {feeExceed.map((a, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                <Td><span style={{ color: typeColor(a.type), fontWeight: '700', fontSize: '0.78rem' }}>{a.type}</span></Td>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{a.id || '-'}</Td>
                                <Td><NameLink id={a.id} type={a.type} name={a.name} /></Td>
                                <Td>{a.subject}</Td>
                                <Td><span style={{ fontWeight: '700' }}>{a.std.toLocaleString()}원</span>{a.stdLabel ? <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '400', marginLeft: '4px' }}>{a.stdLabel}</span> : ''}</Td>
                                <Td style={{ color: '#f97316', fontWeight: '600' }}>{a.unit.toLocaleString()}원</Td>
                                <Td style={{ color: '#ef4444', fontWeight: '700' }}>+{a.diff.toLocaleString()}원</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReviewSection>
        </div>
    );
}

// 주소에서 "경기도 하남시" 제거
const shortAddr = (addr) => addr ? addr.replace(/^경기도\s*하남시\s*/, '') : '-';

// 주소에서 건물 단위 키 추출 (도로명+번호 or 번지 앞번호)
function getBuilding(addr) {
    if (!addr) return '주소미상';
    let s = addr.replace(/^경기도\s*[가-힣]+시\s*/, '');
    s = s.replace(/^[가-힣]+[동리읍면]\s*/, '').trim();
    const roadM = s.match(/([가-힣]+(?:로|길)\s*\d+)/);
    if (roadM) return roadM[1].replace(/\s+/, '');
    const jibeonM = s.match(/^(\d+)(?:-\d+)?/);
    if (jibeonM) return jibeonM[1] + '번지';
    return '주소미상';
}

// ───────────────────────────────────────────────
// 탭: 주의 (운영 위반 점검)
// ───────────────────────────────────────────────
function TabCaution({ region, academies, privateTutors, academyClosures, onSelectAcademy, addrDongCacheVer, initialOpenSections, onSubStateChange, onShowRouteMap, initialRouteDate, onRouteDateChange, initialExpandedDongs, initialUnderdueExpandedDongs, initialByBuildingExpandedDongs, initialByBuildingExpandedBuildings, onExpandedDongsChange }) {
    const city = region.endsWith('시') ? region : region + '시';
    const H_CLOSED_R = ['자진폐원', '직권폐원', '자진폐소', '직권폐소'];
    const aList = useMemo(() => (academies || []).filter(a => (a.address || '').includes(city) && a.category !== '교습소'), [academies, city]);
    const hList = useMemo(() => (academies || []).filter(a => (a.address || '').includes(city) && a.category === '교습소'), [academies, city]);
    const hActiveList = useMemo(() => hList.filter(h => !H_CLOSED_R.some(s => (h.status || '').includes(s))), [hList]);

    const DEFAULT_SECTIONS_CAUTION = { route: true, weeklyPlan: false, risk: false, overdue: false };
    const [openSections, setOpenSections] = useState(() => initialOpenSections || DEFAULT_SECTIONS_CAUTION);
    const toggleSection = (key) => setOpenSections(prev => {
        const next = { ...prev, [key]: !prev[key] };
        onSubStateChange?.(next);
        return next;
    });

    // ── 점검유보 목록 (추천에서 제외) ──
    const [deferNames, setDeferNames] = useState(new Set());

    const loadDeferNames = async () => {
        try {
            const rawRows = await fetchInspectionDeferRawRows();
            console.log('[점검유보] rawRows 수:', rawRows?.length, '1행:', rawRows?.[0]);
            if (!rawRows || rawRows.length < 2) return;
            let hIdx = 0, maxF = 0;
            for (let i = 0; i < Math.min(5, rawRows.length); i++) {
                const f = rawRows[i].filter(c => c && c.trim()).length;
                if (f > maxF) { maxF = f; hIdx = i; }
            }
            const headers = rawRows[hIdx].map(h => h.trim());
            console.log('[점검유보] headers:', headers);
            const bodyRows = rawRows.slice(hIdx + 1)
                .filter(row => row.some(c => c && c.trim()))
                .map(row => { const obj = {}; headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); }); return obj; });
            const names = new Set(bodyRows.map(r => {
                const byCol = colVal(r, ['학원(교습소)명', '명칭', '학원명', '기관명', '교습소명', '과외자명', '기관명칭', '명']);
                if (byCol) return normName(byCol);
                // 컬럼명 매칭 실패 시 첫 번째 비어있지 않은 값 사용
                const firstVal = Object.values(r).find(v => v && v.trim());
                return firstVal ? normName(firstVal) : '';
            }).filter(Boolean));
            console.log('[점검유보] 로드된 점검유보 기관 수:', names.size, [...names].slice(0, 5));
            setDeferNames(names);
        } catch (e) {
            console.error('[점검유보] 로드 실패:', e);
        }
    };

    useEffect(() => { loadDeferNames(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 점검완료 추적 (구글시트 최근 점검기록: 명칭 → 최근 유효 점검일) ──
    const [inspectedDates, setInspectedDates] = useState(new Map());
    const riskAcOpen = openSections.riskAc ?? false;
    const setRiskAcOpen = (val) => setOpenSections(prev => { const next = { ...prev, riskAc: typeof val === 'function' ? val(prev.riskAc ?? false) : val }; onSubStateChange?.(next); return next; });
    const riskHgOpen = openSections.riskHg ?? false;
    const setRiskHgOpen = (val) => setOpenSections(prev => { const next = { ...prev, riskHg: typeof val === 'function' ? val(prev.riskHg ?? false) : val }; onSubStateChange?.(next); return next; });
    const [copyToast, setCopyToast] = useState(null);
    const [acRefreshed, setAcRefreshed] = useState(false);
    const [hgRefreshed, setHgRefreshed] = useState(false);
    const [riskRefreshing, setRiskRefreshing] = useState(false);
    // overdue per-dong refresh state: Map<dong, Set<'ac'|'hg'>>
    const [overdueRefreshed, setOverdueRefreshed] = useState(new Map());
    const [overdueRefreshing, setOverdueRefreshing] = useState(false);
    const [expandedDongs, setExpandedDongs] = useState(() => new Set(initialExpandedDongs || []));
    const [underdueRefreshed, setUnderdueRefreshed] = useState(new Map());
    const [underdueRefreshing, setUnderdueRefreshing] = useState(false);
    const [underdueExpandedDongs, setUnderdueExpandedDongs] = useState(() => new Set(initialUnderdueExpandedDongs || []));
    const [byBuildingRefreshed, setByBuildingRefreshed] = useState(new Map());
    const [byBuildingRefreshing, setByBuildingRefreshing] = useState(false);
    const [byBuildingExpandedDongs, setByBuildingExpandedDongs] = useState(() => new Set(initialByBuildingExpandedDongs || []));
    const [byBuildingExpandedBuildings, setByBuildingExpandedBuildings] = useState(() => new Set(initialByBuildingExpandedBuildings || []));
    const [allRawRows, setAllRawRows] = useState([]);
    const [routeDate, setRouteDate] = useState(initialRouteDate || '');
    const [routeCacheVer, setRouteCacheVer] = useState(0);
    const [manualOrderMap, setManualOrderMap] = useState(() => {
        try {
            const saved = localStorage.getItem('routeManualOrder');
            return saved ? new Map(JSON.parse(saved)) : new Map();
        } catch { return new Map(); }
    });
    const [dragState, setDragState] = useState({ dragging: null, over: null });
    const dragRef = useRef({ idx: null, overIdx: null });
    const touchDragRef = useRef({ active: false, startIdx: null, timer: null });
    const routeTbodyRef = useRef(null);
    const routeMapContainerRef = useRef(null);
    const routeMapInstanceRef = useRef(null);
    const inlineRouteMarkersRef = useRef([]);

    const normName = (n) => (n || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
    const isInsp2026 = useCallback((a) => inspectedDates.has(normName(a.name)), [inspectedDates]);

    const RECENT_ROWS_CACHE_KEY = 'recentRawRows_cache';

    const applyRows = (bodyRows) => {
        setAllRawRows(bodyRows);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const dates = new Map();
        bodyRows.forEach(r => {
            const dateStr = colVal(r, ['점검일', '점검일자', '지도점검일']);
            if (!dateStr || !dateStr.trim()) return;
            const d = toDateRev(dateStr);
            if (!d || d > today) return;
            const purpose = colVal(r, ['점검목적', '점검구분', '방문목적', '민원구분']);
            if (purpose.includes('교습시간')) return;
            const name = normName(colVal(r, ['학원(교습소)명', '명칭', '학원명', '기관명']));
            if (!name) return;
            const prev = dates.get(name);
            if (!prev || d > prev) dates.set(name, d);
        });
        setInspectedDates(dates);
        return dates;
    };

    const loadInspectedNames = async () => {
        try {
            const { bodyRows } = await fetchRecentRawRows();
            try { sessionStorage.setItem(RECENT_ROWS_CACHE_KEY, JSON.stringify(bodyRows)); } catch { /* 저장 실패 무시 */ }
            applyRows(bodyRows);
            return new Map();
        } catch { return new Map(); }
    };

    useEffect(() => {
        // 캐시 즉시 렌더링
        try {
            const cached = sessionStorage.getItem(RECENT_ROWS_CACHE_KEY);
            if (cached) applyRows(JSON.parse(cached));
        } catch { /* 캐시 읽기 실패 무시 */ }
        // 백그라운드에서 최신 데이터 fetch 후 갱신
        loadInspectedNames();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 점검 경로: 전체 날짜별 그룹 (과거 포함) ──
    const planDateMap = useMemo(() => {
        const map = new Map();
        allRawRows.forEach(row => {
            const d = toDateRev(colVal(row, ['점검일','점검일자','지도점검일']));
            if (!d) return;
            const nd = new Date(d); nd.setHours(0,0,0,0);
            const key = `${nd.getFullYear()}.${String(nd.getMonth()+1).padStart(2,'0')}.${String(nd.getDate()).padStart(2,'0')}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(row);
        });
        return map;
    }, [allRawRows]);

    // planDateMap 로드 후 routeDate 미설정 시 오늘 또는 가장 가까운 미래 날짜로 자동 선택
    useEffect(() => {
        if (planDateMap.size === 0) return;
        setRouteDate(prev => {
            if (prev && planDateMap.has(prev)) return prev;
            const today = new Date(); today.setHours(0,0,0,0);
            const todayStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
            const keys = [...planDateMap.keys()].sort((a, b) => a.localeCompare(b));
            const todayOrFuture = keys.filter(k => k >= todayStr);
            return (todayOrFuture.length > 0 ? todayOrFuture[0] : keys[keys.length - 1]) || prev;
        });
    }, [planDateMap]);

    const haversineKm = (lat1, lng1, lat2, lng2) => {
        const R = 6371, toRad = x => x * Math.PI / 180;
        const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
        return R * 2 * Math.asin(Math.sqrt(a));
    };

    // 예약일정 문자열에서 시작 시간(시 단위 소수) 추출 — 오름차순 정렬 기준
    // 날짜 prefix가 있고 routeDate와 다른 날짜이면 null(미분류) 반환
    const parseScheduleMidpoint = (schedule, rdDate) => {
        if (!schedule) return null;
        // 날짜 prefix는 무시하고 시간만 추출 (날짜가 달라도 시간 정보는 정렬에 사용)
        const cleaned = schedule.replace(/\([^)]*\)/g, '').trim();

        // 오전/오후 보정
        const isPM = /오후/.test(cleaned);
        const isAM = /오전/.test(cleaned);
        const toH = (h, m = 0) => {
            let hour = parseInt(h), min = parseInt(m) / 60;
            if (isPM && hour < 12) hour += 12;
            if (isAM && hour === 12) hour = 0;
            return hour + min;
        };

        let m;
        // 패턴 1: HH:MM~HH:MM 또는 HH:MM-HH:MM (콜론 포함 범위)
        m = cleaned.match(/(\d{1,2}):(\d{2})\s*[~\-]\s*\d/);
        if (m) return toH(m[1], m[2]);

        // 패턴 2: HH시 MM분 ~ / HH시 ~ (한국어 범위)
        m = cleaned.match(/(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?\s*(?:부터|~|-)\s*\d/);
        if (m) return toH(m[1], m[2] || 0);

        // 패턴 3: HH:MM 단독 ("부터", "가능", "이후", "~" 뒤에 숫자 없는 경우 포함)
        m = cleaned.match(/(\d{1,2}):(\d{2})/);
        if (m) return toH(m[1], m[2]);

        // 패턴 4: HH시 MM분 단독
        m = cleaned.match(/(\d{1,2})\s*시\s*(\d{1,2})\s*분/);
        if (m) return toH(m[1], m[2]);

        // 패턴 5: HH시 단독 ("가능", "부터", "이후", "~" 등 자연어 포함)
        m = cleaned.match(/(\d{1,2})\s*시/);
        if (m) return toH(m[1], 0);

        return null;
    };

    const routeAcademiesSorted = useMemo(() => {
        if (!routeDate || !planDateMap.has(routeDate)) return [];
        const rows = planDateMap.get(routeDate);
        const allA = [...(academies || [])];
        const matched = rows.map(row => {
            const rawName = colVal(row, ['학원(교습소)명','명칭','학원명','기관명']);
            const academy = allA.find(a => normName(a.name) === normName(rawName)) || null;
            if (!academy) return null;
            const schedule = colVal(row, ['예약일정','점검시간','예약시간','시간','일정']);
            const uninspectedPeriod = colVal(row, ['미점검기간', '미점검 기간', '미검기간', '미점검일수']);
            return { ...academy, _schedule: schedule, _uninspectedPeriod: uninspectedPeriod };
        }).filter(Boolean);
        if (matched.length === 0) return [];

        const cache = JSON.parse(localStorage.getItem('academyMapLocations') || '{}');
        const items = matched.map(a => ({
            ...a,
            _lat: cache[`${a.id}-${a.category}`]?.lat ?? null,
            _lng: cache[`${a.id}-${a.category}`]?.lng ?? null,
            _midpoint: parseScheduleMidpoint(a._schedule, routeDate),
        }));

        // 폐원 여부: _schedule에 "폐원"/"폐소" 포함 → 최하단
        const isClosed = (a) => /폐원|폐소/.test(a._schedule || '');
        const scheduled = items.filter(a => a._midpoint !== null && !isClosed(a));
        const unscheduled = items.filter(a => a._midpoint === null && !isClosed(a));
        const closedItems = items.filter(a => isClosed(a));

        // 중간값별 그룹화
        const groups = new Map();
        scheduled.forEach(a => {
            if (!groups.has(a._midpoint)) groups.set(a._midpoint, []);
            groups.get(a._midpoint).push(a);
        });
        const sortedKeys = Array.from(groups.keys()).sort((a, b) => a - b);

        const result = [];
        let lastLat = null, lastLng = null;

        // 예약일정 항목: 시간 오름차순, 동점은 거리 최근접 우선
        for (const key of sortedKeys) {
            const group = groups.get(key);
            const rem = [...group];
            while (rem.length > 0) {
                let minI = 0;
                if (lastLat !== null) {
                    let minD = Infinity;
                    rem.forEach((a, i) => {
                        if (a._lat != null) {
                            const d = haversineKm(lastLat, lastLng, a._lat, a._lng);
                            if (d < minD) { minD = d; minI = i; }
                        }
                    });
                }
                const [chosen] = rem.splice(minI, 1);
                result.push(chosen);
                lastLat = chosen._lat; lastLng = chosen._lng;
            }
        }

        // 예약일정 없는 항목: 마지막 위치 기준 최근접 순
        const remUnsched = unscheduled.filter(a => a._lat != null);
        const noCoordUnsched = unscheduled.filter(a => a._lat == null);
        while (remUnsched.length > 0) {
            let minI = 0;
            if (lastLat !== null) {
                let minD = Infinity;
                remUnsched.forEach((a, i) => {
                    const d = haversineKm(lastLat, lastLng, a._lat, a._lng);
                    if (d < minD) { minD = d; minI = i; }
                });
            }
            const [chosen] = remUnsched.splice(minI, 1);
            result.push(chosen);
            lastLat = chosen._lat; lastLng = chosen._lng;
        }
        result.push(...noCoordUnsched);

        // 폐원/폐소 항목: 무조건 최하단
        result.push(...closedItems);

        return result.map((a, i) => {
            let dist = null;
            if (i > 0 && a._lat != null) {
                const prev = result[i - 1];
                if (prev?._lat != null) dist = haversineKm(prev._lat, prev._lng, a._lat, a._lng);
            }
            return { ...a, _order: i + 1, _dist: dist };
        });
    }, [routeDate, planDateMap, academies, routeCacheVer]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 수동 순서 적용 + 이동거리 재계산 ──
    const routeAcademiesFinal = useMemo(() => {
        if (routeAcademiesSorted.length === 0) return [];
        const manualKeys = manualOrderMap.get(routeDate);
        if (!manualKeys || manualKeys.length === 0) return routeAcademiesSorted;
        const keyOf = (a) => `${a.id}-${a.category}`;
        const byKey = new Map(routeAcademiesSorted.map(a => [keyOf(a), a]));
        const keySet = new Set(manualKeys);
        const reordered = [];
        manualKeys.forEach(k => { if (byKey.has(k)) reordered.push(byKey.get(k)); });
        routeAcademiesSorted.forEach(a => { if (!keySet.has(keyOf(a))) reordered.push(a); });
        const BASE_LAT = 37.5674619;
        const BASE_LNG = 127.1961543;
        return reordered.map((a, i) => {
            let dist = null;
            if (i === 0) {
                if (a._lat != null) dist = haversineKm(BASE_LAT, BASE_LNG, a._lat, a._lng);
            } else {
                const prev = reordered[i - 1];
                if (a._lat != null && prev._lat != null) dist = haversineKm(prev._lat, prev._lng, a._lat, a._lng);
            }
            return { ...a, _order: i + 1, _dist: dist };
        });
    }, [routeAcademiesSorted, manualOrderMap, routeDate]); // eslint-disable-line react-hooks/exhaustive-deps

    const applyRouteOrder = useCallback((newList) => {
        const keys = newList.map(a => `${a.id}-${a.category}`);
        setManualOrderMap(prev => {
            const next = new Map(prev);
            next.set(routeDate, keys);
            try { localStorage.setItem('routeManualOrder', JSON.stringify([...next])); } catch {}
            return next;
        });
    }, [routeDate]);

    const resetRouteOrder = useCallback(() => {
        setManualOrderMap(prev => {
            const next = new Map(prev);
            next.delete(routeDate);
            try { localStorage.setItem('routeManualOrder', JSON.stringify([...next])); } catch {}
            return next;
        });
    }, [routeDate]);

    // ── 드래그 앤 드롭 핸들러 ──
    const handleDragStart = useCallback((e, i) => {
        dragRef.current.idx = i;
        setDragState(s => ({ ...s, dragging: i }));
        e.dataTransfer.effectAllowed = 'move';
    }, []);
    const handleDragOver = useCallback((e, i) => {
        e.preventDefault();
        if (dragRef.current.overIdx !== i) {
            dragRef.current.overIdx = i;
            setDragState(s => ({ ...s, over: i }));
        }
    }, []);
    const handleDragEnd = useCallback(() => {
        dragRef.current.idx = null;
        dragRef.current.overIdx = null;
        setDragState({ dragging: null, over: null });
    }, []);
    const handleDrop = useCallback((e, i, list) => {
        e.preventDefault();
        const from = dragRef.current.idx;
        if (from === null || from === i) { handleDragEnd(); return; }
        const newList = [...list];
        const [removed] = newList.splice(from, 1);
        newList.splice(i, 0, removed);
        applyRouteOrder(newList);
        handleDragEnd();
    }, [applyRouteOrder, handleDragEnd]);

    // ── 터치 드래그 핸들러 ──
    const handleTouchStart = useCallback((e, i) => {
        const timer = setTimeout(() => {
            touchDragRef.current.active = true;
            touchDragRef.current.startIdx = i;
            dragRef.current.idx = i;
            dragRef.current.overIdx = i;
            setDragState({ dragging: i, over: i });
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
        touchDragRef.current.timer = timer;
    }, []);
    const handleTouchEnd = useCallback((list) => {
        clearTimeout(touchDragRef.current.timer);
        if (!touchDragRef.current.active) { touchDragRef.current.timer = null; return; }
        const from = touchDragRef.current.startIdx;
        const to = dragRef.current.overIdx;
        touchDragRef.current.active = false;
        touchDragRef.current.startIdx = null;
        touchDragRef.current.timer = null;
        if (from !== null && to !== null && from !== to) {
            const newList = [...list];
            const [removed] = newList.splice(from, 1);
            newList.splice(to, 0, removed);
            applyRouteOrder(newList);
        }
        dragRef.current.idx = null;
        dragRef.current.overIdx = null;
        setDragState({ dragging: null, over: null });
    }, [applyRouteOrder]);

    // touchmove passive:false (스크롤 방지)
    useEffect(() => {
        const el = routeTbodyRef.current;
        if (!el) return;
        const onMove = (e) => {
            if (!touchDragRef.current.active) { clearTimeout(touchDragRef.current.timer); return; }
            e.preventDefault();
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const row = target?.closest('[data-drag-idx]');
            if (row) {
                const idx = parseInt(row.dataset.dragIdx);
                if (!isNaN(idx) && dragRef.current.overIdx !== idx) {
                    dragRef.current.overIdx = idx;
                    setDragState(s => ({ ...s, over: idx }));
                }
            }
        };
        el.addEventListener('touchmove', onMove, { passive: false });
        return () => el.removeEventListener('touchmove', onMove);
    }, [routeDate]); // routeDate 바뀌면 tbody ref 재연결

    // ── 인라인 경로 지도 ──
    const getUnitLabel = (address) => {
        if (!address) return '';
        const m = address.match(/(\d{1,4})동\s*(\d{3,4})호/) || address.match(/(\d{1,4})호/);
        return m ? `(${m[0]})` : '';
    };

    useEffect(() => {
        inlineRouteMarkersRef.current.forEach(o => o.setMap(null));
        inlineRouteMarkersRef.current = [];

        if (!routeDate || routeAcademiesFinal.length === 0 || !routeMapContainerRef.current) return;

        let cancelled = false;

        const geocodeOne = (kakao, address) => new Promise(resolve => {
            const geocoder = new kakao.maps.services.Geocoder();
            geocoder.addressSearch(address, (result, status) => {
                if (status === kakao.maps.services.Status.OK && result[0]) {
                    resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
                } else {
                    resolve(null);
                }
            });
        });

        const initInlineMap = async () => {
            const kakao = window.kakao;
            if (!kakao?.maps || !routeMapContainerRef.current) return;

            if (!routeMapInstanceRef.current) {
                routeMapInstanceRef.current = new kakao.maps.Map(routeMapContainerRef.current, {
                    center: new kakao.maps.LatLng(37.54, 127.21),
                    level: 5,
                });
            }
            const map = routeMapInstanceRef.current;

            inlineRouteMarkersRef.current.forEach(o => o.setMap(null));
            inlineRouteMarkersRef.current = [];

            // 캐시에 좌표가 없는 학원은 직접 지오코딩
            const coordsMap = new Map(); // id-category → {lat, lng}
            routeAcademiesFinal.forEach(a => {
                if (a._lat != null) coordsMap.set(`${a.id}-${a.category}`, { lat: a._lat, lng: a._lng });
            });
            const missing = routeAcademiesFinal.filter(a => a._lat == null && a.address);
            if (missing.length > 0) {
                const cache = JSON.parse(localStorage.getItem('academyMapLocations') || '{}');
                let cacheUpdated = false;
                for (const a of missing) {
                    if (cancelled) return;
                    const cacheKey = `${a.id}-${a.category}`;
                    if (cache[cacheKey] != null) {
                        coordsMap.set(cacheKey, cache[cacheKey]);
                        continue;
                    }
                    const coords = await geocodeOne(kakao, a.address);
                    if (coords) {
                        cache[cacheKey] = coords;
                        coordsMap.set(cacheKey, coords);
                        cacheUpdated = true;
                    } else {
                        cache[cacheKey] = null;
                        cacheUpdated = true;
                    }
                }
                if (cacheUpdated) { localStorage.setItem('academyMapLocations', JSON.stringify(cache)); setRouteCacheVer(v => v + 1); }
            }
            if (cancelled) return;

            const locationGroups = new Map();
            const noCoordItems = [];
            routeAcademiesFinal.forEach(a => {
                const coords = a._lat != null ? { lat: a._lat, lng: a._lng } : coordsMap.get(`${a.id}-${a.category}`);
                if (!coords) { noCoordItems.push(a); return; }
                const key = `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`;
                if (!locationGroups.has(key)) locationGroups.set(key, { lat: coords.lat, lng: coords.lng, items: [] });
                locationGroups.get(key).items.push(a);
            });

            const positions = [];
            const overlayItems = []; // track for collision avoidance

            locationGroups.forEach(({ lat, lng, items }) => {
                const position = new kakao.maps.LatLng(lat, lng);
                positions.push(position);

                const el = document.createElement('div');
                // 0×0 wrapper: 지리 좌표에 픽셀 오프셋 없이 정확히 고정 (transform 제거)
                el.style.cssText = 'position:relative;width:0;height:0;overflow:visible;';
                items.forEach((a, i) => {
                    const unitStr = getUnitLabel(a.address);
                    const row = document.createElement('div');
                    const baseTop = i * 27 - 11; // 배지 중심(11px)이 좌표에 오도록
                    row.dataset.baseTop = baseTop;
                    row.style.cssText = `position:absolute;top:${baseTop}px;left:-11px;display:flex;align-items:center;gap:4px;cursor:pointer;`;
                    row.innerHTML = `
                        <div style="width:22px;height:22px;border-radius:50%;background:#f97316;color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;border:2px solid white;box-shadow:0 2px 5px rgba(249,115,22,0.5);flex-shrink:0;">${a._order}</div>
                        <div style="background:rgba(255,255,255,0.95);padding:2px 7px;border-radius:9px;border:1.5px solid #f97316;font-size:10px;font-weight:700;color:#1e1b4b;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15);">${a.name}${unitStr ? ' ' + unitStr : ''}</div>
                    `;
                    row.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (onSelectAcademy) onSelectAcademy(a);
                    });
                    el.appendChild(row);
                });

                const overlay = new kakao.maps.CustomOverlay({
                    position, content: el, zIndex: 50, xAnchor: 0, yAnchor: 0,
                });
                overlay.setMap(map);
                inlineRouteMarkersRef.current.push(overlay);
                overlayItems.push({ overlay, el, lat, lng, cssShiftY: 0 });
            });

            if (positions.length >= 2) {
                const bounds = new kakao.maps.LatLngBounds();
                positions.forEach(p => bounds.extend(p));
                map.setBounds(bounds, 50);
            } else if (positions.length === 1) {
                map.setCenter(positions[0]);
                map.setLevel(3);
            }

            // 좌표 없는 항목 표시 (지도 우상단 고정 박스)
            const existingNoCoordBox = routeMapContainerRef.current.querySelector('.no-coord-box');
            if (existingNoCoordBox) existingNoCoordBox.remove();
            if (noCoordItems.length > 0) {
                const box = document.createElement('div');
                box.className = 'no-coord-box';
                box.style.cssText = 'position:absolute;top:8px;right:8px;z-index:100;background:rgba(255,255,255,0.95);border:1.5px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:10px;color:#64748b;box-shadow:0 2px 6px rgba(0,0,0,0.12);max-width:180px;';
                box.innerHTML = `<div style="font-weight:700;color:#94a3b8;margin-bottom:3px;">📍 위치 미확인</div>` +
                    noCoordItems.map(a => `<div style="display:flex;align-items:center;gap:4px;margin-top:2px;"><span style="width:18px;height:18px;border-radius:50%;background:#94a3b8;color:white;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:9px;flex-shrink:0;">${a._order}</span><span style="font-weight:600;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.name}</span></div>`).join('');
                routeMapContainerRef.current.style.position = 'relative';
                routeMapContainerRef.current.appendChild(box);
            }

            // Collision avoidance: map 좌표 기반으로 겹침 감지 후 최소 이동
            const mapContainerEl = routeMapContainerRef.current;
            const resolveCollisions = () => {
                if (cancelled || !mapContainerEl) return;
                const proj = map.getProjection();
                const ROW_H = 27;   // 행 1개당 픽셀 높이 (배지 22px + gap)
                const LABEL_W = 195; // 라벨 최대 폭 (xAnchor=0.5 기준 좌우)
                const MAX_SHIFT_PX = 28;

                const items = overlayItems.map(item => {
                    const px = proj.pointFromCoords(item.overlay.getPosition());
                    const rowCount = item.el.children.length || 1;
                    const h = rowCount * ROW_H;
                    // 0×0 wrapper: el이 정확히 px에 위치, 첫 행 top=-11px → 배지 중심이 px
                    return {
                        item,
                        top: px.y - 11,
                        bottom: px.y - 11 + h,
                        left: px.x - 11,
                        right: px.x - 11 + LABEL_W,
                    };
                });

                items.sort((a, b) => a.top - b.top);

                const mapBnds = map.getBounds();
                const mapRect = mapContainerEl.getBoundingClientRect();
                const latRange = mapBnds.getNorthEast().getLat() - mapBnds.getSouthWest().getLat();
                const degPerPx = latRange / mapRect.height;

                for (let i = 0; i < items.length; i++) {
                    for (let j = i + 1; j < items.length; j++) {
                        const a = items[i];
                        const b = items[j];
                        const hOverlap = a.left < b.right && a.right > b.left;
                        const vOverlap = a.top < b.bottom && a.bottom > b.top;
                        if (hOverlap && vOverlap) {
                            const shift = Math.min(a.bottom - b.top + 2, MAX_SHIFT_PX);
                            if (shift > 0) {
                                b.item.cssShiftY = (b.item.cssShiftY || 0) + shift;
                                // -11px 수직 오프셋(base) 유지하면서 shift 적용
                                Array.from(b.item.el.children).forEach(child => {
                                    const baseTop = parseInt(child.dataset.baseTop) || 0;
                                    child.style.top = (baseTop + b.item.cssShiftY) + 'px';
                                });
                                b.top += shift;
                                b.bottom += shift;
                            }
                        }
                    }
                }
            };
            // 줌 변경 시 shift 초기화 후 재계산
            const resetAndResolve = () => {
                if (cancelled) return;
                overlayItems.forEach(item => {
                    item.cssShiftY = 0;
                    Array.from(item.el.children).forEach(child => {
                        child.style.top = (parseInt(child.dataset.baseTop) || 0) + 'px';
                    });
                });
                resolveCollisions();
            };
            let zoomTimer = null;
            kakao.maps.event.addListener(map, 'zoom_changed', () => {
                if (cancelled) return;
                clearTimeout(zoomTimer);
                zoomTimer = setTimeout(resetAndResolve, 200);
            });

            // 지도 이동 완료 후 충돌 감지 실행
            // setBounds가 이미 완료됐을 수 있으므로 idle 이벤트와 타임아웃 두 가지로 보장
            let collisionDone = false;
            const runOnce = () => {
                if (collisionDone || cancelled) return;
                collisionDone = true;
                resolveCollisions();
            };
            const idleHandler = () => {
                kakao.maps.event.removeListener(map, 'idle', idleHandler);
                runOnce();
            };
            kakao.maps.event.addListener(map, 'idle', idleHandler);
            setTimeout(runOnce, 600); // idle이 이미 지났을 경우 fallback
        };

        if (window.kakao?.maps) {
            initInlineMap();
        } else {
            const interval = setInterval(() => {
                if (window.kakao?.maps) { clearInterval(interval); initInlineMap(); }
            }, 300);
            return () => { cancelled = true; clearInterval(interval); };
        }
        return () => { cancelled = true; };
    }, [routeAcademiesFinal, routeDate]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRiskRefresh = async (type) => {
        setRiskRefreshing(true);
        await Promise.all([loadInspectedNames(), loadDeferNames()]);
        if (type === 'ac') { setAcRefreshed(true); }
        else { setHgRefreshed(true); }
        setRiskRefreshing(false);
    };

    const handleOverdueRefresh = async (dong, catKey) => {
        setOverdueRefreshing(true);
        await Promise.all([loadInspectedNames(), loadDeferNames()]);
        setOverdueRefreshed(prev => {
            const next = new Map(prev);
            const cur = new Set(next.get(dong) || []);
            cur.add(catKey);
            next.set(dong, cur);
            return next;
        });
        setOverdueRefreshing(false);
    };
    const handleOverdueDongRefresh = async (dong) => {
        setOverdueRefreshing(true);
        await Promise.all([loadInspectedNames(), loadDeferNames()]);
        setOverdueRefreshed(prev => {
            const next = new Map(prev);
            next.set(dong, new Set(['ac', 'hg']));
            return next;
        });
        setOverdueRefreshing(false);
    };
    const toggleDong = (dong) => setExpandedDongs(prev => {
        const next = new Set(prev);
        next.has(dong) ? next.delete(dong) : next.add(dong);
        onExpandedDongsChange?.({ expandedDongs: [...next] });
        return next;
    });
    const handleUnderdueDongRefresh = async (dong) => {
        setUnderdueRefreshing(true);
        await Promise.all([loadInspectedNames(), loadDeferNames()]);
        setUnderdueRefreshed(prev => {
            const next = new Map(prev);
            next.set(dong, new Set(['ac', 'hg']));
            return next;
        });
        setUnderdueRefreshing(false);
    };
    const toggleUnderdueDong = (dong) => setUnderdueExpandedDongs(prev => {
        const next = new Set(prev);
        next.has(dong) ? next.delete(dong) : next.add(dong);
        onExpandedDongsChange?.({ underdueExpandedDongs: [...next] });
        return next;
    });
    const handleByBuildingDongRefresh = async (dong) => {
        setByBuildingRefreshing(true);
        await Promise.all([loadInspectedNames(), loadDeferNames()]);
        setByBuildingRefreshed(prev => {
            const next = new Map(prev);
            next.set(dong, true);
            return next;
        });
        setByBuildingRefreshing(false);
    };
    const toggleByBuildingDong = (dong) => setByBuildingExpandedDongs(prev => {
        const next = new Set(prev);
        next.has(dong) ? next.delete(dong) : next.add(dong);
        onExpandedDongsChange?.({ byBuildingExpandedDongs: [...next] });
        return next;
    });
    const toggleByBuildingBuilding = (key) => setByBuildingExpandedBuildings(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        onExpandedDongsChange?.({ byBuildingExpandedBuildings: [...next] });
        return next;
    });

    const typeColor = (t) => t === '학원' ? '#3b82f6' : t === '교습소' ? '#8b5cf6' : '#10b981';

    const Th = ({ children, style }) => (
        <th style={{ padding: '7px 10px', fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-muted)', background: 'var(--bg-main)', borderBottom: '2px solid var(--border-color)', textAlign: 'left', whiteSpace: 'nowrap', ...style }}>{children}</th>
    );
    const Td = ({ children, style, onClick }) => (
        <td style={{ padding: '6px 10px', fontSize: '0.8rem', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', ...style }} onClick={onClick}>{children}</td>
    );
    const Badge = ({ count, color }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '22px', height: '20px', borderRadius: '10px', padding: '0 6px', background: count > 0 ? (color || '#ef4444') : '#94a3b8', color: 'white', fontSize: '0.72rem', fontWeight: '800' }}>{count}</span>
    );
    const showCopyToast = (text) => {
        setCopyToast(text);
        setTimeout(() => setCopyToast(null), 2000);
    };
    const NameLink = ({ id, type, name }) => {
        const fullName = name || '-';
        const handleCopy = (e) => {
            e.stopPropagation();
            if (navigator.clipboard) {
                navigator.clipboard.writeText(fullName).catch(() => {});
            }
            showCopyToast(fullName);
        };
        const CopyBtn = () => (
            <span
                onClick={handleCopy}
                title="학원명 복사"
                style={{ cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
            >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </span>
        );
        if (!id) return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontWeight: '600' }}>{fullName}</span>
                <CopyBtn />
            </span>
        );
        const pool = type === '교습소' ? hList : aList;
        const item = pool.find(a => a.id === id);
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span
                    onClick={item ? (e) => { e.stopPropagation(); onSelectAcademy(item); } : undefined}
                    style={{ fontWeight: '700', color: 'var(--primary)', cursor: item ? 'pointer' : 'default', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    title="클릭하여 상세보기"
                >{fullName}</span>
                <CopyBtn />
            </span>
        );
    };
    const NavCell = ({ id, type, children, style }) => {
        if (!onSelectAcademy || !id) return <Td style={style}>{children}</Td>;
        const pool = type === '교습소' ? hList : aList;
        const item = pool.find(a => a.id === id);
        return (
            <Td style={{ ...style, cursor: item ? 'pointer' : undefined }} onClick={item ? () => onSelectAcademy(item) : undefined}>{children}</Td>
        );
    };
    const CautionSection = ({ id, title, badge, badgeColor, children }) => {
        const isOpen = openSections[id];
        return (
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', marginBottom: '12px' }}>
                <button onClick={() => toggleSection(id)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Badge count={badge} color={badgeColor} />
                        <span style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-main)', textAlign: 'left' }}>{title}</span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '8px', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                    <div style={{ marginTop: '10px' }}>
                        {badge === 0
                            ? <div style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: '600', padding: '4px 0' }}>✓ 이상 없음</div>
                            : <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>{children}</div>
                        }
                    </div>
                )}
            </div>
        );
    };

    // ── 점검 우선순위 헬퍼 ──
    const CAUTION_CLOSED = ['폐원', '폐소', '정지', '취소', '직권'];
    const isClosed = (a) => CAUTION_CLOSED.some(s => (a.status || '').includes(s));
    // 학원·교습소는 등록번호(id) 채번 체계가 서로 달라 같은 id가 우연히 겹칠 수 있으므로
    // feeSet/insSet 조회 시 반드시 유형(type)까지 합친 키로 구분한다.
    const catType = (a) => a.category === '교습소' ? '교습소' : '학원';
    const idKey = (type, id) => `${type}::${id}`;
    const isMidnightInsp = (insp) => ['심야', '야간'].some(k => (insp.inspectionType || '').includes(k));
    const lastRegularDate = (a) => {
        const r = (a.inspections || []).filter(i => !isMidnightInsp(i));
        const insD = r.length ? toDateRev(r[0].date) : null;
        const niceD = toDateRev(a.niceInspectionDate);
        return (insD && niceD) ? (insD > niceD ? insD : niceD) : (insD || niceD);
    };
    const uninspMonths = (a, today) => {
        const neisD = lastRegularDate(a);
        const sheetD = inspectedDates.get(normName(a.name)) || null;
        const base = (neisD && sheetD) ? (neisD > sheetD ? neisD : sheetD)
            : (neisD || sheetD || toDateRev(a.regDate));
        if (!base) return 999;
        return Math.floor((today - base) / 2629800000);
    };
    const getInspCategory = (a) => {
        const txt = (a.courses || []).map(c => (c.process || '') + ' ' + (c.track || '')).join(' ');
        if (/음악|미술|무용|체육|예능|피아노|바이올린|미술|태권/.test(txt)) return '예능';
        if (/어학|영어|중국어|일어|일본어|TOEIC|토익/.test(txt)) return '어학';
        return '보습';
    };
    const getDong = (a) => getDongFromAddr(a.address || '', region === '하남' ? HANAM_DONG_SET : GWANGJU_DONG_SET);
    const buildReasons = (months, viol, hasFee, hasIns, neverInspected, regMonths) => {
        const parts = [];
        if (neverInspected) parts.push(`등록 ${regMonths > 0 ? regMonths + '개월 후 ' : ''}미점검`);
        else if (months >= 24) {
            const y = Math.floor(months / 12), m = months % 12;
            parts.push(`${y > 0 ? y + '년 ' : ''}${m > 0 ? m + '개월 ' : ''}미점검`);
        } else if (months > 0) parts.push(`${months}개월 미점검`);
        if (hasFee) parts.push('교습비 초과');
        if (hasIns) parts.push('보험 만료/미가입');
        if (viol > 0) parts.push(`이력: 위반 ${viol}건 시정완료`);
        return parts;
    };
    const ReasonTags = ({ reasons }) => reasons.length === 0 ? null : (
        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4, whiteSpace: 'normal' }}>
            {reasons.join(' · ')}
        </div>
    );
    const ContactInfo = ({ a }) => {
        const name = a.founder?.name || '';
        const tel = a.founder?.mobile || a.founder?.phone || '';
        if (!name && !tel) return null;
        return (
            <div style={{ fontSize: '0.71rem', marginTop: '1px', lineHeight: 1.5 }}>
                {name && <span style={{ color: 'var(--text-muted)' }}>{name}</span>}
                {name && tel && <span style={{ color: 'var(--text-muted)' }}> · </span>}
                {tel && <a href={`tel:${tel}`} onClick={e => e.stopPropagation()} style={{ color: '#3b82f6', fontWeight: '600', textDecoration: 'none' }}>{tel}</a>}
            </div>
        );
    };
    // 학원/교습소 분리 서브 헤더
    const TypeSubHeader = ({ label, count, color, colSpan }) => (
        <tr>
            <td colSpan={colSpan} style={{ padding: '4px 10px 2px 14px', fontSize: '0.73rem', fontWeight: '800', color, background: color + '10', borderBottom: '1px solid var(--border-color)' }}>
                {label} <span style={{ fontWeight: '400', color: 'var(--text-muted)' }}>({count})</span>
            </td>
        </tr>
    );

    // A. 보험 만료/미가입 (검토 탭에서 이전)
    const insuranceIssues = useMemo(() => {
        const today = new Date();
        const check = (list, type) => list.filter(a => !isClosed(a)).map(a => {
            if (!a.insurances || a.insurances.length === 0)
                return { type, id: a.id, name: a.name, phone: a.founder?.phone || '', mobile: a.founder?.mobile || '', issue: '미가입' };
            const hasActive = a.insurances.some(ins => { const e = toDateRev(ins.endDate); return e && e >= today; });
            if (hasActive) return null;
            const latest = a.insurances.reduce((b, ins) => {
                const d = toDateRev(ins.endDate), bd = b ? toDateRev(b.endDate) : null;
                return d && (!bd || d > bd) ? ins : b;
            }, null);
            return { type, id: a.id, name: a.name, phone: a.founder?.phone || '', mobile: a.founder?.mobile || '', issue: `만료 (${latest?.endDate || '-'})` };
        }).filter(Boolean);
        return [...check(aList, '학원'), ...check(hActiveList, '교습소')];
    }, [aList, hActiveList]);

    // B. 교습비 단가 기준 초과 (unitPrice > standardUnitPrice)
    const ADULT_KEYWORDS = ['성인', '일반인', '직장', '주부', '노인'];
    // 과정 레벨 축약 (음악·미술·무용 유초중고 구분용)
    const procLevel = (proc) => {
        if (proc.includes('유아')) return '유';
        if (proc.includes('초등')) return '초';
        if (proc.includes('중등')) return '중';
        if (proc.includes('고등')) return '고';
        return '';
    };
    // 분당단가 값 + 교습계열(track) + 교습과정(process) → 기준단가 레이블
    const getStdLabel = (std, track, process) => {
        const p = Math.round(std);
        const t = (track || '');
        const proc = (process || '');
        if (p === 210) return '보습-단과(초등)';
        if (p === 222) return '보습-단과(중등)';
        if (p === 259) return '어학';
        if (p === 336) return '음악-입시';
        if (p === 234) return t.includes('진학') ? '진학상담' : '보습-단과(고등)';
        if (p === 224) { const lv = procLevel(proc); return lv ? `음악-${lv}` : '음악'; }
        if (p === 212) {
            const lv = procLevel(proc);
            if (t.includes('미술')) return lv ? `미술-${lv}` : '미술';
            if (t.includes('무용')) return lv ? `무용-${lv}` : '무용';
            return lv ? `${lv}` : '';
        }
        if (p === 255) {
            if (t.includes('미술')) return '미술-입시';
            if (t.includes('무용')) return '무용-입시';
            return '입시';
        }
        if (p === 230) return t.includes('정보') ? '정보-일반' : '기타-일반';
        return '';
    };
    const feeExceed = useMemo(() => {
        const results = [];
        [...aList, ...hActiveList].filter(a => !isClosed(a)).forEach(a => {
            if ((a.category || '').includes('평생직업')) return;
            (a.courses || []).forEach(course => {
                const proc = course.process || '';
                const subj = course.subject || '';
                if (ADULT_KEYWORDS.some(k => proc.includes(k) || subj.includes(k))) return;
                const unit = parseFloat((course.unitPrice || '').toString().replace(/,/g, ''));
                const std  = parseFloat((course.standardUnitPrice || '').toString().replace(/,/g, ''));
                if (unit > 0 && std > 0 && unit > std) {
                    results.push({
                        type: a.category === '교습소' ? '교습소' : '학원',
                        id: a.id, name: a.name,
                        subject: course.subject || '-',
                        stdLabel: getStdLabel(std, course.track, course.process),
                        unit, std,
                        diff: Math.round(unit - std),
                    });
                }
            });
        });
        return results;
    }, [aList, hActiveList]);

    // ── C. 점검 우선순위 (신설미점검 전체 + 1년이상 미점검) ──
    const riskList = useMemo(() => {
        const today = new Date();
        const feeSet = new Set(feeExceed.map(f => idKey(f.type, f.id)));
        const insSet = new Set(insuranceIssues.map(i => idKey(i.type, i.id)));
        return [...aList, ...hActiveList]
            .filter(a => !isClosed(a) && !deferNames.has(normName(a.name)))
            .map(a => {
                const months = uninspMonths(a, today);
                const neverInspected = !lastRegularDate(a) && !inspectedDates.has(normName(a.name));
                const regD = toDateRev(a.regDate);
                const regMonths = regD ? Math.floor((today - regD) / 2629800000) : 0;
                const viol = (a.inspections || []).filter(i => i.isViolation && !isMidnightInsp(i)).length;
                const hasFee = feeSet.has(idKey(catType(a), a.id));
                const hasIns = insSet.has(idKey(catType(a), a.id));
                const score = Math.min(months / 48, 1) * 0.8
                    + (hasFee ? 0.1 : 0)
                    + (hasIns ? 0.1 : 0);
                const reasons = buildReasons(months, viol, hasFee, hasIns, neverInspected, regMonths);
                const dong = getDong(a);
                const inspCategory = getInspCategory(a);
                return { ...a, score, months, viol, hasFee, hasIns, neverInspected, regMonths, reasons, dong, inspCategory };
            })
            .filter(a => a.neverInspected || a.months >= 12)
            .sort((a, b) => b.score - a.score);
    }, [aList, hActiveList, feeExceed, insuranceIssues, deferNames, inspectedDates]);

    // ── D. 2년 이상 미점검 ──
    const overdueList = useMemo(() => {
        const today = new Date();
        const feeSet = new Set(feeExceed.map(f => idKey(f.type, f.id)));
        const insSet = new Set(insuranceIssues.map(i => idKey(i.type, i.id)));
        return [...aList, ...hActiveList]
            .filter(a => !isClosed(a) && !deferNames.has(normName(a.name)))
            .map(a => {
                const months = uninspMonths(a, today);
                const neverInspected = !lastRegularDate(a) && !inspectedDates.has(normName(a.name));
                const regD = toDateRev(a.regDate);
                const regMonths = regD ? Math.floor((today - regD) / 2629800000) : 0;
                const viol = (a.inspections || []).filter(i => i.isViolation && !isMidnightInsp(i)).length;
                const hasFee = feeSet.has(idKey(catType(a), a.id));
                const hasIns = insSet.has(idKey(catType(a), a.id));
                const reasons = buildReasons(months, viol, hasFee, hasIns, neverInspected, regMonths);
                const dong = getDong(a);
                return { ...a, months, viol, hasFee, hasIns, neverInspected, regMonths, reasons, dong };
            })
            .filter(a => a.months >= 24)
            .sort((a, b) => b.months - a.months);
    }, [aList, hActiveList, feeExceed, insuranceIssues, deferNames, inspectedDates]);

    // ── D-2. 2년이상 미점검 동별 그룹핑 ──
    const overdueByDong = useMemo(() => {
        const map = new Map();
        overdueList.forEach(a => {
            const d = a.dong || '미분류';
            if (!map.has(d)) map.set(d, []);
            map.get(d).push(a);
        });
        return [...map.entries()]
            .map(([dong, items]) => ({ dong, items, maxMonths: items[0].months }))
            .sort((a, b) => b.maxMonths - a.maxMonths);
    }, [overdueList]);

    // ── D-3. 2년 미만 미점검 ──
    const underdueList = useMemo(() => {
        const today = new Date();
        const feeSet = new Set(feeExceed.map(f => idKey(f.type, f.id)));
        const insSet = new Set(insuranceIssues.map(i => idKey(i.type, i.id)));
        return [...aList, ...hActiveList]
            .filter(a => !isClosed(a) && !deferNames.has(normName(a.name)))
            .map(a => {
                const months = uninspMonths(a, today);
                const neverInspected = !lastRegularDate(a) && !inspectedDates.has(normName(a.name));
                const regD = toDateRev(a.regDate);
                const regMonths = regD ? Math.floor((today - regD) / 2629800000) : 0;
                const viol = (a.inspections || []).filter(i => i.isViolation && !isMidnightInsp(i)).length;
                const hasFee = feeSet.has(idKey(catType(a), a.id));
                const hasIns = insSet.has(idKey(catType(a), a.id));
                const reasons = buildReasons(months, viol, hasFee, hasIns, neverInspected, regMonths);
                const dong = getDong(a);
                return { ...a, months, viol, hasFee, hasIns, neverInspected, regMonths, reasons, dong };
            })
            .filter(a => a.months >= 1 && a.months < 24)
            .sort((a, b) => b.months - a.months);
    }, [aList, hActiveList, feeExceed, insuranceIssues, deferNames, inspectedDates]);

    // ── D-4. 2년 미만 미점검 동별 그룹핑 ──
    const underdueByDong = useMemo(() => {
        const map = new Map();
        underdueList.forEach(a => {
            const d = a.dong || '미분류';
            if (!map.has(d)) map.set(d, []);
            map.get(d).push(a);
        });
        return [...map.entries()]
            .map(([dong, items]) => ({ dong, items, maxMonths: items[0].months }))
            .sort((a, b) => b.maxMonths - a.maxMonths);
    }, [underdueList]);

    // ── D-5. 1~2년 미점검 동별+건물별 그룹핑 ──
    const byBuildingList = useMemo(() => {
        const today = new Date();
        const feeSet = new Set(feeExceed.map(f => idKey(f.type, f.id)));
        const insSet = new Set(insuranceIssues.map(i => idKey(i.type, i.id)));
        return [...aList, ...hActiveList]
            .filter(a => !isClosed(a) && !deferNames.has(normName(a.name)))
            .map(a => {
                const months = uninspMonths(a, today);
                const neverInspected = !lastRegularDate(a) && !inspectedDates.has(normName(a.name));
                const regD = toDateRev(a.regDate);
                const regMonths = regD ? Math.floor((today - regD) / 2629800000) : 0;
                const viol = (a.inspections || []).filter(i => i.isViolation && !isMidnightInsp(i)).length;
                const hasFee = feeSet.has(idKey(catType(a), a.id));
                const hasIns = insSet.has(idKey(catType(a), a.id));
                const reasons = buildReasons(months, viol, hasFee, hasIns, neverInspected, regMonths);
                const dong = getDong(a);
                const building = getBuilding(a.address);
                return { ...a, months, viol, hasFee, hasIns, neverInspected, regMonths, reasons, dong, building };
            })
            .filter(a => a.months >= 12 && a.months < 24)
            .sort((a, b) => b.months - a.months);
    }, [aList, hActiveList, feeExceed, insuranceIssues, deferNames, inspectedDates]);

    const byBuildingByDong = useMemo(() => {
        const dongMap = new Map();
        byBuildingList.forEach(a => {
            const d = a.dong || '미분류';
            if (!dongMap.has(d)) dongMap.set(d, new Map());
            const bldgMap = dongMap.get(d);
            const b = a.building || '주소미상';
            if (!bldgMap.has(b)) bldgMap.set(b, []);
            bldgMap.get(b).push(a);
        });
        return [...dongMap.entries()]
            .map(([dong, bldgMap]) => {
                const buildings = [...bldgMap.entries()]
                    .map(([building, items]) => ({ building, items, maxMonths: items[0].months }))
                    .sort((a, b) => b.maxMonths - a.maxMonths);
                const total = buildings.reduce((s, b) => s + b.items.length, 0);
                return { dong, buildings, total, maxMonths: buildings[0].maxMonths };
            })
            .sort((a, b) => b.maxMonths - a.maxMonths);
    }, [byBuildingList]);

    // ── G. 주간 점검 일정 (이번 주 + 4주) — 전체 풀 사용 ──
    const weeklyPlan = useMemo(() => {
        const today = new Date();
        const feeSet = new Set(feeExceed.map(f => idKey(f.type, f.id)));
        const insSet = new Set(insuranceIssues.map(i => idKey(i.type, i.id)));
        // 전체 활성 기관을 위험지수 순으로 정렬한 풀 (riskList와 달리 상위 30 제한 없음)
        const fullPool = [...aList, ...hActiveList]
            .filter(a => !isClosed(a) && !deferNames.has(normName(a.name)))
            .map(a => {
                const months = uninspMonths(a, today);
                const neverInspected = !lastRegularDate(a) && !inspectedDates.has(normName(a.name));
                const regD = toDateRev(a.regDate);
                const regMonths = regD ? Math.floor((today - regD) / 2629800000) : 0;
                const viol = (a.inspections || []).filter(i => i.isViolation && !isMidnightInsp(i)).length;
                const hasFee = feeSet.has(idKey(catType(a), a.id));
                const hasIns = insSet.has(idKey(catType(a), a.id));
                const score = Math.min(months / 48, 1) * 0.8
                    + (hasFee ? 0.1 : 0)
                    + (hasIns ? 0.1 : 0);
                const reasons = buildReasons(months, viol, hasFee, hasIns, neverInspected, regMonths);
                const dong = getDong(a);
                const inspCategory = getInspCategory(a);
                return { ...a, score, months, viol, hasFee, hasIns, neverInspected, regMonths, reasons, dong, inspCategory };
            })
            .sort((a, b) => b.score - a.score);
        if (fullPool.length === 0) return [];
        // 이번 주 월요일
        const dayOfWeek = today.getDay(); // 0=일
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        monday.setHours(0, 0, 0, 0);

        const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
        const EXAM_RANGES = [[4,13,30],[6,15,30],[7,1,3],[10,12,30],[11,10,22],[11,27,30],[12,1,11]];
        const VAC_RANGES  = [[7,21,31],[8,1,31],[12,24,31]];
        const inRange = (d, ranges) => {
            const m = d.getMonth() + 1, day = d.getDate();
            return ranges.some(([rm, rs, re]) => m === rm && day >= rs && day <= re);
        };
        const getWeekType = (d) => {
            if (inRange(d, VAC_RANGES)) return '방학';
            if (inRange(d, EXAM_RANGES)) return '시험기간';
            return '평상시';
        };
        const isMidnightWeekFn = (d) => {
            const weekOfMonth = Math.ceil(d.getDate() / 7);
            return weekOfMonth === 1 || weekOfMonth === 3;
        };

        const pool = fullPool;
        const usedIds = new Set();
        const weeks = [];

        for (let w = 0; w < 5; w++) {
            const wStart = new Date(monday);
            wStart.setDate(monday.getDate() + w * 7);
            const wEnd = new Date(wStart);
            wEnd.setDate(wStart.getDate() + 4); // 금요일
            const weekType = getWeekType(wStart);
            const hasMidnight = isMidnightWeekFn(wStart);
            const quota = weekType === '방학' ? 5 : weekType === '시험기간' ? 8 : 12;
            const preferArts = weekType === '시험기간';

            const available = pool.filter(a => !usedIds.has(a.id));
            // 카테고리 우선 정렬
            const sorted = [...available].sort((a, b) => {
                const aMatch = preferArts ? a.inspCategory === '예능' : a.inspCategory === '보습';
                const bMatch = preferArts ? b.inspCategory === '예능' : b.inspCategory === '보습';
                if (aMatch !== bMatch) return aMatch ? -1 : 1;
                return b.score - a.score;
            });

            // 지역 클러스터링: 1등 학원의 동과 같은 동 우선
            const selected = [];
            if (sorted.length > 0) {
                const anchorDong = sorted[0].dong;
                const sameDong = sorted.filter(a => a.dong === anchorDong);
                const otherDong = sorted.filter(a => a.dong !== anchorDong);
                const ordered = [...sameDong, ...otherDong];
                for (const a of ordered) {
                    if (selected.length >= quota) break;
                    selected.push(a);
                    usedIds.add(a.id);
                }
            }

            // 심야 일정: 위험지수 높은 순 + 근접 지역
            let midnightList = [];
            if (hasMidnight) {
                const midPool = pool.filter(a => !usedIds.has(a.id)).sort((a, b) => b.score - a.score);
                if (midPool.length > 0) {
                    const anchorAddr = (midPool[0].address || '').slice(0, 6);
                    const nearFirst = midPool.filter(a => (a.address || '').startsWith(anchorAddr));
                    const rest = midPool.filter(a => !(a.address || '').startsWith(anchorAddr));
                    const midOrdered = [...nearFirst, ...rest];
                    for (const a of midOrdered) {
                        if (midnightList.length >= 10) break;
                        midnightList.push(a);
                        usedIds.add(a.id);
                    }
                }
            }

            weeks.push({
                label: `${fmt(wStart)} ~ ${fmt(wEnd)}`,
                weekType,
                hasMidnight,
                quota,
                academies: selected,
                midnightList,
            });
        }
        return weeks;
    }, [aList, hActiveList, feeExceed, insuranceIssues, deferNames, inspectedDates]);

    return (
        <div style={{ position: 'relative' }}>
            {/* 복사 토스트 */}
            {copyToast && (
                <div style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 18px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: '600', zIndex: 9999, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                    복사되었습니다: {copyToast}
                </div>
            )}
            {/* 요약 헤더 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px', border: '1px solid var(--border-color)', marginBottom: '14px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚠️ 운영 위반 점검
                    <a href="https://docs.google.com/spreadsheets/d/1zSGd9TBcJRculSJzUoZ2N8bB2iENuCI0x9KBpyfXMUo/edit?gid=1946422008#gid=1946422008" target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', fontWeight: '700', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}>시트</a>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    학원 {aList.length}개 · 교습소 {hActiveList.length}개 대상 점검 중.
                </div>
            </div>

            {/* 점검 경로 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px', border: '1px solid var(--border-color)', marginBottom: '12px', boxShadow: 'var(--shadow-sm)' }}>
                <button onClick={() => toggleSection('route')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Badge count={planDateMap.size} color="#0ea5e9" />
                        <span style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-main)', textAlign: 'left' }}>🗺️ 점검 경로</span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '8px', flexShrink: 0 }}>{openSections.route ? '▲' : '▼'}</span>
                </button>
                {openSections.route && (<div style={{ cursor: 'pointer' }} onClick={() => toggleSection('route')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {allRawRows.length > 0 && planDateMap.size === 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>계획된 점검 일정 없음</span>
                    )}
                    {planDateMap.size > 0 && (
                        <select
                            value={routeDate}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { setRouteDate(e.target.value); onRouteDateChange?.(e.target.value); }}
                            style={{ fontSize: '0.78rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-light)', color: 'var(--text-main)', cursor: 'pointer' }}
                        >
                            <option value="">날짜 선택...</option>
                            {[...planDateMap.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([date, rows]) => (
                                <option key={date} value={date}>{date} ({rows.length}건)</option>
                            ))}
                        </select>
                    )}
                    <button
                        onClick={e => { e.stopPropagation(); loadInspectedNames(); }}
                        title="구글시트에서 최신 일정 다시 불러오기"
                        style={{ fontSize: '0.8rem', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-light)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >↺</button>
                    {manualOrderMap.has(routeDate) && (
                        <button
                            onClick={e => { e.stopPropagation(); resetRouteOrder(); }}
                            title="수동 순서를 초기화하고 자동 정렬로 돌아가기"
                            style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', border: '1px solid #f97316', background: '#fff7ed', color: '#f97316', cursor: 'pointer', fontWeight: '700' }}
                        >순서 초기화</button>
                    )}
                </div>
                {routeDate && routeAcademiesSorted.length === 0 && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '8px' }}>매칭된 학원이 없습니다. 학원명을 확인해주세요.</div>
                )}
                {routeDate && routeAcademiesSorted.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '10px' }} onClick={e => e.stopPropagation()}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr>
                                        <Th style={{ width: '32px', textAlign: 'center' }}>#</Th>
                                        <Th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-main)' }}>학원명</Th>
                                        <Th style={{ textAlign: 'right' }}>이동</Th>
                                        <Th>주소</Th>
                                        <Th>성명</Th>
                                        <Th>전화번호</Th>
                                        <Th style={{ textAlign: 'right' }}>미점검기간</Th>
                                    </tr>
                                </thead>
                                <tbody ref={routeTbodyRef}>
                                    {(() => {
                                        // 하남종합운동장 본부석 — 첫 번째 학원의 기준점
                                        const BASE_LAT = 37.5674619;
                                        const BASE_LNG = 127.1961543;
                                        const arrows8 = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
                                        const calcArrow = (fromLat, fromLng, toLat, toLng) => {
                                            const dLat = toLat - fromLat;
                                            const dLng = toLng - fromLng;
                                            const angle = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
                                            return arrows8[Math.round(angle / 45) % 8];
                                        };
                                        const fmtDist = (km) => km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
                                        return routeAcademiesFinal.map((a, i) => {
                                            const prev = i === 0 ? null : routeAcademiesFinal[i - 1];
                                            const fromLat = i === 0 ? BASE_LAT : prev?._lat;
                                            const fromLng = i === 0 ? BASE_LNG : prev?._lng;
                                            const moveLabel = (() => {
                                                if (a._lat == null || fromLat == null) return null;
                                                const dist = i === 0 ? haversineKm(BASE_LAT, BASE_LNG, a._lat, a._lng) : a._dist;
                                                if (dist == null) return null;
                                                const arrow = calcArrow(fromLat, fromLng, a._lat, a._lng);
                                                return `${arrow} ${fmtDist(dist)}`;
                                            })();
                                            const isDragging = dragState.dragging === i;
                                            const isDragOver = dragState.over === i && dragState.dragging !== i;
                                            return (
                                            <tr
                                                key={`${a.id}-${i}`}
                                                data-drag-idx={i}
                                                draggable
                                                onDragStart={e => handleDragStart(e, i)}
                                                onDragOver={e => handleDragOver(e, i)}
                                                onDrop={e => handleDrop(e, i, routeAcademiesFinal)}
                                                onDragEnd={handleDragEnd}
                                                onTouchStart={e => handleTouchStart(e, i)}
                                                onTouchEnd={() => handleTouchEnd(routeAcademiesFinal)}
                                                style={{
                                                    background: isDragOver ? 'rgba(99,102,241,0.1)' : i % 2 === 0 ? 'transparent' : 'var(--bg-main)',
                                                    opacity: isDragging ? 0.4 : 1,
                                                    borderTop: isDragOver ? '2px solid #6366f1' : undefined,
                                                    cursor: 'grab',
                                                }}
                                            >
                                                <Td style={{ textAlign: 'center', fontWeight: '800', color: '#f97316', userSelect: 'none' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                                        <span style={{ color: '#cbd5e1', fontSize: '0.75rem', lineHeight: 1 }}>⠿</span>
                                                        {a._order}
                                                    </div>
                                                </Td>
                                                <Td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-card)', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {onSelectAcademy
                                                        ? <span onClick={() => onSelectAcademy(a)} style={{ fontWeight: '700', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{a.name}</span>
                                                        : <span style={{ fontWeight: '600' }}>{a.name}</span>
                                                    }
                                                </Td>
                                                <Td style={{ textAlign: 'right' }}>
                                                    {moveLabel
                                                        ? <span style={{ color: '#10b981', fontWeight: '700', whiteSpace: 'nowrap' }}>{moveLabel}</span>
                                                        : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                                </Td>
                                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                                                    {a._schedule && <div style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: '600', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a._schedule}</div>}
                                                    {shortAddr(a.address)}
                                                </Td>
                                                <Td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{a.founder?.name || '-'}</Td>
                                                <Td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                                    {(a.founder?.mobile || a.founder?.phone)
                                                        ? <a href={`tel:${a.founder?.mobile || a.founder?.phone}`} onClick={e => e.stopPropagation()} style={{ color: '#3b82f6', fontWeight: '600', textDecoration: 'none' }}>{a.founder?.mobile || a.founder?.phone}</a>
                                                        : '-'}
                                                </Td>
                                                <Td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                                    {a._uninspectedPeriod
                                                        ? <span style={{ fontWeight: '700', color: (() => {
                                                            const s = a._uninspectedPeriod;
                                                            const y = parseInt((s.match(/(\d+)년/) || [])[1] || '0');
                                                            const mo = parseInt((s.match(/(\d+)개월/) || [])[1] || '0');
                                                            const total = y * 12 + mo;
                                                            return total >= 24 ? '#ef4444' : total >= 12 ? '#f97316' : '#10b981';
                                                          })() }}>{a._uninspectedPeriod}</span>
                                                        : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                                </Td>
                                            </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                </div>)}
            </div>
            {/* 인라인 경로 지도 — 항상 DOM에 있고, 경로 선택 시 표시 */}
            <div
                ref={routeMapContainerRef}
                style={{
                    width: '100%',
                    height: '320px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)',
                    marginBottom: '12px',
                    display: (openSections.route && routeDate && routeAcademiesFinal.length > 0) ? 'block' : 'none',
                }}
            />

            {/* G. 주간 점검 일정 추천 — 맨 위로 이동 */}
            <CautionSection id="weeklyPlan" title="📋 점검 일정 추천 (이번 주 + 4주)" badge={weeklyPlan.length} badgeColor="#14b8a6">
                {weeklyPlan.length === 0
                    ? <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px 0' }}>우선순위 데이터 없음</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {weeklyPlan.map((wk, wi) => {
                            const typeColors = { 방학: '#3b82f6', 시험기간: '#f59e0b', 평상시: '#10b981' };
                            const typeColor2 = typeColors[wk.weekType] || '#6366f1';
                            return (
                            <div key={wi} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                                {/* 주차 헤더 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: '800', fontSize: '0.85rem' }}>{wi === 0 ? '이번 주' : `+${wi}주`}</span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{wk.label}</span>
                                    <span style={{ fontSize: '0.74rem', padding: '2px 7px', borderRadius: '8px', background: typeColor2 + '22', color: typeColor2, fontWeight: '700' }}>{wk.weekType}</span>
                                    {wk.hasMidnight && <span style={{ fontSize: '0.74rem', padding: '2px 7px', borderRadius: '8px', background: '#1e293b', color: '#94a3b8', fontWeight: '700' }}>🌙 심야점검 포함</span>}
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>일반 {wk.academies.length}개{wk.hasMidnight ? ` + 심야 ${wk.midnightList.length}개` : ''}</span>
                                </div>
                                {/* 일반 점검 목록 */}
                                {wk.academies.length > 0 && (() => {
                                    const acItems = wk.academies.filter(a => a.category !== '교습소');
                                    const hgItems = wk.academies.filter(a => a.category === '교습소');
                                    const acType = (a) => a.category === '교습소' ? '교습소' : '학원';
                                    const renderRow = (a, ai) => (
                                        <tr key={`${a.id}_${ai}`} style={{ background: ai % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                            <NavCell id={a.id} type={acType(a)} style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{ai + 1}</NavCell>
                                            <Td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-card)', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <NameLink id={a.id} type={acType(a)} name={a.name} />
                                            </Td>
                                            <NavCell id={a.id} type={acType(a)} style={{ whiteSpace: 'nowrap' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: '600' }}>{a.founder?.name || '-'}</div>
                                                {(a.founder?.mobile || a.founder?.phone) && <span style={{ color: '#3b82f6', fontWeight: '600', fontSize: '0.75rem' }}>{a.founder?.mobile || a.founder?.phone}</span>}
                                            </NavCell>
                                            <NavCell id={a.id} type={acType(a)} style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{shortAddr(a.address)}</NavCell>
                                            <NavCell id={a.id} type={acType(a)}>{a.hasIns ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#d97706', fontWeight: '700' }}>⚠️보험</span> : <span style={{ color: '#10b981', fontSize: '0.78rem' }}>✓</span>}</NavCell>
                                            <NavCell id={a.id} type={acType(a)}>{a.viol > 0 ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '700' }}>{a.viol}건</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>-</span>}</NavCell>
                                            <NavCell id={a.id} type={acType(a)} style={{ color: a.score >= 0.7 ? '#ef4444' : a.score >= 0.4 ? '#f97316' : 'var(--text-muted)', fontWeight: '700', fontSize: '0.78rem' }}>{Math.round(a.score * 100)}</NavCell>
                                        </tr>
                                    );
                                    return (
                                        <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '360px' }}>
                                            <thead><tr>
                                                <Th style={{ width: '22px' }}>#</Th>
                                                <Th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-main)' }}>학원명</Th><Th>연락처</Th><Th>주소</Th><Th>보험</Th><Th>위반</Th><Th>점수</Th>
                                            </tr></thead>
                                            <tbody>
                                                {acItems.length > 0 && <TypeSubHeader label="🏫 학원" count={acItems.length} color="#3b82f6" colSpan={7} />}
                                                {acItems.map((a, ai) => renderRow(a, ai))}
                                                {hgItems.length > 0 && <TypeSubHeader label="🏠 교습소" count={hgItems.length} color="#8b5cf6" colSpan={7} />}
                                                {hgItems.map((a, ai) => renderRow(a, ai))}
                                            </tbody>
                                        </table>
                                        </div>
                                    );
                                })()}
                                {/* 심야 점검 목록 */}
                                {wk.hasMidnight && wk.midnightList.length > 0 && (() => {
                                    const acM = wk.midnightList.filter(a => a.category !== '교습소');
                                    const hgM = wk.midnightList.filter(a => a.category === '교습소');
                                    const acTypeM = (a) => a.category === '교습소' ? '교습소' : '학원';
                                    const renderRow = (a, ai) => (
                                        <tr key={`${a.id}_${ai}`} style={{ background: ai % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                                            <NavCell id={a.id} type={acTypeM(a)} style={{ color: 'var(--text-muted)', fontSize: '0.76rem', width: '22px' }}>{ai + 1}</NavCell>
                                            <Td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-card)', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <NameLink id={a.id} type={acTypeM(a)} name={a.name} />
                                            </Td>
                                            <NavCell id={a.id} type={acTypeM(a)} style={{ whiteSpace: 'nowrap' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: '600' }}>{a.founder?.name || '-'}</div>
                                                {(a.founder?.mobile || a.founder?.phone) && <span style={{ color: '#3b82f6', fontWeight: '600', fontSize: '0.75rem' }}>{a.founder?.mobile || a.founder?.phone}</span>}
                                            </NavCell>
                                            <NavCell id={a.id} type={acTypeM(a)} style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{shortAddr(a.address)}</NavCell>
                                            <NavCell id={a.id} type={acTypeM(a)}>{a.hasIns ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#d97706', fontWeight: '700' }}>⚠️보험</span> : <span style={{ color: '#10b981', fontSize: '0.78rem' }}>✓</span>}</NavCell>
                                            <NavCell id={a.id} type={acTypeM(a)}>{a.viol > 0 ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '700' }}>{a.viol}건</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>-</span>}</NavCell>
                                            <NavCell id={a.id} type={acTypeM(a)} style={{ color: '#64748b', fontWeight: '700', fontSize: '0.78rem' }}>{Math.round(a.score * 100)}</NavCell>
                                        </tr>
                                    );
                                    return (
                                        <div style={{ borderTop: '1px dashed var(--border-color)', background: 'rgba(30,41,59,0.04)' }}>
                                            <div style={{ padding: '5px 12px', fontSize: '0.76rem', fontWeight: '700', color: '#64748b' }}>🌙 심야점검 대상 ({wk.midnightList.length}개)</div>
                                            <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '360px' }}>
                                                <thead><tr>
                                                    <Th style={{ width: '22px' }}>#</Th>
                                                    <Th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-main)' }}>학원명</Th><Th>연락처</Th><Th>주소</Th><Th>보험</Th><Th>위반</Th><Th>점수</Th>
                                                </tr></thead>
                                                <tbody>
                                                    {acM.length > 0 && <TypeSubHeader label="🏫 학원" count={acM.length} color="#3b82f6" colSpan={7} />}
                                                    {acM.map((a, ai) => renderRow(a, ai))}
                                                    {hgM.length > 0 && <TypeSubHeader label="🏠 교습소" count={hgM.length} color="#8b5cf6" colSpan={7} />}
                                                    {hgM.map((a, ai) => renderRow(a, ai))}
                                                </tbody>
                                            </table>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                            );
                        })}
                    </div>
                }
            </CautionSection>

            {/* D. 2년 이상 미점검 (동별 아코디언) */}
            <CautionSection id="overdue" title="📅 2년 이상 미점검 학원·교습소 (동별)" badge={overdueList.length} badgeColor="#f59e0b">
                {(() => {
                    // 동별 학원 색상 팔레트 (초록 제외 — 교습소와 구분)
                    const DONG_AC_PALETTES = [
                        { bg: '#dbeafe', border: '#2563eb' },  // 파랑
                        { bg: '#e0e7ff', border: '#6366f1' },  // 인디고
                        { bg: '#ede9fe', border: '#7c3aed' },  // 보라
                        { bg: '#fce7f3', border: '#db2777' },  // 핑크
                        { bg: '#fff7ed', border: '#ea580c' },  // 오렌지
                        { bg: '#fef9c3', border: '#b45309' },  // 노랑
                        { bg: '#e0f2fe', border: '#0284c7' },  // 하늘
                        { bg: '#f1f5f9', border: '#475569' },  // 슬레이트
                    ];
                    const HG_COLOR = { bg: '#f0fdf4', border: '#10b981' };  // 교습소 고정 초록

                    const renderRow = (a, rowNum, rowBg, rowBorder) => {
                        const lastD = lastRegularDate(a);
                        const done = isInsp2026(a);
                        const aType = a.category === '교습소' ? '교습소' : '학원';
                        return (
                            <tr key={`${a.id}_${rowNum}`} style={{ opacity: done ? 0.5 : 1, background: rowBg, borderLeft: `3px solid ${rowBorder}` }}>
                                <Td style={{ color: 'var(--text-muted)', fontWeight: '700', fontSize: '0.76rem', textAlign: 'center', paddingLeft: '4px' }}>{rowNum}</Td>
                                <Td style={{ position: 'sticky', left: 0, zIndex: 1, background: rowBg, maxWidth: '130px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
                                            <NameLink id={a.id} type={aType} name={a.name} />
                                        </span>
                                        {done && <span style={{ fontSize: '0.67rem', color: '#6366f1', fontWeight: '700', flexShrink: 0 }}>(완료)</span>}
                                    </div>
                                </Td>
                                <NavCell id={a.id} type={aType} style={{ whiteSpace: 'nowrap' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: '600' }}>{a.founder?.name || '-'}</div>
                                    {(a.founder?.mobile || a.founder?.phone) && <span style={{ color: '#3b82f6', fontWeight: '600', fontSize: '0.75rem' }}>{a.founder?.mobile || a.founder?.phone}</span>}
                                </NavCell>
                                <Td style={{ color: a.months >= 36 ? '#ef4444' : '#f59e0b', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                    {a.neverInspected ? '미점검' : `${Math.floor(a.months/12)>0?Math.floor(a.months/12)+'년 ':''}${a.months%12>0?a.months%12+'개월':''}`}
                                </Td>
                                <Td>{a.hasIns ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#d97706', fontWeight: '700' }}>⚠️보험</span> : <span style={{ color: '#10b981', fontSize: '0.78rem' }}>✓</span>}</Td>
                                <Td>{a.viol > 0 ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '700' }}>{a.viol}건</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>-</span>}</Td>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                                    {a.neverInspected ? `등록: ${a.regDate || '-'}` : (lastD ? `${lastD.getFullYear()}.${String(lastD.getMonth()+1).padStart(2,'0')}.${String(lastD.getDate()).padStart(2,'0')}` : '-')}
                                </Td>
                            </tr>
                        );
                    };

                    return (
                        <div style={{ padding: '4px 0' }}>
                        {overdueByDong.map(({ dong, items }, dongIdx) => {
                            const refreshedCats = overdueRefreshed.get(dong) || new Set();
                            const allAcItems = items.filter(a => a.category !== '교습소');
                            const allHgItems = items.filter(a => a.category === '교습소');
                            const acItems = refreshedCats.has('ac') ? allAcItems.filter(a => !isInsp2026(a)) : allAcItems;
                            const hgItems = refreshedCats.has('hg') ? allHgItems.filter(a => !isInsp2026(a)) : allHgItems;
                            const acColor = DONG_AC_PALETTES[dongIdx % DONG_AC_PALETTES.length];
                            const isExpanded = expandedDongs.has(dong);

                            return (
                                <div key={dong} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                                    {/* 동 헤더 — 클릭으로 접기/펼치기 */}
                                    <div
                                        onClick={() => toggleDong(dong)}
                                        style={{ fontWeight: '700', padding: '7px 12px', fontSize: '0.8rem', color: 'var(--text-main)', background: 'var(--bg-main)', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                                    >
                                        <span>
                                            📍 {dong}
                                            {acItems.length > 0 && <span style={{ marginLeft: '6px', fontSize: '0.73rem', color: acColor.border, fontWeight: '700' }}>학원 {acItems.length}</span>}
                                            {hgItems.length > 0 && <span style={{ marginLeft: '4px', fontSize: '0.73rem', color: HG_COLOR.border, fontWeight: '700' }}>교습소 {hgItems.length}</span>}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleOverdueDongRefresh(dong); }}
                                                disabled={overdueRefreshing}
                                                style={{ fontSize: '0.69rem', padding: '1px 6px', borderRadius: '5px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: '600' }}
                                            >{overdueRefreshing ? '⟳' : '↺ 새로고침'}</button>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                                        </div>
                                    </div>
                                    {/* 펼쳐진 경우만 테이블 표시 */}
                                    {isExpanded && (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead><tr>
                                                    <Th style={{ width: '28px' }}>#</Th>
                                                    <Th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-main)' }}>학원명</Th>
                                                    <Th>연락처</Th><Th>미점검</Th><Th>보험</Th><Th>위반</Th><Th>마지막점검일</Th>
                                                </tr></thead>
                                                <tbody>
                                                    {/* 학원 — 동별 색상, 연번 1부터 */}
                                                    {acItems.map((a, i) => renderRow(a, i + 1, acColor.bg, acColor.border))}
                                                    {/* 교습소 — 고정 초록, 연번 1부터 */}
                                                    {hgItems.map((a, i) => renderRow(a, i + 1, HG_COLOR.bg, HG_COLOR.border))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    );
                })()}
            </CautionSection>

            {/* D-2. 2년 미만 미점검 (동별 아코디언) */}
            <CautionSection id="underdue" title="🕐 2년 미만 미점검 학원·교습소 (동별)" badge={underdueList.length} badgeColor="#3b82f6">
                {(() => {
                    const DONG_AC_PALETTES = [
                        { bg: '#dbeafe', border: '#2563eb' },
                        { bg: '#e0e7ff', border: '#6366f1' },
                        { bg: '#ede9fe', border: '#7c3aed' },
                        { bg: '#fce7f3', border: '#db2777' },
                        { bg: '#fff7ed', border: '#ea580c' },
                        { bg: '#fef9c3', border: '#b45309' },
                        { bg: '#e0f2fe', border: '#0284c7' },
                        { bg: '#f1f5f9', border: '#475569' },
                    ];
                    const HG_COLOR = { bg: '#f0fdf4', border: '#10b981' };

                    const renderRow = (a, rowNum, rowBg, rowBorder) => {
                        const lastD = lastRegularDate(a);
                        const done = isInsp2026(a);
                        const aType = a.category === '교습소' ? '교습소' : '학원';
                        return (
                            <tr key={`${a.id}_${rowNum}`} style={{ opacity: done ? 0.5 : 1, background: rowBg, borderLeft: `3px solid ${rowBorder}` }}>
                                <Td style={{ color: 'var(--text-muted)', fontWeight: '700', fontSize: '0.76rem', textAlign: 'center', paddingLeft: '4px' }}>{rowNum}</Td>
                                <Td style={{ position: 'sticky', left: 0, zIndex: 1, background: rowBg, maxWidth: '130px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
                                            <NameLink id={a.id} type={aType} name={a.name} />
                                        </span>
                                        {done && <span style={{ fontSize: '0.67rem', color: '#6366f1', fontWeight: '700', flexShrink: 0 }}>(완료)</span>}
                                    </div>
                                </Td>
                                <NavCell id={a.id} type={aType} style={{ whiteSpace: 'nowrap' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: '600' }}>{a.founder?.name || '-'}</div>
                                    {(a.founder?.mobile || a.founder?.phone) && <span style={{ color: '#3b82f6', fontWeight: '600', fontSize: '0.75rem' }}>{a.founder?.mobile || a.founder?.phone}</span>}
                                </NavCell>
                                <Td style={{ color: a.months >= 12 ? '#f59e0b' : '#3b82f6', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                    {a.neverInspected ? '미점검' : `${Math.floor(a.months/12)>0?Math.floor(a.months/12)+'년 ':''}${a.months%12>0?a.months%12+'개월':''}`}
                                </Td>
                                <Td>{a.hasIns ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#d97706', fontWeight: '700' }}>⚠️보험</span> : <span style={{ color: '#10b981', fontSize: '0.78rem' }}>✓</span>}</Td>
                                <Td>{a.viol > 0 ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '700' }}>{a.viol}건</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>-</span>}</Td>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                                    {a.neverInspected ? `등록: ${a.regDate || '-'}` : (lastD ? `${lastD.getFullYear()}.${String(lastD.getMonth()+1).padStart(2,'0')}.${String(lastD.getDate()).padStart(2,'0')}` : '-')}
                                </Td>
                            </tr>
                        );
                    };

                    return (
                        <div style={{ padding: '4px 0' }}>
                        {underdueByDong.map(({ dong, items }, dongIdx) => {
                            const refreshedCats = underdueRefreshed.get(dong) || new Set();
                            const allAcItems = items.filter(a => a.category !== '교습소');
                            const allHgItems = items.filter(a => a.category === '교습소');
                            const acItems = refreshedCats.has('ac') ? allAcItems.filter(a => !isInsp2026(a)) : allAcItems;
                            const hgItems = refreshedCats.has('hg') ? allHgItems.filter(a => !isInsp2026(a)) : allHgItems;
                            const acColor = DONG_AC_PALETTES[dongIdx % DONG_AC_PALETTES.length];
                            const isExpanded = underdueExpandedDongs.has(dong);

                            return (
                                <div key={dong} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                                    <div
                                        onClick={() => toggleUnderdueDong(dong)}
                                        style={{ fontWeight: '700', padding: '7px 12px', fontSize: '0.8rem', color: 'var(--text-main)', background: 'var(--bg-main)', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                                    >
                                        <span>
                                            📍 {dong}
                                            {acItems.length > 0 && <span style={{ marginLeft: '6px', fontSize: '0.73rem', color: acColor.border, fontWeight: '700' }}>학원 {acItems.length}</span>}
                                            {hgItems.length > 0 && <span style={{ marginLeft: '4px', fontSize: '0.73rem', color: HG_COLOR.border, fontWeight: '700' }}>교습소 {hgItems.length}</span>}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleUnderdueDongRefresh(dong); }}
                                                disabled={underdueRefreshing}
                                                style={{ fontSize: '0.69rem', padding: '1px 6px', borderRadius: '5px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: '600' }}
                                            >{underdueRefreshing ? '⟳' : '↺ 새로고침'}</button>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead><tr>
                                                    <Th style={{ width: '28px' }}>#</Th>
                                                    <Th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-main)' }}>학원명</Th>
                                                    <Th>연락처</Th><Th>미점검</Th><Th>보험</Th><Th>위반</Th><Th>마지막점검일</Th>
                                                </tr></thead>
                                                <tbody>
                                                    {acItems.map((a, i) => renderRow(a, i + 1, acColor.bg, acColor.border))}
                                                    {hgItems.map((a, i) => renderRow(a, i + 1, HG_COLOR.bg, HG_COLOR.border))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    );
                })()}
            </CautionSection>

            {/* D-3. 1~2년 미점검 (동별+건물별 아코디언) */}
            <CautionSection id="bybuilding" title="🏢 1~2년 미점검 학원·교습소 (동별, 건물별)" badge={byBuildingList.length} badgeColor="#8b5cf6">
                {(() => {
                    const DONG_AC_PALETTES = [
                        { bg: '#dbeafe', border: '#2563eb' },
                        { bg: '#e0e7ff', border: '#6366f1' },
                        { bg: '#ede9fe', border: '#7c3aed' },
                        { bg: '#fce7f3', border: '#db2777' },
                        { bg: '#fff7ed', border: '#ea580c' },
                        { bg: '#fef9c3', border: '#b45309' },
                        { bg: '#e0f2fe', border: '#0284c7' },
                        { bg: '#f1f5f9', border: '#475569' },
                    ];
                    const HG_COLOR = { bg: '#f0fdf4', border: '#10b981' };

                    const renderRow = (a, rowNum, rowBg, rowBorder) => {
                        const lastD = lastRegularDate(a);
                        const done = isInsp2026(a);
                        const aType = a.category === '교습소' ? '교습소' : '학원';
                        return (
                            <tr key={`${a.id}_${rowNum}`} style={{ opacity: done ? 0.5 : 1, background: rowBg, borderLeft: `3px solid ${rowBorder}` }}>
                                <Td style={{ color: 'var(--text-muted)', fontWeight: '700', fontSize: '0.76rem', textAlign: 'center', paddingLeft: '4px' }}>{rowNum}</Td>
                                <Td style={{ position: 'sticky', left: 0, zIndex: 1, background: rowBg, maxWidth: '130px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
                                            <NameLink id={a.id} type={aType} name={a.name} />
                                        </span>
                                        {done && <span style={{ fontSize: '0.67rem', color: '#6366f1', fontWeight: '700', flexShrink: 0 }}>(완료)</span>}
                                    </div>
                                </Td>
                                <NavCell id={a.id} type={aType} style={{ whiteSpace: 'nowrap' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: '600' }}>{a.founder?.name || '-'}</div>
                                    {(a.founder?.mobile || a.founder?.phone) && <span style={{ color: '#3b82f6', fontWeight: '600', fontSize: '0.75rem' }}>{a.founder?.mobile || a.founder?.phone}</span>}
                                </NavCell>
                                <Td style={{ color: '#f59e0b', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                    {a.neverInspected ? '미점검' : `${Math.floor(a.months/12)>0?Math.floor(a.months/12)+'년 ':''}${a.months%12>0?a.months%12+'개월':''}`}
                                </Td>
                                <Td>{a.hasIns ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#d97706', fontWeight: '700' }}>⚠️보험</span> : <span style={{ color: '#10b981', fontSize: '0.78rem' }}>✓</span>}</Td>
                                <Td>{a.viol > 0 ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '700' }}>{a.viol}건</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>-</span>}</Td>
                                <Td style={{ color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                                    {a.neverInspected ? `등록: ${a.regDate || '-'}` : (lastD ? `${lastD.getFullYear()}.${String(lastD.getMonth()+1).padStart(2,'0')}.${String(lastD.getDate()).padStart(2,'0')}` : '-')}
                                </Td>
                            </tr>
                        );
                    };

                    return (
                        <div style={{ padding: '4px 0' }}>
                        {byBuildingByDong.map(({ dong, buildings, total }, dongIdx) => {
                            const isDongExpanded = byBuildingExpandedDongs.has(dong);
                            const refreshed = byBuildingRefreshed.get(dong);
                            const acColor = DONG_AC_PALETTES[dongIdx % DONG_AC_PALETTES.length];
                            const acCount = byBuildingList.filter(a => a.dong === dong && a.category !== '교습소').length;
                            const hgCount = byBuildingList.filter(a => a.dong === dong && a.category === '교습소').length;

                            return (
                                <div key={dong} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                                    {/* 동 헤더 */}
                                    <div
                                        onClick={() => toggleByBuildingDong(dong)}
                                        style={{ fontWeight: '700', padding: '7px 12px', fontSize: '0.8rem', color: 'var(--text-main)', background: 'var(--bg-main)', borderBottom: isDongExpanded ? '1px solid var(--border-color)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                                    >
                                        <span>
                                            📍 {dong}
                                            {acCount > 0 && <span style={{ marginLeft: '6px', fontSize: '0.73rem', color: acColor.border, fontWeight: '700' }}>학원 {acCount}</span>}
                                            {hgCount > 0 && <span style={{ marginLeft: '4px', fontSize: '0.73rem', color: HG_COLOR.border, fontWeight: '700' }}>교습소 {hgCount}</span>}
                                            <span style={{ marginLeft: '6px', fontSize: '0.71rem', color: 'var(--text-muted)', fontWeight: '500' }}>({buildings.length}개 건물)</span>
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleByBuildingDongRefresh(dong); }}
                                                disabled={byBuildingRefreshing}
                                                style={{ fontSize: '0.69rem', padding: '1px 6px', borderRadius: '5px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: '600' }}
                                            >{byBuildingRefreshing ? '⟳' : '↺ 새로고침'}</button>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{isDongExpanded ? '▲' : '▼'}</span>
                                        </div>
                                    </div>
                                    {/* 건물별 중첩 아코디언 */}
                                    {isDongExpanded && (
                                        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {buildings.map(({ building, items }) => {
                                                const bldgKey = `${dong}__${building}`;
                                                const isBldgExpanded = byBuildingExpandedBuildings.has(bldgKey);
                                                const displayItems = refreshed ? items.filter(a => !isInsp2026(a)) : items;
                                                const bldgAcCount = displayItems.filter(a => a.category !== '교습소').length;
                                                const bldgHgCount = displayItems.filter(a => a.category === '교습소').length;
                                                return (
                                                    <div key={bldgKey} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                                                        <div
                                                            onClick={() => toggleByBuildingBuilding(bldgKey)}
                                                            style={{ padding: '5px 10px', fontSize: '0.77rem', fontWeight: '600', color: 'var(--text-main)', background: 'var(--bg-card)', borderBottom: isBldgExpanded ? '1px solid var(--border-color)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                                                        >
                                                            <span>
                                                                🏢 {building}
                                                                {bldgAcCount > 0 && <span style={{ marginLeft: '6px', fontSize: '0.71rem', color: acColor.border, fontWeight: '700' }}>학원 {bldgAcCount}</span>}
                                                                {bldgHgCount > 0 && <span style={{ marginLeft: '4px', fontSize: '0.71rem', color: HG_COLOR.border, fontWeight: '700' }}>교습소 {bldgHgCount}</span>}
                                                            </span>
                                                            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{isBldgExpanded ? '▲' : '▼'}</span>
                                                        </div>
                                                        {isBldgExpanded && (
                                                            <div style={{ overflowX: 'auto' }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                                    <thead><tr>
                                                                        <Th style={{ width: '28px' }}>#</Th>
                                                                        <Th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-main)' }}>학원명</Th>
                                                                        <Th>연락처</Th><Th>미점검</Th><Th>보험</Th><Th>위반</Th><Th>마지막점검일</Th>
                                                                    </tr></thead>
                                                                    <tbody>
                                                                        {displayItems.filter(a => a.category !== '교습소').map((a, i) => renderRow(a, i + 1, acColor.bg, acColor.border))}
                                                                        {displayItems.filter(a => a.category === '교습소').map((a, i) => renderRow(a, i + 1, HG_COLOR.bg, HG_COLOR.border))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    );
                })()}
            </CautionSection>

            {/* C. 점검 우선순위 (신설미점검 포함) */}
            <CautionSection id="risk" title="🎯 점검 우선순위 (학원 100·교습소 60)" badge={Math.min(riskList.filter(a=>a.category!=='교습소'&&!(a.name||'').trim().endsWith('독서실')).length,100)+Math.min(riskList.filter(a=>a.category==='교습소').length,60)} badgeColor="#6366f1">
                {(() => {
                    const allAcItems = riskList.filter(a => a.category !== '교습소' && !(a.name || '').trim().endsWith('독서실'));
                    const allHgItems = riskList.filter(a => a.category === '교습소');
                    const acDisplayItems = acRefreshed
                        ? allAcItems.filter(a => !isInsp2026(a)).slice(0, 100)
                        : allAcItems.slice(0, 100);
                    const hgDisplayItems = hgRefreshed
                        ? allHgItems.filter(a => !isInsp2026(a)).slice(0, 60)
                        : allHgItems.slice(0, 60);
                    const fmtMonths = (a) => a.neverInspected ? '미점검' : a.months >= 12 ? `${Math.floor(a.months/12)}년${a.months%12>0?' '+a.months%12+'개월':''}` : `${a.months}개월`;
                    const riskType = (a) => a.category === '교습소' ? '교습소' : '학원';
                    const statusDateLabel = (typeLabel) => typeLabel === '교습소' ? '개소/휴소/폐소일' : '개원/휴원/폐원일';
                    const downloadRiskExcel = (items, typeLabel) => {
                        const rows = items.map((a, i) => ({
                            '순위': i + 1,
                            '학원명': a.name || '',
                            '연락처': a.founder?.mobile || a.founder?.phone || '',
                            [statusDateLabel(typeLabel)]: a.statusDate || '',
                            '동': a.dong || '',
                            '미점검': fmtMonths(a),
                            '보험': a.hasIns ? '만료/미가입' : '정상',
                            '위반': a.viol > 0 ? `${a.viol}건` : '-',
                            '점수': Math.round(a.score * 100),
                        }));
                        const ws = XLSX.utils.json_to_sheet(rows);
                        ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 6 }];
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, typeLabel);
                        const d = new Date();
                        const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
                        XLSX.writeFile(wb, `점검우선순위_${region}_${typeLabel}_${ymd}.xlsx`);
                    };
                    const renderRow = (a, i) => {
                        const done = isInsp2026(a);
                        return (
                            <tr key={`${a.id}_${i}`} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)', opacity: done ? 0.5 : 1 }}>
                                <NavCell id={a.id} type={riskType(a)} style={{ color: i < 3 ? '#ef4444' : 'var(--text-muted)', fontWeight: '800', fontSize: '0.78rem' }}>{i + 1}</NavCell>
                                <Td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-card)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
                                            <NameLink id={a.id} type={riskType(a)} name={a.name} />
                                        </span>
                                        {done && <span style={{ fontSize: '0.67rem', color: '#6366f1', fontWeight: '700', flexShrink: 0 }}>(완료)</span>}
                                    </div>
                                </Td>
                                <NavCell id={a.id} type={riskType(a)} style={{ whiteSpace: 'nowrap' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: '600' }}>{a.founder?.name || '-'}</div>
                                    {(a.founder?.mobile || a.founder?.phone) && <span style={{ color: '#3b82f6', fontWeight: '600', fontSize: '0.75rem' }}>{a.founder?.mobile || a.founder?.phone}</span>}
                                </NavCell>
                                <NavCell id={a.id} type={riskType(a)} style={{ whiteSpace: 'nowrap' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '600', color: (a.status || '').includes('휴') ? '#f59e0b' : 'var(--text-muted)' }}>{a.status || '-'}</div>
                                    {a.statusDate && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.statusDate}</span>}
                                </NavCell>
                                <NavCell id={a.id} type={riskType(a)} style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{a.dong || '-'}</NavCell>
                                <NavCell id={a.id} type={riskType(a)} style={{ fontWeight: '700', fontSize: '0.78rem', color: a.months >= 36 ? '#ef4444' : a.months >= 24 ? '#f59e0b' : 'var(--text-muted)' }}>{fmtMonths(a)}</NavCell>
                                <NavCell id={a.id} type={riskType(a)}>{a.hasIns ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#d97706', fontWeight: '700' }}>⚠️보험</span> : <span style={{ color: '#10b981', fontSize: '0.78rem' }}>✓</span>}</NavCell>
                                <NavCell id={a.id} type={riskType(a)}>{a.viol > 0 ? <span style={{ fontSize: '0.71rem', padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '700' }}>{a.viol}건</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>-</span>}</NavCell>
                                <NavCell id={a.id} type={riskType(a)} style={{ fontWeight: '700', fontSize: '0.78rem', color: a.score >= 0.7 ? '#ef4444' : a.score >= 0.4 ? '#f97316' : 'var(--text-main)' }}>{Math.round(a.score * 100)}</NavCell>
                            </tr>
                        );
                    };
                    const SubAccordion = ({ label, color, items, isOpen, setOpen, onRefresh, onDownload, dateLabel }) => (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-main)', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
                                <span style={{ fontWeight: '700', fontSize: '0.82rem', color }}>{label}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{items.length}개</span>
                                <button
                                    onClick={e => { e.stopPropagation(); onDownload(); }}
                                    style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', border: '1px solid #10b98155', background: 'var(--bg-card)', cursor: 'pointer', color: '#10b981', fontWeight: '700' }}
                                >
                                    📥 엑셀
                                </button>
                                <button
                                    onClick={e => { e.stopPropagation(); onRefresh(); }}
                                    disabled={riskRefreshing}
                                    style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: '600' }}
                                >
                                    {riskRefreshing ? '⟳' : '새로고침'}
                                </button>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                            </div>
                            {isOpen && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                        <colgroup>
                                            <col style={{ width: '5%' }} /><col style={{ width: '19%' }} /><col style={{ width: '15%' }} /><col style={{ width: '13%' }} /><col style={{ width: '8%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} /><col style={{ width: '10%' }} />
                                        </colgroup>
                                        <thead><tr>
                                            <Th style={{ width: '5%' }}>#</Th>
                                            <Th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-main)' }}>학원명</Th><Th>연락처</Th><Th style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateLabel}</Th><Th>동</Th><Th>미점검</Th><Th>보험</Th><Th>위반</Th><Th>점수</Th>
                                        </tr></thead>
                                        <tbody>
                                            {items.map((a, i) => renderRow(a, i))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                    return (
                        <div style={{ padding: '4px 0' }}>
                            <SubAccordion label="🏫 학원" color="#3b82f6" items={acDisplayItems} isOpen={riskAcOpen} setOpen={setRiskAcOpen} onRefresh={() => handleRiskRefresh('ac')} onDownload={() => downloadRiskExcel(acDisplayItems, '학원')} dateLabel="개원/휴원/폐원일" />
                            <SubAccordion label="🏠 교습소" color="#8b5cf6" items={hgDisplayItems} isOpen={riskHgOpen} setOpen={setRiskHgOpen} onRefresh={() => handleRiskRefresh('hg')} onDownload={() => downloadRiskExcel(hgDisplayItems, '교습소')} dateLabel="개소/휴소/폐소일" />
                        </div>
                    );
                })()}
            </CautionSection>

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
const INSP_STATE_KEY = 'inspectionPageState';

export default function InspectionPage({ onBack, academies, privateTutors, onSelectAcademy, onShowRouteMap, initialTab }) {
    const [region, setRegion] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem(INSP_STATE_KEY))?.region || '하남'; } catch { return '하남'; }
    });
    const [activeTab, setActiveTab] = useState(() => {
        if (initialTab !== undefined) return initialTab;
        try { return JSON.parse(sessionStorage.getItem(INSP_STATE_KEY))?.activeTab ?? 0; } catch { return 0; }
    });
    // 탭별 하위 상태 (페이지, 아코디언 open/close)를 sessionStorage에 저장/복원
    const [savedSubState] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem(INSP_STATE_KEY))?.subState || {}; } catch { return {}; }
    });
    const subStateRef = useRef(savedSubState);
    const [recentInitPage] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem(INSP_STATE_KEY))?.subState?.page ?? 0; } catch { return 0; }
    });
    // 2026 지도점검 탭은 데이터 로딩 후 복원하도록 별도 처리
    const [recentInitScrollY] = useState(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(INSP_STATE_KEY));
            return saved?.activeTab === 1 ? (saved?.scrollY ?? null) : null;
        } catch { return null; }
    });
    const [statRows, setStatRows] = useState([]);
    const [loadingStat, setLoadingStat] = useState(false);
    const [errorStat, setErrorStat] = useState('');
    const [academyClosures, setAcademyClosures] = useState([]);
    const [addrDongCacheVer, setAddrDongCacheVer] = useState(0);

    // 상세화면에서 돌아올 때 스크롤 위치 복원 (비동기 로딩이 없는 탭만)
    useEffect(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(INSP_STATE_KEY));
            if (saved?.scrollY != null) {
                sessionStorage.removeItem(INSP_STATE_KEY);
                if (saved.activeTab !== 1) {
                    const target = saved.scrollY;
                    // 아코디언 열림 후 DOM 렌더링까지 충분한 시간 확보
                    setTimeout(() => window.scrollTo({ top: target, behavior: 'instant' }), 200);
                }
                // tab 1(TabRecent)은 데이터 로드 완료 후 TabRecent 내부에서 복원
            }
        } catch { /* ignore */ }
    }, []);

    // 탭 하위 상태(페이지, 아코디언) 변경 시 ref 동기 갱신
    const handleSubStateChange = useCallback((state) => {
        subStateRef.current = { ...subStateRef.current, ...state };
    }, []);

    // 학원 선택 시 현재 탭·스크롤·하위상태 저장 후 이동
    const handleSelectAcademy = useCallback((academy) => {
        try {
            sessionStorage.setItem(INSP_STATE_KEY, JSON.stringify({
                region, activeTab, scrollY: window.scrollY, subState: subStateRef.current,
            }));
        } catch { /* ignore */ }
        onSelectAcademy(academy);
    }, [region, activeTab, onSelectAcademy]);

    const TABS      = ['계획', '완료', '통계', '검토', '사진', '면적'];
    const TAB_ICONS = ['⚠️', '🕐', '📊', '🔬', ''];

    useEffect(() => {
        fetchAcademyClosureData()
            .then(setAcademyClosures)
            .catch(() => {});
    }, []);

    // 미분류 주소를 Kakao geocoder로 보완 (필요시 SDK 직접 로드)
    useEffect(() => {
        if (!academies || academies.length === 0) return;
        const city = region === '하남' ? '하남' : '광주';
        const wl = region === '하남' ? HANAM_DONG_SET : GWANGJU_DONG_SET;

        const runGeocode = () => {
            const geocoder = new window.kakao.maps.services.Geocoder();
            const cache = getAddrDongCache();

            const allAddrs = [
                ...(academies || []).filter(a => (a.address || '').includes(city)),
                ...(privateTutors || []).filter(a => (a.address || '').includes(city)),
            ].map(a => a.address).filter(Boolean);

            const toGeocode = [...new Set(allAddrs)].filter(addr => !getDongFromAddr(addr, wl));

            if (toGeocode.length === 0) return;

            // 주소 후보 생성 (KakaoMapPage와 동일 전략)
            const makeAddrCandidates = (address) => {
                const seen = new Set();
                const add = (s) => { const t = s.trim(); if (t.length > 4) seen.add(t); };
                add(address);
                let base = address.split(',')[0].replace(/\s*\([^)]*\)/g, '').trim();
                add(base);
                let noHo = base
                    .replace(/\s+\d+~\d+호.*$/, '')
                    .replace(/\s+[A-Z동]?\d+층.*$/, '')
                    .replace(/\s+\d+호.*$/, '')
                    .trim();
                add(noHo);
                let noApt = noHo.replace(/\s+\d+동\s*\d*호?.*$/, '').trim();
                add(noApt);
                add(noApt.replace(/(\d+)-\d+\s*$/, '$1'));
                add(noHo.replace(/(\d+)-\d+\s*$/, '$1'));
                const roadMatch = address.match(/^(.*?[로길]\s+\d+(?:-\d+)?)/);
                if (roadMatch) add(roadMatch[1]);
                return [...seen];
            };

            // geocoding 결과에서 동명 추출
            const extractDongFromResult = (result) => {
                let dong = result.address?.region_3depth_name || '';
                if (!wl.has(dong)) dong = normalizeDongName(dong);
                if (!wl.has(dong)) {
                    const jibeon = result.address?.address_name || '';
                    const after = jibeon.replace(/^.*?시\s*/, '');
                    const toks = [...after.matchAll(/([가-힣]+(?:\d+)?(?:동|리|읍|면))/g)].map(m => m[1]);
                    for (const t of toks) {
                        if (wl.has(t)) { dong = t; break; }
                        const norm = normalizeDongName(t);
                        if (wl.has(norm)) { dong = norm; break; }
                    }
                }
                return wl.has(dong) ? dong : '';
            };

            let pending = toGeocode.length;
            let updated = false;
            toGeocode.forEach((addr, i) => {
                setTimeout(() => {
                    const candidates = makeAddrCandidates(addr);
                    const tryNext = (idx) => {
                        if (idx >= candidates.length) {
                            pending--;
                            if (pending === 0 && updated) {
                                localStorage.setItem('academyAddrDongCache', JSON.stringify(cache));
                                setAddrDongCacheVer(v => v + 1);
                            }
                            return;
                        }
                        geocoder.addressSearch(candidates[idx], (result, status) => {
                            if (status === window.kakao.maps.services.Status.OK && result[0]) {
                                const dong = extractDongFromResult(result[0]);
                                if (dong) { cache[addr] = dong; updated = true; }
                                pending--;
                                if (pending === 0 && updated) {
                                    localStorage.setItem('academyAddrDongCache', JSON.stringify(cache));
                                    setAddrDongCacheVer(v => v + 1);
                                }
                            } else {
                                tryNext(idx + 1);
                            }
                        });
                    };
                    tryNext(0);
                }, i * 80);
            });
        };

        const ensureKakaoAndRun = () => {
            if (window.kakao?.maps?.services) { runGeocode(); return; }
            const apiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY || localStorage.getItem('kakao_api_key');
            if (!apiKey) return;
            if (document.getElementById('kakao-map-script')) {
                // 스크립트 이미 있으면 load 이벤트만 기다림
                const check = setInterval(() => {
                    if (window.kakao?.maps?.services) { clearInterval(check); runGeocode(); }
                }, 300);
                setTimeout(() => clearInterval(check), 10000);
                return;
            }
            const script = document.createElement('script');
            script.id = 'kakao-map-script';
            script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&libraries=services&autoload=false`;
            script.onload = () => window.kakao.maps.load(runGeocode);
            document.head.appendChild(script);
        };

        ensureKakaoAndRun();
    }, [academies, privateTutors, region]);

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
                <div style={{ display: 'flex', gap: '2px', overflowX: 'auto', paddingBottom: '2px' }}>
                    {TABS.map((tab, i) => (
                        <button key={tab} onClick={() => setActiveTab(i)} style={{ padding: '7px 8px', borderRadius: '8px 8px 0 0', border: '1px solid', borderBottom: 'none', borderColor: activeTab === i ? 'var(--primary)' : 'var(--border-color)', background: activeTab === i ? 'var(--primary)' : 'transparent', color: activeTab === i ? 'white' : 'var(--text-muted)', fontWeight: activeTab === i ? '700' : '500', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                        {activeTab === 0 && <TabCaution region={region} academies={academies} privateTutors={privateTutors} academyClosures={academyClosures} onSelectAcademy={handleSelectAcademy} addrDongCacheVer={addrDongCacheVer} initialOpenSections={savedSubState.cautionOpenSections} onSubStateChange={s => handleSubStateChange({ cautionOpenSections: s })} onShowRouteMap={onShowRouteMap} initialRouteDate={savedSubState.routeDate || ''} onRouteDateChange={date => handleSubStateChange({ routeDate: date })} initialExpandedDongs={savedSubState.cautionExpandedDongs} initialUnderdueExpandedDongs={savedSubState.cautionUnderdueExpandedDongs} initialByBuildingExpandedDongs={savedSubState.cautionByBuildingExpandedDongs} initialByBuildingExpandedBuildings={savedSubState.cautionByBuildingExpandedBuildings} onExpandedDongsChange={s => handleSubStateChange({ cautionExpandedDongs: s.expandedDongs ?? subStateRef.current?.cautionExpandedDongs, cautionUnderdueExpandedDongs: s.underdueExpandedDongs ?? subStateRef.current?.cautionUnderdueExpandedDongs, cautionByBuildingExpandedDongs: s.byBuildingExpandedDongs ?? subStateRef.current?.cautionByBuildingExpandedDongs, cautionByBuildingExpandedBuildings: s.byBuildingExpandedBuildings ?? subStateRef.current?.cautionByBuildingExpandedBuildings })} />}
                        {activeTab === 1 && <TabRecent region={region} academies={academies} onSelectAcademy={handleSelectAcademy} initialPage={recentInitPage} initialScrollY={recentInitScrollY} onPageChange={p => handleSubStateChange({ page: p })} />}
                        {activeTab === 2 && <TabStats region={region} statRows={statRows} academies={academies} privateTutors={privateTutors} academyClosures={academyClosures} addrDongCacheVer={addrDongCacheVer} />}
                        {activeTab === 3 && <TabReview region={region} academies={academies} privateTutors={privateTutors} academyClosures={academyClosures} onSelectAcademy={handleSelectAcademy} addrDongCacheVer={addrDongCacheVer} initialOpenSections={savedSubState.reviewOpenSections} onSubStateChange={s => handleSubStateChange({ reviewOpenSections: s })} />}
                        {activeTab === 4 && <PhotoRenamePage embedded={true} />}
                        {activeTab === 5 && <AreaCalculatorApp embedded={true} />}
                    </div>
                )}
            </div>
        </div>
    );
}
