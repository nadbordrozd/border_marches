/**
 * Every tunable number of the map generator, in one object.
 *
 * Distances are in cells unless the name says "cost" (movement points, as in
 * GAME_DESIGN.md section 7.1). Shares are fractions of the relevant area.
 * Object types, their values and guard strength live in the shared table in
 * src/data/mapObjects.ts.
 */
import { MAP_OBJECT_ROWS, RULE_ROWS } from "../../../data/mapObjects.ts";
import type { MapObjectRow, MapZoneKind } from "../../../data/mapObjects.ts";
import type { Terrain } from "../types.ts";

/**
 * Map sizes (bead bzc.147: the Heroes sizes). S 36x36, M 72x72 (the
 * default), L 108x108 and XL 144x144 are offered on the setup screen; SM
 * (48x48, "Small+") is the medium map of before, kept for The Keepers'
 * Toll and for tests written on it. M has the tuning the old 72x72 large
 * map had, so a seed makes the map it made at size L before.
 */
export type MapSize = "S" | "SM" | "M" | "L" | "XL";

/** Every map size, smallest first. */
export const MAP_SIZES: readonly MapSize[] = ["S", "SM", "M", "L", "XL"];

/** The same value for every map size. */
export function everySize<T>(value: T): Record<MapSize, T> {
  return { S: value, SM: value, M: value, L: value, XL: value };
}

/** Number of player starts a map can have. */
export type PlayerCount = 2 | 3 | 4;

/** One line of the start kit: what every player finds near home. */
export interface StartKitItem {
  /** Row id in src/data/mapObjects.ts. */
  row: string;
  count: number;
  /** Movement-cost window from the player's town, in days. */
  minDays: number;
  maxDays: number;
  /** May also go into a zone next to the start zone. */
  nextZone?: boolean;
}

export interface GenConfig {
  /** Side length per map size (maps are square). */
  sizes: Record<MapSize, number>;
  /** Player starts per size when the caller does not say. */
  players: Record<MapSize, PlayerCount>;
  /**
   * Middle zones per size and player count (inclusive range), the neutral
   * town zones among them; the Hold's zone in the centre comes on top.
   */
  middleZones: Record<MapSize, Record<PlayerCount, readonly [number, number]>>;
  /** Neutral towns per size (each in its own middle zone). */
  neutralTowns: Record<MapSize, readonly [number, number]>;

  zones: {
    /** Domain warp of the zone Voronoi, as a fraction of the zone radius. */
    warp: number;
    /** Feature size of the warp noise, as a fraction of the zone radius. */
    warpScale: number;
    /**
     * Amplitude (cells) of a fine warp that wobbles zone borders every few
     * cells, so no border runs straight for long (bead xaj.21).
     */
    fineWarp: number;
    /** Feature size (cells) of the fine warp. */
    fineWarpScale: number;
    /** Lloyd relaxation rounds for the middle-zone seeds. */
    relax: number;
    /** Extra connections (loops) beyond the spanning tree, per size. */
    loops: Record<MapSize, readonly [number, number]>;
    /** Borders shorter than this many cell edges never get a connection. */
    minConnectBorder: number;
    /** Size factor of a start zone's seed (above 1 = a larger zone). */
    startWeight: number;
    /** Size factor of the Hold's zone. */
    holdWeight: number;
    /**
     * Bead bzc.129: each start first gets a neutral town in a middle zone
     * connected to it (the largest such zone), the rest of the towns going
     * to the deep zones as before: on a two-player map of many zones the
     * deep zones are four or more days from either start. True or false for
     * every size, or per size (bead bzc.147: on the L and XL random maps).
     */
    townsBesideStarts: boolean | Readonly<Record<MapSize, boolean>>;
  };

  /**
   * Rooms: each zone is cut into rooms by walls of forest or rock with
   * unguarded gaps, so paths wind through valleys, dead ends and pockets
   * instead of one open field (bead bzc.3).
   */
  rooms: {
    /** Target open cells per room (inclusive range, drawn per zone). */
    area: readonly [number, number];
    /** Most rooms in one zone. */
    maxPerZone: number;
    /** Feature size (cells) of the noise that bends room walls. */
    warpScale: number;
    /** How strongly that noise bends them (0 = plain Voronoi). */
    warpAmount: number;
    /** Chance that a wall outside the spanning tree gets a gap anyway. */
    loopChance: number;
    /** Gap width in cells (inclusive range). */
    gapWidth: readonly [number, number];
    /** Wall depth beyond the one-cell seal, at most (noise decides). */
    wallExtra: number;
    /** Feature size of the wall thickness noise. */
    thicknessScale: number;
  };

