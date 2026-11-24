# Odd Birdle 안드로이드 앱 계획서

작성: 2026-11-24 · 작업 브랜치: `claude/stoic-bardeen-0t1rdr` · 상태 표시: ⬜ 대기 / 🔄 진행 중 / ✅ 완료 / ⛔ 막힘

이 문서는 사용자와 Claude가 함께 보는 기준 문서다. 단계가 끝날 때마다 상태·결과·변경된 결정을 여기에 갱신한다.
답·문서는 한국어, 게임 화면 글자는 영어(기존 규칙 유지).

---

## 1. 목표

하나의 안드로이드 앱에 다음 네 가지를 모두 넣는다.

| 모드 | 출처 | 앱에서의 형태 |
|---|---|---|
| **DAILY** (하루 도전) | `reddit` 브랜치 `daily-plan.js`, `daily-client.js`, Devvit 서버 `core/daily.ts` | 날짜별 같은 비틀기, 하루 시도 횟수, 클리어 순서 순위, ✓ 달력. 서버가 기록의 주인 |
| **STAGES** (스테이지 1~20 + 숨김 21) | `reddit` 브랜치 `stages.js`, `stage-progress.js`, `core/stages.ts` | 오프라인으로도 플레이, 클리어는 기기 저장 + 서버 동기화. 복식 스테이지 포함 |
| **FREE PLAY** (CPU 대전) | 웹 `main` + `reddit` | 지금의 랜덤 CPU 대전 그대로, 완전 오프라인 |
| **ONLINE** (멀티플레이) | 웹 `main` `rooms.js` / `worker.js` 매치메이커 | QUICK MATCH, 방 코드. 웹·포털 플레이어와 같은 서버에서 매칭 |

결과 카드는 안드로이드 공유 시트(이미지 + 글자)로 내보낸다. Reddit 댓글 대신 공유한다.

## 2. 현재 상황 (조사 결과)

- `main`(웹·포털): 휴대폰 터치 조작(TOUCH SPEED, 엄지 패드, 가로 전체 패드, 첫 실행 안내), 온라인 대전, 포털 빌드(`scripts/build-portal.mjs`).
- `reddit`(해커톤 브랜치, main보다 94커밋 앞섬·main은 15커밋 앞섬): 스테이지, 데일리, 복식(2v2), NET CORD, 카드(`card.js`), Devvit 앱(`reddit/odd-birdle/`).
  - 클라이언트는 `createDailyClient({ request })`, `createStageProgress({ request, storage, identity })`처럼 **통신 함수를 바꿔 끼울 수 있다** → 앱용 서버가 같은 REST 계약(`/api/daily`, `/api/daily/start`, `/api/daily/finish`, `/api/stages`)만 구현하면 클라이언트 로직은 그대로 재사용한다.
  - Reddit 빌드는 온라인 대전을 막아 두었다(Devvit 규정). 앱에서는 다시 켠다.
- 해커톤 마감 2026-12-09. **`reddit` 브랜치에는 손대지 않는다.** 이 작업은 작업 브랜치에서 두 브랜치를 합친 소스로 진행한다.
- 이 작업 환경: Java·Gradle 있음, Node 22 있음. **`dl.google.com`이 막혀 있어 Android SDK를 여기서 받을 수 없다** → APK 빌드는 GitHub Actions에서 한다(5단계). 필요하면 환경 네트워크 허용을 따로 요청할 수 있다.

## 3. 기본 결정 (사용자가 바꾸지 않으면 이대로 진행)

| 항목 | 기본안 | 이유 |
|---|---|---|
| 앱 방식 | **Capacitor**로 웹 게임을 감싼 안드로이드 앱 | 게임 코드(`game.js`, `client.js`)를 그대로 쓴다. 다시 짤 필요가 없다 |
| 앱 서버 | 기존 Cloudflare(Workers)에 **앱용 API Worker + D1**(데일리·스테이지 저장) | 매치메이커와 같은 계정·배포 방식. Reddit의 Redis 로직을 SQL로 옮긴다 |
| 계정 | 첫 실행 시 **익명 기기 ID**(서버가 발급·서명한 토큰) + 닉네임 | 로그인 없이 바로 플레이. Google Play Games 로그인은 나중 단계로 보류 |
| 온라인 출처 | 앱 WebView 주소를 고정(`https://app.oddbirdle` 계열 호스트)하고 `origins.js`에 `app` 출처로 추가 | 매치메이커의 출처 검사와 통계에 앱을 따로 표시 |
| 광고 | **1차에는 넣지 않음** | 출시 후 AdMob 추가를 별도 결정 |
| 화면 | 가로·세로 모두 지원(지금 웹의 휴대폰 레이아웃 그대로) | 이미 구현된 세로 엄지 패드·가로 전체 패드 재사용 |
| 패키지 이름 | `com.oddbirdle.app` (가칭) | 출시 전 확정 필요 |

