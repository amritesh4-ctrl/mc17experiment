# Market Chronicles — scroll-driven journey

A single-page, scroll-scrubbed film for Neo Group's *Market Chronicles* (Edition 17).
One continuous macro video is **scrubbed by scroll position** (never played), and
each section fades in over the moment of footage it matches, carrying a small
**interactive data module** and a link out to its full page (to be built later).

- Plain **Vite + vanilla TypeScript** — no UI framework, no GSAP. The scrub is a
  hand-rolled `requestAnimationFrame` loop with linear interpolation.
- Self-hosted fonts, one design-token file, static flat-file build.

---

## Run it

Node/npm are **not on PATH** in this environment; a portable Node lives at
`C:\Users\AmriteshMishra\Downloads\node`. Prepend it, then:

```bash
npm install        # once
npm run dev        # dev server → http://localhost:5180
npm run build      # type-check + production build → dist/ (flat files)
npm run preview    # serve the built dist/ on :4173
```

`dist/` is deployable to Netlify or Vercel as-is (static, no server). `public/`
(video, frames, fonts, logos, favicons) is copied to the site root at build time.

---

## Where the important things live

| Thing | File |
|---|---|
| **Section → scroll → footage timing** | `src/config.ts` → `SECTIONS` (and `SCRUB`) |
| **Scrub engine** (rAF lerp, video + iOS canvas paths, loader, reduced-motion) | `src/scrub.ts` |
| **Overlay fade + active-section detection** | `src/main.ts` |
| **Interactive data modules** (scorecard, returns, lenses, timeline, shelf) | `src/viz.ts` |
| **Section copy + data points** (as real HTML) | `index.html` |
| **Palette + type scale + `@font-face`** | `src/styles/tokens.css` |
| **Layout + chart styles + fallbacks** | `src/styles/main.css` |
| Video, poster, iOS frames, fonts, logos, favicons | `public/` |

---

## The scroll → timecode mapping (retune here)

Scroll progress (0 → 1) drives the video's `currentTime` **linearly**, so a
section's `from`/`to` scroll fractions *are* the fractions of the 15 s of footage
it is pinned to. Everything is in one object at the top of **`src/config.ts`**:

```ts
export const SECTIONS = [
  { id: "opening",         label: "Opening title",        from: 0.00, to: 0.08 },
  { id: "cover",           label: "Cover Story — AI Stack", from: 0.08, to: 0.33 }, // → ~1.2s–5.0s
  { id: "house-views",     label: "The Neo House View",    from: 0.33, to: 0.46 },
  { id: "life-edit",       label: "The Life Edit",         from: 0.46, to: 0.76 },
  { id: "global-circuits", label: "Global Circuits",       from: 0.76, to: 0.93 },
  { id: "books",           label: "The Shelf — Books",     from: 0.93, to: 1.00 },
];
```

- To pin a section to a **different moment in the footage**, change its `from`/`to`.
  Footage time ≈ `fraction × VIDEO.duration` (15 s).
- Each `id` must match a `data-section="…"` overlay in `index.html`.
- `SCRUB` in the same file tunes the feel:
  - `lerp` (default `0.1`) — how weighted the scrub is (lower = heavier/filmier).
  - `scrollScreens` (default `8`) — how many viewport-heights the journey spans
    (higher = the 15 s spreads over a longer, calmer scroll with more dwell to
    interact with each chart).

---

## Fonts (self-hosted, no Google CDN)

Two typefaces only, defined **once** in `src/styles/tokens.css`:

- `--font-primary` → **Montserrat** 400 / 500 / 600 (everything: nav, headings,
  body, buttons, labels, data).
- `--font-accent` → **Instrument Serif** 400 regular + italic (rare: the opening
  headline, the cover title, and key statistics as display figures — never bolded,
  `font-synthesis: none`).

The `.woff2` files are latin-subset copies from the `@fontsource` packages, living
in `public/fonts/`. The above-the-fold weights are `<link rel="preload">`-ed in
`index.html`. Fallback stacks are metric-compatible so the swap doesn't shift layout.
Nothing else in the codebase hardcodes a font family, colour, or size — it all reads
from the custom properties in `tokens.css`.

---

## The video: ffmpeg commands

`ffmpeg`/`ffprobe` were installed with `winget install --id Gyan.FFmpeg`. The source
was `assets/scroll vid.mp4` (1920×1080, H.264, 60 fps, 15.07 s, ~20 MB).

