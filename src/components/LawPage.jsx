import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './ManualPage.css';
import './LawPage.css';

// 관련 법령 자료 — 주요 법령 5개를 편람처럼 화면 안에서 바로 본다 (왼쪽 조문 목차 + 오른쪽 본문)
// 원문은 scripts/build_laws.py 가 법제처 OPEN API 에서 받아 public/law/laws.json 으로 둔 것
// (GitHub Actions 가 매주 다시 받아 바뀌면 커밋 → 다시 배포)

const DATA_URL = '/law/laws.json';
const LAST_KEY_STORE = 'law_last_key';
const FONT_STORE = 'law_font_step';
const FONT_STEPS = [0.94, 1.04, 1.16, 1.3];

// 화면 안에서 보지 않고 새 창으로 여는 자료
const OTHER_LINKS = [
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
  {
    title: '업무 매뉴얼',
    links: [
      { label: '경기도교육청 학원 업무 매뉴얼', href: 'https://drive.google.com/file/d/1I6j4VkHEeDzKc6YvfTcv8Wl48LAzbSsN/preview' },
      { label: '서울특별시교육청 학원 업무 매뉴얼', href: 'https://drive.google.com/file/d/1ppixrFV1wEFBXTicg_-muU81mn8Gvn8E/preview' },
    ],
  },
];

let dataLoad = null;
function loadLaws() {
  if (!dataLoad) {
    dataLoad = fetch(DATA_URL).then(r => (r.ok ? r.json() : Promise.reject(r.status)));
    dataLoad.catch(() => { dataLoad = null; }); // 실패하면 다음에 다시
  }
  return dataLoad;
}

const dotDate = (s) => (s ? s.split('-').map(Number).join('.') + '.' : '');
const lawLabel = (L) => `${L.kind} 제${Number(L.number)}호`;
const domId = (key, id) => `law-${key}-${id}`;

// 법령 하나 → 목차·검색에 쓸 항목 목록 (한 번만)
const prepared = new Map();
function prepare(L) {
  if (prepared.has(L)) return prepared.get(L);
  const items = [];
  L.articles.forEach((a, i) => {
    L.chapters.filter(c => c.before === i).forEach(c => items.push({ type: 'chapter', id: `c${i}`, title: c.title }));
    items.push({ type: 'article', ...a, body: a.lines.map(l => l[1]).join('\n') });
  });
  L.tables.forEach(t => items.push({ type: 'table', ...t, body: (t.text || []).join('\n') || t.search || '' }));
  L.forms.forEach(f => items.push({ type: 'form', ...f, body: '' }));
  const ids = new Set(items.map(x => x.id));
  const p = { items, ids };
  prepared.set(L, p);
  return p;
}

// ── 검색 (편람과 같은 방식: 글자 사이 띄어쓰기 무시, 띄어 쓴 낱말이 모두 들어 있으면 맞음) ──
const termRegex = (w) => new RegExp([...w].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'i');
function makeSearch(q) {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const terms = words.map(termRegex);
  return {
    test: (text) => terms.every(r => r.test(text)),
    any: new RegExp(terms.map(r => `(?:${r.source})`).join('|'), 'i'),
  };
}
const allMatches = (text, re) => [...text.matchAll(new RegExp(re.source, 'gi'))];

