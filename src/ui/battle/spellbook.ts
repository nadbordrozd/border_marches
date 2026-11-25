/**
 * The battle spellbook and the cast panel (DOM only; the rules are in
 * magic.ts). The book docks beside the field (bead bzc.63, UI2-13): school
 * chips, the pages as an icon grid with the castable ones first and the
 * greyed ones saying why in two words, and a detail strip with the pointed
 * page's effect at this cast's Power, its target and the reason it cannot
 * be cast; scrolls and a creature caster's own pages follow the schools.
 * Then the cast panel: the targeting prompt, the exact rehearsed chain and
 * the Echo and Fuel toggles with what each would do.
 */

import type { ConditionRef } from "../../core/battle/index.ts";
import { iconElement } from "../icons.ts";
import { targetLine } from "../target-icon.ts";
import { ANYWHERE, spellTargetKind } from "./spell-targets.ts";
import { rulesText } from "../keywords.ts";
import { setPinTip, tipCard } from "../tooltip.ts";
import { SCHOOL_COLOURS, SCHOOL_NAMES } from "./magic.ts";
import type { BookEntry, CastPreview, ConditionOption } from "./magic.ts";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export interface BookView {
  readonly title: string;
  /** "Mana 34 / 40 · cast this round: ready" and similar. */
  readonly status: string;
  readonly pages: readonly BookEntry[];
  readonly scrolls: readonly BookEntry[];
  /** Item acts of the hero's worn artifacts (once per battle each). */
  readonly items?: readonly BookEntry[];
  /** The active stack's own pages (creature caster), with its name. */
  readonly creature: {
    readonly name: string;
    readonly pages: readonly BookEntry[];
  } | null;
}

/** The groups of the book, in order: the five schools, then the rest. */
const SCHOOLS = ["bloom", "accord", "clock", "hush", "storm"] as const;

export interface BookGroup {
  /** "bloom" ... "storm", "scroll", "item" or "creature". */
  readonly key: string;
  /** The chip's words. */
  readonly label: string;
  /** The chip and tile border colour. */
  readonly colour: string;
  readonly entries: readonly BookEntry[];
}

/**
 * The book's groups (bead bzc.63): the schools with pages, then scrolls,
 * item acts and the active creature's own pages; empty ones are left out.
 */
export function bookGroups(view: BookView): BookGroup[] {
  const groups: BookGroup[] = SCHOOLS.map((school) => ({
    key: school,
    label: SCHOOL_NAMES[school],
    colour: SCHOOL_COLOURS[school],
    entries: view.pages.filter((p) => p.school === school),
  }));
  groups.push(
    {
      key: "scroll",
      label: "Scrolls",
      colour: "#c8b490",
      entries: view.scrolls,
    },
    {
      key: "item",
      label: "Items",
      colour: "#c9a227",
      entries: view.items ?? [],
    },
  );
  if (view.creature)
    groups.push({
      key: "creature",
      label: view.creature.name,
      colour: "#9fd0c0",
      entries: view.creature.pages,
    });
  return groups.filter((g) => g.entries.length > 0);
}

export interface BookTile {
  readonly entry: BookEntry;
  readonly group: BookGroup;
}

/**
 * The pages shown under a chip (`"all"` or a group key): the ones that can
 * be cast now first, then the greyed ones, each in book order.
 */
export function bookOrder(
  groups: readonly BookGroup[],
  filter: string,
): BookTile[] {
  const shown = groups
    .filter((g) => filter === "all" || g.key === filter)
    .flatMap((group) => group.entries.map((entry) => ({ entry, group })));
  return [
    ...shown.filter((x) => x.entry.status === "ready"),
    ...shown.filter((x) => x.entry.status !== "ready"),
  ];
}

function costText(e: BookEntry): string {
  if (e.source === "item") return "item act";
  if (e.source === "page" || e.mana > 0) return `${e.mana} mana`;
  return e.source === "scroll" ? "scroll" : "page";
}

/** The words under a page's icon: its cost, or why it is greyed. */
export function pageCaption(e: BookEntry): string {
  switch (e.status) {
    case "ready":
      return e.source === "scroll" && e.count > 1
        ? `scroll ×${e.count}`
        : costText(e);
    case "spent":
      return "spent";
    case "mana":
      return "no mana";
    case "cast":
      return "cast this round";
    case "wait":
      return "not now";
    case "target":
      return /no effect/i.test(e.reason ?? "") ? "no effect" : "no target";
  }
}

