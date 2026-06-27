import React, { useState, useRef } from 'react';

// ── 원본 참고값 데이터 (모든 분야) ─────────────────────────────
const ALL_STATS_RAW = [
  // 0: 단과(초등) - 210
  [
    { totalMin: 1290, fee: 270000, rate: 209.3 },
    { totalMin: 1548, fee: 280000, rate: 180.9 },
    { totalMin:  774, fee: 160000, rate: 206.7 },
    { totalMin: 1161, fee: 220000, rate: 189.5 },
    { totalMin: 1032, fee: 200000, rate: 193.8 },
  ],
  // 1: 단과(중등) - 222
  [
    { totalMin: 1548, fee: 300000, rate: 193.8 },
    { totalMin: 1290, fee: 250000, rate: 193.8 },
    { totalMin: 1935, fee: 300000, rate: 155.0 },
    { totalMin: 2322, fee: 370000, rate: 159.3 },
  ],
  // 2: 단과(고등) - 234
  [
    { totalMin: 2322, fee: 450000, rate: 193.8 },
    { totalMin: 1548, fee: 360000, rate: 232.6 },
    { totalMin: 1935, fee: 350000, rate: 180.9 },
    { totalMin: 1806, fee: 400000, rate: 221.5 },
    { totalMin: 2064, fee: 400000, rate: 193.8 },
  ],
  // 3: 진학상담·지도 - 234
  [
    { totalMin: 1548, fee: 300000, rate: 193.8 },
    { totalMin: 2322, fee: 500000, rate: 215.3 },
    { totalMin:  800, fee: 100000, rate: 125.0 },
    { totalMin: 1032, fee: 150000, rate: 145.3 },
    { totalMin: 1935, fee: 390000, rate: 201.6 },
  ],
  // 4: 어학 - 259
  [
    { totalMin: 1548, fee: 325000, rate: 209.9 },
    { totalMin: 1677, fee: 380000, rate: 226.6 },
    { totalMin:  688, fee: 170000, rate: 247.1 },
    { totalMin: 1935, fee: 350000, rate: 180.9 },
    { totalMin: 1032, fee: 242000, rate: 234.5 },
  ],
  // 5: 음악(유초중고) - 224
  [
    { totalMin:  774, fee: 160000, rate: 206.7 },
    { totalMin:  860, fee: 160000, rate: 186.0 },
    { totalMin:  645, fee: 140000, rate: 217.1 },
    { totalMin: 1260, fee: 140000, rate: 111.1 },
    { totalMin: 1032, fee: 220000, rate: 213.2 },
  ],
  // 6: 음악(입시) - 336
  [
    { totalMin:  774, fee: 210000, rate: 271.3 },
    { totalMin:  516, fee: 170000, rate: 329.5 },
    { totalMin:  645, fee: 180000, rate: 279.1 },
    { totalMin: 1290, fee: 300000, rate: 232.6 },
    { totalMin: 1548, fee: 250000, rate: 161.5 },
  ],
  // 7: 미술(유초중고) - 212
  [
    { totalMin:  774, fee: 130000, rate: 168.0 },
    { totalMin:  516, fee:  80000, rate: 155.0 },
    { totalMin: 1032, fee: 170000, rate: 164.7 },
    { totalMin:  387, fee:  65000, rate: 168.0 },
    { totalMin: 1260, fee: 130000, rate: 103.2 },
  ],
  // 8: 미술(입시) - 255
  [
    { totalMin: 3096, fee: 530000, rate: 171.2 },
    { totalMin: 6192, fee: 990000, rate: 159.9 },
    { totalMin: 4128, fee: 700000, rate: 169.6 },
    { totalMin: 5160, fee: 850000, rate: 164.7 },
    { totalMin: 1032, fee: 210000, rate: 203.5 },
  ],
  // 9: 무용(유초중고) - 212
  [
    { totalMin: 774, fee: 120000, rate: 155.0 },
    { totalMin: 645, fee: 110000, rate: 170.5 },
  ],
  // 10: 무용(입시) - 255
  [
    { totalMin:  774, fee: 197000, rate: 254.5 },
    { totalMin:  516, fee: 110000, rate: 213.2 },
    { totalMin:  387, fee:  98000, rate: 253.2 },
    { totalMin: 1161, fee: 296000, rate: 255.0 },
    { totalMin:  258, fee:  65000, rate: 251.9 },
  ],
  // 11: 정보(일반) - 230
  [
    { totalMin: 3600, fee: 397200, rate: 110.3 },
    { totalMin: 1890, fee: 350000, rate: 185.2 },
    { totalMin: 4128, fee: 400000, rate:  96.9 },
    { totalMin: 4800, fee: 480000, rate: 100.0 },
    { totalMin: 2580, fee: 200000, rate:  77.5 },
  ],
  // 12: 기타(일반) - 230
  [
    { totalMin:  215, fee:  45000, rate: 209.3 },
    { totalMin: 1548, fee: 300000, rate: 193.8 },
    { totalMin:  258, fee:  50000, rate: 193.8 },
    { totalMin: 1935, fee: 320000, rate: 165.4 },
  ],
];

