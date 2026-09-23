/**
 * 나이스 '교습비 일괄등록 및 정보공개' 업로드용 엑셀 만들기
 *
 * 나이스에서 내려받는 교습비일괄등록및정보공개[학원명].xlsx 와 같은 행·열 순서로 쓴다.
 *   - 학원  : 34열 (A~AH)
 *   - 교습소: 35열 (A~AI) — 학원 H열 자리에 머리글 없는 칸이 하나 더 있고, 그 뒤가 한 칸씩 밀린다
 *   - A~D 병합(학원명), 교습기간은 4칸(숫자·'개월'·숫자·'일')을 머리글에서 병합
 *
 * E열(나이스 학원등록번호)·F열(과목별 고유번호)은 이 앱이 모르는 값이다.
 * 변경 탭에서 나이스 일괄등록 엑셀을 올렸으면 그 줄을 그대로 두고 고친 칸만 바꾼다(neisRow).
 * 신규 등록이거나 다른 엑셀로 불러온 경우에는 비워 둔다.
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// 학원 기준 열 번호 (0부터). 교습소는 TEACHING_EXTRA_COL 이상이 +1
const COL = {
  name: 0, regNo: 4, rowId: 5, kind: 6,
  field: 7, series: 8, process: 9, target: 10, subject: 11, capacity: 12,
  months: 13, monthsUnit: 14, days: 15, daysUnit: 16, totalTime: 17,
  mockExamFee: 18, materialFee: 19, mealFee: 20, dormitoryFee: 21, vehicleFee: 22, clothingFee: 23,
  changeNote: 24, fee: 25, feeMonth: 26, feeHour: 27, feeMinute: 28, extraTotal: 29,
  grandTotal: 30, grandTotalHour: 31, applyDate: 32, note: 33,
};
const TEACHING_EXTRA_COL = 7;
const ACADEMY_WIDTH = 34;

// 나이스 엑셀의 기타경비 열 순서 (모의고사비·재료비·급식비·기숙사비·차량비·피복비)
const EXTRA_KEYS = ['mockExamFee', 'materialFee', 'mealFee', 'dormitoryFee', 'vehicleFee', 'clothingFee'];
const NUMBER_KEYS = ['months', 'days', 'totalTime', ...EXTRA_KEYS, 'fee', 'feeMonth', 'feeHour', 'feeMinute', 'extraTotal', 'grandTotal', 'grandTotalHour'];

const DEFAULT_KIND = '학교교과교습학원';
const TEACHING_EXTRA_DEFAULT = '1';

/** 교습소 여부에 따라 실제 열 번호 */
export function bulkCol(key, isTeaching) {
  const c = COL[key];
  return isTeaching && c >= TEACHING_EXTRA_COL ? c + 1 : c;
}

export const bulkWidth = (isTeaching) => ACADEMY_WIDTH + (isTeaching ? 1 : 0);

/** 나이스 일괄등록 엑셀인지 — 첫 줄 A열 '학원명'/'교습소명', E열 '…등록번호' */
export function isBulkHeader(headerRow) {
  const a = String(headerRow?.[0] ?? '').trim();
  const e = String(headerRow?.[4] ?? '').trim();
  return (a === '학원명' || a === '교습소명') && e.includes('등록번호');
}

