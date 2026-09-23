import React from 'react';
import { useRegion } from '../RegionContext';

export default function StandardPriceTable({ onBack }) {
  const { region, officeName, rows, effectiveDate, tutoringHourlyRate } = useRegion();
  const rated = rows.filter(r => r.rate > 0);
  const average = rated.length ? (rated.reduce((sum, r) => sum + r.rate, 0) / rated.length).toFixed(2) : '';

  return (
    <div className="animate-enter">
      <button type="button" className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: '14px' }}>
        ← 교습비 계산·게시표로
      </button>
      <div className="page-head">
        <h1 className="page-title">
          {region ? `${officeName} 교습비 기준단가` : '교습비 기준단가'}
        </h1>
        <p className="page-desc">학원·교습소 교습과정별 분당 기준단가입니다.</p>
      </div>

      {!region ? (
        <div className="alert is-warn" style={{ marginBottom: '32px' }}>
          앞 화면 위쪽에서 지역(교육지원청)을 먼저 고르세요.
        </div>
      ) : !rows.length ? (
        <div className="alert is-warn" style={{ marginBottom: '32px' }}>
          {officeName}은(는) 아직 기준단가가 입력되지 않았습니다. 관할 교육지원청에 문의하세요.
        </div>
      ) : (
      <>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: '500' }}>
        <span>개인과외 시간당 기준: {tutoringHourlyRate > 0 ? `${tutoringHourlyRate.toLocaleString()}원` : '미입력'}</span>
        <span>(단위: 원)</span>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: '40px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'var(--bg-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>시도</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>교육지원청</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>분야</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>교습과정</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#334155' }}>교습과목(반)</th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#1d4ed8', fontWeight: 'bold' }}>분당단가</th>
              <th style={{ padding: '12px 10px', color: '#334155' }}>교습비등 조정위원회<br/>최종 개최일</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                {['경기', region, row.field, row.process, row.subject, row.rate > 0 ? String(row.rate) : '미입력', effectiveDate].map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: '10px 12px', borderRight: cIdx < 6 ? '1px solid #e2e8f0' : 'none', color: cIdx === 5 ? '#1d4ed8' : '#475569', fontWeight: cIdx === 5 ? '700' : '400' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ backgroundColor: '#eff6ff', fontWeight: 'bold' }}>
              <td colSpan="5" style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', textAlign: 'center', color: '#1e3a8a' }}>평균</td>
              <td style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', color: '#1d4ed8' }}>{average}</td>
              <td style={{ padding: '12px 10px' }}></td>
            </tr>
          </tbody>
        </table>
      </div>
      </>
      )}

      <h2 className="card-title" style={{ marginBottom: '12px' }}>교습과정 설명</h2>
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'var(--bg-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem', textAlign: 'left', minWidth: '600px' }}>
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
