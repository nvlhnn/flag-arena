# Flag Arena

A 1080 × 1920 country scoreboard for YouTube chat voting. Includes a demo studio, OBS overlay and local YouTube reader.

## Start on Windows

Double-click **Start Flag Arena.cmd**, then open http://127.0.0.1:4318/. Node.js 22.13 or later is required. Keep the app running during your stream.

1. Click **Start demo** or enter a test vote to try the scoreboard.
2. In OBS add a **Browser Source**, URL `http://127.0.0.1:4318/?overlay=1`, width **1080**, height **1920**.
3. Start your YouTube livestream with live chat enabled. Enter its URL and a YouTube Data API v3 key in **Connect YouTube**.

The hosted private preview is demo-only. Use the local app for YouTube and OBS: the local server shares scores across your browser and OBS, and keeps the API key only in memory. No channel password is needed. This app reads chat; it does not start or publish a YouTube broadcast.

## Votes

- One country name (English), supported alias, flag emoji, or `!vote ID` gives 1 point.
- Each distinct valid message counts immediately, with no per-viewer voting cooldown.
- Multiple different countries, ordinary chat and paid events are ignored. Repeating a flag in one message still gives only 1 point.
- All ISO-listed countries/territories can receive votes. The overlay shows the leading 120; unranked ties sort alphabetically.
- New connections skip initial chat history. Reconnecting the same video preserves its scores; a different video starts at zero.
- Demo and live scores are separate. Disconnect returns to demo. Live scores are retained for reconnecting.
- Scores are saved in the local SQLite database (see Storage and analytics below). Reset requires confirmation; it preserves duplicate tracking. Reset during a stream starts counting from that moment.

## YouTube setup and limits

Create a Google Cloud project, enable **YouTube Data API v3**, and create an API key restricted to that API. Enter it in the local app, never in a public chat or screenshot. A public or accessible unlisted stream must have an active live chat. Private streams may require OAuth, which this version does not implement.

The reader uses YouTube’s `liveChatMessages.streamList` over a TLS-protected gRPC connection. It resumes with the latest `nextPageToken` after temporary network failures, with retries spaced from 2 seconds up to 60 seconds. Initial history older than the connection time is ignored, while replayed accepted messages remain protected by duplicate tracking. Ended chats, invalid credentials, and quota/rate-limit errors stop the reader and appear in the control panel. Quotas still apply; streaming does not guarantee unlimited or 24/7 access. Restarting the app requires entering the key again and reconnecting; keys are not saved.

Official references: https://developers.google.com/youtube/v3/live/streaming-live-chat and https://developers.google.com/youtube/v3/docs/videos#liveStreamingDetails.activeLiveChatId

## Development

`npm run dev` starts the frontend at http://127.0.0.1:3000/. Run `npm start` separately for its local chat service. `npm run build` creates the production frontend. `npm test` checks parsing, duplicate protection, unrestricted repeat voting and YouTube URL validation.

Real YouTube ingestion and OBS display require a live stream and local OBS setup and have not yet been verified against this channel.

The optional WebMCP tools expose score readback and demo voting. A supported WebMCP browser was not available for contract verification; ordinary controls do not require WebMCP.

## V2
Each accepted vote awards 1 point. Existing v1 scores are converted once at load (1 old vote = 50 points). The latest voter sits below the leader; recent votes trigger a 1.6-second gold glow without enlargement and 2.6-second name-only popup. Like +50 and Subscribe +50 banners are informational only and never award points.

## YouTube request diagnostics

Open `http://127.0.0.1:4318/api/diagnostics` for local request-attempt counts, received batches/messages, and the last 100 connection events. Counts persist in `.arena/youtube-diagnostics.json`; they are not Google quota units and cannot reconstruct past usage. Keys, chat text, viewer identities and resume tokens are not logged.

Automatic reconnect backoff resets only after a stream has stayed open for at least 30 seconds. At most 8 stream attempts are made within 10 minutes per connection session before stopping for manual inspection. Quota errors stop immediately.


### Connection recovery and request budget

The local control panel shows Chat health and links to `/api/diagnostics`.
Normal stream endings resume after a short delay; transient failures use exponential backoff and stop after eight consecutive failures. Scores and the resume token are saved together, allowing reconnection to the same chat after a restart. Resetting live scores also updates the history cutoff. Expired/rejected resume tokens are cleared and reported; recovery of older messages is not guaranteed.

`request-budget.json` reserves an estimated 5 units per stream request and 1 per video lookup, with an advisory 9,000-unit warning over a rolling 24 hours. The stream cost is an estimate inferred from observed usage, not an authoritative Google quota measurement. This tracks only this app's requests after the update, excludes other clients and earlier usage, and cannot restore an exhausted Google quota. The estimate does not block requests; Google quota errors advance to the next configured chat key, stopping after all keys fail. Reservations survive restarts and manual reconnects. A corrupt budget file blocks new requests rather than silently resetting the counter.

