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
- **Named maps were unchanged** by this bead: their configuration turned every
  part of it off (legacy clusters, no clusters of treasure, no clearings,
  ponds or plazas, no reordering). Bead bzc.102 gave the Ninefold Landfall
  the composition (section 6).

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
- Done in bead bzc.102: treasure clusters in start zones, placed alike for
  every start; more nooks for clusters.

## 6. Bead bzc.102: more clusters, the starts' own, the Ninefold Landfall

The user, again on the latest map (the Ninefold Landfall, which bzc.96 had
left on the old composition): "The latest map is still far too empty. In
homm you get clusters of resources guarded by a guardian. and artifacts.
sometimes more than one."

**More nooks** (`gen/hoards.ts`). Clusters were few (1.7, 2.9 and 9.5 a
map) because nooks ran out: about one wild zone in two found one. A guard
may now stand in a notch with walls at its sides as well as open floor (only
its front needs a way in), or be dug into the edge of a wood or range
itself; where the walls left standing would be untidy (a lone rock, a
corner-only join) the sides of its zone of control, then all of it, are
cut out of the edge, a small room with the guard at its mouth. Every loot
cell must be taken by a legal step from the guard or an open cell of its
zone of control, and a cut never opens a new way beside a pocket or a
corridor. The quick reach test looks at the open cells round a change (a
box of six cells; the whole map only when they do not join), so the search
can try many more sites in about the same time. Guards keep four cells
apart (was five), and the rates rose to 3.4, 2.6 and 3.8 clusters per 100
open cells (middle, neutral-town and Hold zones; were 2.2, 2 and 2.4).

**Richer treasure zones.** The middle zones and the Hold draw 3-4 resource
piles a cluster (2-4 elsewhere) and an artifact on 60 % (Hold 75 %) of them,
a second on 30 % (40 %), against 45 % and 25 % in the neutral towns' zones.

