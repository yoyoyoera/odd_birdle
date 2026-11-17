# 자체 웹 AdSense 연결

2026-11-17: 사용자가 직접 제공한 아래 연결 코드를 자체 웹 `<head>`에 넣었다. 브라우저·AdSense 계정 조작은 사용자가 직접 하기로 했다.

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8524281695403461"
     crossorigin="anonymous"></script>
```

`ads.txt`도 루트에 포함한다.

```text
google.com, pub-8524281695403461, DIRECT, f08c47fec0942fa0
```

## 현재 범위

- **사이트 연결·심사용 코드만 적용했다.** 광고 단위 `data-ad-slot`은 아직 받지 않아 배너·배너 여백은 만들지 않았다. 단일 배너 기능이 완성됐다고 설명하지 않는다.
- 공개 버전의 `index.html`·`client.js`와 일치하는 `0d8d864`를 기준으로 작업했다. 현재 공개 게임 로직은 바꾸지 않는다. 후속 GamePix Pause 정책이 포함된 ZIP 전용 변경을 이 작업 때문에 웹에 함께 배포하지 않는다.
- 모든 포털 빌드에서 이 연결 스크립트와 `ads.txt`를 제외한다. 기존 플랫폼 SDK 광고와 섞지 않는다. 심사 중 제출 파일은 교체하지 않았다.
- 태그는 async이며 게임 시작을 기다리게 하지 않는다. 외부 광고 서버 통신은 발생할 수 있다.
- 이 코드 자체가 Auto ads에도 사용된다. **게임 화면에 Google이 임의로 광고를 배치하지 않도록, 사용자가 이 사이트의 Auto ads를 꺼둬야 한다.** HTML만으로 계정의 Auto ads 설정을 껐다고 주장하지 않는다.

## 사용자가 직접 진행할 단계

1. AdSense 사이트 목록에서 `oddbirdle.pages.dev`의 연결 코드를 배치했다는 확인 및 필요한 사이트 검토 요청을 진행한다. 버튼 이름은 현재 계정 화면에 따른다.
2. 사이트 승인을 기다린다. 코드 배포와 Google 승인을 혼동하지 않는다.
3. **광고 → 사이트 기준**에서 이 사이트의 자동 광고(Auto ads)를 꺼둔다. 승인 뒤에도 설정을 확인한다.
4. 광고 단위 기준에서 디스플레이 광고 하나를 만들고 생성된 **전체 광고 단위 코드**를 전달한다. 게시자 ID뿐 아니라 `data-ad-slot`이 필요하다.
5. 광고 활성화 전에 Privacy & messaging의 해당 지역 동의 메시지를 설정하고, 웹에 실제 동작을 설명하는 개인정보 안내를 제공한다. 인증된 Google CMP를 사용할 수 있다. 기존 코드 연결만으로 이 설정을 완료했다고 간주하지 않는다.

이후 코드에서 구현할 범위는 충분한 데스크톱 공간에서 상단 배너 하나, 게임 영역과 최소 150px 간격, 모바일/짧은 화면에서 미표시, 미노출 시 게임 진행 유지다. 아직 구현·검증되지 않았다.

## 확인

```sh
node --test tests/adsense-build.test.js
node build-pages.js
```

최종 배포 뒤 `https://oddbirdle.pages.dev/`의 `<head>`에 태그가 정확히 한 번 있는지, `https://oddbirdle.pages.dev/ads.txt`가 200으로 위 한 줄을 반환하는지 검사한다. 자동 테스트는 6개 포털의 실제 출력에서도 자체 웹 태그와 ads.txt가 빠지는지 확인한다.

공식 안내:

- 사이트 연결: https://support.google.com/adsense/answer/7584263
- 자동 광고와 광고 단위 코드의 차이: https://support.google.com/adsense/answer/9274019
- ads.txt: https://support.google.com/adsense/answer/12171612
- 게임 주변 배치: https://support.google.com/adsense/answer/2768340
- 동의 메시지: https://support.google.com/adsense/answer/13554116

## 배포 완료 기록

- 프로덕션 연결 코드 커밋: `28c9173`, 브랜치 `work/adsense-site-connection`. 관리 브랜치에도 `82078c7`로 같은 변경을 반영했다.
- 배포: https://ccfc5223.oddbirdle.pages.dev — production `main`, 공개 https://oddbirdle.pages.dev/ .
- 이전 배포/롤백 기준: `9bc2c7c8-526c-4ba6-a7e5-1009b3e84524` (`4aca8a4`).
- 공개 HTML HTTP 200, `<head>`의 태그 1개, ads.txt HTTP 200 및 게시자 ID 일치를 확인했다. 공개 `client.js`는 기존 공개 버전과 동일하다.
- 신규 빌드 검사 1개가 6종 포털에서 자체 웹 코드/ads.txt 제외를 실제 생성물로 검증했다. 기존 제출 ZIP은 교체하지 않았다. 테스트 중 공백 경로의 `%20` 문제도 `fileURLToPath`로 수정했다.
- 관리 브랜치에는 후속 GamePix Pause 변경도 포함돼 있지만, 이번 웹 배포에는 함께 넣지 않았다. 다음 전체 배포 시 이 차이를 확인한다.
