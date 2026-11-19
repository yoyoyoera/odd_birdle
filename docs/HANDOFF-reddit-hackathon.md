# Reddit Game of the Day Hackathon 2026 포팅 인수인계

Odd Birdle 을 Reddit Devvit 데일리 게임으로 포팅해 출품한다. 작업 브랜치: `reddit` (기존 웹·포털 빌드는 main 에 그대로 보존).

## 해커톤
- 페이지: https://redditgameofday2026.devpost.com/ (규정 /rules)
- 목표 부문: Best Ported Daily Game $6,000. 원작 IP 소유 필요, 포팅작이라고 명시, 해커톤 기간에 크게 업데이트한 내용 설명. Honorable Mention 10자리(각 $1,000).
- 마감: 2026-12-09(수) 11:00 KST. 목표는 12/8 제출.
- 제출물: developers.reddit.com 앱 링크, 내 서브레딧의 공개 데모 게시물(심사는 이걸로 함, 설명 없이 이해돼야 함), Devpost 설명·이미지·1~2분 영상, (선택) 개발자 피드백 설문.
- 앱을 Publish(App Review)하지 말 것. 업로드와 플레이테스트만.
- 심사 기준: Delightful UX / Polish(Devvit Rules 준수) / Reddit-y(커뮤니티 중심) / Daily Content.
- 권장: 설정 화면 없이 바로 플레이. 시작 화면엔 게임명·한 줄 설명·날짜·통계만. 끝나면 결과 카드 하나(통계, 스트릭, 댓글 유도, 구독 유도). Devvit Journeys 이벤트 기록.
- 감점: 티 나는 AI slop, Reddit 자체를 소재로 한 테마, Devvit 에서 안 돌아가는 게임(입상 불가).

## Devvit Rules 확인 사항 (github.com/reddit/devvit-docs docs/devvit_rules.md)
- 외부 앱으로 링크 금지: oddbirdle.pages.dev, itch.io, 스튜디오 사이트, 인스타그램 링크 전부 제거. 포털 빌드처럼 외부 링크 없는 타깃(`reddit`)을 빌드에 추가.
- HTTP Fetch 는 App Review 승인이 필요한 프리미엄 기능 + 자체 약관·개인정보처리방침 필요 → 기존 WebSocket 매치메이커 사용 안 함. 데이터는 Devvit Redis.
- 외부 광고·자체 분석 제거(AdSense 등).
- 계정·게시물 삭제 시 Redis 의 해당 유저 데이터도 삭제(리더보드 키 설계에 반영).
- 외부 로고·상표 사용 금지.

## 스택
- Node 22, `npm create devvit@latest` (Devvit Web). Phaser 템플릿(--template=phaser)도 있음. 다른 참가자 레포는 React+Vite+Hono 서버+Redis: github.com/GaiaSG94/gameday-tangue, github.com/jajanb923-netizen/daily-drift-tower
- 예시 데일리 게임: r/hotandcold, r/syllo, r/pocketgrids

## 범위와 순서
1. `reddit` 브랜치. **가장 먼저 CPU 대전이 Devvit 플레이테스트(테스트 서브레딧)에서 모바일·데스크톱 둘 다 돌아가게 할 것.** 최대 리스크.
2. 데일리: 날짜 시드로 "오늘의 새(Bird of the Day)" 를 만들어 셔틀콕 모양·물리(무게, 바람, 지그재그 등)를 바꿈. 모두 같은 새·같은 조건의 CPU 와 대결. 공식 기록은 하루 1회, 연습은 무제한.
3. Reddit 요소: Redis 리더보드(서브레딧 단위), 스트릭, 결과 카드에서 이모지 결과 요약을 댓글로 공유, (가능하면) 스트릭 유저 플레어, Journeys 이벤트.
4. 실시간 온라인 대전은 1차 범위 제외. 시간이 남으면 Devvit realtime 검토.
5. 폴리시: 모바일 세로 화면·터치, 뷰포트 맞춤, 대비·가독성, 첫 플레이 상황별 힌트.

## 일정 (KST)
11/20~22 Devvit 계정·CLI·Quickstart, 테스트 서브레딧, 코드 구조 확인 → 11/23~29 Devvit 에서 CPU 대전 동작 → 11/30~12/4 데일리 새·리더보드·결과 카드·스트릭·댓글 공유 → 12/5~7 폴리시, 공개 데모 게시물 → 12/8 영상·Devpost 제출.

## 사용자가 직접 해야 할 일
Devpost 참가 등록, developers.reddit.com 가입·`devvit login`, 테스트 서브레딧 생성.

## 결정 사항 (2026-11-19, 사용자와 합의)
- 오늘의 판 고정(데일리 시드) 안 함: 랜덤이 이 게임의 정체성. 연습·랜덤 매치는 지금 그대로.
- 댓글 아이디어 받아 셔틀콕 구현하는 커뮤니티 기능은 **보류**(커뮤니티가 비어 있으면 허전함).
- 방향: ① 경기 끝 "풀 타임" 카드(예: FULL TIME 7-0, 상대·스테이지·가장 긴 랠리·효과 횟수·규칙 기반 한 줄 평)를 댓글로 올리기, ② 개인전 스테이지, ③ 시간이 남으면 2v2 스테이지.
- 카드 이미지 댓글은 시험 필요: `media.upload` 가 data: URL 을 받는지, richtext 로 이미지 댓글이 되는지. 안 되면 글자·이모지 카드로 폴백(그것만으로도 동작).
- 게시글은 인라인에서 바로 게임 시작(splash 와 game 페이지 모두 게임). 메뉴는 CPU 대전만.

## 나중에 할 일 (스테이지 구상, 사용자 초안)
스테이지 20개 정도를 난이도 곡선에 맞춰 설계. 초안:
1. Lv.1 CPU 와 3점 선취, 랜덤 효과 없음
2. 1 + 랜덤 효과
3. Lv.2 CPU 와 5점 선취
4. 상시 범퍼, 5점
5. … (이어서 설계: Lv 상승, 효과 종류·빈도, 네트 높이, 작은 새, 바람 상시, 효과 두 배 등 설정 조합으로 점진적으로 어렵게. 규칙 변형 스테이지 몇 개 섞기)
- 후반 보스 스테이지 후보: 2v2(나 + CPU 파트너 vs CPU 2명, 팀 안에서 번갈아 치기 위반 = 반칙). 현재 코드는 한쪽에 라켓 하나 전제라 비용이 큼 → 12/1 쯤 시제품 시험 후 진행 여부 결정.
- 스테이지 클리어 기록은 Devvit Redis 에 저장.

## 스테이지 모드
최신 설계와 구현 지시는 `docs/HANDOFF-reddit-stages.md` 를 볼 것(1~20 전부 클리어 후 21번 표시, 2v2 4곳, 핸디캡 포함).
