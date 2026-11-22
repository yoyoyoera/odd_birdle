# Reddit 스테이지 모드 구현 인수인계 (GPT/Codex 세션용)

사용자 요청: 스테이지 20개(+숨김 1개) 모드를 Reddit 앱(Odd Birdle)에 만들 것. 답은 사용자에게 **한국어**로, 게임 화면 글자는 **영어**로.
먼저 `docs/HANDOFF-reddit-hackathon.md`(해커톤 전체 맥락·결정 사항)를 읽을 것.

## 구현 상태 (2026-11-19)
- 아래 설계의 스테이지 규칙·선택/안내 UI·클리어 저장·카드 연동을 구현했다. 데이터는 `stages.js`, 저장 클라이언트는 `stage-progress.js`, 서버는 `reddit/odd-birdle/src/server/core/stages.ts`와 `routes/stages.ts`다.
- 8·13·18·21번은 2대 2 복식이다. 싱글 대체 규칙은 `stages.js`의 `fallbackRules`에 보관한다. 21번은 1~20 전체 클리어 후 표시한다.
- 엔진: `createGame({ withCpu, rules })` 또는 `restart(3, level, rules)`. 세 번째 인자를 생략하면 현재 규칙을 유지하고, 명시적으로 `null`/`undefined`를 넘기면 랜덤 연습 규칙으로 돌아간다. 기존 무규칙 동작과 테스트는 유지한다.
- 6.3의 "상시 범퍼일 때 다른 효과 없음"은 4번에 적용한다. 20번의 더 구체적인 표를 우선하여 상시 범퍼를 활성 랜덤 효과와 독립적으로 구현했다. 19번은 실제 1~2초의 라이브 랠리 시간마다 효과를 교체한다.
- 루트 테스트 182개, Devvit 테스트 16개, 타입·린트·빌드 통과. 새 작업 폴더에서는 먼저 `node scripts/prep-reddit.mjs`로 클라이언트를 생성한 다음 Devvit 빌드/전체 검사를 할 것.
- 헤드리스 Chrome으로 475×350, 492×405, 390×844에서 목록/스크롤/안내→카운트다운 확인. 로컬 실제 엔진 승리→클리어 ✓→카드 번호/이름 연결 확인(API는 테스트 응답 사용, 실제 댓글은 게시하지 않음). 실제 Reddit 플레이는 설치 후 사용자가 확인한다.
- `tools/stage-difficulty.mjs`로 504판 측정. `docs/STAGE-DIFFICULTY.md`의 해석/후속 항목을 참고. 모델 한계로 실제 인간 난도를 단정하지 않았고 표의 규칙은 변경하지 않았다.
- **저장 제약:** SDK 0.15.4에는 계정 삭제 이벤트가 없다. 지원하지 않는 트리거를 등록하지 않았다. 게시물 삭제 정리 + 인증된 `DELETE /api/stages` + 사용자/식별 매핑 30일 TTL 구현. 즉시 계정 삭제 정리는 미지원이며 공개 심사 전 해결 필요. TTL은 클리어 저장 시 갱신되고 만료되면 기록이 사라질 수 있다. 공유 게시물 인덱스에는 사용자 ID 대신 임의 토큰을 둔다.
- API의 승리 기록은 클라이언트의 클리어 보고를 저장하는 방식이다. 서버가 경기 전체를 재검증하는 부정행위 방지나 공식 리더보드용 검증은 아니다.
- Devvit 업로드·설치 결과는 아래 배포 기록에 갱신한다. Publish/App Review는 계속 금지한다.

### 배포 기록
- 2026-11-23: **r/oddbirdle에 0.0.76 설치 완료**. 7번 폭탄 스테이지의 관중은 폭탄이 자기 코트에 들어오면 서서히 몸을 낮추고, 반대편으로 넘어가거나 폭발하면 현재 자세에서 서서히 다시 일어난다. 메인 사이트의 랜덤 폭탄과 7번 미리보기에도 반영했다.
- 2026-11-19: `npx devvit upload` 성공, **0.0.24** 업로드.
- `npx devvit install oddbirdle` 성공, **r/oddbirdle에 0.0.24 설치 완료**. `devvit publish`/`npm run launch` 실행하지 않음.
- 작은 화면·승리/카드 검증에 더해, 로컬 API 테스트 응답이 `[20]`일 때 목록 20개/21번 없음, `[1..20]`일 때 목록 21개/21번 표시를 브라우저에서 확인.
- 사용자는 기존 Reddit 게임 게시물을 새로고침해 `STAGES` → 안내 → 플레이 → ✓ 복원 → 실제 `POST CARD`를 확인하면 된다. 실제 Reddit 내 플레이/댓글 게시 검증은 아직 사용자 확인 전이다.
- 작업은 별도 worktree `odd_birdle_reddit-stages`에서 수행했다. 원격 `reddit`에만 push하며 `main`은 수정/병합하지 않는다.

