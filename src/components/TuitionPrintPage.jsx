import React, { useState, useRef } from 'react';
import { printTuitionForm, printTuitionFormExternal } from '../utils/generateTuitionPDF';
import { parseExcelTuition } from '../utils/parseExcelTuition';
import TuitionReviewTab from './TuitionReviewTab';

export default function TuitionPrintPage({ academies, onBack }) {
  const [tab, setTab] = useState('search'); // 'search' | 'excel' | 'review'

  // 학원 검색 탭
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);

  // 엑셀 업로드 탭
  const [excelAcademies, setExcelAcademies] = useState([]);
  const [excelSelected, setExcelSelected] = useState(null);
  const [excelError, setExcelError] = useState('');
  const [excelLoading, setExcelLoading] = useState(false);
  const fileInputRef = useRef(null);

  // --- 학원 검색 ---
  const suggestions = query.trim()
    ? academies.filter(a =>
        a.name?.includes(query) ||
        a.founder?.name?.includes(query) ||
        a.address?.includes(query)
      ).slice(0, 20)
    : [];

  function handleSelect(academy) {
    setSelected(academy);
    setQuery(academy.name || '');
    setShowSuggestions(false);
  }

  // --- 엑셀 업로드 ---
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

  const tabStyle = (active) => ({
    flex: 1,
    padding: '9px 0',
    border: 'none',
    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontWeight: active ? '700' : '500',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    transition: 'all 0.15s'
  });

  return (
    <div className="container animate-enter" style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
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
          교습비등 게시표 출력
        </h2>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <button style={tabStyle(tab === 'search')} onClick={() => setTab('search')}>학원 검색</button>
        <button style={tabStyle(tab === 'excel')} onClick={() => setTab('excel')}>업로드</button>
        <button style={tabStyle(tab === 'review')} onClick={() => setTab('review')}>교습비 검토</button>
      </div>

      {/* ── 탭 1: 학원 검색 ── */}
      {tab === 'search' && (
        <>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px' }}>학원 선택</label>
            <div style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: '10px', padding: '10px 14px', gap: '8px'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelected(null); setShowSuggestions(true); }}
                  onFocus={() => query && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="학원명, 운영자, 주소 입력..."
                  style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '0.95rem', color: 'var(--text-primary)' }}
                />
                {query && (
                  <button type="button" onClick={() => { setQuery(''); setSelected(null); setShowSuggestions(false); searchInputRef.current?.focus(); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', padding: '0', lineHeight: 1 }}>×</button>
                )}
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <ul style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '10px', boxShadow: 'var(--shadow-md)',
                  margin: 0, padding: '4px 0', listStyle: 'none', zIndex: 100,
                  maxHeight: '260px', overflowY: 'auto'
                }}>
                  {suggestions.map(a => (
                    <li key={a.id || a.name} onMouseDown={() => handleSelect(a)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{a.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {a.founder?.name && <span style={{ marginRight: '8px' }}>{a.founder.name}</span>}
                        {a.address && <span>{a.address}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {selected && <PrintButtons academy={selected} />}

          {!selected && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '40px', lineHeight: '1.6' }}>
              학원을 검색하여 선택하면<br />교습비등 게시표를 출력할 수 있습니다.
            </div>
          )}
        </>
      )}

      {/* ── 탭 2: 엑셀 업로드 ── */}
      {tab === 'excel' && (
        <>
          {/* 업로드 영역 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)', borderRadius: '12px',
              padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
              backgroundColor: 'var(--bg-card)', marginBottom: '20px',
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)', marginBottom: '10px' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
              {excelLoading ? '파일 분석 중...' : '엑셀 파일 선택'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              교육청 표준 학원교습비 목록 파일 (.xlsx)
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          </div>

          {excelError && (
            <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '16px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              {excelError}
            </div>
          )}

          {/* 여러 학원이 있을 때 선택 목록 */}
          {excelAcademies.length > 1 && !excelSelected && (
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '10px' }}>
                파일에서 {excelAcademies.length}개 학원을 찾았습니다. 출력할 학원을 선택하세요.
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {excelAcademies.map((a, i) => (
                  <li key={i}
                    onClick={() => setExcelSelected(a)}
                    style={{
                      padding: '12px 16px', backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-color)', borderRadius: '10px',
                      cursor: 'pointer', transition: 'border-color 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{a.name}</div>
                    {a.address && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.address}</div>}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      교습과정 {a.courses.length}개
                    </div>
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.83rem', marginBottom: '12px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
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
              교육청에서 제공하는<br />학원 교습비 목록 엑셀 파일을 업로드하세요.<br />
              <span style={{ fontSize: '0.78rem' }}>(성명·비고 등 누락된 항목은 빈칸으로 출력됩니다)</span>
            </div>
          )}
        </>
      )}

      {/* ── 탭 3: 교습비 검토 ── */}
      {tab === 'review' && <TuitionReviewTab />}
    </div>
  );
}

// 공통 출력 버튼 컴포넌트
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
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
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
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
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
