import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
// legacy 빌드 — 최신 빌드는 아이폰 사파리 등 조금 지난 브라우저에서 안 열린다
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import MANUAL from '../data/gyeonggiManual.json';
import './ManualPage.css';

// 학원업무 편람 — 왼쪽 목차(질의응답은 한 건씩) + 오른쪽 PDF 보기
// 목차·쪽별 본문은 scripts/build_manual_toc.py 로 PDF에서 뽑아 둔 것
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PDF_URL = '/manual/gyeonggi-2024.pdf';
const TEXT_URL = '/manual/gyeonggi-2024-text.json';
const PAGE_GAP = 14;   // 쪽 사이 간격(px)
const PAD = 16;        // 보기 칸 안쪽 여백(px)
const MAX_AUTO = 1.6;  // '폭 맞춤'이라도 이보다 크게 키우지 않는다
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const [PAGE_W, PAGE_H] = MANUAL.size;

// 목차 나무 → 한 줄 목록 (부모·깊이·항목 종류)
function flatten() {
  const list = [];
  const byId = new Map();
  const walk = (nodes, depth, parent, kind) => {
    nodes.forEach(n => {
      const k = n.kind === 'qa' ? 'qa'
        : n.kind === 'law' ? 'law'
          : n.kind === 'case' ? (n.title.includes('판례') ? 'court' : 'appeal')
            : kind;
      const node = { ...n, depth, parentId: parent?.id ?? null, itemKind: k };
      list.push(node);
      byId.set(n.id, node);
      if (n.children) walk(n.children, depth + 1, node, k);
    });
  };
  walk(MANUAL.toc, 0, null, null);
  return { list, byId };
}
const { list: FLAT, byId: BY_ID } = flatten();
// 읽는 위치 → 목차 항목 찾기용 (쪽·쪽 안 높이 순)
const BY_POS = [...FLAT].sort((a, b) => a.page - b.page || a.y - b.y || a.depth - b.depth);

const pad3 = (n) => String(n).padStart(3, '0');
const ITEM_BADGE = { qa: (n) => `Q${pad3(n)}`, law: (n) => `해석 ${n}`, appeal: (n) => `재결 ${n}`, court: (n) => `판례 ${n}` };

function nodeLabel(n) {
  if (n.isItem) return { badge: ITEM_BADGE[n.itemKind]?.(n.no) ?? n.no, text: n.title };
  return { badge: n.prefix || '', text: n.title };
}

const pageLabel = (p) => MANUAL.labels[p - 1];
const pageText = (p) => (pageLabel(p) ? `${pageLabel(p)}쪽` : '');

function ancestors(id) {
  const out = [];
  let n = BY_ID.get(id);
  while (n?.parentId) { out.push(n.parentId); n = BY_ID.get(n.parentId); }
  return out;
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
    prev: <polyline points="15 18 9 12 15 6" />,
    next: <polyline points="9 18 15 12 9 6" />,
    up: <polyline points="18 15 12 9 6 15" />,
    down: <polyline points="6 9 12 15 18 9" />,
    minus: <line x1="5" y1="12" x2="19" y2="12" />,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    toc: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    fit: <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>,
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    collapse: <><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></>,
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
  );
}

// ── PDF 한 쪽: 보일 때만 그린다 (캔버스 + 글자 층) ──
function PdfPage({ doc, num, scale, active, hitRe }) {
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
      style={{ width: PAGE_W * scale, height: PAGE_H * scale, '--total-scale-factor': scale }}
    >
      {active ? (
        <>
          <canvas ref={canvasRef} className={drawn ? 'is-drawn' : ''} style={{ width: PAGE_W * scale, height: PAGE_H * scale }} />
          <div ref={textRef} className="textLayer" />
        </>
      ) : null}
      {!drawn && <span className="manual-sheet-num">{num}</span>}
    </div>
  );
}

