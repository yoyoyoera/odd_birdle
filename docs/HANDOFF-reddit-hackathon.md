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

## 스테이지 구현 완료 (2026-11-19)
- Reddit 앱 **0.0.24 업로드 및 r/oddbirdle 설치 완료**. 앱 공개 심사는 신청하지 않았다.
- `STAGES`: 1~20번은 처음부터 선택 가능, 모두 클리어하면 숨김 21번 표시. 기존 랜덤 CPU 대전은 `PRACTICE`로 유지한다. Reddit 전용 UI다.
- 규칙 엔진은 목표/시작 점수, CPU 레벨, 효과 제한·빈도, 상시 범퍼, 고정 네트·모양·크기, 저중력을 지원한다. 20번은 상시 범퍼와 랜덤 효과가 공존한다.
- 시작 안내 1.8초 후 3초 카운트다운. 승리하면 ✓, 결과 카드에 스테이지 번호·이름을 표시한다.
- 진행은 인증된 Reddit 계정별 Redis + 계정별 로컬 보조 저장. 미전송 승리만 재시도하며 서버에서 삭제한 확정 기록은 캐시로 되살리지 않는다.
- 게시물 삭제 시 해당 게시물에서 얻은 기록을 삭제한다. **Devvit Web 0.15.4에는 계정 삭제 트리거가 없다.** 사용자 데이터/식별 매핑에 30일 TTL과 인증된 `DELETE /api/stages`를 구현했지만, 계정 삭제 즉시 자동 정리는 지원하지 못한다. 앱 공개 심사 전에 지원 API나 별도 개인정보 처리 절차를 다시 확인할 것. 클리어 저장 후 30일 만료 시 확정 기록은 사라질 수 있다.
- 검증: 루트 182개, Devvit 16개 테스트 통과. 타입·린트·빌드 통과. 로컬 475×350/492×405/390×844 화면 및 실제 시뮬 승리→✓→카드 연결 확인. 실제 Reddit 안 최종 플레이 확인은 사용자 몫이다.
- 난이도: 21종 × 24회 = 504판 측정. 사람의 승률이 아니므로 규칙표는 유지했다. 상세 표/한계는 `docs/STAGE-DIFFICULTY.md`, 원본은 `docs/stage-difficulty-results.json`.

## 나중에 할 일
- 8·13·18·21번의 실제 2v2: 한 팀 번갈아 치기/반칙/4개 라켓은 미구현. 현재는 설계 문서의 싱글 대체 규칙이며 화면에도 `Singles edition`/`Bonus singles`로 설명한다. `mode: 'doubles'` 메타데이터는 보존했다. 12/1쯤 시제품 후 사용자와 결정.
- 실제 사람의 플레이로 3·6·8·12·14·19·20번의 소요 시간과 난도 확인 후 조정.
- 실제 Reddit에서 로그인한 계정의 새로고침 후 ✓ 복원, 전체 클리어 후 21번, 실제 카드 댓글 게시 확인.
- 계정 삭제 즉시 데이터 정리의 SDK 제약 해소 또는 공개 심사 전 처리 절차 확정.

## 스테이지 모드
최신 설계와 구현 지시는 `docs/HANDOFF-reddit-stages.md` 를 볼 것(1~20 전부 클리어 후 21번 표시, 2v2 4곳, 핸디캡 포함).
