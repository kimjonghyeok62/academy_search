// 민원 취약 항목 — 외부인이 인터넷만 보고 신고할 수 있는 위반 단서를 우리가 먼저 찾는다.
//
// 왜 검토 탭의 기존 검사와 나눠 두는가.
// 기존 11개는 '우리 데이터가 맞는가'(우편번호·연락처 누락)를 보는 데이터 품질 검사다.
// 여기 있는 것은 '학원이 위반했는가'를 보는 것이라 목적도, 봐야 할 순서도 다르다.
// 실제로 강사가 0명인 학원 명단을 들고 와 성범죄·아동학대 경력조회 미실시로 신고하거나,
// 블로그의 '유일'·'선행' 같은 표현으로 허위·과대광고 신고를 넣는 일이 이어지고 있다.
//
// React 를 쓰지 않는 순수 계산만 둔다 — 화면 없이 Node 로 돌려 건수를 검증할 수 있어야 한다.

import { recordKey } from './snsCheck.js';

// 처분이 무거운 순서. 검토 탭은 이 값 내림차순으로 항목을 늘어놓으므로,
// severity 를 고치면 화면의 위아래도 따라 바뀐다.
export const SEV = { HIGH: 3, MID: 2, LOW: 1 };

const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
};

/** 'YYYY.M.D' · 'YYYY-MM-DD' — 검토 탭의 toDateRev 와 같은 규칙 */
export function toDateR(s) {
    const m = String(s || '').match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const idKey = (type, id) => `${type}|${id}`;
const catType = (a) => ((a.category || '').includes('교습소') ? '교습소' : '학원');

/**
 * 해임일이 없는 강사 = 지금 일하는 강사.
 * instructors 배열이 비었는지로 보면 안 된다 — 전직 강사로만 가득 찬 학원이 있다.
 */
export const currentInstructors = (a) => (a.instructors || []).filter((i) => !String(i.dismissDate || '').trim());

/** 오늘 기준 아직 살아 있는 보험 중 가장 늦게 끝나는 것 */
export function activeInsurance(a, today) {
    const live = (a.insurances || []).filter((ins) => {
        const e = toDateR(ins.endDate);
        return e && e >= today;
    });
    if (!live.length) return null;
    return live.reduce((best, ins) => {
        const d = toDateR(ins.endDate);
        const bd = best ? toDateR(best.endDate) : null;
        return d && (!bd || d > bd) ? ins : best;
    }, null);
}

const phoneOf = (a) => a.founder?.mobile || a.founder?.phone || '';

// ── 교습비 기준단가 레이블 (검토 탭에 있던 것을 그대로 옮겨 왔다) ──────────
const ADULT_KEYWORDS = ['성인', '일반인', '직장', '주부', '노인'];
const procLevel = (proc) => {
    if (proc.includes('유아')) return '유';
    if (proc.includes('초등')) return '초';
    if (proc.includes('중등')) return '중';
    if (proc.includes('고등')) return '고';
    return '';
};
export function getStdLabel(std, track, process) {
    const p = Math.round(std);
    const t = track || '';
    const proc = process || '';
    if (p === 210) return '보습-단과(초등)';
    if (p === 222) return '보습-단과(중등)';
    if (p === 259) return '어학';
    if (p === 336) return '음악-입시';
    if (p === 234) return t.includes('진학') ? '진학상담' : '보습-단과(고등)';
    if (p === 224) { const lv = procLevel(proc); return lv ? `음악-${lv}` : '음악'; }
    if (p === 212) {
        const lv = procLevel(proc);
        if (t.includes('미술')) return lv ? `미술-${lv}` : '미술';
        if (t.includes('무용')) return lv ? `무용-${lv}` : '무용';
        return lv || '';
    }
    if (p === 255) {
        if (t.includes('미술')) return '미술-입시';
        if (t.includes('무용')) return '무용-입시';
        return '입시';
    }
    if (p === 230) return t.includes('정보') ? '정보-일반' : '기타-일반';
    return '';
}

// ── SNS 조사 결과 읽기 ──────────────────────────────────────────
/** 시트 행 목록 → `구분|등록번호` 로 찾을 수 있는 Map */
export function indexSnsRows(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
        const regNo = String(row['등록번호'] || '').trim();
        if (!regNo) return;
        map.set(recordKey(row['구분'] || '', regNo), row);
    });
    return map;
}

