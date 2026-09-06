# SNS 안내 문자·교습비 대조 지도

미이행 학원에 보낼 **안내 문자**를 짓는 곳과, 신고 교습비를 네이버와 맞춰 보는 **교습비 대조창**이
어디에 어떻게 흩어져 있는지 적어 둔다. 두 기능은 화면 두 곳(점검표·상세화면)에서 같은 함수를
부르는 구조라, 한쪽만 고치면 같은 학원에 두 화면이 다른 말을 하게 된다.

## 어디에 무엇이 있나

| 것 | 위치 |
|---|---|
| 문구 조립 (본체) | `src/utils/snsNoticeText.js` |
| 대조창 HTML 생성·열기 | `src/utils/tuitionCompareWindow.js` |
| 점검표 한 행 (`✉ 문자`, `💰 교습비`) | `src/components/SnsCheckRow.jsx` |
| 점검표 (⚙ 문자 설정) | `src/components/SnsCheckTab.jsx` |
| 상세화면 SNS 탭 (버튼 2개 + 문자 미리보기) | `src/components/SnsDetailPanel.jsx` |
| 조사 결과 읽기·판정·칸 계산 | `src/utils/snsCheck.js` (`rowCells`·`parseChannels`·`toProbeTargets`·`declaredFees`) |
| 교습비 값 읽기·정렬 | `src/utils/generateTuitionPDF.js` (`sortCourses`·`parseNum`·`fmtNum`) |
| 네이버에 적힌 금액을 그때그때 읽어오기 | `api/tuition-read.js` (대조창 ③번 카드에서만 부른다) |
| 자동 조사 (O/X 판정, 금액 대조) | `api/sns-probe.js` → `api/_lib/naverProbe.js` |
| 문자 끝의 회신 주소 | [학원-회신.md](학원-회신.md) |

데이터가 어디서 오는지는 [구글시트-연동.md](구글시트-연동.md) 를 함께 볼 것.
문자를 받은 학원이 '고쳤습니다' 를 알려 오는 길은 [학원-회신.md](학원-회신.md) 에 있다.

## 안내 문자 — 지금 나가는 문구

```
[하남교육지원센터] 학원 온라인 게시 표시 안내

엠스터디수학전문학원 (등록 제1003호)

아래 광고물에서 다음이 확인되지 않았거나, 신고하신 내용과 다릅니다.
1. 네이버플레이스 : 등록번호
2. 네이버플레이스 : 교습비 (교습비 금액이 다름)
3. 블로그 : 교습비 (교습비 금액이 다름)

「학원의 설립·운영 및 과외교습에 관한 법률」에 따라 학원 광고물에는
등록번호와 교습비등을 표시하여야 합니다.

[수정 방법]
· 네이버플레이스 → 가격 정보에 교습비 등록(또는 가격표 이미지 첨부)
  소개글에 '등록 제1003호' 기재 (https://new.smartplace.naver.com/help/guide?menu=edit)
· 블로그 : 프로필·공지글에 등록번호, 별도 게시물에 교습비 등록

신고하신 월 교습비는 320,000원 ~ 450,000원입니다.
게시하신 금액이 이와 같은지도 함께 확인해 주세요.

[신고하신 교습과정]
· 보습 / 초등수학 : 월 320,000원
· 보습 / 중등수학 : 월 370,000원
· 보습 / 고등수학1 : 월 420,000원

[현재 광고 중인 교습비]
· 네이버플레이스 : 260,000원 · 300,000원
· 블로그 : 280,000원 · 350,000원
위 금액은 신고하신 교습비와 다릅니다 — 신고한 금액으로 고치시거나, 교습비가 바뀌었다면 먼저 신고해 주세요.

2026. 9. 11.까지 수정 부탁드리며, 이후 담당자가 다시 확인합니다.
이 외에도, 다른 모든 인터넷 매체(인스타그램, 카페 등)도 살펴보시기 바랍니다.

[수정하셨으면 알려 주세요]
아래를 눌러 고치신 항목만 표시해 주시면 됩니다 (1분, 로그인 없음).
https://…/r/a1003-7k2xq9

[관련링크]
· 네이버플레이스 : https://m.place.naver.com/place/1234567
· 블로그 : https://blog.naver.com/msstudy1003
· 교육지원청 게시 안내 : https://www.goegh.kr/…

문의 : 02-480-5144
```

### 각 토막이 어디서 오나