function headerRow(isTeaching) {
  const label = isTeaching ? '교습소' : '학원';
  const row = new Array(bulkWidth(isTeaching)).fill(null);
  const set = (key, v) => { row[bulkCol(key, isTeaching)] = v; };
  set('name', `${label}명`);
  set('regNo', `${label}등록번호`);
  set('kind', `${label}종류`);
  set('field', '분야구분');
  set('series', '교습계열');
  set('process', '교습과정');
  set('target', '교습대상');
  set('subject', '교습과목');
  set('capacity', '정원');
  set('months', '교습기간');
  set('totalTime', '총교습시간(분)');
  set('mockExamFee', '모의고사비');
  set('materialFee', '재료비');
  set('mealFee', '급식비');
  set('dormitoryFee', '기숙사비');
  set('vehicleFee', '차량비');
  set('clothingFee', '피복비');
  set('changeNote', '변경내역');
  set('fee', '교습비');
  set('feeMonth', '교습비(월)');
  set('feeHour', '교습비(시)');
  set('feeMinute', '교습비(분)');
  set('extraTotal', '기타경비 합계');
  set('grandTotal', '총교습비');
  set('grandTotalHour', '총교습비(시)');
  set('applyDate', '적용일자');
  set('note', '비고');
  return row;
}

/**
 * 이 앱의 지역 기준 줄(분야·교습과정·과목) → 나이스 분야구분·교습계열·교습과정·교습대상
 * 나이스 실제 값으로 확인된 것: 입시·보습(입시.검정 및 보습 / 보통교과 / 보습 / 초등), 예능(예능(대) / 예능(중) / 미술)
 */
export function neisClassOf(rateRow) {
  if (!rateRow) return { field: '', series: '', process: '', target: '' };
  const field = String(rateRow.field || '');
  const process = String(rateRow.process || '');
  const subject = String(rateRow.subject || '');
  if (field.includes('보습')) {
    return { field: '입시.검정 및 보습', series: '보통교과', process, target: ['초등', '중등', '고등'].includes(subject) ? subject : '' };
  }
  if (field.includes('예능')) {
    return { field: '예능(대)', series: '예능(중)', process, target: '' };
  }
  return { field, series: field, process, target: '' };
}

/** '1개월', '3개월 15일', '10일', '2' → { months, days } */
export function parsePeriod(period) {
  const s = String(period || '').replace(/\s+/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)개월/);
  const d = s.match(/(\d+)일/);
  if (m || d) return { months: m ? parseFloat(m[1]) : 0, days: d ? parseInt(d[1], 10) : 0 };
  const n = parseFloat(s);
  return { months: n > 0 ? n : 1, days: 0 };
}

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
};

/** 과목 줄의 총교습시간(분) — 화면 판정과 같은 계산, 역산에 실패한 나이스 줄은 원래 값 */
function totalTimeOf(sub) {
  const t = Math.round(num(sub.dm) * num(sub.wc) * num(sub.wk));
  return t > 0 ? t : num(sub.neisTotal);
}

/** 이 과목에 붙는 기타경비 줄 — 과목명이 같은 줄, 없으면 '전과목·전체·공통' 줄 */
function extraFeeOf(sub, extraFees) {
  const name = String(sub.subjectName || '').trim();
  const rows = (extraFees || []).filter(r => String(r.subjectName || '').trim());
  const hit = rows.find(r => String(r.subjectName).trim() === name)
    || rows.find(r => ['전과목', '전체', '공통'].includes(String(r.subjectName).trim()));
  const out = {};
  for (const k of EXTRA_KEYS) out[k] = hit ? num(hit[k]) : 0;
  return out;
}

const isBlankSub = (sub) => !String(sub.subjectName || '').trim() && !num(sub.fee);

/**
 * 받기 전에 확인 — 빈 줄은 건너뛰고, 반만 적힌 줄은 몇 번째인지 알려 준다
 * @returns {string[]} 문제 목록 (비어 있으면 받을 수 있음)
 */
