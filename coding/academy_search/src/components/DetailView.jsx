import React, { useState } from 'react';
import './DetailView.css';

const TABS = [
    { id: 'status', label: '현황' },
    { id: 'founder', label: '설립자' },
    { id: 'facilities', label: '시설' },
    { id: 'tuition', label: '교습비' },
    { id: 'insurance', label: '보험' },
    { id: 'inspection', label: '지도점검' },
];

function InfoRow({ label, value, isClickable, onClick }) {
    return (
        <div className="info-row">
            <span className="info-label">{label}</span>
            <span
                className={`info-value ${isClickable ? 'clickable' : ''}`}
                onClick={isClickable ? onClick : undefined}
                style={isClickable ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-color)' } : {}}
                title={isClickable ? '구글 맵에서 보기' : undefined}
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

export default function DetailView({ academy, onBack }) {
    const [activeTab, setActiveTab] = useState('status');

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
                    </div>
                );
            case 'founder':
                return (
                    <div className="tab-content animate-enter">
                        <Section title="설립자 정보">
                            <InfoRow label="성명" value={academy.founder.name} />
                            <InfoRow label="생년월일" value={academy.founder.birth} />
                            <InfoRow label="주소" value={academy.founder.address} />
                            <InfoRow label="전화번호" value={academy.founder.phone} />
                            <InfoRow label="핸드폰" value={academy.founder.mobile} />
                        </Section>
                    </div>
                );
            case 'facilities':
                return (
                    <div className="tab-content animate-enter">
                        <Section title="시설 현황">
                            <InfoRow label="건물연면적" value={`${academy.facilities.buildingArea}㎡`} />
                            <InfoRow label="총면적" value={`${academy.facilities.totalArea}㎡`} />
                            <InfoRow label="전용면적" value={`${academy.facilities.dedicatedArea}㎡`} />
                            <InfoRow label="총 층수" value={academy.facilities.floors} />
                            <InfoRow label="준공일" value={academy.facilities.builtDate} />
                            <InfoRow label="일시수용능력" value={`${academy.facilities.capacityTemporary}명`} />
                            <InfoRow label="정원합계" value={`${academy.facilities.capacityTotal}명`} />
                        </Section>
                    </div>
                );
            case 'tuition':
                return (
                    <div className="tab-content animate-enter">
                        {academy.courses.map((course, idx) => (
                            <div key={idx} className="card-item">
                                <div className="card-header">
                                    <span className="badge">{course.process}</span>
                                    <h4>{course.subject}</h4>
                                </div>
                                <InfoRow label="교습계열" value={course.track} />
                                <InfoRow label="정원" value={`${course.quota}명`} />
                                <InfoRow label="교습기간" value={course.period} />
                                <InfoRow label="총교습비" value={`${course.totalFee}원`} />
                                <InfoRow label="시간당" value={`${course.feePerHour}원`} />
                            </div>
                        ))}
                    </div>
                );
            case 'insurance':
                return (
                    <div className="tab-content animate-enter">
                        {academy.insurances.map((ins, idx) => (
                            <div key={idx} className="card-item">
                                <h4>{ins.company}</h4>
                                <InfoRow label="계약업체" value={ins.contractor} />
                                <InfoRow label="계약번호" value={ins.policyNumber} />
                                <InfoRow label="강사수" value={`${ins.teachersCount}명`} />
                                <InfoRow label="사고당배상" value={`${ins.compensationPerAccident}원`} />
                                <InfoRow label="인당의료실비" value={`${ins.medicalPerPerson}원`} />
                                <InfoRow label="인당배상" value={`${ins.compensationPerPerson}원`} />
                                <div className="date-range">
                                    {ins.startDate} ~ {ins.endDate}
                                </div>
                            </div>
                        ))}
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

            <div className="tabs-container">
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

            <div className="detail-content">
                {renderContent()}
            </div>
        </div>
    );
}