## 0. 지금 상태 (2026-11-19 기준)
- 앱 `odd-birdle` 은 Devvit Web 으로 r/oddbirdle 에 설치돼 있고(버전 0.0.22), 사용자가 직접 플레이해 확인했다.
  게시글 안에서 바로 게임 시작, CPU 대전만(온라인 버튼 숨김), 레딧 닉네임 표시(`u/이름`), 경기 끝 `POST CARD` 로 풀 타임 카드 이미지 댓글 올리기가 동작한다.
- 작업 브랜치는 `reddit` (origin). main 은 웹·포털 판이고 다른 세션(Code2)이 계속 고치므로 **main 에 push 하지 말 것**. 합치기는 사용자 승인 후 rebase.
- 해커톤 마감 2026-12-09 11:00 KST, 제출 목표 12/8. 앱을 **Publish(App Review) 하지 말 것**: `devvit publish`, `npm run launch` 금지. 업로드·설치만.

## 1. 작업 환경 만들기
기존 작업 폴더는 임시 폴더라 없어졌을 수 있다. 새로:
```bash
git clone https://github.com/yoyoyoera/odd_birdle.git && cd odd_birdle
git checkout reddit && npm ci
cd reddit/odd-birdle && npm ci && cd ../..
```
- Node 24 이상(`reddit/odd-birdle/package.json` engines), 이 PC 는 v26.
- Devvit 로그인은 이 PC 의 `~/.devvit/token` 에 이미 저장돼 있다(계정 u/Special_Gain_9580). 토큰을 문서·커밋·로그에 쓰지 말 것.
- 사용자는 명령어 입력을 싫어한다. 직접 실행하고 결과만 보고할 것.

## 2. 구조 (reddit 브랜치)
- 게임 본체는 웹판과 같은 JS: `game.js`(결정적 시뮬, CPU 포함, `createGame`), `client.js`(그리기·입력·메뉴), `index.html`(마크업·CSS), `stands.js`·`crowd.js`(관중), `sound-*.js`, `portal.js`(플랫폼 구분: `<html data-portal="reddit">`).
- Reddit 전용: `card.js`(풀 타임 카드 그리기), `card-lines.js`(한 줄 평 88개), `match-stats.js`(경기 기록 수집).
- Devvit 앱: `reddit/odd-birdle/` (`devvit.json`, `src/server/` 는 Hono, `src/server/routes/card.ts` 가 카드 댓글 API).
- 빌드: `scripts/prep-reddit.mjs` 가 `build-portal.mjs reddit` 결과를 `reddit/odd-birdle/src/client/` 로 복사하고 vite 가 묶는다. `devvit.json` 의 `scripts.build` 에 연결돼 있어 `devvit upload` 때 자동 실행된다.
  `src/client/` 의 복사본(`*.js`, `splash.html`, `game.html`, `fonts/`)은 생성물이라 `.gitignore` 대상이다(`git status` 에 splash/game.html 이 M 으로 보이면 `git checkout` 으로 되돌려도 됨).
- reddit 전용 마크업·CSS 는 `index.html` 안에서 `[data-portal="reddit"]` 선택자로만 건드린다(다른 플랫폼에 영향 없게).

## 3. 올리는 법 (매번)
```bash
cd reddit/odd-birdle
npx devvit upload          # 빌드 + 업로드. 버전이 자동으로 올라간다
npx devvit install oddbirdle   # r/oddbirdle 에 새 버전 설치
```
- 올린 뒤 사용자가 r/oddbirdle 새로고침해서 확인한다. 새 게시물은 모드 메뉴 "Create a new post".
- 함정: 업로드 도구는 내용이 같은 파일이 둘이면 하나만 등록해서 `splash.html` Not Found 가 났었다. `prep-reddit.mjs` 가 두 페이지에 서로 다른 주석을 넣어 막는다. 이 로직을 지우지 말 것.
- 업로드가 잦으면 이전 버전이 캐시돼 헷갈린다. 로컬에서 먼저 확인하고 묶어서 올릴 것.

