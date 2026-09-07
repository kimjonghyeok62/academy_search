// 화면에 그려진 게시표를 진짜 워드 표(WordprocessingML)로 옮긴다.
//
// 처음에는 docx 의 altChunk 를 썼다 — HTML 을 통째로 넣어 두면 여는 쪽이 표로 바꿔 주는
// 방식이라 코드가 스무 줄이면 끝났다. MS 워드에서는 잘 열렸다. 그런데 한워드(한컴)에서
// 열면 **빈 문서**가 나온다. altChunk 를 모르는 프로그램은 그 부분을 통째로 건너뛰고,
// 건너뛰면 남는 것이 없기 때문이다. 학원이 무엇으로 열지 우리는 고를 수 없다.
//
// 그래서 표를 직접 쓴다. 다만 CSS 를 다시 해석하지는 않는다 — 게시표는 이미 iframe 안에
// **그려져 있으므로**, 그 DOM 에서 getComputedStyle 로 실제 값(칸 너비·줄 높이·테두리·
// 굵기·가운데맞춤)을 그대로 읽어 옮긴다. 브라우저가 이미 한 계산을 두 번 하지 않는다.
//
// 여기서 만드는 것은 document.xml 의 <w:body> 안쪽이다. 포장(zip)은 tuitionFormFiles.js.

// ── 단위 ─────────────────────────────────────────────────
// 워드가 쓰는 단위가 자리마다 다르다. px 는 96dpi 기준이다.
const twip = (px) => Math.round(parseFloat(px || 0) * 15);          // 1px = 15twip (1/1440in)
const halfPt = (px) => Math.round(parseFloat(px || 0) * 1.5);       // 1px = 0.75pt, 반pt 단위
const eighthPt = (px) => Math.min(96, Math.max(2, Math.round(parseFloat(px || 0) * 6))); // 테두리 굵기(1/8pt)

// A4 세로 · 여백 8mm — 게시표 .page 와 같은 값이라 내용 폭이 194mm 로 맞는다
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 454;
const CONTENT_TWIP = PAGE_W - MARGIN * 2;

const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** rgb(a) → RRGGBB. 투명하거나 흰색이면 null (칠하지 않는다) */
function hex(color) {
    const m = String(color || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length > 3 && p[3] === 0) return null;
    const h = p.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
    return h === 'ffffff' ? null : h;
}

const ALIGN = { center: 'center', right: 'right', end: 'right', justify: 'both' };

