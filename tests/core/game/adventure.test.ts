import { describe, expect, it } from "vitest";
import {
  dailyIncome,
  endDay,
  findPath,
  isExplored,
  moveHeroAlong,
  takeChest,
  visitObject,
  build,
} from "../../../src/core/game/index.ts";
import {
  errorOf,
  field,
  gameOn,
  mine,
  monster,
  ok,
  pickup,
  town,
} from "./helpers.ts";

describe("moveHeroAlong", () => {
  it("spends MP, stops when out of MP and continues the next day", () => {
    const s = gameOn(field(20, 1), [], 0, 0);
    const path = findPath(s, "hero-0", 19, 0, { ignoreFog: true })!;
    const day1 = ok(moveHeroAlong(s, "hero-0", path.steps));
    expect(day1.state.heroes[0]).toMatchObject({ x: 15, y: 0, mp: 0 });
    expect(day1.events[0]).toMatchObject({
      type: "moved",
      mpSpent: 1500,
      stop: "no-mp",
    });
    expect(isExplored(day1.state, 0, 19, 0)).toBe(true);

    const rest = path.steps.filter((st) => st.day === 1);
    const day2 = ok(endDay(day1.state));
    const moved = ok(moveHeroAlong(day2.state, "hero-0", rest));
    expect(moved.state.heroes[0]).toMatchObject({ x: 19, y: 0, mp: 1100 });
    expect(moved.events[0]).toMatchObject({ stop: "arrived" });
  });

  it("never modifies its input state", () => {
    const s = gameOn(field(6, 1), [], 0, 0);
    const before = JSON.stringify(s);
    ok(moveHeroAlong(s, "hero-0", findPath(s, "hero-0", 4, 0)!.steps));
    expect(JSON.stringify(s)).toBe(before);
  });

  it("rejects broken paths", () => {
    const s = gameOn(["ggMgg"], [], 0, 0);
    expect(errorOf(moveHeroAlong(s, "hero-0", [{ x: 2, y: 0 }]))).toBe(
      "bad-path",
    );
    expect(
      errorOf(
        moveHeroAlong(s, "hero-0", [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ]),
      ),
    ).toBe("bad-path");
    expect(errorOf(moveHeroAlong(s, "hero-0", []))).toBe("bad-path");
    expect(errorOf(moveHeroAlong(s, "nobody", [{ x: 1, y: 0 }]))).toBe(
      "unknown-hero",
    );
  });

  it("collects a pickup and removes it", () => {
    const s = gameOn(
      field(5, 1),
      [pickup("gold-1", 2, 0, { resource: "gold", amount: 500 })],
      0,
      0,
    );
    const { state, events } = ok(
      moveHeroAlong(s, "hero-0", findPath(s, "hero-0", 2, 0)!.steps),
    );
    expect(state.players[0]!.resources.gold).toBe(8000);
    expect(state.collected).toEqual(["gold-1"]);
    expect(events).toContainEqual({
      type: "pickup",
      pickupId: "gold-1",
      resource: "gold",
      amount: 500,
    });
    // Visiting again does nothing.
    const again = ok(visitObject(state, "hero-0", "gold-1"));
    expect(again.state.players[0]!.resources.gold).toBe(8000);
    expect(again.events).toEqual([]);
  });

  it("stops on an object entrance mid-path", () => {
    const s = gameOn(
      field(5, 1),
      [pickup("w", 2, 0, { resource: "wood", amount: 7 })],
      0,
      0,
    );
    const path = [1, 2, 3].map((x) => ({ x, y: 0 }));
    const { state, events } = ok(moveHeroAlong(s, "hero-0", path));
    expect(state.heroes[0]).toMatchObject({ x: 2, y: 0 });
    expect(events[0]).toMatchObject({ stop: "object" });
    expect(state.players[0]!.resources.wood).toBe(27);
  });

  it("flags a mine, which pays from the next day", () => {
    const s = gameOn(field(5, 1), [mine("saw", 2, 0, "wood")], 0, 0);
    const { state, events } = ok(
      moveHeroAlong(s, "hero-0", findPath(s, "hero-0", 2, 0)!.steps),
    );
    expect(state.mines["saw"]!.owner).toBe(0);
    expect(events).toContainEqual({
      type: "mine-flagged",
      mineId: "saw",
      owner: 0,
    });
    expect(state.players[0]!.resources.wood).toBe(20);
    expect(dailyIncome(state, 0).wood).toBe(3);
    const next = ok(endDay(state)).state;
    expect(next.players[0]!.resources.wood).toBe(23);
    // A flagged mine no longer stops movement.
    expect(findPath(next, "hero-0", 4, 0)!.total).toBe(200);
  });

  it("offers a treasure chest: 1000 gold or 750 XP", () => {
    const s = gameOn(
      field(4, 1),
      [pickup("chest", 1, 0, { chest: true })],
      0,
      0,
    );
    const moved = ok(moveHeroAlong(s, "hero-0", [{ x: 1, y: 0 }]));
    expect(moved.events).toContainEqual({
      type: "chest-offer",
      heroId: "hero-0",
      pickupId: "chest",
    });
    expect(moved.state.collected).toEqual([]);

    const gold = ok(takeChest(moved.state, "hero-0", "chest", "gold")).state;
    expect(gold.players[0]!.resources.gold).toBe(8500);
    expect(gold.collected).toEqual(["chest"]);
    expect(errorOf(takeChest(gold, "hero-0", "chest", "gold"))).toBe(
      "unknown-object",
    );

    const xp = ok(takeChest(moved.state, "hero-0", "chest", "xp")).state;
    expect(xp.heroes[0]).toMatchObject({ xp: 750, level: 1 });
    expect(errorOf(takeChest(s, "hero-0", "chest", "xp"))).toBe(
      "not-on-object",
    );
  });

  it("starts a battle on entering a zone of control", () => {
    const s = gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1);
    const path = findPath(s, "hero-0", 3, 1)!;
    const { state, events } = ok(moveHeroAlong(s, "hero-0", path.steps));
    expect(state.heroes[0]).toMatchObject({ x: 2, y: 1, mp: 1300 });
    expect(events[0]).toMatchObject({ stop: "guarded" });
    expect(state.pendingBattle).toEqual({
      kind: "monster",
      objectId: "m",
      heroId: "hero-0",
    });
    // Nothing else happens until the battle is resolved.
    expect(errorOf(endDay(state))).toBe("battle-pending");
    expect(errorOf(build(state, "x", "palisade"))).toBe("battle-pending");
  });

  it("an adjacent hero attacks with the attack step", () => {
    const s = gameOn(field(3, 1), [monster("m", 2, 0)], 1, 0);
    const { state, events } = ok(moveHeroAlong(s, "hero-0", [{ x: 2, y: 0 }]));
    expect(state.heroes[0]).toMatchObject({ x: 1, y: 0, mp: 1500 });
    expect(events[0]).toMatchObject({ stop: "attack", cells: [] });
    expect(state.pendingBattle?.objectId).toBe("m");
  });

  it("fights the clicked stack when two guard the cell", () => {
    const s = gameOn(
      field(5, 3),
      [monster("a", 2, 0), monster("b", 2, 2)],
      0,
      1,
    );
    const moved = ok(
      moveHeroAlong(s, "hero-0", findPath(s, "hero-0", 2, 2)!.steps),
    );
    expect(moved.state.pendingBattle?.objectId).toBe("b");
    const plain = ok(moveHeroAlong(s, "hero-0", [{ x: 1, y: 1 }]));
    expect(plain.state.pendingBattle?.objectId).toBe("a");
  });

  it("entering the Warlord's Hold starts the town battle", () => {
    const s = gameOn(field(4, 1), [town("hold", 2, 0, null)], 0, 0);
    const { state } = ok(
      moveHeroAlong(s, "hero-0", findPath(s, "hero-0", 2, 0)!.steps),
    );
    expect(state.pendingBattle).toEqual({
      kind: "town",
      objectId: "hold",
      heroId: "hero-0",
    });
  });
});
