import React, { useState } from 'react';
import { useRegion } from '../RegionContext';
import {
  REGION_NAMES, RATES_API_URL, newRowId, officeNameOf, rowLabel, saveRegionRates, templateRows, verifyRegionPassword,
} from '../utils/regionRates';

// 교육지원청 학원담당 주무관이 자기 지역 교습과정·분당단가를 입력하는 화면 (지역별 비밀번호)

const box = { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const label = { display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '6px' };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: '0.95rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontFamily: 'inherit' };
const cellInput = { ...input, padding: '7px 8px', fontSize: '0.9rem' };
const th = { padding: '8px 6px', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1', fontSize: '0.85rem', color: '#334155', whiteSpace: 'nowrap' };
const td = { padding: '5px 4px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'middle' };
const btn = (bg, color, border) => ({ padding: '9px 14px', backgroundColor: bg, color, border: `1px solid ${border}`, borderRadius: '8px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit' });
const smallBtn = { padding: '4px 7px', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' };

function toEditRows(rows) {
  return rows.map(r => ({ ...r, rate: r.rate > 0 ? String(r.rate) : '' }));
}

export default function RegionAdmin({ onBack }) {
  const { regions, region: selectedRegion, reload } = useRegion();
  const [region, setRegion] = useState(selectedRegion || '');
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [officeName, setOfficeName] = useState('');
  const [tutoringHourly, setTutoringHourly] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [editor, setEditor] = useState('');
  const [rows, setRows] = useState([]);

  async function unlock(e) {
    e.preventDefault();
    if (!region || !password) { setError('지역과 비밀번호를 입력하세요.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      await verifyRegionPassword(region, password);
      const info = regions.find(r => r.region === region);
      setOfficeName(info?.officeName || officeNameOf(region));
      setTutoringHourly(info?.tutoringHourly > 0 ? String(info.tutoringHourly) : '');
      setEffectiveDate(info?.effectiveDate || '');
      setRows(toEditRows(info?.rows || []));
      setUnlocked(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const updateRow = (id, patch) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id));
  const addRow = () => setRows(prev => [...prev, { id: newRowId(), field: '', process: '', subject: '', rate: '', keywords: '' }]);
  const moveRow = (idx, dir) => setRows(prev => {
    const to = idx + dir;
    if (to < 0 || to >= prev.length) return prev;
    const next = [...prev];
    [next[idx], next[to]] = [next[to], next[idx]];
    return next;
  });
  function loadTemplate() {
    if (rows.length && !window.confirm('지금 표를 지우고 기본 교습과정 13줄을 불러올까요? (분당단가는 비워집니다)')) return;
    setRows(templateRows());
  }

  function validate() {
    const filled = rows.filter(r => r.process.trim() || r.subject.trim() || r.rate);
    if (!filled.length) return '교습과정을 한 줄 이상 입력하세요.';
    if (filled.length > 50) return '교습과정은 50줄까지 입력할 수 있습니다.';
    for (const [i, r] of filled.entries()) {
      if (!r.process.trim()) return `${i + 1}번째 줄의 교습과정을 입력하세요.`;
      const n = Number(r.rate);
      if (!Number.isInteger(n) || n < 1 || n > 9999) return `${i + 1}번째 줄(${rowLabel(r)})의 분당단가를 1~9999 사이 정수로 입력하세요.`;
    }
    const labels = filled.map(rowLabel);
    const dup = labels.find((l, i) => labels.indexOf(l) !== i);
    if (dup) return `같은 교습과정·교습과목 줄이 두 번 있습니다: ${dup}`;
    if (tutoringHourly && !(Number(tutoringHourly) > 0)) return '개인과외 시간당 기준은 숫자로 입력하세요.';
    if (effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return '조정위원회 개최일을 날짜로 입력하세요.';
    return '';
  }

  async function save() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const cleanRows = rows
        .filter(r => r.process.trim() || r.subject.trim() || r.rate)
        .map(r => ({ id: r.id, field: r.field.trim(), process: r.process.trim(), subject: r.subject.trim(), rate: Number(r.rate), keywords: r.keywords.trim() }));
      await saveRegionRates(region, password, {
        officeName: officeName.trim() || officeNameOf(region),
        tutoringHourly: Number(tutoringHourly) || 0,
        effectiveDate,
        editor: editor.trim(),
        rows: cleanRows,
      });
      await reload();
      setMessage(`${region} 기준단가 ${cleanRows.length}줄을 저장했습니다. 앱 사용자에게 바로 적용됩니다.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '20px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', margin: 0 }}>교육지원청 기준단가 입력</h2>
        <button type="button" onClick={onBack} style={btn('#1d4ed8', '#fff', '#1d4ed8')}>← 처음 화면으로</button>
      </div>

      {!RATES_API_URL && (
        <div style={{ ...box, backgroundColor: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}>
          아직 기준단가 시트가 연결되지 않아 저장할 수 없습니다. 운영자에게 문의하세요.
        </div>
      )}

      {!unlocked ? (
        <form onSubmit={unlock} style={box}>
          <div style={{ fontSize: '0.95rem', color: '#475569', marginBottom: '14px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
            각 교육지원청 학원담당 주무관이 <b>자기 지역</b>의 교습과정별 분당단가를 입력합니다. 비밀번호는 운영자에게 받으세요.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={label} htmlFor="admin-region">지역(교육지원청)</label>
              <select id="admin-region" style={input} value={region} onChange={e => setRegion(e.target.value)}>
                <option value="">선택</option>
                {REGION_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="admin-password">비밀번호</label>
              <input id="admin-password" type="password" autoComplete="current-password" style={input} value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ color: '#dc2626', marginBottom: '10px', fontSize: '0.92rem' }}>{error}</div>}
          <button type="submit" disabled={busy} style={btn('#4f46e5', '#fff', '#4f46e5')}>{busy ? '확인 중...' : '확인'}</button>
        </form>
      ) : (
        <>
          <div style={box}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={label} htmlFor="admin-office">교육지원청명 (신청서 "○○교육장 귀하")</label>
                <input id="admin-office" style={input} value={officeName} onChange={e => setOfficeName(e.target.value)} placeholder={officeNameOf(region)} />
              </div>
              <div>
                <label style={label} htmlFor="admin-hourly">개인과외 시간당 기준(원)</label>
                <input id="admin-hourly" inputMode="numeric" style={input} value={tutoringHourly} onChange={e => setTutoringHourly(e.target.value.replace(/[^0-9]/g, ''))} placeholder="예) 20000" />
              </div>
              <div>
                <label style={label} htmlFor="admin-date">교습비등 조정위원회 개최일</label>
                <input id="admin-date" type="date" style={input} value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
              </div>
              <div>
                <label style={label} htmlFor="admin-editor">입력자 (수정기록용)</label>
                <input id="admin-editor" style={input} value={editor} onChange={e => setEditor(e.target.value)} placeholder="예) 학원팀 홍길동" />
              </div>
            </div>
          </div>

          <div style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              <div style={{ fontWeight: 800, color: '#111827' }}>{region} 교습과정별 분당단가</div>
              <button type="button" onClick={loadTemplate} style={btn('#f8fafc', '#334155', '#cbd5e1')}>기본 교습과정 13줄 불러오기</button>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
              화면에는 <b>교습과정(교습과목)</b>으로 표시됩니다. 예) 보습 + 초등 → 보습(초등). 키워드(쉼표로 구분)를 적으면 학원이 과목명에 그 글자를 쓸 때 이 줄이 자동 선택됩니다. 예) 피아노,바이올린
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                <thead>
                  <tr>
                    <th style={th}>순서</th>
                    <th style={th}>분야</th>
                    <th style={th}>교습과정 *</th>
                    <th style={th}>교습과목</th>
                    <th style={th}>분당단가(원) *</th>
                    <th style={th}>키워드</th>
                    <th style={th} aria-label="삭제" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.id}>
                      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'center' }}>
                        <button type="button" style={smallBtn} onClick={() => moveRow(idx, -1)} aria-label="위로">▲</button>{' '}
                        <button type="button" style={smallBtn} onClick={() => moveRow(idx, 1)} aria-label="아래로">▼</button>
                      </td>
                      <td style={td}><input style={cellInput} value={r.field} onChange={e => updateRow(r.id, { field: e.target.value })} placeholder="예) 예능" /></td>
                      <td style={td}><input style={cellInput} value={r.process} onChange={e => updateRow(r.id, { process: e.target.value })} placeholder="예) 음악" /></td>
                      <td style={td}><input style={cellInput} value={r.subject} onChange={e => updateRow(r.id, { subject: e.target.value })} placeholder="예) 입시" /></td>
                      <td style={{ ...td, width: '120px' }}><input style={{ ...cellInput, textAlign: 'right' }} inputMode="numeric" value={r.rate} onChange={e => updateRow(r.id, { rate: e.target.value.replace(/[^0-9]/g, '') })} placeholder="0" /></td>
                      <td style={td}><input style={cellInput} value={r.keywords} onChange={e => updateRow(r.id, { keywords: e.target.value })} /></td>
                      <td style={{ ...td, textAlign: 'center' }}><button type="button" style={{ ...smallBtn, color: '#b91c1c' }} onClick={() => removeRow(r.id)}>삭제</button></td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '18px' }}>아직 줄이 없습니다. "기본 교습과정 13줄 불러오기"나 "+ 줄 추가"를 누르세요.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addRow} style={{ ...btn('#f8fafc', '#4f46e5', '#c7d2fe'), marginTop: '10px' }}>+ 줄 추가</button>
          </div>

          {error && <div style={{ color: '#dc2626', marginBottom: '10px', fontSize: '0.95rem', fontWeight: 600 }}>{error}</div>}
          {message && <div style={{ color: '#15803d', marginBottom: '10px', fontSize: '0.95rem', fontWeight: 600 }}>{message}</div>}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={busy} style={{ ...btn('#4f46e5', '#fff', '#4f46e5'), padding: '12px 22px', fontSize: '1rem' }}>{busy ? '저장 중...' : '저장'}</button>
            <button type="button" onClick={() => { setUnlocked(false); setPassword(''); setMessage(''); setError(''); }} style={btn('#fff', '#334155', '#cbd5e1')}>나가기</button>
          </div>
        </>
      )}
    </div>
  );
}
