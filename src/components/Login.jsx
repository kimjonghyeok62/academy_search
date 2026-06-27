import { useEffect, useRef, useState } from 'react';

function Login({ onLogin, initialError = '' }) {
  const buttonRef = useRef(null);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        ux_mode: 'redirect',
        login_uri: `${window.location.origin}/api/google-callback`,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        locale: 'ko',
        width: 320,
      });
    };
    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

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
      <div
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
          <h2 className="title primary-gradient-text" style={{ fontSize: '1.75rem', marginBottom: '8px' }}>
            접속 권한 확인
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: '500' }}>
            구글 계정으로 로그인하세요
          </p>
        </div>

        <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center' }} />

        {error && (
          <div style={{
            color: '#dc2626',
            backgroundColor: '#fef2f2',
            padding: '12px',
            borderRadius: '12px',
            marginTop: '20px',
            fontSize: '0.9rem',
            fontWeight: '500',
            border: '1px solid #fee2e2'
          }}>
            {error}
          </div>
        )}

        <p style={{ marginTop: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          허가된 구글 계정만 접근할 수 있습니다
        </p>
      </div>
    </div>
  );
}

export default Login;
