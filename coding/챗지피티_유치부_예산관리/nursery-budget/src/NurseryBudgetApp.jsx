/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, LineChart, Table2, CheckSquare, GalleryHorizontalEnd, Trash2, Plus, Save, RefreshCcw, Bug, CloudUpload, CloudDownload, Link as LinkIcon, KeyRound, Upload, Settings, Loader2, Pencil } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { BUDGET, CATEGORY_ORDER, CLOUD_META, GS_META, LOCAL_KEY } from "./constants";
import TabButton from "./components/TabButton";
import ProgressBar from "./components/ProgressBar";
import Card from "./components/Card";
import Dashboard from './components/Dashboard';
import ByCategory from './components/ByCategory';
import ByMonth from './components/ByMonth';
import Reimbursements from './components/Reimbursements';
import ReceiptsGallery from './components/ReceiptsGallery';
import SelfTests from './components/SelfTests';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { useGScriptConfig } from './hooks/useGScriptConfig';
import { groupBy } from './utils/collections';
import { loadFirebaseCompat } from './utils/firebase';
import { gsFetch } from './utils/google';
import { fileToDataUrl, urlToDataUrl, compressImage } from './utils/dataUrl';
import { csvToRows, rowsToCsv } from './utils/csv';
import { setupPWA } from './utils/pwa';
import { formatKRW, monthKey, parseAmount } from "./utils/format";

/**
 * 유치부 예산관리 대시보드
 * - 탭: 대시보드, 세세목별, 월별, 영수증, 입금확인, 자가 테스트
 * - 기능: 지출 입력 / CSV 가져오기·내보내기 / 로컬스토리지 저장 / 차트·갤러리
 * - 모바일: 카메라 바로 열기(capture), 터치 타깃 확대
 * - PWA: 홈 화면 설치 & (가능한 환경에서만) 오프라인 캐시
 * - 클라우드 동기화(선택): Firebase 또는 Google Apps Script(Drive/Sheets)
 * - 데이터 스키마: { id, date(YYYY-MM-DD), category, description, amount(number), purchaser, receiptUrl, reimbursed(boolean), reimbursedAt(YYYY-MM-DD) }
 */

// ---- Google Apps Script 연동 헬퍼 ----
const initialExpenses = [];