function Highlight({ text, re }) {
  if (!re) return text;
  const parts = [];
  let last = 0;
  for (const m of allMatches(text, re)) {
    if (!m[0]) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<mark key={m.index}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function snippetOf(text, re) {
  const m = text.match(new RegExp(re.source, 'i'));
  if (!m) return '';
  const a = Math.max(0, m.index - 30);
  const b = Math.min(text.length, m.index + m[0].length + 60);
  return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ') + (b < text.length ? '…' : '');
}

// ── 조문 안의 '법 제8조' '영 제5조의2' '제3조' '별표 2' → 그 자리로 가는 단추 ──
const normName = (s) => s.replace(/[\s·ㆍ「」]/g, '');
const REF = /(「[^」]{2,60}」\s*|같은\s*(?:법|영)\s*|(?:법|영|조례)\s*)?(?:제(\d+)조(?:의(\d+))?|별표\s*(\d+)(?:의(\d+))?)/g;
const PREFIX_KEY = { 법: 'act', 영: 'decree', 조례: 'ord' };
const HANGUL = /[가-힣]/;
// 앞 낱말이 다른 법령 이름으로 끝나면(… 시행령 제5조, 「건축법」 제2조) 이 법령의 조문이 아니다
const OTHER_LAW_END = /(?:[법령칙례]|」)\s*$/;

function resolveRef(m, text, curKey, byName, exists) {
  const [, pre, no, sub, bno, bsub] = m;
  const before = text.slice(0, m.index);
  let key = curKey;
  if (pre) {
    const p = pre.trim();
    if (p.startsWith('같은')) return null; // 앞에 나온 다른 법령일 수 있다
    if (p.startsWith('「')) {
      key = byName.get(normName(p));
      if (!key) return null;
    } else {
      if (HANGUL.test(before.slice(-1))) return null; // '주택법 제2조' '운영 제…'
      key = PREFIX_KEY[p];
    }
  } else {
    // 「학원의 … 법률」(이하 "법"이라 한다) 제8조 — 괄호 앞 법령 이름으로
    const def = before.match(/(「[^」]{2,60}」)\s*\(이하[^)]*\)\s*$/);
    if (def) {
      key = byName.get(normName(def[1]));
      if (!key) return null;
    } else if (/\(이하[^)]*\)\s*$/.test(before) || OTHER_LAW_END.test(before)) {
      return null;
    }
  }
  const id = no ? `${Number(no)}${sub ? `-${Number(sub)}` : ''}` : `t${Number(bno)}${bsub ? `-${Number(bsub)}` : ''}`;
  return exists(key, id) ? { key, id } : null;
}

function LawText({ text, re, curKey, byName, exists, onRef }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(REF)) {
    const target = resolveRef(m, text, curKey, byName, exists);
    if (!target) continue;
    // 앞붙이('법 ', '「…」 ')는 글 그대로 두고 '제8조'·'별표 2' 부분만 단추로
    const start = m.index + (m[1] ? m[1].length : 0);
    if (start > last) parts.push(<Highlight key={`t${last}`} text={text.slice(last, start)} re={re} />);
    const label = text.slice(start, m.index + m[0].length);
    parts.push(
      <button key={`r${start}`} type="button" className="law-ref" data-to={`${target.key}:${target.id}`} onClick={() => onRef(target)} title={target.key === curKey ? '이 법령의 해당 조문으로' : '해당 법령의 조문으로'}>
        <Highlight text={label} re={re} />
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Highlight key={`t${last}`} text={text.slice(last)} re={re} />);
  return parts;
}

// ── 별표 글: '┃항목 │' 처럼 한 글자 폭에 맞춘 표 → 글자마다 폭을 정해 칸을 맞춘다 ──
// 항·호·목 번호로 시작하는 줄만 내어쓰기 (① / 1. / 1의2. / 가.)
const NUMBERED = /^(?:[①-⑳]|\d+(?:의\d+)?\.|[가-하]\.)/;

