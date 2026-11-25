# Odd Birdle Android 앱 (Capacitor 8)

게임 웹 파일(`portal/app/`)을 APK에 내장하는 Capacitor 껍데기. 계획: `docs/PLAN-mobile-app.md` Step A1(b)·A2·A3.

- 패키지 이름(가칭): `com.oddbirdle.app` — 첫 Play 업로드 전에 확정
- 버전 고정(`^` 없음): `@capacitor/core`·`@capacitor/cli`·`@capacitor/android` 8.6.2, `@capacitor/app` 8.1.2
- `compileSdk 36`, `targetSdk 36`, `minSdk 24` (`android/variables.gradle`)
- Node 22(`.nvmrc`), JDK 21, Gradle wrapper 8.14.3, AGP 8.13.0

## WebView Origin

`capacitor.config.json`의 `server.androidScheme: "https"`, `server.hostname: "app.oddbirdle"` 때문에
앱 WebView의 페이지 주소는 `https://app.oddbirdle/`이고, 매치 서버로 가는 WebSocket·fetch 요청의 **`Origin`은 `https://app.oddbirdle`** 이다.
매치메이커 허용 목록(`origins.js`)에는 Step C1에서 실기기 로그로 확인한 뒤 이 값 하나만 추가한다.

`localhost`를 쓰지 않은 이유: 웹 코드가 `localhost`를 개발 환경으로 보고 테스트 경로(`client.js`의 `?test=touches`)와 분석 제외(`analytics.js`)를 켜기 때문이다.
hostname을 바꾸면 Origin이 바뀌어 기기 저장소(localStorage 등)가 초기화되므로, 출시 뒤에는 바꾸지 않는다.

## 화면 (몰입형·가장자리·인셋)

- `MainActivity`: 앱이 앞에 있는 동안 화면 꺼짐 방지(`FLAG_KEEP_SCREEN_ON`), 상태·내비게이션 바 숨김(가장자리 스와이프 시 잠깐 표시), 복귀·포커스 때 다시 숨김. 모든 API에서 edge-to-edge + 디스플레이 컷아웃까지 그리기. 회전 고정 없음(세로·가로 모두).
- 인셋은 Capacitor 8 내장 SystemBars 플러그인 `insetsHandling: "css"`(기본값)로 처리한다. Capacitor 7의 `adjustMarginsForEdgeToEdge`는 8에 없다.
  - **WebView 140 이상 + 페이지 viewport에 `viewport-fit=cover`가 있을 때:** 네이티브 여백 없이 WebView가 화면 전체를 쓰고, `env(safe-area-inset-*)`가 실제 값을 갖는다. 같은 값이 `--safe-area-inset-*` CSS 변수로도 들어간다.
  - **WebView 140 미만이거나 `viewport-fit=cover`가 없을 때:** Capacitor가 WebView 바깥에 네이티브 여백을 주고 `env()`·`--safe-area-inset-*`는 0이 된다(화면이 시스템 바·컷아웃을 피함).
  - 따라서 **앱 빌드의 `index.html` viewport에 `viewport-fit=cover`가 있어야 한다**(웹 쪽 작업). 웹 CSS는 `env(safe-area-inset-top, 0px)`를 쓰면 되고, 필요하면 `var(--safe-area-inset-top, 0px)`를 대신 써도 된다.
  - 몰입형에서는 시스템 바가 숨겨져 있으므로 보통 인셋은 컷아웃 쪽만 0이 아니다. 바가 스와이프로 잠깐 나타날 때는 화면 위에 겹쳐 보일 뿐 인셋이 바뀌지 않는다(transient).
- 창·WebView 배경은 게임 페이지 색 `#182223`(흰 화면 깜빡임 방지).

## 아이콘·스플래시

`resources/icon-source.png`(reddit 브랜치 `reddit/odd-birdle/public/icon.png`, Snoo 없음)에서 셔틀콕 모양을 잘라 만든다. ImageMagick 6(`convert`) 필요.

```sh
bash android-app/scripts/make-icons.sh
```

- 적응형 아이콘: 배경 크림색 `#F0E6D6` + 셔틀콕 전경(같은 전경을 Android 13 테마 아이콘 monochrome으로도 사용), 구형 기기용 사각·원형 PNG
- 스플래시: Android 12+ 는 `#182223` 배경 + 크림색 셔틀콕(`drawable-xxxhdpi/splash_icon.png`), 그 이전은 `drawable*/splash.png`

## 로컬 빌드

```sh
# 1) 웹 번들 → portal/app/
npm ci && node scripts/build-portal.mjs app
# 2) Capacitor
cd android-app && npm ci && npx cap sync android
# 3) APK (JDK 21, ANDROID_HOME에 platform 36 + build-tools 필요)
cd android && ./gradlew assembleDebug
# 결과: android-app/android/app/build/outputs/apk/debug/app-debug.apk
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

## CI (`.github/workflows/android.yml`)

`main`·`claude/**` 푸시(앱·웹 관련 경로가 바뀐 경우)와 수동 실행(workflow_dispatch). 순서:
루트 `npm ci` → `node scripts/build-portal.mjs app` → `android-app`에서 `npm ci` → `npx cap sync android` → Temurin JDK 21 → `./gradlew assembleDebug` → `aapt2 dump badging`으로 targetSdk 36 미만이면 실패 → 아티팩트 `odd-birdle-debug-<짧은 SHA>`로 APK 업로드(30일 보관).
릴리스 서명·AAB는 아직 없음(Step E1).

## 실기기 체크리스트 (Step A3, 결과는 계획서 8절에)

1. 비행기 모드에서 첫 실행 → 메뉴·폰트·소리 정상
2. 세로↔가로 회전(메뉴·경기 중)
3. 첫 터치 후 타격음과 지연 체감
4. 라켓 조작감이 같은 폰의 Chrome 웹판과 같은지: TOUCH SPEED, 세로 엄지 패드, 가로 전체 패드
5. 랜덤 효과가 여러 번 나오는 CPU전 몇 판(웹판과 같은 경기 그대로)
6. 홈으로 나갔다 복귀(경기 중·메뉴)
7. 뒤로 가기(제스처·버튼)
8. Android 16 기기라면 가장자리 표시와 예측형 뒤로 가기 애니메이션

추가로 볼 것: 화면이 켜진 채 유지되는지, 상태·내비게이션 바가 숨겨지고 스와이프로만 잠깐 나오는지, 노치·펀치홀 쪽 UI가 가려지지 않는지, 디버그 빌드는 PC Chrome `chrome://inspect`로 WebView를 볼 수 있음.
