# Ready rematches and GamePix audio — 2026-11-17

Website and itch now join Y8, GD and GamePix in the server's two-player readiness rule, for both room-code games and quick matches. Legacy clients can still send `{ type: 'restart' }`; updated clients include the round to reject stale requests. The local development server uses the same readiness rule.

Updated clients display `Waiting for opponent…` after readiness and `Opponent ready. Play again?` if the other player is ready first. The replay icon becomes unavailable after readiness and resets for the next round or on leaving. The earlier client stored these words only in a screen-reader-only status element; the new rematch status is visible under the replay control. This display change needs updated portal ZIPs, independently of the server rule.

The user's current itch source is `odd-birdle-html5.zip`, 82,102 bytes, Library `libfile_f42ea2bf4994819191dedf5b2e03cf29`. Use `scripts/upgrade-itch-rematch.mjs INPUT.zip OUTPUT.zip` to preserve it; only `client.js` and `index.html` change, with the other 19 entries kept byte-for-byte. This generic HTML5 archive had no `data-portal`; the upgraded index marks it as itch so multiplayer uses the approved central server instead of itch's static file host.

GamePix's Player invokes legacy `GamePix.soundOn` and `GamePix.soundOff` callbacks in addition to pause/resume events. Both callbacks are now registered. Player mute is tracked independently: soundOff does not pause a match, soundOn cannot override a pause, and resume cannot override an active player mute. The existing local sound setting remains owned by sound.js.

Quick matchmaking still requires a visible, active player (input within 30 seconds). Paused or idle searches now explain their state. A real GamePix-preview host and production website guest joined successfully and both received the initial countdown. The user then confirmed random matching also worked; GamePix access restrictions were not the cause of the reported symptom.

Validation: 133 tests pass, including real local WebSockets for all 25 ordered website/Y8/itch/GD/GamePix pairs in both code-room and quick-match modes, with an initial match and two rematches each. Browser checks on a disposable accelerated local server showed visible waiting on the first player's screen, the opponent-ready prompt on the second, and a new countdown only after both clicked. SDK unit tests verify separate sound callbacks and overlapping mute/pause reasons.

Y8's currently submitted build cannot be replaced during review. Its old 20-second active-ad timeout and missing visible waiting prompt remain limitations until that build can be updated; the newly built Y8 ZIP includes both fixes but has not been submitted. Real GamePix Player sound controls require a new draft upload before their end-to-end check can pass.

Production deployment completed: Worker `2f66debc-3119-410e-b300-347e2a52e4a3`; Pages `https://9bc2c7c8.oddbirdle.pages.dev` on the main production branch. Public client.js, index.html and portal.js match the release source. Real public website/website and website/itch matches both ended naturally at 11:12, stayed finished after one legacy restart request, then sent a three-second countdown only after the second legacy request. No portal ZIP was uploaded or submitted by this change.
