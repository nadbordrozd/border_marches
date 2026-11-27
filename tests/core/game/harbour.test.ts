/**
 * Town harbours (docs/design/NAVAL.md 2.2 and 5.7, bead bzc.150): the
 * Shipyard, Lighthouse and Admiralty in every faction's tree, buildable
 * only on a naval map in a town with a dock; buying ships onto the dock
 * with its refusals; the Lighthouse's sea movement; the Admiralty's
 * cheaper ships and deck gun Harm; saves; dry maps exactly as before.
 */
import { describe, expect, it } from "vitest";
import { buildQueue, chooseBuild } from "../../../src/core/ai/economy.ts";
import {
  applyAction,
  build,
  buildStatus,
  buildingShown,
  buyShip,
  deckGunBonus,
  endTurn,
  moveHeroAlong,
  newGame,
  playerDeckGunBonus,
  shipAt,
  shipBuyReason,
  shipBuyStatus,
  shipPrice,
  shipsOf,
  townDock,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { FACTIONS, buildingDef, townTree } from "../../../src/data/factions.ts";
import {
  ADMIRALTY_DECK_GUN_HARM,
  ADMIRALTY_SPECIAL,
} from "../../../src/data/naval.ts";
import { playerSpecials } from "../../../src/core/game/state.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import { readSave, saveGame, type SaveStorage } from "../../../src/ui/save.ts";
import { hallLayout, shownTree, tileState } from "../../../src/ui/town-hall.ts";
import { buildMap, errorOf, field, heroStart, monster, ok } from "./helpers.ts";
import { STRAIT, boat } from "./naval-helpers.ts";

const HARBOUR = ["shipyard", "lighthouse", "admiralty"] as const;

/** A town of a v0.2 faction (the helpers' town is the Lost World's). */
function factionTown(
  id: string,
  x: number,
  y: number,
  owner: number | null,
  faction = "humans",
): MapObject {
  return {
    id,
    kind: "town",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { faction, owner },
  };
}

/** A one-player Realm game on `map` (an owned town takes the faction). */
function realm(map: GameMap): GameState {
  return newGame(map, { players: [{ kind: "human", faction: "humans" }] });
}

/** As naval-helpers' navalGame, with the player on the Realm. */
function navalGame(
  rows: readonly string[],
  objects: MapObject[],
  boats: MapObject[],
  hx: number,
  hy: number,
): GameState {
  const dry = buildMap([...rows], [heroStart(hx, hy), ...objects]);
  return realm({ ...dry, naval: true, objects: [...dry.objects, ...boats] });
}

function rich(s: GameState, player = 0): GameState {
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === player
        ? {
            ...p,
            resources: { gold: 50000, wood: 100, ore: 100, essence: 100 },
          }
        : p,
    ),
  };
}

/** Builds in order, one a day (the day's flag cleared between). */
function buildAll(s: GameState, townId: string, ids: string[]): GameState {
  let out = s;
  for (const id of ids) {
    out = ok(build(out, townId, id)).state;
    out.towns[townId]!.builtToday = false;
  }
  return out;
}

function hero(s: GameState, id = "hero-0"): HeroState {
  return s.heroes.find((h) => h.id === id)!;
}

/** A coastal Realm town on the strait's west island (dock (5, 2)). */
function coastal(boats: MapObject[] = [], extra: MapObject[] = []): GameState {
  return rich(
    navalGame(STRAIT, [factionTown("town-0", 2, 5, 0), ...extra], boats, 3, 6),
  );
}

