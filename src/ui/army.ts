/**
 * A row of 7 army slots (portrait + count), used by the hero panel and the
 * town screen's garrison and visiting-hero rows.
 */
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
