/**
 * The volcanic sites (bead border_marches-bzc.125, CONTENT_MAP_OBJECTS
 * 3.14): the Infernal Forge, the Brimstone Pit and the Shrine of Embers,
 * on small hand-built states.
 */
import { describe, expect, it } from "vitest";
import {
  describeObject,
  fightPendingBattle,
  moveHeroAlong,
  objectGuardFv,
  objectValueFor,
  siteOptions,
  useSite,
  type BattleResolver,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { heroBattleProfile } from "../../../src/core/game/battle-profile.ts";
import { slotsOfKind } from "../../../src/core/game/artifacts.ts";
import {
  BANK_GUARD_SHARE,
  BANK_VALUE,
  EMBER_BRAND,
  FORGE_COST,
  OBJECT_TYPES,
} from "../../../src/data/objectTypes.ts";
import {
  ARTIFACT_LIST,
  isCursed,
  type WornArtifactDef,
} from "../../../src/data/artifacts.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { rollContents } from "../../../src/core/map/gen/contents.ts";
import { prizeValue } from "../../../src/core/game/sites.ts";
import { createRng } from "../../../src/core/rng.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { errorOf, field, gameOn, ok } from "./helpers.ts";

/** A catalogue object at (x, y), its footprint up and right. */
function site(
  id: string,
  type: keyof typeof OBJECT_TYPES,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): MapObject {
  const def = OBJECT_TYPES[type];
  const blocked: Array<[number, number]> = [];
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++)
      if (dx !== 0 || dy !== 0) blocked.push([x + dx, y - dy]);
  return {
    id,
    kind: def.kind,
    x,
    y,
    footprint: { w: def.w, h: def.h },
    blocked,
    data: { type, ...data },
  };
}

const step = (s: GameState, x: number, y: number) =>
  ok(moveHeroAlong(s, "hero-0", [{ x, y }]));
const hero = (s: GameState): HeroState =>
  s.heroes.find((h) => h.id === "hero-0")!;
const texts = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === "site" ? [e.text] : []));
const win: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});

const worn = (grade: "trinket" | "wonder"): WornArtifactDef[] =>
  ARTIFACT_LIST.filter(
    (a): a is WornArtifactDef =>
      a.kind === "worn" &&
      a.grade === grade &&
      a.pieceOf === undefined &&
      !isCursed(a.id),
  );
const WONDER = worn("wonder")[0]!;
/** A Trinket of the Wonder's slot and one of another slot. */
const SAME = worn("trinket").find((t) => t.slot === WONDER.slot)!;
const OTHER = worn("trinket").find((t) => t.slot !== WONDER.slot)!;
const CURSED = ARTIFACT_LIST.find(
  (a) => a.kind === "worn" && isCursed(a.id),
)!.id;

describe("the Infernal Forge", () => {
  const forge = (): MapObject =>
    site("forge", "infernal-forge", 1, 2, { wonder: WONDER.id, value: 2500 });
  const rich = (s: GameState): GameState => {
    s.players[0]!.resources.gold = 5000;
    s.players[0]!.resources.essence = 5;
    return s;
  };

  it("reforges a carried Trinket into its Wonder for gold and essence, each hero once", () => {
    const s0 = rich(gameOn(field(4, 3), [forge()], 0, 2));
    hero(s0).backpack = [OTHER.id];
    const obj = s0.map.objects.find((o) => o.id === "forge")!;
    expect(objectValueFor(s0, 0, obj)).toBeGreaterThan(0);
    const a = step(s0, 1, 2);
    const e = a.events.find((x) => x.type === "site");
    expect(e?.type === "site" && e.text).toMatch(/Infernal Forge/);
    expect(e?.type === "site" && e.options?.map((o) => o.id)).toEqual([
      "reforge:p0",
    ]);
    const b = ok(useSite(a.state, "hero-0", "forge", "reforge:p0"));
    expect(hero(b.state).backpack).toEqual([WONDER.id]);
    expect(b.state.players[0]!.resources.gold).toBe(5000 - FORGE_COST.gold);
    expect(b.state.players[0]!.resources.essence).toBe(5 - FORGE_COST.essence);
    expect(texts(b.events)[0]).toMatch(/is reforged into/);
    // Each hero once.
    expect(siteOptions(b.state, hero(b.state), obj)).toEqual([]);
    expect(objectValueFor(b.state, 0, obj, "hero-0")).toBe(0);
    hero(b.state).backpack.push(OTHER.id);
    expect(errorOf(useSite(b.state, "hero-0", "forge", "reforge:p1"))).toBe(
      "bad-choice",
    );
  });

  it("wears the Wonder in the Trinket's slot when it fits, else carries it", () => {
    const s0 = rich(gameOn(field(4, 3), [forge()], 0, 2));
    const slot = slotsOfKind(SAME.slot)[0]!;
    hero(s0).worn[slot] = SAME.id;
    const a = step(s0, 1, 2).state;
    const b = ok(useSite(a, "hero-0", "forge", `reforge:w${slot}`)).state;
    expect(hero(b).worn[slot]).toBe(WONDER.id);

    const s1 = rich(gameOn(field(4, 3), [forge()], 0, 2));
    const other = slotsOfKind(OTHER.slot)[0]!;
    hero(s1).worn[other] = OTHER.id;
    hero(s1).backpack = [];
    const c = step(s1, 1, 2).state;
    const d = ok(useSite(c, "hero-0", "forge", `reforge:w${other}`)).state;
    expect(hero(d).worn[other]).toBeNull();
    expect(hero(d).backpack).toEqual([WONDER.id]);
  });

  it("takes no cursed artifact, and wants a Trinket and the price", () => {
    const s0 = rich(gameOn(field(4, 3), [forge()], 0, 2));
    hero(s0).backpack = [CURSED, WONDER.id];
    const obj = s0.map.objects.find((o) => o.id === "forge")!;
    expect(objectValueFor(s0, 0, obj)).toBe(0);
    const a = step(s0, 1, 2);
    expect(texts(a.events)[0]).toMatch(/need a Trinket/);
    // Nothing to reforge uses no visit.
    expect(a.state.sites["forge"]?.heroes ?? []).toEqual([]);

    const s1 = gameOn(field(4, 3), [forge()], 0, 2);
    s1.players[0]!.resources.gold = 0;
    hero(s1).backpack = [OTHER.id];
    const b = step(s1, 1, 2).state;
    const opts = siteOptions(b, hero(b), obj);
    expect(opts[0]?.disabled).toBe("not enough resources");
    expect(objectValueFor(b, 0, obj)).toBe(0);
  });

  it("names its Wonder on its card", () => {
    const s = gameOn(field(4, 3), [forge()], 0, 2);
    const obj = s.map.objects.find((o) => o.id === "forge")!;
    const lines = describeObject(s, 0, obj).join(" ");
    expect(lines).toContain(WONDER.name);
    expect(lines).toMatch(/1000 gold and 2 essence/);
  });

  it("seeds a wearable, uncursed Wonder", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const data = rollContents("infernal-forge", createRng(seed), 2);
      const w = worn("wonder").find((a) => a.id === data["wonder"]);
      expect(w, String(data["wonder"])).toBeDefined();
    }
  });
});

