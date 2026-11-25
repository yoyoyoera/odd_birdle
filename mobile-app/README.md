# Odd Birdle 모바일 앱 — Android · iOS (Capacitor 8)

게임 웹 파일(`portal/app/`)을 앱에 내장하는 Capacitor 껍데기. 두 플랫폼 공용 폴더(이전 이름 `android-app/`). 계획: `docs/PLAN-mobile-app.md` Step A1(b)·A2·A2b·A3, I1(b)·I2·I3.

- 앱 ID: `com.oddbirdle.app`(Android 패키지 = iOS 번들 ID), 표시 이름 `Odd Birdle` — 첫 스토어 업로드 전에 확정
- 버전 고정(`^` 없음): `@capacitor/core`·`@capacitor/cli`·`@capacitor/android`·`@capacitor/ios` 8.6.2, `@capacitor/app` 8.1.2
- Android: `compileSdk 36`, `targetSdk 36`, `minSdk 24` (`android/variables.gradle`), JDK 21, Gradle wrapper 8.14.3, AGP 8.13.0
- iOS: iPhone 전용(`TARGETED_DEVICE_FAMILY = 1`), 최소 iOS 15.0, Swift Package Manager(CocoaPods 없음, `ios/App/CapApp-SPM/Package.swift`는 CLI가 관리)
- 두 플랫폼 모두 **가로 전용**. Node 22(`.nvmrc`)

## WebView Origin

| | 페이지 주소 | 매치 서버로 가는 요청의 `Origin` |
|---|---|---|
| Android | `https://app.oddbirdle/` | `https://app.oddbirdle` |
| iOS | `capacitor://app.oddbirdle/` | `capacitor://app.oddbirdle` |

`server.hostname: "app.oddbirdle"`(공용), `server.androidScheme: "https"`, iOS는 기본 scheme `capacitor`(WKWebView는 `https`를 사용자 scheme으로 쓸 수 없다).
매치메이커 허용 목록(`origins.js`)에는 Step C1에서 실기기 로그로 확인한 뒤 이 두 값만 추가한다.

`localhost`를 쓰지 않은 이유: 웹 코드가 `localhost`를 개발 환경으로 보고 테스트 경로(`client.js`의 `?test=touches`)와 분석 제외(`analytics.js`)를 켜기 때문이다.
hostname·scheme을 바꾸면 Origin이 바뀌어 기기 저장소(localStorage 등)가 초기화되므로, 출시 뒤에는 바꾸지 않는다.

## Android 화면 (몰입형·가장자리·인셋)

- `MainActivity`: 앱이 앞에 있는 동안 화면 꺼짐 방지(`FLAG_KEEP_SCREEN_ON`), 상태·내비게이션 바 숨김(가장자리 스와이프 시 잠깐 표시), 복귀·포커스 때 다시 숨김. 모든 API에서 edge-to-edge + 디스플레이 컷아웃까지 그리기. 가로 전용: manifest `android:screenOrientation="sensorLandscape"`(왼쪽·오른쪽 가로만). Android 16(targetSdk 36)은 큰 화면(폭 600dp 이상)에서 이 고정을 무시하므로, 그때는 웹 쪽이 세로 창에서도 가로 비율로 그린다(계획서 A2b).
- 인셋은 Capacitor 8 내장 SystemBars 플러그인 `insetsHandling: "css"`(기본값)로 처리한다. Capacitor 7의 `adjustMarginsForEdgeToEdge`는 8에 없다.
  - **WebView 140 이상 + 페이지 viewport에 `viewport-fit=cover`가 있을 때:** 네이티브 여백 없이 WebView가 화면 전체를 쓰고, `env(safe-area-inset-*)`가 실제 값을 갖는다. 같은 값이 `--safe-area-inset-*` CSS 변수로도 들어간다.
  - **WebView 140 미만이거나 `viewport-fit=cover`가 없을 때:** Capacitor가 WebView 바깥에 네이티브 여백을 주고 `env()`·`--safe-area-inset-*`는 0이 된다(화면이 시스템 바·컷아웃을 피함).
  - 따라서 **앱 빌드의 `index.html` viewport에 `viewport-fit=cover`가 있어야 한다**(웹 쪽 작업). 웹 CSS는 `env(safe-area-inset-top, 0px)`를 쓰면 되고, 필요하면 `var(--safe-area-inset-top, 0px)`를 대신 써도 된다.
  - 몰입형에서는 시스템 바가 숨겨져 있으므로 보통 인셋은 컷아웃 쪽만 0이 아니다. 바가 스와이프로 잠깐 나타날 때는 화면 위에 겹쳐 보일 뿐 인셋이 바뀌지 않는다(transient).
