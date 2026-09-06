# 학원 지도점검 도우미

하남시 학원·교습소 지도점검 업무를 돕는 화면. React + Vite, Vercel 서버리스(`api/`)로 돈다.

- **[docs/구글시트-연동.md](docs/구글시트-연동.md)** — 데이터가 어디서 오고 어디에 저장되는지,
  그리고 **SNS게시점검 시트에 열을 늘릴 때의 절차**. Apps Script 소스는 이 저장소에 없으므로
  시트 구조를 건드리기 전에 반드시 읽을 것.
- **[docs/학원-회신.md](docs/학원-회신.md)** — 안내 문자를 받은 학원이 '고쳤습니다' 를 알려 오는
  길(`/r/<토큰>`). 로그인 없이 열리는 유일한 화면이라, 손대기 전에 읽을 것.
- **[docs/SNS-안내문자.md](docs/SNS-안내문자.md)** — 안내 문자 문구와 교습비 대조창.

```bash
npm run dev
```

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
