/* ============================================================================
   Market Chronicles — in-journey data visualisations
   ----------------------------------------------------------------------------
   Each section overlay carries one small, editorial, INTERACTIVE data module.
   Modules are progressive enhancements: the real numbers live in the HTML as
   lists / tables, and these controllers turn them into animated charts that
   respond to hover, focus and click.

   main.ts calls activate(id) when a section becomes the visible one and
   deactivate(id) when it leaves, so charts animate in on arrival and reset
   (ready to replay) on exit. Everything respects prefers-reduced-motion.
   ========================================================================= */

const reduce = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Module = {
  activate: () => void;
  deactivate: () => void;
};

export interface Viz {
  activate(id: string): void;
  deactivate(id: string): void;
}

/** Count a number from 0 → target with an optional formatter. */
function countUp(
  el: HTMLElement,
  target: number,
  fmt: (v: number) => string,
  ms = 900
) {
  if (reduce()) {
    el.textContent = fmt(target);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(target * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Cover · The India AI Scorecard (magnitude bars) --------------- */
function scorecard(fig: HTMLElement): Module {
  const items = Array.from(fig.querySelectorAll<HTMLElement>(".bars > li"));
  const readout = document.createElement("p");
  readout.className = "viz-readout";
  fig.appendChild(readout);

  const rows = items.map((li, i) => {
    const value = Number(li.dataset.value || 0);
    const note = li.dataset.note || "";
    const label = li.querySelector(".bar-label")?.textContent ?? "";
    const track = document.createElement("span");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.transitionDelay = `${i * 70}ms`;
    track.appendChild(fill);
    const val = document.createElement("span");
    val.className = "bar-val";
    val.textContent = "0";
    li.append(track, val);
    li.tabIndex = 0;
    li.setAttribute("role", "listitem");

    const show = () => {
      rows.forEach((r) => r.li.classList.remove("hot"));
      li.classList.add("hot");
      readout.textContent = `${label} · ${value}/100 — ${note}`;
    };
    li.addEventListener("mouseenter", show);
    li.addEventListener("focus", show);
    return { li, fill, val, value, note, label, show };
  });

  return {
    activate() {
      rows.forEach((r) => {
        r.fill.style.width = `${r.value}%`;
        countUp(r.val, r.value, (v) => String(Math.round(v)));
      });
      readout.textContent = rows.length
        ? `${rows[0].label} · ${rows[0].value}/100 — ${rows[0].note}`
        : "";
    },
    deactivate() {
      rows.forEach((r) => {
        r.fill.style.width = "0%";
        r.val.textContent = "0";
        r.li.classList.remove("hot");
      });
    },
  };
}

/* ---------- House Views · index returns (signed, period toggle) ---------- */
function returns(fig: HTMLElement): Module {
  const list = fig.querySelector<HTMLElement>(".returns")!;
  const rowsData = Array.from(list.querySelectorAll<HTMLElement>("li")).map((li) => ({
    label: li.dataset.label || "",
    values: (li.dataset.values || "").split(",").map(Number),
    li,
  }));
  const buttons = Array.from(fig.querySelectorAll<HTMLButtonElement>(".returns-toggle button"));
  const readout = document.createElement("p");
  readout.className = "viz-readout";
  fig.appendChild(readout);

  const maxAbs = Math.max(
    ...rowsData.flatMap((r) => r.values.map((v) => Math.abs(v)))
  );
  let period = 0;
  let active = false;

  // Build each row: label · centered track (zero line) · signed fill · value
  const built = rowsData.map((r) => {
    r.li.innerHTML = "";
    const label = document.createElement("span");
    label.className = "ret-label";
    label.textContent = r.label;
    const track = document.createElement("span");
    track.className = "ret-track";
    const fill = document.createElement("span");
    fill.className = "ret-fill";
    track.appendChild(fill);
    const val = document.createElement("span");
    val.className = "ret-val";
    r.li.append(label, track, val);
    r.li.tabIndex = 0;
    return { ...r, fill, val, track };
  });

  const render = () => {
    built.forEach((b) => {
      const v = b.values[period] ?? 0;
      const pct = active ? (Math.abs(v) / maxAbs) * 50 : 0; // half-track each side
      const neg = v < 0;
      b.fill.classList.toggle("neg", neg);
      b.fill.style.width = `${pct}%`;
      b.fill.style.left = neg ? "auto" : "50%";
      b.fill.style.right = neg ? "50%" : "auto";
      b.val.textContent = `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
      b.val.classList.toggle("neg", neg);
    });
  };

  const setPeriod = (p: number) => {
    period = p;
    buttons.forEach((btn, i) => {
      const on = i === p;
      btn.setAttribute("aria-selected", String(on));
      btn.classList.toggle("on", on);
    });
    render();
  };

  buttons.forEach((btn, i) => btn.addEventListener("click", () => setPeriod(i)));
  built.forEach((b) => {
    const show = () => {
      readout.textContent = `${b.label} · ${["1M", "3M", "6M", "1Y"][period]} ${
        b.values[period] > 0 ? "+" : ""
      }${b.values[period].toFixed(1)}%`;
    };
    b.li.addEventListener("mouseenter", show);
    b.li.addEventListener("focus", show);
  });

  setPeriod(0);

  return {
    activate() {
      active = true;
      render();
    },
    deactivate() {
      active = false;
      render();
    },
  };
}

/* ---------- Life Edit · four lenses (auto-rotating tabs) ------------------ */
function lenses(fig: HTMLElement): Module {
  const tabs = Array.from(fig.querySelectorAll<HTMLButtonElement>(".lens-tabs button"));
  const panels = Array.from(fig.querySelectorAll<HTMLElement>(".lens-panel"));
  let idx = 0;
  let timer = 0;
  let hovering = false;

  const select = (i: number) => {
    idx = i;
    tabs.forEach((t, j) => {
      const on = j === i;
      t.setAttribute("aria-selected", String(on));
      t.classList.toggle("on", on);
    });
    panels.forEach((p, j) => {
      p.hidden = j !== i;
      if (j === i) {
        p.classList.remove("enter");
        // restart the enter animation
        void p.offsetWidth;
        p.classList.add("enter");
      }
    });
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    stop();
    if (reduce()) return;
    timer = window.setInterval(() => {
      if (!hovering) select((idx + 1) % panels.length);
    }, 3400);
  };

  tabs.forEach((t, i) =>
    t.addEventListener("click", () => {
      select(i);
      start(); // reset the dwell after a manual pick
    })
  );
  fig.addEventListener("mouseenter", () => (hovering = true));
  fig.addEventListener("mouseleave", () => (hovering = false));
  fig.addEventListener("focusin", () => (hovering = true));
  fig.addEventListener("focusout", () => (hovering = false));

  return {
    activate() {
      select(0);
      start();
    },
    deactivate() {
      stop();
    },
  };
}

/* ---------- Global Circuits · event timeline (auto-advance) --------------- */
function timeline(fig: HTMLElement): Module {
  const items = Array.from(fig.querySelectorAll<HTMLElement>(".timeline > li"));
  const card = fig.querySelector<HTMLElement>(".tl-card")!;
  const els = {
    when: card.querySelector<HTMLElement>(".tl-card-when")!,
    name: card.querySelector<HTMLElement>(".tl-card-name")!,
    place: card.querySelector<HTMLElement>(".tl-card-place")!,
    why: card.querySelector<HTMLElement>(".tl-card-why")!,
  };
  let idx = 0;
  let timer = 0;
  let hovering = false;

  const select = (i: number) => {
    idx = i;
    items.forEach((li, j) => li.classList.toggle("on", j === i));
    const li = items[i];
    els.when.textContent = li.dataset.when || "";
    els.name.textContent = li.querySelector(".tl-name")?.textContent || "";
    els.place.textContent = li.dataset.place || "";
    els.why.textContent = li.dataset.why || "";
    card.classList.remove("enter");
    void card.offsetWidth;
    card.classList.add("enter");
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    stop();
    if (reduce()) return;
    timer = window.setInterval(() => {
      if (!hovering) select((idx + 1) % items.length);
    }, 2900);
  };

  items.forEach((li, i) => {
    const node = li.querySelector<HTMLElement>(".tl-node")!;
    const pick = () => {
      select(i);
      start();
    };
    node.addEventListener("mouseenter", () => {
      hovering = true;
      select(i);
    });
    node.addEventListener("mouseleave", () => (hovering = false));
    node.addEventListener("focus", pick);
    node.addEventListener("click", pick);
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
  });

  return {
    activate() {
      select(0);
      start();
    },
    deactivate() {
      stop();
    },
  };
}

/* ---------- The Shelf · book accordion ------------------------------------ */
function shelf(fig: HTMLElement): Module {
  const heads = Array.from(fig.querySelectorAll<HTMLButtonElement>(".shelf-head"));
  heads.forEach((h) => {
    h.addEventListener("click", () => {
      const open = h.getAttribute("aria-expanded") === "true";
      heads.forEach((o) => o.setAttribute("aria-expanded", "false"));
      h.setAttribute("aria-expanded", String(!open));
    });
  });
  return {
    activate() {
      if (heads[0]) heads[0].setAttribute("aria-expanded", "true");
    },
    deactivate() {
      heads.forEach((h) => h.setAttribute("aria-expanded", "false"));
    },
  };
}

const BUILDERS: Record<string, (fig: HTMLElement) => Module> = {
  scorecard,
  returns,
  lenses,
  timeline,
  shelf,
};

export function initViz(root: ParentNode = document): Viz {
  const modules = new Map<string, Module>();
  root.querySelectorAll<HTMLElement>("[data-section]").forEach((section) => {
    const id = section.getAttribute("data-section")!;
    const fig = section.querySelector<HTMLElement>(".viz");
    if (!fig) return;
    const kind = fig.getAttribute("data-viz") || "";
    const build = BUILDERS[kind];
    if (build) modules.set(id, build(fig));
  });

  return {
    activate: (id) => modules.get(id)?.activate(),
    deactivate: (id) => modules.get(id)?.deactivate(),
  };
}
