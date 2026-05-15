# Spotify Web Controller

A lightweight web-based Spotify controller with in-browser playback. No backend required — runs entirely client-side using the Spotify Web API and Web Playback SDK.

## Features

- **In-browser playback** — streams audio directly via the Web Playback SDK (Spotify Premium required)
- **Auto-activates** — registers as a Spotify Connect device on launch, no need to open Spotify elsewhere
- **Search** — find tracks, artists, albums, and playlists with smart result ordering
- **Queue** — view your current queue and add tracks from search results
- **Library** — browse your playlists and saved albums
- **Playback controls** — play/pause, skip, previous, shuffle, repeat, seek
- **Volume control** — popup slider accessible from the player
- **Device switching** — transfer playback between Spotify Connect devices
- **Like/unlike** — save or remove the currently playing track
- **Album art colors** — dynamic background gradient extracted from artwork
- **PWA support** — installable as a progressive web app on mobile

## Setup

1. Create a Spotify app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Select "Web API" and "Web Playback SDK" as APIs
3. Add your redirect URI (e.g. `http://127.0.0.1:8000/index.html` for local dev)
4. Update the `clientId` in `spotify-handler.js` with your app's client ID
5. Add your Spotify account under "User Management" in the app dashboard

## Running locally

```bash
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/index.html`

## Authentication

Uses the Authorization Code with PKCE flow — no client secret needed. Tokens are stored in cookies and automatically refreshed.

## Tech stack

- Vanilla JavaScript (no frameworks, no build step)
- Spotify Web API (stripped wrapper, ~9KB)
- Spotify Web Playback SDK
- Material Icons (Google Fonts CDN)
- Vibrant.js for color extraction

## License

See [LICENSE](LICENSE)
