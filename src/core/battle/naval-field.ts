/**
 * Naval battlefields (docs/design/NAVAL.md 3.2 to 3.4, bead bzc.153): the
 * four sea layouts on the ordinary 15 x 11 field, the deck gun and Wet
 * Landing. Pure and deterministic: the layout's features come from the
 * battle seed (`deriveSeed(seed, "battle-layout")`), never from a clock.
 *
 * - **Deck to deck** (`deck`): columns 0-5 the attacker's deck, 6-8 sea,
 *   9-14 the defender's deck; three gangplanks (one seeded row in each
 *   band {1, 2}, {4, 5, 6}, {8, 9}) are sea columns left without sea; one
 *   mast per deck and 0-1 crates on each deck.
 * - **Open water** (`open-water`): columns 0-4 the attacker's deck with a
 *   mast; 5-14 sea with 2-4 reefs in columns 6-12.
 * - **Pier** (`pier-deck`, `pier-water`): as the two above with the
 *   attacker's half on land: no mast, no crates, 0-2 rocks; the gangplanks
 *   are jetties.
 * - **Beach landing** (`beach`): the defender's land field with its seeded
 *   obstacles; the attacker's Wet Landing is a battle-start rule.
 *
 * Masts are ground kind `mast`; crates and reefs are `rock` with a look
 * hint for the renderer. The sea is ground kind `sea`, blocking for every
 * stack but a Swimmer's (standard.ts, resolve.ts `blocksCreature`).
 */

import {
  DECK_GUN_BASE_HARM,
  DECK_GUN_HARM_PER_RANK,
  PIRATE_DECK_GUN_HARM,
  WET_LANDING_DRENCHED,
  WET_LANDING_ROUNDS,
} from "../../data/naval.ts";
import { createRng, deriveSeed } from "../rng.ts";
import { isAlive } from "./abilities.ts";
import { creatureFightValue } from "./damage.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, hexIndex } from "./hex.ts";
import type { Hex } from "./hex.ts";
import { hasConditionKind, registerEffect } from "./registry.ts";
import type { Effects } from "./registry.ts";
import type {
  BattleLayout,
  BattleSide,
  GroundSpec,
  JsonValue,
} from "./types.ts";

/** The scheduled effect of a deck gun (NAVAL.md 3.3). */
export const DECK_GUN_EFFECT = "naval:deck-gun";
/** The rule id (event source) of the deck guns' scheduling at battle start. */
export const DECK_GUN_RULE = "naval:deck-gun";
/** The battle-start rule (event source) of Wet Landing (NAVAL.md 3.4). */
export const WET_LANDING_RULE = "naval:wet-landing";

/** Seeded bands of rows a gangplank may lie in, one plank per band. */
export const GANGPLANK_BANDS: readonly (readonly number[])[] = [
  [1, 2],
  [4, 5, 6],
  [8, 9],
];
/** Rows a mast may stand in. */
export const MAST_ROWS: readonly [number, number] = [3, 7];

/** What a hex of a naval field is, for the renderer and the tests. */
export type FieldHexKind = "land" | "deck" | "sea" | "plank";

/** The banner name of a layout (NAVAL.md 3.8, Battle UI). */
export const LAYOUT_NAMES: Readonly<Record<BattleLayout, string>> = {
  land: "Land",
  deck: "Deck to deck",
  "open-water": "Open water",
  "pier-deck": "Pier",
  "pier-water": "Pier",
  beach: "Beach landing",
};

/** A layout with sea hexes (every one but `land` and `beach`). */
export function isSeaLayout(layout: BattleLayout | undefined): boolean {
  return (
    layout === "deck" ||
    layout === "open-water" ||
    layout === "pier-deck" ||
    layout === "pier-water"
  );
}

/** The column ranges of a sea layout. */
export interface FieldZones {
  /** The attacker's half: columns 0..attackerTo. */
  readonly attackerTo: number;
  /** The attacker's half is land (a pier), not a deck. */
  readonly attackerLand: boolean;
  /** The sea columns, inclusive. */
  readonly seaFrom: number;
  readonly seaTo: number;
  /** The defender's deck (deck to deck, pier-deck), or null (open water). */
  readonly defenderFrom: number | null;
  /** Gangplanks (or jetties) cross the sea. */
  readonly gangplanks: boolean;
}

