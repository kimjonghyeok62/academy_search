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

    // 탭 변경 시 해당 탭이 화면에 보이도록 스크롤
    useEffect(() => {
        if (tabsRef.current) {
            const activeTabIndex = TABS.findIndex(tab => tab.id === activeTab);
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

    // Clean address for place search (name + base address)
    const cleanAddress = (address) => {
        if (!address) return '';
        const commaIndex = address.indexOf(',');
        let baseAddress = commaIndex !== -1 ? address.substring(0, commaIndex).trim() : address.trim();
        const match = baseAddress.match(/^(.+?[로길]\s+\d+(?:-\d+)?)/);
        if (match) {
            return match[1].trim();
        }
        return baseAddress;
    };

    // Find academies in the same building (including current academy)
    const baseAddress = getBaseAddress(academy.address);
    const sameBuildingAcademies = allAcademies.filter(a =>
        getBaseAddress(a.address) === baseAddress
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'status':
                return (
                    <div className="tab-content animate-enter">
                        <Section
                            title="기본 정보"
                            rightButton={
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const searchQuery = `${academy.name} ${cleanAddress(academy.address)}`;
                                        window.open(`https://map.naver.com/v5/search/${encodeURIComponent(searchQuery)}`, '_blank');
                                    }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '6px 12px',
                                        backgroundColor: '#5FD68A',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 1px 3px rgba(95, 214, 138, 0.3)'
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
                                </button>
                            }
                        >
                            <InfoRow label="등록번호" value={academy.id} />
                            <InfoRow label="학원명" value={academy.name} />
                            <InfoRow label="학원종류" value={academy.category} />
                            <InfoRow label="분야구분" value={academy.field} />
                            <div className="info-row">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="info-label">주소</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(`https://map.naver.com/v5/search/${encodeURIComponent(academy.address)}`, '_blank');
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
                                        title="네이버 지도에서 보기"
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                            <circle cx="12" cy="10" r="3"></circle>
                                        </svg>
                                        <span>지도</span>
                                    </button>
                                </div>
                                <span
                                    className="info-value clickable"
                                    onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(academy.address)}`, '_blank')}
                                    style={{
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                        textDecorationColor: 'var(--border-color)'
                                    }}
                                    title="네이버 지도에서 보기"
                                >
                                    {academy.address || '-'}
                                </span>
                            </div>
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
                        {sameBuildingAcademies.length > 0 && (() => {
                            // Get building info from first academy
                            const firstAcademy = sameBuildingAcademies[0];
                            const buildingName = getBuildingName(firstAcademy.address) || getBuildingName(academy.address);
                            const floors = firstAcademy.facilities?.floors || academy.facilities?.floors || '-';
                            const totalFloors = floors.includes('~') ? floors.split('~')[1].trim().replace(/[^0-9]/g, '') : '-';
                            const buildingArea = formatNumber(firstAcademy.facilities?.buildingArea || academy.facilities?.buildingArea);

                            return (
                                <Section title={`동일 건축물 학원목록 (${sameBuildingAcademies.length}개)`}>
                                    {buildingName && (
                                        <div style={{
                                            fontSize: '0.9rem',
                                            color: 'var(--text-muted)',
                                            marginBottom: '16px',
                                            padding: '8px 12px',
                                            backgroundColor: 'var(--bg-light)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            <span style={{ fontSize: '1rem' }}>📍</span>
                                            <span>{buildingName} {totalFloors}층 건물 (연면적 {buildingArea}㎡)</span>
                                        </div>
                                    )}
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
                                                        <span>{formatNumber(a.facilities?.totalArea)}㎡</span>
                                                    </span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span>📅</span>
                                                        <span>{a.regDate}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </Section>
                            );
                        })()}
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
