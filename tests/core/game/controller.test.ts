/**
 * The AI turn driver, the stand-in AI, derived map starts and the v1 state
 * upgrade, on hand-built states (no whole-game runs).
 */
import { describe, expect, it } from "vitest";
import {
  aiStep,
  endTurn,
  findPath,
  mapStarts,
  newGame,
  prepareStarts,
  runAiTurn,
  SimpleAi,
  upgradeV1State,
  type BattleResolver,
  type GameAction,
  type GameState,
  type PlayerController,
} from "../../../src/core/game/index.ts";
import { generateMap } from "../../../src/core/map/generate.ts";
import { validateMap, type MapObject } from "../../../src/core/map/types.ts";
import {
  buildMap,
  field,
  heroStart,
  monster,
  ok,
  pickup,
  town,
} from "./helpers.ts";

function twoPlayers(extra: MapObject[] = []): GameState {
  return newGame(
    buildMap(field(12, 3), [
      town("t0", 0, 1, 0),
      heroStart(1, 1, 0),
      town("t1", 11, 1, 1),
      heroStart(10, 1, 1),
      ...extra,
    ]),
    {
      players: [
        { kind: "human", faction: "lost-world" },
        { kind: "ai", faction: "lost-world" },
      ],
    },
  );
}

const winAll: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});

const ai = new SimpleAi();
const controllers = (p: number): PlayerController | null =>
  p === 0 ? null : ai;

/** A controller that plays a fixed list of actions, then ends its turn. */
function scripted(actions: GameAction[]): PlayerController {
  let i = 0;
  return { decide: () => actions[i++] ?? { type: "end-turn" } };
}