// ── 글자 ─────────────────────────────────────────────────
/** 한 조각의 글자 모양 — 화면에 그려진 그대로 */
function runProps(el) {
    const cs = getComputedStyle(el);
    const family = (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim() || '맑은 고딕';
    const bits = [
        `<w:rFonts w:ascii="${esc(family)}" w:hAnsi="${esc(family)}" w:eastAsia="${esc(family)}"/>`,
        parseInt(cs.fontWeight, 10) >= 600 ? '<w:b/>' : '',
        // 밑줄 대신 아래 테두리로 그은 빈칸(년·월·일)도 워드에서는 밑줄로 옮긴다
        (cs.textDecorationLine || '').includes('underline') || parseFloat(cs.borderBottomWidth) > 0
            ? '<w:u w:val="single"/>' : '',
        `<w:sz w:val="${halfPt(cs.fontSize)}"/><w:szCs w:val="${halfPt(cs.fontSize)}"/>`,
        hex(cs.color) ? `<w:color w:val="${hex(cs.color)}"/>` : '',
    ];
    return `<w:rPr>${bits.join('')}</w:rPr>`;
}

/** 요소 안의 글자를 <w:r> 조각들로. 표는 여기 오지 않는다(따로 다룬다) */
function runs(node, styleEl) {
    if (node.nodeType === 3) {
        // CSS 의 기본 규칙대로 이어진 공백은 하나로 본다
        const text = node.nodeValue.replace(/\s+/g, ' ');
        if (!text.trim() && !/^ $/.test(text)) return '';
        return `<w:r>${runProps(styleEl)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    }
    if (node.nodeType !== 1) return '';
    if (node.tagName === 'BR') return '<w:r><w:br/></w:r>';
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') return '';
    return [...node.childNodes].map((c) => runs(c, node)).join('');
}

/** 블록 하나 → 문단 하나 */
function paragraph(el, extra = '') {
    const cs = getComputedStyle(el);
    const jc = ALIGN[cs.textAlign] ? `<w:jc w:val="${ALIGN[cs.textAlign]}"/>` : '';
    const before = twip(cs.marginTop);
    const after = twip(cs.marginBottom);
    const spacing = `<w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>`;
    const inner = runs(el, el);
    return `<w:p><w:pPr>${spacing}${jc}${extra}</w:pPr>${inner}</w:p>`;
}

/** 칸 안에는 문단이 반드시 하나는 있어야 한다 (빈 칸도 마찬가지) */
function cellParagraph(td) {
    const cs = getComputedStyle(td);
    const jc = ALIGN[cs.textAlign] ? `<w:jc w:val="${ALIGN[cs.textAlign]}"/>` : '';
    const inner = runs(td, td);
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>${jc}</w:pPr>${inner}</w:p>`;
}

// ── 표 ───────────────────────────────────────────────────
const SIDES = [['top', 'Top'], ['left', 'Left'], ['bottom', 'Bottom'], ['right', 'Right']];

function cellBorders(cs) {
    const b = SIDES.map(([w, c]) => {
        const style = cs[`border${c}Style`];
        const width = parseFloat(cs[`border${c}Width`]);
        if (!width || style === 'none' || style === 'hidden') {
            return `<w:${w} w:val="none" w:sz="0" w:space="0"/>`;
        }
        const color = hex(cs[`border${c}Color`]) || '000000';
        return `<w:${w} w:val="single" w:sz="${eighthPt(width)}" w:space="0" w:color="${color}"/>`;
    }).join('');
    return `<w:tcBorders>${b}</w:tcBorders>`;
}

const V_ALIGN = { middle: 'center', bottom: 'bottom' };

/**
 * 표 하나 → <w:tbl>.
 *
 * rowspan 은 워드에 없다. 대신 세로로 이어붙일 칸을 줄마다 두고 첫 칸에 vMerge restart,
 * 아래 칸에 vMerge 를 준다. 그래서 HTML 의 줄을 그대로 옮길 수 없고, 먼저 격자를 세운다.
 */
function table(tbl) {
    const rows = [...tbl.rows];
    const grid = [];                 // grid[r][c] = { td, first } — 칸이 없는 자리는 비어 있다
    const carry = [];                // 열마다 아직 내려오는 rowspan 이 몇 줄 남았는지

    rows.forEach((tr, r) => {
        grid[r] = [];
        // 위에서 내려오는 rowspan 을 먼저 자리에 앉힌다. 그래야 이 줄의 칸들이
        // 남은 자리에 차례로 들어간다 — HTML 은 이미 찬 자리를 건너뛰어 적기 때문이다.
        for (let c = 0; c < carry.length; c++) {
            if (carry[c] && carry[c].left > 0) {
                grid[r][c] = { td: carry[c].td, first: false, span: carry[c].span, ghost: carry[c].ghost };
                carry[c].left -= 1;
            }
        }

        let c = 0;
        [...tr.cells].forEach((td) => {
            while (grid[r][c]) c += 1;
            const span = td.colSpan || 1;
            const down = td.rowSpan || 1;
            grid[r][c] = { td, first: true, span };
            for (let k = 1; k < span; k++) grid[r][c + k] = { td, first: true, span, ghost: true };
            if (down > 1) {
                for (let k = 0; k < span; k++) {
                    carry[c + k] = { td, left: down - 1, span, ghost: k > 0 };
                }
            }
            c += span;
        });
    });

    const cols = grid.reduce((m, row) => Math.max(m, row.length), 0);

    // 열 너비 — 한 열만 차지하는 칸의 실제 너비를 쓰고, 없는 열은 평균으로 메운다.
    // 마지막에 내용 폭(194mm)에 맞춰 비율대로 늘린다.
    const px = new Array(cols).fill(0);
    grid.forEach((row) => row.forEach((cell, c) => {
        if (cell && cell.first && cell.span === 1 && !px[c]) px[c] = cell.td.getBoundingClientRect().width;
    }));
    const known = px.filter(Boolean);
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
    for (let c = 0; c < cols; c++) if (!px[c]) px[c] = avg;
    const total = px.reduce((a, b) => a + b, 0) || 1;
    const w = px.map((v) => Math.round((v / total) * CONTENT_TWIP));
    // 반올림 오차는 마지막 열이 흡수한다 (합이 정확히 맞아야 표가 밀리지 않는다)
    w[cols - 1] += CONTENT_TWIP - w.reduce((a, b) => a + b, 0);

    const grid_ = `<w:tblGrid>${w.map((v) => `<w:gridCol w:w="${v}"/>`).join('')}</w:tblGrid>`;
    const pr = `<w:tblPr>`
        + `<w:tblW w:w="${CONTENT_TWIP}" w:type="dxa"/>`
        + `<w:tblLayout w:type="fixed"/>`
        + `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="40" w:type="dxa"/>`
        + `<w:bottom w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar>`
        + `</w:tblPr>`;

    const body = grid.map((row, r) => {
        // 그려진 줄 높이를 그대로 옮긴다 — 워드가 제 나름대로 다시 잡으면 쪽이 나뉜다
        const h = rows[r] ? Math.round(rows[r].getBoundingClientRect().height * 15) : 0;
        const trPr = `<w:trPr>${h ? `<w:trHeight w:hRule="atLeast" w:val="${h}"/>` : ''}`
            + `${rows[r] && rows[r].parentElement.tagName === 'THEAD' ? '<w:tblHeader/>' : ''}</w:trPr>`;

        const cells = [];
        for (let c = 0; c < cols; c++) {
            const cell = row[c];
            if (!cell) {                                   // 격자가 빈 자리 — 빈 칸으로 채운다
                cells.push(`<w:tc><w:tcPr><w:tcW w:w="${w[c]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`);
                continue;
            }
            if (cell.ghost) continue;                      // colspan 으로 이미 먹은 자리
            const span = cell.span || 1;
            const width = w.slice(c, c + span).reduce((a, b) => a + b, 0);
            const cs = getComputedStyle(cell.td);
            const fill = hex(cs.backgroundColor);
            const tcPr = `<w:tcPr>`
                + `<w:tcW w:w="${width}" w:type="dxa"/>`
                + (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '')
                + (cell.first ? '' : '<w:vMerge/>')
                + ((cell.td.rowSpan || 1) > 1 && cell.first ? '<w:vMerge w:val="restart"/>' : '')
                + cellBorders(cs)
                + (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '')
                + `<w:vAlign w:val="${V_ALIGN[cs.verticalAlign] || 'center'}"/>`
                + `</w:tcPr>`;
            // 이어받은 칸에 글자를 또 쓰면 워드에서 두 번 보인다
            cells.push(`<w:tc>${tcPr}${cell.first ? cellParagraph(cell.td) : '<w:p/>'}</w:tc>`);
        }
        return `<w:tr>${trPr}${cells.join('')}</w:tr>`;
    }).join('');

    // 표 바로 뒤에는 문단이 있어야 한다 (표로 문서가 끝나면 여는 쪽이 싫어한다)
    return `<w:tbl>${pr}${grid_}${body}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
}

// ── 전체 ─────────────────────────────────────────────────
/** 블록 하나를 옮긴다. 안에 표가 있으면 표로, 아니면 문단으로. */
function block(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return '';
    if (el.tagName === 'TABLE') return table(el);
    if (el.querySelector && el.querySelector('table')) {
        return [...el.children].map(block).join('');
    }
    if (!el.textContent.trim() && !el.querySelector('span[style*="border"]')) {
        // 빈 칸이라도 자리를 차지하던 것이면 빈 줄 하나로 남긴다
        return parseFloat(cs.height) > 4 ? '<w:p/>' : '';
    }
    return paragraph(el);
}

/**
 * 게시표 한 장(.page) → document.xml 의 body 안쪽.
 * 여러 장이면 사이에 쪽 나눔을 넣는다.
 */
export function docxBodyFromPages(pages) {
    const parts = pages.map((page, i) => {
        const inner = [...page.children].map(block).join('');
        const brk = i < pages.length - 1
            ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '';
        return inner + brk;
    }).join('');

    const sect = `<w:sectPr>`
        + `<w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/>`
        + `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}"`
        + ` w:header="0" w:footer="0" w:gutter="0"/>`
        + `</w:sectPr>`;
    return parts + sect;
}
