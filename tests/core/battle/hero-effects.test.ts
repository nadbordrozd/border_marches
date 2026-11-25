/**
 * Hero effects in battle (RULES_V2 3, 4.6): skill, feat, specialty and
 * artifact modifiers reach the battle grammar through registered hero
 * abilities, battle-start rules and item acts. Hand-built setups only.
 */
import { describe, expect, it } from "vitest";
import {
  computeBreakdown,
  createBattle,
  engineSetupFromGame,
  heroActError,
  type BattleState,
  type StrikeKind,
} from "../../../src/core/battle/index.ts";
import {
  battleSetup,
  cloneState,
  findPath,
  moveHeroAlong,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { field, gameOn, monster, ok } from "../game/helpers.ts";

/** A hero next to a neutral stack, battle pending; `edit` sets the hero up. */
function fight(edit: (h: HeroState) => void): BattleState {
  const s0: GameState = cloneState(
    gameOn(field(8, 3), [monster("m", 4, 1, "troll", 4)], 1, 1),
  );
  const h = s0.heroes[0]!;
  h.defId = "nobody";
  h.skills = [];
  edit(h);
  const path = findPath(s0, "hero-0", 4, 1, { ignoreFog: true })!;
  const s = ok(moveHeroAlong(s0, "hero-0", path.steps)).state;
  const setup = battleSetup(s)!;
  return createBattle(engineSetupFromGame(setup)).state;
}

function strike(state: BattleState, kind: StrikeKind = "melee") {
  const attacker = state.stacks.find((x) => x.id === "a0")!;
  const defender = state.stacks.find((x) => x.id === "d0")!;
  return computeBreakdown({ state, attacker, defender, kind, hexesMoved: 0 });
}

describe("hero modifiers in battle", () => {
  it("Onslaught multiplies melee Strikes by the hero's stacks", () => {
    const base = strike(fight(() => {}));
    const on = strike(
      fight((h) => h.skills.push({ id: "onslaught", rank: 2 })),
    );
    expect(on.abilityMultipliers).toContainEqual(
      expect.objectContaining({ label: "Onslaught 2", percent: 120 }),
    );
    expect(on.damage).toBeGreaterThan(base.damage);
    // Shots are untouched by Onslaught.
    expect(
      strike(
        fight((h) => h.skills.push({ id: "onslaught", rank: 2 })),
        "shot",
      ).abilityMultipliers.some((m) => m.label === "Onslaught 2"),
    ).toBe(false);
  });

  it("Bulwark lowers Strikes against the hero's stacks", () => {
    const state = fight((h) => h.skills.push({ id: "bulwark", rank: 3 }));
    const attacker = state.stacks.find((x) => x.id === "d0")!;
    const defender = state.stacks.find((x) => x.id === "a0")!;
    const b = computeBreakdown({
      state,
      attacker,
      defender,
      kind: "melee",
      hexesMoved: 0,
    });
    expect(b.abilityMultipliers).toContainEqual(
      expect.objectContaining({ percent: 70 }),
    );
  });

  it("artifact stats raise the hero's Attack in the breakdown", () => {
    const plain = strike(fight(() => {}));
    const armed = strike(
      fight((h) => {
        h.worn[4] = "tin-sabre";
        h.worn[6] = "knuckle-dusters";
      }),
    );
    expect(armed.heroAttack).toBe(plain.heroAttack + 2);
  });

  it("a Creature specialty adds Attack, Defense and Speed to that creature", () => {
    const state = fight((h) => {
      h.defId = "grok"; // Creature: Cavemen
      h.level = 5;
    });
    const a0 = state.stacks.find((x) => x.id === "a0")!;
    expect(a0.creature.id).toBe("caveman");
    expect(a0.creature.speed).toBe(5); // 4 + 1
    const b = strike(state);
    expect(b.attackModifiers).toContainEqual(
      expect.objectContaining({ label: "Specialty", amount: 2 }),
    );
    const a1 = state.stacks.find((x) => x.id === "a1")!;
    expect(a1.creature.speed).toBe(5); // spitters unchanged at 5
  });

  it("Pile On applies only against a Delayed stack", () => {
    const state = fight((h) => (h.feats = ["pile-on"]));
    expect(
      strike(state).abilityMultipliers.some((m) => m.label === "Pile On"),
    ).toBe(false);
    const d0 = state.stacks.find((x) => x.id === "d0")!;
    const delayed = {
      ...state,
      stacks: state.stacks.map((x) =>
        x.id === "d0"
          ? {
              ...d0,
              conditions: [
                {
                  uid: 99,
                  kind: "delayed",
                  school: "clock" as const,
                  polarity: "bane" as const,
                  size: 0,
                  maxSize: 0,
                  clock: 1,
                  gate: null,
                  hold: false,
                  link: null,
                  source: "test",
                  roundsBorne: 0,
                },
              ],
            }
          : x,
      ),
    };
    expect(strike(delayed).abilityMultipliers).toContainEqual(
      expect.objectContaining({ label: "Pile On", percent: 125 }),
    );
  });
});

describe("battle-start rules, Morale and item acts", () => {
  it("Winter's Pocket Watch freezes the fastest enemy stack at deployment", () => {
    const state = fight((h) => (h.worn[9] = "winters-pocket-watch"));
    const frozen = state.stacks.filter((x) =>
      x.conditions.some((c) => c.kind === "frozen"),
    );
    expect(frozen.map((x) => x.side)).toEqual(["defender"]);
  });

  it("the cursed Albatross jinxes the hero's own strongest stack", () => {
    const state = fight((h) => (h.worn[1] = "the-albatross"));
    const jinxed = state.stacks.filter((x) =>
      x.conditions.some((c) => c.kind === "jinxed"),
    );
    expect(jinxed.map((x) => x.id)).toEqual(["a0"]);
    expect(jinxed[0]!.conditions[0]!.clock).toBeNull();
  });

  it("a Morale consumable becomes Heartened at the start", () => {
    const state = fight((h) => (h.nextBattle = ["bottled-cheer"]));
    expect(
      state.stacks.some((x) =>
        x.conditions.some((c) => c.kind === "heartened"),
      ),
    ).toBe(true);
  });

  it("allows an item act only to a hero that wears it", () => {
    const without = fight(() => {});
    expect(heroActError(without, "attacker", "a-pinch-of-sand")).toBe(
      "the hero carries no such item",
    );
    const withIt = fight((h) => (h.worn[10] = "a-pinch-of-sand"));
    expect(heroActError(withIt, "attacker", "a-pinch-of-sand")).toBeNull();
  });
});
