import React, { useState, useRef, useEffect } from 'react';
import './DetailView.css';

const TABS = [
    { id: 'status', label: '현황' },
    { id: 'founder', label: '설립자' },
    { id: 'facilities', label: '시설' },
    { id: 'tuition', label: '교습비' },
    { id: 'insurance', label: '보험' },
    { id: 'inspection', label: '지도점검' },
];

// Format number with commas
const formatNumber = (num) => {
    if (!num) return num;
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

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

function Section({ title, children }) {
    return (
        <div className="info-section">
            <h3>{title}</h3>
            {children}
        </div>
    );
}

export default function DetailView({ academy, allAcademies = [], onBack, onSelectAcademy }) {
    const [activeTab, setActiveTab] = useState('status');
    const [showSensitiveInfo, setShowSensitiveInfo] = useState(false);
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
            const currentIndex = TABS.findIndex(tab => tab.id === activeTab);
            if (isLeftSwipe && currentIndex < TABS.length - 1) {
                setActiveTab(TABS[currentIndex + 1].id);
            } else if (isRightSwipe && currentIndex > 0) {
                setActiveTab(TABS[currentIndex - 1].id);
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

    // Find academies in the same building
    const baseAddress = getBaseAddress(academy.address);
    const sameBuildingAcademies = allAcademies.filter(a =>
        a.id !== academy.id && getBaseAddress(a.address) === baseAddress
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'status':
                return (
                    <div className="tab-content animate-enter">
                        <Section title="기본 정보">
                            <InfoRow label="등록번호" value={academy.id} />
                            <InfoRow label="학원명" value={academy.name} />
                            <InfoRow label="학원종류" value={academy.category} />
                            <InfoRow label="분야구분" value={academy.field} />
                            <InfoRow
                                label="주소"
                                value={academy.address}
                                isClickable={true}
                                onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(academy.address)}`, '_blank')}
                            />
                            <InfoRow label="우편번호" value={academy.zip} />
                        </Section>
                        <Section title="상태 정보">
                            <InfoRow label="등록일" value={academy.regDate} />
                            <InfoRow label="등록상태" value={academy.status} />
                            <InfoRow label="상태변경일" value={academy.statusDate} />
                            <InfoRow label="다중이용업소" value={academy.isMultiUse} />
                            <InfoRow label="기숙학원" value={academy.isBoarding} />
                            <InfoRow label="수강료공개" value={academy.disclosure} />
                            <InfoRow label="건물소유" value={academy.ownership} />
                        </Section>
                        {sameBuildingAcademies.length > 0 && (
                            <Section title={`동일 건축물 학원목록 (${sameBuildingAcademies.length}개)`}>
                                {sameBuildingAcademies.map((a, idx) => (
                                    <div key={a.id} className="info-row" style={{
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        padding: '12px 0',
                                        borderBottom: idx === sameBuildingAcademies.length - 1 ? 'none' : '1px dotted var(--border-color)',
                                        cursor: 'pointer'
                                    }}
                                        onClick={() => onSelectAcademy && onSelectAcademy(a)}
                                    >
                                        <div style={{
                                            fontWeight: '700',
                                            color: 'var(--primary)',
                                            marginBottom: '4px',
                                            fontSize: '0.95rem',
                                            textDecoration: 'underline',
                                            textDecorationColor: 'var(--border-color)'
                                        }}>
                                            {a.name}
                                        </div>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)',
                                            lineHeight: '1.4',
                                            marginBottom: '4px'
                                        }}>
                                            {getShortAddress(a.address)}
                                        </div>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)',
                                            marginBottom: '4px'
                                        }}>
                                            총 층수: {a.facilities?.floors || '-'},  건축연면적: {formatNumber(a.facilities?.buildingArea)}㎡
                                        </div>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)',
                                            marginBottom: '4px'
                                        }}>
                                            총면적: {formatNumber(a.facilities?.totalArea)}㎡,  전용면적: {formatNumber(a.facilities?.dedicatedArea)}㎡
                                        </div>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)',
                                            marginBottom: '2px'
                                        }}>
                                            {a.category} · {a.field}
                                        </div>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)'
                                        }}>
                                            등록일: {a.regDate}
                                        </div>
                                    </div>
                                ))}
                            </Section>
                        )}
                    </div>
                );
            case 'founder':
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
                    </div>
                );
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
                                            {!isExpanded && (
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    color: 'var(--text-muted)'
                                                }}>
                                                    {course.track} | 정원: {course.quota}명 | 총교습비: {course.totalFee}원
                                                </div>
                                            )}
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
                                            <InfoRow label="총교습비" value={`${course.totalFee}원`} />
                                            <InfoRow label="시간당" value={`${course.feePerHour}원`} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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
            case 'inspection':
                return (
                    <div className="tab-content animate-enter">
                        {academy.inspections.length > 0 ? academy.inspections.map((insp, idx) => (
                            <div key={idx} className="card-item">
                                <div className="card-header-date">
                                    <span>점검일: {insp.date}</span>
                                </div>
                                <InfoRow label="위반내역" value={insp.violation || '없음'} />
                                <InfoRow label="행정처분" value={insp.punishment || '없음'} />
                            </div>
                        )) : <p className="empty-msg">점검 내역이 없습니다.</p>}
                    </div>
                );
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
                {TABS.map(tab => (
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
        </div>
    );
}
