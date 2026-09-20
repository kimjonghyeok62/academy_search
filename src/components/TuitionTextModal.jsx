import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 네이버 플레이스 소개글에 붙여넣을 글 — 미리 보여 주고 복사한다.
 *
 * 곧바로 복사해 버리지 않는 까닭: 담당자가 학원에 보내기 전에 무엇이 들어갔는지 눈으로
 * 보고, 필요하면 몇 글자 고쳐서 보낼 수 있어야 하기 때문이다.
 */
export default function TuitionTextModal({ text, academyName, onClose }) {
    const taRef = useRef(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    async function copy() {
        const ta = taRef.current;
        if (!ta) return;
        try {
            await navigator.clipboard.writeText(ta.value);
        } catch {
            // 아이폰 사파리·HTTPS 아닌 자리에서는 클립보드가 막힌다
            ta.focus();
            ta.setSelectionRange(0, ta.value.length);
            document.execCommand('copy');
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return createPortal(
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                backgroundColor: 'rgba(15,23,42,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '16px',
            }}
        >
            <div
                className="animate-enter"
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                    width: '100%', maxWidth: '560px',
                    maxHeight: '90vh',
                    display: 'flex', flexDirection: 'column',
                    padding: '20px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#c2410c' }}>
                            네이버 플레이스용 텍스트
                        </div>
                        {academyName && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>{academyName}</div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="닫기"
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '1.2rem', color: 'var(--text-muted)',
                            padding: '2px 6px', lineHeight: 1, borderRadius: '6px', flexShrink: 0,
                        }}
                    >✕</button>
                </div>

                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
                    아래 내용을 복사해 네이버 플레이스 소개글에 붙여넣으세요. 필요하면 직접 고칠 수 있습니다.
                </div>

                <textarea
                    ref={taRef}
                    defaultValue={text}
                    spellCheck={false}
                    style={{
                        flex: 1, minHeight: '240px', resize: 'vertical',
                        width: '100%', padding: '12px',
                        fontFamily: "'D2Coding', 'Consolas', 'Menlo', monospace",
                        fontSize: '0.86rem', lineHeight: 1.7,
                        color: 'var(--text-main)',
                        backgroundColor: 'var(--bg-light)',
                        border: '1.5px solid var(--border-color)',
                        borderRadius: '10px',
                        whiteSpace: 'pre-wrap', overflowY: 'auto',
                    }}
                />

                <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                    <button
                        onClick={copy}
                        style={{
                            flex: 2, padding: '12px 10px',
                            backgroundColor: copied ? '#16a34a' : '#ea580c',
                            color: '#fff', border: 'none', borderRadius: '10px',
                            fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer',
                            transition: 'background-color 0.15s',
                        }}
                    >{copied ? '✓ 복사됨!' : '복사하기'}</button>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1, padding: '12px 10px',
                            backgroundColor: 'transparent', color: 'var(--text-muted)',
                            border: '1.5px solid var(--border-color)', borderRadius: '10px',
                            fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer',
                        }}
                    >닫기</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
