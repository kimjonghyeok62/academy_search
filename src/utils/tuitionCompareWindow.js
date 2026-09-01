// 신고 교습비 대조창 — SNS 점검표에서 학원 하나를 새 탭에 띄운다.
//
// 왜 필요한가: 점검표는 '교습비를 올렸는가'를 O/X 로만 보여준다. 담당자가 정작 알고 싶은 것은
// 한 걸음 안쪽, '올려는 놨는데 그 금액이 신고한 교습비와 같은가' 다. 지금까지는 그걸 보려면
// 표를 떠나 상세화면이나 구글시트를 열어야 했고, 돌아오면 보던 필터·스크롤을 잃었다.
//
// 자동으로 맞춰 줄 수는 없다 — 조사 서버는 금액을 저장하지 않고 게시 여부(O/X/?)와
// 어디에 올렸는지(가격메뉴·가격표이미지·소개글)만 남긴다 (api/_lib/naverProbe.js).
// 그래서 이 창은 판정을 대신하지 않고, 눈으로 맞춰 보는 일이 한 화면에서 끝나게 돕는다:
// 신고 금액을 펼쳐 보이고, 어느 채널의 어디를 열어야 하는지 짚어 주고, 그 링크를 바로 연다.

import {
    sortCourses, fmtNum, parseNum, getWeeklyTotalMinutes, calcWeeklySchedule, openHtmlWindow,
} from './generateTuitionPDF';
import {
    rowCells, parseChannels, assignBuckets, effectiveVerdict, currentPlaceUrl,
    placeSearchUrl, shortAddress, cellKey, BUCKETS, BUCKET_LABEL, VERDICT_COLOR,
} from './snsCheck';

// 학원명·과목명·비고는 시트에서 온 자유 텍스트다. '<' 하나가 섞이면 문서가 통째로 깨진다.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// 게시표(외부용)와 같은 항목·같은 순서 — 두 화면이 다른 금액을 보이면 어느 쪽이 맞는지 알 수 없다
const OTHER_FEES = [
    { label: '모의고사비', key: 'mockExamFee' },
    { label: '재료비', key: 'materialFee' },
    { label: '피복비', key: 'clothingFee' },
    { label: '급식비', key: 'mealFee' },
    { label: '기숙사비', key: 'dormitoryFee' },
    { label: '차량비', key: 'vehicleFee' },
];

const won = (n) => `${n.toLocaleString('ko-KR')}원`;

const fmtWhen = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 16).replace('T', ' ');
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 월 교습비가 얼마부터 얼마까지인지 — 네이버에 뜬 금액이 이 밖이면 그것만으로 걸러진다 */
function feeRange(courses) {
    const nums = courses.map((c) => parseNum(c.tuitionFee || c.totalFee)).filter((n) => n > 0);
    if (!nums.length) return '';
    const min = Math.min(...nums), max = Math.max(...nums);
    return min === max ? `월 ${won(min)}` : `월 ${won(min)} ~ ${won(max)}`;
}

/**
 * 교습시간 칸 — '주5회 · 회당 60분' + 총교습시간.
 *
 * 주의: 시트가 신고받은 값은 '총교습시간(분/월)' 하나뿐이다. 회수·회당 분은 거기서
 * 되짚은 추정치라(게시표의 calcWeeklyMinutes 와 같은 계산) 같은 총량에 여러 조합이 맞는다.
 * 게시표는 곱만 보여줘서 이 사실이 드러나지 않았지만 여기서는 회수를 그대로 내보이므로,
 * 신고받은 값과 추정한 값을 눈에 띄게 갈라 둔다 — 추정을 신고값으로 읽으면 엉뚱한 지적이 된다.
 */
function timeCell(c) {
    const total = fmtNum(c.totalTime);
    const s = calcWeeklySchedule(c.totalTime);
    const weeklyTotal = c.weeklyScheduleStr ? getWeeklyTotalMinutes(c.weeklyScheduleStr) : (s && s.sessions * s.minutes);
    const head = total ? `총 ${esc(total)}분/월` : '<span class="dim">–</span>';
    if (!s) return head;
    return `${head}<div class="sub">≈ 주${s.sessions}회 · 회당 ${s.minutes}분`
        + `${weeklyTotal ? ` (주당 ${weeklyTotal}분)` : ''}<span class="guess">추정</span></div>`;
}

/** 기타경비 칸 — 0 이 아닌 항목만 */
function otherFeeCell(c) {
    const items = OTHER_FEES.filter((it) => parseNum(c[it.key]) > 0);
    if (!items.length) return '<span class="dim">–</span>';
    const sum = items.reduce((s, it) => s + parseNum(c[it.key]), 0);
    const list = items.map((it) => `${it.label} ${fmtNum(c[it.key])}`).join(' · ');
    return `${esc(list)}<div class="sub">합계 ${esc(sum.toLocaleString('ko-KR'))}원</div>`;
}

