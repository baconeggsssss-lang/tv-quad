# News Live Quad View

Static web app that shows 6 live news streams at once from a pool of 18 channels.

## Behavior

- All 6 streams load simultaneously.
- All 18 channels are shuffled and regrouped on every page load.
- Each of the 6 tiles receives 3 channels.
- Closed captions are forced off by default.
- Only one stream has audio at any moment.
- Click a channel header to switch audio to that stream.
- After each click, 10-minute rotation restarts from the selected stream.
- Each tile auto-switches through its randomly assigned channels every 8 minutes while muted.
- Each tile's inline `Switch ...` control is generated from its current random channel group.
- Every variant tile shows its own per-tile `Next switch in mm:ss` countdown.
- Each tile header shows a subtle region local-time label for the currently active source.
- Variant tiles keep rotating every 8 minutes while muted, but when top-level audio auto-rotation lands on a tile it uses a separate fair-turn pointer so each sub-channel gets its turn with audio; manual audio switching does not force a sub-channel change.
- `Pause all feeds` unloads every stream to save resources.
- `Resume all feeds` reloads all streams fresh (like a page refresh), not from paused frame state.
- `Mute all` immediately mutes all tiles and clears active audio rotation.
- Keyboard shortcuts: press `1..6` (top row or numpad) to switch audio to tile positions:
  - `1 2 3`
  - `4 5 6`
- Keyboard shortcut: press `Space` to switch AB sub-channel only for the currently active (audio-on) variant tile.
- Keyboard shortcut: press `Enter` to trigger `Next audio now`.
- Keyboard shortcut: press `Esc` to trigger `Pause all feeds`.
- Keyboard shortcut: press `R` to resume all feeds after pausing.
- Keyboard shortcut: press `M` to mute all audio.

## Run

Serve this folder with any static server (do not use `file://` directly, YouTube embeds can fail there).

Example:

```powershell
python -m http.server 8080
```

Then open: `http://localhost:8080`
