import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
// legacy 빌드 — 최신 빌드는 아이폰 사파리 등 조금 지난 브라우저에서 안 열린다
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import GYEONGGI from '../data/gyeonggiManual.json';
import SEOUL from '../data/seoulManual.json';
import CHUNGNAM from '../data/chungnamManual.json';
import './ManualPage.css';

// 학원업무 편람 — 위쪽에서 교육청을 고르고, 왼쪽 목차(질의응답은 한 건씩) + 오른쪽 PDF 보기
// 목차·쪽별 본문은 scripts/build_manual_*.py 로 PDF에서 뽑아 둔 것
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MANUALS = [
  { key: 'gyeonggi', short: '경기', year: 2024, home: true, data: GYEONGGI,
    pdf: '/manual/gyeonggi-2024.pdf', text: '/manual/gyeonggi-2024-text.json', file: '2024 경기도교육청 학원업무 편람.pdf' },
  { key: 'seoul', short: '서울', year: 2025, data: SEOUL,
    pdf: '/manual/seoul-2025.pdf', text: '/manual/seoul-2025-text.json', file: '2025 서울특별시교육청 학원 업무 편람.pdf' },
  { key: 'chungnam', short: '충남', year: 2024, data: CHUNGNAM,
    pdf: '/manual/chungnam-2024.pdf', text: '/manual/chungnam-2024-text.json', file: '2024 충청남도교육청 학원업무 편람.pdf' },
];
const MANUAL_BY_KEY = Object.fromEntries(MANUALS.map(m => [m.key, m]));
const HOME_KEY = 'gyeonggi';
const LAST_KEY_STORE = 'manual_last_key';

const PAGE_GAP = 14;   // 쪽 사이 간격(px)
const PAD = 16;        // 보기 칸 안쪽 여백(px)
const MAX_AUTO = 1.6;  // '폭 맞춤'이라도 이보다 크게 키우지 않는다
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

// 목차 나무 → 한 줄 목록 (부모·깊이·항목 종류) — 편람마다 한 번만
const prepared = new Map();
function prepare(m) {
  if (prepared.has(m.key)) return prepared.get(m.key);
  const list = [];
  const byId = new Map();
  const walk = (nodes, depth, parent, kind, label) => {
    nodes.forEach(n => {
      const k = n.kind || kind;
      // 항목 앞 표시: 구역·분류에 적힌 것(itemLabel)이 먼저, 없으면 종류로
      const lb = n.itemLabel || (n.kind === 'case' ? (n.title.includes('판례') ? '판례' : '재결') : n.kind === 'law' ? '해석' : label);
      const node = { ...n, depth, parentId: parent?.id ?? null, itemKind: k, itemLabel: lb };
      list.push(node);
      byId.set(n.id, node);
      if (n.children) walk(n.children, depth + 1, node, k, lb);
    });
  };
  walk(m.data.toc, 0, null, null, null);
  const p = {
    list,
    byId,
    byPos: [...list].sort((a, b) => a.page - b.page || a.y - b.y || a.depth - b.depth), // 읽는 위치 → 목차 항목
    itemCount: list.filter(n => n.isItem).length,
  };
  prepared.set(m.key, p);
  return p;
}

// PDF·본문 검색 자료는 한 번 받으면 편람을 바꿔 다녀도 다시 받지 않는다
const docTasks = new Map();
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}`;
function openDoc(m) {
  if (!docTasks.has(m.key)) {
    docTasks.set(m.key, pdfjsLib.getDocument({
      url: m.pdf,
      cMapUrl: `${PDFJS_CDN}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
      // 서울 편람 그림 일부는 JPEG2000·JBIG2 — 풀어 줄 디코더(wasm)가 있어야 보인다
      wasmUrl: `${PDFJS_CDN}/wasm/`,
      iccUrl: `${PDFJS_CDN}/iccs/`,
    }));
  }
  return docTasks.get(m.key);
}
const textLoads = new Map();
function loadTexts(m) {
  if (!textLoads.has(m.key)) {
    const p = fetch(m.text).then(r => (r.ok ? r.json() : Promise.reject(r.status)));
    p.catch(() => textLoads.delete(m.key)); // 실패하면 다음에 다시
    textLoads.set(m.key, p);
  }
  return textLoads.get(m.key);
}

