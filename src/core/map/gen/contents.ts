/**
 * Seeded contents of placed objects (bead bzc.13): which stat, spell,
 * skill, artifact, creature, bank size, prize or prisoner each object
 * holds, fixed at generation from the map seed (CONTENT_MAP_OBJECTS
 * section 1). `rollContents` returns the fields to merge into the object's
 * `data`, including its `value` when the contents set it.
 *
 * `tier` is the zone tier (0 start, 1 next door, 2+ deeper; the Hold's
 * zone counts as 3): it stands in for the guard ring the object will sit
 * in, so deeper objects hold richer contents.
 */
import {
  ARTIFACT_LIST,
  HELD_ARTIFACTS,
  GRADE_VALUES,
  isCursed,
  type ArtifactDef,
} from "../../../data/artifacts.ts";
import { CREATURES } from "../../../data/creatures.ts";
import { battleSpellsOfTier, SCROLL_VALUE } from "../../../data/map-spells.ts";
import {
  BANK_GUARD_SHARE,
  BANK_VALUE,
  ROOKERY_HIRE,
  ROOKERY_WEEKLY,
  PYRAMID_VALUE,
  SWEET_SHOP_STOCK,
  VAULT_VALUE,
  type BankSize,
  type ObjectTypeId,
  type Prize,
} from "../../../data/objectTypes.ts";
import { RIDDLES } from "../../../data/riddles.ts";
import { SKILL_IDS, SKILLS } from "../../../data/skills.ts";
import {
  CARETAKER_OF,
  GUARD_CREATURE_IDS,
  HUT_STRAYS,
  LODGE_CARETAKERS,
  STRAY_CREATURES,
  STRAY_HOMES,
  type CaretakerSchool,
} from "../../../data/strays.ts";
import type { CreatureId, StrayCreatureId } from "../../../data/types.ts";
import type { Rng } from "../../rng.ts";
import { volcanicContents } from "./volcanic.ts";

type Data = Record<string, unknown>;

const SCHOOLS: readonly CaretakerSchool[] = [
  "bloom",
  "accord",
  "clock",
  "hush",
  "storm",
];
const STATS = ["attack", "defense", "power", "lore"] as const;

const BANK_SCHOOL: Partial<Record<ObjectTypeId, CaretakerSchool>> = {
  "overgrown-greenhouse": "bloom",
  "sealed-registry": "accord",
  "stopped-belfry": "clock",
  "quiet-yard": "hush",
  "thunderstruck-pylon-yard": "storm",
};

/**
 * Artifacts the map being generated leaves out of its loot (config
 * `objects.lootWithout`): set by {@link withLootWithout} for one
 * generation, empty otherwise.
 */
let lootWithout: ReadonlySet<string> = new Set<string>();

/**
 * Runs `fn` (one map's generation) with `ids` left out of every artifact
 * the generator rolls. The named maps leave the Deepforge's Pocket Boiler
 * out (bead bzc.135): a new Wonder in the pool re-rolls their loot and, on
 * a map on today's generator, the guards and fill placed after it.
 */
export function withLootWithout<T>(ids: readonly string[], fn: () => T): T {
  const before = lootWithout;
  lootWithout = new Set(ids);
  try {
    return fn();
  } finally {
    lootWithout = before;
  }
}

/** Whether the map being generated leaves this artifact out of its loot. */
export function leftOutOfLoot(id: string): boolean {
  return lootWithout.has(id);
}

/** Artifacts of a grade ("piece": Marvel pieces; "consumable"). */
function artifactsOf(
  grade: "trinket" | "wonder" | "piece" | "consumable" | "cursed",
): ArtifactDef[] {
  return ARTIFACT_LIST.filter((a) => {
    if (a.kind === "relic" || HELD_ARTIFACTS.has(a.id)) return false;
    if (lootWithout.has(a.id)) return false;
    if (grade === "consumable") return a.kind === "consumable";
    if (a.kind !== "worn") return false;
    if (grade === "cursed") return isCursed(a.id);
    if (grade === "piece") return a.pieceOf !== undefined;
    if (isCursed(a.id) || a.pieceOf !== undefined || a.grade === "marvel") {
      return false;
    }
    return a.grade === grade;
  });
}

