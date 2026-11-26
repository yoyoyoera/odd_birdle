# Odd Birdle 앱 DAILY 서버 설계 (APP-API)

작성: 2026-11-26 · 상태: 설계 확정 대기(사용자 결정은 `docs/PLAN-mobile-app.md` D1에 기록됨) · 대상: 앱 1.1의 DAILY와 계정

이 문서는 서버(D2)와 앱 화면(D3)을 만들기 전에 **데이터 계약**을 고정한다. 구현이 이 문서와 다르면 문서를 먼저 고친다.

## 1. 사용자 결정 (2026-11-26)
- DAILY는 **1.1 업데이트**로 낸다(iOS 1.0은 심사 중, Android는 비공개 테스트 12/10까지).
- 순위표 이름: 로그인 전 **자동 별칭**, 로그인(Apple·Google)하면 **닉네임**을 직접 정한다. 닉네임은 글자·문자 제한과 금칙어 필터, 이름마다 **신고 버튼**.
- 손님 기록은 로그인하면 **계정으로 합친다**.
- 순위: 그날 **클리어 순서 상위 5명**.
- 삭제: 앱 안 삭제 버튼, 그리고 앱을 지운 뒤에도 쓰는 **웹 삭제 페이지(삭제 코드 입력)**.

## 2. 구성
```
앱(Capacitor) ──HTTPS──▶ oddbirdle.pages.dev/api/app/v1/*  (Pages Function: 요청을 그대로 전달)
                                   │ service binding APP_API
                                   ▼
                       Worker `oddbirdle-app-api`  ── D1 `oddbirdle-app` (SQLite)
```
- 규칙(오늘의 도전 종류, 시도 횟수, 최소 시간)은 **`daily-plan.js`를 그대로 import**한다. 서버가 "오늘이 무엇인지"를 정하고 앱은 보여 줄 뿐이다.
- 미리보기 배포는 `oddbirdle-app-api-preview` + 별도 D1로 하고, 실서버 데이터를 건드리지 않는다(매치메이커와 같은 방식).
- 날짜는 **UTC**(한국 09:00에 바뀜). 모든 날짜 문자열은 `YYYY-MM-DD`.
- **출처 제한:** 앱의 두 출처(`https://app.oddbirdle`, `capacitor://app.oddbirdle`)와 `oddbirdle.pages.dev`만 허용(`origins.js`의 `originSource`). 앱은 다른 출처라서 **CORS**가 필요하다: 허용 출처에만 `Access-Control-Allow-Origin`을 그대로 돌려주고, `Authorization`·`Content-Type` 헤더와 `OPTIONS` 사전 요청을 처리한다.

## 3. 사용자와 로그인
### 3.1 손님(기본)
- 앱이 처음 DAILY를 열 때 `POST /guest`를 부른다. 서버는 `userId`(무작위 128비트), `secret`(무작위 256비트)을 만들어 돌려주고 **`secret`은 해시(SHA-256)만 저장**한다. 앱은 둘을 **기기 저장소(`app-storage.js`, Preferences)**에 둔다.
- 이후 모든 요청에 `Authorization: Bearer <userId>.<secret>`. 서버는 `userId`로 행을 찾아 해시를 상수 시간 비교한다.
- 자동 별칭은 `userId`에서 정해진다(예: `SwiftBird-482`). 형용사·새·세 자리 숫자 조합이고 사용자에게 보이는 것은 이것뿐이다.
- 손님은 서버에서 **마지막 사용 후 90일**이 지나면 삭제한다(기록 포함). 계정(로그인한 사용자)은 본인이 지우기 전까지 유지한다.

### 3.2 로그인(Apple, Google)
- 앱이 Apple/Google 로그인 화면에서 **ID 토큰(JWT)**을 받아 `POST /login { provider, idToken }`로 보낸다(손님 인증 헤더 포함).
- 서버 검증: 공급자의 공개키 목록(JWKS)으로 서명 확인 → `iss`, `exp`, `aud` 확인.
  - Apple: `iss = https://appleid.apple.com`, `aud = com.yoyoyo.oddbirdle`
  - Google: `iss = https://accounts.google.com`, `aud = 웹 클라이언트 ID`(서버 클라이언트 ID, 비밀 아님)
  - `nonce`를 쓴다: 앱이 무작위 값을 만들고 그 해시를 요청에 넣고, 서버는 토큰 안의 값과 맞는지 확인한다(재사용 방지).
