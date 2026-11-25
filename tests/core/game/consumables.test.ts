/**
 * Consumables row by row (CONTENT_ARTIFACTS 6, 6.1): one hand-built use of
 * each of the twelve, plus the adventure readers the journey skills and
 * vows bring (Silver Tongue's parley, Wayfinder, the vows' learning
 * limits). Battle-side effects of "next battle" items are checked by the
 * battle they start.
 */
import { describe, expect, it } from "vitest";
import {
  createBattle,
  engineSetupFromGame,
} from "../../../src/core/battle/index.ts";
import {
  battleSetup,
  cloneState,
  findPath,
  heroBattleProfile,
  maxMana,
  moveContext,
  moveHeroAlong,
  useConsumable,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import {
  adventureCastError,
  adventureManaCost,
  adventurePower,
  canLearn,
  heroMagic,
  registerSpells,
} from "../../../src/core/magic/index.ts";
import {
  ARTIFACT_LIST,
  DEFERRED_ARTIFACTS,
} from "../../../src/data/artifacts.ts";
import { errorOf, field, gameOn, monster, ok } from "./helpers.ts";

registerSpells();

/** A hero at (1,1) with a Spitter stack at (2,1) (adjacent) and one far. */
function game(edit: (h: HeroState) => void = () => {}): GameState {
  const s0 = cloneState(
    gameOn(
      field(10, 4),
      [monster("m", 2, 1, "spitter", 4), monster("far", 8, 2, "raptor", 40)],
      1,
      1,
    ),
  );
  const h = s0.heroes[0]!;
  h.defId = "nobody";
  h.skills = [];
  edit(h);
  return s0;
}

const hero = (s: GameState): HeroState => s.heroes[0]!;

/** Uses the item placed in backpack slot 0. */
function use(id: string, edit: (h: HeroState) => void = () => {}): GameState {
  const s = game((h) => {
    h.backpack = [id];
    edit(h);
  });
  return ok(useConsumable(s, "hero-0", 0)).state;
}

/** The battle with the adjacent Spitters, after a next-battle item. */
function nextBattleKinds(s0: GameState): string[] {
  const path = findPath(s0, "hero-0", 2, 1, { ignoreFog: true })!;
  const s = ok(moveHeroAlong(s0, "hero-0", path.steps)).state;
  const b = createBattle(engineSetupFromGame(battleSetup(s)!)).state;
  return b.stacks
    .filter((x) => x.owner === "attacker")
    .flatMap((x) => x.conditions.map((c) => c.kind));
}

describe("consumables: every row", () => {
  it("has twelve rows", () => {
    expect(ARTIFACT_LIST.filter((a) => a.kind === "consumable")).toHaveLength(
      12,
    );
  });

  it("Bottled Cheer: +1 Morale for the next battle", () => {
    const s = use("bottled-cheer");
    expect(heroBattleProfile(hero(s)).morale).toBe(1);
  });

  it("Jar of Fair Chances: +1 Luck for the next battle", () => {
    const s = use("jar-of-fair-chances");
    expect(heroBattleProfile(hero(s)).luck).toBe(1);
  });

  it("Blue Tonic: 20 mana, above the maximum", () => {
    const s = use("blue-tonic", (h) => (h.mana = maxMana(h)));
    expect(hero(s).mana).toBe(maxMana(hero(s)) + 20);
  });

  it("Road Cordial: +400 movement today", () => {
    const before = game().heroes[0]!.mp;
    expect(hero(use("road-cordial")).mp).toBe(before + 400);
  });

  it("Fire-Eater's Draught: the strongest stack starts Fired Up", () => {
    expect(nextBattleKinds(use("fire-eaters-draught"))).toContain("fired-up");
  });

  it("Witch-Hazel: the weakest stack starts with Mending", () => {
    expect(nextBattleKinds(use("witch-hazel"))).toContain("mending");
  });

  it("Late-Harvest Cordial: the strongest stack starts Ripening", () => {
    expect(nextBattleKinds(use("late-harvest-cordial"))).toContain("ripening");
  });

  it("Elixir of Hindsight: the next offer is redrawn", () => {
    expect(hero(use("elixir-of-hindsight")).redraw).toBe(true);
  });

  it("Dog-Eared Map: marks the nearest buried cache", () => {
    const s0 = game((h) => (h.backpack = ["dog-eared-map"]));
    expect(errorOf(useConsumable(s0, "hero-0", 0))).toBe("no-target");
    s0.map.objects.push(
      {
        id: "cache-far",
        kind: "pickup",
        x: 9,
        y: 3,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { buried: true },
      },
      {
        id: "cache-near",
        kind: "pickup",
        x: 4,
        y: 1,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { buried: true },
      },
    );
    const s = ok(useConsumable(s0, "hero-0", 0)).state;
    expect(s.magic?.marks?.["0"]).toEqual([[4, 1]]);
  });

  it("Letter of Safe Conduct: an adjacent weak stack loses its zone of control", () => {
    const s0 = game((h) => (h.backpack = ["letter-of-safe-conduct"]));
    const guarded = moveContext(s0, hero(s0));
    const s = ok(useConsumable(s0, "hero-0", 0)).state;
    expect(s.magic?.heroes["hero-0"]?.parley).toEqual(["m"]);
    expect(moveContext(s, hero(s))).not.toEqual(guarded);
    // Nothing weak enough beside the hero: refused, item kept.
    const far = game((h) => {
      h.backpack = ["letter-of-safe-conduct"];
      h.x = 7;
      h.y = 2;
    });
    expect(errorOf(useConsumable(far, "hero-0", 0))).toBe("no-target");
  });

  it("Signal Lantern: reveals a disc of radius 8", () => {
    const s0 = game((h) => (h.backpack = ["signal-lantern"]));
    const before = s0.players[0]!.explored.filter(Boolean).length;
    const s = ok(useConsumable(s0, "hero-0", 0)).state;
    expect(
      s.players[0]!.explored.filter(Boolean).length,
    ).toBeGreaterThanOrEqual(before);
  });

  it("Collapsible Shovel: digs here for 300 movement and is kept", () => {
    expect(DEFERRED_ARTIFACTS["collapsible-shovel"]).toBeUndefined();
    const s0 = game((h) => (h.backpack = ["collapsible-shovel"]));
    const mp = hero(s0).mp;
    const s = ok(useConsumable(s0, "hero-0", 0)).state;
    expect(hero(s).mp).toBe(mp - 300);
    expect(hero(s).backpack).toEqual(["collapsible-shovel"]);
  });
});

describe("journey readers", () => {
  it("Silver Tongue lifts the zone of control of weak neutrals", () => {
    const guards = (s: GameState): number =>
      moveContext(s, hero(s)).guards?.size ?? -1;
    const plain = game();
    const tongue = game((h) => h.skills.push({ id: "silver-tongue", rank: 3 }));
    expect(guards(tongue)).toBeLessThan(guards(plain));
  });

  it("Wayfinder: adventure spells cheaper, stronger, twice a day", () => {
    const s = game((h) => {
      h.pages = ["dowse"];
      h.skills.push({ id: "quietus", rank: 2 });
    });
    const way = game((h) => {
      h.pages = ["dowse"];
      h.skills.push({ id: "quietus", rank: 2 }, { id: "wayfinder", rank: 3 });
    });
    expect(adventureManaCost(hero(way), "dowse")).toBeLessThan(
      adventureManaCost(hero(s), "dowse"),
    );
    expect(adventurePower(hero(way), "dowse", false)).toBe(
      adventurePower(hero(s), "dowse", false) + 3,
    );
    way.magic = { heroes: { "hero-0": { castToday: ["dowse"] } } };
    s.magic = { heroes: { "hero-0": { castToday: ["dowse"] } } };
    expect(adventureCastError(s, hero(s), "dowse")).toMatch(/already cast/);
    expect(adventureCastError(way, hero(way), "dowse") ?? "").not.toMatch(
      /already cast/,
    );
  });

  it("vows limit learning: never-cast schools and the rank cap", () => {
    const grave = game((h) => {
      h.feats = ["vow-of-the-grave"];
      h.skills.push({ id: "greencraft", rank: 1 });
    });
    expect(canLearn(heroMagic(hero(grave)), "bloom", 1)).toBe(false);
    const free = game((h) => h.skills.push({ id: "greencraft", rank: 1 }));
    expect(canLearn(heroMagic(hero(free)), "bloom", 1)).toBe(true);
    const book = game((h) => {
      h.feats = ["vow-of-the-borrowed-book"];
      h.skills.push({ id: "greencraft", rank: 3 });
    });
    expect(canLearn(heroMagic(hero(book)), "bloom", 2)).toBe(true);
    expect(canLearn(heroMagic(hero(book)), "bloom", 3)).toBe(false);
  });
});
