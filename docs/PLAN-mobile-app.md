# Odd Birdle 모바일 앱 계획서 (Android · iOS)

작성: 2026-11-24 · 개정 1: 2026-11-24 (검토 의견 반영, 아래 9절) · 개정 2: 폭탄을 따로 떼어 다루지 않음 · 개정 3: 2026-11-25 iOS 분기 추가, 두 플랫폼 모두 가로 전용(아래 10절) · 이전 파일명 `docs/PLAN-android-app.md` · 작업 브랜치: `claude/stoic-bardeen-0t1rdr`
상태 표시: ⬜ 대기 / 🔄 진행 중 / ✅ 완료 / ⛔ 막힘 / 📱 실기기 판정 필요

**문서 구성 (개정 3):** 한 문서 안에서 플랫폼별로 갈라진다. 웹 게임·서버·기능 이식(빌드 2~4의 대부분)은 두 플랫폼이 같은 코드를 쓰므로 공통 단계로 두고, 플랫폼마다 다른 것만 `[Android]` / `[iOS]` 표시나 별도 트랙(빌드 1의 A·I 단계, 출시의 E·F 단계)으로 나눈다. 별도 iOS 계획서를 만들지 않은 이유: 공통 부분이 대부분이라 문서 두 개를 따로 고치면 둘이 어긋난다.

이 문서는 사용자와 Claude가 함께 보는 기준 문서다. 단계가 끝날 때마다 상태·결과·변경된 결정을 여기에 갱신한다.
답·문서는 한국어, 게임 화면 글자는 영어(기존 규칙 유지).

---

## 1. 목표와 진행 원칙

플랫폼: **Android와 iOS(iPhone)**, 둘 다 **가로 화면 전용**.

1.0에는 네 가지 모드를 모두 넣는다: **FREE PLAY**(CPU 대전), **STAGES**(1~20 + 숨김 21, 복식 포함), **DAILY**(하루 도전·순위), **ONLINE**(방 코드·QUICK MATCH).

진행 원칙 (개정 1):
1. **실기기에서 먼저 돌린다.** 서버·계정 없이 게임만 담은 APK를 가장 먼저 만들고, Android WebView에서 라켓 조작·소리·앱 복귀가 웹만큼 되는지 확인한 뒤 기능을 얹는다.
2. **판정의 분업.** Playwright = 화면 배치 회귀 검사. 실제 WebView의 터치 입력·소리 지연·회전·뒤로 가기·앱 복귀 = 실기기(📱)에서 사용자가 판정.
3. **기능은 한 번에 하나씩, 테스트와 함께 이식.** `reddit` 브랜치 전체 병합 대신 기준 소스 위에 기능 단위로 가져온다.
4. **기능 스위치.** 앱에서 `STAGES`, `DAILY`, `ONLINE`은 각각 켜고 끌 수 있는 기능으로 둔다. Reddit 댓글·EXPAND(확대 화면)는 Reddit 플랫폼 전용으로 남긴다.
5. **서버 없는 빌드를 먼저 내부 테스트한다.** 문제가 생겼을 때 서버와 섞이지 않은 상태에서 원인을 찾기 위해서다.

## 2. 현재 상황 (확인한 사실)

- 웹 `main`/작업 브랜치 기준 `c8323a8`: 휴대폰 터치 조작(TOUCH SPEED, 엄지 패드, 가로 전체 패드, 첫 실행 안내), 온라인 대전, 포털 빌드.
- **폭탄:** 저장소에 푸시된 모든 브랜치 중 폭탄 코드는 `reddit` 브랜치에만 있다. 거기서도 스테이지 7 `Bomb Rally`의 규칙(`rules.bomb`)으로만 들어간다. `c8323a8`에는 폭탄이 없다. 공개 웹판(oddbirdle.pages.dev)의 **랜덤 효과 폭탄**은 푸시된 어느 브랜치에도 없다. 이 작업 환경에서는 공개 사이트 접속이 막혀 있어 내용을 직접 대조하지 못했다. → **공개판 소스 확보가 첫 번째 선행 조건**(Step A0).
- 시험 병합(`main` ← `reddit`) 충돌 파일 6개: `client.js`, `game.js`, `index.html`, `build-pages.js`, `crowd.js`, `sound-cues.js`. `reddit`은 공통 조상보다 94커밋, `main`은 15커밋 앞서 있다.
- `stage-progress.js`는 저장 키가 `oddbirdle-stages:<userId|guest>`다. 오프라인 첫 실행에서 쌓인 `guest` 기록은 나중에 서버 ID를 받아도 옮겨지지 않는다(Reddit에서는 의도된 동작).
- Devvit 데일리 서버(`core/daily.ts`)는 시도 횟수 증가, 토큰 발급·소비, 기존 클리어 확인, 순위 증가, 기록 저장을 각각 별도 호출로 처리한다. 원자적이지 않다. 토큰을 검증하기 전에 먼저 지우므로, 종료 응답을 잃은 뒤 다시 요청하면 `bad-token`이 된다.
- 해커톤 마감 2026-12-09. **`reddit` 브랜치에는 손대지 않는다.**
- 작업 환경: Java·Gradle·Node 22는 있다. `dl.google.com`이 막혀 Android SDK를 받을 수 없으므로 APK는 GitHub Actions에서 빌드한다. 현재 npm 최신 버전: `@capacitor/core`·`@capacitor/android` 8.x, `@capacitor/preferences` 8.0.x, `@capacitor/share` 8.0.x, `@capacitor/app` 8.1.x.

## 3. 결정 사항

| 항목 | 결정 |
|---|---|
| 앱 방식 | **Capacitor 8**. 게임 파일(HTML·JS·폰트·사운드)은 APK에 내장한다. 매치 서버와 데일리 API만 절대 주소로 연결한다 |
| 빌드 재현성 | Capacitor·플러그인 버전을 정확히 고정한다(`^` 없음). `.nvmrc`로 Node 22를 고정하고 Gradle wrapper를 커밋한다. **`targetSdk 36` 이상**, `compileSdk 36` |
| 저장 | STAGES 클리어·터치 감도는 **Capacitor Preferences**(기기 저장)에 둔다. 서버 동기화는 복구 방법을 설계할 때 붙인다 |
| 서버 ID | **랭킹(DAILY)을 처음 쓸 때만** 발급한다. FREE PLAY·STAGES만 하는 사람에게는 발급하지 않는다 |
| 랭킹 이름 | **자동 별칭**(예: `Swift Plover 42`). 자유 닉네임은 1.0 범위에서 제외한다 |
| 온라인 순서 | **방 코드 먼저**, QUICK MATCH는 그다음. 실제 Android가 보내는 `Origin` 값을 확인한 뒤 그 값만 허용한다 |
| 광고 | 1.0 내부 테스트에는 넣지 않는다 |
| 패키지 이름 | **확정: `com.yoyoyo.oddbirdle`**(Android 패키지·iOS 번들 ID 공통, 사용자의 다른 studiyo 앱과 같은 규칙). Play 비공개 테스트에 versionCode 1로 업로드됨(11/25). 이후 업로드는 versionCode 2 이상 |
| 화면 방향 (개정 3) | **Android·iOS 모두 가로 전용**(왼쪽·오른쪽 가로 둘 다 허용, 세로 금지). 앱에서는 세로 엄지 패드·세로 배치를 쓰지 않고, 웹판의 "옆으로 든 폰" 조작(화면 전체 패드)이 앱의 기본 조작이다. 웹사이트·포털은 지금처럼 세로도 지원한다 |
| iOS 기기 범위 | 1.0은 **iPhone 전용**(iPad는 iPhone 앱 호환 모드로만 실행). iPad 전용 배치·스크린샷은 범위 밖 |
| iOS 최소 버전 | Capacitor 8 iOS 최소 배포 버전 **iOS 15.0**(`@capacitor/ios` 8.6.2 podspec에서 확인) |
| iOS WebView 출처 | iOS WKWebView는 https 스킴을 앱이 가로챌 수 없어 `capacitor://` 스킴을 쓴다. 같은 `server.hostname`을 쓰면 Origin은 **`capacitor://app.oddbirdle`**(Android는 `https://app.oddbirdle`). `origins.js`의 정확한 비https 출처 목록(`appOrigins`)에 넣을 수 있는 구조가 이미 있다 |

## 3-1. 일정 (2026-11-26 기준, 개정 4)

- **Android 비공개 테스트 시작: 2026-11-26** → 14일 연속 참여 조건 충족 예정 **2026-12-10** → 그 뒤 프로덕션 접근 신청(E2).
  - 테스트 기간에도 같은 트랙에 새 버전(더 큰 versionCode, 같은 업로드 키)을 올릴 수 있다. 테스터 참여 일수는 끊기지 않는다.
  - 프로덕션 접근 심사에서 테스트 기간의 업데이트·피드백 반영을 묻으므로, 기간 중 개선판을 1~2번 올린다.
