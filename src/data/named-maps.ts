/**
 * The shipped named maps (bead bzc.18). Each is a generator seed and
 * options plus a short list of reviewed hand edits; the builder is in
 * src/core/map/named.ts. Every edit says why it is there.
 *
 * Victory on every named map is elimination (RULES_V2 5.9): the last player
 * standing wins.
 */
import type { MapSize, PlayerCount } from "../core/map/gen/config.ts";
import type { Obstacle } from "../core/map/types.ts";
import type { MapZoneKind } from "./mapObjects.ts";
import type { ObjectTypeId } from "./objectTypes.ts";
import type { FactionId } from "./types.ts";

type XY = readonly [number, number];
type Data = Readonly<Record<string, unknown>>;

/** One hand edit applied after generation, in list order. */
export type MapEdit =
  /** A catalogue object whose entrance is `at` (footprint from the type). */
  | {
      op: "add";
      id: string;
      type: ObjectTypeId;
      at: XY;
      data?: Data;
      note: string;
    }
  /** A neutral stack at `at` guarding the listed object ids. */
  | {
      op: "guard";
      id: string;
      at: XY;
      creature: string;
      count: number;
      value: number;
      guards: readonly string[];
      note: string;
    }
  /** Removes a generated object, which must stand at `at`. */
  | { op: "remove"; id: string; at: XY; note: string }
  /** Merges data into a generated object, which must stand at `at`. */
  | { op: "set"; id: string; at: XY; data: Data; note: string }
  /** Raises or clears obstacles on land cells. */
  | { op: "ground"; cells: readonly XY[]; obstacle: Obstacle; note: string };

/** A landscape a named map can ask the generator for (bead bzc.89). */
export type NamedLandscape =
  "volcanic" | "winter" | "desert" | "candy" | "swamp";

/**
 * Generator options of a named map beyond seed, size and players (bead
 * bzc.89). A map without them is generated with no volcanic, winter or
 * desert zones and the generator's own fill, as the first named maps were.
 */
export interface NamedMapGen {
  /**
   * Zones of each landscape the map must have. The generator picks the
   * zones (deep wild zones, never a start, a neutral town or the Hold) from
   * the seed; the map's tests check that every one was placed.
   */
  landscapes?: Readonly<Partial<Record<NamedLandscape, number>>>;
  /** Neutral towns (each in its own middle zone), as the generator's range. */
  neutralTowns?: readonly [number, number];
  /** Visitable objects per 100 open cells, by zone kind (a richer fill). */
  density?: Readonly<Partial<Record<MapZoneKind, number>>>;
  /** Prizes in each guarded pocket (inclusive range). */
  pocketPrizes?: readonly [number, number];
  /** Most guarded pockets in one zone. */
  pocketsPerZone?: number;
  /**
   * The map composition (bead bzc.102, docs/design/MAP_COMPOSITION.md):
   * guarded treasure clusters in nooks (each start its own), treasure
   * clearings and ponds, on the obstacle masses and passes of the first
   * named maps.
   */
  composition?: boolean;
  /**
   * Bead bzc.129: generated on the generator's current defaults (a map
   * authored after the biomes): the map composition with its larger masses
   * and plazas, rare sites first, a way round every building, Mystery Bags
   * and every landscape's own sites (lava, candy and swamp sites too). Only
   * `landscapes`, `neutralTowns`, `middleZones`, `townsBesideStarts`,
   * `secondaryShare` and `density` apply on top; `composition` and the
   * pocket options are ignored.
   */
  current?: boolean;
  /** Middle zones (neutral towns' included), on a `current` map only. */
  middleZones?: number;
  /**
   * A neutral town beside each start first (the generator's
   * `zones.townsBesideStarts`), on a `current` map only.
   */
  townsBesideStarts?: boolean;
  /**
   * Share of each zone in its secondary ground (the generator's
   * `terrain.secondaryShare`), on a `current` map only: lower keeps each
   * landscape in one piece.
   */
  secondaryShare?: readonly [number, number];
}

export interface NamedMapDef {
  id: string;
  name: string;
  /** One paragraph for the setup screen. */
  intro: string;
  size: MapSize;
  players: PlayerCount;
  seed: number;
  /** Generator options (absent on the first two maps). */
  gen?: NamedMapGen;
  /** Recommended faction per player slot (slot 0 is the human). */
  factions: readonly FactionId[];
  /** One line on the recommended setup. */
  setup: string;
  edits: readonly MapEdit[];
}

/**
 * Two players on a medium map: north-west jungle against south-east
 * meadows, the Warlord's Hold between them behind tin titans.
 */
