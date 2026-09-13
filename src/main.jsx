import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// 로그인 문턱 앞에 있는 화면.
//   /g/<토큰> — 신고한 내용으로 만든 교습비 게시표 예시
// 관리자 화면과 갈라 실어야 휴대폰이 점검표·지도·엑셀까지 든 번들을 내려받지 않는다.
// (vercel.json 이 모든 경로를 index.html 로 보내므로 라우터는 따로 없다)
const path = window.location.pathname
const Page = lazy(() => (
  path.startsWith('/g/') ? import('./components/TuitionFormPage.jsx')
    : import('./App.jsx')
))

// /r/<토큰> 은 학원 회신 화면이었다. 기능은 걷어냈지만 이미 나간 문자에 그 주소가 남아 있어,
// 학원이 누르면 관리자 로그인 화면이 아니라 끝났다는 한 줄을 보게 한다.
const replyClosed = (
  <div style={{ maxWidth: '420px', margin: '80px auto', padding: '0 20px', textAlign: 'center', lineHeight: 1.7, fontFamily: 'system-ui, sans-serif' }}>
    <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '8px' }}>더 이상 사용하지 않는 주소입니다</div>
    <div style={{ color: '#64748b', fontSize: '0.92rem' }}>
      수정하신 내용은 담당자가 다시 확인합니다. 따로 알려 주지 않으셔도 됩니다.
    </div>
  </div>
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path.startsWith('/r/') ? replyClosed : (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    )}
  </StrictMode>,
)
