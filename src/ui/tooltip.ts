/**
 * The one tooltip of the game screens (bead bzc.25): a single floating
 * panel, quick to appear, kept inside the viewport, in the game's frame
 * style. Every hover text goes through it:
 *
 *   - `setTip(node, content)` gives an element rich content (a string, a
 *     node, or a function called on each hover, so the text is never stale);
 *   - a plain `title` attribute anywhere under the installed root is taken
 *     over on first hover (moved to `data-tip`), so old code and other
 *     beads' buttons get the same tooltip without changes;
 *   - `showTipAt(x, y, content)` / `hideTip()` drive it by hand (the
 *     adventure map canvas, battle hexes).
 *
 * Keyboard focus shows an element's tip below it; Escape or a click hides
 * it. `tipCard` builds the standard layout: a title, optional icon and
 * subtitle, then lines.
 */
import { el } from "./dom.ts";
import { keywordCard, withKeywordBoxes } from "./keywords.ts";
import "./theme.css";

export type TipBody = string | Node;
export type TipContent = TipBody | (() => TipBody | null);

/** Delay before a tip shows; while one was just visible, tips show at once. */
export const TIP_DELAY_MS = 120;
const SKIM_MS = 400;
const GAP = 14;
const MARGIN = 6;

const tips = new WeakMap<Element, TipContent>();
let panel: HTMLDivElement | null = null;
let current: Element | null = null;
let showTimer = 0;
let lastHidden = 0;
let installed = false;
let manual = false;

/** Gives `node` a tooltip (replacing any `title`); returns the node. */
export function setTip<T extends Element>(node: T, content: TipContent): T {
  tips.set(node, content);
  node.removeAttribute("title");
  if (typeof content === "string") {
    node.setAttribute("data-tip", content);
    if (!node.hasAttribute("aria-label") && node.textContent?.trim() === "")
      node.setAttribute("aria-label", content.split("\n")[0] ?? content);
  } else node.setAttribute("data-tip", "");
  return node;
}

export interface TipCardOptions {
  icon?: Node | null;
  subtitle?: string | null;
  /** Extra class on the card, e.g. "gm-tip-warn". */
  className?: string;
}

/** The standard tooltip layout: title, optional icon and subtitle, lines. */
export function tipCard(
  title: string,
  lines: ReadonlyArray<string | Node | null | undefined | false>,
  options: TipCardOptions = {},
): HTMLElement {
  const head = el(
    "div.gm-tip-head",
    options.icon ?? null,
    el(
      "div.gm-tip-headtext",
      el("div.gm-tip-title", title),
      options.subtitle ? el("div.gm-tip-sub", options.subtitle) : null,
    ),
  );
  const card = el("div.gm-tip-card", head);
  if (options.className) card.classList.add(options.className);
  for (const line of lines) {
    if (line === null || line === undefined || line === false) continue;
    card.append(typeof line === "string" ? el("div.gm-tip-line", line) : line);
  }
  return card;
}

/**
 * A taken-over `title`: one line stays plain text; several lines become a
 * card with the first line as its title.
 */
export function titleCard(text: string): TipBody {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return text;
  const [head = "", ...rest] = lines;
  return tipCard(head, rest);
}

/**
 * Where a box of size (w, h) goes for a pointer at (x, y) in a viewport of
 * (vw, vh): below-right of the pointer, flipped left or above when it
 * would leave the viewport, and clamped inside the margin.
 */
export function placeTip(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  let left = x + GAP;
  let top = y + GAP + 4;
  if (left + w > vw - MARGIN) left = x - GAP - w;
  if (top + h > vh - MARGIN) top = y - GAP - h;
  left = Math.max(MARGIN, Math.min(left, vw - MARGIN - w));
  top = Math.max(MARGIN, Math.min(top, vh - MARGIN - h));
  return { left: Math.round(left), top: Math.round(top) };
}

function ensurePanel(): HTMLDivElement {
  if (panel !== null && panel.isConnected) return panel;
  panel = el("div.gm-tip");
  panel.setAttribute("role", "tooltip");
  panel.id = "gm-tip";
  document.body.append(panel);
  return panel;
}

function resolve(content: TipContent): TipBody | null {
  const body = typeof content === "function" ? content() : content;
  if (body === null) return null;
  if (typeof body === "string" && body.trim() === "") return null;
  return body;
}

function fill(body: TipBody): HTMLDivElement {
  const p = ensurePanel();
  // Cards get their keywords highlighted and explained beside them.
  const node =
    typeof body === "string"
      ? el("div.gm-tip-text", body)
      : withKeywordBoxes(body);
  p.classList.toggle(
    "gm-tip-kw",
    node instanceof Element &&
      (node.classList.contains("gm-kw-wrap") ||
        node.classList.contains("gm-kw-col")),
  );
  p.replaceChildren(node);
  p.classList.add("gm-tip-on");
  return p;
}