const KEEPERS_TOLL: NamedMapDef = {
  id: "keepers-toll",
  name: "The Keepers' Toll",
  intro:
    "Two castaway lords wake on either side of a drowned crater, one in the north-west jungle and one in the south-east meadows. Between them squats the Warlord's Hold, ringed by tin titans still walking the Keepers' old patrols. Inside its walls a keymaster sells the red key that opens the toll gate at Tollbridge, and behind that gate waits the last Keepers' Vault. South of the Hold, in a cleft held by more tin, lies a Pinch of Sand from the Hourglass with No Bottom. Every valley between is crowded with mines, shrines and strays for hire. Victory: be the last lord standing.",
  size: "M",
  players: 2,
  seed: 23,
  factions: ["humans", "undead"],
  setup:
    "You as The Realm in the north-west against The Restless (computer) in the south-east; any faction can take either seat.",
  edits: [
    {
      op: "set",
      id: "town-3",
      at: [38, 7],
      data: { faction: "undead", name: "Tollbridge" },
      note: "Name the north-east neutral town after the toll gate beside it; a Restless town, pinned as the generator's seeded pick moved when the Deepforge joined the neutral towns (bzc.135).",
    },
    {
      op: "set",
      id: "town-4",
      at: [12, 36],
      data: { faction: "humans", name: "Low Barrow" },
      note: "Name the south-west neutral town (the generator's Thornbury repeats on other maps); a Realm town, pinned as the generator's seeded pick moved when the Deepforge joined the neutral towns (bzc.135).",
    },
    // The key-and-gate puzzle: the vault's valley has one way in.
    {
      op: "add",
      id: "border-gate-red",
      type: "border-gate",
      at: [41, 6],
      data: { colour: "red" },
      note: "Close the only way into the Keepers' Vault valley with a red gate (the vault and a pylon lie behind it).",
    },
    {
      op: "ground",
      cells: [[41, 5]],
      obstacle: "forest",
      note: "A tree beside the gate, so the gate reads as set in a wall (the vault's sprite leaves its north-west cell looking open).",
    },
    {
      op: "set",
      id: "keymasters-tent-1",
      at: [18, 8],
      data: { colour: "blue" },
      note: "The generator's own key-and-gate pair turns blue, so the only red key is the one at the Hold.",
    },
    {
      op: "set",
      id: "border-gate-1",
      at: [8, 43],
      data: { colour: "blue" },
      note: "Its gate, on a loop west of Low Barrow, turns blue with it.",
    },
    {
      op: "add",
      id: "keymasters-tent-red",
      type: "keymasters-tent",
      at: [16, 22],
      data: { colour: "red" },
      note: "The red key inside the Hold's ring, past the tin titans: 2.9 days from the north-west start, 3.0 from the south-east.",
    },
    {
      op: "add",
      id: "sign-toll",
      type: "sign",
      at: [40, 7],
      data: {
        text: "KEEPERS' VAULT. Toll payable in red keys only. Keys from the keymaster at the Hold. No refunds. - The Management",
      },
      note: "Tell visitors where the red key is.",
    },
    {
      op: "set",
      id: "monster-75",
      at: [25, 16],
      data: { creature: "tin-titan", count: 13 },
      note: "The Hold's northern pass is held by tin titans, as the intro says (32 fire-eaters, 12416, to 13 titans, 11674).",
    },
    {
      op: "set",
      id: "monster-74",
      at: [18, 33],
      data: { creature: "tin-titan", count: 13 },
      note: "So is its southern pass (14 rime walruses, 12152, to 13 titans, 11674).",
    },
    // The Marvel piece in the dead-end cleft south of the Hold.
    {
      op: "remove",
      id: "loose-scroll-9",
      at: [20, 38],
      note: "The scroll at the bottom of the cleft makes way for the Marvel piece.",
    },
    {
      op: "remove",
      id: "monster-54",
      at: [20, 35],
      note: "The stat shrine in the cleft stands in the titans' zone of control: its winders go, and the titans hold it too.",
    },
    {
      op: "add",
      id: "loose-artifact-sand",
      type: "loose-artifact",
      at: [20, 38],
      data: { artifact: "a-pinch-of-sand", value: 6000 },
      note: "A Pinch of Sand in the cleft.",
    },
    {
      op: "set",
      id: "monster-52",
      at: [20, 37],
      data: {
        creature: "tin-titan",
        count: 9,
        value: 9000,
        guards: ["loose-artifact-sand", "stat-shrine-8"],
      },
      note: "A strong guard at the bottom of the cleft: 9 tin titans (fight value 8082, for a piece of a 20000 Marvel) instead of 11 loan sharks; they hold the stat shrine beside them too.",
    },
    {
      op: "add",
      id: "sign-sand",
      type: "sign",
      at: [22, 33],
      data: {
        text: "Down the cleft the tin men keep a Pinch of Sand that fell out of time. They will not give it back politely.",
      },
      note: "Point at the Marvel cleft so the strong guard reads as an invitation.",
    },
    // Fair starts: equal essence-spring guards.
    {
      op: "set",
      id: "monster-5",
      at: [2, 28],
      data: { count: 10 },
      note: "North-west essence spring guard 13 to 10 groundskeepers (fight value 2964 to 2280).",
    },
    {
      op: "set",
      id: "monster-6",
      at: [22, 41],
      data: { count: 21 },
      note: "South-east essence spring guard 18 to 21 notaries (1926 to 2247), level with the north-west.",
    },
    // Fair starts: the south-east reached twice the guarded prizes within
    // two days (stacks of fight value 33276 against 15941), so three
    // Wonders wait behind guards in nooks on the north-west's side, each
    // more than two and a half days from the south-east.
    {
      op: "add",
      id: "loose-artifact-cap",
      type: "loose-artifact",
      at: [12, 18],
      data: { artifact: "the-bellhops-cap", value: 6000 },
      note: "The Bellhop's Cap in a nook north of the north-west's ore pit, a day out.",
    },
    {
      op: "guard",
      id: "monster-cap",
      at: [12, 17],
      creature: "groundskeeper",
      count: 20,
      value: 6000,
      guards: ["loose-artifact-cap"],
      note: "Its guard: 20 groundskeepers (4560).",
    },
    {
      op: "add",
      id: "loose-artifact-pendant",
      type: "loose-artifact",
      at: [5, 21],
      data: { artifact: "whetstone-pendant", value: 6000 },
      note: "A Whetstone Pendant in a nook off the west road, a day out.",
    },
    {
      op: "guard",
      id: "monster-pendant",
      at: [4, 21],
      creature: "sexton",
      count: 11,
      value: 6000,
      guards: ["loose-artifact-pendant"],
      note: "Its guard: 11 sextons (4422).",
    },
    {
      op: "add",
      id: "loose-artifact-watch",
      type: "loose-artifact",
      at: [1, 26],
      data: { artifact: "winters-pocket-watch", value: 6000 },
      note: "Winter's Pocket Watch against the west edge above the essence spring, 1.2 days out.",
    },
    {
      op: "guard",
      id: "monster-watch",
      at: [2, 26],
      creature: "winder",
      count: 22,
      value: 6000,
      guards: ["loose-artifact-watch"],
      note: "Its guard: 22 winders (4510).",
    },
    // Event tiles and signs near each start, mirrored.
    {
      op: "add",
      id: "event-tile-nw",
      type: "event-tile",
      at: [7, 14],
      data: {
        text: "A crate stamped by a world that sank bobs in a ditch beside the road.",
        prize: { gold: 500, wood: 5 },
        value: 1000,
      },
      note: "A first-week find beside the north-west road, 0.61 days out.",
    },
    {
      op: "add",
      id: "event-tile-se",
      type: "event-tile",
      at: [43, 38],
      data: {
        text: "A crate stamped by a world that sank lies split open in the grass.",
        prize: { gold: 500, wood: 5 },
        value: 1000,
      },
      note: "The same find east of the south-east start, 0.64 days out.",
    },
    {
      op: "add",
      id: "sign-nw",
      type: "sign",
      at: [5, 15],
      data: {
        text: "South: Low Barrow, where the dead keep shop. East: the Hold, and tin men who never sleep.",
      },
      note: "A signpost at the north-west fork.",
    },
    {
      op: "add",
      id: "sign-se",
      type: "sign",
      at: [30, 38],
      data: {
        text: "West: the Hold. North: Tollbridge and the Keepers' Vault, for those with the red key.",
      },
      note: "A signpost on the south-east road.",
    },
    // The contested middle.
    {
      op: "add",
      id: "event-tile-hold",
      type: "event-tile",
      at: [21, 27],
      data: {
        text: "A Keeper sentry, still winding itself after a thousand years, challenges you for the password.",
        prize: { gold: 1500, xp: 1000 },
        guard: [{ creature: "winder", count: 10 }],
        value: 2800,
      },
      note: "A guarded event in the Hold's ring: 10 winders (2050) for 1500 gold and 1000 experience.",
    },
    // Bead bzc.95: no road runs over a site. The builder steps one-cell
    // sites off the roads and bends the roads round the rest; these sites
    // fill the only ways the roads could bend.
    {
      op: "remove",
      id: "curse-lifters-shrine-4",
      at: [12, 42],
      note: "The south-west road bends round the Landfall Wreck through this cell.",
    },
    {
      op: "remove",
      id: "school-shrine-4",
      at: [24, 42],
      note: "The school shrine fills the gap the south road runs through.",
    },
    // Bead bzc.110: no building stands in a way. The builder moves the
    // rest aside; this one has no room to go in the home valley.
    {
      op: "remove",
      id: "oasis-2",
      at: [9, 20],
      note: "The oasis and the ore pit below it are the only way into the nook east of them; the oasis goes, so the nook keeps a way past the pit.",
    },
  ],
};

/**
 * Three players on a large map: the Realm in the southern jungle, the
 * Restless in the north-western meadows, the Horde on the eastern steppe,
 * and the three pieces of the Hourglass with No Bottom round the Hold.
 */
