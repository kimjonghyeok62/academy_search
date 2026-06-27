import React, { useState, useRef } from 'react';
import { printTuitionForm, printTuitionFormExternal } from '../utils/generateTuitionPDF';
import { parseExcelTuition } from '../utils/parseExcelTuition';
import TuitionReviewTab from './TuitionReviewTab';
import StandardPriceTable from './StandardPriceTable';

export default function TuitionPrintPage({ onBack }) {
  const [tab, setTab] = useState('review'); // 'review' | 'tutoring' | 'excel'
  const [showStandardPrices, setShowStandardPrices] = useState(false);

  // 엑셀 업로드 탭 상태
  const [excelAcademies, setExcelAcademies] = useState([]);
  const [excelSelected, setExcelSelected] = useState(null);
  const [excelError, setExcelError] = useState('');
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelDragOver, setExcelDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // StandardPriceTable 오버레이
  if (showStandardPrices) {
    return <StandardPriceTable onBack={() => setShowStandardPrices(false)} />;
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelError('');
    setExcelLoading(true);
    setExcelAcademies([]);
    setExcelSelected(null);
    try {
      const result = await parseExcelTuition(file);
      if (!result.length) {
        setExcelError('파싱된 학원 데이터가 없습니다. 파일 형식을 확인하세요.');
      } else {
        setExcelAcademies(result);
        if (result.length === 1) setExcelSelected(result[0]);
      }
    } catch (err) {
      setExcelError('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setExcelLoading(false);
      e.target.value = '';
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setExcelDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile({ target: { files: [file], value: '' } });
  }

  const tabStyle = (active) => ({
    flex: 1,
    padding: '11px 8px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: active ? '#fff' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    boxShadow: active ? '0 4px 10px rgba(79, 70, 229, 0.12), 0 2px 4px rgba(0, 0, 0, 0.02)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    lineHeight: '1.25',
    transform: active ? 'scale(1.02)' : 'scale(1)',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  });

  return (
    <div className="container animate-enter" style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}
          title="돌아가기"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-primary)' }}>
          교습비 검토
        </h2>
      </div>

      {/* 서브타이틀 + 기준단가 보기 */}
      <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', marginBottom: '22px' }}>
        <div className="app-subtitle">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          경기도광주하남교육지원청 교습비 기준
        </div>
        <button
          onClick={() => setShowStandardPrices(true)}
          style={{
            padding: '3px 10px',
            backgroundColor: '#0f172a',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            border: '1px solid #1e293b',
            borderRadius: '20px',
            color: '#f8fafc',
            fontSize: '0.76rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'inherit',
          }}
        >
          기준단가 보기
        </button>
      </div>

      {/* 필 탭 바 */}
      <div style={{
        display: 'flex',
        backgroundColor: '#f8fafc',
        padding: '5px',
        borderRadius: '12px',
        marginBottom: '26px',
        gap: '6px',
        alignItems: 'stretch',
        border: '1px solid #e2e8f0',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
      }}>
        <button className="tab-btn" style={tabStyle(tab === 'review')} onClick={() => setTab('review')}>
          <svg className="tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span className="tab-maintext">학원·교습소</span>
          <span className="tab-subtext">교습비 변경</span>
        </button>
        <button className="tab-btn" style={tabStyle(tab === 'tutoring')} onClick={() => setTab('tutoring')}>
          <svg className="tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span className="tab-maintext">개인과외</span>
          <span className="tab-subtext">교습비 변경</span>
        </button>
        <button className="tab-btn" style={tabStyle(tab === 'excel')} onClick={() => setTab('excel')}>
          <svg className="tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          <span className="tab-maintext">게시표 출력</span>
          <span className="tab-subtext">(나이스자료 이용)</span>
        </button>
      </div>

      {/* ── 탭 1: 학원·교습소 교습비 변경 ── */}
      {tab === 'review' && <TuitionReviewTab mode="academy" />}

      {/* ── 탭 2: 개인과외 교습비 변경 ── */}
      {tab === 'tutoring' && <TuitionReviewTab mode="tutoring" />}

      {/* ── 탭 3: 게시표 출력 ── */}
      {tab === 'excel' && (
        <>
          {/* 업로드 영역 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setExcelDragOver(true); }}
            onDragEnter={e => { e.preventDefault(); setExcelDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); setExcelDragOver(false); }}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${excelDragOver ? 'var(--primary)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
              backgroundColor: excelDragOver ? '#eef2ff' : 'var(--bg-card)',
              marginBottom: '20px',
              transition: 'border-color 0.2s, background-color 0.2s',
            }}
            onMouseEnter={e => { if (!excelDragOver) e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={e => { if (!excelDragOver) e.currentTarget.style.borderColor = 'var(--border-color)'; }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)', marginBottom: '10px' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
              {excelLoading ? '파일 분석 중...' : excelDragOver ? '여기에 놓으세요!' : '엑셀 파일 선택 또는 여기에 끌어다 놓기'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              나이스에서 내려받은 학원 교습비 목록 파일 (.xlsx)
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          </div>

          {excelError && (
            <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '16px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              {excelError}
            </div>
          )}

          {/* 여러 학원 선택 목록 */}
          {excelAcademies.length > 1 && !excelSelected && (
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '10px' }}>
                파일에서 {excelAcademies.length}개 학원을 찾았습니다. 출력할 학원을 선택하세요.
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {excelAcademies.map((a, i) => (
                  <li key={i}
                    onClick={() => setExcelSelected(a)}
                    style={{ padding: '12px 16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{a.name}</div>
                    {a.address && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.address}</div>}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>교습과정 {a.courses.length}개</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 선택된 학원 출력 */}
          {excelSelected && (
            <div className="animate-enter">
              {excelAcademies.length > 1 && (
                <button
                  onClick={() => setExcelSelected(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.83rem', marginBottom: '12px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                  목록으로 돌아가기
                </button>
              )}
              <PrintButtons academy={excelSelected} />
            </div>
          )}

          {!excelAcademies.length && !excelLoading && !excelError && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '8px', lineHeight: '1.6' }}>
              나이스에서 내려받은<br />학원 교습비 목록 엑셀 파일을 업로드하세요.<br />
              <span style={{ fontSize: '0.78rem' }}>(성명·비고 등 누락된 항목은 빈칸으로 출력됩니다)</span>
            </div>
          )}
        </>
      )}

      {/* 푸터 (게시표 탭 제외) */}
      {tab !== 'excel' && (
        <footer className="app-footer">
          <p>경기도광주하남교육지원청 · 교습비 검토 도우미</p>
          <p style={{ marginTop: '4px', fontSize: '0.78rem' }}>교습비 기준 적용 여부는 담당자 최종 판단을 따릅니다.</p>
        </footer>
      )}
    </div>
  );
}

function PrintButtons({ academy }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>{academy.name}</div>
        {academy.address && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{academy.address}</div>}
        {academy.courses?.length > 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>교습과정 {academy.courses.length}개</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={() => printTuitionForm(academy)}
          style={{
            flex: 1, minWidth: '140px', padding: '12px 16px',
            backgroundColor: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            fontFamily: 'inherit',
          }}
        >
          <PrintIcon /> 교습비등 게시표 (내부용)
        </button>
        <button
          onClick={() => printTuitionFormExternal(academy)}
          style={{
            flex: 1, minWidth: '140px', padding: '12px 16px',
            backgroundColor: 'var(--bg-card)', color: 'var(--primary)',
            border: '2px solid var(--primary)', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            fontFamily: 'inherit',
          }}
        >
          <PrintIcon stroke="var(--primary)" /> 교습비등 게시표 (외부용)
        </button>
      </div>
    </div>
  );
}

function PrintIcon({ stroke = '#fff' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
  );
}