- **저장하는 것은 공급자 이름과 `sub`(공급자가 주는 사용자 고유 값)뿐**이다. 이메일·이름·프로필 사진은 요청하지도 저장하지도 않는다.
- 합치기 규칙:
  1. 그 `(provider, sub)`가 아직 없으면 → **지금의 손님 행에 붙인다**(손님이 계정이 되고 기록은 그대로).
  2. 이미 있으면(다른 기기에서 만든 계정) → 그 계정이 "기준"이다. 지금 손님의 기록을 기준 계정으로 **합친 뒤 손님 행을 지운다**.
     - 같은 날 둘 다 클리어: **순위가 앞선(숫자가 작은) 기록**을 남긴다. 시도 횟수는 큰 쪽.
     - 이후 앱은 기준 계정의 `userId`/`secret`으로 바꿔 쓴다(서버가 새 `secret`을 돌려줌).
- 같은 계정으로 여러 기기에 로그인할 수 있고, 기기마다 자기 `secret`을 가진다(`devices` 표).

### 3.3 닉네임과 신고
- 로그인한 사용자만 닉네임을 정한다(`PUT /me/nickname { nickname }`). 규칙: 3~16자, 한글·영문·숫자·`_`·`-`, 앞뒤 공백 없음, 정규화(대소문자·전각) 후 **금칙어 목록**(`nickname-filter.js`, 한국어·영어)과 대조. 하루 1회만 바꿀 수 있다.
- 신고: `POST /report { date, rank }`. 신고자는 **로그인 여부와 관계없이** 한 사람(`userId`)이 한 대상에 한 번만. 서로 다른 신고자가 **3명** 모이면 서버가 그 사람의 닉네임을 자동 별칭으로 되돌리고 `nickname_locked = 1`로 잠근다. 기록은 `reports` 표에 남긴다.
- 순위표의 이름은 `nickname ?? alias`.

## 4. 데이터 (D1)
```sql
users(id TEXT PRIMARY KEY, delete_code_hash TEXT, alias TEXT NOT NULL, nickname TEXT, nickname_locked INTEGER DEFAULT 0,
      nickname_changed_at INTEGER, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, is_account INTEGER DEFAULT 0)
devices(user_id TEXT, secret_hash TEXT, created_at INTEGER, PRIMARY KEY(user_id, secret_hash))
identities(provider TEXT, sub TEXT, user_id TEXT NOT NULL, PRIMARY KEY(provider, sub))
attempts(user_id TEXT, date TEXT, used INTEGER NOT NULL, PRIMARY KEY(user_id, date))
tokens(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, attempt INTEGER NOT NULL, started_at INTEGER NOT NULL,
       finished_at INTEGER, result TEXT)          -- result: 끝난 뒤의 응답(JSON). NULL이면 아직 진행 중
clears(user_id TEXT, date TEXT, rank INTEGER NOT NULL, seconds REAL NOT NULL, mine INTEGER, theirs INTEGER, attempt INTEGER,
       PRIMARY KEY(user_id, date), UNIQUE(date, rank))
day_counters(date TEXT PRIMARY KEY, count INTEGER NOT NULL)
reports(reporter_id TEXT, target_id TEXT, date TEXT, created_at INTEGER, PRIMARY KEY(reporter_id, target_id))
throttle(key TEXT, window INTEGER, count INTEGER, PRIMARY KEY(key, window))
```
- 순위표는 따로 저장하지 않고 `clears`에서 날짜가 같은 `rank <= 5`를 `users`와 이어서 만든다. 사용자를 지우면 그 사람의 줄이 사라지고 다른 사람의 순위 숫자는 그대로다(빈 칸 허용).
- 오래된 `tokens`(3시간 지난 것)와 `throttle`은 하루 한 번 청소한다.