/** The zones of a sea layout, or null for `land` and `beach`. */
export function fieldZones(
  layout: BattleLayout | undefined,
): FieldZones | null {
  switch (layout) {
    case "deck":
    case "pier-deck":
      return {
        attackerTo: 5,
        attackerLand: layout === "pier-deck",
        seaFrom: 6,
        seaTo: 8,
        defenderFrom: 9,
        gangplanks: true,
      };
    case "open-water":
    case "pier-water":
      return {
        attackerTo: 4,
        attackerLand: layout === "pier-water",
        seaFrom: 5,
        seaTo: BATTLE_WIDTH - 1,
        defenderFrom: null,
        gangplanks: false,
      };
    default:
      return null;
  }
}

function spec(
  col: number,
  row: number,
  kind: string,
  look?: string,
): GroundSpec {
  return {
    hex: { col, row },
    kind,
    source: "battlefield",
    ...(look !== undefined ? { look } : {}),
  };
}

/**
 * The features of a sea layout from the battle seed, sorted by hex index:
 * sea, masts, crates, reefs and the pier's rocks. Empty for `land` and
 * `beach` (their obstacles are the ordinary seeded ones).
 */
export function layoutGround(
  layout: BattleLayout | undefined,
  seed: number,
): GroundSpec[] {
  const z = fieldZones(layout);
  if (z === null) return [];
  const rng = createRng(deriveSeed(seed, "battle-layout"));
  const planks = z.gangplanks
    ? GANGPLANK_BANDS.map((band) => rng.pick(band))
    : [];
  const out = new Map<number, GroundSpec>();
  const put = (g: GroundSpec): void => void out.set(hexIndex(g.hex), g);
  for (let row = 0; row < BATTLE_HEIGHT; row++) {
    if (planks.includes(row)) continue;
    for (let col = z.seaFrom; col <= z.seaTo; col++) put(spec(col, row, "sea"));
  }
  // The gangplanks' (jetties') deck ends stay open: no crate or rock there.
  const keepOpen = new Set<number>();
  for (const row of planks) {
    keepOpen.add(hexIndex({ col: z.seaFrom - 1, row }));
    if (z.defenderFrom !== null)
      keepOpen.add(hexIndex({ col: z.defenderFrom, row }));
  }
  const taken = (h: Hex): boolean =>
    out.has(hexIndex(h)) || keepOpen.has(hexIndex(h));
  const mast = (colFrom: number, colTo: number): void => {
    const h = {
      col: rng.int(colFrom, colTo),
      row: rng.int(MAST_ROWS[0], MAST_ROWS[1]),
    };
    put(spec(h.col, h.row, "mast"));
  };
  /** n features of `kind` on free hexes of columns colFrom..colTo. */
  const scatter = (
    n: number,
    colFrom: number,
    colTo: number,
    kind: string,
    look: string | undefined,
    onSea: boolean,
  ): void => {
    let placed = 0;
    for (let tries = 0; placed < n && tries < 40; tries++) {
      const h = {
        col: rng.int(colFrom, colTo),
        row: rng.int(0, BATTLE_HEIGHT - 1),
      };
      const g = out.get(hexIndex(h));
      const free = onSea ? g?.kind === "sea" : !taken(h);
      if (!free) continue;
      put(spec(h.col, h.row, kind, look));
      placed++;
    }
  };
  // The attacker's half: a deck with a mast and a crate, or a pier's land
  // with a few rocks. Never in the deployment column 0.
  if (z.attackerLand) {
    scatter(rng.int(0, 2), 1, z.attackerTo, "rock", undefined, false);
  } else {
    // A five-column deck (open water) keeps its mast in columns 2-3.
    mast(2, z.defenderFrom === null ? 3 : 4);
    if (z.defenderFrom !== null)
      scatter(rng.int(0, 1), 1, z.attackerTo, "rock", "crate", false);
  }
  if (z.defenderFrom !== null) {
    mast(10, 12);
    scatter(
      rng.int(0, 1),
      z.defenderFrom,
      BATTLE_WIDTH - 2,
      "rock",
      "crate",
      false,
    );
  } else {
    // Open water: 2-4 reefs, blocking for every stack.
    scatter(rng.int(2, 4), 6, 12, "rock", "reef", true);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
}

/** The gangplank rows of a deck-to-deck or pier-deck field's ground. */
export function gangplankRows(
  layout: BattleLayout | undefined,
  ground: readonly { readonly hex: Hex; readonly kind: string }[],
): number[] {
  const z = fieldZones(layout);
  if (z === null || !z.gangplanks) return [];
  const sea = new Set(
    ground.filter((g) => g.kind === "sea").map((g) => hexIndex(g.hex)),
  );
  const out: number[] = [];
  for (let row = 0; row < BATTLE_HEIGHT; row++) {
    let open = true;
    for (let col = z.seaFrom; col <= z.seaTo; col++)
      if (sea.has(hexIndex({ col, row }))) open = false;
    if (open) out.push(row);
  }
  return out;
}

/**
 * What each hex of a field is (index = hex index): `land` everywhere on a
 * land field; on a sea layout the deck, the water (reefs included), the
 * gangplanks over it and a pier's land.
 */
export function fieldHexKinds(
  layout: BattleLayout | undefined,
  ground: readonly {
    readonly hex: Hex;
    readonly kind: string;
    readonly look?: string;
  }[],
): FieldHexKind[] {
  const z = fieldZones(layout);
  const out: FieldHexKind[] = Array.from(
    { length: BATTLE_WIDTH * BATTLE_HEIGHT },
    () => "land",
  );
  if (z === null) return out;
  const wet = new Set(
    ground
      .filter((g) => g.kind === "sea" || g.look === "reef")
      .map((g) => hexIndex(g.hex)),
  );
  for (let row = 0; row < BATTLE_HEIGHT; row++) {
    for (let col = 0; col < BATTLE_WIDTH; col++) {
      const i = hexIndex({ col, row });
      if (col <= z.attackerTo) out[i] = z.attackerLand ? "land" : "deck";
      else if (col >= z.seaFrom && col <= z.seaTo)
        out[i] = wet.has(i) ? "sea" : "plank";
      else out[i] = "deck";
    }
  }
  return out;
}

/**
 * The deck gun's Harm for a hero's ship (NAVAL.md 3.3): 20 + 15 per
 * Seafaring rank.
 */
export function deckGunHarm(seafaringRank: number): number {
  return (
    DECK_GUN_BASE_HARM + DECK_GUN_HARM_PER_RANK * Math.max(0, seafaringRank)
  );
}

export { PIRATE_DECK_GUN_HARM };

function harmOf(args: JsonValue | undefined): number {
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
    const h = (args as { readonly harm?: unknown }).harm;
    if (typeof h === "number" && Number.isFinite(h)) return Math.max(0, h);
  }
  return 0;
}

