import { describe, expect, it } from "vitest";
import {
  build,
  endDay,
  findPath,
  moveHeroAlong,
  newGame,
} from "../../src/core/game/index.ts";
import type { GameState } from "../../src/core/game/index.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import {
  costLabel,
  dateLabel,
  describeCell,
  groupWord,
  stackPhrase,
} from "../../src/ui/format.ts";
import { minimapPixels, TERRAIN_COLOURS } from "../../src/ui/minimap.ts";
import {
  displayObjects,
  objectsSignature,
  townLevel,
} from "../../src/ui/objects.ts";
import {
  deleteSave,
  hasSave,
  loadGame,
  readSave,
  SAVE_KEY,
  saveGame,
} from "../../src/ui/save.ts";
import type { SaveStorage } from "../../src/ui/save.ts";

function fakeStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

let cached: GameState | null = null;
function game(): GameState {
  cached ??= newGame(generateMap(7, { size: "S" }));
  return cached;
}

describe("format", () => {
  it("labels dates as month, week, day", () => {
    expect(dateLabel(1)).toBe("Month 1, Week 1, Day 1");
    expect(dateLabel(8)).toBe("Month 1, Week 2, Day 1");
    expect(dateLabel(29)).toBe("Month 2, Week 1, Day 1");
  });

  it("describes stacks with a group word and the exact count", () => {
    expect(groupWord(23)).toBe("a pack");
    expect(groupWord(12)).toBe("a pack");
    expect(stackPhrase("goblin", 12)).toBe("a pack of 12 Goblins");
    expect(stackPhrase("troll", 1)).toBe("a lone Troll");
    expect(stackPhrase("skeleton", 3)).toBe("a band of 3 Skeletons");
  });

  it("lists costs in resource order", () => {
    expect(costLabel({ ore: 2, gold: 2500, wood: 5 })).toBe(
      "2500 gold, 5 wood, 2 ore",
    );
    expect(costLabel({})).toBe("free");
  });

  it("describes explored cells and hides unexplored ones", () => {
    const s = game();
    const hero = s.heroes[0]!;
    expect(describeCell(s, 0, hero.x, hero.y)).toBe(
      `${hero.name}, your Chieftain`,
    );
    const town = s.map.objects.find(
      (o) => o.kind === "town" && o.data["owner"] === 0,
    )!;
    expect(describeCell(s, 0, town.x, town.y)).toMatch(/\(yours\)$/);
    const hidden = s.players[0]!.explored.indexOf(false);
    expect(
      describeCell(
        s,
        0,
        hidden % s.map.width,
        Math.floor(hidden / s.map.width),
      ),
    ).toBe("Unexplored");
  });
});