/** The line under a page's name: school, tier and Power, or the item's use. */
function pageMeta(e: BookEntry): string {
  if (e.source === "item")
    return "Once per battle, before a friendly stack acts";
  if (e.source === "creature")
    return `${SCHOOL_NAMES[e.school]} ${e.tier} · Power ${e.power} · the stack's action`;
  return `${SCHOOL_NAMES[e.school]} ${e.tier} · Power ${e.power}${e.fuel ? ` · Fuel doubles ${e.fuel.replace(/^The /, "the ")}` : ""}`;
}

/**
 * A page's card, pinned by right-click (UI2-18): the strip's contents in
 * the shared tooltip layout, so its keywords get their boxes.
 */
export function pageCard(e: BookEntry): HTMLElement {
  const item = e.source === "item";
  const kind = spellTargetKind(e.id);
  const reason = e.reason
    ? el("div", "gm-tip-line gm-tip-bad", e.reason)
    : null;
  return tipCard(
    e.name + (e.count > 1 ? ` ×${e.count}` : ""),
    [
      e.text,
      kind ? targetLine(kind, "bm-spell-target") : null,
      el("div", "gm-tip-line gm-tip-dim", costText(e)),
      reason,
    ],
    {
      icon: iconElement(item ? "artifact" : "spell", e.id),
      subtitle: pageMeta(e),
    },
  );
}

/** The detail strip: the whole page, its target and why it is greyed. */
function pageDetail(box: HTMLElement, t: BookTile): void {
  const e = t.entry;
  const item = e.source === "item";
  box.replaceChildren();
  box.style.setProperty("--school", t.group.colour);
  box.dataset["spell"] = e.id;
  const head = el("div", "bm-spell-head");
  head.append(
    iconElement(item ? "artifact" : "spell", e.id, {
      className: "bm-spell-icon",
    }),
    el("span", "bm-spell-name", e.name + (e.count > 1 ? ` ×${e.count}` : "")),
    el("span", "bm-spell-meta", pageMeta(e)),
    el("span", "bm-spell-cost", costText(e)),
  );
  box.append(
    head,
    rulesText(e.text, { tag: "div", className: "bm-spell-text", hover: true }),
  );
  const kind = spellTargetKind(e.id);
  if (kind) box.append(targetLine(kind, "bm-spell-target"));
  box.append(
    e.reason
      ? el("div", "bm-spell-why", e.reason)
      : el("div", "bm-book-go", item ? "Click to use." : "Click to cast."),
  );
}

/** One page of the grid: icon, name, and its cost or why not. */
function pageTile(
  t: BookTile,
  onShow: (tile: HTMLElement) => void,
  onPick: (e: BookEntry) => void,
): HTMLButtonElement {
  const e = t.entry;
  const item = e.source === "item";
  const ready = e.status === "ready";
  const b = el("button", `bm-spell bm-st-${e.status}${item ? " bm-item" : ""}`);
  b.type = "button";
  b.dataset["spell"] = e.id;
  b.style.setProperty("--school", t.group.colour);
  // Greyed with the reason (bead bzc.47). aria-disabled rather than
  // disabled, so pointing at a greyed page still shows why in the strip.
  if (!ready) b.setAttribute("aria-disabled", "true");
  b.setAttribute(
    "aria-label",
    `${e.name}, ${costText(e)}${e.reason ? `. ${e.reason}` : ""}`,
  );
  const icon = iconElement(item ? "artifact" : "spell", e.id, {
    className: "bm-spell-icon",
    scale: 2,
  });
  // The name is written under it; no browser tooltip on top.
  icon.removeAttribute("title");
  b.append(
    icon,
    el("span", "bm-spell-name", e.name),
    el("span", `bm-spell-cost${ready ? "" : " bm-spell-off"}`, pageCaption(e)),
  );
  // Right-click: the page's card stays pinned (UI2-18).
  setPinTip(b, () => pageCard(e));
  b.addEventListener("pointerenter", () => onShow(b));
  b.addEventListener("focus", () => onShow(b));
  b.addEventListener("click", () => {
    onShow(b);
    if (ready) onPick(e);
  });
  return b;
}

/**
 * Fills `box` with the book: a title with mana, the group chips, the icon
 * grid and the detail strip of the pointed page (the first castable one
 * until the pointer moves). Clicking a bright page picks it.
 */
