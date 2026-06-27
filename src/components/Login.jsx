import { useEffect, useRef, useState } from 'react';

function Login({ onLogin, initialError = '' }) {
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef(null);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const initGSI = () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
          text: 'signin_with',
          locale: 'ko',
        });
      }
    };

    if (window.google?.accounts?.id) {
      initGSI();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = initGSI;
      document.head.appendChild(script);
    }
  }, []);

  const handleCredentialResponse = async (response) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (data.ok) {
        onLogin(data.email);
      } else {
        setError(data.error || '로그인에 실패했습니다.');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

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

        <div style={{ display: 'flex', justifyContent: 'center', minHeight: '44px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <div style={{
                width: '18px', height: '18px',
                border: '2px solid var(--border-color)',
                borderTopColor: 'var(--primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              인증 중...
            </div>
          ) : (
            <div ref={btnRef} />
          )}
        </div>

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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default Login;