  terrain: {
    /**
     * Start zone main terrain by player (index = player); player 0 is the
     * Lost World start of today's single-player game.
     */
    start: { main: readonly Terrain[] };
    hold: { main: readonly Terrain[] };
    middle: { main: readonly Terrain[] };
    /** Share of a zone covered by its secondary terrain. */
    secondaryShare: readonly [number, number];
    /** Feature size of secondary patches. */
    patchScale: number;
    /** Every 4-connected terrain region has at least this many cells. */
    minRegion: number;
    /** Majority-filter rounds that round off terrain borders. */
    smoothRounds: number;
    /**
     * Volcanic ground (bead bzc.83): on some maps a wild zone away from the
     * starts is volcanic (gen/terrain.ts placeVolcanic), its own random
     * stream, so the other zones and stages draw what they drew before.
     */
    volcanic: {
      /** Chance per map size that the map has volcanic zones at all. */
      chance: Readonly<Record<MapSize, number>>;
      /** Most volcanic zones per map size (each further one at half the chance). */
      maxZones: Readonly<Record<MapSize, number>>;
      /** Lowest tier (steps from the nearest start zone) of a volcanic zone. */
      minTier: number;
      /** Secondary patches of a volcanic zone: one of these. */
      secondary: readonly Terrain[];
    };
    /**
     * Winter (bead bzc.87): on some maps a wild zone away from the starts
     * is snow (gen/terrain.ts placeWinter), picked like the volcanic zones
     * from its own random stream after them, never next to a volcanic zone,
     * so a map that rolls no winter is the map it was before snow existed.
     */
    winter: {
      /** Chance per map size that the map has winter zones at all. */
      chance: Readonly<Record<MapSize, number>>;
      /** Most winter zones per map size (each further one at half the chance). */
      maxZones: Readonly<Record<MapSize, number>>;
      /** Lowest tier (steps from the nearest start zone) of a winter zone. */
      minTier: number;
      /** Secondary patches of a winter zone: one of these. */
      secondary: readonly Terrain[];
    };
    /**
     * Desert sand (bead bzc.88): on some maps a wild zone turns into a sand
     * desert (gen/terrain.ts placeDesert), the same way as the volcanic
     * zones and from its own random stream; the desert's sites go into it
     * (gen/desert.ts placeDesertSites).
     */
    desert: {
      /** Chance per map size that the map has a desert at all. */
      chance: Readonly<Record<MapSize, number>>;
      /** Most desert zones per map size (each further one at half the chance). */
      maxZones: Readonly<Record<MapSize, number>>;
      /** Lowest tier (steps from the nearest start zone) of a desert zone. */
      minTier: number;
      /** The first desert zone gets a second Sunken Tomb (by map size). */
      secondTomb?: Readonly<Record<MapSize, boolean>>;
      /** Secondary patches of a desert zone: one of these. */
      secondary: readonly Terrain[];
    };
    /**
     * The Candy Kingdom's frosting (bead bzc.115): on some maps a wild zone
     * turns into a candy zone of frosting ground (gen/candy.ts placeCandy),
     * the same way as the desert and from its own random stream.
     */
    candy: {
      /** Chance per map size that the map has a candy zone at all. */
      chance: Readonly<Record<MapSize, number>>;
      /** Most candy zones per map size (each further one at half the chance). */
      maxZones: Readonly<Record<MapSize, number>>;
      /** Lowest tier (steps from the nearest start zone) of a candy zone. */
      minTier: number;
      /** Secondary patches of a candy zone: one of these. */
      secondary: readonly Terrain[];
    };
    /**
     * The swamp (bead bzc.126): on some maps a wild zone turns into a
     * swamp of mud and reeds (gen/swamp.ts placeSwamp), the same way as the
     * desert, from its own random stream and after every other biome; the
     * swamp's sites go into it (gen/swamp.ts swampSites).
     */
    swamp: {
      /** Chance per map size that the map has a swamp at all. */
      chance: Readonly<Record<MapSize, number>>;
      /** Most swamp zones per map size (each further one at half the chance). */
      maxZones: Readonly<Record<MapSize, number>>;
      /** Lowest tier (steps from the nearest start zone) of a swamp zone. */
      minTier: number;
      /** Secondary patches of a swamp zone: one of these. */
      secondary: readonly Terrain[];
    };
  };