export function renderBook(
  box: HTMLElement,
  view: BookView,
  onPick: (e: BookEntry) => void,
  onClose: () => void,
): void {
  box.replaceChildren();
  const head = el("div", "bm-book-head");
  const close = el("button", "bm-btn bm-book-close", "Close (Esc)");
  close.type = "button";
  close.addEventListener("click", onClose);
  head.append(
    el("div", "bm-book-title", view.title),
    el("div", "bm-dim bm-book-status", view.status),
    close,
  );
  box.append(head);
  const groups = bookGroups(view);
  if (groups.length === 0) {
    box.append(el("div", "bm-dim", "No pages, no scrolls."));
    return;
  }
  const chips = el("div", "bm-book-chips");
  const grid = el("div", "bm-book-grid");
  const detail = el("div", "bm-book-detail");
  let filter = "all";
  let shownTile: HTMLElement | null = null;
  const fill = (): void => {
    grid.replaceChildren();
    shownTile = null;
    const order = bookOrder(groups, filter);
    for (const t of order) {
      const show = (tile: HTMLElement): void => {
        if (shownTile === tile) return;
        shownTile?.classList.remove("bm-shown");
        tile.classList.add("bm-shown");
        shownTile = tile;
        pageDetail(detail, t);
      };
      const tile = pageTile(t, show, onPick);
      grid.append(tile);
      if (shownTile === null) show(tile);
    }
    for (const c of chips.children)
      c.classList.toggle(
        "bm-on",
        (c as HTMLElement).dataset["group"] === filter,
      );
  };
  const chip = (key: string, label: string, colour: string, n: number) => {
    const c = el("button", "bm-book-chip", label);
    c.append(el("span", "bm-book-chip-n", String(n)));
    c.type = "button";
    c.dataset["group"] = key;
    c.style.setProperty("--school", colour);
    c.addEventListener("click", () => {
      filter = key;
      fill();
    });
    chips.append(c);
  };
  if (groups.length > 1)
    chip(
      "all",
      "All",
      "#c9a227",
      groups.reduce((n, g) => n + g.entries.length, 0),
    );
  for (const g of groups) chip(g.key, g.label, g.colour, g.entries.length);
  box.append(chips, grid, detail);
  fill();
}

export interface CastPanelModel {
  readonly entry: BookEntry;
  readonly prompt: string;
  /** Conditions of a picked stack (condition steps); `valid` false greys one. */
  readonly conditions:
    | readonly (ConditionOption & {
        readonly valid?: boolean;
        /** Why it is greyed ("No effect: ..."). */
        readonly why?: string;
      })[]
    | null;
  /** Why the last click was refused, or null. */
  readonly notice?: string | null;
  /** Named options (Wind: +2 / -2). */
  readonly choices: readonly string[] | null;
  /** Options the cast refuses (Wind +2 on a Hold). */
  readonly badChoices?: readonly string[];
  /** How many valid targets glow on the field for this step, or null. */
  readonly valid?: number | null;
  /** The rehearsal of the complete cast, or of the hovered last target. */
  readonly preview: CastPreview | null;
  readonly hovered: boolean;
  readonly echo: readonly ConditionOption[];
  readonly fuel: readonly ConditionOption[];
  readonly echoOn: ConditionRef | null;
  readonly fuelOn: ConditionRef | null;
  readonly fuelLeft: boolean;
  readonly complete: boolean;
}

export interface CastPanelHandlers {
  onCondition(ref: ConditionRef): void;
  onChoice(choice: string): void;
  onEcho(ref: ConditionRef | null): void;
  onFuel(ref: ConditionRef | null): void;
  onCast(): void;
  onBack(): void;
  onCancel(): void;
}

const sameRef = (a: ConditionRef | null, b: ConditionRef): boolean =>
  a !== null && a.stack === b.stack && a.condition === b.condition;

function toggles(
  label: string,
  options: readonly ConditionOption[],
  on: ConditionRef | null,
  pick: (ref: ConditionRef | null) => void,
): HTMLElement {
  const row = el("div", "bm-cast-toggles");
  row.append(el("span", "bm-pv-label", `${label}: `));
  for (const o of options) {
    const b = el("button", "bm-toggle", o.label);
    b.type = "button";
    b.title = o.effect;
    const active = sameRef(on, o.ref);
    b.classList.toggle("bm-on", active);
    b.addEventListener("click", () => pick(active ? null : o.ref));
    row.append(b);
  }
  const chosen = options.find((o) => sameRef(on, o.ref));
  if (chosen) row.append(el("div", "bm-cast-effect", chosen.effect));
  return row;
}

