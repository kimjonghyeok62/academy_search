import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
    probeAll, fetchSnsChecks, saveSnsChecks, resultToRecord, recordKey, rowToResult,
    toProbeTargets, placeSearchUrl, blogSearchUrl, parseChannels, needsRecheck,
    assignBuckets, snsRemark, BUCKETS, BUCKET_LABEL,
    rowCells, parseManual, effectiveVerdict, applyManualCell, setManualCell, keepManual,
    buildGroups, placeDuplicates, sharedCellTargets, effectivePlaceId, pinnedPlaceId,
    remarkPlaceHint, pinResolvedPlace, parsePlaceInput, hasPlaceCandidate,
    currentPlaceUrl, placeSource, placeUrlFromId, parsePlaceId, PIN_CLEARED,
    RECHECK_DAYS, VERDICT_COLOR,
} from '../utils/snsCheck';
import OxBadge from './SnsOxBadge';

const FILTERS = ['전체', '미이행', '이행', '확인불가', '미조사'];

const fmtWhen = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 16).replace('T', ' ');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtLeft = (sec) => (sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${sec}초`);

const Chip = ({ label, active, onClick, count, color }) => (
    <button onClick={onClick} style={{
        padding: '6px 12px', borderRadius: '999px', fontSize: '0.82rem', cursor: 'pointer',
        border: '1px solid', borderColor: active ? (color || 'var(--primary)') : 'var(--border-color)',
        background: active ? (color || 'var(--primary)') : 'transparent',
        color: active ? 'white' : 'var(--text-muted)', fontWeight: active ? '700' : '500', whiteSpace: 'nowrap',
    }}>{label}{count !== undefined ? ` ${count}` : ''}</button>
);

// ── 표 치수 ────────────────────────────────────────────
const W_NUM = 40;     // '#' 열 — 학원명 열의 sticky left 값이기도 하다
const W_NAME = 168;
const W_CH = 60;      // 채널 O/X 칸 — 묶음 7개 × (번호·교습비) = 14칸
// 표의 채널 묶음 순서: 플레이스 뒤로 blog·homepage·cafe·youtube·instagram·etc
const CH_GROUPS = ['place', ...BUCKETS];
// 줄무늬·헤더 배경 (--bg-main 은 어디에도 정의돼 있지 않아 투명하게 나온다.
//  sticky 헤더가 투명하면 아래 행이 그대로 비쳐 보이므로 정의된 변수를 쓴다)
const BG_STRIPE = 'var(--bg-light)';
const BG_ROW = 'var(--bg-card)';

// sticky 셀은 borderCollapse 표에서 border 가 사라지고 tr 배경도 따라오지 않는다.
// 그래서 배경색과 아래 경계선(inset shadow)을 셀마다 직접 준다.
const thBase = {
    padding: '9px 10px', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)',
    whiteSpace: 'nowrap', background: BG_STRIPE,
    boxShadow: 'inset 0 -1px 0 var(--border-color)',
};

// top 은 호출부에서 넘긴다 — 2행의 위치는 1행 높이를 실제로 재서 정한다(글꼴에 따라 달라진다)
// 열 너비는 colgroup 이 정한다 (table-layout: fixed)
const Th = ({ children, top = 0, colSpan, rowSpan, center, left, tight }) => (
    <th colSpan={colSpan} rowSpan={rowSpan} style={{
        ...thBase,
        ...(tight ? { padding: '9px 3px' } : null),
        textAlign: center ? 'center' : 'left',
        position: 'sticky', top,
        ...(left !== undefined ? { left, zIndex: 20 } : { zIndex: 12 }),
    }}>{children}</th>
);

const Td = ({ children, style, onClick, title }) => (
    <td onClick={onClick} title={title} style={{
        padding: '10px', fontSize: '0.86rem', lineHeight: 1.5, color: 'var(--text-main)',
        borderTop: '1px solid var(--border-color)', ...style,
    }}>{children}</td>
);

export default function SnsCheckTab({ region, academies, onSelectAcademy }) {
    const city = region.endsWith('시') ? region : region + '시';

    // 검토 탭과 동일한 활성 목록 기준 (지역 + 개원 상태)
    const aActiveList = useMemo(
        () => (academies || []).filter(a => (a.address || '').includes(city) && a.category !== '교습소' && (a.status || '') === '개원'),
        [academies, city]);
    const hActiveList = useMemo(
        () => (academies || []).filter(a => (a.address || '').includes(city) && a.category === '교습소' && (a.status || '') === '개원'),
        [academies, city]);

    const targets = useMemo(() => [
        ...toProbeTargets(aActiveList, '학원'),
        ...toProbeTargets(hActiveList, '교습소'),
    ], [aActiveList, hActiveList]);

    // 학원명을 눌러 상세화면으로 갈 때 원본 학원 객체가 필요하다.
    // 조사 대상(target)에 통째로 붙이면 /api/sns-probe 요청 본문까지 커지므로 여기서만 따로 찾는다.
    //
    // 키는 반드시 (구분 + 번호)여야 한다. 등록번호 N번 학원과 신고번호 N번 교습소는 서로 다른 곳인데
    // 번호만으로 키를 잡으면 뒤에 넣은 교습소가 학원을 덮어써, 학원명을 눌렀을 때 엉뚱한 교습소가 열렸다.
    const academyByKey = useMemo(() => {
        const m = new Map();
        aActiveList.forEach(a => { if (a.id) m.set(recordKey('학원', a.id), a); });
        hActiveList.forEach(a => { if (a.id) m.set(recordKey('교습소', a.id), a); });
        return m;
    }, [aActiveList, hActiveList]);

    const [results, setResults] = useState({});      // key → result
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [saveState, setSaveState] = useState('');
    // 네이버가 막았을 때 자동으로 쉬는 중인 상태 (남은 초, 몇 번째 대기인지)
    const [wait, setWait] = useState(null);
    const [typeTab, setTypeTab] = useState('학원');
    const numberLabel = typeTab === '교습소' ? '신고번호' : '등록번호';
    const [filter, setFilter] = useState('미이행');
    // 비고 칸에서 플레이스 주소를 받는 행 (행키) 과 입력값
    const [pinRow, setPinRow] = useState('');
    const [pinInput, setPinInput] = useState('');
    // 공동운영 학원을 눌러 찾아가는 행 (행키) — 잠깐 색을 입혔다 지운다
    const [jumpKey, setJumpKey] = useState('');
    const rowRefs = useRef(new Map());
    const stopRef = useRef(false);
    // 저장 여부를 판단할 때 최신 결과가 필요하다 (setState 갱신함수 안에서 부수효과를 내지 않으려고 ref 로 둔다)
    const resultsRef = useRef({});

    // 새로 조사한 결과에는 담당자가 적어둔 값이 없다. 시트는 Apps Script 가 지켜주지만
    // 화면까지 지워지면 방금 고친 파란 값이 사라진 것처럼 보인다 — 이어 붙여 준다.
    // 비고 단축주소로 찾아낸 플레이스는 지정 열에 굳혀 둔다 (pinResolvedPlace)
    const carryOver = (fresh) =>
        pinResolvedPlace(keepManual(fresh, resultsRef.current[recordKey(fresh.category, fresh.regNo)]));

    // 모바일에서는 학원명 열을 왼쪽에 고정하지 않는다 — 좁은 화면에서 옆의 O/X 칸을 가린다.
    // (헤더 위쪽 고정은 그대로 둔다)
    const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640);
    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < 640);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // 헤더 2행의 sticky top = 1행의 실제 높이. 고정값으로 두면 글꼴·확대율에 따라 겹치거나 벌어진다.
    const headRowRef = useRef(null);
    const [headRowH, setHeadRowH] = useState(37);
    useLayoutEffect(() => {
        const el = headRowRef.current;
        if (!el) return undefined;
        const update = () => setHeadRowH(el.getBoundingClientRect().height);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [loading]);

    // 저장된 결과 불러오기
    useEffect(() => {
        let alive = true;
        fetchSnsChecks().then(rows => {
            if (!alive) return;
            const map = {};
            rows.forEach(row => {
                const r = rowToResult(row);
                if (r.regNo) map[recordKey(r.category, r.regNo)] = r;
            });
            setResults(map);
            resultsRef.current = map;
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    const scoped = useMemo(
        () => targets.filter(t => t.category === typeTab),
        [targets, typeTab]);

    // 이미 찾아둔 플레이스 ID는 재조사 때 넘겨 검색 단계를 건너뛴다 (차단 위험·소요시간 감소).
    // 담당자가 직접 지정한 플레이스가 있으면 그쪽이 이긴다.
    const withResult = useMemo(
        () => scoped.map(t => {
            const result = results[recordKey(t.category, t.regNo)] || null;
            // 비고에 단축주소를 적어뒀으면 번호는 서버가 펴서 알아낸다 —
            // 예전에 잘못 잡아둔 플레이스를 그대로 넘기면 담당자가 알려준 주소가 무시된다.
            const hint = remarkPlaceHint(result);
            const placeId = hint.url ? '' : effectivePlaceId(result);
            const pinned = !!pinnedPlaceId(result) || !!hint.id;
            if (hint.url) return { target: { ...t, placeHint: hint.url, placePinned: true }, result };
            return { target: placeId ? { ...t, placeId, placePinned: pinned } : t, result };
        }),
        [scoped, results]);

    // 같은 블로그·플레이스를 함께 쓰는 학원 묶음 (학원·교습소를 가리지 않고 전체에서 찾는다)
    const groups = useMemo(() => buildGroups(results), [results]);
    // 같은 플레이스를 물고 있는데 묶음도 아닌 곳 — 지점을 잘못 잡았을 수 있다
    const dupPlaces = useMemo(() => placeDuplicates(results, groups), [results, groups]);

    const counts = useMemo(() => {
        const c = { 전체: withResult.length, 이행: 0, 미이행: 0, 확인불가: 0, 미조사: 0 };
        withResult.forEach(({ result }) => {
            if (!result) c.미조사++;
            else { const v = effectiveVerdict(result); c[v] = (c[v] || 0) + 1; }
        });
        return c;
    }, [withResult]);

    // 기본 조사 대상 — 한 번도 안 본 곳 + 조사한 지 오래된 곳
    const stale = useMemo(
        () => withResult.filter(x => needsRecheck(x.result)),
        [withResult]);

    const visible = useMemo(() => {
        if (filter === '전체') return withResult;
        if (filter === '미조사') return withResult.filter(x => !x.result);
        return withResult.filter(x => x.result && effectiveVerdict(x.result) === filter);
    }, [withResult, filter]);

    // ── 공동운영 학원으로 이동 ───────────────────────────
    // 상세화면으로 나가면 지금 보던 표(필터·스크롤)를 잃는다. 함께 운영하는 곳은
    // 같은 표에 나란히 있으니 이 표 안에서 그 행으로 옮겨 준다.
    const jumpToRow = (key) => {
        const cat = key.split('|')[0];
        const shown = visible.some(x => recordKey(x.target.category, x.target.regNo) === key);
        // 다른 구분(학원↔교습소)이거나 지금 필터에 걸려 안 보이는 곳이면 보이도록 풀어 준다 —
        // 눌렀는데 아무 일도 일어나지 않으면 고장으로 보인다
        if (cat && cat !== typeTab) setTypeTab(cat);
        if (!shown || cat !== typeTab) setFilter('전체');
        setJumpKey(key);
    };

    // 탭·필터가 바뀌어 그 행이 그려진 뒤에 옮겨 가야 한다 (visible 이 바뀌면 다시 시도)
    useEffect(() => {
        if (!jumpKey) return undefined;
        const el = rowRefs.current.get(jumpKey);
        if (!el) return undefined;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const t = setTimeout(() => setJumpKey(''), 2500);
        return () => clearTimeout(t);
    }, [jumpKey, visible]);

    const lastCheckedAt = useMemo(() => {
        let latest = '';
        Object.values(results).forEach(r => { if (r.checkedAt > latest) latest = r.checkedAt; });
        return latest;
    }, [results]);

    // ── 자동조사 실행 ───────────────────────────────────
    const runProbe = useCallback(async (list, label) => {
        if (!list.length) return;
        stopRef.current = false;
        setRunning(true);
        setSaveState('');
        setWait(null);
        setProgress({ done: 0, total: list.length });

        // 조사가 오래 걸리므로(수백 곳) 청크가 끝날 때마다 곧바로 시트에 저장한다.
        // 중간에 탭을 닫거나 통신이 끊겨도 그때까지의 결과는 남는다.
        let saveQueue = Promise.resolve();
        let savedCount = 0;
        let saveError = '';
        let heldBack = 0;   // 플레이스 상세 제한으로 반쪽만 본 결과 — 기존 판정을 지키려고 버린 수

        const { blocked, blockedReason, skipped } = await probeAll(list, region, {
            shouldStop: () => stopRef.current,
            onWait: (left, nth, reason) => setWait(left ? { left, nth, reason } : null),
            onProgress: (done, total, chunk) => {
                setProgress({ done, total });
                if (!chunk.length) return;
                // 네이버 플레이스 상세가 제한 중이면 소개글을 못 읽어 교습비·번호를 확정할 수 없다.
                // 그 반쪽 결과로 이미 제대로 조사해 둔 학원을 덮으면 멀쩡한 '이행'이 '확인불가'가 된다.
                // 아직 한 번도 안 본 학원은 반쪽이라도 없는 것보다 낫다.
                const usable = chunk.filter(r => !r.partial || !resultsRef.current[recordKey(r.category, r.regNo)]);
                heldBack += chunk.length - usable.length;
                if (!usable.length) return;

                // 이어 붙인 값(비고 주소로 굳힌 플레이스지정 포함)을 그대로 저장해야 시트에 남는다.
                // 조사 결과 원본만 보내면 방금 굳힌 지정이 사라져 다음 조사 때 또 단축주소를 편다.
                const merged = usable.map(carryOver);
                const next = { ...resultsRef.current };
                merged.forEach(r => { next[recordKey(r.category, r.regNo)] = r; });
                resultsRef.current = next;
                setResults(next);

                // 저장은 순차 처리(동시 쓰기로 시트 행이 꼬이지 않도록)
                saveQueue = saveQueue.then(async () => {
                    try {
                        await saveSnsChecks(merged.map(resultToRecord));
                        savedCount += usable.length;
                        setSaveState(`저장됨 ${savedCount}곳`);
                    } catch (err) {
                        saveError = err.message;
                    }
                });
            },
        });

        await saveQueue;
        setRunning(false);
        setWait(null);

        if (blocked) {
            setSaveState(`⛔ ${savedCount}곳까지 저장 후 중단 — 네이버 차단이 오래 풀리지 않습니다 (${blockedReason}). `
                + `한참 뒤에 "조사 필요 …곳" 버튼으로 이어서 진행하세요. 남은 학원은 덮어쓰지 않았습니다.`);
            return;
        }
        // 플레이스 상세는 IP당 제한이 빡빡해 일부는 이번에 못 볼 수 있다. 배치를 세우지 않고 지나간 몫이다.
        const leftover = (skipped || 0) + heldBack;
        const leftoverMsg = leftover
            ? ` (${leftover}곳은 네이버 플레이스 상세가 제한 중이라 이번엔 건너뛰었습니다 — 기존 결과는 그대로입니다. 잠시 뒤 다시 돌리면 채워집니다)`
            : '';
        if (!savedCount && !saveError) {
            if (leftover) setSaveState(`이번에는 새로 저장한 곳이 없습니다.${leftoverMsg}`);
            return;
        }
        setSaveState(saveError
            ? `⚠ 일부 저장 실패: ${saveError} (저장 ${savedCount}곳, 화면 결과는 유지됩니다)`
            : `✓ ${label} ${savedCount}곳 저장 완료${leftoverMsg}`);
    }, [region]);

    const runStale = () => runProbe(stale.map(x => x.target), typeTab);
    const runAll = () => runProbe(withResult.map(x => x.target), `${typeTab} 전체`);
    // pin: 단축주소로 조사한 경우처럼, 찾아낸 플레이스를 지정 열에 굳혀야 할 때
    const runOne = async (target, { pin = false } = {}) => {
        setRunning(true);
        setSaveState('');
        const { results: [r], blocked, blockedReason } = await probeAll([target], region, { autoResume: false });
        setRunning(false);
        if (blocked || !r) {
            setSaveState(`⛔ 네이버가 요청을 일시 차단했습니다 (${blockedReason || '차단'}). 잠시 후 다시 시도하세요.`);
            return;
        }
        const key = recordKey(r.category, r.regNo);
        if (r.partial && resultsRef.current[key]) {
            setSaveState('지금은 네이버 플레이스 상세가 제한 중이라 소개글을 읽지 못했습니다 — 기존 결과를 그대로 둡니다. 잠시 뒤 다시 눌러 주세요.');
            return;
        }
        let merged = carryOver(r);
        const foundId = String(r.플레이스ID || '').trim();
        // 지정 열에는 주소를 통째로 남긴다 — 시트를 열어 본 사람도 바로 눌러 확인할 수 있어야 한다
        if (pin && foundId && !pinnedPlaceId(merged)) merged = { ...merged, 플레이스지정: placeUrlFromId(foundId) };
        const next = { ...resultsRef.current, [key]: merged };
        resultsRef.current = next;
        setResults(next);
        try { await saveSnsChecks([resultToRecord(merged)]); } catch { /* 화면 결과는 유지 */ }
    };

    // ── 비고 칸에서 플레이스 주소 지정 ───────────────────
    // 이름으로 못 찾는 곳(확인불가)이 많아 시트를 오가지 않고 표에서 바로 넣는다.
    // 값은 시트 '플레이스지정'(AB열)에 남는다 — 상세 패널의 '직접 지정' 과 같은 자리다.
    // raw 를 넘기면 칸에 적지 않고 바로 지정한다 ('이 플레이스 맞음' 버튼이 그렇게 쓴다)
    const savePlacePin = async (target, raw = pinInput) => {
        const parsed = parsePlaceInput(raw);
        if (!parsed.id && !parsed.url) {
            setSaveState('⚠ 플레이스 주소에서 번호를 찾지 못했습니다. 네이버플레이스 주소를 그대로 붙여넣어 주세요.');
            return;
        }
        const key = recordKey(target.category, target.regNo);
        setPinRow('');
        setPinInput('');
        setSaveState('플레이스를 지정하고 다시 조사합니다…');

        // 번호를 바로 아는 경우엔 조사보다 먼저 저장한다 — 네이버가 막혀도 지정은 남는다.
        // (단축주소는 펴 봐야 번호를 알 수 있어 조사 뒤에 굳힌다)
        if (parsed.id) {
            const base = resultsRef.current[key]
                || { category: target.category, regNo: target.regNo, name: target.name, 판정: '', checkedAt: '' };
            const updated = { ...base, 플레이스지정: placeUrlFromId(parsed.id) };
            const next = { ...resultsRef.current, [key]: updated };
            resultsRef.current = next;
            setResults(next);
            try { await saveSnsChecks([resultToRecord(updated)]); }
            catch (err) { setSaveState(`⚠ 지정을 저장하지 못했습니다: ${err.message}`); return; }
        }
        await runOne(
            { ...target, placeId: parsed.id, placeHint: parsed.url, placePinned: true },
            { pin: !!parsed.url });
    };

    const clearPlacePin = async (target, result) => {
        if (!result) return;
        const key = recordKey(result.category, result.regNo);
        // 빈 값으로 보내면 Apps Script 가 '안 넘어온 것'으로 보고 기존 값을 지킨다 — 해제 표시를 남긴다
        const updated = { ...result, 플레이스지정: PIN_CLEARED };
        const next = { ...resultsRef.current, [key]: updated };
        resultsRef.current = next;
        setResults(next);
        setSaveState('지정을 풀고 이름으로 다시 찾습니다…');
        try { await saveSnsChecks([resultToRecord(updated)]); }
        catch (err) { setSaveState(`⚠ 해제를 저장하지 못했습니다: ${err.message}`); return; }
        // 저장된 플레이스도 무시해야 새로 검색한다 (그대로 두면 잘못 잡은 그 곳을 다시 물고 온다)
        await runOne({ ...target, placeId: '', placeHint: '', placePinned: false });
    };

    // ── 칸을 눌러 직접 확인한 값 넣기 ────────────────────
    // 자동값 → O → X → 자동값. 시트의 '수동확인' 칸에 남아 다시 조사해도 유지된다.
    const cycleCell = async (result, key) => {
        if (!result) return;   // 아직 조사 안 한 학원은 시트에 행이 없다
        const rowKey = recordKey(result.category, result.regNo);
        const updated = applyManualCell(result, key);
        const value = parseManual(updated)[key];

        // 같은 블로그·플레이스를 함께 쓰는 학원은 '교습비를 올렸는가'가 한 몸이다 — 같이 반영한다.
        // 번호는 학원마다 자기 번호가 게시돼 있어야 하므로 전파하지 않는다.
        const shared = sharedCellTargets(resultsRef.current, result, key, groups);
        const before = resultsRef.current;
        const nextResults = { ...before, [rowKey]: updated };
        const records = [resultToRecord(updated)];
        shared.forEach(({ rowKey: k, result: r, key: cell }) => {
            const u = setManualCell(r, cell, value);
            nextResults[k] = u;
            records.push(resultToRecord(u));
        });

        resultsRef.current = nextResults;
        setResults(nextResults);
        setSaveState(shared.length
            ? `같은 채널을 쓰는 ${shared.map(s => s.name).join('·')} 에도 함께 반영했습니다 (교습비만).`
            : '');

        try {
            await saveSnsChecks(records);
        } catch (err) {
            // 저장이 안 됐는데 화면만 바뀌어 있으면 고쳤다고 착각하게 된다 — 되돌린다
            resultsRef.current = before;
            setResults(before);
            setSaveState(`⚠ 직접 입력한 값을 저장하지 못했습니다: ${err.message}`);
        }
    };

    // ── 미이행 연락처 엑셀 ──────────────────────────────
    const downloadNonCompliantExcel = () => {
        // 화면 집계·필터와 같은 기준(교습비 + 직접 고친 값)으로 뽑는다
        const items = withResult.filter(x => x.result && effectiveVerdict(x.result) === '미이행');
        if (!items.length) return;
        const rows = items.map(({ target, result }, i) => ({
            '순번': i + 1,
            '학원명': target.name,
            [numberLabel]: target.regNo,
            '설립자': target.founderName,
            '연락처': target.contact,
            '미이행사유': result.미이행사유 || '',
            '플레이스 교습비': result.플레이스_교습비 || '',
            '플레이스 게시형태': result.플레이스_게시형태 || '',
            [`플레이스 ${numberLabel}`]: result.플레이스_번호 || '',
            '플레이스 기재번호': result.플레이스_기재번호 || '',
            '블로그': result.블로그 || '',
            '블로그 교습비': result.블로그_교습비 || '',
            [`블로그 ${numberLabel}`]: result.블로그_번호 || '',
            '블로그 기재번호': result.블로그_기재번호 || '',
            // 플레이스 홈에 걸린 링크 전체 (블로그·홈페이지·인스타그램…)
            '연결채널': parseChannels(result)
                .map(c => `${c.유형} 교습비${c.교습비}/번호${c.번호} ${c.url}`).join('\n'),
            '플레이스URL': result.플레이스URL || '',
            '확인일시': fmtWhen(result.checkedAt),
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 40 },
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 50 }, { wch: 40 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, typeTab);
        const d = new Date();
        const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        XLSX.writeFile(wb, `SNS미이행_${region}_${typeTab}_${ymd}.xlsx`);
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>저장된 점검 결과를 불러오는 중…</div>;
    }

    return (
        <div>
            {/* 안내 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px', border: '1px solid var(--border-color)', marginBottom: '12px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '6px' }}>📣 네이버 교습비·등록번호 게시점검</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    네이버플레이스의 가격 메뉴·가격표 이미지·소개글과, <b>플레이스 홈에 링크된 블로그·홈페이지·카페·인스타그램</b>을
                    자동으로 조사해 교습비와 등록(신고)번호 게시 여부를 확인합니다. 링크가 없는 채널은 따로 검색하지 않습니다.
                    <b> 이행·미이행은 교습비만으로 판정</b>합니다 — 등록(신고)번호 미게시는 시정명령 사항이라
                    칸에 X 로 보여주되 미이행으로는 잡지 않습니다.
                    <b> 자동 판정이므로 확정 위반이 아니라 안내·점검 우선순위 참고 자료</b>이며,
                    동명 학원이나 지점이 있으면 <b>확인불가</b>로 남습니다.
                    <b> 학원명을 누르면</b> 그 학원의 상세화면으로 이동합니다 (SNS 탭에서 판정 근거를 전부 볼 수 있습니다).
                    비고의 <b style={{ color: '#7c3aed' }}>공동운영</b> 학원명을 누르면 화면을 나가지 않고 <b>이 표의 그 학원 행</b>으로 옮겨 갑니다.
                    <br /><b>직접 확인해 고치기</b> — O/X 칸을 누르면 <b>자동값 → O → X → 자동값</b> 으로 바뀝니다.
                    직접 넣은 값은 <b style={{ color: '#2563eb' }}>파란색</b> 으로 보이고, <b>다시 조사해도 덮이지 않으며</b> 미이행·이행 집계에도 반영됩니다.
                    {lastCheckedAt && <><br />최근 조사: <b>{fmtWhen(lastCheckedAt)}</b></>}
                </div>
            </div>

            {/* 조작부 */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '12px 14px', border: '1px solid var(--border-color)', marginBottom: '12px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    <Chip label={`🏫 학원 ${aActiveList.length}`} active={typeTab === '학원'} onClick={() => setTypeTab('학원')} color="#3b82f6" />
                    <Chip label={`🏠 교습소 ${hActiveList.length}`} active={typeTab === '교습소'} onClick={() => setTypeTab('교습소')} color="#8b5cf6" />
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {FILTERS.map(f => (
                        <Chip key={f} label={f} count={counts[f] || 0} active={filter === f}
                            onClick={() => setFilter(f)} color={VERDICT_COLOR[f]} />
                    ))}
                </div>

                {running ? (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>조사 중… {progress.done} / {progress.total}</span>
                            <button onClick={() => { stopRef.current = true; }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' }}>중단</button>
                        </div>
                        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: wait ? '#f59e0b' : 'var(--primary)', transition: 'width .3s' }} />
                        </div>
                        {wait && (
                            <div style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: '6px', lineHeight: 1.7 }}>
                                ⏸ 네이버가 요청을 잠시 막았습니다 — <b>{fmtLeft(wait.left)} 뒤 자동으로 이어서 진행</b>합니다 ({wait.nth}번째 대기).
                                <br />여기 계실 필요 없습니다. 탭만 열어두시면 끝까지 알아서 돕니다. 지금까지 결과는 이미 저장돼 있습니다.
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button onClick={runStale} disabled={!stale.length} style={btnStyle(stale.length ? 'var(--primary)' : 'var(--border-color)')}>
                            🔍 조사 필요 {stale.length}곳
                        </button>
                        <button onClick={runAll} style={btnStyle('#64748b')}>전체 다시 조사 ({scoped.length}곳)</button>
                        {counts.미이행 > 0 && <button onClick={downloadNonCompliantExcel} style={btnStyle('#ef4444')}>📥 미이행 연락처 ({counts.미이행})</button>}
                    </div>
                )}
                {saveState && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>{saveState}</div>}
                {!running && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.7 }}>
                        <b>조사 필요</b> = 한 번도 안 본 곳 + 조사한 지 {RECHECK_DAYS}일 지난 곳
                        + 예전 방식으로 조사해 번호가 <b>오기재로 잘못 남은 곳</b>. 게시 상태는 자주 바뀌지 않아서,
                        최근에 본 곳까지 매번 다시 도는 것이 네이버 차단의 가장 큰 원인이었습니다.
                        {stale.length > 30 && <> 지금 대상은 약 {Math.ceil(stale.length * 10 / 60)}분 걸립니다.</>}
                        <br />네이버가 막으면 <b>화면이 알아서 기다렸다 이어서 진행</b>합니다. 지켜보실 필요 없이 탭만 열어두시면 됩니다.
                    </div>
                )}
            </div>

            {/* 결과 표 — 헤더 2줄은 위에, 연번·학원명은 왼쪽에 고정된다 */}
            <div style={{
                background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)',
                overflowX: 'auto', overflowY: 'auto', maxHeight: '72vh', boxShadow: 'var(--shadow-sm)',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '1740px' }}>
                    {/* 열 너비는 여기서 정한다 — 자동 배분에 맡기면 '비고' 가 짜부라져 행이 10줄로 늘어난다.
                        너비를 주지 않은 '비고' 가 남는 폭을 모두 가져간다. */}
                    <colgroup>
                        <col style={{ width: `${W_NUM}px` }} />
                        <col style={{ width: `${W_NAME}px` }} />
                        <col style={{ width: '76px' }} />
                        {Array.from({ length: CH_GROUPS.length * 2 }, (_, i) => <col key={i} style={{ width: `${W_CH}px` }} />)}
                        <col style={{ width: '130px' }} />
                        <col />
                        <col style={{ width: '118px' }} />
                        <col style={{ width: '84px' }} />
                    </colgroup>
                    <thead>
                        {/* 1행: 채널 묶음 */}
                        <tr ref={headRowRef}>
                            {/* 좁은 화면에서는 왼쪽 고정을 풀어 옆 칸이 가려지지 않게 한다 */}
                            <Th rowSpan={2} left={isNarrow ? undefined : 0} center>#</Th>
                            <Th rowSpan={2} left={isNarrow ? undefined : W_NUM}>학원명</Th>
                            <Th rowSpan={2}>{numberLabel}</Th>
                            <Th colSpan={2} center>플레이스</Th>
                            {BUCKETS.map(b => <Th key={b} colSpan={2} center>{BUCKET_LABEL[b]}</Th>)}
                            <Th rowSpan={2}>링크</Th>
                            <Th rowSpan={2}>비고</Th>
                            <Th rowSpan={2}>전화번호</Th>
                            <Th rowSpan={2} center>새로고침</Th>
                        </tr>
                        {/* 2행: 묶음별 항목 */}
                        <tr>
                            {CH_GROUPS.map(g => [
                                <Th key={`${g}-no`} top={headRowH} center tight>{numberLabel}</Th>,
                                <Th key={`${g}-fee`} top={headRowH} center tight>교습비</Th>,
                            ])}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.length === 0 && (
                            <tr><td colSpan={7 + CH_GROUPS.length * 2} style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                해당하는 {typeTab}이(가) 없습니다.
                            </td></tr>
                        )}
                        {visible.map(({ target, result }, i) => {
                            const channels = parseChannels(result);
                            const at = assignBuckets(channels);
                            const rowKey = recordKey(target.category, target.regNo);
                            // 공동운영에서 눌러 찾아온 행 — 어디로 왔는지 잠깐 보여준다
                            const rowBg = rowKey === jumpKey ? '#ede9fe' : i % 2 === 0 ? BG_ROW : BG_STRIPE;
                            const academy = academyByKey.get(rowKey);
                            const dup = dupPlaces.get(rowKey);
                            const group = groups.get(rowKey);
                            // 같은 플레이스·블로그를 쓰는 다른 학원 (이름 + 이동할 학원 객체)
                            // (members 와 names 는 buildGroups 에서 같은 순서로 쌓인다)
                            const siblings = (group?.members || [])
                                .map((m, mi) => ({ key: m, name: group.names[mi] || m.split('|')[1], academy: academyByKey.get(m) }))
                                .filter(x => x.key !== rowKey);
                            const remark = snsRemark(result, dup);
                            const cells = rowCells(result);
                            const pinned = pinnedPlaceId(result);
                            // 플레이스를 물고 오긴 했는데 상호가 달라 자동 확정을 못 한 행 —
                            // 주소를 찾아 붙여넣을 것 없이 '맞다'만 눌러 주면 된다
                            const unconfirmedPlace = !!result && result.matchStatus !== 'matched'
                                && hasPlaceCandidate(result) && !pinned;
                            // 지금 이 학원의 플레이스로 쓰는 주소 — 상세화면·구글시트와 같은 값이다
                            const curUrl = result ? currentPlaceUrl(result) : '';
                            return (
                                <tr key={rowKey}
                                    ref={(el) => { if (el) rowRefs.current.set(rowKey, el); else rowRefs.current.delete(rowKey); }}
                                    style={{ background: rowBg }}>
                                    <Td style={{ ...(isNarrow ? { background: rowBg } : stickyTd(0, rowBg)), color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>{i + 1}</Td>
                                    <Td style={{ ...(isNarrow ? { background: rowBg } : stickyTd(W_NUM, rowBg)), wordBreak: 'keep-all' }}>
                                        {academy && onSelectAcademy ? (
                                            <span onClick={() => onSelectAcademy(academy)}
                                                style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                                                {target.name}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>{target.name}</span>
                                        )}
                                        {result?.플레이스명 && result.플레이스명 !== target.name && (
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>→ {result.플레이스명}</div>
                                        )}
                                    </Td>
                                    <Td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{target.regNo}</Td>

                                    {cells.map(c => (
                                        <Td key={c.key}
                                            style={{ ...CENTER, cursor: result ? 'pointer' : 'default', userSelect: 'none' }}
                                            onClick={result ? () => cycleCell(result, c.key) : undefined}
                                            title={result ? '눌러서 직접 확인한 값으로 바꿉니다 (자동값 → O → X → 자동값)' : undefined}>
                                            <OxBadge value={c.value} manual={c.manual !== undefined} />
                                        </Td>
                                    ))}

                                    <Td>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                            <a href={result?.플레이스URL || placeSearchUrl(target.name, region)} target="_blank" rel="noreferrer" style={linkStyle}>
                                                {result?.플레이스URL ? '플레이스' : '플레이스검색'}
                                            </a>
                                            {/* 플레이스 홈에 걸린 링크들 — 실제로 조사한 대상이다 */}
                                            {channels.map((c, ci) => (
                                                <a key={`${c.url}-${ci}`} href={c.url} target="_blank" rel="noreferrer" style={linkStyle}>
                                                    {BUCKET_LABEL[at[ci]]}
                                                </a>
                                            ))}
                                            {!result && <a href={blogSearchUrl(target.name, region)} target="_blank" rel="noreferrer" style={linkStyle}>블로그검색</a>}
                                        </div>
                                    </Td>
                                    <Td style={{ fontSize: '0.8rem', color: '#ef4444', wordBreak: 'keep-all' }}>
                                        {/* 공동 운영(플레이스·블로그를 함께 쓰는 곳) — 어느 학원인지 이름을 다 보여주고
                                            누르면 이 표의 그 학원 행으로 옮겨 간다 (상세화면으로 나가지 않는다).
                                            학원명 칸은 좁아 이름이 잘려 보이지 않았다. */}
                                        {siblings.length > 0 && (
                                            <div style={{ color: '#7c3aed', fontWeight: '600', marginBottom: '4px' }}>
                                                🔗 공동운영: {siblings.map((sib, si) => (
                                                    <span key={sib.key}>
                                                        {si > 0 && ' · '}
                                                        {sib.academy
                                                            ? <span onClick={() => jumpToRow(sib.key)}
                                                                title={`이 표의 ${sib.name} 행으로 이동합니다`}
                                                                style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{sib.name}</span>
                                                            : sib.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {remark}
                                        {dup && result && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                함께 운영하는 곳이 아니라면 아래 <b>플레이스 지정</b> 으로 바로잡아 주세요
                                            </div>
                                        )}
                                        {/* 이름으로 못 찾거나 엉뚱한 곳을 잡았을 때 — 주소를 여기서 바로 넣는다.
                                            값은 시트 '플레이스지정'(AB열)에 남아 다시 조사해도 유지된다. */}
                                        <div style={{ marginTop: remark ? '5px' : 0 }}>
                                            {/* 지금 무엇으로 조사하고 있는지 — 이 값이 곧 상세화면·시트의 '플레이스지정' 이다 */}
                                            {curUrl && (
                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                                    📍 조사에 쓰는 플레이스{' '}
                                                    {/* 비고 칸이 좁아 주소를 통째로 두면 번호 한가운데서 줄이 잘린다.
                                                        전체 주소는 툴팁과, '플레이스 지정'을 눌렀을 때 입력칸에 그대로 들어 있다. */}
                                                    <a href={curUrl} target="_blank" rel="noreferrer" title={curUrl} style={linkStyle}>
                                                        #{parsePlaceId(curUrl)}
                                                    </a>{' '}
                                                    <span style={{ color: pinned ? '#2563eb' : 'var(--text-muted)' }}>({placeSource(result)})</span>
                                                </div>
                                            )}
                                            {pinRow === rowKey ? (
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <input autoFocus value={pinInput}
                                                        onChange={(e) => setPinInput(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') savePlacePin(target);
                                                            if (e.key === 'Escape') { setPinRow(''); setPinInput(''); }
                                                        }}
                                                        placeholder="네이버플레이스 주소 붙여넣기"
                                                        style={{
                                                            flex: '1 1 150px', minWidth: 0, padding: '5px 8px', fontSize: '0.78rem',
                                                            border: '1px solid var(--border-color)', borderRadius: '7px',
                                                            background: 'var(--bg-card)', color: 'var(--text-main)',
                                                        }} />
                                                    <button onClick={() => savePlacePin(target)} disabled={running} style={{
                                                        padding: '5px 10px', borderRadius: '7px', border: 'none',
                                                        background: running ? 'var(--border-color)' : 'var(--primary)',
                                                        color: 'white', fontSize: '0.76rem', fontWeight: '700',
                                                        cursor: running ? 'default' : 'pointer', whiteSpace: 'nowrap',
                                                    }}>지정</button>
                                                    <button onClick={() => { setPinRow(''); setPinInput(''); }} style={{
                                                        background: 'none', border: 'none', color: 'var(--text-muted)',
                                                        fontSize: '0.76rem', cursor: 'pointer',
                                                    }}>취소</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {unconfirmedPlace && (
                                                        <button onClick={() => savePlacePin(target, result.플레이스ID)} disabled={running}
                                                            title={`검색된 업체: ${result.플레이스명 || result.플레이스ID} — 이 학원이 맞으면 눌러 확정하세요 (확정해야 판정이 나옵니다)`}
                                                            style={{
                                                                background: 'none', border: '1px solid #10b981', borderRadius: '6px',
                                                                padding: '3px 7px', color: '#10b981', fontSize: '0.74rem',
                                                                fontWeight: '700', cursor: running ? 'default' : 'pointer', whiteSpace: 'nowrap',
                                                            }}>✔ 이 플레이스 맞음</button>
                                                    )}
                                                    <button onClick={() => { setPinRow(rowKey); setPinInput(curUrl); }}
                                                        title="네이버플레이스 주소(또는 지도앱 공유주소)를 넣으면 그 플레이스로 조사합니다"
                                                        style={{
                                                            background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px',
                                                            padding: '3px 7px', color: '#3b82f6', fontSize: '0.74rem',
                                                            fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
                                                        }}>📍 {pinned ? '플레이스 바꾸기' : '플레이스 지정'}</button>
                                                    {pinned && (
                                                        <button onClick={() => clearPlacePin(target, result)} disabled={running} style={{
                                                            background: 'none', border: 'none', color: 'var(--text-muted)',
                                                            fontSize: '0.74rem', fontWeight: '600',
                                                            cursor: running ? 'default' : 'pointer', textDecoration: 'underline',
                                                        }}>지정 해제</button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </Td>
                                    <Td style={{ whiteSpace: 'nowrap' }}>
                                        {target.contact
                                            ? <a href={`tel:${target.contact}`} style={{ ...linkStyle, fontSize: '0.84rem' }}>{target.contact}</a>
                                            : <span style={{ color: 'var(--text-muted)' }}>–</span>}
                                    </Td>
                                    <Td style={CENTER}>
                                        <button onClick={() => runOne(target)} disabled={running} style={{
                                            background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px',
                                            padding: '5px 9px', color: running ? 'var(--text-muted)' : '#0ea5e9',
                                            fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap',
                                            cursor: running ? 'default' : 'pointer',
                                        }}>새로고침</button>
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const btnStyle = (bg) => ({
    padding: '8px 14px', borderRadius: '8px', border: 'none', background: bg,
    color: 'white', fontSize: '0.84rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
});

const linkStyle = { color: '#3b82f6', fontWeight: '600', textDecoration: 'none' };
const CENTER = { textAlign: 'center' };

// 가로로 스크롤해도 남는 왼쪽 고정 칸 — 배경이 투명하면 뒤 칸이 비쳐 보인다
const stickyTd = (left, background) => ({ position: 'sticky', left, zIndex: 2, background });
