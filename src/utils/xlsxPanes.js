// xlsx 파일에 '틀 고정 · 인쇄 제목행 · 용지 설정' 을 넣어 저장한다.
//
// 왜 이런 것이 필요한가: 이 저장소가 쓰는 xlsx(SheetJS) 커뮤니티 판의 **쓰기** 쪽은
// 열 너비(`!cols`)와 병합(`!merges`)까지만 낸다. 틀 고정·인쇄 제목행·용지 설정은
// 만들어 주지 않는다. 그런데 이 점검표는 화면에서 읽는 것이 아니라 30열짜리를 종이로
// 뽑아 들고 전화를 도는 물건이라, 머리글이 안 붙어 있으면 쓸 수가 없다.
//
// 그래서 SheetJS 가 만든 파일을 jszip 으로 열어 워크시트 XML 에 그 세 가지를 직접 써 넣는다
// (둘 다 이미 이 저장소의 의존성이다).
//
// 손대는 곳이 XML 이라 실패할 수 있다. 실패하면 **손대지 않은 원본을 그대로 내려준다** —
// 틀 고정이 빠진 엑셀이, 열리지 않는 엑셀보다 낫다.

import * as XLSX from 'xlsx';
import JSZip from 'jszip';

// 엑셀은 요소 순서가 스키마와 다르면 파일을 '복구' 하며 넣은 것을 버린다.
// CT_Worksheet 순서: sheetPr → dimension → sheetViews → sheetFormatPr → cols → sheetData
//                    → … → mergeCells → … → printOptions → pageMargins → pageSetup
// 아래 넣는 자리는 모두 이 순서를 지키도록 잡았다.

const A1 = (col, row) => {
    let s = '';
    for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) {
        s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    }
    return `${s}${row}`;
};

// 시트 이름을 정의된 이름(defined name) 안에 넣을 때의 따옴표 규칙
const quoteSheet = (name) => `'${String(name).split("'").join("''")}'`;

const xmlAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** sheetView 안에 들어갈 것 — pane 은 sheetView 의 첫 자식이어야 한다 */
function paneXml({ rows = 0, cols = 0 } = {}) {
    if (!rows && !cols) return '';
    const active = rows && cols ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight';
    const at = A1(cols + 1, rows + 1);
    const attrs = [
        cols ? `xSplit="${cols}"` : '',
        rows ? `ySplit="${rows}"` : '',
        `topLeftCell="${at}"`, `activePane="${active}"`, 'state="frozen"',
    ].filter(Boolean).join(' ');
    return `<pane ${attrs}/><selection pane="${active}" activeCell="${at}" sqref="${at}"/>`;
}

/**
 * 틀 고정을 넣는다.
 * SheetJS 는 이미 `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` 를 써 둔다 —
 * 그 자리에 끼워 넣어야 한다. 없다고 보고 새로 만들면 sheetViews 가 둘이 되어 파일이 깨진다.
 */
function withPane(xml, freeze) {
    const pane = paneXml(freeze);
    if (!pane) return xml;
    const sv = /<sheetView\b([^>]*?)(\/?)>/.exec(xml);
    if (!sv) {
        const block = `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>`;
        return /<dimension\b[^>]*\/>/.test(xml)
            ? xml.replace(/(<dimension\b[^>]*\/>)/, `$1${block}`)
            : xml.replace(/(<worksheet\b[^>]*>)/, `$1${block}`);
    }
    // 빈 요소(<sheetView …/>)면 열고 닫는 꼴로 바꿔 자식을 넣는다
    return sv[2] === '/'
        ? xml.replace(sv[0], `<sheetView${sv[1]}>${pane}</sheetView>`)
        : xml.replace(sv[0], `${sv[0]}${pane}`);
}

// pageSetup 뒤에 오는 요소들. SheetJS 가 <ignoredErrors> 를 쓰므로 </worksheet> 앞에
// 그냥 붙이면 순서가 뒤집혀 엑셀이 파일을 '복구' 한다 — 이 중 가장 먼저 나오는 것 앞에 넣는다.
const AFTER_PAGE_SETUP = /<(?:headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|picture|oleObjects|controls|webPublishItems|tableParts|extLst)(?:[ />])/;

function insertBeforeTail(xml, snippet) {
    const m = AFTER_PAGE_SETUP.exec(xml);
    const at = m ? m.index : xml.lastIndexOf('</worksheet>');
    return xml.slice(0, at) + snippet + xml.slice(at);
}

// ── 서식 ────────────────────────────────────────────────
// 커뮤니티 판 writer 는 ws[addr].s 를 통째로 무시한다 (셀에 s= 를 아예 쓰지 않는다).
// 그래서 styles.xml 을 직접 써서 갈아끼우고, 셀마다 s= 를 넣어 준다.
//
// 왜 굳이 하나: 이 표는 30열을 A3 한 장에 눕혀 종이로 뽑는다. 줄바꿈이 없으면
// 비고·연결채널처럼 긴 칸이 열 너비에서 잘려, 종이만 보고 일하는 사람은 그 내용을 영영 못 본다.
//
// s 번호: 0 기본 · 1 머리글 · 2 줄바꿈(긴 글) · 3 가운데(O/X) · 4 테두리만
const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="2">'
    + '<font><sz val="10"/><color theme="1"/><name val="맑은 고딕"/><family val="2"/></font>'
    + '<font><b/><sz val="10"/><color theme="1"/><name val="맑은 고딕"/><family val="2"/></font>'
    + '</fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right>'
    + '<top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom>'
    + '<diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="5">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">'
    + '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">'
    + '<alignment vertical="top" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">'
    + '<alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">'
    + '<alignment vertical="top"/></xf>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9"/></styleSheet>';

