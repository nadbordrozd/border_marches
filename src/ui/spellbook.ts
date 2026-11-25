/**
 * The adventure spellbook (RULES_V2 2.8), as a Heroes book (bead bzc.63,
 * UI2-13): two tabs, "Adventure" first and "Battle"; school chips that
 * narrow the page; the pages as a grid of big icons with name and mana
 * under them, the castable adventure pages first and the greyed ones saying
 * why in two words. A click shows the page in the detail pane beside the
 * grid: the effect at the hero's Power with its keywords, the target type,
 * the full reason it cannot be cast (no valid target included, bead
 * bzc.47) and the cast button. Picking returns the cast for the game screen
 * to run, or an aim whose valid targets (a neutral stack within 2 cells, an
 * enemy hero or sealed site, an explored cell) glow on the map for the next
 * click. An amount and a pylon are chosen in the pane. Battle pages are for
 * reference: they are cast from the battle's action bar.
 */

import type { School } from "../core/battle/index.ts";
import type { GameState, HeroState } from "../core/game/index.ts";
import {
  ADVENTURE_SPELLS,
  adventureManaCost,
  adventurePower,
  heroMagic,
  isAdventureSpell,
  isBattleSpell,
  spellDef,
  storeOf,
} from "../core/magic/index.ts";
import type {
  AdventureSpellDef,
  AdventureTarget,
} from "../core/magic/index.ts";
import { el, modal } from "./dom.ts";
import { iconElement } from "./icons.ts";
import { targetLine } from "./target-icon.ts";
import { spellTargetKind } from "./battle/spell-targets.ts";
import { adventureTargetKind, adventureUsable } from "./adventure-targets.ts";
import type { AdventureAim, AdventureUsable } from "./adventure-targets.ts";
import { rulesText } from "./keywords.ts";
import { SCHOOL_COLOURS, SCHOOL_NAMES } from "./battle/magic.ts";

const SCHOOLS: readonly School[] = [
  "bloom",
  "accord",
  "clock",
  "hush",
  "storm",
];
const NAMES = SCHOOL_NAMES;
/** The icons' frame colours, shared with the battle book. */
const COLOURS = SCHOOL_COLOURS;

export type BookChoice =
  | {
      readonly kind: "cast";
      readonly spell: string;
      readonly scroll: boolean;
      readonly target: AdventureTarget;
    }
  /**
   * Aimed on the map: the valid targets glow and the next map click on
   * one casts (bead bzc.47).
   */
  | {
      readonly kind: "aim";
      readonly spell: string;
      readonly scroll: boolean;
      readonly aims: readonly AdventureAim[];
    }
  | null;

/** Target kinds aimed on the map rather than chosen in the book. */
const AIMED_ON_MAP: ReadonlySet<string> = new Set([
  "nearbyMonster",
  "sealed",
  "exploredCell",
]);

export type BookTab = "adventure" | "battle";

/** One page or scroll of the book. */
export interface BookPage {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly tier: number;
  readonly scroll: boolean;
  /** "4 mana", "scroll". */
  readonly cost: string;
  /**
   * Adventure pages: whether it can be cast now and its targets. Battle
   * pages: null (they are cast in battle).
   */
  readonly usable: AdventureUsable | null;
}

/** Whether a page can be cast from the book now. */
export function castable(p: BookPage): boolean {
  return p.usable !== null && p.usable.reason === null;
}

/**
 * The hero's pages and scrolls on each tab: adventure ones with the
 * castable first (then by school and tier), battle ones by school.
 */
export function bookPages(
  state: GameState,
  hero: HeroState,
): Record<BookTab, BookPage[]> {
  const m = heroMagic(hero);
  const known = new Set(m.knownSpells);
  const scrolls = new Set(m.scrolls);
  const adventure: BookPage[] = [];
  for (const school of SCHOOLS)
    for (const s of ADVENTURE_SPELLS) {
      if (s.school !== school) continue;
      for (const scroll of [false, true]) {
        if (!(scroll ? scrolls : known).has(s.id)) continue;
        adventure.push({
          id: s.id,
          name: s.name,
          school: s.school,
          tier: s.tier,
          scroll,
          cost: scroll ? "scroll" : `${adventureManaCost(hero, s.id)} mana`,
          usable: adventureUsable(state, hero, s.id, scroll),
        });
      }
    }
  const battle: BookPage[] = [];
  for (const school of SCHOOLS)
    for (const scroll of [false, true])
      for (const id of scroll ? scrolls : known) {
        if (!isBattleSpell(id)) continue;
        const d = spellDef(id);
        if (d.school !== school) continue;
        battle.push({
          id,
          name: d.name,
          school: d.school,
          tier: d.tier,
          scroll,
          cost: scroll ? "scroll" : `${d.mana} mana`,
          usable: null,
        });
      }
  return {
    adventure: [
      ...adventure.filter(castable),
      ...adventure.filter((p) => !castable(p)),
    ],
    battle,
  };
}