## 5. DAILY 규칙 (Reddit판과 같은 규칙, 저장만 D1)
- **한 사용자·날짜에 클리어 기록은 한 건**(`clears` 기본키).
- **시작 `POST /daily/start`**: 한 번의 `batch`(트랜잭션)로 처리한다.
  1. 이미 그날 클리어가 있으면 `{ ok:false, reason:'cleared' }`.
  2. `attempts`를 올린다: `INSERT … ON CONFLICT DO UPDATE SET used = used + 1 WHERE used < :max RETURNING used`. 행이 안 돌아오면 `no-attempts`.
  3. 시도가 올랐을 때만 `tokens`에 새 토큰을 넣는다(`WHERE changes() > 0`).
  - 최대 시도: `daily-plan.js`의 `maxAttempts(key)`(Sudden Death 1회, 그 밖은 5회). **시도 횟수 증가와 토큰 발급은 둘이 함께 되거나 함께 안 된다.**
- **종료 `POST /daily/finish { token, won, mine, theirs }`**: **멱등**이다.
  - 토큰의 `result`가 이미 있으면 **같은 응답을 그대로 돌려준다**(토큰을 지우지 않는다). 응답이 유실돼 다시 보내도 안전하다.
  - 처음이면: 토큰의 날짜·사용자 확인 → 지난 시간 계산(`finished_at - started_at`, **서버 시각**) → `won`이 거짓이면 실패 기록만 → 참이면 점수 타당성(`mine ≥ 목표점수`, `theirs < max(목표, 11)`)과 최소 시간(`minimumSeconds(points)`) 확인.
  - 클리어면 **순위 발급과 기록 저장을 한 번의 `batch`로**: `day_counters`를 올리고, 그 값을 `rank`로 `clears`에 넣는다. `clears` 기본키·`UNIQUE(date, rank)`가 부딪치면(같은 날 두 토큰이 동시에 끝남) 배치 전체가 되돌려지므로 순위 숫자에 구멍이 생기지 않고, 이미 있는 기록을 읽어 `fresh:false`로 돌려준다.
  - 토큰 유효 시간은 3시간, 날짜는 토큰에 박혀 있어 자정(UTC)을 넘겨 끝내도 그 날 기록이다.
- **오늘 `GET /daily`**: `{ plan, attemptsUsed, cleared?, calendar, board, me }`.
  - `calendar`: 이 사용자가 클리어한 날짜 목록(연승은 앱이 `streakOf`로 계산).
  - `board`: 오늘 상위 5명 `[{ rank, name, seconds }]`.
  - `me`: `{ name, account }`.
- **검증 수준**: 승패와 점수는 앱이 보고한 값이고, 서버는 **시작·종료 시각 측정과 최소 시간·점수 범위 검사**만 한다. 순위표나 스토어 문구에서 "공정함을 보장"한다고 말하지 않는다.

## 6. 삭제
- **앱 안**: 설정 → Delete my data → `DELETE /me`(인증 필요). 확인 화면에서 "계정과 DAILY 기록, 닉네임이 지워지고 되돌릴 수 없습니다"를 보여 준다. 로그아웃만 하는 버튼은 따로 둔다.
- **삭제 코드**: 12자(무작위 읽기 쉬운 알파벳, 예 `K7M2-QX9D-4HTB`). 서버가 `HMAC(서버 비밀, userId)`로 **언제든 다시 계산**하므로 따로 저장하지 않아도 앱 설정에서 다시 볼 수 있다(조회는 인증된 `GET /me/delete-code`). 서버에는 코드의 해시를 색인으로 둔다(`users.delete_code_hash`, 위 표에 추가).
- **웹 삭제 페이지** `https://oddbirdle.pages.dev/delete`: 코드를 입력하면 `POST /delete { code }`로 지운다. **앱을 지운 뒤에도, 로그인 계정이든 손님이든** 같은 방식으로 지울 수 있다. 계정이 있는 사용자는 코드를 잃어버렸을 때를 위해 **지원 이메일**로도 요청할 수 있다고 안내한다(공급자 로그인으로 본인임을 확인).
- **무엇을 지우나**: `users`, `devices`, `identities`, `attempts`, `tokens`, `clears`, 그 사람이 한 `reports`, 신고당한 기록은 신고자 정보 없이 비운다. 순위표에서 그 줄이 사라진다.
- **부정 시도 막기**: `POST /delete`와 `POST /guest`, `POST /login`은 `throttle`로 IP·키별 시간당 횟수를 제한한다(예: 삭제 5회/시간). 코드가 12자(약 60비트)라 무차별 대입은 현실적으로 불가능하다.
- Google Play "계정 삭제 URL"에는 위 `/delete` 페이지, App Store "앱 안 계정 삭제 시작"에는 설정의 Delete my data를 적는다.