export function checkBulkSubjects(subjects) {
  const problems = [];
  const filled = subjects.filter(s => !isBlankSub(s));
  if (!filled.length) return ['적힌 교습과목이 없습니다.'];
  subjects.forEach((s, i) => {
    if (isBlankSub(s)) return;
    const miss = [];
    if (!String(s.subjectName || '').trim()) miss.push('교습과목');
    if (!s.rateId && !s.neisRow) miss.push('교습과정');
    if (!totalTimeOf(s)) miss.push('총교습시간');
    if (!num(s.fee)) miss.push('교습비');
    if (miss.length) problems.push(`${i + 1}번째 줄: ${miss.join('·')}`);
  });
  return problems;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 20260923_2210_교습비일괄등록[피플미술학원]-전체변경.xlsx */
export function bulkFileName(academyName, regType, now = new Date()) {
  const ymd = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const hm = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  const name = String(academyName || '학원').replace(/[\\/:*?"<>|[\]]/g, '').trim() || '학원';
  return `${ymd}_${hm}_교습비일괄등록[${name}]-${regType}.xlsx`;
}

/**
 * @param {object} p
 * @param {boolean} p.isTeaching  교습소 양식(35열)으로 쓸지
 * @param {string}  p.academyName
 * @param {string}  [p.kind]      학원종류 (나이스 줄이 없을 때만 씀)
 * @param {string}  p.regType     신규등록 / 일부변경 / 전체변경 — 파일 이름에 붙음
 * @param {object[]} p.subjects   RegistrationSheet 과목 줄 (neisRow·neisRateId·neisTotal 은 나이스 엑셀에서 온 줄)
 * @param {object[]} p.extraFees
 * @param {object[]} p.rateRows   지역 기준 줄 (교습과정 → 나이스 분류)
 */
export function buildBulkRows({ isTeaching, academyName, kind, subjects, extraFees, rateRows }, now = new Date()) {
  const width = bulkWidth(isTeaching);
  const applyDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  // 나이스에서 온 첫 줄 — 새로 더한 줄의 학원등록번호·학원종류를 여기서 따라감
  const template = subjects.find(s => Array.isArray(s.neisRow))?.neisRow;

  const rows = [headerRow(isTeaching)];
  for (const sub of subjects) {
    if (isBlankSub(sub)) continue;
    const fromNeis = Array.isArray(sub.neisRow);
    const row = fromNeis ? [...sub.neisRow] : new Array(width).fill(null);
    while (row.length < width) row.push(null);
    row.length = width;
    const set = (key, v) => { row[bulkCol(key, isTeaching)] = v; };

    if (!fromNeis) {
      set('regNo', template ? template[bulkCol('regNo', isTeaching)] : null);
      set('kind', (template && template[bulkCol('kind', isTeaching)]) || kind || DEFAULT_KIND);
      if (isTeaching) row[TEACHING_EXTRA_COL] = (template && template[TEACHING_EXTRA_COL]) || TEACHING_EXTRA_DEFAULT;
    }
    // 교습과정을 새로 고른 줄만 분류를 다시 씀 (나이스 줄은 원래 분류가 정확함)
    if (!fromNeis || sub.rateId !== sub.neisRateId) {
      const cls = neisClassOf(rateRows.find(r => r.id === sub.rateId));
      set('field', cls.field);
      set('series', cls.series);
      set('process', cls.process);
      set('target', cls.target || null);
    }

    const { months, days } = parsePeriod(sub.period);
    const totalTime = totalTimeOf(sub);
    const fee = num(sub.fee);
    const extras = extraFeeOf(sub, extraFees);
    const extraTotal = EXTRA_KEYS.reduce((s, k) => s + extras[k], 0);
    const grandTotal = fee + extraTotal;

    set('name', academyName);
    set('subject', String(sub.subjectName).trim());
    set('capacity', String(sub.capacity ?? '').trim() || (fromNeis ? row[bulkCol('capacity', isTeaching)] : null));
    set('months', months);
    set('monthsUnit', '개월');
    set('days', days);
    set('daysUnit', '일');
    set('totalTime', totalTime);
    for (const k of EXTRA_KEYS) set(k, extras[k]);
    set('fee', fee);
    set('feeMonth', months > 0 ? fee / months : fee);
    // 나이스가 내려 주는 값과 소수점 끝자리까지 같도록 계산 순서를 맞춤
    const feeHour = totalTime > 0 ? (fee * 60) / totalTime : 0;
    set('feeHour', feeHour);
    set('feeMinute', feeHour / 60);
    set('extraTotal', extraTotal);
    set('grandTotal', grandTotal);
    set('grandTotalHour', totalTime > 0 ? (grandTotal / totalTime) * 60 : 0);
    set('applyDate', applyDate);
    rows.push(row);
  }
  return rows;
}

/** 나이스 원본과 같은 모양의 시트 (문자 칸은 '@', 숫자 칸은 '#,##0', A~D 병합) */
export function buildBulkSheet(rows, isTeaching) {
  const width = bulkWidth(isTeaching);
  const numberCols = new Set(NUMBER_KEYS.map(k => bulkCol(k, isTeaching)));
  const ws = {};
  rows.forEach((row, r) => {
    for (let c = 0; c < width; c++) {
      const v = row[c];
      if (v === null || v === undefined || v === '') continue;
      const ref = XLSX.utils.encode_cell({ r, c });
      if (r > 0 && numberCols.has(c) && typeof v === 'number') ws[ref] = { t: 'n', v, z: '#,##0' };
      else ws[ref] = { t: 's', v: String(v), z: '@' };
    }
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: width - 1 } });
  const periodCol = bulkCol('months', isTeaching);
  ws['!merges'] = [
    ...rows.map((_, r) => ({ s: { r, c: 0 }, e: { r, c: 3 } })),
    { s: { r: 0, c: periodCol }, e: { r: 0, c: periodCol + 3 } },
  ];
  ws['!cols'] = Array.from({ length: width }, (_, c) => ({ wch: c < 4 ? 5 : c === bulkCol('subject', isTeaching) ? 18 : 12 }));
  return ws;
}

export function downloadTuitionBulkExcel(params) {
  const now = new Date();
  const rows = buildBulkRows(params, now);
  const wb = XLSX.utils.book_new();
  // 나이스가 내려 주는 파일의 시트 이름과 같게
  XLSX.utils.book_append_sheet(wb, buildBulkSheet(rows, params.isTeaching), 'empty0');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), bulkFileName(params.academyName, params.regType, now));
}