## 4. 로컬 확인 방법
- 단위 테스트: 루트에서 `node --test tests/` (현재 168개, 전부 통과해야 한다). 새 기능에는 테스트 추가.
- 화면은 헤드리스 Chrome + CDP 로 찍는다. 코트 작은 프레임(Reddit 인라인/확장 화면 약 475×350 ~ 492×405)에서 보기 좋은지 확인할 것. 모바일 세로 화면도 확인.
- 정적 확인: `node scripts/build-portal.mjs reddit` → `portal/reddit/` 을 `python3 -m http.server` 로 띄운다(Devvit 없이 게임만).
- 실제 Reddit 안 확인은 사용자 몫(업로드 후 새로고침).

## 5. 지켜야 할 제약
- Devvit 규칙: 외부 링크·광고·분석 금지, 외부 서버 호출(HTTP Fetch) 금지, 온라인 대전·WebSocket 사용 안 함. 데이터는 Devvit Redis(`@devvit/web/server` 의 `redis`).
- 계정·게시물이 지워지면 해당 유저의 Redis 데이터도 지워야 한다(삭제 트리거 처리). 키 설계에 반영.
- 게임 화면 글자는 영어. 스타일은 Odd Birdle 특유의 납작하고 단순한 모양(사용자가 "AI 같은 표정·격자·그라데이션"을 싫어한다). 버튼은 메뉴 버튼처럼 평소 옅은 타일, 올리면 진해지는 모양.
- 숫자·결과는 게임 시뮬이 정한다. 랜덤 시드·결정성을 깨지 말 것.
- 비밀값을 커밋하지 말 것.

## 6. 만들 것: 스테이지 모드
### 6.1 규칙
- 모든 스테이지는 **처음부터 선택 가능**(순서 잠금 없음). 깬 판엔 ✓ 표시. 기록 날아감 방지로 서버(Redis)에 유저별 저장 + 브라우저 저장 보조.
- **21번(숨김)은 1~20번을 전부 깬 뒤에야 목록에 나타난다.**
- 각 스테이지는 이름 + 한 줄 설명이 있고, **선택 화면에서 보여 주고, 시작할 때 짧은 안내로 한 번 더** 보여 준다.
- 카드(`card.js` 의 `stage` 인자)에 `STAGE N` 줄이 채워진다. 현재 `client.js` 가 `stage: undefined` 로 넘기고 있다. 스테이지 판이면 번호를 넘기고 한 줄 평(`verdictFor`)에 스테이지 상황을 쓸 수 있으면 더 좋다.
- 랜덤 대전(지금 모드)은 그대로 둔다(연습용).