describe("save", () => {
  it("round-trips a game and refuses junk", () => {
    const storage = fakeStorage();
    expect(hasSave(storage)).toBe(false);
    expect(saveGame(storage, game())).toBe(true);
    const loaded = loadGame(storage)!;
    expect(loaded.day).toBe(1);
    expect(loaded.map.cells.length).toBe(game().map.cells.length);
    expect(loaded.heroes).toEqual(game().heroes);
    storage.data.set(SAVE_KEY, "{not json");
    expect(loadGame(storage)).toBeNull();
    storage.data.set(SAVE_KEY, JSON.stringify({ version: 999, state: {} }));
    expect(loadGame(storage)).toBeNull();
    deleteSave(storage);
    expect(hasSave(storage)).toBe(false);
  });

  it("round-trips a multi-player v4 game", () => {
    const storage = fakeStorage();
    const s = newGame(generateMap(7, { size: "S" }), {
      players: [
        { kind: "human", faction: "lost-world" },
        { kind: "ai", faction: "lost-world" },
      ],
    });
    saveGame(storage, s);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!).version).toBe(4);
    const r = readSave(storage);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.upgraded).toBe(false);
      expect(JSON.stringify(r.state)).toBe(JSON.stringify(s));
    }
  });

  it("upgrades a v1 save and rejects unknown versions with a message", () => {
    const storage = fakeStorage();
    const v2 = game();
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
    storage.data.set(SAVE_KEY, JSON.stringify({ version: 1, state: v1 }));
    const r = readSave(storage);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.upgraded).toBe(true);
      expect(r.state.players).toHaveLength(1);
      expect(r.state.scenario?.kind).toBe("capture-towns");
    }
    storage.data.set(SAVE_KEY, JSON.stringify({ version: 99, state: v2 }));
    const bad = readSave(storage);
    expect(bad.kind).toBe("rejected");
    if (bad.kind === "rejected") expect(bad.message).toMatch(/version/);
    expect(loadGame(storage)).toBeNull();
  });

  it("upgrades a v2 save to heroes v2 (save v3)", () => {
    const storage = fakeStorage();
    const v3 = game();
    const v2 = JSON.parse(JSON.stringify(v3)) as Record<string, unknown> & {
      heroes: Array<Record<string, unknown>>;
    };
    const v3Only = new Set([
      "power",
      "lore",
      "mana",
      "levelUpStep",
      "redraw",
      "skills",
      "feats",
      "pages",
      "scrolls",
      "worn",
      "backpack",
      "nextBattle",
      "mpDebt",
    ]);
    v2.heroes = v2.heroes.map((h) => ({
      ...Object.fromEntries(Object.entries(h).filter(([k]) => !v3Only.has(k))),
      artifacts: ["tin-sabre", "unknown-amulet"],
    }));
    storage.data.set(SAVE_KEY, JSON.stringify({ version: 2, state: v2 }));
    const r = readSave(storage);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.upgraded).toBe(true);
      const h = r.state.heroes[0]!;
      expect(h).toMatchObject({
        power: 1,
        lore: 1,
        mana: 10,
        levelUpStep: "skill",
        feats: [],
        backpack: ["tin-sabre"],
      });
      expect(h.worn).toHaveLength(11);
      expect(h.skills).toEqual(v3.heroes[0]!.skills);
      expect("artifacts" in h).toBe(false);
    }
  });

  it("round-trips map object memory and site buffs (save v4)", () => {
    const storage = fakeStorage();
    const s = game();
    const h = s.heroes[0]!;
    const withMemory: GameState = {
      ...s,
      sites: {
        "stat-shrine-1": { heroes: [h.id], seen: [0] },
        "windmill-1": { week: 1 },
        "stray-hut-1": { owner: 0, stock: 3, stockWeek: 1 },
        "bank-1": { guard: [{ creature: "winder", count: 2 }] },
        "oasis-1": { last: { [h.id]: 1 } },
      },
      heroes: s.heroes.map((x, i) =>
        i === 0 ? { ...x, buffs: ["rally-camp"], stablesUntil: 7 } : x,
      ),
    };
    expect(saveGame(storage, withMemory)).toBe(true);
    const r = readSave(storage);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.state.sites).toEqual(withMemory.sites);
      expect(r.state.heroes[0]!.buffs).toEqual(["rally-camp"]);
      expect(r.state.heroes[0]!.stablesUntil).toBe(7);
    }
  });

  it("upgrades a v3 save to v4 with empty map object memory", () => {
    const storage = fakeStorage();
    const v4 = game();
    const v3 = JSON.parse(JSON.stringify(v4)) as Record<string, unknown> & {
      heroes: Array<Record<string, unknown>>;
    };
    delete v3["sites"];
    for (const h of v3.heroes) {
      delete h["buffs"];
      delete h["stablesUntil"];
    }
    storage.data.set(SAVE_KEY, JSON.stringify({ version: 3, state: v3 }));
    const r = readSave(storage);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.upgraded).toBe(true);
      expect(r.state.sites).toEqual({});
      expect(r.state.heroes.every((h) => h.buffs.length === 0)).toBe(true);
      expect(JSON.stringify(r.state)).toBe(JSON.stringify(v4));
    }
  });

  it("survives storage that throws", () => {
    const broken: SaveStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(saveGame(broken, game())).toBe(false);
    expect(loadGame(broken)).toBeNull();
    expect(() => deleteSave(broken)).not.toThrow();
    expect(loadGame(null)).toBeNull();
  });
});

