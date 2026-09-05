# Flag Arena

A 1080 × 1920 country scoreboard for YouTube chat voting. Includes a demo studio, OBS overlay and local YouTube reader.

## Start on Windows

Double-click **Start Flag Arena.cmd**, then open http://127.0.0.1:4318/. Node.js 22.13 or later is required. Keep the app running during your stream.

1. Click **Start demo** or enter a test vote to try the scoreboard.
2. In OBS add a **Browser Source**, URL `http://127.0.0.1:4318/?overlay=1`, width **1080**, height **1920**.
3. Start your YouTube livestream with live chat enabled. Enter its URL and a YouTube Data API v3 key in **Connect YouTube**.

The hosted private preview is demo-only. Use the local app for YouTube and OBS: the local server shares scores across your browser and OBS, and keeps the API key only in memory. No channel password is needed. This app reads chat; it does not start or publish a YouTube broadcast.

## Votes

- One country name (English), supported alias, flag emoji, or `!vote ID` gives one point.
- One accepted vote per YouTube channel ID every 10 seconds, across all countries.
- Multiple different countries, ordinary chat and paid events are ignored. Repeating a flag in one message still gives only one point.
- All ISO-listed countries/territories can receive votes. The overlay shows the leading 60; unranked ties sort alphabetically.
- New connections skip initial chat history. Reconnecting the same video preserves its scores; a different video starts at zero.
- Demo and live scores are separate. Disconnect returns to demo. Live scores are retained for reconnecting.
- Scores are saved in `.arena/state.json`. Reset requires confirmation; it preserves cooldowns and duplicate tracking. Reset during a stream starts counting from that moment.

## YouTube setup and limits

Create a Google Cloud project, enable **YouTube Data API v3**, and create an API key restricted to that API. Enter it in the local app, never in a public chat or screenshot. A public or accessible unlisted stream must have an active live chat. Private streams may require OAuth, which this version does not implement.

The reader uses YouTube's documented paginated `liveChatMessages.list` endpoint and respects `pollingIntervalMillis`. API quotas apply and polling can exhaust a daily quota; monitor your Google Cloud quota before a long broadcast. Google recommends `streamList` for more efficient continuous delivery; this first version implements the simpler polling reader. API or network failures stop the reader and appear in the control panel; reconnect to resume. Messages sent while disconnected may be skipped.

Official references: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list and https://developers.google.com/youtube/v3/docs/videos#liveStreamingDetails.activeLiveChatId

## Development

`npm run dev` starts the frontend at http://127.0.0.1:3000/. Run `npm start` separately for its local chat service. `npm run build` creates the production frontend. `npm test` checks parsing, duplicate protection, cooldown rules and YouTube URL validation.

Real YouTube ingestion and OBS display require a live stream and local OBS setup and have not yet been verified against this channel.

The optional WebMCP tools expose score readback and demo voting. A supported WebMCP browser was not available for contract verification; ordinary controls do not require WebMCP.
