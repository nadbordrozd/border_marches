// Picks and verdicts of the icon sets (bead border_marches-bzc.17), and
// the outputs they derive. For each recipe: the accepted take per content
// id with its reason, and specific reasons for notable rejects; every
// other take is rejected as a spare. Running it records the verdicts (the
// accepts through `studio-art.mjs accept`, which writes the masters),
// rewrites each icon set's outputs[] from the picks, and leaves `bake` to
// the caller.
//
//   node art/review/icon-picks.mjs && node tools/art/studio-art.mjs bake
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SPARE = "spare take: its subject is covered by a clearer accepted take of this recipe";

/** set -> recipe -> { picks: { id: [candidate, reason] }, notes: { candidate: reason } } */
export const PICKS = {
  "icons-spells": {
    // bead border_marches-bzc.159: the naval spells and Seafaring (NAVAL 7)
    "naval-a": {
      picks: {
        "call-the-boat": [2, "a tan rowing boat with a blue sail and a brass hand bell over it; the bell says it is being called"],
        "scuttle": [11, "a light wooden boat going down nose up with a hole and bubbles; the pale wood stays visible on a dark panel"],
        "lily-road": [27, "bright lily pads with a pink water lily, crisp on light and dark"],
        "fair-wind": [32, "a full white sail with a blue swirl behind it: wind in a sail, not Gust's cloud"],
        "tidal-wave": [44, "a big curling blue wave with a white crest"],
        "skill:seafaring": [57, "a golden-brown ship's wheel whose spokes show on dark; not the Trailcraft compass"],
      },
      notes: { 54: "dark wheel sinks on a dark panel", 56: "dark wheel sinks on a dark panel", 58: "dark wheel sinks on a dark panel", 63: "dark wheel sinks on a dark panel" },
    },
    "bloom-a": {
      picks: {
        poultice: [0, "rolled bandage with a herb leaf, clear at 1x"],
        thornskin: [1, "thorny vine ring, crisp outline"],
        nettle: [2, "nettle sprig with a poison drop"],
        feed: [3, "seed sack with a leaf, reads as plant food"],
        regrow: [4, "stump with a fresh shoot"],
        sprout: [5, "seed with a two-leaf sprout"],
        "bramble-row": [6, "thorny bramble tangle, readable on dark"],
        ripen: [7, "glossy red apple"],
        "orchard-day": [13, "round fruit tree, apples visible at 1x"],
        "second-spring": [15, "pink blossom with leaves"],
      },
    },
    "accord-a": {
      picks: {
        scapegoat: [0, "white goat with a blue rope, full body (the condition uses the head)"],
        "close-ranks": [1, "overlapping blue shields"],
        "change-places": [2, "two chasing blue arrows"],
        share: [3, "loaf broken in two"],
        "sign-here": [5, "contract, quill and red seal"],
        "soft-words": [6, "pink speech bubble with a heart"],
        "sanctuary-oath": [7, "raised hand on a blue shield"],
        "take-heart": [15, "red heart with a sword"],
        "change-of-heart": [61, "heart split red and blue, unbroken outline"],
        "the-long-table": [23, "banquet table with plates"],
      },
    },
    "hush-a": {
      picks: {
        "hush-now": [0, "bow with a snapped string"],
        "on-credit": [11, "coin stack with a purple tag"],
        "bad-omen": [12, "black crow with purple eyes; plum frame and purple eyes keep it visible on dark"],
        "pass-on": [13, "dark potato giving off purple smoke"],
        lullaby: [4, "sleepy moon in a nightcap"],
        "second-shift": [5, "hooded ghost with a lantern"],
        "leech-line": [6, "leech hanging from a purple rope"],
        "curtain-call": [7, "skeletal hand with a rose"],
        "pea-soup": [18, "pea soup in a light bowl, readable on dark"],
        "everybody-up": [9, "open coffin with purple light"],
      },
      notes: { 3: "bare black lump, no smoke: reads as a stone", 23: "bare black lump, no smoke: reads as a stone", 63: "bare black lump, no smoke: reads as a stone", 8: "dark bowl vanishes on a dark panel" },
    },
    "storm-a": {
      picks: {
        jolt: [0, "crackling spark ball"],
        gust: [1, "puffing cloud blowing wind"],
        hothead: [2, "flaming iron helmet"],
        "set-off": [3, "bomb with a lit fuse"],
        broadside: [4, "explosion burst with smoke"],
        "cold-snap": [5, "big snowflake"],
        downpour: [6, "rain cloud"],
        wildfire: [7, "tall flame"],
        whiteout: [18, "wind swirl full of snowflakes, reads as a blizzard"],
        "the-sky-falls": [9, "flaming meteor"],
      },
    },
    "adventure-a": {
      picks: {
        "green-road": [0, "leafy arch over a dirt path"],
        "second-helping": [1, "ladle over a full bowl"],
        parley: [2, "handshake"],
        "read-the-seal": [3, "magnifier over a red seal"],
        "borrowed-day": [4, "sun with a key"],
        "saved-hour": [5, "piggy bank with an hourglass"],
        "ask-the-dead": [6, "skull with an ear trumpet"],
        dowse: [7, "dowsing rod with sparkles"],
        "tow-line": [8, "rope with a grappling hook and spark"],
        "opening-salvo": [9, "cannon firing"],
      },
    },
    "clock-a": {
      picks: {
        "first-bell": [0, "shiny gold hand bell, ringing"],
        "late-bell": [27, "grey bell with a visible cobweb"],
        appointment: [2, "brass alarm clock"],
        wind: [3, "brass wind-up key"],
        treacle: [4, "jar of treacle dripping"],
        "quick-march": [5, "red drum with sticks"],
        encore: [6, "red curtain with a gold star"],
        "forced-march": [7, "winged marching boots"],
        deadline: [8, "hourglass with red sand nearly run out"],
        "double-time": [9, "swinging metronome"],
      },
    },
  },
  "icons-artifacts": {
    // bead border_marches-bzc.159: the eight sea artifacts (NAVAL 7.4)
    "sea-a": {
      picks: {
        "captains-tricorne": [5, "navy tricorne with gold braid and a tall white feather, readable on dark"],
        "brass-sextant": [14, "bright brass arc frame with its little scope; unlike the Spyglass tube"],
        "mermaids-comb": [16, "pink shell comb with a pearl"],
        "ship-in-a-bottle": [20, "a corked bottle on its side with a white-sailed ship inside"],
        "ships-anchor": [37, "chunky blue-grey anchor wound with rope, thick enough to read on dark"],
        "conch-of-the-deep": [44, "spiral conch with a glossy pink mouth"],
        "the-drowned-mans-locket": [61, "silver oval locket wrapped in pale seaweed; not the gold Sealing-Wax Locket"],
      },
      notes: { 48: "a near copy of the Tin Sabre", 50: "a near copy of the Tin Sabre", 51: "too close to the Tin Sabre", 52: "a near copy of the Tin Sabre", 53: "a scarf without a sword", 54: "the bandana is skewered on the blade", 58: "a bandana without a sword", 59: "a bandana without a sword" },
    },
    // bead border_marches-bzc.159: a re-roll of the Corsair's Cutlass
    "sea-cutlass-b": {
      picks: {
        "corsairs-cutlass": [9, "two crossed broad cutlasses tied with a red knot: pirate steel, plainly not the single Tin Sabre"],
      },
      notes: { 0: "a gold shell lamp: no blade", 2: "a near copy of the Tin Sabre", 14: "a bandana skewered on the blade", 1: "crossed cutlasses without the red knot" },
    },
    "trinkets-a": {
      picks: {
        "tin-sabre": [0, "plain curved grey sabre"],
        "parade-sword": [11, "straight sword with gold guard and red tassel"],
        "ringmasters-whip": [7, "coiled red-and-white whip"],
        "pot-lid": [3, "round grey pot lid with a knob"],
        "tollgate-door": [32, "square banded wooden door"],
        "manhole-cover": [5, "dark round grated cover"],
        "reading-glasses": [21, "round gold-rimmed glasses"],
        "thinking-cap": [6, "blue hat with a yellow star, no face"],
      },
      notes: {
        56: "blank: the take is empty",
        31: "thinking cap drawn with a face under it",
        39: "thinking cap drawn with a face under it",
        47: "thinking cap drawn with a face under it",
        55: "thinking cap drawn with a face under it",
        63: "thinking cap drawn with a face under it",
      },
    },
    "trinkets-b": {
      picks: {
        "second-best-breastplate": [0, "steel breastplate, clear plates"],
        "star-chart-robe": [18, "starry blue robe with gold trim"],
        "sprig-pendant": [2, "necklace with a green sprig"],
        "sealing-wax-locket": [3, "gold locket with a red seal"],
        "fob-chain": [4, "gold chain with a tiny watch"],
        "mourning-brooch": [5, "black oval brooch with a purple gem"],
        "lightning-glass-bead": [6, "big glowing glass bead pendant"],
        "four-leaf-buttonhole": [11, "clover on a red rosette"],
        "regimental-sash": [19, "red sash with gold medals"],
        "clerks-cape": [9, "grey cape with a quill pinned on"],
        "oilskin-of-deep-pockets": [39, "yellow oilskin with pockets"],
      },
    },
    "wonders-a": {
      picks: {
        "winters-pocket-watch": [0, "frosted pale blue pocket watch"],
        "sextons-spade": [1, "dark iron spade"],
        "the-bellhops-cap": [2, "red cap with a gold band"],
        tinderbox: [3, "tin box with flint and spark"],
        "watering-can": [4, "green watering can"],
        "gardeners-apron": [5, "green apron with a trowel"],
        "thornmail-vest": [6, "thorny green vest"],
        "hedge-clipper-shears": [7, "garden shears"],
        "cider-flask": [8, "clay flask with an apple"],
        "notarys-seal": [9, "seal stamp with a blue handle"],
      },
    },
    "wonders-b": {
      picks: {
        "umbrella-of-state": [3, "red and gold royal umbrella"],
        "lightning-rod": [17, "rod with a bright spark, thickest take"],
        "pressed-olive-branch": [10, "olive branch with olives"],
        "drum-majors-baton": [11, "silver baton with a gold ball"],
        "metronome-spurs": [12, "pair of star-wheel spurs"],
        "bailiffs-greatcoat": [13, "long grey greatcoat with brass buttons"],
        "felt-slippers-of-the-night-shift": [14, "blue felt slippers"],
        "bloodstone-ring": [23, "silver ring with a dark red stone"],
        "leaky-bucket": [6, "bucket leaking water"],
        "whetstone-pendant": [7, "pendant with a little sword"],
      },
    },
    "cursed-marvels-a": {
      picks: {
        "the-albatross": [16, "albatross with a rope round its neck"],
        "coat-of-embers": [1, "dark red coat with embers"],
        "iou-pad": [2, "notepad with a pencil"],
        "sleeping-cap-of-the-night-watch": [3, "striped nightcap with a pompom"],
        "ball-and-chain": [4, "iron ball and chain, grey highlights keep it visible on dark"],
        "the-thirteenth-chime": [5, "grandfather clock"],
        "the-second-left-glove": [6, "glove with magic sparkles"],
        "the-hourglass-with-no-bottom": [7, "gold hourglass pouring sand out of its base"],
        "treaty-ink": [22, "ink bottle with a quill"],
        "the-unspent-page": [63, "glowing golden page, the only take of it"],
      },
    },
    "pieces-a": {
      picks: {
        "the-gloves-thumb": [0, "gold armoured glove with a gem"],
        "the-gloves-lining": [1, "folded red silk lining"],
        "the-odd-cufflink": [2, "gold cufflink with a red gem"],
        "a-pinch-of-sand": [5, "glittering heap of gold sand"],
        "the-quill": [6, "quill dipped in blue ink"],
        "the-blotter": [7, "rocker blotter with a brass knob"],
        "the-unsigned-treaty": [13, "blank scroll"],
        "the-torn-corner": [14, "torn page corner"],
        "bookbinders-thread": [22, "spool of red thread with a needle"],
        "the-missing-page": [23, "loose glowing page"],
      },
      notes: Object.fromEntries([3, 4, 8, 9, 16, 27, 36, 40, 44, 56].map((n) => [n, "a whole hourglass, not one bulb: the Upper and Lower Bulb would look the same; re-rolled in pieces-b"])),
    },
    "pieces-b": {
      picks: {
        "the-upper-bulb": [0, "a single glass bulb of sand with a gold cap"],
        "the-lower-bulb": [13, "a bowl of sand on a gold foot, unlike the upper bulb"],
      },
    },
    "consumables-a": {
      picks: {
        "bottled-cheer": [0, "round bottle of pink fizz"],
        "jar-of-fair-chances": [1, "jar with a clover"],
        "blue-tonic": [2, "tall blue bottle"],
        "road-cordial": [3, "orange hip flask"],
        "fire-eaters-draught": [4, "red potion with a flame"],
        "witch-hazel": [5, "green bottle with a leaf"],
        "late-harvest-cordial": [6, "golden bottle with wheat"],
        "elixir-of-hindsight": [7, "purple bottle with an eye"],
        "dog-eared-map": [9, "folded map"],
        "letter-of-safe-conduct": [21, "sealed envelope"],
        "signal-lantern": [22, "glowing brass lantern"],
        "collapsible-shovel": [23, "small shovel"],
      },
    },
    "trinkets-c": {
      picks: {
        "knuckle-dusters": [0, "brass knuckle dusters"],
        "signet-of-the-minor-office": [1, "gold ring with a blue stone"],
        "moneylenders-ring": [2, "fat flat-topped gold ring, unlike the signet's stone"],
        "seven-furlong-boots": [3, "tall buckled boots"],
        "sensible-shoes": [4, "plain brown shoes"],
        galoshes: [6, "yellow galoshes"],
        "lucky-penny": [7, "copper penny"],
        "brass-bugle": [11, "brass bugle"],
        spyglass: [12, "brass spyglass"],
        "thermos-of-strong-tea": [13, "green thermos with a cup lid"],
        "scholars-bookmark": [22, "red ribbon bookmark with a gold tassel"],
      },
    },
    // bead border_marches-bzc.112 (verdicts recorded with studio-art accept/reject)
    "wonders-candy-a": {
      picks: {
        "flypaper-ribbon": [4, "a curling yellow flypaper strip from a red cap with a grey fly stuck on it; reads at 1x on light and dark and is plainly not the pink-taffy Stuck icon"],
      },
    },
    // bead border_marches-bzc.131 (verdicts recorded with studio-art accept/reject); wired in bzc.135
    "wonders-dwarves-a": {
      picks: {
        "pocket-boiler": [9, "a round copper boiler with brass bands, a glowing firebox door, a brass chimney with a white puff and a leather strap: a carried boiler at 1x on light and dark, plainly not the Steam cloud icon"],
      },
    },
    // bead border_marches-9is
    "relics-a": {
      picks: {
        keystone: [8, "wedge of carved sandstone with a gold gem: reads as a precious stone block at 1x"],
      },
      notes: {
        ...Object.fromEntries([4, 5, 6, 7, 12, 13, 14, 15, 20, 21, 22, 23, 28, 29, 30, 31, 36, 37, 38, 39, 44, 45, 46, 47, 52, 53, 54, 55, 60, 61, 62, 63].map((n) => [n, "gold-banded block reads as a bucket or a pot, not a stone"])),
        ...Object.fromEntries([3, 11, 19, 27, 35, 43, 51, 59].map((n) => [n, "pale grey slab with a flame-shaped gem reads as a candle or a tombstone"])),
      },
    },
  },
  "icons-conditions": {
    "conditions-a": {
      picks: {
        venomed: [4, "plain green poison drop, simplest silhouette"],
        lucky: [9, "four-leaf clover"],
        mending: [17, "heart wrapped in a leafy bandage"],
        thorned: [24, "spiky thorn ball"],
        ripening: [32, "golden wheat ear"],
        turned: [40, "white flag on a stick"],
        heartened: [48, "winged red heart"],
        scapegoat: [56, "goat head"],
      },
    },
    "conditions-b": {
      picks: {
        shielded: [0, "round blue shield"],
        warded: [9, "pale blue protective dome"],
        mollified: [2, "soft white feather"],
        delayed: [11, "grey snail"],
        hastened: [4, "running yellow rabbit"],
        quickened: [13, "blue wing"],
        slowed: [14, "pale blue tortoise"],
        asleep: [46, "sleeping cloud, no letters"],
        shaken: [23, "scared pale ghost"],
      },
      notes: { 52: "sleeping cloud drawn with Z letters" },
    },
    "conditions-c": {
      picks: {
        reckoning: [8, "purple bill with a dark seal"],
        hushed: [16, "quiver tied shut with a purple bow"],
        burning: [32, "single orange flame"],
        frozen: [40, "ice cube with a clean outline"],
        drenched: [48, "big blue water drop"],
        "fired-up": [56, "red fist in flames"],
      },
      notes: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((n) => [n, "black cat nearly vanishes on a dark panel; re-rolled lighter as jinxed in conditions-d"])),
    },
    "conditions-a-16": {
      picks: {
        venomed: [1, "plain green drop at 16 px"],
        lucky: [15, "bright clover, readable on dark"],
        mending: [18, "red heart with a green leaf"],
        thorned: [24, "spiky green ball"],
        ripening: [33, "golden wheat ear"],
        turned: [42, "white flag on a stick"],
        heartened: [48, "winged heart"],
        scapegoat: [56, "goat head, front view"],
      },
    },
    "conditions-b-16": {
      picks: {
        shielded: [8, "blue shield with a boss at 16 px"],
        warded: [5, "pale blue bubble"],
        mollified: [14, "white feather"],
        delayed: [24, "grey snail"],
        hastened: [28, "running rabbit"],
        quickened: [32, "blue wing"],
        slowed: [40, "pale tortoise"],
        asleep: [45, "sleeping cloud without letters"],
        shaken: [60, "scared ghost"],
      },
      notes: Object.fromEntries([48, 49, 50, 51].map((n) => [n, "sleeping cloud drawn with Z letters"])),
    },
    "conditions-c-16": {
      picks: {
        jinxed: [24, "black cat whose big yellow eyes carry it on a dark panel"],
        reckoning: [1, "purple bill with a seal"],
        hushed: [2, "purple bow"],
        leeched: [19, "S-shaped leech"],
        burning: [4, "orange flame"],
        frozen: [5, "ice cube"],
        drenched: [6, "water drop"],
        "fired-up": [31, "flaming fist, upright"],
      },
    },
    "conditions-d": {
      picks: {
        jinxed: [9, "grey cat with yellow eyes and a light chest, visible on dark"],
        leeched: [44, "crimson leech with a pink belly, visible on dark"],
      },
    },
    "grounds-a": {
      picks: {
        rock: [1, "angular grey boulder, reads as rock not a ball"],
        corpse: [5, "helmet and broken spear"],
        bones: [13, "skull on a pile of bones"],
        wreck: [20, "broken gears and planks"],
        fire: [33, "several flames, unlike the single Burning flame"],
        brambles: [44, "knot of thorny brambles"],
        mist: [54, "grey mist wisps, visible on a light panel"],
      },
      notes: { 22: "white mist nearly vanishes on a light panel", 60: "white mist nearly vanishes on a light panel", 61: "white mist nearly vanishes on a light panel" },
    },
    // bead border_marches-9is
    "conditions-e": {
      picks: {
        sworn: [34, "crossed swords tied by a big blue bow: an oath, not a fight; clear on dark"],
        challenged: [6, "thrown steel gauntlet with spread fingers and a blue cuff"],
        "demo-guard": [9, "knight's helmet with a blue plume, visor reads at 1x"],
        "ground:sweets": [15, "compact heap of wrapped candies in three colours"],
      },
      notes: Object.fromEntries([0, 1, 3, 16, 18, 19, 32, 33, 49, 51].map((n) => [n, "crossed swords without the ribbon: a generic battle sign, not an oath"])),
    },
    "conditions-e-16": {
      picks: {
        sworn: [48, "crossed swords over a bold blue ribbon band: the clearest X at 16 px"],
        "demo-guard": [61, "helmet with a blue plume, crisp visor slit at 16 px"],
      },
      notes: Object.fromEntries([3, 11, 19, 27, 35, 43, 51, 12, 20, 28, 36, 44, 52, 50].map((n) => [n, "all-grey upright gauntlet without the blue cuff of the 32 px Challenged icon (re-rolled as conditions-f-16)"])),
    },
    "conditions-f-16": {
      picks: {
        challenged: [18, "open gauntlet with a blue cuff, tilted like the 32 px icon; fingers read at 16 px"],
      },
    },
    // bead border_marches-bzc.112
    "conditions-g": {
      picks: {
        stuck: [2, "a boot lifting off with pink taffy strings pulling it back: 'cannot leave' at a glance, clear on light and dark, no gold to clash with the Clock frame"],
      },
      notes: Object.fromEntries([6, 14, 22, 24, 34, 39, 50, 51, 62].map((n) => [n, "a bare boot with no taffy: reads as Movement or a boot item, not Stuck"])),
    },
    "conditions-g-16": {
      picks: {
        stuck: [61, "upright boot in a big pink taffy puddle: the pink carries the badge on a dark panel where the brown boot sinks"],
      },
      notes: Object.fromEntries([23, 27, 30, 37, 41, 42, 43].map((n) => [n, "a pink blob without the boot: reads as a gumdrop, not a held foot"])),
    },
    // bead border_marches-bzc.131: Steam (a condition) and the shell marker
    // (kind "marker": public/assets/icons/markers and markers-16, MARKER_ICONS
    // in src/assets/icons.ts; not a catalogue content kind).
    "conditions-h": {
      picks: {
        steam: [16, "a big white steam cloud from a brass elbow pipe: steam at a glance on light and dark, the same idea as the 16 px badge, white and brass clear of the red Storm frame"],
        "marker:shell": [53, "a brass shell with dark fins landing nose down in a red and white target ring: 'a shell lands here', plainly not the Horde's round black bomb"],
      },
      notes: Object.fromEntries([
        ...[0, 1, 2, 3, 8, 9, 10, 11].map((n) => [n, "a brass whistle on a U pipe: reads as a plumbing fitting before steam (spare)"]),
        ...[4, 5, 6, 7, 12, 13, 14, 15].map((n) => [n, "a diagonal brass whistle blowing a puff: clear, but at 16 px the same idea reads as a horn, so the badge and icon use the cloud-from-pipe instead (spare)"]),
        ...[32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47].map((n) => [n, "a falling brass shell alone: reads as a bullet, and at 16 px as a pencil; the target ring says where it lands (spare)"]),
      ]),
    },
    "conditions-h-16": {
      picks: {
        steam: [24, "a white steam cloud over a brass elbow pipe: the one 16 px Steam that reads as steam rather than a horn"],
        "marker-16:shell": [53, "target ring with a brass shell coming down at an angle: reads as a hit marker; the upright-shell rings look like a red potion flask"],
      },
      notes: Object.fromEntries([
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => [n, "a brass whistle with a puff: at 16 px reads as a horn or a bird, not steam"]),
        ...[32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47].map((n) => [n, "a lone brass shell: reads as a bullet or a pencil at 16 px"]),
        ...[48, 49, 50, 51, 54, 56, 57, 58, 59, 60, 61, 62, 63].map((n) => [n, "a red ring with an upright shell (or none): reads as a red potion flask at 16 px"]),
      ]),
    },
  },
  "icons-heroes": {
    "emblems-a": {
      picks: {
        "school:bloom": [0, "green bud with leaves"],
        "school:accord": [9, "scroll with a blue ribbon"],
        "school:clock": [39, "brass clock with gears, unlike the Horology watch"],
        "school:hush": [4, "plum lantern with a candle"],
        "school:storm": [27, "red-orange lightning bolt"],
        "stat:attack": [12, "steel sword with a red hilt"],
        "stat:defense": [52, "round riveted steel shield"],
        "stat:power": [22, "wand with a purple star"],
        "stat:lore": [23, "blue book with gold corners"],
      },
    },
    "feats-a": {
      picks: {
        spillover: [0, "tipped cup spilling purple"],
        bonfire: [1, "crossed-log bonfire"],
        "long-echo": [2, "brass horn with sound rings"],
        gleaner: [3, "sickle with a wheat bundle"],
        "cold-hands": [4, "frosted pale glove"],
        "mob-rule": [5, "pitchfork and torch"],
        "double-or-nothing": [40, "spinning coin with motion arcs"],
        "seed-bombs": [7, "brown seed pod with a lit fuse"],
        "field-surgeon": [52, "plain brown doctor's bag"],
        "green-thumb": [57, "green thumbs-up"],
      },
      notes: { 53: "red cross emblem on the bag (protected emblem)", 54: "red cross emblem on the bag (protected emblem)", 55: "red cross emblem on the bag (protected emblem)" },
    },
    "feats-b": {
      picks: {
        "briar-patch": [8, "round bush with purple berries, readable on dark"],
        burr: [1, "spiky burr ball"],
        harvest: [2, "basket of apples and pears"],
        windfall: [4, "branch with falling apples"],
        "shield-wall": [5, "three round shields in a row"],
        "mirror-ward": [6, "hand mirror with a blue shine"],
        "peace-dividend": [7, "dove with a leaf"],
        quickstep: [53, "pair of red dancing shoes"],
        "pile-on": [39, "wooden mallet"],
      },
      notes: { 61: "a signpost, not a mallet" },
    },
    "feats-c": {
      picks: {
        "co-signer": [0, "two quills crossed over paper"],
        "compound-interest": [1, "coin stacks rising like stairs"],
        "gag-rule": [2, "iron padlock"],
        bloodletting: [3, "blood drop and knife"],
        "thicker-than-water": [4, "red drop beside a blue drop"],
        "soaked-powder": [5, "keg dripping water"],
        "chain-lightning": [6, "bolt between three blue balls"],
        firewalkers: [7, "bare foot on flames"],
        "blaze-of-glory": [15, "flaming sword"],
      },
    },
    "vows-a": {
      picks: {
        "vow-of-the-grave": [0, "tombstone with a purple candle"],
        "vow-of-the-still-air": [1, "empty corked jar"],
        "vow-of-the-pyre": [2, "torch in a fist"],
        "vow-of-the-opening": [3, "crowing rooster"],
        "vow-of-the-patient": [4, "fishing rod with a bobber"],
        "vow-of-silence": [5, "purple book with a lock strap"],
        "vow-of-the-borrowed-book": [6, "library book with a card"],
        "vow-of-the-unlettered": [7, "broken quill"],
        "vow-of-empty-pockets": [36, "empty pocket"],
        "vow-of-the-barefoot-pilgrim": [37, "pair of bare feet"],
        "vow-of-bare-hands": [30, "two bare fists"],
        "vow-of-flesh-and-blood": [15, "heart beside a gear"],
      },
    },
    "fallbacks-a": {
      picks: {
        "fallback:spell": [0, "scroll with a purple ribbon"],
        "fallback:artifact": [1, "small treasure chest"],
        "fallback:condition": [2, "grey smoke swirl"],
        "fallback:ground": [3, "dirt mound"],
        "fallback:skill": [4, "plain steel medal"],
        "fallback:feat": [31, "teal star"],
        "fallback:vow": [6, "lit candle"],
        "fallback:stat": [7, "grey gemstone"],
        "fallback:school": [8, "crystal ball on a stand"],
      },
    },
    "skills-a": {
      picks: {
        greencraft: [0, "trowel crossed with a leaf"],
        covenant: [1, "treaty scroll with a seal"],
        horology: [2, "open brass pocket watch"],
        quietus: [3, "candle snuffer over a purple candle"],
        stormcalling: [4, "storm cloud with a bolt"],
        onslaught: [6, "battle axe"],
        marksmanship: [7, "bow with a nocked arrow"],
        bulwark: [11, "riveted tower shield"],
        riposte: [12, "crossed rapiers"],
        "long-shadow": [13, "brass speaking horn with sound waves"],
        vanguard: [14, "red chess knight"],
        banner: [51, "red war banner with a gold top, reads as a standard"],
      },
    },
    "skills-b": {
      picks: {
        "lucky-streak": [0, "pair of dice"],
        "drill-sergeant": [1, "whistle on a red cord"],
        ambush: [2, "bush with peeking eyes"],
        wayfaring: [3, "travel backpack with a bedroll"],
        trailcraft: [4, "brass compass"],
        lookout: [41, "watchtower with no ground patch under it"],
        "deep-wells": [6, "stone well with blue water"],
        "quick-study": [7, "open book with a candle"],
        stewardship: [16, "gold coin purse with coins"],
        "silver-tongue": [17, "smiling silver mask"],
        packrat: [22, "rat with a bundle of scrolls"],
        wayfinder: [23, "treasure map with a red mark"],
      },
      notes: Object.fromEntries([5, 13, 37, 45].map((n) => [n, "watchtower stands on a grass patch (ground under the subject)"])),
    },
    // Bead border_marches-bzc.82: the hero screen's other stats.
    "stats-b": {
      picks: {
        "stat:mana": [0, "tall blue crystal with a white shine, apart from Lore's blue book"],
        "stat:movement": [25, "brown boot with a white wing clear of the heel"],
        "stat:experience": [42, "gold star with a shine, warmer than the teal feat fallback star"],
        "stat:level": [27, "full laurel wreath with a red ribbon"],
        "stat:sight": [28, "brass spyglass with a bright lens"],
        "stat:morale": [29, "bright red heart with a gold crown, readable on dark"],
        "stat:luck": [30, "gold horseshoe, open end up"],
        "stat:command": [36, "red marshal's baton with gold ends"],
        "stat:spellbook": [44, "purple spellbook, star on the cover, gold clasp"],
        "stat:scroll-case": [47, "leather scroll tube with a strap and a scroll in it"],
      },
      notes: {
        ...Object.fromEntries([18, 49, 58].map((n) => [n, "cyan crystal cluster or slab: reads as ice, not mana"])),
        ...Object.fromEntries([6, 21, 33, 45].map((n) => [n, "dark crimson heart sinks on a dark panel"])),
        54: "book stood on its spine: reads as a box, not a spellbook",
        53: "book lying open at an angle: the cover star is small at 1x",
        ...Object.fromEntries([55, 62].map((n) => [n, "upright tube reads as a bottle"])),
        59: "laurel with no ribbon and a gap: reads as two leaves",
        34: "stray sparkle pixels beside the star",
      },
    },
  },
};

