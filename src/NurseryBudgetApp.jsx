import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, LineChart, Table2, CheckSquare, GalleryHorizontalEnd, Trash2, Plus, Save, RefreshCcw, Bug, CloudUpload, CloudDownload, Link as LinkIcon, KeyRound, Upload } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

/**
 * 유치부 예산관리 대시보드 (단일 파일 React 컴포넌트)
 * - 탭: 대시보드, 세세목별, 월별, 영수증, 입금확인, 자가 테스트
 * - 기능: 지출 입력 / CSV 가져오기·내보내기 / 로컬스토리지 저장 / 차트·갤러리
 * - 모바일: 카메라 바로 열기(capture), 터치 타깃 확대
 * - PWA: 홈 화면 설치 & (가능한 환경에서만) 오프라인 캐시
 * - 클라우드 동기화(선택): Firebase 또는 Google Apps Script(Drive/Sheets)
 * - 데이터 스키마: { id, date(YYYY-MM-DD), category, description, amount(number), purchaser, receiptUrl, reimbursed(boolean), reimbursedAt(YYYY-MM-DD) }
 */

const LOCAL_KEY = "nursery-expenses-2025";
const CLOUD_META = "nursery-cloud-meta"; // Firebase 설정 저장
const GS_META = "nursery-gscript-meta"; // Apps Script 설정 저장
const BUDGET = {
  year: 2025,
  total: 6297000,
  items: [
    { key: "예배비", budget: 570000 },
    { key: "교육비", budget: 2200000 },
    { key: "교사교육비", budget: 356000 },
    { key: "행사비", budget: 1701000 },
    { key: "성경학교 및 수련회", budget: 940000 },
    { key: "운영행정비", budget: 530000 },
  ],
};

const CATEGORY_ORDER = BUDGET.items.map((i) => i.key);