  water: {
    /** Chance of a coast along part of one map edge. */
    coastChance: number;
    /** Coast depth in cells (range) at its widest. */
    coastDepth: readonly [number, number];
    /** Coast length as a fraction of the edge. */
    coastLength: readonly [number, number];
    /** Lakes per size (inclusive range). */
    lakes: Record<MapSize, readonly [number, number]>;
    /** Lake radius in cells. */
    lakeRadius: readonly [number, number];
    /** Water bodies smaller than this become land; islands below it water. */
    minBody: number;
    /** Deep-water patches smaller than this become shallow. */
    minDeep: number;
    /** Keep water at least this far from town footprints. */
    townClearance: number;
  };

  borders: {
    /** Extra depth (cells) of the range on its spine side, at most. */
    spineExtra: number;
    /**
     * Least depth (cells) of a mountain range on its spine side, so a
     * border range is at least two cells deep where its zone has room
     * (bead xaj.15: a one-cell line reads as one rock pasted in a column).
     */
    spineMin: number;
    /** Depth (cells) of the range on the other side, at most. */
    otherDepth: number;
    /** Feature size of the thickness noise. */
    thicknessScale: number;
    /** Feature size of the mountain/forest split along a border. */
    typeScale: number;
    /**
     * Mountain share of a border by the two zones' main terrains (mean of
     * both); the rest is forest belt.
     */
    mountainShare: Record<Terrain, number>;
    /** Map-edge frame depth at most (0 disables the frame). */
    edgeDepth: number;
    /** How much a slow noise swells or starves the frame (0 = even). */
    edgeSwell: number;
    /** Spurs (short ridges reaching into a zone) per border cell. */
    spurRate: number;
    /** Spur length in cells. */
    spurLength: readonly [number, number];
  };

  wobble: {
    /** Longest straight run (cells) of a range edge or ground edge. */
    maxRun: number;
    /** Passes over the map (a feature can make a new run). */
    rounds: number;
    /** Share of range-edge breaks tried as a notch before a bump. */
    notchShare: number;
  };

  passes: {
    /** Pass width in cells (inclusive range). */
    width: readonly [number, number];
    /** A border at least this long (cell edges) gets a second pass. */
    secondPassBorder: number;
    /** Minimum distance between two passes of one border. */
    passSpacing: number;
    /** Cells around each end of a pass kept free of clusters. */
    mouthClearance: number;
  };

  clusters: {
    /** Share of a zone's interior covered by obstacle clusters. */
    density: readonly [number, number];
    /**
     * The same for a start zone, when set (bead bzc.96: the start kit
     * needs its room near home); else `density`.
     */
    startDensity?: readonly [number, number];
    /**
     * Cluster size, small share and attach chance in a start zone, when
     * set (bead bzc.96: the kit's windows near home); else the ones above.
     */
    startShape?: {
      size: readonly [number, number];
      smallShare: number;
      attachChance: number;
    };
    /** Cluster size in cells (inclusive range). */
    size: readonly [number, number];
    /** Mountain share of clusters by the zone's main terrain. */
    mountainShare: Record<Terrain, number>;
    /** East-west stretch of mountain cluster blobs (ridges pack well). */
    ridgeBias: number;
    /** Feature size of the noise that makes cluster outlines lumpy. */
    lumpScale: number;
    /** Weight of that noise against the blob's ellipse. */
    lumpAmount: number;
    /** Share of clusters that are small groups of one to three cells. */
    smallShare: number;
    /** Chance a cluster starts next to an existing range or cluster. */
    attachChance: number;
    /** Free cells kept between unattached clusters. */
    gap: number;
    /** Intentional lone trees per map, at most (no lone peaks: the smallest mountain is 2x2). */
    lonePeaks: number;
    /** Keep clusters at least this far from town entrances. */
    townClearance: number;
    /** Enclosed open pockets up to this size are filled, larger are opened. */
    pocketFill: number;
    /**
     * Deep mountain clusters (bead xaj.22): a share of the mountain clusters
     * of a zone, by its main terrain, are big round blocks (at least four
     * rows deep where the zone has room), so badlands and steppe ranges have
     * an interior where flat-topped plateaus and tablelands fit.
     */
    deep: {
      share: Record<Terrain, number>;
      size: readonly [number, number];
      /** East-west stretch of a deep blob (1 = round). */
      stretch: number;
    };
  };

