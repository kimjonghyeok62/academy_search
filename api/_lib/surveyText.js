// 학원이 고른 것 → 시트 '만족도조사' 에 남길 값.
//
// 문항은 둘뿐이다. 회신을 다 보내고 나서 보는 자리라, 길면 아무도 답하지 않는다.
// 셋째 칸(의견)은 자유 입력이지만 100자로 자른다.
//
// api/_lib/replyText.js 와 같은 규칙: **목록에 없는 값은 통째로 버린다.**
// 시트에 남는 글은 우리가 짓고, 학원 쪽에서 오는 것은 '어느 보기를 골랐는가' 뿐이다.
//
// 값을 점수(5·4·3…)가 아니라 말로 남기는 이유: 시트를 열어 그대로 읽혀야 하기 때문이다
// (docs/구글시트-연동.md 의 '사람이 읽어야 하는 값' 규칙). 점수로 바꾸는 표는
// src/utils/surveyStats.js 한 곳에만 둔다.

// Apps Script 의 SURVEY_NOTE_MAX 와 맞출 것
export const NOTE_MAX = 100;

// 1. 이번 안내가 도움이 되었습니까?
export const HELP = ['많이 도움', '도움', '보통', '별로', '전혀'];

// 2. 귀 학원 맞춤형 교습비 게시표(예시)를 어떻게 쓰셨습니까?
export const FORM_USE = ['확인 후 인쇄', '네이버 플레이스 게시', '열어만 봄', '쓰지 않음'];

const pick = (list, value) => (list.includes(String(value || '')) ? String(value) : '');

/**
 * 보낸 것에서 시트에 넣을 세 값만 골라낸다.
 * 셋 다 비어 있으면 null — 아무것도 고르지 않고 보내기를 누른 것이라 남길 것이 없다.
 */
export function surveyValues(body) {
    const help = pick(HELP, body && body.help);
    const formUse = pick(FORM_USE, body && body.formUse);
    const note = String((body && body.note) || '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
    if (!help && !formUse && !note) return null;
    return { help, formUse, note };
}