const HOURGLASS_MARCHES: NamedMapDef = {
  id: "hourglass-marches",
  name: "The Hourglass Marches",
  intro:
    "Three castaway courts land on the Marches in the same week: the Realm's knights in the southern jungle, the Restless in the north-western meadows and the Goblin Horde on the eastern steppe. The Hourglass with No Bottom landed with them and broke in three. A seer in the Hold's ring will trade the Upper Bulb for a deed done; a beanstalk giant sits on a Pinch of Sand in the cleft south of the Hold; and the Lower Bulb waits in a Keepers' Vault in the northern hills, behind blue gates whose key the keymaster sells beside the Hold. Assemble the Hourglass and time stops for your army alone. Victory: be the last court standing.",
  size: "L",
  players: 3,
  seed: 92,
  factions: ["humans", "undead", "goblins"],
  setup:
    "You as The Realm in the south, The Restless (computer) in the north-west and The Goblin Horde (computer) in the east; pick any faction and the computer takes the other two.",
  edits: [
    {
      op: "set",
      id: "town-4",
      at: [61, 50],
      data: { faction: "goblins", name: "Bangwhistle" },
      note: "Name the south-eastern goblin town; its faction is pinned, as the generator's seeded pick moved when the Candy Kingdom joined the neutral towns (bzc.117).",
    },
    {
      op: "set",
      id: "town-5",
      at: [11, 62],
      data: { faction: "humans", name: "Lantern Cross" },
      note: "The south-western neutral town becomes a Realm town, so each faction has one neutral town on the map.",
    },
    {
      op: "set",
      id: "town-6",
      at: [26, 21],
      data: { faction: "undead", name: "Sexton's Rest" },
      note: "Name the northern Restless town; its faction is pinned, as the generator's seeded pick moved when the Candy Kingdom joined the neutral towns (bzc.117).",
    },
    // The key-and-gate puzzle: the northern valley has one gate on each side.
    {
      op: "remove",
      id: "learning-stone-26",
      at: [30, 7],
      note: "The learning stone in the valley's east mouth makes way for a gate.",
    },
    {
      op: "add",
      id: "border-gate-blue-east",
      type: "border-gate",
      at: [30, 7],
      data: { colour: "blue" },
      note: "Close the valley's east mouth with a second blue gate: the valley is now entered only through blue gates.",
    },
    {
      op: "remove",
      id: "tollhouse-5",
      at: [28, 3],
      note: "The tollhouse in the valley makes room for the vault (eight on the map).",
    },
    {
      op: "remove",
      id: "stat-shrine-12",
      at: [27, 5],
      note: "So does this stat shrine before the vault's door.",
    },
    {
      op: "remove",
      id: "monster-70",
      at: [27, 4],
      note: "With its winders.",
    },
    {
      op: "remove",
      id: "stat-shrine-13",
      at: [29, 4],
      note: "And the other stat shrine.",
    },
    {
      op: "remove",
      id: "monster-72",
      at: [28, 5],
      note: "With its gumshoes.",
    },
    {
      op: "add",
      id: "keepers-vault-north",
      type: "keepers-vault",
      at: [28, 4],
      data: {
        value: 16000,
        guard: [
          { creature: "groundskeeper", count: 14 },
          { creature: "notary", count: 30 },
          { creature: "rigger", count: 14 },
        ],
        choices: [
          { artifacts: ["the-lower-bulb", "the-albatross"], gold: 5000 },
          {
            artifacts: ["a-pinch-of-sand", "winters-pocket-watch"],
            gold: 5000,
          },
          { artifacts: ["the-upper-bulb", "ball-and-chain"], gold: 5000 },
        ],
      },
      note: "A Keepers' Vault behind the blue gates (guard fight value 9524, 60% of its 16000), the Lower Bulb among its treasures.",
    },
    {
      op: "remove",
      id: "keymasters-tent-2",
      at: [37, 69],
      note: "The generated blue tent sat at the southern start's back door: it moves.",
    },
    {
      op: "add",
      id: "keymasters-tent-blue",
      type: "keymasters-tent",
      at: [39, 43],
      data: { colour: "blue" },
      note: "The blue key beside the Hold, past the titan-sized pass guards: start, tent, gate totals 5.7, 5.6 and 5.8 days.",
    },
    {
      op: "add",
      id: "sign-vault",
      type: "sign",
      at: [32, 8],
      data: {
        text: "KEEPERS' VAULT, NORTH ANNEXE. Blue keys only. The keymaster keeps shop beside the Warlord's Hold.",
      },
      note: "Tell visitors where the blue key is.",
    },
    {
      op: "remove",
      id: "loose-scroll-8",
      at: [31, 2],
      note: "The vault walls this scroll off in the valley's north-east corner: it goes.",
    },
    {
      op: "remove",
      id: "hermit-4",
      at: [30, 3],
      note: "Likewise the hermit beside it.",
    },
    // The Marvel piece in the cleft south of the Hold.
    {
      op: "remove",
      id: "loose-artifact-10",
      at: [34, 50],
      note: "The artifact at the bottom of the cleft south of the Hold makes way for a Marvel piece.",
    },
    {
      op: "add",
      id: "loose-artifact-sand",
      type: "loose-artifact",
      at: [34, 50],
      data: { artifact: "a-pinch-of-sand", value: 6000 },
      note: "A Pinch of Sand in the cleft.",
    },
    {
      op: "set",
      id: "monster-124",
      at: [34, 49],
      data: {
        creature: "beanstalk-giant",
        count: 5,
        value: 9000,
        guards: ["loose-artifact-sand"],
      },
      note: "A strong guard over it: 5 beanstalk giants (fight value 8535) instead of 7 prize pumpkins.",
    },
    {
      op: "add",
      id: "sign-sand",
      type: "sign",
      at: [36, 44],
      data: {
        text: "South, past the pumpkins: a beanstalk giant sits on a Pinch of Sand and will not move for anyone polite.",
      },
      note: "Point at the Marvel cleft.",
    },
    {
      op: "set",
      id: "seer-hut-17",
      at: [32, 32],
      data: { reward: { artifacts: ["the-upper-bulb"] }, value: 6000 },
      note: "The seer in the Hold's ring pays the Upper Bulb.",
    },
    // Fair starts.
    {
      op: "set",
      id: "haunted-mine-3",
      at: [16, 8],
      data: { resource: "gold", value: 12000 },
      note: "The north-west's nearest gold lay 2.06 days out against 1.15 for the east: the haunted sawmill north of Sexton's Rest becomes a haunted gold mine, 1.62 days out.",
    },
    {
      op: "set",
      id: "monster-34",
      at: [15, 7],
      data: { count: 22, value: 12000 },
      note: "Its sextons grow with it, 4 to 22 (fight value 1608 to 8844).",
    },
    {
      op: "remove",
      id: "monster-8",
      at: [18, 30],
      note: "The north-west essence spring's notaries stood over the road to its second sawmill: they move to the spring's other side.",
    },
    {
      op: "guard",
      id: "monster-spring-nw",
      at: [20, 31],
      creature: "notary",
      count: 21,
      value: 3500,
      guards: ["mine-essence-2"],
      note: "The same 21 notaries (2247) on the spring's east side.",
    },
    {
      op: "remove",
      id: "monster-162",
      at: [14, 30],
      note: "The pass guard south of that sawmill held its door in its zone of control: it steps a cell south, still closing the pass.",
    },
    {
      op: "guard",
      id: "monster-pass-nw",
      at: [14, 31],
      creature: "crooner",
      count: 10,
      value: 1800,
      guards: [],
      note: "The same 10 crooners (1090).",
    },
    {
      op: "set",
      id: "monster-pass-nw",
      at: [14, 31],
      data: { pass: true },
      note: "It holds the pass, like the stack it replaces.",
    },
    // The east reached far more guarded prizes within two days (stacks of
    // fight value 90540 against 65219 and 56445): thin its guard swarms.
    {
      op: "remove",
      id: "stat-shrine-16",
      at: [63, 8],
      note: "Six guarded sites crowded the 5x5 corner north of the eastern start: this stat shrine goes.",
    },
    {
      op: "remove",
      id: "monster-116",
      at: [62, 9],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "stat-shrine-21",
      at: [64, 10],
      note: "So does the second stat shrine.",
    },
    {
      op: "remove",
      id: "monster-145",
      at: [65, 10],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "school-shrine-21",
      at: [61, 9],
      note: "And the school shrine.",
    },
    {
      op: "remove",
      id: "monster-146",
      at: [61, 10],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "stray-hut-19",
      at: [64, 11],
      note: "And the gumshoe hut (25 stray huts on the map).",
    },
    {
      op: "remove",
      id: "monster-118",
      at: [63, 12],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "tutors-hut-14",
      at: [49, 31],
      note: "One of two tutor's huts in the valley west of the eastern start goes (19 on the map).",
    },
    {
      op: "remove",
      id: "monster-103",
      at: [50, 30],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "stray-hut-16",
      at: [57, 36],
      note: "A stray hut south of the eastern start goes.",
    },
    {
      op: "remove",
      id: "monster-107",
      at: [57, 37],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "school-shrine-13",
      at: [55, 41],
      note: "And the school shrine beside it.",
    },
    {
      op: "remove",
      id: "monster-102",
      at: [56, 40],
      note: "With its guard.",
    },
    // ...and set Wonders behind guards in nooks on the north-west's and
    // the south's side, each more than two and a half days from the others.
    {
      op: "add",
      id: "loose-artifact-cap",
      type: "loose-artifact",
      at: [2, 13],
      data: { artifact: "the-bellhops-cap", value: 6000 },
      note: "The Bellhop's Cap at the end of a dead-end west of the north-western start, a day out.",
    },
    {
      op: "guard",
      id: "monster-cap",
      at: [2, 14],
      creature: "groundskeeper",
      count: 20,
      value: 6000,
      guards: ["loose-artifact-cap"],
      note: "Its guard: 20 groundskeepers (4560).",
    },
    {
      op: "add",
      id: "loose-artifact-pendant",
      type: "loose-artifact",
      at: [26, 27],
      data: { artifact: "whetstone-pendant", value: 6000 },
      note: "A Whetstone Pendant in a nook south-east of Sexton's Rest, 1.5 days from the north-western start.",
    },
    {
      op: "guard",
      id: "monster-pendant",
      at: [27, 26],
      creature: "sexton",
      count: 11,
      value: 6000,
      guards: ["loose-artifact-pendant"],
      note: "Its guard: 11 sextons (4422).",
    },
    {
      op: "add",
      id: "loose-artifact-ring",
      type: "loose-artifact",
      at: [23, 15],
      data: { artifact: "bloodstone-ring", value: 5000 },
      note: "A Bloodstone Ring north-east of Sexton's Rest, 1.75 days out.",
    },
    {
      op: "guard",
      id: "monster-ring",
      at: [24, 15],
      creature: "gumshoe",
      count: 14,
      value: 5000,
      guards: ["loose-artifact-ring"],
      note: "Its guard: 14 gumshoes (3682).",
    },
    {
      op: "add",
      id: "loose-artifact-tinderbox",
      type: "loose-artifact",
      at: [0, 19],
      data: { artifact: "tinderbox", value: 5000 },
      note: "A Tinderbox against the west edge, a day from the north-western start.",
    },
    {
      op: "guard",
      id: "monster-tinderbox",
      at: [1, 19],
      creature: "groundskeeper",
      count: 16,
      value: 5000,
      guards: ["loose-artifact-tinderbox"],
      note: "Its guard: 16 groundskeepers (3648).",
    },
    {
      op: "add",
      id: "loose-artifact-vest",
      type: "loose-artifact",
      at: [6, 58],
      data: { artifact: "thornmail-vest", value: 5000 },
      note: "A Thornmail Vest in a nook west of Lantern Cross, 1.7 days from the southern start.",
    },
    {
      op: "guard",
      id: "monster-vest",
      at: [6, 59],
      creature: "groundskeeper",
      count: 16,
      value: 5000,
      guards: ["loose-artifact-vest"],
      note: "Its guard: 16 groundskeepers (3648).",
    },
    {
      op: "add",
      id: "loose-artifact-seal",
      type: "loose-artifact",
      at: [35, 69],
      data: { artifact: "notarys-seal", value: 5000 },
      note: "A Notary's Seal at the end of a dead-end south-east of the southern start, a day out.",
    },
    {
      op: "guard",
      id: "monster-seal",
      at: [36, 69],
      creature: "gumshoe",
      count: 14,
      value: 5000,
      guards: ["loose-artifact-seal"],
      note: "Its guard: 14 gumshoes (3682).",
    },
    // Free loot: the south picked up 5550 within two days, the north-west
    // 7500 and the east 8800.
    {
      op: "add",
      id: "chest-south-a",
      type: "treasure-chest",
      at: [24, 66],
      data: { resource: "gold", amount: 1000, chest: true, xp: 750 },
      note: "A chest in a nook west of the southern start, 0.6 days out.",
    },
    {
      op: "add",
      id: "chest-south-b",
      type: "treasure-chest",
      at: [39, 59],
      data: { resource: "gold", amount: 1000, chest: true, xp: 750 },
      note: "A chest beside the eastern road out of the southern start, 0.6 days out.",
    },
    {
      op: "add",
      id: "chest-south-c",
      type: "treasure-chest",
      at: [24, 51],
      data: { resource: "gold", amount: 1000, chest: true, xp: 750 },
      note: "A chest at the north end of the southern start's land, 0.8 days out.",
    },
    {
      op: "add",
      id: "chest-northwest",
      type: "treasure-chest",
      at: [20, 27],
      data: { resource: "gold", amount: 1000, chest: true, xp: 750 },
      note: "A chest south-east of the north-western start, 0.7 days out.",
    },
    // A find beside each start's road, the same for all three.
    {
      op: "add",
      id: "event-tile-south",
      type: "event-tile",
      at: [38, 61],
      data: {
        text: "A cart from some ended world lies tipped in the ditch, its mule long gone.",
        prize: { gold: 750, ore: 5 },
        value: 1500,
      },
      note: "First-week find beside the southern road, 0.44 days out.",
    },
    {
      op: "add",
      id: "event-tile-northwest",
      type: "event-tile",
      at: [16, 26],
      data: {
        text: "A cart from some ended world lies tipped in the ditch, its mule long gone.",
        prize: { gold: 750, ore: 5 },
        value: 1500,
      },
      note: "The same find beside the north-western road, 0.43 days out.",
    },
    {
      op: "add",
      id: "event-tile-east",
      type: "event-tile",
      at: [58, 21],
      data: {
        text: "A cart from some ended world lies tipped in the ditch, its mule long gone.",
        prize: { gold: 750, ore: 5 },
        value: 1500,
      },
      note: "The same find west of the eastern start, 0.42 days out.",
    },
    {
      op: "add",
      id: "sign-south",
      type: "sign",
      at: [25, 58],
      data: {
        text: "West: Lantern Cross, where the Realm keeps a lamp lit. North: the Hold, and three pieces of a broken hourglass.",
      },
      note: "A signpost on the southern road.",
    },
    {
      op: "add",
      id: "sign-northwest",
      type: "sign",
      at: [15, 25],
      data: {
        text: "East: Sexton's Rest. South: the red gate; its key hangs in a keymaster's tent out by Bangwhistle.",
      },
      note: "A signpost on the north-western road, pointing at the generated red key puzzle.",
    },
    {
      op: "add",
      id: "sign-east",
      type: "sign",
      at: [68, 24],
      data: {
        text: "South: Bangwhistle, loudest town on the Marches. West: the Hold, whose gates are kept by walruses, gumshoes and riggers.",
      },
      note: "A signpost on the eastern road.",
    },
    // The contested middle.
    {
      op: "add",
      id: "event-tile-sentry",
      type: "event-tile",
      at: [39, 38],
      data: {
        text: "A Keeper sentry, still winding itself after a thousand years, challenges you for the password.",
        prize: { gold: 2000, xp: 1500 },
        guard: [{ creature: "winder", count: 14 }],
        value: 3950,
      },
      note: "A guarded event beside the Hold: 14 winders (2870) for 2000 gold and 1500 experience.",
    },
    {
      op: "ground",
      cells: [[21, 24]],
      obstacle: "forest",
      note: "A tree down across the north-western road to the Hold, so the north-west start steps off the road on its way there.",
    },
    {
      op: "add",
      id: "sign-fallen-tree",
      type: "sign",
      at: [22, 23],
      data: {
        text: "ROAD CLOSED by order of nobody. The tree fell in a storm from another world. Mind the wasteland.",
      },
      note: "Explain the tree on the road.",
    },
    // Bead bzc.95: no road runs over a site. The builder steps one-cell
    // sites off the roads and bends the roads round the rest; these sites
    // fill the only way the road could bend.
    {
      op: "remove",
      id: "learning-stone-27",
      at: [54, 62],
      note: "The south-eastern road bends round the Quiet Yard through this cell...",
    },
    {
      op: "remove",
      id: "learning-stone-13",
      at: [55, 63],
      note: "...and this one.",
    },
  ],
};

