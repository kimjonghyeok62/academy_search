import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// ── 업무편람 목록 ──
const MANUALS = [
    { id: 'gyeonggi', short: '경기', title: '2024 경기도교육청 학원 업무 편람', json: '/manuals/manual_gyeonggi_2024.json', pdf: '/manuals/manual_gyeonggi_2024.pdf', color: '#3b82f6' },
    { id: 'seoul', short: '서울', title: '2025 서울특별시교육청 학원 업무 편람', json: '/manuals/manual_seoul_2025.json', pdf: '/manuals/manual_seoul_2025.pdf', color: '#8b5cf6' },
];

// pdfjs 본체는 뷰어를 열 때만 동적 로드 (메인 번들 크기 보호)
let pdfjsPromise = null;
const loadPdfjs = () => {
    if (!pdfjsPromise) {
        pdfjsPromise = import('pdfjs-dist').then(lib => {
            lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
            return lib;
        });
    }
    return pdfjsPromise;
};

// 페이지 텍스트 인덱스 캐시 (모달을 다시 열어도 재다운로드 없음)
const indexCache = {};

// 공백 제거 정규화 + 원본 인덱스 매핑 (PDF 텍스트의 불규칙한 띄어쓰기 대응)
function buildNorm(text) {
    const lower = text.toLowerCase();
    let norm = '';
    const map = [];
    for (let i = 0; i < lower.length; i++) {
        const c = lower[i];
        if (c === ' ' || c === '\n' || c === '\t') continue;
        norm += c;
        map.push(i);
    }
    return { norm, map };
}