- **iOS:** TestFlight 업로드(I2b) → 실기기 점검(I3) → App Store 제출(F2). Android 출시 시점과 맞추려면 **12/5 전후 제출**이 목표(심사는 보통 1~3일).

| 기간 | Android | iOS | 공통(웹 게임) |
|---|---|---|---|
| 11/26~11/30 | 테스트 진행, 피드백 수집 | I2b 업로드 복구, I3 실기기 점검(Mac 세션 설치) | 실기기 피드백 작은 수정(Mac 세션), B1 엔진 이식 시작 |
| 12/1~12/5 | 개선판 1 업로드(빌드 2: STAGES + 카드 공유) | 같은 빌드 TestFlight → **App Store 제출** | B2·B3 완료, 스토어 문구·개인정보처리방침·스크린샷(E2·F2 공용) |
| 12/6~12/10 | 개선판 2(피드백 반영), 12/10 프로덕션 신청 | 심사 대응, 출시 | 다듬기 |

- **1.0 범위 제안:** FREE PLAY + STAGES(기기 저장) + 결과 카드 공유. **ONLINE(방 코드)**은 기존 서버라 시간이 남으면 1.0에, **DAILY**는 새 서버·계정 삭제 흐름이 필요해 **1.1로** 미룬다. (사용자 확인 필요)

## 4. 단계

각 단계는 끝 조건을 통과해야 다음으로 넘어간다. 단계마다 커밋하고 작업 브랜치에 푸시한다.

### 빌드 1 — 지금의 웹판 FREE PLAY 그대로 (서버·광고·계정 없음)

#### Step A0. 공개판 기준 소스 확정 ✅
- 결과: `origin/main` `375a7bf`(폭탄 효과·3터치·관중 반응 포함)를 작업 브랜치에 병합. 이 소스로 빌드한 `dist/`의 JS 23개와 `index.html`이 oddbirdle.pages.dev 배포 파일과 바이트 단위로 같음을 확인. 루트 테스트 194개 통과.
- 공개 웹판에 배포된 소스를 저장소로 가져온다. 방법은 둘 중 하나다.
  - (가) 배포한 로컬 소스나 브랜치를 사용자가 푸시한다.
  - (나) 이 환경에서 `oddbirdle.pages.dev` 접속을 허용받아 배포 파일을 받는다. 이 경우 원본 소스와의 차이는 따로 확인한다.
- 기준 커밋을 정해 `base/web-public` 태그나 메모를 남긴다. 기존 루트 테스트를 모두 통과시킨다.
- 서브에이전트: 사용 안 함.
- 끝 조건: 기준 소스가 공개판과 같은 동작(랜덤 효과 전체 포함)을 하고, 테스트가 통과한다.

#### Step A1. `app` 빌드 대상 + Capacitor 껍데기 ✅
- 결과: `node scripts/build-portal.mjs app [--features=...]` → `portal/app/`(외부 주소 검사, 랜덤 폭탄 포함 FREE PLAY만). `app-shell.js`: 경기 중 뒤로 가기 = PAUSED 화면(탭하면 재개, 다시 뒤로 = 메뉴), 메뉴에서 뒤로 = 종료, 백그라운드 = 일시정지·소리 정지. `mobile-app/`: Capacitor 8.6.2, `@capacitor/app` 8.1.2, appId `com.yoyoyo.oddbirdle`, WebView Origin `https://app.oddbirdle`, compile/targetSdk 36, minSdk 24, 화면 켜짐 유지·몰입형·가장자리 그리기, SystemBars `insetsHandling: css`. 배치 스크린샷 기준: `tools/app-layout/`. 테스트 207개 통과.
- `scripts/build-portal.mjs app` 빌드를 추가한다.
  - 외부 링크·분석·포털 SDK·AdSense는 넣지 않는다.
  - 폰트와 사운드는 내장한다.
  - `data-portal="app"`을 붙인다.
  - 기능 스위치 기본값: STAGES·DAILY·ONLINE 모두 꺼짐. 메뉴에는 FREE PLAY만 보인다.
- `mobile-app/`(Capacitor 8) 구성:
  - `webDir` = `portal/app/`
  - 몰입형 전체 화면, 경기 중 화면 꺼짐 방지
  - **Android 16 대응:** 화면 가장자리(edge-to-edge)는 safe-area 여백으로 처리하고, 시스템 뒤로 가기(예측형 뒤로 가기)는 `@capacitor/app`의 backButton으로 경기 중 일시정지, 메뉴에서 종료 확인
  - 앱이 백그라운드로 가면 일시정지, 복귀하면 오디오를 다시 켬
  - 첫 터치에 오디오 잠금 해제
- 서브에이전트: **2개 병렬.**
  - (a) `app` 빌드 대상과 앱 전용 동작(기능 스위치, 일시정지, 뒤로 가기, safe-area): 클라이언트 파일 담당
  - (b) Capacitor 프로젝트, 아이콘·스플래시, GitHub Actions 워크플로: `mobile-app/`, `.github/` 담당
  - 둘은 손대는 파일이 겹치지 않는다. 앱 웹 코드와 네이티브가 주고받는 이벤트 목록은 시작 전에 내가 정해 준다.
- 끝 조건: `npx cap sync android` 성공. Playwright로 390×844·844×390·Android 16 상단 인셋 가정 화면의 배치 스크린샷을 확인하고 회귀 기준으로 저장한다.

#### Step A2. GitHub Actions 디버그 APK ✅
- 로컬 `assembleDebug` 성공(4.4MB, targetSdk 36, 16KB 정렬 통과, 네이티브 라이브러리 없음).
- Actions 첫 실행 성공(약 2분): https://github.com/yoyoyoera/odd_birdle/actions/runs/45446086703 · 아티팩트 `odd-birdle-debug-9a8413c`(30일 보관). 이후 작업 브랜치에 푸시할 때마다 새 APK가 만들어진다.
- `.github/workflows/android.yml` 순서:
  1. Node 22 빌드
  2. `cap sync`
  3. JDK 21 + Gradle wrapper로 `assembleDebug`
  4. APK 아티팩트 업로드
  5. `targetSdk`가 36 이상인지 검사하고, 아니면 빌드를 실패시킨다
- 끝 조건: Actions에서 APK가 만들어지고 다운로드할 수 있다.

#### Step A2b. [공통·Android] 가로 전용 전환 ✅ (개정 3)
- 결과: 앱 빌드 `<html data-orientation="landscape">` → 세로 패드·세로 메뉴 없음, 가로 안내만, 세로로 긴 창은 가로 배치를 폭에 맞춰 가운데 표시(`touch-layout.js`). Android `sensorLandscape`(aapt2로 확인). 배치 기준 `tools/app-layout/`: 844×390·932×430·1012×456 × (인셋 없음·노치 왼쪽·노치 오른쪽) + 600×900. 웹사이트 세로 배치 변화 없음.
- `[Android]` `AndroidManifest.xml` 액티비티에 `android:screenOrientation="sensorLandscape"`. Android 16(targetSdk 36)은 **큰 화면(가로 폭 600dp 이상, 태블릿·폴더블 펼침)에서 방향 고정을 무시**한다. 폰은 고정이 지켜지고, 큰 화면에서는 세로로 열릴 수 있으므로 그때도 가로 배치가 깨지지 않는지(세로로 길어도 게임이 가로 비율로 그려지는지)만 보장한다.
- `[공통]` 앱 빌드에서 세로 엄지 패드·세로 메뉴 배치를 끄고, 가로 화면 전체 패드를 항상 쓴다. 첫 실행 안내도 가로 안내 하나만. 웹사이트·포털의 세로 지원은 그대로 둔다(기존 테스트로 확인).
- `[공통]` 혹시 세로로 열린 경우(큰 화면, 고정이 늦게 적용되는 첫 프레임)에는 "Turn your phone sideways" 안내를 띄우지 않고 가로 비율 그대로 그린다 — 안내 화면은 큰 화면 사용자를 막아 버리기 때문.
- Playwright 배치 기준(`tools/app-layout/`)에서 세로 스크린샷을 빼고, 가로 해상도를 늘린다: 844×390(일반), 932×430(큰 폰), 2400×1080 비율(긴 안드로이드), 노치·카메라 구멍이 왼쪽/오른쪽에 있는 두 경우.
- 서브에이전트: I1과 함께 진행(아래 I1 (a)가 웹 쪽 가로 전용을 맡는다).

