import React from 'react';

function PrivateTutorDetailView({ tutor, onBack }) {
  const { name, id, status, reportDate, address, teachingPlace, teachingPlaceType, education, phone, mobile, email, subjects } = tutor;

  const openNaverMap = (addr) => {
    if (!addr) return;
    window.open(`https://map.naver.com/v5/search/${encodeURIComponent(addr)}`, '_blank');
  };

  const locationBadge = address?.includes('하남시')
    ? { text: '하남', bg: '#E8F4FD', color: '#2563EB' }
    : address?.includes('광주시')
    ? { text: '광주', bg: '#DCFCE7', color: '#16A34A' }
    : null;

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '16px 16px 60px', fontFamily: 'inherit' }}>
      {/* 뒤로가기 */}
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer',
          marginBottom: '16px', padding: '0'
        }}
      >
        ← 목록으로
      </button>

      {/* 헤더 카드 */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '20px',
        border: '1px solid var(--border-color)', padding: '20px 20px 16px',
        marginBottom: '12px', boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{
            padding: '3px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '800',
            background: '#FFF7ED', color: '#D97706', border: '1px solid #FED7AA'
          }}>과외</span>
          {locationBadge && (
            <span style={{
              padding: '3px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700',
              background: locationBadge.bg, color: locationBadge.color
            }}>{locationBadge.text}</span>
          )}
          <span style={{
            padding: '3px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700',
            background: status === '신고' ? '#ECFDF5' : '#FEF2F2',
            color: status === '신고' ? '#059669' : '#DC2626'
          }}>{status}</span>
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--text-main)', margin: '0 0 4px' }}>
          {name}
        </h2>

        {id && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            신고번호 {id}
          </div>
        )}

        {/* 주소 */}
        {address && (
          <div
            onClick={() => openNaverMap(address)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '10px 14px', background: 'var(--bg-light)',
              borderRadius: '10px', cursor: 'pointer', marginBottom: '8px'
            }}
          >
            <span style={{ fontSize: '1rem' }}>📍</span>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '2px' }}>교습자 주소</div>
              <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--primary)', textDecoration: 'underline', textDecorationColor: 'var(--primary-glow)' }}>
                {address}
              </div>
            </div>
          </div>
        )}

        {/* 교습장소 (주소와 다를 때만) */}
        {teachingPlace && teachingPlace !== address && (
          <div
            onClick={() => openNaverMap(teachingPlace)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '10px 14px', background: 'var(--bg-light)',
              borderRadius: '10px', cursor: 'pointer', marginBottom: '8px'
            }}
          >
            <span style={{ fontSize: '1rem' }}>🏫</span>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '2px' }}>
                교습장소{teachingPlaceType ? ` (${teachingPlaceType})` : ''}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--primary)', textDecoration: 'underline' }}>
                {teachingPlace}
              </div>
            </div>
          </div>
        )}

        {/* 연락처 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
          {education && (
            <span style={{ padding: '4px 12px', background: 'var(--bg-light)', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              학력: <b style={{ color: 'var(--text-main)' }}>{education}</b>
            </span>
          )}
          {reportDate && (
            <span style={{ padding: '4px 12px', background: 'var(--bg-light)', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              신고일: <b style={{ color: 'var(--text-main)' }}>{reportDate}</b>
            </span>
          )}
          {phone && (
            <span style={{ padding: '4px 12px', background: 'var(--bg-light)', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              ☎ {phone}
            </span>
          )}
          {mobile && (
            <span style={{ padding: '4px 12px', background: 'var(--bg-light)', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              📱 {mobile}
            </span>
          )}
          {email && (
            <span style={{ padding: '4px 12px', background: 'var(--bg-light)', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              ✉ {email}
            </span>
          )}
        </div>
      </div>

      {/* 교습 과목 */}
      {subjects && subjects.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '20px',
          border: '1px solid var(--border-color)', padding: '16px 20px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📋 교습 과목
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {subjects.map((s, i) => (
              <div key={i} style={{
                padding: '12px 14px', borderRadius: '12px',
                background: 'var(--bg-light)', border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: s.fee ? '6px' : '0' }}>
                  {s.field && (
                    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', background: '#EDE9FE', color: '#7C3AED' }}>
                      {s.field}
                    </span>
                  )}
                  {s.series && (
                    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', background: '#E0F2FE', color: '#0284C7' }}>
                      {s.series}
                    </span>
                  )}
                  {s.schoolLevel && (
                    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', background: '#FEF3C7', color: '#D97706' }}>
                      {s.schoolLevel}
                    </span>
                  )}
                  <span style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    {s.subject || s.course}
                  </span>
                </div>

                {(s.fee || s.capacity) && (
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                    {s.fee && <span>수강료 <b style={{ color: 'var(--text-main)' }}>{Number(s.fee.replace(/,/g, '')).toLocaleString()}원</b></span>}
                    {s.capacity && <span>수강인원 <b style={{ color: 'var(--text-main)' }}>{s.capacity}명</b></span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PrivateTutorDetailView;
