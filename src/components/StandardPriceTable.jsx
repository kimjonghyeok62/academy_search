import React from 'react';

export default function StandardPriceTable({ onBack }) {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', backgroundColor: '#fff', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>
          광주하남교육지원청 학원·교습소 교습비 세부내역
        </h2>
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            backgroundColor: '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          홈페이지로 돌아가기
        </button>
      </div>

      <div style={{ textAlign: 'right', fontSize: '0.9rem', color: '#4b5563', marginBottom: '10px', fontWeight: '500' }}>(단위: 원)</div>

      <div style={{ overflowX: 'auto', marginBottom: '40px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>시도</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>교육지원청</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>분야</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>계열</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>교습과정</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>교습과목(반)</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#1d4ed8', fontWeight: 'bold' }}>분당단가</th>
              <th style={{ padding: '12px 10px', color: '#334155' }}>교습비등 조정위원회<br/>최종 개최일</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['경기', '광주하남', '입시ㆍ보습', '보통교과', '보습', '단과(초등)', '210', '2024-12-26'],
              ['경기', '광주하남', '입시ㆍ보습', '보통교과', '보습', '단과(중등)', '222', '2024-12-26'],
              ['경기', '광주하남', '입시ㆍ보습', '보통교과', '보습', '단과(고등)', '234', '2024-12-26'],
              ['경기', '광주하남', '입시ㆍ보습', '진학지도', '진학상담, 지도', '진학상담, 지도', '234', '2024-12-26'],
              ['경기', '광주하남', '국제화', '외국어', '어학', '어학', '259', '2024-12-26'],
              ['경기', '광주하남', '예능', '예능', '음악', '유,초,중,고', '224', '2024-12-26'],
              ['경기', '광주하남', '예능', '예능', '음악', '입시', '336', '2024-12-26'],
              ['경기', '광주하남', '예능', '예능', '미술', '유,초,중,고', '212', '2024-12-26'],
              ['경기', '광주하남', '예능', '예능', '미술', '입시', '255', '2024-12-26'],
              ['경기', '광주하남', '예능', '예능', '무용', '유,초,중,고', '212', '2024-12-26'],
              ['경기', '광주하남', '예능', '예능', '무용', '입시', '255', '2024-12-26'],
              ['경기', '광주하남', '정보', '정보', '정보', '일반', '230', '2024-12-26'],
              ['경기', '광주하남', '기타', '기타', '기타', '일반', '230', '2024-12-26'],
            ].map((row, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: '10px 12px', borderRight: cIdx < 7 ? '1px solid #e2e8f0' : 'none', color: cIdx === 6 ? '#1d4ed8' : '#475569', fontWeight: cIdx === 6 ? '700' : '400' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ backgroundColor: '#eff6ff', fontWeight: 'bold' }}>
              <td colSpan="6" style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', textAlign: 'center', color: '#1e3a8a' }}>평균</td>
              <td style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#1d4ed8' }}>239.46</td>
              <td style={{ padding: '12px 10px' }}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#111827', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        설명
      </h3>
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left', minWidth: '600px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '12px', borderRight: '1px solid #e2e8f0', color: '#334155', textAlign: 'center', width: '15%' }}>종류</th>
              <th style={{ padding: '12px', borderRight: '1px solid #e2e8f0', color: '#334155', textAlign: 'center', width: '15%' }}>분야</th>
              <th style={{ padding: '12px', borderRight: '1px solid #e2e8f0', color: '#334155', textAlign: 'center', width: '15%' }}>계열</th>
              <th style={{ padding: '12px', color: '#334155', textAlign: 'center', width: '55%' }}>교습과정</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td rowSpan="8" style={{ padding: '12px', borderRight: '1px solid #e2e8f0', fontWeight: 'bold', textAlign: 'center', color: '#1e293b', backgroundColor: '#f8fafc' }}>학교교과교습학원</td>
              <td rowSpan="2" style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '500' }}>입시·검정 및 보습</td>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>보통교과</td>
              <td style={{ padding: '12px', color: '#475569', lineHeight: '1.5' }}>초등학교·중학교·고등학교의 교육과정에 속하는 교과(정보교과, 예·체능계 및 실업계 고등학교의 전문교과 제외) 및 논술</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>진학지도</td>
              <td style={{ padding: '12px', color: '#475569', lineHeight: '1.5' }}>진학상담·지도</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '500' }}>국제화</td>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>외국어</td>
              <td style={{ padding: '12px', color: '#475569', lineHeight: '1.5' }}>보통교과에 속하지 않는 교과로서 유아 또는 초등학교·중학교·고등학교 학생을 주된 교습대상으로 하는 실용 외국어</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '500' }}>예능</td>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>예능</td>
              <td style={{ padding: '12px', color: '#475569', lineHeight: '1.5' }}>음악, 미술, 무용</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '500' }}>독서실</td>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>독서</td>
              <td style={{ padding: '12px', color: '#475569', lineHeight: '1.5' }}>유아 또는 초등학교·중학교·고등학교 학생을 주된 대상으로 하는 시설</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '500' }}>정보</td>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>정보</td>
              <td style={{ padding: '12px', color: '#475569', lineHeight: '1.5' }}>정보교과에 속하는 교육활동</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '500' }}>특수교육</td>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>특수교육</td>
              <td style={{ padding: '12px', color: '#475569', lineHeight: '1.5' }}>특수학교 교육과정에 속하는 교육활동</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '500' }}>기타</td>
              <td style={{ padding: '12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>기타</td>
              <td style={{ padding: '12px', color: '#475569', lineHeight: '1.5' }}>직업기술, 인문사회, 기예, 공예 등 그 밖의 교습과정</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