export default function NurseryBudgetApp() {
  const [tab, setTab] = useState("dashboard");
  const [filterCat, setFilterCat] = useState("");
  const [expenses, setExpenses] = useLocalStorageState(LOCAL_KEY, initialExpenses);

  function handleNavigate(cat) {
    setTab("bycat");
    setFilterCat(cat || "");
  }

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
        try { URL.revokeObjectURL(receiptObjUrlRef.current); } catch { }
      }
    };
  }, []);

  // Firebase state removed

  // Google Apps Script config
  const [gsCfg, setGsCfg] = useGScriptConfig();
  const [gsOn, setGsOn] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const gsSyncRef = useRef(false); // GS 동기화 루프 방지
  const [isLoaded, setIsLoaded] = useState(false); // 로드 완료 여부
  const [isUploading, setIsUploading] = useState(false); // 업로드 진행 상태


  const inputFileRef = useRef(null);

  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + parseAmount(e.amount), 0), [expenses]);
  const byCategory = useMemo(() => groupBy(expenses, (e) => e.category || "미분류"), [expenses]);
  const byMonth = useMemo(() => groupBy(expenses, (e) => monthKey(e.date)), [expenses]);

  const categorySummary = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => {
      const budget = BUDGET.items.find((i) => i.key === cat)?.budget || 0;
      const spent = (byCategory[cat] || []).reduce((s, e) => s + parseAmount(e.amount), 0);
      const ratio = budget > 0 ? (spent / budget) * 100 : 0;
      return { category: cat, budget, spent, remaining: Math.max(budget - spent, 0), ratio };
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

  // Firebase code removed for cleanup


  // Google Apps Script: 로컬 변경 → 자동 저장 (이미지 업로드 포함)
  useEffect(() => {
    if (!gsOn || !gsCfg.url) return;
    if (!isLoaded) return; // 로드가 완료되지 않았으면 저장하지 않음 (데이터 유실 방지)
    if (gsSyncRef.current) { gsSyncRef.current = false; return; }

    const timer = setTimeout(async () => {
      try {
        setIsSyncing(true);
        let finalExpenses = expenses;
        const next = [];
        let hasUpdates = false;

        // 1) 이미지 업로드 체크
        for (const e of expenses) {
          if (typeof e.receiptUrl === 'string' && (e.receiptUrl.startsWith("blob:") || e.receiptUrl.startsWith("data:"))) {
            try {
              const conv = await urlToDataUrl(e.receiptUrl);
              const safeDesc = e.description ? e.description.replace(/[^\w가-힣_.-]/g, "_") : "receipt";
              const formattedAmount = parseAmount(e.amount).toLocaleString('ko-KR');
              const filename = `${e.date}_${e.category}_${safeDesc}_${formattedAmount}원.png`;

              const up = await gsFetch(gsCfg, "uploadReceipt", {
                filename,
                mimeType: conv.mime || "image/png",
                dataUrl: conv.dataUrl,
              });
              const viewUrl = up.viewUrl || (up.fileId ? `https://drive.google.com/uc?export=view&id=${up.fileId}` : "") || (up.id ? `https://drive.google.com/uc?export=view&id=${up.id}` : "");
              if (viewUrl) {
                next.push({ ...e, receiptUrl: viewUrl, receiptDriveId: up.fileId || up.id || "" });
                hasUpdates = true;
                continue;
              }
            } catch (err) {
              console.warn("Auto upload fail", err);
            }
          }
          next.push(e);
        }

        if (hasUpdates) {
          gsSyncRef.current = true; // prevent loop from this update
          setExpenses(next);
          finalExpenses = next;
        }

        // 2) 시트 저장
        await gsFetch(gsCfg, "save", { expenses: finalExpenses });
      } catch (e) {
        console.warn("Auto save error", e);
      } finally {
        setIsSyncing(false);
      }
    }, 1000); // 1초 디바운스로 단축 (모바일 저장 안정성)

    return () => clearTimeout(timer);
  }, [expenses, gsOn, gsCfg]);

  // 자동 불러오기 (최초 1회)
  useEffect(() => {
    // URL이 있으면 즉시 로드 시도
    if (gsOn && gsCfg.url) {
      gsLoad(true);
    } else {
      // URL 없으면 로컬 데이터만 사용하므로 로드 완료 처리
      setIsLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resetAll() {
    if (!confirm("모든 데이터가 삭제됩니다. 정말 삭제하시겠습니까? (구글 시트 포함)")) return;
    setExpenses([]);

    // Explicitly sync the empty state to server to bypass useEffect loop protection
    if (gsOn && gsCfg.url) {
      try {
        setIsSyncing(true);
        await gsFetch(gsCfg, "save", { expenses: [] });
        // alert("서버 데이터도 초기화되었습니다."); // Optional: silent is better for UX, or toast
      } catch (e) {
        console.warn("Server reset failed", e);
        alert("서버 동기화 실패. 다시 시도해주세요.");
      } finally {
        setIsSyncing(false);
      }
    }
  }

  function addExpense(e) {
    e.preventDefault();
    const payload = {
      id: editingId || crypto.randomUUID(),
      date: form.date,
      category: form.category,
      description: form.description.trim(),
      amount: parseAmount(form.amount),
      purchaser: form.purchaser.trim(),
      receiptUrl: form.receiptUrl.trim(),
      reimbursed: false, // editing doesn't change this usually, but simple overwrite is okay for now
      reimbursedAt: "",  // same
    };

    // If editing, preserve existing values for fields not in form if necessary (but form covers all main ones)
    // Actually, preserve 'reimbursed' status if editing
    if (editingId) {
      const existing = expenses.find(x => x.id === editingId);
      if (existing) {
        payload.reimbursed = existing.reimbursed;
        payload.reimbursedAt = existing.reimbursedAt;
      }
    }

    if (!payload.date || !payload.category || !payload.amount) {
      alert("날짜, 세세목, 금액은 필수입니다.");
      return;
    }

    if (editingId) {
      setExpenses((prev) => prev.map(e => e.id === editingId ? payload : e));
      alert("수정되었습니다.");
    } else {
      setExpenses((prev) => [payload, ...prev]);
    }

    setForm({ date: "", category: CATEGORY_ORDER[0], description: "", amount: "", purchaser: "", receiptUrl: "" });
    setEditingId(null);
  }

  function startEdit(item) {
    setForm({
      date: item.date.substring(0, 10),
      category: item.category,
      description: item.description,
      amount: String(item.amount),
      purchaser: item.purchaser || "",
      receiptUrl: item.receiptUrl || ""
    });
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

    try {
      setIsUploading(true);
      if (gsOn && gsCfg.url) {
        try {
          // COMPRESSION: Mobile uploads fail if too large. Resize & Convert to JPEG.
          const compressed = await compressImage(file);
          const safeDesc = form.description ? form.description.replace(/[^\w가-힣_.-]/g, "_") : "receipt";
          const formattedAmount = parseAmount(form.amount).toLocaleString('ko-KR');
          // Force .jpg extension since we converted it
          const filename = `${form.date}_${form.category}_${safeDesc}_${formattedAmount}원.jpg`;

          const res = await gsFetch(gsCfg, "uploadReceipt", {
            filename,
            mimeType: "image/jpeg",
            dataUrl: compressed.dataUrl,
          });
          const viewUrl = res.viewUrl || (res.fileId ? `https://drive.google.com/uc?export=view&id=${res.fileId}` : "") || (res.id ? `https://drive.google.com/uc?export=view&id=${res.id}` : "");
          if (viewUrl) {
            setForm((f) => ({ ...f, receiptUrl: viewUrl }));
            return;
          }
        } catch (err) {
          console.warn("Drive 업로드 실패", err);
          alert("드라이브 업로드 실패 상세: " + err.toString() + "\n(로컬 미리보기로 대체합니다)");
        }
      }

      // fallback: 로컬 미리보기
      const nextUrl = URL.createObjectURL(file);
      if (receiptObjUrlRef.current) {
        try { URL.revokeObjectURL(receiptObjUrlRef.current); } catch { }
      }
      receiptObjUrlRef.current = nextUrl;
      setForm((f) => ({ ...f, receiptUrl: nextUrl }));

    } finally {
      setIsUploading(false);
    }
  }

  // Firebase connection functions removed

  async function gsLoad(silent = false) {
    try {
      if (!gsCfg.url) {
        if (!silent) alert("URL이 설정되지 않았습니다. 설정(톱니바퀴)을 확인해주세요.");
        return;
      }
      setIsSyncing(true);
      const data = await gsFetch(gsCfg, "list", {});
      if (Array.isArray(data.expenses)) {
        // Sanitize incoming data
        const safeExpenses = data.expenses.map(e => ({
          ...e,
          receiptUrl: typeof e.receiptUrl === 'string' ? e.receiptUrl : String(e.receiptUrl || "")
        }));
        gsSyncRef.current = true;
        setExpenses(safeExpenses);
        setIsLoaded(true); // 성공한 경우에만 로드 완료 처리 (데이터 보호)
        if (!silent) alert(`총 ${safeExpenses.length}건의 데이터를 성공적으로 불러왔습니다.`);
      } else {
        if (!silent) alert("데이터를 찾을 수 없거나 형식이 올바르지 않습니다.");
        // 실패 시 isLoaded를 true로 설정하지 않음 -> 자동 저장 차단
      }
    } catch (e) {
      if (!silent) alert("시트에서 불러오기 실패: " + e.message + "\nURL과 토큰을 다시 확인해주세요.");
      else {
        console.warn("Auto-load failed", e);
        // Silent failure (initial load) also warns to ensure user knows sync is off
        alert("⚠️ 서버 데이터 불러오기 실패!\n\n데이터 보호를 위해 '자동 저장'이 일시 중지되었습니다.\n\n인터넷 연결을 확인하고 [설정 > 수동 불러오기]를 시도하여 데이터를 먼저 동기화해주세요.");
      }
    } finally {
      setIsSyncing(false);
      // setIsLoaded(true) removed from finally to prevent unsafe auto-saves
    }
  }

  async function gsPush() {
    try {
      // 1) 로컬 blob:/data: 영수증을 드라이브에 업로드 → 영구 URL로 치환
      let finalExpenses = expenses;
      if (gsOn && gsCfg.url) {
        const next = [];
        let hasUpdates = false;

        for (const e of expenses) {
          if (typeof e.receiptUrl === 'string' && (e.receiptUrl.startsWith("blob:") || e.receiptUrl.startsWith("data:"))) {
            try {
              const conv = await urlToDataUrl(e.receiptUrl);
              const safeDesc = e.description ? e.description.replace(/[^\w가-힣_.-]/g, "_") : "receipt";
              const filename = `${e.date}_${e.category}_${safeDesc}_${e.amount}.png`;

              const up = await gsFetch(gsCfg, "uploadReceipt", {
                filename,
                mimeType: conv.mime || "image/png",
                dataUrl: conv.dataUrl,
              });
              const viewUrl = up.viewUrl || (up.fileId ? `https://drive.google.com/uc?export=view&id=${up.fileId}` : "") || (up.id ? `https://drive.google.com/uc?export=view&id=${up.id}` : "");
              if (viewUrl) {
                next.push({ ...e, receiptUrl: viewUrl, receiptDriveId: up.fileId || up.id || "" });
                hasUpdates = true;
                continue;
              }
            } catch (err) {
              console.warn("로컬 영수증 업로드 실패, 기존 URL 유지", err);
            }
          }
          next.push(e);
        }

        // 화면 상태도 최신 링크로 동기화 (저장 루프 방지를 위해 플래그 사용)
        if (hasUpdates) {
          gsSyncRef.current = true;
          setExpenses(next);
          finalExpenses = next;
        }
      }

      // 2) 최종 저장 (업데이트된 데이터 사용)
      await gsFetch(gsCfg, "save", { expenses: finalExpenses });
      alert("시트에 저장 완료");
    } catch (e) {
      alert("시트 저장 실패: " + e.message);
    }
  }


  const expenseInputSection = (
    <section className="mb-8 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">지출 입력</h2>
      <form onSubmit={addExpense} className="flex flex-col gap-4">
        {/* Top Row: Core Info - Strictly Horizontal */}
        <div className="flex flex-nowrap gap-2 items-end overflow-x-auto pb-1">
          <div className="w-36 shrink-0">
            <label className="text-xs font-medium text-gray-500 mb-1 block">날짜</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-xl border-gray-300 border px-3 py-2.5 bg-gray-50 focus:bg-white transition-colors text-sm" />
          </div>
          <div className="w-28 shrink-0">
            <label className="text-xs font-medium text-gray-500 mb-1 block">세세목</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border-gray-300 border px-3 py-2.5 bg-gray-50 focus:bg-white transition-colors text-sm">
              {CATEGORY_ORDER.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 mb-1 block">적요 / 설명</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="내용을 입력하세요" className="w-full rounded-xl border-gray-300 border px-3 py-2.5 bg-gray-50 focus:bg-white transition-colors text-sm" />
          </div>
          <div className="w-32 shrink-0">
            <label className="text-xs font-medium text-gray-500 mb-1 block">금액(원)</label>
            <input type="text" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className="w-full rounded-xl border-gray-300 border px-3 py-2.5 bg-gray-50 focus:bg-white transition-colors font-medium text-right text-sm" />
          </div>
          <div className="w-24 shrink-0">
            <label className="text-xs font-medium text-gray-500 mb-1 block">구매자</label>
            <input type="text" value={form.purchaser} onChange={(e) => setForm({ ...form, purchaser: e.target.value })} placeholder="이름" className="w-full rounded-xl border-gray-300 border px-3 py-2.5 bg-gray-50 focus:bg-white transition-colors text-sm" />
          </div>
        </div>

        {/* Bottom Row: Receipt & Buttons */}
        <div className="flex flex-wrap md:flex-nowrap gap-3 items-center">
          <div className="flex-1 flex items-center gap-2">
            <label className={`shrink-0 px-3 py-2.5 rounded-xl border border-gray-200 text-sm cursor-pointer flex items-center gap-2 transition-colors ${isUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'}`}>
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>{isUploading ? "업로드 중..." : "영수증 선택 (갤러리/촬영)"}</span>
              <input type="file" accept="image/*" onChange={onImageUpload} className="hidden" disabled={isUploading} />
            </label>
            <input type="url" value={form.receiptUrl} onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })} placeholder="또는 이미지 URL 입력" className="flex-1 rounded-xl border-gray-300 border px-3 py-2.5 bg-gray-50 focus:bg-white transition-colors text-sm" />
          </div>


          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className="px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-2 transition-colors" onClick={() => {
              setForm({ date: "", category: CATEGORY_ORDER[0], description: "", amount: "", purchaser: "", receiptUrl: "" });
              setEditingId(null);
            }}>
              <RefreshCcw size={16} /> {editingId ? "취소" : "초기화"}
            </button>
            <button type="submit" disabled={isUploading} className={`px-6 py-2.5 rounded-xl text-white flex items-center gap-2 shadow-sm transition-colors font-semibold ${isUploading ? "bg-gray-400 cursor-not-allowed" : (editingId ? "bg-green-600 hover:bg-green-700 shadow-green-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200")}`}>
              {editingId ? <Save size={18} /> : <Plus size={18} />} {editingId ? "수정 저장" : "추가하기"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );

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
            <h1 className="text-2xl font-bold">유치부 예산관리 대시보드 (2026 v2)</h1>
            <div className="text-sm text-gray-600 mt-1">
              <span className="block sm:inline">{BUDGET.year} 회계 | 총 예산 {formatKRW(BUDGET.total)}</span>
              <span className="hidden sm:inline"> | </span>
              <span className="block sm:inline">현재 지출 {formatKRW(totalSpent)} | 잔액 {formatKRW(Math.max(BUDGET.total - totalSpent, 0))}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-3 rounded-xl border bg-white hover:bg-gray-50 text-gray-600" onClick={() => setShowConfig(prev => !prev)}>
              <Settings size={20} className={isSyncing ? "animate-spin text-blue-600" : ""} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Firebase 동기화 */}
        {/* Firebase Section Removed */}

        {/* Google Apps Script (Drive/Sheets) 동기화 */}
        {showConfig && (
          <section className="mb-6 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm animate-in fade-in slide-in-from-top-2 space-y-6">

            {/* Google Sync Settings */}
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  구글 연동 설정
                  {isSyncing && <span className="text-xs font-normal text-blue-600 animate-pulse">Running...</span>}
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setGsOn(v => !v)} className={`px-3 py-2 rounded-lg border text-sm ${gsOn ? 'bg-green-600 text-white border-green-600' : 'bg-white'}`}>{gsOn ? '자동동기화 ON' : '자동동기화 OFF'}</button>
                  <button onClick={() => gsLoad(false)} className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 flex items-center gap-2 text-sm"><CloudDownload size={14} /> 수동 불러오기</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-4 flex items-center gap-2">
                  <LinkIcon size={16} className="text-gray-400" />
                  <input className="flex-1 rounded-xl border px-3 py-2 text-sm" placeholder="Apps Script Web App URL" value={gsCfg.url} onChange={(e) => setGsCfg(v => ({ ...v, url: e.target.value }))} />
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <KeyRound size={16} className="text-gray-400" />
                  <input className="flex-1 rounded-xl border px-3 py-2 text-sm" placeholder="보안 토큰" value={gsCfg.token} onChange={(e) => setGsCfg(v => ({ ...v, token: e.target.value }))} />
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Data Actions */}
            <div>
              <h2 className="text-lg font-semibold mb-3">데이터 관리</h2>
              <div className="flex flex-wrap gap-2">
                <button className={`px-4 py-2.5 rounded-xl border bg-white flex items-center gap-2 text-sm ${isSyncing ? 'text-blue-600 border-blue-200' : ''}`} disabled>
                  {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
                  {isSyncing ? "저장/동기화 중..." : "자동저장 대기중"}
                </button>
                <div className="w-px h-8 bg-gray-300 mx-1 hidden sm:block"></div>
                <button className="px-4 py-2.5 rounded-xl border bg-white hover:bg-gray-50 flex items-center gap-2 text-sm" onClick={onExportCsv}>
                  <Download size={16} /> 내보내기
                </button>
                <label className="px-4 py-2.5 rounded-xl border bg-white hover:bg-gray-50 flex items-center gap-2 cursor-pointer text-sm">
                  <FileUp size={16} /> 불러오기
                  <input ref={inputFileRef} type="file" accept=".csv" className="hidden" onChange={onImportCsv} />
                </label>
                <button className="px-4 py-2.5 rounded-xl border bg-white hover:bg-red-50 text-red-600 flex items-center gap-2 text-sm ml-auto" onClick={resetAll}>
                  <Trash2 size={16} /> 전체삭제
                </button>
              </div>
            </div>

          </section>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={LineChart}>대시보드</TabButton>
          <TabButton active={tab === "bycat"} onClick={() => setTab("bycat")} icon={Table2}>세세목별</TabButton>
          <TabButton active={tab === "bymonth"} onClick={() => setTab("bymonth")} icon={LineChart}>월별</TabButton>
          <TabButton active={tab === "receipts"} onClick={() => setTab("receipts")} icon={GalleryHorizontalEnd}>영수증</TabButton>
          <TabButton active={tab === "reimburse"} onClick={() => setTab("reimburse")} icon={CheckSquare}>입금확인</TabButton>
          <TabButton active={tab === "tests"} onClick={() => setTab("tests")} icon={Bug}>자가 테스트</TabButton>
        </div>

        {tab === "bycat" && expenseInputSection}

        {tab === "dashboard" && (
          <div className="space-y-8">
            {expenseInputSection}
            <Dashboard totalSpent={totalSpent} categorySummary={categorySummary} onNavigate={handleNavigate} />
          </div>
        )}
        {tab === "bycat" && (
          <ByCategory categorySummary={categorySummary} expenses={expenses} onDelete={deleteExpense} onEdit={startEdit} filterCat={filterCat} setFilterCat={setFilterCat} />
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

