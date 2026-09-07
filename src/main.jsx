import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// 학원이 안내 문자로 받아 여는 두 화면은 로그인 문턱 앞에 있다.
//   /r/<토큰> — 고쳤다고 알려 오는 회신 화면
//   /g/<토큰> — 신고한 내용으로 만든 교습비 게시표 예시
// 관리자 화면과 갈라 실어야 학원 휴대폰이 점검표·지도·엑셀까지 든 번들을 내려받지 않는다.
// (vercel.json 이 모든 경로를 index.html 로 보내므로 라우터는 따로 없다)
const path = window.location.pathname
const Page = lazy(() => (
  path.startsWith('/r/') ? import('./components/ReplyPage.jsx')
    : path.startsWith('/g/') ? import('./components/TuitionFormPage.jsx')
      : import('./App.jsx')
))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
)
