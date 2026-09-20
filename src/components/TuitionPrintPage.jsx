// 교습비 계산·게시표 — 학원관리 첫 화면에서 들어오는 별도 화면.
//
// 이 화면은 price-checker 저장소(hakwon-price.vercel.app)와 **같은 것**이어야 한다.
// 담당자가 두 곳을 오가며 쓰는데 화면이 다르면 어느 쪽이 맞는지 알 수 없다.
// 그래서 탭 구성·카드 모양·기준단가 고르는 칸을 그쪽에서 그대로 가져왔고,
// 이 저장소에서 더한 것은 학원관리로 돌아가는 단추와 제목뿐이다.
import React, { useEffect, useRef, useState } from 'react';
import TuitionReviewTab from './TuitionReviewTab';
import StandardPriceTable from './StandardPriceTable';
import RegionAdmin from './RegionAdmin';
import TuitionExportButtons from './TuitionExportButtons';
import { NeisHakwonCard, ExcelUploadCard, AcademyPickList, hasDraggedFiles } from './NeisExcelSteps';
import { parseExcelTuition } from '../utils/parseExcelTuition';
import { getRegNoText } from '../utils/generateTuitionPDF';
import { attachRegNo } from '../utils/googleSheets';
import { RegionProvider, useRegion } from '../RegionContext';
import { REGION_NAMES } from '../utils/regionRates';

// 하남 담당자가 쓰는 화면이므로 아무것도 고르지 않았으면 광주하남으로 맞춰 둔다
// (그래도 고르는 칸은 남긴다 — 다른 지역 기준을 견줘 볼 일이 있다)
const DEFAULT_REGION = '광주하남';

export default function TuitionPrintPage({ academies, onBack }) {
  return (
    <RegionProvider>
      <TuitionPage academies={academies} onBack={onBack} />
    </RegionProvider>
  );
}

