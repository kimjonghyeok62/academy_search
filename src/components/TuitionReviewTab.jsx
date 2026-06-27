import React, { useState, useRef } from 'react';
import TuitionCheckTab from './TuitionCheckTab';
import { parseExcelTuition } from '../utils/parseExcelTuition';
import { printRegistrationForm } from '../utils/generateRegistrationPDF';

// ─── 교습과정/과목명에서 분야 인덱스 추정 ────────────────────
function guessRateIdx(text) {
  if (!text) return '';
  const p = text.toLowerCase();
  if (p.includes('어학') || p.includes('외국어')) return 4;
  if (p.includes('음악')) return p.includes('입시') ? 6 : 5;
  if (p.includes('미술')) return p.includes('입시') ? 8 : 7;
  if (p.includes('무용') || p.includes('댄스') || p.includes('체육')) return p.includes('입시') ? 10 : 9;
  if (p.includes('정보') || p.includes('컴퓨터') || p.includes('코딩')) return 11;
  if (p.includes('진학') || p.includes('상담')) return 3;
  const isHabeop = p.includes('보습') || p.includes('단과') || p.includes('보통교과');
  if (isHabeop || p.includes('고등') || p.includes('고교') || p.includes('수능') ||
      p.includes('중등') || p.includes('중학') || p.includes('초등')) {
    if (p.includes('고등') || p.includes('고교') || p.includes('수능')) return 2;
    if (p.includes('중등') || p.includes('중학')) return 1;
    if (isHabeop) return 0;
  }
  return '';
}

// ─── 기준단가 옵션 ───────────────────────────────────────────
const STANDARD_RATE_OPTIONS = [
  { label: '보습 — 단과(초등)', rate: 210 },
  { label: '보습 — 단과(중등)', rate: 222 },
  { label: '보습 — 단과(고등)', rate: 234 },
  { label: '진학상담, 지도', rate: 234 },
  { label: '어학 (실용외국어 포함)', rate: 259 },
  { label: '음악 — 유,초,중,고', rate: 224 },
  { label: '음악 — 입시', rate: 336 },
  { label: '미술 — 유,초,중,고', rate: 212 },
  { label: '미술 — 입시', rate: 255 },
  { label: '무용 — 유,초,중,고', rate: 212 },
  { label: '무용 — 입시', rate: 255 },
  { label: '정보 — 일반', rate: 230 },
  { label: '기타 — 일반', rate: 230 },
];

