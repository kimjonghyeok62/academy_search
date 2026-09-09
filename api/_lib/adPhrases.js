// 블로그·플레이스·홈페이지에 적힌 허위·과대광고 문구를 찾는다.
//
// 왜 필요한가 — 외부인이 인터넷만 보고 신고할 수 있는 위반이라, 민원이 들어온 뒤에는 이미 늦다.
// 실제로 "유일", "선행" 같은 표현을 근거로 한 허위·과대광고 신고가 이어지고 있어,
// 같은 것을 우리가 먼저 찾아 그 학원부터 지도점검하려는 것이다.
//
// 조사 요청을 늘리지 않는다 — SNS 조사가 교습비·등록번호를 보려고 이미 받아 둔 본문을 다시 훑을 뿐이다.
//
// 등급은 처분 수위를 따른다.
//   1급 절대적·보장 표현   법§17①9, 표시광고법§3①1  → 1차 시정명령 → 2차 정지 → 3차 말소
//   2급 선행학습 유발      공교육정상화법§8④ (4-7)   → 과태료
//   3급 오인성·실적 표현   법§17①9 (4-9)            → 1차 시정명령 → 2차 정지 → 3차 말소

/**
 * 문구 하나가 걸렸을 때 그 자리 앞뒤를 보고 무를 조건.
 *
 * 학원이 "선행학습 없이 가르칩니다", "과대광고를 하지 않습니다" 라고 적어 둔 것까지 잡으면
 * 정직하게 쓴 글이 오히려 점검 대상이 된다. 교육청 안내문을 그대로 퍼온 글도 마찬가지다.
 */
const NEGATION = /없이|없는|없습니다|않습니다|않는|않고|안\s*합니다|지양|금지|예방|반대|근절|주의|위반|삼가|자제|벗어난/;

// 앞뒤로 이만큼씩 떼어 문맥으로 남긴다 — 담당자가 대조창을 열기 전에 오탐을 눈으로 걸러낼 수 있어야 한다
const CONTEXT_BEFORE = 30;
const CONTEXT_AFTER = 30;
// 무를지 판단할 때 들여다보는 범위. 문맥보다 좁게 잡는다 — 너무 넓으면 상관없는 문장의 '금지'까지 끌어온다
const NEGATION_SPAN = 24;
// 문장이 끝나는 자리. 무름 판단은 걸린 문구가 들어 있는 한 문장 안에서만 한다 —
// "과대광고를 하지 않습니다. 최고의 시설을 갖췄습니다" 처럼 앞 문장의 '않습니다'가
// 뒤 문장의 광고 문구까지 덮어 버리면, 정작 잡아야 할 것을 놓친다.
const SENT_END = /[.!?\n\r。·…]|다\s/g;

/** 걸린 자리를 품은 한 문장만 떼어 낸다 (앞뒤로 NEGATION_SPAN 자 안에서) */
function sentenceAround(s, at, len) {
    const from = Math.max(0, at - NEGATION_SPAN);
    const to = Math.min(s.length, at + len + NEGATION_SPAN);
    let start = from;
    for (const m of s.slice(from, at).matchAll(SENT_END)) start = from + m.index + m[0].length;
    let end = to;
    const tail = s.slice(at + len, to);
    const first = [...tail.matchAll(SENT_END)][0];
    if (first) end = at + len + first.index;
    return s.slice(start, end);
}

