import { useState, useCallback } from 'react'

// 소수점 3자리에서 반올림 → 2자리
function round2(val) {
  return Math.round(val * 100) / 100
}

function calcZone(zone) {
  if (zone.shape === 'rect') {
    const w = parseFloat(zone.width)
    const h = parseFloat(zone.height)
    if (!w || !h || isNaN(w) || isNaN(h)) return null
    const raw = w * h
    const rounded = round2(raw)
    return { raw, rounded }
  } else if (zone.shape === 'trap') {
    const top = parseFloat(zone.top)
    const bottom = parseFloat(zone.bottom)
    const h = parseFloat(zone.trapHeight)
    if (isNaN(top) || isNaN(bottom) || !h || isNaN(h)) return null
    const raw = (top + bottom) * h / 2
    const rounded = round2(raw)
    return { raw, rounded }
  }
  return null
}

function calcRoomTotal(room) {
  let total = 0
  room.zones.forEach(zone => {
    const r = calcZone(zone)
    if (r) {
      if (zone.type === 'add') total += r.rounded
      else total -= r.rounded
    }
  })
  return round2(total)
}

let _id = 1
const genId = () => _id++

const ROOM_COLORS = [
  { from: '#60a5fa', to: '#3b82f6' }, // 파란 파스텔
  { from: '#a78bfa', to: '#8b5cf6' }, // 보라 파스텔
  { from: '#34d399', to: '#10b981' }, // 초록 파스텔
  { from: '#fb923c', to: '#f97316' }, // 주황 파스텔
  { from: '#f472b6', to: '#ec4899' }, // 핑크 파스텔
  { from: '#2dd4bf', to: '#14b8a6' }, // 청록 파스텔
]

function newZone(type = 'add') {
  return { id: genId(), type, shape: 'rect', label: '', width: '', height: '', top: '', bottom: '', trapHeight: '' }
}

function newRoom() {
  return { id: genId(), name: '', zones: [newZone('add')] }
}

