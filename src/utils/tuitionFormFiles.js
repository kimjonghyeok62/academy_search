// 교습비 게시표를 파일로 내려받기 — 워드(.docx) 와 그림(.jpg).
//
// PDF 는 브라우저 인쇄가 맡는다 (이 저장소가 처음부터 그렇게 해 왔다 — 한글이 깨지지 않고
// 라이브러리도 필요 없다). 여기 둘은 인쇄로는 안 되는 것들이다:
//   워드 — 학원이 자기 사정에 맞게 고쳐 쓸 수 있어야 한다
//   그림 — 카카오톡·문자로 보내거나 블로그에 그대로 올릴 수 있어야 한다
//
// 만드는 재료는 언제나 buildTuitionFormHtml 이 낸 HTML 하나다. 양식을 두 벌 만들면
// 어느 것이 맞는지 알 수 없게 된다.
//
// 무거운 것(jszip·html2canvas)은 누를 때 불러온다 — 학원 휴대폰이 열자마자
// 쓰지도 않을 것을 내려받게 할 수 없다. 같은 이유로 file-saver 도 쓰지 않는다
// (12KB 를 더 받게 하려고 여섯 줄을 아끼지 않는다).

/** 만든 파일을 내려받게 한다 */
function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 곧바로 거두면 사파리에서 내려받기가 끊긴다
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * 게시표 HTML 에서 새 창용 단추 줄을 걷어낸다.
 *
 * 담당자가 새 창으로 열 때는 '🖨️ 인쇄 / ✕ 닫기' 가 필요하지만, 화면에 끼워 보여주거나
 * 워드·그림으로 뽑을 때는 군더더기다. CSS 로 가리는 것만으로는 부족하다 —
 * 워드는 HTML 을 자기 문서로 바꿀 때 display:none 을 지키지 않아 단추 글자가 그대로 들어간다.
 * 만드는 함수(buildTuitionFormHtml)는 담당자 화면과 함께 쓰므로 손대지 않고 여기서 걷어낸다.
 */
export const stripPrintBar = (html) =>
    String(html || '').replace(/<div class="print-bar[^"]*">[\s\S]*?<\/div>/, '');

/** 파일 이름에 못 쓰는 글자를 털어낸다 */
const safeName = (s) => String(s || '게시표').replace(/[\\/:*?"<>|]/g, '').trim() || '게시표';

export const formFileName = (academyName, kindLabel, ext) =>
    `${safeName(academyName)}_교습비게시표_${kindLabel}.${ext}`;

// ── 워드 (.docx) ────────────────────────────────────────
// 표를 WordprocessingML 로 직접 쓴다. 처음에는 altChunk(HTML 을 통째로 넣고 여는 쪽이
// 표로 바꾸게 하는 방식)를 썼는데, MS 워드에서는 잘 열려도 **한워드에서는 빈 문서**가
// 나왔다. 그 부분을 모르는 프로그램은 통째로 건너뛰기 때문이다. 학원이 무엇으로 열지
// 우리는 고를 수 없으므로, 어디서 열어도 같은 것이 나오는 쪽을 골랐다.
// 옮기는 일은 htmlToDocx.js 가 한다 (이미 그려진 화면에서 값을 읽는다).
import { docxBodyFromPages } from './htmlToDocx';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

// 문서 기본값만 둔다 — 글자 모양은 칸마다 따로 적으므로 여기서는 여백 없는 문단과
// 게시표와 같은 글꼴만 정해 준다. styles.xml 이 없어도 열리기는 하지만, 없으면
// 프로그램마다 제 나름의 기본값(줄간격·10.5pt 등)을 얹어 표가 늘어난다.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="맑은 고딕" w:hAnsi="맑은 고딕" w:eastAsia="맑은 고딕"/>
<w:sz w:val="20"/><w:szCs w:val="20"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr>
<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
</w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const documentXml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

/** 그려진 게시표(.page 들) → .docx 한 덩이 */
export async function buildFormDocxBlob(pages) {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.folder('_rels').file('.rels', ROOT_RELS);
    const word = zip.folder('word');
    word.file('document.xml', documentXml(docxBodyFromPages(pages)));
    word.file('styles.xml', STYLES);
    word.folder('_rels').file('document.xml.rels', DOC_RELS);

    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
}

/**
 * 게시표를 .docx 로 내려받는다.
 * 그림과 마찬가지로 **그려진 iframe** 을 넘겨받는다 — 화면에 보이는 그대로를 옮기려면
 * 브라우저가 이미 계산해 둔 칸 너비·줄 높이가 있어야 한다.
 */
export async function downloadFormDocx(iframe, academyName, kindLabel) {
    const doc = iframe?.contentDocument;
    if (!doc) throw new Error('게시표를 아직 불러오지 못했습니다');
    const pages = [...doc.querySelectorAll('.page')];
    if (!pages.length) throw new Error('게시표를 아직 불러오지 못했습니다');
    download(await buildFormDocxBlob(pages), formFileName(academyName, kindLabel, 'docx'));
}

// ── 그림 (.jpg) ─────────────────────────────────────────
// 게시표는 iframe 안에 있다 (A4 용 CSS 가 이 화면에 섞이면 안 되므로). html2canvas 는
// 넘겨받은 요소가 든 문서를 그대로 보고 그리므로 iframe 안의 요소를 넘겨도 된다.
//
// 넘치는 쪽이 아니라 페이지(.page)마다 따로 그린다 — 외부용은 두 장짜리라,
// 한 장에 이어 붙이면 인쇄해 붙일 수 없는 길쭉한 그림이 된다.
const JPG_SCALE = 2;     // 인쇄해 붙여도 글자가 뭉개지지 않을 만큼
const JPG_QUALITY = 0.92;

export async function downloadFormJpg(iframe, academyName, kindLabel) {
    const doc = iframe?.contentDocument;
    if (!doc) throw new Error('게시표를 아직 불러오지 못했습니다');
    const { default: html2canvas } = await import('html2canvas');

    const pages = [...doc.querySelectorAll('.page')];
    const targets = pages.length ? pages : [doc.body];

    for (let i = 0; i < targets.length; i++) {
        // 한 장씩 차례로 그린다 — 여러 장을 한꺼번에 그리면 휴대폰에서 메모리가 튄다
        const canvas = await html2canvas(targets[i], {
            backgroundColor: '#ffffff',
            scale: JPG_SCALE,
            logging: false,
            useCORS: true,
        });
        const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', JPG_QUALITY));
        if (!blob) throw new Error('그림을 만들지 못했습니다');
        const tail = targets.length > 1 ? `_${i + 1}` : '';
        download(blob, formFileName(academyName, `${kindLabel}${tail}`, 'jpg'));
    }
}
