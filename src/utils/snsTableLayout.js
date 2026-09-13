// SNS 점검표의 치수·공통 스타일 — 표 헤더(SnsCheckTab)와 행(SnsCheckRow)이 함께 쓴다.
// 둘이 어긋나면 열이 밀리므로 한 곳에 모아 둔다.
//
// 폭을 정할 때의 원칙: 글자 크기는 줄이지 않는다. 대신 같은 말이 여러 번 반복되는 자리
// (채널 14칸의 '등록번호' → '번호', 확인 열의 '↻ 새로고침' → '↻')를 덜어내 자리를 얻는다.
// 고정폭 합 1514px < 표의 minWidth 1792px 이라 가로 스크롤은 생기지 않고,
// 폭을 주지 않은 '비고' 가 남는 278px 을 가져간다.

import { BUCKETS } from '../utils/snsCheck';

export const W_NUM = 40;     // '#' 열 — 학원명 열의 sticky left 값이기도 하다
export const W_NAME = 195;   // 학원명 + 주소 + 플레이스명 + 전화번호가 한 줄씩 들어갈 폭
export const W_REGNO = 76;   // 등록(신고)번호
export const W_CH = 55;      // 채널 O/X 칸 — 묶음 7개 × (번호·교습비) = 14칸
export const W_LINK = 120;   // 링크 묶음
export const W_INS = 84;     // 보험 만료일
export const W_MEMO = 145;   // 적요 (담당자가 적는 칸)
export const W_CHECK = 84;   // '확인' 열 (마감/해제 + 새로고침)

// 표의 채널 묶음 순서: 플레이스 뒤로 blog·homepage·cafe·youtube·instagram·etc
export const CH_GROUPS = ['place', ...BUCKETS];

// 채널 O/X 칸은 폭이 좁다 — 좌우 여백을 줄여 글자가 들어갈 자리를 확보한다.
// (글꼴 크기는 그대로 둔다. 내용 폭 47px 로 '없음'·'교습비'·'번호' 모두 들어간다)
export const CELL_PAD = '10px 4px';
// 확인 열도 마찬가지 — '✓ 완료' 가 들어갈 만큼만 남긴다
export const CHECK_PAD = '10px 6px';

// 줄무늬·헤더 배경 (--bg-main 은 어디에도 정의돼 있지 않아 투명하게 나온다.
//  sticky 헤더가 투명하면 아래 행이 그대로 비쳐 보이므로 정의된 변수를 쓴다)
export const BG_STRIPE = 'var(--bg-light)';
export const BG_ROW = 'var(--bg-card)';

export const DONE_COLOR = '#10b981';
// 보험: 유효는 파랑, 만료·미가입은 빨강 (색만으로 알리지 않도록 만료 쪽에는 ⚠ 를 붙인다)
export const INS_OK_COLOR = '#2563eb';
export const INS_BAD_COLOR = '#ef4444';

// 마감한 행은 옅은 초록을 덮어 한눈에 구분한다. 색을 통째로 갈아끼우지 않고 반투명 층을 얹어
// 라이트/다크 어느 쪽에서도 줄무늬와 고정 칸 배경이 그대로 살아 있게 한다.
export const doneTint = (base) =>
    `linear-gradient(rgba(16,185,129,.10), rgba(16,185,129,.10)), ${base}`;

// 가로로 스크롤해도 남는 왼쪽 고정 칸 — 배경이 투명하면 뒤 칸이 비쳐 보인다
export const stickyTd = (left, background) => ({ position: 'sticky', left, zIndex: 2, background });

export const linkStyle = { color: '#3b82f6', fontWeight: '600', textDecoration: 'none' };
export const CENTER = { textAlign: 'center' };
