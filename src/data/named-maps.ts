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
      op: "add",
      id: "keymasters-tent-red",
      type: "keymasters-tent",
      at: [16, 22],
      data: { colour: "red" },
      note: "The red key inside the Hold's ring, past the tin titans: 2.8 days from the north-west start, 3.0 from the south-east.",
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
      id: "monster-52",
      at: [25, 16],
      data: { creature: "tin-titan", count: 13 },
      note: "The Hold's northern pass is held by tin titans like its southern one, as the intro says (31 fire-eaters, 12028, to 13 titans, 11674).",
    },
    // The Marvel piece in the dead-end cleft south of the Hold.
    {
      op: "remove",
      id: "sealed-box-1",
      at: [20, 38],
      note: "The sealed box in the cleft makes way for the Marvel piece.",
    },
    {
      op: "remove",
      id: "school-shrine-6",
      at: [20, 36],
      note: "The shrine at the cleft's mouth would stand in the titans' zone of control; the map keeps seven others.",
    },
    {
      op: "remove",
      id: "monster-38",
      at: [20, 35],
      note: "The shrine's guard goes with it.",
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
      op: "guard",
      id: "monster-sand",
      at: [20, 37],
      creature: "tin-titan",
      count: 9,
      value: 9000,
      guards: ["loose-artifact-sand"],
      note: "A strong guard at the cleft's mouth: 9 tin titans (fight value 8082, for a piece of a 20000 Marvel).",
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
    {
      op: "add",
      id: "loose-artifact-nook",
      type: "loose-artifact",
      at: [11, 24],
      data: { artifact: "watering-can", value: 4000 },
      note: "The north-west start had four fewer guarded prizes within two days than the south-east (guards 20076 against 24565): a Watering Can in the dead-end nook south of its ore pit, 1.3 days out.",
    },
    {
      op: "guard",
      id: "monster-nook",
      at: [11, 23],
      creature: "groundskeeper",
      count: 13,
      value: 4000,
      guards: ["loose-artifact-nook"],
      note: "Its guard: 13 groundskeepers (2964).",
    },
    // Event tiles and signs near each start, mirrored.
    {
      op: "add",
      id: "event-tile-nw",
      type: "event-tile",
      at: [3, 18],
      data: {
        text: "A crate stamped by a world that sank bobs in a ditch beside the road.",
        prize: { gold: 500, wood: 5 },
        value: 1000,
      },
      note: "A first-week find on the north-west road, 0.63 days out.",
    },
    {
      op: "add",
      id: "event-tile-se",
      type: "event-tile",
      at: [26, 39],
      data: {
        text: "A crate stamped by a world that sank lies split open on the road.",
        prize: { gold: 500, wood: 5 },
        value: 1000,
      },
      note: "The same find on the south-east road, 0.57 days out.",
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
      at: [29, 38],
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
    {
      op: "remove",
      id: "tollhouse-2",
      at: [13, 25],
      note: "Two tollhouses on a medium map: the one beside the Hold goes.",
    },
    {
      op: "add",
      id: "trading-post-hold",
      type: "trading-post",
      at: [13, 25],
      note: "A trading post in its place (the map had none).",
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
      op: "add",
      id: "border-gate-blue-east",
      type: "border-gate",
      at: [30, 7],
      data: { colour: "blue" },
      note: "Close the valley's east mouth with a second blue gate: the valley is now entered only through blue gates.",
    },
    {
      op: "remove",
      id: "quiet-yard-1",
      at: [27, 4],
      note: "The small quiet yard in the valley makes room for the vault.",
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
      at: [61, 8],
      note: "The generated blue tent sat a day from the eastern start: it moves.",
    },
    {
      op: "add",
      id: "keymasters-tent-blue",
      type: "keymasters-tent",
      at: [39, 43],
      data: { colour: "blue" },
      note: "The blue key beside the Hold, past the titan-sized pass guards: start, tent, gate totals 5.5, 5.1 and 5.6 days.",
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
    // The Marvel piece in the cleft south of the Hold.
    {
      op: "remove",
      id: "chest-6",
      at: [35, 50],
      note: "The chest in the dead-end cleft south of the Hold makes way for a Marvel piece.",
    },
    {
      op: "add",
      id: "loose-artifact-sand",
      type: "loose-artifact",
      at: [35, 50],
      data: { artifact: "a-pinch-of-sand", value: 6000 },
      note: "A Pinch of Sand in the cleft.",
    },
    {
      op: "set",
      id: "monster-70",
      at: [34, 49],
      data: {
        creature: "beanstalk-giant",
        count: 5,
        value: 9000,
        guards: ["loose-artifact-sand"],
      },
      note: "A strong guard at the cleft's mouth: 5 beanstalk giants (fight value 8535) instead of 8 notaries.",
    },
    {
      op: "add",
      id: "sign-sand",
      type: "sign",
      at: [36, 44],
      data: {
        text: "South, past the prison: a beanstalk giant sits on a Pinch of Sand and will not move for anyone polite.",
      },
      note: "Point at the Marvel cleft.",
    },
    {
      op: "set",
      id: "seer-hut-5",
      at: [32, 36],
      data: { reward: { artifacts: ["the-upper-bulb"] }, value: 6000 },
      note: "The seer in the Hold's ring pays the Upper Bulb (it paid a Leaky Bucket).",
    },
    // A find on each start's road, the same for all three.
    {
      op: "add",
      id: "event-tile-south",
      type: "event-tile",
      at: [38, 58],
      data: {
        text: "A cart from some ended world lies tipped in the ditch, its mule long gone.",
        prize: { gold: 750, ore: 5 },
        value: 1500,
      },
      note: "First-week find on the southern road, 0.48 days out.",
    },
    {
      op: "add",
      id: "event-tile-northwest",
      type: "event-tile",
      at: [16, 28],
      data: {
        text: "A cart from some ended world lies tipped in the ditch, its mule long gone.",
        prize: { gold: 750, ore: 5 },
        value: 1500,
      },
      note: "The same find on the north-western road, 0.50 days out.",
    },
    {
      op: "add",
      id: "event-tile-east",
      type: "event-tile",
      at: [65, 30],
      data: {
        text: "A cart from some ended world lies tipped in the ditch, its mule long gone.",
        prize: { gold: 750, ore: 5 },
        value: 1500,
      },
      note: "The same find on the eastern road, 0.49 days out.",
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
        text: "East: Sexton's Rest. South: the red gate; its key hangs in a tent past the lurkers.",
      },
      note: "A signpost on the north-western road, pointing at the generated red key puzzle.",
    },
    {
      op: "add",
      id: "sign-east",
      type: "sign",
      at: [68, 24],
      data: {
        text: "South: Bangwhistle, loudest town on the Marches. West: the Hold, ringed with walruses.",
      },
      note: "A signpost on the eastern road.",
    },
    // The contested middle.
    {
      op: "add",
      id: "event-tile-sentry",
      type: "event-tile",
      at: [43, 42],
      data: {
        text: "A Keeper sentry, still winding itself after a thousand years, challenges you for the password.",
        prize: { gold: 2000, xp: 1500 },
        guard: [{ creature: "winder", count: 14 }],
        value: 3950,
      },
      note: "A guarded event beside the Hold: 14 winders (2870) for 2000 gold and 1500 experience.",
    },
    // The north-west start's road ran straight to the Hold (2.21 days
    // against 2.66 and 2.65): a fallen tree makes it step off the road.
    {
      op: "ground",
      cells: [[21, 24]],
      obstacle: "forest",
      note: "A tree down across the north-western road to the Hold: the north-west start's way to the Hold grows from 2.21 to 2.47 days; the others do not change.",
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