### 6.2 스테이지 표
| # | 이름 | 설명(영어, 화면용) | 상대 | 목표·규칙 |
|---|---|---|---|---|
| 1 | Warm-up | Plain match, no tricks. | Lv.1 | 3점, 효과 없음 |
| 2 | First Surprise | Random effects join in. | Lv.1 | 3점, 랜덤 효과 |
| 3 | Steady | Nothing but rallies. | Lv.2 | 5점, 효과 없음 |
| 4 | Hot Air | A balloon floats the shuttle all match. | Lv.2 | 3점, 풍선 상시(`permanent: 'balloon'`) |
| 5 | Windy Day | A steady wind blows one way, left or right. | Lv.2 | 5점, 바람 상시(`permanent: 'wind'`, 보통 돌풍의 1/2 세기, 방향은 판마다 왼쪽/오른쪽 랜덤) |
| 6 | Sudden Death | One point. That's all. | Lv.3 | 1점, 효과 없음 |
| 7 | Tiny Bird | A small shuttle and random effects. | Lv.3 | 5점, 작은 셔틀콕(크기 0) + 랜덤 효과 |
| 8 | Doubles I | Take turns hitting with your partner. | 2v2 | 5점, 파트너 Lv.3·상대 2명 Lv.2 (6.4 참고) |
| 9 | Take the L | The shuttle is always an L. Random effects join in. | Lv.3 | 5점, 모양 고정 L, 랜덤 효과 |
| 10 | Boss: Chaos | Effects come twice as often. | Lv.3 | 7점, 랜덤 효과 빈도 2배 |
| 11 | Smash Fest | The CPU sets it up high, then smashes. | Lv.4 | 5점, CPU 가 셔틀콕을 높이 띄우고(`cpuLift: 1`) 네트 위에서 기다렸다가 스매시(`cpuSpike: 1`), 효과 없음 |
| 12 | Five in a Row | You start 0:4 down. Win five straight. | Lv.3 | 시작 0:4, 상대는 5점에서 끝나므로 5연승 필요 |
| 13 | Doubles II | Take turns through random effects. | 2v2 | 5점, 파트너 Lv.3·상대 Lv.3+3, 랜덤 효과 |
| 14 | The Post | A bumper stays up all match. | Lv.2(서툴게 0.7) | 5점, 범퍼 상시 |
| 15 | Moving Net | The net swings from very low to very high. | Lv.4 | 7점, 네트가 4.5초 주기로 0.3~2.0배 높이를 오르내림(`netSway`, `swayMid/Amp/Period`), 효과 없음 |
| 16 | Boss: Storm | Effects twice as often, longer match. | Lv.4 | 9점, 랜덤 효과 2배 |
| 17 | Shrinking Bird | Starts huge and shrinks with every hit. | Lv.5 | 5점, 가장 큰 크기(34)로 시작해 칠 때마다 8% 작아져 가장 작은 크기(11)의 절반(5.5)까지(`shuttleSize: 2, shrink: 0.92, shrinkTo: 5.5`), 효과 없음 |
| 18 | Doubles III | Stronger rivals and twice as many effects. | 2v2 | 7점, 파트너 Lv.3·상대 Lv.4+4, 효과 2배 |
| 19 | No Warning | Effects come a bit faster, with no countdown. | Lv.5 | 5점, 효과 빈도 1.4배 + 카운트다운 없이 바로(`noCountdown`) |
| 20 | Final Boss | More effects. A bumper that stays. | Lv.5(서툴게 0.35) | 9점, 상시 범퍼 + 효과 1.5배 |
| 21 | Doubles IV | The strongest rivals and twice as many effects. | 2v2 | 11점, 파트너 Lv.3·상대 Lv.5+5, 효과 2배 (1~20 전부 클리어 후 표시) |
- INVISIBLE·FREEZE 효과는 랜덤에서 뺀 상태이고 스테이지에도 쓰지 않는다(사용자가 별로라고 판단).
- 설명 문구는 다듬어도 되지만 짧게(한 줄) 유지. 난이도 곡선(점수·레벨·효과)은 구현 후 CPU 승률을 재서 조정한다(7절 D).

### 6.3 `game.js` 에 필요한 입구 (경로 힌트)
지금 `createGame({ withCpu, quickEvents })` 와 `restart(openingCountdown, selectedCpuLevel)` 가 있고, `restart` 안에서 `pointsToWin = 5 + random`, `matchNetTop = ...[1,1.2,1.4]`, CPU 레벨 선택을 한다. 여기에 **선택적 규칙 객체**를 받게 한다(없으면 지금 동작 그대로 = 랜덤 대전):
- `points`(목표 점수), `startScore {left, right}`, `cpuLevel`
- `effects`: `'none'` | 쓸 효과 id 배열 | 전체(기본)
- `effectRate`(2 = 두 배 자주; `scheduleEvent()` 의 `eventWait` 에 곱), `quickEvents`(1~2초)
- `permanent`: 상시 효과 id (`'bumper'`). 이때는 다른 효과 없음. `activeEffect` 가 끝나지 않게 처리, 범퍼 grow/shrink 는 그대로
- `netScale`(1~1.4 사이 고정 또는 `'high'`/`'low'`), `shuttleSize`(크기 단계 0~2), `shuttleShape`(고정 모양 번호; L 은 `shapeCount - 1`)
- `gravityScale`(중력·낙하 배율, `flightProfile`/`shuttlePose` 쪽에서 적용)
- 사용 가능한 효과 id: shock, wind, balloon, highNet, lowNet, bumper, decoy, trampoline (`randomEffectIds`). `onlyEffect` 변수가 이미 있어 "이 효과만" 은 거기에 맞추면 된다.
- 승리 조건은 `winner` 설정부(점수가 `pointsToWin` 에 닿는 곳)와 시작 점수를 함께 고려.
- 규칙이 없으면 완전히 기존 동작이어야 하고, 기존 테스트가 그대로 통과해야 한다(특히 `tests/cpu-effects.test.js`, `tests/trial-effects.test.js`).
- **주의**: `game.js`·`client.js` 는 main 에서 Code2 세션도 고친다. 변경은 추가형으로 작게, 이 브랜치에만 둔다.

