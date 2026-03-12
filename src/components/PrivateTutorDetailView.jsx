import React, { useState, useMemo, useRef, useEffect } from 'react';
import './DetailView.css';

const TABS = [
  { id: 'status',     label: '현황' },
  { id: 'place',      label: '교습장소' },
  { id: 'tuition',    label: '교습비' },
  { id: 'inspection', label: '지도점검' },
];

function InfoRow({ label, value, children, isClickable, onClick }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span
        className={`info-value${isClickable ? ' clickable' : ''}`}
        onClick={isClickable ? onClick : undefined}
        style={isClickable ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-color)' } : {}}
      >
        {children || value || '-'}
      </span>
    </div>
  );
}

function Section({ title, children, rightButton }) {
  return (
    <div className="info-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: rightButton ? '16px' : '0' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {rightButton}
      </div>
      {children}
    </div>
  );
}

// Extract base road address (up to road number, stripping unit/dong/ho info)
function getBaseAddress(address) {
  if (!address) return '';
  const match = address.match(/^(.+?[시군구]\s+.+?[로길]\s+\d+)/);
  return match ? match[1].trim() : address.split(',')[0].trim();
}

// Extract sort key from address: dong*10000 + ho (ascending)
function extractHoSortKey(address) {
  if (!address) return 999999;
  const dongHo = address.match(/(\d+)동\s*(\d+)호/);
  if (dongHo) return parseInt(dongHo[1]) * 10000 + parseInt(dongHo[2]);
  const alphaHo = address.match(/[A-Za-z](\d+)호/);
  if (alphaHo) return parseInt(alphaHo[1]);
  const ho = address.match(/(\d+)호/);
  if (ho) return parseInt(ho[1]);
  return 999999;
}

// Extract "동호수" display label from address
function extractUnitLabel(address) {
  if (!address) return '';
  const dongHo = address.match(/(\d+동\s*\d+호)/);
  if (dongHo) return dongHo[1].replace(/\s+/g, ' ');
  const alphaHo = address.match(/([A-Za-z]\d+호)/);
  if (alphaHo) return alphaHo[1];
  const ho = address.match(/(\d+호)/);
  if (ho) return ho[1];
  return '';
}

