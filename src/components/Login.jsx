import { useEffect, useState } from 'react';

function Login({ onLogin, initialError = '' }) {
  const [error, setError] = useState(initialError);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const handleGoogleLogin = async () => {
    const verifier = generateVerifier();
    const challenge = await generateChallenge(verifier);
    sessionStorage.setItem('pkce_verifier', verifier);

    const redirectUri = `${window.location.origin}/auth/callback`;
    sessionStorage.setItem('pkce_redirect_uri', redirectUri);

    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
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

        <button
          onClick={handleGoogleLogin}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            width: '100%',
            padding: '12px 24px',
            backgroundColor: '#fff',
            color: '#3c4043',
            border: '1px solid #dadce0',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            fontFamily: "'Google Sans', Roboto, sans-serif",
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            transition: 'box-shadow 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)'}
          onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)'}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"/>
          </svg>
          Google로 로그인
        </button>

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

function generateVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export default Login;
