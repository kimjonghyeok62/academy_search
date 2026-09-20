import React, { useState } from 'react';

// 교습비 입력 화면(등록신청서 표)이 쓰는 드롭다운 — 기준단가·분야 추정은 utils/regionRates.js

// ─── 드롭다운 + 직접 입력 ────────────────────────────────────
export function DropdownSelect({ options, value, onChange, unit, placeholder, inputWidth = '60px' }) {
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
      // autoFocus가 일부 모바일에서 동작 안 하는 경우를 대비해 ref로 직접 포커스
      const timer = setTimeout(() => {
        try { inputRef.current && inputRef.current.focus(); } catch { /* 포커스는 되면 좋은 것이지 안 되어도 그만이다 */ }
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
            fontSize: '1.1rem',
            color: value === '' ? '#9ca3af' : '#111827',
            fontWeight: value === '' ? '400' : '600',
            background: '#fff',
            outline: 'none',
            fontFamily: 'inherit',
            cursor: 'pointer',
            appearance: 'auto',
            WebkitAppearance: 'auto',
            maxWidth: '86px',
            minHeight: '42px',
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
            onClick={() => { try { inputRef.current && inputRef.current.focus(); } catch { /* 포커스는 되면 좋은 것이지 안 되어도 그만이다 */ } }}
            onBlur={() => {
              if (value === '') setIsCustomMode(false);
            }}
            style={{
              width: (parseFloat(inputWidth) + 4) + 'px',
              textAlign: 'center',
              padding: '3px 0px',
              border: 'none',
              borderBottom: '1.5px solid #9ca3af',
              background: 'transparent',
              fontSize: '1.1rem',
              fontWeight: '600',
              color: '#111827',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {unit && <span style={{ fontSize: '1rem', color: '#374151', fontWeight: '500', marginLeft: '1px' }}>{unit}</span>}
        </span>
      )}
    </span>
  );
}
