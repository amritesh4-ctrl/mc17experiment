/* ============================================================================
   Market Chronicles — hero scrub engine
   ----------------------------------------------------------------------------
   ONE shared progress value (0 → 1) is produced from scroll position. Two
   render paths consume it and neither the rest of the app nor the overlay
   code knows or cares which is active:

     • video path   — a muted <video>, currentTime eased toward the target
                       inside requestAnimationFrame (never set in the scroll
                       handler). Weighted via linear interpolation.
     • canvas path  — iOS Safari scrubs <video> unreliably, so we draw a
                       pre-extracted WebP frame sequence to a <canvas>, indexed
                       by the very same progress value.

   prefers-reduced-motion skips scrubbing entirely: the poster frame is shown
   and the document behaves as a normal scrolling page.
   ========================================================================= */

import { VIDEO, SCRUB } from "./config.ts";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Shared, read-only-ish progress the whole page keys off of. */
export const state = { progress: 0, ready: false };

const isIOS = (): boolean => {
  const ua = navigator.userAgent;
  const iOSDevice = /iPhone|iPad|iPod/.test(ua);
  // iPadOS 13+ masquerades as desktop Safari; sniff touch + Mac.
  const iPadOS =
    navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) && !("MSStream" in window);
  const forced = new URLSearchParams(location.search).has("frames");
  return iOSDevice || iPadOS || forced;
};

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* --- Scroll → progress (the ONLY producer of state.progress) --------------- */
function trackProgress(track: HTMLElement): number {
  const rect = track.getBoundingClientRect();
  const scrollable = track.offsetHeight - window.innerHeight;
  if (scrollable <= 0) return 0;
  return clamp(-rect.top / scrollable);
}

interface InitOptions {
  track: HTMLElement;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  loader: HTMLElement;
  /** Called on every animation frame with the eased progress (0–1). */
  onFrame: (progress: number) => void;
}

export function initScrub(opts: InitOptions): void {
  const { track, video, canvas, loader, onFrame } = opts;
  const root = document.documentElement;

  // A scroll listener that does nothing but stash the raw target progress.
  let rawProgress = 0;
  const readScroll = () => {
    rawProgress = trackProgress(track);
  };
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", readScroll, { passive: true });
  readScroll();

  /* ---- Reduced motion: no scrub. Poster + a normal stacked page. --------- */
  if (prefersReducedMotion()) {
    root.classList.add("is-reduced");
    loader.hidden = true;
    video.hidden = true; // poster is painted by CSS background on the stage
    state.ready = true;
    // Overlays are stacked by CSS; main.ts activates every data module once.
    onFrame(-1); // sentinel: caller resolves all sections to their static state
    return;
  }

  if (isIOS()) {
    root.classList.add("path-canvas");
    initCanvasPath({ track, canvas, video, loader, onFrame });
  } else {
    root.classList.add("path-video");
    initVideoPath({ video, loader, onFrame, getRaw: () => rawProgress });
  }
}

/* ==========================================================================
   VIDEO PATH
   ======================================================================== */
function initVideoPath(o: {
  video: HTMLVideoElement;
  loader: HTMLElement;
  onFrame: (p: number) => void;
  getRaw: () => number;
}) {
  const { video, loader, onFrame, getRaw } = o;
  let current = 0; // eased currentTime we are driving toward the target
  let enabled = false;

  const enable = () => {
    if (enabled) return;
    enabled = true;
    state.ready = true;
    loader.hidden = true;
    document.documentElement.classList.add("is-ready");
  };

  // Wait for a fully buffered, seekable video before enabling the scrub.
  const check = () => {
    if (video.readyState >= 4) enable();
  };
  video.addEventListener("canplaythrough", enable, { once: true });
  video.addEventListener("loadeddata", check);
  video.addEventListener("progress", check);
  // Safety net: some browsers are shy with canplaythrough on muted preload.
  const poll = window.setInterval(() => {
    check();
    if (enabled) window.clearInterval(poll);
  }, 250);

  video.load();

  const frame = () => {
    const target = getRaw() * VIDEO.duration;
    if (enabled) {
      current += (target - current) * SCRUB.lerp;
      if (Math.abs(target - current) < SCRUB.settleEpsilon) current = target;
      // The ONLY place currentTime is assigned — inside rAF, eased.
      if (video.seekable.length > 0) {
        try {
          video.currentTime = current;
        } catch {
          /* seeking mid-seek can throw on some engines; ignore and retry next frame */
        }
      }
    }
    onFrame(clamp(current / VIDEO.duration));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ==========================================================================
   CANVAS PATH (iOS fallback) — same progress value, frames instead of video
   ======================================================================== */
function initCanvasPath(o: {
  track: HTMLElement;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  loader: HTMLElement;
  onFrame: (p: number) => void;
}) {
  const { track, canvas, video, loader, onFrame } = o;
  video.hidden = true; // the <video> is unused on this path
  const ctx = canvas.getContext("2d")!;
  const frames: HTMLImageElement[] = [];
  let loaded = 0;
  let currentIdx = 0;

  const label = loader.querySelector("[data-loader-pct]") as HTMLElement | null;

  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  };
  sizeCanvas();
  window.addEventListener("resize", () => {
    sizeCanvas();
    draw(currentIdx, true);
  });

  const draw = (idx: number, force = false) => {
    const i = clamp(Math.round(idx), 0, VIDEO.frameCount - 1);
    if (!force && i === currentIdx && state.ready) return;
    currentIdx = i;
    const img = frames[i];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    // object-fit: cover
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  };

  // Preload the whole (small) sequence, reporting progress.
  for (let i = 0; i < VIDEO.frameCount; i++) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      loaded++;
      if (label)
        label.textContent = `${Math.round((loaded / VIDEO.frameCount) * 100)}%`;
      if (loaded === 1) draw(0, true); // first frame ASAP
      if (loaded === VIDEO.frameCount) {
        state.ready = true;
        loader.hidden = true;
        document.documentElement.classList.add("is-ready");
      }
    };
    img.src = VIDEO.framePath(i);
    frames[i] = img;
  }

  let currentF = 0; // eased frame index
  const frame = () => {
    const target = clamp(
      (-track.getBoundingClientRect().top) /
        (track.offsetHeight - window.innerHeight)
    ) * (VIDEO.frameCount - 1);
    currentF += (target - currentF) * SCRUB.lerp;
    draw(currentF);
    onFrame(clamp(currentF / (VIDEO.frameCount - 1)));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