export default function PrivateTutorDetailView({ tutor, onBack, allTutors = [], onSelectTutor }) {
  const [activeTab, setActiveTab] = useState('status');
  const tabsRef = useRef(null);
  const contentRef = useRef(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const {
    name, id, status, reportDate, address, teachingPlace, teachingPlaceType,
    education, phone, mobile, email, subjects
  } = tutor;

  // Reset scroll + tab when tutor changes
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveTab('status');
  }, [tutor.id]);

  // Scroll active tab into view
  useEffect(() => {
    if (tabsRef.current) {
      const activeBtn = tabsRef.current.querySelector('.tab-btn.active');
      if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  // Swipe support
  const minSwipe = 50;
  const onTouchStart = (e) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
  const onTouchMove  = (e) => { setTouchEnd(e.targetTouches[0].clientX); };
  const onTouchEnd   = () => {
    if (!touchStart || !touchEnd) return;
    const dist = touchStart - touchEnd;
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (dist > minSwipe  && idx < TABS.length - 1) setActiveTab(TABS[idx + 1].id);
    if (dist < -minSwipe && idx > 0)               setActiveTab(TABS[idx - 1].id);
  };

  // Same-building tutors (include current tutor, sorted by ho number)
  const baseAddress = useMemo(() => getBaseAddress(address), [address]);
  const sameBuildingTutors = useMemo(() => {
    if (!address) return [];
    return allTutors
      .filter(t => t.address && getBaseAddress(t.address) === baseAddress)
      .sort((a, b) => extractHoSortKey(a.address) - extractHoSortKey(b.address));
  }, [address, baseAddress, allTutors]);

  // Naver map open
  const openMap = (addr) => {
    if (addr) window.open(`https://map.naver.com/v5/search/${encodeURIComponent(addr)}`, '_blank');
  };

  // Map address button (same style as academy 주소 button)
  const MapBtn = ({ addr }) => (
    <button
      onClick={(e) => { e.stopPropagation(); openMap(addr); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '3px',
        padding: '4px 8px', backgroundColor: 'var(--bg-card)', color: 'var(--primary)',
        border: '1px solid var(--border-color)', borderRadius: '6px',
        fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer',
        transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)', whiteSpace: 'nowrap'
      }}
      onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--primary-glow)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'var(--bg-card)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
      title="네이버 지도에서 보기"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
      <span>지도</span>
    </button>
  );

  // ── 현황 탭 ──────────────────────────────────────────
  const renderStatus = () => (
    <div className="tab-content animate-enter">
      <Section title="기본 정보">
        <InfoRow label="신고번호" value={id} />
        <InfoRow label="개인과외교습자명" value={name} />
        <InfoRow label="신고일" value={reportDate} />
        <InfoRow label="상태">
          <span style={{
            padding: '2px 10px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700',
            background: status === '신고' ? '#ECFDF5' : '#FEF2F2',
            color: status === '신고' ? '#059669' : '#DC2626'
          }}>{status || '-'}</span>
        </InfoRow>
        <InfoRow label="학력" value={education} />
        {phone  && <InfoRow label="전화"   value={phone} />}
        {mobile && <InfoRow label="휴대폰" value={mobile} />}
        {email  && <InfoRow label="이메일" value={email} />}
      </Section>

      <Section title="주소 정보">
        {address ? (
          <>
            <div className="info-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="info-label">교습자 주소</span>
                <MapBtn addr={address} />
              </div>
              <span
                className="info-value clickable"
                onClick={() => openMap(address)}
                style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-color)' }}
              >{address}</span>
            </div>
            {teachingPlace && teachingPlace !== address && (
              <div className="info-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="info-label">교습장소{teachingPlaceType ? ` (${teachingPlaceType})` : ''}</span>
                  <MapBtn addr={teachingPlace} />
                </div>
                <span
                  className="info-value clickable"
                  onClick={() => openMap(teachingPlace)}
                  style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-color)' }}
                >{teachingPlace}</span>
              </div>
            )}
          </>
        ) : (
          <div className="info-row"><span className="info-label">주소</span><span className="info-value">-</span></div>
        )}
      </Section>

      {sameBuildingTutors.length > 0 && (
        <Section title={`동일 건축물단지 개인과외교습자 목록 (${sameBuildingTutors.length}명)`}>
          {/* 📍 주소 박스 */}
          <div style={{
            fontSize: '0.9rem', color: 'var(--text-muted)',
            marginBottom: '16px', padding: '12px',
            backgroundColor: 'var(--bg-light)', borderRadius: '8px', lineHeight: '1.6'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <span style={{ fontSize: '1rem', marginTop: '2px' }}>📍</span>
              <div style={{ flex: 1, fontWeight: '500', color: 'var(--text-muted)' }}>
                {baseAddress}
              </div>
            </div>
          </div>

          {/* 목록 */}
          {sameBuildingTutors.map((t, idx) => {
            const isCurrent = t.id === id;
            const unitLabel = extractUnitLabel(t.address);
            // Collect unique subject category info for display
            const subjectParts = [];
            if (t.subjects?.length > 0) {
              const s0 = t.subjects[0];
              if (s0.field)       subjectParts.push(s0.field);
              if (s0.series)      subjectParts.push(s0.series);
              if (s0.schoolLevel) subjectParts.push(s0.schoolLevel);
            }
            const subjectNames = t.subjects?.map(s => s.subject).filter(Boolean).join(', ') || '';

            return (
              <div
                key={t.id}
                style={{
                  padding: '12px',
                  marginBottom: idx === sameBuildingTutors.length - 1 ? '0' : '12px',
                  border: isCurrent ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: '12px',
                  backgroundColor: isCurrent ? 'rgba(79, 70, 229, 0.05)' : 'var(--bg-card)',
                  cursor: isCurrent ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: 'var(--shadow-sm)',
                  position: 'relative'
                }}
                onClick={() => !isCurrent && onSelectTutor && onSelectTutor(t)}
                onMouseOver={e => {
                  if (!isCurrent) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-light)';
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }
                }}
                onMouseOut={e => {
                  if (!isCurrent) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }
                }}
              >
                {/* 이름 + 동호수 + 현재 뱃지 */}
                <div style={{
                  fontWeight: '700', color: 'var(--primary)',
                  marginBottom: '6px', fontSize: '1rem',
                  display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap'
                }}>
                  <span>{t.name}</span>
                  {unitLabel && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                      ({unitLabel})
                    </span>
                  )}
                  {isCurrent && (
                    <span style={{
                      fontSize: '0.75rem', color: 'white',
                      backgroundColor: 'var(--primary)',
                      padding: '2px 8px', borderRadius: '6px', fontWeight: '600'
                    }}>현재 보는 개인과외교습자</span>
                  )}
                </div>

                {/* 분야·계열·학교급 */}
                {subjectParts.length > 0 && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {subjectParts.join(' · ')}
                  </div>
                )}

                {/* 교습과목 */}
                {subjectNames && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {subjectNames}
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      )}
    </div>
  );

  // ── 교습장소 탭 ──────────────────────────────────────
  const renderPlace = () => (
    <div className="tab-content animate-enter">
      {address ? (
        <Section title="교습자 주소">
          <div className="info-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="info-label">주소</span>
              <MapBtn addr={address} />
            </div>
            <span
              className="info-value clickable"
              onClick={() => openMap(address)}
              style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-color)' }}
            >{address}</span>
          </div>
        </Section>
      ) : null}

      {teachingPlace ? (
        <Section
          title="교습장소"
          rightButton={teachingPlaceType ? (
            <span style={{
              padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700',
              background: '#EDE9FE', color: '#7C3AED', border: '1px solid #DDD6FE'
            }}>{teachingPlaceType}</span>
          ) : null}
        >
          <div className="info-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="info-label">장소</span>
              <MapBtn addr={teachingPlace} />
            </div>
            <span
              className="info-value clickable"
              onClick={() => openMap(teachingPlace)}
              style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-color)' }}
            >{teachingPlace}</span>
          </div>
          {teachingPlaceType && (
            <div style={{
              marginTop: '16px', padding: '12px', background: 'var(--bg-light)',
              borderRadius: '10px', fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: '500', lineHeight: '1.5'
            }}>
              {teachingPlaceType === '교습자주거지' && '📌 교습자 주거지에서 교습이 이루어집니다.'}
              {teachingPlaceType === '학습자주거지' && '📌 학습자 주거지에서 교습이 이루어집니다.'}
              {teachingPlaceType !== '교습자주거지' && teachingPlaceType !== '학습자주거지' && `📌 교습장소 유형: ${teachingPlaceType}`}
            </div>
          )}
        </Section>
      ) : null}

      {!address && !teachingPlace && (
        <div className="empty-msg">교습장소 정보가 없습니다.</div>
      )}
    </div>
  );

  // ── 교습비 탭 ──────────────────────────────────────
  const renderTuition = () => (
    <div className="tab-content animate-enter">
      {subjects && subjects.length > 0 ? (
        subjects.map((s, i) => (
          <div key={i} className="card-item">
            <div className="card-header">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {s.field && (
                  <span className="badge" style={{ background: '#EDE9FE', color: '#7C3AED' }}>{s.field}</span>
                )}
                {s.series && (
                  <span className="badge" style={{ background: '#E0F2FE', color: '#0284C7' }}>{s.series}</span>
                )}
                {s.schoolLevel && (
                  <span className="badge" style={{ background: '#FEF3C7', color: '#D97706' }}>{s.schoolLevel}</span>
                )}
              </div>
            </div>
            <h4 style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)' }}>
              {s.subject || s.course || '-'}
            </h4>
            <div className="info-row">
              <span className="info-label">수강료</span>
              <span className="info-value" style={{ color: 'var(--primary)', fontWeight: '700' }}>
                {s.fee
                  ? `${Number(s.fee.toString().replace(/,/g, '')).toLocaleString()}원`
                  : '-'}
              </span>
            </div>
            {s.capacity && (
              <div className="info-row">
                <span className="info-label">수강인원</span>
                <span className="info-value">{s.capacity}명</span>
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="empty-msg">교습비 정보가 없습니다.</div>
      )}
    </div>
  );

  // ── 지도점검 탭 ──────────────────────────────────────
  const renderInspection = () => (
    <div className="tab-content animate-enter">
      <div className="empty-msg" style={{ paddingTop: '80px' }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📋</div>
        <div style={{ fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>지도점검 이력</div>
        <div style={{ fontSize: '0.85rem' }}>추후 데이터 연동 예정입니다.</div>
      </div>
    </div>
  );

  return (
    <div className="detail-view">
      {/* ── 헤더 ── */}
      <div className="detail-header">
        <button className="back-btn" onClick={onBack} title="목록으로">←</button>
        <h2 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{name}</h2>
      </div>

      {/* ── 탭 ── */}
      <div className="tabs-container" ref={tabsRef}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 콘텐츠 ── */}
      <div
        className="detail-content"
        ref={contentRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {activeTab === 'status'     && renderStatus()}
        {activeTab === 'place'      && renderPlace()}
        {activeTab === 'tuition'    && renderTuition()}
        {activeTab === 'inspection' && renderInspection()}
      </div>
    </div>
  );
}
