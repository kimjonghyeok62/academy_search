// 네이버에 '적혀 있는 교습비' 를 읽어온다 — 대조창이 신고액과 나란히 놓을 숫자.
//
// 자동 조사(api/sns-probe.js)는 교습비를 올렸는지만 O/X 로 본다. 정작 담당자가 알아야 하는
// '올린 금액이 신고액과 같은가' 는 지금까지 사람이 네이버 창을 띄워 눈으로 맞춰야 했다.
// 이 엔드포인트는 그 첫 번째 읽기를 대신한다 — 판정하지 않고, 적힌 값을 적힌 자리와 함께
// 돌려준다. 대조는 화면(교습비 대조창)에서, 최종 판단은 사람이 한다.
//
// 왜 조사 때 미리 안 읽고 창을 열 때 읽는가: 금액은 학원 1천여 곳 중 담당자가 실제로 펼쳐
// 보는 몇 곳에서만 필요하다. 미리 다 읽으면 그만큼의 요청·비용이 통째로 낭비되고,
// 시트에도 열을 늘려야 한다(Apps Script 까지). 열 때 읽으면 둘 다 없다.
//
// 세 갈래로 읽는다.
//   1) 플레이스 가격메뉴  — 네이버가 글자로 준다. 그대로 옮긴다 (AI 없음).
//   2) 플레이스 가격표 이미지 — 사람이 사진으로 올린 표. Claude 가 읽는다.
//   3) 블로그 교습비 글   — 본문 글자에서 '…원' 을 찾는다. 금액이 사진으로만 있으면
//                          찾지 못하는데, '글로는 안 적혀 있다' 는 사실 자체가 정보다.
import Anthropic from '@anthropic-ai/sdk';
import { probePlace, readBlogFeeText, isBlocked } from './_lib/naverProbe.js';

const MODEL = 'claude-opus-5';
const MAX_IMAGES = 3;             // 가격표를 네 장 이상 올린 곳은 드물다
const MAX_IMAGE_BYTES = 4_000_000;
const IMAGE_TIMEOUT_MS = 8000;

const ROW = {
    type: 'object',
    properties: {
        label: { type: 'string' },      // 과목·단계 (표의 행 이름)
        condition: { type: 'string' },  // 주2회 60분 같은 조건 (표의 열 제목)
        amount: { type: 'integer' },    // 숫자만
        period: { type: 'string' },     // 월 / 주 / 회 / 기간 / 모름
    },
    required: ['label', 'condition', 'amount', 'period'],
    additionalProperties: false,
};

const SCHEMA = {
    type: 'object',
    properties: {
        image_rows: { type: 'array', items: ROW },
        blog_rows: { type: 'array', items: ROW },
        notes: { type: 'array', items: { type: 'string' } },
        readable: { type: 'boolean' },
    },
    required: ['image_rows', 'blog_rows', 'notes', 'readable'],
    additionalProperties: false,
};

const PROMPT = [
    '학원 지도점검 담당자가 신고된 교습비와 대조할 수 있도록, 아래 자료에 적혀 있는 금액을 그대로 옮겨 적으세요.',
    '',
    '규칙:',
    '- 보이는 표를 행·열 그대로 읽습니다. 행 이름은 label, 열 제목(주2회 60분 등)은 condition 에 넣습니다.',
    '- 열이 하나뿐이면 condition 은 빈 문자열로 둡니다.',
    '- 없는 값을 만들지 마세요. 흐릿해서 못 읽은 칸은 아예 빼고, 자료를 거의 못 읽었으면 readable 을 false 로 하세요.',
    '- amount 는 숫자만 씁니다 (140,000원 → 140000).',
    '- period 는 그 금액의 기준입니다. 월/주/회/기간 중 자료에 적힌 것을 쓰고, 안 적혀 있으면 "모름" 이라고 쓰세요.',
    '- 교재비 포함, 형제 할인, 적용 시작월 같은 단서는 notes 에 한 줄씩 옮깁니다.',
    '- 이미지에서 읽은 것은 image_rows, 블로그 글에서 읽은 것은 blog_rows 에 넣습니다. 없으면 빈 배열.',
    '- 교습비가 아닌 금액(교재비·재료비·현금영수증 안내 등)은 넣지 말고 notes 로만 남기세요.',
].join('\n');

/** 가격표 이미지를 받아 base64 로. 네이버 CDN 은 UA 없는 요청을 가끔 거른다. */
async function fetchImage(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.place.naver.com/' },
        });
        if (!res.ok) return null;
        const type = (res.headers.get('content-type') || '').split(';')[0].trim();
        if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
        return { media_type: type, data: buf.toString('base64') };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** Claude 에게 가격표를 읽힌다. 실패는 던지지 않는다 — 읽은 만큼은 보여줘야 한다. */
