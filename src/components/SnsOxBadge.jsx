// 게시 여부 O/X 배지 — 판정 근거(게시형태·기재번호)를 아래에 함께 보여준다
export default function SnsOxBadge({ value, sub, subColor }) {
    return (
        <div>
            <span style={{
                fontWeight: '800', fontSize: '0.78rem',
                color: value === 'O' ? '#10b981' : value === 'X' ? '#ef4444' : 'var(--text-muted)',
            }}>{value || '-'}</span>
            {sub && <div style={{ fontSize: '0.68rem', color: subColor || 'var(--text-muted)', lineHeight: 1.3 }}>{sub}</div>}
        </div>
    );
}