| 토막 | 만드는 곳 | 자료 |
|---|---|---|
| 빠진 항목 목록 | `noticeItems(result)` | `rowCells` 에서 `X`·`△`(DIFFERS) 인 칸 — 담당자가 손으로 고친 값이 그대로 반영된다 |
| `[수정 방법]` | `HOWTO[bucket]` | 매체별 고정 문장 |
| 월 교습비 범위 | `feeRange(sortCourses(academy.courses))` | 대조창과 **같은 함수**를 쓴다 (`tuitionCompareWindow.js`) |
| `[신고하신 교습과정]` | `courseBlock(academy)` | 마스터 시트의 `academy.courses`, 금액은 `parseNum(tuitionFee \|\| totalFee)` |
| `[현재 광고 중인 교습비]` | `adBlock(result)` | 조사 때 읽어 둔 금액 — 아래 '함정' 참고 |
| 기한·문의·안내 링크 | `readNoticeSettings()` | `localStorage` `sns_notice_v1` |
| 회신 주소 | `opts.replyUrl` | 부르는 쪽이 실어 준다 — `/api/reply-link` ([학원-회신.md](학원-회신.md)) |
| `[관련링크]` | `bucketUrls(result)` | 플레이스는 `currentPlaceUrl`, 나머지는 플레이스 홈에 걸린 링크 |

## 지켜야 하는 규칙

**1. 두 화면이 같은 문구를 낸다.** 점검표(`SnsCheckRow`)와 상세화면(`SnsDetailPanel`)이 모두
`buildNoticeSms(target, result, academy)` 를 부르고, `target` 은 양쪽 다 `toProbeTargets([academy], category)[0]`
로 만든다. 연락처를 어디서 꺼내는지(`founder.mobile → phone`)를 한쪽에서만 바꾸면 같은 학원에
두 화면이 다른 번호를 말한다. 고칠 때는 **바이트 수가 양쪽에서 같은지** 확인할 것.

**2. 금액을 읽는 함수는 하나다.** `parseNum(c.tuitionFee || c.totalFee)` — 대조창·게시표·문자가
모두 이걸 쓴다. 화면과 문자가 다른 금액을 말하면 어느 쪽이 맞는지 알 수 없다.

**3. 750행을 위해 문구는 부를 때만 짓는다.** 행을 그릴 때마다 문구를 만들면 표가 멎는다.
같은 이유로 문의 전화·기한을 prop 으로 실어 나르지 않고 `snsNoticeText` 가 `localStorage` 에서
직접 읽는다 (`SnsCheckRow.jsx` 머리 주석 참고).

**4. LMS 한도 2,000바이트(EUC-KR).** `smsBytes` 는 한글 2바이트로 센다. UTF-8 로 세면 3바이트라
보낼 수 있는 문자를 못 보낸다고 막는다.

## 길이가 넘칠 때 — `buildNoticeSms` 의 세 단계

1. 전체 (설정대로 교습과정 포함)
2. 넘치면 → 빠진 항목이 많은 매체 **3곳**만 `[수정 방법]`·`[관련링크]` 에 남긴다 (`TRIM_KEEP`)
3. 그래도 넘치면 → `[신고하신 교습과정]` 까지 뺀다

**빠진 항목 목록과 회신 주소는 어느 단계에서도 줄이지 않는다** — 무엇을 고쳐야 하는지가 이
문자의 본론이고, 회신 주소는 이 문자를 보내는 목적이다 (그것이 없으면 담당자가 1,000곳을
다시 조사해야 누가 고쳤는지 알 수 있다).
`[현재 광고 중인 교습비]` 도 덜어내지 않는다 (몇 줄뿐이고, 위 목록의 `(교습비 금액이 다름)` 이
무슨 말인지 설명하는 자리다).

## 담당자가 고치는 자리

- **문구 상수** — `snsNoticeText.js` 위쪽 블록: `SENDER`·`SUBJECT`·`LEGAL_LINE`·`TAIL_LINE`·`HOWTO`.
  `LEGAL_LINE` 의 조문 번호는 일부러 비워 두었다 (틀린 조문 하나가 안내문 전체의 신뢰를 깎는다).
  `{번호}` 는 학원이면 '등록번호', 교습소면 '신고번호' 로 바뀐다.
- **화면에서 정하는 값** — 점검표의 `⚙ 문자 설정`: 문의 전화 / 수정 기한(오늘부터 며칠) /
  교육지원청 안내 링크 / **☑ 신고한 교습과정 목록 넣기**. `localStorage` `sns_notice_v1` 에 남는다.
  상세화면에는 설정 UI 를 복제하지 않았다 — 값이 한 곳이라 어디서 고쳐도 같이 반영된다.