export function pickArtifact(
  rng: Rng,
  grade: "trinket" | "wonder" | "piece" | "consumable" | "cursed",
): string | undefined {
  const list = artifactsOf(grade);
  if (list.length > 0) return rng.pick(list).id;
  // Fall back to anything wearable (the catalogue may still be small).
  const any = artifactsOf("trinket");
  return any.length > 0 ? rng.pick(any).id : undefined;
}

function artifactValue(id: string | undefined, fallback: number): number {
  const a = ARTIFACT_LIST.find((x) => x.id === id);
  return a?.value ?? fallback;
}

/** A spell of the tier (battle spells), or undefined. */
export function pickSpell(rng: Rng, tier: number): string | undefined {
  const list = battleSpellsOfTier(Math.max(1, Math.min(5, tier)));
  return list.length > 0 ? rng.pick(list).id : undefined;
}

/**
 * A guard of about `fv` fight value from `pool`, as up to three stacks
 * (count 5..50 each where possible), for banks, vaults and boxes.
 */
export function bankGuard(
  rng: Rng,
  pool: readonly StrayCreatureId[],
  fv: number,
): Array<{ creature: CreatureId; count: number }> {
  const parts = fv > 4000 ? 3 : fv > 1500 ? 2 : 1;
  const out: Array<{ creature: CreatureId; count: number }> = [];
  for (let i = 0; i < parts; i++) {
    const share = fv / parts;
    const fits = pool.filter((c) => {
      const n = Math.round(share / STRAY_CREATURES[c].fightValue);
      return n >= 5 && n <= 50;
    });
    const choice =
      fits.length > 0
        ? rng.pick(fits)
        : [...pool].sort(
            (a, b) =>
              Math.abs(share / STRAY_CREATURES[a].fightValue - 12) -
              Math.abs(share / STRAY_CREATURES[b].fightValue - 12),
          )[0];
    if (choice === undefined) continue;
    const count = Math.max(
      1,
      Math.round(share / STRAY_CREATURES[choice].fightValue),
    );
    const same = out.find((s) => s.creature === choice);
    if (same) same.count += count;
    else out.push({ creature: choice, count });
  }
  return out;
}

/** Strays a Landfall Wreck or box can hold at a tier. */
function wildPool(tier: number): StrayCreatureId[] {
  const ring = Math.min(3, tier);
  return GUARD_CREATURE_IDS.filter((id) => {
    const [lo, hi] = STRAY_HOMES[id].rings;
    return ring >= lo && ring <= hi;
  });
}

/** Strays worth about `fv` that join (one stack). */
function joiners(
  rng: Rng,
  tier: number,
  fv: number,
): Array<{ creature: string; count: number }> {
  const g = bankGuard(rng, wildPool(tier), fv);
  const first = g[0];
  if (first === undefined) return [];
  const total = g.reduce(
    (n, s) =>
      n + s.count * STRAY_CREATURES[s.creature as StrayCreatureId].fightValue,
    0,
  );
  const per = STRAY_CREATURES[first.creature as StrayCreatureId].fightValue;
  return [
    { creature: first.creature, count: Math.max(1, Math.round(total / per)) },
  ];
}

function bankSize(rng: Rng, tier: number): BankSize {
  if (tier <= 0) return "small";
  if (tier === 1) return rng.chance(0.6) ? "small" : "medium";
  if (tier === 2) return rng.chance(0.65) ? "medium" : "large";
  return rng.chance(0.4) ? "medium" : "large";
}

