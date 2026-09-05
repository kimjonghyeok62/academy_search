/**
 * 교습비등 게시표(내부용) 출력
 * [별지 제4호서식] - 경기도 학원의 설립·운영 및 과외교습에 관한 조례 시행규칙 제8조의2
 *
 * 브라우저 print 방식으로 A4 PDF 생성 (한글 깨짐 없음, 추가 라이브러리 불필요)
 */

/**
 * 만들어 둔 HTML 을 새 탭에 띄운다.
 * window.open 대신 Blob + 숨은 <a target="_blank"> 를 쓰는 이유는 팝업 차단에 덜 걸리기 때문이다.
 * (게시표 내부용·외부용, 교습비 대조창이 함께 쓴다)
 */
export function openHtmlWindow(html) {
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 새 탭이 다 읽어 갈 때까지는 살려 둔다
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

/**
 * 만들어 둔 HTML 을 탭이 아니라 '창' 으로 띄운다.
 *
 * 탭과의 차이는 하나다 — 브라우저는 스크립트가 window.open 으로 연 창에만
 * moveTo/resizeTo 를 허용한다. 교습비 대조창이 네이버 창과 화면을 반씩 나눠 갖는 일이
 * 이래서 가능하다 (탭으로 열리면 그 창은 제 자리를 못 옮긴다).
 * 팝업 차단에 걸리면 조용히 새 탭으로 물러난다 — 나란히 놓기는 못 해도 내용은 봐야 한다.
 */
export function openHtmlPopup(html, { width, height } = {}) {
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const s = window.screen;
    const availLeft = s.availLeft ?? 0;
    const availTop = s.availTop ?? 0;
    const w = Math.min(width || 1240, s.availWidth);
    const h = Math.min(height || s.availHeight, s.availHeight);
    const left = Math.round(availLeft + (s.availWidth - w) / 2);
    const win = window.open(blobUrl, '_blank',
        `popup=yes,width=${w},height=${h},left=${left},top=${availTop}`);
    if (!win) {
        URL.revokeObjectURL(blobUrl);
        openHtmlWindow(html);
        return null;
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    return win;
}

// 교습과정 정렬: 교습과정 → 레벨(유아<초등/초급<중등/중급<고등/고급<입시) → 과목기본명 자연정렬 → 주회수
export function sortCourses(courses) {
    const LEVEL_RANK = [
        ['유아', 0],
        ['초등', 10], ['초급', 11],
        ['중등', 20], ['중급', 21],
        ['고등', 30], ['고급', 31],
        ['입시', 40],
    ];
    const levelRank = (str) => {
        const s = str || '';
        for (const [kw, rank] of LEVEL_RANK) {
            if (s.includes(kw)) return rank;
        }
        return 99;
    };
    const weeklyRank = (str) => {
        const m = (str || '').match(/주(\d+)회/);
        return m ? parseInt(m[1], 10) : 99;
    };
    const baseName = (str) => (str || '').replace(/\s*\(주\d+회\)/g, '').replace(/\s+/g, ' ').trim();
    const naturalCmp = (a, b) => {
        const re = /(\d+)|(\D+)/g;
        const pa = String(a).match(re) || [], pb = String(b).match(re) || [];
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const ca = pa[i] || '', cb = pb[i] || '';
            const na = parseInt(ca, 10), nb = parseInt(cb, 10);
            if (!isNaN(na) && !isNaN(nb)) { if (na !== nb) return na - nb; }
            else { const c = ca.localeCompare(cb, 'ko'); if (c !== 0) return c; }
        }
        return 0;
    };
    return [...courses].sort((a, b) => {
        const subA = (a.subject || a.process || '').trim();
        const subB = (b.subject || b.process || '').trim();
        const pc = naturalCmp(a.process || '', b.process || '');
        if (pc !== 0) return pc;
        const la = levelRank(subA), lb = levelRank(subB);
        if (la !== lb) return la - lb;
        const bc = naturalCmp(baseName(subA), baseName(subB));
        if (bc !== 0) return bc;
        return weeklyRank(subA) - weeklyRank(subB);
    });
}

// 콤마 포함 문자열 → 원 단위 정수로 변환 후 천단위 콤마 포맷
export function fmtNum(val) {
    if (!val && val !== 0) return '';
    const n = parseInt(String(val).replace(/,/g, ''), 10);
    return isNaN(n) || n === 0 ? '' : n.toLocaleString('ko-KR');
}

// 숫자 합산 (콤마 제거 후 파싱)
export function parseNum(val) {
    if (!val) return 0;
    const n = parseInt(String(val).replace(/,/g, ''), 10);
    return isNaN(n) ? 0 : n;
}

// 징수단위에서 "0일" 제거 (예: "1개월0일" → "1개월")
function formatPeriod(period) {
    if (!period) return '';
    return period.replace(/0일$/, '').trim();
}

// 학원종류에 따른 설립운영자 표기 결정
function getSignLabel(academy) {
    const cat = (academy.category || '').trim();
    const name = academy.name || '';
    const founderName = academy.founder?.name || '';

    if (cat === '과외') {
        return { prefix: '개인과외교습자', signerName: founderName };
    } else if (cat.includes('교습소')) {
        return { prefix: `${name} 교습자`, signerName: founderName };
    } else {
        return { prefix: `${name} 설립운영자`, signerName: founderName };
    }
}

// 변경일 파싱 → { year, month, day }
export function formatChangeDateKo(dateStr) {
    if (!dateStr) return { year: '', month: '', day: '' };
    const parts = dateStr.split(/[-./]/);
    if (parts.length < 3) return { year: dateStr, month: '', day: '' };
    return {
        year: parts[0],
        month: String(parseInt(parts[1], 10)),
        day: String(parseInt(parts[2], 10))
    };
}

export function printTuitionForm(academy) {
    // 변경일 → 없으면 등록일 순서로 fallback
    const baseDateStr = academy.changeDate || academy.regDate || '';
    const baseDate = formatChangeDateKo(baseDateStr);

    const courses = sortCourses(academy.courses || []);
    const { prefix: signPrefix, signerName } = getSignLabel(academy);
    const signerNameHtml = signerName
        ? `<span class="sign-person">${signerName}</span>`
        : `<span style="display:inline-block;width:60mm;border-bottom:1.5px solid #000;vertical-align:bottom;margin:0 4px;"></span>`;

    const courseRows = courses.map(c => {
        const label = [c.process, c.subject].filter(Boolean).join(' / ');
        const tuition = fmtNum(c.tuitionFee || c.totalFee);
        const totalTime = fmtNum(c.totalTime);
        const period = formatPeriod(c.period);
        const mockExam = fmtNum(c.mockExamFee);
        const material = fmtNum(c.materialFee);
        const clothing = fmtNum(c.clothingFee);
        const meal = fmtNum(c.mealFee);
        const dormitory = fmtNum(c.dormitoryFee);
        const vehicle = fmtNum(c.vehicleFee);

        const tuitionNum = parseNum(c.tuitionFee || c.totalFee);
        const otherSum = parseNum(c.mockExamFee) + parseNum(c.materialFee)
            + parseNum(c.clothingFee) + parseNum(c.mealFee)
            + parseNum(c.dormitoryFee) + parseNum(c.vehicleFee);
        const total = tuitionNum + otherSum;
        const totalStr = total > 0 ? total.toLocaleString('ko-KR') : '';

        return `
        <tr>
            <td>${label}</td>
            <td>${totalTime}</td>
            <td>${tuition}</td>
            <td>${period}</td>
            <td>${mockExam}</td>
            <td>${material}</td>
            <td>${clothing}</td>
            <td>${meal}</td>
            <td>${dormitory}</td>
            <td>${vehicle}</td>
            <td class="total-cell"><strong>${totalStr}</strong></td>
        </tr>`;
    }).join('');

    // 빈 행 추가 (최소 8행 확보)
    const emptyRowCount = Math.max(0, 8 - courses.length);
    const emptyRows = Array.from({ length: emptyRowCount }, () => `
        <tr>
            <td>&nbsp;</td>
            <td></td><td></td><td></td><td></td>
            <td></td><td></td><td></td><td></td>
            <td></td><td class="total-cell"></td>
        </tr>`).join('');

    // 비고(교습과정) 중복 제거 후 합치기
    const notes = [...new Set(courses.map(c => (c.note || '').trim()).filter(Boolean))];
    const noteRow = `
        <tr class="note-row">
            <td colspan="11" style="text-align:left; padding: 2.5mm 3mm; background:#fafafa; font-size:10pt;">
                <span style="font-weight:bold; margin-right:6px;">비고</span>${notes.join('  /  ')}
            </td>
        </tr>`;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>교습비등 게시표(내부용) - ${academy.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: '맑은 고딕', 'Malgun Gothic', '나눔고딕', 'NanumGothic', sans-serif;
    font-size: 12pt;
    background: white;
    color: #000;
  }

  @page {
    size: A4 portrait;
    margin: 12mm 12mm 12mm 12mm;
  }

  @media print {
    body { margin: 0; }
    .no-print { display: none !important; }
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 8mm;
    background: white;
  }

  .print-bar {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
    z-index: 9999;
  }
  .print-bar button {
    padding: 10px 22px;
    font-size: 14px;
    font-family: '맑은 고딕', 'Malgun Gothic', sans-serif;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-print { background: #2563eb; color: white; }
  .btn-close  { background: #64748b; color: white; }

  .form-label {
    font-size: 10pt;
    text-align: left;
    margin-bottom: 2mm;
  }
  .form-title {
    font-size: 24pt;
    font-weight: bold;
    text-align: center;
    letter-spacing: 8px;
    margin-bottom: 3mm;
  }
  .form-academy {
    font-size: 14pt;
    font-weight: bold;
    text-align: center;
    margin-bottom: 4mm;
  }

  /* 상단 날짜 (변경일) + 단위 */
  .form-date-unit {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 11pt;
    margin-bottom: 4mm;
    border-bottom: 1.5px solid #000;
    padding-bottom: 2mm;
  }
  .form-date {
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .date-val {
    display: inline-block;
    border-bottom: 1px solid #000;
    min-width: 26px;
    text-align: center;
    font-size: 11pt;
    padding: 0 2px;
  }

  /* 메인 테이블 */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin-bottom: 4mm;
  }
  th, td {
    border: 1px solid #000;
    padding: 2.5mm 1.5mm;
    text-align: center;
    vertical-align: middle;
    word-break: keep-all;
    line-height: 1.4;
  }
  thead { display: table-header-group; } /* 인쇄 시 다음 페이지에도 헤더 반복 */
  thead th { background-color: #e8e8e8 !important; font-weight: bold; }
  thead tr:first-child th { font-size: 10pt; }
  thead tr:nth-child(2) th { font-size: 9.5pt; }
  td:first-child { text-align: left; padding-left: 2.5mm; }
  tbody tr { height: 12mm; }
  .total-cell { background-color: #ffffff; }
  .note-row td { background-color: #fafafa; font-size: 10pt; }

  /* 게시 문구 */
  .notice-text {
    font-size: 10.5pt;
    line-height: 1.8;
    margin-bottom: 5mm;
  }

  /* 하단 날짜 (오늘) + 서명란 */
  .sign-area {
    margin-bottom: 8mm;
  }
  .sign-date-row {
    font-size: 12pt;
    display: flex;
    gap: 8px;
    align-items: baseline;
    justify-content: center;
    margin-bottom: 5mm;
  }
  .sign-name-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    font-size: 11pt;
  }
  .sign-prefix { font-weight: normal; }
  .sign-person { font-weight: bold; }
  .sign-suffix { font-size: 10pt; color: #333; }
  .sign-box {
    display: inline-block;
    border: 1px solid #000;
    width: 25mm;
    height: 14mm;
    vertical-align: middle;
    margin-left: 4px;
  }

  /* 유의사항 */
  .notes-box {
    border: 1px solid #000;
    padding: 4mm 6mm;
    font-size: 10pt;
    line-height: 1.8;
    margin-top: 4mm;
  }
  .notes-title {
    font-weight: bold;
    letter-spacing: 4px;
    text-align: center;
    font-size: 11pt;
    margin-bottom: 3mm;
  }
  .notes-item { margin-bottom: 1.5mm; }

  .paper-size {
    text-align: right;
    font-size: 8pt;
    margin-top: 3mm;
    color: #555;
  }
</style>
</head>
<body>

<div class="print-bar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
  <button class="btn-close" onclick="window.close()">✕ 닫기</button>
</div>

<div class="page">

  <div class="form-label">[별지 제4호서식]</div>
  <div class="form-title">교습비등 게시표</div>
  <div class="form-academy">${academy.name}</div>

  <!-- 상단: 변경일(또는 등록일) 현재 + 단위 -->
  <div class="form-date-unit">
    <div class="form-date">
      <span><span class="date-val">${baseDate.year}</span> 년</span>
      <span><span class="date-val">${baseDate.month}</span> 월</span>
      <span><span class="date-val">${baseDate.day}</span> 일</span>
      <span>현재</span>
    </div>
    <div>[단위: 원]</div>
  </div>

  <!-- 교습비 테이블 -->
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width:16%">교습과정</th>
        <th rowspan="2" style="width:8%">총교습시간<br>(분/월)</th>
        <th rowspan="2" style="width:9%">교습비</th>
        <th rowspan="2" style="width:7%">징수단위<br>(월,분기)</th>
        <th colspan="6">기타경비</th>
        <th rowspan="2" style="width:9%">합계</th>
      </tr>
      <tr>
        <th style="width:8%">모의고사비</th>
        <th style="width:8%">재료비</th>
        <th style="width:7%">피복비</th>
        <th style="width:7%">급식비</th>
        <th style="width:8%">기숙사비</th>
        <th style="width:7%">차량비</th>
      </tr>
    </thead>
    <tbody>
      ${courseRows}
      ${emptyRows}
      ${noteRow}
    </tbody>
  </table>

  <div class="notice-text">
    「경기도 학원의 설립·운영 및 과외교습에 관한 조례 시행규칙」 제8조의2에 따라 교습비등을 위와 같이 게시합니다.
  </div>

  <!-- 하단: 변경일(또는 등록일) + 서명란 -->
  <div class="sign-area">
    <div class="sign-date-row">
      <span><span class="date-val">${baseDate.year}</span> 년</span>
      <span><span class="date-val">${baseDate.month}</span> 월</span>
      <span><span class="date-val">${baseDate.day}</span> 일</span>
    </div>
    <div class="sign-name-row">
      <span class="sign-prefix">${signPrefix}</span>
      ${signerNameHtml}
      <span class="sign-suffix">(서명 또는 인)</span>
    </div>
  </div>

  <!-- 유의사항 -->
  <div class="notes-box">
    <div class="notes-title">유 의 사 항</div>
    <div class="notes-item">1. 교습비등 게시표는 관할 교육지원청에 등록 신청한 최종자료를 게시합니다.</div>
    <div class="notes-item">2. 글씨는 학습자의 확인이 쉬운 크기로 합니다.</div>
    <div class="notes-item">3. 게시는 학원 및 교습소, 개인과외교습장소(교습자의 주거지에 한함)의 내부와 외부에 학습자가 보기 쉬운 장소에 합니다.</div>
  </div>

</div>
</body>
</html>`;

    openHtmlWindow(html);
}

// ─────────────────────────────────────────────
// 외부용 (옥외가격표시용) 전용 헬퍼
// ─────────────────────────────────────────────

// 주기준 문자열에서 주당 총 분수 추출 (예: "주5회, 회당100분" → 500)
export function getWeeklyTotalMinutes(weeklyStr) {
    if (!weeklyStr) return null;
    const sessionsMatch = weeklyStr.match(/주(\d+)회/);
    const minsMatch = weeklyStr.match(/회당(\d+)분/);
    if (!sessionsMatch || !minsMatch) return null;
    return parseInt(sessionsMatch[1], 10) * parseInt(minsMatch[1], 10);
}

// 웹앱(DetailView)과 동일한 best-fit 알고리즘으로 총교습시간(분/월) → 주당 분수 계산
export function calcWeeklyMinutes(totalTimeVal) {
    const s = calcWeeklySchedule(totalTimeVal);
    return s ? s.minutes * s.sessions : null;
}

/**
 * 총교습시간(분/월) → 가장 그럴듯한 주당 시간표 { sessions, minutes }.
 * 곱만 필요하면 calcWeeklyMinutes 를, '주3회 · 회당 100분' 처럼 나눠 보여줄 때는 이쪽을 쓴다.
 * (교습비 대조창이 회수를 따로 보여줘야 해서 조합을 그대로 돌려주는 함수로 빼냈다)
 */
export function calcWeeklySchedule(totalTimeVal) {
    const total = parseInt(String(totalTimeVal || '').replace(/,/g, ''), 10);
    if (isNaN(total) || total === 0) return null;

    const combinations = [];
    for (const weeks of [4.3, 4.2, 4.1, 4.0]) {
        for (let sessions = 1; sessions <= 7; sessions++) {
            const minutes = Math.round((total / weeks) / sessions);
            if (minutes < 30 || minutes > 300) continue;
            const diffFromTotal = Math.abs(minutes * sessions * weeks - total);
            if (diffFromTotal > 8) continue;
            let roundScore = 0;
            if (minutes % 60 === 0) roundScore += 30;
            else if (minutes % 30 === 0) roundScore += 20;
            else if (minutes % 10 === 0) roundScore += 10;
            else if (minutes % 5 === 0) roundScore += 5;
            if (sessions >= 3 && sessions <= 5) roundScore += 20;
            combinations.push({ sessions, minutes, diffFromTotal, roundScore });
        }
    }
    combinations.sort((a, b) =>
        Math.abs(a.diffFromTotal - b.diffFromTotal) > 0.5
            ? a.diffFromTotal - b.diffFromTotal
            : b.roundScore - a.roundScore
    );
    return combinations.length > 0
        ? { sessions: combinations[0].sessions, minutes: combinations[0].minutes }
        : null;
}

// 외부용 설립운영자 표기
function getSignLabelExternal(academy) {
    const cat = (academy.category || '').trim();
    const name = academy.name || '';
    const founderName = academy.founder?.name || '';

    if (cat === '과외') {
        return { label: `개인과외교습자`, signerName: founderName };
    } else if (cat.includes('교습소')) {
        return { label: `${name} 교습자`, signerName: founderName };
    } else {
        return { label: `${name} 설립운영자`, signerName: founderName };
    }
}

export function printTuitionFormExternal(academy) {
    const baseDateStr = academy.changeDate || academy.regDate || '';
    const baseDate = formatChangeDateKo(baseDateStr);
    const courses = sortCourses(academy.courses || []);
    const { label: signLabel, signerName } = getSignLabelExternal(academy);
    const signerNameHtml = signerName
        ? `<span class="sign-person">${signerName}</span>`
        : `<span style="display:inline-block;width:60mm;border-bottom:1.5px solid #000;vertical-align:bottom;margin:0 4px;"></span>`;

    // 기타경비 항목 정의 (이름 + 필드키)
    const otherFeeItems = [
        { label: '모의고사비', key: 'mockExamFee' },
        { label: '재료비',    key: 'materialFee' },
        { label: '피복비',    key: 'clothingFee' },
        { label: '급식비',    key: 'mealFee' },
        { label: '기숙사비',  key: 'dormitoryFee' },
        { label: '차량비',    key: 'vehicleFee' },
    ];

    // rowspan 방식: 기타경비 항목수만큼 행을 분리해 테두리가 정확히 맞도록 함
    const buildCourseRows = () => courses.map(c => {
        const subject = [c.process, c.subject].filter(Boolean).join(' / ');
        const weeklyTotal = c.weeklyScheduleStr
            ? getWeeklyTotalMinutes(c.weeklyScheduleStr)
            : calcWeeklyMinutes(c.totalTime);
        const weekly = `주&nbsp;&nbsp;&nbsp;회, 회당&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;분`;
        const tuition = fmtNum(c.tuitionFee || c.totalFee);
        const tuitionNum = parseNum(c.tuitionFee || c.totalFee);
        const tuitionFormatted = tuitionNum > 0 ? `월 ${tuitionNum.toLocaleString('ko-KR')}원` : tuition;
        const tuitionDisplay = tuitionFormatted + (weeklyTotal ? `<br><span style="font-size:0.82em; color:#c0c0c0;">←(주당 ${weeklyTotal}분)</span>` : '');

        const activeItems = otherFeeItems.filter(it => parseNum(c[it.key]) > 0);
        const otherSum = activeItems.reduce((s, it) => s + parseNum(c[it.key]), 0);
        const total = tuitionNum + otherSum;
        const totalStr = total > 0 ? `월 ${total.toLocaleString('ko-KR')}원` : tuitionFormatted;

        const span = Math.max(1, activeItems.length);
        const tdSubject  = `<td rowspan="${span}" style="text-align:left; padding-left:2mm; vertical-align:middle;">${subject}</td>`;
        const tdWeekly   = `<td rowspan="${span}" style="vertical-align:middle;">${weekly}</td>`;
        const tdTuition  = `<td rowspan="${span}" style="text-align:right; padding-right:2mm; vertical-align:middle;">${tuitionDisplay}</td>`;
        const tdTotal    = `<td rowspan="${span}" style="text-align:right; padding-right:2mm; vertical-align:middle;"><strong>${totalStr}</strong></td>`;

        if (activeItems.length === 0) {
            return `<tr>${tdSubject}${tdWeekly}${tdTuition}<td></td><td></td>${tdTotal}</tr>`;
        }

        return activeItems.map((it, idx) => {
            const itemTd = `<td style="white-space:nowrap;">${it.label}</td>
            <td style="text-align:right; padding-right:2mm;">${fmtNum(c[it.key])}</td>`;
            if (idx === 0) {
                return `<tr>${tdSubject}${tdWeekly}${tdTuition}${itemTd}${tdTotal}</tr>`;
            }
            return `<tr>${itemTd}</tr>`;
        }).join('');
    }).join('');

    const courseRows = buildCourseRows();

    // 빈 행 (최소 6행, 항목별 분리 행 수 고려)
    const usedRows = courses.reduce((sum, c) => {
        const cnt = otherFeeItems.filter(it => parseNum(c[it.key]) > 0).length;
        return sum + Math.max(1, cnt);
    }, 0);
    const emptyRowCount = Math.max(0, 6 - usedRows);
    const emptyRows = Array.from({ length: emptyRowCount }, () =>
        `<tr style="height:12mm;"><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
    ).join('');

    // 비고(교습과정) 중복 제거 후 합치기 (외부용도 동일)
    const extNotes = [...new Set(courses.map(c => (c.note || '').trim()).filter(Boolean))];
    const extNoteRow = `
        <tr class="note-row">
            <td colspan="6" style="text-align:left; padding: 2.5mm 3mm; background:#fafafa; font-size:10pt;">
                <span style="font-weight:bold; margin-right:6px;">비고</span>${extNotes.join('  /  ')}
            </td>
        </tr>`;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>교습비등 게시표(외부용) - ${academy.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: '맑은 고딕', 'Malgun Gothic', '나눔고딕', 'NanumGothic', sans-serif;
    font-size: 13pt;
    background: white;
    color: #000;
  }

  @page {
    size: A4 portrait;
    margin: 12mm 12mm 12mm 12mm;
  }

  @media print {
    body { margin: 0; }
    .no-print { display: none !important; }
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 8mm;
    background: white;
  }

  .print-bar {
    position: fixed; top: 16px; right: 16px;
    display: flex; gap: 8px; z-index: 9999;
  }
  .print-bar button {
    padding: 10px 22px; font-size: 14px;
    font-family: '맑은 고딕', 'Malgun Gothic', sans-serif;
    border: none; border-radius: 8px; cursor: pointer; font-weight: 600;
  }
  .btn-print { background: #2563eb; color: white; }
  .btn-close  { background: #64748b; color: white; }

  .form-outer-label {
    font-size: 10pt; text-align: center;
    color: #333; margin-bottom: 1mm;
  }
  .form-guideline {
    font-size: 8.5pt; text-align: left;
    color: #555; margin-bottom: 3mm;
    line-height: 1.5;
  }
  .form-title {
    font-size: 26pt; font-weight: bold;
    text-align: center; letter-spacing: 8px;
    margin-bottom: 3mm;
  }
  .form-academy {
    font-size: 15pt; font-weight: bold;
    text-align: center; margin-bottom: 3mm;
  }
  .form-date-row {
    display: flex; justify-content: flex-end;
    align-items: baseline; font-size: 12pt;
    margin-bottom: 4mm;
  }
  .form-date { display: flex; gap: 6px; align-items: baseline; }
  .date-val {
    display: inline-block; border-bottom: 1px solid #000;
    min-width: 26px; text-align: center; font-size: 12pt; padding: 0 2px;
  }

  /* 메인 테이블 */
  table.main-table {
    width: 100%; border-collapse: collapse;
    font-size: 12pt; margin-bottom: 5mm;
  }
  table.main-table thead { display: table-header-group; }
  table.main-table th, table.main-table td {
    border: 1px solid #000;
    padding: 2.5mm 1.5mm;
    text-align: center; vertical-align: middle;
    word-break: keep-all; line-height: 1.4;
  }
  table.main-table thead th {
    background-color: #e8e8e8; font-weight: bold;
  }
  table.main-table thead tr:first-child th { font-size: 12pt; }
  table.main-table thead tr:nth-child(2) th { font-size: 11pt; }
  table.main-table tbody tr { height: 14mm; }

  /* 게시 문구 */
  .notice-text {
    font-size: 11pt; line-height: 1.9; margin-bottom: 6mm;
  }

  /* 서명란 */
  .sign-area { margin-bottom: 6mm; }
  .sign-row {
    font-size: 12pt;
    display: flex; justify-content: center;
    align-items: center; gap: 8px;
  }
  .sign-label { font-weight: normal; }
  .sign-person { font-weight: bold; }
  .sign-suffix { font-size: 11pt; color: #333; }
  .sign-box {
    display: inline-block; border: 1px solid #000;
    width: 25mm; height: 14mm; vertical-align: middle; margin-left: 6px;
  }

  .page-break {
    break-before: page;
    page-break-before: always;
  }
</style>
</head>
<body>

<div class="print-bar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
  <button class="btn-close" onclick="window.close()">✕ 닫기</button>
</div>

<!-- ══════ 1페이지: 교습시간 데이터 있음 ══════ -->
<div class="page">
  <div style="font-size:8.5pt; color:#555; margin-bottom:2mm;">■ 교육부「학원비 옥외가격표시제 가이드라인」[별첨1]&lt;신설 2017. 8.&gt; (옥외용)</div>
  <div class="form-title">교습비등 게시표</div>
  <div class="form-academy">${academy.name}</div>

  <div class="form-date-row">
    <div class="form-date">
      <span><span class="date-val">${baseDate.year}</span> 년</span>
      <span><span class="date-val">${baseDate.month}</span> 월</span>
      <span><span class="date-val">${baseDate.day}</span> 일</span>
    </div>
  </div>

  <table class="main-table">
    <thead>
      <tr>
        <th rowspan="2" style="width:22%">교습과목</th>
        <th rowspan="2" style="width:15%">교습시간<br>(주기준)</th>
        <th rowspan="2" style="width:17%">교습비<br>(월기준, 원)</th>
        <th colspan="2" style="width:26%">기타경비(월기준)</th>
        <th rowspan="2" style="width:20%">합계<br>(최종납부금액)</th>
      </tr>
      <tr>
        <th style="width:11%">항목</th>
        <th style="width:15%">금액(원)</th>
      </tr>
    </thead>
    <tbody>
      ${courseRows}
      ${emptyRows}
      ${extNoteRow}
    </tbody>
  </table>

  <div class="notice-text">
    「학원의 설립·운영 및 과외교습에 관한 법률」제15조제3항에 따라 교습비등을 위와 같이 게시합니다.
    「최종납부금액」은 관할 교육지원청에 등록한 교습비와 일치하며, 실제 납부금액을 표기한 것입니다.
  </div>

  <div class="sign-area">
    <div class="sign-row">
      <span class="sign-label">${signLabel}</span>
      ${signerNameHtml}
      <span class="sign-suffix">: (서명 또는 인)</span>
    </div>
  </div>
</div>

</body>
</html>`;

    openHtmlWindow(html);
}
