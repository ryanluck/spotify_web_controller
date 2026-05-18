# Spotify Controller Android App Plan

## Overview

Rebuild the web controller as a native Android app using the Spotify App Remote SDK for real-time playback control (no polling, no rate limits) and the Web API for search/queue/library features.

## Architecture

**Two layers:**
1. **Spotify App Remote SDK** — Controls playback, gets real-time state (no API calls, no rate limits)
2. **Spotify Web API** — Search, queue, library (on-demand only, minimal requests)

## Tech Stack

- **Language:** Java
- **Min SDK:** 21 (Android 5.0)
- **Target device:** Echo Show 2 running LineageOS (960x480 screen)
- **Dependencies:**
  - `com.spotify.android:auth` — Authentication
  - `com.spotify.android:app-remote` — Playback control & state
  - `com.squareup.okhttp3:okhttp` — Web API calls (search/queue/library)
  - `com.github.bumptech.glide:glide` — Image loading
  - AndroidX Palette — Color extraction from album art

## Phase 1: Core Player (MVP)

- [ ] Set up Android project (Java, single Activity, Gradle)
- [ ] Integrate Spotify App Remote SDK
- [ ] Connect to Spotify app on launch
- [ ] Display: album art (fullscreen background), title, artist, progress bar
- [ ] Controls: play/pause, skip, previous, shuffle, repeat
- [ ] Real-time state updates via PlayerState callbacks
- [ ] Idle mode: auto-hide controls after 10s, tap to toggle
- [ ] Wake lock: keep screen on while playing
- [ ] Fullscreen (no status bar, no navigation bar)

**Result:** Equivalent to web controller's player page, zero polling.

## Phase 2: Search & Queue

- [ ] Integrate Web API (PKCE auth)
- [ ] Search: artists, tracks, albums, playlists
- [ ] Smart result ordering (artist match → artists first)
- [ ] Add to queue button on search results
- [ ] View current queue (GET /me/player/queue)
- [ ] Close search/queue on track selection

**Result:** Full feature parity with web version for search/queue.

## Phase 3: Library & Settings

- [ ] Browse playlists and saved albums
- [ ] Infinite scroll for library
- [ ] Settings screen:
  - Display mode (standard / fullscreen art)
  - Idle mode (with progress bar / title only)
  - Keep screen on toggle
  - Darken background toggle
- [ ] Device switching (Web API, on-demand)
- [ ] Volume control (vertical slider)

## Phase 4: Polish

- [ ] Fullscreen art mode with gradient overlay
- [ ] Color extraction from album art (Palette API)
- [ ] Smooth transitions for idle mode
- [ ] Album art resize animation
- [ ] Handle Spotify app not installed / not logged in
- [ ] Build version display in settings
- [ ] Dark theme (match web version colors)

## Key Advantages Over Web Version

| Feature | Web Version | Android Version |
|---------|-------------|-----------------|
| Playback state | Polling every 5s | Real-time callbacks |
| Rate limits | Major issue in dev mode | None for playback |
| Memory usage | Browser + JS + SDK | Lightweight native |
| Audio playback | Web Playback SDK (optional) | Spotify app handles it |
| Auth | PKCE + cookies | SDK handles via Spotify app |
| Screen control | Wake Lock API (limited) | Full wake lock + immersive mode |
| Install | URL bookmark / PWA | APK sideload |
| Startup | Page load + auth check | Instant launch |

## Spotify App Remote SDK Key APIs

```java
// Connect
SpotifyAppRemote.connect(context, connectionParams, connectionListener);

// Control playback
mSpotifyAppRemote.getPlayerApi().play("spotify:playlist:xxxxx");
mSpotifyAppRemote.getPlayerApi().pause();
mSpotifyAppRemote.getPlayerApi().skipNext();
mSpotifyAppRemote.getPlayerApi().skipPrevious();
mSpotifyAppRemote.getPlayerApi().setShuffle(true);
mSpotifyAppRemote.getPlayerApi().setRepeat(RepeatMode.ALL);

// Subscribe to state changes (real-time, no polling)
mSpotifyAppRemote.getPlayerApi().subscribeToPlayerState()
    .setEventCallback(playerState -> {
        // Update UI with track info, progress, play state
        Track track = playerState.track;
        // track.name, track.artist.name, track.album.name
        // track.imageUri — for album art
        // playerState.isPaused, playerState.playbackPosition
    });

// Get album art
mSpotifyAppRemote.getImagesApi().getImage(track.imageUri)
    .setResultCallback(bitmap -> {
        // Use bitmap for background
    });
```

## Web API (for search/queue/library only)

Same endpoints as web version:
- `GET /v1/search` — search
- `GET /v1/me/player/queue` — view queue
- `POST /v1/me/player/queue` — add to queue
- `GET /v1/me/playlists` — library
- `GET /v1/me/albums` — saved albums
- `GET /v1/me/player/devices` — device list
- `PUT /v1/me/player` — transfer playback

Auth: PKCE flow (same client ID, redirect via custom URI scheme)

## Project Structure

```
app/
├── src/main/java/com/example/spotifycontroller/
│   ├── MainActivity.java          — Main player UI
│   ├── SearchActivity.java        — Search UI
│   ├── QueueActivity.java         — Queue UI
│   ├── SettingsActivity.java      — Settings UI
│   ├── SpotifyService.java        — App Remote connection manager
│   ├── WebApiClient.java          — Web API wrapper (OkHttp)
│   └── AuthManager.java           — PKCE token management
├── src/main/res/
│   ├── layout/                    — XML layouts
│   ├── values/                    — Colors, strings, styles
│   └── drawable/                  — Icons, backgrounds
└── build.gradle                   — Dependencies
```

## Notes

- The Spotify app must be installed on the device
- App Remote SDK communicates via IPC (no network calls for playback)
- Web API calls are only for search/queue/library (user-initiated, not polled)
- Target screen: 960x480 landscape — design layouts accordingly
- Use immersive sticky mode for true fullscreen
