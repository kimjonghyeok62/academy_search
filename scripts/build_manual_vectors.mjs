// 학원업무 편람 '비슷한 내용' 찾기 자료 — 쪽별 본문을 조각으로 나눠 구글 임베딩(의미 → 숫자)으로 바꿔 둔다
//
//   node scripts/build_manual_vectors.mjs            (세 편람 모두)
//   node scripts/build_manual_vectors.mjs seoul      (하나만)
//   node scripts/build_manual_vectors.mjs --dry      (키 없이 조각만 나눠 보기)
//
// - 키: 환경변수 GEMINI_API_KEY, 없으면 이 폴더나 위쪽 폴더의 .env 에서 찾는다
// - 결과: public/manual/<편람>-vec.json (조각 위치) + <편람>-vec.bin (조각마다 숫자 768개, 1바이트씩)
// - 한 번 바꾼 조각은 scripts/.vec-cache 에 남겨 둔다 — 중간에 끊겨도, 본문을 고쳐 다시 돌려도
//   바뀐 조각만 새로 보낸다 (무료 한도에 걸려 기다리게 되면 그대로 두면 이어서 한다)
// - 검색할 때 질문을 바꾸는 쪽은 api/manual-similar.js — 모델·크기를 바꾸면 거기도 같이 바꿀 것
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MODEL = 'gemini-embedding-001';
const DIM = 768;
const CHUNK = 450;   // 조각 길이(글자)
const OVERLAP = 120; // 앞 조각과 겹치는 길이 — 문장이 조각 경계에서 잘려도 어느 한쪽에는 온전히 들어간다
const BATCH = 50;

const MANUALS = {
  gyeonggi: { toc: 'src/data/gyeonggiManual.json', text: 'public/manual/gyeonggi-2024-text.json', out: 'public/manual/gyeonggi-2024' },
  seoul: { toc: 'src/data/seoulManual.json', text: 'public/manual/seoul-2025-text.json', out: 'public/manual/seoul-2025' },
  chungnam: { toc: 'src/data/chungnamManual.json', text: 'public/manual/chungnam-2024-text.json', out: 'public/manual/chungnam-2024' },
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'scripts', '.vec-cache');

function findKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // 워크트리에서 돌리면 .env 가 위쪽(원래 폴더)에 있다
  for (let d = ROOT; ; d = path.dirname(d)) {
    const f = path.join(d, '.env');
    if (fs.existsSync(f)) {
      const m = fs.readFileSync(f, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
      if (m) return m[1].trim();
    }
    if (path.dirname(d) === d) return null;
  }
}

// 목차 → 쪽마다 그 쪽이 속한 제목 줄기 ('학원 설립 › 건축물 용도') — 조각 앞에 붙여 뜻을 분명히 한다
function crumbsByPage(toc, pages) {
  const flat = [];
  const walk = (nodes, trail) => nodes.forEach(n => {
    const t = [...trail, n.title];
    flat.push({ page: n.page, y: n.y || 0, trail: t });
    if (n.children) walk(n.children, t);
  });
  walk(toc, []);
  flat.sort((a, b) => a.page - b.page || a.y - b.y);
  const out = [];
  let i = 0;
  let cur = [];
  for (let p = 1; p <= pages; p++) {
    while (i < flat.length && flat[i].page <= p) cur = flat[i++].trail;
    out.push(cur.slice(-3).join(' › '));
  }
  return out;
}

// 쪽 본문 → 조각 [{p, s, e}] (s·e: 그 쪽 글자 위치). 짧은 쪽은 한 조각
function chunksOf(texts) {
  const out = [];
  texts.forEach((t, i) => {
    const len = (t || '').length;
    if (len < 20) return; // 빈 쪽·표지
    // 목차·장 첫머리 차례 쪽('교습비 등 조정·····131') — 제목만 모여 있어 어떤 질문에든 비슷하게 걸린다
    if ((t.match(/[·･.…]{6,}/g) || []).length >= 3) return;
    let s = 0;
    for (;;) {
      let e = Math.min(len, s + CHUNK);
      // 낱말 중간에서 끊지 않는다
      if (e < len) { const sp = t.lastIndexOf(' ', e); if (sp > s + CHUNK / 2) e = sp; }
      out.push({ p: i + 1, s, e });
      if (e >= len) break;
      // 다음 조각은 이번 끝에서 OVERLAP 만큼 앞, 낱말 첫머리에서 시작
      const sp = t.indexOf(' ', e - OVERLAP);
      s = sp > 0 && sp < e ? sp + 1 : e - OVERLAP;
    }
  });
  return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function embedBatch(key, inputs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
  const body = {
    requests: inputs.map(text => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: DIM,
    })),
  };
  for (let tries = 0; ; tries++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    if (r.ok) return (await r.json()).embeddings.map(x => x.values);
    const msg = await r.text();
    // 무료 등급은 하루 1,000조각까지 — 기다려도 오늘은 안 풀린다. 받은 것은 저장돼 있으니 내일 다시 돌리면 이어서 한다
    if (r.status === 429 && msg.includes('PerDay')) {
      throw new Error('오늘 무료 한도(하루 1,000조각)를 다 썼습니다 — 내일 다시 돌리면 이어서 합니다 (또는 구글 AI Studio 에서 결제를 연결)');
    }
    if (r.status === 402) {
      throw new Error('결제 계정의 선불 잔액이 없습니다 — AI Studio(https://ai.studio/projects)에서 충전한 뒤 다시 돌리면 이어서 합니다');
    }
    if ((r.status === 429 || r.status >= 500) && tries < 30) {
      const wait = r.status === 429 ? 60_000 : 5_000;
      console.log(`  ${r.status} — ${wait / 1000}초 쉬고 다시 (${tries + 1})`);
      await sleep(wait);
      continue;
    }
    throw new Error(`임베딩 실패 ${r.status}: ${msg.slice(0, 300)}`);
  }
}

