import { useState, useEffect } from 'react';
import { GS_META } from '../constants';

export function useGScriptConfig() {
  const [cfg, setCfg] = useState(() => {
    try { return JSON.parse(localStorage.getItem(GS_META) || "null") || { url: "", token: "" }; } catch { return { url: "", token: "" }; }
  });
  useEffect(() => { localStorage.setItem(GS_META, JSON.stringify(cfg)); }, [cfg]);
  return [cfg, setCfg];
}