## 7. 오류와 응답 형식
- 성공은 `{ ok:true, … }`, 실패는 `{ ok:false, reason }`과 알맞은 상태 코드.
- reason: `unauthorized`(401), `cleared`, `no-attempts`, `bad-token`, `bad-result`, `too-fast`(409/422), `rate-limited`(429), `nickname-invalid`, `nickname-taken-today`, `offline`(앱이 서버에 못 닿음, 서버가 보내지 않음).
- 앱은 서버에 못 닿으면 DAILY 카드에 "Offline"을 보이고 시도를 쓰지 않는다(시도는 서버가 시작을 받은 뒤에만 센다).

## 8. 개인정보
- 서버가 가지는 개인 관련 정보: 자동 별칭, (로그인 시) 공급자와 `sub`, 닉네임, 클리어 날짜·시간·점수, 마지막 사용 시각. **이메일, 이름, 위치, 기기 광고 ID, 연락처는 없다.**
- 스토어 라벨에는 "사용자 ID", "사용자 콘텐츠(닉네임)"가 **계정과 연결된 데이터**로 늘어난다. 로그인 도입 시 개인정보처리방침(studiyo 사이트의 oddbirdle 페이지)과 App Privacy·Play 데이터 보안 양식을 함께 고친다.
- 삭제 요청은 **지체 없이**(코드가 맞으면 즉시) 처리한다.

## 9. 테스트 계획 (D2)
1. 순수 로직 단위 테스트: 별칭 생성, 닉네임 검사·금칙어, 순위 규칙, 최소 시간, 코드 계산.
2. 로컬 D1(`wrangler dev --local` 또는 Miniflare)에서 **동시 시작**, **중복 종료**, **응답 유실 뒤 재시도**, **UTC 0시 경계**, **합치기**(두 손님·같은 날 둘 다 클리어), **동시에 두 토큰이 끝남**, **삭제 후 순위표**.
3. 로그인 검증은 가짜 JWKS로 단위 시험(올바른 서명, 만료, 잘못된 `aud`, 다른 `nonce`).
4. 배포는 미리보기에서 앱↔서버를 먼저 확인하고, 실서버 배포는 사용자 확인 후.

## 10. 앱 쪽 (D3)
- `createDailyClient({ request })`에 `request`를 끼워, 주소(`serverBase + 'api/app/v1/daily…'`)와 `Authorization`을 붙인다. 기기 저장소에서 `userId`/`secret`을 읽고, 없으면 첫 DAILY에서 `POST /guest`.
- 화면: 메뉴의 DAILY 카드(오늘 도전, 남은 횟수, 상위 5명), 설정(별칭/닉네임, 로그인, 삭제 코드 보기, Delete my data), 순위표 이름의 신고 버튼.
- 로그인 플러그인: Capacitor 8에서 Apple·Google을 둘 다 지원하는 것을 D3 시작 때 확인해 고른다(후보: `@capgo/capacitor-social-login`, `@capacitor-firebase/authentication`). 번들러 없이 `window.Capacitor.Plugins`로 쓰는 앱 구조에 맞아야 하고, 안 맞으면 앱 빌드에 필요한 최소한의 연결 코드만 만든다.

## 11. 남은 확인과 위험
- 사용자가 Apple Developer의 Sign in with Apple 설정과 Google OAuth 클라이언트 ID 3종을 만들어야 로그인을 실제로 시험할 수 있다(`oddbirdle-accounts-setup-handoff.md`).
- Cloudflare D1 데이터베이스(미리보기·실서버) 생성, 서버 비밀(`DELETE_CODE_KEY`)을 `wrangler secret`으로 등록. 비밀은 저장소에 넣지 않는다.
- 무료 한도(D1 일 500만 읽기·10만 쓰기)는 현재 규모에서 충분하다. 사용자가 크게 늘면 쓰기가 먼저 한도에 닿는다(클리어와 시도 기록).
- 금칙어 목록은 완전하지 않다. 신고(3명)와 자동 되돌림이 그 구멍을 메우는 장치이고, 지원 이메일로 들어오는 신고도 같은 방법으로 처리한다.