#### Step A3. 실기기 점검 📱 ⏸ (Android 실기기 확보 시까지 보류)
- 사용자 체크리스트(결과를 이 문서 8절에 기록):
  1. 비행기 모드에서 첫 실행 → 메뉴·폰트·소리 정상
  2. 가로 고정: 폰을 세로로 들어도 가로 유지, 왼쪽↔오른쪽 가로 뒤집기(메뉴·경기 중)
  3. 첫 터치 후 타격음과 지연 체감
  4. **라켓 조작감이 웹(같은 폰의 Chrome, 옆으로 든 상태)과 비교해 같은지**: TOUCH SPEED, 가로 화면 전체 패드
  5. 랜덤 효과가 여러 번 나오는 CPU전 몇 판(웹판과 같은 경기 그대로)
  6. 홈으로 나갔다 복귀(경기 중·메뉴)
  7. 뒤로 가기(제스처·버튼)
  8. Android 16 기기라면 가장자리 표시와 예측형 뒤로 가기 애니메이션
- 서브에이전트: 피드백 항목이 서로 독립적이면 항목별로 병렬 처리한다(각자 worktree). 합친 뒤 **코드 리뷰 에이전트** 1개로 점검한다.
- 끝 조건: 사용자 확인. **빌드 1 내부 테스트 후보.**

### 빌드 1-iOS — 같은 FREE PLAY를 iPhone에서 (개정 3)

Android 실기기가 없는 동안 iOS로 같은 빌드 1을 병렬 진행한다. 웹 게임(`portal/app/`)은 Android와 같은 파일을 쓴다. 이 트랙의 실기기 결과는 공통 웹 코드(조작감·소리·복귀)에 대한 첫 실기기 판정이기도 하다.

#### Step I0. 준비 (사용자) 🔄
- 2026-11-25 확인: 사용자는 **이미 iOS 앱 4개를 출시한 Apple Developer Program 계정**이 있다 → 무료 Apple ID 경로는 쓰지 않는다. 빌드 1부터 **TestFlight 내부 테스트**로 설치한다(F1을 앞당김). 남은 준비: 번들 ID `com.yoyoyo.oddbirdle` 사용 가능 여부 확인·등록, App Store Connect에 앱 레코드 생성, CI 업로드용 **App Store Connect API 키**(Admin 또는 App Manager, `.p8`)를 GitHub 시크릿으로 등록.
- Mac에 최신 Xcode 설치(제출 시점에 Apple이 요구하는 최소 Xcode·iOS SDK 버전을 E단계 전에 다시 확인).
- 실기기 설치 방식 선택:
  - (가) **무료 Apple ID**: Xcode에서 자기 iPhone에 직접 설치. 7일마다 다시 설치해야 하고 TestFlight는 못 쓴다. 빌드 1 조작감 판정에는 충분.
  - (나) **Apple Developer Program**(연 $99): TestFlight 내부 테스트, CI 서명, App Store 출시에 필수. 출시 전에는 어차피 필요.
- iPhone: iOS 버전 확인, 설정 → 개인정보 보호 및 보안 → **개발자 모드** 켜기(Xcode로 설치할 때 필요).

#### Step I1. iOS 플랫폼 + 앱 동작의 iOS 분기 ✅ (Xcode 빌드는 I2에서 확인)
- 결과: `android-app/` → `mobile-app/`. `@capacitor/ios` 8.6.2(SPM), `mobile-app/ios/`. `MainViewController`: 상태바 숨김, 홈 인디케이터 자동 숨김, 위·아래 가장자리 제스처 지연, 가로만, 활성 중 화면 꺼짐 방지. Info.plist 가로만·iPhone 전용·iOS 15.0·암호화 false·사진 저장 문구. `PrivacyInfo.xcprivacy`. 오디오 세션 `.ambient`(AppDelegate). Debug 빌드에만 CI용 JS 실행 훅(`ODDBIRDLE_CI_EVAL`). `app-shell.js`: iOS는 뒤로 가기·앱 종료 없음, 소리는 `interrupted`에서도 복귀·터치 때 재개. 테스트 214개 통과.
- `[iOS]` `mobile-app/`에 `@capacitor/ios`(8.6.2 고정)를 더하고 `npx cap add ios` → `mobile-app/ios/`(폴더 이름 `android-app`은 두 플랫폼 공용이 되므로 `mobile-app/`으로 바꾸는 것을 이 단계에서 함께 한다). Capacitor 8 기본인 Swift Package Manager 사용(CocoaPods 없음).
- `[iOS]` 네이티브 설정(커스텀 `CAPBridgeViewController` 하위 클래스 + `Info.plist`):
  - 가로 전용: `UISupportedInterfaceOrientations` = LandscapeLeft·LandscapeRight만.
  - 상태바 숨김(`UIStatusBarHidden`, 뷰 컨트롤러 `prefersStatusBarHidden`).
  - **홈 인디케이터 자동 숨김**(`prefersHomeIndicatorAutoHidden`) + **화면 가장자리 시스템 제스처 지연**(`preferredScreenEdgesDeferringSystemGestures` = 아래쪽·위쪽): 가로 화면 전체가 패드이므로, 라켓을 움직이다 아래 가장자리를 쓸어 올리면 홈으로 나가 버리는 것을 막는다. 지연하면 첫 쓸어올림은 무시되고 두 번째에 홈으로 간다. **iOS 조작에서 가장 큰 위험 요소.**
  - 화면 꺼짐 방지: `UIApplication.shared.isIdleTimerDisabled = true`(포그라운드 동안).
  - `ios.contentInset: "never"` — 여백은 페이지의 `env(safe-area-inset-*)`가 처리(앱 빌드에 이미 `viewport-fit=cover` 있음). 가로에서는 노치·다이내믹 아일랜드가 왼쪽 또는 오른쪽에, 홈 인디케이터가 아래에 온다.
  - 스크롤 튕김 없음(Capacitor iOS 기본 `bounces = false`), 링크 미리보기 끔(`ios.allowsLinkPreview: false`).
  - 오디오 세션: 게임 효과음은 **무음 스위치를 따른다**(ambient: 무음 모드면 소리 없음, 다른 앱 음악과 섞임). WKWebView의 Web Audio 기본 동작과 같은지 실기기에서 확인.
  - 개인정보 매니페스트 `PrivacyInfo.xcprivacy`: 추적 없음, 수집 데이터 없음(빌드 1). B2에서 Preferences(UserDefaults)를 쓰면 필수 사유 API `NSPrivacyAccessedAPICategoryUserDefaults`(CA92.1)를 추가.
  - 수출 규정: `ITSAppUsesNonExemptEncryption = false`(HTTPS만 사용).
  - iPhone 전용(`TARGETED_DEVICE_FAMILY = 1`).
- `[공통]` `app-shell.js` 플랫폼 분기(`Capacitor.getPlatform()`):
  - iOS에는 시스템 뒤로 가기가 없다 → backButton 처리는 Android 전용. iOS에서 경기 중 일시정지는 **앱 전환(백그라운드)**과 화면의 기존 `←` 버튼(메뉴로)으로만. 경기 중 화면에 일시정지 버튼을 따로 둘지는 실기기 피드백으로 정한다.
  - `App.exitApp()`은 Android 전용(iOS 앱은 스스로 종료하면 안 된다). 메뉴의 "뒤로 = 종료"는 iOS에 없음.
  - 오디오: iOS는 전화·알림·Siri 뒤 AudioContext가 `interrupted` 상태가 된다. 포그라운드 복귀와 첫 터치에서 `running`이 아니면 다시 `resume()`(현재 `sound.wake()`가 `state !== 'running'`으로 처리 — 실기기에서 확인).
- 서브에이전트: **2개 병렬(worktree).**
  - (a) 웹 쪽: A2b 가로 전용 + `app-shell.js` iOS 분기 + 오디오 인터럽트 + 테스트 + 가로 배치 스크린샷.
  - (b) 네이티브 쪽: `mobile-app/` 이름 변경, `ios/` 추가와 위 네이티브 설정, Android 가로 고정(manifest), macOS CI 워크플로(I2).
- 끝 조건: 이 Linux 환경에서 가능한 범위(`cap sync ios`로 파일 생성, 설정 파일 검사, 웹 테스트)는 여기서, Xcode 빌드는 I2의 CI에서 확인.

#### Step I2. GitHub Actions(macOS) 시뮬레이터 빌드 + 실제 WKWebView 배치 스크린샷 🔄
- `.github/workflows/ios.yml`(macos-26) 작성 완료, 첫 실행 확인 중.
- 이 환경은 Linux라 Xcode가 없다. `.github/workflows/ios.yml`(macOS 러너):
  1. 웹 빌드 → `cap sync ios`
  2. `xcodebuild` 시뮬레이터용 빌드(서명 없음)
  3. 노치·다이내믹 아일랜드가 있는 iPhone 시뮬레이터를 가로로 부팅 → 앱 설치·실행 → `xcrun simctl io screenshot`으로 메뉴·경기 화면 캡처(왼쪽·오른쪽 가로)
  4. 스크린샷과 `.app`을 아티팩트로 업로드
