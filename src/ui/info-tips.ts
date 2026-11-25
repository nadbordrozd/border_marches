/**
 * Hover cards shared by the game screens (bead bzc.25): creatures with
 * full stats and abilities, spells, and buildings with their requirements
 * and what they unlock. Built with tipCard (src/ui/tooltip.ts).
 */
import {
  ability as battleAbility,
  alliedSchools,
  opposedSchools,
} from "../core/battle/index.ts";
import {
  adventureSpell,
  isAdventureSpell,
  isBattleSpell,
  spellDef,
} from "../core/magic/index.ts";
import type { SpellDef } from "../core/magic/index.ts";
import { ABILITIES } from "../data/abilities.ts";
import {
  creatureAbilities,
  getCreature,
  isCreatureId,
} from "../data/creatures.ts";
import { buildingDef, townTree } from "../data/factions.ts";
import { FACTIONS } from "../data/factions.ts";
import { spellName, findMapSpell } from "../data/map-spells.ts";
import type { BuildingId, FactionId } from "../data/types.ts";
import type { TownState } from "../core/game/index.ts";
import { costView, el, img } from "./dom.ts";
import { iconElement } from "./icons.ts";
import { tipCard } from "./tooltip.ts";

export const SCHOOL_LABEL: Readonly<Record<string, string>> = {
  bloom: "Bloom",
  accord: "Accord",
  clock: "Clock",
  hush: "Hush",
  storm: "Storm",
};

export const SCHOOL_COLOUR: Readonly<Record<string, string>> = {
  bloom: "#6fae4f",
  accord: "#d9b44a",
  clock: "#5a8fcf",
  hush: "#8a6bb8",
  storm: "#d0643c",
};

/** An ability's name and rule text, from the battle registry or the data. */
export function abilityText(id: string): { name: string; text: string } {
  try {
    const def = battleAbility(id);
    return { name: def.name, text: def.description };
  } catch {
    const def = (
      ABILITIES as Readonly<
        Record<string, (typeof ABILITIES)[keyof typeof ABILITIES]>
      >
    )[id];
    return def === undefined
      ? { name: id, text: "" }
      : { name: def.name, text: def.text };
  }
}

/** A creature's card: tier, faction, stats, growth, cost and abilities. */
export function creatureTip(id: string, count?: number): HTMLElement | string {
  if (!isCreatureId(id)) return id;
  const def = getCreature(id);
  const faction = FACTIONS.find((f) => f.id === def.faction)?.name;
  const stat = (label: string, value: string | number): HTMLElement[] => [
    el("span", label),
    el("b", String(value)),
  ];
  const stats = el(
    "div.gm-tip-stats",
    ...stat("Attack", def.attack),
    ...stat("Defense", def.defense),
    ...stat("Damage", def.damage),
    ...stat("Health", def.hp),
    ...stat("Speed", def.speed),
    ...(def.shots > 0 ? stat("Shots", def.shots) : stat("Melee", "")),
  );
  stats.style.gridTemplateColumns = "auto auto auto auto";
  const lines: Array<HTMLElement | string | null> = [stats];
  const abilities = creatureAbilities(def);
  if (abilities.length > 0) {
    lines.push(el("div.gm-tip-section", "Abilities"));
    for (const a of abilities) {
      const t = abilityText(a);
      lines.push(
        el(
          "div.gm-tip-line",
          el("b.gm-tip-ability", t.name),
          t.text === "" ? "" : `: ${t.text}`,
        ),
      );
    }
  }
  lines.push(
    el(
      "div.gm-tip-line.gm-tip-dim",
      `Growth ${def.growth} a week · cost `,
      costView(def.cost),
    ),
  );
  return tipCard(
    count === undefined
      ? def.name
      : `${count} ${count === 1 ? def.name : def.plural}`,
    lines,
    {
      icon: img(`portrait-${def.sprite}`, "gm-tip-portrait"),
      subtitle: `Tier ${def.tier}${faction ? ` · ${faction}` : ""}`,
    },
  );
}

/**
 * A battle spell's Fuel and Echo lines: what Fuel doubles and which
 * schools it burns, and which schools Echo lengthens.
 */
export function spellCastLines(d: SpellDef): string[] {
  /** "a Bloom or Hush", "an Accord or Clock". */
  const either = (ids: readonly string[]): string => {
    const text = ids.map((s) => SCHOOL_LABEL[s] ?? s).join(" or ");
    return `${/^[AEIOU]/.test(text) ? "an" : "a"} ${text}`;
  };
  const fuel =
    d.fuel === null
      ? "Fuel: none, as this spell has no size."
      : `Fuel: burn ${either(opposedSchools(d.school))} condition to double ${d.fuel.replace(/^The /, "the ")}.`;
  return [
    fuel,
    `Echo: ${either(alliedSchools(d.school))} condition lasts 1 round longer.`,
  ];
}

