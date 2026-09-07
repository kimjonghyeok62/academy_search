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
// 표 하나를 OOXML 로 다시 그리지 않는다. 그러면 양식이 두 벌이 되어, 화면과 워드 파일이
// 조금씩 달라져도 아무도 모른다. 대신 docx 가 가진 altChunk 를 쓴다 —
// HTML 을 그대로 넣어 두면 워드가 열 때 자기 표로 바꿔 준다.
//
// 한계: 워드가 변환을 맡으므로, altChunk 를 모르는 프로그램(일부 뷰어·웹 워드)에서는
// 내용이 비어 보일 수 있다. 그래서 화면에서 PDF·JPG 를 함께 준다.
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="htm" ContentType="text/html"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.htm"/>
</Relationships>`;

// A4 세로 · 여백 8mm.
// 게시표 HTML 의 .page 는 210mm 에 안쪽 여백 8mm 라 내용 폭이 194mm 다. 워드 여백을 12mm 로
// 두면 내용 폭이 186mm 밖에 안 되어 표가 옆으로 넘치고 한 장이 두 장이 된다.
// (twip: 1mm ≈ 56.7 → 8mm ≈ 454)
const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:altChunk r:id="htmlChunk"/>
<w:sectPr>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="454" w:right="454" w:bottom="454" w:left="454" w:header="0" w:footer="0" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;

/**
 * 워드에 넣기 전에 HTML 을 조금 손본다.
 *
 * `.page` 는 화면에서 'A4 한 장처럼 보이게' 하는 상자다 — 210mm 폭에 8mm 안쪽 여백,
 * 297mm 최소 높이. 워드는 그 값을 곧이곧대로 지키느라 자기 여백 위에 여백을 또 얹고,
 * 297mm 를 채우려 빈 자리를 만들어 한 장짜리를 두 장으로 밀어낸다.
 * 워드에서는 쪽 설정(sectPr)이 이미 A4·여백 8mm 를 맡으므로 이 상자는 비워 준다.
 *
 * charset 은 워드가 스스로 알아내지 못하는 일이 있어 머리에 박아 둔다.
 */
const forWord = (html) => String(html || '')
    .replace(/\.page\s*\{[^}]*\}/g, '.page{margin:0;padding:0;background:white;}')
    .replace('<head>', '<head><meta charset="utf-8">');

/**
 * 게시표 HTML → .docx 한 덩이.
 * 내려받기와 가른 것은 화면 없이도 시험할 수 있게 하려는 것이다 (docx 는 눈으로 못 본다).
 */
export async function buildFormDocxBlob(html) {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.folder('_rels').file('.rels', ROOT_RELS);
    const word = zip.folder('word');
    word.file('document.xml', DOCUMENT_XML);
    word.folder('_rels').file('document.xml.rels', DOC_RELS);
    word.file('afchunk.htm', forWord(html));

    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
}

/** 게시표 HTML → .docx 파일로 내려받기 */
export async function downloadFormDocx(html, filename) {
    download(await buildFormDocxBlob(html), filename);
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