Legacy JSON migration can recover from the previous-file backup and preserves the damaged file. New state writes use SQLite transactions. Local API credentials are still memory-only and must be entered after restarting. Back up the `.arena` directory; it contains private chat state and resume tokens and must not be published.

Voter popups use an ordered, bounded queue (100 pending effects). Under a large burst some popups may be omitted, but accepted votes still count. The latest 500 votes are retained for display recovery. Likes and subscriptions remain informational and do not award points.


### Match finale

Use **Finish match · 10s countdown** in Match controls. Votes received before the deadline count; at zero the server freezes scores and reveals up to five countries with nonzero scores, from fifth place to first. Ties use country-name alphabetical order. Late-delivered messages do not change published results.

Results stay on screen until **New match — reset scores** or **Continue — keep scores** is selected. Both reopen voting, clear old popup activity, and reject delayed messages from before the new round. Duplicate protection stays in place. Countdown deadlines and final results are persisted and shared with the OBS overlay. The local server must stay running for live updates; restarting requires re-entering the YouTube API key.


### Stream audio

The OBS overlay plays prerecorded English country announcements and synthesized musical effects. Normal studio previews are silent; **Preview English voice here** deliberately plays one sample in the studio. **Test overlay audio** sends a fresh sample event to the open overlay. Audio settings (mute, voice, volume) are saved on the local server and shared across modes and overlays.

Strict first-place changes, overtakes within the top three, and top-five entries can announce, at most once every ten seconds. Ties, resets, and initial page snapshots stay quiet. Countdown uses ticks and stronger final-three beeps only, interrupting ranking speech. A final tone and winner fanfare/voice follow the results timing. Speech has no backlog, and muted events are not replayed later.

Voice WAV files in `public/audio/en` were generated locally with the installed Microsoft David English voice; runtime playback does not call a speech service or consume YouTube quota. `scripts/generate-announcer.ps1` regenerates the clips on Windows with that installed voice. If autoplay is blocked, interact with the overlay's **Enable audio** button. Use one active audio-enabled OBS browser source; multiple overlays can each produce sound. Check the OBS audio mixer before broadcasting. Browser audio routing has not been verified inside OBS by automated tests.


### Current scoring

New valid country messages award **1 point**, with **no per-viewer voting cooldown**. Replayed copies of the same message ID still count only once, and match deadlines still close voting. Existing score totals and archived match results are preserved. The overlay displays Like +50 and Subscribe +50; those remain informational pending their integrations. The separate ten-second ranking-announcer cooldown is unchanged.


### Subscriber alerts and server credentials

`YOUTUBE_API_KEYS` in the ignored `.env` file is a JSON array of key strings. The local server loads it automatically. The studio uses those keys without sending them to the browser. REST lookup and chat fall back on invalid credentials or quota/rate-limit failures. General permission and network failures do not rotate keys. The same advisory usage counter records all keys and subscriber requests. Keys in one project share quota; adding keys is not a quota extension.

For subscriber detection, create a Google OAuth **Web application** client in the same intended API project, enable YouTube Data API v3, configure the consent screen and add your Google account as a test user if the app is in Testing. Register this exact redirect URI:

`http://127.0.0.1:4318/api/subscribers/callback`

Set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in `.env`, restart the local server, and use **Sign in with YouTube** in Subscriber bonus. Authorize the channel that owns your livestream and connect that livestream. The authorization requests read-only YouTube access with state validation and PKCE. Tokens are stored only in ignored `.arena/subscriber-oauth.json`; treat both `.env` and `.arena` as private. **Disconnect subscriber tracking** revokes authorization and clears the local tracker. Google consent-screen Testing mode can impose token expiry; production unattended use needs appropriate OAuth configuration.

The first successful subscriber snapshot is a baseline, not a bonus event. Later checks run every 15 seconds while matching live chat is connected. Each cycle checks the newest 50 subscribers, then advances at most one saved catch-up page. Each successful page and its pending cursors are committed to SQLite immediately. Catch-up continues across cycles and restarts without a 500-entry hard stop. Mixed pages keep scanning; fully known or older pages finish a scan. Rejected cursors trigger a recovery scan, and temporary network/rate-limit errors retry automatically. Real quota exhaustion and authorization errors still pause tracking. API availability and public subscription visibility can limit detection. A subscriber channel ID gets at most one detected bonus in the retained ledger, preventing repeated unsubscribe/resubscribe or reconnection bonuses.

A new subscriber earns **50 points** for their latest country vote in the open match. With no country selected, the bonus waits for their next country message in that same match; it expires when that round ends. Closed results are never updated by delayed subscriber detections. The alert slides from the right with their name, country flag, and awarded points; unassigned or closed-match subscriptions show thanks without claiming a bonus. English audio says “Thank you for subscribing,” followed by the country bonus when awarded. Countdown/results audio takes priority. The demo preview can exercise the animation and bonus without Google credentials, using demo scores only.

The previous Like +50 banner has been removed. Chat messages still add 1 point with no voting cooldown.

