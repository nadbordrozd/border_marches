/**
 * The spellbook as an open book (bead bzc.99, Spellbook v3): two parchment
 * pages, a coloured ribbon per school of magic plus an "All" ribbon down
 * the right edge, Combat and Adventure tabs at the bottom, and each spell
 * on a parchment medallion inside its school's ornate frame. The frame is
 * gilded when the hero has rank in the school (mastery); the legend under
 * the pages and every spell's tooltip say so. Spells that cannot be cast
 * now are dimmed with the reason on a tag and in the tooltip. Twelve spells
 * a spread; more turn the page.
 *
 * Shared by the adventure book (spellbook.ts, a dialog) and the battle book
 * (battle/spellbook.ts, docked over the field). The pure parts (filtering,
 * paging, mastery) are exported for tests; `renderSpread` draws the DOM.
 *
 * A later bead (bzc.100, the magic wheel) hooks in with
 * {@link setSchoolsOfMagic}: the book then shows a "Schools of magic"
 * ribbon above the school ribbons that calls it.
 */

import type { School } from "../core/battle/index.ts";
import { el, imageUrl } from "./dom.ts";
import { iconElement } from "./icons.ts";
import { reducedMotion } from "./motion.ts";
import { setPinTip, setTip, tipCard } from "./tooltip.ts";
import { SCHOOL_COLOURS, SCHOOL_NAMES } from "./battle/magic.ts";
import frames from "./spell-frames.json";
import "./spellbook.css";

/** The schools in book order (the ribbons, top to bottom, after All). */
export const BOOK_SCHOOLS: readonly School[] = [
  "bloom",
  "accord",
  "clock",
  "hush",
  "storm",
];

/** Which half of the book: battle spells or adventure-map spells. */
export type BookContext = "combat" | "adventure";
/** A ribbon: one school, or every spell. */
export type Ribbon = School | "all";
export const RIBBONS: readonly Ribbon[] = ["all", ...BOOK_SCHOOLS];

/** Spells on one page and on a two-page spread. */
export const PER_PAGE = 6;
export const PER_SPREAD = PER_PAGE * 2;

/** The "All" ribbon's colour (the gold of the book's trim). */
export const ALL_COLOUR = "#c9a227";

/** One spell (or scroll, creature page or item act) in the book. */
export interface SpreadCard {
  /** Unique in the book. */
  readonly key: string;
  /** The spell or artifact id (icon and data-spell). */
  readonly id: string;
  readonly icon: "spell" | "artifact";
  readonly name: string;
  /** Null for an item act: no school, no frame of a school. */
  readonly school: School | null;
  readonly context: BookContext;
  readonly tier: number | null;
  /** "4 mana", "scroll", "scroll ×2", "item act". */
  readonly cost: string;
  /** A small tag over the name: "scroll", "Gravecallers", "item". */
  readonly note?: string | null;
  /** Why it cannot be cast now (dimmed), or null when it can. */
  readonly reason: string | null;
  /** The reason in two words, on the tag across the medallion. */
  readonly short?: string | null;
  /** Extra classes on the cell (the screens' own selectors). */
  readonly className?: string;
  /** Extra data-* attributes on the cell. */
  readonly data?: Readonly<Record<string, string>>;
  /** The right-click card (UI2-18). */
  readonly pin?: () => string | Node;
  /**
   * Dimmed only because it belongs to the other half of the book (a combat
   * spell in the adventure book): a lighter dim and no tag.
   */
  readonly away?: boolean;
}

/** The spells of a context under a ribbon, in the order given. */
export function spreadCards(
  cards: readonly SpreadCard[],
  context: BookContext,
  ribbon: Ribbon,
): SpreadCard[] {
  return cards.filter(
    (c) => c.context === context && (ribbon === "all" || c.school === ribbon),
  );
}

/** How many spreads `n` spells fill (at least one, even when empty). */
export function spreadCount(n: number): number {
  return Math.max(1, Math.ceil(n / PER_SPREAD));
}

/** The spells on spread `i` (clamped), left page first. */
export function spreadAt<T>(list: readonly T[], i: number): T[] {
  const at = Math.max(0, Math.min(spreadCount(list.length) - 1, i));
  return list.slice(at * PER_SPREAD, (at + 1) * PER_SPREAD);
}

