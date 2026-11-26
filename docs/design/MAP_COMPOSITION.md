# Map composition

Bead border_marches-bzc.96. The user, on the generated maps:

> The latest map is still far too empty. In homm you get clusters of
> resources guarded by a guardian. and artifacts. sometimes more than one. or
> a clearing with many useful tthings in it like resources artefacts and
> shrines etc. guarded by a strong guardian. and if there is a big clearing
> between the mountains and forests, there can be a pond or some other
> decoration. I don't know what the ratio of passable to not passable terrain
> is in Heroes. You should probably google it and aim for a similar ratio

and, on the mountains, that they are "maybe too small and crowded instead of
smaller number of larger ranges".

This note records what Heroes III does (section 1), the targets we chose
(section 2), what the generator now does (section 3) and the measurements
before and after (section 4).

## 1. Research: how a Heroes III random map is composed

No source publishes the share of passable ground on a Heroes III map. The
random map generator (RMG) is documented through VCMI, the open-source
re-implementation, whose code and notes follow the original's behaviour:

- **Zones and templates.** A random map is drawn from a template: a graph of
  zones (player start, CPU start, treasure, junction, sealed) joined by
  guarded connections. Each zone lists its treasure as value tiers
  (`min`, `max`, `density`) and a monster strength. A junction zone is
  "narrow passages only, the rest of area is filled with obstacles"; a sealed
  zone is all obstacles. ([VCMI template format][tpl],
  [HotA template format][hota])
- **Free space comes last.** Each zone starts with a free tile in its middle;
  free paths are routed from every tile farther than a set distance from the
  paths so far (about 9 tiles apart in VCMI's `fractalize`, closer in
  treasure-rich zones), treasure is placed beside them, and every tile left
  over is blocked and covered with obstacles, the largest obstacles first.
  So open ground is the ways, the treasure and the cells to reach it;
  everything else is rock, wood or water. ([RMG description][rmg],
  [Zone.cpp][zone])
- **Treasure piles.** For each tier the generator makes
  `zone tiles × density / 400` piles. A pile draws a value in the tier's
  range and takes objects (resources, artifacts, chests, shrines) until
  their values reach it, stopping at random once past the minimum; the
  objects are placed together. A pile worth more than the guard threshold
  (6500, 4167, 3000, 1833 or 1333 by monster strength) gets one guard sized
  by the pile's value, standing at its way in. Piles keep
  `sqrt(min / 10 / density)` tiles apart. ([TreasurePlacer.cpp][tp])
