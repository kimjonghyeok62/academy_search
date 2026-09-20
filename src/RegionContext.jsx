// useRegion 훅을 Provider 와 같은 파일에 둔다 — price-checker 와 같은 구성.
/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  BUILTIN_REGIONS, isRegionReady, loadRegionRates, readCachedRegions, readSelectedRegion, writeSelectedRegion,
} from './utils/regionRates';

// 선택한 지역(교육지원청)과 그 지역 기준단가를 앱 전체에 나눠 준다
const RegionContext = createContext(null);

export function RegionProvider({ children }) {
  const [regions, setRegions] = useState(() => readCachedRegions() || BUILTIN_REGIONS);
  const [source, setSource] = useState('builtin');
  const [loading, setLoading] = useState(true);
  const [region, setRegionState] = useState(readSelectedRegion);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadRegionRates();
      setRegions(result.regions);
      setSource(result.source);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setRegion = useCallback((name) => {
    setRegionState(name);
    writeSelectedRegion(name);
  }, []);

  const value = useMemo(() => {
    const info = regions.find(r => r.region === region) || null;
    return {
      regions,
      region,
      setRegion,
      info,
      rows: info?.rows || [],
      officeName: info?.officeName || '',
      tutoringHourlyRate: info?.tutoringHourly || 0,
      effectiveDate: info?.effectiveDate || '',
      ratesReady: isRegionReady(info),
      source,
      loading,
      reload,
    };
  }, [regions, region, setRegion, source, loading, reload]);

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  return useContext(RegionContext);
}
