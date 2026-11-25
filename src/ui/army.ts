/**
 * A row of 7 army slots (portrait + count), used by the hero panel; and
 * the move rules of the screens that draw the hero sheet's army band: the
 * town's garrison and visiting-hero rows (bead bzc.61) and the meeting of
 * two heroes (bead bzc.64), with its whole-army swap and stack drag.
 */
import type { SlotRef } from "../core/game/index.ts";
import type { ArmySlots } from "../core/game/types.ts";
import { getCreature } from "../data/creatures.ts";
import { creatureCount } from "./format.ts";
import { el, img } from "./dom.ts";
import { creatureTip } from "./info-tips.ts";
import { setTip } from "./tooltip.ts";

export interface ArmyRowOptions {
  /** Slot index highlighted as selected. */
  selected?: number | null;
  onClick?: (slot: number, e: MouseEvent) => void;
  small?: boolean;
}

export function armyRow(
  army: ArmySlots,
  options: ArmyRowOptions = {},
): HTMLElement {
  const row = el("div.gm-army");
  if (options.small === true) row.classList.add("gm-army-small");
  army.forEach((stack, i) => {
    const slot = el("div.gm-slot");
    if (stack !== null) {
      const def = getCreature(stack.creature);
      slot.append(img(`portrait-${def.sprite}`, "gm-slot-portrait"));
      slot.append(el("span.gm-slot-count", String(stack.count)));
      slot.setAttribute(
        "aria-label",
        creatureCount(stack.creature, stack.count),
      );
      setTip(slot, () => creatureTip(stack.creature, stack.count));
    } else {
      slot.classList.add("gm-empty");
    }
    if (options.selected === i) slot.classList.add("gm-selected");
    const onClick = options.onClick;
    if (onClick !== undefined) {
      slot.classList.add("gm-clickable");
      slot.addEventListener("click", (e) => onClick(i, e));
    }
    row.append(slot);
  });
  return row;
}

/** The two armies of a town screen: the garrison and the visiting hero's. */
export interface TownArmies {
  readonly garrison: ArmySlots;
  /** Undefined when no hero is visiting. */
  readonly hero?: ArmySlots | undefined;
}

/** A stack transfer the town screen asks for (core `transferStack`). */
export interface TownArmyMove {
  readonly from: SlotRef;
  readonly to: SlotRef;
  /** Only part of the stack (shift: half); the whole stack without it. */
  readonly count?: number;
}

/**
 * The transfer a click or a drop from `from` onto `to` asks for in the
 * town's two rows (bead bzc.61): the whole stack, or half of it with
 * `half` (shift held). Null when there is nothing to do: the same slot, an
 * empty source, no visiting hero, or half of a single creature.
 */
export function townArmyMove(
  armies: TownArmies,
  from: SlotRef,
  to: SlotRef,
  half: boolean,
): TownArmyMove | null {
  return armyMove(
    { garrison: armies.garrison, hero: armies.hero },
    from,
    to,
    half,
  );
}

/** The armies a screen shows, by the slot references that name them. */
export type ArmiesByRef = Partial<
  Record<SlotRef["army"], ArmySlots | undefined>
>;

/**
 * The transfer a click or a drop asks for between any armies on one screen
 * (the town's rows, bead bzc.61; the meeting's two heroes, bzc.64): the
 * whole stack, or half of it with `half`. Null when there is nothing to do:
 * the same slot, an empty source, a missing army, or half of one creature.
 */
export function armyMove(
  armies: ArmiesByRef,
  from: SlotRef,
  to: SlotRef,
  half: boolean,
): TownArmyMove | null {
  if (from.army === to.army && from.slot === to.slot) return null;
  const source = armies[from.army];
  if (source === undefined || armies[to.army] === undefined) return null;
  const stack = source[from.slot];
  if (stack === null || stack === undefined) return null;
  if (!half) return { from, to };
  const count = Math.floor(stack.count / 2);
  return count === 0 ? null : { from, to, count };
}

/**
 * The transfers that swap two heroes' whole armies slot for slot at a
 * meeting (bead bzc.64), each a move the core's transferStack accepts in
 * this order without leaving either hero without a creature (RULES_V2
 * 5.3). `hero` is the army named "hero", `other` the one named "other".
 * Different creatures in one slot swap; the same creature moves the
 * difference; a slot only one hero fills moves across. When no slot is
 * filled on both sides, the first pair of lone stacks trades through a
 * swap across their slots first, so that neither army is ever empty.
 */