**The starts' own.** Every start gets one cluster of three resource piles
(two where one start has no nook for three; none where one has no nook at
all) between 0.8 and 1.4 days from its town (a wider ring if needed), with
no more than a few new walls, the same piles and the same guard for every
start. A cluster's things now stand in only for the zone's loose piles and
artifacts (the fill's chests, campfires and the rest stay).

**Named maps.** The Ninefold Landfall is generated with the composition
(`gen.composition`): its treasure clusters, clearings and ponds, on the
obstacle masses and passes of its authored base (the larger masses and the
plazas moved its passes and closed four of the ways between its starts),
with clusters but the starts' own two days or more (before roads) from
every start, so what a start reaches first stays as it was balanced. Its
edits were re-authored on that base: the Glove's pieces where they were,
the Pyramid and the Barrow, a gap beside a new pond and one quest gate gone
to keep the way from the west to the north, gold for the west and the
north, eight guarded sites gone round the northern start and seven Wonders
behind guards for the other two, eleven banks and four mines added. The
Keepers' Toll and the Hourglass Marches stay on the composition they were
drawn on: their key-and-gate valleys and Marvel clefts are drawn on exact
ground (a follow-up can re-author them the same way).

| Size |        | Land passable % | Visitable /100 | Clusters | Clearings | Ponds | ms (best of 3, seeds 1-10) |
| ---- | ------ | --------------- | -------------- | -------- | --------- | ----- | -------------------------- |
| S    | before | 52.6            | 21.1           | 1.7      | 0.3       | 0.2   | 26                         |
| S    | after  | 53.7            | 21.5           | 6.5      | 0.3       | 0.2   | 30                         |
| M    | before | 52.2            | 21.5           | 2.9      | 0.9       | 0.7   | 58                         |
| M    | after  | 52.9            | 22.0           | 9.8      | 0.9       | 0.7   | 57                         |
| L    | before | 52.0            | 23.4           | 9.5      | 1.9       | 1.8   | 168                        |
| L    | after  | 52.8            | 23.9           | 23.8     | 1.9       | 1.8   | 189                        |

Per zone (seeds 1-10, after): S 1.3 a neutral town's zone, 1.1 a middle
zone, 2.3 the Hold; M 1.9, 1.1 and 1.7; L 2.3, 2.1 and 3.2; and a start's
own on 9 S, 8 M and 10 L maps of 10.

The Ninefold Landfall: 25 clusters (3 the starts' own), 3 clearings and 2
ponds (none before); its fairness (`startFairness`, the named-map test's
bounds in brackets): nearest neutral town spread 0.44 days (< 0.75), mine
spreads wood 0.37, ore 0.28, gold 0.33, essence 0.56 (< 0.75), free loot
ratio 0.87 (> 0.85), free mines 1/1/1, sites ratio 0.76 (> 0.75), fights
ratio 0.87 (> 0.85), start-to-start 1.18 (< 1.2); before: 0.50, 0.22,
0.22, 0.14, 0.27, 0.96, 1/1/1, 0.79, 0.89, 1.17. Building it takes about
120 ms (was about 105).

## 7. Bead bzc.110: a way round every building; Mystery Bags

The user: "these buildings should be placed such that there is always a
path around them. they shouldn't obstruct passages (even if it would be
possible to pass by stepping on the shrine first). Stuff that you pick up
such as resources are exempt from this. they are allowed to be in the way",
and "there can be some special pickupable item that has a surprise artifact
in it but the usual artifact on adventure map should be fully visible."

**The rule** (`src/core/map/passages.ts`). A building is what the
pathfinder walks round (bead bzc.107): the entrance of a mine, dwelling,
site, bank or waystone that is not a pickup. Towns are destinations;
pickups, guards and gates may stand in a way. For every two open cells a
hero walks between with the entrances open, a walk exists that steps on no
building (pathfinder steps: eight ways, a diagonal barred only between two
walls; pickups count as taken). `findObstructions` also flags a building
reached only over another one. `tests/core/map/passages.test.ts` checks the
rule with the pathfinder's own `moveContext`, `isImpassableCell` and
`cutsCorner` on S 1-8, M 1-6, L 1-3 and every named map.

**Random maps** check it as each building is placed (`objects.waysRound`):
with its cells and every other entrance shut, the open cells that stepped
into its cells stay joined, in a window of two cells first and else over
the map (a search from every side at once that stops when the small side
runs out). An empty nook of up to three cells that only the building would
cut off, walled in and leaning on a wood or range, grows wood instead
(never a guard's cell, road, corridor or plaza). A single-cell building of
the fill with no such place tries a resource pile in its stead.

**Named maps** keep their bases (the edits name objects by place) and are
repaired after the edits (`keepWaysRound`), least change first: empty dead
ends behind a building grow wood; buildings move a few cells aside (same
ground, zone and stretch between guards and gates, held by their guard,
never a new footprint on a way between starts or within three days of a
start, as near each start as before where it can); a building trades
places with a pickup next to it where the pickup seals no way; a run of up
to three wood or rock cells opens a way round (never past a guard outside
its zone, a gate or a range); last, a move farther, leaving its guard
behind if it must (never a mine). The Keepers' Toll's oasis by the western
ore pit had no room in the home valley and is removed by an edit. The
known cases are gone: the Ninefold's corridor wells and banks, and its
quest gate (gates may close a way by design; the start-to-start ratio
stays 1.18, inside 1.2).

**Mystery Bags** (`objects.mystery`): a quarter of the loose Trinkets and
Wonders, half of those in treasure clusters and pockets, lie in a bag of the
same grade (`mysteryItem`, same cell and value, its guard holds the bag);
the rest, and every Marvel piece, consumable and strange thing, lie in full
view. Quests never name a bag or its artifact. The named maps have none.

| Size |        | Buildings in a way / map | Visitable /100 | Land passable % | Clusters | Bags | Loose artifacts | ms  |
| ---- | ------ | ------------------------ | -------------- | --------------- | -------- | ---- | --------------- | --- |
| S    | before | 36.9                     | 21.4           | 53.5            | 6.5      | 0    | 8.6             | 28  |
| S    | after  | 0                        | 20.5           | 53.3            | 6.5      | 1.6  | 6.6             | 30  |
| M    | before | 62.1                     | 21.9           | 53.0            | 10.6     | 0    | 11.7            | 52  |
| M    | after  | 0                        | 21.2           | 52.8            | 10.6     | 2.7  | 8.6             | 53  |
| L    | before | 163.8                    | 23.7           | 52.5            | 22.6     | 0    | 27.2            | 168 |
| L    | after  | 0                        | 23.0           | 52.3            | 22.6     | 5.4  | 21.9            | 175 |

Seeds 1-10, default players, means; ms best of five on a loaded machine.
The rule costs about 3 % of the visitable objects (narrow valleys hold
fewer sites). Named maps, buildings in a way before and after: the Keepers'
Toll 59 and 0, the Hourglass Marches 108 and 0, the Ninefold Landfall 131
and 0; building them takes about 55, 140 and 180 ms (were 36, 89 and 120:
the repair runs about 20, 47 and 60 ms). Their fairness stays inside the
named-map test's bounds (the Ninefold: sites ratio 0.76, fights 0.86,
start-to-start 1.18).

## 8. Bead bzc.129: the Cartographer's Folly, a terrain showcase

The user: "add another map to showcase all the terrain types". The
Cartographer's Folly (`cartographers-folly`, Large 72x72, two players: the
Realm in the north-eastern jungle, the Goblin Horde in the south-western
meadows) shows every ground: grass, steppe, jungle, badlands, wasteland,
snow, volcanic, sand, frosting, swamp and water (a sea on the northern
shore, the desert's twin oasis lakes and ponds), each landscape one region
of 200 cells or more with its own decorations and sites.

**Today's generator** (`gen.current`). The older named maps keep the
configuration they were authored on (`NAMED_CONFIG`: legacy clusters, no
plazas, no Mystery Bags, no lava, candy or swamp sites). This map is drawn on
the generator's defaults: larger masses, plazas, rare sites first, a way
round every building, Mystery Bags and every landscape's sites, with one zone
of each landscape forced (`landscapes`) and only these on top:

- `middleZones: 13`: five landscapes never border each other (sand beside
  snow reads as a mistake), so they need many wild zones; on the default 8-9
  of a two-player Large map no seed of 1500 placed all five.
- `townsBesideStarts` (the generator's new `zones.townsBesideStarts`, off on
  random maps, which draw as before): each start first gets a neutral town in
  the largest middle zone connected to it. The generator puts towns in the
  deepest zones, four or more days from either start on a two-player Large
  map, where the named-map fairness test wants one within two days.
- `secondaryShare: [0.14, 0.2]` (was 0.22-0.34): each landscape keeps more of
  its own ground (snow 211 to 236 cells, sand 219 to 255, lava 212 to 259).

Seed 2853 was picked from about 1200 that place all five landscapes, for its
spread (a ring of landscapes round the badlands and the Hold, the sea in the
north) and fairness. Its edits name the neutral towns (Treacle Hollow of the
Candy Kingdom by the sugar meadow, Margin's End of the Restless beside the
Realm, Compass Rose of the Realm beside the Horde), put a guarded Mystery Bag
in the sugar meadow's bare middle, an event beside each start's road and a
guarded one at the Hold, seven signs (each start's road and each wild land's
way in), and a guarded Umbrella of State for the Horde's start (it reached
71200 fight value within two days against 58800 for the Realm's).

Fairness (`startFairness`; the named-map test's bounds in brackets): nearest
neutral town 1.05 and 1.27 days (< 2, spread 0.21 < 0.75); mine spreads wood
0.38, ore 0.11, gold 0.43, essence 0.01 (< 0.75); free loot ratio 0.95
(> 0.85); free mines 2 and 2; sites ratio 0.97 (> 0.75); fights ratio 0.89
(> 0.85); start to start 6.4 days. 19 treasure clusters (each start's own
alike), 7 clearings, 2 ponds, 9 Mystery Bags, 34 artifacts, 38 banks, 188
guards, 74 object types.

[rmg]: https://vcmi.eu/developers/RMG_Description/
[tpl]: https://vcmi.eu/modders/Random_Map_Template
[tp]: https://sources.debian.org/src/vcmi/1.6.5%2Bdfsg-2/lib/rmg/modificators/TreasurePlacer.cpp
[zone]: https://sources.debian.org/src/vcmi/1.6.5%2Bdfsg-2/lib/rmg/Zone.cpp
[hota]: https://h3hota.com/en/template-format
[alt]: https://forum.vcmi.eu/t/h3-random-map-generator-alternative/1124
