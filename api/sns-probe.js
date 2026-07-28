// 네이버플레이스/블로그 게시 여부 자동 조사 (배치)
// 프론트가 학원 목록을 청크로 나눠 호출하고 진행률을 표시한다.
// 서버리스 실행시간 제한이 있으므로 한 번에 받는 학원 수를 제한한다.
import { probeAcademy, isBlocked, sleep } from './_lib/naverProbe.js';

// 학원 1곳당 플레이스 + 연결 채널(최대 4개)까지 조사하므로 요청이 4~12개 나간다.
// 한 요청에 몰아넣으면 (1) 서버리스 실행시간 제한에 걸리고 (2) 초당 요청 수가 튀어 차단당한다.
// 작게 끊고, 청크 사이 간격은 프론트(probeAll)가 벌린다.
const MAX_BATCH = 4;
// 네이버는 짧은 시간에 요청이 몰리면 403/캡차로 막는다. 실측상 동시 4 + 무지연으로 240건쯤에서
// 확실히 차단됐고 해제까지 15분 이상 걸렸다. 학원 1곳당 내부적으로 3~5개 요청이 나가므로
// 순차 처리 + 넉넉한 간격으로 초당 요청 수를 낮춰 완주 가능성을 우선했다.
const CONCURRENCY = 1;
const GAP_MS = 2000;

async function runPool(items, worker, limit) {
    const results = new Array(items.length);
    let cursor = 0;
    let blockedErr = null;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length && !blockedErr) {
            const i = cursor++;
            try {
                results[i] = await worker(items[i]);
            } catch (err) {
                if (isBlocked(err)) { blockedErr = err; return; }
                throw err;
            }
            // 마지막 학원 뒤에 쉬는 건 응답만 늦출 뿐이다 (청크 사이 간격은 프론트가 따로 둔다)
            if (cursor < items.length) await sleep(GAP_MS);
        }
    });
    await Promise.all(runners);
    return { results: results.filter(Boolean), blockedErr };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'invalid JSON body' }); }
    }
    const { academies, city } = body || {};
    if (!Array.isArray(academies) || !academies.length) {
        return res.status(400).json({ ok: false, error: 'academies 배열이 필요합니다' });
    }
    if (academies.length > MAX_BATCH) {
        return res.status(400).json({ ok: false, error: `한 번에 최대 ${MAX_BATCH}곳까지 조사할 수 있습니다` });
    }

    try {
        const { results, blockedErr } = await runPool(
            academies,
            (a) => probeAcademy(a, city || '하남'),
            CONCURRENCY
        );
        // 차단됐다면 조사에 성공한 건만 돌려주고 blocked 를 알린다.
        // 못 돌린 학원을 '확인불가'로 채워 보내면 기존 정상 결과를 덮어써 버린다.
        return res.status(200).json({
            ok: true,
            results,
            blocked: !!blockedErr,
            blockedReason: blockedErr ? blockedErr.message : undefined,
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}
