/**
 * 교습비 게시표 → 네이버 플레이스 소개글용 글.
 *
 * 플레이스 소개글은 고정폭 글꼴이 아니라, 공백으로 칸을 맞춘 표는 열면 어긋나 버린다.
 * 그래서 과정 하나를 슬래시로 가른 한 줄로 적는다 — 학원이 그대로 붙여넣고, 필요하면
 * 몇 글자만 고쳐 쓸 수 있는 꼴이다.
 *
 * 값은 게시표(generateTuitionPDF.js)와 같은 자리에서 가져온다.
 */
import {
    sortCourses, getRegNoText, fmtNum, parseNum, formatChangeDateKo, OTHER_FEE_ITEMS,
} from './generateTuitionPDF';

/** 과정 1개 → '■ 초등부 / 수학A / 월 640분 / 160,000원 (재료비 10,000원 / 합계 170,000원)' */
function _courseLine(c) {
    const parts = [c.process, c.subject].filter(Boolean);

    const time = fmtNum(c.totalTime);
    if (time) parts.push(`월 ${time}분`);

    const tuitionNum = parseNum(c.tuitionFee || c.totalFee);
    const tuition = fmtNum(c.tuitionFee || c.totalFee);
    if (tuition) parts.push(`${tuition}원`);

    if (parts.length === 0) return '';

    let line = `■ ${parts.join(' / ')}`;

    // 금액이 0보다 큰 기타경비만 괄호로 덧붙이고, 그때만 합계를 적는다
    const activeItems = OTHER_FEE_ITEMS.filter(it => parseNum(c[it.key]) > 0);
    if (activeItems.length > 0) {
        const feeStr = activeItems.map(it => `${it.label} ${fmtNum(c[it.key])}원`).join(', ');
        const total = tuitionNum + activeItems.reduce((s, it) => s + parseNum(c[it.key]), 0);
        line += ` (${feeStr} / 합계 ${total.toLocaleString('ko-KR')}원)`;
    }

    return line;
}

export function buildTuitionPlaceText(academy) {
    const courses = sortCourses(academy?.courses || []);
    const lines = [];

    lines.push(`${academy?.name || ''} 교습비 안내`);

    const regNoText = getRegNoText(academy);
    if (regNoText) lines.push(regNoText);

    const baseDate = formatChangeDateKo(academy?.changeDate || academy?.regDate || '');
    if (baseDate.year && baseDate.month && baseDate.day) {
        lines.push(`${baseDate.year}. ${baseDate.month}. ${baseDate.day}. 기준`);
    }

    const courseLines = courses.map(_courseLine).filter(Boolean);
    if (courseLines.length > 0) {
        lines.push('');
        lines.push(...courseLines);
    }

    const notes = [...new Set(courses.map(c => (c.note || '').trim()).filter(Boolean))];
    if (notes.length > 0) {
        lines.push('');
        lines.push(`※ 비고: ${notes.join(' / ')}`);
    }

    return lines.join('\n');
}
