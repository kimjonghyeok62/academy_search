import React, { useState, useRef } from 'react';
import { printTuitionForm, printTuitionFormExternal } from '../utils/generateTuitionPDF';

const PROMPT = `이 이미지는 학원(교습소) 교습비등 등록신청서입니다.
경기 광주하남 교육지원청의 분당기준단가(이 단가를 초과할 수 없음):
- 보습 — 단과(초등): 210원
- 보습 — 단과(중등): 222원
- 보습 — 단과(고등): 234원
- 진학상담, 지도: 234원
- 어학 (실용외국어 포함): 259원
- 음악 — 유,초,중,고: 224원
- 음악 — 입시: 336원
- 미술 — 유,초,중,고: 212원
- 미술 — 입시: 255원
- 무용 — 유,초,중,고: 212원
- 무용 — 입시: 255원
- 정보 — 일반: 230원
- 기타 — 일반: 230원

이미지에서 교습비 테이블의 각 행을 추출하고 분당단가 기준 초과 여부를 분석해주세요.

각 항목 추출 방법:
- subject: 이미지의 "교습과목(반)" 열에 기재된 내용을 그대로 읽으세요 (예: 초등A, 초등B, 중등, 수학(초등) 등). 반드시 각 행마다 개별 과목명을 읽어야 합니다.
- dailyMinutes: 총교습시간 항목에서 "일 N분" 또는 "N분×" 형태의 숫자 N
- weeklyCount: 총교습시간 항목에서 "주N회" 또는 "×N회" 형태의 숫자 N
- ocrTotalMinutes: 이미지에 "=N분" 형태로 기재된 총 분수를 그대로 읽으세요. 없으면 null.
- weeks: 총교습시간 항목에서 "×N주" 형태의 숫자 N을 읽으세요. 중요: 손으로 수정된 경우(예: 4.3 위에 4를 덮어쓴 경우) 수정된 최종 값을 사용하세요. weeks 값이 불확실하고 ocrTotalMinutes를 읽었다면, weeks = ocrTotalMinutes ÷ (dailyMinutes × weeklyCount) 로 역산하세요. 역산 결과가 4에 가까우면 4, 4.3에 가까우면 4.3을 사용하세요. 모두 불확실하면 4.3을 사용하세요.

분당단가 계산: 교습비(원) ÷ 총교습시간(분) = 실제 분당단가
기준 초과 여부: 실제 분당단가 > 기준단가이면 isCompliant: false

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "academyName": "학원명 (없으면 빈 문자열)",
  "founderName": "설립운영자명 (없으면 빈 문자열)",
  "courses": [
    {
      "process": "교습과정 (예: 보습)",
      "subject": "이미지에서 읽은 교습과목(반) 그대로 (예: 수학(초등))",
      "period": "교습기간 (예: 1개월)",
      "dailyMinutes": 90,
      "weeklyCount": 3,
      "weeks": 4.3,
      "ocrTotalMinutes": 1161,
      "tuitionFee": 170000,
      "reportedRate": 146,
      "standardRate": 210,
      "standardLabel": "보습 — 단과(초등)",
      "isCompliant": true,
      "calculatedRate": 146.4
    }
  ]
}`;

const _raw = import.meta.env.VITE_CLAUDE_API_KEY || '';
const ENV_API_KEY = _raw.startsWith('sk-ant') ? _raw : '';

