/**
 * The owner flag of the adventure map (bead border_marches-bzc.146): one
 * studio sprite (set owner-flags, take flag-a#62), a chunky white flag on a
 * brown pole with a gold knob, recoloured per player by the renderer
 * (src/render/map/owner-flag.ts), and where it is planted on each building
 * that can be owned: every town sprite (the 3x2 stages of every faction and
 * the level towns), the five mines and the ownable dwellings.
 *
 * Placement rule (docs/art/classes/map-objects.md#owner-flags): the flag
 * stands on a high roof, tower or turret right of the building's centre,
 * so it never covers the gate, the entrance or a hero standing there, its
 * cloth flies right over open sky or roofs, and the town keeps its own
 * landmark as the highest point where it can. Every anchor was chosen by
 * looking at the sprite; review sheets in the bead.
 */
import type { ImageAsset, Point } from "./manifest";

/** The flag sprite: 28 x 31, its pole's foot at the bottom row. */
export const OWNER_FLAG: ImageAsset & {
  /** The pole's centre column (its two wood columns are 2 and 3). */
  readonly poleX: number;
  /** The cloth's lowest row (its bottom outline). */
  readonly clothBottom: number;
  /** Columns from here rightwards are cloth and may wave. */
  readonly clothLeft: number;
  readonly source: string;
} = {
  key: "owner-flag",
  path: "assets/objects/map/owner-flag.png",
  w: 28,
  h: 31,
  category: "map-object",
  poleX: 3,
  clothBottom: 22,
  clothLeft: 5,
  source: "owner-flags/flag-a#62",
};

/**
 * Where the flag is planted on a sprite: the sprite pixel the pole's foot
 * stands on, and how many rows of pole show below the cloth (2-8).
 */
export interface FlagAnchor extends Point {
  readonly pole: number;
}

/** The flag's foot on each ownable sprite, by sprite key. */
export const OWNER_FLAG_ANCHORS: Readonly<Record<string, FlagAnchor>> = {
  // 3x2 towns (240 x 184 canvases): a turret, hut or tower right of centre.
  "dinosaur-town-3x2": { x: 186, y: 66, pole: 4 }, // right thatched hut's knob
  "goblin-hold-3x2": { x: 174, y: 26, pole: 4 }, // watchtower roof
  "horde-warcamp-3x2": { x: 183, y: 69, pole: 4 }, // right shack's roof peak
  "realm-village-3x2": { x: 144, y: 48, pole: 4 }, // church roof, right end
  "realm-castle-3x2": { x: 155, y: 46, pole: 3 }, // right turret's cone
  "restless-graveyard-3x2": { x: 141, y: 36, pole: 4 }, // chapel roof, right end
  "restless-churchyard-3x2": { x: 155, y: 64, pole: 3 }, // right pinnacle
  "candy-hamlet-3x2": { x: 165, y: 89, pole: 4 }, // pink roof right of the hall
  "candy-palace-3x2": { x: 170, y: 51, pole: 3 }, // right sugar-glass spire
  "dwarves-hamlet-3x2": { x: 164, y: 56, pole: 4 }, // water tower's cap
  "dwarves-forgehall-3x2": { x: 164, y: 89, pole: 4 }, // right copper dome
  // Level towns.
  "dinosaur-city-1": { x: 66, y: 43, pole: 4 }, // right hut
  "dinosaur-city-2": { x: 78, y: 20, pole: 3 }, // bone totem
  "dinosaur-city-3": { x: 82, y: 21, pole: 3 }, // right bone totem
  "goblin-city-1": { x: 68, y: 22, pole: 4 }, // right shack's roof
  "goblin-city-2": { x: 75, y: 15, pole: 4 }, // watchtower roof
  "goblin-city-3": { x: 80, y: 5, pole: 4 }, // watchtower roof
  village: { x: 58, y: 28, pole: 4 }, // right cottage's roof
  // Mines.
  "map-object-sawmill": { x: 88, y: 12, pole: 4 }, // roof ridge, right gable
  "map-object-ore-pit": { x: 78, y: 26, pole: 5 }, // rock's right shoulder
  "map-object-essence-spring": { x: 84, y: 8, pole: 5 }, // rock arch top
  "map-object-gold-mine": { x: 92, y: 16, pole: 5 }, // rock's right shoulder
  "map-object-haunted-mine": { x: 86, y: 24, pole: 5 }, // rock's right shoulder
  // Ownable dwellings.
  "map-object-faction-outpost-humans": { x: 92, y: 27, pole: 4 }, // right tower
  "map-object-faction-outpost-undead": { x: 49, y: 11, pole: 4 }, // keep top
  "map-object-faction-outpost-goblins": { x: 70, y: 32, pole: 4 }, // right roof
  "map-object-faction-outpost-candy": { x: 53, y: 4, pole: 3 }, // tower roof
  "map-object-faction-outpost-dwarves": { x: 62, y: 16, pole: 4 }, // dome roof
  "map-object-stray-hut": { x: 36, y: 5, pole: 4 }, // roof ridge
  "map-object-caretaker-lodge": { x: 84, y: 11, pole: 4 }, // roof ridge
  "map-object-walrus-rookery": { x: 80, y: 10, pole: 5 }, // igloo's shoulder
};

/**
 * The anchor of a sprite: its recorded one, else a pole on the upper right
 * of its canvas (a sprite added without one still shows its owner).
 */
export function ownerFlagAnchor(
  asset: Pick<ImageAsset, "key" | "w" | "h">,
): FlagAnchor {
  return (
    OWNER_FLAG_ANCHORS[asset.key] ?? {
      x: Math.round(asset.w * 0.72),
      y: Math.round(asset.h * 0.2),
      pole: 5,
    }
  );
}