describe("harbour buildings in every tree (NAVAL 5.7)", () => {
  it("every faction's tree has the three, named per faction, same costs", () => {
    const names: Record<string, string[]> = {
      humans: ["Royal Docks", "Harbour Light", "Admiralty"],
      undead: ["Bone Wharf", "Corpse-Candle Tower", "Ghost Fleet Office"],
      goblins: ["Raft Yard", "Bonfire Beacon", "Pirate King's Tent"],
      candy: ["Gumdrop Marina", "Peppermint Light", "Licorice Admiralty"],
      dwarves: ["Dry Dock", "Lamp Engine", "Ironclad Board"],
    };
    for (const f of FACTIONS.filter((x) => x.available)) {
      const defs = HARBOUR.map((id) => buildingDef(f.id, id)!);
      expect(
        defs.map((d) => d.name),
        f.id,
      ).toEqual(names[f.id]);
      expect(defs.map((d) => d.harbour)).toEqual([...HARBOUR]);
      expect(defs.map((d) => d.cost)).toEqual([
        { gold: 2000, wood: 10 },
        { gold: 1500, ore: 5 },
        { gold: 3000, wood: 5, ore: 5, essence: 2 },
      ]);
      expect(defs.map((d) => d.requires)).toEqual([
        [],
        ["shipyard"],
        ["lighthouse", "town-hall"],
      ]);
      expect(defs[2]!.special).toBe(ADMIRALTY_SPECIAL);
      // The Keystone building stays last in the tree.
      const order = townTree(f.id)!.order;
      expect(buildingDef(f.id, order.at(-1)!)!.needsKeystone).toBe(true);
    }
  });

  it("builds in a coastal town of a naval map, in order", () => {
    let s = coastal();
    expect(townDock(s.map, "town-0")).toEqual({ x: 5, y: 2 });
    expect(buildStatus(s, "town-0", "shipyard")).toBe("ok");
    expect(buildStatus(s, "town-0", "lighthouse")).toBe("requirements");
    s = buildAll(s, "town-0", ["shipyard", "lighthouse"]);
    expect(buildStatus(s, "town-0", "admiralty")).toBe("requirements");
    s = buildAll(s, "town-0", ["town-hall", "admiralty"]);
    expect(s.towns["town-0"]!.buildings).toEqual(
      expect.arrayContaining([...HARBOUR]),
    );
    const gold = s.players[0]!.resources.gold;
    expect(gold).toBe(50000 - 2000 - 1500 - 2500 - 3000);
  });

  it("refuses a landlocked town on a naval map, with that word", () => {
    // (0, 9) on the west island is more than four steps from the sea.
    const s = rich(
      navalGame(STRAIT, [factionTown("town-0", 0, 9, 0)], [], 3, 6),
    );
    expect(townDock(s.map, "town-0")).toBeNull();
    for (const id of HARBOUR)
      expect(buildStatus(s, "town-0", id)).toBe("landlocked");
    expect(errorOf(build(s, "town-0", "shipyard"))).toBe("landlocked");
    expect(tileState(s, "town-0", "shipyard").state).toBe("landlocked");
    // Shown (greyed) on a naval map; the rest of the tree is unaffected.
    expect(buildingShown(s.map, "humans", "shipyard")).toBe(true);
    expect(buildStatus(s, "town-0", "marketplace")).toBe("ok");
  });

  it("refuses them on a dry map and hides them from the town screen", () => {
    const rows = field(12, 8);
    rows[3] = "gggg~~~~gggg";
    const s = rich(
      realm(buildMap(rows, [heroStart(1, 1), factionTown("town-0", 5, 2, 0)])),
    );
    for (const id of HARBOUR) {
      expect(buildStatus(s, "town-0", id)).toBe("not-naval");
      expect(buildingShown(s.map, "humans", id)).toBe(false);
    }
    expect(errorOf(build(s, "town-0", "shipyard"))).toBe("cannot-build");
    const tree = townTree("humans")!;
    const shown = hallLayout(shownTree(s, "humans", tree));
    expect(shown.groups.find((g) => g.id === "harbour")!.buildings).toEqual([]);
    // Everything else exactly where it was.
    const full = hallLayout(tree);
    for (const g of full.groups)
      if (g.id !== "harbour")
        expect(shown.groups.find((x) => x.id === g.id)).toEqual(g);
    expect(shown.dwellings).toEqual(full.dwellings);
    expect(full.groups.find((g) => g.id === "harbour")!.buildings).toEqual([
      ...HARBOUR,
    ]);
  });
});

