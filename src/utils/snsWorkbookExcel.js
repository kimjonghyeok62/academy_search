// SNS 점검표 엑셀 — 지도점검 보조요원이 종이로 들고 전화를 돌리는 물건.
//
// 화면의 표를 그대로 옮기되 두 가지를 더한다.
//   ① 종이에 손으로 적을 칸 (전화일자·통화자·안내내용·재확인일·완료)
//   ② 신고 월교습비 — 전화하면서 '네이버에 뜬 금액이 신고액과 같은가' 를 바로 물어야 한다
//
// 머리글은 화면과 같은 2줄 짜리다. 틀 고정과 '인쇄할 때 모든 쪽에 머리글 되풀이' 는
// SheetJS 가 못 하므로 xlsxPanes.js 가 저장 직전에 넣는다.

import * as XLSX from 'xlsx';
import {
    rowCells, parseChannels, assignBuckets, snsRemark, memoText, currentPlaceUrl,
    BUCKETS, BUCKET_LABEL,
} from './snsCheck';
import { insuranceStatus } from './insurance';
import { sortCourses } from './generateTuitionPDF';
import { feeRange } from './tuitionCompareWindow';
import { saveAs } from 'file-saver';
import { buildXlsxWithPanes } from './xlsxPanes';

// 표와 같은 순서 — 플레이스 뒤로 블로그·홈페이지·카페·유튜브·인스타·기타
const GROUPS = ['place', ...BUCKETS];
const GROUP_LABEL = { place: '플레이스', ...BUCKET_LABEL };

// 왼쪽 고정 칸(연번·학원명)과 머리글 2줄을 얼려 둔다
const FREEZE = { rows: 2, cols: 2 };

// 30열이라 A4 로는 글자가 뭉개진다. A3(paperSize 8) 가로로 한 장에 맞춘다 —
// 엑셀에서 A4 로 바꾸는 것은 담당자가 두 번 눌러 할 수 있다.
const PAGE_SETUP = { paperSize: 8, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };

// 손으로 적는 칸. 비워 두는 것이 일이다 — 채워 놓으면 종이에서 고칠 수가 없다.
const BLANKS = ['전화일자', '통화자', '안내내용', '재확인일', '완료'];

// 머리글 앞쪽의 단일 열 수 (연번·학원명·주소·연락처·번호·신고 월교습비)
const LEAD = 6;
const CH_FIRST = LEAD + 1;                       // 채널 14칸의 첫 열
const CH_LAST = LEAD + GROUPS.length * 2;        // 〃 마지막 열
const TAIL_FIRST = CH_LAST + 1;                  // 플레이스 주소부터

// 종이에서 잘리면 안 되는 긴 칸은 줄바꿈, 한 글자짜리 판정은 가운데.
// (열 번호는 1부터 — header() 가 만드는 순서와 짝이다)
const STYLE_COLS = {
    headerRows: 2,
    wrap: [2, 3, TAIL_FIRST, TAIL_FIRST + 1, TAIL_FIRST + 2, TAIL_FIRST + 4],
    center: [1, 5, ...Array.from({ length: CH_LAST - LEAD }, (_, i) => CH_FIRST + i),
        TAIL_FIRST + 3, TAIL_FIRST + 9],
};

// 화면의 칸 값 → 종이에서 읽을 글자. '안함'(자동 조사 대상 아님)은 종이에서 'X' 와
// 헷갈리면 안 되므로 줄표로 바꾼다.
const CELL_TEXT = { 안함: '–', '': '' };
const cellText = (v) => (v in CELL_TEXT ? CELL_TEXT[v] : v);

/** 채널마다 어디를 봐야 하는지 — 종이에서도 매체 이름과 주소가 짝지어 보여야 한다 */
function channelLines(result) {
    const chs = parseChannels(result);
    const at = assignBuckets(chs);
    return chs.map((c, i) => `${BUCKET_LABEL[at[i]]} ${c.url}`).join('\n');
}