  objects: {
    /** Town footprint; the entrance is the bottom-middle cell. */
    town: { w: number; h: number };
    /** Free cells kept around a town footprint. */
    townClearance: number;
    /**
     * The object table placed from (default: MAP_OBJECT_ROWS of
     * src/data/mapObjects.ts). A new object type is a new row.
     */
    table: readonly MapObjectRow[];
    /** Rows of the rule-placed types (RULE_ROWS of src/data/mapObjects.ts). */
    ruleRows: readonly MapObjectRow[];
    /** Minimum Chebyshev gap between objects (strict, then relaxed). */
    spacing: number;
    /** What every player finds near home (identical for every player). */
    startKit: readonly StartKitItem[];
    /**
     * Random fill on top of the kit: visitable objects per 100 open cells,
     * by zone kind. Start zones are filled once and copied to every start.
     */
    density: Record<MapZoneKind, number>;
    /** Pockets (dead-end rooms) get a guard at the gap and this many prizes. */
    pocketPrizes: readonly [number, number];
    /** Smallest pocket (open cells) worth a guard at its gap. */
    pocketMin: number;
    /** Most guarded pockets in one zone. */
    pocketsPerZone: number;
    /** Guards stay this far (Chebyshev) from a town entrance. */
    guardTownClearance: number;
    /**
     * One-way waystones per map size (CONTENT_MAP_OBJECTS 3.9, a stretch
     * type): entrance and exit in different wild zones, the exit never in
     * a richer zone than the entrance, both far from every start. 0 turns
     * them off (the named maps were authored without them).
     */
    oneWayWaystones: Readonly<Record<MapSize, number>>;
    /**
     * Objects placed by rule (CONTENT_MAP_OBJECTS 3.6, 3.9) per map size:
     * obelisks, buried caches, pylons, two-way waystone pairs (four
     * colours, so four pairs at most), whether the Keepers' Vault is in,
     * and border gates with their keymaster's tents (four colours at most;
     * a quest gate comes on top where a site is left).
     */
    rules: Readonly<
      Record<
        MapSize,
        {
          obelisks: number;
          caches: number;
          pylons: number;
          waystonePairs: number;
          vault: boolean;
          borderGates: number;
        }
      >
    >;
    /**
     * Per-map counts (by size) of table rows, by row id, as [least, most]:
     * the random fill and pocket prizes draw such a row at most `most`
     * times, and a map short of `least` gets the rest in random zones where
     * the row may appear. [0, 0] leaves it out altogether (the named maps
     * have no Drill Yard).
     */
    perMap: Readonly<
      Record<string, Readonly<Record<MapSize, readonly [number, number]>>>
    >;
    /**
     * Both ends of a one-way waystone lie at least this many days of
     * movement (with the roads) from every start.
     */
    oneWayMinDays: number;
    /**
     * Bead bzc.95: no object a road may not cross (anything but a town, a
     * guard, a gate or a resource pile; see roadMayCross in gen/objects.ts)
     * stands on a road. A footprint, placed before the roads, never cuts a
     * town off when its entrance is shut too (the roads go round it); a
     * single cell, placed after them, never takes a road cell. Off for the
     * named maps, whose edits name generated objects by place: their
     * builder steps sites off the authored roads instead (named.ts).
     */
    keepWaysOpen: boolean;
    /**
     * Bead bzc.96: rare big sites (banks and the other rows a zone holds
     * once) find their room before the common footprints of the fill, and
     * the keymaster's tents are set down before the single-cell fill (and
     * taken up again where no border gate wants them). Off for the named
     * maps, which were authored without it.
     */
    reserveRare: boolean;
    /**
     * Bead bzc.110: no building (src/core/map/passages.ts isBuilding)
     * stands where a way needs it: with its entrance shut too, every open
     * cell round it stays joined (pickups count as taken). Off for the
     * named maps, whose edits name generated objects by place: their
     * builder moves the few that stand in a way aside instead (named.ts).
     */
    waysRound: boolean;
    /**
     * Bead bzc.110: the share of loose Trinkets and Wonders that lie in a
     * Mystery Bag instead (src/core/map/mystery.ts), and the share in the
     * treasure clusters and pockets. The rest lie in full view.
     */
    mystery: { share: number; treasureShare: number };
    /**
     * Bead bzc.125: the volcanic zones get their sites (gen/volcanic.ts:
     * an Infernal Forge, a Brimstone Pit and a Shrine of Embers each). Off
     * for the named maps, whose edits name generated objects by place:
     * they add the volcanic sites by hand (src/data/named-maps.ts).
     */
    volcanicSites: boolean;
    /**
     * Bead bzc.124: the candy zones get their sites (gen/candy.ts
     * candySites: a Gingerbread Cottage, a Sugar Fountain and a Sweet Shop
     * each). Off for the named maps, which roll no candy zone anyway.
     */
    candySites: boolean;
    /**
     * Bead bzc.126: the swamp zones get their sites (gen/swamp.ts: a
     * Drowned Temple, a Witch's Hut and a Hag's Cauldron each). Off for the
     * named maps, which roll no swamp and whose edits name generated
     * objects by place.
     */
    swampSites: boolean;
    /**
     * Bead bzc.135: factions whose creatures the generated Faction Outposts
     * never offer. Empty by default; the named maps leave out the Deepforge,
     * whose creatures in the pool re-roll the outposts' values and so move
     * the Ninefold Landfall's objects that its edits name by place.
     */
    outpostsWithout: readonly string[];
    /**
     * Bead bzc.135: artifacts the generated loot never holds (chests,
     * banks, loose artifacts, quest rewards; gen/contents.ts). Empty by
     * default; the named maps leave out the Pocket Boiler, which re-rolled
     * the Cartographer's Folly's loot and moved 64 of its objects.
     */
    lootWithout: readonly string[];
  };

