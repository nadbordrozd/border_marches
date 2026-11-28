/**
 * Town art of the v0.2 factions (bead border_marches-bzc.15): coverage of
 * every building tree, and the lookups' names, aliases and fallbacks.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetByKey, TOWN_3X2_ASSETS } from "../../src/assets/manifest";
import {
  buildingArt,
  normaliseBuildingId,
  townArt,
  townArtFaction,
  townBackdrop,
} from "../../src/assets/town-art";
import {
  BUILDING_ART_ASSETS,
  FORT_BUILDINGS,
  KEYSTONE_BUILDINGS,
  TOWN_ART_FACTIONS,
  TOWN_BACKDROP_ASSETS,
  TOWN_BUILDING_IDS,
} from "../../src/assets/town-buildings";

const ROOT = join(__dirname, "../..");

describe("town building art coverage", () => {
  it("has a sprite for every building of every v0.2 tree", () => {
    for (const faction of TOWN_ART_FACTIONS) {
      // 3 halls, 3 forts, marketplace, silo, guild, tavern, 6 dwellings,
      // 3 Drills, 2 specials and the Keystone Hall (FACTION_*.md section 9),
      // and the harbour's Shipyard, Lighthouse and Admiralty (NAVAL 5.7).
      expect(TOWN_BUILDING_IDS[faction]).toHaveLength(25);
      expect(new Set(TOWN_BUILDING_IDS[faction]).size).toBe(25);
      for (const building of TOWN_BUILDING_IDS[faction]) {
        const art = buildingArt(faction, building);
        expect(art?.building).toBe(building);
        expect(art?.faction).toBe(faction);
      }
      expect(TOWN_BUILDING_IDS[faction]).toEqual(
        expect.arrayContaining([
          ...FORT_BUILDINGS[faction],
          KEYSTONE_BUILDINGS[faction],
        ]),
      );
    }
    expect(BUILDING_ART_ASSETS).toHaveLength(125);
    for (const asset of [...BUILDING_ART_ASSETS, ...TOWN_BACKDROP_ASSETS]) {
      expect(existsSync(join(ROOT, "public", asset.path))).toBe(true);
      expect(assetByKey(asset.key)).toBe(asset);
    }
  });
});

describe("townArt", () => {
  const key = (faction: string, fort: number): string =>
    townArt(faction, fort).key;

  it("picks the camp stage at fort 0-1 and the fort stage at 2-3", () => {
    expect([0, 1, 2, 3].map((f) => key("humans", f))).toEqual([
      "realm-village-3x2",
      "realm-village-3x2",
      "realm-castle-3x2",
      "realm-castle-3x2",
    ]);
    expect([0, 1, 2, 3].map((f) => key("undead", f))).toEqual([
      "restless-graveyard-3x2",
      "restless-graveyard-3x2",
      "restless-churchyard-3x2",
      "restless-churchyard-3x2",
    ]);
    expect([0, 1, 2, 3].map((f) => key("goblins", f))).toEqual([
      "horde-warcamp-3x2",
      "horde-warcamp-3x2",
      "goblin-hold-3x2",
      "goblin-hold-3x2",
    ]);
    expect([0, 1, 2, 3].map((f) => key("candy", f))).toEqual([
      "candy-hamlet-3x2",
      "candy-hamlet-3x2",
      "candy-palace-3x2",
      "candy-palace-3x2",
    ]);
    expect([0, 1, 2, 3].map((f) => key("dwarves", f))).toEqual([
      "dwarves-hamlet-3x2",
      "dwarves-hamlet-3x2",
      "dwarves-forgehall-3x2",
      "dwarves-forgehall-3x2",
    ]);
  });

  it("accepts faction names and falls back for one-stage and unknown factions", () => {
    expect(key("Realm", 3)).toBe("realm-castle-3x2");
    expect(key("restless", 0)).toBe("restless-graveyard-3x2");
    expect(key("horde", 2)).toBe("goblin-hold-3x2");
    expect(key("Deepforge", 3)).toBe("dwarves-forgehall-3x2");
    expect(key("lost-world", 0)).toBe("dinosaur-town-3x2");
    expect(key("lost-world", 3)).toBe("dinosaur-town-3x2");
    expect(key("neutral", 1)).toBe("dinosaur-town-3x2");
  });

  it("gives every faction town the 3x2 canvas", () => {
    for (const faction of TOWN_ART_FACTIONS)
      for (const fort of [0, 3]) {
        const art = townArt(faction, fort);
        expect(TOWN_3X2_ASSETS).toContain(art);
        expect([art.w, art.h]).toEqual([240, 184]);
      }
  });
});

describe("buildingArt", () => {
  it("normalises names to ids", () => {
    expect(normaliseBuildingId("Squires' Hall")).toBe("squires-hall");
    expect(normaliseBuildingId("Slayers’ Lodge")).toBe("slayers-lodge");
    expect(normaliseBuildingId("magic_guild_2")).toBe("magic-guild-2");
    expect(buildingArt("humans", "Squires' Hall")?.building).toBe(
      "squires-hall",
    );
    expect(buildingArt("realm", "Round Table")?.building).toBe("round-table");
  });

  it("maps guild levels, fort levels and the Keystone Hall", () => {
    for (const level of [1, 2, 3, 4, 5])
      expect(buildingArt("undead", `magic-guild-${level}`)?.building).toBe(
        "magic-guild",
      );
    expect(buildingArt("undead", "fort-2")?.building).toBe("lych-wall");
    expect(buildingArt("goblins", "fort-3")?.building).toBe("skull-tower");
    expect(buildingArt("humans", "fort-1")?.building).toBe("palisade");
    expect(buildingArt("goblins", "keystone-hall")?.building).toBe(
      "great-flinger",
    );
    expect(buildingArt("candy", "fort-3")?.building).toBe("sugar-glass-keep");
    expect(buildingArt("candy", "The Four O'Clock")?.building).toBe(
      "the-four-oclock",
    );
    expect(buildingArt("candy", "keystone-hall")?.building).toBe(
      "the-four-oclock",
    );
    expect(buildingArt("dwarves", "fort-1")?.building).toBe("riveted-palisade");
    expect(buildingArt("deepforge", "fort-3")?.building).toBe("gun-keep");
    expect(buildingArt("dwarves", "Tinkers' Workshop")?.building).toBe(
      "tinkers-workshop",
    );
    expect(buildingArt("dwarves", "keystone-hall")?.building).toBe(
      "the-great-boiler",
    );
  });

  it("returns null without art instead of throwing", () => {
    expect(buildingArt("lost-world", "cave")).toBeNull();
    expect(buildingArt("neutral", "tavern")).toBeNull();
    expect(buildingArt("humans", "no-such-building")).toBeNull();
    // A building of another faction's tree is not borrowed.
    expect(buildingArt("humans", "ogre-pit")).toBeNull();
  });
});

describe("townBackdrop", () => {
  it("has one per v0.2 faction and none for the Lost World", () => {
    expect(townBackdrop("humans")?.key).toBe("town-backdrop-humans");
    expect(townBackdrop("Restless")?.key).toBe("town-backdrop-undead");
    expect(townBackdrop("goblins")?.key).toBe("town-backdrop-goblins");
    expect(townBackdrop("candy")?.key).toBe("town-backdrop-candy");
    expect(townBackdrop("Deepforge")?.key).toBe("town-backdrop-dwarves");
    expect(townBackdrop("lost-world")).toBeNull();
    expect(townArtFaction("lost-world")).toBeUndefined();
  });
});
