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
    sortCourses, fmtNum, parseNum, getWeeklyTotalMinutes, calcWeeklySchedule, openHtmlPopup,
} from './generateTuitionPDF';
import {
    rowCells, parseChannels, assignBuckets, effectiveVerdict, currentPlaceUrl, isNoPlace,
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

/**
 * 월 교습비가 얼마부터 얼마까지인지 — 네이버에 뜬 금액이 이 밖이면 그것만으로 걸러진다.
 *
 * '월' 은 붙이지 않는다. 이 창은 '월 20만원', 안내 문자는 '월 교습비는 20만원입니다' 로
 * 앞말이 달라서다. 두 곳이 같은 함수를 써야 하는 이유는 하나 — 같은 학원에 대고
 * 화면과 문자가 다른 금액을 말하면 어느 쪽이 맞는지 알 수 없기 때문이다.
 * (snsNoticeText.js 가 이 함수를 그대로 쓴다)
 */
export function feeRange(courses) {
    const nums = courses.map((c) => parseNum(c.tuitionFee || c.totalFee)).filter((n) => n > 0);
    if (!nums.length) return '';
    const min = Math.min(...nums), max = Math.max(...nums);
    return min === max ? won(min) : `${won(min)} ~ ${won(max)}`;
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

// href·target 은 그대로 둔다 — 아래 SPLIT_SCRIPT 가 클릭을 가로채 반반으로 붙이지만,
// 스크립트가 못 뜨거나 Ctrl+클릭으로 새 탭에 열려는 사람에게는 링크가 링크대로 동작해야 한다.
const openBtn = (url, label) =>
    `<a class="open" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)} ↗</a>`;

// 번호 대조 결과 → 사람이 읽을 한마디. 빈 값이면 아무 말도 붙이지 않는다.
const CMP_NOTE = {
    불일치: '<span class="warn">⚠ 신고번호와 다름</span>',
    미기재: '<span class="dim">번호 못 찾음</span>',
    확인불가: '<span class="dim">글을 못 읽음</span>',
    // 조사안함은 O/X 칸이 이미 '자동 조사 안 함' 이라고 말한다 — 같은 말을 두 번 쓰지 않는다
};

// 여러 곳이 한 칸에 묶인 버킷은 가장 나쁜 것 하나로 말한다 (표의 worstCell 과 같은 뜻)
const CMP_RANK = ['불일치', '확인불가', '미기재', '조사안함', '일치'];
const worstCmp = (list) => CMP_RANK.find((v) => list.includes(v)) || '';

/**
 * 등록(신고)번호 칸 — O/X 만으로는 '몇 번으로 적혀 있는가' 를 알 수 없다.
 * 오기재(1042 를 1024 로 적어둔 것)는 X 가 아니라 O 로 뜨므로, 적힌 번호를 함께 보여야
 * 담당자가 눈치챈다.
 */
function regNoCell(cell, listed, cmp) {
    const nums = [...new Set((listed || []).map((v) => String(v || '').trim()).filter(Boolean))];
    const bits = [];
    if (nums.length) bits.push(`적힌 번호 <b>${esc(nums.join(' · '))}</b>`);
    if (CMP_NOTE[cmp]) bits.push(CMP_NOTE[cmp]);
    return oxBadge(cell) + (bits.length ? `<div class="sub">${bits.join(' · ')}</div>` : '');
}

/** 네이버에 무엇이 어떻게 올라와 있는지 — 대조할 상대편 */
function channelTable(result, academyName, region, label) {
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

    // 사람이 '플레이스 없음'을 확인해 준 곳 — 물고 온 후보는 남의 업체라 주소도 게시형태도 보여주면 안 된다
    const noPlace = isNoPlace(result);
    const placeUrl = noPlace ? '' : currentPlaceUrl(result);
    // '어디에 올렸나' 는 채널 이름 아래에 붙인다. 번호 열이 하나 늘어난 자리에서 열을 다섯으로
    // 늘리면 카드 폭(화면의 절반)을 넘겨 채널 이름이 한 글자씩 세로로 쪼개진다.
    const rows = [`<tr>
    <td class="ch"><strong>플레이스</strong>${noPlace
            ? '<div class="sub">네이버플레이스 없음 — 담당자가 직접 확인함</div>'
            : result.플레이스_게시형태 ? `<div class="sub">${esc(result.플레이스_게시형태)}</div>` : ''}</td>
    <td class="mid">${oxBadge(cells.get(cellKey('place', '교습비')))}<div class="sub fee" data-fee="place"></div></td>
    <td>${noPlace ? '<span class="dim">–</span>'
            : regNoCell(cells.get(cellKey('place', '번호')), [result.플레이스_기재번호], result.플레이스_번호대조)}</td>
    <td class="mid">${placeUrl ? openBtn(placeUrl, '열기') : '<span class="dim">–</span>'}</td>
  </tr>`];

    BUCKETS.forEach((b) => {
        const list = byBucket[b];
        if (!list || !list.length) return;   // 플레이스 홈에 링크가 없는 채널은 조사 대상이 아니다
        const where = [...new Set(list.map((c) => [c.조사범위, c.비고].filter(Boolean).join(' — ')))]
            .filter(Boolean).join(' / ');
        rows.push(`<tr>
      <td class="ch"><strong>${esc(BUCKET_LABEL[b])}</strong>${list.length > 1 ? ` (${list.length}곳)` : ''}
        ${where ? `<div class="sub">${esc(where)}</div>` : ''}</td>
      <td class="mid">${oxBadge(cells.get(cellKey(b, '교습비')))}<div class="sub fee" data-fee="${esc(b)}"></div></td>
      <td>${regNoCell(cells.get(cellKey(b, '번호')),
            list.map((c) => c.기재번호), worstCmp(list.map((c) => c.번호대조)))}</td>
      <td class="mid">${list.map((c, i) => openBtn(c.url, list.length > 1 ? `열기 ${i + 1}` : '열기')).join(' ')}</td>
    </tr>`);
    });

    return `<table class="grid">
    <thead><tr><th>채널 · 어디에 올렸나</th><th>교습비</th><th>${esc(label)}</th><th></th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  <p class="note">플레이스 홈에 링크가 걸린 채널만 조사합니다 — 링크가 없는 채널은 위에 나오지 않습니다.
  번호 칸의 <b>적힌 번호</b>가 위 ${esc(label)}와 같은지 확인하세요 — 잘못 적어둔 곳도 O 로 뜹니다.</p>`;
}

/**
 * ③ 네이버에 적힌 금액 — 자리만 만들어 둔다. 채우는 것은 창이 뜬 뒤 READ_SCRIPT 다.
 *
 * 왜 미리 담아 두지 않는가: 금액은 서버가 네이버를 다시 열어야 알 수 있고(가격표가 사진이면
 * Claude 까지 거친다) 10초쯤 걸린다. 그동안 창이 안 뜨면, 정작 급할 때 못 쓴다.
 * 창은 곧바로 띄우고 금액은 도착하는 대로 채운다.
 */
function readCard(placeId, blogUrl) {
    if (!placeId && !blogUrl) return '';
    return `<div class="card" id="readcard">
    <h2>③ 적힌 금액 — 어느 항목이 얼마인가 <span class="ai">자동으로 읽음</span></h2>
    <div id="readbody" class="reading">네이버에서 금액을 읽는 중입니다… (10초쯤 걸립니다)</div>
  </div>`;
}

/** 읽어올 곳과 대조할 신고 금액을 창 안으로 넘긴다 */
function readConfig(placeId, blogUrl, courses, name) {
    if (!placeId && !blogUrl) return '';
    const declared = [...new Set(courses.map((c) => parseNum(c.tuitionFee || c.totalFee))
        .filter((n) => n > 0))].sort((x, y) => x - y);
    const origin = typeof location !== 'undefined' ? location.origin : '';
    const cfg = { api: `${origin}/api/tuition-read`, placeId, blogUrl, declared, name };
    // '<' 를 그대로 두면 문자열 안의 '</script>' 하나로 문서가 끊긴다
    return `<script>var READ_CFG = ${JSON.stringify(cfg).replace(/</g, '\u003c')};</script>`;
}

/**
 * 읽어와 신고 금액과 맞춰 보여 준다.
 *
 * 판정하지 않는다 — 세 갈래(가격메뉴·가격표 이미지·블로그)에서 '적혀 있던 값' 을 적혀 있던
 * 자리와 함께 늘어놓고, 신고 금액과 같은지만 옆에 붙인다. 특히 가격표 이미지에서 온 값은
 * 사람이 사진을 찍어 올린 것을 기계가 읽은 것이라 틀릴 수 있으므로, 원본을 여는 단추를
 * 같은 줄에 둔다 — 지적은 원본을 보고 해야 한다.
 */
const READ_SCRIPT = `<script>
(function () {
  if (typeof READ_CFG === 'undefined') return;
  var body = document.getElementById('readbody');
  if (!body) return;

  var D = READ_CFG.declared || [];
  var DSET = {}, DMIN = D.length ? D[0] : 0, DMAX = D.length ? D[D.length - 1] : 0;
  D.forEach(function (n) { DSET[n] = true; });

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function won(n) { return Number(n).toLocaleString('ko-KR') + '원'; }
  function num(v) {
    var m = String(v == null ? '' : v).replace(/,/g, '').match(/[1-9][0-9]{3,7}/);
    return m ? Number(m[0]) : 0;
  }

  // 신고 금액과의 관계. 없는 금액이라고 곧장 위반은 아니다 — 신고 안 한 과정일 수도,
  // 기간·횟수가 다른 값일 수도 있다. 그래서 '다르다' 까지만 말하고 판단은 사람에게 남긴다.
  function cmp(amount) {
    if (!amount) return '';
    if (!D.length) return '<span class="dim">신고 자료 없음</span>';
    if (DSET[amount]) return '<span class="cmp-ok">✓ 신고금액과 같음</span>';
    if (amount < DMIN || amount > DMAX) return '<span class="cmp-bad">⚠ 신고 범위 밖</span>';
    return '<span class="cmp-warn">신고 목록에 없는 금액</span>';
  }

  function row(src, label, cond, amount, raw) {
    return '<tr><td class="src">' + esc(src) + '</td>'
      + '<td>' + (label ? esc(label) : '<span class="dim">–</span>') + '</td>'
      + '<td class="ctx">' + esc(cond || '') + '</td>'
      + '<td class="num"><strong>' + (amount ? won(amount) : esc(raw || '–')) + '</strong></td>'
      + '<td class="mid">' + cmp(amount) + '</td></tr>';
  }

  // ② 표의 교습비 칸 — 등록번호 칸의 '적힌 번호' 와 같은 자리, 같은 꼴.
  // 담당자의 눈은 이미 그 표에 가 있다. 답(얼마가 적혀 있나)은 거기서 끝나야 하고,
  // ③ 은 그 답의 근거(어느 항목·어느 조건에서 나온 값인가)를 받쳐 준다.
  function fee(bucket, amounts, empty) {
    var el = document.querySelector('[data-fee="' + bucket + '"]');
    if (!el) return;
    if (!amounts.length) { el.innerHTML = empty ? '<span class="dim">' + empty + '</span>' : ''; return; }
    var shown = amounts.slice(0, 6);
    el.innerHTML = '적힌 교습비 ' + shown.map(function (n) {
      var cls = DSET[n] ? '' : (n < DMIN || n > DMAX ? 'cmp-bad' : 'cmp-warn');
      return '<b class="' + cls + '">' + Number(n).toLocaleString('ko-KR') + '</b>';
    }).join(' · ') + '원'
      + (amounts.length > shown.length ? ' 외 ' + (amounts.length - shown.length) + '건' : '');
  }
  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (n) { if (n > 0 && !seen[n]) { seen[n] = 1; out.push(n); } });
    return out.sort(function (a, b) { return a - b; });
  }
  function waiting() {
    [].forEach.call(document.querySelectorAll('[data-fee]'), function (el) {
      el.innerHTML = '<span class="dim">금액 읽는 중…</span>';
    });
  }
  function clearWaiting() {
    [].forEach.call(document.querySelectorAll('[data-fee]'), function (el) {
      if (/읽는 중/.test(el.textContent)) el.innerHTML = '';
    });
  }

  function render(d) {
    var rows = [], notes = [], aiUsed = false, imgRows = [], introRows = [], blog = null;

    (d['플레이스'] && d['플레이스']['가격메뉴'] || []).forEach(function (m) {
      rows.push(row('가격메뉴', m['이름'], '', num(m['금액']), m['금액']));
    });

    // 플레이스 '정보' 탭 소개글에 '<교습비> 초등영어A : 26만원' 처럼 적어둔 곳
    introRows = (d['플레이스'] && d['플레이스']['소개글']) || [];
    introRows.forEach(function (m) {
      rows.push(row('플레이스 소개글', m['이름'], m['이름'] ? '' : m['문맥'], Number(m['금액']), ''));
    });

    imgRows = (d['플레이스'] && d['플레이스']['이미지읽음']) || [];
    imgRows.forEach(function (r) {
      aiUsed = true;
      var cond = [r.condition, r.period && r.period !== '모름' ? r.period + ' 기준' : ''].filter(Boolean).join(' · ');
      rows.push(row('가격표 이미지', r.label, cond, Number(r.amount), ''));
    });

    blog = d['블로그'];
    if (blog && blog.found) {
      (blog['금액'] || []).forEach(function (m) {
        rows.push(row('블로그 ' + (blog['어디'] || ''), '', m['문맥'], Number(m['금액']), ''));
      });
    }

    (d['비고'] || []).forEach(function (n) { notes.push(n); });

    var html = '';
    if (rows.length) {
      html += '<table class="grid"><thead><tr><th>어디에서</th><th>항목</th><th>조건 · 적힌 자리</th>'
        + '<th>금액</th><th>신고와 대조</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
    }

    var ai = d.ai || {};
    var says = [];
    if (!rows.length) says.push('네이버에서 글로 적힌 금액을 찾지 못했습니다.');
    if (blog && blog.found && !(blog['금액'] || []).length) {
      says.push('블로그 교습비 글은 찾았지만 <b>글로 적힌 금액이 없습니다</b> — 가격표가 이미지일 수 있습니다.');
    }
    if (blog && blog.found === false) says.push('블로그에서 교습비 글을 찾지 못했습니다.');
    if (ai['건너뜀']) says.push(esc(ai['건너뜀']) + '.');
    if (ai['남은이미지']) {
      says.push('가격표 이미지 ' + ai['남은이미지'] + '장은 읽지 않았습니다 — <b>원본</b>으로 확인하세요.');
    }
    if (ai['오류']) says.push('가격표 이미지를 읽지 못했습니다 — ' + esc(ai['오류']));
    if (ai['읽음'] === false) {
      says.push('가격표에서 금액을 읽어내지 못했습니다 — <b>원본</b>을 눌러 직접 보세요. (표가 아니거나 사진이 흐린 경우입니다)');
    }
    (d['오류'] || []).forEach(function (e) { says.push(esc(e)); });

    var links = [];
    if (blog && blog.url) links.push('<a class="open" href="' + esc(blog.url) + '" target="_blank" rel="noreferrer">블로그 글 열기 ↗</a>');
    ((d['플레이스'] && d['플레이스']['이미지']) || []).forEach(function (u, i) {
      links.push('<a class="open" href="' + esc(u) + '" target="_blank" rel="noreferrer">가격표 원본'
        + (i ? ' ' + (i + 1) : '') + ' ↗</a>');
    });

    if (says.length) html += '<p class="note">' + says.join('<br>') + '</p>';
    if (notes.length) html += '<p class="note">덧붙은 안내: ' + notes.map(esc).join(' · ') + '</p>';
    if (links.length) html += '<p style="margin-top:10px">' + links.join(' ') + '</p>';
    if (aiUsed) {
      html += '<div class="caution"><b>가격표 이미지는 Claude 가 읽은 값입니다.</b> 사람이 찍어 올린 사진이라'
        + ' 잘못 읽었을 수 있습니다 — 지적하기 전에 <b>가격표 원본</b>을 눌러 눈으로 확인하세요.'
        + ' 신고 금액과 다르다고 곧장 위반은 아닙니다: 신고하지 않은 과정이거나, 횟수·기간이 다른 값일 수 있습니다.</div>';
    }
    body.className = '';
    body.innerHTML = html;

    // ② 표로 올려 보낸다 — 플레이스는 가격메뉴+가격표이미지, 블로그는 본문에서 읽은 값
    clearWaiting();
    var placeAmounts = uniq(
      ((d['플레이스'] && d['플레이스']['가격메뉴']) || []).map(function (m) { return num(m['금액']); })
        .concat(introRows.map(function (m) { return Number(m['금액']); }))
        .concat(imgRows.map(function (r) { return Number(r.amount); }))
    );
    var hasImage = ((d['플레이스'] && d['플레이스']['이미지']) || []).length > 0;
    fee('place', placeAmounts, hasImage && !imgRows.length ? '금액은 가격표 이미지 안에 — 아래 원본' : '');

    var blogAmounts = uniq(
      (blog && blog.found ? (blog['금액'] || []) : []).map(function (m) { return Number(m['금액']); })
    );
    if (blog) fee('blog', blogAmounts, blog.found ? '글로 적힌 금액 없음' : '교습비 글을 못 찾음');
  }

  waiting();
  fetch(READ_CFG.api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeId: READ_CFG.placeId, blogUrl: READ_CFG.blogUrl, name: READ_CFG.name }),
  }).then(function (r) {
    if (!r.ok) throw new Error('서버가 ' + r.status + ' 로 답했습니다');
    return r.json();
  }).then(render).catch(function (e) {
    clearWaiting();
    body.innerHTML = '<span class="dim">금액을 읽어오지 못했습니다 — ' + esc(e.message)
      + '. 오른쪽 <b>열기</b>로 직접 확인하세요.</span>';
  });
})();
</script>`;

/**
 * 반반 붙이기 — 대조창 안에서 도는 스크립트다.
 *
 * 왜 창이 스스로 움직여야 하는가: 이 창이 하는 일은 '두 금액을 눈으로 맞추는 것' 하나뿐인데,
 * 지금까지 그 일의 절반은 사람이 창 두 개를 끌어다 크기를 맞추는 데 들었다. 학원 한 곳에
 * 채널이 서넛이면 그 끌어다 놓기를 서너 번 되풀이한다.
 *
 * 규칙 둘만 알면 된다.
 *  1) 브라우저는 스크립트가 window.open 으로 연 '창' 에만 moveTo/resizeTo 를 허용한다.
 *     탭으로 열리면 그 화면은 아무리 불러도 자리를 옮기지 못한다.
 *  2) 팝업 차단이 걸린 사이트에서는 window.open 이 null 을 돌려준다. 그때 이 창은 탭으로
 *     열리고(openHtmlPopup 의 대비책), 1) 때문에 반반 붙이기가 통째로 죽는다.
 *
 * 그래서 이 스크립트는 자기가 창인지 탭인지부터 확인한다 (팝업 창은 도구모음이 없다 —
 * window.toolbar.visible === false). 탭이면, 열기를 누른 그 한 번의 클릭으로 채널을 띄우고
 * 자기 자신을 왼쪽 절반 창에 복제한 뒤 탭은 닫는다. 사람이 따로 누를 것은 없다.
 * (막힌 것은 사이트의 팝업 권한인데, 같은 사이트라도 blob: 문서에서 여는 팝업은 통과한다 —
 *  이 창 자신이 blob: 문서라 복제가 먹힌다. 사이트의 팝업을 허용해 두면 대조창이 처음부터
 *  창으로 떠서 이 복제 자체가 없다.)
 *
 * 상대 창은 남의 출처(naver.com 등)라 열어 준 뒤에는 closed 밖에 못 본다 —
 * 그래서 크기는 열 때 features 로 정하고, 닫혔는지는 짧은 간격으로 되물어 본다.
 */
const SPLIT_SCRIPT = `<script>
(function () {
  var HTML = document.documentElement;

  // 창인가 탭인가 — 팝업 창에는 도구모음이 없다. 탭이면 자리를 못 옮긴다.
  var IS_WINDOW = (function () {
    try { return window.toolbar.visible === false; } catch (e) { return true; }
  })();

  // 탭에서 옮겨 온 복제본인가. 옮겨 올 때 채널 창 이름도 함께 물려받아, 먼저 열려 있던
  // 그 창을 이름으로 되찾는다 (adopt) — 되찾아야 '닫으면 제자리' 가 첫 채널부터 된다.
  var PROMOTED = HTML.getAttribute('data-promoted') === '1';
  var RIGHT = HTML.getAttribute('data-right') || ('academySplit_' + Math.random().toString(36).slice(2));
  HTML.removeAttribute('data-promoted');   // 이 창이 또 복제될 때 딸려가지 않게

  var right = null, timer = null, home = null;

  // availWidth 가 0 으로 오는 환경(임베드된 미리보기 등)이 있다 — 0 으로 나누면 창이 사라진다
  function screenBox() {
    var s = window.screen;
    return {
      left: s.availLeft || 0, top: s.availTop || 0,
      w: s.availWidth || s.width || 1280, h: s.availHeight || s.height || 800,
    };
  }
  function leftHalf() { var b = screenBox(); return { left: b.left, top: b.top, w: Math.floor(b.w / 2), h: b.h }; }
  function rightHalf() {
    var b = screenBox(), half = Math.floor(b.w / 2);
    return { left: b.left + half, top: b.top, w: b.w - half, h: b.h };
  }
  function feat(box) {
    return 'popup=yes,left=' + box.left + ',top=' + box.top + ',width=' + box.w + ',height=' + box.h;
  }

  // 반반으로 붙기 전 자리를 적어 둔다 — 돌아올 곳이다 (이미 적어 뒀으면 덮어쓰지 않는다)
  function goLeft() {
    var box = leftHalf();
    if (!home) home = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    try { window.moveTo(box.left, box.top); window.resizeTo(box.w, box.h); } catch (e) { /* 무시 */ }
    return rightHalf();
  }

  function goHome() {
    if (!home) return;
    try { window.moveTo(home.x, home.y); window.resizeTo(home.w, home.h); } catch (e) { /* 무시 */ }
    home = null;
  }

  // 남의 출처 창은 closed 만 읽을 수 있다 — 닫힘을 알려 주는 이벤트가 없으니 되물어 본다
  function watch() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (right && !right.closed) return;
      clearInterval(timer); timer = null; right = null;
      goHome();
    }, 400);
  }

  /**
   * 탭이었던 이 화면을 왼쪽 절반 창으로 옮긴다.
   *
   * 브라우저는 스크립트가 window.open 으로 연 창에만 자리·크기를 내준다. 이 사이트는
   * 팝업이 막혀 있어 대조창이 탭으로 열리는데(openHtmlPopup 의 대비책), 탭은 아무리 불러도
   * 왼쪽으로 물러나지 못한다. 같은 사이트라도 blob: 문서에서 여는 팝업은 통과하므로,
   * 지금 화면을 그대로 복제해 창으로 띄우고 이 탭은 닫는다 — 사람이 누를 것은 없다.
   */
  function promote() {
    HTML.setAttribute('data-promoted', '1');
    HTML.setAttribute('data-right', RIGHT);
    var html = '<!DOCTYPE html>\\n' + HTML.outerHTML;
    HTML.removeAttribute('data-promoted');   // 옮기지 못했을 때 이 화면에 흔적을 남기지 않는다
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html; charset=utf-8' }));
    var box = leftHalf();
    var win = window.open(url, '_blank', feat(box));
    if (!win) { URL.revokeObjectURL(url); return; }
    // 복제본이 다 읽기 전에 이 탭이 닫히면 blob 주소가 함께 사라진다 — 다 읽은 것을 보고 닫는다
    var t = setInterval(function () {
      var done = false;
      try { done = win.closed || (win.document && win.document.readyState === 'complete'); }
      catch (e) { done = true; }
      if (!done) return;
      clearInterval(t); URL.revokeObjectURL(url); window.close();
    }, 120);
    setTimeout(function () { clearInterval(t); URL.revokeObjectURL(url); window.close(); }, 6000);
  }

  /** 탭이 먼저 열어 둔 채널 창을 이름으로 넘겨받는다 (새 창을 여는 것이 아니다) */
  function adopt() {
    var w = null;
    try { w = window.open('', RIGHT); } catch (e) { return; }
    if (!w) return;
    var mine = true;
    try { void w.location.href; } catch (e) { mine = false; }   // 남의 출처 = 그 채널 창이 맞다
    if (mine) { try { w.close(); } catch (e) { /* 이름이 없어 새로 열린 빈 창 */ } return; }
    right = w;
    watch();
  }

  document.addEventListener('click', function (ev) {
    if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;  // 새 탭으로 열려는 사람은 그대로 둔다
    var a = ev.target && ev.target.closest && ev.target.closest('a.open');
    if (!a || !a.href) return;
    ev.preventDefault();

    // 창이면 먼저 왼쪽으로 물러난다. 탭이면 물러나 봐야 소용없으니 채널부터 띄우고 옮긴다.
    var box = IS_WINDOW ? goLeft() : rightHalf();
    var w = window.open(a.href, RIGHT, feat(box));
    if (!w) { goHome(); window.open(a.href, '_blank'); return; }   // 팝업 차단 — 자리는 못 잡아도 열기는 열어야 한다
    try { w.focus(); } catch (e) { /* 무시 */ }
    if (IS_WINDOW) { right = w; watch(); return; }
    promote();
  });

  window.addEventListener('pagehide', function () { if (timer) clearInterval(timer); });

  if (PROMOTED) {
    // 닫으면 돌아갈 자리는 '원래 대조창이 뜨던 크기' 다 — 옮겨 오기 전 탭의 크기가 아니라.
    var b = screenBox(), w0 = Math.min(1240, b.w);
    home = { x: b.left + Math.floor((b.w - w0) / 2), y: b.top, w: w0, h: b.h };
    adopt();
  }
})();
</script>`;

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
    // '적힌 금액' 을 읽어올 곳 — 플레이스(가격메뉴·가격표 이미지)와 대표 블로그.
    // 사람이 '플레이스 없음' 이라고 확인해 준 곳은 읽지 않는다 (물고 온 후보는 남의 업체다).
    const placeId = result && !isNoPlace(result) ? String(result.플레이스ID || '') : '';
    const blogUrl = result ? (parseChannels(result).find((c) => c.종류 === 'blog') || {}).url
        || result.블로그URL || '' : '';

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
  /* 오른쪽 표에 번호 열이 하나 더 붙어 왼쪽보다 넓어야 한다.
     좁아지면 나란히 두기를 포기하고 위아래로 쌓는다 — 눌러 붙인 표는 못 읽는다 */
  .cols { display: grid; grid-template-columns: 1fr 1.35fr; gap: 14px; align-items: start; }
  @media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
  table.grid { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
  .grid th, .grid td { border: 1px solid #e2e8f0; padding: 7px 9px; vertical-align: top; text-align: left; }
  .grid th { background: #f8fafc; font-size: 0.8rem; color: #475569; white-space: nowrap; }
  .grid td.num { text-align: right; white-space: nowrap; font-size: 0.95rem; }
  .grid td.mid { white-space: nowrap; text-align: center; }
  .grid td.ch strong { white-space: nowrap; }
  .regno { font-size: 1.05rem; font-weight: 700; margin-top: 6px; color: #0f172a; }
  .regno small { font-size: 0.76rem; font-weight: 600; color: #64748b; margin-left: 6px; }
  .warn { color: #b91c1c; font-weight: 700; }
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
  .kbd { border: 1px solid #d6bd8a; border-radius: 5px; padding: 0 5px; background: #fff; font-size: 0.8rem; }
  .src { font-size: 0.78rem; font-weight: 700; color: #475569; white-space: nowrap; }
  .grid td.mid .fee { white-space: normal; text-align: center; line-height: 1.35; }
  .ctx { font-size: 0.76rem; color: #64748b; }
  .cmp-ok { color: #059669; font-weight: 700; }
  .cmp-warn { color: #b45309; font-weight: 700; }
  .cmp-bad { color: #b91c1c; font-weight: 800; }
  .ai { margin-left: 6px; font-size: 0.68rem; font-weight: 700; color: #4338ca;
        background: #e0e7ff; border-radius: 999px; padding: 1px 7px; }
  .reading { font-size: 0.86rem; color: #64748b; padding: 10px 2px; }
  .caution { margin-top: 10px; font-size: 0.78rem; color: #92400e;
             background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 10px; }
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
    ${range ? `<div class="range">월 ${esc(range)}<small>신고된 월 교습비 범위</small></div>` : ''}
    <div class="regno">${esc(label)} <b>제${esc(regNo)}호</b><small>광고물에 이 번호가 그대로 적혀 있어야 합니다</small></div>
  </div>

  <div class="card howto">
    <b>오른쪽 <span class="kbd">열기</span>를 누르면 이 창이 화면 왼쪽 절반, 그 채널이 오른쪽 절반으로 붙습니다.</b>
    자동 조사는 교습비를 <b>올렸는지</b>만 보고 <b>얼마인지</b>는 읽지 않습니다 —
    금액이 맞는지는 사람이 봐야 합니다. 나란히 놓인 두 화면의 금액을 맞춰 보고,
    다 봤으면 오른쪽 창을 닫으세요 — 이 창은 저절로 제자리로 돌아옵니다.
    <span class="dim">(플레이스·블로그·홈페이지·인스타·카페 모두 같습니다. Ctrl+클릭은 예전처럼 새 탭입니다.)</span>
  </div>

  <div class="cols">
    <div class="card">
      <h2>① 신고한 교습비 · ${esc(label)}</h2>
      ${courseTable(courses)}
    </div>
    <div class="card">
      <h2>② 네이버에 올라온 것
        <span class="verdict" style="background:${VERDICT_COLOR[verdict] || '#94a3b8'}">${esc(verdict)}</span>
        ${result?.checkedAt ? `<span class="sub" style="display:inline; margin-left:6px;">${esc(fmtWhen(result.checkedAt))} 조사</span>` : ''}
      </h2>
      ${channelTable(result, name, region, label)}
    </div>
  </div>
  ${readCard(placeId, blogUrl)}
</div>
${readConfig(placeId, blogUrl, courses, name)}
${SPLIT_SCRIPT}
${READ_SCRIPT}
</body>
</html>`;
}

/**
 * 대조창을 새 '창' 으로 띄운다 (탭이 아니다).
 * 탭으로 열면 채널을 눌렀을 때 왼쪽 절반으로 물러설 수가 없다 — 브라우저가 탭의
 * 자리·크기는 스크립트에 내주지 않기 때문이다 (openHtmlPopup 주석).
 */
export function openTuitionCompare(academy, result, opts) {
    openHtmlPopup(buildTuitionCompareHtml(academy, result, opts), { width: 1240 });
}