export function swapArmiesPlan(
  hero: ArmySlots,
  other: ArmySlots,
): TownArmyMove[] {
  const H = (slot: number): SlotRef => ({ army: "hero", slot });
  const O = (slot: number): SlotRef => ({ army: "other", slot });
  const steps: TownArmyMove[] = [];
  const heroOnly: number[] = [];
  const otherOnly: number[] = [];
  let shared = 0;
  const slots = Math.max(hero.length, other.length);
  for (let i = 0; i < slots; i++) {
    const a = hero[i] ?? null;
    const b = other[i] ?? null;
    if (a !== null && b !== null) {
      shared++;
      if (a.creature !== b.creature) steps.push({ from: H(i), to: O(i) });
      else if (a.count > b.count)
        steps.push({ from: H(i), to: O(i), count: a.count - b.count });
      else if (b.count > a.count)
        steps.push({ from: O(i), to: H(i), count: b.count - a.count });
    } else if (a !== null) heroOnly.push(i);
    else if (b !== null) otherOnly.push(i);
  }
  const i = heroOnly[0];
  const j = otherOnly[0];
  if (shared === 0 && i !== undefined && j !== undefined) {
    heroOnly.shift();
    otherOnly.shift();
    const a = hero[i] ?? null;
    const b = other[j] ?? null;
    if (a !== null && b !== null && a.creature !== b.creature) {
      // Swap across the two slots, then each army moves its new stack over.
      steps.push(
        { from: H(i), to: O(j) },
        { from: H(i), to: H(j) },
        { from: O(j), to: O(i) },
      );
    } else if (a !== null && b !== null) {
      // The same creature: each moves its own over, then the difference.
      steps.push({ from: H(i), to: H(j) }, { from: O(j), to: O(i) });
      if (a.count > b.count)
        steps.push({ from: H(j), to: O(i), count: a.count - b.count });
      else if (b.count > a.count)
        steps.push({ from: O(i), to: H(j), count: b.count - a.count });
    }
  }
  for (const k of heroOnly) steps.push({ from: H(k), to: O(k) });
  for (const k of otherOnly) steps.push({ from: O(k), to: H(k) });
  return steps;
}

/** The stack being dragged on a screen of army bands, shared by its bands. */
export interface ArmyDrag {
  from: SlotRef | null;
}

/**
 * Lets the stacks of an army band be dragged onto any slot of the bands
 * sharing `drag` (the town's rows, bead bzc.61; the meeting, bzc.64); a
 * drop calls `drop` (shift held: half). `root` holds every band, for
 * clearing the drop highlight when a drag ends.
 */
export function wireArmyDrag(
  band: HTMLElement,
  army: SlotRef["army"],
  slots: ArmySlots,
  drag: ArmyDrag,
  root: HTMLElement,
  drop: (from: SlotRef, to: SlotRef, half: boolean) => void,
): void {
  for (const cell of band.querySelectorAll<HTMLElement>(".hs-army-slot")) {
    const slot = Number(cell.dataset["slot"]);
    if (slots[slot] != null) {
      cell.draggable = true;
      cell.addEventListener("dragstart", (e) => {
        drag.from = { army, slot };
        e.dataTransfer?.setData("text/plain", `${army}:${slot}`);
        if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = "move";
        cell.classList.add("gm-dragging");
      });
      cell.addEventListener("dragend", () => {
        drag.from = null;
        cell.classList.remove("gm-dragging");
        for (const n of root.querySelectorAll(".gm-drop-over"))
          n.classList.remove("gm-drop-over");
      });
    }
    cell.addEventListener("dragover", (e) => {
      if (drag.from === null) return;
      e.preventDefault();
      if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "move";
      cell.classList.add("gm-drop-over");
    });
    cell.addEventListener("dragleave", () =>
      cell.classList.remove("gm-drop-over"),
    );
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = drag.from;
      drag.from = null;
      if (from === null) return;
      drop(from, { army, slot }, e.shiftKey);
    });
  }
}
