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
 *
 * Right-click inspects (UI2-18, bead bzc.68): right-clicking anything with
 * a tip pins its card in a second panel that takes the pointer, so the card
 * can be read and the keywords in it hovered for their boxes. It stays until
 * Escape or a click elsewhere; that closing click does nothing else (it
 * never plans a path or presses a button behind the card). While a card is
 * pinned, hovers outside it show nothing. `setPinTip` gives an element a
 * card for right-click only (a spellbook page, whose name is already
 * written under it); `pinTipAt` pins by hand (the adventure map). The
 * browser's own menu never opens on game screens (text fields keep it).
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
/** Cards shown on right-click only (no hover). */
const pins = new WeakMap<Element, TipContent>();
let panel: HTMLDivElement | null = null;
/** The pinned card's panel (UI2-18). */
let pinPanel: HTMLDivElement | null = null;
/** What the pinned card belongs to: it closes when that leaves the page. */
let pinAnchor: Element | null = null;
/** Until then, the rest of the click that closed a pinned card is eaten. */
let swallowUntil = 0;
/** How long after the closing press its release and click are eaten. */
const SWALLOW_MS = 1500;
/** The gap between a pinned card and a keyword box shown beside it. */
const BESIDE = 6;
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

/**
 * Gives `node` a card shown on right-click only (the hover shows nothing
 * new); returns the node. A tip set with `setTip` is pinned as it is.
 */
export function setPinTip<T extends Element>(node: T, content: TipContent): T {
  pins.set(node, content);
  node.setAttribute("data-pin-tip", "");
  return node;
}