- 이 스크린샷이 **실제 iOS WebView(WebKit)에서의 배치 확인**이다. Playwright(Chromium)는 iOS WebView가 아니므로 iOS 배치 판정은 이 단계로 한다.
- macOS 러너는 Linux보다 분 단위 비용이 크다(비공개 저장소는 무료 분량을 10배로 소모). iOS 관련 경로가 바뀔 때와 수동 실행에만 돌린다.
- 끝 조건: CI 통과, 스크린샷에서 노치·홈 인디케이터에 가려진 것이 없음.

#### Step I2b. [iOS] CI에서 서명·TestFlight 업로드 ⬜ (개정 3-1)
- 기존 계정이 있으므로 F1의 TestFlight 업로드를 빌드 1로 앞당긴다. Android의 "Actions에서 APK 받기"에 해당하는 iOS 경로다.
- `ios.yml`에 수동 실행(workflow_dispatch) 전용 잡 추가: App Store Connect API 키로 **자동 서명(`-allowProvisioningUpdates`) + Archive + 업로드**(`xcodebuild -exportArchive`의 `destination: upload` 또는 `xcrun altool`/`notarytool` 대신 App Store Connect API). 빌드 번호는 `github.run_number`.
- 시크릿: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`(base64), `APPLE_TEAM_ID`. 인증서·프로비저닝 파일을 저장소에 두지 않는다.
- 내부 테스트 그룹(같은 팀, 심사 없음)에 자동 배포. 수출 규정은 Info.plist의 `ITSAppUsesNonExemptEncryption=false`로 매 빌드 질문 없이 통과.
- 사용자 필요: 번들 ID 등록·앱 레코드 생성, API 키 발급·시크릿 등록.

#### Step I3. iPhone 실기기 점검 📱 ⬜
- 설치(개정 3-1): **TestFlight**가 기본. CI(I2b)가 서명·업로드하면 iPhone의 TestFlight 앱에서 바로 설치. CI 서명이 준비되기 전 첫 확인만 아래 Xcode 직접 설치로 한다.
- Xcode 직접 설치: 사용자 Mac에서 저장소를 받아 `npm ci` → `node scripts/build-portal.mjs app` → `mobile-app/`에서 `npx cap sync ios && npx cap open ios` → Xcode에서 Signing 팀 선택 → iPhone에 실행. (Developer Program이 있으면 이후 TestFlight로 대체, F1.)
- 체크리스트(A3과 같은 항목, iOS판):
  1. 비행기 모드 첫 실행 → 메뉴·폰트·소리
  2. 폰을 세로로 들어도 가로 유지, 왼쪽↔오른쪽 가로 뒤집기
  3. 첫 터치 후 타격음·지연, **무음 스위치 켠 상태/끈 상태**
  4. **라켓 조작감이 같은 iPhone의 Safari 웹판(옆으로 든 상태)과 같은지**: TOUCH SPEED, 화면 전체 패드
  5. **아래 가장자리 근처에서 라켓을 움직일 때 홈으로 튕겨 나가지 않는지**(제스처 지연), 왼쪽 가장자리 쓸기에 반응이 없는지
  6. 길게 누르기·두 번 탭에서 확대·선택·돋보기가 뜨지 않는지
  7. 홈으로 나갔다 복귀, 제어 센터·알림 센터 내렸다 올리기, 전화·알람 뒤 소리 복구
  8. 랜덤 효과가 여러 번 나오는 CPU전 몇 판, ProMotion(120Hz) 기종이면 프레임 체감
- 서브에이전트: 피드백 항목별 병렬 + 코드 리뷰 1(A3과 같은 방식).
- 끝 조건: 사용자 확인. 공통 웹 코드의 조작감 판정이 여기서 먼저 나오면, Android 실기기 전이라도 빌드 2(B1 엔진 이식)를 시작한다.

### 빌드 2 — STAGES(기기 저장) + 결과 카드 공유

#### Step B1. 엔진 기능 이식 (reddit → 기준 소스) ✅ (2026-11-26, Mac 세션, 브랜치 `app-b1-engine`)
- 결과: 5개 기능을 하나씩이 아니라 `game.js` 3-way 병합(충돌 26곳 수작업 해결)으로 한 번에 이식했다. 사이트 쪽 폭탄 효과·스윕 접촉·온라인 셔틀콕 자세는 유지하고 reddit의 `rules.bomb`(Bomb Rally)와 공존한다. 테스트 238개 통과(stage-rules·doubles 포함), `tools/stage-difficulty.mjs` 같은 시드 결과가 reddit판과 오차 범위. `client.js`는 아직 합치지 않았다(B2에서 화면과 함께).
- 아래 순서대로 가져온다. 각 기능은 `reddit` 브랜치의 해당 테스트를 함께 가져와 통과시킨 뒤 커밋한다.
  1. 규칙 엔진(`createGame({ rules })`, `restart(..., rules)`) + `stage-rules.test.js`
  2. 3터치 규칙, NET CORD(기준 소스에 없을 때)
  3. 복식 + `doubles.test.js`
  4. 더블 셔틀콕(Twin Shuttles)
  5. `Bomb Rally` 규칙 폭탄
- 폭탄은 다른 효과와 똑같이 다룬다. 랜덤 효과로서의 폭탄은 기존 효과 테스트에, `Bomb Rally`는 다른 스테이지와 같이 스테이지 규칙 테스트에 들어간다. 폭탄만을 위한 별도 단계·전용 모드는 만들지 않는다.
- 매 기능을 이식한 뒤 기준 소스의 기존 테스트와 웹·포털 빌드도 계속 통과해야 한다. 공개 웹·포털 동작이 바뀌면 안 된다.
- 서브에이전트: **사용 안 함(순차).** 모두 `game.js` 한 파일에 몰려 있어 병렬로 하면 충돌만 늘어난다. 이식이 끝난 뒤 **코드 리뷰 에이전트** 1개로 회귀를 점검한다.
- 끝 조건: 이식한 테스트와 기존 테스트가 모두 통과하고, `tools/stage-difficulty.mjs`로 측정한 결과가 reddit판과 비슷한 범위에 든다.

#### Step B2. STAGES 화면 + 기기 저장 ✅ (2026-11-26, Mac 세션, `app-b1-engine`; Android 실기기 점검은 폰 연결 후)
- 결과: `client.js`·`index.html`·`crowd.js`·`stands.js`·소리 파일을 reddit과 3-way 병합(앱 터치 조작은 앱 쪽 유지). 스테이지 목록은 앱에서 `features.stages`일 때만 열린다(앱 빌드 기본값 `stages`). 저장은 `app-storage.js`(Capacitor Preferences, 브라우저는 localStorage)로 클리어 목록과 터치 감도를 기기에만 보관, 서버·계정 없음. iOS 개인정보 매니페스트에 UserDefaults 사유 CA92.1 추가. iOS 시뮬레이터에서 스테이지 목록·카드 슬라이드·1판 시작을 확인했다. Reddit 전용 데일리·카드 게시 코드는 들어왔지만 앱에서는 동작하지 않는다(B3·D에서 다룸).

- 스테이지 목록·안내·✓·숨김 21 UI를 가져와 `STAGES` 기능 스위치 아래에 둔다(Reddit 전용 부분은 제외).
- 저장 어댑터 `app-storage.js`:
  - 앱에서는 Capacitor Preferences, 브라우저 미리보기에서는 localStorage를 쓴다.
  - 저장 대상은 클리어 목록과 터치 감도다.
  - 서버 동기화는 없다. `stage-progress.js`의 `guest` 키 구조 대신 기기 하나에 기록 하나만 둔다.
- 📱 실기기 확인: 강제 종료 후, 앱 업데이트(같은 서명의 새 APK를 덮어 설치) 후 기록과 터치 감도가 유지되는지.
- `[iOS]` Preferences는 UserDefaults에 저장된다(앱 삭제 전까지 유지). iOS WKWebView의 localStorage는 저장 공간 압박 때 지워질 수 있으므로 앱에서는 localStorage를 기록 저장소로 쓰지 않는다. 개인정보 매니페스트에 UserDefaults 사유 추가. Xcode로 다시 설치·TestFlight 새 빌드 설치 후 유지 확인.
- 서브에이전트: B3과 **병렬 2개.** (a) 스테이지 UI + 저장 어댑터, (b) 결과 카드 공유.

#### Step B3. 결과 카드 공유 ✅ (코드·자동 테스트, 2026-11-26, Mac 세션; 📱 실기기 확인 남음)
- 결과: 앱에서는 결과 화면(랜덤 대결과 보스 클리어)에 SHARE CARD 버튼이 뜬다. `app-share.js`가 카드를 PNG로 앱 캐시 폴더(`@capacitor/filesystem`)에 쓰고 `@capacitor/share`로 이미지와 문구("FULL-TIME 3:1 vs CPU Lv.5 ...")를 시스템 공유 시트에 넘긴다. 시트를 그냥 닫으면 실패로 보지 않고, 플러그인이 없는 브라우저 미리보기에서는 PNG를 내려받는다. 링크는 문구에 넣지 않았다(스토어 주소가 생기면 추가). `NSPhotoLibraryAddUsageDescription`은 Info.plist에 이미 있다. 자동 테스트: `tests/app-share.test.js`, `tests/app-card-share.test.js`(실제 client.js로 한 판을 끝내고 버튼 → 쓰기 → 공유 호출까지).
- 남은 것: 실제 기기에서 메신저·사진 저장·Reddit 앱으로 이미지와 문구가 어떻게 전달되는지, 가로 화면에서 공유 시트가 가려지지 않는지.

- `card.js`로 카드 이미지를 만든다.
- 앱 캐시 폴더에 PNG로 저장한 뒤 `@capacitor/share`로 이미지와 문구를 공유한다. 브라우저 미리보기에서는 다운로드한다.
- 📱 실기기 확인: 메신저, 갤러리 저장, Reddit 앱 등 실제 공유 대상에 이미지와 문구가 어떻게 전달되는지.
- `[iOS]` 공유 시트에서 "이미지 저장"은 사진 보관함 쓰기 권한 문구(`NSPhotoLibraryAddUsageDescription`)가 Info.plist에 없으면 앱이 종료된다 → 문구를 넣는다. 카드 PNG는 앱 캐시 파일 URL로 넘긴다(두 플랫폼 공통, `@capacitor/filesystem` 필요 여부를 이때 정함). 가로 화면에서 공유 시트가 가려지지 않는지 확인.
- 끝 조건: 사용자 확인. **빌드 2 내부 테스트 후보.**

### 빌드 3 — ONLINE (방 코드 → QUICK MATCH)

#### Step C1. 방 코드 ✅ (코드·서버 배포·시뮬레이터 확인, 2026-11-26, Mac 세션; 📱 실기기 조합은 남음)
- 결과: 앱의 접속 출처는 Android `https://app.oddbirdle`, iOS `capacitor://app.oddbirdle`(capacitor.config.json의 server.hostname). `origins.js`가 정확히 이 둘만 `app`으로 허용하고(없는 도메인이라 웹사이트가 흉내 낼 수 없음) 재대결 준비 확인 대상에 넣는다. 실제 서버(`oddbridge-matchmaker`)에 배포했고, 실서버에 두 출처로 방을 만들 수 있고 다른 출처는 404로 막히는 것을 확인했다. 앱은 서버 주소가 https이면 항상 wss로 접속한다(앱 페이지의 scheme이 capacitor://라서 예전 코드는 ws로 접속하려 했다). 앱 빌드 기본 기능은 `stages,online`. 시험 빌드는 `--server=https://<preview>/`로 미리보기 사이트를 가리킬 수 있다. iOS 시뮬레이터 앱 ↔ 미리보기 웹: 방 코드로 대전 시작, QUICK MATCH 대기열 진입까지 확인. 연결 막대는 앱에서 온라인 대전 중에만 보인다.
- 연결 상태 규칙(2026-11-26 확정·배포, 사이트와 앱 공통): **서버는 방에서 20초(확인 간격 5초) 동안 아무 메시지도 안 보낸 사람을 나간 것으로 본다.** 살아 있는 클라이언트는 초당 수십 번 보내므로, 앱이 백그라운드로 가거나 화면이 잠기거나 탭이 숨겨지면 해당한다. 남은 사람에게는 `left`가 가고 화면에 OPPONENT LEFT가 뜬다(퀵매치는 CPU 게임과 대기열로 돌아감). 나간 사람이 돌아오면 "You were away too long."을 보고 메뉴로 간다. 연결이 끊기면 CONNECTION LOST가 뜬다. 끝난 경기(재대결 대기)나 상대를 기다리는 방은 대상이 아니다.
- 퀵매치 거리 규칙(배포됨, JOIN/CREATE에는 적용 안 함): Cloudflare가 아는 접속 위치로 거리를 재서, 대기 시작은 반경 1,500km, 기다릴수록 초당 150km씩 넓어져 최대 5,000km에서 멈춘다(서울 기준 도쿄·상하이·싱가포르는 되고 미국·유럽은 안 됨). 가장 오래 기다린 사람부터 가장 가까운 상대와 짝짓는다. 위치를 모르면 누구와도 맺는다(위치 정보 문제로 아예 못 하는 일은 없게). 확인: 접속 위치는 `functions/play.js`가 Cloudflare의 값을 `x-geo` 헤더로 넘기며 클라이언트가 보낼 수 없다. 실서버에서 `queued` 응답의 `located`가 true로 확인됨.
- 배포 메모: 실행 중인 Durable Object는 연결이 있는 동안 옛 코드를 쓴다. 한 번에 모두에게 적용해야 할 때는 `worker.js`의 로비 이름을 바꾼다(지금은 `lobby-2`).

