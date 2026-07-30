# News Live Quad View

Static web app that shows 6 live news streams at once:

- Al Jazeera English / TRT World
- DW News / FRANCE 24
- CNA / NTN24
- CNN / ABC News
- Euronews English / Espanol
- CGTN / Phoenix InfoNews / TVBS News

## Behavior

- All 6 streams load simultaneously.
- Closed captions are forced off by default.
- Only one stream has audio at any moment.
- Click a channel header to switch audio to that stream.
- After each click, 10-minute rotation restarts from the selected stream.
- Al Jazeera tile auto-switches between Al Jazeera English and TRT World every 11 minutes.
- Use the inline `Switch AJ/TRT` button next to the Al Jazeera title for instant switch.
- DW tile auto-switches between DW News and FRANCE 24 every 11 minutes.
- Use the inline `Switch DW/F24` button next to the DW title for instant switch.
- CNA tile auto-switches between CNA and NTN24 every 11 minutes.
- Use the inline `Switch CNA/NTN24` button next to the CNA title for instant switch.
- CNN tile auto-switches between two CNN live sources every 11 minutes.
- Use the inline `Switch CNN/ABC` button next to the CNN title for instant switch.
- Euronews tile auto-switches between English and Espanol every 11 minutes.
- Use the inline `Switch EN/ES` button next to the Euronews title for instant switch.
- This tile auto-switches with weighted timing: CGTN (6 minutes), Phoenix InfoNews (3 minutes), TVBS News (2 minutes), total 11 minutes.
- Use the inline `Switch CGTN/PHX/TVBS` button next to the title for instant switch.
- Every variant tile shows its own per-tile `Next switch in mm:ss` countdown.
- Each tile header shows a subtle region local-time label for the currently active source.
- Variant tiles are forced to alternate sub-channels only when audio focus arrives via automatic rotation (not manual switching).
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
