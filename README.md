# Flag Arena

A 1080 × 1920 country scoreboard for YouTube chat voting. Includes a demo studio, OBS overlay and local YouTube reader.

## Start on Windows

Double-click **Start Flag Arena.cmd**, then open http://127.0.0.1:4318/. Node.js 22.13 or later is required. Keep the app running during your stream.

1. Click **Start demo** or enter a test vote to try the scoreboard.
2. In OBS add a **Browser Source**, URL `http://127.0.0.1:4318/?overlay=1`, width **1080**, height **1920**.
3. Start your YouTube livestream with live chat enabled. Enter its URL and a YouTube Data API v3 key in **Connect YouTube**.

The hosted private preview is demo-only. Use the local app for YouTube and OBS: the local server shares scores across your browser and OBS, and keeps the API key only in memory. No channel password is needed. This app reads chat; it does not start or publish a YouTube broadcast.

## Votes

- One country name (English), supported alias, flag emoji, or `!vote ID` gives 100 points.
- One accepted vote per YouTube channel ID every 10 seconds, across all countries.
- Multiple different countries, ordinary chat and paid events are ignored. Repeating a flag in one message still gives only 100 points.
- All ISO-listed countries/territories can receive votes. The overlay shows the leading 120; unranked ties sort alphabetically.
- New connections skip initial chat history. Reconnecting the same video preserves its scores; a different video starts at zero.
- Demo and live scores are separate. Disconnect returns to demo. Live scores are retained for reconnecting.
- Scores are saved in `.arena/state.json`. Reset requires confirmation; it preserves cooldowns and duplicate tracking. Reset during a stream starts counting from that moment.

## YouTube setup and limits

Create a Google Cloud project, enable **YouTube Data API v3**, and create an API key restricted to that API. Enter it in the local app, never in a public chat or screenshot. A public or accessible unlisted stream must have an active live chat. Private streams may require OAuth, which this version does not implement.

The reader uses YouTube’s `liveChatMessages.streamList` over a TLS-protected gRPC connection. It resumes with the latest `nextPageToken` after temporary network failures, with retries spaced from 2 seconds up to 60 seconds. Initial history older than the connection time is ignored, while replayed accepted messages remain protected by duplicate tracking. Ended chats, invalid credentials, and quota/rate-limit errors stop the reader and appear in the control panel. Quotas still apply; streaming does not guarantee unlimited or 24/7 access. Restarting the app requires entering the key again and reconnecting; keys are not saved.

Official references: https://developers.google.com/youtube/v3/live/streaming-live-chat and https://developers.google.com/youtube/v3/docs/videos#liveStreamingDetails.activeLiveChatId

## Development

`npm run dev` starts the frontend at http://127.0.0.1:3000/. Run `npm start` separately for its local chat service. `npm run build` creates the production frontend. `npm test` checks parsing, duplicate protection, cooldown rules and YouTube URL validation.

Real YouTube ingestion and OBS display require a live stream and local OBS setup and have not yet been verified against this channel.

The optional WebMCP tools expose score readback and demo voting. A supported WebMCP browser was not available for contract verification; ordinary controls do not require WebMCP.

## V2
Each accepted vote awards 100 points. Existing v1 scores are converted once at load (1 old vote = 100 points). The latest voter sits below the leader; recent votes trigger a 1.6-second gold glow without enlargement and 2.6-second name-only popup. Like +500 and Subscribe +1,000 banners are informational only and never award points.

## YouTube request diagnostics

Open `http://127.0.0.1:4318/api/diagnostics` for local request-attempt counts, received batches/messages, and the last 100 connection events. Counts persist in `.arena/youtube-diagnostics.json`; they are not Google quota units and cannot reconstruct past usage. Keys, chat text, viewer identities and resume tokens are not logged.

Automatic reconnect backoff resets only after a stream has stayed open for at least 30 seconds. At most 8 stream attempts are made within 10 minutes per connection session before stopping for manual inspection. Quota errors stop immediately.
