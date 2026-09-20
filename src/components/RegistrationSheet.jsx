// 서식 값을 다루는 헬퍼를 화면과 같은 파일에 둔다 — price-checker 저장소와 파일 구성을
// 맞춰 두어야 한쪽을 고친 뒤 다른 쪽에 옮기기 쉽다.
/* eslint-disable react-refresh/only-export-components */
import React, { useEffect } from 'react';
import './RegistrationSheet.css';
import { DropdownSelect } from './tuitionInputs';
import { guessRateId, rowLabel } from '../utils/regionRates';
import { useRegion } from '../RegionContext';
import { OTHER_FEE_ITEMS } from '../utils/generateTuitionPDF';

// 학원(교습소) 교습비등 등록신청서 — 제출 서식과 같은 모양으로 바로 적어 넣는 입력 화면
// PC: 서식처럼 한 과목 한 줄 표 / 휴대폰: 과목마다 같은 칸을 세로로 쌓음 (RegistrationSheet.css)

const DEFAULT_PERIOD = '1개월';
const REG_TYPES = ['신규등록', '일부변경', '전체변경'];

export const SHEET_ROWS_STEP = 5; // 처음 보여줄 줄 수 = 한 번에 추가하는 줄 수

export function newSheetSubject(patch = {}) {
  return { id: Date.now() + Math.random(), rateId: '', processLabel: '', subjectName: '', period: DEFAULT_PERIOD, dm: '', wc: '', wk: '4.3', capacity: '', fee: '', ...patch };
}

/** 과목 줄이 SHEET_ROWS_STEP 줄보다 적으면 빈 줄로 채움 (빈 줄은 첫 줄의 교습과정·정원을 따라감) */
export function padSheetSubjects(subjects) {
  const first = subjects[0];
  const rows = [...subjects];
  while (rows.length < SHEET_ROWS_STEP) rows.push(newSheetSubject(first ? { rateId: first.rateId, processLabel: first.processLabel, capacity: first.capacity } : {}));
  return rows;
}

// ── 기타경비 (교습과목(반)별 6개 항목 + 계) ──
export const EXTRA_FEE_ROWS_MIN = 2; // 신청서 서식의 기본 줄 수

export function newExtraFee(patch = {}) {
  const row = { id: Date.now() + Math.random(), subjectName: '' };
  for (const it of OTHER_FEE_ITEMS) row[it.key] = '';
  return { ...row, ...patch };
}

/** 기타경비 줄이 EXTRA_FEE_ROWS_MIN 줄보다 적으면 빈 줄로 채움 */
export function padExtraFees(rows) {
  const next = [...rows];
  while (next.length < EXTRA_FEE_ROWS_MIN) next.push(newExtraFee());
  return next;
}

export const extraFeeTotal = (row) => OTHER_FEE_ITEMS.reduce((sum, it) => sum + (parseInt(row[it.key], 10) || 0), 0);

/** 지역 줄 id로 교습과정 칸 값 만들기 (신청서에 적힐 이름도 같이 저장) */
export function rateFields(rows, rateId) {
  const row = rows.find(r => r.id === rateId);
  return row ? { rateId: row.id, processLabel: rowLabel(row) } : { rateId: '', processLabel: '' };
}

// 첫 줄에서 바꾸면 아래 줄도 따라가는 칸 (아래 줄에서 따로 고친 값은 그대로 둠)
const FOLLOW_FIRST_ROW_KEYS = ['rateId', 'processLabel', 'capacity'];

// standardRate: 학원·교습소는 분당단가, 개인과외는 시간당 기준 — 0이면 지역 기준이 없어 판정하지 않음
function judge(sub, isTutoring, standardRate) {
  const total = Math.round((parseFloat(sub.dm) || 0) * (parseFloat(sub.wc) || 0) * (parseFloat(sub.wk) || 0));
  const fee = parseFloat(sub.fee) || 0;
  const hasValue = total > 0 && fee > 0;
  if (isTutoring) {
    const hourly = total > 0 ? (fee / total) * 60 : 0;
    return {
      total,
      rateCeil: Math.ceil(hourly),
      hasValue,
      canJudge: standardRate > 0 && hasValue,
      isCompliant: hourly <= standardRate + 0.01,
      standardRate,
      maxAllowedFee: Math.floor((total / 60) * standardRate),
    };
  }
  const rateCeil = total > 0 ? Math.ceil(fee / total) : 0;
  return {
    total,
    rateCeil,
    hasValue,
    canJudge: standardRate > 0 && hasValue,
    isCompliant: rateCeil <= standardRate,
    standardRate,
    maxAllowedFee: Math.floor(standardRate * total),
  };
}