- 창·WebView 배경은 게임 페이지 색 `#182223`(흰 화면 깜빡임 방지).

## 아이콘·스플래시 (두 플랫폼)

`resources/icon-source.png`(reddit 브랜치 `reddit/odd-birdle/public/icon.png`, Snoo 없음)에서 셔틀콕 모양을 잘라 만든다. ImageMagick 6(`convert`) 필요.

```sh
bash mobile-app/scripts/make-icons.sh
```

- 적응형 아이콘: 배경 크림색 `#F0E6D6` + 셔틀콕 전경(같은 전경을 Android 13 테마 아이콘 monochrome으로도 사용), 구형 기기용 사각·원형 PNG
- 스플래시: Android 12+ 는 `#182223` 배경 + 크림색 셔틀콕(`drawable-xxxhdpi/splash_icon.png`), 그 이전은 `drawable*/splash.png`
- iOS(`ios/`가 있을 때): 1024×1024 불투명 앱 아이콘, 실행 화면 이미지(아래 iOS 절)

## Android 로컬 빌드

```sh
# 1) 웹 번들 → portal/app/
npm ci && node scripts/build-portal.mjs app
# 2) Capacitor
cd mobile-app && npm ci && npx cap sync android
# 3) APK (JDK 21, ANDROID_HOME에 platform 36 + build-tools 필요)
cd android && ./gradlew assembleDebug
# 결과: mobile-app/android/app/build/outputs/apk/debug/app-debug.apk
```

SDK 설치 예(저장소 밖):

```sh
mkdir -p /opt/android-sdk/cmdline-tools && cd /opt/android-sdk
curl -LO https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
unzip -q commandlinetools-linux-*.zip -d cmdline-tools && mv cmdline-tools/cmdline-tools cmdline-tools/latest
export ANDROID_HOME=/opt/android-sdk
yes | cmdline-tools/latest/bin/sdkmanager --licenses
cmdline-tools/latest/bin/sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"
```

확인:

```sh
$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging app-debug.apk | grep -E 'targetSdk|minSdk'
$ANDROID_HOME/build-tools/36.0.0/zipalign -c -P 16 -v 4 app-debug.apk   # 16KB 정렬 (지금은 네이티브 라이브러리 없음)
```

git에 들어가지 않는 것: `android/app/src/main/assets/public`(복사된 웹 파일), `capacitor.config.json`·`capacitor.plugins.json` 사본, `capacitor-cordova-android-plugins/`, `build/`, `local.properties`. 모두 `npx cap sync android`와 Gradle이 다시 만든다.

## Android CI (`.github/workflows/android.yml`)

`main`·`claude/**` 푸시(앱·웹 관련 경로가 바뀐 경우)와 수동 실행(workflow_dispatch). 순서:
루트 `npm ci` → `node scripts/build-portal.mjs app` → `mobile-app`에서 `npm ci` → `npx cap sync android` → Temurin JDK 21 → `./gradlew assembleDebug` → `aapt2 dump badging`으로 targetSdk 36 미만이면 실패 → 아티팩트 `odd-birdle-debug-<짧은 SHA>`로 APK 업로드(30일 보관).
릴리스 서명·AAB는 아직 없음(Step E1).

