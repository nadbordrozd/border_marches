/**
 * The adventure AI's iteration-2 decisions (bead bzc.22) on small
 * hand-built states: fight estimates reused across army changes, faction
 * openings, the magic guild, market trades when rich, Parley, seer-quest
 * leads and gathering reserves. Whole matches belong to the simulation
 * tier (tools/sim/match.ts).
 */
import { describe, expect, it } from "vitest";
import {
  AdventureAi,
  buildQueue,
  chooseBuild,
} from "../../../src/core/ai/index.ts";
import { OPENINGS } from "../../../src/core/ai/economy.ts";
import {
  FightOracle,
  inferFromFamily,
  scaleLoss,
} from "../../../src/core/ai/strength.ts";
import { unlocksPage } from "../../../src/core/ai/adventure-ai.ts";
import {
  aiStep,
  newGame,
  type ArmySlots,
  type BattleResolver,
  type GameAction,
  type GameState,
  type HeroState,
  type PlayerController,
} from "../../../src/core/game/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import {
  buildMap,
  field,
  heroStart,
  monster,
  pickup,
  town,
} from "../game/helpers.ts";

registerSpells();

/** The attacker always wins, losing a tenth of every stack. */
const winSome: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => Math.ceil(s.count * 0.9)),
  defender: setup.defender.stacks.map(() => 0),
});

const fast = (): AdventureAi => new AdventureAi({ resolver: null });

function army(...stacks: Array<[string, number]>): ArmySlots {
  const out: ArmySlots = [null, null, null, null, null, null, null];
  stacks.forEach(([creature, count], i) => {
    out[i] = { creature: creature as never, count };
  });
  return out;
}

function allSeen(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      explored: p.explored.map(() => true),
    })),
  };
}

function withGold(s: GameState, gold: number): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      resources: { ...p.resources, gold },
    })),
  };
}

function turnActions(
  s: GameState,
  ai: PlayerController,
  resolver: BattleResolver = winSome,
): { actions: GameAction[]; state: GameState } {
  const actions: GameAction[] = [];
  let state = s;
  for (let i = 0; i < 200; i++) {
    const step = aiStep(state, () => ai, resolver);
    if (step.action !== null) actions.push(step.action);
    state = step.state;
    if (step.outcome !== "continue") break;
  }
  return { actions, state };
}

function solo(
  objects: MapObject[],
  faction: "humans" | "undead" | "goblins" = "humans",
  rows: string[] = field(16, 5),
): GameState {
  return newGame(buildMap(rows, [town("t0", 0, 2, 0), ...objects]), {
    players: [{ kind: "ai", faction }],
  });
}

describe("fight families (strength.ts)", () => {
  it("predicts a loss at or below a ratio that lost", () => {
    const obs = [{ ratio: 2.5, win: false, lossShare: 1 }];
    expect(inferFromFamily(obs, 2.4)?.win).toBe(false);
    expect(inferFromFamily(obs, 3)).toBeNull();
  });

  it("scales a win's losses by the square of the ratio", () => {
    const obs = [{ ratio: 2, win: true, lossShare: 0.2 }];
    const guess = inferFromFamily(obs, 4);
    expect(guess?.win).toBe(true);
    expect(guess?.lossShare).toBeCloseTo(scaleLoss(0.2, 2, 4));
    expect(guess?.lossShare).toBeCloseTo(0.05);
    // Far below the win it says nothing; just below, it pads the losses.
    expect(inferFromFamily(obs, 1.5)).toBeNull();
    expect(inferFromFamily(obs, 1.9)?.lossShare).toBeGreaterThan(0.2);
  });

  it("does not guess across a loss seen above a win", () => {
    const obs = [
      { ratio: 2, win: true, lossShare: 0.2 },
      { ratio: 3, win: false, lossShare: 1 },
    ];
    expect(inferFromFamily(obs, 2.9)?.win).toBe(false);
    expect(inferFromFamily(obs, 3.5)).toBeNull();
  });

  it("reuses a guard type's result after the army grows", () => {
    // Two goblin stacks of different size: the second fight, with a
    // different army, is predicted from the first instead of simulated.
    let sims = 0;
    const counting: BattleResolver = (setup) => {
      sims++;
      return winSome(setup);
    };
    const s0 = allSeen(
      solo([
        heroStart(1, 2, 0),
        monster("m1", 6, 0, "goblin", 30),
        monster("m2", 12, 4, "goblin", 40),
      ]),
    );
    const hero = s0.heroes[0]!;
    const s1: GameState = {
      ...s0,
      heroes: [{ ...hero, army: army(["squire", 40]) }],
    };
    const oracle = new FightOracle(counting);
    const first = oracle.estimate(s1, {
      kind: "monster",
      objectId: "m1",
      heroId: hero.id,
    });
    expect(first?.simulated).toBe(true);
    expect(sims).toBe(2);
    const s2: GameState = {
      ...s0,
      heroes: [{ ...hero, army: army(["squire", 60]) }],
    };
    const second = oracle.estimate(s2, {
      kind: "monster",
      objectId: "m2",
      heroId: hero.id,
    });
    expect(second?.win).toBe(true);
    expect(sims).toBe(2);
    expect(oracle.inferred).toBe(1);
    // Without families it is simulated again.
    const plain = new FightOracle(counting, { families: false });
    plain.estimate(s1, { kind: "monster", objectId: "m1", heroId: hero.id });
    plain.estimate(s2, { kind: "monster", objectId: "m2", heroId: hero.id });
    expect(sims).toBe(6);
  });

  it("charges the turn budget by the cost model it is given", () => {
    const oracle = new FightOracle(winSome, { costOf: () => 7 });
    const s = allSeen(
      solo([heroStart(1, 2, 0), monster("m1", 6, 0, "goblin", 30)]),
    );
    const hero = s.heroes[0]!;
    oracle.estimate(
      { ...s, heroes: [{ ...hero, army: army(["squire", 40]) }] },
      { kind: "monster", objectId: "m1", heroId: hero.id },
    );
    expect(oracle.simCost).toBe(14);
  });
});

