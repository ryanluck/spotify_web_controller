# Spotify Web Controller

A lightweight web-based Spotify controller with optional in-browser playback. No backend required — runs entirely client-side using the Spotify Web API and Web Playback SDK.

## Features

- **Remote controller mode** — control Spotify on any device without streaming audio locally (ideal for low-memory devices)
- **In-browser playback** — optionally stream audio directly via the Web Playback SDK (Spotify Premium required)
- **Fullscreen Art mode** — album artwork as background with large controls, designed for small/wide screens
- **Auto-hide controls** — controls fade out after inactivity, tap to toggle
- **Search** — find tracks, artists, albums, and playlists with smart result ordering
- **Queue** — view your current queue and add tracks from search results
- **Library** — browse your playlists and saved albums
- **Playback controls** — play/pause, skip, previous, shuffle, repeat, seek
- **Volume control** — full-height slider on the right side
- **Device switching** — transfer playback between Spotify Connect devices
- **Like/unlike** — save or remove the currently playing track (when API permits)
- **Album art colors** — dynamic background gradient extracted from artwork (Standard mode)
- **PWA support** — installable as a fullscreen progressive web app
- **Settings** — display mode, idle mode, device name, playback capability checks

## Setup

1. Create a Spotify app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Select "Web API" and "Web Playback SDK" as APIs
3. Add your redirect URI (e.g. `http://127.0.0.1:8000/index.html` for local dev, or your GitHub Pages URL)
4. Update the `clientId` in `spotify-handler.js` with your app's client ID
5. Add your Spotify account under "User Management" in the app dashboard

## Running locally

```bash
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/index.html`

## Deployment

The app auto-deploys to GitHub Pages via GitHub Actions on push to `main`. The build commit hash is injected automatically during deployment.

## Authentication

Uses the Authorization Code with PKCE flow — no client secret needed. Tokens are stored in cookies with `SameSite=Strict` and automatically refreshed.

## Tech stack

- Vanilla JavaScript (no frameworks, no build step)
- Spotify Web API (stripped wrapper, ~9KB)
- Spotify Web Playback SDK (optional)
- Material Icons (Google Fonts CDN)
- Vibrant.js for color extraction
- Content Security Policy for XSS protection
- GitHub Actions for CI/CD

## License

See [LICENSE](LICENSE)