function courseTable(courses) {
    if (!courses.length) {
        return `<p class="empty">신고된 교습과정이 없습니다 — 구글시트에 이 학원의 교습비 자료가 없습니다.</p>`;
    }
    const rows = courses.map((c) => {
        const fee = parseNum(c.tuitionFee || c.totalFee);
        return `<tr>
      <td>${esc([c.process, c.subject].filter(Boolean).join(' / ')) || '<span class="dim">–</span>'}</td>
      <td class="mid">${timeCell(c)}</td>
      <td class="num"><strong>${fee > 0 ? esc(won(fee)) : '<span class="dim">–</span>'}</strong></td>
      <td class="mid">${otherFeeCell(c)}</td>
    </tr>`;
    }).join('');
    return `<table class="grid">
    <thead><tr><th>교습과정 / 교습과목</th><th>교습시간</th><th>월 교습비</th><th>기타경비</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note">신고받은 값은 <b>총교습시간(분/월)</b> 하나입니다. 주 회수·회당 분은 거기서 되짚은 <b>추정</b>이라
  같은 총량에 다른 조합도 들어맞습니다 — 회수가 다르다는 것만으로 지적하지 마세요.</p>`;
}

const OX_CLASS = { O: 'ox-o', X: 'ox-x' };
const oxBadge = (cell) => {
    const v = cell ? cell.value : '';
    if (!v) return '<span class="dim">아직 조사 전</span>';
    if (v === '없음') return '<span class="dim">링크 없음</span>';
    if (v === '안함') return '<span class="dim">자동 조사 안 함</span>';
    const manual = cell.manual !== undefined;
    return `<span class="ox ${OX_CLASS[v] || 'ox-q'}${manual ? ' ox-manual' : ''}">${esc(v)}</span>`
        + (manual ? '<span class="tag">직접 확인함</span>' : '');
};

const openBtn = (url, label) =>
    `<a class="open" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)} ↗</a>`;

/** 네이버에 무엇이 어떻게 올라와 있는지 — 대조할 상대편 */
function channelTable(result, academyName, region) {
    if (!result) {
        return `<p class="empty">아직 자동 조사를 하지 않은 학원입니다.
      ${openBtn(placeSearchUrl(academyName, region), '네이버에서 찾아보기')}</p>`;
    }
    const cells = new Map(rowCells(result).map((c) => [c.key, c]));
    const chs = parseChannels(result);
    const at = assignBuckets(chs);
    const byBucket = {};
    chs.forEach((c, i) => {
        if (!byBucket[at[i]]) byBucket[at[i]] = [];
        byBucket[at[i]].push(c);
    });

    const placeUrl = currentPlaceUrl(result);
    const rows = [`<tr>
    <td><strong>플레이스</strong></td>
    <td class="mid">${oxBadge(cells.get(cellKey('place', '교습비')))}</td>
    <td>${esc(result.플레이스_게시형태 || '') || '<span class="dim">–</span>'}</td>
    <td>${placeUrl ? openBtn(placeUrl, '플레이스 열기') : `<span class="dim">주소 없음</span>`}</td>
  </tr>`];

    BUCKETS.forEach((b) => {
        const list = byBucket[b];
        if (!list || !list.length) return;   // 플레이스 홈에 링크가 없는 채널은 조사 대상이 아니다
        const where = [...new Set(list.map((c) => [c.조사범위, c.비고].filter(Boolean).join(' — ')))]
            .filter(Boolean).join(' / ');
        rows.push(`<tr>
      <td><strong>${esc(BUCKET_LABEL[b])}</strong>${list.length > 1 ? `<span class="sub">${list.length}곳</span>` : ''}</td>
      <td class="mid">${oxBadge(cells.get(cellKey(b, '교습비')))}</td>
      <td>${esc(where) || '<span class="dim">–</span>'}</td>
      <td>${list.map((c, i) => openBtn(c.url, list.length > 1 ? `열기 ${i + 1}` : '열기')).join(' ')}</td>
    </tr>`);
    });

    return `<table class="grid">
    <thead><tr><th>채널</th><th>교습비 게시</th><th>어디에 올렸나</th><th></th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  <p class="note">플레이스 홈에 링크가 걸린 채널만 조사합니다 — 링크가 없는 채널은 위에 나오지 않습니다.</p>`;
}

/**
 * 대조창 HTML 을 만든다 (열지는 않는다).
 * 여는 일과 나눠 둔 이유: 브라우저 없이도 값·이스케이프를 확인할 수 있어야 한다.
 */