/** 나이스 일괄등록 엑셀(행 배열) → 변경 탭이 쓰는 academy 목록 */
export function parseBulkRows(raw) {
  const isTeaching = String(raw[0]?.[0] ?? '').trim() === '교습소명';
  const width = bulkWidth(isTeaching);
  const get = (row, key) => row[bulkCol(key, isTeaching)];
  const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const map = new Map();
  for (const r of raw.slice(1)) {
    const row = Array.from({ length: width }, (_, i) => (r?.[i] === undefined ? null : r[i]));
    const name = s(get(row, 'name'));
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, { name, address: '', category: s(get(row, 'kind')), founder: { name: '' }, changeDate: '', regDate: '', courses: [], neisBulk: { isTeaching } });
    }
    const academy = map.get(name);
    const months = num(get(row, 'months'));
    const days = num(get(row, 'days'));
    const period = [months ? `${months}개월` : '', days ? `${days}일` : ''].filter(Boolean).join(' ') || '1개월';
    const date = s(get(row, 'applyDate')).replace(/-/g, '.');
    if (date > academy.changeDate) { academy.changeDate = date; academy.regDate = date; }
    const course = {
      process: [s(get(row, 'process')), s(get(row, 'target'))].filter(Boolean).join(' '),
      subject: s(get(row, 'subject')),
      period,
      totalTime: s(get(row, 'totalTime')),
      tuitionFee: s(get(row, 'fee')),
      capacity: s(get(row, 'capacity')),
      note: '',
      neisRow: row,
    };
    for (const k of EXTRA_KEYS) course[k] = num(get(row, k)) ? String(num(get(row, k))) : '';
    academy.courses.push(course);
  }
  return Array.from(map.values());
}