export type SchoolRanks = Readonly<Record<School, number>>;

/** Whether the hero's frame of this school is gilded: any rank in it. */
export function mastered(ranks: SchoolRanks, school: School | null): boolean {
  return school !== null && (ranks[school] ?? 0) >= 1;
}

/** What a school rank gives (RULES_V2 2.2). */
const RANK_GIVES = [
  "",
  "learns tiers 1-2",
  "learns tiers 1-4, +2 Power",
  "learns tiers 1-5, +4 Power",
];

/** The frame's sentence for a school at a rank (tooltips and the legend). */
export function masteryText(school: School, rank: number): string {
  const name = SCHOOL_NAMES[school];
  if (rank <= 0)
    return `Plain ${name} frame: no ${name} rank. Pages already in the book still cast at the hero's Power.`;
  return `Gilded ${name} frame: ${name} rank ${rank} (${RANK_GIVES[Math.min(3, rank)]}).`;
}

/** The manifest key of a school's frame, plain or gilded. */
export function frameKey(school: School, gilded: boolean): string {
  return `frame-spell-${school}${gilded ? "-gilded" : ""}`;
}

/** The frame a card's medallion gets: its school's, gilded with rank; none for an item. */
export function cardFrame(card: SpreadCard, ranks: SchoolRanks): string | null {
  return card.school === null
    ? null
    : frameKey(card.school, mastered(ranks, card.school));
}

/** The frame's native size and each school's hole (the parchment). */
export const FRAME_SIZE = frames.size;
export const HOLES: Readonly<
  Record<School, { x: number; y: number; width: number; height: number }>
> = frames.holes;
/** Pixel scale of the medallion (frame and icon) in the book. */
const SCALE = 2;

// --------------------------------------------------------------- the hook

let schoolsOfMagic: ((ranks: SchoolRanks) => void) | null = null;

/**
 * Bead bzc.100's hook: with a handler, every book opened afterwards shows
 * a "Schools of magic" ribbon that calls it with the hero's school ranks
 * (the magic wheel, src/ui/magic-wheel.ts). Null removes it. The book
 * itself never builds the wheel.
 */
export function setSchoolsOfMagic(
  open: ((ranks: SchoolRanks) => void) | null,
): void {
  schoolsOfMagic = open;
}

// --------------------------------------------------------------- the DOM

export interface SpreadOptions {
  /** "Aldric's spellbook". */
  readonly title: string;
  /** Mana, Power and the like, beside the title. */
  readonly status: string;
  readonly cards: readonly SpreadCard[];
  readonly ranks: SchoolRanks;
  /** The context selected first (where the book is opened). */
  readonly context: BookContext;
  /** The tab's small count ("3 of 4 ready"); default the number of spells. */
  readonly tabCount?: (context: BookContext, cards: SpreadCard[]) => string;
  /** The empty page's words. */
  readonly empty: (context: BookContext, ribbon: Ribbon) => string;
  /**
   * "hover": pointing or focusing a spell shows it, a click picks it (the
   * battle book). "select": a click or focus selects and shows it, a double
   * click picks it (the adventure book, whose detail pane has the buttons).
   */
  readonly mode: "hover" | "select";
  /** A spell is shown (null: none on the page). */
  readonly onShow: (card: SpreadCard | null) => void;
  /** A castable spell is picked. */
  readonly onPick: (card: SpreadCard) => void;
  /** Buttons at the right of the head (the battle book's Close). */
  readonly headExtra?: Node | null;
}

export interface SpreadHandle {
  readonly root: HTMLElement;
  /** The current context, ribbon and spread. */
  state(): { context: BookContext; ribbon: Ribbon; spread: number };
  setContext(context: BookContext): void;
  setRibbon(ribbon: Ribbon): void;
  turn(delta: number): void;
}

