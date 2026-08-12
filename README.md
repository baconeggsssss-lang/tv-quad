# News Live Quad View

Static web app that shows 6 live news streams at once:

- Al Jazeera English / TRT World
- DW News / FRANCE 24
- CNA / NTN24
- CNN / ABC News
- RTVE 24H / Africanews English / Euronews English
- CCTV13 / Phoenix InfoNews / WION LIVE

## Behavior

- All 6 streams load simultaneously.
- Closed captions are forced off by default.
- Only one stream has audio at any moment.
- Click a channel header to switch audio to that stream.
- After each click, 10-minute rotation restarts from the selected stream.
- Al Jazeera tile auto-switches between Al Jazeera English and TRT World every 8 minutes while muted.
- Use the inline `Switch AJ/TRT` button next to the Al Jazeera title for instant switch.
- DW tile auto-switches between DW News and FRANCE 24 every 8 minutes while muted.
- Use the inline `Switch DW/F24` button next to the DW title for instant switch.
- CNA tile auto-switches between CNA, NTN24, and TN every 8 minutes while muted.
- Use the inline `Switch CNA/NTN24/TN` button next to the CNA title for instant switch.
- CNN tile auto-switches between CNN and ABC News Australia every 8 minutes while muted.
- Use the inline `Switch CNN/ABC` button next to the CNN title for instant switch.
- RTVE/Africanews/Euronews tile auto-switches in this order while muted: RTVE 24H (8 minutes), Africanews English (8 minutes), Euronews English (8 minutes).
- Use the inline `Switch RTVE/AF/EN` button next to the title for instant switch.
- This tile auto-switches in this order while muted: CCTV13 (8 minutes), Phoenix InfoNews (8 minutes), WION LIVE (8 minutes).
- Use the inline `Switch CCTV13/PHX/WION` button next to the title for instant switch.
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

## Run

Serve this folder with any static server (do not use `file://` directly, YouTube embeds can fail there).

Example:

```powershell
python -m http.server 8080
```

Then open: `http://localhost:8080`