## Android 실기기 체크리스트 (Step A3, 결과는 계획서 8절에)

1. 비행기 모드에서 첫 실행 → 메뉴·폰트·소리 정상
2. 가로 고정: 폰을 세로로 들어도 가로 유지, 왼쪽↔오른쪽 가로 뒤집기(메뉴·경기 중)
3. 첫 터치 후 타격음과 지연 체감
4. 라켓 조작감이 같은 폰의 Chrome 웹판(옆으로 든 상태)과 같은지: TOUCH SPEED, 가로 화면 전체 패드
5. 랜덤 효과가 여러 번 나오는 CPU전 몇 판(웹판과 같은 경기 그대로)
6. 홈으로 나갔다 복귀(경기 중·메뉴)
7. 뒤로 가기(제스처·버튼)
8. Android 16 기기라면 가장자리 표시와 예측형 뒤로 가기 애니메이션

추가로 볼 것: 화면이 켜진 채 유지되는지, 상태·내비게이션 바가 숨겨지고 스와이프로만 잠깐 나오는지, 노치·펀치홀 쪽 UI가 가려지지 않는지, 디버그 빌드는 PC Chrome `chrome://inspect`로 WebView를 볼 수 있음.

## iOS 네이티브 설정 (Step I1)

- `ios/App/App/MainViewController.swift`(`CAPBridgeViewController` 하위 클래스, `Main.storyboard`의 초기 화면. 스토리보드 창이 없을 때만 `SceneDelegate`가 직접 만든다):
  - 상태바 숨김, **홈 인디케이터 자동 숨김**, **위·아래 가장자리 시스템 제스처 지연**(`preferredScreenEdgesDeferringSystemGestures = [.bottom, .top]`). 가로 화면 전체가 라켓 패드라서, 첫 쓸어올림은 게임이 받고 두 번째 쓸어올림에만 홈·알림 센터·제어 센터가 열린다.
  - 가로 왼쪽·오른쪽만, 앱이 활성인 동안 화면 꺼짐 방지(`isIdleTimerDisabled`, 백그라운드에서 해제).
  - Debug 빌드 전용 CI 훅: 환경 변수 `ODDBIRDLE_CI_EVAL`의 JavaScript를 첫 페이지 로드 뒤 실행(시뮬레이터에서 CPU 경기 화면을 찍기 위함). Release 빌드에는 없다.
- `Info.plist`: `UISupportedInterfaceOrientations`(+`~ipad`) = LandscapeLeft·LandscapeRight, `UIRequiresFullScreen`, `UIStatusBarHidden`, `UIViewControllerBasedStatusBarAppearance`, `ITSAppUsesNonExemptEncryption = false`(HTTPS만), `NSPhotoLibraryAddUsageDescription`(결과 카드 "Save Image", 빌드 2 공유 시트용), `UIRequiredDeviceCapabilities = arm64`.
- `capacitor.config.json` `ios`: `contentInset: "never"`(여백은 페이지의 `env(safe-area-inset-*)`), `scrollEnabled: false`, `allowsLinkPreview: false`. 스크롤 튕김은 Capacitor 기본으로 꺼져 있다.
- **소리:** `AppDelegate`에서 `AVAudioSession` 카테고리를 `.ambient`로 고정 — 무음 스위치를 따르고(무음이면 효과음 없음) 다른 앱의 음악과 섞인다. iOS 기본값 `.soloAmbient`도 무음 스위치는 따르지만 효과음이 날 때 다른 앱 음악을 끊는다. WebKit이 재생 중 카테고리를 바꿀 수 있으므로 실기기(I3 3·7번)에서 확인.
- `PrivacyInfo.xcprivacy`(App 타깃 리소스): 추적 없음, 수집 데이터 없음, 필수 사유 API 없음. **B2에서 Preferences(UserDefaults)를 쓰면** `NSPrivacyAccessedAPICategoryUserDefaults` + 사유 `CA92.1`을 추가한다.
- 아이콘: `scripts/make-icons.sh`가 `Assets.xcassets/AppIcon.appiconset`에 1024×1024 불투명 PNG 한 장(크림색 바탕 + 셔틀콕)을 만든다. 실행 화면: `#182223` 바탕 + 크림색 셔틀콕(`Splash.imageset`, `LaunchScreen.storyboard`).

