# GamePix submission

Prepared 2026-11-17. Support ticket #10156460 grants written consent for the external multiplayer server. The user sent the follow-up confirming these endpoints:

- Game-server domain: `oddbirdle.pages.dev`
- WebSocket: `wss://oddbirdle.pages.dev/play`
- Hosting: Cloudflare

GamePix support requested HTTPS `*.gamepix.com` Origins. `originSource` accepts HTTPS on the root and subdomains, and rejects lookalike suffixes and HTTP. GamePix joins the server-enforced two-player rematch barrier.

## Build and upload

    node scripts/build-portal.mjs gamepix

Upload `portal/oddbirdle-gamepix.zip` directly. Its root contains `index.html`; there is no extra enclosing directory or nested ZIP. This is a new build, separate from the original ZIP in Downloads. Do not upload the repository, source archive, or GD ZIP.

The build includes GamePix SDK v3 (manual lifecycle), local Space Grotesk with OFL, and the shared current game. It hides external navigation, own analytics, developer tests and diagnostics. Other portal SDKs are not loaded in this build. The approved game server remains an external network dependency.

SDK loading, pause/resume and muting are wired. Loading controls are locked until `loaded()` finishes; a missing/failed SDK releases the loading screen so the game remains playable. Hidden tabs pause local gameplay and audio; iframe blur alone does not pause it. Returning to the tab does not override an SDK pause.

Interstitial requests retain the existing policy: at least three completed matches, at least three minutes between requests, and only on a player action between matches. No timer displays an ad during gameplay. Requests await the SDK Promise; there is no timeout that releases an active ad. No rewarded ads or extra CONTINUE screen are added for GamePix.

Quick matchmaking is disconnected before a break and reconnected after it, so a player cannot be seated during their own ad. GamePix code rooms and quick matches opt into the rematch barrier, including a round identifier. In mixed rooms, both players must click replay; GamePix sends readiness only after its own break completes. Older website/itch clients keep their existing replay icon. The submitted legacy Y8 client's long-ad timeout limitation remains as documented in GAMEDISTRIBUTION.md; this GamePix build does not update that submitted ZIP.

## Validation

- 132 automated tests pass, including real local WebSocket transport for all 25 ordered website/Y8/itch/GD/GamePix pairs, each with an initial start and two rematches. This accelerates the game clock and does not play real portal ads.
- GamePix SDK tests cover loading order, pause/mute, visibility versus SDK pause ownership, rate limits, waiting for an active ad Promise, rejection, and a blocked SDK.
- ZIP CRC, module syntax, relative imports, font bundling, and absent external navigation/diagnostics were checked. ZIP size: 90,226 bytes.
- Shared Worker deployed as `0434978e-ae16-4008-b739-60b939f0d6f4`. Prior rollback version: `f32f6894-9ada-4b9d-a2a8-d2dcf3742f3e`.
- Public WebSocket CREATE passed for gamepix.com, games.gamepix.com, preview.games.gamepix.com, website, Y8, itch and GD revision. HTTP GamePix and a lookalike suffix were rejected. A website/GamePix match completed naturally at 13:14, stayed finished after website-only replay, then sent both players a new three-second countdown after GamePix readiness. These are protocol clients, not actual portal ad playback.
- Actual GamePix iframe rendering, real SDK ad delivery and portal QA approval still require the dashboard test.

## Where to submit

Use the developer dashboard at https://my.gamepix.com/games, not the consumer portal at gamepix.com. Register/sign in as a developer if needed. The current Games page has a `Create New Game` button. Create Odd Birdle, supply the production ZIP and requested game information/assets, run the dashboard testkit, and submit for QA through the dashboard's current submission controls. Exact later button names have not been verified in the signed-in UI.

Advertise this version as desktop / mouse controlled. English; Sports / casual physics; solo CPU and online multiplayer. No registration is needed inside the game. Choose DesktopOnly or disable mobile support if that choice is offered. Check the actual dashboard's requested image sizes rather than reusing GD's sizes blindly.

Suggested description:

> Badminton, but the bird is odd. Swing your mouse to hit unpredictable shapes across the net. Set up your own shots and react to random effects that change the rally. Challenge five CPU difficulty levels or face another player online. Easy to start, tricky to master.

Suggested instructions:

> Move your mouse inside your half of the court to control the racket. Swing faster for harder shots. You can hit the shuttle multiple times before sending it over the net. Land it inside your opponent's court to score, and avoid hitting it out. Choose CPU for solo play, QUICK MATCH to find an opponent, or CREATE / JOIN to play with a room code.

If there is a QA notes field, mention written consent in support ticket #10156460 and the server endpoint above. The support reply says a ZIP alone is sufficient; no source code or separate technical documentation is required. Do not submit extra documents unless the dashboard asks for them.

`Allow Distribution` extends distribution to GamePix's third-party network; leaving it off limits publication to gamepix.com under the current guidelines. Choose deliberately in the dashboard.

## References

- https://partners.gamepix.com/sdk/doc/javascript
- https://partners.gamepix.com/guidelines/submission
- https://partners.gamepix.com/developers
- GamePix support ticket #10156460