/** A spell's card: school, tier, mana and its effect at Power `power`. */
export function spellTip(id: string, power?: number): HTMLElement | string {
  if (isBattleSpell(id)) {
    const d = spellDef(id);
    return tipCard(
      d.name,
      [
        d.text(power ?? 1),
        ...spellCastLines(d).map((line) => el("div.gm-tip-dim", line)),
        el(
          "div.gm-tip-dim",
          power === undefined
            ? "Shown at Power 1; numbers grow with the hero's Power."
            : `At Power ${power}.`,
        ),
      ],
      {
        icon: iconElement("spell", id),
        subtitle: `${SCHOOL_LABEL[d.school] ?? d.school} ${d.tier} · ${d.mana} mana · battle`,
      },
    );
  }
  if (isAdventureSpell(id)) {
    const a = adventureSpell(id);
    const move =
      a.moveCost === undefined
        ? ""
        : a.moveCost === "all"
          ? " · all movement"
          : ` · ${a.moveCost} movement`;
    return tipCard(
      a.name,
      [
        a.text(power ?? 1),
        el(
          "div.gm-tip-dim",
          "An adventure spell: cast it from the spellbook on the map (M).",
        ),
        a.scale === null
          ? null
          : el(
              "div.gm-tip-dim",
              power === undefined
                ? "Shown at Power 1; numbers grow with the hero's Power."
                : `At Power ${power}.`,
            ),
        a.deferred === undefined ? null : el("div.gm-tip-dim", a.deferred),
      ],
      {
        icon: iconElement("spell", id),
        subtitle: `${SCHOOL_LABEL[a.school] ?? a.school} ${a.tier} · ${a.mana} mana${move} · adventure`,
      },
    );
  }
  const m = findMapSpell(id);
  return tipCard(
    spellName(id),
    [
      m?.adventure
        ? "An adventure spell: cast it from the spellbook on the map (M)."
        : "",
    ],
    {
      icon: iconElement("spell", id),
      subtitle: m ? `${SCHOOL_LABEL[m.school] ?? m.school} ${m.tier}` : null,
    },
  );
}

/** Buildings of the town's tree that list `id` among their requirements. */
export function unlockedBy(faction: FactionId, id: BuildingId): BuildingId[] {
  const tree = townTree(faction);
  if (tree === undefined) return [];
  return tree.order.filter((b) =>
    (buildingDef(faction, b)?.requires ?? []).includes(id),
  );
}

/**
 * A building's card: effect, cost, requirements and what it unlocks. With
 * `catalogue` (the gallery) the requirements are listed without the
 * built / missing colours, since no town is meant.
 */
export function buildingTip(
  town: Pick<TownState, "faction" | "buildings">,
  id: BuildingId,
  options: { catalogue?: boolean } = {},
): HTMLElement | string {
  const def = buildingDef(town.faction, id);
  if (def === undefined) return id;
  const name = (b: BuildingId): string =>
    buildingDef(town.faction, b)?.name ?? b;
  const built = town.buildings.includes(id);
  const lines: Array<HTMLElement | string | null> = [def.effect];
  if (def.dwelling !== undefined) {
    const c = getCreature(def.dwelling);
    lines.push(
      el(
        "div.gm-tip-line",
        `Recruits ${c.plural}: ${c.growth} a week (Attack ${c.attack}, Defense ${c.defense}, Health ${c.hp}).`,
      ),
    );
  }
  if (!built) {
    lines.push(el("div.gm-tip-line", "Cost ", costView(def.cost)));
    if (def.requires.length > 0) {
      const req = el("div.gm-tip-line", "Requires ");
      def.requires.forEach((r, i) => {
        if (i > 0) req.append(", ");
        req.append(
          el(
            options.catalogue === true
              ? "span"
              : town.buildings.includes(r)
                ? "span.gm-tip-good"
                : "span.gm-tip-bad",
            name(r),
          ),
        );
      });
      lines.push(req);
    }
  }
  const unlocks = unlockedBy(town.faction, id);
  if (unlocks.length > 0)
    lines.push(
      el("div.gm-tip-path", `Unlocks ${unlocks.map(name).join(", ")}`),
    );
  return tipCard(def.name, lines, {
    subtitle: built ? "Built" : null,
  });
}
