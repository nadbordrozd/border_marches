/**
 * The meeting of two own heroes side by side (RULES_V2 5.3; bead
 * border_marches-bzc.64, UI2-14): two mirrored columns, one per hero, as
 * Heroes III's trade screen: portrait, name and stats; the hero sheet's
 * army band; the worn items and the backpack and scroll case as icons.
 * Between the columns, "Swap armies" and "All items" in each direction.
 * Stacks move as in the town (click to pick up, click to put down, shift
 * for half, or drag); items go across by a click or a drag. Each slot's
 * and item's hover card says what a click does.
 */
import {
  backpackSize,
  handOver,
  heroStats,
  maxMana,
  scrollCaseSize,
  transferStack,
  type CommandResult,
  type GameState,
  type HeroState,
  type ItemRef,
  type SlotRef,
} from "../core/game/index.ts";
import { namedHeroPortrait } from "../assets/unit-art.ts";
import { SLOT_NAMES, WORN_SLOTS, wornDef } from "../data/artifacts.ts";
import { getHeroClass } from "../data/classes.ts";
import { PRIMARY_STATS, STAT_NAMES } from "../data/effects.ts";
import {
  armyMove,
  swapArmiesPlan,
  wireArmyDrag,
  type ArmyDrag,
} from "./army.ts";
import { button, el, img, modal, toast } from "./dom.ts";
import {
  armyBand,
  armySlotViews,
  backpackSlots,
  dollSlot,
  itemCard,
  itemIcon,
  scrollIcon,
  type ArmySlotView,
  type HeroScreenHost,
} from "./hero-screen.ts";
import { iconElement } from "./icons.ts";
import { setTip, tipCard } from "./tooltip.ts";

/**
 * Swaps two meeting heroes' whole armies slot for slot (bead bzc.64): the
 * steps of {@link swapArmiesPlan}, each through the core's transferStack,
 * so every rule holds (side by side, own turn, a vow's barred creatures);
 * the first failure is the result and nothing changes.
 */
export function swapArmies(
  state: GameState,
  heroId: string,
  otherId: string,
): CommandResult {
  const a = state.heroes.find((h) => h.id === heroId);
  const b = state.heroes.find((h) => h.id === otherId);
  if (a === undefined || b === undefined) {
    return { ok: false, error: "unknown-hero", message: "no such hero" };
  }
  let s = state;
  const events: Extract<CommandResult, { ok: true }>["events"] = [];
  for (const step of swapArmiesPlan(a.army, b.army)) {
    const r = transferStack(s, { heroId, otherHeroId: otherId, ...step });
    if (!r.ok) return r;
    s = r.state;
    events.push(...r.events);
  }
  return { ok: true, state: s, events };
}

/** What "All items" did: the result, and how many went or stayed. */
export interface GiveAllResult {
  readonly result: CommandResult;
  /** Items and scrolls handed over. */
  readonly given: number;
  /** Items and scrolls that stayed: cursed and worn, or no room. */
  readonly kept: number;
}

/**
 * Hands every item and scroll of one hero to the other (bead bzc.64): worn
 * ones first (they arrive in the backpack), then the backpack, then the
 * scroll case, each through the core's handOver. What cannot go (a cursed
 * worn item, a full backpack or case) stays. Fails, changing nothing, when
 * nothing could go.
 */
export function giveAllItems(
  state: GameState,
  fromId: string,
  toId: string,
): GiveAllResult {
  let s = state;
  let given = 0;
  let kept = 0;
  let firstFail: CommandResult | null = null;
  const from = (): HeroState | undefined =>
    s.heroes.find((h) => h.id === fromId);
  const tryGive = (ref: ItemRef): boolean => {
    const r = handOver(s, fromId, toId, ref);
    if (!r.ok) {
      firstFail ??= r;
      kept++;
      return false;
    }
    s = r.state;
    given++;
    return true;
  };
  const start = from();
  if (start === undefined) {
    return {
      result: { ok: false, error: "unknown-hero", message: "no such hero" },
      given,
      kept,
    };
  }
  start.worn.forEach((id, index) => {
    if (id !== null) tryGive({ place: "worn", index });
  });
  // A handed item leaves its list, so the next one moves up to `index`.
  for (const place of ["backpack", "scrolls"] as const) {
    let index = 0;
    while (index < (from()?.[place].length ?? 0)) {
      if (!tryGive({ place, index })) index++;
    }
  }
  if (given === 0) {
    return {
      result: firstFail ?? {
        ok: false,
        error: "empty-slot",
        message: "nothing to hand over",
      },
      given,
      kept,
    };
  }
  return { result: { ok: true, state: s, events: [] }, given, kept };
}