function position(p: HTMLElement, x: number, y: number): void {
  const r = p.getBoundingClientRect();
  const { left, top } = placeTip(
    x,
    y,
    r.width,
    r.height,
    window.innerWidth,
    window.innerHeight,
  );
  p.style.left = `${left}px`;
  p.style.top = `${top}px`;
}

/** Shows `content` at page point (x, y) until hideTip (map canvas, hexes). */
export function showTipAt(x: number, y: number, content: TipContent): void {
  window.clearTimeout(showTimer);
  const body = resolve(content);
  if (body === null) {
    hideTip();
    return;
  }
  manual = true;
  current = null;
  position(fill(body), x, y);
}

/** Moves a visible tip to follow the pointer. */
export function moveTip(x: number, y: number): void {
  if (panel?.classList.contains("gm-tip-on") === true) position(panel, x, y);
}

export function hideTip(): void {
  window.clearTimeout(showTimer);
  if (panel?.classList.contains("gm-tip-on") === true) lastHidden = Date.now();
  panel?.classList.remove("gm-tip-on");
  current = null;
  manual = false;
}

/** Whether a tip is showing (tests, the browser check). */
export function tipVisible(): boolean {
  return panel?.classList.contains("gm-tip-on") === true;
}

/** The element under `target` that has a tip, taking over `title`s. */
function tipTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  let node = target.closest("[data-tip], [title], [data-kw-tip]");
  if (node === null) return null;
  // A content icon inside something with a richer card (a spell page)
  // shows that card, not just its own name.
  if (node.classList.contains("gm-icon")) {
    const outer = node.parentElement?.closest("[data-tip]") ?? null;
    if (outer !== null && tips.has(outer)) node = outer;
  }
  // A hoverable keyword in rules text: its glossary box.
  if (node instanceof HTMLElement && node.dataset["kwTip"] !== undefined) {
    const id = node.dataset["kw"];
    if (id !== undefined && !tips.has(node)) {
      tips.set(node, () => keywordCard(id));
      node.setAttribute("data-tip", "");
    }
    return node;
  }
  const title = node.getAttribute("title");
  if (title !== null) {
    node.removeAttribute("title");
    if (title.trim() !== "" && !tips.has(node)) {
      if (!node.hasAttribute("aria-label") && node.textContent?.trim() === "")
        node.setAttribute("aria-label", title.split("\n")[0] ?? title);
      setTip(node, () => titleCard(title));
    }
  }
  return tips.has(node) ? node : null;
}

function contentOf(node: Element): TipContent | null {
  return tips.get(node) ?? null;
}

function showFor(node: Element, x: number, y: number, now: boolean): void {
  window.clearTimeout(showTimer);
  const content = contentOf(node);
  if (content === null) return;
  current = node;
  const go = (): void => {
    if (current !== node || !node.isConnected) return;
    const body = resolve(content);
    if (body === null) return;
    manual = false;
    position(fill(body), x, y);
  };
  if (now || Date.now() - lastHidden < SKIM_MS || tipVisible()) go();
  else showTimer = window.setTimeout(go, TIP_DELAY_MS);
}

/**
 * Installs the delegated listeners once (idempotent). The game app and the
 * battle debug view call it at start.
 */
export function installTooltips(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener(
    "pointerover",
    (e) => {
      const node = tipTarget(e.target);
      if (node === null) {
        if (!manual && current !== null) hideTip();
        return;
      }
      if (node !== current) showFor(node, e.clientX, e.clientY, false);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!manual && current !== null) moveTip(e.clientX, e.clientY);
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "pointerout",
    (e) => {
      if (manual || current === null) return;
      const to = e.relatedTarget;
      if (to instanceof Node && current.contains(to)) return;
      if (to instanceof Element && tipTarget(to) === current) return;
      hideTip();
    },
    true,
  );
  document.addEventListener("pointerdown", () => hideTip(), true);
  document.addEventListener(
    "focusin",
    (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.matches(":focus-visible")) return;
      const node = tipTarget(e.target);
      if (node === null) return;
      const r = node.getBoundingClientRect();
      showFor(node, r.left + Math.min(24, r.width / 2), r.bottom - 6, true);
    },
    true,
  );
  document.addEventListener("focusout", () => {
    if (!manual) hideTip();
  });
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") hideTip();
    },
    true,
  );
  // A screen that closes under the pointer takes its tip with it.
  const sweep = new MutationObserver(() => {
    if (current !== null && !current.isConnected) hideTip();
  });
  sweep.observe(document.body, { childList: true, subtree: true });
}