export default function TuitionReviewTab({ mode = 'academy' }) {
  const isTutoring = mode === 'tutoring';

  // ── 신설/변경 서브탭 ──
  const [subTab, setSubTab] = useState('신설');

  // ── 신설 탭 상태 ──
  const [subjects, setSubjects] = useState([
    { id: 1, rateIdx: '', dm: '', wc: '', wk: '4.3', fee: '', subjectName: '' }
  ]);

  function addSubject() {
    setSubjects(prev => {
      const last = prev[prev.length - 1];
      return [...prev, { id: Date.now(), rateIdx: '', dm: '', wc: '', wk: last?.wk || '4.3', fee: '', subjectName: '' }];
    });
  }
  function updateSubject(id, key, val) {
    setSubjects(prev => prev.map(sub => sub.id === id ? { ...sub, [key]: val } : sub));
  }
  function removeSubject(id) {
    if (subjects.length === 1) {
      setSubjects([{ id: 1, rateIdx: '', dm: '', wc: '', wk: '4.3', fee: '', subjectName: '' }]);
      return;
    }
    setSubjects(prev => prev.filter(sub => sub.id !== id));
  }

  // ── 변경 탭 상태 ──
  const [changeRegType, setChangeRegType] = useState('일부변경');
  const changeFileInputRef = useRef(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeDragOver, setChangeDragOver] = useState(false);
  const [changeAcademies, setChangeAcademies] = useState([]);
  const [changeSelected, setChangeSelected] = useState(null);
  const [changeSubjects, setChangeSubjects] = useState([]);

  function parseFeeStr(str) {
    if (!str) return '';
    const n = parseInt(String(str).replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? '' : String(n);
  }

  function reverseCalcTime(totalTimeStr) {
    const total = parseFloat(String(totalTimeStr).replace(/[^0-9.]/g, ''));
    if (isNaN(total) || total <= 0) return { dm: '', wc: '', wk: '4.3' };

    const wkCandidates = [
      { val: 4.3, str: '4.3' },
      { val: 4.2, str: '4.2' },
      { val: 4.1, str: '4.1' },
      { val: 4.0, str: '4' },
    ];
    const wcTryOrder = [5, 4, 3, 6, 2, 7, 1, 8, 10];

    for (let pass = 0; pass < 2; pass++) {
      for (const { val: wkVal, str: wkStr } of wkCandidates) {
        const weekly = total / wkVal;
        for (const wc of wcTryOrder) {
          const dmFloat = weekly / wc;
          const dmInt = Math.round(dmFloat);
          if (dmInt < 30 || dmInt > 480) continue;
          if (Math.abs(dmFloat - dmInt) > 0.02) continue;
          if (pass === 0 && dmInt % 5 !== 0) continue;
          if (Math.abs(dmInt * wc * wkVal - total) / total < 0.003) {
            return { dm: String(dmInt), wc: String(wc), wk: wkStr };
          }
        }
      }
    }
    return { dm: '', wc: '', wk: '4.3' };
  }

  function selectChangeAcademy(academy) {
    setChangeSelected(academy);
    const subs = academy.courses.map((c, i) => {
      const label = c.subject ? `${c.process}(${c.subject})` : c.process;
      const rateIdx = guessRateIdx(`${c.process} ${c.subject || ''}`);
      const { dm, wc, wk } = reverseCalcTime(c.totalTime);
      return { id: i + 1, subjectName: label || '', rateIdx, dm, wc, wk, fee: parseFeeStr(c.tuitionFee) };
    });
    setChangeSubjects(subs.length ? subs : [{ id: 1, subjectName: '', rateIdx: '', dm: '', wc: '', wk: '4.3', fee: '' }]);
  }

  async function handleChangeFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setChangeError('');
    setChangeLoading(true);
    setChangeAcademies([]);
    setChangeSelected(null);
    setChangeSubjects([]);
    try {
      const result = await parseExcelTuition(file);
      if (!result.length) {
        setChangeError('파싱된 학원 데이터가 없습니다. 파일 형식을 확인하세요.');
      } else {
        setChangeAcademies(result);
        if (result.length === 1) selectChangeAcademy(result[0]);
      }
    } catch (err) {
      setChangeError('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setChangeLoading(false);
      e.target.value = '';
    }
  }

  function handleChangeDrop(e) {
    e.preventDefault();
    setChangeDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleChangeFile({ target: { files: [file], value: '' } });
  }

  function removeChangeSubject(id) {
    if (changeSubjects.length === 1) return;
    setChangeSubjects(prev => prev.filter(sub => sub.id !== id));
  }

  const subTabStyle = (active) => ({
    flex: 1,
    padding: '9px 4px',
    border: 'none',
    borderBottom: active ? '2.5px solid var(--primary)' : '2.5px solid transparent',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    fontWeight: active ? '700' : '500',
    fontSize: '0.97rem',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* 탭 전용 안내 배너 */}
      {!isTutoring ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '9px 14px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          fontSize: '0.95rem',
          color: '#1d4ed8',
          lineHeight: 1.4,
        }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>ℹ️</span>
          <span>
            이 탭은 <strong>학원·교습소</strong> 전용입니다.&nbsp;
            개인과외는 상단 <strong>'개인과외'</strong> 탭을 이용해 주세요.
          </span>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '9px 14px',
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          fontSize: '0.95rem',
          color: '#92400e',
          lineHeight: 1.4,
        }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>ℹ️</span>
          <span>
            이 탭은 <strong>개인과외</strong> 전용입니다.&nbsp;
            학원·교습소는 상단 <strong>'학원·교습소'</strong> 탭을 이용해 주세요.
          </span>
        </div>
      )}

      {/* 검토 / 신설 / 변경 서브탭 (학원·교습소만) */}
      {!isTutoring && (
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '4px' }}>
          {['신설', '변경', '검토'].map(t => (
            <button key={t} style={subTabStyle(subTab === t)} onClick={() => setSubTab(t)}>{t}</button>
          ))}
        </div>
      )}

      {/* ── 검토 탭 ── */}
      {!isTutoring && subTab === '검토' && <TuitionCheckTab />}

      {/* ── 신설 탭 / 과외 모드 ── */}
      {(isTutoring || subTab === '신설') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {subjects.map((sub, idx) => (
            <SubjectCard
              key={sub.id}
              index={idx}
              sub={sub}
              mode={mode}
              onUpdate={updateSubject}
              onRemove={removeSubject}
              isLast={idx === subjects.length - 1}
              onAdd={addSubject}
            />
          ))}
          {!isTutoring && (
            <PrintBar
              onPrint={() => printRegistrationForm({ regType: '신규등록', subjects })}
            />
          )}
        </div>
      )}

      {/* ── 변경 탭 ── */}
      {!isTutoring && subTab === '변경' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={{ backgroundColor: '#f8fafc', border: '1.5px solid var(--border-color)', borderRadius: '12px', padding: '14px 18px', fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-main)' }}>
            <div style={{ marginBottom: '10px', color: '#374151', fontSize: '0.88rem' }}>
              기존 학원·교습소의 교습비를 변경할 때, 나이스에 기등록된 자료를 바탕으로 수정하고자 하는 경우 아래를 참고하세요.
            </div>
            <div style={{ fontWeight: '700', marginBottom: '8px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              나이스 학원에 기등록된 자료를 바탕으로 변경하고자 할 때
            </div>
            <ol style={{ paddingLeft: '20px', margin: '0 0 10px', display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-muted)', fontWeight: '600' }}>
              <li><a href="https://hakwon.neis.go.kr" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: '700', textDecoration: 'underline' }}>나이스 학원</a>{' '}방문</li>
              <li>경기도교육청 선택</li>
              <li>학원 교습소 정보 조회 (엑셀내려받기)</li>
              <li>아래 영역에 엑셀 업로드</li>
            </ol>
            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 12px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.85rem', color: '#92400e', fontWeight: '600' }}>
              <span style={{ flexShrink: 0 }}>⚠️</span>
              PC 전용 기능 (모바일은 불완전)
            </div>
          </div>

          {!changeSelected && (
            <div
              onClick={() => changeFileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setChangeDragOver(true); }}
              onDragEnter={e => { e.preventDefault(); setChangeDragOver(true); }}
              onDragLeave={e => { e.preventDefault(); setChangeDragOver(false); }}
              onDrop={handleChangeDrop}
              style={{
                border: `2px dashed ${changeDragOver ? 'var(--primary)' : 'var(--border-color)'}`,
                borderRadius: '12px', padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                backgroundColor: changeDragOver ? '#eef2ff' : 'var(--bg-card)',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
              onMouseEnter={e => { if (!changeDragOver) e.currentTarget.style.borderColor = 'var(--primary)'; }}
              onMouseLeave={e => { if (!changeDragOver) e.currentTarget.style.borderColor = 'var(--border-color)'; }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)', marginBottom: '10px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {changeLoading ? '파일 분석 중...' : changeDragOver ? '여기에 놓으세요!' : '엑셀 파일 선택 또는 여기에 끌어다 놓기'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                나이스 학원에서 엑셀내려받기 한 파일(.xlsx) 업로드
              </div>
              <input ref={changeFileInputRef} type="file" accept=".xlsx,.xls" onChange={handleChangeFile} style={{ display: 'none' }} />
            </div>
          )}

          {changeError && (
            <div style={{ color: '#dc2626', fontSize: '0.85rem', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              {changeError}
            </div>
          )}

          {changeAcademies.length > 1 && !changeSelected && (
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '10px' }}>
                파일에서 {changeAcademies.length}개 학원을 찾았습니다. 선택하세요.
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {changeAcademies.map((a, i) => (
                  <li key={i} onClick={() => selectChangeAcademy(a)}
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

          {changeSelected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>
                  {changeSelected.name}
                  {changeSelected.address && (
                    <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {changeSelected.address}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setChangeSelected(null); setChangeSubjects([]); setChangeAcademies([]); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.83rem', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  다시 선택
                </button>
              </div>
              {changeSubjects.map((sub, idx) => (
                <SubjectCard
                  key={sub.id}
                  index={idx}
                  sub={sub}
                  mode={mode}
                  onUpdate={(id, k, v) => setChangeSubjects(prev => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], [k]: v };
                    return next;
                  })}
                  onRemove={removeChangeSubject}
                  isLast={false}
                  onAdd={() => {}}
                />
              ))}
              <PrintBar
                regType={changeRegType}
                onRegTypeChange={setChangeRegType}
                showRegTypeSelector
                onPrint={() => printRegistrationForm({
                  academyName: changeSelected.name,
                  operator: changeSelected.founder?.name || '',
                  address: changeSelected.address || '',
                  regType: changeRegType,
                  subjects: changeSubjects,
                })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnderlineInput({ value, onChange, placeholder, width = '60px', unit, type = 'number' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      <input
        type={type}
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width,
          textAlign: 'center',
          padding: '3px 2px',
          border: 'none',
          borderBottom: '1.5px solid #9ca3af',
          background: 'transparent',
          fontSize: '1rem',
          fontWeight: '600',
          color: '#111827',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      {unit && <span style={{ fontSize: '0.9rem', color: '#374151', fontWeight: '500' }}>{unit}</span>}
    </span>
  );
}

function DropdownSelect({ options, value, onChange, unit, placeholder, inputWidth = '60px' }) {
  const CUSTOM = '__custom__';
  const initialIsCustom = value !== '' && !options.includes(String(value));
  const [isCustomMode, setIsCustomMode] = useState(initialIsCustom);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (value !== '') {
      const isValInOptions = options.includes(String(value));
      setIsCustomMode(!isValInOptions);
    }
  }, [value, options]);

  React.useEffect(() => {
    if (isCustomMode && inputRef.current) {
      const timer = setTimeout(() => {
        try { inputRef.current && inputRef.current.focus(); } catch (_) {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCustomMode]);

  function handleChange(e) {
    if (e.target.value === CUSTOM) {
      setIsCustomMode(true);
      onChange('');
    } else {
      setIsCustomMode(false);
      onChange(e.target.value);
    }
  }

  const selectVal = isCustomMode ? CUSTOM : (value === '' ? '' : String(value));

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {!isCustomMode ? (
        <select
          value={selectVal}
          onChange={handleChange}
          style={{
            padding: '6px 4px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            color: value === '' ? '#9ca3af' : '#111827',
            fontWeight: value === '' ? '400' : '600',
            background: '#fff',
            outline: 'none',
            fontFamily: 'inherit',
            cursor: 'pointer',
            appearance: 'auto',
            WebkitAppearance: 'auto',
            maxWidth: '72px',
            minHeight: '36px',
            touchAction: 'manipulation',
          }}
        >
          <option value="">선택</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}{unit}</option>
          ))}
          <option value={CUSTOM}>입력</option>
        </select>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
            onClick={() => { try { inputRef.current && inputRef.current.focus(); } catch (_) {} }}
            onBlur={() => {
              if (value === '') setIsCustomMode(false);
            }}
            style={{
              width: (parseFloat(inputWidth) - 8) + 'px',
              textAlign: 'center',
              padding: '3px 0px',
              border: 'none',
              borderBottom: '1.5px solid #9ca3af',
              background: 'transparent',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#111827',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {unit && <span style={{ fontSize: '0.9rem', color: '#374151', fontWeight: '500', marginLeft: '1px' }}>{unit}</span>}
        </span>
      )}
    </span>
  );
}

function SubjectCard({ index, sub, mode, onUpdate, onRemove, isLast, onAdd }) {
  const { id, rateIdx, dm, wc, wk, fee, subjectName } = sub;
  const isTutoring = mode === 'tutoring';

  const [feeEditMode, setFeeEditMode] = useState(false);
  const [nameEditMode, setNameEditMode] = useState(false);
  const longPressTimer = useRef(null);
  const displayName = subjectName || `과목${index + 1}`;

  function handleFeePointerDown() {
    longPressTimer.current = setTimeout(() => setFeeEditMode(true), 500);
  }
  function handleFeePointerUp() {
    clearTimeout(longPressTimer.current);
    setFeeEditMode(true);
  }
  function handleFeePointerLeave() {
    clearTimeout(longPressTimer.current);
  }
  function handleFeeStep(delta) {
    const next = Math.max(0, (parseFloat(fee) || 0) + delta);
    onUpdate(id, 'fee', String(next));
  }

  const wkVal = parseFloat(wk) || 0;
  const totalMinutes = Math.round((parseFloat(dm) || 0) * (parseFloat(wc) || 0) * wkVal);
  const calcRate = totalMinutes > 0 ? (parseFloat(fee) || 0) / totalMinutes : 0;
  const calcRatePrecision5 = totalMinutes > 0 ? calcRate.toFixed(5) : '0';
  const calcRateCeil1 = totalMinutes > 0 ? String(Math.ceil(calcRate)) : '0';

  const calcHourlyRate = calcRate * 60;
  const calcHourlyRatePrecision5 = totalMinutes > 0 ? calcHourlyRate.toFixed(5) : '0';
  const calcHourlyRateCeil1 = totalMinutes > 0 ? String(Math.ceil(calcHourlyRate)) : '0';

  const hasRateSelected = isTutoring || rateIdx !== '';
  const standardRate = isTutoring
    ? (20000 / 60)
    : (rateIdx !== '' ? STANDARD_RATE_OPTIONS[rateIdx].rate : 0);

  const canJudge = hasRateSelected && totalMinutes > 0 && (parseFloat(fee) || 0) > 0;

  const isCompliant = isTutoring
    ? (calcRate * 60) <= 20000.01
    : parseFloat(calcRateCeil1) <= standardRate;

  const maxAllowedFee = isTutoring
    ? Math.floor((totalMinutes / 60) * 20000)
    : Math.floor(standardRate * totalMinutes);

  const statusColor = !canJudge ? '#6b7280' : isCompliant ? '#16a34a' : '#dc2626';
  const headerBg = !canJudge ? '#f9fafb' : isCompliant ? '#f0fdf4' : '#fff1f2';
  const borderColor = !canJudge ? '#d1d5db' : isCompliant ? '#86efac' : '#fca5a5';

  return (
    <div style={{
      border: `1.5px solid ${borderColor}`,
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 14px',
        backgroundColor: headerBg,
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: '800', fontSize: '1rem', color: '#111827', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            {index + 1}.{' '}
            {nameEditMode ? (
              <input
                type="text"
                autoFocus
                value={subjectName}
                onChange={e => {
                  const newName = e.target.value;
                  onUpdate(id, 'subjectName', newName);
                  const guessed = guessRateIdx(newName);
                  if (guessed !== '') onUpdate(id, 'rateIdx', guessed);
                }}
                onBlur={() => setNameEditMode(false)}
                onKeyDown={e => { if (e.key === 'Enter') setNameEditMode(false); }}
                placeholder={`과목${index + 1}`}
                style={{
                  fontSize: '1rem', fontWeight: '800', color: '#111827',
                  border: 'none', borderBottom: '1.5px solid #6366f1', background: 'transparent',
                  outline: 'none', fontFamily: 'inherit', width: '100px', padding: '0 2px',
                }}
              />
            ) : (
              <span
                onClick={() => setNameEditMode(true)}
                title="클릭하여 과목명 편집"
                style={{ cursor: 'text', borderBottom: '1px dashed #9ca3af', paddingBottom: '1px' }}
              >
                {displayName}
              </span>
            )}
          </span>
          <span style={{
            fontSize: '0.78rem',
            fontWeight: '700',
            color: '#fff',
            backgroundColor: statusColor,
            padding: '2px 9px',
            borderRadius: '20px',
          }}>
            {!canJudge ? '입력 중' : isCompliant ? '✓ 적합' : '✗ 부적합'}
          </span>
        </div>
        <button
          onClick={() => onRemove(id)}
          style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '1rem', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#fff' }}>

        {!isTutoring && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#374151', whiteSpace: 'nowrap', flexShrink: 0 }}>
              1. 교습 분야 선택
            </span>
            <select
              value={rateIdx}
              onChange={e => onUpdate(id, 'rateIdx', e.target.value === '' ? '' : Number(e.target.value))}
              style={{
                flex: 1,
                padding: '6px 10px',
                border: '1.5px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.95rem',
                color: rateIdx === '' ? '#9ca3af' : '#111827',
                fontWeight: rateIdx === '' ? '400' : '600',
                background: '#fff',
                outline: 'none',
                fontFamily: 'inherit',
                cursor: 'pointer',
                appearance: 'auto',
              }}
            >
              <option value="">— 분야 선택 —</option>
              {STANDARD_RATE_OPTIONS.map((o, i) => (
                <option key={i} value={i}>{o.label} ({o.rate}원/분)</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 6px', fontSize: '0.95rem' }}>
          <span style={{ fontWeight: '700', color: '#374151', whiteSpace: 'nowrap', flexShrink: 0, marginRight: '4px', minWidth: '115px' }}>
            {isTutoring ? '1. 월교습시간(분)' : '2. 월교습시간(분)'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 6px', flex: 1, minWidth: '200px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#374151', fontWeight: '500' }}>일</span>
              <DropdownSelect
                options={Array.from({ length: 34 }, (_, i) => String(30 + i * 10))}
                value={dm}
                onChange={val => onUpdate(id, 'dm', val)}
                unit="분"
                placeholder="0"
                inputWidth="52px"
              />
              <span style={{ color: '#4b5563', margin: '0 4px', fontSize: '1.15rem' }}>×</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#374151', fontWeight: '500' }}>주</span>
              <DropdownSelect
                options={['1', '2', '3', '4', '5', '6', '7']}
                value={wc}
                onChange={val => onUpdate(id, 'wc', val)}
                unit="회"
                placeholder="0"
                inputWidth="40px"
              />
              <span style={{ color: '#4b5563', margin: '0 4px', fontSize: '1.15rem' }}>×</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#374151', fontWeight: '500' }}>월</span>
              <DropdownSelect
                options={['4', '4.1', '4.2', '4.3']}
                value={wk}
                onChange={val => onUpdate(id, 'wk', val)}
                unit="주"
                placeholder="4.3"
                inputWidth="46px"
              />
              <span style={{ color: '#4b5563', margin: '0 4px', fontSize: '1.15rem' }}>=</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
              <strong style={{ fontWeight: '900', color: totalMinutes > 0 ? '#1d4ed8' : '#9ca3af', WebkitTextStroke: totalMinutes > 0 ? '0.4px #1d4ed8' : 'none' }}>
                {totalMinutes > 0 ? totalMinutes.toLocaleString() : '____'}
              </strong>
              <span style={{ color: '#374151', fontWeight: '500', marginLeft: '2px' }}>분</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem' }}>
          <span style={{ fontWeight: '700', color: '#374151', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {isTutoring ? '2. 교습비(원)' : '3. 교습비(원)'}
          </span>
          {feeEditMode ? (
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={fee === '' ? '' : Number(fee).toLocaleString()}
              onChange={e => {
                const raw = e.target.value.replace(/,/g, '');
                if (raw === '' || /^\d+$/.test(raw)) onUpdate(id, 'fee', raw);
              }}
              onBlur={() => {
                if (fee === '') onUpdate(id, 'fee', '0');
                setFeeEditMode(false);
              }}
              style={{
                width: '120px',
                textAlign: 'right',
                padding: '4px 2px',
                border: 'none',
                borderBottom: '1.5px solid #6366f1',
                background: 'transparent',
                fontSize: '1.05rem',
                fontWeight: '700',
                color: '#1d4ed8',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <span
              onPointerDown={handleFeePointerDown}
              onPointerUp={handleFeePointerUp}
              onPointerLeave={handleFeePointerLeave}
              title="클릭하면 직접 입력"
              style={{
                width: '120px',
                textAlign: 'right',
                padding: '4px 2px',
                borderBottom: '1.5px solid #9ca3af',
                fontSize: '1.05rem',
                fontWeight: '700',
                color: fee ? '#1d4ed8' : '#9ca3af',
                cursor: 'text',
                userSelect: 'none',
                display: 'inline-block',
              }}
            >
              {fee ? Number(fee).toLocaleString() : '금액 입력'}
            </span>
          )}
          <span style={{ fontSize: '0.95rem', color: '#374151', fontWeight: '600', flexShrink: 0 }}>원</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
            {['▲', '▼'].map((arrow, i) => (
              <button
                key={arrow}
                onClick={() => handleFeeStep(i === 0 ? 10000 : -10000)}
                style={{
                  width: '26px', height: '18px', padding: 0, fontSize: '0.6rem', lineHeight: 1,
                  border: '1px solid #d1d5db', borderRadius: i === 0 ? '4px 4px 0 0' : '0 0 4px 4px',
                  background: '#f9fafb', color: '#374151', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.color = '#4338ca'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#374151'; }}
              >
                {arrow}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.85rem', color: totalMinutes > 0 ? '#1d4ed8' : '#9ca3af', backgroundColor: totalMinutes > 0 ? '#eff6ff' : '#f1f5f9', padding: '2px 7px', borderRadius: '4px', fontWeight: '700', flexShrink: 0, border: `1px solid ${totalMinutes > 0 ? '#bfdbfe' : '#e2e8f0'}` }}>
            상한 {totalMinutes > 0 ? maxAllowedFee.toLocaleString() : '—'}원
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: '700', color: '#374151', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {isTutoring ? '3. 시간당단가' : '4. 분당단가'}
          </span>
          {canJudge ? (
            <>
              <span style={{ color: '#374151', fontWeight: '500' }}>
                {isTutoring ? calcHourlyRatePrecision5 : calcRatePrecision5}원
              </span>
              <span style={{ color: '#9ca3af', fontWeight: '600' }}>→</span>
              <strong style={{ fontWeight: '900', color: '#1d4ed8', fontSize: '1rem', WebkitTextStroke: '0.4px #1d4ed8' }}>
                {isTutoring
                  ? `${Number(calcHourlyRateCeil1).toLocaleString()}원/시간`
                  : `${Number(calcRateCeil1).toLocaleString()}원/분`}
              </strong>
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>(올림)</span>
            </>
          ) : (
            <span style={{ color: '#9ca3af' }}>_____ 원/분 (자동계산)</span>
          )}
        </div>

        {isLast && (
          <button
            onClick={onAdd}
            style={{
              marginTop: '2px', width: '100%', padding: '10px',
              backgroundColor: '#f3f4f6', color: '#374151',
              border: '1.5px dashed #d1d5db', borderRadius: '8px',
              fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.02em',
            }}
          >
            + 과목 추가
          </button>
        )}
      </div>
    </div>
  );
}

function PrintBar({ onPrint, showRegTypeSelector = false, regType, onRegTypeChange }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '10px',
      padding: '14px 16px', backgroundColor: '#f8fafc',
      border: '1.5px solid #e2e8f0', borderRadius: '10px', marginTop: '4px',
    }}>
      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
        학원(교습소) 교습비등 등록신청서
      </div>
      {showRegTypeSelector && (
        <div style={{ display: 'flex', gap: '12px', fontSize: '0.9rem' }}>
          {['일부변경', '전체변경'].map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: regType === t ? '700' : '500', color: regType === t ? '#1d4ed8' : '#6b7280' }}>
              <input
                type="radio"
                name="regType"
                value={t}
                checked={regType === t}
                onChange={() => onRegTypeChange(t)}
                style={{ accentColor: '#2563eb' }}
              />
              {t}
            </label>
          ))}
        </div>
      )}
      <button
        onClick={onPrint}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          padding: '10px 16px', backgroundColor: '#1d4ed8', color: '#fff',
          border: 'none', borderRadius: '8px', fontSize: '0.92rem', fontWeight: '700',
          cursor: 'pointer', letterSpacing: '0.02em',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e40af'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        등록신청서 출력 (PDF)
      </button>
    </div>
  );
}
