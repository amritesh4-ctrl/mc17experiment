/* ============================================================================
   Market Chronicles — entry point
   Wires the scrub engine to the hero overlays. Overlays are authored as real
   HTML (so they exist without JS and for screen readers); this only eases
   their opacity/transform as the shared progress value passes their band.
   ========================================================================= */

import "./styles/tokens.css";
import "./styles/main.css";
import { SECTIONS, SCRUB } from "./config.ts";
import { initScrub } from "./scrub.ts";
import { initViz } from "./viz.ts";

const smoothstep = (t: number) => t * t * (3 - 2 * t);

interface Overlay {
  id: string;
  el: HTMLElement;
  from: number;
  to: number;
}

function bandOpacity(p: number, from: number, to: number): number {
  if (p < from || p > to) return 0;
  const span = to - from || 1;
  const t = (p - from) / span; // 0..1 within the band
  const fade = 0.32; // portion of the band spent fading in / out
  let o = 1;
  if (from > 0 && t < fade) o = t / fade; // fade in (skip if pinned to very top)
  else if (to < 1 && t > 1 - fade) o = (1 - t) / fade; // fade out (skip at very end)
  return smoothstep(Math.min(1, Math.max(0, o)));
}

function boot() {
  const track = document.getElementById("hero-track") as HTMLElement;
  const video = document.getElementById("hero-video") as HTMLVideoElement;
  const canvas = document.getElementById("hero-canvas") as HTMLCanvasElement;
  const loader = document.getElementById("hero-loader") as HTMLElement;

  const overlays: Overlay[] = SECTIONS.map((s) => ({
    id: s.id,
    el: document.querySelector(`[data-section="${s.id}"]`) as HTMLElement,
    from: s.from,
    to: s.to,
  })).filter((o) => o.el);

  const progressBar = document.getElementById("journey-progress");
  const scrollCue = document.getElementById("scroll-cue");

  // Interactive data modules, one per section. Activated when a section is the
  // dominant one on screen so its chart animates in (and resets on exit).
  const viz = initViz(document);
  let activeId: string | null = null;

  const onFrame = (progress: number) => {
    // Sentinel from the reduced-motion path: the page is stacked, so resolve
    // every section's data module to its static state and stop.
    if (progress < 0) {
      overlays.forEach((o) => {
        o.el.classList.add("is-active");
        viz.activate(o.id);
      });
      return;
    }

    let top: { id: string; op: number } = { id: "", op: 0 };
    for (const o of overlays) {
      const op = bandOpacity(progress, o.from, o.to);
      o.el.style.opacity = String(op);
      // A whisper of upward drift as an overlay resolves — kept subtle.
      const drift = (1 - op) * 14;
      o.el.style.transform = `translate3d(0, ${drift}px, 0)`;
      o.el.style.pointerEvents = op > 0.6 ? "auto" : "none";
      o.el.setAttribute("aria-hidden", op < 0.05 ? "true" : "false");
      o.el.classList.toggle("is-active", op > 0.6);
      if (op > top.op) top = { id: o.id, op };
    }

    // Hand the "active" section to the viz layer when it changes.
    const next = top.op > 0.6 ? top.id : null;
    if (next !== activeId) {
      if (activeId) viz.deactivate(activeId);
      if (next) viz.activate(next);
      activeId = next;
    }

    if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
    if (scrollCue) scrollCue.classList.toggle("spent", progress > 0.02);
  };

  initScrub({ track, video, canvas, loader, onFrame });

  // Reflect the configured journey length onto the spacer height.
  track.style.setProperty("--screens", String(SCRUB.scrollScreens));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
