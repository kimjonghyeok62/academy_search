import { useState, useCallback, useEffect, useRef } from 'react'

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

// 강의실 번호 배지 — 방마다 색을 달리하지 않고 남색 하나
const ROOM_COLORS = [
  { from: 'var(--navy)', to: 'var(--navy)' },
]

function newZone(type = 'add') {
  return { id: genId(), type, shape: 'rect', label: '', width: '', height: '', top: '', bottom: '', trapHeight: '' }
}

function newRoom() {
  return { id: genId(), name: '', zones: [newZone('add')] }
}

function makeRoomsFromSetup(roomCount, zonesPerRoom, pillarsPerRoom) {
  return Array.from({ length: roomCount }, () => ({
    id: genId(),
    name: '',
    zones: [
      ...Array.from({ length: zonesPerRoom }, () => newZone('add')),
      ...Array.from({ length: pillarsPerRoom }, () => newZone('subtract')),
    ],
  }))
}

export default function AreaCalculatorApp({ embedded = false }) {
  const [rooms, setRooms] = useState(() => makeRoomsFromSetup(4, 2, 2))
  const focusZoneIdRef = useRef(null)

  const updateRoom = useCallback((roomId, updater) => {
    setRooms(prev => prev.map(r => r.id === roomId ? updater(r) : r))
  }, [])

  const addRoom = () => {
    const [room] = makeRoomsFromSetup(1, 2, 2)
    setRooms(prev => [...prev, room])
    focusZoneIdRef.current = room.zones[0].id
  }
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

  // 탭 진입 시 첫 가로 포커스
  useEffect(() => {
    focusZoneIdRef.current = rooms[0].zones[0].id
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 렌더 후 포커스 실행
  useEffect(() => {
    if (!focusZoneIdRef.current) return
    const id = focusZoneIdRef.current
    const el = document.querySelector(`[data-zone-id="${id}"][data-field="width"]`)
    if (el) {
      el.focus()
      el.select()
      focusZoneIdRef.current = null
    }
  })

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
            onAddZone={type => {
              const zone = newZone(type)
              updateRoom(room.id, r => ({ ...r, zones: [...r.zones, zone] }))
              focusZoneIdRef.current = zone.id
            }}
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
                    <span style={{ ...S.gtBadge, background: c.to }}>{idx + 1}</span>
                    <span style={{ ...S.gtRoomName, color: 'var(--text-main)' }}>{room.name || `강의실 ${idx + 1}`}</span>
                  </div>
                  <span style={{ ...S.gtVal, color: 'var(--text-main)' }}>{total.toFixed(2)} ㎡</span>
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
        parts.push({ text: result.rounded.toFixed(2), color: ADD_COLOR })
        first = false
      } else {
        parts.push({ text: isSub ? ' − ' : ' + ', color: '#94a3b8' })
        parts.push({ text: result.rounded.toFixed(2), color: isSub ? SUB_COLOR : ADD_COLOR })
      }
    })
    parts.push({ text: ' = ', color: '#94a3b8' })
    parts.push({ text: total.toFixed(2) + ' ㎡', color: '#0f172a' })
    formulaParts = parts
  } else if (hasFormula) {
    formulaParts = [{ text: total.toFixed(2) + ' ㎡', color: '#0f172a' }]
  }

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <div style={S.cardHeadLeft}>
          <span style={{ ...S.cardIdx, background: color.to }}>{idx + 1}</span>
          <input
            style={S.roomName}
            type="text"
            placeholder={`강의실 ${idx + 1}`}
            value={room.name}
            onChange={e => onNameChange(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button style={S.addZoneBtnSm} onClick={() => onAddZone('add')}>＋ 구역</button>
          <button style={{ ...S.addZoneBtnSm, ...S.subZoneBtnSm }} onClick={() => onAddZone('subtract')}>－ 기둥</button>
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
          <span style={S.formulaLabel}>소계</span>
          <span style={S.formulaText}>
            {formulaParts.slice(0, -2).map((p, i) => (
              <span key={i} style={{ color: p.color }}>{p.text}</span>
            ))}
          </span>
          <span style={{ ...S.formulaText, marginLeft: 'auto' }}>
            {formulaParts.slice(-2).map((p, i) => (
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
        <span style={{ ...S.prefix, color: isSub ? SUB_COLOR : ADD_COLOR }}>{isSub ? '−' : '+'}</span>
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
        <NumInput zoneId={zone.id} field="width" value={zone.width} onChange={v => onUpdate('width', v)} placeholder="가로" />
        <span style={S.op}>×</span>
        <NumInput zoneId={zone.id} field="height" value={zone.height} onChange={v => onUpdate('height', v)} placeholder="세로" />
        <span style={S.unit}>m</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 }}>
          {result && <CalcInline result={result} isSub={isSub} />}
          {canRemove && <button style={S.removeSmall} onClick={onRemove}>✕</button>}
        </div>
      </div>
    </div>
  )
}

function CalcInline({ result, isSub }) {
  const { raw, rounded } = result
  const rawStr = raw.toFixed(3)
  const needsRound = Math.abs(raw - rounded) >= 0.0005
  const resultColor = isSub ? SUB_COLOR : ADD_COLOR

  return (
    <span style={S.calcInline}>
      <span style={S.calcEq}>=</span>
      <span style={{ ...S.calcResult, color: resultColor }}>{rounded.toFixed(2)}</span>
      <span style={S.calcUnit}>㎡</span>
    </span>
  )
}

function NumInput({ value, onChange, placeholder, zoneId, field, onComplete }) {
  const handleChange = (e) => {
    const val = e.target.value
    onChange(val)
    if (/^\d+\.\d{2}$/.test(val)) {
      if (onComplete) {
        onComplete()
      } else {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'))
        const idx = inputs.indexOf(e.target)
        if (idx >= 0 && idx < inputs.length - 1) {
          inputs[idx + 1].focus()
          inputs[idx + 1].select()
        }
      }
    }
  }

  const handleFocus = (e) => {
    e.target.style.borderColor = ADD_COLOR
    e.target.style.boxShadow = '0 0 0 3px #bfdbfe'
    e.target.select()
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }

  return (
    <input
      data-zone-id={zoneId}
      data-field={field}
      style={S.numInput}
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={e => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none' }}
    />
  )
}


// 모양 — 앱 공통 색(남색·파랑 하나)과 글자 단계를 따른다. 그라데이션·방마다 다른 색은 쓰지 않는다.
// 더하는 구역은 파랑, 빼는 기둥은 회색으로만 가른다 (빨강은 '초과' 뜻이라 쓰지 않는다).
const ADD_COLOR = '#1d4ed8'
const SUB_COLOR = '#475569'

const S = {
  wrap: {
    maxWidth: 640,
    margin: '0 auto',
    background: 'var(--bg-light)',
    minHeight: '100vh',
    paddingBottom: 48,
  },
  header: {
    background: 'var(--navy)',
    padding: '16px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: { display: 'none' },
  headerTitle: { color: '#fff', fontSize: '1.15rem', fontWeight: 800 },
  body: { padding: '0', display: 'flex', flexDirection: 'column', gap: 14 },

  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    overflow: 'visible',
    boxShadow: 'var(--shadow-sm)',
  },
  cardHead: {
    background: '#f8fafc',
    borderBottom: '1px solid var(--border-color)',
    borderRadius: '12px 12px 0 0',
    padding: '8px 8px 8px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    overflow: 'visible',
  },
  cardHeadLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: '1 1 140px',
    minWidth: 0,
  },
  cardIdx: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--navy)',
    color: 'white',
    fontSize: '0.9rem',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roomName: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-main)',
    fontSize: '1.0625rem',
    fontWeight: 700,
    outline: 'none',
    padding: '0',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    width: 46,
    height: 46,
    cursor: 'pointer',
    fontSize: '1rem',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    padding: 0,
  },

  tape: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px' },
  zone: {
    display: 'flex',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 10,
    background: '#fff',
    border: '1px solid var(--border-color)',
  },
  zoneSub: {
    background: '#f8fafc',
  },
  zoneAccent: (isSub) => ({
    width: 4,
    flexShrink: 0,
    background: isSub ? SUB_COLOR : ADD_COLOR,
  }),
  zoneInner: {
    flex: 1,
    padding: '0',
  },
  zoneLine: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '6px 6px 6px 8px',
    gap: 6,
    flexWrap: 'wrap',
  },
  zoneLeft: { display: 'flex', alignItems: 'center', gap: 6 },
  prefix: { fontSize: '1.15rem', fontWeight: 800, lineHeight: 1, width: 14, textAlign: 'center' },
  zoneNum: { fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', width: 44, display: 'inline-block' },
  labelInput: {
    fontSize: '1rem',
    color: 'var(--text-muted)',
    fontWeight: 700,
    border: 'none',
    outline: 'none',
    width: 44,
    minHeight: 40,
    background: 'transparent',
    padding: '1px 0',
  },
  shapeSelect: {
    fontSize: '1rem',
    padding: '4px 7px',
    borderRadius: 8,
    border: '1px solid var(--border-strong)',
    background: 'white',
    color: 'var(--text-main)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  removeSmall: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    width: 40,
    height: 46,
    cursor: 'pointer',
    fontSize: '1rem',
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
    width: 72,
    minHeight: 46,
    padding: '0 4px',
    fontSize: '1.0625rem',
    textAlign: 'center',
    border: '1px solid var(--border-strong)',
    borderRadius: 10,
    outline: 'none',
    fontWeight: 600,
    color: 'var(--text-main)',
    background: '#fff',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    MozAppearance: 'textfield',
  },
  op: { fontSize: '1.0625rem', color: 'var(--text-muted)', fontWeight: 400 },
  unit: { fontSize: '1rem', color: 'var(--text-muted)' },
  small: { fontSize: '1rem', color: 'var(--text-muted)' },

  calcInline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
  },
  calcEq: { fontSize: '1rem', color: 'var(--text-muted)' },
  calcRawTxt: { fontSize: '0.9rem', color: 'var(--text-muted)', fontFamily: 'monospace' },
  calcArrowTxt: { fontSize: '0.9rem', color: 'var(--text-muted)' },
  calcResult: { fontSize: '1.0625rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  calcUnit: { fontSize: '0.9rem', color: 'var(--text-muted)' },

  formulaBar: {
    background: '#f8fafc',
    borderTop: '1px solid var(--border-color)',
    borderRadius: '0 0 12px 12px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
  },
  formulaLabel: {
    fontSize: '0.9rem',
    color: 'white',
    background: 'var(--navy)',
    padding: '2px 10px',
    borderRadius: 999,
    fontWeight: 700,
    flexShrink: 0,
  },
  formulaText: {
    fontSize: '1.0625rem',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },

  cardFoot: {
    borderTop: '1px solid var(--border-color)',
  },
  addZoneBtnSm: {
    minHeight: 46,
    padding: '0 12px',
    border: `1px solid ${ADD_COLOR}`,
    background: '#fff',
    color: ADD_COLOR,
    borderRadius: 10,
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  subZoneBtnSm: {
    border: '1px solid var(--border-strong)',
    color: SUB_COLOR,
  },

  roomTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px 12px',
  },
  rtLabel: { fontSize: '0.9rem', color: 'var(--text-muted)' },
  rtVal: { fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' },

  addRoomBtn: {
    width: '100%',
    minHeight: 50,
    padding: '0 16px',
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    fontSize: '1.0625rem',
    fontWeight: 700,
    cursor: 'pointer',
  },

  grandTotal: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: '18px',
    boxShadow: 'var(--shadow-sm)',
  },
  gtTitle: {
    fontSize: '1.15rem',
    color: 'var(--text-main)',
    fontWeight: 800,
    marginBottom: 12,
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
    minHeight: 44,
    padding: '0 12px',
    borderRadius: 8,
    background: '#f8fafc',
  },
  gtRoomLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  gtBadge: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    color: 'white',
    fontSize: '0.9rem',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gtRoomName: { fontSize: '1.0625rem', fontWeight: 700 },
  gtVal: { fontSize: '1.0625rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  gtFinal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid var(--border-color)',
    paddingTop: 12,
  },
  gtFinalLabel: { fontSize: '1.0625rem', color: 'var(--text-muted)', fontWeight: 700 },
  gtFinalVal: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' },
}
