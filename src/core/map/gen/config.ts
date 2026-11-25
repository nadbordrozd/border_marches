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

export type MapSize = "S" | "M" | "L";

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

export const DEFAULT_GEN_CONFIG: GenConfig = {
  sizes: { S: 36, M: 48, L: 72 },
  players: { S: 2, M: 3, L: 4 },
  middleZones: {
    S: { 2: [2, 2], 3: [1, 2], 4: [1, 1] },
    M: { 2: [4, 4], 3: [4, 4], 4: [3, 4] },
    L: { 2: [8, 9], 3: [8, 8], 4: [7, 8] },
  },
  neutralTowns: { S: [1, 1], M: [1, 2], L: [2, 3] },

  zones: {
    warp: 0.42,
    warpScale: 0.9,
    fineWarp: 1.5,
    fineWarpScale: 3,
    relax: 2,
    loops: { S: [1, 1], M: [1, 2], L: [3, 4] },
    minConnectBorder: 5,
    startWeight: 1.18,
    holdWeight: 0.95,
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
  },

  water: {
    coastChance: 0.55,
    coastDepth: [3, 6],
    coastLength: [0.35, 0.6],
    lakes: { S: [0, 1], M: [1, 2], L: [1, 3] },
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
    density: [0.12, 0.16],
    size: [2, 12],
    mountainShare: {
      grass: 0.35,
      jungle: 0.2,
      steppe: 0.45,
      badlands: 0.7,
      wasteland: 0.6,
      water: 0.5,
    },
    ridgeBias: 2.2,
    lumpScale: 2.5,
    lumpAmount: 0.3,
    smallShare: 0.3,
    attachChance: 0.22,
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
    density: { start: 9, middle: 10, town: 9, hold: 10 },
    pocketPrizes: [2, 3],
    pocketMin: 8,
    guardTownClearance: 4,
    oneWayWaystones: { S: 1, M: 2, L: 3 },
    oneWayMinDays: 1,
    perMap: { "drill-yard": { S: [1, 1], M: [1, 1], L: [1, 2] } },
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