### 6.4 복식 (8·13·18·21번)
- 사람과 CPU 파트너 대 CPU 2명. 각 팀의 A가 첫 타자이고 팀 내 타격 순서가 A→B→A로 이어진다. 차례가 아닌 라켓이 새로 접촉하면 상대 득점이다. 같은 타격에서 이어진 접촉은 한 번으로 센다.
- 차례인 라켓에는 고리가 뜨고 사람 팀에는 `YOUR TURN` 또는 `PARTNER’S TURN`이 표시된다. 반칙을 낸 팀과 라켓은 화면의 문구로 구분한다.
- 엔진 규칙은 `rules.doubles: { partner, opponents }`. 상대 레벨은 숫자 하나 또는 두 원소 배열이다. 스테이지별 싱글 대체 규칙은 `fallbackRules`로 유지하며 `fallback: true`로 전환할 수 있다.
- 연습과 하루 도전에는 복식 규칙을 적용하지 않았다. [복식 인수인계](HANDOFF-reddit-doubles.md)에 검증·측정 결과와 배포 상태가 있다.

### 6.5 UI·저장
- 메뉴(지금 `CPU` 버튼 하나)에 스테이지 진입 추가. 선택 화면은 20개(+조건 충족 시 21번) 목록: 번호, 이름, 한 줄 설명, ✓ 표시. 코트 프레임이 작으므로(약 475×350, 모바일 세로) 스크롤·그리드 크기를 신경 쓸 것.
- 시작 안내: 카운트다운 전에 이름+설명을 잠깐 보여 준다(`event-banner` 활용 가능).
- 클리어 기록: 서버에 `/api/stages` 같은 Hono 라우트(`reddit/odd-birdle/src/server/routes/`), Redis 키는 유저 단위(예: `stages:{userId}` 의 해시/세트). `redis` 는 `@devvit/web/server`. 클라이언트는 `fetch('/api/...')`(카드 API 와 같은 방식, `src/client/` 는 같은 오리진).
  서버 실패 시 `localStorage` 로 보조(try/catch 필수, 프라이빗 창에서 막힐 수 있음).
- 계정/게시물 삭제 트리거(`reddit/odd-birdle/src/server/routes/triggers.ts` 참고)에서 해당 유저 키 삭제.
- 풀 타임 카드에 `STAGE N` 표시, 스테이지 이름도 보여 주면 좋다.

## 7. 병렬 작업 제안 (서브에이전트 / 여러 세션)
파일을 겹치지 않게 나누면 충돌이 적다. 각자 브랜치(`reddit-stages-engine` 등)에서 작업해 `reddit` 으로 합친다. 합치는 순서: A → C → B → D.
- **A. 엔진 규칙 입구** (`game.js`, `tests/stage-rules.test.js`): 6.3 전부 + 단위 테스트(시작 점수, 목표 점수, 효과 제한, 빈도, 상시 범퍼, 고정 모양·크기, 중력). 기존 168개 테스트 유지.
- **B. UI** (`client.js`, `index.html`, `card.js` 의 stage 표시): 스테이지 선택 화면, 시작 안내, ✓ 표시, 카드 연동. 규칙표를 `stages.js`(순수 데이터 파일, 위 6.2 표)로 따로 두고 B 가 읽는다. 그 파일을 먼저 만들어 A·B·D 가 공유.
- **C. 서버 저장** (`reddit/odd-birdle/src/server/`): 진행 저장 API, Redis 키, 삭제 트리거, 서버 쪽 간단 테스트(`vitest`, 기존 `count.test.ts` 참고).
- **D. 난이도 측정** (스크립트): 사람처럼 치는 자동 플레이어로 CPU 레벨·효과 조합별 승률·소요 시간을 재서 점수 목표·효과 빈도를 조정. 기존에 CPU 하네스를 만들어 썼지만 임시 폴더라 없을 수 있으니 새로 만들어도 된다. 결과는 표로 정리해 사용자에게 보고.
- 한 사람(세션)이 순서대로 해도 된다. 이 경우 A → `stages.js` → C → B → D.

## 8. 완료 기준
- 단위 테스트 전부 통과(새 테스트 포함), 로컬 확인(작은 프레임·모바일 세로), `devvit upload` + `devvit install oddbirdle` 성공.
- 사용자가 r/oddbirdle 에서 직접 스테이지 선택 → 시작 안내 → 플레이 → 클리어 ✓ → 카드에 STAGE N 까지 확인.
- 2v2 는 시제품 가능 여부와 대체안을 사용자에게 보고.
- 끝나면 `docs/HANDOFF-reddit-hackathon.md` 의 "나중에 할 일"에서 스테이지 항목을 정리하고 커밋·push(`reddit` 브랜치).