export default function TuitionReviewTab() {
  const [apiKey, setApiKey] = useState('');
  const [image, setImage] = useState(null);
  const effectiveKey = ENV_API_KEY || apiKey;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState(null);
  const [academyInfo, setAcademyInfo] = useState({ name: '', founderName: '' });
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  function updateCourse(index, field, value) {
    if (typeof field === 'object') {
      setCourses(prev => prev.map((c, i) => i === index ? { ...c, ...field } : c));
    } else {
      setCourses(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
    }
  }

  async function handleImageFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setImage({ url, base64, mediaType: file.type || 'image/jpeg' });
    setCourses(null);
    setError('');
  }

  async function analyze() {
    if (!image) return;
    if (!effectiveKey.trim()) { setError('Claude API 키를 입력해주세요.'); return; }
    setLoading(true);
    setError('');
    setCourses(null);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
            { type: 'text', text: PROMPT }
          ]}]
        })
      });
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw new Error(e.error?.message || `API 오류 (${response.status})`);
      }
      const data = await response.json();
      const text = data.content[0]?.text?.trim() || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('응답에서 JSON을 찾을 수 없습니다.');
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed.courses)) throw new Error('응답 형식이 올바르지 않습니다.');
      setCourses(parsed.courses.map(c => ({ ...c })));
      setAcademyInfo({ name: parsed.academyName || '', founderName: parsed.founderName || '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const uploadBoxStyle = {
    flex: 1, border: '2px dashed var(--border-color)', borderRadius: '12px',
    padding: '20px 12px', textAlign: 'center', cursor: 'pointer',
    backgroundColor: 'var(--bg-card)', transition: 'border-color 0.2s',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px'
  };

  return (
    <div>
      {!ENV_API_KEY && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>Claude API 키</label>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-..."
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            autoComplete="off" />
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '4px' }}>입력한 키는 저장되지 않으며, 페이지를 벗어나면 사라집니다.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <div style={uploadBoxStyle} onClick={() => fileInputRef.current?.click()}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>사진 업로드</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>jpg, png 등</div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={e => handleImageFile(e.target.files?.[0])} style={{ display: 'none' }} />
        </div>
        <div style={uploadBoxStyle} onClick={() => cameraInputRef.current?.click()}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>
          </svg>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>카메라 촬영</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>모바일 권장</div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={e => handleImageFile(e.target.files?.[0])} style={{ display: 'none' }} />
        </div>
      </div>

      {image && (
        <div style={{ marginBottom: '14px', position: 'relative' }}>
          <img src={image.url} alt="신청서 미리보기"
            style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)', maxHeight: '280px', objectFit: 'contain', background: '#f8fafc' }} />
          <button onClick={() => { setImage(null); setCourses(null); setError(''); }}
            style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '14px', padding: 0, boxShadow: 'none' }}>×</button>
        </div>
      )}

      {image && (
        <button onClick={analyze} disabled={loading}
          style={{ width: '100%', padding: '12px', marginBottom: '16px', backgroundColor: loading ? '#94a3b8' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {loading ? (<><SpinIcon />OCR 분석 중...</>) : '교습비 검토 분석'}
        </button>
      )}

      {!courses && !image && (
        <>
          <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '20px 0 24px' }} />
          <QuickCalcCard />
        </>
      )}

      {error && (
        <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '16px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>{error}</div>
      )}

      {courses && <ReviewResults courses={courses} onUpdate={updateCourse} academyInfo={academyInfo} />}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── 결과 목록 ───────────────────────────────────────────────
// OCR 과목 데이터 → academy 객체 변환 (printTuitionForm 포맷)
function buildAcademy(courses, academyInfo) {
  return {
    name: academyInfo.name || '(학원명)',
    founder: { name: academyInfo.founderName || '' },
    changeDate: '',
    courses: courses.map(c => {
      const dm = parseFloat(c.dailyMinutes) || 0;
      const wc = parseFloat(c.weeklyCount) || 0;
      const wk = parseFloat(c.weeks) || 0;
      const totalTime = Math.round(dm * wc * wk);
      return {
        process: [c.process, c.subject].filter(Boolean).join(' / '),
        subject: '',
        period: c.period || '',
        totalTime,
        tuitionFee: parseFloat(c.tuitionFee) || 0,
        weeklyScheduleStr: `주${wc}회, 회당${dm}분`,
        mockExamFee: 0, materialFee: 0, clothingFee: 0,
        mealFee: 0, dormitoryFee: 0, vehicleFee: 0
      };
    })
  };
}