const colIndex = (letters) => {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
};

/** 셀마다 s= 를 넣는다. 이미 s= 가 있는 셀은 건드리지 않는다 */
function withStyles(xml, styles) {
    if (!styles) return xml;
    const { headerRows = 0, wrap = [], center = [] } = styles;
    return xml.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g, (m, col, row, rest, close) => {
        if (rest.includes(' s="')) return m;
        const c = colIndex(col);
        const s = Number(row) <= headerRows ? 1
            : wrap.includes(c) ? 2
                : center.includes(c) ? 3 : 4;
        return `<c r="${col}${row}" s="${s}"${rest}${close}>`;
    });
}

function pageSetupXml(ps) {
    if (!ps) return '';
    const attrs = [
        ps.paperSize ? `paperSize="${ps.paperSize}"` : '',
        `orientation="${ps.orientation || 'portrait'}"`,
        ps.fitToWidth !== undefined ? `fitToWidth="${ps.fitToWidth}"` : '',
        ps.fitToHeight !== undefined ? `fitToHeight="${ps.fitToHeight}"` : '',
    ].filter(Boolean).join(' ');
    return `<pageSetup ${attrs}/>`;
}

/** 워크시트 XML 한 장에 sheetPr·pane·pageSetup·서식을 끼워 넣는다 */
function patchSheet(xml, { freeze, pageSetup, styles }) {
    let out = withStyles(xml, styles);

    // ① fitToPage 는 sheetPr 안에 있어야 pageSetup 의 fitToWidth 가 먹는다.
    //    sheetPr 는 worksheet 의 첫 자식이어야 한다.
    const fits = pageSetup && (pageSetup.fitToWidth !== undefined || pageSetup.fitToHeight !== undefined);
    if (fits && !/<pageSetUpPr\b/.test(out)) {
        const sp = /<sheetPr\b([^>]*?)(\/?)>/.exec(out);
        out = !sp
            ? out.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
            : sp[2] === '/'
                ? out.replace(sp[0], `<sheetPr${sp[1]}><pageSetUpPr fitToPage="1"/></sheetPr>`)
                : out.replace(sp[0], `${sp[0]}<pageSetUpPr fitToPage="1"/>`);
    }

    // ② 틀 고정
    out = withPane(out, freeze);

    // ③ pageSetup 은 pageMargins 바로 뒤 (여백이 없으면 함께 만들어 붙인다)
    const ps = pageSetupXml(pageSetup);
    if (ps && !/<pageSetup\b/.test(out)) {
        out = /<pageMargins\b[^>]*\/>/.test(out)
            ? out.replace(/(<pageMargins\b[^>]*\/>)/, `$1${ps}`)
            : insertBeforeTail(out,
                '<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.3" footer="0.3"/>' + ps);
    }
    return out;
}

/** 시트 순서대로 xl/worksheets/*.xml 경로를 알아낸다 (sheet1·sheet2 라고 넘겨짚지 않는다) */
function sheetPaths(workbookXml, relsXml) {
    const rels = {};
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
        rels[m[1]] = m[2].replace(/^\/?xl\//, '');
    }
    const out = [];
    for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
        const name = /name="([^"]*)"/.exec(m[0])?.[1] || '';
        const rid = /r:id="([^"]*)"/.exec(m[0])?.[1] || '';
        out.push({ name, path: `xl/${rels[rid] || ''}` });
    }
    return out;
}

/** 인쇄할 때 모든 쪽에 되풀이할 행 — 30열짜리 점검표에서는 이게 없으면 종이가 못 쓴다 */
function withPrintTitles(workbookXml, sheets, rowsRange) {
    if (!rowsRange || /<definedNames>/.test(workbookXml)) return workbookXml;
    const [from, to] = String(rowsRange).split(':');
    const names = sheets.map((s, i) =>
        `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">`
        + `${xmlAttr(quoteSheet(s.name))}!$${from}:$${to}</definedName>`).join('');
    return workbookXml.replace('</sheets>', `</sheets><definedNames>${names}</definedNames>`);
}

/**
 * 워크북 → xlsx 바이트(Blob). XML 을 손보다 어긋나면 손대지 않은 원본을 돌려준다.
 * 저장과 나눠 둔 이유: 브라우저 없이도(테스트에서) 결과를 열어 볼 수 있어야 한다.
 */
export async function buildXlsxWithPanes(wb, opts = {}) {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    try {
        const zip = await JSZip.loadAsync(buf);
        const workbookXml = await zip.file('xl/workbook.xml').async('string');
        const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
        const sheets = sheetPaths(workbookXml, relsXml);
        if (!sheets.length || sheets.some((s) => !zip.file(s.path))) throw new Error('시트를 찾지 못함');

        // createFolders 를 끄는 이유: SheetJS 가 낸 원본에는 디렉터리 항목이 없다.
        // 다시 묶으면서 없던 항목을 더하지 않는다.
        const put = (path, xml) => zip.file(path, xml, { createFolders: false });
        for (const s of sheets) put(s.path, patchSheet(await zip.file(s.path).async('string'), opts));
        put('xl/workbook.xml', withPrintTitles(workbookXml, sheets, opts.printTitles));
        if (opts.styles) put('xl/styles.xml', STYLES_XML);
        return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    } catch {
        // 틀 고정이 빠진 엑셀이, 열리지 않는 엑셀보다 낫다
        return new Blob([buf], { type: 'application/octet-stream' });
    }
}


