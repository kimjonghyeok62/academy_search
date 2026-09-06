import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// 학원이 안내 문자로 받아 여는 회신 화면(/r/<토큰>)은 로그인 문턱 앞에 있다.
// 두 화면을 갈라 실어야 학원 휴대폰이 점검표·지도·엑셀까지 든 관리자 번들을 내려받지 않는다.
// (vercel.json 이 모든 경로를 index.html 로 보내므로 라우터는 따로 없다)
const isReply = window.location.pathname.startsWith('/r/')
const Page = lazy(() => (isReply ? import('./components/ReplyPage.jsx') : import('./App.jsx')))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
)
