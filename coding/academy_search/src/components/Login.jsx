import { useState, useEffect } from 'react';
import { SHEET_ID, PASSWORD_GID } from '../utils/googleSheets';

function Login({ onLogin }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [correctPassword, setCorrectPassword] = useState('');
    const [passwordLength, setPasswordLength] = useState(0);

    // Fetch password on mount
    useEffect(() => {
        const fetchPassword = async () => {
            try {
                const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${PASSWORD_GID}`;
                const res = await fetch(url);
                const text = await res.text();

                // Extract A1 cell value (first cell of first row)
                const firstLine = text.split('\n')[0];
                const pwd = firstLine.split(',')[0].replace(/^"|"$/g, '').trim();

                setCorrectPassword(pwd);
                setPasswordLength(pwd.length);
            } catch (err) {
                console.error('Failed to fetch password:', err);
                setError('비밀번호 정보를 불러오는데 실패했습니다.');
            }
        };

        fetchPassword();
    }, []);

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (loading || !password.trim()) return;

        setLoading(true);
        setError('');

        try {
            if (password === correctPassword) {
                onLogin();
            } else {
                setError('비밀번호가 올바르지 않습니다.');
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            setError('비밀번호 확인 중 오류가 발생했습니다.');
            setLoading(false);
        }
    };

    // Generate placeholder based on password length
    const placeholder = '•'.repeat(passwordLength || 4);
    const instructionText = passwordLength > 0
        ? `비밀번호 ${passwordLength}자리를 입력하세요`
        : '비밀번호를 입력하세요';

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
                        placeholder={placeholder}
                        autoFocus
                        disabled={loading || passwordLength === 0}
                        style={{
                            width: '100%',
                            padding: '16px',
                            borderRadius: '16px',
                            border: '2px solid var(--border-color)',
                            background: '#f8fafc',
                            color: 'var(--text-main)',
                            fontSize: '32px',
                            textAlign: 'center',
                            letterSpacing: '8px',
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
                        boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
                        opacity: (loading || !password.trim() || passwordLength === 0) ? 0.5 : 1
                    }}
                    disabled={loading || !password.trim() || passwordLength === 0}
                    onMouseOver={(e) => !loading && (e.target.style.backgroundColor = 'var(--primary-hover)')}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'var(--primary)'}
                >
                    {loading ? '확인 중...' : '확인'}
                </button>

                <p style={{ marginTop: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {instructionText}
                </p>
            </form>
        </div>
    );
}

export default Login;