export default function AreaCalculatorApp({ embedded = false }) {
  const [rooms, setRooms] = useState([newRoom()])

  const updateRoom = useCallback((roomId, updater) => {
    setRooms(prev => prev.map(r => r.id === roomId ? updater(r) : r))
  }, [])

  const addRoom = () => setRooms(prev => [...prev, newRoom()])
  const removeRoom = (id) => setRooms(prev => prev.filter(r => r.id !== id))

  const addZone = (roomId, type) =>
    updateRoom(roomId, r => ({ ...r, zones: [...r.zones, newZone(type)] }))

  const removeZone = (roomId, zoneId) =>
    updateRoom(roomId, r => ({ ...r, zones: r.zones.filter(z => z.id !== zoneId) }))

  const updateZone = (roomId, zoneId, field, value) =>
    updateRoom(roomId, r => ({
      ...r,
      zones: r.zones.map(z => z.id === zoneId ? { ...z, [field]: value } : z)
    }))

  const grandTotal = round2(rooms.reduce((sum, room) => sum + calcRoomTotal(room), 0))

  return (
    <div style={embedded ? { ...S.wrap, background: 'transparent', minHeight: 'unset' } : S.wrap}>
      {!embedded && (
        <div style={S.header}>
          <div style={S.headerInner}>
            <span style={S.headerIcon}>🏫</span>
            <span style={S.headerTitle}>학원 면적 계산기</span>
          </div>
        </div>
      )}

      <div style={S.body}>
        {rooms.map((room, idx) => (
          <RoomCard
            key={room.id}
            room={room}
            idx={idx}
            color={ROOM_COLORS[idx % ROOM_COLORS.length]}
            onNameChange={v => updateRoom(room.id, r => ({ ...r, name: v }))}
            onAddZone={type => addZone(room.id, type)}
            onRemoveZone={zoneId => removeZone(room.id, zoneId)}
            onUpdateZone={(zoneId, field, val) => updateZone(room.id, zoneId, field, val)}
            onRemove={() => removeRoom(room.id)}
            canRemove={rooms.length > 1}
          />
        ))}

        <button style={S.addRoomBtn} onClick={addRoom}>＋ 강의실 추가</button>

        <div style={S.grandTotal}>
          <div style={S.gtTitle}>전체 합계</div>
          <div style={S.gtRows}>
            {rooms.map((room, idx) => {
              const total = calcRoomTotal(room)
              const c = ROOM_COLORS[idx % ROOM_COLORS.length]
              return (
                <div key={room.id} style={S.gtRow}>
                  <div style={S.gtRoomLeft}>
                    <span style={{ ...S.gtBadge, background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>{idx + 1}</span>
                    <span style={{ ...S.gtRoomName, color: c.to }}>{room.name || `강의실 ${idx + 1}`}</span>
                  </div>
                  <span style={{ ...S.gtVal, color: c.to }}>{total.toFixed(2)} ㎡</span>
                </div>
              )
            })}
          </div>
          <div style={S.gtFinal}>
            <span style={S.gtFinalLabel}>합계</span>
            <span style={S.gtFinalVal}>{grandTotal.toFixed(2)} ㎡</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoomCard({ room, idx, color, onNameChange, onAddZone, onRemoveZone, onUpdateZone, onRemove, canRemove }) {
  const total = calcRoomTotal(room)
  const zoneResults = room.zones.map(z => ({ zone: z, result: calcZone(z) }))
  const hasFormula = zoneResults.some(({ zone, result }) => zone.type === 'add' && result)

  // formulaParts: [{text, color}] — in zone order
  let formulaParts = null
  if (hasFormula && room.zones.length > 1) {
    const parts = []
    let first = true
    zoneResults.forEach(({ zone, result }) => {
      if (!result) return
      const isSub = zone.type === 'subtract'
      if (first) {
        parts.push({ text: result.rounded.toFixed(2), color: '#4a90d9' })
        first = false
      } else {
        parts.push({ text: isSub ? ' − ' : ' + ', color: '#bbb' })
        parts.push({ text: result.rounded.toFixed(2), color: isSub ? '#e07050' : '#4a90d9' })
      }
    })
    parts.push({ text: ' = ', color: '#bbb' })
    parts.push({ text: total.toFixed(2) + ' ㎡', color: '#1a1f2e' })
    formulaParts = parts
  } else if (hasFormula) {
    formulaParts = [{ text: total.toFixed(2) + ' ㎡', color: '#1a1f2e' }]
  }

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <div style={S.cardHeadLeft}>
          <span style={{ ...S.cardIdx, background: `linear-gradient(135deg, ${color.from}, ${color.to})`, boxShadow: `0 1px 3px ${color.to}66` }}>{idx + 1}</span>
          <input
            style={S.roomName}
            type="text"
            placeholder={`강의실 ${idx + 1}`}
            value={room.name}
            onChange={e => onNameChange(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button style={S.addZoneBtnSm} onClick={() => onAddZone('add')}>＋</button>
          <button style={{ ...S.addZoneBtnSm, ...S.subZoneBtnSm }} onClick={() => onAddZone('subtract')}>－</button>
          {canRemove && <button style={S.removeBtn} onClick={onRemove}>✕</button>}
        </div>
      </div>

      <div style={S.tape}>
        {room.zones.map((zone, zIdx) => (
          <ZoneRow
            key={zone.id}
            zone={zone}
            zIdx={zIdx}
            onUpdate={(f, v) => onUpdateZone(zone.id, f, v)}
            onRemove={() => onRemoveZone(zone.id)}
            canRemove={room.zones.length > 1}
          />
        ))}
      </div>

      {formulaParts && (
        <div style={S.formulaBar}>
          <span style={{ ...S.formulaLabel, background: `linear-gradient(135deg, ${color.from}, ${color.to})`, boxShadow: `0 1px 3px ${color.to}55` }}>소계</span>
          <span style={S.formulaText}>
            {formulaParts.map((p, i) => (
              <span key={i} style={{ color: p.color }}>{p.text}</span>
            ))}
          </span>
        </div>
      )}

    </div>
  )
}

function ZoneRow({ zone, zIdx, onUpdate, onRemove, canRemove }) {
  const result = calcZone(zone)
  const isSub = zone.type === 'subtract'

  return (
    <div style={{ ...S.zone, ...(isSub ? S.zoneSub : {}) }}>
      <div style={S.zoneAccent(isSub)} />
      <div style={S.zoneLine}>
        <span style={{ ...S.prefix, color: isSub ? '#e07050' : '#4a90d9' }}>{isSub ? '−' : '+'}</span>
        {isSub ? (
          <input
            style={S.labelInput}
            type="text"
            placeholder="기둥"
            value={zone.label}
            onChange={e => onUpdate('label', e.target.value)}
          />
        ) : (
          <span style={S.zoneNum}>구역</span>
        )}
        <NumInput value={zone.width} onChange={v => onUpdate('width', v)} placeholder="가로" />
        <span style={S.op}>×</span>
        <NumInput value={zone.height} onChange={v => onUpdate('height', v)} placeholder="세로" />
        <span style={S.unit}>m</span>
        {result && <CalcInline result={result} isSub={isSub} />}
        {canRemove && <button style={{ ...S.removeSmall, marginLeft: 'auto' }} onClick={onRemove}>✕</button>}
      </div>
    </div>
  )
}

function CalcInline({ result, isSub }) {
  const { raw, rounded } = result
  const rawStr = raw.toFixed(3)
  const needsRound = Math.abs(raw - rounded) >= 0.0005
  const resultColor = isSub ? '#e07050' : '#4a90d9'

  return (
    <span style={S.calcInline}>
      <span style={S.calcEq}>=</span>
      <span style={{ ...S.calcResult, color: resultColor }}>{rounded.toFixed(2)}</span>
      <span style={S.calcUnit}>㎡</span>
    </span>
  )
}

function NumInput({ value, onChange, placeholder }) {
  const handleChange = (e) => {
    const val = e.target.value
    onChange(val)
    if (/^\d+\.\d{2}$/.test(val)) {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]'))
      const idx = inputs.indexOf(e.target)
      if (idx >= 0 && idx < inputs.length - 1) {
        inputs[idx + 1].focus()
        inputs[idx + 1].select()
      }
    }
  }

  return (
    <input
      style={S.numInput}
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onFocus={e => { e.target.style.borderColor = '#4a90d9'; e.target.style.boxShadow = '0 0 0 3px rgba(74,144,217,0.15)' }}
      onBlur={e => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none' }}
    />
  )
}

const S = {
  wrap: {
    maxWidth: 480,
    margin: '0 auto',
    fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', -apple-system, sans-serif",
    background: '#eef0f4',
    minHeight: '100vh',
    paddingBottom: 48,
  },
  header: {
    background: 'linear-gradient(135deg, #3a7bd5 0%, #5a9ee8 100%)',
    padding: '16px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 12px rgba(58,123,213,0.35)',
  },
  headerInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: { fontSize: 20 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' },
  body: { padding: '14px 12px 0', display: 'flex', flexDirection: 'column', gap: 10 },

  card: {
    background: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
  },
  cardHead: {
    background: 'linear-gradient(to right, #f8f9fb, #f3f5f8)',
    borderBottom: '1px solid #e8eaee',
    padding: '7px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeadLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardIdx: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #4a90d9, #357abd)',
    color: 'white',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(74,144,217,0.4)',
  },
  roomName: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#1a1f2e',
    fontSize: 14,
    fontWeight: 600,
    outline: 'none',
    padding: '0',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#bbb',
    width: 26,
    height: 26,
    cursor: 'pointer',
    fontSize: 12,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  },

  tape: { display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px' },
  zone: {
    display: 'flex',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 6,
    background: '#fff',
    boxShadow: '0 3px 8px rgba(0,0,0,0.13), 0 1px 2px rgba(0,0,0,0.08)',
  },
  zoneSub: {
    background: '#faf4f1',
    boxShadow: 'inset 0 1px 4px rgba(180,90,60,0.10), 0 0 0 1px rgba(200,100,60,0.10)',
  },
  zoneAccent: (isSub) => ({
    width: 3,
    flexShrink: 0,
    background: isSub
      ? 'linear-gradient(to bottom, #e07050, #c85a38)'
      : 'linear-gradient(to bottom, #4a90d9, #357abd)',
  }),
  zoneInner: {
    flex: 1,
    padding: '0',
  },
  zoneLine: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '5px 8px 5px 6px',
    gap: 5,
    flexWrap: 'wrap',
  },
  zoneLeft: { display: 'flex', alignItems: 'center', gap: 6 },
  prefix: { fontSize: 13, fontWeight: 700, lineHeight: 1 },
  zoneNum: { fontSize: 12, color: '#888', fontWeight: 600, letterSpacing: '-0.02em', whiteSpace: 'nowrap', width: 44, display: 'inline-block' },
  labelInput: {
    fontSize: 12,
    color: '#666',
    fontWeight: 600,
    border: 'none',
    outline: 'none',
    width: 44,
    background: 'transparent',
    padding: '1px 0',
    letterSpacing: '-0.02em',
  },
  shapeSelect: {
    fontSize: 13,
    padding: '4px 7px',
    borderRadius: 5,
    border: '1px solid #e0e0e0',
    background: 'white',
    color: '#222',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  removeSmall: {
    background: 'none',
    border: 'none',
    color: '#ccc',
    width: 22,
    height: 22,
    cursor: 'pointer',
    fontSize: 12,
    flexShrink: 0,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 12px',
    flexWrap: 'wrap',
  },
  numInput: {
    width: 46,
    padding: '0 2px',
    fontSize: 14,
    textAlign: 'center',
    border: '1px solid #e0e0e0',
    borderRadius: 7,
    outline: 'none',
    fontWeight: 500,
    color: '#1a1f2e',
    background: '#fafbfc',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    MozAppearance: 'textfield',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
  },
  op: { fontSize: 14, color: '#c0c4cc', fontWeight: 400 },
  unit: { fontSize: 12, color: '#c0c4cc' },
  small: { fontSize: 14, color: '#c0c4cc' },

  calcInline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  calcEq: { fontSize: 13, color: '#bbb' },
  calcRawTxt: { fontSize: 12, color: '#bbb', fontFamily: 'monospace' },
  calcArrowTxt: { fontSize: 12, color: '#c8c8c8' },
  calcResult: { fontSize: 15, fontWeight: 700, fontFamily: 'monospace' },
  calcUnit: { fontSize: 12, color: '#aaa' },

  formulaBar: {
    background: 'linear-gradient(to right, #f5f7fa, #f0f2f6)',
    borderTop: '1px solid #e8eaee',
    padding: '6px 14px',
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  formulaLabel: {
    fontSize: 11,
    color: 'white',
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    padding: '2px 7px',
    borderRadius: 10,
    fontWeight: 700,
    letterSpacing: '0.02em',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(109,40,217,0.35)',
  },
  formulaText: {
    fontSize: 15,
    fontFamily: 'monospace',
    letterSpacing: '-0.01em',
    fontWeight: 700,
  },

  cardFoot: {
    borderTop: '1px solid #edf0f4',
  },
  addZoneBtnSm: {
    padding: '2px 7px',
    border: '1px solid #d0d8e8',
    background: '#f4f6fa',
    color: '#4a90d9',
    borderRadius: 5,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    lineHeight: 1.4,
  },
  subZoneBtnSm: {
    color: '#c06040',
    borderColor: '#f0ddd6',
    background: '#fdf8f6',
  },

  roomTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px 12px',
  },
  rtLabel: { fontSize: 12, color: '#aaa', letterSpacing: '0.02em' },
  rtVal: { fontSize: 18, fontWeight: 700, color: '#1a1f2e', fontFamily: 'monospace' },

  addRoomBtn: {
    width: '100%',
    padding: '13px',
    background: 'linear-gradient(135deg, #3a7bd5, #5a9ee8)',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(58,123,213,0.35)',
    letterSpacing: '-0.01em',
  },

  grandTotal: {
    background: 'white',
    borderRadius: 12,
    padding: '16px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
  },
  gtTitle: {
    fontSize: 15,
    color: '#1a1f2e',
    fontWeight: 700,
    marginBottom: 12,
    letterSpacing: '-0.01em',
  },
  gtRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 12,
  },
  gtRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 8,
    background: '#f8f9fb',
  },
  gtRoomLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  gtBadge: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    color: 'white',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gtRoomName: { fontSize: 13, fontWeight: 600 },
  gtVal: { fontSize: 14, fontFamily: 'monospace', fontWeight: 600 },
  gtFinal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #e8eaee',
    paddingTop: 12,
  },
  gtFinalLabel: { fontSize: 13, color: '#888', fontWeight: 500 },
  gtFinalVal: { fontSize: 22, fontWeight: 700, color: '#1a1f2e', fontFamily: 'monospace' },
}