export function buildTuitionCompareHtml(academy, result, { region = '', numberLabel } = {}) {
    const a = academy || {};
    const category = (a.category || result?.category || '').includes('교습소') ? '교습소' : '학원';
    const label = numberLabel || (category === '교습소' ? '신고번호' : '등록번호');
    const name = a.name || result?.name || '';
    const regNo = a.id || result?.regNo || '';
    const courses = sortCourses(a.courses || []);
    const range = feeRange(courses);
    const baseDate = a.changeDate || a.regDate || '';
    const verdict = result ? effectiveVerdict(result) : '미조사';
    const addr = shortAddress(a.address);

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>교습비 대조 - ${esc(name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: '맑은 고딕', 'Malgun Gothic', 'NanumGothic', sans-serif;
         background: #f1f5f9; color: #0f172a; padding: 20px; line-height: 1.5; }
  .wrap { max-width: 1180px; margin: 0 auto; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; }
  h1 { font-size: 1.25rem; }
  h2 { font-size: 0.95rem; margin-bottom: 10px; color: #334155; }
  .meta { font-size: 0.84rem; color: #64748b; margin-top: 4px; }
  .range { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin-top: 10px; }
  .range small { font-size: 0.8rem; font-weight: 600; color: #64748b; margin-left: 6px; }
  .verdict { display: inline-block; padding: 3px 12px; border-radius: 999px; color: #fff;
             font-size: 0.82rem; font-weight: 700; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
  @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
  table.grid { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
  .grid th, .grid td { border: 1px solid #e2e8f0; padding: 7px 9px; vertical-align: top; text-align: left; }
  .grid th { background: #f8fafc; font-size: 0.8rem; color: #475569; white-space: nowrap; }
  .grid td.num { text-align: right; white-space: nowrap; font-size: 0.95rem; }
  .grid td.mid { white-space: nowrap; }
  .grid tbody tr:nth-child(even) td { background: #fcfdfe; }
  .sub { font-size: 0.74rem; color: #94a3b8; margin-top: 2px; }
  .dim { color: #94a3b8; }
  .guess { margin-left: 5px; font-size: 0.66rem; font-weight: 700; color: #b45309;
           background: #fef3c7; border-radius: 999px; padding: 1px 5px; }
  .empty { font-size: 0.88rem; color: #64748b; padding: 14px 2px; }
  .note { font-size: 0.76rem; color: #94a3b8; margin-top: 8px; }
  .ox { font-weight: 800; font-size: 1rem; }
  .ox-o { color: #10b981; } .ox-x { color: #ef4444; } .ox-q { color: #94a3b8; }
  .ox-manual { color: #2563eb; border-bottom: 2px solid #2563eb; }
  .tag { margin-left: 6px; font-size: 0.68rem; font-weight: 700; color: #fff;
         background: #2563eb; border-radius: 999px; padding: 1px 7px; }
  a.open { display: inline-block; color: #2563eb; font-weight: 600; font-size: 0.8rem;
           text-decoration: none; border: 1px solid #bfdbfe; border-radius: 6px;
           padding: 2px 8px; margin-right: 4px; white-space: nowrap; }
  .howto { background: #fffbeb; border-color: #fde68a; font-size: 0.84rem; color: #78350f; }
  .bar { position: fixed; top: 14px; right: 14px; display: flex; gap: 8px; }
  .bar button { padding: 7px 13px; border: none; border-radius: 8px; font-size: 0.84rem;
                font-weight: 700; cursor: pointer; }
  .bar .p { background: #2563eb; color: #fff; } .bar .c { background: #e2e8f0; color: #334155; }
  @media print {
    body { background: #fff; padding: 0; }
    .bar { display: none !important; }
    .card { border-color: #cbd5e1; break-inside: avoid; }
    a.open { border: none; padding: 0; }
  }
</style>
</head>
<body>
<div class="bar">
  <button class="p" onclick="window.print()">🖨️ 인쇄</button>
  <button class="c" onclick="window.close()">✕ 닫기</button>
</div>

<div class="wrap">
  <div class="card">
    <h1>${esc(name)}</h1>
    <div class="meta">
      ${esc(category)} · ${esc(label)} ${esc(regNo)}${addr ? ` · ${esc(addr)}` : ''}
      ${baseDate ? ` · 신고 기준일 ${esc(baseDate)}` : ''}
    </div>
    ${range ? `<div class="range">${esc(range)}<small>신고된 월 교습비 범위</small></div>` : ''}
  </div>

  <div class="card howto">
    <b>이 창을 네이버 창과 나란히 놓고 금액이 같은지 확인하세요.</b>
    자동 조사는 교습비를 <b>올렸는지</b>만 보고 <b>얼마인지</b>는 읽지 않습니다 —
    금액이 맞는지는 사람이 봐야 합니다. 오른쪽 <b>열기</b>를 눌러 그 채널을 띄운 뒤
    왼쪽 표의 금액과 맞춰 보세요.
  </div>

  <div class="cols">
    <div class="card">
      <h2>① 신고한 교습비</h2>
      ${courseTable(courses)}
    </div>
    <div class="card">
      <h2>② 네이버에 올라온 것
        <span class="verdict" style="background:${VERDICT_COLOR[verdict] || '#94a3b8'}">${esc(verdict)}</span>
        ${result?.checkedAt ? `<span class="sub" style="display:inline; margin-left:6px;">${esc(fmtWhen(result.checkedAt))} 조사</span>` : ''}
      </h2>
      ${channelTable(result, name, region)}
    </div>
  </div>
</div>
</body>
</html>`;
}

/** 대조창을 새 탭에 띄운다 */
export function openTuitionCompare(academy, result, opts) {
    openHtmlWindow(buildTuitionCompareHtml(academy, result, opts));
}
