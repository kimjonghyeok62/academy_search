import { useState, useEffect } from 'react';
import { fetchGoogleSheetData, PASSWORD_GID } from '../utils/googleSheets';

function Login({ onLogin }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (loading) return;

        setLoading(true);
        setError('');

        try {
            // Speed optimization for testing: if '50', bypass fetch
            if (password === '50') {
                onLogin();
                return;
                // Note: Component will unmount, so no need to setLoading(false)
            }

            const url = `https://docs.google.com/spreadsheets/d/158ZNBb88raJ1kzBL3eFcgPZS9CGs5in0YtPtiPWfdic/export?format=csv&gid=${PASSWORD_GID}`;
            const res = await fetch(url);
            const text = await res.text();

            const correctPassword = text.split('\n')[0].replace(/^"|"$/g, '').trim();

            if (password === correctPassword) {
                onLogin();
            } else {
                setError('비밀번호가 올바르지 않습니다.');
            }
        } catch (err) {
            console.error(err);
            setError('비밀번호 확인 중 오류가 발생했습니다.');
        } finally {
            if (password !== '50') {
                setLoading(false);
            }
        }
    };

    // Auto-login trigger
    useEffect(() => {
        if (password.length === 2) {
            handleSubmit();
        }
    }, [password]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '24px',
            backgroundColor: 'var(--bg-light)'
        }}>
            <form
                onSubmit={handleSubmit}
                className="glass-panel"
                style={{
                    padding: '48px 32px',
                    width: '100%',
                    maxWidth: '420px',
                    textAlign: 'center',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    boxShadow: 'var(--shadow-lg)',
                    borderRadius: '24px'
                }}
            >
                <div style={{ marginBottom: '32px' }}>
                    <h2 className="title primary-gradient-text" style={{ fontSize: '1.75rem', marginBottom: '8px' }}>접속 권한 확인</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: '500' }}>
                        계속하려면 비밀번호를 입력하세요
                    </p>
                </div>

                <div style={{ position: 'relative', marginBottom: '32px' }}>
                    <input
                        type="password"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••"
                        maxLength={2}
                        autoFocus
                        style={{
                            width: '100%',
                            padding: '16px',
                            borderRadius: '16px',
                            border: '2px solid var(--border-color)',
                            background: '#f8fafc',
                            color: 'var(--text-main)',
                            fontSize: '32px',
                            textAlign: 'center',
                            letterSpacing: '12px',
                            boxSizing: 'border-box',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            outline: 'none',
                            fontWeight: '600'
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                    />
                </div>

                {error && (
                    <div style={{
                        color: '#dc2626',
                        backgroundColor: '#fef2f2',
                        padding: '12px',
                        borderRadius: '12px',
                        marginBottom: '24px',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        border: '1px solid #fee2e2'
                    }}>
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    style={{
                        width: '100%',
                        padding: '14px',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '14px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)'
                    }}
                    disabled={loading}
                    onMouseOver={(e) => e.target.style.backgroundColor = 'var(--primary-hover)'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'var(--primary)'}
                >
                    {loading ? '확인 중...' : '확인'}
                </button>

                <p style={{ marginTop: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    비밀번호 2자리를 입력하세요
                </p>
            </form>
        </div>
    );
}

export default Login;
