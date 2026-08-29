// 게시 여부 한 칸 — O / X / ? 만 보여준다.
// 왜 X 인지(미기재·오기재)는 옆의 '비고' 열과 학원 상세 SNS 탭이 맡는다.
//   'O' 게시  ·  'X' 미게시  ·  '?' 열지 못해 판정 보류
//   '없음' 그 채널 링크가 아예 없음  ·  '안함' 자동 조사 대상 아님  ·  빈 값 아직 조사 안 함
//
// manual 이 true 면 담당자가 직접 보고 고친 값이다. 자동 판정과 한눈에 구분되도록
// 파란색으로 보여준다 (다시 조사해도 이 값은 유지된다).
const MANUAL_COLOR = '#2563eb';

export default function SnsOxBadge({ value, manual }) {
    if (value === '없음') {
        return <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>없음</span>;
    }
    // 링크는 있는데 자동 조사 대상이 아닌 채널 (인스타그램)
    if (value === '안함') {
        return (
            <span title="자동 조사 대상이 아닙니다 — 링크로 직접 확인하세요"
                style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>안함</span>
        );
    }
    if (value !== 'O' && value !== 'X' && value !== '?') {
        return <span style={{ fontSize: '0.9rem', color: 'var(--border-color)' }}>–</span>;
    }
    return (
        <span style={{
            fontWeight: '800', fontSize: '0.95rem',
            color: manual ? MANUAL_COLOR
                : value === 'O' ? '#10b981' : value === 'X' ? '#ef4444' : 'var(--text-muted)',
            // 색만으로 알리지 않도록 밑줄도 함께 둔다
            borderBottom: manual ? `2px solid ${MANUAL_COLOR}` : 'none',
            paddingBottom: manual ? '1px' : 0,
        }}>{value}</span>
    );
}
