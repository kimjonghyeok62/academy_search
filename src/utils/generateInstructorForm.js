/**
 * 학원강사게시표 출력
 * [별지 제15호서식] — 학원의 설립·운영 및 과외교습에 관한 법률 시행규칙 <개정 2019. 1. 10.>
 *
 * 법 제13조제2항은 강사의 인적사항을 학습자가 보기 쉬운 곳에 게시하라고 한다. 담당자가
 * 점검을 나가면 이것이 붙어 있는지를 먼저 보는데, 학원이 양식을 몰라 손으로 아무렇게나
 * 적어 붙여 두는 일이 잦다. 대장에 이미 강사 명단이 있으므로 그것으로 양식을 채워 준다.
 *
 * 만드는 방식은 교습비등 게시표와 같다 — HTML 한 장을 새 탭에 띄우고 인쇄를 맡긴다
 * (generateTuitionPDF.js 와 같은 이유: 한글이 깨지지 않고 라이브러리도 필요 없다).
 *
 * 칸 너비·줄 높이는 서식 PDF 에서 잰 값을 그대로 옮겼다. 표는 가로 168.5mm,
 * 칸 차례는 일련번호·성명·성별·연령·학력(전공과목)·경력·소지 자격증·채용일이다.
 *
 * 대장에 없는 것(성별·연령·경력)은 빈칸으로 둔다. 학원이 손으로 채워 넣으면 된다 —
 * 우리가 모르는 것을 지어내는 것보다 빈칸이 낫다.
 */
import { openHtmlWindow } from './generateTuitionPDF';

// 서식 PDF 에서 잰 칸 너비 (표 전체를 100 으로 본 비율)
const COLUMNS = [
    { label: '일련<br>번호', width: '6.85%' },
    { label: '성명', width: '10.95%' },
    { label: '성별', width: '9.76%' },
    { label: '연령', width: '9.63%' },
    { label: '학력<br>(전공과목)', width: '17.96%' },
    { label: '경력', width: '14.99%' },
    { label: '소지 자격증', width: '13.90%' },
    { label: '채용일', width: '15.95%' },
];

// 서식의 표 안쪽 높이(123.9mm)를 채우는 줄 수 — 강사가 적어도 빈 줄이 남아야
// 학원이 손으로 덧붙일 수 있다
const MIN_ROWS = 12;

const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** 게시표에 올릴 강사 — 해임되지 않은 사람만, 채용일 순 */
export function postableInstructors(instructors) {
    return (instructors || [])
        .filter(i => i && i.name && !i.dismissDate)
        .slice()
        .sort((a, b) => String(a.hireDate || '').localeCompare(String(b.hireDate || '')));
}

/** 학력 칸 — 서식 유의사항 2: "고졸, 대졸 또는 대학원졸로 표시하되, 전공과목을 추가로 기록" */
function educationText(inst) {
    const edu = (inst.education || '').trim();
    const major = (inst.major || '').trim();
    if (edu && major) return `${edu}(${major})`;
    return edu || (major ? `(${major})` : '');
}

/** 소지 자격증 칸 — 자격증이 없으면 자격구분(예: 교원자격증)이라도 적는다 */
function certificateText(inst) {
    return (inst.certificate || '').trim() || (inst.qualification || '').trim();
}

// 날짜는 대장에 들어온 꼴이 제각각이라(2024-03-02 / 2024.3.2) 점으로 맞춘다
function formatDate(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
    if (!m) return s;
    return `${m[1]}. ${parseInt(m[2], 10)}. ${parseInt(m[3], 10)}.`;
}

/** 서명란 — 교습소는 '교습자', 학원은 '설립·운영자' */
function signLabel(academy) {
    const name = academy?.name || '';
    if (/교습소/.test(academy?.category || '')) return `${name} 교습자`;
    return `${name} 설립ㆍ운영자`;
}

/**
 * 강사게시표 HTML 을 만든다 — 띄우는 일과 가른다 (교습비 게시표와 같은 이유).
 * 화면 안에 끼워 보이거나 그림으로 뽑을 일이 생기면 이 HTML 을 그대로 쓰면 된다.
 */