export default function RegistrationSheet({ mode = 'academy', info, onInfoChange, regType, regTypeOptions = [], onRegTypeChange, subjects, onSubjectsChange, discount = '', onDiscountChange, extraFees = [], onExtraFeesChange, onPrint }) {
  const isTutoring = mode === 'tutoring';
  const setInfo = (key, value) => onInfoChange({ ...info, [key]: value });
  const { region, officeName, rows: rateRows, tutoringHourlyRate, ratesReady } = useRegion();

  // 지역을 바꾸거나 주무관이 줄을 고치면: 없어진 교습과정은 같은 이름 → 이름 추정 순으로 다시 맞추고, 못 찾으면 비움
  // (기준이 아직 없는 지역으로 바꿨을 때는 지우지 않음 → 다시 돌아오면 그대로)
  useEffect(() => {
    if (isTutoring || !rateRows.length) return;
    let changed = false;
    const next = subjects.map(s => {
      if (s.rateId === '' && !s.processLabel) return s;
      const row = rateRows.find(r => r.id === s.rateId)
        || rateRows.find(r => rowLabel(r) === s.processLabel)
        || rateRows.find(r => r.id === guessRateId(`${s.processLabel} ${s.subjectName}`, rateRows));
      const fields = row ? { rateId: row.id, processLabel: rowLabel(row) } : { rateId: '', processLabel: '' };
      if (fields.rateId === s.rateId && fields.processLabel === s.processLabel) return s;
      changed = true;
      return { ...s, ...fields };
    });
    if (changed) onSubjectsChange(next);
  }, [rateRows, subjects, isTutoring, onSubjectsChange]);

  const standardRateOf = (sub) => (isTutoring ? tutoringHourlyRate : rateRows.find(r => r.id === sub.rateId)?.rate || 0);
  const regionReady = isTutoring ? tutoringHourlyRate > 0 : ratesReady;

  function updateSub(id, patch) {
    const first = subjects[0];
    const isFirst = first?.id === id;
    onSubjectsChange(subjects.map(s => {
      if (s.id === id) return { ...s, ...patch };
      if (!isFirst) return s;
      // 첫 줄의 교습과정·정원 → 비어 있거나 첫 줄과 같던 아래 줄에 같은 값
      const follow = {};
      for (const key of FOLLOW_FIRST_ROW_KEYS) {
        if (key in patch && (s[key] === '' || s[key] === first[key])) follow[key] = patch[key];
      }
      return { ...s, ...follow };
    }));
  }
  const removeSub = (id) => onSubjectsChange(subjects.length === 1 ? padSheetSubjects([]).slice(0, 1) : subjects.filter(s => s.id !== id));
  const addFiveRows = () => {
    const first = subjects[0];
    const last = subjects[subjects.length - 1];
    const added = Array.from({ length: SHEET_ROWS_STEP }, () => newSheetSubject({
      rateId: first?.rateId ?? '',
      processLabel: first?.processLabel ?? '',
      capacity: first?.capacity ?? '',
      wk: last?.wk || '4.3',
      period: last?.period || DEFAULT_PERIOD,
    }));
    onSubjectsChange([...subjects, ...added]);
  };

  const showExtra = !isTutoring && !!onExtraFeesChange;
  const updateExtra = (id, patch) => onExtraFeesChange(extraFees.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeExtra = (id) => onExtraFeesChange(padExtraFees(extraFees.filter(r => r.id !== id)));
  const addExtra = () => onExtraFeesChange([...extraFees, newExtraFee()]);
  // 기타경비 교습과목(반) 칸에서 고를 수 있게 위 표에 적은 과목 이름을 모아 둠
  const subjectNames = [...new Set(subjects.map(s => String(s.subjectName || '').trim()).filter(Boolean))];

  return (
    <div className="reg-sheet-wrap">
      <div className="reg-sheet-guide">
        <span className="reg-sheet-guide-swatch" /> <b>노란 칸</b>에 적어 넣으세요. {isTutoring ? <><b>시간당단가</b>는 자동으로 계산됩니다. 다 적으면 맨 아래 <b>신고서 출력</b>을 누르세요.</> : <>다 적으면 맨 아래 <b>등록신청서 출력</b>을 누르세요.</>}
      </div>

      {!region ? (
        <div className="reg-region-notice">📍 화면 맨 위에서 <b>지역(교육지원청)</b>을 먼저 선택하세요. 선택한 지역의 기준으로 적합 여부를 판정합니다.</div>
      ) : !regionReady && (
        <div className="reg-region-notice">⚠️ <b>{officeName}</b>은(는) 아직 {isTutoring ? '개인과외 시간당 기준이' : '기준단가가'} 입력되지 않아 적합 여부를 판정할 수 없습니다. {isTutoring ? '시간당단가' : '분당단가'}만 계산됩니다. 관할 교육지원청에 문의하세요.</div>
      )}

      <div className={`reg-sheet${isTutoring ? ' is-tutoring' : ''}`}>
        <h2 className="reg-sheet-title">{isTutoring ? '개인과외교습자 교습비 신고 내용' : '학원(교습소) 교습비등 등록신청서'}</h2>

        {/* 상단 정보 */}
        {isTutoring ? (
        <table className="reg-info">
          <tbody>
            <tr>
              <th>교습자 성명</th>
              <td><input className="reg-input" value={info.operator} onChange={e => setInfo('operator', e.target.value)} placeholder="예) 홍길동" /></td>
              <th>신고번호</th>
              <td><input className="reg-input" value={info.regNumber} onChange={e => setInfo('regNumber', e.target.value)} placeholder="예) 제 하남-000호" /></td>
            </tr>
            <tr>
              <th>교습장소</th>
              <td><input className="reg-input" value={info.address} onChange={e => setInfo('address', e.target.value)} placeholder="예) 경기도 하남시 ○○로 00" /></td>
              <th>전화번호</th>
              <td><input className="reg-input" inputMode="tel" value={info.phone} onChange={e => setInfo('phone', e.target.value)} placeholder="예) 010-0000-0000" /></td>
            </tr>
          </tbody>
        </table>
        ) : (
        <table className="reg-info">
          <tbody>
            <tr>
              <th>학원(교습소)명</th>
              <td><input className="reg-input" value={info.academyName} onChange={e => setInfo('academyName', e.target.value)} placeholder="예) 하남미술학원" /></td>
              <th>운영자</th>
              <td><input className="reg-input" value={info.operator} onChange={e => setInfo('operator', e.target.value)} placeholder="예) 홍길동" /></td>
            </tr>
            <tr>
              <th>등록(신고)번호</th>
              <td><input className="reg-input" value={info.regNumber} onChange={e => setInfo('regNumber', e.target.value)} placeholder="예) 제 하남675호" /></td>
              <th>전화번호</th>
              <td><input className="reg-input" inputMode="tel" value={info.phone} onChange={e => setInfo('phone', e.target.value)} placeholder="예) 031-000-0000" /></td>
            </tr>
            <tr>
              <th>위치</th>
              <td colSpan={3}><input className="reg-input" value={info.address} onChange={e => setInfo('address', e.target.value)} placeholder="예) 경기도 하남시 ○○로 00" /></td>
            </tr>
          </tbody>
        </table>
        )}

        <div className="reg-section-title">{isTutoring ? '교 습 비  (변경)  신 고 내 용' : '교 습 비 등  (변경)  등 록 내 용'}</div>

        {!isTutoring && (
        <div className="reg-regtype">
          <span className="reg-regtype-label">교 습 비</span>
          {REG_TYPES.map(t => {
            const enabled = regTypeOptions.includes(t);
            return (
              <label key={t} className={`reg-check${regType === t ? ' is-checked' : ''}${enabled ? '' : ' is-disabled'}`}>
                <input type="radio" name="reg-sheet-regtype" checked={regType === t} disabled={!enabled} onChange={() => onRegTypeChange?.(t)} />
                <span className="reg-check-box">{regType === t ? '✓' : ''}</span>
                {t}
              </label>
            );
          })}
        </div>
        )}

        {/* 교습비 표 — 한 과목 한 줄 */}
        <table className="reg-subjects">
          <thead>
            <tr>
              {!isTutoring && <th className="col-process">교습<br />과정</th>}
              <th className="col-subject">교습과목<br />(반)</th>
              <th className="col-period">교습<br />기간</th>
              <th className="col-time">총 교습시간(A)<div className="reg-th-sub">일 □분 × 주 □회 × □주 = □분</div></th>
              {!isTutoring && <th className="col-capacity">정원<br />(반별)</th>}
              <th className="col-fee">교습비(B)</th>
              <th className="col-rate">{isTutoring ? <>시간당단가<br />(B÷A×60)</> : <>분당단가<br />(B÷A)</>}</th>
              <th className="col-del" aria-label="삭제" />
            </tr>
          </thead>
          <tbody>
            {subjects.map((sub, idx) => {
              const j = judge(sub, isTutoring, standardRateOf(sub));
              const rowClass = j.canJudge ? (j.isCompliant ? 'is-ok' : 'is-over') : '';
              return (
                <tr key={sub.id} className={rowClass}>
                  {!isTutoring && (
                  <td className="col-process" data-label={`${idx + 1}. 교습과정`}>
                    <select
                      className="reg-input reg-select"
                      value={sub.rateId}
                      onChange={e => updateSub(sub.id, rateFields(rateRows, e.target.value))}
                    >
                      <option value="">선택</option>
                      {rateRows.map(r => (
                        <option key={r.id} value={r.id}>{rowLabel(r)}</option>
                      ))}
                    </select>
                  </td>
                  )}
                  <td className="col-subject" data-label={isTutoring ? `${idx + 1}. 교습과목` : '교습과목(반)'}>
                    <input
                      className="reg-input"
                      title={sub.subjectName}
                      value={sub.subjectName}
                      onChange={e => {
                        const name = e.target.value;
                        const guessed = isTutoring ? '' : guessRateId(name, rateRows);
                        updateSub(sub.id, guessed !== '' ? { subjectName: name, ...rateFields(rateRows, guessed) } : { subjectName: name });
                      }}
                      placeholder="예) 초등수학A"
                    />
                  </td>
                  <td className="col-period" data-label="교습기간">
                    <input className="reg-input reg-input-center" value={sub.period} onChange={e => updateSub(sub.id, { period: e.target.value })} placeholder={DEFAULT_PERIOD} />
                  </td>
                  <td className="col-time" data-label="총 교습시간(A)">
                    <span className="reg-time">
                      <span className="reg-time-part">일 <DropdownSelect options={Array.from({ length: 34 }, (_, i) => String(30 + i * 10))} value={sub.dm} onChange={v => updateSub(sub.id, { dm: v })} unit="분" placeholder="0" inputWidth="52px" /></span>
                      <span className="reg-op">×</span>
                      <span className="reg-time-part">주 <DropdownSelect options={['1', '2', '3', '4', '5', '6', '7']} value={sub.wc} onChange={v => updateSub(sub.id, { wc: v })} unit="회" placeholder="0" inputWidth="40px" /></span>
                      <span className="reg-op">×</span>
                      <span className="reg-time-part"><DropdownSelect options={['4', '4.1', '4.2', '4.3']} value={sub.wk} onChange={v => updateSub(sub.id, { wk: v })} unit="주" placeholder="4.3" inputWidth="46px" /></span>
                      <span className="reg-op">=</span>
                      <span className="reg-time-total"><strong>{j.total > 0 ? j.total.toLocaleString() : '—'}</strong>분</span>
                    </span>
                  </td>
                  {!isTutoring && (
                  <td className="col-capacity" data-label="정원(반별)">
                    <span className="reg-unit-field">
                      <input className="reg-input reg-input-num" inputMode="numeric" value={sub.capacity} onChange={e => updateSub(sub.id, { capacity: e.target.value.replace(/[^0-9]/g, '') })} placeholder="0" />
                      <span className="reg-unit">명</span>
                    </span>
                  </td>
                  )}
                  <td className="col-fee" data-label="교습비(B)">
                    <span className="reg-unit-field">
                      <input
                        className="reg-input reg-input-money"
                        inputMode="numeric"
                        value={sub.fee === '' ? '' : Number(sub.fee).toLocaleString()}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateSub(sub.id, { fee: raw });
                        }}
                        placeholder="0"
                      />
                      <span className="reg-unit">원</span>
                    </span>
                  </td>
                  <td className="col-rate" data-label={isTutoring ? '시간당단가' : '분당단가(B÷A)'}>
                    {j.canJudge ? (
                      <div className="reg-rate">
                        <div className={`reg-rate-value ${j.isCompliant ? 'ok' : 'over'}`}>{j.rateCeil.toLocaleString()}원 {j.isCompliant ? '✓' : '✗'}</div>
                        <div className="reg-rate-std">기준 {j.standardRate.toLocaleString()}원</div>
                        {!j.isCompliant && <div className="reg-rate-max">상한 {j.maxAllowedFee.toLocaleString()}원</div>}
                      </div>
                    ) : j.hasValue ? (
                      <div className="reg-rate">
                        <div className="reg-rate-value">{j.rateCeil.toLocaleString()}원</div>
                        <div className="reg-rate-std">{isTutoring || sub.rateId ? '기준 미입력' : '교습과정 선택'}</div>
                      </div>
                    ) : (
                      <span className="reg-rate-empty">{j.standardRate > 0 ? `기준 ${j.standardRate.toLocaleString()}원` : '자동 계산'}</span>
                    )}
                  </td>
                  <td className="col-del">
                    <button type="button" className="reg-del" onClick={() => removeSub(sub.id)} title="이 과목 지우기">✕<span className="reg-del-text"> 이 과목 지우기</span></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button type="button" className="reg-add" onClick={addFiveRows}>+ 과목 다섯 줄 추가</button>

        {/* 기타 할인사항 — 신청서처럼 제목 옆에 바로 적음 (학원·교습소, 개인과외 공통) */}
        {onDiscountChange && (
          <div className="reg-discount">
            <label className="reg-discount-label" htmlFor="reg-discount-input">기타 할인사항</label>
            <textarea
              id="reg-discount-input"
              className="reg-input reg-textarea"
              rows={2}
              value={discount}
              onChange={e => onDiscountChange?.(e.target.value)}
              placeholder="예) 형제·자매 동시 수강 시 교습비 10% 할인 / 없으면 비워 두세요"
            />
          </div>
        )}

        {showExtra && (
        <>

          <div className="reg-section-title">기 타 경 비</div>

          <table className="reg-subjects reg-extra">
            <thead>
              <tr>
                <th className="col-extra-subject">교습과목(반)</th>
                {OTHER_FEE_ITEMS.map(it => <th key={it.key} className="col-extra-fee">{it.label}</th>)}
                <th className="col-extra-total">계</th>
                <th className="col-del" aria-label="삭제" />
              </tr>
            </thead>
            <tbody>
              {extraFees.map((row, idx) => {
                const total = extraFeeTotal(row);
                return (
                  <tr key={row.id}>
                    <td className="col-extra-subject" data-label={`${idx + 1}. 교습과목(반)`}>
                      <input
                        className="reg-input"
                        list="reg-extra-subject-list"
                        title={row.subjectName}
                        value={row.subjectName}
                        onChange={e => updateExtra(row.id, { subjectName: e.target.value })}
                        placeholder="예) 전과목"
                      />
                    </td>
                    {OTHER_FEE_ITEMS.map(it => (
                      <td key={it.key} className="col-extra-fee" data-label={it.label}>
                        <span className="reg-unit-field">
                          <input
                            className="reg-input reg-input-money"
                            inputMode="numeric"
                            aria-label={`${idx + 1}번째 줄 ${it.label}`}
                            value={row[it.key] === '' ? '' : Number(row[it.key]).toLocaleString()}
                            onChange={e => updateExtra(row.id, { [it.key]: e.target.value.replace(/[^0-9]/g, '') })}
                            placeholder="0"
                          />
                        </span>
                      </td>
                    ))}
                    <td className="col-extra-total" data-label="계">
                      <span className="reg-extra-sum">{total > 0 ? `${total.toLocaleString()}원` : '자동 합계'}</span>
                    </td>
                    <td className="col-del">
                      <button type="button" className="reg-del" onClick={() => removeExtra(row.id)} title="이 줄 지우기">✕<span className="reg-del-text"> 이 줄 지우기</span></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="reg-extra-subject-list">
            {subjectNames.map(n => <option key={n} value={n} />)}
          </datalist>

          <button type="button" className="reg-add" onClick={addExtra}>+ 기타경비 한 줄 추가</button>

          <div className="reg-extra-notice">
            <b>❏ 작성 시 유의사항</b> : 기타경비는 모의고사비·재료비·피복비·급식비·기숙사비·차량비 <b>6개 항목만</b> 인정되며, 실비임을 증명할 수 있는 경우에만 받을 수 있습니다. 받지 않는 항목은 비워 두세요.
          </div>
        </>
        )}
      </div>

      {onPrint && (
      <button type="button" className="reg-print" onClick={onPrint}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        {isTutoring ? '교습비 신고서 출력 (PDF)' : '등록신청서 출력 (PDF)'}
      </button>
      )}
    </div>
  );
}
