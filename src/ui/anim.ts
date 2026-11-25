/**
 * Interface motion helpers (bead bzc.26): sliding lists (FLIP), counting
 * numbers up, things flying across the screen, day and week banners. All
 * use the Web Animations API and do nothing visible under reduced motion
 * (the end state is applied at once). None touches game state.
 */
import { fxEvent } from "../audio/fx.ts";
import type { FxEvent } from "../audio/fx.ts";
import { reducedMotion } from "./motion.ts";

function canAnimate(el: Element | null): el is HTMLElement {
  return (
    el !== null &&
    typeof (el as HTMLElement).animate === "function" &&
    !reducedMotion()
  );
}

/**
 * Records where the keyed children (`data-flip`) of `old` are, and returns
 * a function that slides the same keys in `next` from there (FLIP). New
 * keys slide in from the right.
 */
export function flipChildren(
  old: HTMLElement | null,
  enabled = true,
): (next: HTMLElement) => void {
  if (!enabled || old === null || !canAnimate(old)) return () => {};
  const before = new Map<string, DOMRect>();
  for (const c of Array.from(old.children)) {
    const key = (c as HTMLElement).dataset["flip"];
    if (key !== undefined && !before.has(key))
      before.set(key, c.getBoundingClientRect());
  }
  if (before.size === 0) return () => {};
  return (next) => {
    let moved = false;
    for (const c of Array.from(next.children)) {
      const el = c as HTMLElement;
      const key = el.dataset["flip"];
      if (key === undefined) continue;
      const now = el.getBoundingClientRect();
      const was = before.get(key);
      before.delete(key);
      if (was === undefined) {
        el.animate(
          [
            { transform: "translateX(24px)", opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 220, easing: "ease-out" },
        );
        continue;
      }
      const dx = Math.round(was.left - now.left);
      if (dx === 0) continue;
      moved = true;
      el.animate(
        [{ transform: `translateX(${dx}px)` }, { transform: "none" }],
        { duration: 260, easing: "cubic-bezier(.2,.8,.3,1)" },
      );
    }
    if (moved) fxEvent("battle.timeline");
  };
}

/**
 * Counts the number shown in `el` from `from` to `to` over `ms`, in whole
 * steps. Under reduced motion it writes `to` at once.
 */
export function countUp(
  el: HTMLElement,
  from: number,
  to: number,
  ms = 600,
  format: (n: number) => string = (n) => String(n),
  tick: FxEvent | null = null,
): Promise<void> {
  if (
    from === to ||
    !canAnimate(el) ||
    typeof requestAnimationFrame === "undefined"
  ) {
    el.textContent = format(to);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const t0 = performance.now();
    let shown = from;
    el.classList.add("gm-counting");
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - k) ** 3;
      const n = Math.round(from + (to - from) * eased);
      if (n !== shown) {
        shown = n;
        el.textContent = format(n);
        if (tick !== null) fxEvent(tick);
      }
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
      else {
        el.textContent = format(to);
        el.classList.remove("gm-counting");
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

/**
 * Flies `node` (absolutely placed in the page) from a client point to the
 * centre of `target`, on an arc; resolves when it lands. Under reduced
 * motion it resolves at once and nothing flies.
 */
export function flyTo(
  node: HTMLElement,
  from: { x: number; y: number },
  target: Element,
  ms = 620,
  delay = 0,
): Promise<void> {
  if (!canAnimate(target as HTMLElement)) return Promise.resolve();
  const to = target.getBoundingClientRect();
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  node.classList.add("gm-fly");
  node.style.left = `${Math.round(from.x)}px`;
  node.style.top = `${Math.round(from.y)}px`;
  document.body.append(node);
  const dx = tx - from.x;
  const dy = ty - from.y;
  const lift = Math.min(120, Math.abs(dx) * 0.3 + 40);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    const x = dx * k;
    const y = dy * k - Math.sin(Math.PI * k) * lift;
    const s = k < 0.15 ? 1 + k * 2 : 1.3 - k * 0.6;
    frames.push({
      transform: `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${s.toFixed(2)})`,
      opacity: k > 0.92 ? 0 : 1,
    });
  }
  const a = node.animate(frames, {
    duration: ms,
    delay,
    easing: "cubic-bezier(.4,0,.6,1)",
    fill: "both",
  });
  return a.finished.then(
    () => {
      node.remove();
    },
    () => {
      node.remove();
    },
  );
}

/** Restarts a CSS animation class on `el` (a bump, a flash). */
export function bump(el: Element | null, className = "gm-bump"): void {
  if (el === null || reducedMotion()) return;
  el.classList.remove(className);
  // Force a style flush so the animation restarts.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
  el.addEventListener("animationend", () => el.classList.remove(className), {
    once: true,
  });
}

/**
 * A banner across the map for a new day or week; removes itself. Under
 * reduced motion it shows without moving.
 */
export function dayBanner(
  title: string,
  sub: string,
  kind: "day" | "week",
): HTMLElement {
  const host = document.getElementById("ui") ?? document.body;
  host.querySelectorAll(".gm-daybanner").forEach((n) => n.remove());
  const node = document.createElement("div");
  node.className = `gm-daybanner gm-daybanner-${kind}`;
  node.setAttribute("aria-hidden", "true");
  const t = document.createElement("div");
  t.className = "gm-daybanner-title";
  t.textContent = title;
  const s = document.createElement("div");
  s.className = "gm-daybanner-sub";
  s.textContent = sub;
  node.append(t, s);
  host.append(node);
  fxEvent(kind === "week" ? "map.week" : "map.day");
  setTimeout(() => node.remove(), kind === "week" ? 2600 : 1700);
  return node;
}

/** How long a floating line stays up (ms). */
export const FLOAT_MS = 1700;

/**
 * A short line floating up from a point on the map (bead xaj.18): what a
 * visit or pickup gave, shown at the hero instead of the top of the
 * screen. Under reduced motion it shows in place and goes. Removes itself.
 */
export function floatText(
  at: { x: number; y: number },
  text: string,
  kind: "info" | "gain" = "gain",
  delay = 0,
): HTMLElement {
  const node = document.createElement("div");
  node.className = `gm-float gm-float-${kind}`;
  node.setAttribute("aria-hidden", "true");
  node.textContent = text;
  node.style.left = `${Math.round(at.x)}px`;
  node.style.top = `${Math.round(at.y)}px`;
  (document.getElementById("ui") ?? document.body).append(node);
  if (!reducedMotion() && typeof node.animate === "function") {
    node.animate(
      [
        { transform: "translate(-50%, -100%) translateY(6px)", opacity: 0 },
        { transform: "translate(-50%, -100%)", opacity: 1, offset: 0.1 },
        {
          transform: "translate(-50%, -100%) translateY(-22px)",
          opacity: 1,
          offset: 0.7,
        },
        { transform: "translate(-50%, -100%) translateY(-32px)", opacity: 0 },
      ],
      { duration: FLOAT_MS, delay, easing: "linear", fill: "both" },
    );
  } else if (delay > 0) {
    node.style.visibility = "hidden";
    setTimeout(() => (node.style.visibility = ""), delay);
  }
  setTimeout(() => node.remove(), delay + FLOAT_MS);
  return node;
}
