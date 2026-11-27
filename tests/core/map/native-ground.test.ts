/**
 * Faction outposts on their native ground (bead bzc.135, FACTION_DWARVES 11):
 * one table, the Candy Kingdom on frosting and the Deepforge on volcanic
 * ground; a map without a zone of a faction's ground leaves its outposts
 * where they stood.
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import { generateMapWithInfo } from "../../../src/core/map/generate.ts";
import {
  NATIVE_GROUND,
  preferNativeGround,
} from "../../../src/core/map/gen/native-ground.ts";
import type { GroundRequest } from "../../../src/core/map/gen/native-ground.ts";
import { T } from "../../../src/core/map/gen/state.ts";
import type { GenState } from "../../../src/core/map/gen/state.ts";
import { getHeroClass } from "../../../src/data/classes.ts";

const request = (
  faction: string,
  extra: Partial<GroundRequest> = {},
): GroundRequest => ({
  row: { type: "faction-outpost" },
  data: { faction },
  zones: [0],
  pocket: -1,
  ...extra,
});

const zones = (...main: string[]): GenState =>
  ({ zones: main.map((m, id) => ({ id, main: m })) }) as unknown as GenState;

describe("the native-ground table", () => {
  it("names each faction's native terrain", () => {
    expect(NATIVE_GROUND["candy"]).toEqual({
      zone: "frosting",
      ground: T.frosting,
    });
    expect(NATIVE_GROUND["dwarves"]).toEqual({
      zone: "volcanic",
      ground: T.volcanic,
    });
    expect(getHeroClass("thane").nativeTerrain).toBe("volcanic");
    expect(getHeroClass("artificer").nativeTerrain).toBe("volcanic");
  });

  it("stands a Deepforge outpost on volcanic ground, in its zone or a volcanic zone", () => {
    const st = zones("grass", "volcanic", "frosting");
    const deep = request("dwarves");
    const candy = request("candy");
    const realm = request("humans");
    const kit = request("dwarves", { from: 0 });
    const pocket = request("dwarves", { pocket: 1 });
    expect(preferNativeGround(st, [deep, candy, realm, kit, pocket])).toBe(2);
    expect([deep.ground, deep.zones]).toEqual([T.volcanic, [0, 1]]);
    expect([candy.ground, candy.zones]).toEqual([T.frosting, [0, 2]]);
    for (const r of [realm, kit, pocket]) {
      expect(r.ground).toBeUndefined();
      expect(r.zones).toEqual([0]);
    }
  });

  it("changes nothing on a map without a volcanic zone (each faction alone)", () => {
    const deep = request("dwarves");
    const candy = request("candy");
    expect(preferNativeGround(zones("grass", "frosting"), [deep])).toBe(0);
    expect([deep.ground, deep.zones]).toEqual([undefined, [0]]);
    expect(preferNativeGround(zones("grass", "volcanic"), [candy])).toBe(0);
    expect([candy.ground, candy.zones]).toEqual([undefined, [0]]);
    expect(preferNativeGround(zones("grass"), [deep, candy])).toBe(0);
  });
});

describe(
  "Deepforge outposts on generated maps",
  { timeout: HEAVY_TIMEOUT },
  () => {
    // L 29 rolls a volcanic zone and three Deepforge outposts; its volcanic
    // sites (bead bzc.125) take part of the lava, and the outposts still
    // find volcanic sites in it.
    it("go onto the volcanic zone's lava (L 29)", () => {
      const { map, info } = generateMapWithInfo(29, { size: "L", players: 2 });
      const outposts = map.objects.filter(
        (o) =>
          o.data["type"] === "faction-outpost" &&
          o.data["faction"] === "dwarves",
      );
      const onLava = outposts.filter(
        (o) => map.cells[o.y * map.width + o.x]?.terrain === "volcanic",
      );
      expect(onLava.length).toBeGreaterThan(0);
      for (const o of onLava)
        expect(info.zones[info.zoneOf[o.y * map.width + o.x] ?? -1]?.main).toBe(
          "volcanic",
        );
    });
  },
);
