// 학원이 표시한 것 → 시트 '회신내용' 칸에 남길 한 줄.
//
// JSON 으로 넣지 않는다. 담당자가 구글시트를 열어 그대로 읽어야 하는 값이기 때문이다
// (docs/구글시트-연동.md 의 '사람이 시트를 열어 읽고 고쳐야 하는 값' 규칙).
// 기계가 판단할 것 — '회신이 왔는가' — 는 회신일시 칸 하나로 충분하다.
//
// 화면(snsCheck.js)의 BUCKET_LABEL·CELL_FIELDS 와 짝이다. api/ 는 브라우저 번들과 모듈을
// 공유하지 않아 여기 다시 적는다 (naverProbe.js 의 addressQuery 와 같은 사정) —
// 한쪽을 고치면 다른 쪽도 함께 고칠 것.
//
// 목록에 없는 값은 통째로 버린다: 시트에 남는 글은 우리가 짓는다. 학원 쪽에서 오는 것은
// '어느 칸에 무엇을 골랐는가' 뿐이고, 자유 입력은 메모 한 줄로 한정한다.
const BUCKET_LABEL = {
    place: '플레이스', blog: '블로그', homepage: '홈페이지',
    cafe: '카페', youtube: '유튜브', instagram: '인스타', etc: '기타',
};
const FIELDS = ['번호', '교습비'];
const ANSWER_LABEL = { fixed: '수정함', not_yet: '아직', not_mine: '저희 것 아님' };

// Apps Script 의 SNS_REPLY_MAX 와 맞출 것
export const REPLY_MAX = 300;
export const NOTE_MAX = 60;
// 한 칸에 늘어놓을 항목 수 — 넘치면 '외 N건' 으로 접는다 (셀 하나가 화면을 넘지 않게)
const ITEMS = 8;

export function replyLine(answers, note) {
    const parts = [];
    (Array.isArray(answers) ? answers : []).forEach((a) => {
        const label = BUCKET_LABEL[a && a.bucket];
        const field = FIELDS.includes(a && a.field) ? a.field : '';
        const said = ANSWER_LABEL[a && a.value];
        if (label && field && said) parts.push(`${label} ${field} ${said}`);
    });

    const shown = parts.slice(0, ITEMS);
    let line = shown.join(' · ');
    if (parts.length > shown.length) line += ` 외 ${parts.length - shown.length}건`;

    const memo = String(note || '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
    if (memo) line += `${line ? ' | ' : ''}“${memo}”`;
    return line.slice(0, REPLY_MAX);
}