describe("display objects", () => {
  it("drops hero starts and collected pickups, keeps live monster counts", () => {
    const s = game();
    const objs = displayObjects(s);
    expect(objs.some((o) => o.kind === "hero-start")).toBe(false);
    const monster = objs.find((o) => o.kind === "monster")!;
    expect(monster.data["count"]).toBe(s.monsters[monster.id]!.count);
    const pickup = objs.find((o) => o.kind === "pickup")!;
    const after = { ...s, collected: [pickup.id] };
    expect(displayObjects(after).some((o) => o.id === pickup.id)).toBe(false);
    expect(objectsSignature(displayObjects(after))).not.toBe(
      objectsSignature(objs),
    );
  });

  it("grows the town art with its halls", () => {
    let s = game();
    const townId = Object.values(s.towns).find((t) => t.owner === 0)!.id;
    expect(townLevel(s.towns[townId]!)).toBe(1);
    const r = build(s, townId, "town-hall");
    expect(r.ok).toBe(true);
    if (r.ok) s = r.state;
    expect(townLevel(s.towns[townId]!)).toBe(2);
    const shown = displayObjects(s).find((o) => o.id === townId)!;
    expect(shown.data["level"]).toBe(2);
  });
});

describe("minimap", () => {
  it("paints terrain, fog and owner colours", () => {
    let s = game();
    const px = minimapPixels(s, 0);
    expect(px.length).toBe(s.map.width * s.map.height * 4);
    const hidden = s.players[0]!.explored.indexOf(false);
    expect([...px.slice(hidden * 4, hidden * 4 + 3)]).toEqual([11, 10, 8]);
    // A plain explored cell shows its terrain colour.
    const plain = s.map.cells.findIndex(
      (c, i) =>
        s.players[0]!.explored[i] === true &&
        c.obstacle === "none" &&
        !c.road &&
        c.terrain !== "water" &&
        !s.map.objects.some((o) => o.y * s.map.width + o.x === i) &&
        !s.heroes.some((h) => h.y * s.map.width + h.x === i),
    );
    expect(plain).toBeGreaterThanOrEqual(0);
    expect([...px.slice(plain * 4, plain * 4 + 3)]).toEqual([
      ...TERRAIN_COLOURS[s.map.cells[plain]!.terrain],
    ]);
    // Own town in the player colour.
    const town = s.map.objects.find(
      (o) => o.kind === "town" && o.data["owner"] === 0,
    )!;
    const t = town.y * s.map.width + town.x;
    expect([...px.slice(t * 4, t * 4 + 3)]).toEqual([0xd8, 0x40, 0x2f]);
    // Walking reveals more of the map.
    const hero = s.heroes[0]!;
    const target = s.map.objects.find(
      (o) =>
        o.kind === "pickup" &&
        findPath(s, hero.id, o.x, o.y, { ignoreFog: true }) !== null,
    )!;
    const path = findPath(s, hero.id, target.x, target.y, {
      ignoreFog: true,
    })!;
    const moved = moveHeroAlong(s, hero.id, path.steps);
    expect(moved.ok).toBe(true);
    if (moved.ok) s = moved.state;
    const day = endDay(s);
    expect(day.ok).toBe(true);
    const fogCells = (p: Uint8ClampedArray): number => {
      let n = 0;
      for (let i = 0; i < p.length; i += 4) if (p[i] === 11) n++;
      return n;
    };
    expect(fogCells(minimapPixels(s, 0))).toBeLessThan(fogCells(px));
  });
});
