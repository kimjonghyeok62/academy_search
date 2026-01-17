import { useState, useEffect } from 'react';
import DetailView from './components/DetailView';
import Login from './components/Login';
import { fetchGoogleSheetData, transformAcademyData, DATA_GID } from './utils/googleSheets';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [academies, setAcademies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAcademy, setSelectedAcademy] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Check auth on mount
  useEffect(() => {
    const cachedAuth = localStorage.getItem('academy_auth');
    if (cachedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    setLoading(true);
    try {
      const rawData = await fetchGoogleSheetData(DATA_GID);
      const transformed = transformAcademyData(rawData);
      setAcademies(transformed);
    } catch (err) {
      console.error(err);
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem('academy_auth', 'true');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('academy_auth');
    setAcademies([]);
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

  return (
    <div className="container">
      {selectedAcademy && (
        <DetailView
          academy={selectedAcademy}
          allAcademies={academies}
          onBack={() => setSelectedAcademy(null)}
          onSelectAcademy={(academy) => setSelectedAcademy(academy)}
        />
      )}

      <header className={`header animate-enter ${hasSearched ? 'header-compact' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <button
            onClick={handleLogout}
            className="clear-btn"
            style={{
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              width: 'auto',
              height: 'auto',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '600'
            }}
          >
            로그아웃
          </button>
        </div>
        <h1 className="title primary-gradient-text">학원 찾기</h1>
        <p className="subtitle">검색할 학원명, 등록번호, 주소, 또는 설립자명을 입력하세요</p>

        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="학원명, 등록번호, 설립자..."
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
              {suggestions.map((academy) => (
                <li
                  key={academy.id}
                  onClick={() => selectSuggestion(academy)}
                >
                  <span className="suggestion-name">{academy.name}</span>
                  <span className="suggestion-meta">{academy.founder.name}</span>
                </li>
              ))}
            </ul>
          )}
        </form>
      </header>

      <div className="results-list">
        {hasSearched && displayList.length > 0 ? (
          displayList.map((academy, index) => (
            <div
              key={academy.id + index}
              className="academy-card animate-enter"
              style={{ animationDelay: `${index * 0.05}s` }}
              onClick={() => setSelectedAcademy(academy)}
            >
              <div className="card-top">
                <span className="academy-id" style={{ color: 'var(--text-muted)' }}>No. {academy.id}</span>
                <span className="academy-category">{academy.category}</span>
              </div>
              <h3 className="academy-name">{academy.name}</h3>
              <p
                className="academy-address"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`https://map.naver.com/v5/search/${encodeURIComponent(academy.address)}`, '_blank');
                }}
                style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-color)' }}
                title="네이버 지도에서 보기"
              >
                {academy.address}
              </p>
              {academy.facilities?.floors && (
                <p style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                  marginBottom: '8px'
                }}>
                  (건물 전체층수: {academy.facilities.floors})
                </p>
              )}
              <div className="academy-meta">
                <span style={{ color: 'var(--text-muted)' }}>설립자: <b style={{ color: 'var(--text-main)' }}>{academy.founder.name}</b></span>
                <span style={{ color: 'var(--border-color)' }}>•</span>
                <span className={academy.status.includes('개원') ? 'status-active' : 'status-inactive'}>
                  {academy.status}
                </span>
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
    </div>
  );
}

export default App;