- **상한** — `COURSE_LINES`(교습과정 8줄) · `AD_FEES`(한 매체 금액 6개) · `LMS_LIMIT`.

## 함정

**플레이스에 적힌 금액은 열이 따로 없다.** 조사할 때 `플레이스_게시형태` 꼬리에
`가격메뉴 · 적힌 금액 260,000·300,000` 으로 붙여 둔다 (`naverProbe.js` 의 `wonList`, 최대 4개).
시트에 열을 늘리려면 Apps Script 까지 손대야 해서 그렇게 남겼다. `placeAdFees()` 가 그 꼬리를
도로 숫자로 되돌린다 — **게시형태 문자열 형식을 바꾸면 이 파싱이 조용히 깨진다.**
채널(블로그·홈페이지…) 금액은 `채널상세` JSON 의 `기재금액`(쉼표로 이은 숫자)에 정상적으로 있다.

**과정 이름은 조사 결과에 없다.** 자동 조사가 남기는 것은 숫자뿐이다. 그래서
`[현재 광고 중인 교습비]` 에는 이름이 없고 제목도 '교습과정' 이 아니다. 이름까지 넣으려면
`api/tuition-read.js` 를 불러야 하는데 한 곳당 10초쯤 걸리고 가격표가 사진이면 Claude 를 거친다 —
750곳에 보낼 문자를 짓는 자리에서 할 일이 아니다 (대조창 ③번 카드가 그 일을 한다).

**`△` 는 '하나도 안 맞음' 이다.** `compareFees` 가 '불일치' 를 낼 때만 `△` 다. 그래서
`[현재 광고 중인 교습비]` 의 마무리 문장('위 금액은 신고하신 교습비와 다릅니다')이 성립한다.

**점검표는 조사 결과를 `sessionStorage` 에 캐시한다** (`SnsCheckTab.jsx`, `CACHE_KEY`).
시트가 바뀌어도 탭을 새로 열기 전까지 옛 값을 보여준다. 상세화면은 매번 새로 읽으므로
두 화면이 달라 보이면 대개 이것 때문이다.

**대조창은 `blob:` 주소라 공유·새로고침이 안 된다.** 팝업이 막히면 탭으로 물러나고,
`SPLIT_SCRIPT` 의 `promote()` 가 자기를 blob 창으로 복제한 뒤 탭을 닫는다.

## 로컬에서 확인하는 법

이 앱은 `/api/*` 를 `localhost:3000`(vercel dev)으로 넘긴다. 그것 없이 화면만 보려면:

1. `npm run dev` → **5173** 포트 (`.claude/launch.json` 에는 5174 로 적혀 있으니 주의).
2. 로그인 문턱 넘기기 — 콘솔에서 `localStorage.setItem('academy_auth_v3','true')` 뒤 새로고침.
   마스터 시트는 공개 CSV 라 그대로 읽힌다.
3. 특정 학원으로 바로 가기 — `http://localhost:5173/?q=<학원명>&tab=sns` (`tab` 은 `status|tuition|sns|…`).
   **로그인·자료 로딩 뒤 한 번만** 동작한다 (`App.jsx` 의 `urlParamHandledRef`).
4. SNS 조사 결과가 필요하면 3000 포트에 가짜 서버를 띄워
   `GET /api/apps-script-proxy?action=getSnsChecks` 에 `{ ok:true, rows:[…] }` 를 돌려준다.
   행 모양은 `rowToResult()`(`snsCheck.js`)가 읽는 열 이름 그대로다. 바꾼 뒤에는
   **`sessionStorage.clear()` 하고 새로고침**해야 점검표가 새 값을 본다.
5. 문구만 확인할 때는 화면을 거치지 않아도 된다 —
   `await import('/src/utils/snsNoticeText.js')` 로 `buildNoticeSms` 를 직접 부를 수 있다.

## 이 기능이 만들어진 차례

| PR | 내용 |
|---|---|
| [#130~#132](https://github.com/kimjonghyeok62/academy_search/pull/132) | 교습비 대조창 — 반반 스플릿, 팝업↔탭 승격, 적힌 금액 읽기(③번 카드) |
| [#133](https://github.com/kimjonghyeok62/academy_search/pull/133) | 상세화면 SNS 탭에 `💰 교습비 대조`·`✉ 안내 문자` 두 버튼과 문자 미리보기, 문자에 `[신고하신 교습과정]` |
| [#134](https://github.com/kimjonghyeok62/academy_search/pull/134) | 문자에 `[현재 광고 중인 교습비]` |