/** The medallion: parchment, the school's frame, the icon on top. */
export function medallion(card: SpreadCard, ranks: SchoolRanks): HTMLElement {
  const m = el("span.sb-medal");
  const size = FRAME_SIZE * SCALE;
  m.style.width = `${size}px`;
  m.style.height = `${size}px`;
  const school = card.school;
  if (school !== null) {
    const hole = HOLES[school];
    const parch = el("span.sb-parch");
    parch.style.left = `${hole.x * SCALE}px`;
    parch.style.top = `${hole.y * SCALE}px`;
    parch.style.width = `${hole.width * SCALE}px`;
    parch.style.height = `${hole.height * SCALE}px`;
    const frame = el("img.sb-frame");
    frame.src = imageUrl(cardFrame(card, ranks) ?? frameKey(school, false));
    frame.width = size;
    frame.height = size;
    frame.alt = "";
    frame.draggable = false;
    m.append(parch, frame);
  } else m.classList.add("sb-medal-plain");
  const icon = iconElement(card.icon, card.id, {
    scale: SCALE,
    className: "sb-icon",
    framed: false,
  });
  icon.removeAttribute("title");
  m.append(icon);
  if (card.reason !== null && card.short && !card.away)
    m.append(el("span.sb-why", card.short));
  return m;
}

/** The line under the name: tier and cost. */
export function cardMeta(card: SpreadCard): string {
  return card.tier === null ? card.cost : `Tier ${card.tier} · ${card.cost}`;
}

/** The hover card: name, school, tier, cost, frame meaning, why not. */
export function cardTip(card: SpreadCard, ranks: SchoolRanks): HTMLElement {
  const school = card.school;
  return tipCard(
    card.name,
    [
      school !== null
        ? el("div.gm-tip-line.sb-tip-frame", masteryText(school, ranks[school]))
        : null,
      card.reason !== null
        ? el("div.gm-tip-line.gm-tip-bad", card.reason)
        : el(
            "div.gm-tip-line.gm-tip-dim",
            card.context === "combat"
              ? "Click to cast."
              : "Double-click to cast.",
          ),
    ],
    {
      subtitle:
        (school !== null ? `${SCHOOL_NAMES[school]} · ` : "") +
        cardMeta(card) +
        (card.note ? ` · ${card.note}` : ""),
    },
  );
}

function ribbonColour(r: Ribbon): string {
  return r === "all" ? ALL_COLOUR : SCHOOL_COLOURS[r];
}