### Match viewer levels
Accepted country votes earn one XP at most once per five seconds per YouTube channel ID, using message timestamps. Levels 1–5 start at 0, 40, 120, 240, and 360 XP; every accepted vote scores its pre-vote level (1–5 points). The leveling vote displays the new level but the increase applies to the next vote. Level 5 takes at least 29m55s from the first XP, approximately 30 minutes. Invalid and replayed messages earn no XP. Subscriber bonuses remain a flat 50 points with no XP. Viewer progress persists across restarts and resets on every new match, including keep-scores. Bottom-strip level-up events last three seconds with a bounded queue; country popups remain name-only. Existing scores are preserved and prior votes are not awarded retroactive XP.

Performance: chat batches use a Set for duplicate checks and count accepted votes directly. Overlay broadcasts coalesce over 100ms. Score and XP snapshots remain immediately durable; unchanged subscriber checks skip state writes. Diagnostic counters save at most once per second (a hard crash may lose the last second of diagnostics, not saved scores). Ranking speech has a six-item queue and drops items older than eight seconds.

Chat key fallback: configured keys are attempted in priority order on authentication and quota/rate-limit errors, including gRPC code 8. Each key is tried once per connection attempt, with the latest chat cursor retained. No wraparound occurs after exhaustion. Subscriber OAuth is unchanged.


## Storage and stream analytics

The local service now stores scores, viewer progress, stream checkpoints, accepted chat votes and Super Chats in SQLite. On Windows the default database is `%LOCALAPPDATA%/FlagArena/arena.sqlite`, outside the OneDrive project folder. `ARENA_DATA_DIR` overrides the storage directory for isolated installations and tests. OAuth credentials, request diagnostics and quota accounting retain their existing `.arena` files. The database and `.arena` contain private viewer information; neither belongs in Git.

On the first run, `.arena/state.json` is imported automatically if no saved database state exists. The JSON and backup are retained unchanged. Scores, XP, audio settings, subscriber ledger and resume positions are preserved. Only the retained recent votes can seed legacy stream analytics; these streams are marked **partial**. Earlier votes and donations cannot be reconstructed. After migration, the database is authoritative: changing the old JSON has no effect. Restart the server and refresh the studio/OBS browser source after updating.

Use **Analytics** in the studio. Select the current/last stream or a previously recorded stream. Totals belong to a YouTube video ID and survive new matches, scoreboard resets, reconnection and app restarts. Demo votes are excluded. New streams only record events delivered after tracking begins; this is not a retrospective YouTube revenue report.

- **Top 5 chat voters:** total accepted chat-vote points; subscriber awards and donations never add to this ranking. Shared ranks use standard competition ranking (1, 1, 3). The list displays at most five viewers with stable viewer-ID ordering at the cutoff. A viewer's country is their most frequently voted country in this stream; ties use the most recent vote, then country code for identical timestamps.
- **All donors and donation history:** paginated lists include every recorded Super Chat, original integer micros/currency/comment, donor totals and USD conversion status. Super Stickers and other paid event types are not included in this Super Chat report.
- **Country Super Chat totals:** each donation is locked to the donor's most-voted country at its event timestamp. With no earlier accepted country vote, it stays **Unassigned** until the next accepted country vote in the same stream. Later country changes do not reassign a locked donation. Unassigned totals remain visible.
- **USD:** daily historical reference rates come from [Frankfurter](https://frankfurter.dev/). Requests contain only currency codes and the donation date. Original purchases, conversion rate, rate date and conversion timestamp are stored. USD amounts use integer micros with decimal-rate multiplication and one rounding step. Conversion failures remain pending and retry after five minutes; supported conversions never block chat processing. These are gross purchase estimates, not creator payout amounts after YouTube fees or refunds.

The service commits an ingestion batch's accepted votes, donations, score changes and resume position in one transaction. SQLite uses WAL with FULL synchronization. Viewer XP is stored in separate rows; live ingestion clones working collections once per batch instead of once per vote. The database enforces unique stream/message IDs after the rolling visual buffer has expired. SSE sends new recent votes with compact scoreboard state around every 100 ms; analytics refreshes independently every three seconds only while open. Animations remain bounded and cannot change score accounting. Analytics metric transitions respect reduced-motion preferences.

Back up the database after stopping the local service, or use SQLite's supported online backup mechanism. Do not copy just the main database file while it is running: committed updates may still be in its WAL file. Keep the active database local rather than synchronizing a live database through OneDrive.

Validation: `npm test`, `npx tsc --noEmit`, `npm run build`. Run `node --import tsx scripts/benchmark-processing.ts` for an isolated synthetic benchmark: 144,000 historical votes across 5,000 viewers, then 5 messages/second for a minute and a 50 messages/second burst. It reports transaction latency and checks stored event counts and durable duplicate protection. This does not measure YouTube delivery latency or OBS/browser rendering. Real paid-event ingestion and OBS audio/animation behavior still require a live-channel check.