function bankPrize(
  rng: Rng,
  type: ObjectTypeId,
  size: BankSize,
  tier: number,
): Prize {
  const wonder = (): string[] => {
    const w = pickArtifact(rng, "wonder");
    return w === undefined ? [] : [w];
  };
  const trinket = (): string[] => {
    const t = pickArtifact(rng, "trinket");
    return t === undefined ? [] : [t];
  };
  const scroll = (t: number): string[] => {
    const s = pickSpell(rng, t);
    return s === undefined ? [] : [s];
  };
  const s = size === "small" ? 0 : size === "medium" ? 1 : 2;
  switch (type) {
    case "overgrown-greenhouse":
      return [
        { wood: 15, gold: 1000 },
        { wood: 20, essence: 5, gold: 2000 },
        { artifacts: wonder(), wood: 30, essence: 8, gold: 3000 },
      ][s] as Prize;
    case "sealed-registry":
      return [
        { scrolls: scroll(2), gold: 1900 },
        { scrolls: scroll(3), artifacts: trinket(), gold: 3500 },
        {
          artifacts: [...wonder(), ...trinket()],
          scrolls: scroll(5),
          gold: 5500,
        },
      ][s] as Prize;
    case "stopped-belfry":
      return [
        { xp: 1500, gold: 500 },
        { xp: 3000, gold: 2500 },
        { artifacts: wonder(), xp: 6000, gold: 2000 },
      ][s] as Prize;
    case "quiet-yard": {
      const cursed = pickArtifact(rng, "cursed");
      return [
        { essence: 5 },
        { essence: 8, gold: 2500 },
        {
          artifacts: cursed === undefined ? wonder() : [cursed],
          essence: 12,
          gold: 5000,
        },
      ][s] as Prize;
    }
    case "thunderstruck-pylon-yard":
      return [
        { ore: 10, gold: 1000 },
        { ore: 20, gold: 3500 },
        { artifacts: wonder(), ore: 30, gold: 5500 },
      ][s] as Prize;
    case "frost-giants-barrow": {
      // The giant's own gear (bead bzc.87): always an artifact, with gold
      // and ore; worth the bank values of its size like the others.
      const t = trinket();
      return [
        { artifacts: t, gold: 500 },
        { artifacts: trinket(), gold: 3000, ore: 10 },
        { artifacts: [...wonder(), ...t], gold: 5000, ore: 15 },
      ][s] as Prize;
    }
    case "landfall-wreck": {
      const piece = pickArtifact(rng, "piece");
      return [
        { joiners: joiners(rng, tier, 1200), gold: 700 },
        { joiners: joiners(rng, tier, 3000), gold: 2000 },
        {
          joiners: joiners(rng, tier, 6000),
          artifacts: piece === undefined ? wonder() : [piece],
        },
      ][s] as Prize;
    }
    default:
      return {};
  }
}

/** A seer hut's reward worth about `value` (section 5's reward kinds). */
export function questReward(rng: Rng, value: number, tier: number): Prize {
  const kind = rng.pick([
    "xp",
    "gold",
    "resource",
    "stat",
    "artifact",
    "spell",
    "creatures",
  ] as const);
  switch (kind) {
    case "xp":
      return {
        xp: Math.min(5000, Math.max(1000, Math.round(value / 1.3 / 100) * 100)),
      };
    case "gold":
      return {
        gold: Math.min(5000, Math.max(1000, Math.round(value / 100) * 100)),
      };
    case "resource":
      return rng.chance(0.5)
        ? { essence: Math.min(10, Math.max(3, Math.round(value / 500))) }
        : rng.chance(0.5)
          ? { wood: Math.min(20, Math.max(5, Math.round(value / 100))) }
          : { ore: Math.min(20, Math.max(5, Math.round(value / 150))) };
    case "stat":
      return {
        stat: { stat: rng.pick(STATS), amount: value >= 3000 ? 2 : 1 },
      };
    case "artifact": {
      const a = pickArtifact(rng, value >= 4500 ? "wonder" : "trinket");
      return a === undefined ? { gold: 2000 } : { artifacts: [a] };
    }
    case "spell": {
      const s = pickSpell(rng, Math.min(5, 1 + tier));
      return s === undefined ? { gold: 2000 } : { spell: s };
    }
    case "creatures":
      return { joiners: joiners(rng, tier, value) };
  }
}