describe("economy (iteration 2)", () => {
  it("opens each faction with its cheap dwelling on day one", () => {
    for (const f of ["humans", "undead", "goblins"] as const) {
      const s = solo([heroStart(1, 2, 0)], f);
      const choice = chooseBuild(s, s.towns["t0"]!);
      expect(choice.build).toBe(OPENINGS[f]?.[0]);
      // Without the opening (or after week one) income comes first.
      expect(chooseBuild(s, s.towns["t0"]!, { opening: false }).build).toBe(
        "town-hall",
      );
    }
  });

  it("moves the first two guild levels up for a magic hero", () => {
    const t = solo([heroStart(1, 2, 0)]).towns["t0"]!;
    const at = (plan: { magic?: boolean }, id: string): number =>
      buildQueue(t, plan).findIndex((d) => d.id === id);
    expect(at({ magic: true }, "magic-guild-2")).toBeLessThan(
      at({}, "magic-guild-2"),
    );
    expect(at({ magic: true }, "magic-guild-1")).toBeLessThan(
      at({ magic: true }, "barracks"),
    );
  });

  it("buys what a blocked building lacks when rich", () => {
    const s0 = solo([heroStart(1, 2, 0)]);
    const t0 = s0.towns["t0"]!;
    // Everything but the essence buildings, no essence, 60000 gold.
    const s: GameState = {
      ...s0,
      day: 30,
      towns: {
        t0: {
          ...t0,
          buildings: [
            ...t0.buildings,
            ...buildQueue(t0)
              .filter((d) => (d.cost.essence ?? 0) === 0)
              .map((d) => d.id),
          ],
        },
      },
      players: s0.players.map((p) => ({
        ...p,
        resources: { gold: 60000, wood: 99, ore: 99, essence: 0 },
      })),
    };
    const { actions } = turnActions(s, fast());
    const trade = actions.find((a) => a.type === "trade");
    expect(trade).toMatchObject({
      type: "trade",
      give: "gold",
      get: "essence",
    });
  });
});