const DM_COMMON = [30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180];
const WC_COMMON = [1, 2, 3, 4, 5, 6, 7];
const WK_OPTIONS = [
  { val: 4.3, label: '4.3주' },
  { val: 4.2, label: '4.2주' },
  { val: 4.0, label: '4주'   },
];

function buildCombos(totalMin) {
  const results = [];
  for (const { val: wk, label: wkLabel } of WK_OPTIONS) {
    const weeklyMin = totalMin / wk;
    for (const dm of DM_COMMON) {
      for (const wc of WC_COMMON) {
        if (Math.abs(dm * wc - weeklyMin) < 0.6) {
          results.push({ dm, wc, wkLabel, wk });
        }
      }
    }
  }
  const seen = new Set();
  const deduped = results.filter(r => {
    const key = `${r.dm}-${r.wc}-${r.wk}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => {
    const aOk = a.wc >= 2 && a.wc <= 5 ? 0 : 1;
    const bOk = b.wc >= 2 && b.wc <= 5 ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    return b.wk - a.wk;
  });
  return deduped.slice(0, 3);
}

function buildUniqueRows() {
  const map = new Map();
  ALL_STATS_RAW.forEach(fieldArr =>
    fieldArr.forEach(({ totalMin, fee, rate }) => {
      if (!map.has(totalMin)) map.set(totalMin, { totalMin, fee, rate });
    })
  );
  return [...map.values()].sort((a, b) => b.totalMin - a.totalMin);
}

const BASE_ROWS = buildUniqueRows().map(r => ({
  ...r,
  combos: buildCombos(r.totalMin),
  weeklyMin: null,
}));

BASE_ROWS.forEach(row => {
  if (row.combos.length > 0) {
    row.weeklyMin = row.combos[0].dm * row.combos[0].wc;
  } else {
    row.weeklyMin = Math.round(row.totalMin / 4.3);
  }
});

function fmtNum(n) { return Number(n).toLocaleString('ko-KR'); }

const TH = {
  padding: '7px 10px',
  background: '#f1f5ff',
  color: '#374151',
  fontWeight: 700,
  fontSize: '0.82rem',
  borderBottom: '2px solid #c7d2fe',
  whiteSpace: 'nowrap',
  textAlign: 'center',
};
const TD_BASE = {
  padding: '6px 10px',
  fontSize: '0.83rem',
  borderBottom: '1px solid #f0f0f0',
  verticalAlign: 'middle',
  textAlign: 'center',
};
const TABLE_STYLE = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.83rem',
};

const DM_LIST = [180, 150, 130, 120, 90, 80, 70, 60, 50];
const DM_MAX_WC = { 70: 6 };

const ROWS = DM_LIST.flatMap(dm => {
  const maxWc = DM_MAX_WC[dm] || 5;
  return Array.from({ length: maxWc }, (_, i) => maxWc - i)
    .map(wc => ({ dm, wc, total: Math.round(dm * wc * 4.3) }));
});

const HIGHLIGHT_TOTALS = new Set([
  1548, 2322, 1935, 1290, 1806, 2064, 1677, 1032, 1161, 774,
  2580, 1720, 903, 1376, 1505,
]);

const RATE_DATA = [
  { process: '보습(단과)', subject: '초등', rate: 210, bg: '#eef4ff' },
  { process: '보습(단과)', subject: '중등', rate: 222, bg: '#eef4ff' },
  { process: '보습(단과)', subject: '고등', rate: 234, bg: '#eef4ff' },
  { process: '진학상담·지도', subject: '', rate: 234, bg: '#f3f0ff' },
  { process: '어학', subject: '실용외국어 포함', rate: 259, bg: '#edfdf5' },
  { process: '음악', subject: '유·초·중·고', rate: 224, bg: '#fff8ee' },
  { process: '음악', subject: '입시', rate: 336, bg: '#fff8ee' },
  { process: '미술', subject: '유·초·중·고', rate: 212, bg: '#fff0f5' },
  { process: '미술', subject: '입시', rate: 255, bg: '#fff0f5' },
  { process: '무용', subject: '유·초·중·고', rate: 212, bg: '#f0fffe' },
  { process: '무용', subject: '입시', rate: 255, bg: '#f0fffe' },
  { process: '정보', subject: '일반', rate: 230, bg: '#f5fbe8' },
  { process: '기타', subject: '일반', rate: 230, bg: '#f5f5f5' },
];

const TH_LG = {
  padding: '10px 8px',
  background: '#f1f5ff',
  color: '#374151',
  fontWeight: 700,
  fontSize: '0.97rem',
  borderBottom: '2px solid #c7d2fe',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  position: 'sticky',
  top: 0,
  zIndex: 2,
};
const TD_LG = {
  padding: '9px 8px',
  fontSize: '0.97rem',
  borderBottom: '1px solid #e8e8e8',
  verticalAlign: 'middle',
  textAlign: 'center',
};

const FIELD_BUTTONS = [
  { label: '단과(초등)', rate: 210 },
  { label: '단과(중등)', rate: 222 },
  { label: '단과(고등)', rate: 234 },
  { label: '진학상담', rate: 234 },
  { label: '어학', rate: 259 },
  { label: '음악(일반)', rate: 224 },
  { label: '음악(입시)', rate: 336 },
  { label: '미술(일반)', rate: 212 },
  { label: '미술(입시)', rate: 255 },
  { label: '무용(일반)', rate: 212 },
  { label: '무용(입시)', rate: 255 },
  { label: '정보', rate: 230 },
  { label: '기타', rate: 230 },
];

export default function TuitionCheckTab() {
  const [fees, setFees] = useState({});
  const [custom, setCustom] = useState({ dm: '', wc: '', wk: '', fee: '' });
  const [selectedField, setSelectedField] = useState(null);
  const customRowRef = useRef(null);

  function setFee(key, val) {
    const raw = val.replace(/[^0-9]/g, '');
    setFees(prev => ({ ...prev, [key]: raw }));
  }

  const customTotal = custom.dm && custom.wc && custom.wk
    ? Math.round(parseFloat(custom.dm) * parseFloat(custom.wc) * parseFloat(custom.wk))
    : null;
  const customFeeNum = parseInt(custom.fee.replace(/[^0-9]/g, ''), 10);
  const customRate = customFeeNum > 0 && customTotal > 0 ? Math.ceil(customFeeNum / customTotal) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>

      {/* ── 섹션 1: 분야 선택 버튼 + 총교습시간별 참고표 ── */}
      <div>
        {/* 분야 선택 버튼 */}
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
          {FIELD_BUTTONS.map((f) => {
            const isActive = selectedField?.label === f.label;
            return (
              <button
                key={f.label}
                onClick={() => setSelectedField(isActive ? null : f)}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.8rem',
                  fontWeight: isActive ? '700' : '500',
                  fontFamily: 'inherit',
                  border: isActive ? '2px solid #1d4ed8' : '1.5px solid #d1d5db',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#1d4ed8' : '#f9fafb',
                  color: isActive ? '#fff' : '#374151',
                  boxShadow: isActive ? '0 2px 6px rgba(29,78,216,0.25)' : 'none',
                  transition: 'all 0.15s',
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#4338ca'; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#374151'; } }}
              >
                {f.label}
                <span style={{ fontSize: '0.7rem', opacity: 0.75, marginLeft: '3px' }}>{f.rate}</span>
              </button>
            );
          })}
        </div>
        {/* ── 스티키 분야 인디케이터 바 ── */}
        {selectedField && (
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 12px',
            backgroundColor: '#1d4ed8',
            color: '#fff',
            fontSize: '0.83rem',
            fontWeight: 700,
            boxShadow: '0 2px 6px rgba(29,78,216,0.3)',
            borderRadius: '8px 8px 0 0',
            height: '32px',
            boxSizing: 'border-box',
          }}>
            <span style={{ opacity: 0.75, fontWeight: 500 }}>분야</span>
            <span>{selectedField.label}</span>
            <span style={{ opacity: 0.65, fontWeight: 500, fontSize: '0.77rem' }}>기준단가 {selectedField.rate}원/분</span>
            <button
              onClick={() => setSelectedField(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}
            >✕</button>
          </div>
        )}
        <div style={{ overflowX: 'clip' }}>
          <table style={{ ...TABLE_STYLE, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '44px' }} />
              <col style={{ width: '36px' }} />
              <col style={{ width: '36px' }} />
              <col style={{ width: '74px' }} />
              <col style={{ width: '88px' }} />
              <col style={{ width: '66px' }} />
            </colgroup>
            <thead>
              {(() => {
                const thTop = selectedField ? 32 : 0;
                return (
                  <tr>
                    <th style={{ ...TH_LG, top: thTop, fontSize: '0.88rem', padding: '6px 3px' }}>일(분)</th>
                    <th style={{ ...TH_LG, top: thTop, fontSize: '0.88rem', padding: '6px 3px' }}>주(회)</th>
                    <th style={{ ...TH_LG, top: thTop, fontSize: '0.88rem', padding: '6px 3px' }}>월(주)</th>
                    <th style={{ ...TH_LG, top: thTop, fontSize: '0.88rem', padding: '6px 3px' }}>총교습<br />시간(분)</th>
                    <th style={{ ...TH_LG, top: thTop, fontSize: '0.88rem', padding: '6px 3px', background: '#fef9ee' }}>교습비(원)</th>
                    <th style={{ ...TH_LG, top: thTop, fontSize: '0.88rem', padding: '6px 3px' }}>분당단가</th>
                  </tr>
                );
              })()}
            </thead>
            <tbody>
              {/* ── 직접 입력 행 ── */}
              {(() => {
                const thTop = selectedField ? 32 : 0;
                const customTop = thTop + 54;
                const TD_CU = { ...TD_LG, fontSize: '0.88rem', padding: '4px 3px', borderBottom: '2px solid #a5b4fc', borderTop: '2px solid #a5b4fc', background: '#f5f3ff', position: 'sticky', top: customTop, zIndex: 1 };
                const inputBase = {
                  width: '100%', border: '1px solid #c4b5fd', borderRadius: '4px',
                  padding: '4px 3px', fontSize: '0.88rem', fontWeight: 600, textAlign: 'center',
                  background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#4c1d95', boxSizing: 'border-box',
                };
                return (
                  <tr ref={customRowRef}>
                    <td style={{ ...TD_CU, color: '#6d28d9', fontWeight: 700 }}>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="분" value={custom.dm}
                        onChange={e => setCustom(p => ({ ...p, dm: e.target.value.replace(/[^0-9]/g, '') }))}
                        style={{ ...inputBase }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#7c3aed'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#c4b5fd'; }} />
                    </td>
                    <td style={TD_CU}>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="회" value={custom.wc}
                        onChange={e => setCustom(p => ({ ...p, wc: e.target.value.replace(/[^0-9]/g, '') }))}
                        style={{ ...inputBase }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#7c3aed'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#c4b5fd'; }} />
                    </td>
                    <td style={TD_CU}>
                      <select value={custom.wk} onChange={e => setCustom(p => ({ ...p, wk: e.target.value }))}
                        style={{ ...inputBase, appearance: 'auto', cursor: 'pointer' }}>
                        <option value="">월</option>
                        <option value="4.3">4.3</option>
                        <option value="4.2">4.2</option>
                        <option value="4.1">4.1</option>
                        <option value="4.0">4.0</option>
                      </select>
                    </td>
                    <td style={{ ...TD_CU, fontWeight: 700, color: customTotal ? '#4c1d95' : '#9ca3af', textAlign: 'right', paddingRight: '6px' }}>
                      {customTotal ? fmtNum(customTotal) : '—'}
                    </td>
                    <td style={{ ...TD_CU, padding: '4px 3px' }}>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="교습비" value={custom.fee}
                        onChange={e => setCustom(p => ({ ...p, fee: e.target.value.replace(/[^0-9]/g, '') }))}
                        style={{ ...inputBase, textAlign: 'right', color: '#92400e' }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#7c3aed'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#c4b5fd'; }} />
                    </td>
                    {(() => {
                      const cFeeNum = parseInt(custom.fee.replace(/[^0-9]/g, ''), 10);
                      const cMaxFee = selectedField && customTotal ? Math.floor(selectedField.rate * customTotal) : null;
                      const showHint = selectedField && customTotal > 0 && (!cFeeNum || cFeeNum <= 10000);
                      const showRate = customRate && cFeeNum > 10000;
                      const isOver = selectedField && showRate && customRate > selectedField.rate;
                      const rateColor = !selectedField
                        ? (customRate ? '#1e3a8a' : '#9ca3af')
                        : showRate ? (isOver ? '#dc2626' : '#1d4ed8') : '#9ca3af';
                      return (
                        <td style={{ ...TD_CU, fontWeight: 700, color: rateColor }}>
                          {showHint && cMaxFee
                            ? <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>상한 {fmtNum(cMaxFee)}원</span>
                            : showRate ? `${fmtNum(customRate)}원` : '—'}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })()}

              {/* ── 데이터 행 ── */}
              {ROWS.map(({ dm, wc, total }) => {
                const maxWc = DM_MAX_WC[dm] || 5;
                const isGroupStart = wc === maxWc;
                const groupIdx = DM_LIST.indexOf(dm);
                const key = `${dm}-${wc}`;
                const feeRaw = fees[key] || '';
                const feeNum = parseInt(feeRaw, 10);
                const rate = feeNum > 0 && total > 0 ? Math.ceil(feeNum / total) : null;
                const groupBorder = isGroupStart && groupIdx > 0 ? { borderTop: '1px solid #94a3b8' } : {};
                const highlighted = HIGHLIGHT_TOTALS.has(total);
                const bg = highlighted ? '#fef9c3' : '#fff';
                const TD_SM = { ...TD_LG, fontSize: '0.88rem', padding: '5px 3px', borderBottom: 'none' };

                const maxFee = selectedField ? Math.floor(selectedField.rate * total) : null;
                const showHint = selectedField && total > 0 && (!feeNum || feeNum <= 10000);
                const showRate = rate && feeNum > 10000;
                const isOver = selectedField && showRate && rate > selectedField.rate;
                const rateColor = !selectedField
                  ? (rate ? '#1e3a8a' : '#9ca3af')
                  : showRate ? (isOver ? '#dc2626' : '#1d4ed8') : '#9ca3af';

                return (
                  <tr key={key} style={{ background: bg, cursor: 'pointer' }}
                    onClick={() => {
                      setCustom({ dm: String(dm), wc: String(wc), wk: '4.3', fee: feeRaw || '' });
                      setTimeout(() => customRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
                    }}>
                    <td style={{ ...TD_SM, fontWeight: 700, color: '#1d4ed8', ...groupBorder }}>
                      {dm}
                    </td>
                    <td style={{ ...TD_SM, fontWeight: 600, color: '#1d4ed8', ...groupBorder }}>{wc}</td>
                    <td style={{ ...TD_SM, color: '#4b5563', ...groupBorder }}>4.3</td>
                    <td style={{ ...TD_SM, fontWeight: 700, color: '#1e3a8a', textAlign: 'right', paddingRight: '6px', ...groupBorder }}>{fmtNum(total)}</td>
                    <td style={{ ...TD_SM, padding: '4px 4px', background: highlighted ? '#fde68a' : '#fef9c3', ...groupBorder }}
                      onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={feeRaw ? Number(feeRaw).toLocaleString('ko-KR') : ''}
                        onChange={e => setFee(key, e.target.value.replace(/,/g, ''))}
                        placeholder="입력"
                        style={{
                          width: '100%', border: '1px solid #d1d5db', borderRadius: '4px',
                          padding: '4px 4px', fontSize: '0.88rem', fontWeight: 600,
                          textAlign: 'right', background: '#fff', outline: 'none',
                          fontFamily: 'inherit', color: '#92400e', boxSizing: 'border-box',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 0 0 2px #e0e7ff'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.boxShadow = 'none'; }}
                      />
                    </td>
                    <td style={{ ...TD_SM, fontWeight: 700, color: rateColor, ...groupBorder }}>
                      {showHint && maxFee
                        ? <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>상한 {fmtNum(maxFee)}원</span>
                        : showRate ? `${fmtNum(rate)}원` : (rate && !selectedField ? `${fmtNum(rate)}원` : '—')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 섹션 2: 기준단가 참고표 ── */}
      <div>
        <SectionTitle>기준단가 참고표</SectionTitle>
        <div style={{ overflowX: 'clip' }}>
          <table style={{ ...TABLE_STYLE, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '110px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '100px' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={TH_LG}>교습과정</th>
                <th style={TH_LG}>교습과목(반)</th>
                <th style={{ ...TH_LG, background: '#f0f5ff' }}>분당단가(원)</th>
              </tr>
            </thead>
            <tbody>
              {RATE_DATA.map(({ process, subject, rate, bg }, idx) => (
                <tr key={idx} style={{ background: bg }}>
                  <td style={{ ...TD_LG, fontWeight: 700, color: '#374151' }}>{process}</td>
                  <td style={{ ...TD_LG, color: '#4b5563' }}>{subject || '—'}</td>
                  <td style={{ ...TD_LG, fontWeight: 700, color: '#1e3a8a', background: '#f0f5ff' }}>{rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e3a8a', borderBottom: '2px solid #c7d2fe', paddingBottom: '6px', marginBottom: '10px', textAlign: 'center' }}>
      {children}
    </div>
  );
}