/**
 * The showcase (bead bzc.89): three players on a large map that uses every
 * landscape. The Realm starts in the south-eastern jungle, the Restless in
 * the western meadows, the Horde on the northern steppe; the generator is
 * asked for one volcanic, one winter and one desert zone (seed 4354 puts
 * the snow in the north-west, the lava in the south-west and the desert
 * round an oasis lake south of the Hold) and three neutral towns, with a
 * denser fill. Three players, not four: one start per faction, and the
 * generator's fourth start would sit on slow wasteland.
 *
 * Bead bzc.102: generated with the map composition (guarded treasure
 * clusters in nooks, two days and more from every start but each start's
 * own, treasure clearings and ponds) on the obstacle masses and passes it
 * was drawn on, and its edits re-authored on that base: the Glove's
 * pieces, the banks, Wonders and fair starts.
 */
const NINEFOLD_LANDFALL: NamedMapDef = {
  id: "ninefold-landfall",
  name: "The Ninefold Landfall",
  intro:
    "Nine worlds sank on the same night and landed here together, stitched into one patchwork shore: meadow, jungle and steppe, red badlands and grey waste, a frozen north, a field of lava, a desert round an oasis lake, and the sea. Three courts wake among them: the Realm in the south-eastern jungle, the Restless in the western meadows and the Goblin Horde on the northern steppe. One drowned world buried its giant with the Second Left Glove, and the landing tore it in three: the Thumb lies with a king in the Pyramid beside the oasis, the Lining in the Frost Giant's Barrow under the northern snow, and the Odd Cufflink under four tyrant lizards at the bottom of the lava fields. Between them wait the Sphinx and her riddles, the Sun Temple, the Aurora Spire, the walruses' rookery and more treasure than any one world ever held. Victory: be the last court standing.",
  size: "L",
  players: 3,
  seed: 4354,
  gen: {
    landscapes: { volcanic: 1, winter: 1, desert: 1 },
    neutralTowns: [3, 3],
    density: { start: 30, middle: 27, town: 28, hold: 30 },
    composition: true,
  },
  factions: ["humans", "undead", "goblins"],
  setup:
    "You as The Realm in the south-east, The Restless (computer) in the west and The Goblin Horde (computer) in the north; pick any faction and the computer takes the other two.",
  edits: [
    // Names.
    {
      op: "set",
      id: "town-4",
      at: [28, 51],
      data: { faction: "goblins", name: "Cinderford" },
      note: "Name the south-western neutral town, between the lava fields and the desert; a Horde town. Each faction has one neutral town, never the faction of the start nearest it.",
    },
    {
      op: "set",
      id: "town-5",
      at: [63, 37],
      data: { faction: "undead", name: "Greyfold" },
      note: "Name the eastern neutral town in the grey wasteland; a Restless town.",
    },
    {
      op: "set",
      id: "town-6",
      at: [64, 11],
      data: { faction: "humans", name: "Redcairn" },
      note: "Name the north-eastern neutral town in the red badlands; a Realm town.",
    },
    // The Second Left Glove, one piece in each of the three wild lands.
    {
      op: "set",
      id: "pyramid-1",
      at: [39, 50],
      data: {
        value: 21000,
        guard: [
          { creature: "late-king", count: 2 },
          { creature: "vampire", count: 5 },
          { creature: "banshee", count: 16 },
          { creature: "ghoul", count: 20 },
        ],
        prize: {
          artifacts: ["the-gloves-thumb", "bloodstone-ring"],
          spell: "whiteout",
          gold: 5000,
          essence: 5,
        },
      },
      note: "The Pyramid beside the oasis keeps the Glove's Thumb with its Bloodstone Ring and great spell; two Late Kings join its dead (guard fight value 13354, 64% of 21000).",
    },
    {
      op: "set",
      id: "frost-giants-barrow-1",
      at: [9, 16],
      data: {
        size: "large",
        value: 15000,
        guard: [{ creature: "rime-walrus", count: 10 }],
        prize: {
          artifacts: ["the-gloves-lining", "sensible-shoes"],
          gold: 5000,
          ore: 15,
        },
      },
      note: "The Frost Giant's Barrow in the frozen north becomes a large bank holding the Glove's Lining: 10 rime walruses (8680, 58% of 15000) instead of 2.",
    },
    {
      op: "add",
      id: "loose-artifact-cufflink",
      type: "loose-artifact",
      at: [7, 71],
      data: { artifact: "the-odd-cufflink", value: 6000 },
      note: "The Odd Cufflink at the bottom of the lava fields, against the south edge.",
    },
    {
      op: "guard",
      id: "monster-cufflink",
      at: [7, 70],
      creature: "t-rex",
      count: 4,
      value: 10000,
      guards: ["loose-artifact-cufflink"],
      note: "Four tyrant lizards bask on the warm rock over it (fight value 10016): the lava's dragon.",
    },
    // More banks: one more in each wild land, a second in the snow, and
    // two in the east.
    {
      op: "add",
      id: "sunken-tomb-oasis",
      type: "sunken-tomb",
      at: [42, 68],
      data: {
        size: "medium",
        value: 6500,
        guard: [
          { creature: "ghoul", count: 18 },
          { creature: "banshee", count: 10 },
        ],
        prize: { gold: 2500, artifacts: ["lucky-penny"], essence: 2 },
      },
      note: "A second Sunken Tomb half buried at the desert's southern edge: 18 ghouls and 10 banshees (3926, 60% of 6500).",
    },
    {
      op: "add",
      id: "frost-giants-barrow-north",
      type: "frost-giants-barrow",
      at: [16, 10],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "rime-walrus", count: 5 }],
        prize: { artifacts: ["fob-chain"], gold: 3000, ore: 10 },
      },
      note: "The giant's brother lies in a smaller barrow east of him: 5 rime walruses (4340, 67% of 6500).",
    },
    {
      op: "add",
      id: "landfall-wreck-lava",
      type: "landfall-wreck",
      at: [5, 69],
      data: {
        size: "large",
        value: 15000,
        guard: [{ creature: "fire-eater", count: 23 }],
        prize: {
          joiners: [{ creature: "fire-eater", count: 8 }],
          artifacts: ["cider-flask"],
          gold: 3000,
        },
      },
      note: "A ship that landed on the lava beside the lizards, still burning, crewed by 23 fire-eaters (8924, 59% of 15000); eight of them join the victor.",
    },
    {
      op: "add",
      id: "quiet-yard-east",
      type: "quiet-yard",
      at: [38, 59],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "sexton", count: 10 }],
        prize: { essence: 8, gold: 2500 },
      },
      note: "A quiet yard on a badlands rise west of the oasis, between the south-eastern and western starts (2.5 and 2.7 days): 10 sextons (4020, 62% of 6500).",
    },
    {
      op: "add",
      id: "overgrown-greenhouse-east",
      type: "overgrown-greenhouse",
      at: [65, 35],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "groundskeeper", count: 17 }],
        prize: { wood: 20, essence: 5, gold: 2000 },
      },
      note: "An overgrown greenhouse in the meadow by Greyfold: 17 groundskeepers (3876, 60% of 6500).",
    },
    // Bead bzc.102: the clearings take the pockets that held banks, so five
    // more banks out in the wilds (the first Sealed Registry and
    // Thunderstruck Pylon Yard on this map among them), and four mines.
    {
      op: "add",
      id: "sealed-registry-hold",
      type: "sealed-registry",
      at: [36, 34],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "notary", count: 38 }],
        prize: { gold: 2500, essence: 4, xp: 1500 },
      },
      note: "A registry sealed in the badlands west of the Warlord's Hold (1.9 days from the northern start, 3.1 from the south-eastern): 38 notaries (4066, 63% of 6500).",
    },
    {
      op: "add",
      id: "thunderstruck-pylon-yard-north",
      type: "thunderstruck-pylon-yard",
      at: [63, 3],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "rigger", count: 18 }],
        prize: { ore: 10, gold: 2500 },
      },
      note: "A pylon yard struck in the red badlands north of Redcairn (2.2 days from the northern start): 18 riggers (4014, 62% of 6500).",
    },
    {
      op: "add",
      id: "landfall-wreck-ash",
      type: "landfall-wreck",
      at: [12, 63],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "fire-eater", count: 10 }],
        prize: {
          joiners: [{ creature: "fire-eater", count: 4 }],
          gold: 2500,
        },
      },
      note: "A second ship on the lava, its crew still aboard: 10 fire-eaters (3880, 60% of 6500); four of them join the victor.",
    },
    {
      op: "add",
      id: "stopped-belfry-ridge",
      type: "stopped-belfry",
      at: [29, 28],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "winder", count: 20 }],
        prize: { xp: 3000, gold: 2500 },
      },
      note: "A belfry at the end of a badlands bay south of the pond (2.2 days from the northern start, 3.1 from the western): 20 winders (4100, 63% of 6500).",
    },
    {
      op: "add",
      id: "quiet-yard-hold",
      type: "quiet-yard",
      at: [41, 44],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "sexton", count: 10 }],
        prize: { essence: 8, gold: 2500 },
      },
      note: "A quiet yard below the Warlord's Hold: 10 sextons (4020, 62% of 6500).",
    },
    {
      op: "add",
      id: "overgrown-greenhouse-redcairn",
      type: "overgrown-greenhouse",
      at: [65, 14],
      data: {
        size: "medium",
        value: 6500,
        guard: [{ creature: "groundskeeper", count: 17 }],
        prize: { wood: 20, essence: 5, gold: 2000 },
      },
      note: "A greenhouse gone wild in the meadow south of Redcairn (1.6 days from the northern start): 17 groundskeepers (3876, 60% of 6500).",
    },
    {
      op: "add",
      id: "mine-ore-redcairn",
      type: "ore-pit",
      at: [69, 7],
      data: { resource: "ore" },
      note: "An ore pit in the red badlands east of Redcairn.",
    },
    {
      op: "add",
      id: "mine-essence-hold",
      type: "essence-spring",
      at: [40, 41],
      data: { resource: "essence" },
      note: "An essence spring in the grey waste below the Hold.",
    },
    {
      op: "add",
      id: "mine-ore-lava",
      type: "ore-pit",
      at: [12, 66],
      data: { resource: "ore" },
      note: "An ore pit in the lava fields beside the wreck.",
    },
    {
      op: "add",
      id: "mine-wood-lava",
      type: "sawmill",
      at: [10, 67],
      data: { resource: "wood" },
      note: "A sawmill on the last wood at the lava's edge.",
    },
    // Bead bzc.125: the hellish sites of the lava fields (the generator
    // leaves them to the named maps' edits).
    {
      op: "remove",
      id: "learning-stone-1",
      at: [8, 64],
      note: "Two learning stones make room for the Infernal Forge in the crowded lava fields...",
    },
    {
      op: "remove",
      id: "learning-stone-30",
      at: [7, 65],
      note: "...this is the second.",
    },
    {
      op: "add",
      id: "infernal-forge-lava",
      type: "infernal-forge",
      at: [6, 65],
      data: { wonder: "tinderbox", value: 2500 },
      note: "An Infernal Forge in the western nook of the lava fields, beside the pit: any Trinket and 1000 gold and 2 essence become a Tinderbox.",
    },
    {
      op: "add",
      id: "brimstone-pit-lava",
      type: "brimstone-pit",
      at: [3, 65],
      data: {
        size: "medium",
        value: 6500,
        guard: [
          { creature: "fire-eater", count: 8 },
          { creature: "gremlin", count: 21 },
        ],
        prize: { artifacts: ["knuckle-dusters"], essence: 5, gold: 2000 },
      },
      note: "A Brimstone Pit in the western nook of the lava fields: 8 fire-eaters and 21 gremlins (4091, 63% of 6500) over 5 essence, 2000 gold and the Knuckle-Dusters.",
    },
    {
      op: "add",
      id: "shrine-of-embers-lava",
      type: "shrine-of-embers",
      at: [12, 61],
      data: { value: 600 },
      note: "A Shrine of Embers in the lava's northern cleft, above the burning wreck.",
    },
    {
      op: "add",
      id: "chest-west",
      type: "treasure-chest",
      at: [5, 39],
      data: { resource: "gold", amount: 1000, chest: true, xp: 750 },
      note: "A chest in a meadow nook west of the western start, 0.9 days out.",
    },
    // A find beside each start's road, the same for all three.
    {
      op: "add",
      id: "event-tile-southeast",
      type: "event-tile",
      at: [60, 62],
      data: {
        text: "Nine worlds fell here in one night. A crate from one of them lies split open beside the road.",
        prize: { gold: 750, wood: 5 },
        value: 1250,
      },
      note: "First-week find beside the south-eastern road.",
    },
    {
      op: "add",
      id: "event-tile-west",
      type: "event-tile",
      at: [17, 42],
      data: {
        text: "Nine worlds fell here in one night. A crate from one of them lies split open beside the road.",
        prize: { gold: 750, wood: 5 },
        value: 1250,
      },
      note: "The same find beside the western road.",
    },
    {
      op: "add",
      id: "event-tile-north",
      type: "event-tile",
      at: [37, 13],
      data: {
        text: "Nine worlds fell here in one night. A crate from one of them lies split open beside the road.",
        prize: { gold: 750, wood: 5 },
        value: 1250,
      },
      note: "The same find beside the northern road.",
    },
    {
      op: "add",
      id: "sign-southeast",
      type: "sign",
      at: [65, 58],
      data: {
        text: "West: the oasis, the Sphinx and the Pyramid, where the dead keep a thumb that is not theirs. North: Greyfold.",
      },
      note: "A signpost on the south-eastern road.",
    },
    {
      op: "add",
      id: "sign-west",
      type: "sign",
      at: [11, 42],
      data: {
        text: "South: the lava fields, and something large that likes the heat. North: the snow, and a giant's barrow.",
      },
      note: "A signpost on the western road.",
    },
    {
      op: "add",
      id: "sign-north",
      type: "sign",
      at: [42, 14],
      data: {
        text: "West: the frozen north and the Frost Giant's Barrow. South: the Warlord's Hold, and past it the desert.",
      },
      note: "A signpost on the northern road.",
    },
    {
      op: "add",
      id: "sign-sphinx",
      type: "sign",
      at: [36, 56],
      data: {
        text: "The Sphinx asks one riddle of every traveller. A wrong answer costs the day; a right one, she says, costs her nothing.",
      },
      note: "A sign on the desert road past the Sphinx.",
    },
    {
      op: "add",
      id: "sign-lava",
      type: "sign",
      at: [18, 61],
      data: {
        text: "HOT GROUND. The lizards at the bottom of the fields sit on a cufflink and will not be moved by anything polite.",
      },
      note: "Point at the lava's guarded Marvel piece.",
    },
    {
      op: "add",
      id: "sign-frost",
      type: "sign",
      at: [17, 12],
      data: {
        text: "West, under the snow: the Frost Giant's Barrow. The giant took a glove lining to his grave; his walruses kept it.",
      },
      note: "Point at the Barrow's Marvel piece.",
    },
    // The contested middle.
    {
      op: "add",
      id: "event-tile-hold",
      type: "event-tile",
      at: [44, 41],
      data: {
        text: "A herald of nine crowns, none of them real, demands that you kneel to all of them at once.",
        prize: { gold: 2000, xp: 1500 },
        guard: [{ creature: "winder", count: 14 }],
        value: 3950,
      },
      note: "A guarded event below the Hold: 14 winders (2870) for 2000 gold and 1500 experience.",
    },
    // Fair starts (bead bzc.102): gold for the west.
    {
      op: "set",
      id: "mine-wood-5",
      at: [3, 35],
      data: { resource: "gold", type: "gold-mine", value: 6000 },
      note: "The west's nearest gold lay 2.2 days out against 0.8 and 1.6: its second sawmill, north-west of the start, becomes a gold mine (its first sawmill is 0.5 days out).",
    },
    {
      op: "guard",
      id: "monster-gold-west",
      at: [4, 34],
      creature: "sexton",
      count: 11,
      value: 6000,
      guards: ["mine-wood-5"],
      note: "11 sextons (4422) hold the new gold mine; with the ore pit's crooners they shut every way to it.",
    },
    {
      op: "set",
      id: "mine-wood-8",
      at: [49, 10],
      data: { resource: "gold", type: "gold-mine", value: 6000 },
      note: "And the north's nearest gold lay 1.6 days out: its second sawmill, east of the start, becomes a gold mine, 1.1 days out (its first sawmill is 0.5 days out).",
    },
    {
      op: "set",
      id: "monster-49",
      at: [49, 11],
      data: { creature: "sexton", count: 11, value: 6000 },
      note: "Its guard grows with it to 11 sextons (1044 to 4422).",
    },
    // Fair starts (bead bzc.102): the northern start, between the snow
    // and the Hold, reached about twice the fights of the others within
    // two days (98900 fight value against 46300 and 60000); eight guarded
    // sites round it go, and the other starts get Wonders behind guards.
    {
      op: "remove",
      id: "fallen-adventurer-3",
      at: [30, 11],
      note: "A fallen adventurer north-west of the northern start goes.",
    },
    {
      op: "remove",
      id: "monster-103",
      at: [29, 12],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "caretaker-lodge-2",
      at: [27, 13],
      note: "A caretaker's lodge beside it goes.",
    },
    {
      op: "remove",
      id: "monster-47",
      at: [27, 14],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "arena-1",
      at: [26, 9],
      note: "An arena west of them goes.",
    },
    {
      op: "remove",
      id: "monster-41",
      at: [25, 9],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "sealed-box-2",
      at: [28, 8],
      note: "A sealed box beside the arena goes.",
    },
    {
      op: "remove",
      id: "monster-84",
      at: [28, 7],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "loose-artifact-21",
      at: [29, 2],
      note: "An artifact on the northern edge goes.",
    },
    {
      op: "remove",
      id: "monster-58",
      at: [28, 3],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "stray-hut-10",
      at: [25, 20],
      note: "A stray hut by the pond goes.",
    },
    {
      op: "remove",
      id: "monster-109",
      at: [26, 19],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "fallen-adventurer-5",
      at: [52, 24],
      note: "A fallen adventurer south-east of the northern start goes.",
    },
    {
      op: "remove",
      id: "monster-122",
      at: [52, 23],
      note: "With its guard.",
    },
    {
      op: "remove",
      id: "tree-of-knowledge-4",
      at: [61, 21],
      note: "A tree of knowledge east of it goes.",
    },
    {
      op: "remove",
      id: "monster-124",
      at: [60, 20],
      note: "With its guard.",
    },
    {
      op: "add",
      id: "loose-artifact-can",
      type: "loose-artifact",
      at: [65, 41],
      data: { artifact: "watering-can", value: 6000 },
      note: "A Watering Can in the meadow on the way north to Greyfold, 1.5 days from the south-eastern start.",
    },
    {
      op: "guard",
      id: "monster-can",
      at: [65, 40],
      creature: "groundskeeper",
      count: 20,
      value: 6000,
      guards: ["loose-artifact-can"],
      note: "Its guard: 20 groundskeepers (4560).",
    },
    {
      op: "add",
      id: "loose-artifact-umbrella",
      type: "loose-artifact",
      at: [48, 62],
      data: { artifact: "umbrella-of-state", value: 6000 },
      note: "An Umbrella of State in a sandy nook west of the south-eastern start, 1.3 days out.",
    },
    {
      op: "guard",
      id: "monster-umbrella",
      at: [47, 62],
      creature: "sexton",
      count: 11,
      value: 6000,
      guards: ["loose-artifact-umbrella"],
      note: "Its guard: 11 sextons (4422).",
    },
    {
      op: "add",
      id: "loose-artifact-apron",
      type: "loose-artifact",
      at: [69, 68],
      data: { artifact: "gardeners-apron", value: 6000 },
      note: "A Gardener's Apron in a jungle nook south-east of the south-eastern start, 0.9 days out.",
    },
    {
      op: "guard",
      id: "monster-apron",
      at: [69, 69],
      creature: "groundskeeper",
      count: 20,
      value: 6000,
      guards: ["loose-artifact-apron"],
      note: "Its guard: 20 groundskeepers (4560).",
    },
    {
      op: "add",
      id: "loose-artifact-shears",
      type: "loose-artifact",
      at: [68, 55],
      data: { artifact: "hedge-clipper-shears", value: 6000 },
      note: "Hedge-Clipper Shears in the jungle strip along the east edge, 1.0 days from the south-eastern start.",
    },
    {
      op: "guard",
      id: "monster-shears",
      at: [69, 55],
      creature: "gumshoe",
      count: 17,
      value: 6000,
      guards: ["loose-artifact-shears"],
      note: "Its guard: 17 gumshoes (4471).",
    },
    {
      op: "add",
      id: "loose-artifact-branch",
      type: "loose-artifact",
      at: [60, 40],
      data: { artifact: "pressed-olive-branch", value: 6000 },
      note: "A Pressed Olive Branch in a nook on the way north from the south-eastern start to Greyfold, 1.5 days out.",
    },
    {
      op: "guard",
      id: "monster-branch",
      at: [61, 39],
      creature: "notary",
      count: 42,
      value: 6000,
      guards: ["loose-artifact-branch"],
      note: "Its guard: 42 notarys (4494).",
    },
    {
      op: "add",
      id: "loose-artifact-slippers",
      type: "loose-artifact",
      at: [0, 38],
      data: { artifact: "felt-slippers-of-the-night-shift", value: 6000 },
      note: "Felt Slippers of the Night Shift in a nook on the west edge by the western start, 1.1 days out.",
    },
    {
      op: "guard",
      id: "monster-slippers",
      at: [0, 39],
      creature: "gumshoe",
      count: 17,
      value: 6000,
      guards: ["loose-artifact-slippers"],
      note: "Its guard: 17 gumshoes (4471).",
    },
    {
      op: "add",
      id: "loose-artifact-greatcoat",
      type: "loose-artifact",
      at: [15, 58],
      data: { artifact: "bailiffs-greatcoat", value: 6000 },
      note: "A Bailiff's Greatcoat in a nook at the lava's edge south of the western start, 1.2 days out.",
    },
    {
      op: "guard",
      id: "monster-greatcoat",
      at: [15, 57],
      creature: "sexton",
      count: 11,
      value: 6000,
      guards: ["loose-artifact-greatcoat"],
      note: "Its guard: 11 sextons (4422).",
    },
    {
      op: "add",
      id: "chest-southeast",
      type: "treasure-chest",
      at: [68, 57],
      data: { resource: "gold", amount: 1000, chest: true, xp: 750 },
      note: "Free loot: a chest north-east of the south-eastern start, 0.9 days out (its Wonders' guards closed some off: it had 5000 to pick up within two days against 7100 and 7700).",
    },
    {
      op: "add",
      id: "pickup-essence-southeast",
      type: "resource-pile",
      at: [65, 66],
      data: { resource: "essence", amount: 3 },
      note: "And three essence south of the start, 0.6 days out.",
    },
    // Bead bzc.102: a pond fills the clearing west of the snow where the
    // way from the western start ran north; a gap in the wood beside it
    // keeps that way.
    {
      op: "ground",
      cells: [[22, 21]],
      obstacle: "none",
      note: "A gap in the wood north of the pond, so the western start's way north still runs past it (6 days round the map without it, 4 with).",
    },
    // Bead bzc.95: no road runs over a site. The builder steps one-cell
    // sites off the roads and bends the roads round the rest; this wood
    // fills the only way the road could bend.
    {
      op: "ground",
      cells: [[12, 44]],
      obstacle: "none",
      note: "A clearing beside the western ore pit, so the road bends round its door (still in its notaries' zone of control).",
    },
  ],
};

