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

export interface NamedMapDef {
  id: string;
  name: string;
  /** One paragraph for the setup screen. */
  intro: string;
  size: MapSize;
  players: PlayerCount;
  seed: number;
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
      data: { name: "Tollbridge" },
      note: "Name the north-east neutral town after the toll gate beside it.",
    },
    {
      op: "set",
      id: "town-4",
      at: [12, 36],
      data: { name: "Low Barrow" },
      note: "Name the south-west neutral town (the generator's Thornbury repeats on other maps).",
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
      data: { name: "Bangwhistle" },
      note: "Name the south-eastern goblin town.",
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
      data: { name: "Sexton's Rest" },
      note: "Name the northern Restless town.",
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
  ],
};

export const NAMED_MAPS: readonly NamedMapDef[] = [
  KEEPERS_TOLL,
  HOURGLASS_MARCHES,
];
