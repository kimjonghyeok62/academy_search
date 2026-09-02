// 학원 배상책임보험 상태 — 마스터 자료(academy.insurances)에서 계산한다.
//
// 보험 자료는 NICE 마스터 시트에 학원과 같은 행으로 들어 있고 googleSheets.js 가
// academy.insurances[] 로 묶어 준다. 시트에 따로 저장할 것이 없어 이 파일은 순수 계산만 한다.
//
// 같은 날짜 규칙이 InspectionPage.jsx 의 toDateRev, DetailView.jsx 의 isInsuranceExpired
// 에도 있다. 세 곳을 한 번에 바꾸는 것은 이 변경의 범위를 넘어서므로 여기 새로 두고,
// 나중에 그 둘을 이쪽으로 모으면 된다.

/** '2026.02.20' · '2026-2-20' · '2026. 2. 20' → Date (못 읽으면 null) */
export function parseKoDate(s) {
    const m = String(s || '').match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 만료일이 가장 늦은 보험 1건 (검토 탭의 '보험 만료·미가입' 과 같은 기준) */
export function latestInsurance(academy) {
    const list = (academy?.insurances || []).filter((i) => parseKoDate(i.endDate));
    if (!list.length) return null;
    return list.reduce((best, ins) =>
        parseKoDate(ins.endDate) > parseKoDate(best.endDate) ? ins : best);
}

// '2026.02.20' → '26.02.20' — 열이 좁아 연도 두 자리만 남긴다 (전체 날짜는 툴팁에 있다)
const shortDate = (d) =>
    `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

/**
 * 표의 '보험' 칸에 그릴 값.
 *   { label, expired, missing, unknown, title }
 * expired·missing 이면 빨강 + ⚠ — 색만으로 알리지 않기 위해서다.
 */
export function insuranceStatus(academy) {
    if (!academy) {
        return { label: '–', unknown: true, expired: false, missing: false, title: '마스터 자료에서 이 학원을 찾지 못했습니다' };
    }
    const ins = latestInsurance(academy);
    if (!ins) {
        return { label: '미가입', missing: true, expired: false, unknown: false, title: '가입한 배상책임보험이 마스터 자료에 없습니다' };
    }
    const end = parseKoDate(ins.endDate);
    // 오늘 만료되는 보험은 아직 유효하다 — 자정 기준으로 견준다
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = end < today;

    const title = [
        `${ins.company || '보험사 미상'}${ins.policyNumber ? ` · ${ins.policyNumber}` : ''}`,
        `${ins.startDate || '?'} ~ ${ins.endDate || '?'}`,
        ins.teachersCount ? `강사 ${ins.teachersCount}명` : '',
        expired ? '⚠ 만료된 보험입니다' : '',
    ].filter(Boolean).join('\n');

    return { label: shortDate(end), expired, missing: false, unknown: false, title };
}