/** Draws the book into `host` (replacing its children). */
export function renderSpread(
  host: HTMLElement,
  options: SpreadOptions,
): SpreadHandle {
  const { cards, ranks } = options;
  let context: BookContext = options.context;
  let ribbon: Ribbon = "all";
  let spread = 0;
  let shown: HTMLElement | null = null;

  const root = el("div.sb-book");
  root.dataset["context"] = context;
  const head = el(
    "div.sb-head",
    options.title ? el("div.sb-title", options.title) : null,
    el("div.sb-status", options.status),
    options.headExtra ?? null,
  );

  const pageHead = [el("div.sb-page-head"), el("div.sb-page-head")] as const;
  const grids = [el("div.sb-grid"), el("div.sb-grid")] as const;
  const folios = [el("span.sb-folio"), el("span.sb-folio")] as const;
  const back = el("button.sb-turn.sb-turn-back", "◀");
  back.type = "button";
  back.setAttribute("aria-label", "Previous pages (Page Up)");
  back.setAttribute("aria-keyshortcuts", "PageUp");
  const next = el("button.sb-turn.sb-turn-next", "▶");
  next.type = "button";
  next.setAttribute("aria-label", "Next pages (Page Down)");
  next.setAttribute("aria-keyshortcuts", "PageDown");
  const pages = [
    el(
      "div.sb-page.sb-page-left",
      pageHead[0],
      grids[0],
      el("div.sb-page-foot", back, folios[0]),
    ),
    el(
      "div.sb-page.sb-page-right",
      pageHead[1],
      grids[1],
      el("div.sb-page-foot", folios[1], next),
    ),
  ] as const;

  const ribbons = el("div.sb-ribbons");
  ribbons.setAttribute("role", "tablist");
  ribbons.setAttribute("aria-orientation", "vertical");
  ribbons.setAttribute("aria-label", "Schools of magic");
  // Bead bzc.100's place: the magic wheel's ribbon goes here.
  const slot = el("div.sb-schools-slot");
  if (schoolsOfMagic !== null) {
    const open = schoolsOfMagic;
    // The wheel's sign: the five school colours round a dark hub.
    const b = el(
      "button.sb-ribbon.sb-ribbon-wheel",
      el("span.sb-wheel-mark"),
      el("span.sb-ribbon-name", "Schools of magic"),
    );
    b.setAttribute("aria-label", "Schools of magic");
    b.type = "button";
    b.addEventListener("click", () => open(ranks));
    setTip(b, () => {
      const card = tipCard("Schools of magic", [
        "The wheel: which schools are allied and which opposed, and where each faction's Magic Guild leans.",
      ]);
      // One card, no keyword boxes beside it (as the wheel's own cards).
      card.setAttribute("data-kw-skip", "");
      return card;
    });
    slot.append(b);
  }
  ribbons.append(slot);
  const ribbonButtons = new Map<Ribbon, HTMLButtonElement>();
  for (const r of RIBBONS) {
    const b = el("button.sb-ribbon");
    b.type = "button";
    b.dataset["ribbon"] = r;
    b.setAttribute("role", "tab");
    b.style.setProperty("--ribbon", ribbonColour(r));
    const rank = r === "all" ? 0 : ranks[r];
    b.append(
      r === "all"
        ? iconElement("stat", "spellbook", { className: "sb-ribbon-icon" })
        : iconElement("school", r, {
            className: "sb-ribbon-icon",
            framed: false,
          }),
      el("span.sb-ribbon-name", r === "all" ? "All" : SCHOOL_NAMES[r]),
    );
    if (rank > 0) {
      const pips = el("span.sb-pips");
      for (let i = 0; i < Math.min(3, rank); i++)
        pips.append(el("span.sb-pip"));
      b.append(pips);
    }
    for (const icon of b.querySelectorAll(".gm-icon"))
      icon.removeAttribute("title");
    setTip(b, () =>
      r === "all"
        ? "Every school's spells"
        : tipCard(`${SCHOOL_NAMES[r]} spells`, [masteryText(r, rank)]),
    );
    b.setAttribute(
      "aria-label",
      r === "all"
        ? "All schools"
        : `${SCHOOL_NAMES[r]}${rank > 0 ? `, rank ${rank}` : ", no rank"}`,
    );
    b.addEventListener("click", () => {
      if (ribbon === r) return;
      ribbon = r;
      spread = 0;
      fill(true);
    });
    ribbonButtons.set(r, b);
    ribbons.append(b);
  }

  const tabs = el("div.sb-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Combat or adventure spells");
  const tabButtons = new Map<BookContext, HTMLButtonElement>();
  for (const t of ["combat", "adventure"] as const) {
    const all = spreadCards(cards, t, "all");
    const b = el(
      "button.sb-tab",
      iconElement("stat", t === "combat" ? "attack" : "movement", {
        className: "sb-tab-icon",
      }),
      el("span.sb-tab-name", t === "combat" ? "Combat" : "Adventure"),
      el("span.sb-tab-n", options.tabCount?.(t, all) ?? String(all.length)),
    );
    for (const icon of b.querySelectorAll(".gm-icon"))
      icon.removeAttribute("title");
    b.type = "button";
    b.dataset["tab"] = t;
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => setContext(t));
    tabButtons.set(t, b);
    tabs.append(b);
  }

  const legendFrame = (gilded: boolean): HTMLElement => {
    const i = el("img.sb-legend-frame");
    i.src = imageUrl(frameKey("bloom", gilded));
    i.width = FRAME_SIZE;
    i.height = FRAME_SIZE;
    i.alt = "";
    return i;
  };
  const legend = el(
    "div.sb-legend",
    legendFrame(false),
    el("span", "Plain frame: no rank in the school"),
    legendFrame(true),
    el(
      "span",
      "Gilded frame: the hero has rank (mastery) in it: more Power, higher tiers",
    ),
  );

  const spreadBox = el("div.sb-spread", pages[0], el("div.sb-spine"), pages[1]);
  const body = el("div.sb-body", spreadBox, ribbons);
  root.append(head, body, tabs, legend);
  host.replaceChildren(root);

  const show = (cell: HTMLElement, card: SpreadCard): void => {
    if (shown === cell) return;
    shown?.classList.remove("sb-shown", "gm-book-sel", "bm-shown");
    cell.classList.add("sb-shown");
    if (options.mode === "select") cell.classList.add("gm-book-sel");
    else cell.classList.add("bm-shown");
    shown = cell;
    options.onShow(card);
  };

  const cell = (card: SpreadCard): HTMLButtonElement => {
    const off = card.reason !== null;
    const b = el("button.sb-cell");
    if (card.className) b.className += ` ${card.className}`;
    b.type = "button";
    b.dataset["spell"] = card.id;
    b.dataset["key"] = card.key;
    if (card.school !== null) {
      b.dataset["school"] = card.school;
      b.style.setProperty("--school", SCHOOL_COLOURS[card.school]);
    }
    b.dataset["mastered"] = String(mastered(ranks, card.school));
    for (const [k, v] of Object.entries(card.data ?? {})) b.dataset[k] = v;
    if (off) {
      b.classList.add("sb-off");
      if (card.away) b.classList.add("sb-away");
      b.setAttribute("aria-disabled", "true");
    }
    b.setAttribute(
      "aria-label",
      `${card.name}${card.note ? ` (${card.note})` : ""}, ${cardMeta(card)}` +
        (card.school !== null
          ? mastered(ranks, card.school)
            ? ", gilded frame"
            : ""
          : "") +
        (off ? `. ${card.reason}` : ""),
    );
    b.append(
      medallion(card, ranks),
      ...(card.note ? [el("span.sb-note", card.note)] : []),
      el("span.sb-name", card.name),
      el("span.sb-meta", cardMeta(card)),
    );
    setTip(b, () => cardTip(card, ranks));
    if (card.pin) setPinTip(b, card.pin);
    if (options.mode === "hover") {
      b.addEventListener("pointerenter", () => show(b, card));
      b.addEventListener("focus", () => show(b, card));
      b.addEventListener("click", () => {
        show(b, card);
        if (!off) options.onPick(card);
      });
    } else {
      b.addEventListener("focus", () => show(b, card));
      b.addEventListener("click", () => show(b, card));
      b.addEventListener("dblclick", () => {
        show(b, card);
        if (!off) options.onPick(card);
      });
    }
    return b;
  };

  const fill = (animate = false): void => {
    const focused = document.activeElement;
    const hadCellFocus =
      focused instanceof HTMLElement &&
      focused.classList.contains("sb-cell") &&
      root.contains(focused);
    root.dataset["context"] = context;
    root.dataset["ribbon"] = ribbon;
    root.style.setProperty("--ribbon", ribbonColour(ribbon));
    const list = spreadCards(cards, context, ribbon);
    const total = spreadCount(list.length);
    spread = Math.max(0, Math.min(total - 1, spread));
    const here = spreadAt(list, spread);
    shown = null;
    grids[0].replaceChildren(...here.slice(0, PER_PAGE).map(cell));
    grids[1].replaceChildren(...here.slice(PER_PAGE).map(cell));
    if (list.length === 0)
      grids[0].append(el("div.sb-empty", options.empty(context, ribbon)));
    // The page heads: the ribbon on the left, the context on the right.
    const r = ribbon;
    pageHead[0].replaceChildren(
      el("span.sb-page-title", r === "all" ? "All schools" : SCHOOL_NAMES[r]),
      ...(r === "all"
        ? []
        : [
            el(
              "span.sb-page-rank",
              ranks[r] > 0 ? `rank ${ranks[r]}, gilded` : "no rank",
            ),
          ]),
    );
    pageHead[1].replaceChildren(
      el(
        "span.sb-page-title",
        context === "combat" ? "Combat spells" : "Adventure spells",
      ),
    );
    folios[0].textContent = String(spread * 2 + 1);
    folios[1].textContent = `${spread * 2 + 2} of ${total * 2}`;
    back.disabled = spread === 0;
    next.disabled = spread >= total - 1;
    back.hidden = total === 1;
    next.hidden = total === 1;
    for (const [r2, b] of ribbonButtons) {
      const on = r2 === ribbon;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle("sb-on", on);
      const n = spreadCards(cards, context, r2).length;
      b.classList.toggle("sb-ribbon-empty", n === 0);
      b.dataset["count"] = String(n);
    }
    for (const [t, b] of tabButtons) {
      const on = t === context;
      b.setAttribute("aria-selected", String(on));
      b.classList.toggle("sb-on", on);
    }
    if (animate && !reducedMotion() && typeof spreadBox.animate === "function")
      spreadBox.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 140,
        easing: "ease-out",
      });
    // Show the first castable spell, else the first; none on an empty page.
    const ready = here.findIndex((c) => c.reason === null);
    const at = ready >= 0 ? ready : 0;
    const pick = root.querySelectorAll<HTMLElement>(".sb-cell")[at];
    const c = here[at];
    if (pick && c) show(pick, c);
    else options.onShow(null);
    // A turned page took the focused spell with it: focus the shown one.
    if (hadCellFocus) (pick ?? next).focus();
  };

  const setContext = (t: BookContext): void => {
    if (t === context) return;
    context = t;
    spread = 0;
    fill(true);
  };
  const turn = (delta: number): void => {
    const total = spreadCount(spreadCards(cards, context, ribbon).length);
    const to = Math.max(0, Math.min(total - 1, spread + delta));
    if (to === spread) return;
    spread = to;
    fill(true);
  };
  back.addEventListener("click", () => turn(-1));
  next.addEventListener("click", () => turn(1));

  // Keyboard (focus inside the book): arrows move between spells, between
  // ribbons and between the tabs; Page Up and Page Down turn the pages.
  root.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    let done = true;
    if (
      (e.key === "Enter" || e.key === " ") &&
      target instanceof HTMLButtonElement
    ) {
      // The focused button's own activation; the screen's keys stay out.
      e.stopPropagation();
      return;
    }
    if (e.key === "PageDown") turn(1);
    else if (e.key === "PageUp") turn(-1);
    else if (
      target.classList.contains("sb-ribbon") &&
      target.dataset["ribbon"]
    ) {
      const i = RIBBONS.indexOf(target.dataset["ribbon"] as Ribbon);
      const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (d === 0) done = false;
      else {
        const r = RIBBONS[(i + d + RIBBONS.length) % RIBBONS.length] ?? "all";
        ribbon = r;
        spread = 0;
        fill(true);
        ribbonButtons.get(r)?.focus();
      }
    } else if (target.classList.contains("sb-tab")) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const t = context === "combat" ? "adventure" : "combat";
        setContext(t);
        tabButtons.get(t)?.focus();
      } else done = false;
    } else if (target.classList.contains("sb-cell")) {
      const cells = [...root.querySelectorAll<HTMLElement>(".sb-cell")];
      const i = cells.indexOf(target);
      // Visual grid: four columns (two a page), three rows.
      const page = i >= PER_PAGE ? 1 : 0;
      const j = i - page * PER_PAGE;
      const col = page * 2 + (j % 2);
      const row = Math.floor(j / 2);
      const at = (c: number, r: number): number =>
        (c >= 2 ? PER_PAGE : 0) + r * 2 + (c % 2);
      let to = -1;
      if (e.key === "ArrowRight") to = col < 3 ? at(col + 1, row) : -2;
      else if (e.key === "ArrowLeft") to = col > 0 ? at(col - 1, row) : -3;
      else if (e.key === "ArrowDown") to = at(col, row + 1);
      else if (e.key === "ArrowUp") to = row > 0 ? at(col, row - 1) : -1;
      else done = false;
      if (to === -2) turn(1);
      else if (to === -3) turn(-1);
      else if (to >= 0) cells[to]?.focus();
    } else done = false;
    if (done) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  fill();
  return {
    root,
    state: () => ({ context, ribbon, spread }),
    setContext,
    setRibbon: (r) => {
      ribbon = r;
      spread = 0;
      fill();
    },
    turn,
  };
}