const KIND_FOLDER = {
  spell: "spells",
  artifact: "artifacts",
  condition: "conditions",
  ground: "ground",
  skill: "skills",
  feat: "feats",
  vow: "vows",
  stat: "stats",
  school: "schools",
  fallback: "fallback",
  "condition-16": "conditions-16",
  marker: "markers",
  "marker-16": "markers-16",
};

function kindOf(set, recipeId, contentKey) {
  if (contentKey.includes(":")) return contentKey.split(":");
  const kind =
    set === "icons-spells" ? "spell"
    : set === "icons-artifacts" ? "artifact"
    : set === "icons-conditions" ? (recipeId.endsWith("-16") ? "condition-16" : recipeId.startsWith("grounds") ? "ground" : "condition")
    : recipeId.startsWith("skills") ? "skill"
    : recipeId.startsWith("feats") ? "feat"
    : recipeId.startsWith("vows") ? "vow"
    : "fallback";
  return [kind, contentKey];
}

const now = new Date().toISOString();
for (const [set, recipes] of Object.entries(PICKS)) {
  const dir = `art/sets/${set}`;
  const doc = JSON.parse(fs.readFileSync(`${dir}/recipes.json`, "utf8"));
  const records = JSON.parse(fs.readFileSync(`${dir}/records.json`, "utf8"));
  const verdictsFile = `${dir}/verdicts.json`;
  const outputs = [];
  for (const [recipeId, { picks, notes = {} }] of Object.entries(recipes)) {
    const record = records[recipeId];
    if (record?.status !== "DONE") throw new Error(`${set}/${recipeId} not generated`);
    const accepted = new Map(Object.values(picks).map(([n, reason]) => [n, reason]));
    for (const [contentKey, [n]] of Object.entries(picks)) {
      const [kind, id] = kindOf(set, recipeId, contentKey);
      const size = kind.endsWith("-16") ? 16 : 32;
      outputs.push({ path: `public/assets/icons/${KIND_FOLDER[kind]}/${id}.png`, from: `${recipeId}#${n}`, width: size, height: size });
    }
    let verdicts = fs.existsSync(verdictsFile) ? JSON.parse(fs.readFileSync(verdictsFile, "utf8")) : {};
    for (const [n, reason] of accepted) {
      if (verdicts[`${recipeId}#${n}`]?.verdict === "ACCEPTED") continue;
      const label = Object.entries(picks).filter(([, [m]]) => m === n).map(([k]) => k).join(", ");
      execFileSync(process.execPath, ["tools/art/studio-art.mjs", "accept", set, recipeId, String(n), "--notes", `${label}: ${reason}`], { stdio: "pipe" });
    }
    verdicts = JSON.parse(fs.readFileSync(verdictsFile, "utf8"));
    record.candidates.forEach((_, n) => {
      const key = `${recipeId}#${n}`;
      if (accepted.has(n) || verdicts[key] !== undefined) return;
      verdicts[key] = { verdict: "REJECTED", notes: notes[n] ?? SPARE, at: now };
    });
    fs.writeFileSync(verdictsFile, `${JSON.stringify(verdicts, null, 2)}\n`);
  }
  doc.outputs = outputs;
  fs.writeFileSync(`${dir}/recipes.json`, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`${set}: ${outputs.length} output(s)`);
}