- **Zone roles.** Start zones hold the town, its mines and small piles;
  treasure zones hold richer piles behind stronger guards; the richest
  piles sit in small treasure zones or behind a strong guard in a dead end
  (the template sets each zone's tiers). ([VCMI template format][tpl])
- **Obstacle amount.** An alternative generator for the game exposes it as
  a per-zone "Obstacle%" setting, so it varies by template
  ([VCMI forum][alt]); in the original it falls out of the free-path spacing
  above.

**Estimate.** From the free-path spacing (ways about 9 tiles apart with
treasure and access along them) and the look of RMG maps, about half of a
land zone stays open: we take **45-55 % of the land** as the Heroes III band,
treasure zones nearer the top, junctions far below. Heroes II had no random
generator in the original game; its hand-made maps are more open still.

## 2. Targets and calls (bead bzc.96)

- **Open land: 45-55 % of the land on every size.** Measured on seeds 1-10
  before this bead, our maps were already inside it (S 53 %, M 52 %, L 51 %
  of the land open; section 4). So the ratio was not why the maps looked
  empty: the open ground was there, but things stood on it evenly, one by
  one, every two or three cells. The call: keep the ratio in the band
  (tests/core/map/composition.test.ts checks 45-57 % per map) and change the
  composition instead.
- **Guarded treasure clusters, several per wild zone where nooks allow.** Two
  to five pickups (two to four resource piles, an artifact on 45 % of them and
  a second on a quarter of those) round one guard, sized by their sum. A
  cluster's pickups stand in for as many of its zone's loose pickups, so the
  zone holds as many things as before, more of them in guarded groups.
  Not in start zones (every start must stay alike) and not on the sand (the
  desert's own sites are its treasure and need the room).
- **Treasure clearings.** A guarded dead-end room of 12 or more open cells
  holds a set mix: one or two artifacts, one or two shrines or learning
  sites, two or three resource piles, behind the one guard at its gap
  (sized by everything inside, so a strong one).
- **Ponds.** The widest open ground of a zone outside the starts gets a small
  pond (9-13 cells) on 60 % of maps where it is at least 2.2 cells from
  anything busy. After the larger ranges few such clearings are left, so
  ponds are occasional (about one per M map, two per L map).
- **Fewer, larger obstacle masses.** Clusters are larger (8-24 cells), rarely
  small (5 %, was 30 %) and mostly lean on an existing range or wood (60 %,
  was 22 %). Start zones keep a gentler mix (4-16 cells, 15 % small, 40 %
  leaning) and the old density so the start kit keeps its room. This is the
  generator half of xaj.32; the sprite forms of the ranges stay with xaj.32.
- **Room for rare big sites (bzc.95's leftovers).** Each wild zone keeps an
  open plaza (radius 3, one per 180 cells) clear of the ranges and rooms;
  the rule sites, the desert's and winter's sites, banks and other rows a
  zone holds once are placed before the common footprints and alone may use
  the plazas until then; one with no room in its zone tries the other wild
  zones; the keymaster's tents are set down before the single-cell fill and
  taken up again where no border gate wants them. The original desert seeds
  (S8, M12) hold every desert site again, and the Thunderstruck Pylon Yard is
  back on S maps. Border gates on S maps still need a gate site, which an S
  map rarely has (a follow-up).
- **Named maps are unchanged.** Their configuration turns every part of this
  bead off (legacy clusters, no clusters of treasure, no clearings, ponds or
  plazas, no reordering), so their pinned base and built fingerprints stay
  as they were.

## 3. What the generator does

| Stage             | File                                         | What                                                                                                                                                                                                          |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plazas            | `src/core/map/gen/fields.ts` `reservePlazas` | Before the borders: one open disc per wild zone (more in big zones), kept open.                                                                                                                               |
| Clusters          | `src/core/map/gen/clusters.ts`               | Larger, mostly attached masses; `startDensity`/`startShape` for start zones.                                                                                                                                  |
| Ponds             | `src/core/map/gen/fields.ts` `fillFields`    | After the clean-up: the widest clearing of a zone gets a pond, every way kept.                                                                                                                                |
| Treasure clusters | `src/core/map/gen/hoards.ts`                 | Before the costs: nooks cut into woods and ranges (2x2 rock and straight-edge rules kept) or walled with new wood; the guard's zone of control covers every cell a pickup can be taken from; nothing cut off. |
| Loot and guards   | `src/core/map/gen/objects.ts`                | Loot rolled, guards sized by the sum; clearings; rare sites first; tents reserved.                                                                                                                            |

Every number is in `DEFAULT_GEN_CONFIG` (`hoards`, `clearings`, `fields`,
`clusters`, `objects.reserveRare`); `LEGACY_CLUSTERS` keeps the old
clusters for the named maps.

## 4. Measurements

`node tests/map-metrics.ts` (seeds 1-10, default players; means). Passable,
obstacle and water are shares of all cells; "land passable" leaves the water
out. Masses are 8-connected groups of mountain and forest; small masses have
at most 8 cells. "Largest empty r" is the radius of the largest disc of open
ground with no object, obstacle or prop in it.

| Size |        | Passable % | Land passable % | Obstacle % | Water % | Visitable /100 | Masses | Small masses | Cells/mass | Largest empty r | Clusters | Clearings | Ponds |
| ---- | ------ | ---------- | --------------- | ---------- | ------- | -------------- | ------ | ------------ | ---------- | --------------- | -------- | --------- | ----- |
| S    | before | 52.0       | 53.3            | 45.6       | 2.4     | 21.2           | 16.7   | 8.4          | 35.0       | 2.5             | 0        | 0         | 0     |
| S    | after  | 51.3       | 52.6            | 46.2       | 2.6     | 21.1           | 13.3   | 4.6          | 48.9       | 2.3             | 1.7      | 0.3       | 0.2   |
| M    | before | 50.6       | 52.3            | 46.2       | 3.1     | 20.9           | 23.1   | 10.0         | 48.3       | 2.5             | 0        | 0         | 0     |
| M    | after  | 50.4       | 52.2            | 46.2       | 3.4     | 21.5           | 20.6   | 6.3          | 52.0       | 2.6             | 2.9      | 0.9       | 0.7   |
| L    | before | 49.9       | 50.8            | 48.3       | 1.8     | 22.7           | 43.3   | 15.3         | 57.8       | 2.5             | 0        | 0         | 0     |
| L    | after  | 50.9       | 52.0            | 46.9       | 2.1     | 23.4           | 39.1   | 13.1         | 61.9       | 2.8             | 9.5      | 1.9       | 1.8   |

Notes: the largest empty disc was already small (radius 2-3 cells) before:
by area no field was empty, the emptiness was in how things were spread.
The plazas keep a little more ground open on L maps. Generating a map takes
about 30 % longer (the cluster search floods the map per candidate).

## 5. Follow-ups

- Gate sites on S maps, so border gates and keymaster's tents appear there.
- The decorations' sand bias is weak on a crowded desert (M12's sand gets
  fewer decorations per cell than other ground); the test uses M19.
- Treasure clusters in start zones, placed alike for every start.
- More nooks for clusters (S maps get one or two).

[rmg]: https://vcmi.eu/developers/RMG_Description/
[tpl]: https://vcmi.eu/modders/Random_Map_Template
[tp]: https://sources.debian.org/src/vcmi/1.6.5%2Bdfsg-2/lib/rmg/modificators/TreasurePlacer.cpp
[zone]: https://sources.debian.org/src/vcmi/1.6.5%2Bdfsg-2/lib/rmg/Zone.cpp
[hota]: https://h3hota.com/en/template-format
[alt]: https://forum.vcmi.eu/t/h3-random-map-generator-alternative/1124
