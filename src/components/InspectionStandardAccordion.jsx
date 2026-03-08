import { useState } from 'react';
import FineGuideAccordion from './FineGuideAccordion';
import AdminSanctionAccordion from './AdminSanctionAccordion';

const inspectionData = [
    { category: '학원', code: '1-1', title: '(시설) 시설·설비 변경 미등록 (시설임의 변경)', action: '시정명령', fine: '없음' },
    { category: '학원', code: '1-1', title: '(시설) 위치 무단 변경, 시설기준 미달', action: '정지', fine: '없음' },
    { category: '학원', code: '1-1', title: '(운영) 무등록·기준미달 숙박시설 운영', action: '정지', fine: '없음' },
    { category: '학원', code: '2-1', title: '(교습비등) 교습비등 초과징수', action: '시정명령', fine: '100' },
    { category: '학원', code: '2-2', title: '(교습비등) 교습비등 변경 미등록', action: '시정명령', fine: '없음' },
    { category: '학원', code: '2-2', title: '(교습비등) 교습비등 미반환 (일부 미반환)', action: '시정명령', fine: '50' },
    { category: '학원', code: '2-2', title: '(교습비등) 교습비등 미반환 (전부 미반환)', action: '시정명령', fine: '100' },
    { category: '학원', code: '2-2', title: '(운영) 조정명령 미이행', action: '정지', fine: '100' },
    { category: '학원', code: '2-2', title: '(교습비등) 영수증 미교부', action: '시정명령', fine: '100' },
    { category: '학원', code: '2-3', title: '(교습비등) 교습비등 미게시(학원 내·외부), 반환기준 미게시', action: '시정명령', fine: '50' },
    { category: '학원', code: '2-3', title: '(교습비등) 교습비등 허위 표시 및 게시(학원 내·외부)', action: '정지', fine: '100' },
    { category: '학원', code: '3-1', title: '(강사 등) 강사 채용·해임 미통보', action: '시정명령', fine: '없음' },
    { category: '학원', code: '3-1', title: '(강사 등) 무자격 강사 채용', action: '정지', fine: '없음' },
    { category: '학원', code: '3-2', title: '(강사 등) 성범죄 경력 미조회', action: '시정명령', fine: '300' },
    { category: '학원', code: '3-3', title: '(강사 등) 아동학대 범죄전력 미조회', action: '시정명령', fine: '250' },
    { category: '학원', code: '3-4', title: '(강사 등) 강사 인적사항 미게시, 허위게시', action: '시정명령', fine: '50' },
    { category: '학원', code: '4-1', title: '(운영) 미등록(신고) 학원(교습소)의 거짓 등록, 부정등록', action: '말소', fine: '없음' },
    { category: '학원', code: '4-2', title: '(교습과정) (학원만) 등록 외 교습과정 운영', action: '시정명령', fine: '없음' },
    { category: '학원', code: '4-3', title: '(교습비등) 광고 시 교습비등, 등록(신고)증명서 내용(번호, 명칭, 교습과목 등) 표시 미표시', action: '시정명령', fine: '50' },
    { category: '학원', code: '4-3', title: '(교습비등) 광고시 교습비등, 등록(신고)증명서 내용(번호, 명칭, 교습과목 등) 표시 거짓표시', action: '정지', fine: '100' },
    { category: '학원', code: '4-4', title: '(운영) 제장부 미비치, 부실기재', action: '시정명령', fine: '50' },
    { category: '학원', code: '4-5', title: '(운영) 등록(신고)증명서 미게시', action: '시정명령', fine: '50' },
    { category: '학원', code: '4-6', title: '(운영) 명칭사용 위반', action: '시정명령', fine: '없음' },
    { category: '학원', code: '4-7', title: '(운영) 선행학습 유발 광고', action: '시정명령', fine: '없음' },
    { category: '학원', code: '4-8', title: '(운영) 교습시간 위반', action: '시정명령', fine: '없음' },
    { category: '학원', code: '4-9', title: '(운영) 거짓·과대광고', action: '시정명령', fine: '없음' },
    { category: '학원', code: '4-10', title: '(운영) 정기연수 불참 (현재는 없음)', action: '시정명령', fine: '없음' },
    { category: '학원', code: '4-11', title: '(운영) 학원 휴·폐원 미신고(1개월 이상 ~2개월 미만 미신고시)', action: '시정명령', fine: '50' },
    { category: '학원', code: '4-11', title: '(운영) 학원 휴·폐원 미신고(2개월 이상 미신고시 차등부과, 최대 300만원)', action: '말소', fine: '300' },
    { category: '학원', code: '4-12', title: '(운영) 안전보험 미가입(10~91일 미가입시 차등부과, 최대 300만원)', action: '시정명령', fine: '300' },
    { category: '학원', code: '5-1', title: '기타', action: '입력필요', fine: '입력필요' },

    { category: '교습소', code: '1-1', title: '(시설) 시설·설비 변경 미등록 (시설임의 변경)', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '1-1', title: '(시설) 위치 무단 변경, 시설기준 미달', action: '정지', fine: '없음' },
    { category: '교습소', code: '1-1', title: '(운영) 무등록·기준미달 숙박시설 운영', action: '정지', fine: '없음' },
    { category: '교습소', code: '2-1', title: '(교습비등) 교습비등 초과징수', action: '시정명령', fine: '100' },
    { category: '교습소', code: '2-2', title: '(교습비등) 교습비등 변경 미등록', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '2-2', title: '(교습비등) 교습비등 미반환 (일부 미반환)', action: '시정명령', fine: '50' },
    { category: '교습소', code: '2-2', title: '(교습비등) 교습비등 미반환 (전부 미반환)', action: '시정명령', fine: '100' },
    { category: '교습소', code: '2-2', title: '(운영) 조정명령 미이행', action: '정지', fine: '100' },
    { category: '교습소', code: '2-2', title: '(교습비등) 영수증 미교부', action: '시정명령', fine: '100' },
    { category: '교습소', code: '2-3', title: '(교습비등) 교습비등 미게시(교습소 내·외부), 반환기준 미게시', action: '시정명령', fine: '50' },
    { category: '교습소', code: '2-3', title: '(교습비등) 교습비등 허위 표시 및 게시(교습소 내·외부)', action: '정지', fine: '100' },
    { category: '교습소', code: '3-1', title: '(강사 등) 강사 채용·해임 미통보', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '3-1', title: '(강사 등) 무자격 강사 채용', action: '정지', fine: '없음' },
    { category: '교습소', code: '3-2', title: '(강사 등) 성범죄 경력 미조회', action: '시정명령', fine: '300' },
    { category: '교습소', code: '3-3', title: '(강사 등) 아동학대 범죄전력 미조회', action: '시정명령', fine: '250' },
    { category: '교습소', code: '3-4', title: '(강사 등) 강사 인적사항 미게시, 허위게시', action: '시정명령', fine: '50' },
    { category: '교습소', code: '3-5', title: '(강사 등) (교습소만) 강사를 채용하거나, 보조요원이 교습행위', action: '정지', fine: '없음' },
    { category: '교습소', code: '3-5', title: '(강사 등) (교습소만) 임시 교습자 또는 보조원의 채용 및 해임 시 미신고', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '4-1', title: '(운영) 미신고 교습소의 거짓 신고, 부정신고', action: '폐지', fine: '없음' },
    { category: '교습소', code: '4-2', title: '(교습과정) (교습소만) 신고 외 교습과정 운영', action: '정지', fine: '없음' },
    { category: '교습소', code: '4-3', title: '(교습비등) 광고 시 교습비등, 등록(신고)증명서 내용(번호, 명칭, 교습과목 등) 표시 미표시', action: '시정명령', fine: '50' },
    { category: '교습소', code: '4-3', title: '(교습비등) 광고시 교습비등, 등록(신고)증명서 내용(번호, 명칭, 교습과목 등) 표시 거짓표시', action: '정지', fine: '100' },
    { category: '교습소', code: '4-4', title: '(운영) 제장부 미비치, 부실기재', action: '시정명령', fine: '50' },
    { category: '교습소', code: '4-5', title: '(운영) 등록(신고)증명서 미게시', action: '시정명령', fine: '50' },
    { category: '교습소', code: '4-6', title: '(운영) 명칭사용 위반', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '4-7', title: '(운영) 선행학습 유발 광고', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '4-8', title: '(운영) 교습시간 위반', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '4-9', title: '(운영) 거짓·과대광고', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '4-10', title: '(운영) 정기연수 불참 (현재는 없음)', action: '시정명령', fine: '없음' },
    { category: '교습소', code: '4-11', title: '(운영) 교습소 휴·폐소 미신고(1개월 이상 ~2개월 미만 미신고시)', action: '시정명령', fine: '50' },
    { category: '교습소', code: '4-11', title: '(운영) 교습소 휴·폐소 미신고(2개월 이상 미신고시 차등부과, 최대 300만원)', action: '폐지', fine: '300' },
    { category: '교습소', code: '4-12', title: '(운영) 안전보험 미가입(10~91일 미가입시 차등부과, 최대 300만원)', action: '시정명령', fine: '300' },
    { category: '교습소', code: '5-1', title: '기타', action: '입력필요', fine: '입력필요' },

    { category: '개인과외', code: '1-1', title: '(교습비등) 교습비등 초과징수', action: '시정명령', fine: '100' },
    { category: '개인과외', code: '1-2', title: '(교습비등) 교습비등 변경 미신고', action: '시정명령', fine: '없음' },
    { category: '개인과외', code: '1-2', title: '(교습비등) 교습비등 미반환 (일부 미반환)', action: '시정명령', fine: '50' },
    { category: '개인과외', code: '1-2', title: '(교습비등) 교습비등 미반환 (전부 미반환)', action: '시정명령', fine: '100' },
    { category: '개인과외', code: '1-2', title: '(운영) 조정명령 미이행', action: '정지', fine: '100' },
    { category: '개인과외', code: '1-2', title: '(교습비등) 영수증 미교부', action: '시정명령', fine: '100' },
    { category: '개인과외', code: '1-3', title: '(교습비등) 교습비등 미게시(교습장소 내·외부), 반환기준 미게시', action: '시정명령', fine: '50' },
    { category: '개인과외', code: '1-3', title: '(교습비등) 교습비등 허위 표시 및 게시(교습장소 내·외부)', action: '정지', fine: '100' },
    { category: '개인과외', code: '2-1', title: '(강사 등) 강사 채용', action: '중지', fine: '없음' },
    { category: '개인과외', code: '3-1', title: '(운영) 미신고 개인과외의 거짓 신고, 부정신고', action: '중지', fine: '없음' },
    { category: '개인과외', code: '3-2', title: '(운영) 위치 무단변경 ( 교습장소 변경 미신고)', action: '시정명령', fine: '없음' },
    { category: '개인과외', code: '3-3', title: '(운영) 신고 외 교습과목 운영 (교습과목 임의 변경)', action: '시정명령', fine: '없음' },
    { category: '개인과외', code: '3-4', title: '(운영) 선행학습 유발 광고', action: '시정명령', fine: '없음' },
    { category: '개인과외', code: '3-5', title: '(운영) 교습시간 위반', action: '시정명령', fine: '없음' },
    { category: '개인과외', code: '3-6', title: '(운영) 개인과외 신고증명서 미게시', action: '시정명령', fine: '50' },
    { category: '개인과외', code: '3-7', title: '(교습비등) 광고 시 교습비등, 신고증명서 내용(번호, 교습과목 등) 표시 미표시', action: '시정명령', fine: '50' },
    { category: '개인과외', code: '3-7', title: '(교습비등) 광고 시 교습비등, 신고증명서 내용(번호, 교습과목 등) 표시 거짓표시', action: '정지', fine: '100' },
    { category: '개인과외', code: '3-8', title: '(운영) 개인과외교습 장소 표지 미부착', action: '시정명령', fine: '50' },
    { category: '개인과외', code: '3-9', title: '(운영) 제장부(서류) 미비치, 부실기재', action: '시정명령', fine: '50' },
    { category: '개인과외', code: '4-1', title: '기타', action: '입력필요', fine: '입력필요' }
];