/** 머리글 2줄 + 병합 자리 */
function header(numberLabel) {
    const single = [
        '연번', '학원명', '주소', '연락처', numberLabel, '신고 월교습비',
    ];
    // STYLE_COLS 의 열 번호가 이 배열 길이에 기대고 있다 — 늘리면 LEAD 도 함께 고칠 것
    if (single.length !== LEAD) throw new Error('LEAD 와 머리글 앞쪽 열 수가 어긋납니다');
    const tail = ['플레이스 주소', '연결채널', '비고', '보험', '적요', ...BLANKS];

    const row1 = [...single];
    const row2 = single.map(() => '');
    GROUPS.forEach((g) => { row1.push(GROUP_LABEL[g], ''); row2.push('번호', '교습비'); });
    tail.forEach((t) => { row1.push(t); row2.push(''); });

    const merges = [];
    single.forEach((_, i) => merges.push({ s: { r: 0, c: i }, e: { r: 1, c: i } }));
    GROUPS.forEach((_, i) => {
        const c = single.length + i * 2;
        merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 1 } });
    });
    tail.forEach((_, i) => {
        const c = single.length + GROUPS.length * 2 + i;
        merges.push({ s: { r: 0, c }, e: { r: 1, c } });
    });

    const cols = [
        { wch: 5 }, { wch: 24 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 20 },
        ...GROUPS.flatMap(() => [{ wch: 6 }, { wch: 7 }]),
        { wch: 34 }, { wch: 40 }, { wch: 34 }, { wch: 10 }, { wch: 20 },
        { wch: 11 }, { wch: 9 }, { wch: 22 }, { wch: 11 }, { wch: 7 },
    ];
    return { row1, row2, merges, cols };
}

function bodyRow({ target, result, academy, dup }, i) {
    const byKey = new Map(rowCells(result).map((c) => [c.key, c.value]));
    const ins = insuranceStatus(academy);
    return [
        i + 1,
        target.name || '',
        target.address || '',
        target.contact || '',
        target.regNo || '',
        feeRange(sortCourses(academy?.courses || [])),
        ...GROUPS.flatMap((g) => [cellText(byKey.get(`${g}|번호`)), cellText(byKey.get(`${g}|교습비`))]),
        currentPlaceUrl(result) || '',
        channelLines(result),
        snsRemark(result, dup),
        ins.unknown ? '' : ins.label,
        memoText(result),
        ...BLANKS.map(() => ''),
    ];
}

/** 시트 한 장 */
function makeSheet(rows, numberLabel) {
    const { row1, row2, merges, cols } = header(numberLabel);
    const ws = XLSX.utils.aoa_to_sheet([row1, row2, ...rows.map(bodyRow)]);
    ws['!merges'] = merges;
    ws['!cols'] = cols;
    return ws;
}

const ymd = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 점검표를 내려받는다.
 * sheets: [{ name: '학원', numberLabel: '등록번호', rows: [{ target, result, academy, dup }] }]
 * 행이 없는 시트도 머리글만 넣어 만든다 — 파일 모양이 매번 같아야 종이 묶음이 헷갈리지 않는다.
 */
export async function downloadSnsWorkbook({ region, sheets }) {
    const blob = await buildXlsxWithPanes(buildSnsWorkbook(sheets), {
        freeze: FREEZE,
        printTitles: '1:2',
        pageSetup: PAGE_SETUP,
        styles: STYLE_COLS,
    });
    saveAs(blob, `SNS점검표_${region}_${ymd()}.xlsx`);
}

/** 워크북만 만든다 — 내려받기와 나눠 둬야 브라우저 없이도 결과를 열어 볼 수 있다 */
export function buildSnsWorkbook(sheets) {
    const wb = XLSX.utils.book_new();
    sheets.forEach((s) => {
        XLSX.utils.book_append_sheet(wb, makeSheet(s.rows, s.numberLabel), s.name);
    });
    return wb;
}