git에 들어가지 않는 것(iOS): `ios/App/App/public`, `ios/App/App/capacitor.config.json`·`config.xml` 사본, `ios/capacitor-cordova-ios-plugins/`, `DerivedData`, `xcuserdata`, `App/build`. 모두 `npx cap sync ios`와 Xcode가 다시 만든다.

## iOS 로컬 빌드 (Mac, Step I3)

준비(I0): 최신 Xcode, iPhone의 설정 → 개인정보 보호 및 보안 → **개발자 모드** 켜기.

```sh
# 저장소 루트에서
npm ci && node scripts/build-portal.mjs app
cd mobile-app && npm ci && npx cap sync ios
npx cap open ios          # Xcode에서 ios/App/App.xcodeproj가 열린다
```

Xcode에서:
1. 왼쪽 `App` 프로젝트 → TARGETS `App` → **Signing & Capabilities** → Team에서 자기 Apple ID(무료 계정이면 "Personal Team") 선택. 번들 ID `com.oddbirdle.app`이 이미 다른 팀에 등록되어 있다는 오류가 나오면 로컬 시험용으로만 `com.oddbirdle.app.dev` 등으로 바꾸고 커밋하지 않는다.
2. 위쪽 실행 대상에서 USB로 연결한 iPhone 선택 → ▶(Run). 처음에는 iPhone의 설정 → 일반 → VPN 및 기기 관리에서 개발자 인증서를 신뢰해야 할 수 있다.
3. 무료 Apple ID로 설치한 앱은 7일 뒤 다시 설치해야 한다.

웹 코드를 바꾼 뒤에는 `node scripts/build-portal.mjs app` → `npx cap sync ios` → Xcode에서 다시 ▶.
디버그 빌드는 Mac Safari → 개발자용 메뉴 → iPhone 이름에서 WebView를 검사할 수 있다.

실기기 체크리스트는 계획서 **Step I3**(`docs/PLAN-mobile-app.md`)에 있고, 결과도 계획서 8절에 기록한다.

## iOS CI (`.github/workflows/ios.yml`, Step I2)

`main`·`claude/**` 푸시(iOS·웹 관련 경로, `mobile-app/android/**`만 바뀐 경우는 제외)와 수동 실행. macOS 러너(`macos-26`)는 분 단위 비용이 크므로 Android 쪽만 바뀌면 돌지 않는다(반대로 `android.yml`은 `mobile-app/ios/**`만 바뀌면 돌지 않는다).
순서: `xcodebuild -version` 출력 → 웹 빌드 → `cap sync ios` → 다이내믹 아일랜드가 있는 가장 새 `iPhone NN Pro` 시뮬레이터 선택 → 서명 없는 Debug 시뮬레이터 빌드 → 설치·실행 → 스크린샷(메뉴, CPU 경기, 시뮬레이터 창을 왼쪽·오른쪽으로 돌린 경기 화면은 가능할 때만) → 아티팩트 `odd-birdle-ios-screenshots-<SHA>`(스크린샷·앱 로그), `odd-birdle-ios-simulator-app-<SHA>`(.app zip).
`simctl` 스크린샷은 화면을 세로 원본 방향으로 저장하므로 가로 앱이 옆으로 누워 보일 수 있다. 그런 파일에는 시계 방향으로 90° 돌린 `-turned.png` 사본이 함께 올라간다.
