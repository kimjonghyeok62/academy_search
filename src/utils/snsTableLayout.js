// SNS 점검표의 치수·공통 스타일 — 표 헤더(SnsCheckTab)와 행(SnsCheckRow)이 함께 쓴다.
// 둘이 어긋나면 열이 밀리므로 한 곳에 모아 둔다.

import { BUCKETS } from '../utils/snsCheck';

export const W_NUM = 40;     // '#' 열 — 학원명 열의 sticky left 값이기도 하다
export const W_NAME = 168;
export const W_CH = 60;      // 채널 O/X 칸 — 묶음 7개 × (번호·교습비) = 14칸
export const W_CHECK = 112;  // '확인' 열 (마감/해제 + 새로고침)

// 표의 채널 묶음 순서: 플레이스 뒤로 blog·homepage·cafe·youtube·instagram·etc
export const CH_GROUPS = ['place', ...BUCKETS];

// 줄무늬·헤더 배경 (--bg-main 은 어디에도 정의돼 있지 않아 투명하게 나온다.
//  sticky 헤더가 투명하면 아래 행이 그대로 비쳐 보이므로 정의된 변수를 쓴다)
export const BG_STRIPE = 'var(--bg-light)';
export const BG_ROW = 'var(--bg-card)';

export const DONE_COLOR = '#10b981';
// 마감한 행은 옅은 초록을 덮어 한눈에 구분한다. 색을 통째로 갈아끼우지 않고 반투명 층을 얹어
// 라이트/다크 어느 쪽에서도 줄무늬와 고정 칸 배경이 그대로 살아 있게 한다.
export const doneTint = (base) =>
    `linear-gradient(rgba(16,185,129,.10), rgba(16,185,129,.10)), ${base}`;

// 가로로 스크롤해도 남는 왼쪽 고정 칸 — 배경이 투명하면 뒤 칸이 비쳐 보인다
export const stickyTd = (left, background) => ({ position: 'sticky', left, zIndex: 2, background });

export const linkStyle = { color: '#3b82f6', fontWeight: '600', textDecoration: 'none' };
export const CENTER = { textAlign: 'center' };
