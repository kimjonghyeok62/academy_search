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

데이터가 어디서 오는지는 [구글시트-연동.md](구글시트-연동.md) 를 함께 볼 것.

## 안내 문자 — 지금 나가는 문구

```
[하남교육지원센터] 학원 온라인 게시 표시 안내

피아노포르테음악학원 (등록 제1050호)

1. 귀 학원 온라인 광고에서 다음을 확인해 보시기 바랍니다.
· 네이버플레이스 : 등록번호 및 교습비

「학원법」 제15조 제3항에 따라 학원 광고물에는 등록번호와 교습비등을 표시하여야 합니다. (명칭도 교육청에 등록된 명칭으로) 교육지원청 안내문 : https://buly.kr/BpHq2UV

2. 신고된 교습비 확인방법
· 신고된 교습비 : https://hakwon.neis.go.kr/nxui/index.html
· 출력 도움 : https://hakwon-price.vercel.app/ (JPG, HWPX 등)

신고하신 월 교습비는 140,000원 ~ 450,000원입니다.
게시하신 금액이 이와 같은지도 함께 확인해 주세요.

3. 귀 학원 인터넷광고 링크
· 네이버플레이스 : https://m.place.naver.com/place/13590319
  [홈] 교습비 이미지, [정보] 등록번호, (수정방법) https://new.smartplace.naver.com/help/guide?menu=edit
· 이 외에 인스타, 카페, 당근 등도 살펴보세요

2026. 9. 18. 즈음에 다시 확인하도록 하겠습니다.

문의 : 02-480-5144
```

교습비 금액이 신고와 다른(`△`) 매체가 있으면 월 교습비 범위 아래에 이 토막이 더 붙는다.
1번 목록은 없음·다름을 가르지 않고 똑같이 `교습비` 로 적는다 — 다르다는 말은 이 토막이 한다.

```
지금 광고 중인 금액 — 신고하신 교습비와 다릅니다
· 네이버플레이스 : 260,000원 · 300,000원
신고한 금액으로 고치시거나, 교습비가 바뀌었다면 먼저 신고해 주세요.
```

교습소에게는 `학원` → `교습소`, `등록번호` → `신고번호`, `(등록 제N호)` → `(신고 제N호)` 로 바뀐다.

### 각 토막이 어디서 오나

| 토막 | 만드는 곳 | 자료 |
|---|---|---|
| 1번 목록 | `noticeItems(result)` | `rowCells` 에서 `X`·`△`(DIFFERS) 인 칸 — 담당자가 손으로 고친 값이 그대로 반영된다. 한 매체의 항목은 `및` 으로 한 줄에 묶는다 |
| 근거 줄 | `LEGAL_LINE` + 안내 링크 | 안내 링크(`guideUrl`)가 비어 있으면 근거 문장만 나간다 |
| 2번 | `NEIS_LINE`·`FORM_LINE` | 모든 학원이 같은 고정 주소 |
| 월 교습비 범위 | `feeRange(sortCourses(academy.courses))` | 대조창과 **같은 함수**를 쓴다 (`tuitionCompareWindow.js`). 교습과정이 없으면 두 줄째 뺀다 |
| 지금 광고 중인 금액 | `adBlock(result)` | 조사 때 읽어 둔 금액 — 아래 '함정' 참고 |
| 3번 링크 | `bucketUrls(result)` | 플레이스는 `currentPlaceUrl`, 나머지는 플레이스 홈에 걸린 링크. 플레이스 주소 아래에는 `PLACE_HOWTO_LINE` 이 붙는다. 링크를 못 찾아도 머리와 `TAIL_LINE` 은 남긴다 |
| 기한·문의·안내 링크 | `readNoticeSettings()` | `localStorage` `sns_notice_v1` |

### 순서에는 이유가 있다

1 무엇을 확인하나(근거·안내문) → 2 신고한 교습비는 어디서 보나 → 얼마인가 → 3 우리가 본 곳 →
다시 확인할 날 → 문의.

번호는 내용이 적어도 건너뛰지 않는다 — 학원이 전화로 물어올 때 '2번 보세요' 로 짚어 줄 수 있어야 한다.
교육지원청 안내문 링크는 근거를 말한 자리에 함께 두었다 — 3번에 두면 학원의 광고 주소와 섞여
'우리 것' 처럼 보인다. 플레이스 수정방법 링크는 반대로 그 학원의 플레이스 주소 바로 아래에 둔다.

주소 바로 뒤에는 괄호·마침표를 붙이지 않는다 — 휴대폰이 그 글자까지 링크로 잡아 열리지 않는다.

