/**
 * 학원(교습소) 교습비등 등록신청서 출력
 * 브라우저 print 방식으로 A4 PDF 생성
 */

const PROCESS_LABELS = [
    '보습(초등)', '보습(중등)', '보습(고등)', '진학상담·지도',
    '어학', '음악', '음악(입시)', '미술', '미술(입시)',
    '무용', '무용(입시)', '정보', '기타',
];

function fmtNum(val) {
    if (val === '' || val === null || val === undefined) return '';
    const n = parseInt(String(val).replace(/,/g, ''), 10);
    return isNaN(n) || n === 0 ? '' : n.toLocaleString('ko-KR');
}

function checked(cond) {
    return cond ? '☑' : '☐';
}

function val(v, fallback = '') {
    return v ? String(v) : fallback;
}

export function printRegistrationForm(data) {
    const {
        academyName = '',
        operator = '',
        regNumber = '',
        address = '',
        phone = '',
        regType = '신규등록',
        subjects = [],
    } = data;

    const MIN_ROWS = 5;
    const rows = [...subjects];
    while (rows.length < MIN_ROWS) rows.push(null);

    const courseRows = rows.map(sub => {
        if (!sub) {
            return `
      <tr>
        <td></td><td></td><td></td>
        <td class="time-cell">
          일 <span class="fill"></span>분 × 주 <span class="fill"></span>회 × <span class="fill-sm">4.3</span>주 = <span class="fill"></span>분
        </td>
        <td></td><td></td><td></td>
      </tr>`;
        }
        const processLabel = sub.rateIdx !== '' && sub.rateIdx !== undefined
            ? (PROCESS_LABELS[sub.rateIdx] || '')
            : '';
        const subjectName = sub.subjectName || '';
        const dm = val(sub.dm);
        const wc = val(sub.wc);
        const wk = val(sub.wk, '4.3');
        const totalMinutes = (dm && wc && wk)
            ? Math.round(parseFloat(dm) * parseFloat(wc) * parseFloat(wk))
            : 0;
        const feeNum = parseInt(String(sub.fee || '').replace(/,/g, ''), 10) || 0;
        const feeStr = feeNum > 0 ? feeNum.toLocaleString('ko-KR') : '';
        const rateStr = (feeNum > 0 && totalMinutes > 0)
            ? (Math.ceil((feeNum / totalMinutes) * 10) / 10).toFixed(1)
            : '';

        const dmHtml = dm ? `<strong>${dm}</strong>` : '<span class="fill"></span>';
        const wcHtml = wc ? `<strong>${wc}</strong>` : '<span class="fill"></span>';
        const wkHtml = `<span style="font-size:0.85em">${wk}</span>`;
        const totalHtml = totalMinutes > 0 ? `<strong>${totalMinutes.toLocaleString()}</strong>` : '<span class="fill"></span>';

        return `
      <tr>
        <td>${processLabel}</td>
        <td>${subjectName}</td>
        <td></td>
        <td class="time-cell">
          일 ${dmHtml}분 × 주 ${wcHtml}회 × ${wkHtml}주 = ${totalHtml}분
        </td>
        <td></td>
        <td class="num-cell">${feeStr}</td>
        <td class="num-cell">${rateStr}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>학원(교습소) 교습비등 등록신청서${academyName ? ' — ' + academyName : ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: '맑은 고딕', 'Malgun Gothic', '나눔고딕', 'NanumGothic', sans-serif;
    font-size: 10pt;
    background: white;
    color: #000;
  }
  @page { size: A4 portrait; margin: 12mm 12mm 12mm 12mm; }
  @media print { body { margin: 0; } .no-print { display: none !important; } }

  .page { width: 182mm; margin: 0 auto; background: white; }

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

  h1.form-title {
    font-size: 18pt; font-weight: bold; text-align: center;
    letter-spacing: 4px; margin-top: 2mm; margin-bottom: 5mm;
  }

  table.info-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
    border: 1px solid #000;
  }
  table.info-table td {
    border: 1px solid #000;
    padding: 2mm 2.5mm;
    vertical-align: middle;
    word-break: keep-all;
    line-height: 1.45;
  }
  .th-label {
    background: #f0f0f0;
    font-weight: bold;
    text-align: center;
    white-space: nowrap;
    font-size: 9pt;
  }

  .section-title {
    width: 100%;
    border: 1px solid #000;
    border-top: none;
    background: #f8f8f8;
    text-align: center;
    font-weight: bold;
    font-size: 11pt;
    letter-spacing: 4px;
    padding: 2.2mm;
  }

  .check-container {
    width: 100%;
    border: 1px solid #000;
    border-top: none;
    padding: 2.5mm 3mm;
    font-size: 10pt;
  }
  .check-label { font-weight: bold; font-size: 11pt; letter-spacing: 2px; margin-right: 8mm; }
  .check-item { margin-right: 8mm; font-size: 10.5pt; }

  table.subject-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
    border-top: none;
    font-size: 9.5pt;
  }
  table.subject-table th, table.subject-table td {
    border: 1px solid #000;
    vertical-align: middle;
    word-break: keep-all;
  }
  table.subject-table thead { display: table-header-group; }
  .course-head th {
    background: #f0f0f0;
    font-weight: bold;
    text-align: center;
    font-size: 9pt;
    padding: 2mm 1.5mm;
  }
  table.subject-table tbody tr.course-row { height: 9.5mm; }
  table.subject-table tbody tr.course-row td {
    font-size: 9pt;
    padding: 1.5mm 2mm;
    text-align: center;
  }
  .time-cell { text-align: left !important; font-size: 8.5pt; white-space: nowrap; padding-left: 2mm !important; }
  .num-cell  { text-align: right !important; padding-right: 2mm !important; }

  .fill    { display: inline-block; width: 20px; border-bottom: 1px solid #555; }
  .fill-sm { display: inline-block; min-width: 14px; }

  .discount-container {
    width: 100%;
    border: 1px solid #000;
    border-top: none;
    padding: 2mm 3mm;
    font-size: 9.5pt;
  }

  table.other-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
    border-top: none;
  }
  table.other-table th, table.other-table td {
    border: 1px solid #000;
    vertical-align: middle;
    text-align: center;
  }
  .other-head th {
    background: #f0f0f0; font-weight: bold;
    font-size: 8.5pt;
    padding: 1.5mm 1mm;
  }
  table.other-table tbody tr.other-row { height: 8.5mm; }
  table.other-table tbody tr.other-row td { font-size: 9pt; }

  .notice-box {
    width: 100%;
    border: 1px solid #000;
    border-top: none;
    font-size: 8.5pt; line-height: 1.5;
    padding: 3mm 3.5mm;
    text-align: left;
  }
  .notice-box strong { font-weight: bold; }

  .confirm-box {
    width: 100%;
    border: 1px solid #000;
    border-top: none;
    font-size: 9pt; line-height: 1.7;
    padding: 3mm 4mm;
    text-align: left;
  }
  .confirm-title {
    text-align: center; font-size: 11pt; font-weight: bold;
    letter-spacing: 4px; margin-bottom: 2mm;
  }
  .sign-date { text-align: center; margin: 3.5mm 0 2.5mm; font-size: 10pt; }
  .sign-line { text-align: center; font-size: 10pt; margin-bottom: 1.5mm; }
  .sign-underline {
    display: inline-block; width: 50mm;
    border-bottom: 1px solid #000;
    margin: 0 4px; vertical-align: bottom;
  }

  .bottom-container {
    display: flex;
    align-items: stretch;
    width: 100%;
    margin-top: 0;
  }
  .recipient-box {
    flex: 1;
    border: 1px solid #000;
    border-top: none;
    border-right: none;
    font-size: 12pt;
    font-weight: bold;
    display: flex;
    align-items: center;
    padding-left: 4mm;
  }
  table.approval-table {
    width: 320px;
    border-collapse: collapse;
    border: 1px solid #000;
    border-top: none;
    font-size: 9pt;
  }
  table.approval-table td {
    border: 1px solid #000;
    text-align: center;
    vertical-align: middle;
  }
  table.approval-table .ap-label {
    background: #f0f0f0;
    font-weight: bold;
    padding: 1.5mm 2mm;
  }
</style>
</head>
<body>
<div class="print-bar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
  <button class="btn-close"  onclick="window.close()">✕ 닫기</button>
</div>

<div class="page">
  <h1 class="form-title">학원(교습소) 교습비등 등록신청서</h1>

  <table class="info-table">
    <tr>
      <td class="th-label" style="width:15%">접수번호</td>
      <td style="width:20%"></td>
      <td class="th-label" style="width:15%">접수일자</td>
      <td style="width:25%"></td>
      <td colspan="2" style="width:25%"></td>
    </tr>
    <tr>
      <td class="th-label" style="line-height:1.4">학원(교습소)명<br>/운영자</td>
      <td colspan="3" style="letter-spacing:1px">
        ${val(academyName)}&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;${val(operator)}
      </td>
      <td class="th-label" style="width:10%">등록번호</td>
      <td style="width:15%">${val(regNumber)}</td>
    </tr>
    <tr>
      <td class="th-label">위&nbsp;&nbsp;&nbsp;치</td>
      <td colspan="5">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span>${val(address)}</span>
          <span>(전화번호:&nbsp;&nbsp;${val(phone)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span>
        </div>
      </td>
    </tr>
  </table>

  <div class="section-title">교 습 비 등 &nbsp;(변경) &nbsp;등 록 내 용</div>

  <div class="check-container">
    <span class="check-label">교 습 비</span>
    <span class="check-item">${checked(regType === '신규등록')} 신규등록</span>
    <span class="check-item">${checked(regType === '일부변경')} 일부변경</span>
    <span class="check-item">${checked(regType === '전체변경')} 전체변경</span>
  </div>

  <table class="subject-table">
    <thead>
      <tr class="course-head">
        <th rowspan="2" style="width:10%">교습<br>과정</th>
        <th rowspan="2" style="width:13%">교습과목<br>(반)</th>
        <th rowspan="2" style="width:8%">교습<br>기간</th>
        <th style="width:36%">총 교습시간(A)</th>
        <th rowspan="2" style="width:8%">정원<br>(반별)</th>
        <th rowspan="2" style="width:12%">교습비(B)</th>
        <th rowspan="2" style="width:13%">분당단가<br>(B÷A)</th>
      </tr>
      <tr class="course-head">
        <th style="font-size:8.2pt; font-weight:normal; color:#444; padding: 1mm 0.5mm;">
          일 분 × 주 회 × 4.3주 = 분
        </th>
      </tr>
    </thead>
    <tbody>
      ${courseRows.replace(/<tr>/g, '<tr class="course-row">')}
    </tbody>
  </table>

  <div class="discount-container">
    <strong>기타 할인사항</strong>
  </div>

  <div class="section-title">기 타 경 비</div>

  <table class="other-table">
    <thead>
      <tr class="other-head">
        <th style="width:16%">교습과목(반)</th>
        <th style="width:12%">모의고사비</th>
        <th style="width:12%">재료비</th>
        <th style="width:12%">피복비</th>
        <th style="width:12%">급식비</th>
        <th style="width:12%">기숙사비</th>
        <th style="width:12%">차량비</th>
        <th style="width:12%">계</th>
      </tr>
    </thead>
    <tbody>
      <tr class="other-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr class="other-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
  </table>

  <div class="notice-box">
    <strong>❏ 작성 시 유의사항</strong> : 기타경비는 「학원의 설립·운영 및 과외교습에 관한 법률 시행령」제3조의2에 따라 6개 항목만 인정되며, 세금계산서, 거래명세서, 원가계산서 등 실비임을 증명할 수 있는 경우에 한하여 징수 가능하고 교습비등을 거짓으로 표시·게시·고지하거나 초과한 금액을 징수한 경우 <strong>과태료(100~300만원) 부과 및 행정처분 대상</strong>이 됩니다.
  </div>

  <div class="confirm-box">
    <div class="confirm-title">확 인 서</div>
    학원의 설립 운영 및 과외교습에 관한 법률 제6조 제1항, 제14조 제1항에 의거 본 학원(교습소)에서
    (변경)등록·신고한 교습비등이 과다하다고 인정되어 차후 교습비등조정위원회의 심의 대상이
    될 수 있으며, 조정심의 대상 통보시 같은법 시행령 제17조의2 제1항 각호의 서류를 제출하고
    기한 내에 서류를 미제출한 경우 교습비등이 과다하다고 인정되어 같은법 제15조 제6항에 따라
    경기도광주하남교육지원청에서 명하는 교습비등 조정에 이의없이 따를 것을 확인합니다.

    <div class="sign-date">년 &nbsp;&nbsp;&nbsp;&nbsp; 월 &nbsp;&nbsp;&nbsp;&nbsp; 일</div>
    <div class="sign-line">
      신청인(설립운영자) :
      <span class="sign-underline"></span>
      (인)
    </div>
  </div>

  <div class="bottom-container">
    <div class="recipient-box">
      경기도광주하남교육지원청교육장 귀하
    </div>
    <table class="approval-table">
      <tr>
        <td rowspan="2" class="ap-label" style="width: 50px;">결<br>재</td>
        <td class="ap-label" style="width: 80px;">담당</td>
        <td class="ap-label" style="width: 80px;">담당주무</td>
        <td class="ap-label" style="width: 120px;">평생교육건강과장</td>
      </tr>
      <tr>
        <td style="height: 12mm;"></td>
        <td></td>
        <td style="font-size: 9.5pt; font-weight: 500;">전결</td>
      </tr>
    </table>
  </div>
</div>
</body>
</html>`;

    _openPrintWindow(html);
}

function _openPrintWindow(html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