**1 · Re-encode for smooth scrubbing.** The source had only 24 irregular keyframes
(gaps up to 3.7 s), which stutters when seeking. Re-encode to ~1 keyframe every 10
frames, strip audio, and add `+faststart`:

```bash
ffmpeg -i "assets/scroll vid.mp4" -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -g 10 -keyint_min 10 -sc_threshold 0 \
  -crf 19 -preset slow -movflags +faststart \
  public/media/scroll-scrub.mp4
```
Result: 89 keyframes, 18.9 MB. (Verify with
`ffprobe -select_streams v:0 -show_entries frame=pict_type -of csv public/media/scroll-scrub.mp4 | grep -c ",I$"`.)

**2 · Poster** (first frame — matches the opening void):

```bash
ffmpeg -i public/media/scroll-scrub.mp4 -frames:v 1 -q:v 3 public/media/poster.jpg
```

**3 · Mobile frame-sequence path.** Scrubbing 1080p60 `<video>` via `currentTime` is
slow to seek on **all** mobile GPUs (not just iOS) — it lags a second or two behind
the scroll. So every touch-primary device (iOS + Android; `(hover: none) and
(pointer: coarse)`) takes a canvas path that draws a pre-extracted WebP sequence
indexed by the same progress value; desktop keeps the real video. Override with
`?frames=1` / `?video=1`. 360 frames @ 24 fps, 960 px wide (~6.3 MB total). Higher
fps = crisper scrub motion; raise/lower `fps=` to trade smoothness against download,
and keep `VIDEO.frameCount` in `src/config.ts` in sync with the number written:

```bash
ffmpeg -i public/media/scroll-scrub.mp4 -vf "fps=24,scale=960:-2" \
  -c:v libwebp -quality 80 -f image2 public/frames/frame_%04d.webp
```

**4 · Favicons** (from the Neo Group logo, on the indigo brand colour):

```bash
ffmpeg -i public/logos/neo-light.png -vf "scale=48:-1,pad=64:64:(ow-iw)/2:(oh-ih)/2:color=0x231A3D"   -frames:v 1 public/favicon.png
ffmpeg -i public/logos/neo-light.png -vf "scale=140:-1,pad=180:180:(ow-iw)/2:(oh-ih)/2:color=0x231A3D" -frames:v 1 public/apple-touch-icon.png
```

### Swapping in a new video

1. Run command **1** on the new source → overwrite `public/media/scroll-scrub.mp4`.
2. Run commands **2** and **3** → refresh `public/media/poster.jpg` and
   `public/frames/`.
3. In `src/config.ts`, set `VIDEO.duration` to the new length (`ffprobe -show_entries
   format=duration …`) and `VIDEO.frameCount` to the number of WebP frames written.
4. Re-check the `SECTIONS` `from`/`to` so each section still lands on the intended
   footage moment.

---

## Editing a section's data

The numbers are authored as plain HTML in `index.html` and enhanced by `src/viz.ts`:

- **Cover — scorecard**: `<ul class="bars">`, each `<li data-value="0–100"
  data-note="…">`.
- **House Views — returns**: `<ul class="returns">`, each `<li data-label
  data-values="1M,3M,6M,1Y">`; an `sr-only` table mirrors it for screen readers.
- **Life Edit — lenses**: `.lens-tabs` buttons + `.lens-panel`s (auto-rotates).
- **Global Circuits — timeline**: `<ol class="timeline">`, each `<li data-when
  data-place data-why>` (auto-advances).
- **Books — shelf**: `.shelf-head` buttons + `.shelf-why` (accordion).

Each section's "read the full …" link points at a placeholder route
(`/cover-story`, `/house-views/equity`, …) for the full article pages to be built later.

---

## Accessibility & resilience

- **prefers-reduced-motion** — skips the scrub entirely, shows the poster still, and
  renders every section as a normal stacked scrolling page with charts in their
  resolved state.
- **No JavaScript** — a `<noscript>` note explains the sequence; sections, headings
  and the `sr-only` data tables remain in the DOM and readable.
- **Slow connections** — first paint is never blocked on the video or fonts; the
  poster + opening title show immediately, the video loads in the background behind a
  minimal loader that waits for `readyState 4` / `canplaythrough`.
- Keyboard-operable charts (tabs, timeline nodes, accordion), correct heading order,
  visible focus rings, `aria-live` on the timeline card, semantic tables.