/** The items and scrolls a hero holds (worn, carried, scrolls). */
export function itemCount(h: HeroState): number {
  return (
    h.worn.filter((w) => w !== null).length +
    h.backpack.length +
    h.scrolls.length
  );
}

/** Opens the meeting of `heroId` (left column) and `otherId` (right). */
export async function openMeeting(
  host: HeroScreenHost,
  heroId: string,
  otherId: string,
): Promise<void> {
  const body = el("div.hs-meet");
  /** The stack picked up by a click, if any. */
  let picked: SlotRef | null = null;
  const drag: ArmyDrag = { from: null };
  /** The item being dragged, if any: whose and where from. */
  let itemDrag: { heroId: string; ref: ItemRef } | null = null;

  const heroes = (): [HeroState, HeroState] | null => {
    const s = host.state();
    const a = s.heroes.find((h) => h.id === heroId);
    const b = s.heroes.find((h) => h.id === otherId);
    return a === undefined || b === undefined ? null : [a, b];
  };
  const refOf = (id: string): SlotRef["army"] =>
    id === heroId ? "hero" : "other";
  const run = (result: CommandResult): void => {
    host.run(result);
    render();
  };

  /** A click or a drop moves a stack (shift: half), as in the town. */
  const move = (from: SlotRef, to: SlotRef, half: boolean): void => {
    picked = null;
    const both = heroes();
    if (both === null) return;
    const plan = armyMove(
      { hero: both[0].army, other: both[1].army },
      from,
      to,
      half,
    );
    if (plan === null) {
      render();
      return;
    }
    run(transferStack(host.state(), { heroId, otherHeroId: otherId, ...plan }));
  };

  const onSlot =
    (army: SlotRef["army"], slots: HeroState["army"]) =>
    (slot: number, e: MouseEvent): void => {
      if (picked === null) {
        if (slots[slot] != null) picked = { army, slot };
        render();
        return;
      }
      if (picked.army === army && picked.slot === slot) {
        picked = null;
        render();
        return;
      }
      move(picked, { army, slot }, e.shiftKey);
    };

  const give = (from: HeroState, to: HeroState, ref: ItemRef): void =>
    run(handOver(host.state(), from.id, to.id, ref));

  /** Makes an item icon clickable and draggable to the other hero. */
  const tradeable = (
    node: HTMLElement,
    id: string,
    from: HeroState,
    to: HeroState,
    ref: ItemRef,
    scroll = false,
  ): HTMLElement => {
    if (ref.place === "worn" && wornDef(id)?.cursed === true) {
      setTip(node, () => itemCard(id, "Cursed: it cannot be handed over."));
      return node;
    }
    const hint =
      ref.place === "worn"
        ? `Click or drag: give it to ${to.name} (it arrives in the backpack).`
        : `Click or drag: give it to ${to.name}.`;
    if (scroll) {
      const name = node.title;
      setTip(node, `${name}\n${hint}`);
    } else setTip(node, () => itemCard(id, hint));
    node.classList.add("hs-tradeable");
    node.draggable = true;
    node.addEventListener("click", () => give(from, to, ref));
    node.addEventListener("dragstart", (e) => {
      itemDrag = { heroId: from.id, ref };
      e.dataTransfer?.setData("text/plain", `${from.id}:${ref.place}`);
      if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = "move";
    });
    node.addEventListener("dragend", () => {
      itemDrag = null;
      for (const n of body.querySelectorAll(".hs-meet-drop"))
        n.classList.remove("hs-meet-drop");
    });
    return node;
  };

  /** A hero's items take drops of the other hero's items. */
  const dropZone = (zone: HTMLElement, to: HeroState): void => {
    zone.addEventListener("dragover", (e) => {
      if (itemDrag === null || itemDrag.heroId === to.id) return;
      e.preventDefault();
      if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "move";
      zone.classList.add("hs-meet-drop");
    });
    zone.addEventListener("dragleave", (e) => {
      if (!zone.contains(e.relatedTarget as Node | null))
        zone.classList.remove("hs-meet-drop");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      const d = itemDrag;
      itemDrag = null;
      zone.classList.remove("hs-meet-drop");
      if (d === null || d.heroId === to.id) return;
      run(handOver(host.state(), d.heroId, to.id, d.ref));
    });
  };

  /** One hero's column; `side` mirrors the right one. */
  const column = (
    h: HeroState,
    other: HeroState,
    side: "left" | "right",
  ): HTMLElement => {
    const army = refOf(h.id);
    const cls = getHeroClass(h.heroClass);
    const portrait = namedHeroPortrait(h.defId, h.heroClass);
    const st = heroStats(h);

    // ---- portrait, name, class and level, the four stats, moves and mana
    const statLine = el("div.gm-hero-statline.hs-meet-stats");
    for (const stat of PRIMARY_STATS) {
      const icon = iconElement("stat", stat, { className: "gm-stat-icon" });
      icon.removeAttribute("title");
      const cell = el(
        "span.gm-stat",
        icon,
        el("span.gm-stat-value", String(st[stat])),
      );
      cell.setAttribute("aria-label", `${STAT_NAMES[stat]} ${st[stat]}`);
      setTip(cell, `${STAT_NAMES[stat]} ${st[stat]}`);
      statLine.append(cell);
    }
    const meter = (kind: string, n: number, d: number, label: string) => {
      const bar = el(`div.gm-hero-meter.gm-${kind}`, label);
      const pct = Math.max(0, Math.min(100, (n / Math.max(1, d)) * 100));
      bar.style.setProperty("--fill", `${pct}%`);
      return bar;
    };
    const head = el(
      "div.hs-meet-head",
      img(portrait.key, "hs-portrait hs-meet-portrait", 2),
      el(
        "div.hs-meet-id",
        el("div.hs-name", h.name),
        el("div.hs-class", `Level ${h.level} ${cls.name}`),
        statLine,
        el(
          "div.gm-hero-meters.hs-meet-meters",
          meter("mp", h.mp, h.maxMp, `Moves ${h.mp} / ${h.maxMp}`),
          meter("mana", h.mana, maxMana(h), `Mana ${h.mana} / ${maxMana(h)}`),
        ),
      ),
    );

    // ---- the army band, as on the hero sheet and in the town
    const pickedView = (): ArmySlotView | null => {
      if (picked === null || picked.army === army) return null;
      return armySlotViews(other.army)[picked.slot] ?? null;
    };
    const band = armyBand(h.army, {
      selected: picked?.army === army ? picked.slot : null,
      pickedElsewhere: pickedView(),
      onSlot: onSlot(army, h.army),
    });
    wireArmyDrag(band, army, h.army, drag, body, move);
    const filled = h.army.filter((s) => s !== null).length;
    const armyBox = el(
      "section.hs-meet-army",
      el("h3", `Army ${filled} / ${h.army.length}`),
      band,
    );

    // ---- worn items in one row, empty slots as outlines
    const worn = el("div.hs-meet-worn-row");
    WORN_SLOTS.forEach((kind, index) => {
      const id = h.worn[index] ?? null;
      const cell = dollSlot(kind, id);
      if (id === null) {
        setTip(cell, () =>
          tipCard(SLOT_NAMES[kind], ["Empty."], { subtitle: "Worn slot" }),
        );
      } else {
        const icon = cell.firstElementChild;
        if (icon instanceof HTMLElement) {
          tradeable(icon, id, h, other, { place: "worn", index });
        }
      }
      worn.append(cell);
    });
    const wornBox = el("section.hs-meet-worn", el("h3", "Worn"), worn);

    // ---- backpack and scroll case
    const pack = el("div.hs-grid.hs-meet-pack");
    const slots = backpackSlots(h);
    for (let i = 0; i < backpackSize(h); i++) {
      const entry = slots[i];
      const cell = el("div.hs-cell");
      if (entry !== undefined) {
        cell.append(
          tradeable(itemIcon(entry.id, entry.count), entry.id, h, other, {
            place: "backpack",
            index: entry.index,
          }),
        );
      }
      pack.append(cell);
    }
    const scrolls = el("div.hs-grid.hs-meet-scrolls");
    for (let i = 0; i < scrollCaseSize(h); i++) {
      const spell = h.scrolls[i];
      const cell = el("div.hs-cell");
      if (spell !== undefined) {
        cell.append(
          tradeable(
            scrollIcon(spell),
            spell,
            h,
            other,
            { place: "scrolls", index: i },
            true,
          ),
        );
      }
      scrolls.append(cell);
    }
    const bags = el(
      "section.hs-meet-bags",
      el(
        "div",
        el("h3", `Backpack ${slots.length} / ${backpackSize(h)}`),
        pack,
      ),
      el(
        "div",
        el("h3", `Scrolls ${h.scrolls.length} / ${scrollCaseSize(h)}`),
        scrolls,
      ),
    );
    for (const zone of [wornBox, bags]) dropZone(zone, h);

    const col = el(
      `div.hs-meet-col.hs-meet-${side}`,
      head,
      armyBox,
      wornBox,
      bags,
    );
    col.dataset["hero"] = h.id;
    return col;
  };

  /** The middle: swap the armies; all items one way or the other. */
  const middle = (a: HeroState, b: HeroState): HTMLElement[] => {
    const big = (
      glyphText: string,
      label: string,
      tip: string,
      onClick: () => void,
    ): HTMLButtonElement => {
      const node = button("", onClick, "gm-btn hs-meet-btn");
      node.append(
        el("span.hs-meet-glyph", glyphText),
        el("span.hs-meet-label", label),
      );
      node.setAttribute("aria-label", tip.split("\n")[0] ?? tip);
      setTip(node, tip);
      return node;
    };
    const swap = big(
      "⇄",
      "Swap armies",
      `Swap the two armies, slot for slot: ${a.name} takes ${b.name}'s army and ${b.name} takes ${a.name}'s.`,
      () => {
        picked = null;
        run(swapArmies(host.state(), heroId, otherId));
      },
    );
    swap.classList.add("hs-meet-swap");
    const all = (from: HeroState, to: HeroState, glyphText: string) => {
      const node = big(
        glyphText,
        "All items",
        `Give all of ${from.name}'s items and scrolls to ${to.name}. Worn items arrive in the backpack; cursed ones stay, and so does what does not fit.`,
        () => {
          const out = giveAllItems(host.state(), from.id, to.id);
          if (out.result.ok && out.kept > 0) {
            toast(
              `${out.kept} ${out.kept === 1 ? "item stays" : "items stay"} with ${from.name}: cursed, or no room.`,
            );
          }
          run(out.result);
        },
      );
      node.disabled = itemCount(from) === 0;
      return node;
    };
    return [
      el("div.hs-meet-mid.hs-meet-mid-army", swap),
      el("div.hs-meet-mid.hs-meet-mid-items", all(a, b, "→"), all(b, a, "←")),
    ];
  };

  const render = (): void => {
    const both = heroes();
    if (both === null) return;
    const [a, b] = both;
    body.replaceChildren(
      column(a, b, "left"),
      ...middle(a, b),
      column(b, a, "right"),
    );
  };

  render();
  await modal<undefined>({
    title: "Heroes meet",
    body,
    className: "hs-meet-dialog",
    buttons: [{ label: "Done", value: undefined, primary: true }],
    cancel: undefined,
  });
}