function fill(
  body: TipBody,
  p: HTMLDivElement = ensurePanel(),
): HTMLDivElement {
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
  // A pinned card has the stage: no hover card beside it.
  if (tipPinned()) return;
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

// ------------------------------------------------------- pinned card

/**
 * What a press does while a card is pinned: inside the card, nothing; a
 * left press elsewhere closes it and is eaten (with its release and click);
 * any other press (the right button) closes it and goes on, so a
 * right-click on something else pins that instead.
 */
export function pinPress(
  pinned: boolean,
  insideCard: boolean,
  button: number,
): "none" | "close" | "close-eat" {
  if (!pinned || insideCard) return "none";
  return button === 0 ? "close-eat" : "close";
}

/** Whether a card is pinned. */
export function tipPinned(): boolean {
  return pinPanel?.classList.contains("gm-tip-on") === true;
}

function ensurePinPanel(): HTMLDivElement {
  if (pinPanel !== null && pinPanel.isConnected) return pinPanel;
  pinPanel = el("div.gm-tip.gm-tip-pin");
  pinPanel.id = "gm-tip-pin";
  pinPanel.setAttribute("role", "dialog");
  pinPanel.setAttribute("aria-label", "Details (Escape closes)");
  document.body.append(pinPanel);
  return pinPanel;
}

/**
 * Pins `content` at page point (x, y) until Escape or a click elsewhere;
 * `anchor` is what it belongs to (it closes when that leaves the page).
 * Returns whether a card was pinned (false when the content is empty).
 */
export function pinTipAt(
  x: number,
  y: number,
  content: TipContent,
  anchor: Element | null = null,
): boolean {
  hideTip();
  // A static node may be showing in the hover panel too: pin a copy.
  const raw = resolve(content);
  const body = raw instanceof Node ? raw.cloneNode(true) : raw;
  if (body === null) {
    unpinTip();
    return false;
  }
  const p = fill(body, ensurePinPanel());
  // Every keyword in the card (and in its boxes) shows its box on hover.
  for (const kw of p.querySelectorAll<HTMLElement>(".gm-kw[data-kw]"))
    kw.dataset["kwTip"] = "";
  position(p, x, y);
  pinAnchor = anchor;
  return true;
}

/**
 * Closes the pinned card; with `anchor`, only a card that belongs to it
 * (the map drops its own card when its input turns off).
 */
export function unpinTip(anchor?: Element): void {
  if (anchor !== undefined && pinAnchor !== anchor) return;
  if (pinPanel?.classList.contains("gm-tip-on") === true) {
    pinPanel.classList.remove("gm-tip-on");
    pinPanel.replaceChildren();
    hideTip();
  }
  pinAnchor = null;
}

/** Closes the hover tip and the pinned card (a screen opens or closes). */
export function closeTips(): void {
  hideTip();
  unpinTip();
}

function inPin(target: EventTarget | null): boolean {
  return (
    target instanceof Node && pinPanel !== null && pinPanel.contains(target)
  );
}

/** Text fields keep the browser's menu (paste, spelling). */
function editable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * The element whose card a right-click on `target` pins: the innermost one
 * with a tip or a right-click card.
 */
function pinTarget(target: EventTarget | null): Element | null {
  const tipped = tipTarget(target);
  const pinned =
    target instanceof Element ? target.closest("[data-pin-tip]") : null;
  if (pinned === null || !pins.has(pinned)) return tipped;
  if (tipped === null || tipped.contains(pinned)) return pinned;
  return tipped;
}

/** Right-click (or the menu key) on the page: pin the card under it. */
function onContextMenu(e: MouseEvent): void {
  if (editable(e.target)) return;
  e.preventDefault();
  if (inPin(e.target)) return;
  const node = pinTarget(e.target);
  // Nothing with a card: the canvases (map, battle) handle their own.
  if (node === null) return;
  const content = pins.get(node) ?? tips.get(node);
  if (content === undefined) return;
  let { clientX: x, clientY: y } = e;
  // The menu key: no pointer, so under the element.
  if (x === 0 && y === 0) {
    const r = node.getBoundingClientRect();
    x = r.left + Math.min(24, r.width / 2);
    y = r.bottom - 6;
  }
  pinTipAt(x, y, content, node);
}

function onPress(e: PointerEvent): void {
  hideTip();
  swallowUntil = 0;
  const what = pinPress(tipPinned(), inPin(e.target), e.button);
  if (what === "none") return;
  unpinTip();
  if (what === "close-eat") {
    swallowUntil = Date.now() + SWALLOW_MS;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

/** The release and click of the press that closed a pinned card. */
function eatRest(e: Event): void {
  if (swallowUntil === 0) return;
  if (Date.now() > swallowUntil) {
    swallowUntil = 0;
    return;
  }
  // A keyboard "click" (Enter on a button) is not the closing click.
  if (e.type === "click" && e instanceof MouseEvent && e.detail === 0) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.type === "click") swallowUntil = 0;
}

// ------------------------------------------------------------ targets

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

/**
 * Where a box of size (w, h) goes beside a pinned card `at` in a viewport
 * of (vw, vh): to its right, else its left, else below (or above) it, and
 * clamped inside the margin, so it never covers the card.
 */
export function placeBeside(
  at: { left: number; top: number; right: number; bottom: number },
  w: number,
  h: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  const clampX = (v: number): number =>
    Math.max(MARGIN, Math.min(v, vw - MARGIN - w));
  const clampY = (v: number): number =>
    Math.max(MARGIN, Math.min(v, vh - MARGIN - h));
  let left: number;
  let top = at.top;
  if (at.right + BESIDE + w <= vw - MARGIN) left = at.right + BESIDE;
  else if (at.left - BESIDE - w >= MARGIN) left = at.left - BESIDE - w;
  else {
    left = at.left;
    top =
      at.bottom + BESIDE + h <= vh - MARGIN
        ? at.bottom + BESIDE
        : at.top - BESIDE - h;
  }
  return { left: Math.round(clampX(left)), top: Math.round(clampY(top)) };
}

/** Lights the box of keyword `id` in the pinned card; false when none. */
function lightBox(id: string | null): boolean {
  if (pinPanel === null) return false;
  let found = false;
  for (const box of pinPanel.querySelectorAll<HTMLElement>("[data-kw-box]")) {
    const on = id !== null && box.dataset["kwBox"] === id;
    box.classList.toggle("gm-kw-lit", on);
    found ||= on;
  }
  return found;
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
    const p = fill(body);
    // A keyword in a pinned card: its box goes beside the card.
    if (pinPanel !== null && inPin(node)) {
      const r = p.getBoundingClientRect();
      const { left, top } = placeBeside(
        pinPanel.getBoundingClientRect(),
        r.width,
        r.height,
        window.innerWidth,
        window.innerHeight,
      );
      p.style.left = `${left}px`;
      p.style.top = `${top}px`;
    } else position(p, x, y);
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
      // While a card is pinned, only what is in it shows a hover card.
      if (tipPinned() && !inPin(e.target)) {
        lightBox(null);
        if (!manual && current !== null) hideTip();
        return;
      }
      // A keyword whose box the pinned card already shows: light that box.
      if (tipPinned()) {
        const kw =
          e.target instanceof Element
            ? e.target.closest<HTMLElement>(".gm-kw[data-kw]")
            : null;
        if (lightBox(kw?.dataset["kw"] ?? null)) {
          if (current !== null) hideTip();
          return;
        }
      }
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
      // A box beside a pinned card stays put.
      if (!manual && current !== null && !inPin(current))
        moveTip(e.clientX, e.clientY);
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
  // On the window, ahead of every screen's own listeners.
  window.addEventListener("pointerdown", onPress, true);
  for (const type of ["pointerup", "mousedown", "mouseup", "click", "dblclick"])
    window.addEventListener(type, eatRest, true);
  window.addEventListener("contextmenu", onContextMenu, true);
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
      if (e.key !== "Escape") return;
      // Escape closes the pinned card and nothing else (not the screen).
      if (tipPinned()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        unpinTip();
        return;
      }
      hideTip();
    },
    true,
  );
  // A screen that closes under the pointer takes its tip with it.
  const sweep = new MutationObserver(() => {
    if (current !== null && !current.isConnected) hideTip();
    if (pinAnchor !== null && !pinAnchor.isConnected) unpinTip();
  });
  sweep.observe(document.body, { childList: true, subtree: true });
}
