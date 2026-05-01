import React, { useState, useEffect, useRef } from 'react';

function KakaoMapPage({ academies, privateTutors, onBack, onSelectAcademy, focusAcademy, routeAcademies, initialMapState }) {
    // 환경 변수(.env)에서 먼저 키를 찾고, 없으면 localStorage 확인
    const [apiKey, setApiKey] = useState(
        import.meta.env.VITE_KAKAO_MAP_API_KEY || localStorage.getItem('kakao_api_key') || ''
    );
    const [inputKey, setInputKey] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [statusMsg, setStatusMsg] = useState('');
    const [progress, setProgress] = useState(0);
    const [loading, setLoading] = useState(false);
    const [mapReadyTick, setMapReadyTick] = useState(0); // 지도 로딩 완료 횟수 (배칭 우회용)

    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const clustererRef = useRef(null);
    const overlayRef = useRef(null);
    const textOverlaysRef = useRef([]);
    const markersRef = useRef([]); // 마커들 관리
    const myLocationMarkerRef = useRef(null); // 현재 위치 마커
    const kakaoRef = useRef(null); // kakao 객체 참조 (focusAcademy용)
    const groupsArrayRef = useRef([]); // 마커 그룹 배열 (focusAcademy용)
    const focusMarkerRef = useRef(null); // 포커스 학원 보라색 마커
    const focusAcademyRef = useRef(null); // 현재 포커스된 학원 (updateTextVisibility에서 참조)
    const updateTextVisibilityRef = useRef(null); // updateTextVisibility 함수 참조
    const routeMarkersRef = useRef([]); // 경로 번호 마커
    const [locating, setLocating] = useState(false); // 위치 탐색 중 상태
    const [filterAcademy, setFilterAcademy] = useState(true);
    const [filterTutoring, setFilterTutoring] = useState(true);
    const [filterGwangju, setFilterGwangju] = useState(false);
    const [filterHanam, setFilterHanam] = useState(true);
    const [filterPrivateTutor, setFilterPrivateTutor] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
    const [failCount, setFailCount] = useState(0); // 좌표 변환 실패 건수

    // 모바일 감지
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 1. 중복 제거 및 기본 필터링 (운영 상태 등)
    const baseAcademies = React.useMemo(() => {
        if (!academies) return [];
        const map = new Map();

        academies.forEach(a => {
            if (!a.id || !a.address) return;

            // 개원 상태인 것만 포함
            if (!(a.status || '').includes('개원')) return;

            const key = `${a.id}-${a.category}`;
            if (!map.has(key)) {
                map.set(key, a);
            }
        });

        return Array.from(map.values());
    }, [academies]);

    // 2. 카테고리(학원/교습소) 및 지역(광주/하남) 필터링
    const filteredAcademies = React.useMemo(() => {
        return baseAcademies.filter(a => {
            const isAcademy = a.category.includes('학원');
            const isTutoring = a.category.includes('교습소');
            const isGwangju = a.address.includes('광주시');
            const isHanam = a.address.includes('하남시');

            let categoryMatch = (filterAcademy && isAcademy) || (filterTutoring && isTutoring);
            let regionMatch = (filterGwangju && isGwangju) || (filterHanam && isHanam);

            return categoryMatch && regionMatch;
        });
    }, [baseAcademies, filterAcademy, filterTutoring, filterGwangju, filterHanam]);

    // 3. 개인과외교습자 필터링
    const filteredPrivateTutors = React.useMemo(() => {
        if (!privateTutors || !filterPrivateTutor) return [];
        return privateTutors.filter(t => {
            if (!t.address) return false;
            if (!(t.status || '').includes('신고')) return false;
            const isHanam = t.address.includes('하남시');
            const isGwangju = t.address.includes('광주시');
            return (filterHanam && isHanam) || (filterGwangju && isGwangju);
        });
    }, [privateTutors, filterPrivateTutor, filterHanam, filterGwangju]);

    // 카카오맵 스크립트 로드
    const loadKakaoMapScript = () => {
        return new Promise((resolve, reject) => {
            if (window.kakao && window.kakao.maps && window.kakao.maps.services && window.kakao.maps.MarkerClusterer) {
                resolve(window.kakao);
                return;
            }

            // kakao.maps는 있지만 MarkerClusterer가 아직 초기화 안 된 경우
            // → 기존 스크립트 제거 후 clusterer 포함하여 재로드
            if (window.kakao && window.kakao.maps && !window.kakao.maps.MarkerClusterer) {
                const existingScript = document.getElementById('kakao-map-script');
                if (existingScript) existingScript.remove();
                // 아래 공통 스크립트 로드 로직으로 fall-through
            }

            const scriptId = 'kakao-map-script';
            let script = document.getElementById(scriptId);

            if (script) {
                script.remove();
            }

            script = document.createElement('script');
            script.id = scriptId;
            script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&libraries=services,clusterer&autoload=false`;

            script.onload = () => {
                window.kakao.maps.load(() => {
                    if (window.kakao && window.kakao.maps && window.kakao.maps.services && window.kakao.maps.MarkerClusterer) {
                        resolve(window.kakao);
                    } else if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
                        // clusterer 없이도 지도는 동작하도록 허용
                        resolve(window.kakao);
                    } else {
                        reject(new Error("서비스 라이브러리를 찾을 수 없습니다."));
                    }
                });
            };

            script.onerror = () => {
                reject(new Error("스크립트 로드 실패. API 키나 허용 도메인을 확인해주세요."));
            };

            document.head.appendChild(script);
        });
    };

    // 행정동→법정동 정규화: "신장1동" → "신장동"
    const normDong = d => d.replace(/([가-힣]+)\d+(동|리|읍|면)$/, '$1$2');

    // 주소 객체에서 동명 추출
    const extractDong = (addrObj) => {
        const r3 = addrObj?.region_3depth_name || '';
        if (r3) return normDong(r3);
        const name = addrObj?.address_name || '';
        const after = name.replace(/^.*?시\s*/, '');
        const m = after.match(/([가-힣]+(?:\d+)?(?:동|리|읍|면))/);
        return m ? normDong(m[1]) : '';
    };

    // 주소 → 여러 후보 주소 생성 (정제 단계별)
    const makeAddrCandidates = (address) => {
        const seen = new Set();
        const add = (s) => { const t = s.trim(); if (t.length > 4) seen.add(t); };

        // 0. 원본
        add(address);
        // 1. 콤마 앞 + 괄호 제거
        let base = address.split(',')[0].replace(/\s*\([^)]*\)/g, '').trim();
        add(base);
        // 2. 범위호·층·단일호 제거
        let noHo = base
            .replace(/\s+\d+~\d+호.*$/, '')
            .replace(/\s+[A-Z동]?\d+층.*$/, '')
            .replace(/\s+\d+호.*$/, '')
            .trim();
        add(noHo);
        // 3. 아파트 "N동 M호" 제거
        let noApt = noHo.replace(/\s+\d+동\s*\d*호?.*$/, '').trim();
        add(noApt);
        // 4. 부번 제거 (270-1 → 270)
        add(noApt.replace(/(\d+)-\d+\s*$/, '$1'));
        add(noHo.replace(/(\d+)-\d+\s*$/, '$1'));
        // 5. 도로명+번지만 (로/길 + 숫자)
        const roadMatch = address.match(/^(.*?[로길]\s+\d+(?:-\d+)?)/);
        if (roadMatch) add(roadMatch[1]);

        return [...seen];
    };

    // 주소 -> 좌표 변환 헬퍼 (다중 전략 fallback)
    const geocodeAddress = (kakao, address) => {
        return new Promise((resolve) => {
            const geocoder = new kakao.maps.services.Geocoder();
            const candidates = makeAddrCandidates(address);

            const tryNext = (idx) => {
                if (idx >= candidates.length) { resolve(null); return; }
                geocoder.addressSearch(candidates[idx], (result, status) => {
                    if (status === kakao.maps.services.Status.OK && result[0]) {
                        const dong = extractDong(result[0].address);
                        resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x), dong });
                    } else {
                        tryNext(idx + 1);
                    }
                });
            };
            tryNext(0);
        });
    };

    // 지도 초기화 및 마커 렌더링 메인 로직
    useEffect(() => {
        if (!apiKey) return;

        let isMounted = true;
        setLoading(true);
        setStatusMsg("스크립트 로딩 중...");

        const initMap = async () => {
            console.log(`[KakaoMap] 학원/교습소: ${filteredAcademies.length} / 과외: ${filteredPrivateTutors.length}`);
            try {
                const kakao = await loadKakaoMapScript();
                if (!isMounted) return;
                kakaoRef.current = kakao;

                setStatusMsg("지도 초기화 중...");

                // 지도 컨테이너 확인
                if (!mapContainerRef.current) {
                    throw new Error("지도 컨테이너를 찾을 수 없습니다.");
                }

                // 지도 중심: 저장된 위치 > 광주만 선택 시 교육지원청, 그 외 미사역
                const defaultCenter = (filterGwangju && !filterHanam)
                    ? new kakao.maps.LatLng(37.4249, 127.2553) // 경기도광주하남교육지원청 (경기도 광주시 광주대로 178)
                    : new kakao.maps.LatLng(37.5670, 127.1962); // 미사역 (하남 기준)
                const centerPosition = initialMapState
                    ? new kakao.maps.LatLng(initialMapState.lat, initialMapState.lng)
                    : defaultCenter;
                const mapOptions = {
                    center: centerPosition,
                    level: initialMapState ? initialMapState.level : 4
                };

                const map = new kakao.maps.Map(mapContainerRef.current, mapOptions);
                mapInstanceRef.current = map;

                // 지도 빈 공간 클릭 시 오버레이 닫기
                kakao.maps.event.addListener(map, 'click', () => {
                    if (overlayRef.current) overlayRef.current.setMap(null);
                });

                // 클러스터러 생성 (없으면 마커 직접 map에 추가하는 폴백)
                let clusterer;
                try {
                    clusterer = new kakao.maps.MarkerClusterer({
                        map: map,
                        averageCenter: true,
                        minLevel: 5,
                        disableClickZoom: false
                    });
                } catch (e) {
                    // MarkerClusterer 미사용 폴백: 마커를 지도에 직접 추가
                    clusterer = {
                        addMarkers: (ms) => ms.forEach(m => m.setMap(map)),
                        removeMarkers: (ms) => ms.forEach(m => m.setMap(null)),
                    };
                    console.warn('[KakaoMap] MarkerClusterer 미사용 — 개별 마커로 표시', e.message);
                }
                clustererRef.current = clusterer;

                // 좌표 데이터 수집 및 그룹핑 시작
                const allItems = [...filteredAcademies, ...filteredPrivateTutors];
                setStatusMsg(`주소 좌표 변환 및 그룹핑 중... (총 ${allItems.length}건)`);
                // v2: geocoding 정제 로직 개선 → 기존 null 캐시 제거하여 재시도
                const CACHE_VER = 2;
                const rawCache = JSON.parse(localStorage.getItem('academyMapLocations') || '{}');
                const cachedLocations = rawCache._v === CACHE_VER
                    ? rawCache
                    : (() => {
                        const cleaned = {};
                        Object.entries(rawCache).forEach(([k, v]) => {
                            if (k !== '_v' && v !== null) cleaned[k] = v;
                        });
                        return cleaned;
                    })();
                let newCacheNeeded = rawCache._v !== CACHE_VER; // 버전 변경 시 반드시 재저장

                // 좌표를 기준으로 기관들을 그룹핑
                const groupedMarkers = new Map();
                let localFail = 0;

                // 주소 → 법정동명 캐시 (검토 탭 동별 분류 fallback용)
                const addrDongCache = JSON.parse(localStorage.getItem('academyAddrDongCache') || '{}');
                let addrDongCacheModified = false;

                for (let i = 0; i < allItems.length; i++) {
                    if (!isMounted) return;

                    const academy = allItems[i];
                    const cacheKey = academy.type === 'privateTutor'
                        ? `tutor-${academy.id}`
                        : `${academy.id}-${academy.category}`;
                    let coords = cachedLocations[cacheKey];

                    if (coords === undefined || coords === null) {
                        // null(이전 실패)도 개선된 전략으로 재시도
                        coords = await geocodeAddress(kakao, academy.address);
                        cachedLocations[cacheKey] = coords || null; // 실패도 null로 저장 (검토 탭 감지용)
                        newCacheNeeded = true;
                        if (!coords) localFail++;
                    } else if (!coords) {
                        localFail++; // 이미 null로 캐시된 실패 항목
                    }

                    // 법정동명 캐시 갱신 (geocoding 결과 또는 기존 캐시에서 dong 확보)
                    if (coords?.dong && academy.address && !addrDongCache[academy.address]) {
                        addrDongCache[academy.address] = coords.dong;
                        addrDongCacheModified = true;
                    }

                    if (coords) {
                        const coordKey = `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`;
                        if (!groupedMarkers.has(coordKey)) {
                            groupedMarkers.set(coordKey, {
                                lat: coords.lat,
                                lng: coords.lng,
                                list: []
                            });
                        }
                        groupedMarkers.get(coordKey).list.push(academy);
                    }

                    // 프로그레스 리포트 및 카카오 API 지연(부하 방지)
                    if (i % 20 === 0 || i === allItems.length - 1) {
                        setProgress(Math.round(((i + 1) / allItems.length) * 100));
                    }
                    if (!coords && i % 30 === 0) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                }

                if (!isMounted) return;

                const groupsArray = Array.from(groupedMarkers.values());
                groupsArrayRef.current = groupsArray;
                const markers = [];
                const textOverlays = [];

                // 기존 텍스트 오버레이 제거
                if (textOverlaysRef.current) {
                    textOverlaysRef.current.forEach(to => to.setMap(null));
                }
                // 기존 마커 제거
                if (markersRef.current) {
                    clusterer.removeMarkers(markersRef.current);
                }

                groupsArray.forEach((group) => {
                    const markerPosition = new kakao.maps.LatLng(group.lat, group.lng);

                    // 각 학원마다 마커 생성 (클러스터러가 학원 개수를 세도록 함)
                    group.list.forEach(academy => {
                        const marker = new kakao.maps.Marker({
                            position: markerPosition,
                            title: academy.name
                        });

                        // 마커 클릭 이벤트 설정
                        kakao.maps.event.addListener(marker, 'click', () => {
                            showOverlay(kakao, map, markerPosition, group.list);
                        });

                        markers.push(marker);
                    });

                    // --- 마커 상단 텍스트 오버레이 생성 ---
                    const textContent = document.createElement('div');
                    textContent.style.cssText = `
                        background: rgba(255, 255, 255, 0.95);
                        padding: 3px 10px;
                        border-radius: 14px;
                        border: 1.5px solid var(--primary);
                        font-size: 11px;
                        font-weight: 850;
                        color: #1e1b4b;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                        white-space: nowrap;
                        cursor: pointer; /* 클릭 가능하도록 변경 */
                        pointer-events: auto; /* 이벤트 허용 */
                        transform: translateY(-48px); /* 마커 바로 위로 올림 */
                        text-shadow: 0 1px 1px white;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 2px;
                        z-index: 50;
                    `;

                    // 푯말 클릭 시에도 마커 클릭과 동일한 팝업 띄우기
                    textContent.onclick = (e) => {
                        e.stopPropagation();
                        showOverlay(kakao, map, markerPosition, group.list);
                    };

                    const textOverlay = new kakao.maps.CustomOverlay({
                        position: markerPosition,
                        content: textContent,
                        zIndex: 50
                    });
                    textOverlays.push(textOverlay);

                    // 마커 클릭 이벤트 설정은 이미 위에서 개별 마커별로 수행됨 (group.list.forEach 내)
                });

                markersRef.current = markers;

                textOverlaysRef.current = textOverlays;

                // 줌 레벨에 따라 텍스트 오버레이 가시성 및 내용 조절
                const isFocused = (a) => {
                    const fa = focusAcademyRef.current;
                    return fa && String(a.id) === String(fa.id) && a.address === fa.address;
                };
                const makeName = (a) => isFocused(a)
                    ? `<span style="color:#7c3aed;font-weight:800;">${a.name}</span>`
                    : a.name;
                const updateTextVisibility = () => {
                    if (!isMounted) return;
                    const level = map.getLevel();
                    groupsArray.forEach((group, idx) => {
                        const overlay = textOverlays[idx];
                        if (!overlay) return;

                        if (level <= 4) {
                            // 최대로 확대되었을 때는 전수 노출
                            if (level <= 1) {
                                overlay.getContent().innerHTML = group.list.map(a =>
                                    `<div style="line-height: 1.2; padding: 1px 0;">${makeName(a)}</div>`
                                ).join('');
                            } else {
                                // 중간 확대는 요약형: 포커스 학원이 있으면 그것을 앞에
                                const focusedInGroup = group.list.find(isFocused);
                                const first = focusedInGroup || group.list[0];
                                overlay.getContent().innerHTML = group.list.length > 1
                                    ? `${makeName(first)} <span style="color: #4f46e5; font-size: 10px;">외 ${group.list.length - 1}</span>`
                                    : makeName(first);
                            }
                            overlay.setMap(map);
                        } else {
                            overlay.setMap(null);
                        }
                    });
                };
                updateTextVisibilityRef.current = updateTextVisibility;
                kakao.maps.event.addListener(map, 'zoom_changed', updateTextVisibility);
                updateTextVisibility(); // 초기화 시 한 번 실행

                // 클러스터러에 마커들 한 번에 추가
                clusterer.addMarkers(markers);

                // 캐시 저장 (버전 태그 포함)
                if (newCacheNeeded) {
                    cachedLocations._v = CACHE_VER;
                    localStorage.setItem('academyMapLocations', JSON.stringify(cachedLocations));
                }
                // 주소→법정동 캐시 저장
                if (addrDongCacheModified) {
                    localStorage.setItem('academyAddrDongCache', JSON.stringify(addrDongCache));
                }

                // 완료
                setFailCount(localFail);
                setLoading(false);
                setMapReadyTick(t => t + 1); // 캐시 완전 히트 시 loading 배칭 우회
                setStatusMsg('');
                setErrorMsg('');

            } catch (err) {
                if (!isMounted) return;
                console.error("Kakao Map Error:", err);
                setErrorMsg(err.message || "지도 로드 중 오류가 발생했습니다.");
                setLoading(false);
            }
        };

        if (apiKey) {
            initMap();
        }

        return () => {
            isMounted = false;
        };
    }, [apiKey, filteredAcademies, filteredPrivateTutors]);

    // 미점검 기간 계산 (점검 기록 없으면 등록일 기준)
    const getUninspectedPeriod = (inspections, regDate) => {
        const hasInspection = inspections && inspections.length > 0;
        const lastDateStr = hasInspection ? inspections[0]?.date : regDate;
        if (!lastDateStr) return null;
        const last = new Date(lastDateStr.replace(/\./g, '-'));
        if (isNaN(last.getTime())) return null;
        const now = new Date();
        let years = now.getFullYear() - last.getFullYear();
        let months = now.getMonth() - last.getMonth();
        if (now.getDate() < last.getDate()) months--;
        if (months < 0) { years--; months += 12; }
        if (years < 0) return null;
        if (years === 0 && months === 0) return null;
        const prefix = hasInspection ? '미점검' : '최초미점검';
        if (years > 0 && months > 0) return `${prefix} ${years}년 ${months}월`;
        if (years > 0) return `${prefix} ${years}년`;
        return `${prefix} ${months}월`;
    };

    // 주소에서 호수 정보 추출 (팝업 표시 및 정렬용)
    const extractUnitInfo = (address) => {
        if (!address) return { label: '', sortKey: 999999 };

        // 1. 동+호 패턴 (e.g., "108동 1101호")
        const dongHoMatch = address.match(/(\d{1,4})동\s*(\d{3,4})호/);
        if (dongHoMatch) {
            const dong = parseInt(dongHoMatch[1]);
            const ho = parseInt(dongHoMatch[2]);
            return { label: `${dong}동 ${ho}호`, sortKey: dong * 10000 + ho };
        }

        // 2. 범위 호 (e.g., "303~305호")
        const rangeMatch = address.match(/(\d+)~(\d+)호/);
        if (rangeMatch) {
            return { label: rangeMatch[0], sortKey: parseInt(rangeMatch[1]) };
        }

        // 3. 콤마 이후 부분에서 호 검색 (e.g., ", 202호", ", 2-166호")
        const commaParts = address.split(',');
        if (commaParts.length > 1) {
            const afterComma = commaParts.slice(1).join(',');
            const hoMatch = afterComma.match(/(\d+(?:-\d+)?)호/);
            if (hoMatch) {
                const p = hoMatch[1].split('-');
                const sortKey = p.length > 1
                    ? parseInt(p[0]) * 1000 + parseInt(p[1])
                    : parseInt(p[0]);
                return { label: hoMatch[0], sortKey };
            }
        }

        // 4. 주소 끝의 호 패턴 (콤마 없는 경우, e.g., "303~305호", "202호")
        const endMatch = address.match(/(\d+(?:-\d+)?)호(?:\s*\([^)]*\))?\s*$/);
        if (endMatch) {
            const p = endMatch[1].split('-');
            const sortKey = p.length > 1
                ? parseInt(p[0]) * 1000 + parseInt(p[1])
                : parseInt(p[0]);
            return { label: endMatch[1] + '호', sortKey };
        }

        return { label: '', sortKey: 999999 };
    };

    // 커스텀 오버레이 (바닐라 JS) - 한 위치에 여러 학원이 있을 경우 리스트로 표시
    const showOverlay = (kakao, map, position, academyList) => {
        // 기존 오버레이 제거
        if (overlayRef.current) {
            overlayRef.current.setMap(null);
        }

        // --- 스마트 포지셔닝 로직 ---
        const projection = map.getProjection();
        const markerPixel = projection.pointFromCoords(position);
        const mapSize = {
            width: mapContainerRef.current.offsetWidth,
            height: mapContainerRef.current.offsetHeight
        };

        // 화면 중앙 기준으로 어느 쪽에 있는지 판별 (모바일에서 더 엄격하게)
        const mobileMode = window.innerWidth < 640;
        const rightThresh = mobileMode ? 0.55 : 0.6;
        const leftThresh  = mobileMode ? 0.45 : 0.4;
        const isOnRight = markerPixel.x > mapSize.width * rightThresh;
        const isOnLeft  = markerPixel.x < mapSize.width * leftThresh;
        const isOnTop   = markerPixel.y < mapSize.height * 0.4;
        const isOnBottom = markerPixel.y > mapSize.height * 0.65;

        // xAnchor/yAnchor 계산 (transform 대신 Kakao 내장 앵커 사용 → 히트박스가 시각적 팝업과 일치)
        let xAnchor = 0.5;
        let yAnchor = 1.0;
        let arrowStyle = `bottom: -10px; left: 50%; transform: translateX(-50%); border-top: 10px solid rgba(79, 70, 229, 0.9);`;
        let arrowShadowStyle = `bottom: -8px; left: 50%; transform: translateX(-50%); border-top: 9px solid rgba(255, 255, 255, 0.98);`;

        if (isOnTop) {
            yAnchor = 0.0;
            arrowStyle = `top: -10px; left: 50%; transform: translateX(-50%); border-bottom: 10px solid rgba(79, 70, 229, 0.9);`;
            arrowShadowStyle = `top: -8px; left: 50%; transform: translateX(-50%); border-bottom: 9px solid rgba(255, 255, 255, 0.98);`;
        }

        if (isOnRight && !isOnTop && !isOnBottom) {
            xAnchor = 1.0;
            yAnchor = 0.5;
            arrowStyle = `top: 50%; right: -10px; transform: translateY(-50%); border-left: 10px solid rgba(79, 70, 229, 0.9);`;
            arrowShadowStyle = `top: 50%; right: -8px; transform: translateY(-50%); border-left: 9px solid rgba(255, 255, 255, 0.98);`;
        } else if (isOnLeft && !isOnTop && !isOnBottom) {
            xAnchor = 0.0;
            yAnchor = 0.5;
            arrowStyle = `top: 50%; left: -10px; transform: translateY(-50%); border-right: 10px solid rgba(79, 70, 229, 0.9);`;
            arrowShadowStyle = `top: 50%; left: -8px; transform: translateY(-50%); border-right: 9px solid rgba(255, 255, 255, 0.98);`;
        } else if (isOnRight) {
            xAnchor = 1.0;
        } else if (isOnLeft) {
            xAnchor = 0.0;
        }

        const isMultiple = academyList.length > 1;
        const mobileW = window.innerWidth < 640;

        // 호수 기준 오름차순 정렬 (복사본 사용 → 원본 academyList 불변)
        const sortedList = [...academyList].sort((a, b) =>
            extractUnitInfo(a.address).sortKey - extractUnitInfo(b.address).sortKey
        );

        const overlayContent = document.createElement('div');

        overlayContent.style.cssText = `
            width: ${mobileW ? Math.min(window.innerWidth - 24, 260) + 'px' : '280px'};
            max-height: 360px;
            overflow-y: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: ${mobileW ? '12px 14px' : '14px 16px'};
            background-color: rgba(255, 255, 255, 0.97);
            border-radius: 18px;
            border: 2px solid rgba(79, 70, 229, 0.9);
            box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.4);
            position: relative;
            z-index: 2000;
        `;

        // Webkit용 스크롤바 숨기기 스타일 태그 추가
        const styleTag = document.createElement('style');
        styleTag.innerHTML = `div::-webkit-scrollbar { display: none; }`;
        overlayContent.appendChild(styleTag);

        // 팝업 내 이벤트가 지도로 전달되지 않도록 차단 (touchmove 포함 → 드래그 시 지도 이동 방지)
        const stopEvent = (e) => e.stopPropagation();
        overlayContent.addEventListener('mousedown', stopEvent);
        overlayContent.addEventListener('touchstart', stopEvent, { passive: false });
        overlayContent.addEventListener('touchmove', stopEvent, { passive: false });
        overlayContent.addEventListener('touchend', stopEvent);
        overlayContent.addEventListener('wheel', (e) => e.stopPropagation());

        let html = `
            <div id="close-btn" style="position: absolute; top: 10px; right: 12px; cursor: pointer; z-index: 10; font-size: 1rem; color: #4b5563; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.9); border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,0.2);">×</div>
            <div style="margin-bottom: 8px; border-bottom: 1.5px solid rgba(79, 70, 229, 0.15); padding-bottom: 7px; padding-right: 26px; word-break: keep-all;">
                <div style="font-size: 0.75rem; color: #1f2937; font-weight: 700;">📍 ${academyList[0].address.split('(')[0].trim()}</div>
                ${isMultiple ? `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                    <span style="color: #4f46e5; font-weight: 900; font-size: 0.78rem;">이 건물 내 ${academyList.length}개 기관</span>
                    <button id="copy-building-btn" title="학원명·등록번호 복사" style="display: flex; align-items: center; gap: 3px; font-size: 0.68rem; color: #4f46e5; background: rgba(79,70,229,0.1); border: 1px solid rgba(79,70,229,0.3); border-radius: 5px; padding: 2px 7px; cursor: pointer; font-weight: 700; white-space: nowrap;">
                        📋 복사
                    </button>
                </div>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 0;">
        `;

        sortedList.forEach((academy, idx) => {
            // 교습소: 이름 끝에 이미 '교습소' 표시됨 → 배지 불필요
            // 학교교과교습학원: 배지 불필요
            // 평생직업교육학원: '평생직업교육'으로 축약하여 이름 오른쪽에 표시
            const cat = academy.category;
            const showBadge = cat && cat !== '학교교과교습학원' && cat !== '교습소' && cat !== '과외';
            const badgeLabel = cat === '평생직업교육학원' ? '평생직업교육' : cat;
            const unitInfo = extractUnitInfo(academy.address);
            const uninspected = getUninspectedPeriod(academy.inspections, academy.regDate || academy.reportDate);

            html += `
                <div style="padding: ${idx === sortedList.length - 1 ? '5px 0 0' : '5px 0'}; border-bottom: ${idx === sortedList.length - 1 ? 'none' : '1px solid rgba(0,0,0,0.07)'}; display: flex; align-items: center; gap: 4px; min-width: 0;">
                    <span class="academy-name-link" data-idx="${idx}" style="font-size: 0.93rem; font-weight: 800; color: #1e1b4b; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex-shrink: 1;">${academy.name}</span>
                    <span style="font-size: 0.72rem; color: #6b7280; font-weight: 600; white-space: nowrap; flex-shrink: 0;">${unitInfo.label ? unitInfo.label : ''}${uninspected ? ` <span style="color: #dc2626; font-weight: 700;">${uninspected}</span>` : ''}</span>
                    ${showBadge ? `<span style="font-size: 0.6rem; color: #4f46e5; font-weight: 800; padding: 1px 5px; background: rgba(79,70,229,0.1); border-radius: 5px; white-space: nowrap; flex-shrink: 0;">${badgeLabel}</span>` : ''}
                </div>
            `;
        });

        html += `
            </div>
            <div style="position: absolute; width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; ${arrowStyle}"></div>
            <div style="position: absolute; width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; ${arrowShadowStyle}"></div>
        `;

        const container = document.createElement('div');
        container.innerHTML = html;
        overlayContent.appendChild(container);

        // 이벤트 등록
        overlayContent.querySelector('#close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (overlayRef.current) overlayRef.current.setMap(null);
        });

        const copyBtn = overlayContent.querySelector('#copy-building-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const catLabel = (a) => {
                    const c = a.category || '';
                    if (c.includes('교습소')) return '교습소';
                    if (c.includes('과외') || a.type === 'privateTutor') return '과외';
                    return '학원';
                };
                const text = sortedList.map(a => `${catLabel(a)}\t${a.id || ''}\t${a.name}`).join('\n');
                const fallback = () => {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                };
                const done = () => {
                    copyBtn.textContent = '✅ 복사됨';
                    setTimeout(() => { copyBtn.innerHTML = '📋 복사'; }, 1500);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done).catch(() => { fallback(); done(); });
                } else {
                    fallback();
                    done();
                }
            });
        }

        overlayContent.querySelectorAll('.academy-name-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
                const currentMap = mapInstanceRef.current;
                const mapState = currentMap ? {
                    lat: currentMap.getCenter().getLat(),
                    lng: currentMap.getCenter().getLng(),
                    level: currentMap.getLevel()
                } : null;
                onSelectAcademy(sortedList[idx], mapState);
            });
        });

        // 오버레이 생성 (xAnchor/yAnchor로 위치 제어 → 히트박스가 시각적 팝업과 정확히 일치)
        const overlay = new kakao.maps.CustomOverlay({
            position: position,
            content: overlayContent,
            clickable: true,
            zIndex: 1000,
            xAnchor: xAnchor,
            yAnchor: yAnchor,
        });

        overlay.setMap(map);
        overlayRef.current = overlay;
    };


    const handleSaveApiKey = () => {
        if (!inputKey.trim()) return;
        localStorage.setItem('kakao_api_key', inputKey.trim());
        setApiKey(inputKey.trim());
        setErrorMsg('');
    };

    const handleClearApiKey = () => {
        localStorage.removeItem('kakao_api_key');
        setApiKey('');
        setInputKey('');
        setErrorMsg('');
        if (overlayRef.current) overlayRef.current.setMap(null);
    };

    // focusAcademy: 지도 로딩 완료 후 해당 학원 위치로 이동 및 이름 강조 표시
    useEffect(() => {
        if (loading || !focusAcademy || !mapInstanceRef.current || !kakaoRef.current) return;
        focusAcademyRef.current = focusAcademy;
        const kakao = kakaoRef.current;
        const map = mapInstanceRef.current;

        const placeMarkerAndCenter = (position) => {
            // 기존 포커스 마커 제거
            if (focusMarkerRef.current) {
                focusMarkerRef.current.setMap(null);
                focusMarkerRef.current = null;
            }

            // 보라색 핀 마커 생성
            const pinEl = document.createElement('div');
            pinEl.style.cssText = 'cursor:pointer;';
            pinEl.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48" style="display:block;filter:drop-shadow(0 3px 6px rgba(109,40,217,0.5));">
                    <path d="M18 0C8.059 0 0 8.059 0 18c0 12 18 30 18 30S36 30 36 18C36 8.059 27.941 0 18 0z" fill="#7c3aed"/>
                    <circle cx="18" cy="18" r="9" fill="white"/>
                    <circle cx="18" cy="18" r="5" fill="#7c3aed"/>
                </svg>
            `;
            const focusOverlay = new kakao.maps.CustomOverlay({
                position,
                content: pinEl,
                zIndex: 200,
                xAnchor: 0.5,
                yAnchor: 1.0,
            });
            focusOverlay.setMap(map);
            focusMarkerRef.current = focusOverlay;

            map.setCenter(position);
            map.setLevel(2);
            // 텍스트 오버레이에서 포커스 학원 이름을 굵은 보라색으로 갱신
            updateTextVisibilityRef.current?.();
        };

        // 1차: 이미 로드된 그룹에서 학원 찾기 (필터 내 개원 학원)
        const group = groupsArrayRef.current.find(g => g.list.some(a =>
            String(a.id) === String(focusAcademy.id) &&
            a.address === focusAcademy.address
        ));

        if (group) {
            placeMarkerAndCenter(new kakao.maps.LatLng(group.lat, group.lng));
        } else {
            // 2차 fallback: 필터 밖(비개원, 광주시 등)인 경우 주소 직접 지오코딩
            geocodeAddress(kakao, focusAcademy.address).then(coords => {
                if (coords) {
                    placeMarkerAndCenter(new kakao.maps.LatLng(coords.lat, coords.lng));
                }
            });
        }
    }, [loading, focusAcademy, mapReadyTick]); // eslint-disable-line react-hooks/exhaustive-deps

    // routeAcademies: 경로 번호 마커 표시 (일반 마커 숨김 포함)
    useEffect(() => {
        if (loading || !mapInstanceRef.current || !kakaoRef.current || !clustererRef.current) return;
        const kakao = kakaoRef.current;
        const map = mapInstanceRef.current;
        const clusterer = clustererRef.current;

        // 기존 경로 마커 제거
        routeMarkersRef.current.forEach(o => o.setMap(null));
        routeMarkersRef.current = [];

        if (!routeAcademies?.length) {
            // 일반 마커 및 텍스트 오버레이 복원
            if (markersRef.current.length > 0) {
                clusterer.addMarkers(markersRef.current);
            }
            const level = map.getLevel();
            textOverlaysRef.current.forEach((overlay, idx) => {
                const group = groupsArrayRef.current[idx];
                if (!group || !overlay) return;
                if (level <= 4) {
                    if (level <= 1) {
                        overlay.getContent().innerHTML = group.list.map(a => `<div style="line-height:1.2;padding:1px 0;">${a.name}</div>`).join('');
                    } else {
                        overlay.getContent().innerHTML = group.list.length > 1
                            ? `${group.list[0].name} <span style="color:#4f46e5;font-size:10px;">외 ${group.list.length - 1}</span>`
                            : group.list[0].name;
                    }
                    overlay.setMap(map);
                }
            });
            return;
        }

        // 일반 마커 및 텍스트 오버레이 숨김
        clusterer.removeMarkers(markersRef.current);
        textOverlaysRef.current.forEach(o => o.setMap(null));

        // 경로 학원을 좌표별로 그룹핑 (같은 건물 처리)
        const locationGroups = new Map();
        routeAcademies.forEach((academy, idx) => {
            const group = groupsArrayRef.current.find(g =>
                g.list.some(a => a.id === academy.id && a.name === academy.name && a.address === academy.address)
            );
            if (!group) return;
            const coordKey = `${group.lat.toFixed(6)},${group.lng.toFixed(6)}`;
            if (!locationGroups.has(coordKey)) locationGroups.set(coordKey, { group, items: [] });
            locationGroups.get(coordKey).items.push({ academy, order: idx + 1 });
        });

        const positions = [];
        locationGroups.forEach(({ group, items }) => {
            const position = new kakao.maps.LatLng(group.lat, group.lng);
            positions.push(position);

            const el = document.createElement('div');
            el.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:3px;';

            items.forEach(({ academy, order }) => {
                const unit = extractUnitInfo(academy.address);
                const unitStr = unit.label ? ` ${unit.label}` : '';
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;';
                row.innerHTML = `
                    <div style="width:24px;height:24px;border-radius:50%;background:#f97316;color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;border:2px solid white;box-shadow:0 2px 6px rgba(249,115,22,0.5);flex-shrink:0;">${order}</div>
                    <div style="background:rgba(255,255,255,0.95);padding:2px 8px;border-radius:10px;border:1.5px solid #f97316;font-size:11px;font-weight:700;color:#1e1b4b;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.15);">${academy.name}${unitStr}</div>
                `;
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (onSelectAcademy) onSelectAcademy(academy);
                });
                el.appendChild(row);
            });

            const overlay = new kakao.maps.CustomOverlay({
                position, content: el, zIndex: 150, xAnchor: 0.5, yAnchor: 1.0,
            });
            overlay.setMap(map);
            routeMarkersRef.current.push(overlay);
        });

        if (positions.length >= 2) {
            const bounds = new kakao.maps.LatLngBounds();
            positions.forEach(p => bounds.extend(p));
            map.setBounds(bounds, 60);
        } else if (positions.length === 1) {
            map.setCenter(positions[0]);
            map.setLevel(3);
        }
    }, [loading, routeAcademies]); // eslint-disable-line react-hooks/exhaustive-deps

    // 현재 위치 표시
    const handleMyLocation = () => {
        if (!navigator.geolocation) {
            alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
            return;
        }
        const map = mapInstanceRef.current;
        const kakao = window.kakao;
        if (!map || !kakao) return;

        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                const { latitude, longitude } = pos.coords;
                const latlng = new kakao.maps.LatLng(latitude, longitude);

                // 기존 현재 위치 마커 제거
                if (myLocationMarkerRef.current) {
                    myLocationMarkerRef.current.setMap(null);
                }

                // 빨간 마커 (핀 모양)
                const content = `<div style="
                    display:flex;flex-direction:column;align-items:center;
                    transform:translateY(-100%);
                ">
                    <div style="
                        width:22px;height:22px;border-radius:50% 50% 50% 0;
                        background:#ef4444;border:3px solid #fff;
                        transform:rotate(-45deg);
                        box-shadow:0 2px 8px rgba(0,0,0,0.3);
                    "></div>
                </div>`;
                const overlay = new kakao.maps.CustomOverlay({
                    position: latlng,
                    content,
                    zIndex: 10,
                });
                overlay.setMap(map);
                myLocationMarkerRef.current = overlay;

                // 지도 중심 이동
                map.setCenter(latlng);
            },
            () => {
                setLocating(false);
                alert('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.');
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    // ───────────────────────────────────────────────
    // 렌더링 영역
    // ───────────────────────────────────────────────

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'var(--bg-light)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
            {/* Header (Floating on Top of Map) */}
            {apiKey && (
                <div style={{
                    position: 'absolute',
                    top: isMobile ? '10px' : '20px',
                    left: isMobile ? '10px' : '20px',
                    right: isMobile ? '10px' : '25px',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    pointerEvents: 'none'
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: isMobile ? '6px 10px' : '10px 18px',
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        borderRadius: isMobile ? '12px' : '20px',
                        gap: isMobile ? '0' : '8px',
                        boxShadow: '0 8px 32px -4px rgba(0, 0, 0, 0.12)',
                        pointerEvents: 'auto',
                        width: isMobile ? 'calc(100% - 20px)' : 'auto',
                        maxWidth: isMobile ? '500px' : 'none'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: isMobile ? '8px' : '12px',
                            width: '100%',
                            flexWrap: isMobile ? 'nowrap' : 'wrap'
                        }}>
                            <button
                                onClick={onBack}
                                style={{ background: 'var(--primary)', border: 'none', color: 'white', fontSize: isMobile ? '0.9rem' : '1.1rem', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', width: isMobile ? '26px' : '32px', height: isMobile ? '26px' : '32px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)', flexShrink: 0 }}
                            >
                                ←
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px', flex: isMobile ? '1' : 'none' }}>
                                {!isMobile && (
                                    <h2 style={{ fontSize: '1.05rem', margin: 0, color: 'var(--text-main)', fontWeight: '900', letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>
                                        🗺️ 분포 지도
                                    </h2>
                                )}

                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    backgroundColor: 'var(--primary-glow)',
                                    padding: isMobile ? '2px 6px' : '3px 8px',
                                    borderRadius: '8px',
                                    fontSize: isMobile ? '0.75rem' : '0.8rem',
                                    color: 'var(--primary)',
                                    fontWeight: '900',
                                    whiteSpace: 'nowrap'
                                }}>
                                    <span>{(filteredAcademies.length + filteredPrivateTutors.length).toLocaleString()}</span>
                                    <span style={{ opacity: 0.7, marginLeft: '1px' }}>곳</span>
                                </div>

                                {isMobile && (
                                    <div style={{ display: 'flex', gap: '8px', marginLeft: '2px' }}>
                                        <div
                                            onClick={() => setFilterAcademy(!filterAcademy)}
                                            style={{ fontSize: '0.75rem', fontWeight: '800', color: filterAcademy ? 'var(--primary)' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                        >
                                            <div style={{ width: '13px', height: '13px', borderRadius: '3px', border: `1.5px solid ${filterAcademy ? 'var(--primary)' : '#cbd5e1'}`, backgroundColor: filterAcademy ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {filterAcademy && <div style={{ width: '5px', height: '5px', backgroundColor: 'white', borderRadius: '2px' }} />}
                                            </div>
                                            학원
                                        </div>
                                        <div
                                            onClick={() => setFilterTutoring(!filterTutoring)}
                                            style={{ fontSize: '0.75rem', fontWeight: '800', color: filterTutoring ? '#ec4899' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                        >
                                            <div style={{ width: '13px', height: '13px', borderRadius: '3px', border: `1.5px solid ${filterTutoring ? '#ec4899' : '#cbd5e1'}`, backgroundColor: filterTutoring ? '#ec4899' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {filterTutoring && <div style={{ width: '5px', height: '5px', backgroundColor: 'white', borderRadius: '2px' }} />}
                                            </div>
                                            교습소
                                        </div>
                                        <div
                                            onClick={() => setFilterPrivateTutor(!filterPrivateTutor)}
                                            style={{ fontSize: '0.75rem', fontWeight: '800', color: filterPrivateTutor ? '#f59e0b' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                        >
                                            <div style={{ width: '13px', height: '13px', borderRadius: '3px', border: `1.5px solid ${filterPrivateTutor ? '#f59e0b' : '#cbd5e1'}`, backgroundColor: filterPrivateTutor ? '#f59e0b' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {filterPrivateTutor && <div style={{ width: '5px', height: '5px', backgroundColor: 'white', borderRadius: '2px' }} />}
                                            </div>
                                            과외
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: isMobile ? 'auto' : '0' }}>
                                <div
                                    onClick={() => setFilterGwangju(!filterGwangju)}
                                    style={{
                                        padding: isMobile ? '3px 8px' : '3px 7px',
                                        borderRadius: '6px',
                                        fontSize: isMobile ? '0.75rem' : '0.75rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        backgroundColor: filterGwangju ? '#DCFCE7' : '#f1f5f9',
                                        color: filterGwangju ? '#16A34A' : '#94a3b8',
                                        border: `1.2px solid ${filterGwangju ? '#16A34A' : '#e2e8f0'}`,
                                        userSelect: 'none'
                                    }}
                                >
                                    광주
                                </div>
                                <div
                                    onClick={() => setFilterHanam(!filterHanam)}
                                    style={{
                                        padding: isMobile ? '3px 8px' : '3px 7px',
                                        borderRadius: '6px',
                                        fontSize: isMobile ? '0.75rem' : '0.75rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        backgroundColor: filterHanam ? '#E8F4FD' : '#f1f5f9',
                                        color: filterHanam ? '#2563EB' : '#94a3b8',
                                        border: `1.2px solid ${filterHanam ? '#2563EB' : '#e2e8f0'}`,
                                        userSelect: 'none'
                                    }}
                                >
                                    하남
                                </div>
                            </div>
                        </div>

                        {!isMobile && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                paddingTop: '4px',
                                borderTop: '1px solid rgba(0,0,0,0.05)',
                                marginTop: '2px'
                            }}>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: '800', color: filterAcademy ? 'var(--text-main)' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={filterAcademy}
                                            onChange={(e) => setFilterAcademy(e.target.checked)}
                                            style={{ width: '14px', height: '14px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                        />
                                        학원
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: '800', color: filterTutoring ? 'var(--text-main)' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={filterTutoring}
                                            onChange={(e) => setFilterTutoring(e.target.checked)}
                                            style={{ width: '14px', height: '14px', accentColor: '#ec4899', cursor: 'pointer' }}
                                        />
                                        교습소
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: '800', color: filterPrivateTutor ? 'var(--text-main)' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={filterPrivateTutor}
                                            onChange={(e) => setFilterPrivateTutor(e.target.checked)}
                                            style={{ width: '14px', height: '14px', accentColor: '#f59e0b', cursor: 'pointer' }}
                                        />
                                        과외
                                    </label>
                                </div>
                                <div style={{ flex: 1, minWidth: '15px' }}></div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', display: 'flex', gap: '6px', opacity: 0.8 }}>
                                    <span>학원 <span style={{ color: 'var(--primary)' }}>{filteredAcademies.filter(a => a.category.includes('학원')).length}</span></span>
                                    <span>교습소 <span style={{ color: '#ec4899' }}>{filteredAcademies.filter(a => a.category.includes('교습소')).length}</span></span>
                                    <span>과외 <span style={{ color: '#f59e0b' }}>{filteredPrivateTutors.length}</span></span>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* 환경 변수 키가 없을 때(사용자 직접 입력 모드일 때)만 재설정 버튼 노출 */}
                    {!import.meta.env.VITE_KAKAO_MAP_API_KEY && apiKey && (
                        <button
                            onClick={handleClearApiKey}
                            style={{
                                background: 'rgba(255, 255, 255, 0.8)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid #fee2e2',
                                padding: '10px 18px',
                                borderRadius: '14px',
                                color: '#ef4444',
                                fontSize: '0.85rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                boxShadow: 'var(--shadow-md)',
                                pointerEvents: 'auto'
                            }}>
                            API 키 재설정
                        </button>
                    )}
                </div>
            )}

            {/* API 키 설정 화면 */}
            {!apiKey && (
                <div style={{ flex: 1, padding: '30px 20px', overflowY: 'auto' }}>
                    <div className="glass-panel" style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.4rem', marginBottom: '16px', color: 'var(--text-main)' }}>💡 지도 기능 사용을 위한 안내</h3>
                        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '24px' }}>
                            기본 원본 데이터(학원/교습소 조회 탭) 1,000건의 기관 데이터를 지도상에 분포시키려면 <strong>본인의 카카오 API 키</strong> 설정이 필요합니다.<br /><br />
                            1. <a href="https://developers.kakao.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>카카오 디벨로퍼스</a> 접속 및 로그인<br />
                            2. 내 애플리케이션 추가 후 <strong>JavaScript 키</strong> 복사<br />
                            3. '플랫폼' 설정에서 <strong>Web 플랫폼 도메인</strong>에 <code>http://localhost:5173</code> 추가
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input
                                type="text"
                                placeholder="여기에 JavaScript 키를 붙여넣으세요"
                                value={inputKey}
                                onChange={(e) => setInputKey(e.target.value)}
                                style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '1rem', outline: 'none' }}
                            />
                            <button
                                onClick={handleSaveApiKey}
                                style={{ padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', opacity: inputKey ? 1 : 0.5 }}
                                disabled={!inputKey}
                            >
                                키 저장하고 지도 열기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {errorMsg && apiKey && (
                <div style={{ padding: '20px', backgroundColor: '#fef2f2', color: '#ef4444', textAlign: 'center', borderBottom: '1px solid #fca5a5', fontWeight: 'bold' }}>
                    {errorMsg}
                </div>
            )}

            {/* Map Area */}
            {apiKey && (
                <div style={{ flex: 1, position: 'relative' }}>
                    {loading && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, backgroundColor: 'rgba(255,255,255,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
                            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>{statusMsg}</div>
                            {progress > 0 && <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary)', marginTop: '8px' }}>{progress}%</div>}
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '12px' }}>현재 주소 좌표를 지표로 변환중입니다...</div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {/* Native Kakao Map Container */}
                    <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }}></div>

                    {/* 내 위치 버튼 — 우하단 고정 */}
                    <button
                        onClick={handleMyLocation}
                        disabled={locating}
                        style={{
                            position: 'absolute',
                            bottom: failCount > 0 ? '52px' : '16px',
                            right: '14px',
                            zIndex: 50,
                            background: 'rgba(255,255,255,0.95)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid #bfdbfe',
                            padding: '10px 14px',
                            borderRadius: '50px',
                            color: locating ? '#94a3b8' : '#2563eb',
                            fontSize: '0.85rem',
                            fontWeight: '800',
                            cursor: locating ? 'default' : 'pointer',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                        }}>
                        {locating ? '⏳' : '📍'} 내 위치
                    </button>

                    {/* 좌표 변환 실패 안내 */}
                    {!loading && failCount > 0 && (
                        <div style={{
                            position: 'absolute', bottom: '12px', left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(254,242,242,0.95)', backdropFilter: 'blur(8px)',
                            border: '1px solid #fca5a5', borderRadius: '10px',
                            padding: '6px 14px', zIndex: 50,
                            fontSize: '0.75rem', color: '#b91c1c', fontWeight: '600',
                            whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                        }}>
                            ⚠️ {failCount.toLocaleString()}개 기관이 주소 변환에 실패하여 지도에 표시되지 않았습니다
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default KakaoMapPage;