/**
 * The seeded contents of one object of `type` in a zone of `tier`: fields
 * for `data` (with `value` when the contents decide it). Faction outposts
 * offer no creature of a faction in `outpostsWithout` (the named maps keep
 * the outposts they were authored with, gen/config.ts).
 */
export function rollContents(
  type: ObjectTypeId,
  rng: Rng,
  tier: number,
  outpostsWithout: readonly string[] = [],
): Data {
  switch (type) {
    case "haunted-mine": {
      const resource = rng.pick(["wood", "ore", "essence", "gold"] as const);
      const base = { wood: 1200, ore: 1500, essence: 5000, gold: 6000 }[
        resource
      ];
      return { resource, yield: 2, value: 2 * base, guardCreature: "sexton" };
    }
    case "faction-outpost": {
      const pool = Object.values(CREATURES).filter(
        (c) =>
          c.faction !== "neutral" &&
          !outpostsWithout.includes(c.faction) &&
          c.growth > 0 &&
          c.tier >= 1 &&
          c.tier <= Math.min(4, 2 + tier),
      );
      const c = pool.length > 0 ? rng.pick(pool) : undefined;
      if (c === undefined) return {};
      const value = [1500, 1500, 2000, 3000, 4500][c.tier] ?? 1500;
      return { creature: c.id, faction: c.faction, value };
    }
    case "stray-hut": {
      const pool = HUT_STRAYS.filter(
        (id) => STRAY_HOMES[id].rings[0] <= Math.min(3, tier),
      );
      const c = rng.pick(pool.length > 0 ? pool : HUT_STRAYS);
      const value =
        [1500, 1500, 2000, 3000, 4500][STRAY_CREATURES[c].tier] ?? 1500;
      return { creature: c, value };
    }
    case "caretaker-lodge": {
      const pool = LODGE_CARETAKERS.filter(
        (id) => STRAY_HOMES[id].rings[0] <= Math.min(3, tier),
      );
      const c = rng.pick(pool.length > 0 ? pool : LODGE_CARETAKERS);
      const value =
        [2000, 2000, 2000, 3000, 4500][STRAY_CREATURES[c].tier] ?? 2000;
      return { creature: c, school: STRAY_HOMES[c].school, value };
    }
    case "stat-shrine":
      return { stat: rng.pick(STATS) };
    case "tree-of-knowledge":
      return {
        price: rng.pick([{}, { gold: 2000 }, { essence: 4 }]),
      };
    case "academy":
      return {
        stats: rng.chance(0.5) ? ["attack", "defense"] : ["power", "lore"],
      };
    case "tutors-hut": {
      const skills = SKILL_IDS.filter((id) => SKILLS[id] !== undefined);
      return skills.length > 0 ? { skill: rng.pick(skills) } : {};
    }
    case "school-shrine": {
      const t =
        tier <= 0 ? 1 : tier === 1 ? rng.pick([1, 2]) : rng.pick([2, 3]);
      const spell = pickSpell(rng, t);
      const school = battleSpellsOfTier(t).find((s) => s.id === spell)?.school;
      return { tier: t, spell, school, value: [0, 800, 1500, 2500][t] };
    }
    case "school-temple":
      return { school: rng.pick(SCHOOLS) };
    case "scholar": {
      const k = rng.pick(["spell", "stat", "skill"] as const);
      if (k === "stat")
        return { gift: { stat: { stat: rng.pick(STATS), amount: 1 } } };
      if (k === "skill") {
        const skills = SKILL_IDS.filter((id) => SKILLS[id] !== undefined);
        return { gift: { skill: rng.pick(skills) } };
      }
      return { gift: { spell: pickSpell(rng, rng.int(1, 3)) } };
    }
    case "overgrown-greenhouse":
    case "sealed-registry":
    case "stopped-belfry":
    case "quiet-yard":
    case "thunderstruck-pylon-yard":
    case "landfall-wreck": {
      const size = bankSize(rng, tier);
      const value = BANK_VALUE[size];
      const school = BANK_SCHOOL[type];
      const pool: StrayCreatureId[] =
        school !== undefined ? [CARETAKER_OF[school]] : wildPool(tier);
      return {
        size,
        value,
        guard: bankGuard(rng, pool, value * BANK_GUARD_SHARE),
        prize: bankPrize(rng, type, size, tier),
      };
    }
    // Winter sites (bead bzc.87).
    case "frost-giants-barrow": {
      const size = bankSize(rng, tier);
      const value = BANK_VALUE[size];
      return {
        size,
        value,
        guard: bankGuard(rng, ["rime-walrus"], value * BANK_GUARD_SHARE),
        prize: bankPrize(rng, type, size, tier),
      };
    }
    case "aurora-spire":
      return { school: rng.pick(SCHOOLS) };
    case "walrus-rookery":
      return {
        creature: "rime-walrus",
        weekly: ROOKERY_WEEKLY,
        hire: ROOKERY_HIRE,
        guardCreature: "rime-walrus",
      };
    case "keepers-vault": {
      const choices: Prize[] = [];
      for (let i = 0; i < 3; i++) {
        const piece = pickArtifact(rng, "piece");
        const wonder = pickArtifact(rng, "wonder");
        choices.push({
          artifacts: [piece, wonder].filter(
            (a): a is string => a !== undefined,
          ),
          gold: 5000,
        });
      }
      return {
        value: VAULT_VALUE,
        guard: bankGuard(rng, LODGE_CARETAKERS, VAULT_VALUE * BANK_GUARD_SHARE),
        choices,
      };
    }
    case "treasure-chest": {
      if (tier >= 2 && rng.chance(0.5)) {
        if (rng.chance(0.5)) {
          const a = pickArtifact(rng, "trinket");
          if (a !== undefined) {
            return { chest: true, artifact: a, value: artifactValue(a, 2000) };
          }
        }
        return { chest: true, gold: 2000, xp: 1500, value: 2000 };
      }
      return { chest: true, gold: 1000, xp: 750, value: 1000 };
    }
    case "campfire":
      return {
        gold: rng.int(4, 6) * 100,
        resource: rng.chance(0.5) ? "wood" : "ore",
        amount: rng.int(4, 6),
        value: 1000,
      };
    case "loose-artifact": {
      const grade =
        tier <= 0
          ? rng.pick(["consumable", "trinket"] as const)
          : tier === 1
            ? rng.pick(["consumable", "trinket", "trinket"] as const)
            : tier === 2
              ? rng.pick(["trinket", "wonder", "wonder"] as const)
              : rng.pick(["wonder", "piece"] as const);
      const a = pickArtifact(rng, grade);
      const fallback = grade === "consumable" ? 500 : GRADE_VALUES.trinket;
      return { artifact: a, value: artifactValue(a, fallback) };
    }
    case "loose-scroll": {
      const t = Math.min(5, Math.max(1, rng.int(1, 2) + Math.max(0, tier - 1)));
      return { spell: pickSpell(rng, t), tier: t, value: SCROLL_VALUE[t] };
    }
    case "fallen-adventurer": {
      const a = pickArtifact(rng, "wonder");
      return { artifact: a, value: 4500 };
    }
    case "seer-hut":
      // The quest and reward are set after placement (they name objects).
      return { value: [2000, 2500, 3500, 5000][Math.min(3, tier)] };
    case "prison": {
      const level = tier <= 1 ? 3 : tier === 2 ? 5 : 7;
      return { level, value: { 3: 4500, 5: 5500, 7: 6500 }[level] };
    }
    case "tollhouse": {
      const pool: string[] = [
        ...artifactsOf("trinket").map((a) => a.id),
        ...artifactsOf("consumable").map((a) => a.id),
        ...[1, 2, 3].flatMap((t) =>
          battleSpellsOfTier(t).map((s) => `scroll:${s.id}`),
        ),
      ];
      return { pool };
    }
    case "sealed-box": {
      const k = rng.pick([
        "gold",
        "xp",
        "artifact",
        "creatures",
        "fight",
      ] as const);
      switch (k) {
        case "gold": {
          const gold = rng.int(20, 50) * 100;
          return { prize: { gold }, value: gold };
        }
        case "xp": {
          const xp = rng.int(15, 40) * 100;
          return { prize: { xp }, value: Math.round(xp * 1.3) };
        }
        case "artifact": {
          const a = pickArtifact(rng, tier >= 2 ? "wonder" : "trinket");
          return {
            prize: { artifacts: a === undefined ? [] : [a] },
            value: artifactValue(a, 2000),
          };
        }
        case "creatures":
          return { prize: { joiners: joiners(rng, tier, 2500) }, value: 2500 };
        case "fight": {
          const gold = rng.int(40, 60) * 100;
          const a = pickArtifact(rng, "wonder");
          const prize: Prize = { gold, artifacts: a === undefined ? [] : [a] };
          const value = gold + artifactValue(a, 4000);
          return {
            prize,
            value: Math.min(6000, value),
            guard: bankGuard(rng, wildPool(tier), value * BANK_GUARD_SHARE),
          };
        }
      }
      break;
    }
    case "buried-cache": {
      const a = pickArtifact(rng, "trinket");
      return {
        prize: { gold: 2000, artifacts: a === undefined ? [] : [a] },
        value: 4000,
        // Found by Dowse (src/core/magic/adventure.ts).
        buried: true,
      };
    }
    case "buried-keystone":
      return { buried: true, value: 30000 };
    // Desert sites (bead bzc.88), placed by gen/desert.ts.
    case "pyramid":
    case "sunken-tomb":
    case "sphinx":
    case "sun-temple":
      return desertContents(type, rng, tier);
    // Candy sites (bead bzc.124), placed by gen/candy.ts.
    case "gingerbread-cottage":
    case "sweet-shop":
      return candyContents(type, rng, tier);
    // Volcanic sites (bead bzc.125), placed by gen/volcanic.ts.
    case "infernal-forge":
    case "brimstone-pit":
    case "shrine-of-embers":
      return volcanicContents(type, rng, tier);
    default:
      return {};
  }
  return {};
}

