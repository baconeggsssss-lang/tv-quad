# News Live Quad View

A lightweight static web app that shows six live news streams at once from a rotating pool of 24 global channels. Each page load reshuffles the source mix, keeps one feed active with audio, and rotates muted variants automatically to mimic a live newsroom wall.

## Features

- 6 live video tiles displayed simultaneously
- 24 international news sources, reshuffled on every page load
- Six tiles receive four channels each
- Audio rotates across tiles on a 10-minute cycle
- Each muted tile rotates through its assigned channel set every 8 minutes
- Local time labels show the active source's region clock
- Closed captions are forced off by default
- One stream has audio at a time; clicking a tile switches focus
- Inline channel switch controls for each tile
- Keyboard shortcuts for quick playback control
- Pause/resume and mute-all controls for lower resource use

## Running locally

This project is a static site with no build step or package install required.

1. From the project folder, start a local web server:

```bash
python -m http.server 8080
```

2. Open the app in your browser:

```text
http://localhost:8080
```

Note: do not open the page directly via `file://` because embedded YouTube streams can fail in that mode.

## Controls

- Click a tile header to switch audio to that stream.
- Use the `Next audio now` button to jump to the next tile.
- Use `Pause all feeds` to unload all streams and save resources.
- Use `Resume all feeds` to reload them fresh.
- Use `Mute all` to silence all streams immediately.

### Keyboard shortcuts

- `1` through `6`: switch audio to the corresponding tile position
- `Space`: switch the AB sub-channel for the currently active tile
- `Enter`: move to the next audio tile immediately
- `Esc`: pause all feeds
- `R`: resume all feeds after pausing
- `M`: mute all audio

## Project structure

- `index.html` — page structure and UI templates
- `styles.css` — layout, tiles, controls, and responsive styling
- `app.js` — channel rotation logic, player behavior, and controls
- `README.md` — project overview and usage notes

## Notes

The app is intentionally browser-based and relies on embedded YouTube live streams. Availability, stream quality, and region labels can vary by source and network conditions.
