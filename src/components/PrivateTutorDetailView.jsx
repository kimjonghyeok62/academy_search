import React, { useState, useMemo } from 'react';

const TABS = [
  { id: 'status', label: '현황' },
  { id: 'place', label: '교습장소' },
  { id: 'tuition', label: '교습비' },
  { id: 'inspection', label: '지도점검' },
];

function InfoRow({ label, value, children }) {
  if (!value && !children) return null;
  return (
    <div style={{
      display: 'flex', gap: '8px', padding: '10px 0',
      borderBottom: '1px solid var(--border-color)'
    }}>
      <span style={{
        fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '600',
        minWidth: '90px', flexShrink: 0
      }}>{label}</span>
      <span style={{ fontSize: '0.88rem', color: 'var(--text-main)', fontWeight: '600', flex: 1 }}>
        {children || value}
      </span>
    </div>
  );
}

function MapButton({ addr, label }) {
  if (!addr) return null;
  return (
    <button
      onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(addr)}`, '_blank')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem',
        fontWeight: '700', cursor: 'pointer', border: '1px solid var(--border-color)',
        background: 'var(--bg-light)', color: 'var(--text-muted)',
        transition: 'all 0.15s'
      }}
      onMouseOver={e => { e.currentTarget.style.background = '#E8F4FD'; e.currentTarget.style.color = '#2563EB'; }}
      onMouseOut={e => { e.currentTarget.style.background = 'var(--bg-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      🗺️ {label || '지도보기'}
    </button>
  );
}

function PrivateTutorDetailView({ tutor, onBack, allTutors = [] }) {
  const [activeTab, setActiveTab] = useState('status');

  const {
    name, id, status, reportDate, address, teachingPlace, teachingPlaceType,
    education, phone, mobile, email, subjects
  } = tutor;

  const locationBadge = address?.includes('하남시')
    ? { text: '하남', bg: '#E8F4FD', color: '#2563EB' }
    : address?.includes('광주시')
    ? { text: '광주', bg: '#DCFCE7', color: '#16A34A' }
    : null;

  // Same building tutors (match by road address before comma/unit)
  const sameBuildingTutors = useMemo(() => {
    if (!address) return [];
    const baseAddr = address.split(',')[0].trim();
    return allTutors.filter(t =>
      t.id !== id &&
      t.address &&
      t.address.split(',')[0].trim() === baseAddr
    );
  }, [address, id, allTutors]);

  // ── 현황 탭 ──────────────────────────────────────────
  const renderStatus = () => (
    <div>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px',
        border: '1px solid var(--border-color)',
        padding: '16px 18px', marginBottom: '12px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <h3 style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          기본정보
        </h3>
        <InfoRow label="신고번호" value={id} />
        <InfoRow label="신고일" value={reportDate} />
        <InfoRow label="상태">
          <span style={{
            padding: '2px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700',
            background: status === '신고' ? '#ECFDF5' : '#FEF2F2',
            color: status === '신고' ? '#059669' : '#DC2626'
          }}>{status}</span>
        </InfoRow>
        <InfoRow label="학력" value={education} />
        {phone && <InfoRow label="전화" value={`☎ ${phone}`} />}
        {mobile && <InfoRow label="휴대폰" value={`📱 ${mobile}`} />}
        {email && <InfoRow label="이메일" value={`✉ ${email}`} />}
      </div>

      {/* 주소 카드 */}
      {address && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '16px 18px', marginBottom: '12px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            주소
          </h3>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', flex: 1 }}>
              📍 {address}
            </div>
            <MapButton addr={address} label="지도" />
          </div>
        </div>
      )}

      {/* 같은 건물 과외교습자 */}
      {sameBuildingTutors.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '16px 18px', marginBottom: '12px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-muted)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🏠 같은 건물 과외교습자
            <span style={{
              padding: '1px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700',
              background: '#FFF7ED', color: '#D97706', border: '1px solid #FED7AA'
            }}>{sameBuildingTutors.length}명</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sameBuildingTutors.map(t => (
              <div key={t.id} style={{
                padding: '10px 12px', borderRadius: '10px',
                background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '2px' }}>{t.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                    {t.subjects?.map(s => s.subject).filter(Boolean).join(', ') || '과목 미상'}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700',
                  background: t.status === '신고' ? '#ECFDF5' : '#FEF2F2',
                  color: t.status === '신고' ? '#059669' : '#DC2626',
                  flexShrink: 0
                }}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── 교습장소 탭 ──────────────────────────────────────
  const renderPlace = () => (
    <div>
      {address && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '16px 18px', marginBottom: '12px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            교습자 주소
          </h3>
          <div style={{
            padding: '12px 14px', background: 'var(--bg-light)',
            borderRadius: '10px', marginBottom: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>📍</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  {address}
                </div>
                <MapButton addr={address} label="네이버지도로 보기" />
              </div>
            </div>
          </div>
        </div>
      )}

      {teachingPlace && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '16px 18px', marginBottom: '12px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            교습장소
            {teachingPlaceType && (
              <span style={{
                marginLeft: '8px', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem',
                fontWeight: '700', background: '#EDE9FE', color: '#7C3AED',
                textTransform: 'none', letterSpacing: 'normal'
              }}>{teachingPlaceType}</span>
            )}
          </h3>
          <div style={{
            padding: '12px 14px', background: 'var(--bg-light)',
            borderRadius: '10px', marginBottom: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>🏫</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  {teachingPlace}
                </div>
                <MapButton addr={teachingPlace} label="네이버지도로 보기" />
              </div>
            </div>
          </div>
          {teachingPlaceType && (
            <div style={{
              padding: '10px 12px', borderRadius: '10px',
              background: '#EDE9FE20', border: '1px solid #EDE9FE',
              fontSize: '0.8rem', color: '#7C3AED', fontWeight: '600'
            }}>
              {teachingPlaceType === '교습자주거지' && '📌 교습자 주거지에서 교습이 이루어집니다.'}
              {teachingPlaceType === '학습자주거지' && '📌 학습자 주거지에서 교습이 이루어집니다.'}
              {teachingPlaceType !== '교습자주거지' && teachingPlaceType !== '학습자주거지' && `📌 교습장소 유형: ${teachingPlaceType}`}
            </div>
          )}
        </div>
      )}

      {!address && !teachingPlace && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px',
          border: '1px solid var(--border-color)', padding: '40px 20px',
          textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem'
        }}>
          교습장소 정보가 없습니다.
        </div>
      )}
    </div>
  );

  // ── 교습비 탭 ──────────────────────────────────────
  const renderTuition = () => (
    <div>
      {subjects && subjects.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {subjects.map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)', borderRadius: '16px',
              border: '1px solid var(--border-color)',
              padding: '16px 18px', boxShadow: 'var(--shadow-sm)'
            }}>
              {/* Badges row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {s.field && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700',
                    background: '#EDE9FE', color: '#7C3AED'
                  }}>{s.field}</span>
                )}
                {s.series && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700',
                    background: '#E0F2FE', color: '#0284C7'
                  }}>{s.series}</span>
                )}
                {s.schoolLevel && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700',
                    background: '#FEF3C7', color: '#D97706'
                  }}>{s.schoolLevel}</span>
                )}
              </div>

              {/* Subject name */}
              <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '12px' }}>
                {s.subject || s.course || '-'}
              </div>

              {/* Fee / capacity */}
              <div style={{
                display: 'flex', gap: '16px', flexWrap: 'wrap',
                padding: '10px 12px', background: 'var(--bg-light)',
                borderRadius: '10px', fontSize: '0.85rem'
              }}>
                {s.fee ? (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '2px' }}>수강료</div>
                    <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--primary)' }}>
                      {Number(s.fee.toString().replace(/,/g, '')).toLocaleString()}원
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '2px' }}>수강료</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-muted)' }}>-</div>
                  </div>
                )}
                {s.capacity && (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '2px' }}>수강인원</div>
                    <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)' }}>
                      {s.capacity}명
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px',
          border: '1px solid var(--border-color)', padding: '40px 20px',
          textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem'
        }}>
          교습비 정보가 없습니다.
        </div>
      )}
    </div>
  );

  // ── 지도점검 탭 ──────────────────────────────────────
  const renderInspection = () => (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '16px',
      border: '1px solid var(--border-color)', padding: '40px 20px',
      textAlign: 'center', boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📋</div>
      <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
        지도점검 이력
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
        추후 데이터 연동 예정입니다.
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', fontFamily: 'inherit' }}>

      {/* Sticky top header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        padding: '12px 16px 0',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer',
            marginBottom: '10px', padding: '0'
          }}
        >
          ← 목록으로
        </button>

        {/* Name + badges */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
            <span style={{
              padding: '3px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800',
              background: '#FFF7ED', color: '#D97706', border: '1px solid #FED7AA'
            }}>과외</span>
            {locationBadge && (
              <span style={{
                padding: '3px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700',
                background: locationBadge.bg, color: locationBadge.color
              }}>{locationBadge.text}</span>
            )}
            <span style={{
              padding: '3px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700',
              background: status === '신고' ? '#ECFDF5' : '#FEF2F2',
              color: status === '신고' ? '#059669' : '#DC2626'
            }}>{status}</span>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-main)', margin: '0 0 2px' }}>
            {name}
          </h2>
          {id && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>
              신고번호 {id}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px 4px', border: 'none',
                background: 'none', fontSize: '0.85rem',
                fontWeight: activeTab === tab.id ? '800' : '600',
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s',
                marginBottom: '-1px', whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '16px 16px 80px' }}>
        {activeTab === 'status' && renderStatus()}
        {activeTab === 'place' && renderPlace()}
        {activeTab === 'tuition' && renderTuition()}
        {activeTab === 'inspection' && renderInspection()}
      </div>
    </div>
  );
}

export default PrivateTutorDetailView;