export function buildInstructorFormHtml(academy, instructors) {
    const list = postableInstructors(instructors);

    const rows = list.map((inst, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${esc(inst.name)}</td>
            <td></td>
            <td></td>
            <td>${esc(educationText(inst))}</td>
            <td></td>
            <td>${esc(certificateText(inst))}</td>
            <td>${esc(formatDate(inst.hireDate))}</td>
        </tr>`).join('');

    const emptyRows = Array.from({ length: Math.max(0, MIN_ROWS - list.length) }, () =>
        `<tr>${'<td></td>'.repeat(COLUMNS.length)}</tr>`).join('');

    const headerCells = COLUMNS.map(c => `<th style="width:${c.width}">${c.label}</th>`).join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>학원강사게시표 - ${esc(academy?.name || '')}</title>
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

  /* 머리 — 서식 이름은 왼쪽 위, 개정일은 오른쪽 */
  .form-label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 10pt;
    margin-bottom: 6mm;
  }
  /* 서식의 제목은 자간을 벌리지 않는다 (교습비 게시표와 다른 점) */
  .form-title {
    font-size: 19pt;
    font-weight: bold;
    text-align: center;
    margin-bottom: 3mm;
  }
  /* 'ㅇㅇ년 ㅇㅇ월 ㅇㅇ일 현재' — 표 바로 위 오른쪽 */
  .form-asof {
    text-align: right;
    font-size: 11pt;
    margin-bottom: 2mm;
  }
  .form-asof .blank { display: inline-block; min-width: 12mm; }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #000;
    text-align: center;
    vertical-align: middle;
    font-size: 10pt;
    padding: 1mm;
    word-break: keep-all;
  }
  thead th {
    height: 11mm;
    font-weight: bold;
    line-height: 1.25;
  }
  tbody td { height: 10.3mm; }

  /* 아래 글월 — 법 조항과 서명란 */
  .form-statement {
    margin-top: 7mm;
    font-size: 11pt;
    line-height: 1.7;
    text-indent: 4mm;
    /* 없으면 '게시합니 / 다.' 처럼 낱말 가운데가 끊긴다 */
    word-break: keep-all;
  }
  .form-sign {
    margin-top: 6mm;
    text-align: right;
    font-size: 11pt;
  }
  .form-sign .sign-date { margin-bottom: 4mm; }
  .form-sign .blank { display: inline-block; min-width: 12mm; }
  .sign-name {
    font-size: 13pt;
    margin-right: 22mm;
  }
  .sign-suffix { font-size: 10pt; }

  /* 유의사항 */
  .notes-box {
    margin-top: 9mm;
    border: 1px solid #000;
  }
  .notes-title {
    border-bottom: 1px solid #000;
    text-align: center;
    font-size: 10pt;
    padding: 1.5mm;
  }
  .notes-body {
    padding: 2.5mm 4mm;
    font-size: 9.5pt;
    line-height: 1.75;
  }

  .form-footer {
    margin-top: 4mm;
    text-align: right;
    font-size: 9pt;
  }
</style>
</head>
<body>

<div class="print-bar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
  <button class="btn-close" onclick="window.close()">✕ 닫기</button>
</div>

<div class="page">

  <div class="form-label">
    <span>■ 학원의 설립ㆍ운영 및 과외교습에 관한 법률 시행규칙 [별지 제15호서식]</span>
    <span>&lt;개정 2019. 1. 10.&gt;</span>
  </div>

  <div class="form-title">학원강사게시표</div>

  <div class="form-asof">
    <span class="blank"></span> 년 <span class="blank"></span> 월 <span class="blank"></span> 일 현재
  </div>

  <table>
    <thead>
      <tr>${headerCells}</tr>
    </thead>
    <tbody>
      ${rows}${emptyRows}
    </tbody>
  </table>

  <div class="form-statement">
    「학원의 설립ㆍ운영 및 과외교습에 관한 법률」 제13조제2항에 따라 강사의 인적사항을 위와 같이 게시합니다.
  </div>

  <div class="form-sign">
    <div class="sign-date">
      <span class="blank"></span> 년 <span class="blank"></span> 월 <span class="blank"></span> 일
    </div>
    <div>
      <span class="sign-name">${esc(signLabel(academy))}</span>
      <span class="sign-suffix">(서명 또는 인)</span>
    </div>
  </div>

  <div class="notes-box">
    <div class="notes-title">유의사항</div>
    <div class="notes-body">
      1. 강사의 인적사항이 변동된 경우에는 지체 없이 수정해 다시 게시합니다.<br>
      2. 학력은 고졸, 대졸 또는 대학원졸로 표시하되, 전공과목을 추가로 기록합니다.<br>
      3. 글씨의 크기는 학습자가 확인하기 쉬운 크기로 합니다.<br>
      4. 게시는 학습자가 보기 쉬운 장소에 합니다.(주 출입구 및 교습비등의 납부 장소 앞)
    </div>
  </div>

  <div class="form-footer">210mm×297mm[백상지(150g/㎡)]</div>

</div>

</body>
</html>`;
}

export function printInstructorForm(academy, instructors) {
    openHtmlWindow(buildInstructorFormHtml(academy, instructors));
}