- 실기기 앱 WebView가 실제로 보내는 `Origin` 값을 서버 로그(`rejected websocket origin`)에서 확인한다. 그 값만 `origins.js`에 `app` 출처로 추가한다. 예상: Android `https://app.oddbirdle`, iOS `capacitor://app.oddbirdle`(비https라 `appOrigins` 정확 일치 목록으로). 재경기 준비 규칙(`requiresRematchReady`)을 앱에 적용할지도 정한다.
- 매치메이커 배포는 사용자 확인 후 진행한다. 먼저 preview 매치메이커에서 시험한다.
- 📱 실기기 조합: 앱↔앱, 앱↔현재 웹, 앱↔구버전 포털(itch·Y8·GamePix 제출본). 입장 → 경기(랜덤 효과·3터치 포함) → 재경기까지 시험한다.
- 연결 상태 규칙을 문서에 명시하고 구현한다.
  - 화면 잠금이나 백그라운드 전환 시 대기열·경기 처리
  - Wi-Fi↔모바일 데이터 전환 시 재접속 또는 몰수 처리
  - `[iOS]` iOS는 앱이 백그라운드로 가면 몇 초 안에 JS와 WebSocket이 멈춘다(Android보다 빠르고 확실함). 온라인 경기 중 홈으로 나가면 연결이 끊긴다는 전제로 규칙을 정한다: 상대에게 어떻게 보일지(일정 시간 뒤 몰수), 복귀했을 때 앱이 보여 줄 화면.
- 📱 실기기 조합에 iOS 앱을 더한다: iOS↔Android, iOS↔웹.
- 서브에이전트: 사용 안 함(서버·클라이언트 프로토콜을 한 맥락에서 다룸).

#### Step C2. QUICK MATCH ✅ (코드, 2026-11-26) — 앱은 이미 같은 대기열을 쓴다. 📱 실기기 앱↔앱, 앱↔웹 짝짓기 확인은 남음

- 방 코드에서 문제가 없으면 QUICK MATCH 대기열에 앱을 포함한다. 섞인 매칭(앱↔웹·포털)을 같은 방식으로 시험한다.
- 끝 조건: 사용자 확인. **빌드 3 내부 테스트 후보.**

### 빌드 4 — DAILY (서버 ID + 랭킹)

#### Step D1. 데이터 계약과 삭제 흐름 설계 ⬜ (사용자 결정 필요)
- `docs/APP-API.md`에 아래 내용을 확정한다.
  - **사용자·날짜당 클리어 기록은 한 건.**
  - **같은 종료 요청을 다시 보내면 같은 결과를 돌려준다(멱등).** 시도 토큰을 지우지 않고 "사용됨 + 결과"로 남긴다.
  - **시도 횟수 증가는 시작 요청 하나의 원자적 처리로 한다.**
  - **순위 발급과 기록 저장은 한 트랜잭션(D1 batch)으로 한다.**
  - 날짜는 UTC로 바뀌고, 토큰에 날짜를 박아 둔다.