export const AD_PHRASES = [
    {
        grade: 1,
        label: '절대적 표현',
        ref: '법§17①9, 표시광고법§3①1',
        sanction: '1차 시정명령 → 2차 정지 → 3차 말소',
        patterns: [
            // '유일학원' 같은 상호와 섞이지 않도록 조사·어미가 붙은 꼴만 본다
            /유일무이|유일한|유일하게|유일의|유일합니다/g,
            // '최고기온'·'최고 학년' 처럼 뜻이 다른 쓰임이 많아, 광고로 읽히는 자리만 고른다
            /최고의|최고\s*(?:강사|선생|실력|성적|효과|시설|커리큘럼|프로그램|수업|퀄리티)/g,
            /(?:국내|전국|지역|업계|세계|경기도|하남|광주)\s*(?:최고|최대|최강)/g,
            /최상의|최강의/g,
            // '1등급'은 수능 등급이라 광고가 아니다
            /1\s*등(?!급)|일등(?!급)/g,
            /(?<!\d)1\s*위(?!험|원회|치)|No\.?\s*1(?!\d)|NO\.?\s*1(?!\d)|넘버\s*원/g,
            /(?:국내|전국|지역|업계|세계)\s*최초|최초\s*(?:개발|도입|공개)/g,
            /100\s*%\s*(?:보장|합격|성공|만족|책임|향상|상승|환불)/g,
            /전원\s*합격|전원합격/g,
            /(?:합격|성적|점수|등급|성과|향상|상승|환불)\s*(?:을|를)?\s*보장/g,
            /책임\s*(?:지도|관리)\s*보장|보장반|보장제/g,
            /완벽한?\s*(?:대비|커리큘럼|관리|시스템|분석|솔루션)/g,
            /최단\s*기간|최단기간/g,
            /무조건\s*(?:합격|상승|향상|오릅)|반드시\s*(?:오릅|올라|상승|합격)/g,
        ],
    },
    {
        grade: 2,
        label: '선행학습 유발',
        ref: '공교육정상화법§8④ (4-7)',
        sanction: '과태료',
        patterns: [
            // '선행' 단독은 '선행 연구'·'선행 조건' 같은 다른 뜻이 많다. 학습을 가리키는 꼴만 본다
            /선행\s*학습|선행학습/g,
            /선행반|선행\s*(?:과정|수업|진도|커리큘럼|클래스)/g,
            /조기\s*선행|초고속\s*선행|무한\s*선행/g,
            /\d\s*(?:개)?\s*학기\s*(?:앞선|앞서|선행)/g,
            /\d\s*년\s*(?:앞선|앞서|선행)/g,
            /(?:한|두|세)\s*학기\s*(?:앞선|앞서|선행)/g,
            /예습반|심화\s*선행/g,
            // 학년을 건너뛰어 가르친다고 적어 둔 자리 — 선행학습 유발 광고의 전형이다
            /초등[^\n]{0,10}(?:중등|중학)\s*(?:과정|수학|영어|진도|교과)/g,
            /중등[^\n]{0,10}(?:고등|고교)\s*(?:과정|수학|영어|진도|교과)/g,
            /초\s*[3-6][^\n]{0,8}중\s*[1-3]\s*(?:과정|수학|영어|진도)/g,
            /중\s*[1-3][^\n]{0,8}고\s*[1-3]\s*(?:과정|수학|영어|진도)/g,
        ],
    },
    {
        grade: 3,
        label: '오인성 표현',
        ref: '법§17①9 (4-9)',
        sanction: '1차 시정명령 → 2차 정지 → 3차 말소',
        patterns: [
            // 지정·인증은 받지 않았는데 받은 것처럼 적어 둔 자리. '인증샷' 같은 말과 섞이지 않게 한정한다
            /교육(?:부|청)\s*(?:지정|인증|승인|선정|공인)/g,
            /(?:국가|정부|교육부|교육청)\s*공인/g,
            /공식\s*(?:지정|인증|파트너|기관|교육기관)/g,
            /공인\s*(?:교육기관|학원|기관)/g,
            // 합격 실적 광고 — 계열 학원 실적을 본원 것으로 적는 일이 잦다
            /(?:특목고|외고|자사고|영재고|과학고|국제고|의대|치대|한의대|약대)[^\n]{0,14}\d+\s*명/g,
            /(?:서울대|연세대|고려대|SKY|스카이)\s*(?:합격|진학|다수|반)/g,
            /명문\s*(?:대|대학|고|고교|학교|사립)/g,
            /의치한|의대반|메디컬반/g,
            /인서울\s*(?:보장|확정)/g,
        ],
    },
];

/**
 * 본문에서 금지문구를 찾는다.
 *
 * 같은 문구가 글에 열 번 나와도 담당자가 볼 것은 한 번이면 되므로 문구별로 처음 것만 남긴다.
 * 금액을 뽑을 때(extractAmounts)와 같은 방식으로 앞뒤 문맥을 함께 떼어 둔다.
 *
 * @returns {{grade:number,label:string,ref:string,hit:string,문맥:string}[]}
 */
export function scanAdPhrases(text, limit = 6) {
    const s = String(text || '');
    if (!s) return [];
    const out = [];
    const seen = new Set();
    for (const group of AD_PHRASES) {
        for (const re of group.patterns) {
            for (const m of s.matchAll(re)) {
                const hit = m[0].replace(/\s+/g, ' ').trim();
                const key = `${group.grade}@${hit}`;
                if (seen.has(key)) continue;
                // 같은 문장 안에서 '하지 않는다'는 뜻이면 무른다
                if (NEGATION.test(sentenceAround(s, m.index, m[0].length))) continue;
                seen.add(key);
                out.push({
                    grade: group.grade,
                    label: group.label,
                    ref: group.ref,
                    hit,
                    문맥: s
                        .slice(Math.max(0, m.index - CONTEXT_BEFORE), m.index + m[0].length + CONTEXT_AFTER)
                        .replace(/\s+/g, ' ')
                        .trim(),
                });
            }
        }
    }
    // 등급이 높은(=처분이 무거운) 것부터
    out.sort((a, b) => a.grade - b.grade);
    return out.slice(0, limit);
}

/**
 * 시트 한 칸에 넣을 한 줄로 바꾼다.
 * 채널상세 JSON 안에 들어가므로 새 열을 만들지 않아도 화면과 시트 양쪽에 그대로 남는다.
 * 예) `1급 유일한 「우리 지역 유일한 소수정예…」 / 2급 선행학습 「중등 선행학습 전문…」`
 */
export function formatAdPhrases(list) {
    return (list || [])
        .map((h) => `${h.grade}급 ${h.hit} 「${h.문맥}」`)
        .join(' / ');
}

/** 가장 무거운 등급 (없으면 0) — 검토 탭이 정렬에 쓴다 */
export function topAdGrade(list) {
    return (list || []).reduce((top, h) => (top === 0 || h.grade < top ? h.grade : top), 0);
}
