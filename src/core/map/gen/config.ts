/**
 * Every tunable number of the map generator, in one object.
 *
 * Distances are in cells unless the name says "cost" (movement points, as in
 * GAME_DESIGN.md section 7.1). Shares are fractions of the relevant area.
 */
import type { ResourceId, Terrain } from "../types.ts";

export type MapSize = "S" | "M" | "L";

export interface GenConfig {
  /** Side length per map size (maps are square). */
  sizes: Record<MapSize, number>;
  /** Number of middle zones per size (inclusive range). */
  middleZones: Record<MapSize, readonly [number, number]>;

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
    /** Chance of one extra connection (a loop) beyond the spanning tree. */
    loopChance: Record<MapSize, number>;
    /** Borders shorter than this many cell edges never get a connection. */
    minConnectBorder: number;
  };

  terrain: {
    start: { main: Terrain; secondary: readonly Terrain[] };
    enemy: { main: readonly Terrain[] };
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
  };

  objects: {
    /** Town footprint; the entrance is the bottom-middle cell. */
    town: { w: number; h: number };
    /** Free cells kept around a town footprint. */
    townClearance: number;
    /** Minimum Chebyshev spacing between objects. */
    spacing: number;
    /** Mines per middle zone (inclusive range, essence springs excluded). */
    middleMines: readonly [number, number];
    /** Essence springs on the whole map (inclusive range). */
    essenceSprings: readonly [number, number];
    /** Pickups per 100 open cells outside the start region's quota. */
    pickupDensity: number;
    /** Weights of pickup kinds outside the start region. */
    pickupWeights: Record<ResourceId | "chest", number>;
    /** Pickup amounts (inclusive ranges); gold in steps of 100. */
    amounts: Record<ResourceId, readonly [number, number]>;
    chest: { gold: number; xp: number };
    /** Start-region (within 1 day) pickup quotas (inclusive ranges). */
    startPickups: Record<ResourceId | "chest", readonly [number, number]>;
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
  middleZones: { S: [2, 2], M: [2, 3], L: [3, 4] },

  zones: {
    warp: 0.42,
    warpScale: 0.9,
    fineWarp: 1.5,
    fineWarpScale: 3,
    relax: 2,
    loopChance: { S: 0, M: 0.35, L: 0.6 },
    minConnectBorder: 5,
  },

  terrain: {
    start: { main: "jungle", secondary: ["grass"] },
    enemy: { main: ["steppe", "badlands"] },
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
    density: [0.12, 0.17],
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
    pocketFill: 14,
  },

  objects: {
    town: { w: 3, h: 2 },
    townClearance: 2,
    spacing: 3,
    middleMines: [2, 3],
    essenceSprings: [2, 3],
    pickupDensity: 1.6,
    pickupWeights: { wood: 3, ore: 2, gold: 3, essence: 1, chest: 1 },
    amounts: {
      wood: [5, 10],
      ore: [3, 6],
      essence: [2, 4],
      gold: [300, 800],
    },
    chest: { gold: 1000, xp: 750 },
    startPickups: {
      wood: [3, 4],
      ore: [1, 2],
      essence: [1, 1],
      gold: [2, 3],
      chest: [1, 1],
    },
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