1번은 '확인되지 않았습니다' 라고 단정하지 않고 '확인해 보시기 바랍니다' 라고 권한다. 자동 조사가
놓친 곳에 단정해 보내면 학원은 되묻고, 담당자가 전화를 한 번 더 받는다.

안내 링크 기본값은 짧은 주소(`https://buly.kr/BpHq2UV`)다. 예전 기본값인 goegh.kr 긴 주소가
`localStorage` 에 저장돼 있으면 `readNoticeSettings()` 가 읽을 때 새 주소로 바꾼다.

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

1. 전체
2. 넘치면 → 2번의 **출력 도움** 줄(`FORM_LINE`)을 뺀다 (참고 자료라 가장 먼저 덜어낸다)
3. 그래도 넘치면 → 빠진 항목이 많은 매체 **3곳**만 3번 링크에 남기고 (`TRIM_KEEP`),
   그 목록 안에 `TRIMMED_LINE`('위에 적지 못한 매체는 직접 확인 부탁드립니다')을 붙인다

**1번 목록은 어느 단계에서도 줄이지 않는다** — 무엇을 고쳐야 하는지가 이 문자의 본론이다.
(예전에 문자 끝에 붙던 '수정하셨으면 알려 주세요' 회신 주소는 걷어냈다 — [교습비-게시표.md](교습비-게시표.md))
'지금 광고 중인 금액' 도 덜어내지 않는다 (몇 줄뿐이고, 1번에 적은 교습비가 왜 문제인지
설명하는 자리다).

## 담당자가 고치는 자리

- **문구 상수** — `snsNoticeText.js` 위쪽 블록: `SENDER`·`SUBJECT`·`LEGAL_LINE`·`TAIL_LINE`·
  `PLACE_HOWTO_LINE`·`NEIS_LINE`·`FORM_LINE`·`TRIMMED_LINE`·`DEFAULT_GUIDE_URL`.
  `LEGAL_LINE` 의 조문(제15조 제3항)은 법제처 본문으로 확인한 값이다 — 고칠 때는 반드시 법문을 다시 볼 것.
  `{번호}` 는 학원이면 '등록번호', 교습소면 '신고번호' 로, `{기관}` 은 '학원' / '교습소' 로 바뀐다.
- **문장 틀** — 1번 머리('다음을 확인해 보시기 바랍니다'), 2번·3번 제목, 마지막 줄('즈음에 다시
  확인하도록 하겠습니다')은 `compose()` 안에 있다.
- **화면에서 정하는 값** — 점검표의 `⚙ 문자 설정`: 문의 전화 / 다시 확인할 날(오늘부터 며칠, 기본 5일) /
  교육지원청 안내 링크. `localStorage` `sns_notice_v1` 에 남는다.
  상세화면에는 설정 UI 를 복제하지 않았다 — 값이 한 곳이라 어디서 고쳐도 같이 반영된다.
- **상한** — `AD_FEES`(한 매체 금액 6개) · `TRIM_KEEP`(3곳) · `LMS_LIMIT`(2,000바이트).

## 함정

**플레이스에 적힌 금액은 열이 따로 없다.** 조사할 때 `플레이스_게시형태` 꼬리에
`가격메뉴 · 적힌 금액 260,000·300,000` 으로 붙여 둔다 (`naverProbe.js` 의 `wonList`, 최대 4개).
시트에 열을 늘리려면 Apps Script 까지 손대야 해서 그렇게 남겼다. `placeAdFees()` 가 그 꼬리를
도로 숫자로 되돌린다 — **게시형태 문자열 형식을 바꾸면 이 파싱이 조용히 깨진다.**
채널(블로그·홈페이지…) 금액은 `채널상세` JSON 의 `기재금액`(쉼표로 이은 숫자)에 정상적으로 있다.

**과정 이름은 조사 결과에 없다.** 자동 조사가 남기는 것은 숫자뿐이다. 그래서
'지금 광고 중인 금액' 에는 이름이 없고 제목도 '교습과정' 이 아니다. 이름까지 넣으려면
`api/tuition-read.js` 를 불러야 하는데 한 곳당 10초쯤 걸리고 가격표가 사진이면 Claude 를 거친다 —
750곳에 보낼 문자를 짓는 자리에서 할 일이 아니다 (대조창 ③번 카드가 그 일을 한다).

**`△` 는 '하나도 안 맞음' 이다.** `compareFees` 가 '불일치' 를 낼 때만 `△` 다. 그래서
'지금 광고 중인 금액' 의 머리 문장('신고하신 교습비와 다릅니다')이 성립한다.

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
| [#150](https://github.com/kimjonghyeok62/academy_search/pull/150) | 권하는 말투('확인해 보시기 바랍니다'), 2번을 '신고된 교습비 확인방법' 으로, 플레이스 수정방법 줄, 안내문 짧은 주소 |