export default function InspectionStandardAccordion() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('학원');

    const filteredData = inspectionData.filter(d => d.category === activeTab);

    const getTypeIcon = (type) => {
        switch (type) {
            case '학원': return '🏫';
            case '교습소': return '📖';
            case '개인과외': return '👤';
            default: return '📋';
        }
    };

    return (
        <div
            style={{
                background: 'var(--bg-card)',
                borderRadius: '16px',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-sm)',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
        >
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '18px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isOpen ? 'var(--bg-main)' : 'var(--bg-card)'
                }}
                onMouseOver={(e) => {
                    if (!isOpen) e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                }}
                onMouseOut={(e) => {
                    if (!isOpen) e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        background: 'var(--bg-main)',
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        border: '1px solid var(--border-color)'
                    }}>
                        📋
                    </div>
                    <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-main)' }}>
                            행정처분, 과태료 (1차 적발시)
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            공문상 1차 행정처분 및 과태료 부과 기준
                        </div>
                    </div>
                </div>
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>

            {isOpen && (
                <div className="animate-enter" style={{ borderTop: '1px solid var(--border-color)' }}>
                    {/* 구분 탭 */}
                    <div style={{ display: 'flex', padding: '16px 20px 0 20px', gap: '8px' }}>
                        {['학원', '교습소', '개인과외'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '10px 10px 0 0',
                                    border: '1px solid var(--border-color)',
                                    borderBottom: activeTab === tab ? 'none' : '1px solid var(--border-color)',
                                    background: activeTab === tab ? '#ffffff' : 'var(--bg-card)',
                                    color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                                    fontWeight: activeTab === tab ? '800' : '600',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    transform: activeTab === tab ? 'translateY(1px)' : 'none',
                                    zIndex: activeTab === tab ? 2 : 1,
                                    boxShadow: activeTab === tab ? '0 -2px 10px rgba(0,0,0,0.02)' : 'none'
                                }}
                            >
                                <span>{getTypeIcon(tab)}</span>
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div style={{ padding: '0 20px 20px 20px', background: '#ffffff' }}>
                        <div style={{
                            overflowX: 'auto',
                            border: '1px solid var(--border-color)',
                            borderTop: 'none',
                            borderRadius: '0 0 12px 12px',
                            borderTopRightRadius: activeTab !== '개인과외' ? '12px' : '0',
                            borderTopLeftRadius: activeTab !== '학원' ? '12px' : '0',
                            marginBottom: '20px'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '700', width: '60%' }}>행정처분기준</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '700', width: '20%', whiteSpace: 'nowrap' }}>1차 행정처분</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '700', width: '20%', whiteSpace: 'nowrap' }}>1차 과태료</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.map((row, i) => (
                                        <tr
                                            key={i}
                                            style={{
                                                borderBottom: '1px solid var(--border-color)',
                                                background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)',
                                            }}
                                        >
                                            <td style={{ padding: '8px 12px', color: 'var(--text-main)', lineHeight: '1.4', fontSize: '0.83rem' }}>
                                                {row.title}
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '3px 6px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    whiteSpace: 'nowrap',
                                                    color: ['정지', '말소', '폐지', '중지'].includes(row.action) ? '#ef4444' : '#2563eb',
                                                    background: ['정지', '말소', '폐지', '중지'].includes(row.action) ? '#fef2f2' : '#eff6ff'
                                                }}>
                                                    {row.action}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: '600', fontSize: '0.8rem', color: row.fine !== '없음' && row.fine !== '입력필요' ? '#f59e0b' : 'var(--text-muted)' }}>
                                                {row.fine !== '없음' && row.fine !== '입력필요' ? `${row.fine}만원` : row.fine}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 세부 기준 아코디언들 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <FineGuideAccordion />
                            <AdminSanctionAccordion />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