  /**
   * Guarded treasure clusters (bead bzc.96, docs/design/MAP_COMPOSITION.md):
   * a few resource piles and sometimes an artifact or two in a nook of
   * forest, round a guard that stands in front of them (so its zone of
   * control covers every cell they can be taken from), sized by what it
   * holds, as on a Heroes III random map.
   */
  hoards: {
    /** Clusters per 100 open cells of a zone, by zone kind (0: none). */
    rate: Readonly<Record<MapZoneKind, number>>;
    /** Resource piles per cluster (inclusive range). */
    piles: readonly [number, number];
    /** Chance of an artifact in a cluster, and then of a second one. */
    artifacts: readonly [number, number];
    /**
     * Richer clusters in the treasure zones (bead bzc.102): piles and
     * artifact chances of these zone kinds instead (the middle zones and
     * the Hold; the town zones keep the plain ones).
     */
    rich: Readonly<
      Partial<
        Record<
          MapZoneKind,
          {
            piles: readonly [number, number];
            artifacts: readonly [number, number];
          }
        >
      >
    >;
    /**
     * Every start's own cluster (bead bzc.102): `things` resource piles
     * (fewer where one start has no nook for them all, the same for every
     * start; under 2: none) round a guard between `days` of travel from
     * its town, filled alike for every start.
     */
    start: { things: number; days: readonly [number, number] };
    /**
     * Days (movement before roads) every other cluster keeps from every
     * start (bead bzc.102; 0: none). A named map authored on the map
     * composition keeps its starts' first days as they were balanced.
     */
    awayFromStarts: number;
    /** Most things in one cluster (five fit round a guard). */
    most: number;
    /** Free cells (Chebyshev) kept from a pass or gap corridor. */
    corridorGap: number;
  };

  /**
   * Treasure clearings (bead bzc.96): a guarded dead-end room of at least
   * `minCells` open cells holds a set mix of good things instead of a
   * random draw: resource piles, artifacts and a shrine or two.
   */
  clearings: {
    /** Off: pockets draw their prizes from the table as before. */
    enabled: boolean;
    /** Smallest pocket (open cells) that becomes a clearing. */
    minCells: number;
    piles: readonly [number, number];
    artifacts: readonly [number, number];
    /** Shrines and other visit-once sites (rows of `siteRows`). */
    sites: readonly [number, number];
    siteRows: readonly string[];
  };

  /**
   * Ponds in clearings (bead bzc.96, gen/fields.ts): the widest open ground
   * of a zone outside the starts gets a small pond on some maps.
   */
  fields: {
    /** Off: no ponds. */
    enabled: boolean;
    /**
     * Open discs (radius in cells) set aside per wild zone before the
     * ranges and woods grow, so its big sites (banks, libraries, the
     * desert's and winter's sites) find room (gen/fields.ts reservePlazas);
     * 0: none.
     */
    plazaRadius: number;
    /** Wild-zone open cells per plaza (one at least). */
    plazaArea: number;
    /** Chance per zone. */
    chance: number;
    /** Least clearing radius (cells from anything busy) for a pond. */
    pond: number;
    /** Pond size in cells (inclusive range). */
    pondCells: readonly [number, number];
    /** Keep this far (Chebyshev) from a town entrance. */
    townGap: number;
  };

  guards: {
    /** Random factor on a guard's fight value (plus or minus). */
    jitter: number;
    /** Smallest guard fight value. */
    minFightValue: number;
    /**
     * Chance that a passage between two zones of the same tier (a loop
     * between middle zones) stays unguarded.
     */
    openPassChance: number;
  };

  movement: {
    /** Straight-step cost per terrain for the player's hero (native jungle). */
    cost: Record<Exclude<Terrain, "water">, number>;
    road: number;
    /** One day of movement. */
    day: number;
  };

  roads: {
    /** Extra cost for a 45-degree turn; 90 degrees costs double. */
    turnPenalty: number;
    /** Cost multiplier for re-using an existing road cell. */
    reuse: number;
    /** Extra cost for each obstacle beside a road cell (keeps it central). */
    hugPenalty: number;
    /** Mine spurs longer than this many cells are not built. */
    maxSpur: number;
  };
}