describe("spells and quests (iteration 2)", () => {
  it("weighs a school skill double when it unlocks a known page", () => {
    const h = solo([heroStart(1, 2, 0)]).heroes[0]!;
    const knows: HeroState = { ...h, pages: [...h.pages, "green-road"] };
    expect(unlocksPage(knows, "greencraft", 1)).toBe(true);
    expect(unlocksPage(h, "greencraft", 1)).toBe(false);
    expect(unlocksPage(knows, "stormcalling", 1)).toBe(false);
  });

  it("talks past an adjacent small guard with Parley to reach a treasure", () => {
    // A two-row pass: five goblins stand next to a gold heap. The hero
    // starts next to them (walking into a zone starts the fight at once,
    // so Parley only helps a hero that is already adjacent).
    const rows = ["gggggggggggggg", "gggggggggggggg"];
    const s0 = newGame(
      buildMap(rows, [
        town("t0", 0, 0, 0),
        heroStart(1, 0, 0),
        monster("m", 8, 0, "goblin", 5),
        pickup("gold", 9, 1, { resource: "gold", amount: 3000, value: 3000 }),
      ]),
      { players: [{ kind: "ai", faction: "humans" }] },
    );
    const h = s0.heroes[0]!;
    // Too weak to fight them, but a diplomat.
    const s = allSeen({
      ...withGold(s0, 0),
      heroes: [
        {
          ...h,
          x: 7,
          army: army(["squire", 2]),
          pages: [...h.pages, "parley"],
          skills: [...h.skills, { id: "covenant", rank: 2 }],
          mana: 40,
        },
      ],
    });
    const { actions, state } = turnActions(s, fast());
    expect(actions.some((a) => a.type === "cast" && a.spell === "parley")).toBe(
      true,
    );
    expect(state.collected).toContain("gold");
    // The diplomat walked past (no move of it onto the stack's cell).
    const hero0 = s.heroes[0]!.id;
    expect(
      actions.some(
        (a) =>
          a.type === "move" &&
          a.heroId === hero0 &&
          a.path.some((p) => p.x === 8 && p.y === 0),
      ),
    ).toBe(false);
  });

  it("stops 2 cells short of a guard to Parley it (bzc.39)", () => {
    // As above, but the hero starts 4 cells from the goblins: it walks to
    // a cell 2 away (outside their zone), casts, then walks past.
    const rows = ["gggggggggggggg", "gggggggggggggg"];
    const s0 = newGame(
      buildMap(rows, [
        town("t0", 0, 0, 0),
        heroStart(1, 0, 0),
        monster("m", 8, 0, "goblin", 5),
        pickup("gold", 9, 1, { resource: "gold", amount: 3000, value: 3000 }),
      ]),
      { players: [{ kind: "ai", faction: "humans" }] },
    );
    const h = s0.heroes[0]!;
    const s = allSeen({
      ...withGold(s0, 0),
      towns: {
        t0: { ...s0.towns["t0"]!, garrison: army() },
      },
      heroes: [
        {
          ...h,
          x: 4,
          army: army(["squire", 2]),
          pages: [...h.pages, "parley"],
          skills: [...h.skills, { id: "covenant", rank: 2 }],
          mana: 40,
        },
      ],
    });
    const { actions, state } = turnActions(s, fast());
    const at = actions.findIndex(
      (a) => a.type === "cast" && a.spell === "parley",
    );
    expect(at).toBeGreaterThan(0);
    const before = actions[at - 1];
    expect(before?.type).toBe("move");
    const end = before?.type === "move" ? before.path.at(-1) : undefined;
    expect(Math.max(Math.abs(end!.x - 8), Math.abs(end!.y - 0))).toBe(2);
    expect(state.collected).toContain("gold");
  });

  it("casts Opening Salvo from 2 cells away before attacking (bzc.39)", () => {
    const rows = field(14, 3);
    const s0 = newGame(
      buildMap(rows, [
        town("t0", 0, 1, 0),
        heroStart(1, 1, 0),
        monster("m", 9, 1, "goblin", 30),
      ]),
      { players: [{ kind: "ai", faction: "humans" }] },
    );
    const h = s0.heroes[0]!;
    const s = allSeen({
      ...withGold(s0, 0),
      towns: {
        t0: { ...s0.towns["t0"]!, garrison: army() },
      },
      heroes: [
        {
          ...h,
          x: 4,
          army: army(["squire", 40], ["longbowman", 15]),
          pages: [...h.pages, "opening-salvo"],
          skills: [...h.skills, { id: "stormcalling", rank: 1 }],
          mana: 40,
        },
      ],
    });
    const { actions } = turnActions(s, fast());
    const at = actions.findIndex(
      (a) => a.type === "cast" && a.spell === "opening-salvo",
    );
    expect(at).toBeGreaterThan(0);
    const before = actions[at - 1];
    const end = before?.type === "move" ? before.path.at(-1) : undefined;
    expect(Math.max(Math.abs(end!.x - 9), Math.abs(end!.y - 1))).toBe(2);
  });

  it("goes for the artifact a seer asks for", () => {
    const seer: MapObject = {
      id: "seer",
      kind: "site",
      x: 2,
      y: 4,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: {
        type: "seer-hut",
        quest: { kind: "artifact", artifact: "lucky-penny" },
        reward: { gold: 6000 },
        value: 6000,
      },
    };
    const art: MapObject = {
      id: "art",
      kind: "artifact",
      x: 12,
      y: 0,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { artifact: "lucky-penny", value: 100 },
    };
    const s = allSeen(solo([heroStart(1, 2, 0), seer, art]));
    const lines = fast().explain(s, 0).join("\n");
    const value = Number(/obj:art value (\d+)/.exec(lines)?.[1] ?? 0);
    const plain = fast()
      .explain(
        allSeen(
          solo([
            heroStart(1, 2, 0),
            {
              ...seer,
              data: { ...seer.data, quest: { kind: "level", level: 99 } },
            },
            art,
          ]),
        ),
        0,
      )
      .join("\n");
    const without = Number(/obj:art value (\d+)/.exec(plain)?.[1] ?? 0);
    expect(value).toBeGreaterThan(without + 2000);
  });
});

