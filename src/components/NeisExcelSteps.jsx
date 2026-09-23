// 카드 여럿과 끌어다 놓기 판별을 한 파일에 모아 둔다 — price-checker 와 같은 구성.
/* eslint-disable react-refresh/only-export-components */
import React from 'react';

// 게시표 출력 탭과 교습비 변경 탭이 함께 쓰는 "① 나이스 학원에서 엑셀 받기 → ② 받은 엑셀 올리기" 카드

// 안드로이드 크롬에서 '데스크톱 사이트'가 켜진 상태 — 안드로이드라 밝히지 않으면서
// 손가락으로 만지는 기기다. 나이스 학원이 PC 화면으로 열려 터치가 잘 안 되므로 알려 준다.
const isAndroidDesktopMode = () =>
  /Linux/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0;

const NEIS_HAKWON_URL = 'https://hakwon.neis.go.kr';

const stepCardStyle = {
  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '18px',
  boxShadow: 'var(--shadow-sm)',
};

// PC 크롬/엣지: 다운로드 폴더가 바로 열리는 파일 선택창 (지원하지 않으면 null)
async function pickExcelFromDownloads() {
  if (!window.showOpenFilePicker) return null;
  const [handle] = await window.showOpenFilePicker({
    startIn: 'downloads',
    types: [{
      description: '엑셀 파일',
      accept: {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/vnd.ms-excel': ['.xls'],
      },
    }],
  });
  return handle.getFile();
}

export const hasDraggedFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

export function StepBadge({ n }) {
  return (
    <span style={{
      width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--navy)', color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: '800', flexShrink: 0,
    }}>{n}</span>
  );
}

function StepTitle({ n, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <StepBadge n={n} />
      <span style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)' }}>{children}</span>
    </div>
  );
}

/** ① 나이스 학원에서 엑셀 받기 */
export function NeisHakwonCard({ style }) {
  return (
    <div style={{ ...stepCardStyle, marginBottom: '14px', ...style }}>
      <StepTitle n="1">나이스 학원에서 엑셀 받기</StepTitle>
      <a
        className="btn btn-primary btn-block"
        href={NEIS_HAKWON_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ minHeight: '52px', fontSize: '1.15rem' }}
      >
        나이스 학원 열기
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
      {isAndroidDesktopMode() && (
        <div style={{
          marginTop: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--warn-soft)',
          border: '1px solid #fde68a', color: 'var(--text-main)', fontSize: '1rem', lineHeight: 1.5,
        }}>
          크롬 <b>'데스크톱 사이트'</b>가 켜져 있어 나이스 학원이 PC 화면으로 열리고 터치가 잘 안 됩니다.
          크롬 오른쪽 위 <b>⋮ 메뉴 → '데스크톱 사이트' 체크 해제</b> 후 다시 열어 주세요.
        </div>
      )}
    </div>
  );
}

/** ② 받은 엑셀 올리기 — 끌어다 놓기는 호출하는 쪽에서 dragOver/onFile로 연결 */
export function ExcelUploadCard({ loading, dragOver, fileInputRef, onFile, style }) {
  async function openFilePicker() {
    try {
      const file = await pickExcelFromDownloads();
      if (file) return onFile(file);
    } catch (e) {
      if (e?.name === 'AbortError') return; // 선택창에서 취소
    }
    fileInputRef.current?.click();
  }

  return (
    <div style={{ ...stepCardStyle, marginBottom: '20px', ...style }}>
      <StepTitle n="2">받은 엑셀 올리기</StepTitle>
      <button
        type="button"
        onClick={openFilePicker}
        style={{
          width: '100%', minHeight: '64px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '14px 18px', borderRadius: '10px', cursor: 'pointer',
          border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border-strong)'}`,
          backgroundColor: dragOver ? 'var(--primary-soft)' : 'var(--bg-card)',
          color: 'var(--primary)', fontSize: '1.0625rem', fontWeight: '700', fontFamily: 'inherit',
          transition: 'border-color 0.15s, background-color 0.15s',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {loading ? '파일 분석 중...' : dragOver ? '여기에 놓으세요!' : '눌러서 선택하거나 끌어다 놓기'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }}
        style={{ display: 'none' }}
      />
    </div>
  );
}

/** 파일에 학원이 여러 개일 때 고르는 목록 */
export function AcademyPickList({ academies, onSelect, label = '출력할' }) {
  return (
    <div>
      <div style={{ fontSize: '1.0625rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '10px' }}>
        파일에서 {academies.length}개 학원을 찾았습니다. {label} 학원을 선택하세요.
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {academies.map((a, i) => (
          <li key={i}>
            <button
              type="button"
              className="link-row"
              onClick={() => onSelect(a)}
              style={{ width: '100%', padding: '12px 16px', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', fontFamily: 'inherit' }}
            >
              <span style={{ fontWeight: '700' }}>{a.name}</span>
              {a.address && <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>{a.address}</span>}
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>교습과정 {a.courses.length}개</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