/**
 * Seeded contents of the candy sites (bead bzc.124): the Gingerbread
 * Cottage's size, sweet guard (Candy Kingdom creatures as neutral stacks)
 * and hoard, always a Wonder; the Sweet Shop's three potions.
 */
function candyContents(type: ObjectTypeId, rng: Rng, tier: number): Data {
  if (type === "sweet-shop") {
    const potions = ARTIFACT_LIST.filter(
      (a) => a.kind === "consumable" && a.form === "potion",
    ).map((a) => a.id);
    return { stock: rng.shuffle(potions).slice(0, SWEET_SHOP_STOCK) };
  }
  // A medium or large bank (never small): the hoard holds a Wonder.
  const size: BankSize =
    tier >= 3 || (tier === 2 && rng.chance(0.5)) ? "large" : "medium";
  const value = BANK_VALUE[size];
  const wonder = pickArtifact(rng, "wonder");
  const trinket = size === "large" ? pickArtifact(rng, "trinket") : undefined;
  const artifacts = [wonder, trinket].filter(
    (a): a is string => a !== undefined,
  );
  return {
    size,
    value,
    guard: tombGuard(
      rng,
      value * BANK_GUARD_SHARE,
      size === "medium"
        ? [
            ["taffy-wrangler", 0.4],
            ["peppermint-archer", 0.35],
            ["gingerbread-man", 0.25],
          ]
        : [
            ["rock-candy-dragon", 0.35],
            ["gummy-bear", 0.4],
            ["sugarplum", 0.25],
          ],
    ),
    prize:
      size === "medium"
        ? { gold: 1500, artifacts }
        : { gold: 6000, essence: 4, artifacts },
  };
}