describe("map leftovers (bead bzc.32)", () => {
  const site = (id: string, type: string, x: number, y: number): MapObject => ({
    id,
    kind: "site",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { type },
  });

  it("buys a Drill for its army at a drill yard when rich", () => {
    const s0 = solo([heroStart(1, 2, 0), site("yard", "drill-yard", 3, 2)]);
    const h = s0.heroes[0]!;
    const s = allSeen({
      ...withGold(s0, 20000),
      heroes: [{ ...h, x: 3, army: army(["longbowman", 10]) }],
    });
    expect(fast().decide(s, 0)).toMatchObject({
      type: "use-site",
      objectId: "yard",
      option: "drill:butts",
    });
    // Poor: no Drill.
    const poor = { ...s, ...withGold(s, 2000) };
    const a = fast().decide(poor, 0);
    expect(a.type === "use-site" && a.option.startsWith("drill:")).toBe(false);
  });

  it("takes the Tow Line to a pylon near a far target", () => {
    const s0 = solo(
      [
        heroStart(1, 2, 0),
        site("p1", "pylon", 2, 2),
        site("p2", "pylon", 55, 2),
        pickup("gold", 57, 2, { resource: "gold", amount: 9000, value: 9000 }),
      ],
      "humans",
      field(60, 5),
    );
    const h = s0.heroes[0]!;
    const s = allSeen({
      ...withGold(s0, 0),
      sites: { ...s0.sites, p1: { players: [0] }, p2: { players: [0] } },
      heroes: [
        {
          ...h,
          x: 2,
          pages: [...h.pages, "tow-line"],
          skills: [...h.skills, { id: "stormcalling", rank: 2 }],
          mana: 40,
        },
      ],
    });
    expect(fast().decide(s, 0)).toMatchObject({
      type: "cast",
      spell: "tow-line",
      target: { objectId: "p2" },
    });
  });
});

describe("coordination (iteration 2)", () => {
  it("calls a secondary in when its troops tip a big attack", () => {
    // Player 0's main hero faces a rival hero 1.5 times its strength; a
    // secondary at home carries enough to tip it.
    const s0 = newGame(
      buildMap(field(40, 5), [
        town("t0", 0, 2, 0),
        heroStart(20, 2, 0),
        town("t1", 39, 2, 1),
        heroStart(26, 2, 1),
      ]),
      {
        players: [
          { kind: "ai", faction: "humans" },
          { kind: "ai", faction: "undead" },
        ],
      },
    );
    const main = s0.heroes.find((h) => h.owner === 0)!;
    const foe = s0.heroes.find((h) => h.owner === 1)!;
    const reserve: HeroState = {
      ...main,
      id: "hero-reserve",
      defId: "reserve",
      x: 2,
      y: 2,
      army: army(["knight", 6], ["squire", 1]),
    };
    const base = (foeArmy: ArmySlots): GameState =>
      allSeen({
        ...withGold(s0, 0),
        day: 12,
        heroes: [
          { ...main, army: army(["knight", 10]) },
          reserve,
          { ...foe, army: foeArmy },
        ],
      });
    const meet = (s: GameState): number => {
      const lines = fast().explain(s, 0).join("\n");
      return Number(/meet:hero-\S+ value (\d+)/.exec(lines)?.[1] ?? 0);
    };
    const tipped = meet(base(army(["vampire", 12])));
    const quiet = meet(base(army(["skeleton", 1])));
    expect(tipped).toBeGreaterThan(quiet + 3000);
  });
});