/**
 * The obstacle clusters before bead bzc.96 (many small clumps): the named
 * maps keep them, so their generated bases stay as authored.
 */
export const LEGACY_CLUSTERS: Pick<
  GenConfig["clusters"],
  | "density"
  | "startDensity"
  | "startShape"
  | "size"
  | "smallShare"
  | "attachChance"
  | "lonePeaks"
> = {
  density: [0.12, 0.16],
  startDensity: [0.12, 0.16],
  startShape: { size: [2, 12], smallShare: 0.3, attachChance: 0.22 },
  size: [2, 12],
  smallShare: 0.3,
  attachChance: 0.22,
  lonePeaks: 5,
};

/**
 * The map composition before bead bzc.96 (docs/design/MAP_COMPOSITION.md):
 * the old clusters, and no treasure clusters, clearings, ponds, plazas or
 * reordering of the rare sites. The named maps use it (their edits name
 * generated objects by place), and so do tests written on a map as it was.
 */
export const LEGACY_COMPOSITION: {
  clusters: Partial<GenConfig["clusters"]>;
  hoards: Pick<GenConfig["hoards"], "rate" | "start">;
  clearings: Pick<GenConfig["clearings"], "enabled">;
  fields: Pick<GenConfig["fields"], "enabled" | "plazaRadius">;
  objects: Pick<GenConfig["objects"], "reserveRare" | "waysRound" | "mystery">;
} = {
  clusters: LEGACY_CLUSTERS,
  hoards: {
    rate: { start: 0, middle: 0, town: 0, hold: 0 },
    start: { things: 0, days: [0, 0] },
  },
  clearings: { enabled: false },
  fields: { enabled: false, plazaRadius: 0 },
  // Nor the later placing rules of bead bzc.110 (ways round buildings,
  // Mystery Bags), so a map is as it was.
  objects: {
    reserveRare: false,
    waysRound: false,
    mystery: { share: 0, treasureShare: 0 },
  },
};

/** One size's line of `objects.rules`. */
function rules(
  obelisks: number,
  caches: number,
  pylons: number,
  waystonePairs: number,
  vault: boolean,
  borderGates: number,
): GenConfig["objects"]["rules"][MapSize] {
  return { obelisks, caches, pylons, waystonePairs, vault, borderGates };
}

