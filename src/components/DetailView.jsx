import React, { useState, useRef, useEffect } from 'react';
import './DetailView.css';
import AdminSanctionAccordion from './AdminSanctionAccordion';
import FineGuideAccordion from './FineGuideAccordion';
import { printTuitionForm, printTuitionFormExternal } from '../utils/generateTuitionPDF';

const TUITION_STANDARDS = [
    { process: '보습', target: '단과(초등)', price: 210 },
    { process: '보습', target: '단과(중등)', price: 222 },
    { process: '보습', target: '단과(고등)', price: 234 },
    { process: '진학상담, 지도', target: '진학상담, 지도', price: 234 },
    { process: '어학', target: '어학', price: 259 },
    { process: '음악', target: '유,초,중,고', price: 224 },
    { process: '음악', target: '입시', price: 336 },
    { process: '미술', target: '유,초,중,고', price: 212 },
    { process: '미술', target: '입시', price: 255 },
    { process: '무용', target: '유,초,중,고', price: 212 },
    { process: '무용', target: '입시', price: 255 },
    { process: '정보', target: '일반', price: 230 },
    { process: '기타', target: '일반(직업기술, 인문사회, 기예, 공예 등)', price: 230 }
];

const TABS = [
    { id: 'status', label: '현황' },
    { id: 'founder', label: '설립자' },
    { id: 'facilities', label: '시설' },
    { id: 'tuition', label: '교습비' },
    { id: 'insurance', label: '보험' },
    { id: 'instructor', label: '강사' },
    { id: 'assistant', label: '보조요원' },
    { id: 'inspection', label: '지도점검' },
];

