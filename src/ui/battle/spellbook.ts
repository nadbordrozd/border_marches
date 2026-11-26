/**
 * The battle spellbook and the cast panel (DOM only; the rules are in
 * magic.ts). The book docks beside the field (bead bzc.63, UI2-13) and is
 * an open book since bzc.99 (spellbook-spread.ts): school ribbons, Combat
 * and Adventure tabs, each page on a medallion in its school's frame
 * (gilded with rank), the castable ones first and the dimmed ones saying
 * why; then a detail strip with the pointed page's effect at this cast's
 * Power, its target and the reason it cannot be cast. Scrolls, item acts
 * and a creature caster's own pages are tagged on their medallions.
 * Then the cast panel: the targeting prompt, the exact rehearsed chain and
 * the Echo and Fuel toggles with what each would do.
 */

import type { ConditionRef, School } from "../../core/battle/index.ts";
import { iconElement } from "../icons.ts";
import { targetLine } from "../target-icon.ts";
import { ANYWHERE, spellTargetKind } from "./spell-targets.ts";
import { rulesText } from "../keywords.ts";
import { tipCard } from "../tooltip.ts";
import { SCHOOL_COLOURS, SCHOOL_NAMES } from "./magic.ts";
import type { BookEntry, CastPreview, ConditionOption } from "./magic.ts";
import { renderSpread } from "../spellbook-spread.ts";
import type { SchoolRanks, SpreadCard } from "../spellbook-spread.ts";

/** No rank in any school: every frame plain. */
const NO_RANKS: SchoolRanks = {
  bloom: 0,
  accord: 0,
  clock: 0,
  hush: 0,
  storm: 0,
};

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
  /** The hero's school ranks: a rank gilds the school's frames (bzc.99). */
  readonly ranks?: SchoolRanks;
  /** The hero's adventure pages and scrolls, shown on the Adventure tab. */
  readonly adventure?: readonly AdventurePageRef[];
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

/** An adventure page the hero knows, listed (dimmed) on the Adventure tab. */
export interface AdventurePageRef {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly tier: number;
  readonly mana: number;
  readonly scroll: boolean;
}

/** Why an adventure page is dimmed in the battle book. */
export const ON_THE_MAP =
  "An adventure spell: cast it on the adventure map (M), not in battle.";

/**
 * The book's spells (bead bzc.99): the combat pages castable first, each
 * with its group (school, scroll, item act or the creature's own page),
 * then the hero's adventure pages, dimmed lightly: they are cast on the
 * map. Keys map back to the tiles for the detail strip.
 */
export function battleCards(view: BookView): {
  cards: SpreadCard[];
  tiles: Map<string, BookTile>;
} {
  const tiles = new Map<string, BookTile>();
  const cards: SpreadCard[] = bookOrder(bookGroups(view), "all").map((t, i) => {
    const e = t.entry;
    const item = e.source === "item";
    const key = `combat:${t.group.key}:${e.id}:${i}`;
    tiles.set(key, t);
    const ready = e.status === "ready";
    return {
      key,
      id: e.id,
      icon: item ? "artifact" : "spell",
      name: e.name,
      school: item ? null : e.school,
      context: "combat",
      tier: item ? null : e.tier,
      cost: ready ? pageCaption(e) : costText(e),
      note:
        t.group.key === "scroll"
          ? "scroll"
          : t.group.key === "creature"
            ? t.group.label
            : item
              ? "item"
              : null,
      reason: ready ? null : (e.reason ?? pageCaption(e)),
      short: ready ? null : pageCaption(e),
      className: `bm-spell bm-st-${e.status}${item ? " bm-item" : ""}`,
      pin: () => pageCard(e),
    };
  });
  for (const p of view.adventure ?? [])
    cards.push({
      key: `adventure:${p.id}${p.scroll ? ":scroll" : ""}`,
      id: p.id,
      icon: "spell",
      name: p.name,
      school: p.school,
      context: "adventure",
      tier: p.tier,
      cost: p.scroll ? "scroll" : `${p.mana} mana`,
      note: p.scroll ? "scroll" : null,
      reason: ON_THE_MAP,
      short: "on the map",
      away: true,
    });
  return { cards, tiles };
}

/**
 * Fills `box` with the book (bead bzc.99): the open book with its school
 * ribbons and Combat / Adventure tabs, and the detail strip of the pointed
 * page (the first castable one until the pointer moves). Clicking a bright
 * page picks it.
 */
export function renderBook(
  box: HTMLElement,
  view: BookView,
  onPick: (e: BookEntry) => void,
  onClose: () => void,
): void {
  const close = el("button", "bm-btn bm-book-close", "Close (Esc)");
  close.type = "button";
  close.addEventListener("click", onClose);
  const { cards, tiles } = battleCards(view);
  const host = el("div", "bm-book-spread");
  const detail = el("div", "bm-book-detail");
  box.replaceChildren(host, detail);
  renderSpread(host, {
    title: view.title,
    status: view.status,
    cards,
    ranks: view.ranks ?? NO_RANKS,
    context: "combat",
    mode: "hover",
    headExtra: close,
    tabCount: (t, list) =>
      t === "combat" && list.length > 0
        ? `${list.filter((c) => c.reason === null).length} of ${list.length} ready`
        : String(list.length),
    empty: (t, ribbon) =>
      t === "adventure"
        ? "No adventure spells in the book."
        : ribbon === "all"
          ? "No pages, no scrolls."
          : `No ${SCHOOL_NAMES[ribbon]} pages or scrolls.`,
    onShow: (card) => {
      const t = card === null ? undefined : tiles.get(card.key);
      if (t) {
        detail.hidden = false;
        pageDetail(detail, t);
      } else if (card !== null) {
        detail.hidden = false;
        const head = el("div", "bm-spell-head");
        head.append(
          iconElement("spell", card.id, { className: "bm-spell-icon" }),
          el("span", "bm-spell-name", card.name),
          el(
            "span",
            "bm-spell-meta",
            `${card.school ? SCHOOL_NAMES[card.school] : ""} ${card.tier ?? ""}`,
          ),
          el("span", "bm-spell-cost", card.cost),
        );
        detail.replaceChildren(
          head,
          el("div", "bm-spell-why", card.reason ?? ""),
        );
        detail.style.setProperty(
          "--school",
          card.school ? SCHOOL_COLOURS[card.school] : "#c9a227",
        );
      } else detail.hidden = true;
    },
    onPick: (card) => {
      const t = tiles.get(card.key);
      if (t && t.entry.status === "ready") onPick(t.entry);
    },
  });
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
