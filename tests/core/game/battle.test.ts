import { describe, expect, it } from "vitest";
import {
  applyBattleResult,
  battleSetup,
  chooseLevelUp,
  endDay,
  fightPendingBattle,
  findPath,
  levelUpOffer,
  moveHeroAlong,
  type BattleResolver,
  type GameState,
} from "../../../src/core/game/index.ts";
import {
  errorOf,
  field,
  gameOn,
  monster,
  ok,
  pickup,
  town,
} from "./helpers.ts";

function intoBattle(s: GameState, x: number, y: number): GameState {
  return ok(moveHeroAlong(s, "hero-0", findPath(s, "hero-0", x, y)!.steps))
    .state;
}

/** Hero wins losing `losses` creatures from its first stack. */
const winLosing =
  (losses: number): BattleResolver =>
  (setup) => ({
    winner: "attacker",
    attacker: setup.attacker.stacks.map((s, i) =>
      i === 0 ? s.count - losses : s.count,
    ),
    defender: setup.defender.stacks.map(() => 0),
  });

const lose: BattleResolver = (setup) => ({
  winner: "defender",
  attacker: setup.attacker.stacks.map(() => 0),
  defender: setup.defender.stacks.map((s) => s.count),
});

describe("battle setup", () => {
  it("describes the hero's army against a split neutral stack", () => {
    const s = intoBattle(gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1), 3, 1);
    const setup = battleSetup(s)!;
    expect(setup.terrain).toBe("grass");
    expect(setup.attacker.hero).toMatchObject({
      id: "hero-0",
      attack: 2,
      defense: 2,
      name: s.heroes[0]!.name,
      profile: { power: 1, lore: 1, mana: 10, command: "stampede" },
    });
    expect({ ...setup.attacker, hero: null }).toEqual({
      owner: 0,
      hero: null,
      stacks: [
        { creature: "caveman", count: 18 },
        { creature: "spitter", count: 6 },
      ],
      defenseBonus: 0,
      towerHarm: null,
      // No town: a hero without a town cannot retreat (RULES_V2 1.12).
      canRetreat: false,
    });
    expect(setup.defender).toEqual({
      owner: null,
      hero: null,
      stacks: [
        { creature: "goblin", count: 4 },
        { creature: "goblin", count: 3 },
        { creature: "goblin", count: 3 },
      ],
      defenseBonus: 0,
      towerHarm: null,
      canRetreat: false,
    });
    expect(setup.battle.objectId).toBe("m");
    expect(battleSetup(s)).toEqual(setup);
  });

  it("gives the Hold garrison +2 Defense", () => {
    const s = intoBattle(gameOn(field(4, 1), [town("hold", 2, 0, null)]), 2, 0);
    const setup = battleSetup(s)!;
    expect(setup.defender.defenseBonus).toBe(2);
    expect(setup.defender.stacks.map((st) => [st.creature, st.count])).toEqual([
      ["orc-warboss", 4],
      ["ogre", 8],
      ["troll", 14],
      ["orc-brute", 30],
      ["bomb-chucker", 30],
    ]);
  });

  it("is null when no battle is pending", () => {
    expect(battleSetup(gameOn(field(2, 1), []))).toBeNull();
  });

  it("uses a different seed for each battle", () => {
    const s = gameOn(
      field(9, 3),
      [monster("a", 3, 1), monster("b", 7, 1)],
      0,
      1,
    );
    const first = intoBattle(s, 3, 1);
    const seed1 = battleSetup(first)!.seed;
    const after = ok(fightPendingBattle(first, winLosing(0))).state;
    const second = intoBattle(after, 7, 1);
    expect(battleSetup(second)!.seed).not.toBe(seed1);
  });
});