## 변경 이력 (사용자 피드백 반영, 2026-11-19)
- 효과 경고 카운트다운은 항상 3·2·1(효과 빈도 배수가 카운트다운을 줄이지 않음).
- 스테이지 선택은 두 줄 카드 가로 슬라이드. 스테이지 안에서 뒤로 가기(←)는 카드 목록으로, MENU 는 홈으로.
- 스테이지가 올라갈수록 관중이 늘어남(`stageCrowd`).
- 연습 대전은 목표 점수를 표시하지 않음(긴장감), 스테이지만 `FIRST TO N` 표시.
- 스테이지 번호의 의미가 바뀌었으므로 예전 클리어 기록은 번호 기준이라 어긋날 수 있음(현재 사용자 기록은 1·2번뿐).

## 변경 이력 (복식)
- 8·13·18·21번에서 실제 2대 2 활성화. CPU는 차례가 아닐 때 팀원과 반대쪽 구역으로 물러나 셔틀과의 접촉을 피한다.
- 206개 루트 테스트와 26개 Devvit 테스트 통과. 475×350, 890×510, 390×844의 로컬 화면에서 정상·반전 배치, 모바일 터치, 차례 전환 및 반칙 표시를 확인했다.

- 복식 파트너는 모든 스테이지에서 Lv.3. 상대(대기 중인) CPU 는 셔틀콕을 늦게 알아채고 비키는 속도가 느려서(레벨이 낮을수록 더), 빠른 스매시를 그 선수에게 맞히면 상대 반칙이 된다(`moveWaitingBot`). 내 파트너는 예전처럼 정확히 비킨다.

- 보스 판(10·16·20)은 목록에서 어두운 카드·금색 가장자리·BOSS 표시로 구분하고, CPU 라켓이 1.5배(`cpuRacketScale: 1.5`: 그림과 충돌 반경 둘 다). 복식 판에는 적용하지 않았다.

- 엄지 패드(터치+세로 화면, Reddit 빌드만): 코트는 위, 그 아래 빈 공간이 패드. 손가락이 닿은 위치가 아니라 **움직인 만큼** 라켓이 따라간다(`padGain` 1.5배, 반전 코트 반영, 손가락 속도가 스윙 세기). 처음 한 번 안내 그림, 패드 높이가 110px 미만(짧은 인라인 게시물)이면 기존 터치 조작으로 돌아간다. PC·가로 화면은 그대로.

- 폰(터치)에서 Reddit 피드 안의 인라인 게시물은 위아래로 끌면 피드가 스크롤돼서 엄지 패드가 안 된다. 그래서 터치 기기에서 인라인으로 열리면 `TAP TO PLAY` 화면이 뜨고, 누르면 `requestExpandedMode(event, 'game')`으로 전체 화면(expanded)에서 게임이 열린다(`portal.js`의 `redditViewMode`, `expandRedditView`, 클라이언트 `#expand-gate`). 패드에서는 `touchstart/touchmove` 기본 동작도 막는다. PC(마우스)는 인라인 그대로 바로 시작.

- 폰 세로: 메뉴는 코트 아래 어두운 바탕 위에 은은한 타일 + 밝은 글씨(`#pad-menu`), 스테이지 목록은 화면 전체에 2열로 위아래 스크롤, 경기 중에는 코트와 패드 사이에 SENSITIVITY 막대(0.8~3.0×, 기억됨, 게임 스타일의 얇은 선과 네모 손잡이). 메뉴의 데모(코트에서 라켓 둘이 치는 장면)는 폰에서 조금 더 진하게.

- 엄지 패드 감도는 계정별로 서버(Redis `prefs:v1:user:{id}`, 180일, `/api/prefs`)에 저장하고 기기(localStorage)에도 둔다. Five in a Row 는 스테이지 12·하루 도전 모두 CPU Lv.3 고정.

- 매일 게시물: 스케줄러가 매일 00:00 UTC(한국 09:00)에 `/internal/scheduler/daily-post` 를 불러 `Daily #N · 도전 이름 (날짜)` 게시물을 올린다(`daily-post` 작업, `core/dailyPost.ts`). 하루에 하나만(Redis `daily:v1:posts` 의 날짜 선점, 실패하면 반납). 모더레이터 메뉴의 "Post today's daily"로 수동으로도 올릴 수 있다.