## 4. 단계

각 단계는 "끝 조건"을 통과해야 다음으로 넘어간다. 단계마다 커밋하고 작업 브랜치에 푸시한다.

### Step 0. 계획서 ✅
- 이 문서 작성·커밋.

### Step 1. 두 브랜치 합치기 (통합 소스) ⬜
- 작업 브랜치에 `origin/reddit`을 병합한다. 충돌 예상: `client.js`, `game.js`, `index.html`, `portal.js`, `stands.js`, 사운드 파일.
- 원칙: 게임 규칙·스테이지·데일리·복식은 reddit 쪽, 휴대폰 터치(TOUCH SPEED·패드·안내)와 포털 수정은 main 쪽을 살린다. Reddit 전용 동작(온라인 차단, EXPAND 버튼 등)은 `data-portal="reddit"` 조건 아래로 묶는다.
- 서브에이전트: **사용하지 않음** (충돌 해결은 한 사람이 전체 맥락을 보고 해야 일관됨).
- 끝 조건: 루트 테스트 전부 통과, `node scripts/build-portal.mjs reddit`·웹 빌드 성공, Playwright로 웹(온라인 메뉴 포함)과 reddit 빌드(스테이지·데일리 메뉴) 화면 확인.

### Step 2. `app` 빌드 대상과 메뉴 ⬜
- `scripts/build-portal.mjs app` 추가: 외부 링크·분석·포털 SDK 제거, 폰트 내장, `data-portal="app"`.
- 메뉴: **DAILY / STAGES / FREE PLAY / ONLINE** 네 가지를 한 화면에. Reddit의 스테이지 목록·데일리 화면을 앱에서도 켜고, 온라인 메뉴(QUICK MATCH, 방 코드)를 함께 보이게 한다.
- 통신 어댑터 `app-api.js`: API 주소(설정값) + 기기 토큰 헤더를 붙이는 `request` 함수를 만들어 `createDailyClient`·`createStageProgress`에 넣는다. 매치메이커 WebSocket 주소도 앱에서는 절대 주소로.
- 오프라인: FREE PLAY·STAGES는 네트워크 없이 동작, DAILY·ONLINE은 "Offline" 안내.
- 카드: Reddit 댓글 버튼 대신 SHARE(앱에서는 네이티브 공유, 브라우저 미리보기에서는 다운로드).
- 서브에이전트: Step 3과 **병렬**(아래 참고).
- 끝 조건: 새 테스트(메뉴 구성, 어댑터, 오프라인 분기) 통과, 390×844·844×390 화면에서 Playwright 스크린샷 확인(가짜 API 서버 사용).

### Step 3. 앱 API 서버 (Worker + D1) ⬜
- `app-server/` 새 Worker: Reddit 서버 `core/daily.ts`·`core/stages.ts`의 규칙을 그대로 옮긴다.
  - `POST /api/device` 기기 토큰 발급(HMAC 서명), 닉네임 저장.
  - `GET /api/daily`, `POST /api/daily/start`, `POST /api/daily/finish`: 서버가 시도 토큰 발급, 서버 측 시간 측정, 최소 시간·시도 횟수 검사, 클리어 순서 순위(D1 트랜잭션).
  - `GET/POST/DELETE /api/stages`: 클리어 기록 동기화.
  - `DELETE /api/me`: 내 데이터 전부 삭제(Google Play 데이터 삭제 요건).
  - 요청 속도 제한, 입력 크기 제한, 허용 출처 검사.
- `daily-plan.js`·`stages.js`를 서버도 그대로 import(Reddit 앱과 같은 방식).
- 로컬 테스트: `wrangler dev` 없이도 돌도록 핵심 로직은 순수 함수 + 메모리 저장소로 테스트.
- 서브에이전트: Step 2와 **병렬**. 서로 손대는 파일이 겹치지 않는다(Step 2는 클라이언트·빌드, Step 3은 `app-server/`만). 둘이 공유할 **API 계약(요청·응답 모양)을 먼저 내가 `docs/APP-API.md`에 고정**한 뒤 각각 worktree에서 시작한다.
- 끝 조건: 서버 단위 테스트 통과, Step 2 클라이언트를 이 서버(로컬 실행)에 붙여 데일리 시작→클리어→순위, 스테이지 클리어→새로고침 후 ✓ 복원 확인.
- 배포(`wrangler deploy`, D1 생성)는 사용자 Cloudflare 계정이 필요 → 사용자 확인 후 진행.