export default function ManualPage({ initialTarget }) {
  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadPct, setLoadPct] = useState(0);
  const total = MANUAL.pages;

  const viewerRef = useRef(null);
  const tocRef = useRef(null);
  const [viewerW, setViewerW] = useState(0);
  const [zoom, setZoom] = useState('auto'); // 'auto' 또는 배율
  const [current, setCurrent] = useState({ page: 1, y: 0 }); // 지금 보는 위치 (PDF 쪽, 쪽 안 높이 pt)
  const [pageEdit, setPageEdit] = useState(null); // 쪽 번호 칸에 치는 중인 값
  const [visible, setVisible] = useState(() => new Set());

  // 링크(?manual=…)로 들어오면 그 항목까지 펼치고 골라 둔다
  const initialNode = initialTarget?.id ? BY_ID.get(initialTarget.id) : null;
  const [expanded, setExpanded] = useState(() => new Set([
    ...MANUAL.toc.map(n => n.id),
    ...(initialNode ? ancestors(initialNode.id) : []),
  ]));
  const [selectedId, setSelectedId] = useState(initialNode?.id ?? null);
  const [tocOpen, setTocOpen] = useState(true);       // 넓은 화면: 목차 칸 접기
  const [drawerOpen, setDrawerOpen] = useState(false); // 좁은 화면: 목차 서랍
  const [query, setQuery] = useState('');
  const [texts, setTexts] = useState(null);
  const [textsError, setTextsError] = useState(false);
  const [hitQuery, setHitQuery] = useState('');
  const [toast, setToast] = useState('');

  // ── PDF 열기 ──
  useEffect(() => {
    let alive = true;
    const task = pdfjsLib.getDocument({
      url: PDF_URL,
      cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
    });
    task.onProgress = ({ loaded, total: t }) => { if (alive && t) setLoadPct(Math.round((loaded / t) * 100)); };
    task.promise.then(d => { if (alive) setDoc(d); }).catch(err => {
      console.error(err);
      if (alive) setLoadError('편람 PDF를 열지 못했습니다.');
    });
    return () => { alive = false; task.destroy(); };
  }, []);

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
      ancestors(id).forEach(a => next.add(a));
      return next;
    });
  }, []);

  const openNode = useCallback((n, { fromSearch } = {}) => {
    setSelectedId(n.id);
    revealInToc(n.id);
    if (n.children && !fromSearch) setExpanded(prev => new Set(prev).add(n.id));
    scrollToPos(n.page, n.y);
    setDrawerOpen(false);
  }, [revealInToc, scrollToPos]);

  // 처음 들어올 때 (링크 ?manual=1.6.007 / ?manualPage=154)
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
  }, [pageTop, scale, step, total]);
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
  }, [current]);

  // 접힌 곳 안이면 펼쳐진 가장 가까운 윗 항목을 켠다
  const shownActive = useMemo(() => {
    let id = readingId;
    while (id) {
      const anc = ancestors(id);
      if (anc.every(a => expanded.has(a))) return id;
      id = BY_ID.get(id)?.parentId;
    }
    return null;
  }, [readingId, expanded]);

  // 켜진 목차 줄이 목차 칸 안에 보이게 (페이지 전체는 움직이지 않게 목차 칸만)
  useEffect(() => {
    const box = tocRef.current;
    const row = box?.querySelector('.manual-row.is-active');
    if (!row) return;
    const top = row.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 8 || top + row.offsetHeight > box.scrollTop + box.clientHeight - 8) {
      box.scrollTop = top - box.clientHeight / 3;
    }
  }, [shownActive, query]);

  // ── 검색 ──
  const search = useMemo(() => makeSearch(query), [query]);
  const re = search?.any ?? null;
  const tocHits = useMemo(() => {
    if (!search) return [];
    return FLAT.filter(n => search.test(n.title)).slice(0, 150);
  }, [search]);

  useEffect(() => {
    if (!query.trim() || texts || textsError) return;
    fetch(TEXT_URL).then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(setTexts).catch(() => setTextsError(true));
  }, [query, texts, textsError]);

  const bodyHits = useMemo(() => {
    if (!search || !texts || query.trim().length < 2) return [];
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
  }, [search, texts, query]);

  const hitRe = useMemo(() => makeSearch(hitQuery)?.any ?? null, [hitQuery]);

  // ── 목차 나무 그리기 ──
  const rows = useMemo(() => {
    const out = [];
    const walk = (nodes) => nodes.forEach(n => {
      const node = BY_ID.get(n.id);
      out.push(node);
      if (n.children && expanded.has(n.id)) walk(n.children);
    });
    walk(MANUAL.toc);
    return out;
  }, [expanded]);

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const collapseAll = () => setExpanded(new Set(MANUAL.toc.map(n => n.id)));

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 1800); };

  const copyLink = async () => {
    const id = selectedId && BY_ID.get(selectedId)?.page === current.page ? selectedId : readingId;
    const n = id && BY_ID.get(id);
    const url = new URL(window.location.origin + window.location.pathname);
    if (n && n.page === current.page) url.searchParams.set('manual', n.id);
    else url.searchParams.set('manualPage', String(current.page));
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

  const renderRow = (n, { flat } = {}) => {
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
      selectedId === n.id ? 'is-selected' : '',
    ].filter(Boolean).join(' ');
    const crumb = flat ? ancestors(n.id).reverse().map(a => BY_ID.get(a)).filter(a => a.depth <= 1).map(a => a.title).join(' › ') : '';
    return (
      <div key={n.id} className={cls} style={flat ? undefined : { '--depth': n.depth }}>
        {!flat && (
          hasKids ? (
            <button type="button" className={`manual-twisty${isOpen ? ' is-open' : ''}`} onClick={() => toggle(n.id)} aria-label={isOpen ? '접기' : '펼치기'} aria-expanded={isOpen}>
              <Icon name="chevron" size={16} />
            </button>
          ) : <span className="manual-twisty is-leaf" aria-hidden="true" />
        )}
        <button type="button" className="manual-row-main" onClick={() => openNode(n, { fromSearch: flat })} title={n.title}>
          <span className="manual-row-text">
            {badge && <span className="manual-badge">{badge}</span>}
            <span className="manual-row-title">{flat ? <Highlight text={text} re={re} /> : text}</span>
            {n.count ? <span className="manual-count">{n.count}건</span> : null}
            {n.note && <span className="manual-note">{n.note}</span>}
            {crumb && <span className="manual-crumb">{crumb}</span>}
          </span>
          <span className="manual-row-page">{pageText(n.page)}</span>
        </button>
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
          <div className="manual-toc-title">
            <span className="manual-toc-name">{MANUAL.title}</span>
            <button type="button" className="manual-icon-btn manual-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="목차 닫기"><Icon name="close" /></button>
          </div>
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
          {!searching && (
            <div className="manual-toc-tools">
              <span>질의응답·사례 {FLAT.filter(n => n.isItem).length}건</span>
              <button type="button" className="manual-text-btn" onClick={collapseAll}><Icon name="collapse" size={16} />모두 접기</button>
            </div>
          )}
        </div>

        <div className="manual-toc-body" ref={tocRef}>
          {!searching && rows.map(n => renderRow(n))}

          {searching && (
            <>
              <div className="manual-hit-head">목차 <b>{tocHits.length}</b>건</div>
              {tocHits.length ? tocHits.map(n => renderRow(n, { flat: true })) : <p className="manual-empty">목차에는 없습니다.</p>}

              <div className="manual-hit-head">본문 {texts ? <><b>{bodyHits.length}</b>쪽</> : ''}</div>
              {query.trim().length < 2 ? <p className="manual-empty">본문은 두 글자 이상부터 찾습니다.</p>
                : textsError ? <p className="manual-empty">본문 검색 자료를 불러오지 못했습니다.</p>
                  : !texts ? <p className="manual-empty">본문을 불러오는 중…</p>
                    : !bodyHits.length ? <p className="manual-empty">본문에도 없습니다.</p>
                      : bodyHits.slice(0, 200).map(h => (
                        <button
                          type="button"
                          key={h.page}
                          className={`manual-body-hit${current.page === h.page && hitQuery ? ' is-active' : ''}`}
                          onClick={() => { setHitQuery(query.trim()); scrollToPos(h.page); setDrawerOpen(false); }}
                        >
                          <span className="manual-body-hit-page">{pageText(h.page) || `PDF ${h.page}쪽`}{h.count > 1 && <em>{h.count}곳</em>}</span>
                          <span className="manual-body-hit-text"><Highlight text={h.snippet} re={re} /></span>
                        </button>
                      ))}
            </>
          )}
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
            {pageLabel(current.page) && <span className="manual-print-page" title="편람에 인쇄된 쪽번호">인쇄 {pageLabel(current.page)}쪽</span>}
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
            <a className="manual-icon-btn manual-hide-sm" href={`${PDF_URL}#page=${current.page}`} target="_blank" rel="noopener noreferrer" title="PDF를 새 창에서 열기"><Icon name="external" /><span className="manual-hide-sm">새 창</span></a>
            <a className="manual-icon-btn manual-hide-sm" href={PDF_URL} download="2024 경기도교육청 학원업무 편람.pdf" title="PDF 내려받기"><Icon name="download" /><span className="manual-hide-sm">내려받기</span></a>
          </div>
        </div>

        <div className="manual-pages" ref={viewerRef} onScroll={onScroll}>
          {!doc && (
            <div className="manual-loading">
              {loadError ? (
                <>
                  <p>{loadError}</p>
                  <a className="btn btn-outline" href={PDF_URL} target="_blank" rel="noopener noreferrer">PDF 직접 열기</a>
                </>
              ) : <p>편람을 여는 중… {loadPct ? `${loadPct}%` : ''}</p>}
            </div>
          )}
          <div className="manual-stack" style={{ padding: PAD, gap: PAGE_GAP }}>
            {pages.map(p => (
              <PdfPage key={p} doc={doc} num={p} scale={scale} active={visible.has(p)} hitRe={hitRe} />
            ))}
          </div>
        </div>
      </section>

      {toast && <div className="manual-toast" role="status">{toast}</div>}
    </div>
  );
}
