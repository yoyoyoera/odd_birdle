# GamePix Pause policy — 2026-11-17

Latest branch: `work/gamepix-pause-policy`, based on the already deployed `work/ready-rematches` work. This update produces a new **GamePix ZIP only**; it does not deploy the website/Worker or replace any portal's submitted game.

## User decision

The user explicitly rejected synchronized multiplayer pause because it can be abused and interrupts short matches. Do not implement a server pause protocol, opponent pause button, pause timeout, or synchronized resume countdown. The GamePix Player's pause/resume callbacks are still handled locally.

| Mode | Pause | Resume |
|---|---|---|
| CPU | Freeze CPU simulation, scene, input and sound; show `PAUSED` | Continue the same CPU game, with no elapsed-time catch-up |
| QUICK MATCH while playing CPU | Freeze CPU and disconnect the queue socket; show that CPU and matchmaking are paused | Continue CPU and reconnect/re-enter the queue |
| Online match already started | Keep the match socket open; remove the local racket, mute, freeze local rendering/input, and show `ONLINE MATCHES CANNOT BE PAUSED` | Reset playback/prediction to the newest server snapshot and continue immediately |

Online explanation: `The match continues while you are away. Resume to return.`

Quick-match explanation: `CPU game and matchmaking are paused. Resume to continue.`

There is no new in-game multiplayer Pause button. The Player owns the pause signal and Resume action. The same handling also follows GamePix Page Visibility pauses. The separate soundOff/soundOn controls remain independent: soundOff alone does not freeze gameplay or withdraw matchmaking.

## Implementation and races

- `client.js` stops its animation/update loop while paused but continues receiving server snapshots.
- On resume, CPU simulation timing is reset so time spent paused is not simulated in a burst. Online playback is reset to the latest stored server timestamp/view.
- CPU quick-search pause closes the current queue socket, instead of merely sending `unqueue`. A start message already in flight on the retired socket is ignored by the existing socket-identity guard. An opponent briefly seated against that closing socket is released by the existing server disconnect logic.
- `connect()` and delayed queue reconnects reject calls while paused; resume restores activity time and a new queue connection.
- The visible overlay blocks stage input. Restart is also guarded while paused. During online play, the restart button remains hidden; finished-match restart still uses both-player readiness and the existing ad break rules.
- No server schema, game physics, ad frequency or existing Y8 submission was changed.

## Validation

- **134 tests pass**, including a real-client integration test in `tests/client-pause.test.js`. It executes client.js with a DOM/canvas/socket fixture and checks CPU freeze/same-game resume, quick queue disconnect/re-entry, a late start after pause, no online pause/restart request, continued receipt of server scores, and immediate current-score display after resume.
- Existing local WebSocket tests still cover all 25 website/Y8/itch/GD/GamePix pairs for code rooms and quick matches, with two rematches each.
- Actual Chrome smoke check used the release's GamePix files at 640×480, an explicitly mocked Player SDK, and the real shared `createRooms` implementation over local WebSockets. CPU pause/resume worked. While quick CPU was paused a test opponent remained waiting, then matched only after resume. In an online match the local displayed score stayed 0:1 while the peer/server advanced to 5:6; resuming displayed 5:6 immediately.
- ZIP CRC, JS syntax, relative-module imports, SDK URL, GamePix marker and overlay markup were checked.
- These checks do **not** represent GamePix QA approval or an actual live Player re-upload check. The public SDK guide does not explicitly grant a multiplayer exception to its pause rule. Document for QA that authoritative online matches continue while the local client is suspended and ads only occur between matches.

## Deliverable

- `oddbirdle-gamepix-pause-policy.zip`, **91,395 bytes**
- Local: `/tmp/oddbirdle-pause-deliverables/oddbirdle-gamepix-pause-policy.zip`
- File ID: `libfile_a404da3c34b4819190f4064002a8eaba`
- Supersedes `oddbirdle-gamepix-ready.zip` for the user's latest Pause request.
- Still includes GamePix sound callbacks and the visible both-player rematch readiness prompts from the preceding release.

Upload this new ZIP to the GamePix Draft when ready, then test Player Pause/Resume in CPU, QUICK MATCH's CPU waiting phase, and a real online match. Also recheck Sound off/on and an actual ad break before QA submission.
