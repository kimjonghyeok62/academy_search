/**
 * 교습비 게시표를 한글 파일(.hwpx)로 내려받기.
 *
 * 워드(.docx)는 표를 우리가 직접 그리지만, 한글은 그럴 필요가 없다 — public/ 에 넣어 둔
 * **한글에서 만든 양식**을 열어 학원명·등록번호·날짜·서명란만 바꾸고, 표의 예시 행을
 * 복제해 교습과정 수만큼 채운다. 글꼴·테두리·열 너비·쪽 넘김 때 제목 줄 반복 같은 것은
 * 한글이 이미 정해 둔 그대로 남는다. 학원이 받아서 자기 사정에 맞게 고쳐 쓰는 용도다.
 *
 * 값을 셈하는 자리는 게시표(generateTuitionPDF.js)와 같아야 한다 — 같은 학원의 PDF 와
 * 한글 파일이 다른 금액을 내면 어느 쪽이 맞는지 알 수 없다. 그래서 헬퍼를 모두 그쪽에서
 * 가져다 쓴다.
 */
import {
    sortCourses, getRegNoText, fmtNum, parseNum, formatPeriod, formatChangeDateKo,
    getSignLabel, OTHER_FEE_ITEMS, getWeeklyTotalMinutes, calcWeeklyMinutes,
} from './generateTuitionPDF';
import { download, formFileName } from './tuitionFormFiles';

const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
const SECTION_PATH = 'Contents/section0.xml';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

const TEMPLATE_INTERNAL = '교습비게시표_내부용_양식.hwpx';
const TEMPLATE_EXTERNAL = '교습비게시표_외부용_양식.hwpx';

// ── 내부용 ──────────────────────────────────────────────
// 열 차례: 교습과정 / 총교습시간 / 교습비 / 징수단위 / 기타경비 6칸 / 합계

export async function downloadTuitionInternalHWPX(academy) {
    const { zip, doc } = await _loadTemplate(TEMPLATE_INTERNAL);
    _fillCommon(doc, academy);

    const courses = sortCourses(academy.courses || []);
    const { tbl, dataRowTemplate, noteRow } = _prepareTable(doc);

    const rows = courses.map(c => {
        const tuition = parseNum(c.tuitionFee || c.totalFee);
        const total = tuition + OTHER_FEE_ITEMS.reduce((s, it) => s + parseNum(c[it.key]), 0);
        const texts = [
            [c.process, c.subject].filter(Boolean).join('\n'),
            fmtNum(c.totalTime),
            fmtNum(c.tuitionFee || c.totalFee),
            formatPeriod(c.period),
            ...OTHER_FEE_ITEMS.map(it => fmtNum(c[it.key])),
            total > 0 ? total.toLocaleString('ko-KR') : '',
        ];
        return _fillRow(dataRowTemplate.cloneNode(true), texts);
    });
    // 게시표는 빈 칸이 있어야 손으로 덧붙일 수 있다 (PDF 도 8행을 채운다)
    for (let i = courses.length; i < 8; i++) rows.push(_fillRow(dataRowTemplate.cloneNode(true), []));

    _replaceDataRows(tbl, rows, noteRow);
    _fillNote(noteRow, courses);

    await _download(zip, doc, academy, formFileName(academy.name, '내부용', 'hwpx'));
}

// ── 외부용 (옥외가격표시) ────────────────────────────────
// 열 차례: 교습과목 / 교습시간(주기준) / 교습비 / 항목 / 금액 / 합계

export async function downloadTuitionExternalHWPX(academy) {
    const { zip, doc } = await _loadTemplate(TEMPLATE_EXTERNAL);
    _fillCommon(doc, academy);

    const courses = sortCourses(academy.courses || []);
    const { tbl, dataRowTemplate, noteRow } = _prepareTable(doc);
    // 양식에서 비어 있는 항목·금액 칸도 교습과목 칸과 같은 글자 서식으로
    const dataCharPr = _els(_cells(dataRowTemplate)[0], 'run').find(r => _els(r, 't').length)?.getAttribute('charPrIDRef');

    // 기타경비 항목이 여러 개여도 과정 1개 = 1행 (항목·금액은 칸 안에서 줄바꿈).
    // 행을 병합(rowspan)하면 한글이 쪽 경계에서 병합 칸을 두 쪽으로 쪼갠다 —
    // 화면용 HTML 은 rowspan 을 쓰지만 여기서는 쓸 수 없다.
    const rows = courses.map(c => {
        const tuition = parseNum(c.tuitionFee || c.totalFee);
        const items = OTHER_FEE_ITEMS.filter(it => parseNum(c[it.key]) > 0);
        const total = tuition + items.reduce((s, it) => s + parseNum(c[it.key]), 0);
        const tuitionStr = tuition > 0 ? `월 ${tuition.toLocaleString('ko-KR')}원` : '';
        const totalStr = total > 0 ? `월 ${total.toLocaleString('ko-KR')}원` : tuitionStr;
        const weeklyTotal = c.weeklyScheduleStr ? getWeeklyTotalMinutes(c.weeklyScheduleStr) : calcWeeklyMinutes(c.totalTime);

        const row = dataRowTemplate.cloneNode(true);
        const cells = _cells(row);
        _setCellText(cells[0], [c.process, c.subject].filter(Boolean).join('\n'));
        _setTuitionCell(cells[2], tuitionStr, weeklyTotal ? `←(주당 ${weeklyTotal}분)` : '');
        _setCellText(cells[3], items.map(it => it.label).join('\n'), dataCharPr);
        _setCellText(cells[4], items.map(it => fmtNum(c[it.key])).join('\n'), dataCharPr);
        _setCellText(cells[5], totalStr);
        return row;
    });
    for (let i = courses.length; i < 6; i++) rows.push(_fillRow(dataRowTemplate.cloneNode(true), []));

    _replaceDataRows(tbl, rows, noteRow);
    _fillNote(noteRow, courses);

    await _download(zip, doc, academy, formFileName(academy.name, '외부용', 'hwpx'));
}

