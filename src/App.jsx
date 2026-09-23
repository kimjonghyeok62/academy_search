import React, { useState, useEffect, useRef } from 'react';
import DetailView from './components/DetailView';
import Login from './components/Login';
import PrivateTutorDetailView from './components/PrivateTutorDetailView';
import { fetchGoogleSheetData, transformAcademyData, fetchSheetName, fetchInspectionData, fetch2026InspectionData, fetchInstructorData, fetchAssistantData, fetchPrivateTutorData, lookupInspections, DATA_GID, GYOSEUPSO_GID } from './utils/googleSheets';
import './App.css';
import InspectionStandardAccordion from './components/InspectionStandardAccordion';
import InspectionPage from './components/InspectionPage';
import KakaoMapPage from './components/KakaoMapPage';
import TuitionPrintPage from './components/TuitionPrintPage';
import AreaCalculatorApp from './components/AreaCalculatorApp';
import { placeMapSearchUrl } from './utils/snsCheck';

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
      return <div className="alert is-error">
        <h3 style={{ marginBottom: '8px' }}>상세 화면을 여는 중 오류가 났습니다</h3>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{this.state.error && this.state.error.toString()}</pre>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', maxHeight: '240px', overflow: 'auto' }}>{this.state.error && this.state.error.stack}</pre>
        <button className="btn btn-outline" onClick={() => this.props.onBack()}>← 돌아가기</button>
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
  const [extraPage, setExtraPage] = useState(null); // 메뉴 화면: 'law' | 'sanction' | 'area'
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
    } else if (extraPage) {
      backHandlerRef.current = () => {
        setExtraPage(null);
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
  }, [showMap, showInspection, showTuitionPrint, extraPage, selectedAcademy, mapReturnState, detailOrigin]);

  // 좁은 화면 가로 메뉴줄: 고른 메뉴가 화면 밖에 있으면 보이게 옮긴다
  useEffect(() => {
    // (scrollIntoView 는 페이지까지 위로 끌어올리므로 메뉴줄만 가로로 민다)
    const nav = document.querySelector('.sidenav');
    const item = nav?.querySelector('.sidenav-item.is-active');
    if (!item || nav.scrollWidth <= nav.clientWidth) return;
    const navBox = nav.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.left < navBox.left + 12) nav.scrollLeft -= navBox.left + 12 - box.left;
    else if (box.right > navBox.right - 12) nav.scrollLeft += box.right - (navBox.right - 12);
  }, [showInspection, showTuitionPrint, showMap, extraPage, selectedAcademy, detailOrigin]);

  // 상세 화면이 내용 칸에 들어오므로 스크롤을 챙긴다 — 열면 맨 위, 검색 목록으로 돌아오면 보던 자리
  const listScrollRef = useRef(0);
  const wasDetailRef = useRef(false);
  const detailOpen = !!selectedAcademy;
  useEffect(() => {
    if (detailOpen) window.scrollTo(0, 0);
    else if (wasDetailRef.current && !showInspection && !showMap && !showTuitionPrint && !extraPage) window.scrollTo(0, listScrollRef.current);
    wasDetailRef.current = detailOpen;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 상세를 열고 닫을 때만
  }, [detailOpen]);

  // 모바일 여부 판별
  const isMobile = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

  // 서브 화면 최초 진입 시 history 버퍼 삽입 (모바일 전용)
  // popstate 핸들러가 직접 재삽입하므로, 여기서는 홈→서브 첫 진입만 처리
  useEffect(() => {
    if (!isMobile()) return;
    const isSubScreen = showInspection || showMap || showTuitionPrint || !!extraPage || !!selectedAcademy;
    if (isSubScreen && !isSubScreenRef.current) {
      window.history.pushState({ appSub: true }, '');
      isSubScreenRef.current = true;
    } else if (!isSubScreen) {
      isSubScreenRef.current = false;
      lastBackPressRef.current = 0; // 홈 복귀 시 종료 타이머 리셋
    }
  }, [showInspection, showMap, showTuitionPrint, extraPage, selectedAcademy]);

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
      // 등록번호 + 명칭 양쪽으로 조회 → 명칭이 바뀐 학원도 과거 이력이 붙는다
      const records2026 = lookupInspections(map2026, academy);
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
    listScrollRef.current = 0;
    setDetailOrigin('main');
    setSelectedAcademy(academy);
    // 모바일 키보드 내리기
    searchInputRef.current?.blur();
  };

  // 주소에서 지역 정보 추출 및 배지 스타일 반환
  // 학원·교습소·과외 구분 글자
  const academyKind = (a) => (a.type === 'privateTutor' ? '과외' : a.category?.includes('교습소') ? '교습소' : '학원');

  // 관할 지역 꼬리표 (색 없이 글자만)
  const getLocationBadge = (address) => {
    if (!address) return null;
    if (address.includes('하남시')) return { text: '하남' };
    if (address.includes('광주시')) return { text: '광주' };
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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '20px' }}>
            광고 차단 확장 프로그램(uBlock Origin, AdBlock 등)이 Google Sheets 요청을 막고 있을 수 있습니다.
            확장 프로그램을 비활성화하거나 이 사이트를 허용 목록에 추가해주세요.
          </p>
          <button
            onClick={handleClearCacheAndReload}
            className="btn btn-primary btn-block"
            style={{ marginBottom: '10px' }}
          >
            캐시 초기화 후 다시 시도
          </button>
          <button onClick={handleLogout} className="btn btn-outline btn-block">
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  const displayList = hasSearched ? performSearch(searchQuery) : [];

  // 메뉴 이동 — 다른 화면 상태를 모두 끄고 고른 화면 하나만 켠다
  const goTo = (id) => {
    setShowInspection(false);
    setInspectionInitialTab(undefined);
    setShowTuitionPrint(false);
    setExtraPage(null);
    setSelectedAcademy(null);
    setDetailInitialTab(undefined);
    setDetailOrigin('main');
    setShowMap(false);
    setFocusAcademy(null);
    setRouteAcademies(null);
    setSavedMapState(null);
    setMapReturnState(null);
    if (id === 'map') setShowMap(true);
    else if (id === 'inspection') setShowInspection(true);
    else if (id === 'tuition') setShowTuitionPrint(true);
    else if (id === 'law' || id === 'sanction' || id === 'area') setExtraPage(id);
    window.scrollTo(0, 0);
  };

  // 머리띠 앱 이름 — 검색어까지 비운 첫 화면으로
  const goHome = () => {
    goTo('search');
    setSearchQuery('');
    setHasSearched(false);
    setSuggestions([]);
  };

  // 분포지도 — 틀 안, 내용 칸을 꽉 채운다
  const mapEl = showMap && (
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
      showBack={!!mapReturnState}
    />
  );

  const backToastEl = backToast && <div className="back-toast">한 번 더 누르면 앱이 종료됩니다</div>;

  const page = showMap ? 'map'
    : selectedAcademy && !showInspection && !showTuitionPrint ? 'detail'
    : showInspection ? 'inspection'
      : showTuitionPrint ? 'tuition'
        : extraPage || 'search';
  const head = PAGE_HEAD[page];
  // 상세 화면에서는 들어온 곳(검색·지도점검·분포지도)의 메뉴를 켜 둔다
  const navId = page !== 'detail' ? page
    : detailOrigin === 'inspection' ? 'inspection'
      : detailOrigin === 'map' ? 'map'
        : 'search';

  // 학원 상세 화면 — 틀 안, 내용 칸에 들어간다
  const detailEl = page === 'detail' && (
      <>
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
      </>
  );

  return (
    <div className="shell">
      {/* 머리띠 */}
      <header className="topbar">
        <button type="button" className="topbar-brand" onClick={goHome} title="첫 화면으로">
          <span className="topbar-logo" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
            </svg>
          </span>
          <span className="topbar-title">학원 관리</span>
        </button>
        <div className="topbar-actions">
          {dataAsOf && (
            <span className="topbar-date" title="학원 자료 기준일">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dataAsOf}
            </span>
          )}
          <button type="button" className="topbar-btn" onClick={handleLogout}>로그아웃</button>
        </div>
      </header>

      <div className="shell-body">
        {/* 메뉴 */}
        <nav className="sidenav" aria-label="메뉴">
          {NAV.map(g => (
            <div key={g.group} className="sidenav-group">
              <div className="sidenav-label">{g.group}</div>
              {g.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`sidenav-item${navId === item.id ? ' is-active' : ''}`}
                  aria-current={navId === item.id ? 'page' : undefined}
                  onClick={() => goTo(item.id)}
                >
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* 지도점검 — 표가 넓어 넓은 폭을 쓴다 */}
        {page === 'inspection' && (
          <main className="page is-wide">
            <InspectionPage
              academies={academies}
              privateTutors={privateTutors}
              initialTab={inspectionInitialTab}
              supplementLoading={supplementLoading}
              onSelectAcademy={(academy, tab) => {
                setDetailOrigin('inspection');
                setShowInspection(false);
                setDetailInitialTab(tab || undefined);
                setSelectedAcademy(academy);
              }}
              onShowRouteMap={(academies) => {
                setRouteAcademies(academies);
                setMapReturnState({ fromInspection: true });
                setShowInspection(false);
                setShowMap(true);
              }}
            />
          </main>
        )}

        {page === 'tuition' && (
          <main className="page is-flush">
            <TuitionPrintPage
              academies={academies}
              onBack={() => setShowTuitionPrint(false)}
            />
          </main>
        )}

        {page === 'map' && <main className="page is-map">{mapEl}</main>}

        {page === 'detail' && <main className="page is-detail">{detailEl}</main>}

        {page !== 'inspection' && page !== 'tuition' && page !== 'detail' && page !== 'map' && (
          <main className="page">
            <div className="page-head">
              <h1 className="page-title">{head.title}</h1>
              <p className="page-desc">{head.desc}</p>
            </div>

            {page === 'law' && <LegalResourcesPage />}

            {page === 'sanction' && <InspectionStandardAccordion embedded />}

            {page === 'area' && <AreaCalculatorApp embedded={true} />}

            {page === 'search' && (
              <>
                <div className="search-area">
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
                    <span className="suggestion-name">{academy.name}</span>
                    <span className="suggestion-tags">
                      {locationBadge && <span className="tag">{locationBadge.text}</span>}
                      <span className="tag">{academyKind(academy)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </form>
                </div>

      <div className="results-list">
        {hasSearched && displayList.length > 0 && (
          <p className="results-count">{displayList.length.toLocaleString()}곳</p>
        )}
        {hasSearched && displayList.length > 0 ? (
          displayList.map((academy, index) => {
            const locationBadge = getLocationBadge(academy.address);
            return (
            <div
              key={academy.id + academy.category + index}
              className="academy-card animate-enter"
              // 앞의 몇 장만 차례로 — 수천 건일 때 뒤쪽 카드가 한참 비어 보이지 않게
              style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
              onClick={() => {
                listScrollRef.current = window.scrollY;
                setDetailOrigin('main');
                setSelectedAcademy(academy);
              }}
            >
              <div className="card-top">
                <span className="academy-id">No. {academy.id}</span>
                <span className="tag">{academy.category || academyKind(academy)}</span>
              </div>
              <h3 className="academy-name">{academy.name}</h3>
              <a
                href={`https://map.naver.com/p/search/${encodeURIComponent(academy.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="academy-address"
                title="네이버 지도에서 보기"
              >
                {academy.address}
              </a>

              <div className="academy-meta">
                {academy.type === 'privateTutor' ? (
                  <span>교습과목 <b>{academy.subjects?.map(s => s.subject).filter(Boolean).join(', ') || '-'}</b></span>
                ) : (
                  <span>설립자 <b>{academy.founder.name}</b></span>
                )}
                {locationBadge ? (
                  <span className="tag">{locationBadge.text}</span>
                ) : (
                  <span className={academy.status.includes('개원') ? 'status-active' : 'status-inactive'}>
                    {academy.status}
                  </span>
                )}
              </div>

              <div className="academy-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMap(true);
                  }}
                  title="분포지도에서 보기"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  분포지도
                </button>
                {academy.type !== 'privateTutor' && (
                  <a
                    href={placeMapSearchUrl(academy.name, academy.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="btn btn-outline btn-sm"
                    title="네이버 플레이스에서 보기"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    네이버 플레이스
                  </a>
                )}
              </div>
            </div>
            );
          })
        ) : (
          hasSearched && (
            <div className="card no-results">
              <p>검색 결과가 없습니다.</p>
            </div>
          )
        )}
      </div>
              </>
            )}
          </main>
        )}
      </div>

      {backToastEl}
    </div>
  );
}

// 왼쪽 메뉴 — 넓은 화면은 세로 메뉴, 좁은 화면은 머리띠 아래 가로 메뉴줄
const NAV = [
  {
    group: '조회',
    items: [
      { id: 'search', label: '학원 검색', icon: 'search' },
      { id: 'map', label: '학원 등 분포지도', icon: 'map' },
    ],
  },
  {
    group: '지도점검',
    items: [
      { id: 'inspection', label: '지도점검 업무관리', icon: 'clipboard' },
      { id: 'area', label: '면적계산', icon: 'ruler' },
    ],
  },
  {
    group: '교습비',
    items: [{ id: 'tuition', label: '교습비 계산·게시표', icon: 'calc' }],
  },
  {
    group: '참고',
    items: [
      { id: 'law', label: '관련 법령 자료', icon: 'book' },
      { id: 'sanction', label: '행정처분·과태료 기준', icon: 'scale' },
    ],
  },
];

// 각 화면 머리 — 제목과 한 줄 설명
const PAGE_HEAD = {
  search: { title: '학원 검색', desc: '학원명·운영자·주소·등록번호로 학원, 교습소, 개인과외교습자를 찾습니다.' },
  area: { title: '면적계산', desc: '강의실 치수를 적으면 실별 면적과 합계를 계산합니다.' },
  law: { title: '관련 법령 자료', desc: '업무 매뉴얼과 법령 원문을 새 창으로 엽니다.' },
  sanction: { title: '행정처분·과태료 기준', desc: '위반 유형별 1차 적발 시 행정처분과 과태료입니다.' },
};

function NavIcon({ name }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    map: <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>,
    clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></>,
    ruler: <><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" /><path d="m14.5 12.5 2-2" /><path d="m11.5 9.5 2-2" /><path d="m8.5 6.5 2-2" /><path d="m17.5 15.5 2-2" /></>,
    calc: <><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="8" y2="11" /><line x1="12" y1="11" x2="12" y2="11" /><line x1="16" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="8" y2="15" /><line x1="12" y1="15" x2="12" y2="15" /><line x1="16" y1="15" x2="16" y2="18" /><line x1="8" y1="18" x2="12" y2="18" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    scale: <><path d="M12 3v18" /><path d="M5 21h14" /><path d="m3 13 3-7 3 7a3 3 0 0 1-6 0Z" /><path d="m15 13 3-7 3 7a3 3 0 0 1-6 0Z" /><path d="M6 6h12" /></>,
  };
  return (
    <svg className="sidenav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// 관련 법령 자료 — 업무 매뉴얼, 주요 법령, 관련 법령 (모두 새 창)
const LAW_SECTIONS = [
  {
    title: '업무 매뉴얼',
    links: [
      { label: '경기도교육청 학원 업무 매뉴얼', href: 'https://drive.google.com/file/d/1I6j4VkHEeDzKc6YvfTcv8Wl48LAzbSsN/preview' },
      { label: '서울특별시교육청 학원 업무 매뉴얼', href: 'https://drive.google.com/file/d/1ppixrFV1wEFBXTicg_-muU81mn8Gvn8E/preview' },
    ],
  },
  {
    title: '주요 법령',
    links: [
      { label: '학원법', href: 'https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률' },
      { label: '학원법 시행령', href: 'https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률시행령' },
      { label: '학원법 시행규칙', href: 'https://www.law.go.kr/법령/학원의설립·운영및과외교습에관한법률시행규칙' },
      { label: '경기도 학원 조례', href: 'https://www.law.go.kr/자치법규/경기도학원의설립ㆍ운영및과외교습에관한조례/(7741,20230807)' },
      { label: '경기도 학원 조례 시행규칙', href: 'https://www.law.go.kr/자치법규/경기도학원의설립ㆍ운영및과외교습에관한조례시행규칙/(980,20250901)' },
    ],
  },
  {
    title: '관련 법령',
    links: [
      { label: '고등교육법', href: 'https://www.law.go.kr/법령/고등교육법' },
      { label: '교육환경 보호에 관한 법률', href: 'https://www.law.go.kr/법령/교육환경보호에관한법률' },
      { label: '아동복지법', href: 'https://www.law.go.kr/법령/아동복지법' },
      { label: '청소년성보호법', href: 'https://www.law.go.kr/법령/아동·청소년의성보호에관한법률' },
      { label: '질서위반행위규제법', href: 'https://www.law.go.kr/법령/질서위반행위규제법' },
      { label: '민원 처리에 관한 법률', href: 'https://www.law.go.kr/법령/민원처리에관한법률' },
      { label: '출입국관리법', href: 'https://www.law.go.kr/법령/출입국관리법' },
      { label: '행정절차법', href: 'https://www.law.go.kr/법령/행정절차법' },
      { label: '어린이안전관리에 관한 법률', href: 'https://www.law.go.kr/법령/어린이안전관리에관한법률' },
    ],
  },
];

function LegalResourcesPage() {
  return (
    <>
      {LAW_SECTIONS.map(section => (
        <section key={section.title} className="card">
          <h2 className="card-title">{section.title}</h2>
          <ul className="link-list">
            {section.links.map(({ label, href }) => (
              <li key={label}>
                <a className="link-row" href={href} target="_blank" rel="noopener noreferrer">
                  <span>{label}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export default App;