export const DEFAULT_GEN_CONFIG: GenConfig = {
  // Bead bzc.147: the Heroes sizes. SM and M are the medium and large maps
  // of before, number for number; L and XL keep M's zone size (about 400
  // open cells a zone) and add zones, so a bigger map is more of the same
  // land, not the same land stretched.
  sizes: { S: 36, SM: 48, M: 72, L: 108, XL: 144 },
  players: { S: 2, SM: 3, M: 4, L: 4, XL: 4 },
  middleZones: {
    S: { 2: [2, 2], 3: [1, 2], 4: [1, 1] },
    SM: { 2: [4, 4], 3: [4, 4], 4: [3, 4] },
    M: { 2: [8, 9], 3: [8, 8], 4: [7, 8] },
    L: { 2: [20, 22], 3: [19, 21], 4: [18, 20] },
    XL: { 2: [36, 39], 3: [35, 38], 4: [34, 37] },
  },
  neutralTowns: { S: [1, 1], SM: [1, 2], M: [2, 3], L: [4, 6], XL: [7, 10] },

  zones: {
    warp: 0.42,
    warpScale: 0.9,
    fineWarp: 1.5,
    fineWarpScale: 3,
    relax: 2,
    loops: { S: [1, 1], SM: [1, 2], M: [3, 4], L: [7, 9], XL: [12, 15] },
    minConnectBorder: 5,
    startWeight: 1.18,
    holdWeight: 0.95,
    townsBesideStarts: { S: false, SM: false, M: false, L: true, XL: true },
  },

  rooms: {
    area: [42, 62],
    maxPerZone: 7,
    warpScale: 5,
    warpAmount: 1.4,
    loopChance: 0.18,
    gapWidth: [1, 3],
    wallExtra: 2.6,
    thicknessScale: 4,
  },

  terrain: {
    start: { main: ["jungle", "grass", "steppe", "wasteland"] },
    hold: { main: ["badlands", "steppe"] },
    middle: { main: ["grass", "steppe", "badlands", "wasteland"] },
    secondaryShare: [0.22, 0.34],
    patchScale: 7,
    minRegion: 6,
    smoothRounds: 2,
    volcanic: {
      chance: { S: 0.35, SM: 0.5, M: 0.6, L: 0.75, XL: 0.85 },
      maxZones: { S: 1, SM: 1, M: 2, L: 3, XL: 4 },
      minTier: 1,
      secondary: ["wasteland", "badlands"],
    },
    winter: {
      chance: { S: 0.35, SM: 0.5, M: 0.6, L: 0.75, XL: 0.85 },
      maxZones: { S: 1, SM: 1, M: 2, L: 3, XL: 4 },
      minTier: 1,
      secondary: ["steppe", "wasteland"],
    },
    desert: {
      chance: { S: 0.35, SM: 0.5, M: 0.6, L: 0.75, XL: 0.85 },
      maxZones: { S: 1, SM: 1, M: 2, L: 3, XL: 4 },
      minTier: 1,
      secondTomb: { S: false, SM: false, M: true, L: true, XL: true },
      secondary: ["badlands", "steppe"],
    },
    candy: {
      chance: { S: 0.3, SM: 0.4, M: 0.5, L: 0.65, XL: 0.75 },
      maxZones: { S: 1, SM: 1, M: 1, L: 2, XL: 2 },
      minTier: 1,
      secondary: ["grass", "steppe"],
    },
    swamp: {
      // Last of the biomes, it often finds every wild zone taken or next
      // to one, so it rolls a little more often than the candy zones.
      chance: { S: 0.45, SM: 0.55, M: 0.65, L: 0.8, XL: 0.9 },
      maxZones: { S: 1, SM: 1, M: 1, L: 2, XL: 3 },
      minTier: 1,
      secondary: ["jungle", "grass"],
    },
  },

  water: {
    coastChance: 0.55,
    coastDepth: [3, 6],
    coastLength: [0.35, 0.6],
    lakes: { S: [0, 1], SM: [1, 2], M: [1, 3], L: [3, 5], XL: [5, 8] },
    lakeRadius: [2.4, 4.2],
    minBody: 9,
    minDeep: 3,
    townClearance: 4,
  },

  borders: {
    spineExtra: 1.5,
    spineMin: 2.5,
    otherDepth: 2.0,
    thicknessScale: 5,
    typeScale: 9,
    mountainShare: {
      grass: 0.45,
      jungle: 0.25,
      steppe: 0.6,
      badlands: 0.85,
      wasteland: 0.75,
      volcanic: 0.85,
      snow: 0.6,
      sand: 0.7,
      // Candy groves as often as gumdrop hills (bead bzc.115).
      frosting: 0.4,
      // Mossy hummocks rarely; the swamp's borders are mostly woods.
      swamp: 0.3,
      water: 0.5,
    },
    edgeDepth: 2.8,
    edgeSwell: 0.7,
    spurRate: 0.035,
    spurLength: [2, 4],
  },

  wobble: {
    maxRun: 3,
    rounds: 4,
    notchShare: 0.45,
  },

  passes: {
    width: [1, 3],
    secondPassBorder: 26,
    passSpacing: 9,
    mouthClearance: 2,
  },

  clusters: {
    // Bead bzc.96: fewer, larger masses that lean on the ranges (the user:
    // "a smaller number of larger ranges" rather than many small clumps).
    // The open-land share of a Heroes III map is reached after the objects
    // (fields, below), so the clusters leave the objects their room.
    // Before: LEGACY_CLUSTERS.
    density: [0.2, 0.25],
    startDensity: [0.12, 0.16],
    startShape: { size: [4, 16], smallShare: 0.15, attachChance: 0.4 },
    size: [8, 24],
    mountainShare: {
      grass: 0.35,
      jungle: 0.2,
      steppe: 0.45,
      badlands: 0.7,
      wasteland: 0.6,
      volcanic: 0.75,
      snow: 0.6,
      sand: 0.6,
      frosting: 0.35,
      swamp: 0.25,
      water: 0.5,
    },
    ridgeBias: 2.2,
    lumpScale: 2.5,
    lumpAmount: 0.3,
    smallShare: 0.05,
    attachChance: 0.6,
    gap: 2,
    lonePeaks: 5,
    townClearance: 3,
    pocketFill: 24,
    deep: {
      share: {
        grass: 0,
        jungle: 0,
        steppe: 0.45,
        badlands: 0.8,
        wasteland: 0,
        volcanic: 0.5,
        snow: 0.45,
        sand: 0.4,
        frosting: 0.4,
        swamp: 0,
        water: 0,
      },
      size: [22, 36],
      stretch: 1.3,
    },
  },

  objects: {
    town: { w: 3, h: 2 },
    townClearance: 2,
    table: MAP_OBJECT_ROWS,
    ruleRows: RULE_ROWS,
    spacing: 2,
    startKit: [
      { row: "mine-wood", count: 1, minDays: 0.2, maxDays: 0.85 },
      { row: "mine-wood", count: 1, minDays: 0.3, maxDays: 2 },
      { row: "mine-ore", count: 1, minDays: 0.2, maxDays: 0.85 },
      { row: "mine-ore", count: 1, minDays: 1, maxDays: 2.5, nextZone: true },
      {
        row: "mine-essence",
        count: 1,
        minDays: 0.9,
        maxDays: 1.8,
        nextZone: true,
      },
      { row: "mine-gold", count: 1, minDays: 1, maxDays: 3, nextZone: true },
      { row: "pickup-wood", count: 3, minDays: 0, maxDays: 0.9 },
      { row: "pickup-ore", count: 1, minDays: 0, maxDays: 0.9 },
      { row: "pickup-essence", count: 1, minDays: 0, maxDays: 0.9 },
      { row: "pickup-gold", count: 2, minDays: 0, maxDays: 0.9 },
      { row: "chest", count: 1, minDays: 0, maxDays: 0.9 },
      // "One strange thing near home" (concept section 3, bead bzc.13).
      {
        row: "strange-thing",
        count: 1,
        minDays: 0.4,
        maxDays: 2,
        nextZone: true,
      },
    ],
    // Bead bzc.50 ("the map was too empty"): about twice the fill of v0.2's
    // first maps (start 9, middle 10, town 9, hold 10; pockets 2-3 prizes,
    // two pockets a zone). Bead bzc.95 raised it from start 26, middle 20,
    // town 22, hold 24: sites no longer take road cells, and the start
    // zones (filled once for every player) had the room to spare.
    density: { start: 33, middle: 22, town: 24, hold: 26 },
    pocketPrizes: [3, 5],
    pocketMin: 8,
    pocketsPerZone: 2,
    guardTownClearance: 4,
    oneWayWaystones: { S: 1, SM: 2, M: 3, L: 4, XL: 6 },
    rules: {
      // obelisks, caches, pylons, waystone pairs, vault, border gates
      S: rules(4, 3, 3, 1, false, 1),
      SM: rules(6, 4, 4, 2, true, 1),
      M: rules(8, 6, 5, 3, true, 2),
      L: rules(10, 9, 8, 4, true, 3),
      XL: rules(12, 12, 11, 4, true, 4),
    },
    oneWayMinDays: 1,
    keepWaysOpen: true,
    reserveRare: true,
    waysRound: true,
    mystery: { share: 0.25, treasureShare: 0.5 },
    volcanicSites: true,
    candySites: true,
    swampSites: true,
    outpostsWithout: [],
    lootWithout: [],
    perMap: {
      "drill-yard": { S: [1, 1], SM: [1, 1], M: [1, 2], L: [2, 3], XL: [3, 4] },
    },
  },

  hoards: {
    // Bead bzc.102 raised them from middle 2.2, town 2, hold 2.4: more
    // nooks (guards in notches, rooms dug into the edges) let a zone hold
    // two to four.
    rate: { start: 0, middle: 3.4, town: 2.6, hold: 3.8 },
    piles: [2, 4],
    artifacts: [0.45, 0.25],
    rich: {
      middle: { piles: [3, 4], artifacts: [0.6, 0.3] },
      hold: { piles: [3, 4], artifacts: [0.75, 0.4] },
    },
    start: { things: 3, days: [0.8, 1.4] },
    awayFromStarts: 0,
    most: 5,
    corridorGap: 2,
  },

  clearings: {
    enabled: true,
    minCells: 12,
    piles: [2, 3],
    artifacts: [1, 2],
    sites: [1, 2],
    siteRows: [
      "stat-shrine",
      "school-shrine",
      "learning-stone",
      "tree-of-knowledge",
      "mana-well",
      "tutors-hut",
      "scholar",
    ],
  },

  fields: {
    enabled: true,
    plazaRadius: 3,
    plazaArea: 180,
    chance: 0.6,
    pond: 2.2,
    pondCells: [9, 13],
    townGap: 5,
  },

  guards: {
    jitter: 0.12,
    minFightValue: 300,
    openPassChance: 0.35,
  },

  movement: {
    cost: {
      grass: 100,
      steppe: 100,
      jungle: 100,
      badlands: 125,
      wasteland: 150,
      volcanic: 150,
      snow: 150,
      sand: 125,
      frosting: 125,
      swamp: 175,
    },
    road: 75,
    day: 1500,
  },

  roads: {
    turnPenalty: 18,
    reuse: 0.35,
    hugPenalty: 12,
    maxSpur: 9,
  },
};
