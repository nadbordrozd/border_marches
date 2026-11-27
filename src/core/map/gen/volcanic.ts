/**
 * The volcanic sites (bead border_marches-bzc.125, CONTENT_MAP_OBJECTS
 * 3.14): what the object stage (gen/objects.ts) places in the volcanic
 * zones that gen/terrain.ts placeVolcanic made, and their seeded contents.
 * Their catalogue weight is 0, so the ordinary fill never draws them; a map
 * without a volcanic zone gets none of them and is generated exactly as
 * before (their contents and placing order come from their own streams).
 *
 * Per volcanic zone: one Infernal Forge, one Brimstone Pit and one Shrine
 * of Embers, each standing on the lava ground while any such site is free.
 */
import {
  ARTIFACT_LIST,
  isCursed,
  type ArtifactDef,
} from "../../../data/artifacts.ts";
import { CREATURES } from "../../../data/creatures.ts";
import {
  BANK_GUARD_SHARE,
  BANK_VALUE,
  type BankSize,
  type ObjectTypeId,
  type Prize,
} from "../../../data/objectTypes.ts";
import type { CreatureId } from "../../../data/types.ts";
import type { Rng } from "../../rng.ts";
import type { GenState } from "./state.ts";

/** The volcanic sites each volcanic zone gets, in placing order. */
export const VOLCANIC_SITES: readonly ObjectTypeId[] = [
  "brimstone-pit",
  "infernal-forge",
  "shrine-of-embers",
];

/** One volcanic site to place. */
export interface VolcanicSite {
  readonly type: ObjectTypeId;
  /** The zone it goes into. */
  readonly zone: number;
  /** Zone tier for its contents (1 next to a start, deeper is richer). */
  readonly tier: number;
}

/** The volcanic zones of a map: zones whose main terrain is volcanic. */
export function volcanicZones(st: GenState): number[] {
  return st.zones.filter((z) => z.main === "volcanic").map((z) => z.id);
}

/** The volcanic sites of a map, in placing order (empty: no lava). */
export function volcanicSites(st: GenState): VolcanicSite[] {
  const out: VolcanicSite[] = [];
  for (const id of volcanicZones(st)) {
    const z = st.zones[id];
    if (z === undefined) continue;
    const tier = z.role === "hold" ? 3 : Math.max(1, Math.min(3, z.tier));
    for (const type of VOLCANIC_SITES) out.push({ type, zone: id, tier });
  }
  return out;
}

/** Wearable, uncursed artifacts of a grade, never a Marvel piece. */
function wearable(grade: "trinket" | "wonder"): ArtifactDef[] {
  return ARTIFACT_LIST.filter(
    (a) =>
      a.kind === "worn" &&
      a.grade === grade &&
      a.pieceOf === undefined &&
      !isCursed(a.id),
  );
}

function pick(rng: Rng, grade: "trinket" | "wonder"): string | undefined {
  const list = wearable(grade);
  return list.length > 0 ? rng.pick(list).id : undefined;
}

/**
 * The fiends of a Brimstone Pit: Fire-Eaters and Gremlins (the imps of the
 * lava fields) in fixed shares of about `fv` fight value, each count nudged
 * by up to 10%.
 */
function fiends(
  rng: Rng,
  fv: number,
  shares: ReadonlyArray<readonly [CreatureId, number]>,
): Array<{ creature: CreatureId; count: number }> {
  return shares.map(([creature, share]) => {
    const each = CREATURES[creature].fightValue;
    const count = Math.max(
      1,
      Math.round(((fv * share) / each) * (1 + rng.float(-0.1, 0.1))),
    );
    return { creature, count };
  });
}

/** Brimstone Pit prizes by size: worth the bank value of the size. */
function pitPrize(size: BankSize, rng: Rng): Prize {
  switch (size) {
    case "small": {
      const a = pick(rng, "trinket");
      return { essence: 1, ...(a !== undefined ? { artifacts: [a] } : {}) };
    }
    case "medium": {
      const a = pick(rng, "trinket");
      return {
        essence: 5,
        gold: 2000,
        ...(a !== undefined ? { artifacts: [a] } : {}),
      };
    }
    case "large": {
      const a = pick(rng, "wonder");
      return {
        essence: 10,
        gold: 5000,
        ...(a !== undefined ? { artifacts: [a] } : {}),
      };
    }
  }
}

/**
 * Seeded contents of the volcanic sites (bead bzc.125), merged into the
 * object's data: a Brimstone Pit's size, value, guard and prize (sized by
 * the zone's tier like the other banks); an Infernal Forge's Wonder.
 */
export function volcanicContents(
  type: ObjectTypeId,
  rng: Rng,
  tier: number,
): Record<string, unknown> {
  switch (type) {
    case "brimstone-pit": {
      const size: BankSize =
        tier >= 3
          ? rng.chance(0.5)
            ? "large"
            : "medium"
          : tier === 2
            ? rng.chance(0.25)
              ? "large"
              : "medium"
            : rng.chance(0.4)
              ? "medium"
              : "small";
      const value = BANK_VALUE[size];
      const guard = fiends(
        rng,
        value * BANK_GUARD_SHARE,
        size === "small"
          ? [
              ["gremlin", 0.5],
              ["fire-eater", 0.5],
            ]
          : [
              ["fire-eater", 0.75],
              ["gremlin", 0.25],
            ],
      );
      return { size, value, guard, prize: pitPrize(size, rng) };
    }
    case "infernal-forge": {
      const wonder = pick(rng, "wonder");
      return wonder !== undefined ? { wonder } : {};
    }
    default:
      return {};
  }
}