/** Two words under a greyed adventure page: why it cannot be cast. */
export function shortReason(reason: string): string {
  if (/no effect/i.test(reason)) return "no effect";
  if (/mana/i.test(reason)) return "no mana";
  if (/today/i.test(reason)) return "cast today";
  if (/rank/i.test(reason)) return "needs rank";
  if (/not on this map/i.test(reason)) return "not here";
  if (/pylon/i.test(reason)) return "needs pylon";
  if (/movement/i.test(reason)) return "no movement";
  return "no target";
}

/** Opens the book; resolves with the chosen cast, or null. */
export function openAdventureBook(
  state: GameState,
  hero: HeroState,
): Promise<BookChoice> {
  const m = heroMagic(hero);
  const cast = storeOf(state, hero.id).castToday;
  const pages = bookPages(state, hero);
  return new Promise((resolve) => {
    let done: ((c: BookChoice) => void) | null = null;
    const finish = (c: BookChoice): void => done?.(c);
    const body = el("div.gm-book");
    body.append(
      el(
        "div.gm-book-status",
        `Mana ${m.mana} / ${m.maxMana} · Power ${m.power} · ` +
          `${m.scrolls.length} of ${m.scrollCase} scrolls` +
          (cast.length > 0 ? ` · cast today: ${cast.join(", ")}` : ""),
      ),
    );

    /** The pane's cast controls for an adventure page. */
    const actions = (s: AdventureSpellDef, p: BookPage): HTMLElement => {
      const box = el("div.gm-book-actions");
      const usable = p.usable ?? { reason: "", aims: null };
      const off = usable.reason !== null;
      const scroll = p.scroll;
      const pick = (target: AdventureTarget, label = "Cast"): void => {
        const b = el("button.gm-btn.gm-primary.gm-book-cast", label);
        b.type = "button";
        b.disabled = off;
        b.addEventListener("click", () =>
          finish({ kind: "cast", spell: s.id, scroll, target }),
        );
        box.append(b);
      };
      if (s.target === "none") pick({});
      else if (AIMED_ON_MAP.has(s.target)) {
        const n = usable.aims?.length ?? 0;
        const b = el(
          "button.gm-btn.gm-primary.gm-book-cast.gm-book-aim",
          "Aim on the map…",
        );
        b.type = "button";
        b.disabled = off;
        const how =
          s.target === "exploredCell"
            ? "The cells in reach glow on the map; click one to cast."
            : `${n} valid target${n === 1 ? "" : "s"} will glow on the map; click one to cast.`;
        b.title = usable.reason ?? how;
        if (!off) box.append(el("div.gm-book-how", how));
        b.addEventListener("click", () =>
          finish({ kind: "aim", spell: s.id, scroll, aims: usable.aims ?? [] }),
        );
        box.append(b);
      } else if (s.target === "amount") {
        const power = adventurePower(hero, s.id, scroll);
        const input = el("input.gm-book-amount");
        input.type = "number";
        input.min = "1";
        const max = Math.min(hero.mp, 200 + 50 * power);
        input.max = String(max);
        input.value = String(max);
        const b = el("button.gm-btn.gm-primary.gm-book-cast", "Save");
        b.type = "button";
        b.disabled = off || max < 1;
        b.addEventListener("click", () =>
          finish({
            kind: "cast",
            spell: s.id,
            scroll,
            target: { amount: Number(input.value) },
          }),
        );
        box.append(input, b);
      } else if (s.target === "pylon") {
        // Destinations may lie anywhere on the map: chosen from a list.
        for (const o of usable.aims ?? []) pick(o.target, `To the ${o.label}`);
      }
      return box;
    };

    /** The detail pane: the whole page, its target, why not, the cast. */
    const detail = el("div.gm-book-detail");
    const showDetail = (p: BookPage): void => {
      detail.replaceChildren();
      detail.style.setProperty("--school", COLOURS[p.school]);
      detail.dataset["spell"] = p.id;
      const adventure = isAdventureSpell(p.id) && p.usable !== null;
      const s = adventure ? ADVENTURE_SPELLS.find((x) => x.id === p.id) : null;
      const power = s
        ? adventurePower(hero, p.id, p.scroll)
        : p.scroll
          ? m.scrollPower
          : m.pagePower[p.school];
      const move =
        s?.moveCost === undefined
          ? ""
          : s.moveCost === "all"
            ? " · all movement"
            : s.moveCost > 0
              ? ` · ${s.moveCost} movement`
              : "";
      detail.append(
        el(
          "div.gm-book-detail-head",
          iconElement("spell", p.id, { scale: 2 }),
          el(
            "div",
            el(
              "div.gm-book-detail-name",
              p.name + (p.scroll ? " (scroll)" : ""),
            ),
            el(
              "div.gm-dim",
              `${NAMES[p.school]} ${p.tier} · ${p.cost}${move} · Power ${power}`,
            ),
          ),
        ),
      );
      if (s) {
        detail.append(
          rulesText(s.text(power), {
            tag: "div",
            className: "gm-book-detail-text",
            hover: true,
          }),
          targetLine(adventureTargetKind(s.target), "gm-book-target"),
        );
        const reason = p.usable?.reason ?? null;
        if (reason) detail.append(el("div.gm-book-why", reason));
        detail.append(actions(s, p));
      } else {
        const d = spellDef(p.id);
        detail.append(
          rulesText(d.text(power), {
            tag: "div",
            className: "gm-book-detail-text",
            hover: true,
          }),
        );
        const kind = spellTargetKind(p.id);
        if (kind) detail.append(targetLine(kind, "gm-book-target"));
        detail.append(
          el(
            "div.gm-book-battle-note",
            "Cast in battle from the action bar (B).",
          ),
        );
      }
    };

    const tabs = el("div.gm-book-tabs");
    tabs.setAttribute("role", "tablist");
    const chips = el("div.gm-book-chips");
    const grid = el("div.gm-book-grid");
    const main = el("div.gm-book-main", grid, detail);
    let tab: BookTab = "adventure";
    let school: School | "all" = "all";
    let shown: HTMLElement | null = null;

    const cell = (p: BookPage): HTMLElement => {
      const off = p.usable !== null && p.usable.reason !== null;
      const b = el("button.gm-book-cell");
      b.type = "button";
      b.dataset["spell"] = p.id;
      if (p.scroll) b.dataset["scroll"] = "true";
      b.style.setProperty("--school", COLOURS[p.school]);
      // Greyed, but still selectable: the pane then says why in full.
      if (off) b.classList.add("gm-book-off");
      b.setAttribute(
        "aria-label",
        `${p.name}${p.scroll ? " (scroll)" : ""}, ${p.cost}${off ? `. ${p.usable?.reason ?? ""}` : ""}`,
      );
      const icon = iconElement("spell", p.id, { scale: 2 });
      // The name is written under it; no browser tooltip on top.
      icon.removeAttribute("title");
      b.append(
        icon,
        el("span.gm-book-cell-name", p.name),
        el(
          `span.gm-book-cell-cost${off ? ".gm-book-cell-why" : ""}`,
          off ? shortReason(p.usable?.reason ?? "") : p.cost,
        ),
      );
      const select = (): void => {
        shown?.classList.remove("gm-book-sel");
        b.classList.add("gm-book-sel");
        shown = b;
        showDetail(p);
      };
      b.addEventListener("click", select);
      // A second click on a castable page with a single action casts it.
      b.addEventListener("dblclick", () => {
        select();
        const only = detail.querySelectorAll<HTMLButtonElement>(
          ".gm-book-cast:not(:disabled)",
        );
        if (only.length === 1 && !detail.querySelector(".gm-book-amount"))
          only[0]?.click();
      });
      return b;
    };

    const fill = (): void => {
      const list = pages[tab].filter(
        (p) => school === "all" || p.school === school,
      );
      grid.replaceChildren(...list.map(cell));
      shown = null;
      const first = grid.firstElementChild;
      if (first instanceof HTMLElement) first.click();
      else
        detail.replaceChildren(
          el(
            "div.gm-dim",
            tab === "adventure"
              ? "No adventure spells yet: a Magic Guild or a shrine teaches them."
              : "No battle pages yet: a Magic Guild or a shrine teaches them.",
          ),
        );
      for (const t of tabs.children)
        t.setAttribute(
          "aria-selected",
          String((t as HTMLElement).dataset["tab"] === tab),
        );
      // Only the schools this tab has pages of get a chip.
      const here = SCHOOLS.filter((s) =>
        pages[tab].some((p) => p.school === s),
      );
      chips.replaceChildren();
      if (here.length > 1)
        for (const s of ["all" as const, ...here]) {
          const c = el("button.gm-book-chip", s === "all" ? "All" : NAMES[s]);
          c.type = "button";
          c.dataset["school"] = s;
          if (s !== "all") c.style.setProperty("--school", COLOURS[s]);
          if (s === school) c.classList.add("gm-on");
          c.addEventListener("click", () => {
            school = s;
            fill();
          });
          chips.append(c);
        }
    };

    for (const t of ["adventure", "battle"] as const) {
      const ready = pages[t].filter(castable).length;
      const b = el(
        "button.gm-book-tab",
        t === "adventure" ? "Adventure" : "Battle",
        el(
          "span.gm-book-tab-n",
          t === "adventure" && pages[t].length > 0
            ? `${ready} of ${pages[t].length} ready`
            : String(pages[t].length),
        ),
      );
      b.type = "button";
      b.dataset["tab"] = t;
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => {
        if (tab === t) return;
        tab = t;
        school = "all";
        fill();
      });
      tabs.append(b);
    }
    body.append(tabs, chips, main);
    fill();

    let picked: BookChoice = null;
    void modal<BookChoice>({
      title: `${hero.name}'s spellbook`,
      className: "gm-book-dialog",
      body,
      buttons: [{ label: "Close", value: null, primary: true }],
      cancel: null,
      onOpen: (buttons) => {
        done = (c) =>
          buttons[0]?.dispatchEvent(new CustomEvent("bm-pick", { detail: c }));
        buttons[0]?.addEventListener("bm-pick", (ev) => {
          const c = (ev as CustomEvent<BookChoice>).detail;
          picked = c;
          buttons[0]?.click();
        });
      },
    }).then(() => resolve(picked));
  });
}