const TabButton = ({ active, onClick, icon: Icon, children }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition shadow-sm min-h-[44px] ${
      active ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50 border-gray-200"
    }`}
  >
    {Icon && <Icon size={18} />}
    <span className="font-medium">{children}</span>
  </button>
);

function formatKRW(n) {
  if (typeof n !== "number" || isNaN(n)) return "—";
  return n.toLocaleString("ko-KR") + "원";
}

function parseAmount(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

function monthKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, cur) => {
    const k = keyFn(cur);
    acc[k] = acc[k] || [];
    acc[k].push(cur);
    return acc;
  }, {});
}

function useLocalStorageState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

// ----- CSV 유틸 (줄바꿈 정규화) -----
function csvToRows(csvText) {
  const lines = String(csvText).replace(/\r\n?|\n/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return [];
  const header = splitCsvLine(nonEmpty[0]);
  return nonEmpty.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => (row[h.trim()] = cols[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (s) => {
    const t = String(s ?? "");
    if (/[",\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
  return head + "\n" + body;
}

// ---- Firebase 로더 (동적 로드) ----
async function loadFirebaseCompat() {
  if (window.firebase) return window.firebase;
  const appSrc = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js";
  const authSrc = "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js";
  const fsSrc = "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js";
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = appSrc; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  await Promise.all([
    new Promise((res, rej) => { const s = document.createElement("script"); s.src = authSrc; s.onload = res; s.onerror = rej; document.head.appendChild(s); }),
    new Promise((res, rej) => { const s = document.createElement("script"); s.src = fsSrc;   s.onload = res; s.onerror = rej; document.head.appendChild(s); }),
  ]);
  return window.firebase;
}

// ---- Google Apps Script 연동 헬퍼 ----
function useGScriptConfig() {
  const [cfg, setCfg] = useState(() => {
    try { return JSON.parse(localStorage.getItem(GS_META) || "null") || { url: "", token: "" }; } catch { return { url: "", token: "" }; }
  });
  useEffect(() => { localStorage.setItem(GS_META, JSON.stringify(cfg)); }, [cfg]);
  return [cfg, setCfg];
}

async function gsFetch(cfg, action, payload) {
  if (!cfg?.url) throw new Error("Apps Script URL이 비어 있습니다.");
  const token = cfg.token || "";

  // 1) 목록은 GET (프리플라이트 회피)
  if (action === "list") {
    const u = new URL(cfg.url);
    u.searchParams.set("action", "list");
    u.searchParams.set("token", token);
    const resp = await fetch(u.toString(), { method: "GET" });
    if (!resp.ok) throw new Error(`Apps Script 응답 오류: ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // 2) 저장/업로드는 POST + text/plain (단순요청)
  const body = JSON.stringify({ action, token, ...payload });
  const resp = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // ★ 중요: application/json 금지
    body,
  });
  if (!resp.ok) throw new Error(`Apps Script 응답 오류: ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}


// ---- PWA (manifest + service worker) ----
function canRegisterSW() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return false;
  const href = String(location.href || "");
  if (href.startsWith("blob:")) return false;
  const proto = location.protocol;
  return proto === "https:" || proto === "http:";
}

async function setupPWA() {
  try {
    const manifest = {
      name: "유치부 예산관리",
      short_name: "유치부 예산",
      start_url: ".",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#111111",
      icons: [
        { src: dataIcon(192), sizes: "192x192", type: "image/png" },
        { src: dataIcon(512), sizes: "512x512", type: "image/png" },
      ],
    };
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) { link = document.createElement("link"); link.setAttribute("rel", "manifest"); document.head.appendChild(link); }
    link.setAttribute("href", manifestUrl);

    if (canRegisterSW()) {
      try {
        const resp = await fetch("./sw.js", { method: "HEAD" });
        if (resp.ok) {
          await navigator.serviceWorker.register("./sw.js");
        }
      } catch {}
    }
  } catch {}
}

function dataIcon(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111"; ctx.fillRect(0,0,size,size);
  ctx.fillStyle = "#fff"; ctx.font = `${Math.floor(size*0.28)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("N", size/2, size/2);
  return canvas.toDataURL("image/png");
}

const initialExpenses = [];

export default function NurseryBudgetApp() {
  const [tab, setTab] = useState("dashboard");
  const [expenses, setExpenses] = useLocalStorageState(LOCAL_KEY, initialExpenses);

  const [form, setForm] = useState({
    date: "",
    category: CATEGORY_ORDER[0],
    description: "",
    amount: "",
    purchaser: "",
    receiptUrl: "",
  });

  // objectURL 해제용 (메모리 누수 방지)
  const receiptObjUrlRef = useRef("");
  useEffect(() => {
    return () => {
      if (receiptObjUrlRef.current) {
        try { URL.revokeObjectURL(receiptObjUrlRef.current); } catch {}
      }
    };
  }, []);

  // Firebase Cloud state
  const [cloudOn, setCloudOn] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudInfo, setCloudInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CLOUD_META) || "null") || { projectId: "", apiKey: "", appId: "", authDomain: "", userId: "" }; } catch { return { projectId: "", apiKey: "", appId: "", authDomain: "", userId: "" }; }
  });
  const cloudRef = useRef({ unsub: null, updating: false });

  // Google Apps Script config
  const [gsCfg, setGsCfg] = useGScriptConfig();
  const [gsOn, setGsOn] = useState(false);
  const gsSyncRef = useRef(false); // GS 동기화 루프 방지

  const inputFileRef = useRef(null);

  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + parseAmount(e.amount), 0), [expenses]);
  const byCategory = useMemo(() => groupBy(expenses, (e) => e.category || "미분류"), [expenses]);
  const byMonth = useMemo(() => groupBy(expenses, (e) => monthKey(e.date)), [expenses]);

  const categorySummary = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => {
      const budget = BUDGET.items.find((i) => i.key === cat)?.budget || 0;
      const spent = (byCategory[cat] || []).reduce((s, e) => s + parseAmount(e.amount), 0);
      return { category: cat, budget, spent, remain: Math.max(budget - spent, 0) };
    });
  }, [byCategory]);

  const monthSeries = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => `${BUDGET.year}-${String(i + 1).padStart(2, "0")}`);
    return months.map((m) => ({ month: m, amount: (byMonth[m] || []).reduce((s, e) => s + parseAmount(e.amount), 0) }));
  }, [byMonth]);

  // 입금(환급) 집계
  const reimbursedSum = useMemo(() => expenses.filter((e) => e.reimbursed).reduce((s, e) => s + parseAmount(e.amount), 0), [expenses]);
  const pendingSum = useMemo(() => expenses.filter((e) => !e.reimbursed).reduce((s, e) => s + parseAmount(e.amount), 0), [expenses]);

  // PWA 설정 (1회)
  useEffect(() => { setupPWA(); }, []);

  // Firebase: 로컬 변경 → 업로드 (옵션)
  useEffect(() => {
    if (!cloudOn || !cloudInfo.userId) return;
    if (cloudRef.current.updating) return;
    (async () => {
      try {
        setCloudBusy(true);
        const firebase = await loadFirebaseCompat();
        // eslint-disable-next-line no-unused-vars
        const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp({
          apiKey: cloudInfo.apiKey,
          authDomain: cloudInfo.authDomain,
          projectId: cloudInfo.projectId,
          appId: cloudInfo.appId,
        });
        const fs = firebase.firestore();
        const docRef = fs.collection("nursery-budget").doc(LOCAL_KEY);
        await docRef.set({ expenses }, { merge: true });
      } catch (e) {
        console.warn("Cloud push error", e);
      } finally {
        setCloudBusy(false);
      }
    })();
  }, [expenses, cloudOn, cloudInfo]);

  // Google Apps Script: 로컬 변경 → 저장 (옵션)
  useEffect(() => {
    if (!gsOn || !gsCfg.url) return;
    if (gsSyncRef.current) { gsSyncRef.current = false; return; }
    (async () => {
      try {
        await gsFetch(gsCfg, "save", { expenses });
      } catch (e) {
        console.warn("GScript save error", e);
      }
    })();
  }, [expenses, gsOn, gsCfg]);

  async function resetAll() {
    if (!confirm("모든 지출 데이터(로컬 저장)를 삭제하시겠습니까?")) return;
    setExpenses([]);
    try { if (gsOn && gsCfg.url) await gsFetch(gsCfg, "save", { expenses: [] }); } catch {}
  }

  function addExpense(e) {
    e.preventDefault();
    const payload = {
      id: crypto.randomUUID(),
      date: form.date,
      category: form.category,
      description: form.description.trim(),
      amount: parseAmount(form.amount),
      purchaser: form.purchaser.trim(),
      receiptUrl: form.receiptUrl.trim(),
      reimbursed: false,
      reimbursedAt: "",
    };
    if (!payload.date || !payload.category || !payload.amount) {
      alert("날짜, 세세목, 금액은 필수입니다.");
      return;
    }
    setExpenses((prev) => [payload, ...prev]);
    setForm({ date: "", category: CATEGORY_ORDER[0], description: "", amount: "", purchaser: "", receiptUrl: "" });
  }

  function deleteExpense(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  function onImportCsv(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const rows = csvToRows(text);
      const normalized = rows
        .map((r) => ({
          id: crypto.randomUUID(),
          date: r.date || r.날짜 || "",
          category: r.category || r.세세목 || r.분류 || "",
          description: r.description || r.적요 || r.설명 || "",
          amount: parseAmount(r.amount || r.금액),
          purchaser: r.purchaser || r.구매자 || "",
          receiptUrl: r.receiptUrl || r.영수증 || r.영수증URL || "",
          reimbursed: String(r.reimbursed || r.입금완료 || "").toLowerCase() === "true",
          reimbursedAt: r.reimbursedAt || r.입금일 || "",
        }))
        .filter((x) => x.date && x.category && x.amount);
      setExpenses((prev) => [...normalized, ...prev]);
      if (inputFileRef.current) inputFileRef.current.value = "";
      alert(`${normalized.length}건을 가져왔습니다.`);
    };
    reader.readAsText(file, "utf-8");
  }

  function onExportCsv() {
    const rows = expenses.map(({ id, ...rest }) => rest);
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `유치부_지출내역_${BUDGET.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Apps Script가 설정돼 있으면 드라이브에 업로드 → 공개보기 URL로 교체
    if (gsOn && gsCfg.url) {
      try {
        const b64 = await fileToDataUrl(file);
        const res = await gsFetch(gsCfg, "uploadReceipt", {
          filename: file.name,
          mimeType: file.type || "image/png",
          dataUrl: b64,
        });
        if (res && res.viewUrl) {
          setForm((f) => ({ ...f, receiptUrl: res.viewUrl }));
          return;
        }
      } catch (err) {
        console.warn("Drive 업로드 실패", err);
        alert("드라이브 업로드 실패: 로컬 미리보기 URL로 대체합니다.");
      }
    }

    // fallback: 로컬 미리보기
    const nextUrl = URL.createObjectURL(file);
    if (receiptObjUrlRef.current) {
      try { URL.revokeObjectURL(receiptObjUrlRef.current); } catch {}
    }
    receiptObjUrlRef.current = nextUrl;
    setForm((f) => ({ ...f, receiptUrl: nextUrl }));
  }

  async function connectCloud() {
    try {
      setCloudBusy(true);
      const firebase = await loadFirebaseCompat();
      // eslint-disable-next-line no-unused-vars
      const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp({
        apiKey: cloudInfo.apiKey,
        authDomain: cloudInfo.authDomain,
        projectId: cloudInfo.projectId,
        appId: cloudInfo.appId,
      });
      const auth = firebase.auth();
      const { user } = await auth.signInAnonymously();
      const userId = user?.uid || "";
      const fs = firebase.firestore();
      const docRef = fs.collection("nursery-budget").doc(LOCAL_KEY);

      if (cloudRef.current.unsub) { cloudRef.current.unsub(); cloudRef.current.unsub = null; }
      cloudRef.current.unsub = docRef.onSnapshot((snap) => {
        const data = snap.data();
        if (data && Array.isArray(data.expenses)) {
          cloudRef.current.updating = true;
          setExpenses(data.expenses);
          setTimeout(() => (cloudRef.current.updating = false), 200);
        }
      });

      setCloudInfo((prev) => ({ ...prev, userId }));
      localStorage.setItem(CLOUD_META, JSON.stringify({ ...cloudInfo, userId }));
      setCloudOn(true);
      alert("클라우드 동기화에 연결되었습니다.");
    } catch (e) {
      console.warn(e);
      alert("클라우드 연결 실패: Firebase 설정을 확인해 주세요.");
    } finally {
      setCloudBusy(false);
    }
  }

  function disconnectCloud() {
    try {
      if (cloudRef.current.unsub) { cloudRef.current.unsub(); cloudRef.current.unsub = null; }
      setCloudOn(false);
    } catch {}
  }

  async function gsLoad() {
    try {
      const data = await gsFetch(gsCfg, "list", {});
      if (Array.isArray(data.expenses)) {
        gsSyncRef.current = true;
        setExpenses(data.expenses);
      }
    } catch (e) {
      alert("시트에서 불러오기 실패: " + e.message);
    }
  }

  async function gsPush() {
    try {
      await gsFetch(gsCfg, "save", { expenses });
      alert("시트에 저장 완료");
    } catch (e) {
      alert("시트 저장 실패: " + e.message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <style>{`
        input, button, select { min-height:44px; }
        th, td { vertical-align: middle; }
        .sticky-cards { position: sticky; top: 64px; z-index: 10; background: white; padding-top: 8px; }
      `}</style>

      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">유치부 예산관리 대시보드</h1>
            <p className="text-sm text-gray-600">{BUDGET.year} 회계 | 총 예산 {formatKRW(BUDGET.total)} | 현재 지출 {formatKRW(totalSpent)} | 잔액 {formatKRW(Math.max(BUDGET.total - totalSpent, 0))}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="px-4 py-3 rounded-xl border bg-white hover:bg-gray-50 flex items-center gap-2" onClick={onExportCsv}>
              <Download size={16} /> 내보내기(CSV)
            </button>
            <label className="px-4 py-3 rounded-xl border bg-white hover:bg-gray-50 flex items-center gap-2 cursor-pointer">
              <FileUp size={16} /> 불러오기(CSV)
              <input ref={inputFileRef} type="file" accept=".csv" className="hidden" onChange={onImportCsv} />
            </label>
            <button className="px-4 py-3 rounded-xl border bg-white hover:bg-red-50 text-red-600 flex items-center gap-2" onClick={resetAll}>
              <Trash2 size={16} /> 전체삭제
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Firebase 동기화 */}
        <section className="mb-4 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">클라우드 동기화(Firebase)</h2>
            <div className="flex items-center gap-2">
              {!cloudOn ? (
                <button disabled={cloudBusy} onClick={connectCloud} className="px-4 py-3 rounded-xl border bg-white hover:bg-gray-50">연결</button>
              ) : (
                <button onClick={disconnectCloud} className="px-4 py-3 rounded-xl border bg-white hover:bg-gray-50">연결해제</button>
              )}
              {cloudBusy && <span className="text-sm text-gray-500">동기화 중…</span>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <input className="rounded-xl border px-3 py-2" placeholder="apiKey" value={cloudInfo.apiKey} onChange={(e)=>setCloudInfo(v=>{const n={...v,apiKey:e.target.value}; localStorage.setItem(CLOUD_META,JSON.stringify(n)); return n;})} />
            <input className="rounded-xl border px-3 py-2" placeholder="authDomain" value={cloudInfo.authDomain} onChange={(e)=>setCloudInfo(v=>{const n={...v,authDomain:e.target.value}; localStorage.setItem(CLOUD_META,JSON.stringify(n)); return n;})} />
            <input className="rounded-xl border px-3 py-2" placeholder="projectId" value={cloudInfo.projectId} onChange={(e)=>setCloudInfo(v=>{const n={...v,projectId:e.target.value}; localStorage.setItem(CLOUD_META,JSON.stringify(n)); return n;})} />
            <input className="rounded-xl border px-3 py-2" placeholder="appId" value={cloudInfo.appId} onChange={(e)=>setCloudInfo(v=>{const n={...v,appId:e.target.value}; localStorage.setItem(CLOUD_META,JSON.stringify(n)); return n;})} />
          </div>
          <p className="text-xs text-gray-500 mt-2">프로젝트를 생성하고 위 4개 설정만 입력해도 익명 로그인 + Firestore 동기화가 작동합니다. (보안규칙은 본인 프로젝트에서 설정하세요)</p>
        </section>

        {/* Google Apps Script (Drive/Sheets) 동기화 */}
        <section className="mb-6 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">구글 드라이브/시트 연동 (Apps Script)</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setGsOn(v=>!v)} className={`px-4 py-3 rounded-xl border ${gsOn? 'bg-black text-white border-black':'bg-white'}`}>{gsOn? '사용중' : '사용안함'}</button>
              <button onClick={gsLoad} className="px-4 py-3 rounded-xl border bg-white hover:bg-gray-50 flex items-center gap-2"><CloudDownload size={16}/> 불러오기</button>
              <button onClick={gsPush} className="px-4 py-3 rounded-xl border bg-white hover:bg-gray-50 flex items-center gap-2"><CloudUpload size={16}/> 저장하기</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-3">
            <div className="md:col-span-4 flex items-center gap-2">
              <LinkIcon size={16} className="text-gray-500"/>
              <input className="flex-1 rounded-xl border px-3 py-2" placeholder="Apps Script Web App URL (배포 후 나온 URL)" value={gsCfg.url} onChange={(e)=>setGsCfg(v=>({...v, url:e.target.value}))} />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <KeyRound size={16} className="text-gray-500"/>
              <input className="flex-1 rounded-xl border px-3 py-2" placeholder="보안 토큰 (任意 문자열)" value={gsCfg.token} onChange={(e)=>setGsCfg(v=>({...v, token:e.target.value}))} />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">시트/폴더는 Apps Script 쪽에서 관리합니다. 위 URL/토큰만 설정하면 드라이브 자동 업로드 + 시트 저장/불러오기가 동작합니다.</p>
        </section>

        <div className="flex flex-wrap gap-2 mb-6">
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={LineChart}>대시보드</TabButton>
          <TabButton active={tab === "bycat"} onClick={() => setTab("bycat")} icon={Table2}>세세목별</TabButton>
          <TabButton active={tab === "bymonth"} onClick={() => setTab("bymonth")} icon={LineChart}>월별</TabButton>
          <TabButton active={tab === "receipts"} onClick={() => setTab("receipts")} icon={GalleryHorizontalEnd}>영수증</TabButton>
          <TabButton active={tab === "reimburse"} onClick={() => setTab("reimburse")} icon={CheckSquare}>입금확인</TabButton>
          <TabButton active={tab === "tests"} onClick={() => setTab("tests")} icon={Bug}>자가 테스트</TabButton>
        </div>

        <section className="mb-8 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">지출 입력</h2>
          <form onSubmit={addExpense} className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-1">
              <label className="text-sm text-gray-600">날짜</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full mt-1 rounded-xl border px-3 py-2" />
            </div>
            <div className="md:col-span-1">
              <label className="text-sm text-gray-600">세세목</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full mt-1 rounded-xl border px-3 py-2">
                {CATEGORY_ORDER.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600">적요 / 설명</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="예: 주일 간식, 교재 구입 등" className="w-full mt-1 rounded-xl border px-3 py-2" />
            </div>
            <div className="md:col-span-1">
              <label className="text-sm text-gray-600">금액(원)</label>
              <input type="text" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="예: 12000" className="w-full mt-1 rounded-xl border px-3 py-2" />
            </div>
            <div className="md:col-span-1">
              <label className="text-sm text-gray-600">구매자</label>
              <input type="text" value={form.purchaser} onChange={(e) => setForm({ ...form, purchaser: e.target.value })} placeholder="예: 김집사" className="w-full mt-1 rounded-xl border px-3 py-2" />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm text-gray-600">영수증 이미지(선택)</label>
              <div className="flex items-center gap-2 mt-1">
                <label className="rounded-xl border px-3 py-2 cursor-pointer flex items-center gap-2">
                  <Upload size={16}/> 파일 선택
                  <input type="file" accept="image/*" capture="environment" onChange={onImageUpload} className="hidden" />
                </label>
                <input type="url" value={form.receiptUrl} onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })} placeholder="이미지 URL 붙여넣기(선택)" className="flex-1 rounded-xl border px-3 py-2" />
              </div>
            </div>
            <div className="md:col-span-3 flex items-end gap-2">
              <button type="submit" className="px-5 py-3 rounded-2xl bg-black text-white flex items-center gap-2 shadow min-h-[44px]">
                <Plus size={16} /> 추가
              </button>
              <button type="button" className="px-5 py-3 rounded-2xl bg-white border flex items-center gap-2 min-h-[44px]" onClick={() => setForm({ date: "", category: CATEGORY_ORDER[0], description: "", amount: "", purchaser: "", receiptUrl: "" })}>
                <RefreshCcw size={16} /> 초기화
              </button>
            </div>
          </form>
        </section>

        {tab === "dashboard" && (
          <Dashboard totalSpent={totalSpent} categorySummary={categorySummary} />
        )}
        {tab === "bycat" && (
          <ByCategory categorySummary={categorySummary} expenses={expenses} onDelete={deleteExpense} />
        )}
        {tab === "bymonth" && <ByMonth monthSeries={monthSeries} />}
        {tab === "receipts" && <ReceiptsGallery expenses={expenses} onDelete={deleteExpense} />}
        {tab === "reimburse" && (
          <Reimbursements expenses={expenses} setExpenses={setExpenses} reimbursedSum={reimbursedSum} pendingSum={pendingSum} />
        )}
        {tab === "tests" && <SelfTests />}

        <footer className="mt-12 text-center text-xs text-gray-500">© {new Date().getFullYear()} 유치부 예산관리 — 로컬 저장 + (옵션) Firebase/Apps Script 동기화. 가능 환경에서 PWA 지원.</footer>
      </main>
    </div>
  );
}

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-xl h-3 overflow-hidden">
      <div className="h-3 bg-black" style={{ width: pct + "%" }} />
    </div>
  );
}

function Card({ title, children, right }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Dashboard({ totalSpent, categorySummary }) {
  const totalBudget = BUDGET.total;
  const remain = Math.max(totalBudget - totalSpent, 0);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card title="총 예산">
        <p className="text-2xl font-bold">{formatKRW(totalBudget)}</p>
      </Card>
      <Card title="현재 지출">
        <p className="text-2xl font-bold">{formatKRW(totalSpent)}</p>
      </Card>
      <Card title="잔액">
        <p className="text-2xl font-bold">{formatKRW(remain)}</p>
      </Card>
      <div className="md:col-span-3">
        <Card title="세세목별 집행 현황">
          <div className="space-y-4">
            {categorySummary.map((row) => (
              <div key={row.category} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                <div className="md:col-span-1 font-medium">{row.category}</div>
                <div className="md:col-span-3"><ProgressBar value={row.spent} max={row.budget} /></div>
                <div className="md:col-span-1 text-sm text-gray-600">{formatKRW(row.spent)} / {formatKRW(row.budget)}</div>
                <div className="md:col-span-1 text-right font-medium">잔액 {formatKRW(row.remain)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ByCategory({ categorySummary, expenses, onDelete }) {
  const [filterCat, setFilterCat] = useState("");
  const filtered = filterCat ? expenses.filter((e) => e.category === filterCat) : expenses;

  return (
    <div className="space-y-6">
      <Card title="세세목별 요약">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">세세목</th>
                <th className="py-2">예산액</th>
                <th className="py-2">지출액</th>
                <th className="py-2">잔액</th>
              </tr>
            </thead>
            <tbody>
              {categorySummary.map((r) => {
                const active = r.category === filterCat;
                return (
                  <tr key={r.category} className={`border-b last:border-0 ${active ? 'bg-gray-50' : ''}`}>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setFilterCat(active ? "" : r.category)}
                        className={`underline-offset-2 ${active ? 'text-black font-semibold' : 'text-blue-700 hover:underline'}`}
                        aria-pressed={active}
                        aria-label={`세세목 '${r.category}' ${active ? '필터 해제' : '필터 적용'}`}
                      >
                        {r.category}
                      </button>
                    </td>
                    <td className="py-2">{formatKRW(r.budget)}</td>
                    <td className="py-2">{formatKRW(r.spent)}</td>
                    <td className="py-2">{formatKRW(r.remain)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`세세목별 상세 지출내역${filterCat ? ' — ' + filterCat + '만 보기' : ''}`}
        right={filterCat ? (
          <button
            type="button"
            onClick={() => setFilterCat("")}
            className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm"
            aria-label="세세목 필터 해제"
          >필터 해제</button>
        ) : null}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">날짜</th>
                <th className="py-2">세세목</th>
                <th className="py-2">적요</th>
                <th className="py-2">금액</th>
                <th className="py-2">구매자</th>
                <th className="py-2">영수증</th>
                <th className="py-2 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500">해당 세세목 지출이 없습니다.</td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-2">{e.date}</td>
                    <td className="py-2">{e.category}</td>
                    <td className="py-2">{e.description}</td>
                    <td className="py-2">{formatKRW(parseAmount(e.amount))}</td>
                    <td className="py-2">{e.purchaser}</td>
                    <td className="py-2">
                      {e.receiptUrl ? (
                        <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">보기</a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => onDelete(e.id)} className="px-3 py-2 rounded-lg border text-red-600 hover:bg-red-50 min-h-[40px]">삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ByMonth({ monthSeries }) {
  return (
    <Card title="월별 지출(원)">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthSeries} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => formatKRW(Number(v))} labelFormatter={(l) => `${l} 지출`} />
            <Bar dataKey="amount" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Reimbursements({ expenses, setExpenses, reimbursedSum, pendingSum }) {
  const [filter, setFilter] = useState("pending"); // pending | paid | all
  const filtered = expenses.filter(e => filter === "all" ? true : filter === "pending" ? !e.reimbursed : !!e.reimbursed);

  function togglePaid(id, value) {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, reimbursed: value, reimbursedAt: value ? (e.reimbursedAt || new Date().toISOString().slice(0,10)) : "" } : e));
  }
  function setPaidNow(id) {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, reimbursed: true, reimbursedAt: new Date().toISOString().slice(0,10) } : e));
  }
  const total = expenses.reduce((s, e) => s + parseAmount(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="sticky-cards">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="총 지출"><p className="text-2xl font-bold">{formatKRW(total)}</p></Card>
          <Card title="입금 완료 합계"><p className="text-2xl font-bold">{formatKRW(reimbursedSum)}</p></Card>
          <Card title="미입금 합계"><p className="text-2xl font-bold">{formatKRW(pendingSum)}</p></Card>
        </div>
      </div>

      <Card title="입금 확인 체크리스트" right={
        <div className="flex gap-2">
          <button onClick={()=>setFilter("pending")} className={`px-4 py-2 rounded-xl border ${filter==='pending'? 'bg-black text-white border-black':'bg-white'}`}>미입금</button>
          <button onClick={()=>setFilter("paid")} className={`px-4 py-2 rounded-xl border ${filter==='paid'? 'bg-black text-white border-black':'bg-white'}`}>입금완료</button>
          <button onClick={()=>setFilter("all")} className={`px-4 py-2 rounded-xl border ${filter==='all'? 'bg-black text-white border-black':'bg-white'}`}>전체</button>
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">입금</th>
                <th className="py-2">입금일</th>
                <th className="py-2">날짜</th>
                <th className="py-2">금액</th>
                <th className="py-2">적요</th>
                <th className="py-2">구매자</th>
                <th className="py-2">세세목</th>
                <th className="py-2 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2"><input type="checkbox" className="w-5 h-5" checked={!!e.reimbursed} onChange={(ev) => togglePaid(e.id, ev.target.checked)} aria-label="입금 여부" /></td>
                  <td className="py-2"><input type="date" value={e.reimbursedAt || ""} onChange={(ev) => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, reimbursedAt: ev.target.value, reimbursed: !!ev.target.value } : x))} className="rounded-lg border px-2 py-2 min-h-[40px]" aria-label="입금일" /></td>
                  <td className="py-2">{e.date}</td>
                  <td className="py-2">{formatKRW(parseAmount(e.amount))}</td>
                  <td className="py-2">{e.description}</td>
                  <td className="py-2">{e.purchaser}</td>
                  <td className="py-2">{e.category}</td>
                  <td className="py-2 text-right"><button onClick={() => setPaidNow(e.id)} className="px-3 py-2 rounded-lg border flex items-center gap-1 min-h-[40px]"><Save size={14}/> 오늘 입금 처리</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ReceiptsGallery({ expenses, onDelete }) {
  const withReceipts = expenses.filter((e) => e.receiptUrl);
  return (
    <div className="space-y-6">
      <Card title={`영수증 갤러리 (${withReceipts.length}건)`}>
        {withReceipts.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 영수증이 없습니다. 상단 입력 폼에서 이미지 업로드 또는 URL을 추가해 주세요.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {withReceipts.map((e) => (
              <div key={e.id} className="border rounded-2xl overflow-hidden bg-white">
                <div className="aspect-video bg-gray-100 overflow-hidden">
                  <img src={e.receiptUrl} alt={e.description || "receipt"} className="w-full h-full object-contain" />
                </div>
                <div className="p-3 text-sm">
                  <div className="font-medium">{e.description || "영수증"}</div>
                  <div className="text-gray-600 mt-1">{e.date} · {e.category} · {formatKRW(parseAmount(e.amount))} · {e.purchaser || ""}</div>
                  <div className="mt-2 text-right">
                    <button onClick={() => onDelete(e.id)} className="px-3 py-2 rounded-lg border text-red-600 hover:bg-red-50 min-h-[40px]">삭제</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="CSV 포맷 안내">
        <p className="text-sm text-gray-700 mb-2">다음 열 이름으로 CSV를 만들면 바로 불러올 수 있습니다.</p>
        <pre className="bg-gray-50 p-3 rounded-xl text-xs overflow-x-auto border">date,category,description,amount,purchaser,receiptUrl,reimbursed,reimbursedAt
2025-01-05,교육비,주일 교재 구입,32000,김집사,https://예시/receipt1.jpg,false,
2025-02-12,행사비,부활절 준비물,45000,박권사,,true,2025-02-28
2025-03-01,운영행정비,문구류 구입,12000,홍집사,,false,
</pre>
      </Card>
    </div>
  );
}

// -------- 유틸: 파일 → dataURL --------
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// -------- 자가 테스트(최소 테스트 케이스 포함) --------
function SelfTests() {
  const [result, setResult] = useState([]);
  useEffect(() => {
    const cases = [];
    // 1) parseAmount
    cases.push({ name: "parseAmount 숫자", pass: parseAmount(12345) === 12345 });
    cases.push({ name: "parseAmount 문자열", pass: parseAmount("12,300원") === 12300 });
    // 2) monthKey
    cases.push({ name: "monthKey 기본", pass: monthKey("2025-03-15") === "2025-03" });
    // 3) csv roundtrip
    const rows = [
      { date: "2025-01-01", category: "교육비", description: "교재", amount: 10000, purchaser: "김집사", receiptUrl: "", reimbursed: false, reimbursedAt: "" },
      { date: "2025-02-02", category: "행사비", description: "간식", amount: 25000, purchaser: "박권사", receiptUrl: "", reimbursed: true, reimbursedAt: "2025-02-10" },
    ];
    const csv = rowsToCsv(rows);
    const back = csvToRows(csv);
    cases.push({ name: "CSV roundtrip 행수", pass: back.length === rows.length });
    cases.push({ name: "CSV roundtrip 헤더", pass: Object.keys(back[0]).length === Object.keys(rows[0]).length });
    // 4) PWA canRegisterSW guard (blob/보안 체크)
    const guard = canRegisterSW();
    cases.push({ name: "canRegisterSW 타입", pass: typeof guard === "boolean" });

    setResult(cases);
  }, []);

  const allPass = result.every((t) => t.pass);
  return (
    <Card title="자가 테스트 결과">
      <div className="text-sm mb-2">총 {result.length}개 테스트 — {allPass ? "✅ 모두 통과" : "❌ 일부 실패"}</div>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {result.map((t, i) => (
          <li key={i}>{t.pass ? "✅" : "❌"} {t.name}</li>
        ))}
      </ul>
      {!allPass && <div className="text-xs text-red-600 mt-2">테스트 실패 항목을 알려주세요. 기대 동작을 확인해 맞춰 드리겠습니다.</div>}
    </Card>
  );
}