/** Fills `box` with the cast panel. */
export function renderCastPanel(
  box: HTMLElement,
  m: CastPanelModel,
  h: CastPanelHandlers,
): void {
  box.replaceChildren();
  const item = m.entry.source === "item";
  box.style.setProperty(
    "--school",
    item ? "#c9a227" : SCHOOL_COLOURS[m.entry.school],
  );
  const head = el("div", "bm-cast-head");
  head.append(
    iconElement(item ? "artifact" : "spell", m.entry.id, {
      className: "bm-spell-icon",
    }),
    el("span", "bm-cast-name", m.entry.name),
    el(
      "span",
      "bm-dim",
      item
        ? " Item act · once per battle"
        : ` ${SCHOOL_NAMES[m.entry.school]} ${m.entry.tier} · Power ${m.entry.power}` +
            (m.entry.source === "page"
              ? ` · ${m.entry.mana} mana`
              : m.entry.source === "scroll"
                ? " · scroll"
                : " · the stack's action"),
    ),
  );
  box.append(
    head,
    rulesText(m.entry.text, {
      tag: "div",
      className: "bm-spell-text",
      hover: true,
    }),
  );
  const kind = spellTargetKind(m.entry.id);
  if (kind) box.append(targetLine(kind, "bm-spell-target"));
  if (!m.complete) box.append(el("div", "bm-cast-prompt", m.prompt));
  if (!m.complete && m.notice)
    box.append(el("div", "bm-cast-refused", m.notice));
  const n = m.valid;
  if (!m.complete && n !== undefined && n !== null && !m.conditions)
    box.append(
      el(
        "div",
        "bm-cast-valid",
        n === 0
          ? "Nothing valid left to choose: go Back or Cancel."
          : n >= ANYWHERE
            ? "Point anywhere on the field: the outline shows what it covers. Right-click or Esc cancels."
            : `${n} valid target${n === 1 ? "" : "s"} glow on the field. Right-click or Esc cancels.`,
      ),
    );
  if (m.conditions) {
    const row = el("div", "bm-cast-toggles");
    if (m.conditions.length === 0)
      row.append(el("span", "bm-dim", "No condition there."));
    for (const c of m.conditions) {
      const b = el("button", "bm-toggle", c.label);
      b.type = "button";
      b.title =
        c.valid === false ? (c.why ?? "This spell cannot take it") : c.effect;
      b.disabled = c.valid === false;
      b.addEventListener("click", () => h.onCondition(c.ref));
      row.append(b);
    }
    box.append(row);
  }
  if (m.choices) {
    const row = el("div", "bm-cast-toggles");
    for (const c of m.choices) {
      const b = el("button", "bm-toggle", c);
      b.type = "button";
      b.disabled = m.badChoices?.includes(c) ?? false;
      b.addEventListener("click", () => h.onChoice(c));
      row.append(b);
    }
    box.append(row);
  }
  const p = m.preview;
  if (p) {
    const pv = el("div", `bm-cast-preview${m.hovered ? " bm-hovered" : ""}`);
    if (!p.legal)
      pv.append(
        el("div", "bm-cast-refused", `Cannot cast: ${p.message ?? ""}`),
      );
    else {
      for (const line of p.summary) pv.append(el("div", "bm-cast-sum", line));
      if (p.lines.length > 0)
        pv.append(el("div", "bm-pv-chain", p.lines.join(" → ")));
    }
    box.append(pv);
  }
  if (m.complete && m.entry.source !== "creature" && !item) {
    if (m.echo.length > 0)
      box.append(toggles("Echo (free)", m.echo, m.echoOn, h.onEcho));
    else
      box.append(
        el(
          "div",
          "bm-dim",
          "Echo: no allied-school condition with a clock on a touched stack.",
        ),
      );
    if (m.entry.fuel === null)
      box.append(el("div", "bm-dim", "Fuel: this spell has no size."));
    else if (!m.fuelLeft)
      box.append(el("div", "bm-dim", "Fuel: used for this battle."));
    else if (m.fuel.length > 0)
      box.append(toggles("Fuel (once a battle)", m.fuel, m.fuelOn, h.onFuel));
    else
      box.append(
        el(
          "div",
          "bm-dim",
          "Fuel: no opposed-school condition on a touched stack.",
        ),
      );
  }
  const row = el("div", "bm-cast-buttons");
  const cast = el("button", "bm-btn bm-primary", item ? "Use ⏎" : "Cast ⏎");
  cast.type = "button";
  cast.disabled = !m.complete || !(m.preview?.legal ?? false) || m.hovered;
  cast.addEventListener("click", h.onCast);
  const back = el("button", "bm-btn", "Back ⌫");
  back.type = "button";
  back.addEventListener("click", h.onBack);
  const cancel = el("button", "bm-btn", "Cancel Esc");
  cancel.type = "button";
  cancel.addEventListener("click", h.onCancel);
  row.append(cast, back, cancel);
  box.append(row);
}
