import React, { useState, useEffect, useRef } from 'react';

function KakaoMapPage({ academies, onBack, onSelectAcademy }) {
    // 환경 변수(.env)에서 먼저 키를 찾고, 없으면 localStorage 확인
    const [apiKey, setApiKey] = useState(
        import.meta.env.VITE_KAKAO_MAP_API_KEY || localStorage.getItem('kakao_api_key') || ''
    );
    const [inputKey, setInputKey] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [statusMsg, setStatusMsg] = useState('');
    const [progress, setProgress] = useState(0);
    const [loading, setLoading] = useState(false);

    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const clustererRef = useRef(null);
    const overlayRef = useRef(null);
    const textOverlaysRef = useRef([]);
    const markersRef = useRef([]); // 마커들 관리
    const [filterAcademy, setFilterAcademy] = useState(true);
    const [filterTutoring, setFilterTutoring] = useState(true);
    const [filterGwangju, setFilterGwangju] = useState(false);
    const [filterHanam, setFilterHanam] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

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

            // "폐", "휴" 상태만 제외하고 나머지는 노출 (비어있는 경우 포함하여 최대한 노출되도록 완화)
            const status = a.status || '';
            if (status.includes('폐') || status.includes('휴')) return;

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

            // 카테고리 체크
            let categoryMatch = (filterAcademy && isAcademy) || (filterTutoring && isTutoring);

            // 지역 체크
            let regionMatch = (filterGwangju && isGwangju) || (filterHanam && isHanam);

            return categoryMatch && regionMatch;
        });
    }, [baseAcademies, filterAcademy, filterTutoring, filterGwangju, filterHanam]);

    // 카카오맵 스크립트 로드
    const loadKakaoMapScript = () => {
        return new Promise((resolve, reject) => {
            if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
                resolve(window.kakao);
                return;
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
                    if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
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

    // 주소 -> 좌표 변환 헬퍼 (카카오 네이티브)
    const geocodeAddress = (kakao, address) => {
        return new Promise((resolve) => {
            const geocoder = new kakao.maps.services.Geocoder();
            const cleanAddress = address.split(',')[0].trim();
            geocoder.addressSearch(cleanAddress, (result, status) => {
                if (status === kakao.maps.services.Status.OK) {
                    resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
                } else {
                    resolve(null);
                }
            });
        });
    };

    // 지도 초기화 및 마커 렌더링 메인 로직
    useEffect(() => {
        if (!apiKey) return;

        let isMounted = true;
        setLoading(true);
        setStatusMsg("스크립트 로딩 중...");

        const initMap = async () => {
            console.log(`[KakaoMap] 필터링된 학원 수: ${filteredAcademies.length} / 전체: ${academies?.length}`);
            try {
                const kakao = await loadKakaoMapScript();
                if (!isMounted) return;

                setStatusMsg("지도 초기화 중...");

                // 지도 컨테이너 확인
                if (!mapContainerRef.current) {
                    throw new Error("지도 컨테이너를 찾을 수 없습니다.");
                }

                // 지도 생성
                const centerPosition = new kakao.maps.LatLng(37.5670, 127.1962); // 미사역 기준
                const mapOptions = {
                    center: centerPosition,
                    level: 4
                };

                const map = new kakao.maps.Map(mapContainerRef.current, mapOptions);
                mapInstanceRef.current = map;

                // 지도 빈 공간 클릭 시 오버레이 닫기
                kakao.maps.event.addListener(map, 'click', () => {
                    if (overlayRef.current) overlayRef.current.setMap(null);
                });

                // 클러스터러 생성
                const clusterer = new kakao.maps.MarkerClusterer({
                    map: map,
                    averageCenter: true,
                    minLevel: 5,
                    disableClickZoom: false
                });
                clustererRef.current = clusterer;

                // 좌표 데이터 수집 및 그룹핑 시작
                setStatusMsg(`주소 좌표 변환 및 그룹핑 중... (총 ${filteredAcademies.length}건)`);
                const cachedLocations = JSON.parse(localStorage.getItem('academyMapLocations') || '{}');
                let newCacheNeeded = false;

                // 좌표를 기준으로 학원들을 그룹핑
                const groupedMarkers = new Map();

                for (let i = 0; i < filteredAcademies.length; i++) {
                    if (!isMounted) return;

                    const academy = filteredAcademies[i];
                    const cacheKey = `${academy.id}-${academy.category}`;
                    let coords = cachedLocations[cacheKey];

                    if (!coords) {
                        coords = await geocodeAddress(kakao, academy.address);
                        if (coords) {
                            cachedLocations[cacheKey] = coords;
                            newCacheNeeded = true;
                        }
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
                    if (i % 20 === 0 || i === filteredAcademies.length - 1) {
                        setProgress(Math.round(((i + 1) / filteredAcademies.length) * 100));
                    }
                    if (!coords && i % 30 === 0) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                }

                if (!isMounted) return;

                const groupsArray = Array.from(groupedMarkers.values());
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
                const updateTextVisibility = () => {
                    if (!isMounted) return;
                    const level = map.getLevel();
                    groupsArray.forEach((group, idx) => {
                        const overlay = textOverlays[idx];
                        if (!overlay) return;

                        if (level <= 4) {
                            // 최대로 확대되었을 때는 전수 노출
                            if (level <= 1) {
                                overlay.getContent().innerHTML = group.list.map(a => `<div style="line-height: 1.2; padding: 1px 0;">${a.name}</div>`).join('');
                            } else {
                                // 중간 확대는 요약형
                                overlay.getContent().innerHTML = group.list.length > 1
                                    ? `${group.list[0].name} <span style="color: #4f46e5; font-size: 10px;">외 ${group.list.length - 1}</span>`
                                    : group.list[0].name;
                            }
                            overlay.setMap(map);
                        } else {
                            overlay.setMap(null);
                        }
                    });
                };
                kakao.maps.event.addListener(map, 'zoom_changed', updateTextVisibility);
                updateTextVisibility(); // 초기화 시 한 번 실행

                // 클러스터러에 마커들 한 번에 추가
                clusterer.addMarkers(markers);

                // 캐시 저장
                if (newCacheNeeded) {
                    localStorage.setItem('academyMapLocations', JSON.stringify(cachedLocations));
                }

                // 완료
                setLoading(false);
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
    }, [apiKey, filteredAcademies]);

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

        // 화면 중앙 기준으로 어느 쪽에 있는지 판별
        const isOnRight = markerPixel.x > mapSize.width * 0.6;
        const isOnLeft = markerPixel.x < mapSize.width * 0.4;
        const isOnTop = markerPixel.y < mapSize.height * 0.4;
        const isOnBottom = markerPixel.y > mapSize.height * 0.6;

        // 변형(transform) 값 및 간격 최적화 (마커 포인트를 완벽히 피하도록 조정)
        let translateX = '-50%';
        let translateY = '-100%';
        let marginTop = '-55px'; // 기본 위치(마커 위)에서 마커 이미지를 완전히 벗어나도록 상향 조정
        let arrowStyle = `bottom: -10px; left: 50%; transform: translateX(-50%); border-top: 10px solid rgba(79, 70, 229, 0.9);`;
        let arrowShadowStyle = `bottom: -8px; left: 50%; transform: translateX(-50%); border-top: 9px solid rgba(255, 255, 255, 0.98);`;

        if (isOnTop) {
            translateY = '0%';
            marginTop = '25px'; // 마커 아래쪽으로 뜰 때도 중심부 가리지 않게 하향 조정
            arrowStyle = `top: -10px; left: 50%; transform: translateX(-50%); border-bottom: 10px solid rgba(79, 70, 229, 0.9);`;
            arrowShadowStyle = `top: -8px; left: 50%; transform: translateX(-50%); border-bottom: 9px solid rgba(255, 255, 255, 0.98);`;
        }

        if (isOnRight) {
            translateX = '-100%';
            if (!isOnTop && !isOnBottom) {
                translateX = '-100%';
                translateY = '-50%';
                marginTop = '0';
                arrowStyle = `top: 50%; right: -10px; transform: translateY(-50%); border-left: 10px solid rgba(79, 70, 229, 0.9);`;
                arrowShadowStyle = `top: 50%; right: -8px; transform: translateY(-50%); border-left: 9px solid rgba(255, 255, 255, 0.98);`;
            }
        } else if (isOnLeft) {
            translateX = '0%';
            if (!isOnTop && !isOnBottom) {
                translateX = '0%';
                translateY = '-50%';
                marginTop = '0';
                arrowStyle = `top: 50%; left: -10px; transform: translateY(-50%); border-right: 10px solid rgba(79, 70, 229, 0.9);`;
                arrowShadowStyle = `top: 50%; left: -8px; transform: translateY(-50%); border-right: 9px solid rgba(255, 255, 255, 0.98);`;
            }
        }

        const isMultiple = academyList.length > 1;
        const overlayContent = document.createElement('div');

        // 불투명도 90%로 높임 (시인성 강화)
        overlayContent.style.cssText = `
            width: 300px;
            max-height: 480px;
            overflow-y: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 24px;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 28px;
            border: 2px solid rgba(79, 70, 229, 0.9);
            box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
            position: relative;
            transform: translate(${translateX}, ${translateY});
            margin-top: ${marginTop};
            z-index: 2000;
        `;

        // Webkit용 스크롤바 숨기기 스타일 태그 추가
        const styleTag = document.createElement('style');
        styleTag.innerHTML = `div::-webkit-scrollbar { display: none; }`;
        overlayContent.appendChild(styleTag);

        // 팝업 내에서의 스크롤이나 클릭이 지도로 전달되지 않도록 차단
        const stopEvent = (e) => e.stopPropagation();
        overlayContent.addEventListener('mousedown', stopEvent);
        overlayContent.addEventListener('touchstart', stopEvent);
        overlayContent.addEventListener('wheel', (e) => e.stopPropagation());

        let html = `
            <div id="close-btn" style="position: absolute; top: 16px; right: 18px; cursor: pointer; z-index: 10; font-size: 1.2rem; color: #4b5563; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.9); border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">×</div>
            <div style="font-size: 0.85rem; color: #1f2937; margin-bottom: 18px; border-bottom: 2px solid rgba(79, 70, 229, 0.15); padding-bottom: 12px; padding-right: 35px; word-break: keep-all; font-weight: 800; text-shadow: 0 1px 1px rgba(255,255,255,1);">
                📍 ${academyList[0].address.split('(')[0]}
                ${isMultiple ? `<div style="color: #4f46e5; font-weight: 900; margin-top: 5px; font-size: 0.8rem; text-shadow: 0 1px 1px rgba(255,255,255,0.8);">이 건물 내 ${academyList.length}개 기관</div>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 18px;">
        `;

        academyList.forEach((academy, idx) => {
            const displayCategory = academy.category === '학교교과교습학원' ? '' : academy.category;

            html += `
                <div style="padding-bottom: ${idx === academyList.length - 1 ? '0' : '16px'}; border-bottom: ${idx === academyList.length - 1 ? 'none' : '1px dashed rgba(0,0,0,0.2)'}">
                    ${displayCategory ? `<div style="font-size: 0.7rem; color: #4f46e5; font-weight: 900; padding: 2px 7px; background: rgba(79, 70, 229, 0.15); display: inline-block; border-radius: 6px; margin-bottom: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">${displayCategory}</div>` : ''}
                    <div class="academy-name-link" data-idx="${idx}" style="font-size: 1.15rem; font-weight: 950; color: #1e1b4b; margin-bottom: 4px; word-break: keep-all; cursor: pointer; text-decoration: underline; text-underline-offset: 5px; line-height: 1.35; text-shadow: 0 0.5px 1px rgba(0,0,0,0.1);">
                        ${academy.name}
                    </div>
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

        overlayContent.querySelectorAll('.academy-name-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = e.currentTarget.getAttribute('data-idx');
                onSelectAcademy(academyList[idx]);
            });
        });

        // 오버레이 생성 (zIndex를 높게 설정하여 라벨 위로 올림)
        const overlay = new kakao.maps.CustomOverlay({
            position: position,
            content: overlayContent,
            clickable: true,
            zIndex: 1000
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
                                    <span>{filteredAcademies.length.toLocaleString()}</span>
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
                                </div>
                                <div style={{ flex: 1, minWidth: '15px' }}></div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', display: 'flex', gap: '6px', opacity: 0.8 }}>
                                    <span>학원 <span style={{ color: 'var(--primary)' }}>{filteredAcademies.filter(a => a.category.includes('학원')).length}</span></span>
                                    <span>교습소 <span style={{ color: '#ec4899' }}>{filteredAcademies.filter(a => a.category.includes('교습소')).length}</span></span>
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
                </div>
            )}
        </div>
    );
}

export default KakaoMapPage;