// 768개 숫자 → 길이 1로 맞춘 뒤 1바이트(-127~127)씩. 순위만 보면 되므로 이 정도면 충분하다
function quantize(v) {
  const n = Math.hypot(...v) || 1;
  return Int8Array.from(v, x => Math.round((x / n) * 127));
}

async function build(name, key) {
  const cfg = MANUALS[name];
  const toc = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.toc), 'utf8'));
  const texts = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.text), 'utf8'));
  const crumbs = crumbsByPage(toc.toc, texts.length);
  const chunks = chunksOf(texts);
  const inputs = chunks.map(c => {
    const body = texts[c.p - 1].slice(c.s, c.e);
    return crumbs[c.p - 1] ? `${crumbs[c.p - 1]}\n${body}` : body;
  });
  const hash = (s) => crypto.createHash('sha1').update(`${MODEL}:${DIM}:${s}`).digest('hex').slice(0, 16);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${name}.jsonl`);
  const cache = new Map();
  if (fs.existsSync(cacheFile)) {
    for (const line of fs.readFileSync(cacheFile, 'utf8').split('\n')) {
      if (!line) continue;
      const { h, v } = JSON.parse(line);
      cache.set(h, v);
    }
  }
  const todo = [...new Set(inputs.map(hash))].filter(h => !cache.has(h));
  const byHash = new Map(inputs.map(t => [hash(t), t]));
  console.log(`${name}: 조각 ${chunks.length}개 (새로 보낼 것 ${todo.length}개)`);
  if (DRY) {
    const total = inputs.reduce((a, t) => a + t.length, 0);
    console.log(`  글자 ${total.toLocaleString()}자 — 예시:\n  ${inputs[Math.floor(inputs.length / 3)].replace(/\n/g, '\n  ')}`);
    return;
  }

  for (let i = 0; i < todo.length; i += BATCH) {
    const hs = todo.slice(i, i + BATCH);
    const vs = await embedBatch(key, hs.map(h => byHash.get(h)));
    const lines = hs.map((h, j) => { const v = Array.from(quantize(vs[j])); cache.set(h, v); return JSON.stringify({ h, v }); });
    fs.appendFileSync(cacheFile, lines.join('\n') + '\n');
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }

  const bin = new Int8Array(chunks.length * DIM);
  inputs.forEach((t, i) => bin.set(cache.get(hash(t)), i * DIM));
  fs.writeFileSync(path.join(ROOT, `${cfg.out}-vec.bin`), Buffer.from(bin.buffer));
  fs.writeFileSync(path.join(ROOT, `${cfg.out}-vec.json`), JSON.stringify({
    model: MODEL, dim: DIM, chunks: chunks.map(c => [c.p, c.s, c.e]),
  }));
  console.log(`  → ${cfg.out}-vec.json / -vec.bin (${(bin.length / 1024 / 1024).toFixed(1)}MB)`);
}

const DRY = process.argv.includes('--dry');
const key = DRY ? null : findKey();
if (!DRY && !key) {
  console.error('GEMINI_API_KEY 가 없습니다 — .env 에 GEMINI_API_KEY=... 를 넣거나 환경변수로 주세요');
  process.exit(1);
}
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const names = args.length ? args : Object.keys(MANUALS);
for (const n of names) {
  if (!MANUALS[n]) { console.error(`모르는 편람: ${n} (${Object.keys(MANUALS).join(', ')})`); process.exit(1); }
  await build(n, key);
}
