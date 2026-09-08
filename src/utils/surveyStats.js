// 성과 조사 집계 — 게시율 추이와 만족도.
//
// 시트에는 점수가 아니라 사람이 읽는 말이 들어 있다('많이 도움'). 점수로 바꾸는 표는
// **여기 한 곳에만** 둔다. 화면과 엑셀이 같은 함수를 보게 하려는 것이다
// (docs/SNS-안내문자.md '지켜야 하는 규칙 2' 와 같은 이유) — 두 곳이 따로 세면
// 어느 숫자가 맞는지 알 수 없고, 그런 숫자는 실적 자료로 쓸 수 없다.

// api/_lib/surveyText.js 의 HELP·FORM_USE 와 **글자까지 같아야 한다**
export const HELP_ORDER = ['많이 도움', '도움', '보통', '별로', '전혀'];
export const FORM_USE_ORDER = ['확인 후 인쇄', '네이버 플레이스 게시', '열어만 봄', '쓰지 않음'];

// 5점 척도. '보통' 이 3점이고 위아래로 하나씩이다.
const HELP_SCORE = { '많이 도움': 5, 도움: 4, 보통: 3, 별로: 2, 전혀: 1 };

// 게시표를 실제로 쓴 것으로 보는 답 — '열어만 봄' 은 활용이 아니다.
// 열어 보기까지 활용으로 세면 활용률이 실제보다 좋아 보인다.
const FORM_USED = ['확인 후 인쇄', '네이버 플레이스 게시'];

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

const countBy = (rows, field, order) => {
    const c = new Map(order.map((k) => [k, 0]));
    rows.forEach((r) => {
        const v = String(r[field] || '').trim();
        if (c.has(v)) c.set(v, c.get(v) + 1);
    });
    return order.map((label) => ({ label, count: c.get(label) }));
};

/**
 * 만족도 집계.
 *
 * sentCount·repliedCount 는 응답률의 분모다. **둘 다 함께 적는다** — 만족도에 답한 곳은
 * 회신까지 한 곳이라 스스로 고른 사람들이다(자기선택 편향). 문자 보낸 곳 대비 비율만 적으면
 * 낮아 보이고, 회신한 곳 대비만 적으면 높아 보인다. 두 숫자가 함께 있어야 정직하다.
 */
export function surveyStats(surveyRows, { sentCount = 0, repliedCount = 0 } = {}) {
    const rows = surveyRows || [];
    const help = countBy(rows, '도움정도', HELP_ORDER);
    const formUse = countBy(rows, '게시표활용', FORM_USE_ORDER);

    const scored = rows.map((r) => HELP_SCORE[String(r.도움정도 || '').trim()]).filter(Boolean);
    const avg = scored.length
        ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100
        : null;

    const formAnswered = formUse.reduce((n, x) => n + x.count, 0);
    const formUsed = formUse.filter((x) => FORM_USED.includes(x.label)).reduce((n, x) => n + x.count, 0);

    const notes = rows
        .filter((r) => String(r.의견 || '').trim())
        .map((r) => ({ at: String(r.응답일시 || ''), text: String(r.의견).trim() }))
        .sort((a, b) => b.at.localeCompare(a.at));

    return {
        total: rows.length,
        help, formUse, notes,
        avgHelp: avg,
        // 도움 이상(4·5점)이라고 답한 비율 — 보고서에 한 줄로 쓰기 좋은 값
        helpfulRate: pct(help[0].count + help[1].count, scored.length),
        formUsedRate: pct(formUsed, formAnswered),
        formAnswered,
        sentCount,
        repliedCount,
        rateOfSent: pct(rows.length, sentCount),
        rateOfReplied: pct(rows.length, repliedCount),
    };
}
