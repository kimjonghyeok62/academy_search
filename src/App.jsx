import React, { useState, useEffect, useRef } from 'react';
import DetailView from './components/DetailView';
import Login from './components/Login';
import PrivateTutorDetailView from './components/PrivateTutorDetailView';
import { fetchGoogleSheetData, transformAcademyData, fetchSheetName, fetchInspectionData, fetch2026InspectionData, fetchInstructorData, fetchAssistantData, fetchPrivateTutorData, DATA_GID, GYOSEUPSO_GID } from './utils/googleSheets';
import './App.css';
import InspectionStandardAccordion from './components/InspectionStandardAccordion';
import InspectionPage from './components/InspectionPage';
import KakaoMapPage from './components/KakaoMapPage';
import TuitionPrintPage from './components/TuitionPrintPage';

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
    return localStorage.getItem('academy_auth_v3') === 'true';
  });
  const [academies, setAcademies] = useState([]);
  const [privateTutors, setPrivateTutors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [supplementLoading, setSupplementLoading] = useState(false);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAcademy, setSelectedAcademy] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);
  const [dataAsOf, setDataAsOf] = useState(''); // 데이터 기준일
  const [showLegalResources, setShowLegalResources] = useState(false); // 법령 자료 표시 여부
  const [showInspection, setShowInspection] = useState(false); // 지도점검 화면
  const [inspectionInitialTab, setInspectionInitialTab] = useState(undefined); // 지도점검 초기 탭
  const [showMap, setShowMap] = useState(false); // 맵 화면
  const [detailOrigin, setDetailOrigin] = useState('main'); // 상세화면 진입 출처 ('main' 또는 'inspection' 또는 'map')
  const [focusAcademy, setFocusAcademy] = useState(null); // 지도에서 포커스할 학원
  const [mapReturnState, setMapReturnState] = useState(null); // 지도 진입 전 복귀 상태
  const [savedMapState, setSavedMapState] = useState(null); // 지도 위치/줌 복원용
  const [routeAcademies, setRouteAcademies] = useState(null); // 점검 경로 학원 목록
  const [showTuitionPrint, setShowTuitionPrint] = useState(false); // 교습비출력 화면
  const [backToast, setBackToast] = useState(false); // 뒤로가기 토스트
  const [detailInitialTab, setDetailInitialTab] = useState(undefined); // 상세화면 초기 탭
  const urlParamHandledRef = useRef(false); // URL 파라미터 1회 처리 플래그
  const [authError, setAuthError] = useState('');

  // 모바일 뒤로가기 처리용 ref
  const backHandlerRef = useRef(null);
  const isSubScreenRef = useRef(false);
  const lastBackPressRef = useRef(0);
  const backToastTimerRef = useRef(null);

  // Clean up any old auth data on mount + Google PKCE 리다이렉트 결과 처리
  useEffect(() => {
    localStorage.removeItem('academy_auth');
    sessionStorage.removeItem('academy_auth');

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const verifier = sessionStorage.getItem('pkce_verifier');
      sessionStorage.removeItem('pkce_verifier');
      window.history.replaceState({}, '', window.location.pathname);

      if (!verifier) {
        setAuthError('인증 세션이 만료됐습니다. 다시 시도해주세요.');
        return;
      }

      const redirectUri = sessionStorage.getItem('pkce_redirect_uri') || `${window.location.origin}/auth/callback`;
      sessionStorage.removeItem('pkce_redirect_uri');

      fetch('/api/auth-pkce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            setIsAuthenticated(true);
            localStorage.setItem('academy_auth_v3', 'true');
            if (data.email) localStorage.setItem('academy_auth_email', data.email);
          } else {
            setAuthError(data.error || '로그인에 실패했습니다.');
          }
        })
        .catch(() => setAuthError('인증 처리 중 오류가 발생했습니다.'));
    }
  }, []);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  // 현재 화면에 맞는 뒤로가기 핸들러를 ref에 동기화
  // 핸들러는 다음 화면이 서브화면인지 여부를 반환 (true = 서브화면 유지, false = 홈으로)
  useEffect(() => {
    if (showMap) {
      backHandlerRef.current = () => {
        setShowMap(false);
        setFocusAcademy(null);
        setRouteAcademies(null);
        setSavedMapState(null);
        if (mapReturnState) {
          if (mapReturnState.fromInspection) {
            setShowInspection(true);
            setMapReturnState(null);
            return true; // 점검화면으로 → 서브화면 유지
          } else {
            setSelectedAcademy(mapReturnState.academy);
            setDetailOrigin(mapReturnState.origin);
            setMapReturnState(null);
            return true; // 상세화면으로 → 서브화면 유지
          }
        }
        return false; // 홈으로
      };
    } else if (showInspection) {
      backHandlerRef.current = () => {
        setShowInspection(false);
        setInspectionInitialTab(undefined);
        return false; // 홈으로
      };
    } else if (showTuitionPrint) {
      backHandlerRef.current = () => {
        setShowTuitionPrint(false);
        return false; // 홈으로
      };
    } else if (selectedAcademy) {
      backHandlerRef.current = () => {
        const origin = detailOrigin;
        setSelectedAcademy(null);
        if (origin === 'inspection') { setShowInspection(true); return true; }
        if (origin === 'map') { setShowMap(true); return true; }
        return false; // 홈으로
      };
    } else {
      backHandlerRef.current = null;
    }
  }, [showMap, showInspection, showTuitionPrint, selectedAcademy, mapReturnState, detailOrigin]);

  // 모바일 여부 판별
  const isMobile = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

  // 서브 화면 최초 진입 시 history 버퍼 삽입 (모바일 전용)
  // popstate 핸들러가 직접 재삽입하므로, 여기서는 홈→서브 첫 진입만 처리
  useEffect(() => {
    if (!isMobile()) return;
    const isSubScreen = showInspection || showMap || showTuitionPrint || !!selectedAcademy;
    if (isSubScreen && !isSubScreenRef.current) {
      window.history.pushState({ appSub: true }, '');
      isSubScreenRef.current = true;
    } else if (!isSubScreen) {
      isSubScreenRef.current = false;
      lastBackPressRef.current = 0; // 홈 복귀 시 종료 타이머 리셋
    }
  }, [showInspection, showMap, showTuitionPrint, selectedAcademy]);

  // popstate 이벤트 처리 (모바일 뒤로가기 버튼 전용)
  useEffect(() => {
    if (!isMobile()) return;
    window.history.replaceState({ appHome: true }, '');

    const handlePopState = () => {
      if (backHandlerRef.current) {
        const staysInSubScreen = backHandlerRef.current();
        if (staysInSubScreen) {
          // 다음 화면도 서브화면 → 즉시 동기적으로 재삽입해 다음 뒤로가기도 잡을 수 있게
          window.history.pushState({ appSub: true }, '');
        }
        // 홈으로 가는 경우: isSubScreenRef는 위 effect에서 false로 설정됨
      } else {
        // 홈 화면: 1.5초 내 2번 빠르게 누르면 종료
        const now = Date.now();
        if (now - lastBackPressRef.current < 1500) {
          return; // 브라우저 기본 동작(앱 종료) 허용
        }
        lastBackPressRef.current = now;
        window.history.pushState({ appHome: true }, '');
        setBackToast(true);
        clearTimeout(backToastTimerRef.current);
        backToastTimerRef.current = setTimeout(() => setBackToast(false), 1500);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const CACHE_KEY = 'academy_data_v8'; // v8: 학원(폐원) 시트도 GID 방식으로 전환
  const CACHE_TTL = 30 * 60 * 1000; // 30분

  const mergeSupplementaryData = (rawData, inspectionMap, map2026, instructorMap, assistantMap) => {
    const fullAcademies = transformAcademyData(rawData, inspectionMap);
    fullAcademies.forEach(academy => {
      const normName = academy.name.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

      // 2026 점검 병합 (중복: 같은 날짜 + 같은 위반사항 + 같은 위반내역 기준, 1번 시트 우선)
      const records2026 = map2026.get(normName) || [];
      if (records2026.length > 0) {
        const existingKeys = new Set(
          academy.inspections.map(r =>
            `${r.date}__${(r.violationType || '').trim()}__${(r.violationDetail || '').trim()}`
          )
        );
        const newRecords = records2026.filter(r => {
          const key = `${r.date}__${(r.violationType || '').trim()}__${(r.violationDetail || '').trim()}`;
          return !existingKeys.has(key);
        });
        academy.inspections = [...academy.inspections, ...newRecords].sort((a, b) => {
          const toDate = str => {
            if (!str) return new Date(0);
            const d = new Date(str.replace(/\./g, '-'));
            return isNaN(d.getTime()) ? new Date(0) : d;
          };
          return toDate(b.date) - toDate(a.date);
        });
      }

      const isGyoseupso = (academy.category || '').includes('교습소');
      if (isGyoseupso) {
        // 교습소: 보조요원 데이터 병합
        academy.assistants = assistantMap.get(academy.id) || assistantMap.get(normName) || [];
      } else {
        // 학원: 강사 데이터 병합
        academy.instructors = instructorMap.get(academy.id) || instructorMap.get(normName) || [];
      }
    });
    return fullAcademies;
  };

  const loadData = async () => {
    // 이전 버전 캐시 정리
    ['academy_data_v1','academy_data_v2','academy_data_v3','academy_data_v4','academy_data_v5','academy_data_v6','academy_data_v7'].forEach(k => sessionStorage.removeItem(k));

    // 1. 캐시 확인 (30분 내 데이터면 즉시 사용)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { academies: cachedAcademies, privateTutors: cachedTutors, dataAsOf: cachedAsOf, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setAcademies(cachedAcademies);
          if (cachedTutors) setPrivateTutors(cachedTutors);
          setDataAsOf(cachedAsOf);
          return;
        }
      }
    } catch (e) { /* 캐시 오류 무시 */ }

    setLoading(true);
    try {
      // 2. Phase 1: 핵심 데이터 먼저 로드 → 즉시 목록 표시
      const [academyData, gyoseupsoData, tutorData] = await Promise.all([
        fetchGoogleSheetData(DATA_GID),
        fetchGoogleSheetData(GYOSEUPSO_GID),
        fetchPrivateTutorData(),
      ]);
      const rawData = [...academyData, ...gyoseupsoData];
      setAcademies(transformAcademyData(rawData, new Map()));
      setPrivateTutors(tutorData);
      setLoading(false);

      // 3. Phase 2: 보조 데이터 백그라운드 로드 (점검·강사·보조요원·시트명) — 최대 3회 재시도
      setSupplementLoading(true);
      const fetchPhase2 = async (attempt = 1) => {
        try {
          const [sheetName, inspectionMap, map2026, instructorMap, assistantMap] = await Promise.all([
            fetchSheetName(),
            fetchInspectionData(),
            fetch2026InspectionData(),
            fetchInstructorData(),
            fetchAssistantData(),
          ]);
          const fullAcademies = mergeSupplementaryData(rawData, inspectionMap, map2026, instructorMap, assistantMap);
          setAcademies(fullAcademies);
          setDataAsOf(sheetName);
          setSupplementLoading(false);

          // 4. 캐시 저장 (용량 초과 시 무시)
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
              academies: fullAcademies,
              privateTutors: tutorData,
              dataAsOf: sheetName,
              timestamp: Date.now(),
            }));
          } catch (e) { /* 용량 초과 무시 */ }
        } catch (err) {
          if (attempt < 3) {
            // 재시도: 2초, 4초 간격
            await new Promise(res => setTimeout(res, attempt * 2000));
            return fetchPhase2(attempt + 1);
          }
          console.error('Phase 2 최종 실패:', err);
          setSupplementLoading(false);
        }
      };
      fetchPhase2();
    } catch (err) {
      console.error(err);
      setError('데이터를 불러오는데 실패했습니다.');
      setLoading(false);
    }
  };

  // URL 파라미터 ?q=학원명&tab=tuition 처리 (외부 링크 진입 시 자동 검색·탭 이동)
  useEffect(() => {
    if (urlParamHandledRef.current) return;
    if (!isAuthenticated || academies.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const tab = params.get('tab');
    if (!q) return;
    urlParamHandledRef.current = true;
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
    const target = norm(q);
    const found = academies.find(a =>
      ['개원', '신고'].includes(a.status) && norm(a.name) === target
    ) || academies.find(a =>
      ['개원', '신고'].includes(a.status) && norm(a.name).includes(target)
    );
    if (found) {
      setDetailInitialTab(tab || undefined);
      setDetailOrigin('main');
      setSelectedAcademy(found);
    }
  }, [isAuthenticated, academies]);

  const handleClearCacheAndReload = () => {
    ['academy_data_v1','academy_data_v2','academy_data_v3','academy_data_v4','academy_data_v5','academy_data_v6','academy_data_v7','academy_data_v8'].forEach(k => sessionStorage.removeItem(k));
    localStorage.removeItem('academyMapLocations');
    localStorage.removeItem('academyAddrDongCache');
    setError('');
    loadData();
  };

  const handleLogin = (email) => {
    setIsAuthenticated(true);
    localStorage.setItem('academy_auth_v3', 'true');
    if (email) localStorage.setItem('academy_auth_email', email);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAcademies([]);
    localStorage.removeItem('academy_auth_v3');
    localStorage.removeItem('academy_auth_email');
    sessionStorage.removeItem(CACHE_KEY);
  };

  // Search/Filter Logic with Priority
  const performSearch = (query) => {
    const normalize = (str) => (str ? str.toLowerCase().replace(/\s+/g, '') : '');
    const target = normalize(query);

    if (!target) return [];

    // 학원·교습소 검색 (개원/신고 상태만)
    const academyResults = academies.filter(academy => {
      if (!['개원', '신고'].includes(academy.status)) return false;
      const name = normalize(academy.name || '');
      const founder = normalize(academy.founder?.name || '');
      const address = normalize(academy.address || '');
      const id = normalize(academy.id || '');
      return name.includes(target) || founder.includes(target) || address.includes(target) || id.includes(target);
    });

    // 개인과외교습자 검색 (신고 상태만)
    const tutorResults = privateTutors.filter(t => {
      if (!['개원', '신고'].includes(t.status)) return false;
      const name = normalize(t.name || '');
      const address = normalize(t.address || '');
      const id = normalize(t.id || '');
      return name.includes(target) || address.includes(target) || id.includes(target);
    });

    const results = [...academyResults, ...tutorResults];

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

    // 학원·교습소 검색 (개원/신고 상태만)
    const matchedAcademies = academies.filter(academy => {
      if (!['개원', '신고'].includes(academy.status)) return false;
      const name = (academy.name || '').toLowerCase().replace(/\s+/g, '');
      const founder = (academy.founder?.name || '').toLowerCase().replace(/\s+/g, '');
      const address = (academy.address || '').toLowerCase().replace(/\s+/g, '');
      const id = (academy.id || '').toLowerCase().replace(/\s+/g, '');
      return name.includes(normalizedValue) || founder.includes(normalizedValue) || address.includes(normalizedValue) || id.includes(normalizedValue);
    });

    // 개인과외교습자 검색 (신고 상태만)
    const matchedTutors = privateTutors.filter(t => {
      if (!['개원', '신고'].includes(t.status)) return false;
      const name = (t.name || '').toLowerCase().replace(/\s+/g, '');
      const address = (t.address || '').toLowerCase().replace(/\s+/g, '');
      const id = (t.id || '').toLowerCase().replace(/\s+/g, '');
      return name.includes(normalizedValue) || address.includes(normalizedValue) || id.includes(normalizedValue);
    });

    const matched = [...matchedAcademies, ...matchedTutors];

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
    // 모바일 키보드 내리기
    searchInputRef.current?.blur();
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
    return <Login onLogin={handleLogin} initialError={authError} />;
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

  // Render Error
  if (error) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center', padding: '32px', maxWidth: '360px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⚠️</div>
          <p style={{ color: 'var(--text-main)', fontWeight: '700', fontSize: '1rem', marginBottom: '8px' }}>
            데이터를 불러오지 못했습니다
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.6', marginBottom: '20px' }}>
            광고 차단 확장 프로그램(uBlock Origin, AdBlock 등)이 Google Sheets 요청을 막고 있을 수 있습니다.
            확장 프로그램을 비활성화하거나 이 사이트를 허용 목록에 추가해주세요.
          </p>
          <button
            onClick={handleClearCacheAndReload}
            style={{
              display: 'block', width: '100%', padding: '12px',
              backgroundColor: 'var(--primary)', color: 'white',
              border: 'none', borderRadius: '10px',
              fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer',
              marginBottom: '10px'
            }}
          >
            캐시 초기화 후 다시 시도
          </button>
          <button
            onClick={handleLogout}
            style={{
              display: 'block', width: '100%', padding: '10px',
              backgroundColor: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border-color)', borderRadius: '10px',
              fontSize: '0.85rem', cursor: 'pointer'
            }}
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  const displayList = hasSearched ? performSearch(searchQuery) : [];

  // 지도점검 화면
  if (showInspection) {
    return (
      <InspectionPage
        onBack={() => { setShowInspection(false); setInspectionInitialTab(undefined); }}
        academies={academies}
        privateTutors={privateTutors}
        initialTab={inspectionInitialTab}
        onSelectAcademy={(academy) => {
          setDetailOrigin('inspection');
          setShowInspection(false);
          setSelectedAcademy(academy);
        }}
        onShowRouteMap={(academies) => {
          setRouteAcademies(academies);
          setMapReturnState({ fromInspection: true });
          setShowInspection(false);
          setShowMap(true);
        }}
      />
    );
  }

  // 맵 화면
  if (showMap) {
    return (
      <KakaoMapPage
        academies={academies}
        privateTutors={privateTutors}
        focusAcademy={focusAcademy}
        routeAcademies={routeAcademies}
        initialMapState={savedMapState}
        onBack={() => {
          setShowMap(false);
          setFocusAcademy(null);
          setRouteAcademies(null);
          setSavedMapState(null);
          if (mapReturnState) {
            if (mapReturnState.fromInspection) {
              setShowInspection(true);
            } else {
              setSelectedAcademy(mapReturnState.academy);
              setDetailOrigin(mapReturnState.origin);
            }
            setMapReturnState(null);
          }
        }}
        onSelectAcademy={(item, mapState) => {
          setSavedMapState(mapState);
          setDetailOrigin('map');
          setShowMap(false);
          setFocusAcademy(null);
          setRouteAcademies(null);
          setSelectedAcademy(item);
        }}
      />
    );
  }

  // 교습비출력 화면
  if (showTuitionPrint) {
    return (
      <TuitionPrintPage
        academies={academies}
        onBack={() => setShowTuitionPrint(false)}
      />
    );
  }

  return (
    <div className="container">
      {selectedAcademy && selectedAcademy.type === 'privateTutor' && (
        <PrivateTutorDetailView
          tutor={selectedAcademy}
          allTutors={privateTutors}
          onBack={() => {
            setSelectedAcademy(null);
            if (detailOrigin === 'map') setShowMap(true);
          }}
          onSelectTutor={(t) => setSelectedAcademy(t)}
        />
      )}

      {selectedAcademy && selectedAcademy.type !== 'privateTutor' && (
        <ErrorBoundary onBack={() => {
          setSelectedAcademy(null);
          if (detailOrigin === 'inspection') setShowInspection(true);
        }}>
          <DetailView
            academy={selectedAcademy}
            allAcademies={academies}
            supplementLoading={supplementLoading}
            initialTab={detailInitialTab}
            onBack={() => {
              setSelectedAcademy(null);
              setDetailInitialTab(undefined);
              if (detailOrigin === 'inspection') setShowInspection(true);
              if (detailOrigin === 'map') setShowMap(true);
            }}
            onSelectAcademy={(academy) => { setDetailInitialTab(undefined); setSelectedAcademy(academy); }}
            onShowMap={(academy) => {
              setMapReturnState({ academy: selectedAcademy, origin: detailOrigin });
              setFocusAcademy(academy);
              setSavedMapState(null);
              setSelectedAcademy(null);
              setShowMap(true);
            }}
          />
        </ErrorBoundary>
      )}

      {!selectedAcademy && (
      <>
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
          학원 관리
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

          {/* 면적 버튼 (왼쪽) */}
          <button
            onClick={() => { setInspectionInitialTab(4); setShowInspection(true); }}
            style={{
              position: 'absolute',
              left: '0',
              background: 'none',
              border: 'none',
              color: '#7c3aed',
              fontSize: '0.85rem',
              fontWeight: '700',
              cursor: 'pointer',
              textDecoration: 'underline',
              textDecorationColor: '#c4b5fd',
              padding: '0',
              transition: 'color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.color = '#5b21b6'}
            onMouseOut={(e) => e.target.style.color = '#7c3aed'}
          >
            면적계산
          </button>

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

        <p className="subtitle">검색할 학원명, 운영자, 주소를 입력하세요</p>

        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="학원명, 운영자, 주소..."
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={() => searchQuery && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            ref={searchInputRef}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <span className="suggestion-name">{academy.name}</span>
                      {locationBadge && (
                        <span style={{
                          padding: '3px 10px',
                          backgroundColor: locationBadge.bgColor,
                          color: locationBadge.textColor,
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}>
                          {locationBadge.text}
                        </span>
                      )}
                    </div>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      ...(academy.type === 'privateTutor'
                        ? { backgroundColor: '#FFF7ED', color: '#D97706', border: '1px solid #FED7AA' }
                        : academy.category?.includes('교습소')
                          ? { backgroundColor: '#FDF2F8', color: '#C026D3', border: '1px solid #F0ABFC' }
                          : { backgroundColor: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid rgba(79,70,229,0.2)' })
                    }}>
                      {academy.type === 'privateTutor' ? '과외' : academy.category?.includes('교습소') ? '교습소' : '학원'}
                    </span>
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
                <a
                  href={`https://map.naver.com/p/search/${encodeURIComponent(academy.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="academy-address"
                  style={{
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textDecorationColor: 'var(--border-color)',
                    margin: 0,
                    flex: 1,
                    color: 'inherit'
                  }}
                  title="네이버 지도에서 보기"
                >
                  {academy.address}
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMap(true);
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
                  title="분포지도에서 보기"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <span>지도</span>
                </button>
              </div>

              <div className="academy-meta">
                {academy.type === 'privateTutor' ? (
                  <span style={{ color: 'var(--text-muted)' }}>교습과목: <b style={{ color: 'var(--text-main)' }}>{academy.subjects?.map(s => s.subject).filter(Boolean).join(', ') || '-'}</b></span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>설립자: <b style={{ color: 'var(--text-main)' }}>{academy.founder.name}</b></span>
                )}
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
                {academy.type !== 'privateTutor' && (<>
                <span style={{ color: 'var(--border-color)' }}>•</span>
                <a
                  href={`https://map.naver.com/p/search/${encodeURIComponent(`${academy.name} ${cleanAddress(academy.address)}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: '#5FD68A',
                    color: 'white',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 3px rgba(95, 214, 138, 0.3)',
                    textDecoration: 'none'
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
                </a>
                </>)}
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
          {/* 교습비등 게시표 출력 */}
          <div
            onClick={() => setShowTuitionPrint(true)}
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
                background: '#e0f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}>
                🔍
              </div>
              <span style={{
                fontSize: '1rem',
                fontWeight: '700',
                color: 'var(--text-main)'
              }}>
                교습비 검토
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
                <polyline points="9 18 15 12 9 6"></polyline>
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
                    {[
                      { label: '학원법', href: 'https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률' },
                      { label: '학원법 시행령', href: 'https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률시행령' },
                      { label: '학원법 시행규칙', href: 'https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률시행규칙' },
                      { label: '경기도 학원 조례', href: 'https://www.law.go.kr/자치법규/경기도학원의설립ㆍ운영및과외교습에관한조례/(7741,20230807)' },
                      { label: '경기도 학원 조례 시행규칙', href: 'https://www.law.go.kr/자치법규/경기도학원의설립ㆍ운영및과외교습에관한조례시행규칙/(980,20250901)' },
                    ].map(({ label, href }) => (
                      <a
                        key={label}
                        href={href}
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
                        <span>• {label}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </a>
                    ))}
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
                    {[
                      { label: '고등교육법', href: 'https://www.law.go.kr/법령/고등교육법' },
                      { label: '교육환경 보호에 관한 법률', href: 'https://www.law.go.kr/법령/교육환경보호에관한법률' },
                      { label: '아동복지법', href: 'https://www.law.go.kr/법령/아동복지법' },
                      { label: '청소년성보호법', href: 'https://www.law.go.kr/법령/아동·청소년의성보호에관한법률' },
                      { label: '질서위반행위규제법', href: 'https://www.law.go.kr/법령/질서위반행위규제법' },
                      { label: '민원 처리에 관한 법률', href: 'https://www.law.go.kr/법령/민원처리에관한법률' },
                      { label: '출입국관리법', href: 'https://www.law.go.kr/법령/출입국관리법' },
                      { label: '행정절차법', href: 'https://www.law.go.kr/법령/행정절차법' },
                      { label: '어린이안전관리에 관한 법률', href: 'https://www.law.go.kr/법령/어린이안전관리에관한법률' },
                    ].map(({ label, href }) => (
                      <a
                        key={label}
                        href={href}
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
                        <span>• {label}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </a>
                    ))}
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
                  학원 등 분포지도
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
      </>
      )}

      {backToast && (
        <div style={{
          position: 'fixed',
          bottom: '60px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(20,20,20,0.92)',
          color: '#fff',
          padding: '13px 28px',
          borderRadius: '24px',
          fontSize: '0.95rem',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          zIndex: 2147483647,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          한 번 더 누르면 앱이 종료됩니다
        </div>
      )}
    </div>
  );
}

export default App;