/**
 * Bead bzc.129, the user: "add another map to showcase all the terrain
 * types". Two players on a large map generated on today's generator, every
 * ground in a region of its own.
 */
const CARTOGRAPHERS_FOLLY: NamedMapDef = {
  id: "cartographers-folly",
  name: "The Cartographer's Folly",
  intro:
    "The Royal Cartographer was told to draw every land of the world on one sheet. Short of vellum and of time, he drew them all side by side, and the world, not daring to contradict a royal map, moved to match. The Realm wakes in the north-eastern jungle and the Goblin Horde in the south-western meadows, with every land between them: steppe and red badlands, the grey waste, a frozen west, a desert round twin oasis lakes, a field of lava, the Candy Kingdom's sugar meadow on the northern shore, a swamp in the south, and the sea. Each land keeps its own wonders: the Pyramid and the Sphinx, the Frost Giant's Barrow and the Aurora Spire, the Infernal Forge and the Brimstone Pit, the Gingerbread Cottage and the Sugar Fountain, the Drowned Temple and the Witch's Hut. Three neutral towns of the Restless, the Realm and the Candy Kingdom wait to be taken, and the Warlord's Hold sits where the ink was spilled. Victory: be the last court standing.",
  size: "L",
  players: 2,
  seed: 2853,
  gen: {
    current: true,
    landscapes: { volcanic: 1, winter: 1, desert: 1, candy: 1, swamp: 1 },
    neutralTowns: [3, 3],
    middleZones: 13,
    townsBesideStarts: true,
    secondaryShare: [0.14, 0.2],
  },
  factions: ["humans", "goblins"],
  setup:
    "You as The Realm in the north-east, The Goblin Horde (computer) in the south-west; pick any faction and the computer takes the other.",
  edits: [
    // Names: one neutral town of each faction the starts are not.
    {
      op: "set",
      id: "town-3",
      at: [8, 15],
      data: { faction: "candy", name: "Treacle Hollow" },
      note: "Name the north-western neutral town, past the snow and below the sugar meadow; a Candy Kingdom town.",
    },
    {
      op: "set",
      id: "town-4",
      at: [57, 24],
      data: { faction: "undead", name: "Margin's End" },
      note: "Name the neutral town beside the Realm's start, between the jungle and the desert; a Restless town (never the faction of the start beside it).",
    },
    {
      op: "set",
      id: "town-5",
      at: [21, 38],
      data: { faction: "humans", name: "Compass Rose" },
      note: "Name the neutral town beside the Horde's start, under the snow; a Realm town.",
    },
    // The sugar meadow's open middle: a guarded bag.
    {
      op: "add",
      id: "mystery-bag-candy",
      type: "mystery-bag",
      at: [22, 7],
      data: { grade: "wonder", value: 5000 },
      note: "A Mystery Bag holding a Wonder in the open middle of the sugar meadow, which the generator left bare.",
    },
    {
      op: "guard",
      id: "monster-candy-bag",
      at: [22, 8],
      creature: "gummy-bear",
      count: 4,
      value: 5000,
      guards: ["mystery-bag-candy"],
      note: "Four gummy bears sit on it (fight value 3428, 69% of 5000): the Candy Kingdom's own guard.",
    },
    // A find beside each start's road, the same for both.
    {
      op: "add",
      id: "event-tile-northeast",
      type: "event-tile",
      at: [57, 12],
      data: {
        text: "A page torn from the Cartographer's atlas lies by the road, pinned under a purse. On it every land in the world is drawn side by side.",
        prize: { gold: 750, wood: 5 },
        value: 1250,
      },
      note: "First-week find beside the north-eastern road, 0.3 days out.",
    },
    {
      op: "add",
      id: "event-tile-southwest",
      type: "event-tile",
      at: [12, 52],
      data: {
        text: "A page torn from the Cartographer's atlas lies by the road, pinned under a purse. On it every land in the world is drawn side by side.",
        prize: { gold: 750, wood: 5 },
        value: 1250,
      },
      note: "The same find beside the south-western road, 0.3 days out.",
    },
    // The contested middle.
    {
      op: "add",
      id: "event-tile-hold",
      type: "event-tile",
      at: [34, 37],
      data: {
        text: "The Cartographer's last surveyor still measures the Warlord's Hold and will not be interrupted. His clockwork chainmen see to that.",
        prize: { gold: 2000, xp: 1500 },
        guard: [{ creature: "winder", count: 14 }],
        value: 3950,
      },
      note: "A guarded event below the Hold: 14 winders (2870) for 2000 gold and 1500 experience.",
    },
    // Signs: one on each start's road, one at each wild land's way in.
    {
      op: "add",
      id: "sign-northeast",
      type: "sign",
      at: [58, 18],
      data: {
        text: "South-west: the desert and its twin oasis lakes, the Sphinx and the Pyramid. South, past the steppe: the lava fields and the Infernal Forge.",
      },
      note: "A signpost on the north-eastern road.",
    },
    {
      op: "add",
      id: "sign-southwest",
      type: "sign",
      at: [12, 55],
      data: {
        text: "North: Compass Rose, and past it the snow. East: the swamp, where the Witch keeps a hut and the Hag a cauldron.",
      },
      note: "A signpost on the south-western road.",
    },
    {
      op: "add",
      id: "sign-snow",
      type: "sign",
      at: [6, 43],
      data: {
        text: "THE FROZEN WEST. The Frost Giant's Barrow, the Aurora Spire and the walruses' rookery. Wrap up.",
      },
      note: "A sign on the road north into the snow.",
    },
    {
      op: "add",
      id: "sign-desert",
      type: "sign",
      at: [46, 26],
      data: {
        text: "THE DESERT. Two lakes, one oasis, one Sphinx with one riddle, and a Pyramid whose king does not take visitors.",
      },
      note: "A sign where the road enters the desert.",
    },
    {
      op: "add",
      id: "sign-swamp",
      type: "sign",
      at: [15, 64],
      data: {
        text: "THE SWAMP. Mind the leeches. The Drowned Temple is deeper in, and the Witch's Hut is on stilts for a reason.",
      },
      note: "A sign where the road enters the swamp.",
    },
    {
      op: "add",
      id: "sign-candy",
      type: "sign",
      at: [17, 16],
      data: {
        text: "North: the sugar meadow of the Candy Kingdom, its Gingerbread Cottage, its Sugar Fountain and its Sweet Shop. Do not lick the hills.",
      },
      note: "A sign on the road north towards the candy meadow.",
    },
    {
      op: "add",
      id: "sign-hold",
      type: "sign",
      at: [37, 33],
      data: {
        text: "The Warlord's Hold: the middle of the Cartographer's sheet, where he spilled the ink.",
      },
      note: "A sign beside the Hold.",
    },
    // Fair starts: the Realm's start reached more guarded things within two
    // days (71200 fight value against 58800).
    {
      op: "add",
      id: "loose-artifact-umbrella",
      type: "loose-artifact",
      at: [23, 42],
      data: { artifact: "umbrella-of-state", value: 6000 },
      note: "An Umbrella of State on the steppe east of Compass Rose, 1.5 days from the Horde's start.",
    },
    {
      op: "guard",
      id: "monster-umbrella",
      at: [23, 41],
      creature: "sexton",
      count: 11,
      value: 6000,
      guards: ["loose-artifact-umbrella"],
      note: "Its guard: 11 sextons (4422).",
    },
  ],
};

export const NAMED_MAPS: readonly NamedMapDef[] = [
  KEEPERS_TOLL,
  HOURGLASS_MARCHES,
  NINEFOLD_LANDFALL,
  CARTOGRAPHERS_FOLLY,
];