/**
 * The strongest stack fighting against `side` now (RULES_V2 0.2): the
 * highest fight value (count x creature FV), the first in field order on
 * a tie; null when none lives.
 */
export function strongestEnemy(
  fx: Pick<Effects, "state" | "sideOf">,
  side: BattleSide,
): string | null {
  let best: string | null = null;
  let bestFv = -1;
  for (const s of fx.state.stacks) {
    if (!isAlive(s) || fx.sideOf(s.id) === side) continue;
    const fv = s.count * creatureFightValue(s.creature);
    if (fv > bestFv) {
      bestFv = fv;
      best = s.id;
    }
  }
  return best;
}

/**
 * The deck gun fires (a scheduled event, like the fort tower): Harm to the
 * strongest enemy stack, then it is scheduled again for the next round's
 * start. It stops when its side holds no living stack.
 */
registerEffect(DECK_GUN_EFFECT, (fx, args, owner) => {
  const side = owner.side;
  const holds = fx.state.stacks.some(
    (s) => isAlive(s) && fx.sideOf(s.id) === side,
  );
  if (!holds) return;
  const target = strongestEnemy(fx, side);
  const harm = harmOf(args);
  if (target !== null && harm > 0) fx.harm(target, harm);
  fx.schedule({
    round: fx.round + 1,
    phase: "start",
    effect: { id: DECK_GUN_EFFECT, args: args ?? null },
    side,
  });
});

/** Schedules a side's deck gun for its first shot, at round `round`. */
export function scheduleDeckGun(
  fx: Effects,
  side: BattleSide,
  harm: number,
  round: number,
): void {
  fx.schedule({
    round,
    phase: "start",
    effect: { id: DECK_GUN_EFFECT, args: { harm } },
    side,
  });
}

/** Wet Landing: every living stack of `side` becomes Drenched 25, clock 2. */
export function wetLanding(fx: Effects, side: BattleSide): void {
  if (!hasConditionKind("drenched")) return;
  for (const s of fx.state.stacks) {
    if (s.owner !== side || !fx.isAlive(s.id)) continue;
    fx.addCondition(s.id, {
      kind: "drenched",
      size: WET_LANDING_DRENCHED,
      clock: WET_LANDING_ROUNDS,
      source: WET_LANDING_RULE,
    });
  }
}