describe("the Brimstone Pit", () => {
  it("rolls a bank of fiends worth its size, richer deeper", () => {
    const sizes = new Set<string>();
    for (const tier of [1, 2, 3])
      for (let seed = 1; seed <= 8; seed++) {
        const data = rollContents("brimstone-pit", createRng(seed), tier);
        const size = data["size"] as keyof typeof BANK_VALUE;
        sizes.add(size);
        if (tier === 1) expect(size).not.toBe("large");
        if (tier === 3) expect(size).not.toBe("small");
        expect(data["value"]).toBe(BANK_VALUE[size]);
        const guard = data["guard"] as Array<{
          creature: string;
          count: number;
        }>;
        for (const g of guard)
          expect(["fire-eater", "gremlin"]).toContain(g.creature);
        const fv = guard.reduce(
          (n, g) => n + g.count * getCreature(g.creature).fightValue,
          0,
        );
        const want = BANK_VALUE[size] * BANK_GUARD_SHARE;
        expect(fv).toBeGreaterThan(want * 0.8);
        expect(fv).toBeLessThan(want * 1.2);
        const prize = data["prize"] as Record<string, unknown>;
        expect((prize["artifacts"] as string[]).length).toBe(1);
        expect(prize["essence"]).toBeGreaterThan(0);
        // Worth the size's value (artifact values vary a little by grade).
        expect(prizeValue(prize)).toBeGreaterThan(BANK_VALUE[size] * 0.75);
        expect(prizeValue(prize)).toBeLessThan(BANK_VALUE[size] * 1.25);
      }
    expect(sizes).toEqual(new Set(["small", "medium", "large"]));
  });

  it("is fought for its brimstone, once", () => {
    const trinket = worn("trinket")[0]!.id;
    const s = gameOn(
      field(4, 3),
      [
        site("pit", "brimstone-pit", 1, 2, {
          size: "medium",
          value: 6500,
          guard: [
            { creature: "fire-eater", count: 7 },
            { creature: "gremlin", count: 20 },
          ],
          prize: { essence: 5, gold: 2000, artifacts: [trinket] },
        }),
      ],
      0,
      2,
    );
    const a = step(s, 1, 2).state;
    expect(a.pendingBattle?.kind).toBe("site");
    const obj = a.map.objects.find((o) => o.id === "pit")!;
    expect(objectGuardFv(a, obj)).toBe(
      7 * getCreature("fire-eater").fightValue +
        20 * getCreature("gremlin").fightValue,
    );
    expect(describeObject(a, 0, obj)[0]).toBe("Brimstone Pit (medium)");
    const essence = a.players[0]!.resources.essence;
    const b = ok(fightPendingBattle(a, win)).state;
    expect(b.players[0]!.resources.essence).toBe(essence + 5);
    expect([...hero(b).backpack, ...hero(b).worn]).toContain(trinket);
    expect(describeObject(b, 0, obj).join(" ")).toMatch(/Plundered/);
    expect(objectValueFor(b, 0, obj)).toBe(0);
  });
});

describe("the Shrine of Embers", () => {
  it("brands the army until the next battle: more damage dealt and taken, never stacking", () => {
    const s0 = gameOn(
      field(4, 3),
      [site("emb", "shrine-of-embers", 1, 2)],
      0,
      2,
    );
    const a = step(s0, 1, 2);
    expect(texts(a.events)[0]).toMatch(/Ember Brand/);
    const strikes = heroBattleProfile(hero(a.state)).strikes.filter(
      (s) => s.label === "Ember Brand",
    );
    expect(strikes.map((s) => [s.direction, s.percent, s.strike])).toEqual([
      ["dealt", EMBER_BRAND.dealt, "all"],
      ["taken", EMBER_BRAND.taken, "all"],
    ]);
    const obj = a.state.map.objects.find((o) => o.id === "emb")!;
    expect(objectValueFor(a.state, 0, obj)).toBe(0);
    const b = step(step(a.state, 0, 2).state, 1, 2);
    expect(texts(b.events)[0]).toMatch(/already branded/);
    expect(hero(b.state).buffs.filter((x) => x === "shrine-of-embers")).toEqual(
      ["shrine-of-embers"],
    );
  });
});
