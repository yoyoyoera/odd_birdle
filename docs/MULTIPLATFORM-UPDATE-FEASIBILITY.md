# 다섯 플랫폼 일괄 업데이트: 가능성 조사

확인일: 2026-11-17 KST. **조사만 진행했다. 배포 봇 구현·플랫폼 업로드·심사 변경은 실행하지 않았다.**

## 결론

한 번의 실행으로 공통 소스 검증 → 플랫폼별 파일 생성 → 지원되는 플랫폼 배포 → 나머지 업로드 보조 → 상태 보고를 수행하는 봇은 만들 수 있다. 다섯 플랫폼이 같은 시각에 새 버전을 공개하는 것은 각 플랫폼의 심사·캐시·계정 절차 때문에 보장할 수 없다.

| 대상 | 확인한 경로 | 가능 범위 / 남은 확인 |
|---|---|---|
| 웹 (Cloudflare Pages) | 공식 Wrangler CLI, GitHub Actions / Direct Upload | 인증 연결 후 빌드·배포 자동화 가능. 게임 서버 Worker 변경은 별도 배포·호환성 검증 대상 |
| itch | 공식 butler CLI `push` | 지정 채널에 ZIP/폴더 업로드·업데이트 가능. HTML5 채널 초기 설정은 웹 편집 화면에서 1회 필요. 현재 수동 업로드 슬롯을 어떤 채널로 전환할지 확인해야 중복 파일을 피할 수 있음 |
| Y8 | Developer Portal Builds, 검토 요청 | 배포 파일 생성 가능. 공식 안내상 업데이트도 새 빌드 심사 뒤 기존 버전을 교체. 공개 업로드 API/CLI는 확인한 문서에서 찾지 못함. 계정 화면 자동화의 안정성과 허용 범위는 구현 시 추가 확인 |
| GamePix | My GamePix 새 release / Build / Submit for Review | 현재 사용자 화면에서 새 release·심사 흐름을 확인함. Game URL 방식도 주소의 게임을 변경하기 전 새 release 제출·심사가 필요하다고 화면에 명시됨. 공개 업로드 API/CLI는 확인하지 못함. 로그인 계정의 업데이트 흐름은 추후 확인 |
| GameDistribution | Developer dashboard 업로드, SDK 연동, QA | 플랫폼별 ZIP 생성 가능. 자동 업로드용 공개 API/CLI는 확인한 문서에서 찾지 못함. 현재 계정은 외부 서버·향후 네이티브 출시 조건 답변 대기 상태. 실제 버전 갱신·활성화 절차는 추후 계정 화면 확인 필요 |

‘공개 업로드 API를 찾지 못했다’는 것은 내부/제휴 API가 없다는 단정이 아니다. 브라우저 자동화는 가능한 대안이지만 로그인, 2FA/CAPTCHA, 화면 변경, 심사 중 잠금 때문에 완전 무인 실행의 안정성이 공식 CLI보다 낮다는 구현상 판단이다. 심사를 우회하거나 심사 중 제출본을 강제로 교체하는 방식은 설계하지 않는다.

## 현재 코드에서 이미 준비된 부분

- `build-pages.js`: 공통 정적 파일 출력.
- `scripts/build-portal.mjs`: itch / Y8 / GamePix / GD별 SDK, 로컬 폰트, 외부 링크·분석 제한을 적용한 ZIP 생성. 플랫폼별 요구가 달라 동일한 ZIP을 다섯 곳에 올리는 방식은 적합하지 않다.
- 중요한 예외: 최신 itch는 Claude와 작업한 사용자 지정 ZIP을 기준으로 보존해야 한다. 현재 `scripts/upgrade-itch-rematch.mjs`는 그 ZIP에 특정 준비 상태 수정만 적용하는 일회성 패치다. 일반적인 미래 배포에 재사용하면 안 된다. **일괄 배포 전 최신 itch 변경을 공통 소스·플랫폼별 설정에 정리하는 작업부터 필요**하다.
- 멀티플레이 서버는 플랫폼들이 공유한다. 심사로 구형·신형 클라이언트가 함께 존재하므로 프로토콜은 기존 제출 버전과 호환돼야 한다. 웹만 먼저 배포해도 상대 플랫폼이 고장 나지 않아야 한다.

## 이후 구현한다면

1. 최신 공통 소스를 확정하고 릴리스 버전·커밋·플랫폼별 ZIP 체크섬을 기록한다. 테스트를 통과한 파일만 대상으로 한다.
2. 플랫폼별 대기·생성 완료·업로드 완료·심사 중·공개·실패 상태를 따로 기록한다. 일부 실패 후 재실행할 때 성공한 업로드/심사 요청을 중복하지 않는다.
3. 웹과 itch를 공식 CLI로 연결한다. Y8·GamePix·GD는 공개/제휴 업로드 API 제공 여부를 추가 확인하고, 없으면 승인된 로그인 세션의 브라우저 보조 작업을 붙인다.
4. 현재 심사 중인 Y8·GamePix는 잠금 상태를 존중하며 건너뛴다. GD는 답변 대기를 유지한다. 사용자가 결과를 확인한 뒤 해당 대상의 업데이트를 재개한다.
5. 업로드 성공과 공개 완료를 구분한다. 공개 후 버전 및 SDK/광고/2인 멀티플레이를 확인하고 플랫폼별 결과를 보고한다.

GamePix나 Y8를 자체 호스팅 URL로 전환해 심사 없이 웹 업데이트를 즉시 공유하는 방안은 기본 해법으로 삼지 않는다. 사용자의 GamePix 화면은 URL 변경에도 review를 요구하며, Y8 공식 문서는 iframe 호스팅을 예외적으로 승인하고 외부 멀티 서버 사용만으로 자격이 생기지 않는다고 설명한다.

## 근거

- Cloudflare 공식 CI/Direct Upload: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- itch 공식 butler 업로드·채널 갱신·HTML5 초기 설정: https://itch.io/docs/butler/pushing.html
- Y8 Developer Portal FAQ (공개 게임 업데이트의 재심사, 제출 대기): https://developer.y8.com/
- Y8 포털 개요: https://docs.y8.com/studio/overview/
- Y8 iframe 호스팅 자격: https://docs.y8.com/studio/iframe-game-hosting/
- GamePix 공개 개발자·SDK 안내: https://partners.gamepix.com/ ; https://partners.gamepix.com/sdk/doc/
- GamePix 구체적인 URL/새 release 재심사 요구는 이 대화에서 사용자가 제공한 실제 My GamePix 화면을 근거로 함. 공개 SDK 문서에 업로드 API가 있다고 확인한 것은 아님.
- GD 공식 개발자 안내 (대시보드 업로드·SDK·QA): https://gamedistribution.com/developers/
- GD 공식 SDK 저장소: https://github.com/GameDistribution/GD-HTML5

이 문서는 사이트 관리 봇과 별개인 **미구현 기능의 타당성 검토**다. 다음 작업자가 조사 메모를 배포 완료 기록으로 읽지 않도록 주의한다.