describe("SimpleAi and runAiTurn", () => {
  it("recruits, collects a free pickup and ends its turn", () => {
    const s = ok(
      endTurn(
        twoPlayers([pickup("gold", 8, 1, { resource: "gold", amount: 500 })]),
      ),
    ).state;
    expect(s.currentPlayer).toBe(1);
    const turn = runAiTurn(s, controllers, winAll);
    expect(turn.outcome).toBe("turn-ended");
    const after = turn.state;
    expect(after.collected).toEqual(["gold"]);
    expect(after.day).toBe(2);
    expect(after.currentPlayer).toBe(0);
    // Cavemen recruited into the garrison (the hero is not in town).
    expect(after.towns["t1"]!.garrison[0]?.creature).toBe("caveman");
    expect(after.towns["t1"]!.dwellings.caveman?.available).toBe(0);
    expect(turn.events).toContainEqual({ type: "turn", player: 0 });
  });

  it("does not walk into a guarded pickup", () => {
    const s = ok(
      endTurn(
        twoPlayers([
          pickup("ore", 7, 1, { resource: "ore", amount: 5 }),
          monster("m", 7, 0),
        ]),
      ),
    ).state;
    const after = runAiTurn(s, controllers, winAll).state;
    expect(after.collected).toEqual([]);
    expect(after.heroes[1]).toMatchObject({ x: 10, y: 1 });
  });

  it("is deterministic", () => {
    const s = ok(endTurn(twoPlayers())).state;
    const a = runAiTurn(s, controllers, winAll);
    const b = runAiTurn(s, controllers, winAll);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe("aiStep", () => {
  it("fights a battle with neutrals itself", () => {
    const s = ok(endTurn(twoPlayers([monster("m", 8, 1)]))).state;
    const path = findPath(s, "hero-1", 8, 1)!.steps;
    const c = scripted([{ type: "move", heroId: "hero-1", path }]);
    const step = aiStep(s, (p) => (p === 1 ? c : null), winAll);
    expect(step.outcome).toBe("continue");
    expect(step.state.monsters["m"]).toBeUndefined();
    expect(step.state.heroes[1]!.xp).toBeGreaterThan(0);
  });

  it("stops at a battle with the human, then continues after it", () => {
    const s = ok(endTurn(twoPlayers())).state;
    const path = findPath(s, "hero-1", 1, 1, { ignoreFog: true })!.steps;
    const c = scripted([{ type: "move", heroId: "hero-1", path }]);
    const ctl = (p: number): PlayerController | null => (p === 1 ? c : null);
    const step = aiStep(s, ctl, winAll);
    expect(step.outcome).toBe("human-battle");
    expect(step.state.pendingBattle).toMatchObject({
      kind: "hero",
      heroId: "hero-1",
      objectId: "hero-0",
    });
  });

  it("ends the turn when an action fails", () => {
    const s = ok(endTurn(twoPlayers())).state;
    const c = scripted([{ type: "build", townId: "t0", building: "palisade" }]);
    const step = aiStep(s, (p) => (p === 1 ? c : null), winAll);
    expect(step.outcome).toBe("turn-ended");
    expect(step.action).toEqual({ type: "end-turn" });
    expect(step.state.currentPlayer).toBe(0);
  });
});

describe("map starts", () => {
  it.each([
    ["S", 2],
    ["M", 3],
    ["M", 4],
  ] as const)("derives %s-map starts for %i players", (size, n) => {
    const map = prepareStarts(generateMap(11, { size }), n);
    expect(validateMap(map)).toEqual([]);
    const starts = mapStarts(map);
    expect(starts.map((s) => s.player)).toEqual(
      Array.from({ length: n }, (_, i) => i),
    );
    for (const st of starts) expect(st.townId).not.toBeNull();
    const s = newGame(generateMap(11, { size }), {
      players: Array.from({ length: n }, (_, i) => ({
        kind: i === 0 ? ("human" as const) : ("ai" as const),
        faction: "lost-world" as const,
      })),
    });
    expect(s.players).toHaveLength(n);
    expect(s.heroes.filter((h) => h.alive)).toHaveLength(n);
    expect(Object.values(s.towns).filter((t) => t.owner !== null)).toHaveLength(
      n,
    );
    // The generator's own starts (bead bzc.3) come first: each player takes
    // the town marked with its start slot. Only when the map has too few
    // starts does a derived one take the Warlord's Hold.
    const gen = generateMap(11, { size });
    const slots = gen.objects.filter(
      (o) => o.kind === "town" && typeof o.data["start"] === "number",
    );
    for (const t of slots) {
      const p = t.data["start"] as number;
      if (p < n) expect(s.towns[t.id]?.owner, t.id).toBe(p);
    }
    expect(Object.values(s.towns).some((t) => t.isHold)).toBe(
      slots.length >= n,
    );
  });

  it("keeps the MVP one-player game and its Hold goal", () => {
    const s = newGame(generateMap(11, { size: "S" }));
    expect(s.players).toHaveLength(1);
    expect(s.scenario?.kind).toBe("capture-towns");
  });
});

describe("AI level-ups (RULES_V2 3.3)", () => {
  it("asks the controller with the offer and takes the index it returns", () => {
    const s = endTurn(twoPlayers());
    const state = ok(s).state;
    const h = state.heroes.find((x) => x.owner === 1)!;
    h.defId = "nobody";
    h.skills = [{ id: "onslaught", rank: 1 }];
    h.xp = 400;
    h.level = 2;
    h.pendingLevelUps = 1;
    const seen: string[] = [];
    const picky: PlayerController = {
      decide: () => ({ type: "end-turn" }),
      levelUp(_state, heroId, offer) {
        seen.push(`${heroId}:${offer.step}:${offer.level}`);
        expect(offer.offers).toHaveLength(3);
        return 1;
      },
    };
    const r = aiStep(state, (p) => (p === 1 ? picky : null), winAll);
    expect(seen).toEqual([`${h.id}:skill:2`]);
    const after = r.state.heroes.find((x) => x.id === h.id)!;
    expect(after.pendingLevelUps).toBe(0);
    expect(after.skills.length).toBeGreaterThanOrEqual(1);
  });
});

describe("v1 states", () => {
  it("upgrade into a one-player v2 game", () => {
    const v2 = newGame(generateMap(5, { size: "S" }));
    // Strip the v2 fields to get the v1 shape.
    const v1 = JSON.parse(JSON.stringify(v2)) as Record<string, unknown> & {
      players: Array<Record<string, unknown>>;
      heroes: Array<Record<string, unknown>>;
    };
    delete v1["currentPlayer"];
    delete v1["pool"];
    delete v1["scenario"];
    v1.players = v1.players.map((p) => ({
      id: p["id"],
      resources: p["resources"],
      explored: p["explored"],
    }));
    for (const h of v1.heroes) {
      delete h["defId"];
      delete h["name"];
      delete h["artifacts"];
    }
    const up = upgradeV1State(
      v1 as unknown as Parameters<typeof upgradeV1State>[0],
    );
    expect(up.players[0]).toMatchObject({ kind: "human", eliminated: false });
    expect(up.heroes[0]!.name).toBe(v2.heroes[0]!.name);
    expect(up.scenario).toEqual(v2.scenario);
    expect(up.players[0]!.tavern.offer).toEqual(v2.players[0]!.tavern.offer);
    expect(up.pool).toEqual(v2.pool);
  });
});