describe("buying a ship (NAVAL 2.2)", () => {
  it("pays 1000 gold and 10 wood and moors an owned ship on the dock", () => {
    let s = buildAll(coastal(), "town-0", ["shipyard"]);
    expect(shipBuyStatus(s, "town-0")).toBe("ok");
    expect(shipPrice(s, "town-0")).toEqual({ gold: 1000, wood: 10 });
    const before = s.players[0]!.resources;
    const r = ok(buyShip(s, "town-0"));
    s = r.state;
    const ship = shipAt(s, 5, 2)!;
    expect(ship).toMatchObject({ x: 5, y: 2, owner: 0 });
    expect(s.players[0]!.resources).toEqual({
      ...before,
      gold: before.gold - 1000,
      wood: before.wood - 10,
    });
    expect(r.events).toEqual([
      {
        type: "ship-bought",
        townId: "town-0",
        shipId: ship.id,
        player: 0,
        x: 5,
        y: 2,
      },
    ]);
    // Not a building: the day's build is still free.
    expect(s.towns["town-0"]!.builtToday).toBe(false);
  });

  it("refuses an occupied dock, a missing Shipyard, a landlocked town and the poor", () => {
    let s = coastal();
    expect(shipBuyStatus(s, "town-0")).toBe("no-shipyard");
    expect(errorOf(buyShip(s, "town-0"))).toBe("requirements");
    s = buildAll(s, "town-0", ["shipyard"]);
    s = ok(buyShip(s, "town-0")).state;
    // A second ship: the first still moored on the dock.
    expect(shipBuyStatus(s, "town-0")).toBe("dock-occupied");
    expect(shipBuyReason(s, "town-0")).toMatch(/ship is already moored/);
    const r = buyShip(s, "town-0");
    expect(errorOf(r)).toBe("cell-occupied");
    expect(!r.ok && r.message).toMatch(/dock is taken/);
    expect(shipsOf(s)).toHaveLength(1);

    // A sea guard on the dock.
    const guarded = buildAll(
      // Sea objects ride with the boats (added after the land validation).
      coastal([monster("m-1", 5, 2, "goblin", 5)]),
      "town-0",
      ["shipyard"],
    );
    expect(shipBuyStatus(guarded, "town-0")).toBe("dock-occupied");
    expect(shipBuyReason(guarded, "town-0")).toMatch(/sea guard/);

    const poor = buildAll(coastal(), "town-0", ["shipyard"]);
    poor.players[0]!.resources = { gold: 999, wood: 50, ore: 0, essence: 0 };
    expect(shipBuyStatus(poor, "town-0")).toBe("resources");
    expect(shipBuyReason(poor, "town-0")).toMatch(/1000 gold and 10 wood/);

    const inland = rich(
      navalGame(STRAIT, [factionTown("town-0", 0, 9, 0)], [], 3, 6),
    );
    inland.towns["town-0"]!.buildings.push("shipyard");
    expect(shipBuyStatus(inland, "town-0")).toBe("landlocked");
    expect(shipBuyReason(inland, "town-0")).toMatch(/Landlocked/);
    expect(errorOf(buyShip(inland, "town-0"))).toBe("landlocked");
  });

  it("is free again once the ship sails away, and works as a game action", () => {
    let s = buildAll(coastal([], []), "town-0", ["shipyard"]);
    s = ok(applyAction(s, { type: "buy-ship", townId: "town-0" })).state;
    // Sail the ship off the dock by hand (the dock is then free).
    s.ships = s.ships!.map((sh) => ({ ...sh, x: 8, y: 2 }));
    expect(shipBuyStatus(s, "town-0")).toBe("ok");
    s = ok(buyShip(s, "town-0")).state;
    expect(shipsOf(s).map((sh) => [sh.x, sh.y])).toEqual([
      [8, 2],
      [5, 2],
    ]);
  });

  it("refuses on another player's turn and in a dry game", () => {
    const s = buildAll(coastal(), "town-0", ["shipyard"]);
    const other = { ...s, currentPlayer: 1 };
    expect(errorOf(buyShip(other, "town-0"))).toBe("not-your-turn");
    const dry = rich(
      realm(
        buildMap(field(8, 8), [heroStart(1, 1), factionTown("t", 3, 3, 0)]),
      ),
    );
    expect(shipBuyStatus(dry, "t")).toBe("not-naval");
    expect(errorOf(buyShip(dry, "t"))).toBe("cannot-build");
    expect(dry.ships).toBeUndefined();
  });
});