async function loadIndex(manual) {
    if (indexCache[manual.id]) return indexCache[manual.id];
    const res = await fetch(manual.json);
    if (!res.ok) throw new Error(`${manual.title} 인덱스 로드 실패`);
    const data = await res.json();
    const pages = data.pages.map(pg => ({ ...pg, ...buildNorm(pg.t) }));
    indexCache[manual.id] = { ...data, pages };
    return indexCache[manual.id];
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── 검색 결과 스니펫 (검색어 하이라이트) ──
function Snippet({ text, terms }) {
    const re = useMemo(() => new RegExp(`(${terms.map(escRe).join('|')})`, 'gi'), [terms]);
    const parts = text.split(re);
    return (
        <span>
            {parts.map((s, i) =>
                terms.some(t => s.toLowerCase() === t)
                    ? <mark key={i} style={{ background: '#fde047', color: '#1f2937', fontWeight: '700', padding: '0 1px', borderRadius: '2px' }}>{s}</mark>
                    : <React.Fragment key={i}>{s}</React.Fragment>
            )}
        </span>
    );
}

// ── PDF 뷰어 (pdfjs canvas 렌더링, 페이지 이동 + 확대/핀치줌) ──
function PdfViewer({ manual, initialPage, searchTerms, onBack }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const pinchRef = useRef(null);
    const [doc, setDoc] = useState(null);
    const [pageNum, setPageNum] = useState(initialPage);
    const [pageInput, setPageInput] = useState(String(initialPage));
    const [numPages, setNumPages] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [rendering, setRendering] = useState(true);
    const [error, setError] = useState('');

    // 문서 로드
    useEffect(() => {
        let cancelled = false;
        let loaded = null;
        (async () => {
            try {
                const lib = await loadPdfjs();
                const d = await lib.getDocument({
                    url: manual.pdf,
                    cMapUrl: 'https://unpkg.com/pdfjs-dist@6.1.200/cmaps/',
                    cMapPacked: true,
                }).promise;
                loaded = d;
                if (cancelled) { d.destroy(); return; }
                setDoc(d);
                setNumPages(d.numPages);
            } catch (e) {
                if (!cancelled) setError('PDF를 불러오지 못했습니다: ' + e.message);
            }
        })();
        return () => { cancelled = true; if (loaded) loaded.destroy(); };
    }, [manual]);

    // 페이지 렌더링
    useEffect(() => {
        if (!doc) return;
        let cancelled = false;
        (async () => {
            try {
                setRendering(true);
                const pg = await doc.getPage(pageNum);
                const container = containerRef.current;
                const cw = container ? container.clientWidth - 8 : 360;
                const vp1 = pg.getViewport({ scale: 1 });
                const scale = (cw / vp1.width) * zoom;
                const dpr = Math.min(window.devicePixelRatio || 1, 3);
                const vp = pg.getViewport({ scale: scale * dpr });
                const canvas = canvasRef.current;
                if (!canvas || cancelled) return;
                canvas.width = vp.width;
                canvas.height = vp.height;
                canvas.style.width = `${vp.width / dpr}px`;
                canvas.style.height = `${vp.height / dpr}px`;
                canvas.style.transform = '';
                // intent: 'print' — rAF 스케줄링을 우회해 백그라운드 탭/저사양 기기에서도 렌더 완료 보장
                await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'print' }).promise;
            } catch (e) {
                if (!cancelled && e?.name !== 'RenderingCancelledException') setError('렌더링 오류: ' + e.message);
            } finally {
                if (!cancelled) setRendering(false);
            }
        })();
        return () => { cancelled = true; };
    }, [doc, pageNum, zoom]);

    const goPage = useCallback((p) => {
        const n = Math.max(1, Math.min(numPages || 1, p));
        setPageNum(n);
        setPageInput(String(n));
        if (containerRef.current) containerRef.current.scrollTop = 0;
    }, [numPages]);

    // 핀치 줌: 이동 중엔 CSS transform, 손을 떼면 해당 배율로 재렌더링
    const onTouchStart = (e) => {
        if (e.touches.length === 2) {
            const d = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            pinchRef.current = { startDist: d, ratio: 1 };
        }
    };
    const onTouchMove = (e) => {
        if (e.touches.length === 2 && pinchRef.current) {
            const d = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const ratio = d / pinchRef.current.startDist;
            pinchRef.current.ratio = ratio;
            if (canvasRef.current) {
                canvasRef.current.style.transformOrigin = 'top left';
                canvasRef.current.style.transform = `scale(${ratio})`;
            }
        }
    };
    const onTouchEnd = () => {
        if (pinchRef.current) {
            const r = pinchRef.current.ratio;
            pinchRef.current = null;
            if (Math.abs(r - 1) > 0.05) setZoom(z => Math.max(0.5, Math.min(5, z * r)));
            else if (canvasRef.current) canvasRef.current.style.transform = '';
        }
    };

    const navBtn = (label, onClick, disabled) => (
        <button onClick={onClick} disabled={disabled} style={{
            padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', color: disabled ? 'var(--border-color)' : 'var(--text-main)',
            fontWeight: '700', fontSize: '0.82rem', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
        }}>{label}</button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 뷰어 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', flexShrink: 0 }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', padding: '4px', whiteSpace: 'nowrap' }}>
                    ← 결과
                </button>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: manual.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {manual.title}
                </span>
                <a href={manual.pdf} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'underline', whiteSpace: 'nowrap' }}>원본</a>
            </div>
            {searchTerms.length > 0 && (
                <div style={{ padding: '4px 12px', fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-main)', flexShrink: 0 }}>
                    🔍 <b>{searchTerms.join(' ')}</b> — 이 페이지에서 확대해 확인하세요
                </div>
            )}
            {/* 캔버스 영역 */}
            <div
                ref={containerRef}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{ flex: 1, overflow: 'auto', background: '#525659', textAlign: 'center', padding: '4px', position: 'relative' }}
            >
                {error
                    ? <div style={{ color: '#fca5a5', padding: '40px 16px', fontSize: '0.85rem' }}>{error}</div>
                    : <canvas ref={canvasRef} style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.4)', background: 'white' }} />}
                {rendering && !error && (
                    <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem' }}>
                        불러오는 중…
                    </div>
                )}
            </div>
            {/* 하단 내비게이션 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)', flexShrink: 0, flexWrap: 'wrap' }}>
                {navBtn('◀ 이전', () => goPage(pageNum - 1), pageNum <= 1)}
                <form onSubmit={e => { e.preventDefault(); goPage(parseInt(pageInput, 10) || pageNum); }} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                        value={pageInput}
                        onChange={e => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
                        inputMode="numeric"
                        style={{ width: '48px', textAlign: 'center', padding: '5px 2px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.82rem', fontWeight: '700' }}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {numPages || '…'}</span>
                </form>
                {navBtn('다음 ▶', () => goPage(pageNum + 1), numPages > 0 && pageNum >= numPages)}
                <span style={{ width: '8px' }} />
                {navBtn('－', () => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2))), zoom <= 0.5)}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '38px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                {navBtn('＋', () => setZoom(z => Math.min(5, +(z + 0.25).toFixed(2))), zoom >= 5)}
            </div>
        </div>
    );
}

// ── 메인 모달: 검색 ↔ 뷰어 전환 ──
export default function ManualSearchModal({ onClose }) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all'); // all | gyeonggi | seoul
    const [results, setResults] = useState(null); // null=검색 전
    const [searching, setSearching] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [viewing, setViewing] = useState(null); // { manual, page }
    const [terms, setTerms] = useState([]);
    const inputRef = useRef(null);

    useEffect(() => {
        // 배경 스크롤 잠금
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    const runSearch = useCallback(async (q, f) => {
        const qTerms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (qTerms.length === 0) return;
        setSearching(true);
        setLoadError('');
        setTerms(qTerms);
        try {
            const targets = MANUALS.filter(m => f === 'all' || m.id === f);
            const indexes = await Promise.all(targets.map(loadIndex));
            const out = [];
            targets.forEach((m, mi) => {
                const idx = indexes[mi];
                idx.pages.forEach(pg => {
                    // 모든 검색어가 (공백 무시 기준) 포함된 페이지만
                    if (!qTerms.every(t => pg.norm.includes(t))) return;
                    const firstIdx = pg.norm.indexOf(qTerms[0]);
                    const origIdx = pg.map[firstIdx] ?? 0;
                    const start = Math.max(0, origIdx - 50);
                    const end = Math.min(pg.t.length, origIdx + qTerms[0].length + 90);
                    const snippet = (start > 0 ? '…' : '') + pg.t.slice(start, end).replace(/\n/g, ' ') + (end < pg.t.length ? '…' : '');
                    let count = 0;
                    let pos = -1;
                    while ((pos = pg.norm.indexOf(qTerms[0], pos + 1)) !== -1) count++;
                    out.push({ manual: m, page: pg.p, snippet, count });
                });
            });
            out.sort((a, b) => b.count - a.count || a.page - b.page);
            setResults(out.slice(0, 100));
        } catch (e) {
            setLoadError(e.message || '검색 중 오류가 발생했습니다.');
            setResults([]);
        } finally {
            setSearching(false);
        }
    }, []);

    const filterChip = (id, label) => (
        <button key={id} onClick={() => { setFilter(id); if (results !== null && query.trim()) runSearch(query, id); }} style={{
            padding: '4px 12px', borderRadius: '14px', border: '1.5px solid',
            borderColor: filter === id ? 'var(--primary)' : 'var(--border-color)',
            background: filter === id ? 'var(--primary)' : 'transparent',
            color: filter === id ? 'white' : 'var(--text-muted)',
            fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>{label}</button>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--bg-main)', display: 'flex', flexDirection: 'column' }}>
            {viewing ? (
                <PdfViewer manual={viewing.manual} initialPage={viewing.page} searchTerms={terms} onBack={() => setViewing(null)} />
            ) : (
                <>
                    {/* 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)', flex: 1 }}>📚 업무편람 검색</span>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
                    </div>
                    {/* 검색 입력 + 필터 */}
                    <div style={{ padding: '12px 14px 8px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                        <form onSubmit={e => { e.preventDefault(); runSearch(query, filter); inputRef.current?.blur(); }} style={{ display: 'flex', gap: '8px' }}>
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="예: 교습비 반환, 등록말소, 휴원…"
                                autoFocus
                                style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.9rem', outline: 'none' }}
                            />
                            <button type="submit" disabled={searching || !query.trim()} style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: 'white', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap', opacity: searching || !query.trim() ? 0.6 : 1 }}>
                                {searching ? '…' : '검색'}
                            </button>
                        </form>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                            {filterChip('all', '전체')}
                            {filterChip('gyeonggi', '경기도')}
                            {filterChip('seoul', '서울')}
                        </div>
                    </div>
                    {/* 결과 */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 40px' }}>
                        {loadError && <div style={{ color: '#ef4444', fontSize: '0.85rem', padding: '16px 0' }}>{loadError}</div>}
                        {results === null && !searching && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px 16px', fontSize: '0.85rem', lineHeight: 1.8 }}>
                                찾고 싶은 내용을 검색하면<br />
                                <b>경기도·서울 업무편람</b>에서 해당 페이지를 바로 찾아드립니다.<br />
                                결과를 누르면 그 페이지의 PDF가 열립니다.
                            </div>
                        )}
                        {searching && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>검색 중…</div>}
                        {results !== null && !searching && results.length === 0 && !loadError && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px', fontSize: '0.85rem' }}>검색 결과가 없습니다.</div>
                        )}
                        {results !== null && !searching && results.length > 0 && (
                            <>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{results.length}개 페이지{results.length === 100 ? ' (상위 100개)' : ''}</div>
                                {results.map((r, i) => (
                                    <div
                                        key={`${r.manual.id}_${r.page}_${i}`}
                                        onClick={() => setViewing({ manual: r.manual, page: r.page })}
                                        style={{ padding: '10px 12px', marginBottom: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: 'white', background: r.manual.color, padding: '1px 8px', borderRadius: '8px' }}>{r.manual.short}</span>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-main)' }}>{r.page}쪽</span>
                                            {r.count > 1 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({r.count}회)</span>}
                                            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '700' }}>보기 ›</span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.55, wordBreak: 'break-all' }}>
                                            <Snippet text={r.snippet} terms={terms} />
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
