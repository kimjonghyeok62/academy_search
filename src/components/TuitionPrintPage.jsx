// 교습비 계산·게시표 — 학원관리 첫 화면에서 들어오는 별도 화면.
//
// 이 화면은 price-checker 저장소(hakwon-price.vercel.app)와 **같은 것**이어야 한다.
// 담당자가 두 곳을 오가며 쓰는데 화면이 다르면 어느 쪽이 맞는지 알 수 없다.
// 그래서 탭 구성·기준단가 고르는 칸·순서를 그쪽과 맞춘다.
// 모양(색·글자 크기)은 이 앱 공통 틀을 따른다 — price-checker 도 같은 디자인 언어로 바뀌었다.
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

// 탭 — 제목에 '교습비'가 있으니 이름은 짧게 (휴대폰에서 세 개가 한 줄에 들어가게)
const TABS = [
  { id: 'review', label: '학원·교습소' },
  { id: 'tutoring', label: '개인과외' },
  { id: 'excel', label: '게시표 출력' },
];
const TAB_DESC = {
  review: '학원·교습소 교습비를 기준단가와 견주고 등록신청서를 출력합니다.',
  tutoring: '개인과외 교습비를 기준단가와 견주고 서식을 출력합니다.',
  excel: '나이스에서 받은 엑셀로 교습비 게시표를 만듭니다.',
};

export default function TuitionPrintPage({ academies }) {
  return (
    <RegionProvider>
      <TuitionPage academies={academies} />
    </RegionProvider>
  );
}

function TuitionPage({ academies: masterAcademies = [] }) {
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

  if (showStandardPrices) {
    return <StandardPriceTable onBack={() => setShowStandardPrices(false)} />;
  }
  if (showRegionAdmin) {
    return <RegionAdmin onBack={() => setShowRegionAdmin(false)} />;
  }

  return (
    <div className="animate-enter">
      <div className="page-head">
        <h1 className="page-title">교습비 계산·게시표</h1>
        <p className="page-desc">{TAB_DESC[tab]}</p>
      </div>

      {/* 교육지원청 고르기 + 기준단가 보기 */}
      <div className="tuition-region-bar">
        <label
          className={`tuition-region${region ? '' : ' is-empty'}`}
          title={effectiveDate ? `교습비등 조정위원회 개최일 ${effectiveDate}` : undefined}
        >
          <span>경기도</span>
          <select value={region} onChange={e => setRegion(e.target.value)} aria-label="교육지원청 선택">
            <option value="">지역 선택</option>
            {REGION_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <span>교육지원청 교습비 기준</span>
        </label>
        <button type="button" className="btn btn-outline" onClick={() => setShowStandardPrices(true)}>
          기준단가 보기
        </button>
      </div>

      {/* 탭 */}
      <div className="tabs-container" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
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
        <footer className="tuition-footer">
          <p>이 계산은 교습비 신고·변경신청 전 자체 검토 목적으로만 쓰세요.</p>
          <p>교습비 기준 적용 여부는 담당자 최종 판단을 따릅니다.</p>
        </footer>
      )}

      <button type="button" className="tuition-admin-link" onClick={() => setShowRegionAdmin(true)}>교육지원청 담당자 기준단가 입력</button>
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

      {error && <div className="alert is-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {academies.length > 1 && !selected && (
        <AcademyPickList academies={academies} onSelect={onSelect} />
      )}

      {selected && (
        <div className="animate-enter">
          {academies.length > 1 && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onSelect(null)} style={{ marginBottom: '12px' }}>
              ← 목록으로 돌아가기
            </button>
          )}
          <div className="card">
            <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)' }}>
                {selected.name}
                {getRegNoText(selected) && (
                  <span style={{ marginLeft: '6px', fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-muted)' }}>{getRegNoText(selected)}</span>
                )}
              </div>
              {selected.address && <div style={{ fontSize: '1rem', color: 'var(--text-muted)', marginTop: '2px' }}>{selected.address}</div>}
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>교습과정 {selected.courses.length}개</div>
            </div>
            <TuitionExportButtons academy={selected} />
          </div>
        </div>
      )}

      {/* 교습비등 반환기준 게시표 — 정해진 서식 PDF 를 바로 연다 */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <h2 className="card-title" style={{ margin: 0 }}>교습비등 반환기준 게시표</h2>
          <span className="tag">별지 제5호서식</span>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          경기도 학원의 설립·운영 및 과외교습에 관한 조례 시행규칙
        </p>
        <a className="btn btn-outline btn-block" href="/refund-standard.pdf" target="_blank" rel="noopener noreferrer">
          반환기준 게시표 PDF 보기
        </a>
      </div>
    </div>
  );
}