describe("applyBattleResult", () => {
  it("applies casualties, removes the stack and awards XP", () => {
    const s = intoBattle(gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1), 3, 1);
    const { state, events } = ok(fightPendingBattle(s, winLosing(3)));
    expect(state.pendingBattle).toBeNull();
    expect(state.monsters).toEqual({});
    expect(state.heroes[0]!.army[0]).toEqual({
      creature: "caveman",
      count: 15,
    });
    expect(state.heroes[0]!.xp).toBe(10 * 8); // 10 goblins x 8 HP
    expect(state.battles).toBe(1);
    expect(events).toContainEqual({ type: "monster-defeated", monsterId: "m" });
    // The way is open now.
    expect(findPath(state, "hero-0", 6, 1, { ignoreFog: true })).not.toBeNull();
  });

  it("removes a stack that dies completely and grants level-ups", () => {
    const s = intoBattle(
      gameOn(field(7, 3), [monster("m", 3, 1, "orc-brute", 80)], 0, 1),
      3,
      1,
    );
    const result = {
      winner: "attacker" as const,
      attacker: [0, 6],
      defender: [0, 0, 0],
    };
    const { state, events } = ok(applyBattleResult(s, result));
    const hero = state.heroes[0]!;
    expect(hero.army[0]).toBeNull();
    expect(hero.xp).toBe(80 * 28); // 2240
    // RULES_V2 3.2: level 4 needs 100 x 3 x 6 = 1800.
    expect(hero.level).toBe(4);
    expect(hero.pendingLevelUps).toBe(3);
    expect(events.filter((e) => e.type === "level-up")).toEqual([
      { type: "level-up", heroId: "hero-0", level: 2 },
      { type: "level-up", heroId: "hero-0", level: 3 },
      { type: "level-up", heroId: "hero-0", level: 4 },
    ]);
    // The Chieftain's pattern gives Attack, Defense, Attack at once.
    expect(hero).toMatchObject({ attack: 4, defense: 3 });

    let b = state;
    for (let i = 0; i < 8 && levelUpOffer(b, "hero-0") !== null; i++) {
      b = ok(chooseLevelUp(b, "hero-0", 0)).state;
    }
    expect(b.heroes[0]!.pendingLevelUps).toBe(0);
    expect(b.heroes[0]!.feats).toHaveLength(1); // the level 3 feat
    expect(errorOf(chooseLevelUp(b, "hero-0", 0))).toBe("no-level-up");
    expect(levelUpOffer(b, "hero-0")).toBeNull();
  });

  it("loses the game when the hero is defeated", () => {
    const s = intoBattle(gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1), 3, 1);
    const { state, events } = ok(fightPendingBattle(s, lose));
    expect(state.status).toBe("lost");
    expect(state.heroes[0]!.alive).toBe(false);
    expect(events).toContainEqual({ type: "game-lost", player: 0 });
    expect(state.monsters["m"]!.count).toBe(10);
    expect(errorOf(endDay(state))).toBe("game-over");
  });

  it("chains the next adjacent stack's attack", () => {
    const s = intoBattle(
      gameOn(field(5, 3), [monster("a", 2, 0), monster("b", 2, 2)], 0, 1),
      1,
      1,
    );
    expect(s.pendingBattle?.objectId).toBe("a");
    const first = ok(fightPendingBattle(s, winLosing(0)));
    expect(first.state.pendingBattle?.objectId).toBe("b");
    expect(first.events.at(-1)).toMatchObject({ type: "battle" });
    const second = ok(fightPendingBattle(first.state, winLosing(0))).state;
    expect(second.pendingBattle).toBeNull();
    expect(second.heroes[0]!.xp).toBe(160);
  });

  it("collects a guarded pickup after the fight", () => {
    const s = intoBattle(
      gameOn(
        field(5, 1),
        [
          pickup("ore", 2, 0, { resource: "ore", amount: 4 }),
          monster("m", 3, 0),
        ],
        0,
        0,
      ),
      2,
      0,
    );
    expect(s.pendingBattle?.objectId).toBe("m");
    expect(s.collected).toEqual([]);
    const after = ok(fightPendingBattle(s, winLosing(0))).state;
    expect(after.collected).toEqual(["ore"]);
    expect(after.players[0]!.resources.ore).toBe(14);
  });

  it("wins the game by capturing the Warlord's Hold", () => {
    const s = intoBattle(gameOn(field(4, 1), [town("hold", 2, 0, null)]), 2, 0);
    const { state, events } = ok(fightPendingBattle(s, winLosing(5)));
    expect(state.towns["hold"]!.owner).toBe(0);
    expect(state.towns["hold"]!.garrison.every((g) => g === null)).toBe(true);
    expect(state.status).toBe("won");
    expect(events).toContainEqual({ type: "game-won", player: 0 });
    expect(state.heroes[0]!.xp).toBe(
      4 * 140 + 8 * 90 + 14 * 50 + 30 * 28 + 30 * 12,
    );
    expect(errorOf(endDay(state))).toBe("game-over");
  });

  it("rejects results that do not match the setup", () => {
    const s = intoBattle(gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1), 3, 1);
    const bad = [
      { winner: "attacker" as const, attacker: [18], defender: [0, 0, 0] },
      { winner: "attacker" as const, attacker: [19, 6], defender: [0, 0, 0] },
      { winner: "attacker" as const, attacker: [18, 6], defender: [1, 0, 0] },
      { winner: "defender" as const, attacker: [18, 6], defender: [0, 0, 0] },
      { winner: "attacker" as const, attacker: [0, 0], defender: [0, 0, 0] },
      { winner: "attacker" as const, attacker: [1.5, 6], defender: [0, 0, 0] },
    ];
    for (const r of bad)
      expect(errorOf(applyBattleResult(s, r))).toBe("bad-result");
    expect(
      errorOf(
        applyBattleResult(gameOn(field(2, 1), []), {
          winner: "attacker",
          attacker: [],
          defender: [],
        }),
      ),
    ).toBe("no-battle");
  });
});