async function readWithClaude({ images, blogText, academyName }) {
    if (!process.env.ANTHROPIC_API_KEY) {
        return { error: '아직 켜지지 않았습니다 — Vercel 환경변수에 ANTHROPIC_API_KEY 를 넣어야 이미지를 읽습니다' };
    }
    const content = [];
    for (const img of images) {
        content.push({ type: 'image', source: { type: 'base64', ...img } });
    }
    const bits = [PROMPT];
    if (academyName) bits.push(`\n학원명: ${academyName}`);
    if (images.length) bits.push(`\n위 이미지 ${images.length}장은 이 학원이 네이버플레이스에 올린 가격표입니다.`);
    if (blogText) bits.push(`\n아래는 이 학원의 블로그 교습비 글 본문입니다.\n---\n${blogText}\n---`);
    content.push({ type: 'text', text: bits.join('\n') });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const ask = async (structured) => {
        const resp = await client.messages.create({
            model: MODEL,
            max_tokens: 4000,
            // 표를 옮겨 적는 일이라 깊이 생각할 것이 없다 — 낮은 노력으로 빠르고 싸게.
            ...(structured
                ? { output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } } }
                : { output_config: { effort: 'low' } }),
            messages: [{
                role: 'user',
                content: structured ? content
                    : [...content, {
                        type: 'text',
                        text: `답은 이 형태의 JSON 하나로만 쓰세요(설명 금지): ${JSON.stringify(SHAPE)}`,
                    }],
            }],
        });
        if (resp.stop_reason === 'refusal') throw new Error('모델이 응답을 거부했습니다');
        const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        return JSON.parse(structured ? text : text.replace(/^[\s\S]*?\{/, '{').replace(/\}[^}]*$/, '}'));
    };

    try {
        return { data: await ask(true), model: MODEL };
    } catch (err) {
        // 스키마를 붙인 요청이 거절되는 경우(구버전 SDK·API 변경)에도 읽기는 되어야 한다.
        // 한 번만 평범한 요청으로 다시 물어보고, 그것마저 실패하면 그때 사실대로 알린다.
        try {
            return { data: await ask(false), model: MODEL, 형식보정: true };
        } catch (err2) {
            return { error: String((err2 && err2.message) || (err && err.message) || err) };
        }
    }
}

// 스키마 없이 물어볼 때 보여줄 예시 모양
const SHAPE = {
    image_rows: [{ label: '바이엘', condition: '주2회 60분', amount: 140000, period: '월' }],
    blog_rows: [], notes: ['교재비 포함'], readable: true,
};

const rows = (list) => (Array.isArray(list) ? list : []).filter((r) => r && Number(r.amount) > 0);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { placeId, blogUrl, name } = req.body || {};
    const out = {
        플레이스: { 가격메뉴: [], 이미지: [], 이미지읽음: [] },
        블로그: null,
        비고: [],
        ai: { 사용함: false },
        오류: [],
    };

    // 플레이스와 블로그는 서로 독립이라 함께 받는다
    const [placeRes, blogRes] = await Promise.allSettled([
        placeId ? probePlace(String(placeId)) : Promise.resolve(null),
        blogUrl ? readBlogFeeText(blogId(blogUrl)) : Promise.resolve(null),
    ]);

    if (placeRes.status === 'fulfilled' && placeRes.value) {
        const p = placeRes.value;
        out.플레이스.가격메뉴 = (p.menus || [])
            .filter((m) => m.name || m.price)
            .map((m) => ({ 이름: m.name || '', 금액: m.price || '' }));
        out.플레이스.이미지 = (p.priceImages || []).slice(0, MAX_IMAGES);
    } else if (placeRes.status === 'rejected') {
        out.오류.push(`플레이스: ${errText(placeRes.reason)}`);
    }

    if (blogRes.status === 'fulfilled' && blogRes.value) {
        out.블로그 = blogRes.value;
    } else if (blogRes.status === 'rejected') {
        out.오류.push(`블로그: ${errText(blogRes.reason)}`);
    }

    // AI 는 사람이 사진으로 올려 글자로는 못 읽는 것에만 쓴다.
    // 블로그 본문은 글자가 어수선할 때만(금액이 네 개 넘게 흩어져 있을 때) 함께 넘긴다 —
    // 두세 개면 문맥까지 그대로 보여주는 편이 사람 눈에 더 정확하다.
    const images = [];
    for (const url of out.플레이스.이미지) {
        const img = await fetchImage(url);
        if (img) images.push(img);
    }
    const messyBlog = out.블로그 && out.블로그.found && (out.블로그.금액 || []).length > 4
        ? out.블로그.본문 : '';

    if (images.length || messyBlog) {
        const r = await readWithClaude({ images, blogText: messyBlog, academyName: name });
        out.ai = { 사용함: true, 모델: r.model || MODEL, 이미지수: images.length };
        if (r.형식보정) out.ai.형식보정 = true;   // 스키마 없이 다시 물어 얻은 답 (진단용)
        if (r.error) {
            out.ai.오류 = r.error;
        } else if (r.data) {
            out.플레이스.이미지읽음 = rows(r.data.image_rows);
            out.ai.블로그읽음 = rows(r.data.blog_rows);
            out.비고 = (r.data.notes || []).slice(0, 6);
            out.ai.읽음 = r.data.readable !== false;
        }
    }
    if (out.플레이스.이미지.length && !images.length) {
        out.오류.push('가격표 이미지를 내려받지 못했습니다 — 링크로 직접 확인하세요');
    }

    return res.json(out);
}

/** blog.naver.com/xxx → xxx */
function blogId(url) {
    const m = String(url || '').match(/blog\.naver\.com\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
}

function errText(err) {
    if (isBlocked(err)) return '네이버가 잠시 요청을 막았습니다 — 몇 분 뒤 다시 열어 보세요';
    return String(err && err.message ? err.message : err);
}
