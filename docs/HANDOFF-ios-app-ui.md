# iOS 앱 화면·조작 다듬기 전달 (iPhone 17 실기기 확인 완료)

기준: `claude/stoic-bardeen-0t1rdr` 66a28c3 → 이 브랜치(`ios-app-ui`) 커밋 9개. 사용자가 실기기에서 하나씩 확인하며 정함.
계획서 기준 I3(iPhone 실기기 점검) 체크리스트 1~8번 **모두 통과**(6번은 마지막 커밋으로 해결, 사용자 확인).

## 바뀐 것
1. **120Hz ProMotion**: `Info.plist` 에 `CADisableMinimumFrameDurationOnPhone`, `MainViewController.swift` 에서 WebKit 비공개 기능 `PreferPageRenderingUpdatesNear60FPSEnabled` 를 이름으로 찾아 끔(없으면 60 유지). 실기기에서 120 FPS 확인. ⚠ 비공개 API 라 **App Store 심사 위험**: TestFlight 전에 판단 필요(없애면 60Hz).
2. **여백 없는 화면**: 코트가 화면 높이를 꽉 채우고 좌우 대칭(`build-portal.mjs` app CSS, 한 칸 레이아웃). 페이지 배경은 코트 띠(관중 뒤 벽/코트/바닥)를 같은 높이로 칠해 노치·홈 줄까지 이어짐(`client.js` `paintAppBackground`).
3. **양옆 띠**: 왼쪽 바닥에 심판 의자·라켓 가방·물병(`paintAppProps`, 띠가 좁으면 생략). 경계선·그늘은 뺌.
4. **갈 수 없는 영역 표시**: 플레이어 라켓이 코트 바깥 가장자리 80유닛 안으로 오면 그쪽 띠 전체가 반투명 붉게(가까울수록 진하게, 최대 0.3). 라켓은 계속 온전한 동그라미(`drawOverlay`, 전체 화면 오버레이 캔버스).
5. **효과를 띠까지**: 쇼크 베일(어둡게/밝게)·폭탄 붉은 덧칠을 오버레이로 옮겨 옆 띠까지 적용. 일시정지 오버레이는 화면 전체(`position:fixed`).
6. **버튼**: 모두 네모(border-radius 0), 40px. 이전(←)·다시 시작(↻)은 양옆 띠 위쪽, 소리·감도는 오른쪽 띠 아래쪽(둥근 모서리에서 띄움). 감도 슬라이더는 앱에서 네모 `+ / 값 / −`(0.1 단위)로 교체. 연결 막대(`#link-own`)는 online 기능이 꺼진 앱에선 숨김.
7. **확대·선택 차단**: 앱 CSS(`touch-action:none`, `user-select:none`, `-webkit-touch-callout:none`), `app-shell.js` 가 gesturestart/change/end·dblclick·contextmenu·selectstart 를 취소(테스트 포함), `MainViewController.swift` 에서 핀치 인식기 끄고 배율 1 고정.

## 알아둘 것
- `tests/adsense-build.test.js` 의 app 레이아웃 정규식을 새 CSS(`main { display: block;`, `#studio-links { position: fixed;`)에 맞춰 고침. 앱 빌드는 웹 주소 문자열을 허용하지 않으므로 SVG 는 HTML 컨테이너 `innerHTML` 로 만듦(`xmlns` 문자열 금지).
- 전역 `canvas { background; aspect-ratio }` CSS 가 새 캔버스에도 먹으니, 오버레이 캔버스는 인라인으로 덮어씀.
- 실기기 FPS 확인용 `data-gd-diagnostics="true"` 는 로컬 진단 빌드에서만 썼고 커밋하지 않음.
- 설치 방법: `node scripts/build-portal.mjs app` → `mobile-app` 에서 `npx cap sync ios` → `xcodebuild … -allowProvisioningUpdates DEVELOPMENT_TEAM=C789GCURC5 build` → `xcrun devicectl device install app / process launch`.

## 다음(계획서)
I2b(CI 서명·TestFlight 업로드) 또는 빌드 2(B1 엔진 이식). 1번의 비공개 API 처리 결정이 TestFlight 전에 필요.
