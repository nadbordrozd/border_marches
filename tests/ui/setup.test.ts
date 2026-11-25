/**
 * New-game setup with named maps (bead bzc.18): a named map takes its
 * players and map from its definition, gives the human the chosen faction
 * and the computer the map's other recommended factions, and loads the same
 * game every time.
 */
import { describe, expect, it } from "vitest";
import { buildNamedMap } from "../../src/core/map/named.ts";
import { createGame, playerSetups } from "../../src/ui/app.ts";

describe("named maps in new-game setup", { timeout: 60_000 }, () => {
  it("seats the human's faction and the recommended rest", () => {
    const base = { seed: 1, size: "S" as const, players: 4 };
    const seats = (map: string, faction: "humans" | "undead" | "goblins") =>
      playerSetups({ ...base, map, faction }).map((p) => [p.kind, p.faction]);
    expect(seats("hourglass-marches", "humans")).toEqual([
      ["human", "humans"],
      ["ai", "undead"],
      ["ai", "goblins"],
    ]);
    expect(seats("hourglass-marches", "goblins")).toEqual([
      ["human", "goblins"],
      ["ai", "undead"],
      ["ai", "humans"],
    ]);
    expect(seats("keepers-toll", "undead")).toEqual([
      ["human", "undead"],
      ["ai", "humans"],
    ]);
    expect(seats("keepers-toll", "goblins")).toEqual([
      ["human", "goblins"],
      ["ai", "undead"],
    ]);
  });

  it("starts a named map game deterministically, whatever seed and size say", () => {
    const a = createGame({
      seed: 5,
      size: "S",
      players: 4,
      faction: "undead",
      map: "hourglass-marches",
    });
    const b = createGame({
      seed: 999,
      size: "M",
      players: 2,
      faction: "undead",
      map: "hourglass-marches",
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.map)).toBe(
      JSON.stringify(buildNamedMap("hourglass-marches")),
    );
    expect(a.status).toBe("playing");
    expect(a.scenario).toBeNull();
    expect(a.players.map((p) => [p.kind, p.faction])).toEqual([
      ["human", "undead"],
      ["ai", "humans"],
      ["ai", "goblins"],
    ]);
    expect(a.heroes.map((h) => h.owner)).toEqual([0, 1, 2]);
    expect(a.towns["town-5"]?.name).toBe("Lantern Cross");
    expect(a.towns["town-5"]?.faction).toBe("humans");
    expect(a.towns["town-5"]?.owner).toBeNull();
  });

  it("starts the two-player map with the human against one computer", () => {
    const s = createGame({
      seed: 1,
      size: "L",
      players: 4,
      faction: "humans",
      map: "keepers-toll",
    });
    expect(s.map.width).toBe(48);
    expect(s.players.map((p) => [p.kind, p.faction])).toEqual([
      ["human", "humans"],
      ["ai", "undead"],
    ]);
    expect(s.towns["town-3"]?.name).toBe("Tollbridge");
  });

  it("refuses an unknown map", () => {
    expect(() =>
      createGame({
        seed: 1,
        size: "M",
        players: 2,
        faction: "humans",
        map: "nowhere",
      }),
    ).toThrow(/nowhere/);
  });
});
