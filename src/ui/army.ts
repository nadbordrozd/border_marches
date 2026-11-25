/**
 * A row of 7 army slots (portrait + count), used by the hero panel and the
 * meeting; and the move rule of the town screen's garrison and
 * visiting-hero rows (bead bzc.61), which draw the hero sheet's army band.
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
  if (from.army === to.army && from.slot === to.slot) return null;
  const side = (ref: SlotRef): ArmySlots | undefined =>
    ref.army === "hero" ? armies.hero : armies.garrison;
  const source = side(from);
  if (source === undefined || side(to) === undefined) return null;
  const stack = source[from.slot];
  if (stack === null || stack === undefined) return null;
  if (!half) return { from, to };
  const count = Math.floor(stack.count / 2);
  return count === 0 ? null : { from, to, count };
}
