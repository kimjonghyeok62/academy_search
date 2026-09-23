import React, { useState, useRef } from 'react';
import { parseExcelTuition } from '../utils/parseExcelTuition';
import { printRegistrationForm, printTutoringForm } from '../utils/generateRegistrationPDF';
import { NeisHakwonCard, ExcelUploadCard, AcademyPickList, hasDraggedFiles } from './NeisExcelSteps';
import RegistrationSheet, { newSheetSubject, padSheetSubjects, rateFields, newExtraFee, padExtraFees } from './RegistrationSheet';
import { guessRateId } from '../utils/regionRates';
import { OTHER_FEE_ITEMS } from '../utils/generateTuitionPDF';
import { useRegion } from '../RegionContext';
import { attachRegNo } from '../utils/googleSheets';
import { downloadTuitionBulkExcel, checkBulkSubjects } from '../utils/generateTuitionBulkExcel';

const EMPTY_INFO = { academyName: '', operator: '', regNumber: '', phone: '', address: '' };

export default function TuitionReviewTab({ mode = 'academy', academies: masterAcademies = [] }) {
  const isTutoring = mode === 'tutoring';
  const { rows: rateRows, officeName } = useRegion();

  // ── 신규/변경 서브탭 ──
  const [subTab, setSubTab] = useState('신규');

  // ── 신규 탭 등록신청서(학원·교습소) / 개인과외 신고 내용 ──
  const [newInfo, setNewInfo] = useState(EMPTY_INFO);
  const [newSheetSubjects, setNewSheetSubjects] = useState(() => padSheetSubjects([]));
  const [newDiscount, setNewDiscount] = useState('');
  const [newExtraFees, setNewExtraFees] = useState(() => padExtraFees([]));

  // ── 변경 탭 상태 ──
  const [changeInfo, setChangeInfo] = useState(EMPTY_INFO);
  const [changeRegType, setChangeRegType] = useState('일부변경');
  const changeFileInputRef = useRef(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeDragOver, setChangeDragOver] = useState(false);
  const [changeAcademies, setChangeAcademies] = useState([]);
  const [changeSelected, setChangeSelected] = useState(null);
  const [changeSubjects, setChangeSubjects] = useState([]);
  const [changeDiscount, setChangeDiscount] = useState('');
  const [changeExtraFees, setChangeExtraFees] = useState(() => padExtraFees([]));

  function parseFeeStr(str) {
    if (!str) return '';
    const n = parseInt(String(str).replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? '' : String(n);
  }


  // 총교습시간(분)에서 dm × wc × wk 역산
  // wk = 4.3 → 4.2 → 4.1 → 4 순으로 시도하여 dm×wc가 정수가 되는 첫 조합 반환
  function reverseCalcTime(totalTimeStr) {
    const total = parseFloat(String(totalTimeStr).replace(/[^0-9.]/g, ''));
    if (isNaN(total) || total <= 0) return { dm: '', wc: '', wk: '4.3' };

    const wkCandidates = [
      { val: 4.3, str: '4.3' },
      { val: 4.2, str: '4.2' },
      { val: 4.1, str: '4.1' },
      { val: 4.0, str: '4' },
    ];
    // wc 시도 순서: 일반적인 횟수(5,4,3,6) 우선
    const wcTryOrder = [5, 4, 3, 6, 2, 7, 1, 8, 10];

    // 패스 0: dm이 5의 배수인 조합 우선 / 패스 1: 임의 정수도 허용
    for (let pass = 0; pass < 2; pass++) {
      for (const { val: wkVal, str: wkStr } of wkCandidates) {
        const weekly = total / wkVal;
        for (const wc of wcTryOrder) {
          const dmFloat = weekly / wc;
          const dmInt = Math.round(dmFloat);
          if (dmInt < 30 || dmInt > 480) continue;
          if (Math.abs(dmFloat - dmInt) > 0.02) continue;
          if (pass === 0 && dmInt % 5 !== 0) continue; // 패스0: 5의 배수만
          // 실제 곱이 total과 0.3% 이내인지 검증
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
      const label = c.subject || c.process;
      const rate = rateFields(rateRows, guessRateId(`${c.process} ${c.subject || ''}`, rateRows));
      const { dm, wc, wk } = reverseCalcTime(c.totalTime);
      // neisRow: 나이스 일괄등록 엑셀에서 온 줄 — 교습비일괄등록 엑셀을 받을 때 등록번호·분류를 그대로 둠
      const neis = c.neisRow ? { neisRow: c.neisRow, neisRateId: rate.rateId, neisTotal: c.totalTime } : {};
      return newSheetSubject({ id: i + 1, subjectName: label || '', ...rate, dm, wc, wk, period: c.period || '1개월', capacity: c.capacity || '', fee: parseFeeStr(c.tuitionFee), ...neis });
    });
    setChangeSubjects(padSheetSubjects(subs));
    // 나이스 엑셀에 적힌 기타경비가 있는 과정만 기타경비 표로 옮김
    const extras = academy.courses
      .filter(c => OTHER_FEE_ITEMS.some(it => parseFeeStr(c[it.key])))
      .map(c => {
        const fees = {};
        for (const it of OTHER_FEE_ITEMS) fees[it.key] = parseFeeStr(c[it.key]);
        return newExtraFee({ subjectName: c.subject || c.process || '', ...fees });
      });
    setChangeExtraFees(padExtraFees(extras));
    setChangeDiscount('');
    setChangeInfo({
      ...EMPTY_INFO,
      academyName: academy.name || '',
      operator: academy.founder?.name || '',
      regNumber: academy.id || '',
      address: academy.address || '',
    });
  }

  // 교습비일괄등록 엑셀 받기 — 교습소는 나이스 양식 열이 하나 더 많아 따로 맞춤
  function downloadBulk({ info, regType, subjects, extraFees, academy }) {
    const problems = checkBulkSubjects(subjects);
    if (problems.length) {
      alert(`아래 줄을 채운 뒤 다시 눌러 주세요.\n\n${problems.join('\n')}`);
      return;
    }
    const name = info.academyName || academy?.name || '';
    const isTeaching = academy?.neisBulk
      ? academy.neisBulk.isTeaching
      : academy?.category === '교습소' || /교습소\s*$/.test(name);
    downloadTuitionBulkExcel({ isTeaching, academyName: name, kind: academy?.category, regType, subjects, extraFees, rateRows });
  }

  async function loadChangeFile(file) {
    if (!file) return;
    setChangeError('');
    setChangeLoading(true);
    setChangeAcademies([]);
    setChangeSelected(null);
    setChangeSubjects([]);
    try {
      // 등록번호는 나이스 엑셀에 없다 — 이미 받아 둔 대장에서 찾아 붙인다
      const result = attachRegNo(await parseExcelTuition(file), masterAcademies);
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
    }
  }

  // 변경 탭 어디에 끌어다 놓아도 업로드 (게시표 출력 탭과 같은 방식)
  const changeDragDepthRef = useRef(0);
  const changeDropHandlers = {
    onDragEnter: e => { if (!hasDraggedFiles(e)) return; e.preventDefault(); changeDragDepthRef.current++; setChangeDragOver(true); },
    onDragOver: e => { if (hasDraggedFiles(e)) e.preventDefault(); },
    onDragLeave: () => { changeDragDepthRef.current = Math.max(0, changeDragDepthRef.current - 1); if (!changeDragDepthRef.current) setChangeDragOver(false); },
    onDrop: e => {
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      changeDragDepthRef.current = 0;
      setChangeDragOver(false);
      loadChangeFile(e.dataTransfer.files?.[0]);
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* 신규 / 변경 서브탭 (학원·교습소만) */}
      {!isTutoring && (
        <div className="seg seg-block" role="group" aria-label="신규·변경">
          {['신규', '변경'].map(t => (
            <button
              key={t}
              type="button"
              className={`seg-btn${subTab === t ? ' is-on' : ''}`}
              aria-pressed={subTab === t}
              onClick={() => setSubTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ── 과외 모드: 신규 탭과 같은 표 서식 ── */}
      {isTutoring && (
        <RegistrationSheet
          mode="tutoring"
          info={newInfo}
          onInfoChange={setNewInfo}
          subjects={newSheetSubjects}
          onSubjectsChange={setNewSheetSubjects}
          discount={newDiscount}
          onDiscountChange={setNewDiscount}
          onPrint={() => printTutoringForm({ ...newInfo, officeName, subjects: newSheetSubjects, discount: newDiscount })}
        />
      )}

      {/* ── 신규 탭: 등록신청서 서식 그대로 입력 ── */}
      {!isTutoring && subTab === '신규' && (
        <RegistrationSheet
          info={newInfo}
          onInfoChange={setNewInfo}
          regType="신규등록"
          regTypeOptions={['신규등록']}
          subjects={newSheetSubjects}
          onSubjectsChange={setNewSheetSubjects}
          discount={newDiscount}
          onDiscountChange={setNewDiscount}
          extraFees={newExtraFees}
          onExtraFeesChange={setNewExtraFees}
          onPrint={() => printRegistrationForm({ ...newInfo, officeName, regType: '신규등록', subjects: newSheetSubjects, discount: newDiscount, extraFees: newExtraFees })}
          onBulkExcel={() => downloadBulk({ info: newInfo, regType: '신규등록', subjects: newSheetSubjects, extraFees: newExtraFees })}
        />
      )}

      {/* ── 변경 탭 — 게시표 출력 탭과 같은 ①②단계 카드 ── */}
      {!isTutoring && subTab === '변경' && (
        <div {...changeDropHandlers} style={{ display: 'flex', flexDirection: 'column' }}>

          {!changeSelected && (
            <>
              <div style={{ fontSize: '1.0625rem', fontWeight: '600', color: 'var(--text-main)', lineHeight: 1.5, marginBottom: '14px' }}>
                나이스 학원에 등록된 교습비를 불러와서 바꿀 부분만 수정합니다.
              </div>
              <NeisHakwonCard />
              <ExcelUploadCard loading={changeLoading} dragOver={changeDragOver} fileInputRef={changeFileInputRef} onFile={loadChangeFile} />
            </>
          )}

          {changeError && (
            <div className="alert is-error" style={{ marginBottom: '16px' }}>{changeError}</div>
          )}

          {/* 복수 학원 선택 */}
          {changeAcademies.length > 1 && !changeSelected && (
            <AcademyPickList academies={changeAcademies} onSelect={selectChangeAcademy} label="변경할" />
          )}

          {/* 선택된 학원 — 등록신청서 서식 그대로 수정 */}
          {changeSelected && (
            <div className="animate-enter" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-main)', wordBreak: 'keep-all' }}>
                  나이스 엑셀에서 <b>{changeSelected.name}</b>의 교습과정 {changeSubjects.length}개를 불러왔습니다. 바꿀 칸만 고치세요.
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setChangeSelected(null); setChangeSubjects([]); setChangeAcademies([]); }}
                  style={{ flexShrink: 0 }}
                >
                  ← 다른 파일·학원 선택
                </button>
              </div>
              <RegistrationSheet
                info={changeInfo}
                onInfoChange={setChangeInfo}
                regType={changeRegType}
                regTypeOptions={['일부변경', '전체변경']}
                onRegTypeChange={setChangeRegType}
                subjects={changeSubjects}
                onSubjectsChange={setChangeSubjects}
                discount={changeDiscount}
                onDiscountChange={setChangeDiscount}
                extraFees={changeExtraFees}
                onExtraFeesChange={setChangeExtraFees}
                onPrint={() => printRegistrationForm({ ...changeInfo, officeName, regType: changeRegType, subjects: changeSubjects, discount: changeDiscount, extraFees: changeExtraFees })}
                onBulkExcel={() => downloadBulk({ info: changeInfo, regType: changeRegType, subjects: changeSubjects, extraFees: changeExtraFees, academy: changeSelected })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
