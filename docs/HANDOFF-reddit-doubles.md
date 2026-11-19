# 2v2(Doubles) 구현 인수인계 (GPT/Codex 세션용)

사용자 요청: 스테이지 8·13·18·21 에서 실제 2대 2를 돌릴 것. 답은 사용자에게 **한국어**로, 게임 화면 글자는 **영어**로.

## 먼저 읽을 것 (순서대로)
1. `docs/HANDOFF-reddit-hackathon.md` — 해커톤 전체 맥락·결정 사항
2. `docs/HANDOFF-reddit-stages.md` — 작업 환경 만들기, 올리는 법(`devvit upload` / `devvit install oddbirdle`), 지켜야 할 제약, 함정. **Publish 금지, main push 금지.** 최신 스테이지 표와 변경 이력도 이 문서 끝에 있다.
3. `docs/DESIGN-doubles.md` — 이번 작업의 설계안(규칙, 엔진 변경 위치, 클라이언트, 테스트, 일정). 이 문서가 이번 작업의 기준이다.

## 현재 상태 (2026-11-19 밤, 앱 버전 0.0.45) — 이 절이 최신. 앞의 오래된 버전 표기는 무시
- 브랜치 `reddit`(origin 최신을 받을 것). r/oddbirdle 에 0.0.45 가 설치돼 있다. 테스트: 루트 `node --test tests/` 201개, 앱 `cd reddit/odd-birdle && npx vitest run --coverage.enabled=false` 26개, `npx tsc --build` 통과.
- **스테이지**: 21개(`stages.js`). 번호·이름은 `docs/HANDOFF-reddit-stages.md` 표 참고(그 문서의 표는 최신이다). 바뀐 것: 4 Hot Air(상시 풍선), 5 Windy Day(상시 바람), 9 Take the L(L 셔틀콕+효과), 11 Smash Fest(CPU 가 띄워서 스매시), 14 The Post, 15 Moving Net, 17 Shrinking Bird, 19 No Warning, 20 Final Boss 완화. 연습 대전은 목표 점수를 숨기고 스테이지만 `FIRST TO N` 표시.
- **8·13·18·21 이 2v2 자리**: 지금은 `mode: 'doubles'`, `fallback: true` 로 싱글 대체 규칙이 돌아간다. 엔진이 되면 `fallback` 을 풀고 `rules.doubles` 를 넘길 것. 대체 규칙은 실패에 대비해 남겨 둘 것.
- **하루 도전(Daily)**: 날짜(UTC)로 8종 중 하나가 정해지고, 서버(Redis)가 시도 횟수·클리어 시간·순서 순위를 관리한다(`daily-plan.js`, `daily.js`, `daily-client.js`, `reddit/odd-birdle/src/server/core/daily.ts`, `routes/daily.ts`, `routes/card.ts`). 메인 메뉴 오른쪽의 오늘의 도전 카드가 이것이다. **이번 작업은 하루 도전의 규칙·서버 코드를 건드리지 않는다.** 단, 2v2 가 나중에 하루 도전 후보가 될 수 있으니 `rules.doubles` 를 일반 규칙 객체와 같은 방식으로 받게 만들 것(`dailyChallenges` 에 추가하는 건 사용자와 정한 뒤).
- **카드**: 경기가 끝나면 풀 타임 카드(`card.js`, `card-lines.js`, `match-stats.js`)를 이미지 댓글로 올린다. 2v2 판의 카드는 지금 구조(한 줄 평, 점수, 효과 횟수)를 그대로 쓰고 파트너 정보는 넣지 않아도 된다.
- **깨면 안 되는 동작**: 효과 경고는 항상 3·2·1(`countdown = 3`), `noCountdown`, 상시 풍선·바람·범퍼(`permanent`), `cpuEase`·`cpuSpike`·`cpuLift`(CPU 약화/스매시), `netSway`, `shrink`/`shrinkTo`, 반전 코트(`cpuMirrored`, `setMirroredShapes` 로 셔틀콕 모양을 게임 안에서 뒤집음), 스테이지 안 ←(스테이지 목록으로)와 홈 아이콘(메뉴로), 스테이지가 올라갈수록 늘어나는 관중, 상시 바람 소리(`sound.setBed`).
- **빌드 함정(중요)**: 게임이 import 하는 새 파일은 반드시 `build-pages.js` 의 파일 목록에 넣어야 한다(Reddit 앱·포털이 이 목록으로 복사한다). 빠지면 게임이 빈 화면이 된다. `tests/build-imports.test.js` 가 이걸 검사하니 통과해야 한다. 폴더로 나뉜 파일은 `card-motifs/` 처럼 목록 아래에서 따로 복사한다.
- **메뉴·화면 기준**: 코트 프레임은 작다(약 475×350 ~ 890×510, 폰 세로). 4개 라켓과 차례 표시를 그릴 때 이 크기들에서 확인할 것. 화면 글자는 영어.
- main(웹·포털 빌드)은 다른 세션이 계속 고친다. 이 브랜치에만 푸시하고 main 에는 푸시하지 않는다. 시작할 때 `git fetch` 후 `reddit` 최신을 받을 것.

## 할 일 (순서)
1. `docs/DESIGN-doubles.md` 의 1(규칙)·2(엔진)대로 `game.js` 를 일반화. 먼저 **테스트부터**(차례 번갈음, 차례 아닌 접촉 = 반칙, 파트너 CPU 가 차례가 아닐 때 접촉하지 않음 등). 기존 싱글 테스트(특히 `tests/cpu-effects.test.js`, `tests/trial-effects.test.js`, `tests/stage-rules.test.js`)는 전부 그대로 통과해야 한다.
2. 클라이언트에서 4개 라켓과 차례 고리 그리기(작은 프레임 약 475×350, 모바일 세로, 반전 코트에서 확인).
3. 스테이지 8 하나로 시제품을 만들고 사용자에게 먼저 보고(목표 12/1). 그다음 13·18·21 을 규칙표에 넣기.
4. 난이도 측정: `tools/stage-difficulty.mjs` 를 2v2 용으로 확장(자동 플레이어가 차례를 지키게). 결과를 표로 보고.
5. 끝나면 `docs/HANDOFF-reddit-stages.md` 의 표·변경 이력을 갱신, 커밋·push(`reddit` 브랜치).

## 병렬로 나눈다면 (파일이 겹치지 않게)
- A: `game.js` 엔진(라켓 키 일반화, 차례·반칙, CPU 역할) + 단위 테스트 — 가장 먼저, 가장 오래 걸림.
- B: `client.js`/`index.html` 그리기·차례 표시·안내 문구(엔진 뷰 필드 이름을 A 와 먼저 합의: `leftB`, `rightB`, `turn`).
- C: 측정 도구·난이도 조정(A 가 끝난 뒤).
- 한 세션이 순서대로 해도 된다. 라켓 키 일반화는 한 사람이 한꺼번에 하는 편이 안전하다.

## 사용자에게 알릴 것
- 시제품이 안 돌아가거나 CPU 끼리 서로 방해해서 반칙이 너무 많으면 억지로 밀지 말고 대체 규칙(싱글)을 유지하고 그 사실과 이유를 보고. 해커톤 제출 안전이 우선이다.
- 마감: 2026-12-09 11:00 KST, 제출 목표 12/8.