// Format number with commas
const formatNumber = (num) => {
    if (!num) return num;
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 미점검 기간 계산 (마지막 점검일 → 오늘, 점검 기록 없으면 등록일 기준)
const getUninspectedPeriod = (inspections, regDate) => {
    const lastDateStr = (inspections && inspections.length > 0)
        ? inspections[0]?.date
        : regDate;
    if (!lastDateStr) return null;
    const last = new Date(lastDateStr.replace(/\./g, '-'));
    if (isNaN(last.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - last.getFullYear();
    let months = now.getMonth() - last.getMonth();
    if (now.getDate() < last.getDate()) months--;
    if (months < 0) { years--; months += 12; }
    if (years < 0) return null;
    if (years === 0 && months === 0) return null;
    if (years > 0 && months > 0) return `미점검 ${years}년 ${months}월`;
    if (years > 0) return `미점검 ${years}년`;
    return `미점검 ${months}월`;
};

// 학력 약어 변환
const eduShort = (edu) => {
    if (!edu) return '';
    if (edu.includes('박사')) return '박사';
    if (edu.includes('석사')) return '석사';
    if (edu.includes('대학졸')) return '대졸';
    if (edu.includes('전문졸') || edu.includes('전문대')) return '전문대졸';
    if (edu.includes('고등')) return '고졸';
    return edu;
};

// 강사 탭 컴포넌트
function InstructorTab({ instructors = [] }) {
    const [filter, setFilter] = useState('현직'); // '전체' | '현직' | '전직'
    const [subjectFilter, setSubjectFilter] = useState('전체');

    const subjects = ['전체', ...new Set(instructors.map(i => i.subject).filter(Boolean))];

    const filtered = instructors.filter(inst => {
        const isDismissed = !!inst.dismissDate;
        const matchStatus = filter === '전체' || (filter === '현직' && !isDismissed) || (filter === '전직' && isDismissed);
        const matchSubject = subjectFilter === '전체' || inst.subject === subjectFilter;
        return matchStatus && matchSubject;
    });

    const currentCount = instructors.filter(i => !i.dismissDate).length;
    const formerCount = instructors.filter(i => !!i.dismissDate).length;
    const foreignCount = instructors.filter(i => i.type && i.type.includes('외국인')).length;

    return (
        <div className="tab-content animate-enter">
            {/* 상단 통계 */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[{ label: '현직 강사', val: currentCount, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
                { label: '전직 강사', val: formerCount, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
                { label: '외국인 강사', val: foreignCount, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' }
                ].map(s => (
                    <div key={s.label} style={{ flex: '1 1 80px', minWidth: '80px', padding: '12px 14px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* 필터 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* 현직/전직 */}
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-main)', borderRadius: '10px', padding: '3px' }}>
                    {['현직', '전직', '전체'].map(f => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: '700',
                            background: filter === f ? 'var(--primary)' : 'transparent',
                            color: filter === f ? 'white' : 'var(--text-muted)',
                            transition: 'all 0.15s'
                        }}>{f}</button>
                    ))}
                </div>

                {/* 교습과목 필터 */}
                {subjects.length > 2 && (
                    <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
                        style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.8rem', cursor: 'pointer' }}>
                        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                )}
            </div>

            {/* 강사 목록 */}
            {filtered.length === 0 ? (
                <p className="empty-msg">해당 조건의 강사가 없습니다.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map((inst, idx) => {
                        const isDismissed = !!inst.dismissDate;
                        const isForeign = inst.type && inst.type.includes('외국인');
                        return (
                            <div key={idx} style={{
                                padding: '12px 16px',
                                borderRadius: '12px',
                                border: `1px solid ${isDismissed ? 'var(--border-color)' : 'var(--border-color)'}`,
                                borderLeft: `4px solid ${isDismissed ? '#94a3b8' : '#2563eb'}`,
                                background: isDismissed ? 'var(--bg-main)' : 'var(--bg-card)',
                                opacity: isDismissed ? 0.75 : 1,
                            }}>
                                {/* 헤더 행: 이름 + 배지들 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '1rem', fontWeight: '800', color: isDismissed ? '#64748b' : 'var(--text-main)' }}>
                                        {idx + 1}. {inst.name || '-'}
                                    </span>
                                    {inst.subject && (
                                        <span style={{ padding: '2px 8px', borderRadius: '8px', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: '700', border: '1px solid #bfdbfe' }}>
                                            {inst.subject}
                                        </span>
                                    )}
                                    {isForeign && (
                                        <span style={{ padding: '2px 8px', borderRadius: '8px', background: '#f5f3ff', color: '#6d28d9', fontSize: '0.75rem', fontWeight: '700', border: '1px solid #ddd6fe' }}>
                                            외국인
                                        </span>
                                    )}
                                    {isDismissed && (
                                        <span style={{ padding: '2px 8px', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', fontSize: '0.72rem', fontWeight: '600', border: '1px solid #e2e8f0' }}>
                                            전직
                                        </span>
                                    )}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {eduShort(inst.education)}{inst.major ? ` · ${inst.major}` : ''}
                                    </span>
                                </div>

                                {/* 정보 칩들 */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    {inst.hireDate && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                            <span style={{ color: '#10b981', fontWeight: '700' }}>채용</span> {inst.hireDate}
                                        </span>
                                    )}
                                    {inst.dismissDate && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                            <span style={{ color: '#ef4444', fontWeight: '700' }}>해임</span> {inst.dismissDate}
                                        </span>
                                    )}
                                    {inst.changeReason && (
                                        <span style={{ color: '#94a3b8' }}>({inst.changeReason})</span>
                                    )}
                                    {inst.visaType && (
                                        <span style={{ padding: '1px 6px', borderRadius: '6px', background: '#f5f3ff', color: '#7c3aed', fontSize: '0.72rem', border: '1px solid #ede9fe' }}>
                                            체류: {inst.visaType}
                                        </span>
                                    )}
                                    {inst.certificate && (
                                        <span style={{ padding: '1px 6px', borderRadius: '6px', background: '#fefce8', color: '#a16207', fontSize: '0.72rem', border: '1px solid #fef08a' }}>
                                            📜 자격: {inst.certificate}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// 보조요원 탭 컴포넌트 (교습소 전용)
function AssistantTab({ assistants = [] }) {
    const [filter, setFilter] = useState('현직'); // '전체' | '현직' | '전직'

    const filtered = assistants.filter(ast => {
        const isDismissed = !!ast.dismissDate;
        return filter === '전체' || (filter === '현직' && !isDismissed) || (filter === '전직' && isDismissed);
    });

    const currentCount = assistants.filter(a => !a.dismissDate).length;
    const formerCount = assistants.filter(a => !!a.dismissDate).length;

    return (
        <div className="tab-content animate-enter">
            {/* 상단 통계 */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[{ label: '현직 보조요원', val: currentCount, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
                  { label: '전직 보조요원', val: formerCount, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
                ].map(s => (
                    <div key={s.label} style={{ flex: '1 1 80px', minWidth: '80px', padding: '12px 14px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* 필터 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-main)', borderRadius: '10px', padding: '3px' }}>
                    {['현직', '전직', '전체'].map(f => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: '700',
                            background: filter === f ? 'var(--primary)' : 'transparent',
                            color: filter === f ? 'white' : 'var(--text-muted)',
                            transition: 'all 0.15s'
                        }}>{f}</button>
                    ))}
                </div>
            </div>

            {/* 보조요원 목록 */}
            {filtered.length === 0 ? (
                <p className="empty-msg">해당 조건의 보조요원이 없습니다.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map((ast, idx) => {
                        const isDismissed = !!ast.dismissDate;
                        return (
                            <div key={idx} style={{
                                padding: '12px 16px',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                borderLeft: `4px solid ${isDismissed ? '#94a3b8' : '#059669'}`,
                                background: isDismissed ? 'var(--bg-main)' : 'var(--bg-card)',
                                opacity: isDismissed ? 0.75 : 1,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '1rem', fontWeight: '800', color: isDismissed ? '#64748b' : 'var(--text-main)' }}>
                                        {idx + 1}. {ast.name || '-'}
                                    </span>
                                    {ast.subject && (
                                        <span style={{ padding: '2px 8px', borderRadius: '8px', background: '#ecfdf5', color: '#065f46', fontSize: '0.75rem', fontWeight: '700', border: '1px solid #a7f3d0' }}>
                                            {ast.subject}
                                        </span>
                                    )}
                                    {ast.type && (
                                        <span style={{ padding: '2px 8px', borderRadius: '8px', background: '#f0fdf4', color: '#166534', fontSize: '0.75rem', fontWeight: '600', border: '1px solid #bbf7d0' }}>
                                            {ast.type}
                                        </span>
                                    )}
                                    {isDismissed && (
                                        <span style={{ padding: '2px 8px', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', fontSize: '0.72rem', fontWeight: '600', border: '1px solid #e2e8f0' }}>
                                            전직
                                        </span>
                                    )}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {eduShort(ast.education)}{ast.major ? ` · ${ast.major}` : ''}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    {ast.hireDate && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                            <span style={{ color: '#10b981', fontWeight: '700' }}>채용</span> {ast.hireDate}
                                        </span>
                                    )}
                                    {ast.dismissDate && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                            <span style={{ color: '#ef4444', fontWeight: '700' }}>해임</span> {ast.dismissDate}
                                        </span>
                                    )}
                                    {ast.changeReason && (
                                        <span style={{ color: '#94a3b8' }}>({ast.changeReason})</span>
                                    )}
                                    {ast.certificate && (
                                        <span style={{ padding: '1px 6px', borderRadius: '6px', background: '#fefce8', color: '#a16207', fontSize: '0.72rem', border: '1px solid #fef08a' }}>
                                            📜 자격: {ast.certificate}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// 지도점검 탭 전용 컴포넌트 (아코디언 상태 관리 포함)
function InspectionTab({ inspections, totalCount, violationCount }) {
    const [expandedIndexes, setExpandedIndexes] = useState([]);

    const toggleExpand = (idx) => {
        setExpandedIndexes(prev =>
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
    };

    // 정보 행 렌더링 헬퍼
    const InfoChip = ({ label, value, color }) => {
        if (!value || value === '0' || value === 'N' || value === '') return null;
        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                backgroundColor: color ? `${color}15` : 'var(--bg-light)',
                color: color || 'var(--text-muted)',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: '600',
                border: `1px solid ${color ? `${color}40` : 'var(--border-color)'}`,
                whiteSpace: 'nowrap'
            }}>
                <span style={{ opacity: 0.7, fontSize: '0.7rem' }}>{label}</span>
                <span>{value}</span>
            </span>
        );
    };

    // ──────────────────────────────────────────────────────────
    // 위반사항 키워드 → 과태료·행정처분 참고 안내 매핑 테이블
    // ──────────────────────────────────────────────────────────
    const VIOLATION_GUIDE_DB = [
        {
            keywords: ['교습비', '수강료', '영수증', '환불', '반환'],
            title: '교습비 관련 위반',
            fine: '50~300만원 (위반유형·횟수에 따라 차등)',
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '교습비 초과징수·미게시·미반환·영수증미교부 모두 해당. 위반횟수에 따라 처분이 가중됩니다.'
        },
        {
            keywords: ['강사', '인적사항', '자격', '무자격'],
            title: '강사 관련 위반',
            fine: '50~300만원 (인적사항미게시·무자격채용 등)',
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '강사 인적사항 미게시(50~200만원), 무자격 강사채용(정지→말소), 채용·해임 미통보(시정→정지→말소)'
        },
        {
            keywords: ['장부', '서류', '원부', '기재', '비치'],
            title: '장부·서류 비치 관련 위반',
            fine: '50~200만원',
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: null,
            note: '수강생대장·직원명부·영수증원부 미비치 또는 부실기재. 장부부실기재는 1차 시정명령, 2차 정지로 처분됩니다.'
        },
        {
            keywords: ['성범죄', '아동학대', '전력', '조회'],
            title: '성범죄·아동학대 전력 조회 위반',
            fine: '성범죄 300~500만원 / 아동학대 250~500만원',
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '아동·청소년 대상 교육기관은 채용 전 반드시 조회 의무. 전력자 채용 시 즉시 말소 처분.'
        },
        {
            keywords: ['시설', '면적', '기준', '확장', '위치변경'],
            title: '시설 관련 위반',
            fine: null,
            sanction1: '시정명령 또는 정지',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '시설기준 미달·축소운영은 1차 정지, 2차 말소. 무단확장·위치변경도 동일. 시설임의변경은 1차 시정명령.'
        },
        {
            keywords: ['과목', '과정', '교습', '등록외', '무단'],
            title: '교습과정·과목 위반',
            fine: null,
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '등록 외 교습과정 운영: 학원은 1차 시정→2차 정지→3차 말소, 교습소는 1차 정지→2차 폐지'
        },
        {
            keywords: ['광고', '허위', '과대', '표시'],
            title: '허위·과대광고 위반',
            fine: null,
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '"100% 합격보장" 등 허위·과대광고: 1차 시정명령→2차 정지→3차 말소. 공교육정상화법 위반 포함.'
        },
        {
            keywords: ['통학버스', '어린이', '안전교육', '동승'],
            title: '어린이통학버스 위반',
            fine: '8만원 (안전교육 미이수·안전운행기록 미제출)',
            sanction1: '시정명령',
            sanction2: '등록정지',
            sanction3: '등록말소',
            note: '보호자 동승 없이 운행 중 어린이 사망·중상해 발생 시 즉시 말소. 안전교육 미이수는 8만원 과태료.'
        },
        {
            keywords: ['보험', '공제'],
            title: '보험·공제 미가입 위반',
            fine: '30~300만원',
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '학원 배상책임보험 미가입: 1차 시정명령→2차 정지→3차 말소. 신규 설립 후 7일 이내 가입 의무.'
        },
        {
            keywords: ['교습시간', '시간위반', '심야'],
            title: '교습시간 제한 위반',
            fine: null,
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '학교교과 교습학원·교습소 대상. 경기도 조례에서 정한 교습 제한시간 초과 시 적용.'
        },
        {
            keywords: ['명칭', '상호', '아카데미', '간판'],
            title: '명칭 사용 위반',
            fine: null,
            sanction1: '시정명령',
            sanction2: '등록정지 (7일)',
            sanction3: '등록말소',
            note: '등록(신고)하지 않은 명칭 사용, 학교 혼동 명칭, 유치원 유사명칭 사용 시 적용.'
        },
        {
            keywords: ['점검', '거부', '방해', '기피', '출입'],
            title: '지도·감독 거부·방해 위반',
            fine: '100~300만원',
            sanction1: '등록정지 (7일)',
            sanction2: '등록말소',
            sanction3: null,
            note: '행정기관의 지도·감독을 거부·방해·기피하는 경우. 현장 출입 거부 포함.'
        },
        {
            keywords: ['휴원', '폐원', '무단', '미신고'],
            title: '무단 휴원·폐원 위반',
            fine: '50~300만원 (기간에 따라 차등)',
            sanction1: '등록정지 1월',
            sanction2: '등록말소',
            sanction3: null,
            note: '2월 이상 무단 휴원: 1차 1월정지→2차 말소. 미신고 휴원: 1개월 이상부터 50만원, 최대 300만원.'
        },
        {
            keywords: ['설립자', '운영자', '변경', '대표자'],
            title: '설립·운영자 무단변경 위반',
            fine: null,
            sanction1: '등록정지 (7일)',
            sanction2: '등록말소',
            sanction3: null,
            note: '설립·운영자를 변경등록 하지 않고 무단 변경하는 경우.'
        },
    ];

    /**
     * 위반사항 문자열을 받아 매칭되는 참고 안내 항목들을 반환
     */
    const getViolationGuide = (violationType = '', violationDetail = '') => {
        const text = `${violationType} ${violationDetail}`.toLowerCase();
        return VIOLATION_GUIDE_DB.filter(item =>
            item.keywords.some(kw => text.includes(kw))
        );
    };


    return (
        <div className="tab-content animate-enter">
            {/* ① 과태료 부과기준 + 행정처분 기준 아코디언 */}
            <FineGuideAccordion />
            <AdminSanctionAccordion />

            {/* ③ 통계 카드 */}
            <div style={{ display: 'flex', gap: '10px', margin: '8px 0 16px' }}>
                <div style={{
                    flex: 1, padding: '14px 16px',
                    backgroundColor: 'var(--bg-light)', borderRadius: '12px',
                    border: '1px solid var(--border-color)', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-main)' }}>{totalCount}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>총 점검 횟수</div>
                </div>
                <div style={{
                    flex: 1, padding: '14px 16px',
                    backgroundColor: violationCount > 0 ? '#fff1f2' : '#f0fdf4',
                    borderRadius: '12px',
                    border: `1px solid ${violationCount > 0 ? '#fecaca' : '#bbf7d0'}`,
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '800', color: violationCount > 0 ? '#dc2626' : '#16a34a' }}>
                        {violationCount}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>위반 횟수</div>
                </div>
            </div>

            {/* 점검 이력 목록 */}
            {totalCount > 0 ? inspections.map((insp, idx) => {
                const isViolation = insp.isViolation;
                const hasGuidance = !!(insp.guidanceContent && insp.guidanceContent !== '없음' && insp.guidanceContent !== '이상없음' && insp.guidanceContent !== '-');
                const isExpanded = expandedIndexes.includes(idx);
                const hasPunishment = insp.punishmentCode || insp.punishmentDate;
                const hasFine = insp.fine && insp.fine !== '0' && insp.fine !== '';
                const hasPenalty = insp.penalty && insp.penalty !== '0' && insp.penalty !== '';
                const hasCorrection = insp.correctionStart || insp.correctionEnd || insp.correctionContent;
                const guides = isViolation ? getViolationGuide(insp.violationType, insp.violationDetail) : [];
                const hasGuide = guides.length > 0;
                const hasExpandableViolationDetail = isViolation && (hasPunishment || hasFine || hasPenalty || hasCorrection || hasGuide);

                const hasInlineInfo = !isViolation && !hasGuidance && (insp.inspectionType || insp.note);
                const hasExpandableOkInfo = !isViolation && !hasGuidance && insp.inspectionItems;

                // 클릭 가능 여부
                const isClickable = hasExpandableViolationDetail || hasExpandableOkInfo;

                return (
                    <div
                        key={idx}
                        style={{
                            marginBottom: '10px',
                            borderRadius: '12px',
                            border: isViolation ? '1.5px solid #fca5a5' : '1px solid var(--border-color)',
                            backgroundColor: isViolation ? '#fff8f8' : 'var(--bg-card)',
                            borderLeft: isViolation ? '4px solid #dc2626' : '4px solid #22c55e',
                            overflow: 'hidden',
                        }}
                    >
                        {/* ─── 카드 헤더 (날짜 + 배지 + 토글▼) ─── */}
                        <div
                            onClick={isClickable ? () => toggleExpand(idx) : undefined}
                            style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: hasInlineInfo ? '10px 16px 6px' : '13px 16px',
                                cursor: isClickable ? 'pointer' : 'default',
                            }}
                        >
                            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                📅 {insp.date || '-'}
                            </span>
                            {insp.source === '2026' && (
                                <span style={{
                                    fontSize: '0.68rem', padding: '2px 7px', borderRadius: '6px',
                                    background: '#eef2ff', color: '#4338ca', fontWeight: '700',
                                    border: '1px solid #c7d2fe', whiteSpace: 'nowrap'
                                }}>2026</span>
                            )}
                            {insp.source === '~2025' && (
                                <span style={{
                                    fontSize: '0.68rem', padding: '2px 7px', borderRadius: '6px',
                                    background: '#f1f5f9', color: '#64748b', fontWeight: '700',
                                    border: '1px solid #cbd5e1', whiteSpace: 'nowrap'
                                }}>~2025</span>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                {isViolation && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '3px 10px', backgroundColor: '#dc2626', color: 'white',
                                        borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700',
                                    }}>⚠ 위반</span>
                                )}
                                {hasGuidance && !isViolation && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '3px 10px', backgroundColor: '#e0f2fe', color: '#0369a1',
                                        borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700',
                                        border: '1px solid #bae6fd'
                                    }}>📋 지도</span>
                                )}
                                {!isViolation && !hasGuidance && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '3px 10px', backgroundColor: '#dcfce7', color: '#15803d',
                                        borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600',
                                    }}>✓ 이상없음</span>
                                )}
                                {isClickable && (
                                    <span style={{
                                        fontSize: '0.75rem', color: 'var(--text-muted)',
                                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.25s', display: 'inline-block'
                                    }}>▼</span>
                                )}
                            </div>
                        </div>

                        {/* ─── 위반 카드: 위반사항·위반내역 항상 표시 ─── */}
                        {isViolation && (
                            <div style={{
                                padding: '0 16px 12px',
                                borderTop: '1px dashed #fecaca',
                                marginTop: '2px',
                            }}>
                                {insp.violationType && (
                                    <div style={{ marginTop: '10px', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#7f1d1d', fontWeight: '700', marginRight: '8px' }}>⚠ 위반사항</span>
                                        <span style={{
                                            fontSize: '0.88rem', fontWeight: '800', color: '#1e40af',
                                            textDecoration: 'underline', textDecorationColor: '#bfdbfe'
                                        }}>{insp.violationType}</span>
                                    </div>
                                )}
                                {insp.violationDetail && insp.violationDetail !== '없음' && (
                                    <div style={{ marginBottom: hasExpandableViolationDetail ? '8px' : '0' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#7f1d1d', fontWeight: '700', marginRight: '8px' }}>📋 위반내역</span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#374151' }}>{insp.violationDetail}</span>
                                    </div>
                                )}
                                {/* 행정처분/시정 안내 힌트 */}
                                {hasExpandableViolationDetail && !isExpanded && (
                                    <div
                                        onClick={() => toggleExpand(idx)}
                                        style={{
                                            marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            fontSize: '0.75rem', color: 'var(--text-muted)',
                                            cursor: 'pointer', textDecoration: 'underline',
                                            textDecorationColor: 'var(--border-color)'
                                        }}
                                    >
                                        <span>행정처분·시정정보 보기</span>
                                        <span style={{ fontSize: '0.65rem' }}>▼</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── 지도 카드 (지도내용만 있을 때) ─── */}
                        {!isViolation && hasGuidance && (
                            <div style={{
                                padding: '0 16px 12px',
                                borderTop: '1px dashed #bae6fd',
                                marginTop: '2px',
                            }}>
                                <div style={{ marginTop: '10px' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#0c4a6e', fontWeight: '700', marginRight: '8px' }}>📋 지도내용</span>
                                    <span style={{ fontSize: '0.85rem', color: '#1e3a5f', lineHeight: 1.5 }}>{insp.guidanceContent}</span>
                                </div>
                            </div>
                        )}
                        {hasInlineInfo && (
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '6px',
                                padding: '0 16px 10px', alignItems: 'center'
                            }}>
                                {insp.inspectionType && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '3px 10px', backgroundColor: '#eff6ff', color: '#1d4ed8',
                                        borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600',
                                        border: '1px solid #bfdbfe'
                                    }}>🔍 {insp.inspectionType}</span>
                                )}
                                {insp.note && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '3px 10px', backgroundColor: '#f0fdf4', color: '#166534',
                                        borderRadius: '8px', fontSize: '0.8rem', fontWeight: '500',
                                        border: '1px solid #bbf7d0'
                                    }}>📝 {insp.note}</span>
                                )}
                                {hasExpandableOkInfo && (
                                    <span
                                        onClick={() => toggleExpand(idx)}
                                        style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '2px', cursor: 'pointer' }}
                                    >클릭하여 상세보기</span>
                                )}
                            </div>
                        )}

                        {/* ─── 펼쳐지는 영역: 위반=행정처분+시정정보 / 이상없음=점검항목 ─── */}
                        {isExpanded && (
                            <div style={{
                                borderTop: isViolation ? '1px solid #fecaca' : '1px solid var(--border-color)',
                                padding: '12px 16px 14px',
                                backgroundColor: isViolation ? '#fff4f4' : 'rgba(240,253,244,0.7)',
                                animation: 'fadeIn 0.2s ease'
                            }}>
                                {/* 위반 카드 펼침: 행정처분 + 시정정보 */}
                                {isViolation && (
                                    <>
                                        {/* 처분 정보 */}
                                        {(hasPunishment || hasFine || hasPenalty) && (
                                            <div style={{
                                                marginBottom: hasCorrection ? '10px' : '0',
                                                padding: '8px 10px',
                                                backgroundColor: '#fee2e2', borderRadius: '8px',
                                                border: '1px solid #fca5a5'
                                            }}>
                                                <div style={{ fontSize: '0.75rem', color: '#7f1d1d', fontWeight: '700', marginBottom: '6px' }}>🔴 행정처분</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {insp.punishmentCode && <InfoChip label="처분코드" value={insp.punishmentCode} color="#dc2626" />}
                                                    {insp.punishmentDate && <InfoChip label="처분일" value={insp.punishmentDate} color="#dc2626" />}
                                                    {hasPenalty && <InfoChip label="벌점" value={`${insp.penalty}점`} color="#9333ea" />}
                                                    {hasFine && <InfoChip label="과태료" value={`${Number(insp.fine).toLocaleString()}원`} color="#dc2626" />}
                                                    {insp.cancelYn && insp.cancelYn !== '' && <InfoChip label="취소여부" value={insp.cancelYn} color="#6b7280" />}
                                                    {insp.excessFee && insp.excessFee !== '0' && insp.excessFee !== '' && (
                                                        <InfoChip label="수업료초과분" value={`${Number(insp.excessFee).toLocaleString()}원`} color="#ea580c" />
                                                    )}
                                                </div>
                                                {(insp.punishmentStart || insp.punishmentEnd) && (
                                                    <div style={{ marginTop: '6px', fontSize: '0.78rem', color: '#7f1d1d' }}>
                                                        📅 처분기간: <strong>{insp.punishmentStart}</strong> ~ <strong>{insp.punishmentEnd}</strong>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {/* 시정 정보 */}
                                        {hasCorrection && (
                                            <div style={{
                                                padding: '8px 10px',
                                                backgroundColor: '#fffbeb', borderRadius: '8px',
                                                border: '1px solid #fde68a'
                                            }}>
                                                <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: '700', marginBottom: '6px' }}>🔧 시정 정보</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: insp.correctionContent ? '6px' : '0' }}>
                                                    {insp.correctionStart && <InfoChip label="시정시작" value={insp.correctionStart} color="#d97706" />}
                                                    {insp.correctionEnd && <InfoChip label="시정종료" value={insp.correctionEnd} color="#d97706" />}
                                                </div>
                                                {insp.correctionContent && (
                                                    <div style={{ fontSize: '0.8rem', color: '#78350f' }}>
                                                        📝 시정내용: <strong>{insp.correctionContent}</strong>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* 참고 안내: 위반사항 관련 과태료·행정처분 */}
                                        {guides.length > 0 && (
                                            <div style={{
                                                marginTop: '10px',
                                                padding: '10px 12px',
                                                backgroundColor: '#f8f9fa',
                                                borderRadius: '8px',
                                                border: '1px solid #dee2e6',
                                                borderLeft: '3px solid #adb5bd',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
                                                    <span style={{ fontSize: '13px' }}>📎</span>
                                                    <span style={{ fontSize: '0.76rem', fontWeight: '700', color: '#495057' }}>참고 안내</span>
                                                </div>
                                                {guides.map((g, gi) => (
                                                    <div key={gi} style={{
                                                        marginTop: gi > 0 ? '8px' : '0',
                                                        paddingTop: gi > 0 ? '8px' : '0',
                                                        borderTop: gi > 0 ? '1px dashed #dee2e6' : 'none',
                                                    }}>
                                                        <div style={{ fontSize: '0.76rem', fontWeight: '700', color: '#343a40', marginBottom: '5px' }}>▸ {g.title}</div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: g.note ? '4px' : '0' }}>
                                                            {g.sanction1 && <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '600', backgroundColor: '#e9ecef', color: '#495057', border: '1px solid #ced4da' }}>1차: {g.sanction1}</span>}
                                                            {g.sanction2 && <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '600', backgroundColor: '#e9ecef', color: '#495057', border: '1px solid #ced4da' }}>2차: {g.sanction2}</span>}
                                                            {g.sanction3 && <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '600', backgroundColor: '#dee2e6', color: '#343a40', border: '1px solid #ced4da' }}>3차: {g.sanction3}</span>}
                                                            {g.fine && <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '600', backgroundColor: '#e9ecef', color: '#495057', border: '1px solid #ced4da' }}>과태료 {g.fine}</span>}
                                                        </div>
                                                        {g.note && <div style={{ fontSize: '0.7rem', color: '#6c757d', lineHeight: '1.5' }}>{g.note}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                    </>
                                )}

                                {/* 이상없음 아코디언: 긴 점검항목 */}
                                {!isViolation && insp.inspectionItems && (
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                        <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>📋 점검항목:</span> {insp.inspectionItems}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            }) : (
                <p className="empty-msg">점검 내역이 없습니다.</p>
            )}
        </div>
    );
}



function InfoRow({ label, value, isClickable, onClick, isExpired }) {
    return (
        <div className="info-row">
            <span className="info-label">{label}</span>
            <span
                className={`info-value ${isClickable ? 'clickable' : ''}`}
                onClick={isClickable ? onClick : undefined}
                style={{
                    ...(isClickable ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-color)' } : {}),
                    ...(isExpired ? { color: '#dc2626', fontWeight: '600' } : {})
                }}
                title={isClickable ? '네이버 지도에서 보기' : undefined}
            >
                {value || '-'}
            </span>
        </div>
    );
}

function Section({ title, children, rightButton }) {
    return (
        <div className="info-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: rightButton ? '16px' : '0' }}>
                <h3 style={{ margin: 0 }}>{title}</h3>
                {rightButton}
            </div>
            {children}
        </div>
    );
}

export default function DetailView({ academy, allAcademies = [], onBack, onSelectAcademy, onShowMap }) {
    const [activeTab, setActiveTab] = useState('status');
    const [showSensitiveInfo, setShowSensitiveInfo] = useState(true);
    const [expandedCourses, setExpandedCourses] = useState([]); // 모두 접힌 상태로 시작
    const [allCoursesExpanded, setAllCoursesExpanded] = useState(false);

    // 터치 스와이프를 위한 ref와 state
    const tabsRef = useRef(null);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);

    // detail-content 스크롤 컨테이너를 위한 ref
    const contentRef = useRef(null);

    // academy가 변경될 때마다 스크롤을 최상단으로 이동
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        // 탭도 현황으로 초기화
        setActiveTab('status');
    }, [academy.id]);

    // 탭 변경 시 해당 탭이 화면에 보이도록 스크롤
    useEffect(() => {
        if (tabsRef.current) {
            const currentTabs = TABS.filter(tab => !((tab.id === 'instructor' && (academy.category || '').includes('교습소')) || (tab.id === 'assistant' && !(academy.category || '').includes('교습소'))));
            const activeTabIndex = currentTabs.findIndex(tab => tab.id === activeTab);
            const tabButtons = tabsRef.current.querySelectorAll('.tab-btn');
            const activeButton = tabButtons[activeTabIndex];

            if (activeButton) {
                // 탭 버튼을 화면 중앙에 위치시키기
                activeButton.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            }
        }
    }, [activeTab]);

    // Toggle individual course
    const toggleCourse = (index) => {
        setExpandedCourses(prev =>
            prev.includes(index)
                ? prev.filter(i => i !== index)
                : [...prev, index]
        );
    };

    // Toggle all courses
    const toggleAllCourses = () => {
        if (allCoursesExpanded) {
            setExpandedCourses([]); // 모두 접기
            setAllCoursesExpanded(false);
        } else {
            setExpandedCourses(academy.courses.map((_, idx) => idx)); // 모두 펼침
            setAllCoursesExpanded(true);
        }
    };

    // 터치 스와이프 핸들러
    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe || isRightSwipe) {
            const currentTabs = TABS.filter(tab => !((tab.id === 'instructor' && (academy.category || '').includes('교습소')) || (tab.id === 'assistant' && !(academy.category || '').includes('교습소'))));
            const currentIndex = currentTabs.findIndex(tab => tab.id === activeTab);
            if (isLeftSwipe && currentIndex < currentTabs.length - 1) {
                setActiveTab(currentTabs[currentIndex + 1].id);
            } else if (isRightSwipe && currentIndex > 0) {
                setActiveTab(currentTabs[currentIndex - 1].id);
            }
        }
    };


    // Extract base address (up to street number)
    const getBaseAddress = (address) => {
        if (!address) return '';
        // Match pattern: "경기도 하남시 미사강변동로 85" (도로명 + 번지)
        const match = address.match(/^(.+?[시군구]\s+.+?[로길]\s+\d+)/);
        return match ? match[1].trim() : address.split('(')[0].trim();
    };

    // Remove city/province from address
    const getShortAddress = (address) => {
        if (!address) return '';
        // Remove "경기도 하남시" part
        const match = address.match(/^.+?[시군구]\s+(.+)$/);
        return match ? match[1].trim() : address;
    };

    // Check if insurance is expired
    const isInsuranceExpired = (endDate) => {
        if (!endDate) return false;
        const today = new Date();
        const end = new Date(endDate);
        return end < today;
    };

    // Extract room number from address (e.g., "302호" or "305호, 306호, 307호, 308호")
    const getRoomNumber = (address) => {
        if (!address) return '';
        // Match all room numbers (e.g., "305호", "306호", etc.)
        const matches = address.match(/\d+호/g);
        if (matches && matches.length > 0) {
            // Remove duplicates and join with comma
            const uniqueRooms = [...new Set(matches)];
            return uniqueRooms.join(', ');
        }
        return '';
    };

    // Format room numbers as ranges (e.g., "305~308호" or "303~304호, 319호")
    const formatRoomRange = (address) => {
        if (!address) return '';
        const matches = address.match(/\d+호/g);
        if (!matches || matches.length === 0) return '';

        // Extract numbers and remove duplicates
        const numbers = [...new Set(matches.map(m => parseInt(m.replace('호', ''))))];
        numbers.sort((a, b) => a - b);

        if (numbers.length === 1) return `${numbers[0]}호`;

        // Group consecutive numbers
        const ranges = [];
        let start = numbers[0];
        let end = numbers[0];

        for (let i = 1; i < numbers.length; i++) {
            if (numbers[i] === end + 1) {
                end = numbers[i];
            } else {
                ranges.push(start === end ? `${start}호` : `${start}~${end}호`);
                start = numbers[i];
                end = numbers[i];
            }
        }
        ranges.push(start === end ? `${start}호` : `${start}~${end}호`);

        return ranges.join(', ');
    };

    // Extract building name from address
    const getBuildingName = (address) => {
        if (!address) return '';
        // Match building name in parentheses, e.g., "(망월동, 힐스테이트에코미사)"
        const match = address.match(/\([^)]*,\s*([^)]+)\)/);
        if (match && match[1]) {
            // Remove extra info like "주건축물 제1동"
            return match[1].replace(/\s*주건축물.*$/, '').trim();
        }
        return '';
    };

    // 주소에서 시/군/구 추출
    const getCityDistrict = (address) => {
        if (!address) return '';
        const parts = address.split(' ');
        const city = parts.find(p => /[가-힣]+(시|군|구)$/.test(p));
        return city || '';
    };

    // Find academies in the same building (including current academy)
    const baseAddress = getBaseAddress(academy.address);

    // 주소에서 호수 숫자 추출 → 오름차순 정렬용
    const unitSortKey = (addr) => {
        if (!addr) return 999999;
        // 동+호 (e.g., "108동 1101호")
        const dongHo = addr.match(/(\d{1,4})동\s*(\d{3,4})호/);
        if (dongHo) return parseInt(dongHo[1]) * 10000 + parseInt(dongHo[2]);
        // 범위호 (e.g., "303~305호")
        const range = addr.match(/(\d+)~\d+호/);
        if (range) return parseInt(range[1]);
        // 콤마 이후 호 (e.g., ", 202호", ", 2-166호")
        const afterComma = addr.includes(',') ? addr.split(',').slice(1).join(',') : '';
        const commaHo = afterComma.match(/(\d+(?:-\d+)?)호/);
        if (commaHo) {
            const p = commaHo[1].split('-');
            return p.length > 1 ? parseInt(p[0]) * 1000 + parseInt(p[1]) : parseInt(p[0]);
        }
        // 주소 끝 호 (e.g., "202호")
        const endHo = addr.match(/(\d+(?:-\d+)?)호(?:\s*\([^)]*\))?\s*$/);
        if (endHo) {
            const p = endHo[1].split('-');
            return p.length > 1 ? parseInt(p[0]) * 1000 + parseInt(p[1]) : parseInt(p[0]);
        }
        return 999999;
    };

    const sameBuildingAcademies = allAcademies
        .filter(a => getBaseAddress(a.address) === baseAddress && ['개원', '신고'].includes(a.status))
        .sort((a, b) => unitSortKey(a.address) - unitSortKey(b.address));

    const renderContent = () => {
        switch (activeTab) {
            case 'status':
                return (
                    <div className="tab-content animate-enter">
                        <Section
                            title="기본 정보"
                            rightButton={
                                <a
                                    href={`https://map.naver.com/p/search/${encodeURIComponent(
                                        (() => { const d = getCityDistrict(academy.address); return d ? `${academy.name} ${d}` : academy.name; })()
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '6px 12px',
                                        backgroundColor: '#5FD68A',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 1px 3px rgba(95, 214, 138, 0.3)',
                                        textDecoration: 'none'
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = '#4EC57A';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(95, 214, 138, 0.4)';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = '#5FD68A';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(95, 214, 138, 0.3)';
                                    }}
                                    title="네이버 플레이스에서 보기"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                        <polyline points="15 3 21 3 21 9"></polyline>
                                        <line x1="10" y1="14" x2="21" y2="3"></line>
                                    </svg>
                                    <span>플레이스</span>
                                </a>
                            }
                        >
                            <InfoRow label="등록번호" value={academy.id} />
                            <InfoRow label="학원명" value={academy.name} />
                            {academy.founder?.name && <InfoRow label="설립자" value={academy.founder.name} />}
                            <InfoRow label="학원종류" value={academy.category} />
                            <InfoRow label="분야구분" value={academy.field} />
                            <div className="info-row">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="info-label">주소</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onShowMap) {
                                                onShowMap(academy);
                                            } else {
                                                window.open(`https://map.naver.com/p/search/${encodeURIComponent(academy.address)}`, '_blank');
                                            }
                                        }}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            padding: '4px 8px',
                                            backgroundColor: 'var(--bg-card)',
                                            color: 'var(--primary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxShadow: 'var(--shadow-sm)',
                                            whiteSpace: 'nowrap'
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                                            e.currentTarget.style.borderColor = 'var(--primary)';
                                        }}
                                        onMouseOut={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                        }}
                                        title="학원 등 분포지도에서 보기"
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                            <circle cx="12" cy="10" r="3"></circle>
                                        </svg>
                                        <span>지도</span>
                                    </button>
                                </div>
                                <a
                                    href={academy.address ? `https://map.naver.com/p/search/${encodeURIComponent(academy.address)}` : undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="info-value clickable"
                                    style={{
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                        textDecorationColor: 'var(--border-color)',
                                        color: 'inherit'
                                    }}
                                    title="네이버 지도에서 보기"
                                >
                                    {academy.address || '-'}
                                </a>
                            </div>
                            <InfoRow label="우편번호" value={academy.zip} />
                        </Section>
                        <Section title="상태 정보">
                            <InfoRow label="등록일" value={academy.regDate} />
                            <InfoRow label="등록상태" value={academy.status} isExpired={academy.status && !['개원', '신고'].includes(academy.status)} />
                            <InfoRow label="상태변경일" value={academy.statusDate} />
                            {academy.isMultiUse && <InfoRow label="다중이용업소" value={academy.isMultiUse} />}
                            {academy.isBoarding && <InfoRow label="기숙학원" value={academy.isBoarding} />}
                            {academy.disclosure && <InfoRow label="수강료공개" value={academy.disclosure} />}
                            {academy.ownership && <InfoRow label="건물소유" value={academy.ownership} />}
                        </Section>
                        {sameBuildingAcademies.length > 0 && (() => {
                            // Get building info from first academy
                            const firstAcademy = sameBuildingAcademies[0];
                            const buildingName = getBuildingName(firstAcademy.address) || getBuildingName(academy.address);
                            const floors = firstAcademy.facilities?.floors || academy.facilities?.floors || '-';
                            const totalFloors = floors.includes('~') ? floors.split('~')[1].trim().replace(/[^0-9]/g, '') : '-';
                            const buildingArea = formatNumber(firstAcademy.facilities?.buildingArea || academy.facilities?.buildingArea);

                            // Calculate total area sum and dedicated area sum
                            const totalAreaSum = sameBuildingAcademies.reduce((sum, a) => {
                                const area = parseFloat(a.facilities?.totalArea) || 0;
                                return sum + area;
                            }, 0);

                            const dedicatedAreaSum = sameBuildingAcademies.reduce((sum, a) => {
                                const area = parseFloat(a.facilities?.dedicatedArea) || 0;
                                return sum + area;
                            }, 0);

                            return (
                                <Section title={`동일 건축물 학원목록 (${sameBuildingAcademies.length}개)`}>
                                    <div style={{
                                        fontSize: '0.9rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: '16px',
                                        padding: '12px',
                                        backgroundColor: 'var(--bg-light)',
                                        borderRadius: '8px',
                                        lineHeight: '1.6'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '6px',
                                            marginBottom: '8px'
                                        }}>
                                            <span style={{ fontSize: '1rem', marginTop: '2px' }}>📍</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ marginBottom: '4px' }}>
                                                    {baseAddress}
                                                </div>
                                                <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                                                    {buildingName && `${buildingName} `}{totalFloors}층 건물 (연면적 {buildingArea}㎡)
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{
                                            fontSize: '0.85rem',
                                            color: 'var(--text-main)',
                                            marginTop: '8px',
                                            paddingTop: '8px',
                                            borderTop: '1px solid var(--border-color)'
                                        }}>
                                            <div style={{ marginBottom: '4px' }}>
                                                <strong>[학원({sameBuildingAcademies.length}개)]</strong> 총면적 합계: <strong>{formatNumber(totalAreaSum.toFixed(2))}㎡</strong>
                                            </div>
                                            <div>
                                                <strong>[학원({sameBuildingAcademies.length}개)]</strong> 전용면적 합계: <strong>{formatNumber(dedicatedAreaSum.toFixed(2))}㎡</strong>
                                            </div>
                                        </div>
                                    </div>
                                    {sameBuildingAcademies.map((a, idx) => {
                                        const roomRange = formatRoomRange(a.address);
                                        const isCurrentAcademy = a.id === academy.id;
                                        return (
                                            <div
                                                key={a.id}
                                                style={{
                                                    padding: '12px',
                                                    marginBottom: idx === sameBuildingAcademies.length - 1 ? '0' : '12px',
                                                    border: isCurrentAcademy ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                                    borderRadius: '12px',
                                                    backgroundColor: isCurrentAcademy ? 'rgba(79, 70, 229, 0.05)' : 'var(--bg-card)',
                                                    cursor: isCurrentAcademy ? 'default' : 'pointer',
                                                    transition: 'all 0.2s',
                                                    boxShadow: 'var(--shadow-sm)',
                                                    position: 'relative'
                                                }}
                                                onClick={() => !isCurrentAcademy && onSelectAcademy && onSelectAcademy(a)}
                                                onMouseOver={(e) => {
                                                    if (!isCurrentAcademy) {
                                                        e.currentTarget.style.backgroundColor = 'var(--bg-light)';
                                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                                                    }
                                                }}
                                                onMouseOut={(e) => {
                                                    if (!isCurrentAcademy) {
                                                        e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                                                        e.currentTarget.style.borderColor = 'var(--border-color)';
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                                    }
                                                }}
                                            >
                                                <div style={{
                                                    fontWeight: '700',
                                                    color: 'var(--primary)',
                                                    marginBottom: '6px',
                                                    fontSize: '1rem',
                                                    display: 'flex',
                                                    alignItems: 'baseline',
                                                    gap: '6px',
                                                    flexWrap: 'wrap'
                                                }}>
                                                    <span>{a.name}</span>
                                                    {roomRange && (
                                                        <span style={{
                                                            fontSize: '0.85rem',
                                                            color: 'var(--text-muted)',
                                                            fontWeight: '500'
                                                        }}>({roomRange})</span>
                                                    )}
                                                    {isCurrentAcademy && (
                                                        <span style={{
                                                            fontSize: '0.75rem',
                                                            color: 'white',
                                                            backgroundColor: 'var(--primary)',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            fontWeight: '600'
                                                        }}>현재 보는 학원</span>
                                                    )}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    color: 'var(--text-muted)',
                                                    marginBottom: '6px'
                                                }}>
                                                    {a.category} · {a.field}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    color: 'var(--text-muted)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    flexWrap: 'wrap'
                                                }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span>📐</span>
                                                        <span>(총면적) {formatNumber(a.facilities?.totalArea)}㎡ (전용면적) {formatNumber(a.facilities?.dedicatedArea)}㎡</span>
                                                    </span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span>📅</span>
                                                        <span>{a.regDate}</span>
                                                    </span>
                                                    {(() => {
                                                        const period = getUninspectedPeriod(a.inspections, a.regDate);
                                                        return period ? (
                                                            <span style={{
                                                                color: '#dc2626',
                                                                fontWeight: '600',
                                                                fontSize: '0.82rem'
                                                            }}>{period}</span>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </Section>
                            );
                        })()}
                    </div>
                );
            case 'founder': {
                const founderName = academy.founder?.name;
                let sameFounderAcademies = [];
                let totalAreaSum = 0;

                if (founderName) {
                    sameFounderAcademies = sameBuildingAcademies.filter(a => a.founder && a.founder.name === founderName);
                    totalAreaSum = sameFounderAcademies.reduce((sum, a) => {
                        const area = parseFloat(a.facilities?.totalArea) || 0;
                        return sum + area;
                    }, 0);
                }

                return (
                    <div className="tab-content animate-enter">
                        <Section title="설립자 정보">
                            <InfoRow label="성명" value={academy.founder.name} />
                            <div
                                onClick={() => setShowSensitiveInfo(!showSensitiveInfo)}
                                style={{
                                    padding: '12px 0',
                                    cursor: 'pointer',
                                    color: 'var(--primary)',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    borderBottom: '1px dotted var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <span>{showSensitiveInfo ? '▼' : '▶'}</span>
                                <span>개인정보 {showSensitiveInfo ? '숨기기' : '보기'}</span>
                            </div>
                            {showSensitiveInfo && (
                                <>
                                    <InfoRow label="생년월일" value={academy.founder.birth} />
                                    <InfoRow label="주소" value={academy.founder.address} />
                                </>
                            )}
                            <InfoRow label="전화번호" value={academy.founder.phone} />
                            <InfoRow label="핸드폰" value={academy.founder.mobile} />
                        </Section>

                        {sameFounderAcademies.length > 0 && (
                            <Section title={`동일 위치 동일 설립자 등록 학원 (${sameFounderAcademies.length}개)`}>
                                <div style={{
                                    fontSize: '0.85rem',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    backgroundColor: totalAreaSum >= 500 ? '#fff1f2' : 'var(--bg-light)',
                                    border: totalAreaSum >= 500 ? '1.5px solid #fca5a5' : '1px solid var(--border-color)',
                                    marginBottom: '12px'
                                }}>
                                    <div style={{ marginBottom: totalAreaSum >= 500 ? '10px' : '0', color: 'var(--text-main)', lineHeight: '1.5' }}>
                                        동일 위치(<strong>{baseAddress}</strong>)에 설립자 <strong>{founderName}</strong>님 명의로 등록된 학원들의 <strong>총면적 합계</strong>는 <strong>{formatNumber(totalAreaSum.toFixed(2))}㎡</strong> 입니다.
                                    </div>
                                    {totalAreaSum >= 500 && (
                                        <div style={{
                                            color: '#b91c1c',
                                            fontWeight: '700',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '8px',
                                            paddingTop: '10px',
                                            borderTop: '1px dashed #fca5a5'
                                        }}>
                                            <span style={{ fontSize: '1.2rem', marginTop: '-2px' }}>⚠️</span>
                                            <span style={{ lineHeight: '1.5' }}>
                                                총면적 합계가 <strong>500㎡ 이상</strong>이므로, 해당 위치의 건축물용도는
                                                '제2종근린생활시설(학원, 교습소)'이 아닌, <strong>'교육연구시설(학원)'</strong>이어야 합니다.
                                                <br />
                                                <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#991b1b', marginTop: '4px', display: 'inline-block' }}>
                                                    * 건축물대장을 확인하여 용도변경 등 검토가 필요합니다.
                                                </span>
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {sameFounderAcademies.map(a => (
                                        <div key={a.id} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '12px', backgroundColor: 'var(--bg-card)',
                                            border: '1px solid var(--border-color)', borderRadius: '8px',
                                            fontSize: '0.85rem'
                                        }}>
                                            <div style={{ fontWeight: '700', color: 'var(--primary)' }}>{a.name}</div>
                                            <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)' }}>
                                                <span>{a.category}</span>
                                                <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{formatNumber(a.facilities?.totalArea)}㎡</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        )}
                    </div>
                );
            }
            case 'facilities':
                return (
                    <div className="tab-content animate-enter">
                        <Section title="시설 현황">
                            <InfoRow label="건물연면적" value={`${formatNumber(academy.facilities.buildingArea)}㎡`} />
                            <InfoRow label="총면적" value={`${formatNumber(academy.facilities.totalArea)}㎡`} />
                            <InfoRow label="전용면적" value={`${formatNumber(academy.facilities.dedicatedArea)}㎡`} />
                            <InfoRow label="총 층수" value={academy.facilities.floors} />
                            <InfoRow label="준공일" value={academy.facilities.builtDate} />
                            <InfoRow label="일시수용능력" value={`${formatNumber(academy.facilities.capacityTemporary)}명`} />
                            <InfoRow label="정원합계" value={`${formatNumber(academy.facilities.capacityTotal)}명`} />
                        </Section>
                    </div>
                );
            case 'tuition':
                return (
                    <div className="tab-content animate-enter">
                        {/* 게시표 출력 버튼 (내부용 / 외부용) */}
                        <div className="tuition-print-btns">
                            <button
                                className="tuition-print-btn tuition-print-btn--inner"
                                onClick={() => printTuitionForm(academy)}
                            >
                                🖨️ <span className="btn-label-full">교습비등 게시표(내부용) 출력</span>
                                   <span className="btn-label-short">내부용</span>
                            </button>
                            <button
                                className="tuition-print-btn tuition-print-btn--outer"
                                onClick={() => printTuitionFormExternal(academy)}
                            >
                                🖨️ <span className="btn-label-full">교습비등 게시표(외부용) 출력</span>
                                   <span className="btn-label-short">외부용</span>
                            </button>
                        </div>

                        {/* 헤더: 총 개수 + 전체 펼침 버튼 */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            backgroundColor: 'var(--bg-light)',
                            borderRadius: '12px',
                            marginBottom: '16px'
                        }}>
                            <span style={{
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                color: 'var(--text-main)'
                            }}>
                                총 {academy.courses.length}개 교습과정
                            </span>
                            <button
                                onClick={toggleAllCourses}
                                style={{
                                    padding: '6px 16px',
                                    backgroundColor: 'var(--primary)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => e.target.style.backgroundColor = 'var(--primary-hover)'}
                                onMouseOut={(e) => e.target.style.backgroundColor = 'var(--primary)'}
                            >
                                {allCoursesExpanded ? '전체 접기' : '전체 펼침'}
                            </button>
                        </div>

                        {/* 아코디언 리스트 */}
                        {academy.courses.map((course, idx) => {
                            const isExpanded = expandedCourses.includes(idx);
                            return (
                                <div
                                    key={idx}
                                    style={{
                                        marginBottom: '8px',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        backgroundColor: 'var(--bg-card)'
                                    }}
                                >
                                    {/* 아코디언 헤더 */}
                                    <div
                                        onClick={() => toggleCourse(idx)}
                                        style={{
                                            padding: '16px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            backgroundColor: isExpanded ? 'var(--bg-light)' : 'transparent',
                                            transition: 'background-color 0.2s'
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '1rem',
                                            color: 'var(--primary)',
                                            fontWeight: '700',
                                            minWidth: '20px'
                                        }}>
                                            {isExpanded ? '▼' : '▶'}
                                        </span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{
                                                fontSize: '0.95rem',
                                                fontWeight: '700',
                                                color: 'var(--text-main)',
                                                marginBottom: '4px'
                                            }}>
                                                {idx + 1}. {course.process} - {course.subject}
                                            </div>
                                            {!isExpanded && (() => {
                                                const totalTimeNum = Number(String(course.totalTime || '').replace(/[^0-9]/g, ''));
                                                const rawUnitPriceStr = String(course.unitPrice || '0').replace(/[^0-9.]/g, '');
                                                const unitPriceNum = parseFloat(rawUnitPriceStr);
                                                const rawStdPriceStr = String(course.standardUnitPrice || '0').replace(/[^0-9.]/g, '');
                                                const HIGH_SCHOOL_SCIENCE_SUBJ = ['통합과학', '물리', '화학', '생명과학', '지구과학', '생물'];
                                                let stdPriceNum = parseFloat(rawStdPriceStr);
                                                if (stdPriceNum === 222 && HIGH_SCHOOL_SCIENCE_SUBJ.some(s => (course.subject || '').includes(s))) stdPriceNum = 234;

                                                // AL열 교습비 우선, 없으면 AO열 총교습비 사용
                                                const feeRaw = course.tuitionFee || course.totalFee || '';
                                                const feeNum = Number(String(feeRaw).replace(/[^0-9]/g, ''));
                                                const feeLabel = course.tuitionFee ? '교습비' : '총교습비';
                                                const feeDisplay = course.tuitionFee || course.totalFee;

                                                let isExcess = false;
                                                let hasValidCompare = false;
                                                if (!isNaN(unitPriceNum) && unitPriceNum > 0 && !isNaN(stdPriceNum) && stdPriceNum > 0) {
                                                    hasValidCompare = true;
                                                    isExcess = unitPriceNum > stdPriceNum;
                                                }

                                                // 정확한 분당단가 역산 (AL열 교습비 기준)
                                                let exactUnitPrice = 0;
                                                let displayUnitPrice = '';
                                                let isSimilar = false;
                                                const validCombinations = [];

                                                if (totalTimeNum > 0 && feeNum > 0) {
                                                    exactUnitPrice = feeNum / totalTimeNum;
                                                    displayUnitPrice = exactUnitPrice % 1 !== 0 ? exactUnitPrice.toFixed(2) : exactUnitPrice.toString();

                                                    if (!isNaN(unitPriceNum) && unitPriceNum > 0) {
                                                        isSimilar = Math.abs(exactUnitPrice - unitPriceNum) <= 1.5;
                                                    }

                                                    // best-fit: 실제 곱이 총교습시간에 가장 가까운 조합 우선
                                                    for (const weeks of [4.3, 4.2, 4.1, 4.0]) {
                                                        for (let sessions = 1; sessions <= 7; sessions++) {
                                                            const rawMinutes = (totalTimeNum / weeks) / sessions;
                                                            const minutes = Math.round(rawMinutes);
                                                            if (minutes < 30 || minutes > 300) continue;
                                                            const actualTotal = minutes * sessions * weeks;
                                                            const diffFromTotal = Math.abs(actualTotal - totalTimeNum);
                                                            if (diffFromTotal > 8) continue; // 8분 초과 차이는 제외
                                                            let roundScore = 0;
                                                            if (minutes % 60 === 0) roundScore += 30;
                                                            else if (minutes % 30 === 0) roundScore += 20;
                                                            else if (minutes % 10 === 0) roundScore += 10;
                                                            else if (minutes % 5 === 0) roundScore += 5;
                                                            if (sessions >= 3 && sessions <= 5) roundScore += 20;
                                                            validCombinations.push({ sessions, minutes, weeks, diffFromTotal, roundScore });
                                                        }
                                                    }
                                                    // 1순위: 실제 곱과의 차이 (작을수록 좋음), 2순위: 분 단위 둥글기
                                                    validCombinations.sort((a, b) =>
                                                        Math.abs(a.diffFromTotal - b.diffFromTotal) > 0.5
                                                            ? a.diffFromTotal - b.diffFromTotal
                                                            : b.roundScore - a.roundScore
                                                    );
                                                }

                                                const calcUnitPriceColor = isSimilar ? '#2563eb' : '#dc2626';
                                                const unitPriceLabel = (academy.category || '').includes('교습소') ? '교습소단가' : '학원단가';

                                                return (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div>
                                                            {course.track} | 정원: {course.quota}명 | {feeLabel}: <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.92rem' }}>{feeDisplay}원</span> {course.totalTime ? `| 총교습시간: ${course.totalTime}분` : ''}
                                                        </div>

                                                        {(course.unitPrice || course.standardUnitPrice) && (
                                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-light)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)', border: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
                                                                    {unitPriceLabel}: <span style={{ color: '#2563eb', fontWeight: '800' }}>{course.unitPrice ? `${course.unitPrice}원` : '-'}</span>
                                                                </span>
                                                                {hasValidCompare && (
                                                                    <span style={{ fontWeight: '900', fontSize: '0.85rem', color: unitPriceNum > stdPriceNum ? '#dc2626' : unitPriceNum < stdPriceNum ? '#059669' : '#64748b' }}>
                                                                        {unitPriceNum > stdPriceNum ? '>' : unitPriceNum < stdPriceNum ? '<' : '='}
                                                                    </span>
                                                                )}
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-light)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)', border: '1px solid var(--border-color)', fontSize: '0.75rem', fontWeight: '500' }}>
                                                                    기준단가: {stdPriceNum > 0 ? `${stdPriceNum}원` : '-'}
                                                                </span>
                                                                {hasValidCompare && (
                                                                    <span style={{ color: unitPriceNum > stdPriceNum ? '#dc2626' : '#2563eb', fontWeight: '800', fontSize: '0.75rem' }}>
                                                                        [{unitPriceNum > stdPriceNum ? '단가 초과' : '단가 적합'}]
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {validCombinations.length > 0 && (() => {
                                                            const best = validCombinations[0];
                                                            const weeklyMinutes = best.minutes * best.sessions;
                                                            const h = Math.floor(weeklyMinutes / 60);
                                                            const m = Math.round(weeklyMinutes % 60);
                                                            const formattedTime = h > 0 ? `${h}시간 ${m.toString().padStart(2, '0')}분` : `${m}분`;

                                                            return (
                                                                <div style={{ marginTop: '4px', fontSize: '0.78rem', color: '#000000', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <div>
                                                                        (교습시간) {totalTimeNum.toLocaleString()}분 = <span style={{ fontWeight: '800' }}>{best.minutes}분씩</span> × <span style={{ fontWeight: '800' }}>주{best.sessions}회</span> × {best.weeks !== 4.3 ? <span style={{ color: '#10b981', fontWeight: '800' }}>{best.weeks}주</span> : <span>{best.weeks}주</span>}
                                                                        <br />
                                                                        <span style={{ paddingLeft: '64px', color: '#ea580c' }}>→ 주당 {weeklyMinutes}분({formattedTime})</span>
                                                                    </div>
                                                                    <div>
                                                                        (교습비) {totalTimeNum.toLocaleString()}분 × <span style={{ color: calcUnitPriceColor, fontWeight: '800' }}>{displayUnitPrice}원</span> = {feeNum.toLocaleString()}원
                                                                        <span style={{ marginLeft: '6px', color: isSimilar ? '#2563eb' : '#dc2626', fontWeight: '800' }}>
                                                                            [{isSimilar ? `${unitPriceLabel} 적합` : `${unitPriceLabel} 이상`}]
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* 아코디언 내용 */}
                                    {isExpanded && (
                                        <div style={{
                                            padding: '0 16px 16px 48px',
                                            borderTop: '1px solid var(--border-color)',
                                            backgroundColor: 'var(--bg-card)'
                                        }}>
                                            <InfoRow label="교습계열" value={course.track} />
                                            <InfoRow label="정원" value={`${course.quota}명`} />
                                            <InfoRow label="교습기간" value={course.period} />
                                            <InfoRow label="총교습시간" value={course.totalTime ? `${course.totalTime}분` : '-'} />
                                            {course.tuitionFee && <InfoRow label="교습비(AL열)" value={`${course.tuitionFee}원`} />}
                                            <InfoRow label="총교습비" value={`${course.totalFee}원`} />
                                            <InfoRow label="시간당" value={`${course.feePerHour}원`} />
                                            <InfoRow label={(academy.category || '').includes('교습소') ? '교습소분당단가' : '학원분당단가'} value={course.unitPrice ? `${course.unitPrice}원` : '-'} isExpired={
                                                (course.unitPrice || '').toString().replace(/[^0-9.]/g, '') &&
                                                (course.standardUnitPrice || '').toString().replace(/[^0-9.]/g, '') &&
                                                Number((course.unitPrice || '').toString().replace(/[^0-9.]/g, '')) > Number((course.standardUnitPrice || '').toString().replace(/[^0-9.]/g, ''))
                                            } />
                                            <InfoRow label="기준분당단가" value={course.standardUnitPrice ? `${course.standardUnitPrice}원` : '-'} />
                                            {(() => {
                                                const totalTimeNum = Number(String(course.totalTime || '').replace(/[^0-9]/g, ''));
                                                const unitPriceNum = parseFloat(String(course.unitPrice || '0').replace(/[^0-9.]/g, ''));
                                                const stdPriceNum = parseFloat(String(course.standardUnitPrice || '0').replace(/[^0-9.]/g, ''));

                                                // AL열 교습비 우선 사용
                                                const feeRaw = course.tuitionFee || course.totalFee || '';
                                                const feeNum = Number(String(feeRaw).replace(/[^0-9]/g, ''));

                                                if (!totalTimeNum || !feeNum) return null;

                                                // 분당단가 역산
                                                const exactUnitPrice = feeNum / totalTimeNum;
                                                const displayUnitPrice = exactUnitPrice.toFixed(2);
                                                const isSimilar = !isNaN(unitPriceNum) && unitPriceNum > 0
                                                    ? Math.abs(exactUnitPrice - unitPriceNum) <= 1.5
                                                    : true;
                                                const unitPriceLabel = (academy.category || '').includes('교습소') ? '교습소단가' : '학원단가';

                                                // best-fit 교습 구성 (실제 곱이 총교습시간에 가장 가까운 조합)
                                                const combos = [];
                                                for (const weeks of [4.3, 4.2, 4.1, 4.0]) {
                                                    for (let sessions = 1; sessions <= 7; sessions++) {
                                                        const minutes = Math.round((totalTimeNum / weeks) / sessions);
                                                        if (minutes < 30 || minutes > 300) continue;
                                                        const diff = Math.abs(minutes * sessions * weeks - totalTimeNum);
                                                        if (diff > 8) continue;
                                                        let rnd = 0;
                                                        if (minutes % 60 === 0) rnd = 30;
                                                        else if (minutes % 30 === 0) rnd = 20;
                                                        else if (minutes % 10 === 0) rnd = 10;
                                                        else if (minutes % 5 === 0) rnd = 5;
                                                        if (sessions >= 3 && sessions <= 5) rnd += 20;
                                                        combos.push({ sessions, minutes, weeks, diff, rnd });
                                                    }
                                                }
                                                combos.sort((a, b) => Math.abs(a.diff - b.diff) > 0.5 ? a.diff - b.diff : b.rnd - a.rnd);
                                                const best = combos[0];

                                                return (
                                                    <div style={{ marginTop: '16px', padding: '14px', backgroundColor: 'var(--bg-light)', borderRadius: '12px', fontSize: '0.83rem', color: 'var(--text-main)', lineHeight: '1.7', borderLeft: '4px solid var(--primary)' }}>
                                                        <div style={{ fontWeight: '800', marginBottom: '10px', color: 'var(--primary)', fontSize: '0.85rem' }}>💡 교습비 점검</div>

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {/* 교습 구성 */}
                                                            {best && (() => {
                                                                const weeklyMin = best.minutes * best.sessions;
                                                                const h = Math.floor(weeklyMin / 60);
                                                                const m = weeklyMin % 60;
                                                                const timeStr = h > 0 ? `${h}시간 ${String(m).padStart(2,'0')}분` : `${m}분`;
                                                                const actualTotal = (best.minutes * best.sessions * best.weeks).toFixed(1);
                                                                return (
                                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                                        <span style={{ color: '#64748b', minWidth: '80px', fontSize: '0.78rem', fontWeight: '700' }}>📐 교습 구성</span>
                                                                        <span>
                                                                            <b>{best.minutes}분</b> × 주<b>{best.sessions}회</b> × <b>{best.weeks}주</b> = <b>{actualTotal}분</b>
                                                                            <span style={{ color: '#64748b' }}> (등록: {totalTimeNum}분)</span>
                                                                            <br/>
                                                                            <span style={{ color: '#ea580c', fontSize: '0.77rem' }}>→ 주당 {weeklyMin}분 ({timeStr})</span>
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* 분당단가 역산 */}
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                                <span style={{ color: '#64748b', minWidth: '80px', fontSize: '0.78rem', fontWeight: '700' }}>💰 분당단가</span>
                                                                <span>
                                                                    {feeNum.toLocaleString()}원 ÷ {totalTimeNum}분 = <b style={{ color: isSimilar ? '#2563eb' : '#dc2626' }}>{displayUnitPrice}원/분</b>
                                                                    <span style={{ color: '#64748b', fontSize: '0.77rem' }}> ({course.tuitionFee ? 'AL열 교습비 기준' : '총교습비 기준'})</span>
                                                                </span>
                                                            </div>

                                                            {/* 단가 비교 */}
                                                            {!isNaN(unitPriceNum) && unitPriceNum > 0 && !isNaN(stdPriceNum) && stdPriceNum > 0 && (
                                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                                    <span style={{ color: '#64748b', minWidth: '80px', fontSize: '0.78rem', fontWeight: '700' }}>📊 단가 비교</span>
                                                                    <span>
                                                                        {unitPriceLabel} <b style={{ color: '#2563eb' }}>{course.unitPrice}원</b>
                                                                        {' / '}기준단가 <b>{course.standardUnitPrice}원</b>
                                                                        <span style={{ marginLeft: '6px', fontWeight: '800', color: unitPriceNum > stdPriceNum ? '#dc2626' : '#059669' }}>
                                                                            {unitPriceNum > stdPriceNum ? '▲ 기준 초과' : '✓ 기준 이하'}
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* 결론 */}
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                                <span style={{ color: '#64748b', minWidth: '80px', fontSize: '0.78rem', fontWeight: '700' }}>🔍 판정</span>
                                                                <span style={{ fontWeight: '700', color: isSimilar ? '#059669' : '#dc2626' }}>
                                                                    {isSimilar
                                                                        ? `역산 단가(${displayUnitPrice}원)와 ${unitPriceLabel}(${course.unitPrice}원) 일치 → 적합`
                                                                        : `역산 단가(${displayUnitPrice}원)가 ${unitPriceLabel}(${course.unitPrice}원)과 불일치 → 확인 필요`}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* 교습비 분당단가 기준표 */}
                        {(() => {
                            // 고등 과학 과목 키워드 (시트에 중등 단가로 잘못 등록된 경우 보정)
                            const HIGH_SCHOOL_SCIENCE = ['통합과학', '물리', '화학', '생명과학', '지구과학', '생물'];
                            // 과정명+가격 조합으로 매칭 (미술/무용 같은 가격 혼동 방지)
                            const academyStdPriceKeys = new Set(academy.courses.map(c => {
                                let price = Math.round(parseFloat(String(c.standardUnitPrice || '0').replace(/[^0-9.]/g, '')));
                                if (!price) return null;
                                // 고등과학 과목이 중등 단가(222)로 잘못 설정된 경우 고등 단가(234)로 보정
                                if (price === 222 && HIGH_SCHOOL_SCIENCE.some(s => (c.subject || '').includes(s))) price = 234;
                                const proc = (c.process || '').trim();
                                return proc ? `${proc}:${price}` : null;
                            }).filter(Boolean));

                            return (
                                <div style={{ marginTop: '24px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '12px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>📋</span> 교습비 분당단가 기준
                                    </h3>
                                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'center', backgroundColor: 'var(--bg-card)' }}>
                                            <thead style={{ backgroundColor: '#f8fafc' }}>
                                                <tr>
                                                    <th style={{ padding: '10px', borderBottom: '2px solid var(--border-color)', color: 'var(--text-main)', fontWeight: '700', whiteSpace: 'nowrap' }}>교습과정</th>
                                                    <th style={{ padding: '10px', borderBottom: '2px solid var(--border-color)', color: 'var(--text-main)', fontWeight: '700', whiteSpace: 'nowrap' }}>교습과목(반)</th>
                                                    <th style={{ padding: '10px', borderBottom: '2px solid var(--border-color)', color: 'var(--text-main)', fontWeight: '700', whiteSpace: 'nowrap' }}>분당단가(원)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {TUITION_STANDARDS.map((std, idx) => {
                                                    const isHighlighted = academyStdPriceKeys.has(`${std.process}:${std.price}`);
                                                    return (
                                                        <tr key={idx} style={{
                                                            backgroundColor: isHighlighted ? '#bfdbfe' : (idx % 2 === 0 ? 'transparent' : '#f8fafc'),
                                                            borderBottom: idx === TUITION_STANDARDS.length - 1 ? 'none' : `1px solid ${isHighlighted ? '#93c5fd' : 'var(--border-color)'}`,
                                                            transition: 'all 0.2s',
                                                        }}>
                                                            <td style={{
                                                                padding: '10px',
                                                                fontWeight: isHighlighted ? '800' : '400',
                                                                color: isHighlighted ? '#1e40af' : 'var(--text-main)',
                                                                borderLeft: isHighlighted ? '4px solid #1d4ed8' : '4px solid transparent'
                                                            }}>{std.process}</td>
                                                            <td style={{
                                                                padding: '10px',
                                                                fontWeight: isHighlighted ? '800' : '400',
                                                                color: isHighlighted ? '#1e40af' : 'var(--text-main)'
                                                            }}>{std.target}</td>
                                                            <td style={{
                                                                padding: '10px',
                                                                fontWeight: isHighlighted ? '900' : '500',
                                                                color: isHighlighted ? '#1e40af' : 'var(--text-muted)',
                                                                fontSize: isHighlighted ? '0.95rem' : undefined,
                                                            }}>{std.price}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        * 해당 학원의 교습과목에 적용된 <strong>기준 단가</strong>가 <span style={{ color: '#1d4ed8', fontWeight: '700', backgroundColor: '#eff6ff', padding: '2px 6px', borderRadius: '4px' }}>파란색 배경(강조표시)</span>으로 나타납니다.
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                );
            case 'insurance':
                return (
                    <div className="tab-content animate-enter">
                        {academy.insurances.map((ins, idx) => {
                            const expired = isInsuranceExpired(ins.endDate);
                            return (
                                <div key={idx} className="card-item">
                                    <h4>{ins.company}</h4>
                                    <InfoRow label="계약업체" value={ins.contractor} />
                                    <InfoRow label="계약번호" value={ins.policyNumber} />
                                    <InfoRow label="강사수" value={`${ins.teachersCount}명`} />
                                    <InfoRow label="사고당배상" value={`${ins.compensationPerAccident}원`} />
                                    <InfoRow label="인당의료실비" value={`${ins.medicalPerPerson}원`} />
                                    <InfoRow label="인당배상" value={`${ins.compensationPerPerson}원`} />
                                    <InfoRow
                                        label="보험기간"
                                        value={`${ins.startDate} ~ ${ins.endDate}`}
                                        isExpired={expired}
                                    />
                                </div>
                            );
                        })}
                    </div>
                );
            case 'instructor': {
                return (
                    <InstructorTab instructors={academy.instructors || []} />
                );
            }
            case 'assistant': {
                return (
                    <AssistantTab assistants={academy.assistants || []} />
                );
            }
            case 'inspection': {
                const totalCount = academy.inspections.length;
                const violationCount = academy.inspections.filter(i => i.isViolation).length;

                return (
                    <InspectionTab
                        inspections={academy.inspections}
                        totalCount={totalCount}
                        violationCount={violationCount}
                    />
                );
            }
            default:
                return null;
        }
    };

    return (
        <div className="detail-view">
            <div className="detail-header">
                <button onClick={onBack} className="back-btn" aria-label="뒤로가기">
                    ←
                </button>
                <h2>{academy.name}</h2>
            </div>

            <div
                className="tabs-container"
                ref={tabsRef}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {TABS.filter(tab => !((tab.id === 'instructor' && (academy.category || '').includes('교습소')) || (tab.id === 'assistant' && !(academy.category || '').includes('교습소')))).map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div
                ref={contentRef}
                className="detail-content"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {renderContent()}
            </div>

            {/* 모바일 플로팅 뒤로가기 버튼 */}
            <button
                onClick={onBack}
                className="floating-back-btn"
                aria-label="뒤로가기"
            >
                ← BACK
            </button>
        </div>
    );
}