- 계정 성격 판단과 삭제 경로:
  - 서버 ID + 자동 별칭이 Google Play의 "계정 생성"에 해당하는지 판단한다. `[iOS]` App Store 심사 지침 5.1.1(v)도 같은 질문(계정을 만들 수 있으면 **앱 안에서** 삭제를 시작할 수 있어야 함)이므로 두 스토어 기준을 한 번에 충족하도록 설계한다.
  - 해당한다면 앱 안 삭제(설정 → Delete my data → `DELETE /api/me`)와 **앱을 지운 뒤에도 쓸 수 있는 웹 삭제 요청 경로**가 모두 필요하다.
  - 기기 토큰만 있는 구조에서 웹 요청자가 본인임을 확인하는 방법을 정한다. 후보:
    - 앱에서 보여 주는 **삭제 코드**(복구·삭제 겸용 코드)를 사용자가 적어 두게 하기
    - 웹 요청 시 별칭 + 클리어 날짜를 대조하고 일정 기간 뒤 삭제하기
  - → 사용자와 결정한다.
- 서브에이전트: 사용 안 함(설계).

#### Step D2. 앱 API Worker + D1 ⬜
- `app-server/`: 규칙은 `daily-plan.js`를 그대로 import해 재사용한다. 저장은 D1용으로 새로 설계한다(Devvit 코드를 그대로 옮기지 않는다).
- 테스트 계층:
  1. 순수 로직 단위 테스트
  2. **로컬 D1(`wrangler dev --local`/Miniflare)에서 동시 시작, 중복 종료, 응답 유실 뒤 재시도, UTC 0시 전환**
- 운영 메모: 첫 버전의 순위는 클라이언트가 보고한 승패에 기반한다. 서버 시간 측정과 최소 시간 검사만 막는다. 리더보드에 "검증 수준"을 과장하지 않는다.
- 서브에이전트: D3과 **병렬 2개**. 서버(`app-server/`) / 앱 DAILY 화면·통신 어댑터. 1번의 계약 문서가 확정된 뒤에 시작한다.

#### Step D3. 앱 DAILY 화면 ⬜
- `createDailyClient({ request })`에 앱 API 주소와 토큰을 붙이는 어댑터를 넣는다. 오프라인이면 "Offline" 안내를 띄운다. DAILY를 처음 열 때만 서버 ID를 발급한다.
- 데이터 삭제 화면 흐름(앱 안 + 웹 경로)을 구현한다.
- 끝 조건: 로컬 서버 + Playwright로 시작 → 클리어 → 순위 → 재시작 거절을 확인하고, 실기기에서도 확인한다. Worker·D1 배포는 사용자가 승인한다.

### 출시

#### Step E1. 내부 테스트 (빌드 1부터 매번) ⬜
- 첫 Play 업로드 전에 **패키지 이름 확정**과 **Play App Signing 등록**을 한다. CI는 **업로드 키**로만 서명하고, 키는 GitHub 시크릿에 둔다.
- 워크플로에 `bundleRelease`(AAB)를 추가한다. 네이티브 라이브러리가 들어가면 **16KB 페이지 크기 호환성**을 검사한다(`zipalign -c -P 16`, 또는 APK Analyzer 결과 확인).
- 완료 조건: 내부 테스트 트랙에 업로드하고 테스터 설치를 확인한다.

#### Step E2. 비공개 테스트 → 공개 출시 ⬜
- **먼저 확인할 것:** 기존 Play Console 계정을 쓸 수 있는지, 계정 종류(개인/조직), 생성일. 2023-11-13 이후 만든 개인 계정이면 **12명 이상이 14일 연속 참여한 비공개 테스트**를 마쳐야 프로덕션 접근을 신청할 수 있다.
- 스토어 자료:
  - 설명(영/한)
  - 개인정보처리방침
  - 데이터 보안 양식
  - 콘텐츠 등급
  - 스크린샷: Playwright로 초안 → **최종본은 실기기 캡처**
- 서브에이전트: **2개 병렬.** 스토어 문구·정책 초안 / 스크린샷 초안.
- 완료 조건(별도): 비공개 테스트 요건 충족 → 프로덕션 신청 → 공개.

#### Step F1. [iOS] TestFlight 내부 테스트 ⬜
- 전제(개정 3-1: 계정은 이미 있음, 업로드 자동화는 I2b로 앞당김): Apple Developer Program 가입, 번들 ID `com.yoyoyo.oddbirdle`(Android 패키지 이름과 함께 확정) 등록, App Store Connect에 앱 생성.
- 서명: 처음엔 사용자 Mac의 Xcode 자동 서명으로 Archive → 업로드. CI 업로드는 App Store Connect API 키(GitHub 시크릿)로 나중에 붙인다.
- 내부 테스터(같은 팀, 최대 100명)는 심사 없이 바로 설치. 외부 테스터는 베타 앱 심사가 필요.
- Android와 달리 **12명·14일 비공개 테스트 같은 출시 전 의무 요건은 없다.**

#### Step F2. [iOS] App Store 출시 ⬜
- 제출 직전에 확인: Apple이 요구하는 최소 Xcode·SDK 버전, 연령 등급 설문, App Privacy(개인정보 "영양 성분표") 답안, 수출 규정 답(F1에서 Info.plist로 처리).
- 심사 지침 4.2(최소 기능): 웹을 감싼 앱으로 보이면 거절될 수 있다. 게임 전체가 앱 안에 있고 오프라인으로 돌아가므로 위험은 낮지만, 1.0 제출은 STAGES가 들어간 빌드(빌드 2 이후)로 한다.
- 스크린샷: 가로 iPhone 크기(6.9인치 등 App Store Connect가 요구하는 크기). I2의 시뮬레이터 캡처로 초안, 최종본은 실기기.
- 서브에이전트: E2와 같은 2개 병렬(문구·정책 / 스크린샷)을 두 스토어 공용으로 한 번에.

## 5. 서브에이전트 사용 요약

| 단계 | 사용 | 나누는 방식 |
|---|---|---|
| A0 기준 확정 | 아니요 | — |
| A1 | **예 (2개 병렬, worktree)** | 앱 빌드·앱 동작(클라이언트) / Capacitor·아이콘·CI(`mobile-app/`, `.github/`) |
| A3, 이후 실기기 피드백 | **예 (항목별 병렬 + 리뷰 1)** | 독립 항목별로 나누고, 끝에 코드 리뷰 |
| I1 (+A2b) | **예 (2개 병렬, worktree)** | 웹 쪽(가로 전용·iOS 분기·오디오) / 네이티브(`mobile-app/` 이름 변경·`ios/`·Android 가로 고정·macOS CI) |
| I2b | 아니요 | 시크릿·서명은 한 맥락에서 |
| I3, 이후 iOS 실기기 피드백 | **예 (항목별 병렬 + 리뷰 1)** | A3과 같음 |
| B1 엔진 이식 | 아니요(순차) + 리뷰 1 | `game.js` 집중이라 병렬 이득 없음 |
| B2 + B3 | **예 (2개 병렬)** | 스테이지 UI·저장 / 카드 공유 |
| C1·C2 | 아니요 | 프로토콜 한 맥락 |
| D2 + D3 | **예 (2개 병렬)** | 서버 / 앱 DAILY 화면. 계약 문서가 먼저 |
| E2 + F2 | **예 (2개 병렬)** | 두 스토어 공용 문구·정책 / 스크린샷 |

Mac 세션 분업 (2026-11-25, 사용자 지시):
- 실기기 피드백 중 **작은 수정**(문구·수치·CSS 한두 줄, 설정값)은 클라우드 세션이 Mac의 "Oddbirdle Code" 세션에 **한 건씩** 전달하고, 그 세션이 고친 뒤 바로 iPhone에 다시 설치해 확인한다.
- Mac 세션은 `../odd_birdle-app` worktree에서 작업 브랜치 `claude/stoic-bardeen-0t1rdr`에 커밋·푸시하고 결과를 클라우드 세션에 알린다. 클라우드 세션은 작업 전 항상 `git pull`로 받는다.
- 여러 파일에 걸친 수정, 엔진·빌드 구조 변경, CI 수정은 클라우드 세션이 직접 한다.

규칙:
- 에이전트 결과는 내가 diff를 직접 읽고 전체 테스트를 돌린 뒤에만 합친다.
- 공유 파일(`client.js`, `index.html`, `game.js`)은 한 번에 한 에이전트만 고친다.

## 6. 사용자가 직접 해야 하는 일

