/* ============================================================================
   Market Chronicles — journey configuration
   ----------------------------------------------------------------------------
   THIS IS THE ONE PLACE TO RETUNE THE SCROLL JOURNEY.

   Scroll progress (0 → 1) drives the hero video's currentTime linearly, so a
   section's `from`/`to` scroll fractions ARE the fractions of the footage it
   is pinned to. Video time  =  progress * VIDEO.duration.

   To move a section to a different moment in the footage, change its `from`/
   `to`. To make the whole journey longer/shorter to scroll, change
   SCRUB.scrollScreens. Nothing here needs code changes elsewhere.
   ========================================================================= */

export interface Section {
  /** Must match the overlay's `data-section` attribute in index.html. */
  id: string;
  /** Human label — for reference only; the visible copy lives in index.html. */
  label: string;
  /** Scroll fraction where the overlay begins to appear (0–1). */
  from: number;
  /** Scroll fraction where the overlay has fully faded out (0–1). */
  to: number;
}

/* --- The video + fallback frame sequence ---------------------------------- */
export const VIDEO = {
  src: "/media/scroll-scrub.mp4",
  poster: "/media/poster.jpg",
  /** Actual duration of the re-encoded file, in seconds. */
  duration: 15.0,
  /** iOS canvas-fallback frame sequence (see README for the ffmpeg command). */
  frameCount: 180,
  framePath: (i: number) =>
    `/frames/frame_${String(i + 1).padStart(4, "0")}.webp`,
};

/* --- Scrub feel ------------------------------------------------------------ */
export const SCRUB = {
  /** rAF linear-interpolation factor toward the target time. Higher = snappier,
   *  lower = more weighted/filmic. Tuned by feel. */
  lerp: 0.1,
  /** How tall the scroll spacer is, in viewport heights. More screens = the
   *  15s of footage is spread over a longer, calmer scroll. */
  scrollScreens: 8,
  /** Below this |target − current| (seconds) we stop nudging currentTime, to
   *  avoid churning the decoder when effectively at rest. */
  settleEpsilon: 0.004,
};

/* --- Section → scroll (→ footage) mapping ---------------------------------
   Confirmed mapping. `from`/`to` are fractions of the whole journey; because
   scroll maps linearly to video time, they are also the fractions of the 15s
   of footage each section is pinned to (e.g. cover = 0.08–0.33 → ~1.2s–5.0s).
   Retune a section's moment by editing its `from`/`to`. The visible copy and
   each section's data module live in index.html, keyed by the same `id`.     */
export const SECTIONS: Section[] = [
  { id: "opening", label: "Opening title", from: 0.0, to: 0.08 },
  { id: "cover", label: "Cover Story — The AI Stack", from: 0.08, to: 0.33 },
  { id: "house-views", label: "The Neo House View", from: 0.33, to: 0.46 },
  { id: "life-edit", label: "The Life Edit", from: 0.46, to: 0.76 },
  { id: "global-circuits", label: "Global Circuits", from: 0.76, to: 0.93 },
  { id: "books", label: "The Shelf — Books", from: 0.93, to: 1.0 },
];