### Step 4. 안드로이드 껍데기 (Capacitor) ⬜
- `android-app/`: Capacitor 프로젝트, `webDir`은 `portal/app/` 빌드 결과.
- 설정: 고정 호스트 이름, 전체 화면(몰입 모드), 화면 꺼짐 방지(경기 중), 뒤로 가기 = 일시정지/메뉴, 앱이 백그라운드로 가면 일시정지(온라인 경기는 기존 규칙대로), 첫 터치에 오디오 잠금 해제, 짧은 진동(선택), 공유 플러그인.
- `origins.js`·`worker.js`에 앱 출처 추가(매치메이커 배포는 사용자 확인 후).
- 앱 아이콘·스플래시: 기존 `og.png`/아이콘에서 생성.
- 서브에이전트: Step 2·3이 끝난 뒤 시작. 이 단계 안에서 **(a) Capacitor 설정·네이티브 플러그인**과 **(b) 아이콘·스플래시 생성 + GitHub Actions 빌드 워크플로(Step 5 준비)** 를 두 에이전트로 병렬 처리.
- 끝 조건: `npx cap sync android` 성공, 안드로이드 프로젝트 구조 검사 통과.

### Step 5. APK 빌드 (GitHub Actions) ⬜
- `.github/workflows/android.yml`: Node 빌드 → `cap sync` → Gradle `assembleDebug`(디버그 APK)와 `bundleRelease`(서명 시크릿이 있을 때만) → 아티팩트 업로드.
- 이 환경에서 Android SDK를 받을 수 없으므로 빌드 확인은 Actions 결과로 한다.
- 끝 조건: Actions에서 디버그 APK가 만들어지고 다운로드 가능. 사용자가 실제 폰에 설치해 확인.

### Step 6. 실제 기기 다듬기 ⬜
- 사용자가 APK를 설치해 본 피드백 반영: 터치 감도, 노치·제스처 바 여백(safe-area), 성능(프레임), 소리 지연, 온라인 연결 안정성.
- 서브에이전트: 피드백 항목이 서로 독립적이면 항목별로 병렬 처리(각자 worktree), 마지막에 내가 합치고 전체 테스트. 이어서 **코드 리뷰 에이전트**로 변경 전체 점검.
- 끝 조건: 사용자 확인.

### Step 7. 출시 준비 ⬜
- 릴리스 서명 키(사용자가 만들고 GitHub 시크릿에 저장), 버전 규칙, `bundleRelease`(AAB).
- Play Console 자료: 앱 설명(영어/한국어), 스크린샷(Playwright로 생성), 개인정보처리방침(기기 ID·닉네임·기록만 저장, 삭제 방법), 데이터 보안 양식 답안, 콘텐츠 등급 답안 초안.
- 서브에이전트: **스토어 자료 작성**과 **스크린샷 생성**을 병렬.
- 끝 조건: 사용자가 Play Console에 내부 테스트 트랙으로 업로드.

## 5. 서브에이전트 사용 요약

| 단계 | 사용 | 나누는 방식 |
|---|---|---|
| 1 병합 | 아니요 | 한 맥락에서 충돌 해결 |
| 2 + 3 | **예 (2개 병렬, worktree)** | 클라이언트·빌드 / 서버. API 계약 문서를 먼저 고정 |
| 4 | **예 (2개 병렬)** | Capacitor 설정·플러그인 / 아이콘·스플래시·CI 워크플로 |
| 6 | **예 (항목별 병렬 + 리뷰 1개)** | 독립된 피드백 항목별, 끝에 코드 리뷰 |
| 7 | **예 (2개 병렬)** | 스토어 문구·정책 / 스크린샷 |

규칙: 에이전트 결과는 내가 직접 diff를 읽고 전체 테스트를 돌린 뒤에만 합친다. 공유 파일(`client.js`, `index.html`)은 한 번에 한 에이전트만 고친다.

## 6. 사용자가 직접 해야 하는 일

- (Step 3) Cloudflare 배포 승인: 앱 API Worker·D1 생성, 매치메이커 출처 추가 배포.
- (Step 5) 저장소 Actions 사용 허용 확인.
- (Step 6) 실제 안드로이드 폰에 APK 설치·테스트.
- (Step 7) Google Play 개발자 계정($25), 릴리스 서명 키 보관, 패키지 이름 확정, 스토어 등록.

## 7. 위험과 대응

| 위험 | 대응 |
|---|---|
| 병합 충돌이 커서 기존 동작이 깨짐 | 기존 테스트 전부 + 웹/reddit 빌드 화면 비교로 확인. reddit 브랜치 자체는 건드리지 않음 |
| 앱 WebView에서 프레임 저하 | `frame-meter.js`로 측정, 이펙트 품질 낮춤 옵션 |
| 데일리 기록 조작 | Reddit과 같은 수준(서버 시간 측정·토큰·최소 시간). 완전 방지는 범위 밖 |
| 익명 ID는 앱 삭제 시 기록 유실 | 1차는 감수. 이후 Google Play Games 로그인 검토 |
| 웹·포털 구버전과 온라인 호환 | 매치메이커 프로토콜은 바꾸지 않음. 출처 추가만 |

## 8. 진행 기록

- 2026-11-24: 계획서 작성.