- **A0:** 공개 웹판 소스 푸시, 또는 이 환경의 `oddbirdle.pages.dev` 접근 허용
- **A2:** 저장소 Actions 사용 허용 확인
- **A3·B2·B3·C1·D3:** 실기기 점검(📱)과 결과 공유. Android 16 기기가 있으면 그 기기로
- **C1:** 매치메이커 출처 추가 배포 승인
- **D1:** 삭제 경로의 본인 확인 방식 결정 / **D3:** Worker·D1 배포 승인
- **E1·E2:** Play Console 계정 확인(종류·생성일), 패키지 이름 확정, 업로드 키 생성·보관, 비공개 테스터 12명 모집
- **I0·I2b·I3:** (Developer Program 계정 있음) 번들 ID 등록·App Store Connect 앱 레코드 생성, App Store Connect API 키 발급 → GitHub 시크릿 등록, iPhone TestFlight로 설치·점검. CI 서명 전 첫 확인만 필요하면 Mac Xcode로 직접 설치
- **F1·F2:** Apple Developer Program 가입($99/년), App Store Connect 앱 생성, Archive 업로드

## 7. 위험과 대응

| 위험 | 대응 |
|---|---|
| 공개판 소스가 저장소에 없음 | A0에서 가장 먼저 해결. 해결 전에는 A1 이후를 시작하지 않음 |
| WebView 조작감이 웹보다 나쁨 | 빌드 1에서 서버와 분리해 확인. 입력 이벤트·프레임 측정(`frame-meter.js`)으로 원인 분리 |
| 기능 이식 중 웹·포털 회귀 | 기능마다 기존 테스트 + 포털 빌드 통과, Playwright 배치 비교 |
| 기기 저장만으로는 재설치 시 기록 유실 | 1.0에서 감수. 동기화는 복구 수단(코드·로그인)과 함께 설계 |
| 데일리 순위 조작 | 서버 시간·최소 시간·멱등 계약까지만. 완전 방지는 범위 밖임을 명시 |
| 구버전 포털과 온라인 호환 | 프로토콜 불변, 출처 추가만. 섞인 조합을 실기기로 시험 |
| Android 실기기 없음 | iOS 트랙을 병렬로 진행하고, 공통 웹 코드의 실기기 판정은 iOS로 먼저 받는다. Android 고유 항목(뒤로 가기·몰입형·Android 16)은 A3 보류 |
| [iOS] 가로 화면 패드에서 아래 가장자리 쓸기로 홈 이탈 | 가장자리 제스처 지연 + 홈 인디케이터 숨김(I1), 실기기 판정(I3 5번). 그래도 잦으면 패드 아래쪽 여백을 늘림 |
| [iOS] 이 환경에서 Xcode 빌드 불가 | macOS CI로 빌드·시뮬레이터 스크린샷, 실기기 설치는 사용자 Mac |
| [iOS] 무음 스위치·인터럽트 뒤 소리 안 남 | 오디오 세션 정책 고정, 복귀·첫 터치에서 재개(I1), 실기기 판정(I3) |
| [Android 16] 큰 화면에서 가로 고정이 무시됨 | 세로로 길어도 가로 비율로 그려지게(A2b). 안내 화면으로 막지 않음 |

## 8. 진행 기록

- 2026-11-26: Mac 세션의 `ios-app-ui`(30fcdab)를 작업 브랜치에 병합. 앱 ID `com.yoyoyo.oddbirdle`로 변경, iOS 전체 화면 UI·제스처 차단·ProMotion·감도 스테퍼, Android 릴리스 서명(키는 Mac `~/.oddbirdle-keys/`, 저장소 밖). Play 비공개 테스트 AAB(1.0, versionCode 1)는 Mac에서 빌드해 사용자가 업로드. 릴리스 AAB는 당분간 Mac에서 빌드(CI 서명은 키 시크릿 등록 시). iOS는 Apple에 `com.yoyoyo.oddbirdle` App ID·앱 레코드가 필요(먼저 등록한 `com.oddbirdle.app`은 사용 안 함). 테스트 215개 통과.
- 2026-11-26: Android 비공개 테스트 시작(14일 → 12/10). 일정표 3-1절 추가(개정 4). iOS 시뮬레이터 CI 성공, TestFlight 업로드는 App Store Connect API 인증 401로 실패.
- 2026-11-25: A2b·I1 완료(서브에이전트 2개 병렬: 웹 쪽 / 네이티브·CI). iOS는 Linux에서 프로젝트 생성까지, 컴파일은 macOS CI 첫 실행이 처음.
- 2026-11-25: 개정 3-1. 사용자에게 iOS 앱 4개를 출시한 개발자 계정이 있음 → 무료 Apple ID 경로 삭제, TestFlight 업로드를 빌드 1로 앞당김(I2b).
- 2026-11-25: 개정 3. Android 실기기가 없어 iOS 트랙(I0~I3, F1~F2)을 병렬로 추가. 두 플랫폼 모두 가로 전용으로 결정(A2b). 문서 이름을 `PLAN-mobile-app.md`로 바꿈.
- 2026-11-24: 계획서 작성(`c7a0165`).
- 2026-11-24: 개정 1. 검토 의견을 반영해 순서를 "실기기 우선 → 기능 이식 → 서버"로 바꿈.
- 2026-11-24: A1 완료(서브에이전트 2개 병렬: 웹 쪽 / 안드로이드·CI). 로컬 디버그 APK 빌드 성공.
- 2026-11-24: A0 완료. 기준 = `375a7bf`(공개판과 동일). 이 저장소 전용 환경에서 `oddbirdle.pages.dev`, `dl.google.com` 접근 허용 → Android SDK를 받아 로컬에서도 APK 빌드 확인 가능.
- 2026-11-24: 개정 2. 사용자 의견: 폭탄만 따로 떼어 다루지 않는다. 첫 빌드는 폭탄전이 아니라 지금의 웹판 FREE PLAY 그대로이고, 개발용 폭탄 전용 진입점과 폭탄 전용 검증 항목을 뺐다.

- 2026-11-26: B1 완료(위 단계 참고). 다음은 B2: `client.js`의 스테이지·복식·폭탄 표시와 저장 어댑터.

## 9. 개정 1에서 반영한 검토 의견

받아들인 것(사실 확인 결과 포함):
- **APK 먼저, 실기기 판정**: 반영(빌드 1). Playwright는 배치 회귀 검사용.
- **전체 병합 대신 기준 확정 + 기능별 이식**: 반영. 충돌 6개 파일은 시험 병합으로 확인했다. `c8323a8`에 폭탄이 없는 것도 확인했다. 다만 공개판의 랜덤 폭탄은 푸시된 어느 브랜치에도 없어 A0을 새로 추가했다.
- ~~랜덤 폭탄과 Bomb Rally 각각 검증~~: 개정 2에서 철회. 폭탄은 다른 효과·스테이지와 같은 방식으로 기존 테스트 체계 안에서 다룬다.
- **STAGES는 기기 저장(Preferences)**: 반영. `guest` 기록이 서버 ID로 옮겨지지 않는 것을 코드에서 확인했다.
- **D1 원자성·멱등 계약, 로컬 D1 검증**: 반영. 기존 코드가 원자적이지 않고 토큰을 먼저 소비하는 것을 확인했다.
- **방 코드 먼저, 정확한 Origin만 허용, 섞인 조합 시험, 연결 전환 규칙**: 반영(빌드 3).
- **자동 별칭, 랭킹 처음 쓸 때 ID 발급, 삭제 화면·웹 경로**: 반영(D1). 본인 확인 방식은 사용자 결정 항목으로 남긴다.
- **`targetSdk 36`, 버전 고정, 16KB, 계정 요건, App Signing, 실기기 스크린샷**: 반영. npm에서 Capacitor 8.x를 확인했다.

조정한 것:
- 엔진 기능 이식(B1)은 서브에이전트 병렬이 아니라 **순차**로 한다. 규칙 엔진·복식·더블 셔틀콕이 모두 `game.js`의 같은 흐름에 얽혀 있어서, 기능 단위로 나눠도 동시에 작업하면 충돌만 는다. 규칙 엔진을 먼저 옮기고 나머지를 그 위에 얹는다.
- 빌드 순서는 1(FREE PLAY) → 2(STAGES+공유) → 3(ONLINE) → 4(DAILY)로 정했다. 온라인을 데일리보다 앞에 둔 이유는 기존 서버를 재사용해서 새 서버 작업이 필요 없고, 웹 플레이어와 섞이는 문제를 일찍 드러내기 때문이다.

받아들이지 않은 것: 없음. 공개판 폭탄의 출처만 사실과 달라(저장소에 없음) 선행 단계로 바꿨다.

## 10. 개정 3: iOS 분석 (Android 계획 대비 바뀌는 점)