const pad3 = (n) => String(n).padStart(3, '0');
function nodeLabel(n) {
  if (n.isItem) return { badge: n.itemKind === 'qa' ? `Q${pad3(n.no)}` : `${n.itemLabel || '사례'} ${n.no}`, text: n.title };
  return { badge: n.prefix || '', text: n.title };
}

const pageLabel = (m, p) => m.data.labels[p - 1];
const pageText = (m, p) => (pageLabel(m, p) ? `${pageLabel(m, p)}쪽` : '');

function ancestors(byId, id) {
  const out = [];
  let n = byId.get(id);
  while (n?.parentId) { out.push(n.parentId); n = byId.get(n.parentId); }
  return out;
}

// 링크 값 'seoul:7.1.003' / '1.6.007'(경기) / 'seoul:154' → { key, id | page }
function parseTarget(t) {
  if (!t) return null;
  const raw = String(t.id ?? t.page ?? '');
  const m = raw.match(/^([a-z]+):(.+)$/);
  const key = m && MANUAL_BY_KEY[m[1]] ? m[1] : HOME_KEY;
  const rest = m && MANUAL_BY_KEY[m[1]] ? m[2] : raw;
  if (t.id) return { key, target: { id: rest } };
  const page = parseInt(rest, 10);
  return page ? { key, target: { page } } : { key, target: null };
}

function savedKey() {
  try {
    const k = localStorage.getItem(LAST_KEY_STORE);
    return MANUAL_BY_KEY[k] ? k : null;
  } catch {
    return null;
  }
}

// 낱말 하나 — 글자 사이 띄어쓰기는 무시 ('학원설립' = '학원 설립')
const termRegex = (w) => new RegExp([...w].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'i');
// 검색어 — 띄어 쓴 낱말이 모두 들어 있으면 맞음 ('교습비 반환' → '교습비 등 반환'도)
function makeSearch(q) {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const terms = words.map(termRegex);
  return {
    test: (text) => terms.every(r => r.test(text)),
    any: new RegExp(terms.map(r => `(?:${r.source})`).join('|'), 'i'), // 표시용
  };
}
// 모두 찾기용 (g 깃발 정규식은 lastIndex 를 품고 있어 그때그때 새로 만든다)
const allMatches = (text, re) => [...text.matchAll(new RegExp(re.source, 'gi'))];

function bodyHitsOf(texts, search) {
  const out = [];
  texts.forEach((t, i) => {
    if (!search.test(t)) return;
    const matches = allMatches(t, search.any);
    const m = matches[0];
    const a = Math.max(0, m.index - 36);
    const b = Math.min(t.length, m.index + m[0].length + 60);
    out.push({ page: i + 1, count: matches.length, snippet: (a > 0 ? '…' : '') + t.slice(a, b) + (b < t.length ? '…' : '') });
  });
  return out;
}