describe("the Lighthouse (NAVAL 2.4, 5.7)", () => {
  it("adds 300 sea movement at the day start for a hero afloat", () => {
    // The hero at (4, 5) steps aboard the boat at (5, 5).
    let s = rich(
      navalGame(
        STRAIT,
        [factionTown("town-0", 2, 5, 0)],
        [boat("boat-1", 5, 5)],
        4,
        5,
      ),
    );
    s = ok(
      moveHeroAlong(s, "hero-0", [
        { x: 4, y: 5 },
        { x: 5, y: 5 },
      ]),
    ).state;
    s = ok(endTurn(s)).state;
    expect(hero(s).seaMaxMp).toBe(1500);
    s = buildAll(s, "town-0", ["shipyard", "lighthouse"]);
    s = ok(endTurn(s)).state;
    expect(hero(s).seaMaxMp).toBe(1800);
    expect(hero(s).mp).toBe(1800);
  });
});

describe("the Admiralty (NAVAL 3.3, 5.7)", () => {
  it("halves ships here and gives the player's deck guns +20 Harm", () => {
    let s = buildAll(coastal(), "town-0", [
      "shipyard",
      "lighthouse",
      "town-hall",
    ]);
    expect(playerDeckGunBonus(s, 0)).toBe(0);
    s = buildAll(s, "town-0", ["admiralty"]);
    expect(shipPrice(s, "town-0")).toEqual({ gold: 500, wood: 5 });
    expect(playerSpecials(s, 0)).toContain(ADMIRALTY_SPECIAL);
    expect(playerDeckGunBonus(s, 0)).toBe(ADMIRALTY_DECK_GUN_HARM);
    expect(deckGunBonus([ADMIRALTY_SPECIAL, ADMIRALTY_SPECIAL])).toBe(20);
    expect(deckGunBonus([])).toBe(0);
    const gold = s.players[0]!.resources.gold;
    s = ok(buyShip(s, "town-0")).state;
    expect(s.players[0]!.resources.gold).toBe(gold - 500);
  });
});

describe("saves and the AI", () => {
  it("keeps harbour buildings and bought ships through a save", () => {
    let s = buildAll(coastal(), "town-0", ["shipyard", "lighthouse"]);
    s = ok(buyShip(s, "town-0")).state;
    const store = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
    expect(saveGame(storage, s)).toBe(true);
    const r = readSave(storage);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.state.towns["town-0"]!.buildings).toEqual(
      s.towns["town-0"]!.buildings,
    );
    expect(r.state.ships).toEqual(s.ships);
    expect(r.state.shipsMade).toBe(1);
    expect(shipBuyStatus(r.state, "town-0")).toBe("dock-occupied");
  });

  it("the AI build order leaves the harbour alone (until the naval AI)", () => {
    const s = coastal();
    const town = s.towns["town-0"]!;
    expect(buildQueue(town).some((d) => d.harbour !== undefined)).toBe(false);
    const choice = chooseBuild(s, town);
    expect(HARBOUR as readonly string[]).not.toContain(choice.build);
  });
});
