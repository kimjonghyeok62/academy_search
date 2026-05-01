import { useState, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const _raw = import.meta.env.VITE_CLAUDE_API_KEY || '';
const ENV_API_KEY = _raw.startsWith('sk-ant') ? _raw : '';

const PROMPT = [
  '이 사진에서 학원, 교습소, 개인과외교습소의 공식 상호명을 찾아주세요.',
  '규칙:',
  '- 간판이나 현수막에 적힌 공식 명칭만 추출',
  "- '학원', '교습소' 등 기관 종류명 포함",
  '- 이름만 한 줄로 답변 (예: 하남수학학원)',
  '- 파일명으로 쓸 수 없는 특수문자(/ \\ : * ? " < > |)는 제외',
  "- 확인 불가능하면 '알수없음' 으로만 답변",
].join('\n');

const DOC_W = 630;
const DOC_H = 472;
const MAX_BYTES = 400 * 1024;

// ── 이미지 유틸 ────────────────────────────────────────────────────────────
async function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

async function compressToJpeg(blob, maxBytes = MAX_BYTES) {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  let { width: w, height: h } = img;
  const maxSide = 1200;
  if (w > maxSide || h > maxSide) {
    const r = Math.min(maxSide / w, maxSide / h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  for (let q = 0.85; q >= 0.3; q -= 0.1) {
    const result = await canvasToBlob(canvas, 'image/jpeg', q);
    if (result.size <= maxBytes) return result;
  }
  return canvasToBlob(canvas, 'image/jpeg', 0.3);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function rotateBlob(blob, angle) {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  const rad = (angle * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  canvas.width = Math.round(img.width * cos + img.height * sin);
  canvas.height = Math.round(img.width * sin + img.height * cos);
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvasToBlob(canvas, 'image/jpeg', 0.92);
}

async function cropBlob(blob, x, y, w, h) {
  const img = await createImageBitmap(blob, x, y, w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvasToBlob(canvas, 'image/jpeg', 0.92);
}

async function resizeBlob(blob, maxW = DOC_W, maxH = DOC_H) {
  const img = await createImageBitmap(blob);
  const r = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = Math.round(img.width * r);
  const h = Math.round(img.height * r);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvasToBlob(canvas, 'image/jpeg', 0.92);
}

// ── 자르기 다이얼로그 ──────────────────────────────────────────────────────
function CropDialog({ blob, onApply, onCancel }) {
  const canvasRef = useRef(null);
  const [imgBitmap, setImgBitmap] = useState(null);
  const [scale, setScale] = useState(1);
  const [aspect, setAspect] = useState(null);
  const [infoText, setInfoText] = useState('영역을 드래그하여 선택하세요');
  const stateRef = useRef({
    mode: 'draw', rx0: null, ry0: null, rx1: null, ry1: null,
    sx: 0, sy: 0, dragOx: 0, dragOy: 0, rectId: null,
    edgeDragStart: null,
  });

  const ASPECTS = { '자유': null, '1:1': [1,1], '4:3': [4,3], '3:4': [3,4], '16:9': [16,9], '9:16': [9,16] };
  const [selAspect, setSelAspect] = useState('자유');

  useEffect(() => {
    (async () => {
      const bm = await createImageBitmap(blob);
      setImgBitmap(bm);
    })();
  }, [blob]);

  useEffect(() => {
    if (!imgBitmap || !canvasRef.current) return;
    const maxW = 720, maxH = 520;
    const s = Math.min(maxW / imgBitmap.width, maxH / imgBitmap.height, 1);
    setScale(s);
    const canvas = canvasRef.current;
    canvas.width = Math.round(imgBitmap.width * s);
    canvas.height = Math.round(imgBitmap.height * s);
    canvas.getContext('2d').drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
  }, [imgBitmap]);

  const HANDLE_SIZE = 10;

  const getHandles = (rx0, ry0, rx1, ry1) => ({
    top:    { x: (rx0 + rx1) / 2, y: ry0 },
    right:  { x: rx1,             y: (ry0 + ry1) / 2 },
    bottom: { x: (rx0 + rx1) / 2, y: ry1 },
    left:   { x: rx0,             y: (ry0 + ry1) / 2 },
  });

  const hitHandle = (x, y, rx0, ry0, rx1, ry1) => {
    const h = HANDLE_SIZE / 2 + 4;
    const handles = getHandles(rx0, ry0, rx1, ry1);
    for (const [edge, pt] of Object.entries(handles)) {
      if (Math.abs(x - pt.x) <= h && Math.abs(y - pt.y) <= h) return edge;
    }
    return null;
  };

  const drawRect = useCallback((x0, y0, x1, y1) => {
    if (!canvasRef.current || !imgBitmap) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const s = scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
    const rx0 = Math.min(x0, x1), ry0 = Math.min(y0, y1);
    const rx1 = Math.max(x0, x1), ry1 = Math.max(y0, y1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvas.width, ry0);
    ctx.fillRect(0, ry1, canvas.width, canvas.height - ry1);
    ctx.fillRect(0, ry0, rx0, ry1 - ry0);
    ctx.fillRect(rx1, ry0, canvas.width - rx1, ry1 - ry0);
    // border: bright white solid line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
    // thin shadow line for contrast on bright images
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(rx0 + 1, ry0 + 1, rx1 - rx0 - 2, ry1 - ry0 - 2);
    ctx.setLineDash([]);
    // edge midpoint handles
    const handles = getHandles(rx0, ry0, rx1, ry1);
    const hs = HANDLE_SIZE;
    for (const pt of Object.values(handles)) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pt.x - hs / 2, pt.y - hs / 2, hs, hs);
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.strokeRect(pt.x - hs / 2, pt.y - hs / 2, hs, hs);
    }
    stateRef.current.rx0 = rx0; stateRef.current.ry0 = ry0;
    stateRef.current.rx1 = rx1; stateRef.current.ry1 = ry1;
    const pw = Math.round((rx1 - rx0) / s);
    const ph = Math.round((ry1 - ry0) / s);
    setInfoText(`선택 영역: ${pw} × ${ph} px (원본 기준)`);
  }, [imgBitmap, scale]);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const constrain = useCallback((x0, y0, x1, y1) => {
    const asp = aspect;
    if (!asp || !canvasRef.current) return [x0, y0, x1, y1];
    const [aw, ah] = asp;
    const w = Math.abs(x1 - x0);
    const h = Math.round(w * ah / aw);
    const cw = canvasRef.current.width, ch = canvasRef.current.height;
    return [x0, y0, clamp(x0 + (x1 >= x0 ? w : -w), 0, cw), clamp(y0 + h, 0, ch)];
  }, [aspect]);

  const insideRect = (x, y) => {
    const { rx0, ry0, rx1, ry1 } = stateRef.current;
    if (rx0 === null) return false;
    return rx0 + 14 < x && x < rx1 - 14 && ry0 + 14 < y && y < ry1 - 14;
  };

  const getCursor = (x, y) => {
    const { rx0, ry0, rx1, ry1 } = stateRef.current;
    if (rx0 === null) return 'crosshair';
    const edge = hitHandle(x, y, rx0, ry0, rx1, ry1);
    if (edge === 'top' || edge === 'bottom') return 'ns-resize';
    if (edge === 'left' || edge === 'right') return 'ew-resize';
    if (insideRect(x, y)) return 'move';
    return 'crosshair';
  };

  const onMouseDown = (e) => {
    const { offsetX: x, offsetY: y } = e.nativeEvent;
    const st = stateRef.current;
    if (st.rx0 !== null) {
      const edge = hitHandle(x, y, st.rx0, st.ry0, st.rx1, st.ry1);
      if (edge) {
        st.mode = 'edge-' + edge;
        st.edgeDragStart = { x, y, rx0: st.rx0, ry0: st.ry0, rx1: st.rx1, ry1: st.ry1 };
        return;
      }
    }
    if (insideRect(x, y)) {
      st.mode = 'move';
      st.dragOx = x - st.rx0;
      st.dragOy = y - st.ry0;
    } else {
      st.mode = 'draw';
      st.sx = x; st.sy = y;
    }
  };

  const onMouseMove = (e) => {
    const canvas = canvasRef.current;
    const { offsetX: x, offsetY: y } = e.nativeEvent;
    const st = stateRef.current;
    // cursor update when not dragging
    if (!e.buttons) {
      if (canvas) canvas.style.cursor = getCursor(x, y);
      return;
    }
    if (st.mode === 'move' && st.rx0 !== null) {
      const rw = st.rx1 - st.rx0, rh = st.ry1 - st.ry0;
      const nx0 = clamp(x - st.dragOx, 0, canvas.width - rw);
      const ny0 = clamp(y - st.dragOy, 0, canvas.height - rh);
      drawRect(nx0, ny0, nx0 + rw, ny0 + rh);
    } else if (st.mode.startsWith('edge-') && st.edgeDragStart) {
      const d = st.edgeDragStart;
      let { rx0, ry0, rx1, ry1 } = d;
      const edge = st.mode.slice(5);
      if (edge === 'top')    ry0 = clamp(y, 0, ry1 - 10);
      if (edge === 'bottom') ry1 = clamp(y, ry0 + 10, canvas.height);
      if (edge === 'left')   rx0 = clamp(x, 0, rx1 - 10);
      if (edge === 'right')  rx1 = clamp(x, rx0 + 10, canvas.width);
      drawRect(rx0, ry0, rx1, ry1);
    } else {
      const [cx0, cy0, cx1, cy1] = constrain(
        st.sx, st.sy, clamp(x, 0, canvas.width), clamp(y, 0, canvas.height)
      );
      drawRect(cx0, cy0, cx1, cy1);
    }
  };

  const handleApply = async () => {
    const { rx0, ry0, rx1, ry1 } = stateRef.current;
    if (rx0 === null) return;
    const ox0 = Math.round(rx0 / scale), oy0 = Math.round(ry0 / scale);
    const ox1 = Math.round(rx1 / scale), oy1 = Math.round(ry1 / scale);
    if (ox1 - ox0 < 10 || oy1 - oy0 < 10) return;
    const cropped = await cropBlob(blob, ox0, oy0, ox1 - ox0, oy1 - oy0);
    onApply(cropped);
  };

  const handleAspectChange = (label) => {
    setSelAspect(label);
    setAspect(ASPECTS[label]);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-main)', borderRadius: '16px', padding: '20px',
        maxWidth: '800px', width: '95%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '10px' }}>
          드래그로 영역 선택 / 선택 후 사각형 안쪽을 드래그하면 이동
        </p>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
          {Object.keys(ASPECTS).map(label => (
            <button key={label} onClick={() => handleAspectChange(label)} style={{
              padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
              background: selAspect === label ? 'var(--primary)' : 'var(--bg-card)',
              color: selAspect === label ? 'white' : 'var(--text-muted)', fontWeight: '600'
            }}>{label}</button>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', margin: '0 auto', cursor: 'crosshair', maxWidth: '100%' }}
          onMouseLeave={() => { if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair'; }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
        />
        <p style={{ textAlign: 'center', color: 'var(--primary)', fontSize: '0.85rem', margin: '8px 0' }}>
          {infoText}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '8px' }}>
          <button onClick={handleApply} style={{
            padding: '10px 24px', background: '#43d9a0', color: '#0d1a12',
            border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '1rem'
          }}>✂️ 자르기 적용</button>
          <button onClick={onCancel} style={{
            padding: '10px 24px', background: 'var(--bg-card)', color: 'var(--text-main)',
            border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '1rem'
          }}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function PhotoRenamePage({ onBack, embedded = false }) {
  const [images, setImages] = useState([]);     // { file, blob, name, status, objectUrl }
  const [currentIdx, setCurrentIdx] = useState(0);
  const [nameInput, setNameInput] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [aiStatusColor, setAiStatusColor] = useState('var(--text-muted)');
  const [resizeEnabled, setResizeEnabled] = useState(true);
  const [showCrop, setShowCrop] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [started, setStarted] = useState(false);

  const folderInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const processedRef = useRef([]); // { name, blob, ext }

  const cur = images[currentIdx] || null;

  // 폴더 선택
  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files).filter(f =>
      /\.(jpe?g|png|bmp|webp)$/i.test(f.name)
    );
    if (!files.length) return;
    const newImages = files.map(f => ({
      file: f,
      blob: f,          // 초기에는 File 자체가 Blob
      name: '',
      status: 'pending',
      objectUrl: URL.createObjectURL(f),
    }));
    setImages(newImages);
    setCurrentIdx(0);
    setStarted(false);
    setNameInput('');
    setAiStatus('');
    processedRef.current = [];
  };

  // 시작 버튼
  const handleStart = () => {
    setStarted(true);
    analyzeImage(0, images);
  };

  // AI 분석
  const analyzeImage = useCallback(async (idx, imgs) => {
    const img = imgs[idx];
    if (!img) return;
    setCurrentIdx(idx);
    setNameInput('');
    setAiStatus('🤖 AI 분석 중...');
    setAiStatusColor('#f5aa50');
    setAnalyzing(true);

    try {
      if (!ENV_API_KEY) {
        setAiStatus('⚠️ VITE_CLAUDE_API_KEY 환경변수가 설정되지 않았습니다.');
        setAiStatusColor('#f56565');
        setAnalyzing(false);
        return;
      }
      const compressed = await compressToJpeg(img.blob);
      const b64 = await blobToBase64(compressed);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ENV_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 80,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: PROMPT },
          ]}],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error?.message || `API 오류 (${res.status})`);
      }
      const data = await res.json();
      const raw = data.content[0]?.text?.trim() || '';
      const recognized = raw.replace(/[\\/:*?"<>|]/g, '');
      const name = recognized === '알수없음' ? '' : recognized;
      if (name) {
        setNameInput(name);
        setAiStatus('✅ 인식 완료 — 수정 후 [저장] 버튼을 누르세요.');
        setAiStatusColor('#43d9a0');
      } else {
        setAiStatus('⚠️ 학원명을 인식하지 못했습니다. 직접 입력하세요.');
        setAiStatusColor('#f56565');
      }
    } catch (err) {
      setAiStatus(`❌ 오류: ${err.message}`);
      setAiStatusColor('#f56565');
    }
    setAnalyzing(false);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, []);

  // 저장
  const handleSave = async () => {
    const name = nameInput.trim();
    if (!name) return;
    let blob = cur.blob;
    if (resizeEnabled) blob = await resizeBlob(blob);
    const ext = cur.file.name.match(/\.[^.]+$/)?.[0] || '.jpg';
    processedRef.current.push({ name, blob, ext });

    const updated = images.map((img, i) =>
      i === currentIdx ? { ...img, name, status: 'done' } : img
    );
    setImages(updated);
    goNext(currentIdx, updated);
  };

  // 건너뜀
  const handleSkip = () => {
    const updated = images.map((img, i) =>
      i === currentIdx ? { ...img, status: 'skipped' } : img
    );
    setImages(updated);
    goNext(currentIdx, updated);
  };

  const goNext = (idx, imgs) => {
    const next = idx + 1;
    if (next >= imgs.length) {
      setCurrentIdx(imgs.length);
      setAiStatus('🎉 모든 사진 처리 완료!');
      setAiStatusColor('#43d9a0');
      return;
    }
    analyzeImage(next, imgs);
  };

  // 이전으로
  const handleBack = () => {
    if (currentIdx <= 0) return;
    const prev = currentIdx - 1;
    analyzeImage(prev, images);
  };

  // 회전
  const handleRotate = async (angle) => {
    if (!cur) return;
    const rotated = await rotateBlob(cur.blob, angle);
    const newUrl = URL.createObjectURL(rotated);
    URL.revokeObjectURL(cur.objectUrl);
    setImages(prev => prev.map((img, i) =>
      i === currentIdx ? { ...img, blob: rotated, objectUrl: newUrl } : img
    ));
  };

  // 자르기 완료
  const handleCropApply = (cropped) => {
    const newUrl = URL.createObjectURL(cropped);
    URL.revokeObjectURL(cur.objectUrl);
    setImages(prev => prev.map((img, i) =>
      i === currentIdx ? { ...img, blob: cropped, objectUrl: newUrl } : img
    ));
    setShowCrop(false);
  };

  // ZIP 다운로드
  const handleZipDownload = async () => {
    if (!processedRef.current.length) return;
    const zip = new JSZip();
    const nameCounts = {};
    for (const { name, blob, ext } of processedRef.current) {
      const count = nameCounts[name] = (nameCounts[name] || 0) + 1;
      const filename = count === 1 ? `${name}${ext}` : `${name}_${count - 1}${ext}`;
      zip.file(filename, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, '학원사진명명결과.zip');
  };

  const done = currentIdx >= images.length && images.length > 0;
  const savedCount = processedRef.current.length;
  const skippedCount = images.filter(i => i.status === 'skipped').length;

  // ── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div style={embedded ? {} : { minHeight: '100vh', background: 'var(--bg-main)', padding: '0 0 40px' }}>
      {/* 헤더 (standalone 모드에서만) */}
      {!embedded && (
        <div style={{
          background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)',
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px'
        }}>
          <button onClick={onBack} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--primary)', fontSize: '1.1rem', fontWeight: '700', padding: '4px 8px'
          }}>← 뒤로</button>
          <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>
            📷 학원 사진 자동 명명
          </span>
        </div>
      )}

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: embedded ? '12px 0' : '20px' }}>
        {/* 폴더 선택 영역 */}
        {!started && (
          <div style={{
            background: 'var(--bg-card)', border: '2px dashed var(--border-color)',
            borderRadius: '16px', padding: '40px', textAlign: 'center', marginBottom: '20px'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📁</div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '0.95rem' }}>
              학원 사진이 들어있는 폴더를 선택하세요
            </p>
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFolderSelect}
            />
            <button
              onClick={() => folderInputRef.current?.click()}
              style={{
                padding: '12px 28px', background: 'var(--primary)', color: 'white',
                border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '1rem'
              }}
            >📁 폴더 선택</button>
            {images.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ color: 'var(--text-main)', fontWeight: '600', marginBottom: '12px' }}>
                  {images.length}장 로드됨
                </p>
                <button onClick={handleStart} style={{
                  padding: '12px 32px', background: '#43d9a0', color: '#0d1a12',
                  border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '1rem'
                }}>▶ 분석 시작</button>
              </div>
            )}
          </div>
        )}

        {/* 진행 중 UI */}
        {started && images.length > 0 && (
          <>
            {/* 진행 바 */}
            <div style={{
              background: 'var(--bg-card)', borderRadius: '12px', padding: '12px 16px',
              marginBottom: '16px', border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>진행 현황</span>
                <span style={{ color: 'var(--primary)', fontWeight: '700' }}>
                  {Math.min(currentIdx, images.length)} / {images.length}
                </span>
              </div>
              <div style={{ background: 'var(--bg-main)', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: 'var(--primary)', borderRadius: '999px',
                  width: `${(Math.min(currentIdx, images.length) / images.length) * 100}%`,
                  transition: 'width 0.3s'
                }} />
              </div>
            </div>

            {/* 메인 영역 */}
            {!done ? (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {/* 미리보기 */}
                <div style={{
                  flex: '1 1 400px', background: 'var(--bg-card)',
                  borderRadius: '16px', border: '1px solid var(--border-color)',
                  overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '12px', minHeight: '320px', justifyContent: 'center'
                }}>
                  {cur?.objectUrl ? (
                    <>
                      <img
                        src={cur.objectUrl}
                        alt="preview"
                        style={{ maxWidth: '100%', maxHeight: '360px', borderRadius: '8px', objectFit: 'contain' }}
                      />
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '8px', textAlign: 'center' }}>
                        {cur.file.name}
                      </p>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>사진 없음</span>
                  )}
                </div>

                {/* 제어 패널 */}
                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* AI 결과 */}
                  <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '14px', border: '1px solid var(--border-color)' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '6px' }}>AI 인식 결과 (수정 가능)</p>
                    <input
                      ref={nameInputRef}
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !analyzing && handleSave()}
                      placeholder="학원명 입력..."
                      style={{
                        width: '100%', padding: '10px 12px', fontSize: '1.1rem', fontWeight: '700',
                        background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                        borderRadius: '8px', color: 'var(--text-main)', outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ color: aiStatusColor, fontSize: '0.82rem', marginTop: '6px' }}>{aiStatus}</p>
                  </div>

                  {/* 이미지 편집 */}
                  <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '14px', border: '1px solid var(--border-color)' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px' }}>이미지 편집</p>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                      <button onClick={() => handleRotate(-90)} disabled={analyzing} style={btnStyle('var(--bg-main)')}>↺ 좌회전</button>
                      <button onClick={() => handleRotate(90)} disabled={analyzing} style={btnStyle('var(--bg-main)')}>↻ 우회전</button>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setShowCrop(true)} disabled={analyzing} style={btnStyle('var(--bg-main)')}>✂️ 자르기</button>
                      <button onClick={handleBack} disabled={analyzing || currentIdx <= 0} style={btnStyle('var(--bg-main)')}>⬅ 이전</button>
                    </div>
                  </div>

                  {/* 리사이즈 옵션 */}
                  <label style={{
                    background: 'var(--bg-card)', borderRadius: '12px', padding: '12px 14px',
                    border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center',
                    gap: '10px', cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={resizeEnabled}
                      onChange={e => setResizeEnabled(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: '500' }}>
                      리사이징 (630×472px, 200 DPI)
                    </span>
                  </label>

                  {/* 저장/건너뜀 */}
                  <button
                    onClick={handleSave}
                    disabled={analyzing || !nameInput.trim()}
                    style={{
                      padding: '14px', background: '#43d9a0', color: '#0d1a12',
                      border: 'none', borderRadius: '12px', fontWeight: '700',
                      cursor: analyzing || !nameInput.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '1rem', opacity: analyzing || !nameInput.trim() ? 0.5 : 1
                    }}
                  >✅ 저장 (새 파일명으로 추가)</button>
                  <button
                    onClick={handleSkip}
                    disabled={analyzing}
                    style={{
                      padding: '12px', background: 'var(--bg-card)', color: 'var(--text-main)',
                      border: '1px solid var(--border-color)', borderRadius: '12px',
                      fontWeight: '600', cursor: analyzing ? 'not-allowed' : 'pointer', fontSize: '0.95rem'
                    }}
                  >⏭ 건너뜀</button>
                </div>
              </div>
            ) : (
              /* 완료 화면 */
              <div style={{
                background: 'var(--bg-card)', borderRadius: '16px', padding: '40px',
                textAlign: 'center', border: '1px solid var(--border-color)'
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎉</div>
                <p style={{ color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: '700', marginBottom: '8px' }}>
                  모든 사진 처리 완료!
                </p>
                <p style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>✅ 저장됨: {savedCount}건</p>
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>⏭ 건너뜀: {skippedCount}건</p>
                {savedCount > 0 && (
                  <button onClick={handleZipDownload} style={{
                    padding: '14px 32px', background: 'var(--primary)', color: 'white',
                    border: 'none', borderRadius: '12px', fontWeight: '700',
                    cursor: 'pointer', fontSize: '1rem'
                  }}>📦 ZIP 다운로드</button>
                )}
              </div>
            )}

            {/* 하단 ZIP 버튼 (진행 중에도 표시) */}
            {!done && savedCount > 0 && (
              <div style={{ marginTop: '16px', textAlign: 'right' }}>
                <button onClick={handleZipDownload} style={{
                  padding: '10px 20px', background: 'var(--bg-card)', color: 'var(--primary)',
                  border: '1px solid var(--primary)', borderRadius: '10px',
                  fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem'
                }}>📦 지금까지 저장된 {savedCount}장 ZIP 다운로드</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 자르기 다이얼로그 */}
      {showCrop && cur && (
        <CropDialog
          blob={cur.blob}
          onApply={handleCropApply}
          onCancel={() => setShowCrop(false)}
        />
      )}
    </div>
  );
}

function btnStyle(bg) {
  return {
    flex: 1, padding: '9px', background: bg, color: 'var(--text-main)',
    border: '1px solid var(--border-color)', borderRadius: '8px',
    fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem'
  };
}