function Highlight({ text, re }) {
  if (!re) return text;
  const parts = [];
  let last = 0;
  for (const m of allMatches(text, re)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<mark key={m.index}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function Icon({ name, size = 18 }) {
  const p = {
    chevron: <polyline points="9 6 15 12 9 18" />,
    up: <polyline points="18 15 12 9 6 15" />,
    down: <polyline points="6 9 12 15 18 9" />,
    minus: <line x1="5" y1="12" x2="19" y2="12" />,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    toc: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    collapse: <><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></>,
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
  );
}

// ── PDF 한 쪽: 보일 때만 그린다 (캔버스 + 글자 층) ──
function PdfPage({ doc, num, scale, width, height, active, hitRe }) {
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [drawnScale, setDrawnScale] = useState(0); // 마지막으로 다 그린 배율
  const drawn = active && drawnScale === scale;

  useEffect(() => {
    if (!doc || !active) return undefined;
    let cancelled = false;
    let renderTask = null;
    let textLayer = null;
    (async () => {
      try {
        const page = await doc.getPage(num);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        renderTask = page.render({
          canvas,
          canvasContext: canvas.getContext('2d'),
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (cancelled) return;
        setDrawnScale(scale);
        const box = textRef.current;
        box.replaceChildren();
        textLayer = new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container: box, viewport });
        await textLayer.render();
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) console.error('편람 쪽 그리기 실패', num, err);
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, num, scale, active]);

  // 본문 검색어 — 글자 층에서 맞는 조각에 표시
  useEffect(() => {
    const box = textRef.current;
    if (!box || !drawn) return undefined;
    const mark = () => {
      box.querySelectorAll('span').forEach(s => {
        s.classList.toggle('is-hit', !!hitRe && hitRe.test(s.textContent));
      });
    };
    mark();
    // 글자 층이 늦게 채워질 수 있어 한 번 더
    const t = setTimeout(mark, 400);
    return () => clearTimeout(t);
  }, [drawn, hitRe]);

  return (
    <div
      className="manual-sheet"
      data-page={num}
      style={{ width: width * scale, height: height * scale, '--total-scale-factor': scale }}
    >
      {active ? (
        <>
          <canvas ref={canvasRef} className={drawn ? 'is-drawn' : ''} style={{ width: width * scale, height: height * scale }} />
          <div ref={textRef} className="textLayer" />
        </>
      ) : null}
      {!drawn && <span className="manual-sheet-num">{num}</span>}
    </div>
  );
}

// ── 바깥: 어느 편람을 보는지와 검색어를 쥔다 (편람을 바꾸면 안쪽 보기를 새로 연다) ──
export default function ManualPage({ initialTarget }) {
  const [nav, setNav] = useState(() => {
    const parsed = parseTarget(initialTarget);
    return { key: parsed?.key ?? savedKey() ?? HOME_KEY, target: parsed?.target ?? null, seq: 0 };
  });
  const [query, setQuery] = useState('');
  const [allMode, setAllMode] = useState(false); // 세 편람 모두에서 찾기

  useEffect(() => {
    try { localStorage.setItem(LAST_KEY_STORE, nav.key); } catch { /* 저장 못 해도 그만 */ }
  }, [nav.key]);

  const switchTo = useCallback((key, target = null) => {
    setNav(prev => ({ key, target, seq: prev.seq + 1 }));
  }, []);

  return (
    <ManualViewer
      key={`${nav.key}:${nav.seq}`}
      manual={MANUAL_BY_KEY[nav.key]}
      initialTarget={nav.target}
      onSwitch={switchTo}
      query={query}
      setQuery={setQuery}
      allMode={allMode}
      setAllMode={setAllMode}
    />
  );
}

function ManualViewer({ manual, initialTarget, onSwitch, query, setQuery, allMode, setAllMode }) {
  const M = manual;
  const { list: FLAT, byId: BY_ID, byPos: BY_POS, itemCount } = prepare(M);
  const [PAGE_W, PAGE_H] = M.data.size;
  const total = M.data.pages;

  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadPct, setLoadPct] = useState(0);

  const viewerRef = useRef(null);
  const tocRef = useRef(null);
  const [viewerW, setViewerW] = useState(0);
  const [zoom, setZoom] = useState('auto'); // 'auto' 또는 배율
  const [current, setCurrent] = useState({ page: 1, y: 0 }); // 지금 보는 위치 (PDF 쪽, 쪽 안 높이 pt)
  const [pageEdit, setPageEdit] = useState(null); // 쪽 번호 칸에 치는 중인 값
  const [visible, setVisible] = useState(() => new Set());

  // 링크(?manual=…)·다른 편람 검색 결과로 들어오면 그 항목까지 펼치고 골라 둔다
  const initialNode = initialTarget?.id ? BY_ID.get(initialTarget.id) : null;
  const [expanded, setExpanded] = useState(() => new Set([
    ...M.data.toc.map(n => n.id),
    ...(initialNode ? ancestors(BY_ID, initialNode.id) : []),
  ]));
  const [selectedId, setSelectedId] = useState(initialNode?.id ?? null);
  const [tocOpen, setTocOpen] = useState(true);       // 넓은 화면: 목차 칸 접기
  const [drawerOpen, setDrawerOpen] = useState(false); // 좁은 화면: 목차 서랍
  const [texts, setTexts] = useState({});             // { 편람 key: 쪽별 본문 }
  const [textsError, setTextsError] = useState(false);
  const [hitQuery, setHitQuery] = useState(initialTarget?.hit ?? '');
  const [toast, setToast] = useState('');

  // ── PDF 열기 ──
  useEffect(() => {
    let alive = true;
    const task = openDoc(M);
    task.onProgress = ({ loaded, total: t }) => { if (alive && t) setLoadPct(Math.round((loaded / t) * 100)); };
    task.promise.then(d => { if (alive) setDoc(d); }).catch(err => {
      console.error(err);
      docTasks.delete(M.key);
      if (alive) setLoadError('편람 PDF를 열지 못했습니다.');
    });
    return () => { alive = false; };
  }, [M]);

  // ── 보기 칸 너비 → 배율 ──
  useLayoutEffect(() => {
    const el = viewerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setViewerW(el.clientWidth));
    ro.observe(el);
    setViewerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fitScale = viewerW ? Math.max(0.3, (viewerW - PAD * 2 - 4) / PAGE_W) : 1;
  const scale = zoom === 'auto' ? Math.min(fitScale, MAX_AUTO) : zoom;
  const step = PAGE_H * scale + PAGE_GAP;
  const pageTop = useCallback((p) => PAD + (p - 1) * step, [step]);

  // ── 이동 ──
  const scrollToPos = useCallback((page, y = 0) => {
    const el = viewerRef.current;
    if (!el) return;
    const p = Math.min(Math.max(1, page), total);
    el.scrollTop = Math.max(0, pageTop(p) + Math.max(0, y * scale - 18));
  }, [pageTop, scale, total]);

  const revealInToc = useCallback((id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      ancestors(BY_ID, id).forEach(a => next.add(a));
      return next;
    });
  }, [BY_ID]);

  const openNode = useCallback((n, { fromSearch } = {}) => {
    setSelectedId(n.id);
    revealInToc(n.id);
    if (n.children && !fromSearch) setExpanded(prev => new Set(prev).add(n.id));
    scrollToPos(n.page, n.y);
    setDrawerOpen(false);
  }, [revealInToc, scrollToPos]);

  // 처음 들어올 때 그 자리로
  const initialDone = useRef(false);
  useEffect(() => {
    if (initialDone.current || !viewerW) return;
    initialDone.current = true;
    if (initialNode) scrollToPos(initialNode.page, initialNode.y);
    else if (initialTarget?.page) scrollToPos(initialTarget.page);
  }, [viewerW, initialNode, initialTarget, scrollToPos]);

  // 배율이 바뀌어도 보던 자리를 지킨다 (바뀌기 전 배율로 지금 자리를 셈)
  const prevGeo = useRef({ scale, step });
  useLayoutEffect(() => {
    const el = viewerRef.current;
    const old = prevGeo.current;
    prevGeo.current = { scale, step };
    if (!el || old.scale === scale) return;
    const p = Math.min(total, Math.max(1, Math.floor((el.scrollTop - PAD) / old.step) + 1));
    const yPt = (el.scrollTop - PAD - (p - 1) * old.step) / old.scale;
    el.scrollTop = PAD + (p - 1) * step + yPt * scale;
  }, [scale, step, total]);

  // ── 스크롤 → 지금 쪽, 보일 쪽 ──
  const onScroll = useCallback(() => {
    const el = viewerRef.current;
    if (!el) return;
    const probe = el.scrollTop + 24;
    const page = Math.min(total, Math.max(1, Math.floor((probe - PAD) / step) + 1));
    const y = Math.max(0, (probe - pageTop(page)) / scale);
    setCurrent(prev => (prev.page === page && Math.abs(prev.y - y) < 4 ? prev : { page, y }));
    const first = Math.max(1, Math.floor((el.scrollTop - PAD) / step) + 1 - 1);
    const last = Math.min(total, Math.floor((el.scrollTop + el.clientHeight - PAD) / step) + 1 + 1);
    setVisible(prev => {
      if (prev.size === last - first + 1 && prev.has(first) && prev.has(last)) return prev;
      const s = new Set();
      for (let p = first; p <= last; p++) s.add(p);
      return s;
    });
  }, [pageTop, scale, step, total, setCurrent, setVisible]);
  useEffect(() => { onScroll(); }, [onScroll, viewerW]);

  // 읽는 위치에 해당하는 목차 항목
  const readingId = useMemo(() => {
    let lo = 0, hi = BY_POS.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const n = BY_POS[mid];
      if (n.page < current.page || (n.page === current.page && n.y <= current.y + 2)) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (ans < 0) return null;
    // 같은 자리 여러 항목이면 가장 깊은 것
    const at = BY_POS[ans];
    let best = at;
    for (let i = ans; i >= 0 && BY_POS[i].page === at.page && BY_POS[i].y === at.y; i--) {
      if (BY_POS[i].depth > best.depth) best = BY_POS[i];
    }
    return best.id;
  }, [current, BY_POS]);

  // 접힌 곳 안이면 펼쳐진 가장 가까운 윗 항목을 켠다
  const shownActive = useMemo(() => {
    let id = readingId;
    while (id) {
      const anc = ancestors(BY_ID, id);
      if (anc.every(a => expanded.has(a))) return id;
      id = BY_ID.get(id)?.parentId;
    }
    return null;
  }, [readingId, expanded, BY_ID]);

  // 켜진 목차 줄이 목차 칸 안에 보이게 (페이지 전체는 움직이지 않게 목차 칸만)
  useEffect(() => {
    const box = tocRef.current;
    const row = box?.querySelector('.manual-row.is-active');
    if (!row) return;
    // offsetTop 은 가장 가까운 position 조상 기준이라 중첩된 줄에서 어긋난다 → 화면 좌표로 셈
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < b.top + 8 || r.bottom > b.bottom - 8) {
      box.scrollTop += r.top - b.top - box.clientHeight / 3;
    }
  }, [shownActive, query]);

  // ── 검색 ──
  const search = useMemo(() => makeSearch(query), [query]);
  const re = search?.any ?? null;
  // 찾을 편람: 지금 편람이 먼저, '모두에서 찾기'면 나머지도
  const scope = useMemo(() => (allMode ? [M, ...MANUALS.filter(x => x.key !== M.key)] : [M]), [allMode, M]);

  useEffect(() => {
    if (!query.trim()) return undefined;
    let alive = true;
    scope.forEach(m => {
      loadTexts(m)
        .then(t => { if (alive) setTexts(prev => (prev[m.key] ? prev : { ...prev, [m.key]: t })); })
        .catch(() => { if (alive) setTextsError(true); });
    });
    return () => { alive = false; };
  }, [query, scope]);

  const groups = useMemo(() => {
    if (!search) return [];
    return scope.map(m => {
      const tocHits = prepare(m).list.filter(n => search.test(n.title));
      const t = texts[m.key];
      const bodyHits = t && query.trim().length >= 2 ? bodyHitsOf(t, search) : null;
      return { m, tocHits, bodyHits };
    });
  }, [search, scope, texts, query]);

  const hitRe = useMemo(() => makeSearch(hitQuery)?.any ?? null, [hitQuery]);

  // ── 목차 나무 그리기 ──
  const rows = useMemo(() => {
    const out = [];
    const walk = (nodes) => nodes.forEach(n => {
      out.push(BY_ID.get(n.id));
      if (n.children && expanded.has(n.id)) walk(n.children);
    });
    walk(M.data.toc);
    return out;
  }, [expanded, BY_ID, M]);

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const collapseAll = () => setExpanded(new Set(M.data.toc.map(n => n.id)));

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 1800); };

  // 링크 값: 경기는 예전 링크(?manual=1.6.007)와 같게, 다른 편람은 'seoul:…'
  const linkValue = (key, v) => (key === HOME_KEY ? String(v) : `${key}:${v}`);
  const copyLink = async () => {
    const id = selectedId && BY_ID.get(selectedId)?.page === current.page ? selectedId : readingId;
    const n = id && BY_ID.get(id);
    const url = new URL(window.location.origin + window.location.pathname);
    if (n && n.page === current.page) url.searchParams.set('manual', linkValue(M.key, n.id));
    else url.searchParams.set('manualPage', linkValue(M.key, current.page));
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast('지금 보는 곳의 링크를 복사했습니다');
    } catch {
      window.prompt('이 링크를 복사하세요', url.toString());
    }
  };

  const goPageInput = (e) => {
    e.preventDefault();
    const n = parseInt(pageEdit, 10);
    if (n) scrollToPos(n);
    setPageEdit(null);
    e.target.querySelector('input')?.blur();
  };

  const zoomIdx = ZOOMS.findIndex(z => z >= scale - 0.001);
  const zoomOut = () => setZoom(ZOOMS[Math.max(0, (zoomIdx < 0 ? ZOOMS.length : zoomIdx) - 1)]);
  const zoomIn = () => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS[zoomIdx] > scale + 0.001 ? zoomIdx : zoomIdx + 1)]);

  // 검색 결과 누르기 — 다른 편람이면 그 편람으로 바꿔 연다
  const openHitNode = (m, n) => {
    if (m.key === M.key) openNode(n, { fromSearch: true });
    else onSwitch(m.key, { id: n.id });
  };
  const openHitPage = (m, page) => {
    if (m.key === M.key) { setHitQuery(query.trim()); scrollToPos(page); setDrawerOpen(false); }
    else onSwitch(m.key, { page, hit: query.trim() });
  };

  const renderRow = (n, { flat, m = M } = {}) => {
    const { badge, text } = nodeLabel(n);
    const hasKids = !!n.children?.length;
    const isOpen = expanded.has(n.id);
    const isActive = !flat && shownActive === n.id;
    const cls = [
      'manual-row',
      `is-d${Math.min(n.depth, 5)}`,
      n.isItem ? 'is-item' : '',
      n.depth === 0 ? 'is-chapter' : '',
      isActive ? 'is-active' : '',
    ].filter(Boolean).join(' ');
    const idx = prepare(m).byId;
    const crumb = flat ? ancestors(idx, n.id).reverse().map(a => idx.get(a)).filter(a => a.depth <= 1).map(a => a.title).join(' › ') : '';
    return (
      <div key={`${m.key}:${n.id}`} className={cls} style={flat ? undefined : { '--depth': n.depth }}>
        {!flat && (
          hasKids ? (
            <button type="button" className={`manual-twisty${isOpen ? ' is-open' : ''}`} onClick={() => toggle(n.id)} aria-label={isOpen ? '접기' : '펼치기'} aria-expanded={isOpen}>
              <Icon name="chevron" size={16} />
            </button>
          ) : <span className="manual-twisty is-leaf" aria-hidden="true" />
        )}
        <button type="button" className="manual-row-main" onClick={() => (flat ? openHitNode(m, n) : openNode(n))} title={n.title}>
          <span className="manual-row-text">
            {badge && <span className="manual-badge">{badge}</span>}
            <span className="manual-row-title">{flat ? <Highlight text={text} re={re} /> : text}</span>
            {n.count ? <span className="manual-count">{n.count}건</span> : null}
            {n.note && <span className="manual-note">{n.note}</span>}
            {crumb && <span className="manual-crumb">{crumb}</span>}
          </span>
          <span className="manual-row-page">{pageText(m, n.page)}</span>
        </button>
      </div>
    );
  };

  const renderGroup = ({ m, tocHits, bodyHits }) => {
    const limitToc = allMode ? 60 : 150;
    const limitBody = allMode ? 80 : 200;
    return (
      <div key={m.key} className="manual-hit-group">
        {allMode && (
          <div className={`manual-hit-manual${m.key === M.key ? ' is-current' : ''}`}>
            {m.short} {m.year}{m.key === M.key && <em>지금 보는 편람</em>}
          </div>
        )}
        <div className="manual-hit-head">목차 <b>{tocHits.length}</b>건</div>
        {tocHits.length ? tocHits.slice(0, limitToc).map(n => renderRow(n, { flat: true, m })) : <p className="manual-empty">목차에는 없습니다.</p>}
        {tocHits.length > limitToc && <p className="manual-empty">앞의 {limitToc}건만 보입니다. 검색어를 더 좁혀 보세요.</p>}

        <div className="manual-hit-head">본문 {bodyHits ? <><b>{bodyHits.length}</b>쪽</> : ''}</div>
        {query.trim().length < 2 ? <p className="manual-empty">본문은 두 글자 이상부터 찾습니다.</p>
          : !bodyHits ? <p className="manual-empty">{textsError ? '본문 검색 자료를 불러오지 못했습니다.' : '본문을 불러오는 중…'}</p>
            : !bodyHits.length ? <p className="manual-empty">본문에도 없습니다.</p>
              : bodyHits.slice(0, limitBody).map(h => (
                <button
                  type="button"
                  key={`${m.key}:${h.page}`}
                  className={`manual-body-hit${m.key === M.key && current.page === h.page && hitQuery ? ' is-active' : ''}`}
                  onClick={() => openHitPage(m, h.page)}
                >
                  <span className="manual-body-hit-page">{pageText(m, h.page) || `PDF ${h.page}쪽`}{h.count > 1 && <em>{h.count}곳</em>}</span>
                  <span className="manual-body-hit-text"><Highlight text={h.snippet} re={re} /></span>
                </button>
              ))}
        {bodyHits && bodyHits.length > limitBody && <p className="manual-empty">앞의 {limitBody}쪽만 보입니다.</p>}
      </div>
    );
  };

  const searching = !!query.trim();
  const pages = useMemo(() => Array.from({ length: total }, (_, i) => i + 1), [total]);

  return (
    <div className={`manual${tocOpen ? '' : ' is-toc-closed'}${drawerOpen ? ' is-drawer' : ''}`}>
      {drawerOpen && <div className="manual-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      {/* 목차 */}
      <aside className="manual-toc" aria-label="편람 목차">
        <div className="manual-toc-head">
          <div className="manual-switch" role="tablist" aria-label="교육청 고르기">
            {MANUALS.map(m => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={m.key === M.key}
                className={`manual-switch-btn${m.key === M.key ? ' is-on' : ''}`}
                onClick={() => { if (m.key !== M.key) onSwitch(m.key); }}
              >
                {m.short}<small>{m.year}</small>
              </button>
            ))}
            <button type="button" className="manual-icon-btn manual-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="목차 닫기"><Icon name="close" /></button>
          </div>
          <div className="manual-toc-title">
            <span className="manual-toc-name">{M.data.title}</span>
          </div>
          {!M.home && (
            <p className="manual-notice">{M.short} 조례 기준 자료입니다. 교습시간·시설 기준 등은 경기도 조례와 다를 수 있습니다.</p>
          )}
          <div className="manual-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="목차·본문 검색 (예: 교습비 반환)"
              aria-label="편람 검색"
            />
            {query && <button type="button" className="manual-search-clear" onClick={() => { setQuery(''); setHitQuery(''); }} aria-label="검색어 지우기"><Icon name="close" size={16} /></button>}
          </div>
          <div className="manual-toc-tools">
            <label className="manual-check">
              <input type="checkbox" checked={allMode} onChange={(e) => setAllMode(e.target.checked)} />
              세 편람 모두에서 찾기
            </label>
            {!searching && (
              <button type="button" className="manual-text-btn" onClick={collapseAll}><Icon name="collapse" size={16} />모두 접기</button>
            )}
          </div>
          {!searching && <div className="manual-toc-count">질의응답·사례 {itemCount}건</div>}
        </div>

        <div className="manual-toc-body" ref={tocRef}>
          {!searching && rows.map(n => renderRow(n))}
          {searching && groups.map(renderGroup)}
        </div>
      </aside>

      {/* PDF 보기 */}
      <section className="manual-view">
        <div className="manual-bar">
          <button type="button" className="manual-icon-btn manual-toc-toggle" onClick={() => {
            if (window.matchMedia('(max-width: 1023px)').matches) setDrawerOpen(v => !v);
            else setTocOpen(v => !v);
          }} aria-label="목차 열고 닫기" title="목차">
            <Icon name="toc" /><span className="manual-hide-sm">목차</span>
            <span className="manual-bar-manual">{M.short}</span>
          </button>
          <div className="manual-bar-group">
            <button type="button" className="manual-icon-btn manual-step" onClick={() => scrollToPos(current.page - 1)} disabled={current.page <= 1} aria-label="앞 쪽"><Icon name="up" /></button>
            <form onSubmit={goPageInput} className="manual-page-form">
              <input
                value={pageEdit ?? String(current.page)}
                onChange={(e) => setPageEdit(e.target.value.replace(/\D/g, ''))}
                onBlur={() => setPageEdit(null)}
                onFocus={(e) => e.target.select()}
                inputMode="numeric"
                aria-label="쪽 번호"
              />
              <span className="manual-page-total">/ {total}</span>
            </form>
            <button type="button" className="manual-icon-btn manual-step" onClick={() => scrollToPos(current.page + 1)} disabled={current.page >= total} aria-label="다음 쪽"><Icon name="down" /></button>
            {pageLabel(M, current.page) && <span className="manual-print-page" title="편람에 인쇄된 쪽번호">인쇄 {pageLabel(M, current.page)}쪽</span>}
          </div>
          <div className="manual-bar-group manual-zoom">
            <button type="button" className="manual-icon-btn" onClick={zoomOut} aria-label="축소"><Icon name="minus" /></button>
            <button type="button" className={`manual-zoom-val${zoom === 'auto' ? ' is-auto' : ''}`} onClick={() => setZoom('auto')} title="폭 맞춤">
              {zoom === 'auto' ? '폭 맞춤' : `${Math.round(scale * 100)}%`}
            </button>
            <button type="button" className="manual-icon-btn" onClick={zoomIn} aria-label="확대"><Icon name="plus" /></button>
          </div>
          <div className="manual-bar-group manual-bar-end">
            <button type="button" className="manual-icon-btn" onClick={copyLink} title="지금 보는 곳 링크 복사"><Icon name="link" /><span className="manual-hide-sm">링크 복사</span></button>
            <a className="manual-icon-btn manual-hide-sm" href={`${M.pdf}#page=${current.page}`} target="_blank" rel="noopener noreferrer" title="PDF를 새 창에서 열기"><Icon name="external" /><span className="manual-hide-sm">새 창</span></a>
            <a className="manual-icon-btn manual-hide-sm" href={M.pdf} download={M.file} title="PDF 내려받기"><Icon name="download" /><span className="manual-hide-sm">내려받기</span></a>
          </div>
        </div>

        <div className="manual-pages" ref={viewerRef} onScroll={onScroll}>
          {!doc && (
            <div className="manual-loading">
              {loadError ? (
                <>
                  <p>{loadError}</p>
                  <a className="btn btn-outline" href={M.pdf} target="_blank" rel="noopener noreferrer">PDF 직접 열기</a>
                </>
              ) : <p>편람을 여는 중… {loadPct ? `${loadPct}%` : ''}</p>}
            </div>
          )}
          <div className="manual-stack" style={{ padding: PAD, gap: PAGE_GAP }}>
            {pages.map(p => (
              <PdfPage key={p} doc={doc} num={p} scale={scale} width={PAGE_W} height={PAGE_H} active={visible.has(p)} hitRe={hitRe} />
            ))}
          </div>
        </div>
      </section>

      {toast && <div className="manual-toast" role="status">{toast}</div>}
    </div>
  );
}