function ReviewResults({ courses, onUpdate, academyInfo }) {
  const computed = courses.map(c => calcCourse(c));
  const nonCompliantCount = computed.filter(c => !c.isCompliant).length;

  function handlePrintInternal() {
    printTuitionForm(buildAcademy(courses, academyInfo));
  }
  function handlePrintExternal() {
    printTuitionFormExternal(buildAcademy(courses, academyInfo));
  }

  return (
    <div className="animate-enter">
      <div style={{
        padding: '14px 16px', borderRadius: '12px', marginBottom: '20px',
        backgroundColor: nonCompliantCount ? '#fef2f2' : '#f0fdf4',
        border: `1px solid ${nonCompliantCount ? '#fecaca' : '#bbf7d0'}`,
        display: 'flex', alignItems: 'center', gap: '12px'
      }}>
        <span style={{ fontSize: '1.8rem' }}>{nonCompliantCount ? '⚠️' : '✅'}</span>
        <div>
          <div style={{ fontWeight: '700', fontSize: '1rem', color: nonCompliantCount ? '#dc2626' : '#16a34a' }}>
            {nonCompliantCount ? `${nonCompliantCount}개 과목 기준 초과` : '모든 과목 기준 적합'}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            총 {courses.length}개 과목 · 적합 {courses.length - nonCompliantCount}개 · 위반 {nonCompliantCount}개
          </div>
        </div>
      </div>

      {courses.map((course, i) => (
        <CourseResult key={i} course={course} index={i + 1} onUpdate={(field, val) => onUpdate(i, field, val)} />
      ))}

      {/* 출력 버튼 */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={handlePrintInternal}
          style={{
            flex: 1, minWidth: '140px', padding: '13px 10px',
            backgroundColor: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: '10px', fontSize: '0.88rem', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <PrintIcon />
          <span className="btn-label-full">교습비등 게시표 (내부용)</span>
          <span className="btn-label-short">내부용</span>
        </button>
        <button
          onClick={handlePrintExternal}
          style={{
            flex: 1, minWidth: '140px', padding: '13px 10px',
            backgroundColor: 'var(--bg-card)', color: 'var(--primary)',
            border: '2px solid var(--primary)', borderRadius: '10px', fontSize: '0.88rem', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <PrintIcon stroke="var(--primary)" />
          <span className="btn-label-full">교습비등 게시표 (외부용)</span>
          <span className="btn-label-short">외부용</span>
        </button>
      </div>
    </div>
  );
}

// 과목 하나의 파생 계산값
function calcCourse(c) {
  const dm = parseFloat(c.dailyMinutes) || 0;
  const wc = parseFloat(c.weeklyCount) || 0;
  const wk = parseFloat(c.weeks) || 0;
  const totalMinutes = Math.round(dm * wc * wk);
  const fee = parseFloat(c.tuitionFee) || 0;
  const calculatedRate = totalMinutes > 0 ? fee / totalMinutes : 0;
  const isCompliant = calculatedRate <= (c.standardRate || 0);
  return { totalMinutes, fee, calculatedRate, isCompliant };
}

// ─── 과목 카드 ────────────────────────────────────────────────
function CourseResult({ course, index, onUpdate }) {
  const { totalMinutes, fee, calculatedRate, isCompliant } = calcCourse(course);
  const rateRounded = Math.round(calculatedRate * 10) / 10;
  const selectedOpt =
    STANDARD_RATE_OPTIONS.find(o => o.label === course.standardLabel) ||
    STANDARD_RATE_OPTIONS.find(o => o.rate === course.standardRate) ||
    STANDARD_RATE_OPTIONS[0];

  let recDailyMinutes = null, recTotalMinutes = null, recMaxFee = null;
  if (!isCompliant && fee && course.standardRate && totalMinutes && course.weeklyCount && course.weeks) {
    recTotalMinutes = Math.ceil(fee / course.standardRate);
    recDailyMinutes = Math.ceil(recTotalMinutes / (parseFloat(course.weeklyCount) * parseFloat(course.weeks)));
    recMaxFee = Math.floor(course.standardRate * totalMinutes);
  }

  // 인라인 숫자 입력 스타일
  const numInput = (field, value, width = '52px') => (
    <input
      type="number"
      value={value}
      onChange={e => onUpdate(field, e.target.value)}
      style={{
        width, textAlign: 'center', padding: '1px 4px',
        border: 'none', borderBottom: '2px solid var(--primary)',
        borderRadius: 0, background: 'transparent',
        fontSize: '0.9rem', fontWeight: '700', color: 'var(--primary)',
        outline: 'none', fontFamily: 'inherit', MozAppearance: 'textfield'
      }}
    />
  );

  // 교습비 입력 (천원단위 콤마)
  const feeInput = (
    <input
      type="text"
      inputMode="numeric"
      value={course.tuitionFee === '' || course.tuitionFee == null ? '' : Number(course.tuitionFee).toLocaleString()}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '');
        if (raw === '' || /^\d+$/.test(raw)) onUpdate('tuitionFee', raw);
      }}
      style={{
        width: '110px', textAlign: 'right', padding: '1px 4px',
        border: 'none', borderBottom: '2px solid var(--primary)',
        borderRadius: 0, background: 'transparent',
        fontSize: '0.9rem', fontWeight: '700', color: 'var(--primary)',
        outline: 'none', fontFamily: 'inherit'
      }}
    />
  );

  const sectionLabel = (text, color = 'var(--text-muted)') => (
    <div style={{ fontSize: '0.73rem', fontWeight: '700', color, letterSpacing: '0.06em', marginBottom: '6px' }}>{text}</div>
  );

  return (
    <div style={{ marginBottom: '20px', borderRadius: '14px', overflow: 'hidden', border: `2px solid ${isCompliant ? '#bbf7d0' : '#fca5a5'}`, boxShadow: 'var(--shadow-sm)' }}>

      {/* 헤더 */}
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isCompliant ? '#f0fdf4' : '#fff1f2', borderBottom: `1px solid ${isCompliant ? '#bbf7d0' : '#fca5a5'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, backgroundColor: isCompliant ? '#16a34a' : '#dc2626', color: '#fff', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{index}</span>
          <div>
            <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)' }}>{course.process} — {course.subject}</span>
            {course.period && <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: '8px' }}>({course.period})</span>}
          </div>
        </div>
        <span style={{ fontWeight: '700', fontSize: '0.85rem', padding: '4px 12px', borderRadius: '20px', backgroundColor: isCompliant ? '#16a34a' : '#dc2626', color: '#fff', flexShrink: 0 }}>
          {isCompliant ? '✅ 적합' : '❌ 부적합'}
        </span>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* OCR 추출 데이터 — 편집 가능 */}
        <div>
          {sectionLabel('OCR 추출 데이터 (수정 가능)')}
          <div style={{ fontSize: '0.9rem', lineHeight: '2.2', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#f0f4ff', border: '1px solid #c7d2fe', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px' }}>
              <span>총 교습시간(A): 일</span>
              {numInput('dailyMinutes', course.dailyMinutes, '52px')}
              <span>분 × 주</span>
              {numInput('weeklyCount', course.weeklyCount, '40px')}
              <span>회 ×</span>
              {numInput('weeks', course.weeks, '48px')}
              <span>주 =</span>
              <strong style={{ color: '#1e40af', marginLeft: '4px' }}>{totalMinutes.toLocaleString()}분</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>(자동계산)</span>
              {course.ocrTotalMinutes != null && (() => {
                const ocr = Math.round(parseFloat(course.ocrTotalMinutes));
                const diff = Math.abs(ocr - totalMinutes) > 1;
                return (
                  <span style={{ marginLeft: '8px', fontSize: '0.78rem', padding: '1px 7px', borderRadius: '10px', backgroundColor: diff ? '#fef9c3' : '#dcfce7', color: diff ? '#854d0e' : '#166534', border: `1px solid ${diff ? '#fde68a' : '#bbf7d0'}`, fontWeight: '600' }}>
                    OCR기재: {ocr.toLocaleString()}분{diff ? ' ⚠' : ' ✓'}
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span>교습비(B):</span>
              {feeInput}
              <span>원</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span>분당단가(B÷A):</span>
              <strong style={{ color: isCompliant ? '#16a34a' : '#dc2626' }}>{rateRounded}원</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(자동계산)</span>
              {course.reportedRate != null && (() => {
                const ocr = Math.round(parseFloat(course.reportedRate) * 10) / 10;
                const diff = Math.abs(ocr - rateRounded) >= 1;
                return (
                  <span style={{ marginLeft: '8px', fontSize: '0.78rem', padding: '1px 7px', borderRadius: '10px', backgroundColor: diff ? '#fef9c3' : '#dcfce7', color: diff ? '#854d0e' : '#166534', border: `1px solid ${diff ? '#fde68a' : '#bbf7d0'}`, fontWeight: '600' }}>
                    OCR기재: {ocr}원{diff ? ' ⚠' : ' ✓'}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* 검토 결과 */}
        <div>
          {sectionLabel('검토 결과', isCompliant ? '#166534' : '#991b1b')}
          <div style={{ fontSize: '0.9rem', lineHeight: '1.9', padding: '10px 14px', borderRadius: '8px', backgroundColor: isCompliant ? '#f0fdf4' : '#fff5f5', border: `1px solid ${isCompliant ? '#bbf7d0' : '#fca5a5'}`, color: 'var(--text-main)' }}>
            <div>
              실제 계산: {fee.toLocaleString()} ÷ {totalMinutes.toLocaleString()} = <strong>{rateRounded}원/분</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span>기준 단가: <strong>{selectedOpt.rate}원/분</strong></span>
              <select
                value={selectedOpt.label}
                onChange={e => {
                  const opt = STANDARD_RATE_OPTIONS.find(o => o.label === e.target.value);
                  if (opt) onUpdate({ standardRate: opt.rate, standardLabel: opt.label });
                }}
                style={{
                  fontSize: '0.82rem', padding: '2px 8px', borderRadius: '6px',
                  border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit'
                }}
              >
                {STANDARD_RATE_OPTIONS.map(o => (
                  <option key={o.label} value={o.label}>{o.label} ({o.rate}원/분)</option>
                ))}
              </select>
            </div>
            <div style={{ fontWeight: '700', fontSize: '0.95rem', color: isCompliant ? '#16a34a' : '#dc2626', marginTop: '2px' }}>
              {rateRounded}원 {isCompliant ? '≤' : '>'} {course.standardRate}원 → {isCompliant ? '✅ 적합' : '❌ 기준 초과'}
            </div>
          </div>
        </div>

        {/* 조정 방안 — 부적합일 때만 */}
        {!isCompliant && recDailyMinutes !== null && (
          <div>
            {sectionLabel('조정 방안', '#92400e')}
            <div style={{ backgroundColor: '#fff7ed', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '0.9rem', lineHeight: '1.9', color: '#78350f' }}>
              <div>• 교습비 <strong>{fee.toLocaleString()}원</strong> 유지 시</div>
              <div style={{ paddingLeft: '14px', color: '#92400e' }}>
                → 일 교습시간 <strong>{recDailyMinutes}분 이상</strong>으로 조정 필요
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>(총 {recTotalMinutes?.toLocaleString()}분)</span>
              </div>
              <div style={{ marginTop: '4px' }}>• 교습시간 <strong>{totalMinutes.toLocaleString()}분</strong> 유지 시</div>
              <div style={{ paddingLeft: '14px', color: '#92400e' }}>
                → 교습비 <strong>{recMaxFee?.toLocaleString()}원 이하</strong>로 조정 필요
              </div>
            </div>
          </div>
        )}
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

// ─── 프리셋 선택 + 직접입력 전환 컴포넌트 ─────────────────────
function PresetPicker({ value, onChange, presets, width = '60px' }) {
  const [custom, setCustom] = useState(false);
  const SENTINEL = '__custom__';

  const baseStyle = {
    width, textAlign: 'center', padding: '2px 2px',
    border: 'none', borderBottom: '2px solid var(--primary)', borderRadius: 0,
    background: 'transparent', fontSize: '0.92rem', fontWeight: '700',
    color: 'var(--primary)', outline: 'none', fontFamily: 'inherit',
  };

  if (custom) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          autoFocus style={baseStyle} />
        <button onClick={() => { setCustom(false); onChange(''); }}
          style={{ padding: '0 3px', fontSize: '0.9rem', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1 }}>↩</button>
      </span>
    );
  }

  return (
    <select
      value={value === '' || value == null ? '' : String(value)}
      onChange={e => {
        if (e.target.value === SENTINEL) { setCustom(true); onChange(''); }
        else onChange(e.target.value);
      }}
      style={{ ...baseStyle, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
    >
      <option value="" disabled>선택</option>
      {presets.map(p => <option key={p} value={String(p)}>{p}</option>)}
      <option value={SENTINEL}>직접입력</option>
    </select>
  );
}

function QuickCalcCard() {
  const [dm, setDm] = useState('');
  const [wc, setWc] = useState('');
  const [wk, setWk] = useState('4.3');
  const [fee, setFee] = useState('');
  const [rateIdx, setRateIdx] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [records, setRecords] = useState([]);

  function reset() {
    setDm(''); setWc(''); setWk('4.3'); setFee(''); setRateIdx(0);
    setResetKey(k => k + 1);
  }

  function saveRecord() {
    if (!canJudge) return;
    setRecords(prev => [...prev, {
      no: prev.length + 1,
      label: STANDARD_RATE_OPTIONS[rateIdx].label,
      standardRate: STANDARD_RATE_OPTIONS[rateIdx].rate,
      dm: parseFloat(dm) || 0,
      wc: parseFloat(wc) || 0,
      wk: wkVal,
      totalMinutes,
      fee: parseFloat(fee) || 0,
      rate: calcRateRounded,
      rateDisplay: calcRateDisplay,
      isCompliant,
    }]);
    reset();
  }

  function deleteRecord(no) {
    setRecords(prev => prev.filter(r => r.no !== no));
  }

  const wkVal = parseFloat(wk) || 0;
  const totalMinutes = Math.round((parseFloat(dm)||0) * (parseFloat(wc)||0) * wkVal);
  const calcRate = totalMinutes > 0 ? (parseFloat(fee)||0) / totalMinutes : 0;
  const calcRateRounded = Math.round(calcRate * 10) / 10;
  const calcRateDisplay = calcRateRounded.toLocaleString('ko-KR');
  const standardRate = STANDARD_RATE_OPTIONS[rateIdx].rate;
  const standardLabel = STANDARD_RATE_OPTIONS[rateIdx].label;
  const canJudge = totalMinutes > 0 && (parseFloat(fee) || 0) > 0;
  const isCompliant = calcRate <= standardRate;

  let recDailyMin = null, recTotalMin = null, recMaxFee = null;
  if (canJudge && !isCompliant) {
    recTotalMin = Math.ceil((parseFloat(fee)||0) / standardRate);
    recDailyMin = Math.ceil(recTotalMin / ((parseFloat(wc)||1) * (wkVal||1)));
    recMaxFee = Math.floor(standardRate * totalMinutes);
  }

  const borderColor = !canJudge ? 'var(--border-color)' : isCompliant ? '#bbf7d0' : '#fca5a5';
  const bgColor     = !canJudge ? 'var(--bg-card)'     : isCompliant ? '#f0fdf4' : '#fff1f2';
  const badgeBg     = !canJudge ? '#94a3b8'            : isCompliant ? '#16a34a' : '#dc2626';

  const sectionLabel = (text, color = 'var(--text-muted)', barColor = 'var(--text-muted)') => (
    <div style={{ fontSize: '0.95rem', fontWeight: '700', color, letterSpacing: '0.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ display: 'inline-block', width: '3px', height: '14px', borderRadius: '2px', backgroundColor: barColor, flexShrink: 0 }} />
      {text}
    </div>
  );

  return (
    <div className="tuition-card" style={{ borderRadius: '14px', overflow: 'hidden', border: `2px solid ${borderColor}`, boxShadow: 'var(--shadow-sm)' }}>

      {/* 헤더 */}
      <div style={{ padding: '12px 14px', backgroundColor: bgColor, borderBottom: `1px solid ${borderColor}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>분야별 교습비 검토</span>
          <span style={{ fontWeight: '700', fontSize: '1rem', padding: '4px 12px', borderRadius: '20px', backgroundColor: badgeBg, color: '#fff', whiteSpace: 'nowrap', marginLeft: '8px' }}>
            {!canJudge ? '입력중' : isCompliant ? '✅ 적합' : '❌ 부적합'}
          </span>
        </div>
      </div>

      <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* 교습 분야 선택 */}
        <div>
          {sectionLabel('교습 분야 선택', 'var(--primary)', 'var(--primary)')}
          <select value={rateIdx} onChange={e => setRateIdx(Number(e.target.value))}
            style={{ width: '100%', padding: '10px 12px', border: '2.5px solid var(--primary)', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', background: '#eff6ff', color: 'var(--primary)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 0 0 3px rgba(79,70,229,0.08)' }}>
            {STANDARD_RATE_OPTIONS.map((o, i) => (
              <option key={i} value={i}>{o.label} ({o.rate}원/분)</option>
            ))}
          </select>
        </div>

        {/* 입력값 */}
        <div>
          {sectionLabel('입력값 (수정 가능)')}
          <div style={{ fontSize: '0.97rem', lineHeight: '2.3', padding: '12px 14px', borderRadius: '8px', backgroundColor: '#f0f4ff', border: '1px solid #c7d2fe', color: 'var(--text-main)' }}>

            {/* A: 교습시간 */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px' }}>
              <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <strong style={{ color: 'var(--primary)' }}>A(분)</strong>
                <span> : 일</span>
                <PresetPicker key={`dm-${resetKey}`} value={dm} onChange={setDm} presets={[50, 60, 80, 90, 120]} width="46px" />
                <span>분</span>
              </span>
              <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span>×</span>
                <span>주</span>
                <PresetPicker key={`wc-${resetKey}`} value={wc} onChange={setWc} presets={[1, 2, 3, 4, 5]} width="34px" />
                <span>회</span>
              </span>
              <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span>×</span>
                <PresetPicker key={`wk-${resetKey}`} value={wk} onChange={setWk} presets={[4, 4.2, 4.3]} width="46px" />
                <span>주</span>
              </span>
              <span className="time-break" />
              <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '2px' }}>
                <span>=</span>
                <strong style={{ color: '#1e40af' }}>{totalMinutes.toLocaleString()}분</strong>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>(자동계산)</span>
              </span>
            </div>

            {/* B: 교습비 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--primary)' }}>B(교습비)</strong>
              <span> : </span>
              <input type="text" inputMode="numeric"
                value={fee === '' ? '' : Number(fee).toLocaleString()}
                onChange={e => {
                  const raw = e.target.value.replace(/,/g, '');
                  if (raw === '' || /^\d+$/.test(raw)) setFee(raw);
                }}
                style={{ width: '130px', textAlign: 'right', padding: '2px 4px', border: 'none', borderBottom: '2px solid var(--primary)', borderRadius: 0, background: 'transparent', fontSize: '1.05rem', fontWeight: '700', color: 'var(--primary)', outline: 'none', fontFamily: 'inherit' }}
              />
              <span>원</span>
            </div>

            {/* 분당단가 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span>분당단가 (B÷A):</span>
              <strong style={{ color: !canJudge ? 'var(--text-muted)' : isCompliant ? '#16a34a' : '#dc2626', fontSize: '1.1rem' }}>
                {calcRateDisplay}원
              </strong>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>(자동계산)</span>
            </div>
          </div>

          {/* 기록저장 버튼 */}
          <button
            onClick={saveRecord}
            disabled={!canJudge}
            style={{ marginTop: '10px', width: '100%', padding: '11px', backgroundColor: canJudge ? 'var(--primary)' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: canJudge ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            📋 기록저장 (저장 후 초기화)
          </button>
        </div>

        {/* 검토 결과 */}
        <div>
          {sectionLabel('검토 결과',
            !canJudge ? 'var(--text-muted)' : isCompliant ? '#166534' : '#991b1b',
            !canJudge ? 'var(--text-muted)' : isCompliant ? '#16a34a' : '#dc2626'
          )}
          <div style={{ fontSize: '1rem', lineHeight: '2', padding: '12px 14px', borderRadius: '8px', backgroundColor: !canJudge ? '#f8fafc' : isCompliant ? '#f0fdf4' : '#fff5f5', border: `1px solid ${!canJudge ? 'var(--border-color)' : isCompliant ? '#bbf7d0' : '#fca5a5'}`, color: 'var(--text-main)' }}>
            <div>실제 계산: {(parseFloat(fee)||0).toLocaleString()} ÷ {totalMinutes.toLocaleString()} = <strong>{calcRateDisplay}원/분</strong></div>
            <div>기준 단가: <strong>{standardRate}원/분</strong> <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>({standardLabel})</span></div>
            {canJudge && (
              <div style={{ fontWeight: '700', fontSize: '1.05rem', color: isCompliant ? '#16a34a' : '#dc2626', marginTop: '2px' }}>
                {calcRateDisplay}원 {isCompliant ? '≤' : '>'} {standardRate}원 → {isCompliant ? '✅ 적합' : '❌ 기준 초과'}
              </div>
            )}
          </div>
        </div>

        {/* 조정 방안 */}
        {!isCompliant && recDailyMin !== null && (
          <div>
            {sectionLabel('조정 방안', '#92400e', '#f59e0b')}
            <div style={{ backgroundColor: '#fff7ed', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '1rem', lineHeight: '2', color: '#78350f' }}>
              <div>• 교습비 <strong>{(parseFloat(fee)||0).toLocaleString()}원</strong> 유지 시</div>
              <div style={{ paddingLeft: '14px', color: '#92400e' }}>→ 일 교습시간 <strong>{recDailyMin}분 이상</strong>으로 조정 필요 <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>(총 {recTotalMin?.toLocaleString()}분)</span></div>
              <div style={{ marginTop: '4px' }}>• 교습시간 <strong>{totalMinutes.toLocaleString()}분</strong> 유지 시</div>
              <div style={{ paddingLeft: '14px', color: '#92400e' }}>→ 교습비 <strong>{recMaxFee?.toLocaleString()}원 이하</strong>로 조정 필요</div>
            </div>
          </div>
        )}

        {/* 저장된 기록 목록 */}
        {records.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1e40af', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '3px', height: '14px', borderRadius: '2px', backgroundColor: '#3b82f6', flexShrink: 0 }} />
                저장된 기록
              </div>
              <button onClick={() => setRecords([])}
                style={{ padding: '3px 10px', fontSize: '0.88rem', fontWeight: '700', color: '#dc2626', background: 'transparent', border: '1.5px solid #fca5a5', borderRadius: '20px', cursor: 'pointer', lineHeight: '1.6' }}>
                🗑 기록 초기화
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {records.map(r => (
                <RecordRow key={r.no} record={r} onDelete={deleteRecord} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── 기록 행 컴포넌트 ────────────────────────────────────────
function RecordRow({ record: r, onDelete }) {
  const color = r.isCompliant ? '#166534' : '#991b1b';
  const bg    = r.isCompliant ? '#f0fdf4' : '#fff5f5';
  const border= r.isCompliant ? '#bbf7d0' : '#fca5a5';

  return (
    <div style={{ borderRadius: '10px', border: `1.5px solid ${border}`, backgroundColor: bg, padding: '10px 12px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: '800', fontSize: '0.88rem', color: '#64748b' }}>#{r.no}</span>
        <button onClick={() => onDelete(r.no)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: '0 2px', lineHeight: 1 }}>✕</button>
      </div>
      <div className="record-row-inner">
        <span className="record-chip field">{r.label}</span>
        <span className="record-chip time">{r.dm}분 × 주{r.wc}회 × {r.wk}주 = <strong>{r.totalMinutes.toLocaleString()}분</strong></span>
        <span className="record-chip fee">교습비 <strong>{r.fee.toLocaleString()}원</strong></span>
        <span className="record-chip rate" style={{ color, fontWeight: '700' }}>분당단가 <strong>{r.rateDisplay}원</strong> {r.isCompliant ? '✅' : '❌'}</span>
      </div>
    </div>
  );
}

function SpinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line>
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
      <line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line>
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
    </svg>
  );
}
