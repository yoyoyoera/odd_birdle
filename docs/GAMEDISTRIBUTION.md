# GameDistribution preparation

Status: local implementation only. No GD upload, activation request, live-site deployment, or matchmaker deployment has been made. The external-server and native-release questions have been emailed to GD; their reply is pending.

Base: GitHub main afed214 (2026-11-16). The supplied Y8 archive's 21 source/font files match this revision.

## Builds

Local build without GD SDK or advertisements (not for submission):

    node scripts/build-portal.mjs gamedistribution --preview

Assigned GD game ID: `e2d1ed4845d7412a976f3337355b1d7b`.

Real SDK build:

    GD_GAME_ID=e2d1ed4845d7412a976f3337355b1d7b node scripts/build-portal.mjs gamedistribution

The outputs are `portal/oddbirdle-gamedistribution-preview.zip` and `portal/oddbirdle-gamedistribution.zip`. No example or another game's ID is embedded. Production builds fail before writing files if the ID is missing or invalid. A game ID is public configuration, not an authentication secret.

The GD build bundles Space Grotesk and removes external navigation links, Google Fonts, social preview references, analytics, and debug/test modes. CPU gameplay and touch support remain in shared code; this submission is advertised as DesktopOnly.

## Advertisements and matches

- Initialize GD_OPTIONS before loading https://html5.api.gamedistribution.com/main.js. Queue early SDK events until the game is ready. Initial controls wait for SDK readiness, a load failure, or a bounded readiness timeout.
- Request showAd directly from the user's CPU, CREATE, JOIN-submit, QUICK MATCH, or replay action. Never request ads from a server message, automatic matchmaking, or during a rally. GD controls ad frequency.
- Pause CPU simulation and mute sound while a request is running. An actual advertisement returns to a CONTINUE screen before proceeding. Missing/blocked/failed SDK requests allow play to continue.
- Prevent duplicate menu actions during an ad. Quick matchmaking disconnects before an ad and reconnects afterward so another player is not seated while this player watches an ad.
- GD connections opt into a server rematch barrier. Each player clicks replay and completes their own break; the server starts the next three-second countdown only when both are ready. Round identifiers reject stale readiness. Other rooms retain their current one-click rematch.
- Multiplayer focus-loss pausing is not introduced: locally freezing a live network match cannot pause the other player/server.

## Before real multiplayer testing

The changed `rooms.js` and `origins.js` require a matchmaker deployment; a ZIP alone cannot add the rematch protocol to the live server. Test on a separate preview matchmaker first. The prepared origin allowlist accepts `https://html5.gamedistribution.com` and the dashboard-supplied test host `https://revision.gamedistribution.com` for GD; confirm the actual frame origin in GD testing before changing it. Do not allow all origins.

SDK unit tests use a fake SDK and do not prove actual ad delivery or GD acceptance. Check the saved game's UPLOAD test frame, SDK detection, real preroll and midroll, two-browser rematches, ad-blocker behavior, and keyboard/mouse input after CONTINUE before activation.

Local verification: 120 automated tests pass; all six portal targets build with their relative modules present; an absent GD game ID rejects submission builds. Browser smoke testing was attempted, but the local environment could not launch Chrome (SIGABRT / EPERM), so visual and real-browser verification remains outstanding.

## Dashboard fields

- Name: Odd Birdle
- Type / Sub Type: HTML5 / Javascript
- Width / Height: 800 / 600 (confirm actual iframe rendering before activation)
- Genre: Sports
- Tags: badminton, sports, physics, multiplayer, casual (use available options)
- Intended Target Audience: Both / All, if offered
- Age Group: Teens (13–17); also Young Adults (18–25) if multiple choices are allowed
- Languages: English
- The Game Doesn't Contain Text: off
- No Blood: on
- Child Friendly: on, based on the game's content; check the platform's definition
- Compatibility: DesktopOnly
- Rewarded Ads: leave off (none implemented)
- HTTPS Ready: on

### Description

Badminton, but the bird is odd. Swing your mouse to hit unpredictable shapes across the net. Keep the shuttle in play, set up your own shots, and react to random effects that change the rally. Challenge five CPU difficulty levels or play against another player online. Easy to start, tricky to master.

### Instructions

Move your mouse inside your half of the court to control the racket. Swing faster for harder shots. You can hit the shuttle multiple times before sending it over the net. Land it inside your opponent's court to score, and avoid hitting it out. Choose CPU for solo play, QUICK MATCH to find an opponent, or CREATE / JOIN to play with a room code.

### Key game features

Mouse-controlled physics badminton
Random shuttle shapes, sizes, and flight behavior
Seven rally effects, including GUST, FREEZE, and changing net heights
Five CPU difficulty levels
Real-time online multiplayer with quick matchmaking and private room codes
Multiple hits allowed before returning the shuttle
Minimal interface, randomized color palettes, and reactive spectators
No registration required

## Official references

- https://static.gamedistribution.com/developer/developers-guidelines.html
- https://github.com/GameDistribution/GD-HTML5/wiki/SDK-Implementation
- https://static.gamedistribution.com/developer/design-guidelines.html
- https://static.gamedistribution.com/terms/developer.html

Dashboard revision URL supplied by the user: https://revision.gamedistribution.com/e2d1ed4845d7412a976f3337355b1d7b/?correlator=1794842810206 . A direct unauthenticated fetch returned 403 AccessDenied; the actual page contents were not verified.

Outstanding: GD response, actual SDK/ad integration checks, dedicated preview deployment, and thumbnail preparation (512×512, 512×384, 200×120; smallest thumbnail without a logo).