const WIDE =/[ᄀ-ᇿ①-⓿─-╿■-➿⺀-鿿가-힣豈-﫿︰-﹏＀-｠￠-￦※ㆍ·∼～]/;
function BoxText({ lines, re }) {
  const hit = re ? new RegExp(re.source, 'i') : null;
  return (
    <div className="law-box" role="document">
      {lines.map((line, i) => (
        <div key={i} className={`law-box-line${hit && hit.test(line) ? ' is-hit' : ''}`}>
          {[...line].map((c, j) => (
            <span key={j} className={WIDE.test(c) ? 'w' : 'n'}>{c === ' ' ? ' ' : c}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Icon({ name, size = 18 }) {
  const p = {
    chevron: <polyline points="9 6 15 12 9 18" />,
    search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    toc: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    back: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
  );
}

// 본문 칸 위쪽에 걸린 조문·별표
function readingOf(box) {
  if (!box) return null;
  const top = box.getBoundingClientRect().top + 40;
  let cur = null;
  for (const el of box.querySelectorAll('[data-sec]')) {
    if (el.getBoundingClientRect().top > top) break;
    cur = el.dataset.sec;
  }
  return cur;
}

// 링크 값 'decree:12-2' → { key, id }
function parseTarget(t, laws) {
  if (!t) return null;
  const [key, id] = String(t).split(':');
  const L = laws.find(x => x.key === key);
  if (!L) return null;
  return { key, id: id && prepare(L).ids.has(id) ? id : null };
}

function savedNumber(k, fallback) {
  try {
    const v = parseInt(localStorage.getItem(k), 10);
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export default function LawPage({ initialTarget }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadLaws().then(d => { if (alive) setData(d); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  if (error) {
    return (
      <div className="law-fail">
        <p>법령 원문을 불러오지 못했습니다.</p>
        <button type="button" className="btn btn-outline" onClick={() => { setError(false); loadLaws().then(setData).catch(() => setError(true)); }}>다시 시도</button>
      </div>
    );
  }
  if (!data) return <p className="law-fail">법령을 여는 중…</p>;
  return <LawViewer data={data} initialTarget={initialTarget} />;
}

function LawViewer({ data, initialTarget }) {
  const LAWS = data.laws;
  const byKey = useMemo(() => Object.fromEntries(LAWS.map(L => [L.key, L])), [LAWS]);
  const byName = useMemo(() => new Map(LAWS.map(L => [normName(L.name), L.key])), [LAWS]);
  const exists = useCallback((key, id) => !!byKey[key] && prepare(byKey[key]).ids.has(id), [byKey]);

  const start = parseTarget(initialTarget, LAWS);
  const [lawKey, setLawKey] = useState(() => {
    if (start) return start.key;
    try {
      const k = localStorage.getItem(LAST_KEY_STORE);
      if (byKey[k]) return k;
    } catch { /* 없으면 학원법 */ }
    return LAWS[0].key;
  });
  const L = byKey[lawKey];
  const { items } = prepare(L);

  const bodyRef = useRef(null);
  const tocRef = useRef(null);
  const pendingRef = useRef(start?.id ? { id: start.id } : null); // 그려진 다음 옮겨 갈 자리
  const [navSeq, setNavSeq] = useState(0);
  const [readingId, setReadingId] = useState(null);
  const [backStack, setBackStack] = useState([]);   // 참조 조문으로 건너뛰기 전 자리
  const [query, setQuery] = useState('');
  const [allMode, setAllMode] = useState(true);       // 다섯 법령 모두에서 찾기
  const [hitQuery, setHitQuery] = useState('');       // 본문에 표시할 검색어
  const [openTables, setOpenTables] = useState(() => new Set()); // 펼친 별표
  const [formsOpen, setFormsOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fontStep, setFontStep] = useState(() => Math.min(FONT_STEPS.length - 1, Math.max(0, savedNumber(FONT_STORE, 1))));
  const [toast, setToast] = useState('');

  useEffect(() => { try { localStorage.setItem(LAST_KEY_STORE, lawKey); } catch { /* 그만 */ } }, [lawKey]);
  useEffect(() => { try { localStorage.setItem(FONT_STORE, String(fontStep)); } catch { /* 그만 */ } }, [fontStep]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 1800); };

  // ── 이동 ──
  const goTo = (key, id, { push = false } = {}) => {
    if (push) {
      const el = bodyRef.current;
      setBackStack(prev => [...prev.slice(-19), { key: lawKey, scroll: el ? el.scrollTop : 0 }]);
    }
    if (id?.startsWith('t')) setOpenTables(prev => new Set(prev).add(`${key}:${id}`));
    if (id?.startsWith('f')) setFormsOpen(true);
    setLawKey(key);
    pendingRef.current = { id };
    setNavSeq(n => n + 1);
    setDrawerOpen(false);
  };

  const goBack = () => {
    const last = backStack[backStack.length - 1];
    if (!last) return;
    setBackStack(prev => prev.slice(0, -1));
    setLawKey(last.key);
    pendingRef.current = { scroll: last.scroll };
    setNavSeq(n => n + 1);
  };

  // 그린 다음 그 자리로 (법령을 바꾸면 새 본문이 그려진 뒤에 옮겨야 한다)
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    const box = bodyRef.current;
    if (!pending || !box) return undefined;
    pendingRef.current = null;
    if (!pending.id) {
      box.scrollTop = pending.scroll ?? 0;
      return undefined;
    }
    const el = document.getElementById(domId(lawKey, pending.id));
    if (!el) return undefined;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 10;
    // 옮겨 간 조문을 잠깐 칠해 어디인지 보이게
    el.classList.add('is-flash');
    const t = setTimeout(() => el.classList.remove('is-flash'), 1600);
    return () => { clearTimeout(t); el.classList.remove('is-flash'); };
  }, [navSeq, lawKey]);

  // ── 스크롤 → 지금 읽는 조문 ──
  const onScroll = () => setReadingId(readingOf(bodyRef.current));
  useEffect(() => {
    const f = requestAnimationFrame(() => setReadingId(readingOf(bodyRef.current)));
    return () => cancelAnimationFrame(f);
  }, [lawKey, fontStep, navSeq, formsOpen]);

  // 켜진 목차 줄이 목차 칸 안에 보이게
  useEffect(() => {
    const box = tocRef.current;
    const row = box?.querySelector('.manual-row.is-active');
    if (!row) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < b.top + 8 || r.bottom > b.bottom - 8) box.scrollTop += r.top - b.top - box.clientHeight / 3;
  }, [readingId, query, lawKey]);

  // ── 검색 ──
  const search = useMemo(() => makeSearch(query), [query]);
  const re = search?.any ?? null;
  const scope = useMemo(() => (allMode ? [L, ...LAWS.filter(x => x.key !== L.key)] : [L]), [allMode, L, LAWS]);
  const groups = useMemo(() => {
    if (!search) return [];
    const bodyToo = query.trim().length >= 2;
    return scope.map(law => {
      const hits = [];
      prepare(law).items.forEach(it => {
        if (it.type === 'chapter') return;
        const head = `${it.label} ${it.title}`;
        const inHead = search.test(head);
        const inBody = bodyToo && search.test(`${head}\n${it.body}`);
        if (inHead || inBody) hits.push({ it, inHead, snippet: inHead ? '' : snippetOf(it.body, search.any) });
      });
      hits.sort((a, b) => (b.inHead - a.inHead));
      return { law, hits };
    });
  }, [search, scope, query]);
  const hitRe = useMemo(() => makeSearch(hitQuery)?.any ?? null, [hitQuery]);

  const openHit = (law, it) => {
    setHitQuery(query.trim());
    goTo(law.key, it.id);
  };

  // ── 링크·복사 ──
  const copyLink = async () => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('law', readingId ? `${lawKey}:${readingId}` : lawKey);
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast('지금 보는 조문의 링크를 복사했습니다');
    } catch {
      window.prompt('이 링크를 복사하세요', url.toString());
    }
  };
  const copyArticle = async (a) => {
    const head = `${a.label}${a.title ? `(${a.title})` : ''}`;
    const text = [`「${L.name}」 ${head}`, ...a.lines.map(([lv, t]) => `${'  '.repeat(lv)}${t}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${head} 조문을 복사했습니다`);
    } catch {
      window.prompt('이 글을 복사하세요', text);
    }
  };

  const toggleTable = (id) => setOpenTables(prev => {
    const k = `${lawKey}:${id}`;
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // ── 목차 ──
  const tables = items.filter(x => x.type === 'table');
  const forms = items.filter(x => x.type === 'form');
  const renderTocRow = (it) => {
    if (it.type === 'chapter') {
      return <div key={it.id} className="law-toc-chapter">{it.title}</div>;
    }
    const active = readingId === it.id;
    return (
      <div key={it.id} className={`manual-row${active ? ' is-active' : ''}${it.deleted ? ' law-is-deleted' : ''}`}>
        <button type="button" className="manual-row-main" onClick={() => goTo(lawKey, it.id)} title={`${it.label} ${it.title}`}>
          <span className="manual-row-text law-row-text">
            <span className="manual-badge law-badge">{it.label}</span>
            <span className="manual-row-title">{it.deleted ? '삭제' : it.title}</span>
          </span>
        </button>
      </div>
    );
  };

  const renderHits = ({ law, hits }) => {
    const limit = allMode ? 60 : 150;
    return (
      <div key={law.key} className="manual-hit-group">
        {allMode && (
          <div className={`manual-hit-manual${law.key === lawKey ? ' is-current' : ''}`}>
            {law.short} <em>{hits.length}건{law.key === lawKey ? ' · 지금 보는 법령' : ''}</em>
          </div>
        )}
        {!allMode && <div className="manual-hit-head"><b>{hits.length}</b>건</div>}
        {!hits.length && <p className="manual-empty">맞는 조문이 없습니다.</p>}
        {hits.slice(0, limit).map(({ it, snippet }) => (
          <button type="button" key={`${law.key}:${it.id}`} className="manual-body-hit" onClick={() => openHit(law, it)}>
            <span className="manual-body-hit-page">
              <Highlight text={it.label} re={re} />
              <span className="law-hit-title"><Highlight text={it.title} re={re} /></span>
            </span>
            {snippet && <span className="manual-body-hit-text"><Highlight text={snippet} re={re} /></span>}
          </button>
        ))}
        {hits.length > limit && <p className="manual-empty">앞의 {limit}건만 보입니다. 검색어를 더 좁혀 보세요.</p>}
      </div>
    );
  };

  const searching = !!query.trim();
  const textProps = { re: hitRe, curKey: lawKey, byName, exists, onRef: (t) => goTo(t.key, t.id, { push: true }) };

  return (
    <div className={`manual law${tocOpen ? '' : ' is-toc-closed'}${drawerOpen ? ' is-drawer' : ''}`} style={{ '--law-fs': `${FONT_STEPS[fontStep]}rem` }}>
      {drawerOpen && <div className="manual-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      {/* 목차 */}
      <aside className="manual-toc" aria-label="법령 목차">
        <div className="manual-toc-head">
          <div className="manual-switch law-switch" role="tablist" aria-label="법령 고르기">
            {LAWS.map(x => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={x.key === lawKey}
                className={`manual-switch-btn${x.key === lawKey ? ' is-on' : ''}`}
                onClick={() => { if (x.key !== lawKey) goTo(x.key, null); }}
              >
                {x.short}
              </button>
            ))}
            <button type="button" className="manual-icon-btn manual-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="목차 닫기"><Icon name="close" /></button>
          </div>
          <div className="manual-toc-title">
            <span className="manual-toc-name">{L.name}</span>
          </div>
          <div className="law-meta">
            <span>시행 {dotDate(L.effective)}</span>
            <span>{lawLabel(L)}{L.revision ? ` · ${L.revision}` : ''}</span>
          </div>
          <div className="manual-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setHitQuery(''); }}
              placeholder="조문 검색 (예: 교습시간, 제16조)"
              aria-label="법령 검색"
            />
            {query && <button type="button" className="manual-search-clear" onClick={() => { setQuery(''); setHitQuery(''); }} aria-label="검색어 지우기"><Icon name="close" size={16} /></button>}
          </div>
          <div className="manual-toc-tools">
            <label className="manual-check">
              <input type="checkbox" checked={allMode} onChange={(e) => setAllMode(e.target.checked)} />
              다섯 법령 모두에서 찾기
            </label>
          </div>
        </div>

        <div className="manual-toc-body" ref={tocRef}>
          {searching && (query.trim().length < 2
            ? <p className="manual-empty">본문은 두 글자 이상부터 찾습니다. 지금은 조문 제목만 찾습니다.</p>
            : null)}
          {searching && groups.map(renderHits)}
          {!searching && (
            <>
              {items.filter(x => x.type === 'chapter' || x.type === 'article').map(renderTocRow)}
              {tables.length > 0 && <div className="law-toc-chapter">별표</div>}
              {tables.map(renderTocRow)}
              {forms.length > 0 && (
                <button type="button" className={`law-toc-fold${formsOpen ? ' is-open' : ''}`} onClick={() => setFormsOpen(v => !v)} aria-expanded={formsOpen}>
                  <Icon name="chevron" size={16} />서식 {forms.length}개
                </button>
              )}
              {formsOpen && forms.map(renderTocRow)}

              <button type="button" className={`law-toc-fold law-toc-others${othersOpen ? ' is-open' : ''}`} onClick={() => setOthersOpen(v => !v)} aria-expanded={othersOpen}>
                <Icon name="chevron" size={16} />그 밖의 법령·매뉴얼 (새 창)
              </button>
              {othersOpen && OTHER_LINKS.map(sec => (
                <div key={sec.title} className="law-other">
                  <div className="law-other-title">{sec.title}</div>
                  {sec.links.map(({ label, href }) => (
                    <a key={label} className="law-other-link" href={href} target="_blank" rel="noopener noreferrer">
                      <span>{label}</span><Icon name="external" size={15} />
                    </a>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* 본문 */}
      <section className="manual-view">
        <div className="manual-bar">
          <button type="button" className="manual-icon-btn manual-toc-toggle" onClick={() => {
            if (window.matchMedia('(max-width: 1023px)').matches) setDrawerOpen(v => !v);
            else setTocOpen(v => !v);
          }} aria-label="목차 열고 닫기" title="목차">
            <Icon name="toc" /><span className="manual-hide-sm">목차</span>
            <span className="manual-bar-manual">{L.short}</span>
          </button>
          {backStack.length > 0 && (
            <button type="button" className="manual-icon-btn law-back" onClick={goBack} title="참조 조문을 보기 전 자리로">
              <Icon name="back" /><span>돌아가기</span>
            </button>
          )}
          <div className="manual-bar-group law-font" role="group" aria-label="글자 크기">
            <button type="button" className="manual-icon-btn" onClick={() => setFontStep(s => Math.max(0, s - 1))} disabled={fontStep === 0} aria-label="글자 작게">가<small>−</small></button>
            <button type="button" className="manual-icon-btn" onClick={() => setFontStep(s => Math.min(FONT_STEPS.length - 1, s + 1))} disabled={fontStep === FONT_STEPS.length - 1} aria-label="글자 크게">가<small>+</small></button>
          </div>
          <div className="manual-bar-group manual-bar-end">
            <button type="button" className="manual-icon-btn" onClick={copyLink} title="지금 보는 조문 링크 복사"><Icon name="link" /><span className="manual-hide-sm">링크 복사</span></button>
            <a className="manual-icon-btn" href={L.url} target="_blank" rel="noopener noreferrer" title="국가법령정보센터에서 열기"><Icon name="external" /><span className="manual-hide-sm">법제처 원문</span></a>
          </div>
        </div>

        <div className="law-body" ref={bodyRef} onScroll={onScroll}>
          <div className="law-doc">
            <header className="law-doc-head">
              <h2>{L.name}</h2>
              <p>[시행 {dotDate(L.effective)}] [{lawLabel(L)}, {dotDate(L.promulgated)}, {L.revision}]</p>
              <p className="law-doc-src">국가법령정보센터 원문 · 매주 자동 확인 (마지막 반영 {dotDate(data.updated)})</p>
            </header>

            {items.map(it => {
              if (it.type === 'chapter') return <h3 key={it.id} className="law-chapter">{it.title}</h3>;
              if (it.type === 'article') {
                return (
                  <article key={it.id} id={domId(lawKey, it.id)} data-sec={it.id} className={`law-art${it.deleted ? ' is-deleted' : ''}`}>
                    <div className="law-art-head">
                      <h4>
                        <span className="law-art-no">{it.label}</span>
                        {it.title && <span className="law-art-title">(<Highlight text={it.title} re={hitRe} />)</span>}
                      </h4>
                      {!it.deleted && (
                        <button type="button" className="law-copy" onClick={() => copyArticle(it)} title="이 조문 복사"><Icon name="copy" size={15} /><span>복사</span></button>
                      )}
                    </div>
                    {it.lines.map(([lv, t], i) => (
                      <p key={i} className={`law-line is-l${Math.min(lv, 3)}${NUMBERED.test(t) ? '' : ' is-plain'}`}><LawText text={t} {...textProps} /></p>
                    ))}
                    {it.note && <p className="law-note">{it.note}</p>}
                  </article>
                );
              }
              if (it.type === 'table') {
                const first = it === tables[0];
                const open = openTables.has(`${lawKey}:${it.id}`);
                return (
                  <React.Fragment key={it.id}>
                  {first && <h3 className="law-chapter">별표</h3>}
                  <section id={domId(lawKey, it.id)} data-sec={it.id} className={`law-table`}>
                    <div className="law-table-head">
                      <h4><span className="law-art-no">{it.label}</span> <span className="law-art-title">{it.title}</span></h4>
                      <div className="law-files">
                        {it.text?.length > 0 && (
                          <button type="button" className="law-file-btn is-main" onClick={() => toggleTable(it.id)} aria-expanded={open}>{open ? '접기' : '펼쳐 보기'}</button>
                        )}
                        {it.pdf && <a className="law-file-btn" href={it.pdf} target="_blank" rel="noopener noreferrer"><Icon name="download" size={15} />PDF</a>}
                        {it.hwp && <a className="law-file-btn" href={it.hwp} target="_blank" rel="noopener noreferrer"><Icon name="download" size={15} />HWP</a>}
                      </div>
                    </div>
                    {!it.text?.length && <p className="law-note">표는 HWP 파일이나 <a href={L.url} target="_blank" rel="noopener noreferrer">법제처 원문</a>에서 보세요.</p>}
                    {open && it.text?.length > 0 && <BoxText lines={it.text} re={hitRe} />}
                  </section>
                  </React.Fragment>
                );
              }
              if (it.type === 'form') {
                if (!formsOpen) return null;
                return (
                  <React.Fragment key={it.id}>
                  {it === forms[0] && <h3 className="law-chapter">서식</h3>}
                  <div id={domId(lawKey, it.id)} data-sec={it.id} className={`law-form`}>
                    <span className="law-form-name"><b>{it.label}</b> {it.title}</span>
                    <span className="law-files">
                      {it.pdf && <a className="law-file-btn" href={it.pdf} target="_blank" rel="noopener noreferrer"><Icon name="download" size={15} />PDF</a>}
                      {it.hwp && <a className="law-file-btn" href={it.hwp} target="_blank" rel="noopener noreferrer"><Icon name="download" size={15} />HWP</a>}
                    </span>
                  </div>
                  </React.Fragment>
                );
              }
              return null;
            })}
            {forms.length > 0 && !formsOpen && (
              <button type="button" className="law-forms-more" onClick={() => setFormsOpen(true)}>서식 {forms.length}개 보기</button>
            )}
          </div>
        </div>
      </section>

      {toast && <div className="manual-toast" role="status">{toast}</div>}
    </div>
  );
}
