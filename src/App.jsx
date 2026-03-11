import React, { useState, useEffect } from 'react';
import DetailView from './components/DetailView';
import Login from './components/Login';
import { fetchGoogleSheetData, transformAcademyData, fetchSheetName, fetchInspectionData, fetch2026InspectionData, fetchInstructorData, DATA_GID, GYOSEUPSO_GID } from './utils/googleSheets';
import './App.css';
import InspectionStandardAccordion from './components/InspectionStandardAccordion';
import InspectionPage from './components/InspectionPage';
import KakaoMapPage from './components/KakaoMapPage';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("DetailView error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: '20px', backgroundColor: 'pink', color: 'red' }}>
        <h3>Error in DetailView</h3>
        <pre>{this.state.error && this.state.error.toString()}</pre>
        <pre>{this.state.error && this.state.error.stack}</pre>
        <button onClick={() => this.props.onBack()}>Go Back</button>
      </div>;
    }
    return this.props.children;
  }
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('academy_auth_v2') === 'true';
  });
  const [academies, setAcademies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAcademy, setSelectedAcademy] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dataAsOf, setDataAsOf] = useState(''); // 데이터 기준일
  const [showLegalResources, setShowLegalResources] = useState(false); // 법령 자료 표시 여부
  const [showInspection, setShowInspection] = useState(false); // 지도점검 화면
  const [showMap, setShowMap] = useState(false); // 맵 화면
  const [detailOrigin, setDetailOrigin] = useState('main'); // 상세화면 진입 출처 ('main' 또는 'inspection' 또는 'map')

  // Clean up any old auth data on mount
  useEffect(() => {
    // Remove old localStorage auth (migration cleanup from older versions if any)
    localStorage.removeItem('academy_auth');
    sessionStorage.removeItem('academy_auth');
  }, []);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const CACHE_KEY = 'academy_data_v1';
  const CACHE_TTL = 30 * 60 * 1000; // 30분

  const mergeSupplementaryData = (rawData, inspectionMap, map2026, instructorMap) => {
    const fullAcademies = transformAcademyData(rawData, inspectionMap);
    fullAcademies.forEach(academy => {
      const normName = academy.name.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

      // 2026 점검 병합
      const records2026 = map2026.get(normName) || [];
      if (records2026.length > 0) {
        const existingDates = new Set(academy.inspections.map(r => r.date));
        const newRecords = records2026.filter(r => !existingDates.has(r.date));
        academy.inspections = [...academy.inspections, ...newRecords].sort((a, b) => {
          const toDate = str => {
            if (!str) return new Date(0);
            const d = new Date(str.replace(/\./g, '-'));
            return isNaN(d.getTime()) ? new Date(0) : d;
          };
          return toDate(b.date) - toDate(a.date);
        });
      }

      // 강사 데이터 병합
      academy.instructors = instructorMap.get(academy.id) || instructorMap.get(normName) || [];
    });
    return fullAcademies;
  };

  const loadData = async () => {
    // 1. 캐시 확인 (30분 내 데이터면 즉시 사용)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { academies: cachedAcademies, dataAsOf: cachedAsOf, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setAcademies(cachedAcademies);
          setDataAsOf(cachedAsOf);
          return;
        }
      }
    } catch (e) { /* 캐시 오류 무시 */ }

    setLoading(true);
    try {
      // 2. Phase 1: 핵심 데이터 먼저 로드 → 즉시 목록 표시
      const [academyData, gyoseupsoData] = await Promise.all([
        fetchGoogleSheetData(DATA_GID),
        fetchGoogleSheetData(GYOSEUPSO_GID),
      ]);
      const rawData = [...academyData, ...gyoseupsoData];
      setAcademies(transformAcademyData(rawData, new Map()));
      setLoading(false);

      // 3. Phase 2: 보조 데이터 백그라운드 로드 (점검·강사·시트명)
      const [sheetName, inspectionMap, map2026, instructorMap] = await Promise.all([
        fetchSheetName(),
        fetchInspectionData(),
        fetch2026InspectionData(),
        fetchInstructorData(),
      ]);
      const fullAcademies = mergeSupplementaryData(rawData, inspectionMap, map2026, instructorMap);
      setAcademies(fullAcademies);
      setDataAsOf(sheetName);

      // 4. 캐시 저장 (용량 초과 시 무시)
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          academies: fullAcademies,
          dataAsOf: sheetName,
          timestamp: Date.now(),
        }));
      } catch (e) { /* 용량 초과 무시 */ }
    } catch (err) {
      console.error(err);
      setError('데이터를 불러오는데 실패했습니다.');
      setLoading(false);
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    sessionStorage.setItem('academy_auth_v2', 'true');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAcademies([]);
    sessionStorage.removeItem('academy_auth_v2');
    sessionStorage.removeItem(CACHE_KEY);
  };

  // Search/Filter Logic with Priority
  const performSearch = (query) => {
    const normalize = (str) => (str ? str.toLowerCase().replace(/\s+/g, '') : '');
    const target = normalize(query);

    if (!target) return [];

    // Search across multiple fields: name, founder, address, id
    const results = academies.filter(academy => {
      const name = normalize(academy.name || '');
      const founder = normalize(academy.founder?.name || '');
      const address = normalize(academy.address || '');
      const id = normalize(academy.id || '');

      return name.includes(target) ||
        founder.includes(target) ||
        address.includes(target) ||
        id.includes(target);
    });

    // Sort by priority: name > founder > address > id
    results.sort((a, b) => {
      const aNorm = {
        name: normalize(a.name || ''),
        founder: normalize(a.founder?.name || ''),
        address: normalize(a.address || ''),
        id: normalize(a.id || '')
      };
      const bNorm = {
        name: normalize(b.name || ''),
        founder: normalize(b.founder?.name || ''),
        address: normalize(b.address || ''),
        id: normalize(b.id || '')
      };

      // Priority 1: Name match
      const aNameMatch = aNorm.name.includes(target);
      const bNameMatch = bNorm.name.includes(target);
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;

      // Priority 2: Founder match
      const aFounderMatch = aNorm.founder.includes(target);
      const bFounderMatch = bNorm.founder.includes(target);
      if (aFounderMatch && !bFounderMatch) return -1;
      if (!aFounderMatch && bFounderMatch) return 1;

      // Priority 3: Address match
      const aAddressMatch = aNorm.address.includes(target);
      const bAddressMatch = bNorm.address.includes(target);
      if (aAddressMatch && !bAddressMatch) return -1;
      if (!aAddressMatch && bAddressMatch) return 1;

      // Priority 4: ID match (lowest priority)
      const aIdMatch = aNorm.id.includes(target);
      const bIdMatch = bNorm.id.includes(target);
      if (aIdMatch && !bIdMatch) return -1;
      if (!aIdMatch && bIdMatch) return 1;

      // If same priority, sort by name alphabetically
      return aNorm.name.localeCompare(bNorm.name);
    });

    return results;
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      setHasSearched(false);
      return;
    }

    const normalizedValue = value.toLowerCase().replace(/\s+/g, '');

    // Search across all fields: name, founder, address, id
    const matched = academies.filter(academy => {
      const name = (academy.name || '').toLowerCase().replace(/\s+/g, '');
      const founder = (academy.founder?.name || '').toLowerCase().replace(/\s+/g, '');
      const address = (academy.address || '').toLowerCase().replace(/\s+/g, '');
      const id = (academy.id || '').toLowerCase().replace(/\s+/g, '');

      return name.includes(normalizedValue) ||
        founder.includes(normalizedValue) ||
        address.includes(normalizedValue) ||
        id.includes(normalizedValue);
    });

    // Sort by priority: name > founder > address > id
    matched.sort((a, b) => {
      const aNorm = {
        name: (a.name || '').toLowerCase().replace(/\s+/g, ''),
        founder: (a.founder?.name || '').toLowerCase().replace(/\s+/g, ''),
        address: (a.address || '').toLowerCase().replace(/\s+/g, ''),
        id: (a.id || '').toLowerCase().replace(/\s+/g, '')
      };
      const bNorm = {
        name: (b.name || '').toLowerCase().replace(/\s+/g, ''),
        founder: (b.founder?.name || '').toLowerCase().replace(/\s+/g, ''),
        address: (b.address || '').toLowerCase().replace(/\s+/g, ''),
        id: (b.id || '').toLowerCase().replace(/\s+/g, '')
      };

      // Priority 1: Name match (starts with > contains)
      const aNameMatch = aNorm.name.includes(normalizedValue);
      const bNameMatch = bNorm.name.includes(normalizedValue);
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;

      if (aNameMatch && bNameMatch) {
        const aNameStarts = aNorm.name.startsWith(normalizedValue);
        const bNameStarts = bNorm.name.startsWith(normalizedValue);
        if (aNameStarts && !bNameStarts) return -1;
        if (!aNameStarts && bNameStarts) return 1;
      }

      // Priority 2: Founder match
      const aFounderMatch = aNorm.founder.includes(normalizedValue);
      const bFounderMatch = bNorm.founder.includes(normalizedValue);
      if (aFounderMatch && !bFounderMatch) return -1;
      if (!aFounderMatch && bFounderMatch) return 1;

      // Priority 3: Address match
      const aAddressMatch = aNorm.address.includes(normalizedValue);
      const bAddressMatch = bNorm.address.includes(normalizedValue);
      if (aAddressMatch && !bAddressMatch) return -1;
      if (!aAddressMatch && bAddressMatch) return 1;

      // Priority 4: ID match
      const aIdMatch = aNorm.id.includes(normalizedValue);
      const bIdMatch = bNorm.id.includes(normalizedValue);
      if (aIdMatch && !bIdMatch) return -1;
      if (!aIdMatch && bIdMatch) return 1;

      // Same priority: alphabetical by name
      return aNorm.name.localeCompare(bNorm.name);
    });

    // Limit to top 10 for performance
    setSuggestions(matched.slice(0, 10));
    setShowSuggestions(true);
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setHasSearched(true);
    setShowSuggestions(false);
  };

  const selectSuggestion = (academy) => {
    setSearchQuery(academy.name);
    setShowSuggestions(false);
    setHasSearched(true);
    setDetailOrigin('main');
    setSelectedAcademy(academy);
  };

  // 주소에서 기본 주소(도로명 + 번지수)만 추출하는 함수
  const cleanAddress = (address) => {
    if (!address) return '';

    // 1. 쉼표가 있으면 쉼표 이전 부분만 사용
    const commaIndex = address.indexOf(',');
    let baseAddress = commaIndex !== -1 ? address.substring(0, commaIndex).trim() : address.trim();

    // 2. 쉼표가 없는 경우, "도로명 + 번지수" 패턴 추출
    // 예: "경기도 하남시 위례학암로 52 3층" -> "경기도 하남시 위례학암로 52"
    // 패턴: 숫자 뒤에 공백이 있고 그 다음에 층/호/동 등이 오는 경우
    const match = baseAddress.match(/^(.+?[로길]\s+\d+(?:-\d+)?)/);
    if (match) {
      return match[1].trim();
    }

    return baseAddress;
  };

  // 주소에서 지역 정보 추출 및 배지 스타일 반환
  const getLocationBadge = (address) => {
    if (!address) return null;

    if (address.includes('하남시')) {
      return {
        text: '하남',
        bgColor: '#E8F4FD',
        textColor: '#2563EB'
      };
    } else if (address.includes('광주시')) {
      return {
        text: '광주',
        bgColor: '#DCFCE7',
        textColor: '#16A34A'
      };
    }
    return null;
  };

  // Render Login if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Render Loading
  if (loading) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-enter" style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--primary-glow)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px auto'
          }}></div>
          <p style={{ color: 'var(--text-muted)', fontWeight: '500' }}>데이터를 불러오는 중입니다...</p>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const displayList = hasSearched ? performSearch(searchQuery) : [];

  // 지도점검 화면
  if (showInspection) {
    return (
      <InspectionPage
        onBack={() => setShowInspection(false)}
        academies={academies}
        onSelectAcademy={(academy) => {
          setDetailOrigin('inspection');
          setShowInspection(false);
          setSelectedAcademy(academy);
        }}
      />
    );
  }

  // 맵 화면
  if (showMap) {
    return (
      <KakaoMapPage
        academies={academies}
        onBack={() => setShowMap(false)}
        onSelectAcademy={(academy) => {
          setDetailOrigin('map');
          setShowMap(false);
          setSelectedAcademy(academy);
        }}
      />
    );
  }

  return (
    <div className="container">
      {selectedAcademy && (
        <ErrorBoundary onBack={() => {
          setSelectedAcademy(null);
          if (detailOrigin === 'inspection') setShowInspection(true);
        }}>
          <DetailView
            academy={selectedAcademy}
            allAcademies={academies}
            onBack={() => {
              setSelectedAcademy(null);
              if (detailOrigin === 'inspection') setShowInspection(true);
              if (detailOrigin === 'map') setShowMap(true);
            }}
            onSelectAcademy={(academy) => setSelectedAcademy(academy)}
          />
        </ErrorBoundary>
      )}

      <header className={`header animate-enter ${hasSearched ? 'header-compact' : ''}`}>
        <h1
          className="title primary-gradient-text"
          onClick={() => {
            setSearchQuery('');
            setHasSearched(false);
            setSuggestions([]);
            setSelectedAcademy(null);
            setShowInspection(false);
            setShowMap(false);
            setDetailOrigin('main');
          }}
          style={{ cursor: 'pointer' }}
          title="초기 화면으로 이동"
        >
          학원 교습소 관리
        </h1>

        {/* 시트연결, 기준일, 로그아웃 버튼을 한 줄에 배치 */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: '12px',
          position: 'relative'
        }}>
          {/* 시트 버튼 (삭제됨) */}

          {/* 기준일 (중앙) */}
          {dataAsOf && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              fontSize: '0.8rem',
              fontWeight: '600',
              color: 'var(--text-muted)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>{dataAsOf}</span>
            </div>
          )}

          {/* 로그아웃 버튼 (오른쪽) */}
          <button
            onClick={handleLogout}
            style={{
              position: 'absolute',
              right: '0',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: '500',
              cursor: 'pointer',
              textDecoration: 'underline',
              textDecorationColor: 'var(--border-color)',
              padding: '0',
              transition: 'color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.color = 'var(--primary)'}
            onMouseOut={(e) => e.target.style.color = 'var(--text-muted)'}
          >
            로그아웃
          </button>
        </div>

        <p className="subtitle">검색할 학원(교습소)명, 주소, 운영자를 입력하세요</p>

        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="학원(교습소)명, 주소, 운영자..."
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={() => searchQuery && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          {searchQuery && (
            <button type="button" className="clear-btn" onClick={() => {
              setSearchQuery('');
              setHasSearched(false);
              setSuggestions([]);
            }}>×</button>
          )}

          {showSuggestions && suggestions.length > 0 && (
            <ul className="suggestions-dropdown">
              {suggestions.map((academy) => {
                const locationBadge = getLocationBadge(academy.address);
                return (
                  <li
                    key={academy.id + academy.category}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevents the input from losing focus before the click is registered
                      selectSuggestion(academy);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <span className="suggestion-name">{academy.name}</span>
                      {locationBadge && (
                        <span style={{
                          padding: '3px 10px',
                          backgroundColor: locationBadge.bgColor,
                          color: locationBadge.textColor,
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          whiteSpace: 'nowrap'
                        }}>
                          {locationBadge.text}
                        </span>
                      )}
                    </div>
                    <span className="suggestion-meta">{academy.founder.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </form>
      </header>

      <div className="results-list" style={{ paddingBottom: (hasSearched || searchQuery) ? '60px' : '0px' }}>
        {hasSearched && displayList.length > 0 ? (
          displayList.map((academy, index) => (
            <div
              key={academy.id + academy.category + index}
              className="academy-card animate-enter"
              style={{ animationDelay: `${index * 0.05}s` }}
              onClick={() => {
                setDetailOrigin('main');
                setSelectedAcademy(academy);
              }}
            >
              <div className="card-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="academy-id" style={{ color: 'var(--text-muted)' }}>No. {academy.id}</span>
                </div>
                <span className="academy-category">{academy.category}</span>
              </div>
              <h3 className="academy-name">{academy.name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <p
                  className="academy-address"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`https://map.naver.com/v5/search/${encodeURIComponent(academy.address)}`, '_blank');
                  }}
                  style={{
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textDecorationColor: 'var(--border-color)',
                    margin: 0,
                    flex: 1
                  }}
                  title="네이버 지도에서 보기"
                >
                  {academy.address}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`https://map.naver.com/v5/search/${encodeURIComponent(academy.address)}`, '_blank');
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '4px 8px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: 'var(--shadow-sm)',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                    e.currentTarget.style.borderColor = 'var(--primary)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                  title="네이버 지도에서 보기"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <span>지도</span>
                </button>
              </div>

              <div className="academy-meta">
                <span style={{ color: 'var(--text-muted)' }}>설립자: <b style={{ color: 'var(--text-main)' }}>{academy.founder.name}</b></span>
                <span style={{ color: 'var(--border-color)' }}>•</span>
                {(() => {
                  const locationBadge = getLocationBadge(academy.address);
                  return locationBadge ? (
                    <span style={{
                      padding: '4px 12px',
                      backgroundColor: locationBadge.bgColor,
                      color: locationBadge.textColor,
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: '600'
                    }}>
                      {locationBadge.text}
                    </span>
                  ) : (
                    <span className={academy.status.includes('개원') ? 'status-active' : 'status-inactive'}>
                      {academy.status}
                    </span>
                  );
                })()}
                <span style={{ color: 'var(--border-color)' }}>•</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const searchQuery = `${academy.name} ${cleanAddress(academy.address)}`;
                    window.open(`https://map.naver.com/v5/search/${encodeURIComponent(searchQuery)}`, '_blank');
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: '#5FD68A',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 3px rgba(95, 214, 138, 0.3)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#4EC57A';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(95, 214, 138, 0.4)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#5FD68A';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(95, 214, 138, 0.3)';
                  }}
                  title="네이버 플레이스에서 보기"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  <span>네이버</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          hasSearched && (
            <div className="no-results animate-enter" style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
              <p>검색 결과가 없습니다.</p>
            </div>
          )
        )}
      </div>

      {/* 하단 섹션: AI 상담 및 법령 자료 */}
      {!hasSearched && !searchQuery && (
        <div style={{ marginTop: '0px', paddingBottom: '32px' }}>
          {/* NotebookLM AI 상담 링크 */}
          <div
            onClick={() => window.open('https://notebooklm.google.com/notebook/bc3a0bc5-bad0-4450-bf8b-96573e39fdce', '_blank')}
            style={{
              padding: '12px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(0,0,0,0.05)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}>
                💡
              </div>
              <span style={{
                fontSize: '1rem',
                fontWeight: '700',
                color: 'var(--text-main)'
              }}>
                학원 업무 AI 상담 (노트북LM)
              </span>
            </div>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'var(--bg-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </div>
          </div>

          {/* 관련 법령 자료 섹션 */}
          <div style={{ marginTop: '10px' }}>
            {/* 접기/펼치기 헤더 */}
            <div
              onClick={() => setShowLegalResources(!showLegalResources)}
              style={{
                padding: '12px 16px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '14px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(0,0,0,0.05)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#e0e7ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}>
                  📚
                </div>
                <span style={{
                  fontSize: '1rem',
                  fontWeight: '700',
                  color: 'var(--text-main)'
                }}>
                  관련 법령 자료 보기
                </span>
              </div>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'var(--bg-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-muted)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: showLegalResources ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s'
                  }}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>

            {/* 펼쳐진 내용 */}
            {showLegalResources && (
              <div
                className="animate-enter"
                style={{
                  marginTop: '12px',
                  padding: '20px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {/* 업무 메뉴얼 */}
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    color: 'var(--text-main)',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>📚</span>
                    <span>업무 메뉴얼</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <a
                      href="https://drive.google.com/file/d/1I6j4VkHEeDzKc6YvfTcv8Wl48LAzbSsN/preview"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 경기도교육청 학원 업무 메뉴얼</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                    <a
                      href="https://drive.google.com/file/d/1ppixrFV1wEFBXTicg_-muU81mn8Gvn8E/preview"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 서울특별시교육청 학원 업무 메뉴얼</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  </div>
                </div>

                {/* 주요 법령 */}
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    color: 'var(--text-main)',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>📖</span>
                    <span>주요 법령</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <a
                      href="https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 학원의 설립·운영 및 과외교습에 관한 법률 (학원법)</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                    <a
                      href="https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률시행령"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 학원법 시행령</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                    <a
                      href="https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률시행규칙"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 학원법 시행규칙</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  </div>
                </div>

                {/* 경기도 조례 */}
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    color: 'var(--text-main)',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>🏛️</span>
                    <span>지방 조례 (경기도)</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <a
                      href="https://www.law.go.kr/자치법규/경기도학원의설립ㆍ운영및과외교습에관한조례/(7741,20230807)"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 경기도 학원 조례</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                    <a
                      href="https://www.law.go.kr/자치법규/경기도학원의설립ㆍ운영및과외교습에관한조례시행규칙/(980,20250901)"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 경기도 학원 조례 시행규칙</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  </div>
                </div>

                {/* 관련 법령 */}
                <div>
                  <h4 style={{
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    color: 'var(--text-main)',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>⚖️</span>
                    <span>관련 법령</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <a
                      href="https://www.law.go.kr/법령/교육환경보호에관한법률"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 교육환경 보호에 관한 법률</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                    <a
                      href="https://www.law.go.kr/법령/아동복지법"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 아동복지법</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                    <a
                      href="https://www.law.go.kr/법령/질서위반행위규제법"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 질서위반행위규제법</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                    <a
                      href="https://www.law.go.kr/법령/민원처리에관한법률"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = 'var(--primary-glow)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                      }}
                    >
                      <span>• 민원처리에 관한 법률</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 행정처분/과태료 1차 적발 기준 아코디언 */}
          <div style={{ marginTop: '10px' }}>
            <InspectionStandardAccordion />
          </div>

          {/* 지도점검 버튼 */}
          <div
            onClick={() => setShowInspection(true)}
            style={{
              marginTop: '10px',
              padding: '12px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#1e3a8a';
              e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(30,58,138,0.1)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}>
                📊
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  지도점검 업무관리
                </div>
              </div>
            </div>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'var(--bg-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 1
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </div>

          {/* 학원 교습소 지도 버튼 */}
          <div
            onClick={() => setShowMap(true)}
            style={{
              marginTop: '10px',
              padding: '12px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#10b981';
              e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(16,185,129,0.1)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}>
                🗺️
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  학원 교습소 지도
                </div>
              </div>
            </div>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'var(--bg-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 1
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
