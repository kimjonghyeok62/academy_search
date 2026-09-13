// 성과 집계 — 회차별 게시율 추이.
//
// 화면과 엑셀이 같은 함수를 보게 하려고 셈은 **여기 한 곳에만** 둔다
// (docs/SNS-안내문자.md '지켜야 하는 규칙 2' 와 같은 이유) — 두 곳이 따로 세면
// 어느 숫자가 맞는지 알 수 없고, 그런 숫자는 실적 자료로 쓸 수 없다.

/** 이행률을 낼 때 분모에서 뺄 판정 — 게시할 자리가 아예 없거나(해당없음) 못 본 것(확인불가) */
const OUT_OF_SCOPE = ['해당없음', '확인불가', '미조사'];

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * 회차별 게시율.
 *
 * 분모를 둘로 낸다 —
 *   rate    이행 / (이행 + 미이행)          '게시할 자리가 있는 곳 중 게시한 비율'
 *   rateAll 이행 / 전체                      확인불가·해당없음까지 포함한 비율
 * 어느 쪽으로 셌는지 숨기지 않으려는 것이다. 심사 자리에서 분모를 물으면 자료가 답해야 한다.
 */
export function ratesByRound(snapshotRows) {
    const rounds = new Map();
    (snapshotRows || []).forEach((r) => {
        const round = String(r.회차 || '').trim();
        if (!round) return;
        if (!rounds.has(round)) {
            rounds.set(round, { round, savedAt: String(r.저장일시 || ''), 전체: 0, 이행: 0, 미이행: 0, 확인불가: 0, 해당없음: 0, 미조사: 0 });
        }
        const g = rounds.get(round);
        g.전체 += 1;
        const v = String(r.판정 || '미조사');
        if (g[v] === undefined) g.미조사 += 1; else g[v] += 1;
        // 같은 회차 안에서 가장 이른 저장일시를 그 회차의 날로 본다
        if (r.저장일시 && (!g.savedAt || String(r.저장일시) < g.savedAt)) g.savedAt = String(r.저장일시);
    });

    return [...rounds.values()]
        .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
        .map((g) => ({
            ...g,
            대상: g.이행 + g.미이행,
            rate: pct(g.이행, g.이행 + g.미이행),
            rateAll: pct(g.이행, g.전체),
        }));
}

const keyOf = (r) => `${String(r.구분 || '').trim()}|${String(r.등록번호 || '').trim()}`;

/**
 * 두 회차를 견주어 어느 학원이 달라졌는지.
 * 실적의 핵심은 '개선' — 앞 회차에 미이행이던 곳이 뒤 회차에 이행이 된 곳이다.
 */
export function compareRounds(snapshotRows, fromRound, toRound) {
    const pick = (round) => {
        const m = new Map();
        (snapshotRows || []).forEach((r) => {
            if (String(r.회차 || '').trim() === round) m.set(keyOf(r), r);
        });
        return m;
    };
    const a = pick(fromRound);
    const b = pick(toRound);

    const improved = [];
    const worsened = [];
    const stillBad = [];
    a.forEach((was, key) => {
        const now = b.get(key);
        if (!now) return;
        const before = String(was.판정 || '');
        const after = String(now.판정 || '');
        if (before === '미이행' && after === '이행') improved.push({ ...now, 이전판정: before, 이전미이행매체: was.미이행매체 });
        else if (before === '이행' && after === '미이행') worsened.push({ ...now, 이전판정: before });
        else if (before === '미이행' && after === '미이행') stillBad.push({ ...now, 이전판정: before });
    });

    const wasBad = improved.length + stillBad.length;
    return {
        improved, worsened, stillBad,
        matched: [...a.keys()].filter((k) => b.has(k)).length,
        // 앞 회차에 미이행이던 곳 중 몇 %가 고쳤나 — 이 문장이 실적의 알맹이다
        improvedRate: pct(improved.length, wasBad),
    };
}