/**
 * A guard of about `fv` fight value for a desert tomb (bead bzc.88): the
 * Restless dead (undead faction creatures as neutral stacks) in fixed
 * shares, each count nudged by up to 10%.
 */
function tombGuard(
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

/** Seeded contents of the desert sites (bead bzc.88). */
function desertContents(type: ObjectTypeId, rng: Rng, tier: number): Data {
  switch (type) {
    case "pyramid": {
      // A large bank's worth (about 15000): a Wonder, a tier 4 or 5 spell (a page if the
      // hero can learn it, else a scroll) and gold, behind the dead.
      const wonder = pickArtifact(rng, "wonder");
      const spell = pickSpell(rng, rng.chance(0.5) ? 4 : 5);
      return {
        value: PYRAMID_VALUE,
        guard: tombGuard(rng, PYRAMID_VALUE * BANK_GUARD_SHARE, [
          ["vampire", 0.4],
          ["banshee", 0.35],
          ["ghoul", 0.25],
        ]),
        prize: {
          ...(wonder !== undefined ? { artifacts: [wonder] } : {}),
          ...(spell !== undefined ? { spell } : {}),
          gold: 5000,
          essence: 5,
        },
      };
    }
    case "sunken-tomb": {
      // A small or medium bank (never large): grave goods.
      const size: BankSize =
        tier >= 2 || (tier === 1 && rng.chance(0.4)) ? "medium" : "small";
      const value = BANK_VALUE[size];
      const trinket = pickArtifact(rng, "trinket");
      const scroll = pickSpell(rng, 3);
      const goods = trinket === undefined ? [] : [trinket];
      return {
        size,
        value,
        guard: tombGuard(
          rng,
          value * BANK_GUARD_SHARE,
          size === "small"
            ? [
                ["skeleton", 0.55],
                ["ghoul", 0.45],
              ]
            : [
                ["ghoul", 0.5],
                ["banshee", 0.5],
              ],
        ),
        prize:
          size === "small"
            ? { gold: 1000, artifacts: goods }
            : {
                gold: 2500,
                artifacts: goods,
                ...(scroll !== undefined ? { scrolls: [scroll] } : {}),
                essence: 2,
              },
      };
    }
    case "sphinx": {
      // A pool of three riddles (each hero hears one) and the gift.
      const pool = rng.shuffle(RIDDLES.map((_, i) => i)).slice(0, 3);
      return { riddles: pool, gift: rng.chance(0.5) ? "skill" : "xp" };
    }
    default:
      return {};
  }
}

/** "The strange thing near home" (concept section 3): its type and data. */
export function strangeThing(rng: Rng): { type: ObjectTypeId; data: Data } {
  const kind = rng.pick(["piece", "cursed", "hut", "tollhouse"] as const);
  if (kind === "piece" || kind === "cursed") {
    const a = pickArtifact(rng, kind);
    if (a !== undefined) {
      return {
        type: "loose-artifact",
        data: { artifact: a, value: artifactValue(a, 6000), strange: true },
      };
    }
  }
  if (kind === "hut") {
    // Low-tier hirelings with a strong ability.
    const c = rng.pick(["gremlin", "newsie", "crooner", "loan-shark"] as const);
    return {
      type: "stray-hut",
      data: { creature: c, value: 1500, strange: true },
    };
  }
  return {
    type: "tollhouse",
    data: { ...rollContents("tollhouse", rng, 0), strange: true },
  };
}