| 영역 | Android 계획 | iOS에서 다른 점 | 계획 반영 |
|---|---|---|---|
| 빌드 환경 | 이 Linux 환경에서 Gradle 빌드 가능 | Xcode(macOS) 필요. 이 환경에서는 불가 | I2 macOS CI, I3 사용자 Mac |
| 실기기 설치 | APK 파일을 보내 설치 | 파일로 설치 불가. Xcode 직접 설치(무료 Apple ID, 7일) 또는 TestFlight(유료 계정) | I0 선택, F1 |
| WebView | Chromium 기반 Android WebView | WKWebView(Safari와 같은 WebKit). 조작감 비교 기준은 같은 iPhone의 Safari | I3 4번 |
| Origin | `https://app.oddbirdle` | `capacitor://app.oddbirdle`(https 스킴 사용 불가) | 3절, C1 |
| 뒤로 가기 | 시스템 뒤로 가기 → 일시정지·메뉴·종료 | 시스템 뒤로 가기 없음, 앱 스스로 종료 금지 | I1 `app-shell.js` 분기 |
| 화면 가장자리 | Android 16 edge-to-edge, 몰입형 | 노치·다이내믹 아일랜드(가로에서 좌우), 홈 인디케이터(아래). 아래쪽 쓸기 = 홈 이탈 | I1 제스처 지연·인디케이터 숨김 |
| 소리 | 첫 터치로 잠금 해제 | + 무음 스위치, 전화·알람 뒤 `interrupted` 상태 | I1 오디오 세션·재개 |
| 백그라운드 | 일시정지, 연결 유지는 기기마다 다름 | 몇 초 안에 JS·WebSocket 정지 | C1 연결 규칙 |
| 저장 | Preferences(SharedPreferences) | Preferences(UserDefaults) + 개인정보 매니페스트 사유. localStorage는 지워질 수 있음 | B2 |
| 공유 | 공유 시트 | + 사진 저장 권한 문구 없으면 종료 | B3 |
| 화면 방향 | (개정 3) 가로 전용, Android 16 큰 화면은 고정 무시 | Info.plist로 가로만, iPhone 전용이라 고정이 지켜짐 | A2b, I1 |
| 심사·출시 | 12명·14일 비공개 테스트(신규 개인 계정), Play App Signing | 그런 의무 테스트 없음. 4.2 최소 기능, 5.1.1(v) 앱 안 계정 삭제, 개인정보 매니페스트, 수출 규정, 연령 등급 | F1·F2, D1 |
| 비용 | Play 등록 $25(1회) | Developer Program $99/년, macOS CI 분 비용 | I0, I2 |

그대로 두는 것: 웹 게임 코드와 `app` 빌드(두 플랫폼 공용 `portal/app/`), 기능 스위치, 빌드 순서 1→2→3→4, 서버 설계(D 단계), 서브에이전트 원칙.

가로 전용으로 바뀌어 없어지는 것: 앱의 세로 엄지 패드, 세로 메뉴 배치, 세로 배치 스크린샷 기준, A3의 "세로↔가로 회전" 항목(→ 가로 고정 확인으로 바뀜).

## 11. 아이디어: 라켓 상점 (2026-11-26, 미확정 · 1.0 이후)

사용자 아이디어:
- **라켓 모양을 다양하게 하고, 히트박스도 그 모양 그대로.**
- **게임 화폐:** 현금으로 살 수 있고, DAILY 1·2·3등 상금으로도 받음(기준은 나중에 정함).
- **상점:** 미리 만든 라켓 목록에서 매일 몇 개씩 바꿔 판매. 목록은 아이디어가 생길 때마다 채움.

확인한 사실:
- 지금 엔진의 라켓은 반지름 22의 원(`game.js` `racketRadius`)이다. 셔틀콕은 이미 윤곽선(`rings`)으로 맞는다(`brand-shuttles.js`, `outlineContact`). 같은 방식을 라켓에 쓰면 "모양대로 맞는 라켓"을 만들 수 있다.
- 라켓 목록은 `stages.js`·`brand-shuttles.js`처럼 데이터 파일 하나에 모양·이름·가격을 적는 형태로 만들면 된다. 하루 판매 목록은 `daily-plan.js`처럼 날짜 시드로 정하면 오프라인에서도 같은 목록이 나온다.

사용자 결정 (2026-11-26):
- **공정성:** 넓이를 똑같이 맞추는 식의 제한은 두지 않는다(재미가 먼저). 대신 **라켓을 하나 만들 때마다 기본 라켓과 밸런스를 비교**한다 → 라켓 추가 절차에 "비교 측정" 단계를 넣는다(예: `tools/stage-difficulty.mjs`처럼 CPU 대 CPU 여러 판의 득점·랠리 비교 + 사용자의 손맛 확인).
- **상금·조작:** 나중에 따로 논의한다. 서버 검증 강화, 상금 기준(1·2·3등을 무엇으로 정할지), "깬 순서" 순위 재검토가 논의 목록이다.
- **계정:** 어차피 추가할 예정이므로 구현 목록에 넣는다(Apple로 로그인 / Google Play 게임즈 + 서버 지갑 + 앱 안 계정 삭제).
- **결제:** Apple 인앱 결제·Google Play 결제로만 구현한다(문제없음).
- **화폐 버는 길:** 작은 보상(스테이지 첫 클리어, DAILY 클리어 등)을 두는 방향은 좋음. 기준은 나중에 논의.
- **시점:** 이 계획서의 구현(빌드 1~4, 출시)이 모두 끝나면 **바로 라켓 상점을 구현**한다. Reddit 해커톤 결과 발표보다 먼저 끝나면 그 전에 상점까지 넣어 내고, 늦어지면 앱을 먼저 낸 뒤 상점을 업데이트로 낸다.

구현 목록(상점 단계, 순서는 그때 확정):
1. 엔진: 모양 라켓(윤곽선 히트박스, 셔틀콕 `outlineContact` 재사용) + 라켓 데이터 파일(모양·이름·가격·출시일).
2. 라켓 추가 절차: 모양 그리기 → 밸런스 비교 측정 → 손맛 확인 → 목록에 추가.
3. 날짜 시드 일일 상점(오늘 파는 라켓 몇 개).
4. 계정 + 서버 지갑(화폐·보유 라켓) + 복구 + 앱 안 계정 삭제.
5. 인앱 결제(소모성 화폐 상품) 양 플랫폼.
6. 보상 규칙(DAILY 상금·작은 보상) — 논의 후.
7. 서버 검증 강화 — 논의 후.

논의 당시 정리한 쟁점(참고):
1. **공정성.** 히트박스가 바뀌면 돈으로 산 라켓이 유리해질 수 있다. 특히 상금이 걸린 DAILY와 ONLINE에서 그렇다. 선택지:
   - (가) 모든 라켓의 넓이를 같게 하고 모양만 다르게 한다(긴 대신 좁음 등 장단점).
   - (나) DAILY·ONLINE은 기본 라켓으로만 하고, 모양 라켓은 FREE PLAY·STAGES에서만 쓴다.
   - (다) 모양은 그대로 두고 대신 다른 값(속도·무게)으로 균형을 맞춘다.
2. **상금과 조작 방지.** 지금 DAILY 설계는 클라이언트가 보낸 승패를 믿는다. 돈으로 살 수 있는 화폐를 상금으로 주면 조작할 이유가 커진다 → 서버 쪽 검증을 강화하거나(입력 재생 검증), 상금을 작게 둔다. 순위 기준도 지금의 "깬 순서"는 리셋 직후 접속한 사람이 유리하므로 다시 정해야 한다.
3. **계정과 복구.** 현금으로 산 화폐·라켓은 기기 교체나 재설치 뒤에도 돌아와야 한다(분쟁·환불 요청의 주된 원인). 지금 계획의 "기기 저장 + 익명 ID"로는 부족하다 → Apple로 로그인 / Google Play Games 같은 계정과 서버 지갑이 필요하고, 계정이 생기므로 앱 안 계정 삭제(D1)도 필수.
4. **스토어 규정.** 화폐 판매는 Apple 인앱 결제·Google Play 결제만 쓸 수 있다(외부 결제 링크 불가). 상점에서 무엇을 사는지 미리 보이면 확률형 아이템(뽑기)이 아니므로 확률 공개 의무는 없다. 연령 등급·개인정보 양식에 인앱 결제를 표시해야 한다.
5. **화폐를 버는 길.** 1~3등만 상금을 받으면 대부분은 사기만 하게 된다. 스테이지 첫 클리어, DAILY 클리어 같은 작은 보상을 함께 두는 게 좋다.

권장 순서(위 사용자 결정으로 확정):
1.0(12월)은 지금 범위대로 출시한다. 라켓 상점은 계정·서버 지갑·결제가 함께 필요하므로 그 다음 큰 업데이트로 한다. 그 전에 할 수 있는 일:
- (a) 엔진에 "모양 라켓" 지원 + 무료 라켓 2~3개로 손맛 확인.
- (b) 라켓 데이터 파일 형식 정하기.