/** 채널상세(JSON 문자열) → 배열. 형식이 깨진 행은 조용히 건너뛴다 */
function channelsOf(row) {
    try {
        const v = JSON.parse(row['채널상세'] || '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

/** 학원 하나에 대응하는 SNS 행 (없으면 null) */
const snsOf = (ctx, a) => ctx.snsByKey.get(recordKey(catType(a), a.id)) || null;

// ── 항목별 판정 ────────────────────────────────────────────────

// A군 ─ 성범죄·아동학대 경력조회 취약
//
// 경력조회를 실제로 했는지는 어느 데이터에도 없다. 그래서 '미조회'라고 단정하지 않는다.
// 조회 의무가 생기는 자리(사람을 쓰는 학원)인데 인력 신고가 부실한 곳을 골라내,
// 점검 나가서 조회 대장을 확인할 대상을 좁히는 것이 목적이다.

function zeroInstructor(ctx) {
    return ctx.aActive
        .map((a) => {
            const list = a.instructors || [];
            if (currentInstructors(a).length > 0) return null;
            const everHad = list.length > 0;
            const lastOut = everHad
                ? list.map((i) => i.dismissDate).filter(Boolean).sort().slice(-1)[0] || ''
                : '';
            return {
                type: '학원', id: a.id, name: a.name, phone: phoneOf(a),
                detail: everHad ? `전원 해임${lastOut ? ` (최종 ${lastOut})` : ''}` : '강사 신고 이력 없음',
                regDate: a.regDate || '',
                // 신고 이력이 아예 없는 쪽이 더 나쁘다 — 위로 올린다
                sort: everHad ? 1 : 0,
            };
        })
        .filter(Boolean)
        .sort((x, y) => x.sort - y.sort);
}

function unqualifiedInstructor(ctx) {
    const BAD = ['무자격', '고등학교졸업자'];
    return ctx.aActive
        .map((a) => {
            const hits = currentInstructors(a).filter((i) => BAD.includes(String(i.qualification || '').trim()));
            if (!hits.length) return null;
            const byQual = {};
            hits.forEach((i) => { const q = i.qualification.trim(); byQual[q] = (byQual[q] || 0) + 1; });
            return {
                type: '학원', id: a.id, name: a.name, phone: phoneOf(a),
                count: hits.length,
                // 강사 개인 이름은 내지 않는다 — 자격구분과 사람 수만으로 점검 대상은 정해진다
                detail: Object.entries(byQual).map(([q, n]) => `${q} ${n}명`).join(', '),
                subjects: [...new Set(hits.map((i) => i.subject).filter(Boolean))].join(', '),
                sort: -hits.length,
            };
        })
        .filter(Boolean)
        .sort((x, y) => x.sort - y.sort);
}

function foreignNoVisa(ctx) {
    return ctx.aActive
        .map((a) => {
            const foreign = currentInstructors(a).filter((i) => String(i.type || '').includes('외국인'));
            if (!foreign.length) return null;
            const noVisa = foreign.filter((i) => !String(i.visaType || '').trim());
            if (!noVisa.length) return null;
            const noNat = noVisa.filter((i) => !String(i.nationality || '').trim()).length;
            return {
                type: '학원', id: a.id, name: a.name, phone: phoneOf(a),
                count: noVisa.length, total: foreign.length, noNat,
                detail: `외국인 강사 ${foreign.length}명 중 ${noVisa.length}명 체류자격 공란`
                    + (noNat ? ` (국적도 공란 ${noNat}명)` : ''),
                sort: -noVisa.length,
            };
        })
        .filter(Boolean)
        .sort((x, y) => x.sort - y.sort);
}

// B군 ─ 초과징수 단서

function onlineFeeMismatch(ctx) {
    const out = [];
    ctx.allActive.forEach((a) => {
        const row = snsOf(ctx, a);
        if (!row) return;
        const where = [];
        if (row['플레이스_교습비'] === '△') where.push('플레이스');
        channelsOf(row).forEach((c) => {
            if (c.금액대조 === '불일치') where.push(`${c.유형 || c.종류}${c.기재금액 ? ` (${c.기재금액})` : ''}`);
        });
        if (!where.length) return;
        out.push({
            type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
            detail: where.join(' · '),
            // 미이행사유에 신고액까지 적혀 있어 그대로 보여 주면 대조창을 열지 않아도 된다
            reason: row['미이행사유'] || '',
            sort: -where.length,
        });
    });
    return out.sort((x, y) => x.sort - y.sort);
}

/**
 * 경비 위장 초과징수 — 교습비 단가는 기준에 맞춰 두고 재료비·모의고사비로 더 받는 방식.
 * 기존 '교습비 단가 초과'는 단가만 보므로 이 수법을 구조적으로 잡지 못한다.
 */
function expenseDisguise(ctx) {
    const out = [];
    ctx.allActive.forEach((a) => {
        (a.courses || []).forEach((c) => {
            const fee = num(c.tuitionFee);
            if (fee <= 0) return;
            const etc = num(c.otherFeeTotal);
            const parts = num(c.materialFee) + num(c.mockExamFee) + num(c.clothingFee);
            const overEtc = etc > fee;
            const overParts = parts > fee * 0.5;
            if (!overEtc && !overParts) return;
            out.push({
                type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
                subject: c.subject || '-',
                fee, etc, parts,
                detail: `${c.subject || '-'} · ` + (overEtc
                    ? `기타경비 ${etc.toLocaleString('ko-KR')}원 > 교습비 ${fee.toLocaleString('ko-KR')}원`
                    : `재료·모의고사·피복 ${parts.toLocaleString('ko-KR')}원 (교습비의 ${Math.round((parts / fee) * 100)}%)`),
                // 기타경비가 교습비를 넘는 쪽이 더 뚜렷하다
                sort: overEtc ? 0 : 1,
                ratio: overEtc ? etc / fee : parts / fee,
            });
        });
    });
    return out.sort((x, y) => x.sort - y.sort || y.ratio - x.ratio);
}

/** 교습비 단가 기준 초과 — 검토 탭에 있던 계산을 그대로 옮겨 왔다 */
function feeExceed(ctx) {
    const out = [];
    ctx.allActive.forEach((a) => {
        if ((a.category || '').includes('평생직업')) return;
        (a.courses || []).forEach((course) => {
            const proc = course.process || '';
            const subj = course.subject || '';
            if (ADULT_KEYWORDS.some((k) => proc.includes(k) || subj.includes(k))) return;
            const unit = num(course.unitPrice);
            const std = num(course.standardUnitPrice);
            if (!(unit > 0 && std > 0 && unit > std)) return;
            const stdLabel = getStdLabel(std, course.track, course.process);
            out.push({
                type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
                subject: subj || '-',
                stdLabel, unit, std, diff: Math.round(unit - std),
                detail: `${subj || '-'} · 기준 ${std.toLocaleString('ko-KR')}원${stdLabel ? `(${stdLabel})` : ''}`
                    + ` → 신고 ${unit.toLocaleString('ko-KR')}원 · 분당 +${Math.round(unit - std).toLocaleString('ko-KR')}원`,
            });
        });
    });
    return out.sort((x, y) => y.diff - x.diff);
}

/** 보험에 든 강사 수가 신고된 강사 수보다 많다 = 신고하지 않고 쓰는 강사가 있다는 뜻 */
function undeclaredInstructor(ctx) {
    return ctx.allActive
        .map((a) => {
            const ins = activeInsurance(a, ctx.today);
            if (!ins) return null;
            const insCount = num(ins.teachersCount);
            if (insCount <= 0) return null;
            const regCount = currentInstructors(a).length;
            if (insCount <= regCount) return null;
            return {
                type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
                insCount, regCount, gap: insCount - regCount,
                detail: `보험 ${insCount}명 / 신고 ${regCount}명`,
            };
        })
        .filter(Boolean)
        .sort((x, y) => y.gap - x.gap);
}

// C군 ─ 허위·과대광고

function adPhrase(ctx) {
    const out = [];
    ctx.allActive.forEach((a) => {
        const row = snsOf(ctx, a);
        if (!row) return;
        const hits = [];
        channelsOf(row).forEach((c) => {
            const line = String(c.광고문구 || '').trim();
            if (line) hits.push({ 유형: c.유형 || c.종류, url: c.url || '', line });
        });
        if (!hits.length) return;
        // '1급 …' 로 시작하므로 앞자리 숫자가 곧 등급이다
        const grades = hits.flatMap((h) => [...h.line.matchAll(/(\d)급/g)].map((m) => Number(m[1])));
        const top = grades.length ? Math.min(...grades) : 3;
        out.push({
            type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
            top, hits,
            detail: hits.map((h) => `${h.유형}: ${h.line}`).join(' / '),
        });
    });
    return out.sort((x, y) => x.top - y.top);
}

function regNoMissing(ctx) {
    const out = [];
    ctx.allActive.forEach((a) => {
        const row = snsOf(ctx, a);
        if (!row) return;
        const v = row['플레이스_번호대조'] || '';
        if (v !== '미기재' && v !== '불일치') return;
        out.push({
            type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
            detail: v === '불일치' ? `다른 번호 기재 (${row['플레이스_기재번호'] || '-'})` : '등록번호 미기재',
            url: row['플레이스URL'] || '',
            sort: v === '불일치' ? 0 : 1,
        });
    });
    return out.sort((x, y) => x.sort - y.sort);
}

// D군 ─ 게시 의무 미이행

function feeNotPosted(ctx) {
    const out = [];
    ctx.allActive.forEach((a) => {
        const row = snsOf(ctx, a);
        if (!row) return;
        if (row['판정'] !== '미이행') return;
        const reason = row['미이행사유'] || '';
        if (!reason.includes('미게시')) return;
        out.push({
            type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
            detail: reason,
            url: row['플레이스URL'] || '',
        });
    });
    return out;
}

// E군 ─ 실태 미신고 의심

const STALE_YEARS = 3;
const STALE_YEARS_BAD = 5;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function staleUpdate(ctx) {
    return ctx.allActive
        .map((a) => {
            const d = toDateR(a.changeDate);
            if (!d) return null;
            const years = (ctx.today - d) / YEAR_MS;
            if (years < STALE_YEARS) return null;
            return {
                type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
                changeDate: a.changeDate,
                years: Math.floor(years),
                severe: years >= STALE_YEARS_BAD,
                detail: `${Math.floor(years)}년 경과 (최종 ${a.changeDate})`,
            };
        })
        .filter(Boolean)
        .sort((x, y) => y.years - x.years);
}

/** 보험 만료·미가입 — 검토 탭에 있던 계산을 그대로 옮겨 왔다 */
function insuranceIssue(ctx) {
    return ctx.allActive
        .map((a) => {
            if (!a.insurances || a.insurances.length === 0) {
                return { type: catType(a), id: a.id, name: a.name, phone: phoneOf(a), detail: '미가입', sort: 0 };
            }
            if (activeInsurance(a, ctx.today)) return null;
            const latest = a.insurances.reduce((best, ins) => {
                const d = toDateR(ins.endDate);
                const bd = best ? toDateR(best.endDate) : null;
                return d && (!bd || d > bd) ? ins : best;
            }, null);
            return {
                type: catType(a), id: a.id, name: a.name, phone: phoneOf(a),
                detail: `만료 (${latest?.endDate || '-'})`, sort: 1,
            };
        })
        .filter(Boolean)
        .sort((x, y) => x.sort - y.sort);
}

// ── 항목 목록 ──────────────────────────────────────────────────
// severity 내림차순 = 화면 위에서 아래. 순서를 바꾸려면 severity 만 고치면 된다.
// needsSns 가 붙은 것은 SNS 조사 결과가 있어야 셀 수 있다.
// needsInstructors 가 붙은 것은 강사 명단이 다 붙은 뒤에야 셀 수 있다 —
// 백그라운드 로딩 중에 세면 모든 학원이 '강사 0명'으로 잡힌다.

export const RISK_ITEMS = [
    {
        id: 'zeroInstructor', group: 'A', severity: SEV.HIGH, needsInstructors: true,
        title: '현직 강사 0명 (개원 학원)',
        note: '강사 없이 개원 중 — 미신고 강사를 쓰고 있다면 성범죄·아동학대 경력조회도 빠져 있을 수 있습니다',
        ref: '청소년성보호법§56·§67, 아동복지법§29의3',
        sanction: '경력조회 미실시 시 과태료 성범죄 300~500만원 / 아동학대 250~500만원',
        color: '#dc2626', compute: zeroInstructor,
    },
    {
        id: 'unqualifiedInstructor', group: 'A', severity: SEV.HIGH, needsInstructors: true,
        title: '무자격·고졸 강사 채용',
        note: '학원 강사 자격 기준(전문대졸 이상 또는 인정자격) 미달로 신고된 강사',
        ref: '학원법 시행령§12 [별표3]',
        sanction: '자격 미달 강사 채용 — 시정명령 → 교습정지',
        color: '#dc2626', compute: unqualifiedInstructor,
    },
    {
        id: 'foreignNoVisa', group: 'A', severity: SEV.HIGH, needsInstructors: true,
        title: '외국인 강사 체류자격 미기재',
        note: '회화지도(E-2) 등 체류자격 없이 강의하면 학원법과 출입국관리법을 함께 위반합니다',
        ref: '학원법§13의2, 출입국관리법§18',
        sanction: '불법 취업 외국인 고용 — 교습정지·고발',
        color: '#dc2626', compute: foreignNoVisa,
    },
    {
        id: 'onlineFeeMismatch', group: 'B', severity: SEV.HIGH, needsSns: true,
        title: '온라인 게시 교습비 ≠ 신고 교습비',
        note: '외부에서 가장 쉽게 확인되는 초과징수 단서입니다',
        ref: '학원법§15③, 시행령§18',
        sanction: '교습비등 초과징수 — 반환명령·교습정지',
        color: '#dc2626', compute: onlineFeeMismatch,
    },
    {
        id: 'expenseDisguise', group: 'B', severity: SEV.HIGH,
        title: '경비 위장 초과징수 의심',
        note: '교습비 단가는 기준에 맞추고 재료비·모의고사비로 더 받는 방식 — 단가 검사로는 잡히지 않습니다',
        ref: '학원법§15③, 시행령§18',
        sanction: '기타경비 과다 징수 — 반환명령·시정명령',
        color: '#ea580c', compute: expenseDisguise,
    },
    {
        id: 'feeExceed', group: 'B', severity: SEV.HIGH,
        title: '교습비 단가 기준 초과',
        note: '분당 단가가 계열·과정별 기준단가를 넘습니다',
        ref: '학원법§15③',
        sanction: '교습비등 초과징수 — 반환명령·교습정지',
        color: '#f97316', compute: feeExceed,
    },
    {
        id: 'undeclaredInstructor', group: 'B', severity: SEV.MID, needsInstructors: true,
        title: '미신고 강사 의심 (보험 강사수 > 신고 강사수)',
        note: '보험에는 넣고 강사 신고는 하지 않은 인원이 있을 수 있습니다',
        ref: '학원법§13①',
        sanction: '강사 미신고 — 시정명령',
        color: '#ea580c', compute: undeclaredInstructor,
    },
    {
        id: 'adPhrase', group: 'C', severity: SEV.MID, needsSns: true,
        title: '허위·과대광고 문구 검출',
        note: '블로그·홈페이지 본문에서 절대적 표현·선행학습 유발·오인성 표현을 찾은 곳입니다',
        ref: '학원법§17①9, 표시광고법§3①1, 공교육정상화법§8④',
        sanction: '1차 시정명령 → 2차 교습정지 → 3차 등록말소 (선행학습 유발 광고는 과태료)',
        color: '#dc2626', compute: adPhrase,
    },
    {
        id: 'regNoMissing', group: 'C', severity: SEV.MID, needsSns: true,
        title: '플레이스 등록번호 미기재·오기재',
        ref: '학원법§17①, 시행규칙§16',
        sanction: '시정명령',
        color: '#8b5cf6', compute: regNoMissing,
    },
    {
        id: 'feeNotPosted', group: 'D', severity: SEV.MID, needsSns: true,
        title: '온라인 교습비 미게시',
        note: '게시 의무 위반으로 바로 신고되는 항목입니다',
        ref: '학원법§15④, 시행령§18③',
        sanction: '교습비등 미게시 — 과태료',
        color: '#f59e0b', compute: feeNotPosted,
    },
    {
        id: 'insurance', group: 'E', severity: SEV.MID,
        title: '보험 만료 · 미가입',
        ref: '학원법§4의2',
        sanction: '미가입 — 시정명령 → 교습정지',
        color: '#f59e0b', compute: insuranceIssue,
    },
    {
        id: 'staleUpdate', group: 'E', severity: SEV.LOW,
        title: '실태 미신고 의심 (최종 변경일 3년 이상 경과)',
        note: '강사·교습비·면적이 신고 내용과 달라졌을 개연성이 높은 곳입니다',
        ref: '학원법§6, §15②',
        sanction: '변경 미등록·미신고 — 과태료',
        color: '#64748b', compute: staleUpdate,
    },
];

/**
 * 판정에 필요한 것을 한 번만 모아 둔다.
 * 항목마다 같은 목록을 다시 거르지 않도록, 개원 상태로 걸러 낸 배열을 미리 만들어 넘긴다.
 */
export function buildRiskContext({ academies, region, snsRows, today }) {
    const city = region.endsWith('시') ? region : `${region}시`;
    const inCity = (a) => (a.address || '').includes(city);
    const open = (academies || []).filter((a) => inCity(a) && (a.status || '') === '개원');
    const aActive = open.filter((a) => !(a.category || '').includes('교습소'));
    const hActive = open.filter((a) => (a.category || '').includes('교습소'));
    return {
        aActive,
        hActive,
        allActive: [...aActive, ...hActive],
        snsByKey: indexSnsRows(snsRows),
        today: today || new Date(),
    };
}

/**
 * 항목을 모두 돌려 화면이 그대로 그릴 수 있는 모양으로 만든다.
 * severity 가 높은 것이 위로 온다 — '중요한 것부터 위에' 라는 요구가 이 정렬 하나로 지켜진다.
 *
 * @param ctx    buildRiskContext 결과
 * @param ready  { instructors, sns } — 아직 안 붙은 데이터가 있으면 rows 대신 pending 으로 남긴다
 */
export function runRiskChecks(ctx, ready = {}) {
    const items = RISK_ITEMS.map((item) => {
        const blocked = (item.needsInstructors && !ready.instructors)
            || (item.needsSns && !ready.sns);
        return {
            ...item,
            pending: blocked,
            rows: blocked ? [] : item.compute(ctx),
        };
    });
    return items.sort((a, b) => b.severity - a.severity);
}

/**
 * 여러 항목에 겹쳐 걸린 기관을 센다 — 한 곳이 몇 가지 신호에 걸렸는지 행에 붙여 보여 주려는 것이다.
 * @returns Map<`유형|등록번호`, 항목 id 집합>
 */
export function crossSignals(items) {
    const map = new Map();
    items.forEach((item) => {
        if (item.pending) return;
        const seen = new Set();
        item.rows.forEach((r) => {
            if (!r.id) return;
            const k = idKey(r.type, r.id);
            if (seen.has(k)) return;   // 같은 항목 안에서 여러 줄이면 한 번만 센다
            seen.add(k);
            if (!map.has(k)) map.set(k, new Set());
            map.get(k).add(item.id);
        });
    });
    return map;
}

export { idKey };
