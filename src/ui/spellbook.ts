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
  isFreeAdventureCast,
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
import { spellTip } from "./info-tips.ts";
import { SCHOOL_COLOURS, SCHOOL_NAMES } from "./battle/magic.ts";
import { medallion, renderSpread } from "./spellbook-spread.ts";
import type { BookContext, SpreadCard } from "./spellbook-spread.ts";

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
  "ship",
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
  // Adventure pages an artifact grants (the Ship in a Bottle, NAVAL 7.4).
  const adventureKnown = new Set(known);
  for (const s of ADVENTURE_SPELLS)
    if (isFreeAdventureCast(hero, s.id)) adventureKnown.add(s.id);
  const scrolls = new Set(m.scrolls);
  const adventure: BookPage[] = [];
  for (const school of SCHOOLS)
    for (const s of ADVENTURE_SPELLS) {
      if (s.school !== school) continue;
      for (const scroll of [false, true]) {
        if (!(scroll ? scrolls : adventureKnown).has(s.id)) continue;
        adventure.push({
          id: s.id,
          name: s.name,
          school: s.school,
          tier: s.tier,
          scroll,
          cost: scroll
            ? "scroll"
            : isFreeAdventureCast(hero, s.id)
              ? "free"
              : `${adventureManaCost(hero, s.id)} mana`,
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

/** A page's key in the book: its half, id and whether it is a scroll. */
export function pageKey(p: BookPage): string {
  return `${p.usable === null ? "combat" : "adventure"}:${p.id}${p.scroll ? ":scroll" : ""}`;
}

/** Why a combat page is dimmed in the adventure book. */
export const IN_BATTLE =
  "A combat spell: cast it in battle (B opens the book there).";

/**
 * The book's spells (bead bzc.99): the adventure pages, castable or dimmed
 * with their reason, and the combat pages, dimmed lightly because they
 * are cast in battle. `pin` gives a page its right-click card.
 */
export function bookCards(
  pages: Record<BookTab, BookPage[]>,
  pin?: (p: BookPage) => () => string | Node,
): SpreadCard[] {
  const card = (p: BookPage, context: BookContext): SpreadCard => {
    const reason =
      context === "combat" ? IN_BATTLE : (p.usable?.reason ?? null);
    return {
      key: pageKey(p),
      id: p.id,
      icon: "spell",
      name: p.name,
      school: p.school,
      context,
      tier: p.tier,
      cost: p.cost,
      note: p.scroll ? "scroll" : null,
      reason,
      short: reason === null ? null : shortReason(reason),
      away: context === "combat",
      className: `gm-book-cell${reason !== null ? " gm-book-off" : ""}`,
      ...(p.scroll ? { data: { scroll: "true" } } : {}),
      ...(pin ? { pin: pin(p) } : {}),
    };
  };
  return [
    ...pages.adventure.map((p) => card(p, "adventure")),
    ...pages.battle.map((p) => card(p, "combat")),
  ];
}

export interface AdventureBookOptions {
  /**
   * Reading only (bead bzc.82: the hero sheet's book when the hero cannot
   * cast now, such as another player's turn): the cast buttons are off and
   * the pane says where spells are cast.
   */
  readonly readOnly?: boolean;
}

/** Opens the book; resolves with the chosen cast, or null. */
export function openAdventureBook(
  state: GameState,
  hero: HeroState,
  options: AdventureBookOptions = {},
): Promise<BookChoice> {
  const readOnly = options.readOnly === true;
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
      const off = usable.reason !== null || readOnly;
      if (readOnly) {
        box.append(
          el(
            "div.gm-book-how.gm-book-readonly",
            "Read only here: cast from the map on your turn (M).",
          ),
        );
      }
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

    /** The Power a page is cast at (its card and the detail pane). */
    const pagePower = (p: BookPage): number =>
      isAdventureSpell(p.id) &&
      p.usable !== null &&
      ADVENTURE_SPELLS.some((x) => x.id === p.id)
        ? adventurePower(hero, p.id, p.scroll)
        : p.scroll
          ? m.scrollPower
          : m.pagePower[p.school];

    /** The detail pane: the whole page, its target, why not, the cast. */
    const detail = el("div.gm-book-detail");
    const showDetail = (p: BookPage, art?: HTMLElement): void => {
      detail.replaceChildren();
      detail.style.setProperty("--school", COLOURS[p.school]);
      detail.dataset["spell"] = p.id;
      const adventure = isAdventureSpell(p.id) && p.usable !== null;
      const s = adventure ? ADVENTURE_SPELLS.find((x) => x.id === p.id) : null;
      const power = pagePower(p);
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
          art ?? iconElement("spell", p.id, { scale: 2 }),
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

    const pageOf = new Map<string, BookPage>();
    for (const t of ["adventure", "battle"] as const)
      for (const p of pages[t]) pageOf.set(pageKey(p), p);
    const host = el("div.gm-book-spread");
    const main = el("div.gm-book-main", host, detail);
    renderSpread(host, {
      title: "",
      status: "",
      cards: bookCards(pages, (p) => () => spellTip(p.id, pagePower(p))),
      ranks: m.schoolRanks,
      context: "adventure",
      mode: "select",
      tabCount: (t, list) =>
        t === "adventure" && list.length > 0
          ? `${list.filter((c) => c.reason === null).length} of ${list.length} ready`
          : String(list.length),
      empty: (t, ribbon) =>
        ribbon !== "all"
          ? `No ${NAMES[ribbon]} ${t === "combat" ? "combat" : "adventure"} spells in the book.`
          : t === "adventure"
            ? "No adventure spells yet: a Magic Guild or a shrine teaches them."
            : "No combat spells yet: a Magic Guild or a shrine teaches them.",
      onShow: (card) => {
        const p = card === null ? undefined : pageOf.get(card.key);
        if (p && card) showDetail(p, medallion(card, m.schoolRanks));
        else
          detail.replaceChildren(
            el("div.gm-dim", "Choose a spell on the pages."),
          );
      },
      onPick: () => {
        // A double click casts a page with a single action.
        const only = detail.querySelectorAll<HTMLButtonElement>(
          ".gm-book-cast:not(:disabled)",
        );
        if (only.length === 1 && !detail.querySelector(".gm-book-amount"))
          only[0]?.click();
      },
    });
    body.append(main);

    let picked: BookChoice = null;
    void modal<BookChoice>({
      title: `${hero.name}'s spellbook`,
      className: "gm-book-dialog",
      body,
      // Not primary: Enter belongs to the focused spell or button.
      buttons: [{ label: "Close", value: null }],
      cancel: null,
      onOpen: (buttons) => {
        done = (c) =>
          buttons[0]?.dispatchEvent(new CustomEvent("bm-pick", { detail: c }));
        buttons[0]?.addEventListener("bm-pick", (ev) => {
          const c = (ev as CustomEvent<BookChoice>).detail;
          picked = c;
          buttons[0]?.click();
        });
        // Keyboard: start on the shown spell (arrows move, Page keys turn).
        body.querySelector<HTMLElement>(".sb-cell.sb-shown")?.focus();
      },
    }).then(() => resolve(picked));
  });
}