function TuitionPage({ academies: masterAcademies = [], onBack }) {
  const [tab, setTab] = useState('excel'); // 'review' | 'tutoring' | 'excel'
  const [showStandardPrices, setShowStandardPrices] = useState(false);
  const [showRegionAdmin, setShowRegionAdmin] = useState(false);
  const { region, setRegion, effectiveDate } = useRegion();

  useEffect(() => { if (!region) setRegion(DEFAULT_REGION); }, [region, setRegion]);

  // 게시표 출력 탭
  const [excelAcademies, setExcelAcademies] = useState([]);
  const [excelSelected, setExcelSelected] = useState(null);
  const [excelError, setExcelError] = useState('');
  const [excelLoading, setExcelLoading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setExcelError('');
    setExcelLoading(true);
    setExcelAcademies([]);
    setExcelSelected(null);
    try {
      const result = attachRegNo(await parseExcelTuition(file), masterAcademies);
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
    }
  }

  const tabStyle = (active) => ({
    flex: 1,
    padding: '12px 4px',
    border: '1px solid ' + (active ? 'rgba(79, 70, 229, 0.08)' : 'transparent'),
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    backgroundColor: active ? '#ffffff' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    boxShadow: active ? '0 4px 10px rgba(79, 70, 229, 0.12), 0 2px 4px rgba(0, 0, 0, 0.02)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    lineHeight: '1.25',
    transform: active ? 'scale(1.02)' : 'scale(1)',
    fontFamily: 'inherit',
  });

  if (showStandardPrices) {
    return <StandardPriceTable onBack={() => setShowStandardPrices(false)} />;
  }
  if (showRegionAdmin) {
    return <RegionAdmin onBack={() => setShowRegionAdmin(false)} />;
  }

  return (
    <div className="container animate-enter" style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}
          title="돌아가기"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-main)' }}>
          교습비 계산·게시표
        </h2>
      </div>

      {/* 교육지원청 고르기 + 기준단가 보기 */}
      <div className="app-region-bar" style={{ marginBottom: '22px' }}>
        <label
          className={`app-region${region ? '' : ' is-empty'}`}
          title={effectiveDate ? `교습비등 조정위원회 개최일 ${effectiveDate}` : undefined}
        >
          <svg className="app-region-pin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="app-region-text">경기도</span>
          <select className="app-region-select" value={region} onChange={e => setRegion(e.target.value)} aria-label="교육지원청 선택">
            <option value="">지역 선택</option>
            {REGION_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <span className="app-region-text">교육지원청 교습비 기준</span>
        </label>
        <button type="button" className="app-std-btn" onClick={() => setShowStandardPrices(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
          기준단가 보기
        </button>
      </div>

      {/* 탭 */}
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
          <svg className="tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="tab-maintext">학원·교습소</span>
          <span className="tab-subtext">교습비 변경</span>
        </button>
        <button className="tab-btn" style={tabStyle(tab === 'tutoring')} onClick={() => setTab('tutoring')}>
          <svg className="tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
            <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
          </svg>
          <span className="tab-maintext">개인과외</span>
          <span className="tab-subtext">교습비 변경</span>
        </button>
        <button className="tab-btn" style={tabStyle(tab === 'excel')} onClick={() => setTab('excel')}>
          <svg className="tab-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          <span className="tab-maintext">게시표 출력</span>
          <span className="tab-subtext">(나이스자료 이용)</span>
        </button>
      </div>

      {/* ── 탭: 교습비 변경(학원·교습소) ── */}
      {tab === 'review' && <TuitionReviewTab mode="academy" academies={masterAcademies} />}

      {/* ── 탭: 교습비 변경(개인과외) ── */}
      {tab === 'tutoring' && <TuitionReviewTab mode="tutoring" academies={masterAcademies} />}

      {/* ── 탭: 게시표 출력 ── */}
      {tab === 'excel' && (
        <ExcelTab
          loading={excelLoading}
          error={excelError}
          academies={excelAcademies}
          selected={excelSelected}
          onSelect={setExcelSelected}
          fileInputRef={fileInputRef}
          onFile={handleFile}
        />
      )}

      {tab !== 'excel' && (
        <footer className="app-footer">
          <p>이 계산은 교습비 신고·변경신청 전 자체 검토 목적으로만 쓰세요.</p>
          <p style={{ marginTop: '4px', fontSize: '0.78rem' }}>교습비 기준 적용 여부는 담당자 최종 판단을 따릅니다.</p>
        </footer>
      )}

      <div className="app-admin-link-wrap">
        <button type="button" className="app-admin-link" onClick={() => setShowRegionAdmin(true)}>교육지원청 담당자 기준단가 입력</button>
      </div>
    </div>
  );
}

function ExcelTab({ loading, error, academies, selected, onSelect, fileInputRef, onFile }) {
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  // 탭 어디에 끌어다 놓아도 올라가게 한다 — 끌고 온 손이 카드를 정확히 맞출 이유가 없다
  const dropHandlers = {
    onDragEnter: e => { if (!hasDraggedFiles(e)) return; e.preventDefault(); dragDepthRef.current++; setDragOver(true); },
    onDragOver: e => { if (hasDraggedFiles(e)) e.preventDefault(); },
    onDragLeave: () => { dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDragOver(false); },
    onDrop: e => {
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragOver(false);
      onFile(e.dataTransfer.files?.[0]);
    },
  };

  return (
    <div {...dropHandlers}>
      <NeisHakwonCard />
      <ExcelUploadCard loading={loading} dragOver={dragOver} fileInputRef={fileInputRef} onFile={onFile} />

      {error && (
        <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '16px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {academies.length > 1 && !selected && (
        <AcademyPickList academies={academies} onSelect={onSelect} />
      )}

      {selected && (
        <div className="animate-enter">
          {academies.length > 1 && (
            <button
              onClick={() => onSelect(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.83rem', marginBottom: '12px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              목록으로 돌아가기
            </button>
          )}
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1.5px solid var(--border-color)' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>
                {selected.name}
                {getRegNoText(selected) && (
                  <span style={{ marginLeft: '6px', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>{getRegNoText(selected)}</span>
                )}
              </div>
              {selected.address && <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: '2px' }}>{selected.address}</div>}
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>교습과정 {selected.courses.length}개</div>
            </div>
            <TuitionExportButtons academy={selected} />
          </div>
        </div>
      )}

      {/* 교습비등 반환기준 게시표 — 위 게시표와 같은 모양, 주황 계열로 구분 */}
      <div style={{
        marginTop: '20px', backgroundColor: '#fffbeb', border: '2px solid #fcd34d',
        borderRadius: '14px', padding: '18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <div style={{ width: '4px', height: '22px', backgroundColor: '#d97706', borderRadius: '2px', flexShrink: 0 }} />
          <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#78350f', letterSpacing: '-0.01em' }}>
            교습비등 반환기준 게시표
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#b45309', backgroundColor: '#fef3c7', border: '1.5px solid #fcd34d', borderRadius: '20px', padding: '2px 10px' }}>
            [별지 제5호서식]
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '12px', paddingLeft: '12px', wordBreak: 'keep-all' }}>
          경기도 학원의 설립·운영 및 과외교습에 관한 조례 시행규칙
        </div>
        <a
          href="/refund-standard.pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '14px 18px', borderRadius: '10px', backgroundColor: '#d97706', color: '#fff',
            fontSize: '1rem', fontWeight: '800', textDecoration: 'none', boxShadow: '0 3px 10px rgba(217,119,6,0.3)',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="13" y2="17" />
          </svg>
          반환기준 게시표 PDF 보기
        </a>
      </div>
    </div>
  );
}