// ── 양식 처리 ───────────────────────────────────────────

async function _loadTemplate(fileName) {
    const { default: JSZip } = await import('jszip');
    const res = await fetch(encodeURI(`${import.meta.env.BASE_URL}${fileName}`));
    if (!res.ok) throw new Error(`한글 양식 파일을 불러오지 못했습니다 (${fileName})`);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const xml = await zip.file(SECTION_PATH).async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('한글 양식 파일 형식 오류');
    return { zip, doc };
}

// 학원명·등록번호, 날짜, 서명란 (표 밖의 문단)
function _fillCommon(doc, academy) {
    const ts = _els(doc, 't');
    const d = formatChangeDateKo(academy.changeDate || academy.regDate || '');

    // 학원명 문단: [학원명 ][등록번호: 제 ○○호] 두 조각으로 되어 있다
    const regT = ts.find(t => /\[(등록|신고)번호/.test(t.textContent));
    if (regT) {
        const regNo = getRegNoText(academy);
        const regRun = regT.parentNode;
        const nameRun = _prevRunWithText(regRun);
        _clearLineseg(_closestPara(regRun));
        if (nameRun) _writeT(_els(nameRun, 't')[0], regNo ? `${academy.name} ` : academy.name);
        if (regNo) _writeT(regT, regNo);
        else regRun.remove();
    }

    // 날짜 (예: "2023년  8월  18일  현재 [단위: 원]") — 띄어쓰기는 양식 그대로 둔다
    const dateRe = /\d{4}(\s*년\s*)\d{1,2}(\s*월\s*)\d{1,2}(\s*일)/;
    ts.filter(t => dateRe.test(t.textContent)).forEach(t => {
        t.textContent = t.textContent.replace(dateRe, `${d.year || '    '}$1${d.month || '   '}$2${d.day || '   '}$3`);
        _clearLineseg(_closestPara(t));
    });

    // 서명란 (예: "○○학원 설립운영자" + 전각 공백 여러 개 + "(서명 또는 인)")
    // 이름 뒤의 전각 공백(U+3000)은 서명할 자리다 — 양식에 있는 만큼 그대로 남긴다
    const WIDE_SPACE = '　';
    const signT = ts.find(t => t.textContent.includes('(서명 또는 인)'));
    if (signT) {
        const { prefix, signerName } = getSignLabel(academy);
        const old = signT.textContent;
        const gap = old.indexOf(WIDE_SPACE) >= 0 ? old.slice(old.indexOf(WIDE_SPACE)) : '  (서명 또는 인)';
        signT.textContent = `${prefix}${signerName ? ` ${signerName}` : ''}${gap}`;
        _clearLineseg(_closestPara(signT));
    }
}

// 표: 머리글 행(header="1") / 예시 데이터 행 / 마지막 비고 행으로 나눈다
function _prepareTable(doc) {
    const tbl = _els(doc, 'tbl')[0];
    if (!tbl) throw new Error('한글 양식에서 표를 찾을 수 없습니다');
    const trs = Array.from(tbl.childNodes).filter(n => n.localName === 'tr');
    const bodyRows = trs.filter(tr => !_cells(tr).every(tc => tc.getAttribute('header') === '1'));
    const noteRow = bodyRows[bodyRows.length - 1];
    const dataRowTemplate = bodyRows[0].cloneNode(true);
    bodyRows.slice(0, -1).forEach(tr => tr.remove());
    _clearLineseg(_closestPara(tbl));
    return { tbl, dataRowTemplate, noteRow };
}

function _replaceDataRows(tbl, rows, noteRow) {
    rows.forEach(r => tbl.insertBefore(r, noteRow));
    const trs = Array.from(tbl.childNodes).filter(n => n.localName === 'tr');
    trs.forEach((tr, rowIdx) => {
        _cells(tr).forEach(tc => _child(tc, 'cellAddr')?.setAttribute('rowAddr', String(rowIdx)));
    });
    tbl.setAttribute('rowCnt', String(trs.length));
}

function _fillRow(tr, texts) {
    _cells(tr).forEach((tc, i) => _setCellText(tc, texts[i] || ''));
    return tr;
}

function _fillNote(noteRow, courses) {
    const notes = [...new Set(courses.map(c => (c.note || '').trim()).filter(Boolean))];
    const p = _els(noteRow, 'p')[0];
    const runs = _els(p, 'run');
    const emptyRun = runs.find(r => !_els(r, 't').length);
    if (notes.length && emptyRun) _writeT(_ensureT(emptyRun), notes.join('  /  '));
    _clearLineseg(p);
}

// 교습비 칸: "월 160,000원" + (줄바꿈) + 회색 "←(주당 180분)"
function _setTuitionCell(tc, tuitionStr, hint) {
    const p = _els(tc, 'p')[0];
    const textRuns = _els(p, 'run').filter(r => _els(r, 't').length);
    if (textRuns.length < 2) {
        _setCellText(tc, hint ? `${tuitionStr}\n${hint}` : tuitionStr);
        return;
    }
    _writeT(_els(textRuns[0], 't')[0], hint ? `${tuitionStr}\n` : tuitionStr);
    if (hint) _writeT(_els(textRuns[1], 't')[0], hint);
    else textRuns[1].remove();
    textRuns.slice(2).forEach(r => r.remove());
    _clearLineseg(p);
}

// 셀 글자 바꾸기 — 첫 글자 조각의 서식(charPr)을 그대로 쓴다
// (빈 칸이라 글자 조각이 없으면 fallbackCharPr 서식으로 새로 만든다)
function _setCellText(tc, text, fallbackCharPr) {
    const p = _els(tc, 'p')[0];
    const runs = _els(p, 'run');
    const textRuns = runs.filter(r => _els(r, 't').length);
    if (!text) {
        textRuns.forEach(r => _els(r, 't').forEach(t => t.remove()));
    } else if (textRuns.length) {
        _writeT(_els(textRuns[0], 't')[0], text);
        textRuns.slice(1).forEach(r => r.remove());
    } else if (runs.length) {
        if (fallbackCharPr) runs[0].setAttribute('charPrIDRef', fallbackCharPr);
        _writeT(_ensureT(runs[0]), text);
    }
    _clearLineseg(p);
}

// ── XML 헬퍼 ───────────────────────────────────────────

function _els(node, localName) {
    return Array.from(node.getElementsByTagNameNS(HP, localName));
}

function _child(node, localName) {
    return Array.from(node.childNodes).find(n => n.localName === localName) || null;
}

function _cells(tr) {
    return Array.from(tr.childNodes).filter(n => n.localName === 'tc');
}

function _closestPara(node) {
    let n = node;
    while (n && !(n.namespaceURI === HP && n.localName === 'p')) n = n.parentNode;
    return n;
}

function _prevRunWithText(run) {
    let n = run.previousSibling;
    while (n && !(n.localName === 'run' && _els(n, 't').length)) n = n.previousSibling;
    return n;
}

// '\n' 은 한글 줄바꿈(<hp:lineBreak/>)으로
function _writeT(t, text) {
    const doc = t.ownerDocument;
    while (t.firstChild) t.removeChild(t.firstChild);
    String(text).split('\n').forEach((line, i) => {
        if (i > 0) t.appendChild(doc.createElementNS(HP, 'hp:lineBreak'));
        if (line) t.appendChild(doc.createTextNode(line));
    });
}

function _ensureT(run) {
    return _els(run, 't')[0] || run.appendChild(run.ownerDocument.createElementNS(HP, 'hp:t'));
}

// 글자가 바뀐 문단의 줄 배치 캐시(linesegarray)를 지워 한글이 다시 계산하게 한다
function _clearLineseg(p) {
    if (!p) return;
    Array.from(p.childNodes).filter(n => n.localName === 'linesegarray').forEach(n => n.remove());
}

// ── 저장 ───────────────────────────────────────────────

async function _download(zip, doc, academy, filename) {
    const { default: JSZip } = await import('jszip');
    const sectionXml = XML_DECL + new XMLSerializer().serializeToString(doc.documentElement);

    // mimetype 은 ZIP 의 첫 항목·무압축이어야 한글이 파일을 알아본다
    const out = new JSZip();
    const opts = { createFolders: false };
    out.file('mimetype', await zip.file('mimetype').async('string'), { ...opts, compression: 'STORE' });
    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || path === 'mimetype') continue;
        // 미리보기 그림은 양식(예시 학원) 그대로라 뺀다
        if (path === 'Preview/PrvImage.png') continue;
        if (path === SECTION_PATH) out.file(path, sectionXml, opts);
        else if (path === 'Preview/PrvText.txt') out.file(path, _previewText(academy), opts);
        else out.file(path, await entry.async('uint8array'), opts);
    }
    const blob = await out.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
    download(blob, filename);
}

function _previewText(academy) {
    const regNo = getRegNoText(academy);
    return ['교습비등 게시표', `${academy.name}${regNo ? ` ${regNo}` : ''}`].join('\r\n');
}
