# Naval layer: ships, sea battles, sea guardians and sea sites

Status: design for v0.2 (bead `border_marches-bzc.148`, 2026-11-27).
Implementation beads follow from section 14; bead 1's API (ships and sea
movement, bzc.149) is section 16.

The user: "Design naval stuff. getting on / off ships, naval combat, a bunch
of sea specific guardians and buildings and resources, some spells and
abilities. add it all".

This document adds a sea to the adventure map and a deck to the battle
field. It is written in the terms of [RULES_V2.md](RULES_V2.md), which
governs; it bends a few numbered rules and says which (section 2.9). Sister
documents: [GAME_DESIGN.md](GAME_DESIGN.md) (movement 7.1, zones of control
7.2, guards 8), [CONTENT_CREATURES.md](CONTENT_CREATURES.md),
[CONTENT_SPELLS.md](CONTENT_SPELLS.md),
[CONTENT_ARTIFACTS.md](CONTENT_ARTIFACTS.md),
[CONTENT_HEROES.md](CONTENT_HEROES.md),
[CONTENT_MAP_OBJECTS.md](CONTENT_MAP_OBJECTS.md), [ECONOMY.md](ECONOMY.md),
[MAP_COMPOSITION.md](MAP_COMPOSITION.md) and [AI.md](AI.md).

## 1. Scope

Heroes-inspired, not copied: a hero buys or finds a ship, sails it with its
own movement budget, lands on a shore, and fights at sea on a deck with
water between the two sides. Sea guardians swim; pirates swing across.

| In                                                                                  | Out (and why)                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| One kind of ship; shipyards in coastal towns and on coasts; moored boats on the map | Ship classes, cargo, crew upgrades: one ship keeps the state small and the art to three sprites |
| Boarding, sailing, landing, capturing and sinking ships                             | Several heroes on one ship: one hero per cell (RULES_V2 5.1) stays true at sea                  |
| Battles on a deck, in open water, at a pier and on a beach (four layouts)           | Ship-to-ship gunnery on the adventure map: every fight is a hex battle                          |
| Eight sea guardians and one summoned crab; three existing strays learn to swim      | A naval faction: a later bead if the user wants one                                             |
| Twenty sea and coastal objects; three shared harbour buildings for every town       | A new resource: pearls, coral, driftwood and fish pay the four existing resources (section 6)   |
| Four adventure spells, one battle spell, a Journey skill, eight artifacts           | Flying heroes: the game has no flight on the map; Lily Road and ferries are its water crossings |
| Water modes for the generator: None, Coast, Inland Sea, Islands; a named naval map  | Tides that change the map, frozen seas, sea towns                                               |

**No new noun or verb** (RULES_V2 1, law 1). The sea in battle is a
blocking ground kind with one exception named by an ability flag (section
3.1); the deck gun is a scheduled event like the fort tower; the beach
landing is a battle-start rule; Swing Across is Mist. Every condition used
already exists.

## 2. Ships on the adventure map

### 2.1 Terms

| Term                | Meaning                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sea**             | A body of water cells (4-connected, shallow and deep together) of at least `seaMin` cells: 60 on S, 80 on M and larger. Smaller water is a **lake** and stays scenery, as today |
| **Naval map**       | A map whose `map.naval` flag is true: the generator sets it when its water mode is not None and a sea exists (section 8). Old saves and maps without the flag are not naval     |
| **Shore cell**      | A passable land cell with a sea cell among its 8 neighbours                                                                                                                     |
| **Afloat / ashore** | A hero aboard a ship stands on a sea cell and is afloat; every other hero is ashore                                                                                             |
| **Ship**            | A state entry `{ id, x, y, owner }` on a sea cell, with at most one hero aboard. `owner` is a player index or `null`                                                            |
| **Moored ship**     | A ship with no hero aboard. It blocks its cell for other ships and is drawn with its sail furled                                                                                |
| **Dock**            | The sea cell where a shipyard puts the ships it builds                                                                                                                          |

On a map that is not naval nothing in this document applies: no ships, no
sea objects, no sea guards, and the naval spells, skill and artifacts are
never drawn (section 7.5).

### 2.2 Getting a ship

| Way                           | Rule                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shipyard** (town building)  | A coastal town (one with a dock, below) may build a Shipyard. In it the player buys a ship for **1000 gold and 10 wood** (500 gold and 5 wood with an Admiralty). The ship appears on the town's dock, owned and moored. Only when the dock is free |
| **Shipwright** (map building) | A neutral 3x2 building on a coast (section 5.3). Visiting flags it. The flag holder buys ships there at the same price, with a hero on its entrance; the ship appears on its dock                                                                   |
| **Moored boats**              | The generator moors a few neutral boats on coasts (section 8.6). Any hero may board one                                                                                                                                                             |
| **Capture**                   | Boarding a moored ship of another player takes it (2.5); winning a battle against a hero afloat takes its ship (3.7)                                                                                                                                |
| **Call the Boat**             | The adventure spell brings one of the player's moored ships to the hero, or builds one for the shipyard price when the player has none (section 7.1)                                                                                                |

**Docks.** A town's dock is computed when the game starts, not by the
generator, so maps keep their bytes: the sea cell nearest the town's
entrance by walking distance, at most four steps from it, that has a shore
cell next to it. Ties go to the lowest cell index. A town with no such cell
is **landlocked**: its Shipyard is shown greyed with that word. A
Shipwright's dock is the sea cell in front of its entrance, fixed by the
generator.

A ship is not a building and not a recruit: the one-building-per-day limit
does not apply, the free dock does. There is no cap on ships per player.

### 2.3 Boarding and landing

**Boarding.** A hero ashore boards by stepping from a shore cell onto a
moored ship's cell (a straight or diagonal step, never cutting a blocked
corner):

1. The step costs 100, or 141 diagonally, from the hero's land points.
2. The points left are **converted** to
   `floor(left x seaMax / landMax)`, where `seaMax` and `landMax` are the
   hero's two daily maxima (2.4). The hero is now afloat with those points.
3. The ship's owner becomes the hero's player (a neutral or another
   player's moored ship is taken; 2.5).

**Landing.** A hero afloat lands by stepping onto a free passable shore
cell next to its ship:

1. Without Seafaring: the hero lands with **0 movement points**. Landing
   ends its walk for the day.
2. With Seafaring rank 1 or more: its sea points are converted to land
   points the other way round (`floor(left x landMax / seaMax)`) and the
   step costs the shore cell's ordinary land cost (GAME_DESIGN 7.1, with
   native terrain and Trailcraft).
3. The ship stays where it was, moored, still owned by the hero's player.

A landing cell must be free and not a stop cell of something else: a pickup
cannot be landed on (it is taken from the ship, 2.6), a building's entrance
can (the landing then visits it, as any walk onto an entrance does), and a
cell in a land guard's zone of control can (the landing stops there and the
guard attacks, as on land). A path may contain any number of boardings and
landings; the path preview draws an anchor on each boarding and a ring with
"lands: day ends" on each landing that ends the day.

### 2.4 Sailing

**Step costs.** A ship moves in 8 directions over sea cells.

| Step                            | Straight | Diagonal | Notes                                                                            |
| ------------------------------- | -------: | -------: | -------------------------------------------------------------------------------- |
| Sea (shallow or deep)           |      100 |      141 | The one cost at sea; no native terrain, no Trailcraft                            |
| Along a current (stretch, 2.4)  |       50 |       71 | Both cells on the same current and the step in its direction                     |
| Against or across a current     |      100 |      141 | Currents only ever help                                                          |
| Lake, land, a moored ship       |        - |        - | Impassable to a ship (landing is a step off the ship, 2.3)                       |
| Diagonal between two land cells |        - |        - | Not allowed: a ship never squeezes between two diagonal coasts (GAME_DESIGN 7.1) |

**Sea movement points per day.** A hero afloat at the start of the day gets
sea points instead of land points:

```text
seaMax = floor(1500 x (100 + sea percentages) / 100) + sea flat bonuses
seaMax = min(3000, seaMax), minus any Borrowed Day debt
```

| Source                         | Bonus                                                        |
| ------------------------------ | ------------------------------------------------------------ |
| Seafaring rank 1 / 2 / 3       | +10% / +20% / +30%                                           |
| Captain's Tricorne, the Locket | +15% each                                                    |
| Lighthouse (town building)     | +300 for each of the player's heroes, once however many      |
| Lighthouse (map site, flagged) | +200 each, at most three counted (+600)                      |
| Fair Wind                      | +200 + 50 x Power now, at most 700, once a day (section 7.1) |

The ship carries the army, so the slowest creature's Speed does not matter
at sea, and land bonuses (Wayfaring, boots, Stables, Oasis) do not apply.
`landMax` keeps its RULES_V2 3.9 formula. Both maxima are computed at the
start of the day and fixed for it, so conversions are exact. Borrowed Day,
Saved Hour and every other "gain or lose points now" rule act on the points
the hero has in its current element.

**Currents (stretch).** A current is a line of sea cells with a direction,
drawn as faint moving arrows in code (no sprite). A step from one current
cell to the next in its direction costs 50 (71 diagonally): a road at sea.
The generator lays one or two per sea zone on Islands and Inland Sea maps
(section 8.6).

**Whirlpools** are sea teleports (section 5.6): a ship that enters one
comes out at its twin and the army's weakest stack loses half its
creatures, unless the hero has Seafaring rank 2.

### 2.5 Ownership, capture and sinking

| Event                                              | What happens to the ship                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| The hero lands                                     | The ship stays moored, owned by the hero's player                                       |
| Any hero boards a moored ship                      | It becomes that hero's player's (a neutral boat or an enemy's unattended ship is taken) |
| A hero afloat is defeated by a hero (any battle)   | The winner's player takes the ship: it stays on its cell, moored, flagged to the winner |
| A hero afloat is defeated by neutrals, or retreats | The ship sinks (it leaves the map)                                                      |
| A hero afloat is dismissed                         | The ship stays moored, owned by the player                                              |
| Scuttle                                            | An empty ship within reach sinks (section 7.1)                                          |
| The player is eliminated                           | Its moored ships become neutral                                                         |

A ship never fights on its own: a moored ship cannot be attacked, only
boarded or scuttled. Ships are seen like heroes: a ship on an explored cell
is drawn with its owner's sail colour (RULES_V2 5.10), and a moored ship
remembers nothing about who last sailed it.

### 2.6 What a hero afloat can do

| Action                     | Afloat                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visit a sea building       | Step onto its entrance (a sea cell), as on land (RULES_V2 5.6)                                                                                             |
| Take a pickup              | From any next cell, sea or land: a pickup on a sea cell blocks that cell for ships; a pickup on a shore cell can be taken from a ship beside it            |
| Fight a sea guard          | Step into its zone of control or click it (section 2.7)                                                                                                    |
| Attack across the shore    | A hero afloat may attack a neutral stack or an enemy hero on an adjacent land cell: a **beach landing** battle (3.2). It stays aboard whatever the outcome |
| Meet                       | Two heroes of one player on adjacent cells meet as on land (RULES_V2 5.3), afloat or ashore                                                                |
| Enter a town               | No: towns are entered from land. Land first                                                                                                                |
| Dig, recruit at a dwelling | Only at sea dwellings' entrances (Siren Grotto); no digging at sea                                                                                         |
| Cast adventure spells      | Any, within each spell's own requirement                                                                                                                   |

A hero ashore may attack a hero afloat, or a sea stack, on an adjacent sea
cell: a **pier** battle (3.2). So a ship moored beside a hostile coast is not
a safe harbour.

### 2.7 Zones of control by element

A neutral stack's zone of control (GAME_DESIGN 7.2) covers only the cells
next to it **of its own element**: a stack on a sea cell guards the sea
cells around it, a stack on land the land cells around it. So a ship sails
past a land guard on the beach, and a hero walks the shore past a serpent in
the shallows. Clicking a stack of the other element from next to it is an
attack across the shore (2.6). A pickup's own cell counts by its element
for the "fought for" rule of RULES_V2 5.6.

### 2.8 Sight and fog

At sea a hero sees the same disc as on land (RULES_V2 3.9, radius 6), plus
+2 with Seafaring rank 2 and +2 with the Brass Sextant, within the cap of 12. Water hides nothing: sea guards, sea objects, currents, whirlpools and
ships are drawn on every explored cell as they are now (RULES_V2 5.10).
A flagged map Lighthouse reveals a disc of radius 10 around itself when
visited.

### 2.9 Rules this layer bends

| Rule                                               | Change                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAME_DESIGN 7.1, water impassable                  | Impassable on foot; ships sail it (2.4); Lily Road crosses shallow water (7.1)                                                                                  |
| GAME_DESIGN 7.2, zone of control                   | Covers only cells of the stack's own element (2.7)                                                                                                              |
| GAME_DESIGN 7.2, "the hero is always the attacker" | Unchanged. Against a sea stack from land, or a land stack from a ship, the hero still attacks                                                                   |
| RULES_V2 1.5, blocking ground                      | A blocking kind may name one ability flag whose bearers enter it: `sea` lets `swimmer` stacks walk, stand and be pushed there (3.1)                             |
| RULES_V2 1.12, battleground                        | The defender's cell still decides, now with a layout: sea cell gives a deck, open water or pier; land cell beside an attacking ship gives a beach landing (3.2) |
| RULES_V2 3.9, movement points                      | A second daily maximum for heroes afloat (2.4) and the conversions of 2.3                                                                                       |
| RULES_V2 5.6, pickups and buildings                | Unchanged, applied at sea; buildings may have a sea entrance (5.1)                                                                                              |
| RULES_V2 8.3, "not in v0.2: boats"                 | Superseded by this document                                                                                                                                     |

## 3. Naval battles

### 3.1 The sea in battle and Swimmer

**Ground kind `sea`.** Class `blocking`, school none, no size, no clock,
with one exception: it does not block a stack whose creature has the
**Swimmer** flag. For a swimmer a sea hex is open ground; for every other
stack it is a rock. In exact terms:

- A walk, push or pull of a non-swimmer stops before a sea hex (as before a
  rock); a swimmer walks, is pushed and pulled through and onto sea hexes.
- A teleport (Mist, Rotors, Swing Across) and a summon need a free hex: a
  sea hex is free only to a swimmer or a summon of a swimming creature.
- A blocking feature is never replaced (RULES_V2 1.5), so nothing burns,
  grows or lies on the water: fire, brambles, mist and remains are refused
  there, and a swimmer that dies on a sea hex leaves no remains (it sinks).
- Area spells and abilities reach stacks on sea hexes like any other.
- Hexes are not features: a gangplank, a deck or a pier hex is simply a hex
  with no feature, drawn over the deck texture.

**Swimmer** (new glossary keyword, an ability flag as Turret's `pointBlank`
is): "It may walk into, through and stand on sea hexes." On a land field a
swimmer is an ordinary walker. Swimmers: the seven sea guardians below
except the Corsair, the summoned Hermit Crab, and three strays that already
live in water: the Bog Leech, the Deep-Sea Diver and the Lagoon Lurker.

### 3.2 Layouts

The battle field stays 15 x 11 with deployment in columns 0 and 14
(GAME_DESIGN 9.1). The defender's cell decides the layout (RULES_V2 1.12):

| Attacker | Defender                                                 | Layout                                                                       |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Afloat   | Afloat (a hero), or a sea stack that is not all swimmers | **Deck to deck**                                                             |
| Afloat   | A sea stack of swimmers only                             | **Open water**                                                               |
| Ashore   | Afloat, or any sea stack                                 | **Pier**: deck to deck or open water with the attacker's half on land        |
| Afloat   | Ashore (a hero or a land stack)                          | **Beach landing**: the defender's land field with the Wet Landing rule (3.4) |
| Ashore   | Ashore                                                   | Land, unchanged                                                              |

A non-swimming sea stack is a pirate crew (Corsairs): it stands on its own
ship. A hero ashore attacking a hero in a coastal town is the town battle of
RULES_V2 5.5, unchanged.

**Deck to deck.** Columns 0-5 are the attacker's deck, 6-8 the sea, 9-14
the defender's deck. Three **gangplanks** cross the sea, one in each band of
rows {1, 2}, {4, 5, 6} and {8, 9}, the row chosen by the battle seed; a
gangplank is its row's three sea hexes left without the `sea` feature. Each
deck has one **mast** (ground kind `mast`, blocking, drawn tall) on a seeded
hex in columns 2-4 (attacker) or 10-12 (defender), rows 3-7, and 0-1
**crates** (rock, drawn as crates) elsewhere on the deck outside the
deployment column. The seeded MVP obstacles are not used.

```text
col  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4
r0   A . . . . . ~ ~ ~ . . . . . D
r1   A . . . . . ~ ~ ~ . . . . . D
r2   A . . . . . = = = . . . . . D     = gangplank (band 1-2)
r3   A . . . . . ~ ~ ~ . . . . . D
r4   A . . M . . ~ ~ ~ . . . . . D     M mast
r5   A . . . . . = = = . . c . . D     = gangplank (band 4-6), c crate
r6   A . . . . . ~ ~ ~ . . M . . D
r7   A . c . . . ~ ~ ~ . . . . . D
r8   A . . . . . ~ ~ ~ . . . . . D
r9   A . . . . . = = = . . . . . D     = gangplank (band 8-9)
r10  A . . . . . ~ ~ ~ . . . . . D
```

**Open water.** Columns 0-4 are the attacker's deck with one mast and no
crates; columns 5-14 are sea, with 2-4 seeded **reefs** (rock, blocking for
all) in columns 6-12. The swimmers deploy in column 14 on the water.

```text
col  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4
r0   A . . . . ~ ~ ~ ~ ~ ~ ~ ~ ~ D
r2   A . . . . ~ ~ R ~ ~ ~ ~ ~ ~ D     R reef
r5   A . M . . ~ ~ ~ ~ ~ ~ R ~ ~ D
r8   A . . . . ~ ~ ~ ~ R ~ ~ ~ ~ D
```

Non-swimmers on the deck wait for the swimmers to come aboard or to the
rail, shoot them, or step across nothing: this is "repel boarders". Every
sea guardian is a melee stack, so it must come to the rail to fight (section
4.4 keeps it that way), and the deck gun (3.3) works for the ship.

**Pier.** As deck to deck or open water, but the attacker's half (columns
0-5, or 0-4) is land: the attacker's cell's ground texture, no mast, 0-2
rocks. The gangplanks become jetties.

**Beach landing.** The defender's ordinary land field (its terrain, seeded
obstacles) with the Wet Landing battle-start rule (3.4) on the attacker.

### 3.3 Deck guns

Every side that fights from a ship has a **deck gun**: a scheduled event at
every round start from round 2, drawn on the timeline as a cannonball tile,
that deals **Harm 20 + 15 x the hero's Seafaring rank** (+20 with an
Admiralty, section 5.8) to the **strongest** enemy stack. It is the fort
tower of RULES_V2 5.5 in every way: a visible event, Harm (no Strike), and
it stops when its side holds no living stack.

| Side                                     | Deck gun                 |
| ---------------------------------------- | ------------------------ |
| A hero afloat (deck to deck, open water) | Yes                      |
| A pirate crew (Corsairs on their ship)   | Yes, Harm 40             |
| A hero ashore at a pier                  | No                       |
| A hero afloat in a beach landing         | No: the crew went ashore |
| Swimmers                                 | No                       |

The ship's own side's gun fires at the side's strongest enemy as the
selector reads it at the event (RULES_V2 0.2), and a Turned stack is an
enemy of the side it currently fights against, as everywhere.

### 3.4 Wet Landing

A **beach landing** adds one battle-start rule, resolved as visible steps
after the artifacts' rules and before Morale and Luck (RULES_V2 4.6):
**every attacking stack starts Drenched 25, clock 2**. It reuses Drenched
(Harm taken x 125%) and so meets its users: Soaked Powder, Chain Lightning
and the Rime Walrus's Cold Front (a doubled Frozen gate). Seafaring rank 3
removes it.

### 3.5 Deployment and Vanguard

Deployment rows are unchanged. Vanguard's rearranging (CONTENT_HEROES 1)
may place a stack only on a hex it could stand on: a non-swimmer never on a
sea hex. Within those limits the columns of the rule are the same.

### 3.6 Retreat and the round limit

Retreat is unchanged (RULES_V2 1.12); a hero that retreats from a ship
loses its ship (2.5). The round limit is unchanged: after round 15 the side
with more fight value left wins. A guard that never reaches the deck would
therefore be a stalemate decided by fight value; the battle AI makes sea
guards advance (section 12) and every sea guardian is melee, so this is the
exception, not the play.

### 3.7 After a naval battle

| Result                                     | Adventure map                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Attacker afloat wins against a sea stack   | The stack is removed; the hero stays afloat on its cell                                                                    |
| Attacker afloat wins against a hero afloat | The defender leaves the map (RULES_V2 5.2); its ship stays moored on its cell, now the winner's player's (2.5)             |
| Attacker ashore wins at a pier             | As above: the beaten hero's ship becomes the winner's, moored; the winner stays ashore and may board it next               |
| Beach landing won                          | The land stack is removed or the hero leaves the map; the winner stays aboard and must still land to take a town or a mine |
| A hero afloat loses (any battle)           | The hero leaves the map; its ship sinks if the winner is neutral, otherwise goes to the winner's player                    |

### 3.8 Engine and rendering changes

| Area                               | Change                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `battle/standard.ts`, ground kinds | `sea` (blocking, `passableFor: "swimmer"`), `mast` (blocking, its own art); crates and reefs are `rock` with a look hint                                                                                                                                                                                                                                         |
| Walk, push, pull, teleport, summon | One test, "may this stack occupy this hex", replaces "is this hex blocked" in the walk graph, push and pull lines, teleport and summon landing; the AI's move generator and threat map use the same test                                                                                                                                                         |
| `battle/setup.ts`                  | `BattleSetup.layout` (`land`, `deck`, `open-water`, `pier-deck` or `pier-water`; default `land`) places the features of 3.2 from the seed (`deriveSeed(seed, "battle-layout")`) instead of the MVP obstacles; `deckGuns` per side                                                                                                                                |
| Scheduled events                   | `naval:deck-gun` beside the fort tower's event                                                                                                                                                                                                                                                                                                                   |
| Battle-start rules                 | Wet Landing as a side rule in the setup, before Morale and Luck                                                                                                                                                                                                                                                                                                  |
| Creature data                      | `swimmer: true` flag; the eight guardians, the Hermit Crab and their abilities (section 4)                                                                                                                                                                                                                                                                       |
| `game/battle.ts`                   | Chooses the layout from the two cells and their heroes' ships; applies 3.7; result carries `shipTaken` / `shipSunk`                                                                                                                                                                                                                                              |
| Battle render (`render/battle`)    | Ground "deck" (a plank texture) under the whole field; sea hexes drawn as one water region with the map's water code (ripples, glints) and a rail along deck edges except at gangplanks; masts tall and row-sorted; a deck gun sprite at the back rail of each ship side; swimmers on sea hexes drawn with their lower fifth below a waterline and a ripple ring |
| Battle UI                          | The deck gun on the timeline (cannonball tile) and in the rehearsal like the tower; the layout's name on the field banner ("Deck to deck", "Open water", "Pier", "Beach landing")                                                                                                                                                                                |

## 4. Sea guardians

### 4.1 Stats

Stats are on the scale of GAME_DESIGN 8.1; FV by GAME_DESIGN 8.2 (computed
exactly). Every creature occupies one hex. Neutral guards have no hero and
no birthright.

| Creature           | Tier | Swimmer | HP  | Atk | Def | Dmg | Speed | Shots | FV   | Leaves  | Cannot bear       |
| ------------------ | ---- | ------- | --- | --- | --- | --- | ----- | ----- | ---- | ------- | ----------------- |
| **Jellyfish**      | 1    | yes     | 6   | 4   | 2   | 2   | 5     | -     | 45   | nothing | -                 |
| **Drowned Sailor** | 2    | yes     | 15  | 6   | 5   | 3   | 4     | -     | 104  | bones   | Heartened, Shaken |
| **Giant Crab**     | 2    | yes     | 16  | 5   | 9   | 3   | 4     | -     | 118  | corpse  | -                 |
| **Corsair**        | 3    | no      | 24  | 9   | 6   | 5   | 6     | -     | 192  | corpse  | -                 |
| **Siren**          | 3    | yes     | 20  | 8   | 5   | 5   | 6     | -     | 165  | corpse  | -                 |
| **Hammerhead**     | 4    | yes     | 50  | 13  | 7   | 10  | 7     | -     | 447  | corpse  | -                 |
| **Sea Serpent**    | 5    | yes     | 95  | 14  | 11  | 16  | 7     | -     | 877  | corpse  | -                 |
| **Kraken**         | 6    | yes     | 170 | 17  | 15  | 26  | 5     | -     | 1729 | corpse  | -                 |

Reference points: Bog Leech 104 and Loan Shark 116 (tier 2), Rigger 223 and
Gumshoe 263 (tier 3), Lagoon Lurker 469 (tier 4), Rime Walrus 868 (tier 5),
Beanstalk Giant 1707 (tier 6). The sea is fast (four guardians at Speed 6-7)
and soft-skinned except the crabs: the deck gun and the shooters on deck are
the ship's answer.

### 4.2 Abilities

One ability each, one sentence in the grammar.

| Creature           | Ability                | Rule                                                                                                                                | Kinds           |
| ------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Jellyfish**      | **Stinging Bell**      | It starts each battle bearing Thorned of size equal to its count (at most 20), clockless.                                           | makes Thorned   |
| **Drowned Sailor** | **Dead Weight**        | Its melee Strike adds Slowed 1, clock 2.                                                                                            | makes Slowed    |
| **Giant Crab**     | **Carapace**           | Shots deal half damage to it (the Skeletons' Bony under a crab's name).                                                             | -               |
| **Corsair**        | **Swing Across**       | The Corsairs' walk is a teleport to any free hex within their Speed, as the Vampires' Mist.                                         | -               |
| **Siren**          | **Siren Song**         | Once per battle, instead of attacking, it pulls an enemy stack within 6 hexes 3 hexes toward itself and adds Mollified 30, clock 2. | makes Mollified |
| **Hammerhead**     | **Blood in the Water** | Its Strikes are x 150% against a stack whose count is below its count at deployment.                                                | -               |
| **Sea Serpent**    | **Coil**               | Its melee Strike adds Stuck, clock 2.                                                                                               | makes Stuck     |
| **Kraken**         | **Many Arms**          | After its melee Strike, it makes a special Strike at x 50% against every other enemy stack adjacent to it.                          | -               |

Notes, in the terms of RULES_V2:

- **Swing Across** is the Mist rule with the sea rule of 3.1: a sea hex is
  not free to a Corsair, so pirates leap from deck to deck over the water
  but never land in it. On land it is plain Mist: Corsairs are good guests.
- **Siren Song** is the Rigger's Tow with a Mollified rider. A pull stops
  before a sea hex for a non-swimmer, so a lured stack ends at its own
  rail, where the Siren and her friends meet it.
- **Blood in the Water** reads counts, never HP (RULES_V2 1.8 forbids only
  Harm that reads HP; a Strike condition on a visible count is the
  Lamplighter's shape). A stack revived to its deployment count is safe
  again.
- **Many Arms** makes `special` Strikes (not retaliated, once per action,
  RULES_V2 1.8); they trigger on-strike rules like any Strike. The Kraken is
  the sea's Beanstalk Giant: worst when surrounded.
- **Coil** adds a maker of Stuck outside the Candy Kingdom, and the Ship's
  Anchor (7.4) another.

### 4.3 The summoned Hermit Crab

| Creature        | Made by                 | HP  | Atk | Def | Dmg | Speed | FV  | Swimmer | Ability                 |
| --------------- | ----------------------- | --- | --- | --- | --- | ----- | --- | ------- | ----------------------- |
| **Hermit Crab** | Conch of the Deep (7.4) | 10  | 4   | 8   | 2   | 4     | 72  | yes     | **Carapace** (as above) |

Summoned: no remains, no XP, gone when the battle ends (RULES_V2 1.7).

### 4.4 Where they live

"Sea" means the cells of a sea (2.1); every sea guardian guards only sea
cells. Hire cost is FV x 1.5, rounded to 5 gold (CONTENT_CREATURES 3).

| Creature           | Terrain                           | Ring | Dwelling             | Weekly stock | Hire cost (gold) |
| ------------------ | --------------------------------- | ---- | -------------------- | ------------ | ---------------- |
| **Jellyfish**      | Sea                               | 0-1  | wild                 | -            | -                |
| **Drowned Sailor** | Sea                               | 0-2  | wild (Shipwreck)     | -            | -                |
| **Giant Crab**     | Sea                               | 0-2  | wild (Coral Grotto)  | -            | -                |
| **Corsair**        | Sea (as a pirate ship)            | 1-2  | Pirate Cove          | 3            | 290              |
| **Siren**          | Sea                               | 1-2  | Siren Grotto         | 3            | 250              |
| **Hammerhead**     | Sea                               | 1-3  | wild                 | -            | -                |
| **Sea Serpent**    | Sea                               | 2-3  | wild                 | -            | -                |
| **Kraken**         | Sea                               | 3    | wild (Kraken's Deep) | -            | -                |
| Bog Leech          | Jungle, Wasteland, Swamp, **Sea** | 0-2  | wild                 | -            | -                |
| Deep-Sea Diver     | Jungle, Wasteland, Swamp, **Sea** | 1-2  | wild                 | -            | -                |
| Lagoon Lurker      | Jungle, Wasteland, Swamp, **Sea** | 1-3  | wild                 | -            | -                |

- Sea guards are picked and sized exactly as land guards (GAME_DESIGN 8.3,
  CONTENT_MAP_OBJECTS 2): by the cell's terrain (Sea) and ring, a count of
  about 5-50, split into up to three battle stacks. Distance for the ring
  is the start's path cost, sailing included (a landing that ends the day
  counts as the rest of that day).
- **Pirate ships.** A Corsair guard is drawn as a pirate ship with its crew
  (one sprite). It is a non-swimming sea stack, so its battle is deck to
  deck with its deck gun (Harm 40). A pirate guard may be mixed with
  swimmers by the generator only as Corsairs plus Sirens (the pirates'
  sirens), still deck to deck.
- **Melee only.** No sea guardian has shots. A shooting swimmer would sit
  in the water out of a melee army's reach until the round limit (3.6).
  Future sea content keeps this rule; a swimmer with shots needs a design
  for the open-water stalemate first.

### 4.5 Admission rule

No new condition kind. The guardians and the naval artifacts add makers and
users to existing kinds (CONTENT_SPELLS 2.3 keeps the tally):

| Kind      | New makers                                                   | New users |
| --------- | ------------------------------------------------------------ | --------- |
| Thorned   | Jellyfish                                                    | -         |
| Slowed    | Drowned Sailor                                               | -         |
| Mollified | Siren                                                        | -         |
| Stuck     | Sea Serpent, Ship's Anchor (Wonder)                          | -         |
| Shielded  | Ship's Anchor                                                | -         |
| Fired Up  | Corsair's Cutlass (Wonder)                                   | -         |
| Hastened  | Corsair's Cutlass                                            | -         |
| Drenched  | Wet Landing (rule), The Drowned Man's Locket (cursed Wonder) | -         |

## 5. Sea and harbour objects

### 5.1 Conventions

As CONTENT_MAP_OBJECTS 1 and 2 (values in gold-equivalents, guard FV 60% of
value, free below 1500), with one addition: each object names where its
entrance is.

- **Sea**: the entrance is a sea cell, visited by a ship (2.6). Its other
  cells may be sea or a rock islet the generator makes for it.
- **Coastal**: the entrance is a shore cell, visited from land; the object
  stands with its back to the sea.
- Weight 0 in the land fill: sea objects are placed only by the sea fill of
  a naval map (section 8.6). A map that is not naval has none and is
  generated exactly as before.

### 5.2 Producers

| Object              | Entrance | Footprint | Visit rule                        | Reset | Reward              | Value | Weight |
| ------------------- | -------- | --------- | --------------------------------- | ----- | ------------------- | ----- | ------ |
| **Pearl Bed**       | Sea      | 2x2       | Visiting flags it (RULES_V2 5.6). | Flag  | +1 essence each day | 5000  | 2      |
| **Fishing Village** | Coastal  | 2x2       | Visiting flags it.                | Flag  | +500 gold each day  | 4000  | 3      |

### 5.3 Dwellings and services

| Object           | Entrance | Footprint | Visit rule                                                                                                                                    | Reset                                   | Reward             | Value          | Weight     |
| ---------------- | -------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ | -------------- | ---------- |
| **Pirate Cove**  | Coastal  | 2x2       | A dwelling: visiting flags it; the flag holder hires Corsairs with a hero on its entrance. Corsairs keep watch beside it (an ordinary guard). | Stock 3, refilled on day 1 of each week | Corsairs, 290 each | 3000 (guarded) | 2          |
| **Siren Grotto** | Sea      | 2x2       | A dwelling, as above, for Sirens; hired from a ship on its entrance.                                                                          | Stock 3, refilled weekly                | Sirens, 250 each   | 3000 (guarded) | 2          |
| **Shipwright**   | Coastal  | 3x2       | Visiting flags it; the flag holder buys ships here (2.2) with a hero on its entrance; each ship appears on its dock.                          | Flag                                    | Ships for sale     | 1500           | rule (8.6) |

### 5.4 Visitable sites

| Object                  | Entrance | Footprint                  | Visit rule                                                                                                                                                                     | Reset                                  | Reward                         | Value | Weight     |
| ----------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------ | ----- | ---------- |
| **Buoy**                | Sea      | 1x1                        | +1 Morale until the hero's next battle ends (the sea's Rally Camp).                                                                                                            | Each visit; does not stack with itself | +1 Morale                      | 300   | 5          |
| **Mermaid Rock**        | Sea      | 1x1                        | +1 Luck until the hero's next battle ends (the sea's Wishing Well).                                                                                                            | Each visit; does not stack with itself | +1 Luck                        | 300   | 4          |
| **Lighthouse**          | Sea      | 1x1 on a rock islet of 2x2 | Visiting flags it and reveals a disc of radius 10 around it; the flag holder's heroes afloat get +200 sea movement each day (at most three lighthouses count).                 | Flag                                   | +200 sea movement a day, sight | 1500  | rule (8.6) |
| **Sirens' Rock**        | Sea      | 2x2                        | Each hero once may listen: +2000 XP, and each stack of its army loses a tenth of its creatures, rounded down. The card shows the exact losses first; sailing on costs nothing. | Once per hero                          | XP for creatures               | 1500  | 2          |
| **Shrine of the Tides** | Sea      | 1x1                        | Each hero once: learns its seeded naval spell (one of the five of section 7) as a page if it can, otherwise as a scroll.                                                       | Once per hero                          | One sea spell                  | 1500  | 3          |
| **Ferry Landing**       | Coastal  | 1x1, in pairs              | A hero ashore that steps on it is carried to its twin across the water for 300 movement points (at least 300 needed); no ship needed. Both ends on land.                       | Each visit                             | Travel                         | 0     | rule (8.6) |

### 5.5 Banks

Bank sizes and guard sizing are CONTENT_MAP_OBJECTS 4's (small 2500,
medium 6500, large 15000; guard 60% of the prize, up to three stacks).

| Object            | Entrance | Footprint | Visit rule                                                                                                                                                     | Reset    | Reward                                                                                                                  | Value               | Weight              |
| ----------------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| **Shipwreck**     | Sea      | 2x2       | A bank: a battle against the drowned crew (small: Drowned Sailors and Jellyfish; medium: Drowned Sailors; large: Drowned Sailors and Hammerheads); open water. | One-time | Small: 2000 gold, 5 wood. Medium: a Trinket, 3500 gold, 10 wood. Large: a Wonder, a Trinket, 6000 gold, 20 wood         | 2500 / 6500 / 15000 | 4                   |
| **Coral Grotto**  | Sea      | 2x2       | A bank: a battle against the reef's keepers (small: Giant Crabs; medium: Giant Crabs and Sirens; large: Giant Crabs and a Sea Serpent or two); open water.     | One-time | Small: 3 essence, 5 ore, 250 gold. Medium: 6 essence, 10 ore, 2000 gold. Large: a Wonder, 12 essence, 20 ore, 1000 gold | 2500 / 6500 / 15000 | 3                   |
| **Kraken's Deep** | Sea      | 3x2       | A bank: a battle against the Kraken and its Hammerheads; open water.                                                                                           | One-time | A Marvel piece, a Wonder and 5000 gold                                                                                  | 16000               | rule: at most 1/map |

Pearls (essence) and coral (ore) are the grotto's; ship's timbers (wood) and
coin (gold) the wreck's. Every prize equals its value on the shared scale
(essence 500, ore 150, wood 100, a Trinket 2000, a Wonder 5000, a piece
6000), as the other banks.

### 5.6 Treasure and teleports

| Object                  | Entrance | Footprint     | Visit rule                                                                                                                                                                                                     | Reset      | Reward                                          | Value       | Weight     |
| ----------------------- | -------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- | ----------- | ---------- |
| **Flotsam**             | Sea      | 1x1 pickup    | Taken from a next cell (RULES_V2 5.6); amounts seeded and shown on hover.                                                                                                                                      | One-time   | 5-10 wood; or 4-6 wood and 300-500 gold         | 500-1000    | 10         |
| **Sea Chest**           | Sea      | 1x1 pickup    | The hero chooses gold or XP; the rich chest of rings 2-3 holds a Trinket and 500 gold.                                                                                                                         | One-time   | 1500 gold or 1000 XP; or a Trinket and 500 gold | 1500 / 2500 | 6          |
| **Castaway**            | Sea      | 1x1 pickup    | A raft with a survivor: a seeded stray stack worth FV 400-900 of a hireable stray joins if the army has room (otherwise the hero takes 1000 XP instead).                                                       | One-time   | Strays, or 1000 XP                              | 1500        | 3          |
| **Message in a Bottle** | Sea      | 1x1 pickup    | Marks on the map the 5x5 area of one seeded buried cache, or the cell of a Marvel piece if none is left (the Roadside Inn's rumour, free).                                                                     | One-time   | A rumour                                        | 500         | 3          |
| **Moored Boat**         | Sea      | 1x1           | An empty neutral ship (2.2); becomes a ship in the state when the game starts.                                                                                                                                 | -          | A ship                                          | 1000        | rule (8.6) |
| **Whirlpool**           | Sea      | 1x1, in pairs | A ship that steps on it comes out on its twin, if free, for no extra movement; the army's weakest stack (lowest stack FV, RULES_V2 0.2) loses half its creatures, rounded down; nothing with Seafaring rank 2. | Each visit | Travel at a price                               | 0           | rule (8.6) |

The pickups are drawn floating (a bob and a ripple ring in code) and keep
the pickup seat of classes/map-objects.md.

### 5.7 Harbour buildings in towns

Three buildings every town shares (ECONOMY 6), buildable only in a town
with a dock (2.2). Names differ by faction; costs and effects do not.

| Building       | Cost                                | Requires              | Effect                                                                                                              |
| -------------- | ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Shipyard**   | 2000 gold, 10 wood                  | A dock                | Buy ships, 1000 gold and 10 wood each, onto the dock (2.2)                                                          |
| **Lighthouse** | 1500 gold, 5 ore                    | Shipyard              | +300 sea movement a day for every hero of the player afloat; one town Lighthouse counts however many the player has |
| **Admiralty**  | 3000 gold, 5 wood, 5 ore, 2 essence | Lighthouse, Town Hall | Ships here cost 500 gold and 5 wood; the deck guns of every hero of the player deal +20 Harm (one Admiralty counts) |

| Faction           | Shipyard       | Lighthouse          | Admiralty          |
| ----------------- | -------------- | ------------------- | ------------------ |
| The Realm         | Royal Docks    | Harbour Light       | Admiralty          |
| The Restless      | Bone Wharf     | Corpse-Candle Tower | Ghost Fleet Office |
| The Goblin Horde  | Raft Yard      | Bonfire Beacon      | Pirate King's Tent |
| The Candy Kingdom | Gumdrop Marina | Peppermint Light    | Licorice Admiralty |
| The Deepforge     | Dry Dock       | Lamp Engine         | Ironclad Board     |

The AI and the town screen treat a landlocked town's harbour buildings as
absent: the town tree shows them greyed with "landlocked".

## 6. Resources: none new

The sea pays the four existing resources, each in its own costume:

| Sea thing  | Pays    | Where                                              |
| ---------- | ------- | -------------------------------------------------- |
| Pearls     | Essence | Pearl Bed (+1 a day), Coral Grotto                 |
| Coral      | Ore     | Coral Grotto                                       |
| Driftwood  | Wood    | Flotsam, Shipwreck                                 |
| Fish, coin | Gold    | Fishing Village (+500 a day), Shipwreck, Sea Chest |

Why not a fifth resource: every cost table, the marketplace, the AI's
valuations, the resource bar and the economy sanity pass are built on four;
a sea-only resource would also be a resource half the maps never have. The
Pearl Bed is drawn with violet-white pearls so it reads as essence
(ART_DIRECTION: essence is violet).

## 7. Spells, skill and artifacts

### 7.1 Adventure spells

Once per day per hero, school rank for the tier, mana as RULES_V2 2.3; one
scaling number each (RULES_V2 2.8).

| Spell             | School | Tier | Mana | Other cost                      | Rule                                                                                                                                                                                                                                                  | Scales     |
| ----------------- | ------ | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Call the Boat** | Accord | 2    | 7    | 1000 gold, 10 wood if it builds | The hero, ashore on a shore cell, calls its player's nearest moored ship within 10 + 5 x P cells to a free sea cell next to it. If the player has none in reach, a new ship is built there for the shipyard price (refused without the money).        | 10 + 5 P   |
| **Scuttle**       | Hush   | 2    | 7    | -                               | One moored ship (any owner) within 6 + P cells of the hero sinks.                                                                                                                                                                                     | 6 + P      |
| **Lily Road**     | Bloom  | 3    | 10   | -                               | Until the day ends this hero may cross shallow water (not deep, not a whirlpool) at 200 a cell (283 diagonally) on lily pads, but may not stop on water: a path must end on land, and water cells in a sea stack's zone of control cannot be crossed. | -          |
| **Fair Wind**     | Storm  | 1    | 4    | -                               | The hero, afloat, gains 200 + 50 x P sea movement points now, at most 700.                                                                                                                                                                            | 200 + 50 P |

Lily Road is Green Road's water twin, made simpler: a walker never stands on
water, so no battle ever happens on a lily pad and no day-end rule is
needed.

### 7.2 Battle spell

| Spell          | Tier | School | Mana | Target           | Effect                                                                                                                                                                | Fuel doubles | Kinds                         |
| -------------- | ---- | ------ | ---- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------- |
| **Tidal Wave** | 4    | Storm  | 14   | One row of hexes | Every stack in the row, friend and foe, takes Harm 36 + 15 P and is pushed 2 hexes along the row away from the caster's edge of the field (hazards on the way apply). | The Harm     | uses fire, brambles (as Gust) |

A row is a straight hex line (odd rows offset, GAME_DESIGN 9.1). Stacks are
resolved in timeline order (RULES_V2 1.10), so a pushed stack may stop
against one not yet pushed. At sea the push stops non-swimmers at the rail:
the wave never drowns anyone. It works on land too.

### 7.3 Seafaring (Journey skill)

The tenth Journey skill (CONTENT_HEROES 1 lists nine; RULES_V2 3.4 allows
9-10).

| Skill         | Heroes analogue | Rank 1                                                                        | Rank 2                                                                                   | Rank 3                                     | Might | Magic |
| ------------- | --------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ | ----- | ----- |
| **Seafaring** | Navigation      | +10% sea movement; landing is an ordinary step, not the end of the day (2.3). | +20%; +2 sight afloat; whirlpools take nothing; your deck gun deals 15 more Harm a rank. | +30%; your army never makes a Wet Landing. | 4     | 3     |

The deck gun's "+15 a rank" is already in 3.3's formula. On a map that is
not naval, Seafaring's weight is 0 in every offer (it is never drawn), and
a held Seafaring (a hero carried over in the pool) does nothing there.

### 7.4 Artifacts

| Artifact                     | Slot   | Grade         | Value | Rule                                                                                            | Kinds                    |
| ---------------------------- | ------ | ------------- | ----- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| **Captain's Tricorne**       | Head   | Trinket       | 2000  | +15% sea movement.                                                                              | -                        |
| **Brass Sextant**            | Pocket | Trinket       | 2000  | +2 sight while afloat.                                                                          | -                        |
| **Mermaid's Comb**           | Pocket | Trinket       | 2000  | +1 Luck.                                                                                        | (Lucky through Luck)     |
| **Ship in a Bottle**         | Pocket | Wonder        | 4500  | Once a day the hero may cast Call the Boat without mana or school rank, at Power at least 2.    | -                        |
| **Ship's Anchor**            | Shield | Wonder        | 4500  | Battle start: your slowest stack starts Shielded 4, clock 3, and Stuck, clock 2.                | makes Shielded, Stuck    |
| **Conch of the Deep**        | Pocket | Wonder        | 5000  | Item act: summon Hermit Crabs worth 120 HP on a free hex (12 crabs; a sea hex is free to them). | summons                  |
| **Corsair's Cutlass**        | Weapon | Wonder        | 5000  | Battle start: your fastest stack starts Fired Up 3 and Hastened, both clock 2.                  | makes Fired Up, Hastened |
| **The Drowned Man's Locket** | Neck   | cursed Wonder | 4000  | +15% sea movement and +2 Defense; your strongest stack starts Drenched 50, clockless.           | makes Drenched           |

The Ship in a Bottle uses the existing `adventure-magic` effect (as the
spell-granting items do). The Locket follows The Albatross's pattern: worth
wearing, with a drawback that is a visible condition (RULES_V2 4.3).

### 7.5 Where naval content appears

To keep every existing map's seeded draws unchanged, naval content is a
**sea pool** that only naval maps draw from:

- The five spells enter a town's guild draw (RULES_V2 2.9) and the School
  Shrine and Scholar draws only on a naval map; the Shrine of the Tides
  draws only from them.
- The eight artifacts enter loose artifacts, banks, Mystery Bags and the
  Tollhouse only on a naval map; the sea banks and the Sea Chest prefer them
  (half of their Trinket and Wonder draws).
- Seafaring has weight 0 off naval maps (7.3).

The implementation must filter the pools before drawing (an item of weight
0 must not consume a random number), so that maps that are not naval keep
their fingerprints byte for byte.

## 8. Map generation

### 8.1 Water modes

The setup screen gains **Water**: None, Coast (the default), Inland Sea,
Islands, after Heroes III's "water content". The named maps set their own.

| Mode           | Sizes    | Water share | Shape                                                                                                                                            | Ships needed?                       |
| -------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **None**       | all      | ponds only  | Today's generator with `coastChance` 0 and no lakes over `seaMin`                                                                                | No                                  |
| **Coast**      | all      | 8-15%       | Today's coast and lakes; a coast of `seaMin` or more becomes a sea with naval content                                                            | No: every zone is reachable on foot |
| **Inland Sea** | M, L, XL | 25-35%      | The zones form a ring round a central sea; the Hold's zone is an island in it; some neighbouring zones also have a sea link                      | For the Hold's island only          |
| **Islands**    | M, L, XL | 45-60%      | Every start zone is an island (two starts may share one on XL); middle zones are islands or island groups; the Hold's zone is the central island | Yes, from day 1                     |

S maps (36x36) are too small for a navy to pay: Coast only, and their
coasts are rarely large enough to be seas. The sizes are bead bzc.147's
Heroes sizes (S 36, M 72, L 108, XL 144); every per-size number below has
an XL entry.

### 8.2 Seas as zones

The zone graph (gen/zones.ts) gains **sea zones**: organic regions of water
made by the same warped Voronoi, with a tier like land zones (by distance
from the starts, sailing). A **coast link** joins a land zone to a sea zone
it touches; a **sea link** joins two land zones whose only way is by ship;
a **strait** joins two sea zones through a channel 1-3 cells wide.

- Inland Sea: one to three sea zones in the middle; the land ring keeps the
  usual land connections; the Hold's island has only coast links.
- Islands: one sea zone per pair of neighbouring islands, joined by straits;
  every island has coast links only.
- `tidyWater` keeps islands that are zones (it fills only stray islets
  smaller than `minBody x 4`, as today).

### 8.3 Shores and landing

Every island and every land zone with a coast link keeps **at least three
landing cells** (shore cells that are open, not entrances, not in a guard's
zone of control) spread along its coast, at least one within a day of the
zone's centre. The borders stage leaves gaps in coastal ranges for them
(the frame along the map edge stays). A zone whose coast is all cliff is
not given a coast link.

### 8.4 Access guarantees

| Mode       | Guarantee                                                                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coast      | Each sea has one Shipwright on its coast in a middle zone, and 1-2 moored boats; towns beside it get docks                                                                                                                                                                                         |
| Inland Sea | Each start town is placed with a dock; one Shipwright per start zone's coast within 1 day of the town; one moored boat per start within 1 day; one Shipwright on the ring for each two middle zones                                                                                                |
| Islands    | Each start town has a dock and **starts with its Shipyard built**; one moored boat at each start's dock; each start island also holds the usual start kit (ECONOMY 4) on land. Middle islands hold their own mines; the generator never puts a start's guaranteed essence spring on another island |

The fairness test (`startFairness`) adds two measures with the named-map
bounds: **days to open sea** (the start town to its first sea cell beyond
its own dock zone, spread < 0.5 day) and **sea guard strength on the first
strait** (spread < 25% of FV).

### 8.5 Guarded straits

A strait is a pass at sea: the generator puts a sea guard in its narrowest
cell, sized by the sea zone it opens (GAME_DESIGN 8.3, the zone's tier), as
it guards passes between land zones. Coast links are never guarded (a ship
can land anywhere along a coast); the guards of an island's treasure stand
on its land as usual. On Islands maps the strait into the Hold's sea zone is
the strongest guard on the sea (a Kraken stack when the ring allows).

### 8.6 Sea content

After the land objects, a **sea fill** places sea objects by value in each
sea zone from their own random streams (`sea-objects`, `sea-place`), with
the land rules for buildings (a way round every building, never on the
only channel; beads bzc.95, bzc.110):

| Item               | Rule                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Density            | About 1.5 visitable objects per 100 sea cells (land is about 3.5, CONTENT_MAP_OBJECTS 7): the sea is open water with islands of interest                                         |
| Lighthouses        | One per sea zone that has a coast, on a rock islet near the shore                                                                                                                |
| Shipwrights        | Section 8.4                                                                                                                                                                      |
| Moored boats       | Section 8.4, plus one in each middle zone with a sea link                                                                                                                        |
| Whirlpools         | In pairs on Inland Sea and Islands maps (M 1 pair, L 1-2, XL 2-3): both ends in different sea zones, the exit no deeper (tier) than the entrance, a day or more from every start |
| Ferry Landings     | Pairs across a channel of 2-5 cells between two land zones that have no land link, on Coast and Inland Sea maps (M 0-1, L 1, XL 1-2)                                             |
| Currents (stretch) | One or two per sea zone on Inland Sea and Islands maps, 6-12 cells long, along the zone's long axis                                                                              |
| Kraken's Deep      | At most one per map, L and XL Islands or Inland Sea maps, in the deepest sea zone                                                                                                |
| Pirate Coves       | On a coast of a middle zone, at most one per sea                                                                                                                                 |
| Guards             | Every sea object worth 1500 or more gets a sea guard on its approach, sized as on land                                                                                           |

Water cells keep the decorations stage clear (no props at sea); a few
passable sea decorations (a gull on a post, floating kelp, a bottle) may
come with the art bead's decorations.

### 8.7 Determinism

Water None and Coast without a sea draw exactly what today's generator
draws for the same seed and size. Coast with a sea changes those maps on
purpose (the sea fill, docks): the bead that ships the sea fill updates the
fixed-seed fingerprints in the same commit. The named maps keep `naval:
false` (the Cartographer's Folly's northern sea stays scenery) except the
showcase of section 9.

## 9. Showcase map: The Saltglass Isles

`saltglass-isles`, Medium 72x72 (bzc.147's Medium), two players, Water:
Islands, authored like the Cartographer's Folly (generator defaults plus a
few forced pieces and edits):

- **Two home islands** of matching size: the Realm in the north-west, the
  Candy Kingdom in the south-east, each with its Shipyard built, a moored
  boat at the dock and the full start kit on land.
- **A ring of six middle islands**: a pirate island (Pirate Cove guarded by
  Corsairs, a Fishing Village), a reef island (Coral Grotto, Siren Grotto,
  Mermaid Rock), a lighthouse island with a Shipwright, a jungle island, a
  snowy islet with a Walrus Rookery (the sea's cold corner), and a swamp
  island linked to its neighbour by a Ferry Landing pair.
- **The Shipwreck Graveyard**: three Shipwrecks (small, medium, large) in
  one sea zone among reefs, guarded by Drowned Sailors.
- **The Hold's island** in the centre, behind the Kraken's Deep strait (the
  strongest sea guard) with a Lily Road lagoon on its far side: shallow
  water a Bloom hero can cross from the swamp island instead.
- One whirlpool pair (north to south), currents round the ring, a Buoy and
  a Shrine of the Tides on each half, Flotsam and Sea Chests along the
  routes, two Messages in a Bottle pointing at buried caches, signs at each
  start's dock.

Fairness bounds as the named-map test (section 8.4's two new measures
included). The map is the naval layer's browser smoke target (muted, under
the standing rule) and its screenshot set.

## 10. Art

Direction: [ART_DIRECTION.md](../art/ART_DIRECTION.md) (bold chibi, black
outlines, sun at the bottom left, never mirrored) and
[classes/map-objects.md](../art/classes/map-objects.md) for sites. The sea
is chunky and cute: round boats like bath toys, fat sails, friendly
monsters with big eyes (the Kraken is a huge, smug purple octopus, not a
horror). Ids are the names above in kebab case.

### 10.1 Ships

| Asset         | Canvas (px) | Notes                                                                                                                                                                                                                               |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship, sailing | 96 x 88     | A plump little sloop seen from the low three-quarter view, round hull, one fat white sail and a pennant; a tiny captain at the wheel. The sail and pennant are recoloured to the player colour in code (as the planned flag sprite) |
| Ship, moored  | 96 x 88     | The same hull with the sail furled and an anchor line; pennant recoloured, grey for neutral                                                                                                                                         |
| Pirate ship   | 96 x 88     | A darker, patched sloop with a black sail and a skull pennant, a few crew peeking over the rail (the Corsair guard on the map)                                                                                                      |

The hero is not drawn aboard (the captain stands in for it), as in Heroes;
the hero's portrait shows on hover. One facing only; the bob and the wake
are code.

### 10.2 Every asset

Endpoints and costs as the Deepforge plan (Pixen about US$0.01 a call,
`generate-image-v2` about US$0.08).

| Asset                                                                                                          | Count | Size (px)                                     | Studio set         | Endpoint            | Calls (est.) |
| -------------------------------------------------------------------------------------------------------------- | ----: | --------------------------------------------- | ------------------ | ------------------- | -----------: |
| Sea guardian sprites                                                                                           |     8 | 56 x 80; Sea Serpent 72 x 88; Kraken 88 x 104 | `sea-units`        | Pixen               |        16-24 |
| Hermit Crab sprite                                                                                             |     1 | 56 x 80                                       | `sea-units`        | Pixen               |          2-3 |
| Guardian portraits                                                                                             |     9 | 48 x 48 crops                                 | (from the masters) | -                   |            0 |
| Ships (sailing, moored, pirate)                                                                                |     3 | 96 x 88                                       | `ships`            | Pixen               |          6-9 |
| Sea sites (Pearl Bed, Siren Grotto, Sirens' Rock, Shipwreck x3, Coral Grotto x3)                               |     9 | 128 x 128 (2x2)                               | `sea-objects`      | `generate-image-v2` |         9-12 |
| Kraken's Deep                                                                                                  |     1 | 200 x 144 (3x2)                               | `sea-objects`      | `generate-image-v2` |          1-2 |
| Coastal sites (Fishing Village, Pirate Cove; Shipwright 3x2)                                                   |     3 | 128 x 128; 200 x 144                          | `sea-objects`      | `generate-image-v2` |          3-4 |
| 1x1 sea sites (Buoy, Mermaid Rock, Lighthouse on its islet, Shrine of the Tides, Whirlpool rim, Ferry Landing) |     6 | 64 x 64 (lighthouse 64 x 96)                  | `sea-objects`      | `generate-image-v2` |          6-8 |
| Sea pickups (Flotsam, Sea Chest, Castaway, Message in a Bottle)                                                |     4 | 40 x 40                                       | `sea-objects`      | `generate-image-v2` |          4-5 |
| Harbour town buildings (3 per faction x 5)                                                                     |    15 | 64 x 64                                       | `chunky-buildings` | `generate-image-v2` |         8-10 |
| Battle: deck plank texture                                                                                     |     1 | 12-cell period, as classes/grounds.md         | `grounds-deck`     | Pixen               |          2-3 |
| Battle: mast, crates, deck gun                                                                                 |     3 | mast 48 x 112, crates 56 x 48, gun 48 x 40    | `battle-props`     | `generate-image-v2` |          3-4 |
| Icons: Swimmer keyword, Seafaring, 5 spells, 8 artifacts, deck-gun timeline tile                               |    16 | 32 x 32 (tile 16 x 16)                        | `icons-*`          | `generate-image-v2` |        16-18 |

Total about 26-39 Pixen and 50-63 `generate-image-v2` calls, roughly US$5,
plus the sounds of section 11. The sea hexes, the waterline crop, ripples,
wakes, the whirlpool's spin, currents, the lily pads of Lily Road and the
pickups' bob are drawn in code. The whirlpool sprite is only its rocky rim
and foam; the water inside spins in code.

Prompts, per subject (bold chibi, one oversized feature each):

| Id               | Subject                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `jellyfish`      | a round pink jellyfish with a sleepy smile and a skirt of curly stinging ribbons                         |
| `drowned-sailor` | a soggy skeleton sailor in a striped shirt and a tattered cap, seaweed on his bones, holding a boat hook |
| `giant-crab`     | a big orange crab with one huge claw raised, shell like a helmet, stalk eyes                             |
| `corsair`        | a cheerful pirate in a red bandana and eyepatch with a cutlass, a rope over her shoulder                 |
| `siren`          | a mermaid with long sea-green hair and a shell comb, mid-song, tail curled                               |
| `hammerhead`     | a grinning hammerhead shark leaping, the hammer head the oversized feature                               |
| `sea-serpent`    | a long teal sea serpent in three coils with a frilled crest                                              |
| `kraken`         | a huge smug purple octopus with a sailor's tattoo on one arm, arms curling up from the water             |
| `hermit-crab`    | a tiny hermit crab peeking out of a spiral shell                                                         |

## 11. Sounds

Through `tools/art/sfx.mjs` (ElevenLabs), at the level of SOUND.md's cues;
about 10 calls.

| Cue          | Sound                                       | When                                 |
| ------------ | ------------------------------------------- | ------------------------------------ |
| `board`      | A wooden creak and a small splash           | Boarding                             |
| `land`       | A splash and feet on wet sand               | Landing                              |
| `sail-step`  | A soft oar dip or a wave lap (two variants) | Map steps afloat (as the land steps) |
| `ship-built` | Hammering and a bell                        | A ship bought                        |
| `sink`       | A gurgle and bubbles                        | A ship scuttled or sunk              |
| `whirlpool`  | A swirling rush                             | Whirlpool travel                     |
| `deck-gun`   | A small cannon boom                         | The deck gun's event                 |
| `buoy-bell`  | A buoy bell                                 | Buoy and Lighthouse visits           |
| `siren-song` | A short eerie "la-la"                       | Siren Song                           |
| `tidal-wave` | A rising wave crash                         | Tidal Wave's delivery                |

## 12. AI

**Adventure AI** (src/core/ai):

- **Reach** (`reach.ts`) plans over land and sea: a target across water is
  reachable if the hero has a ship, can board one (own, neutral or an
  enemy's moored), can buy one at a town Shipyard or flagged Shipwright, or
  can Call the Boat. A landing that ends the day costs the rest of the day.
- **Buying a ship**: when the best targets the hero cannot reach on foot
  outweigh 1000 gold and 10 wood plus the days to the dock (the same value
  per day the planner already uses), and the player keeps one ship per hero
  that needs one. On Islands maps the first hero takes the starting boat on
  day 1 if its island's targets are taken or guarded beyond its strength.
- **Harbour building**: Shipyard ranks with the Marketplace when the town
  has a dock and the map is Inland Sea or Islands (with the Tavern's hero
  logic: a second hero needs a second ship); Lighthouse after the first
  ship; Admiralty late.
- **Sea objects** valued by the same table as land ones (value, guard,
  weekly and per-hero resets); a Whirlpool's loss is a cost in fight value,
  skipped with Seafaring 2; Sirens' Rock taken when the XP is worth more
  than the creatures by the planner's FV-to-XP rate.
- **Denial**: Scuttle an enemy's moored ship within reach of an AI town or a
  target the enemy is racing for; never scuttle its own.
- **Safety**: a ship next to a hostile shore can be stormed (2.6); the
  threat map counts enemy heroes ashore as threats to adjacent sea cells.
- **Knowledge**: the AI reads only explored cells (RULES_V2 5.10), sea
  included; the starting boat and Shipyard are its own.

**Battle AI** (src/core/battle/ai.ts, its fast mode and intents):

- Move generation and the threat map use the "may occupy" test of 3.8, so
  swimmers path through water and walkers see the gangplanks as the only
  ways across.
- **Sea guards advance**: neutral swimmers score approaching the enemy
  deck, never waiting in the water for the round limit (section 3.6).
- **Deck gun**: a scheduled event in the threat map, like the tower and the
  Deepforge's shells: the strongest stack expects the Harm.
- **Gangplanks**: holding a gangplank's deck end with a sturdy stack and
  shooting the crossing is scored by the existing reach and threat terms;
  no special rule.
- **Swing Across** is Mist; **Siren Song** is scored as the Rigger's Tow
  (pulling a shooter off its line, or a stack next to its friends); **Many
  Arms** scores each hex by the enemy stacks adjacent to it; **Blood in the
  Water** prefers wounded stacks; **Coil** prefers fast enemy melee stacks.
- **Hero AI**: Tidal Wave on the row that pushes the most enemy fight value
  into worse hexes (a hazard, the rail), Fuel as any Storm page.

## 13. Balance plan

The numbers are hand-set to the existing scales. Confirming them needs
simulations, which under the standing rule need the **user's go-ahead**.

**What to measure and tune, in order:**

1. Open water against all-melee armies: win rate and rounds of a melee
   hero's ship against swimmer guards of equal FV, with and without the deck
   gun. Levers: the deck gun's base Harm (20), reefs, the deck's width (5
   columns), a swimmer's Speed.
2. Deck to deck: attacker and defender at 45-55% for equal armies; the
   three gangplanks against shooter-heavy factions (the Deepforge, the
   Realm's Longbowmen). Levers: four gangplanks; sea width 3.
3. Landing ending the day without Seafaring: Islands games' pace (the day a
   player first lands on a middle island; target day 3-5 on M). Lever: land
   at half the remaining points instead.
4. Prices: ship 1000 gold + 10 wood, Shipyard 2000 + 10 wood, Lighthouse,
   Admiralty; the Pearl Bed (essence on a map type with few springs).
5. Seafaring's weight against the other Journey skills on naval maps; the
   whirlpool's half-stack loss.
6. The Kraken (1729 FV, Many Arms) against a tier 6 of each faction; the
   Siren's pull; the Corsairs' Mist at their price as guests.

**Method.** Battle sims (`npm run sim:battles`) gain the layouts and the
guardians; the AI-vs-AI harness gains Islands and Inland Sea maps at M.
Results become a BALANCE.md section; changed numbers come back here.

## 14. Implementation beads

Numbered in build order. "After" names prerequisites that must be
published first. Art beads take ids, sizes and subjects from this document
and can start at once.

| #   | Bead                               | Profile                                          | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | After            | Art calls (est.)                 |
| --- | ---------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------- |
| 1   | Ships and sea movement core        | cross-cutting (state, save version, pathfinding) | `map.naval`, sea bodies (2.1); ship state and the Moored Boat object kind; boarding, landing and the conversions (2.3); sea movement maxima and step costs (2.4, currents excluded); ownership, capture and sinking outside battle (2.5); zones of control by element (2.7); pickups and sea entrances taken from ships (2.6); path planning across boardings and landings with the preview marks; a code-drawn placeholder ship; save migration. Focused tests on hand-built maps | -                | 0                                |
| 2   | Harbour: shipyards and docks       | logic + ui                                       | Docks (2.2), the Shipyard, Lighthouse and Admiralty in every faction's tree with names (5.7), buying ships in towns, the Shipwright map object and its purchase dialog, landlocked greying                                                                                                                                                                                                                                                                                         | 1                | 0                                |
| 3   | Sea objects and pickups            | logic                                            | The twenty objects of section 5 in `objectTypes.ts` and `mapObjects.ts` (weight 0 in the land fill), visit rules, hover cards, the whirlpool and ferry teleports, currents as data (stretch)                                                                                                                                                                                                                                                                                       | 1                | 0                                |
| 4   | Sea guardians data                 | logic (unit tier: battle abilities)              | The eight guardians and the Hermit Crab, their abilities (Stinging Bell, Dead Weight, Carapace, Swing Across, Siren Song, Blood in the Water, Coil, Many Arms), the `swimmer` flag and glossary keyword, Sea in the three strays' terrains, guard rings and dwellings data; abilities tested on land fields                                                                                                                                                                        | -                | 0                                |
| 5   | Naval battlefield                  | cross-cutting (battle engine)                    | The `sea` and `mast` kinds and the "may occupy" test in walk, push, pull, teleport, summon and the battle AI's move generator; the four layouts (3.2); deck guns; Wet Landing; layout choice and 3.7's results in `game/battle.ts`; battle rendering of deck, water region, rails, masts, guns and swimmers' waterline; battle AI rules of section 12 (sea guards advance, deck gun in the threat map). Focused tests on hand-built battles                                        | 1, 4             | 0                                |
| 6   | Naval spells, Seafaring, artifacts | logic                                            | Call the Boat, Scuttle, Lily Road, Fair Wind, Tidal Wave; Seafaring; the eight artifacts; the sea pool gating of 7.5 with fixed-seed tests that a non-naval map's guild, offers and loot are unchanged                                                                                                                                                                                                                                                                             | 5                | 0                                |
| 7   | Generator: seas, islands, sea fill | cross-cutting (generator, fingerprints)          | Water modes and the setup option (8.1), sea zones, coast and sea links, straits (8.2), landing cells (8.3), access guarantees and the two fairness measures (8.4), strait guards (8.5), the sea fill (8.6), per-size numbers for S, M, L, XL; fingerprints updated on purpose                                                                                                                                                                                                      | 2, 3, 4, bzc.147 | 0                                |
| 8   | Naval AI                           | logic                                            | Adventure AI of section 12 (reach over sea, buying ships, harbour build order, sea object values, Scuttle denial, ship safety) and the hero AI's Tidal Wave; battle-AI ability scoring (Siren Song, Many Arms, Blood in the Water, Coil). Focused AI tests on hand-built states                                                                                                                                                                                                    | 5, 6, 7          | 0                                |
| 9a  | Sea guardian art                   | asset-only                                       | Nine sprites and their portrait crops; registered in the unit art tables                                                                                                                                                                                                                                                                                                                                                                                                           | -                | 18-27 Pixen                      |
| 9b  | Ships and sea object art           | asset-only                                       | Three ship sprites, every sea and coastal site, the pickups (10.2), registered in `map-objects.ts`                                                                                                                                                                                                                                                                                                                                                                                 | -                | 6-9 Pixen, 23-31 v2              |
| 9c  | Harbour town buildings and icons   | asset-only                                       | Fifteen harbour building sprites; the sixteen icons                                                                                                                                                                                                                                                                                                                                                                                                                                | -                | 24-28 v2                         |
| 9d  | Battle deck art and sounds         | asset-only                                       | The deck texture, mast, crates and deck gun; the ten sounds of section 11                                                                                                                                                                                                                                                                                                                                                                                                          | -                | 2-3 Pixen, 3-4 v2, 10 ElevenLabs |
| 10  | The Saltglass Isles                | logic                                            | The named map of section 9 on the Islands generator, its edits and fairness numbers, its screenshots (muted browser)                                                                                                                                                                                                                                                                                                                                                               | 7, 8, 9a-9d      | 0                                |
| 11  | Naval balance                      | cross-cutting                                    | Section 13's runs and tuning; numbers back here. Simulations only with the user's go-ahead                                                                                                                                                                                                                                                                                                                                                                                         | 8                | 0                                |

**Parallel work.** Beads 1 and 4 start together (4 needs no ships). Once 1
publishes, 2 and 3 run in parallel; 5 runs once 1 and 4 are in. The four
art beads run beside all of these from the start, in separate worktrees.
Bead 7 also waits for bzc.147 (map sizes, in progress), which is changing
the generator's per-size tables. Integration stays serial. Every bead
updates the documents it changes (GAME_DESIGN 7.1's water row, RULES_V2
8.3's "not in v0.2: boats", CONTENT_CREATURES, CONTENT_SPELLS 2.3 and 4,
CONTENT_HEROES 1, CONTENT_ARTIFACTS, CONTENT_MAP_OBJECTS, ECONOMY 6, SOUND,
the art class docs).

## 15. Notable calls

| Call                                                                                                    | Why                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One kind of ship, one hero per ship, no ship upgrades                                                   | Heroes' boat; one hero per cell holds; three sprites; harbour buildings carry the upgrades instead                                                                                    |
| Boarding is an ordinary step; landing ends the day unless the hero has Seafaring                        | Heroes II's landing cost makes an amphibious attack visible a day ahead; the conversions of Heroes III keep partial days fair; Seafaring gets a reason to exist                       |
| Sea movement is a fixed 1500 base, not the army's slowest Speed                                         | The ship carries the army; slow armies (the Deepforge) are not punished twice                                                                                                         |
| Zones of control only cover their own element                                                           | No land battle against a serpent, no sea battle against a beach troll by accident; crossing elements is always a choice (an attack across the shore)                                  |
| A hero ashore may storm a ship beside the shore                                                         | Heroes III's untouchable boat next to your town is a loophole; the pier layout makes it a fair fight                                                                                  |
| Four layouts: deck to deck, open water, pier, beach landing                                             | Each pairing of where the two sides stand gets a field that shows it; all fit the 15 x 11 field and deployment columns                                                                |
| The sea in battle is a blocking ground kind with a Swimmer exception                                    | No new noun or verb: rocks already block, Mist already jumps, pushes already stop; one flag decides who swims                                                                         |
| Three gangplanks in seeded rows, three sea columns                                                      | Melee armies cross in a turn or two; choke points make shooters and area spells matter at sea without shutting melee out                                                              |
| Deck guns as a scheduled Harm event (20 + 15 a Seafaring rank)                                          | The fort tower's shape; it gives a ship's side something against swimmers it cannot reach                                                                                             |
| Every sea guardian is melee                                                                             | A shooting swimmer in open water would stall a melee army until the round limit                                                                                                       |
| Eight guardians: Jellyfish, Drowned Sailor, Giant Crab, Corsair, Siren, Hammerhead, Sea Serpent, Kraken | Every guard ring has two or more; each ability reuses an existing condition or rule (Thorned, Slowed, Bony, Mist, Tow and Mollified, a count test, Stuck, Stomp-like special Strikes) |
| The Bog Leech, Deep-Sea Diver and Lagoon Lurker learn to swim and guard seas too                        | They already live in water; more variety in sea guards for no art                                                                                                                     |
| No new resource: pearls are essence, coral ore, driftwood wood, fish gold                               | Four resources run every table, the AI and the marketplace; a sea-only resource would be absent from most maps                                                                        |
| Harbour buildings are shared (Shipyard, Lighthouse, Admiralty), named per faction                       | ECONOMY 6's pattern; five factions times three sprites is the only faction cost                                                                                                       |
| Docks are computed when the game starts                                                                 | Existing maps keep their bytes; a town is coastal by geometry, not by a generator flag                                                                                                |
| Naval spells, Seafaring and sea artifacts are drawn only on naval maps                                  | A dry map never offers a useless skill or spell, and its seeded draws stay byte for byte                                                                                              |
| Lily Road never lets a walker stop on water                                                             | No battle on a lily pad, no day-end rule; Green Road's twin, simpler                                                                                                                  |
| Water modes None, Coast, Inland Sea, Islands; S maps Coast only                                         | Heroes III's water setting; a navy does not pay on 36 x 36                                                                                                                            |
| On Islands maps each start has its Shipyard built and a boat at the dock                                | No start is stranded on day 1; the race for the middle islands starts at once                                                                                                         |
| The Cartographer's Folly stays not naval; the Saltglass Isles is the naval showcase                     | The terrain showcase's fingerprints stay; a map built for ships shows them better                                                                                                     |
| Ferry Landings instead of a flying spell                                                                | A Heroes "fly" does not exist here; a ferry crosses a channel without a navy and is placed only where land zones have no land link                                                    |
| The Kraken is a smug purple octopus, the drowned are soggy and cheerful                                 | Pulp and cute, never grim (GAME_DESIGN 1)                                                                                                                                             |

**Open questions for the user** (nothing blocks the beads):

- A naval faction (pirates, merfolk) would use all of this; it is not
  proposed here.
- Whether landing should cost the rest of the day (chosen) or half the
  remaining points; bead 11 measures it.

## 16. Bead 1's API (bzc.149): ships and sea movement core

What the later beads build on. Everything is inert unless `map.naval` is
true: on a dry map no cell is sea, no hero is afloat, `state.ships` is
absent, `moveContext` has no `naval` part and every search, step and
save is exactly as before.

### 16.1 State and map

| Item                             | Where                    | Meaning                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GameMap.naval?: boolean`        | `src/core/map/types.ts`  | The naval flag (2.1). `validateMap` accepts object entrances on water on a naval map (sea sites, moored boats) and refuses a boat on land                                                                                   |
| `MapObjectKind "boat"`           | `src/core/map/types.ts`  | A moored boat object (5.6, `BOAT_KIND`); `data.owner` optional (default neutral). Becomes a ship at the game start; never drawn, visited or blocking as an object. Bead 3 adds its catalogue row                            |
| `ShipState { id, x, y, owner }`  | `src/core/game/types.ts` | A ship. **Aboard is derived**: a hero is aboard when it is alive and stands on the ship's cell (only heroes afloat stand on sea cells). A ship with a hero aboard moves with it; a teleported or dead hero leaves it moored |
| `GameState.ships?`, `shipsMade?` | `src/core/game/types.ts` | Present on naval states; ids are `ship-<n>` from `shipsMade`                                                                                                                                                                |
| `HeroState.seaMaxMp?`            | `src/core/game/types.ts` | Today's sea maximum, fixed at the day start and on hiring. `hero.mp` is in sea points afloat, land points ashore; `hero.maxMp` stays the land maximum                                                                       |
| Events                           | `GameEvent`              | `ship-boarded` (from: the last owner), `ship-landed` (endsDay), `ship-captured` (owner, from), `ship-sunk` (why: defeat, retreat, scuttled)                                                                                 |

Save version stays 4: the fields are optional, a v4 save without them is a
dry game, and `readSave` runs `settleNavalState` (a naval state without a
ships list gets the map's boats).

### 16.2 `src/core/game/naval.ts`

| Function                                                                            | Use                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isNavalMap`, `seaMask`, `isSeaCell`, `isShoreCell`, `seaMinFor`                    | The sea: 4-connected water bodies of `seaMinFor(map)` cells or more (60 when the map's side is 36 or less, else 80), cached per map                                     |
| `shipsOf`, `findShip`, `shipAt`, `heroAboard`, `isMoored`, `shipOfHero`, `isAfloat` | Where ships are and who is aboard                                                                                                                                       |
| `addShip(state, x, y, owner)`                                                       | A new moored ship, in place (bead 2's purchase onto a dock, bead 6's Call the Boat). Callers check the cell is a free sea cell                                          |
| `setShipOwner`, `sinkShip`, `scuttleShip`                                           | Ownership changes and sinking, in place, with events. `scuttleShip` refuses a ship with a hero aboard (bead 6 adds the spell's reach and mana)                          |
| `shipAfterDefeat(state, loser, winnerOwner, retreated, events)`                     | 2.5 and 3.7: a beaten hero's ship goes to the winning hero's player, or sinks after a retreat or a defeat by neutrals. Called by `heroLost` in `game/battle.ts`         |
| `neutraliseShips`                                                                   | An eliminated player's ships turn neutral (`eliminate` calls it)                                                                                                        |
| `shipsFromMap`, `settleNavalState`                                                  | Boats to ships at `newGame`; the load-time settle                                                                                                                       |
| `seaMovementBreakdown`, `seaMovementPoints`, `seaMaxOf`, `dailyMaxOf`               | 2.4: `1500 x (100 + sea-movement-percent) / 100 + sea-movement-flat + lighthouses`, at most 3000, minus the Borrowed Day debt                                           |
| `lighthouseBonus(state, player)`                                                    | +300 once for a town building `HARBOUR_LIGHTHOUSE` ("lighthouse"); +200 per flagged map site of type `MAP_LIGHTHOUSE_TYPE` ("lighthouse", `sites[id].owner`), at most 3 |
| `seafaringRank(hero)`                                                               | The rank of skill `SEAFARING_SKILL` ("seafaring"); from 1 a landing is an ordinary step                                                                                 |
| `toSeaPoints`, `toLandPoints`                                                       | The 2.3 conversions, floored                                                                                                                                            |
| `navalDayStart`, `fixDailyMaxima`                                                   | The day start (afloat: `mp = seaMax`; Stables add only to the land maximum afloat) and hiring                                                                           |
| `townDock(map, townId)`                                                             | 2.2's dock, computed from the map alone and cached (the same in every game: "computed when the game starts"); null when landlocked                                      |

Numbers live in `src/data/naval.ts`.

### 16.3 Movement and planning (`pathfinding.ts`, `adventure.ts`)

- `MoveContext.naval` (`NavalMove`: sea mask, moored ships by cell, both
  maxima, the points now, afloat, Seafaring rank) is set by `moveContext`
  on naval maps. Zones of control there cover only the stack's own
  element.
- `navalStepKind(ctx, from, to)` names an ordinary step: `walk`, `sail`
  (onto a free sea cell, no moored ship), `board` (a shore cell onto a
  moored ship) or `land` (onto a free land cell; a pickup is taken from
  the ship instead). `navalStepCost` prices it in the points it is paid
  in: sail 100 / 141, board 100 / 141 land points, land the ordinary land
  cost with Seafaring or -1 ("the rest of the day") without.
- `cutsCorner` is element-aware: at sea a corner is closed when it is not
  sea or object-blocked; across the shore only corners closed to both a
  walker and a ship cut.
- `findPath` plans over both graphs in **land-equivalent points** (sea
  points x landMax / seaMax; a day-ending landing costs the rest of that
  day), with the bzc.107 building detour, the bzc.77 / 79 through-guards
  planning and the pickup and attack rules unchanged; then
  `replayNavalSteps` sets each step's `day`, its exact `cost` and `left`.
  Naval steps carry `afloat`, `board` (the ship id), `land` and
  `endsDay`. `reachableCells` returns land-equivalent costs on naval maps.
- `moveHeroAlong` pays each step (`navalStep`): the ship sails along; a
  boarding converts and takes the ship; a landing converts or ends the
  day and leaves the ship moored. Attacks and pickups across the shore
  are ordinary attack and pickup steps.
- `heroBattle`: a hero afloat attacking a hero in its town gets a plain
  hero battle (no fort, no entry: a beach landing, 3.2, 3.7).

### 16.4 For the later beads

| Bead                      | Hook                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 Harbour                 | Use building id `"lighthouse"` (or change `HARBOUR_LIGHTHOUSE`); buy with `addShip(state, dock.x, dock.y, player)` when `shipAt(dock)` is undefined and no hero stands there; `townDock` for docks and "landlocked"                                                                                                                                                             |
| 3 Sea objects             | Sea entrances already work (a ship sails onto them; stops, buildings and visits as on land). A whirlpool or other move of a hero afloat must move its ship too (`shipOfHero` before, then set `ship.x/y`). Currents: a cheaper `sail` in `navalStepCost` and a lower `hScale` in `findNavalPath`. Map Lighthouse: type `"lighthouse"`, flagged in `sites[id].owner`             |
| 4 Sea guardians           | Sea stacks are monsters on sea cells; their zone already covers only sea cells                                                                                                                                                                                                                                                                                                  |
| 5 Naval battlefield       | Choose the layout from `isAfloat(state, attacker)` and `isSeaCell(map, defender cell)`; the field still uses the defender cell's terrain (water draws as grass) until then. Ship results are already applied by `heroLost`                                                                                                                                                      |
| 6 Spells, skill           | Seafaring: skill id `"seafaring"` with `sea-movement-percent` effects; Tricorne and Locket: `sea-movement-percent`; Fair Wind: add to `hero.mp` when `isAfloat`; Call the Boat: `addShip` or move a moored ship; Scuttle: `scuttleShip`; sight bonuses afloat in `sightRadius`                                                                                                  |
| 8 Naval AI                | `src/core/ai/reach.ts` still plans on land only (its own search over `canEnter`); use `navalStepKind` / `navalStepCost` or `findPath`. `SimpleAi` already plans with `findPath` and may board                                                                                                                                                                                   |
| 9b Ship art (bzc.158, in) | `src/render/map/ship-art.ts` draws `SHIP_ART.sailing` (a hero aboard) and `SHIP_ART.moored`, their `ownerKey` colours at x >= `minX` recoloured onto the owner's colour ramp (`NEUTRAL_SAIL` grey for a neutral boat; the pirate keeps its colours), and hides the hero aboard (the art's captain stands in). The code placeholder is only a fallback when the image is missing |

### 16.5 Calls made in bead 1

| Call                                                                                                  | Why                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Aboard is derived from position, no `hero` field on a ship                                            | Teleports, dismissals and defeats leave a ship moored without touching it; one source of truth |
| No save version bump                                                                                  | Every naval field is optional; dry v4 saves load unchanged                                     |
| A landing without Seafaring needs at least 1 point left and uses them all                             | "Lands with 0 points" read as Heroes II's landing; 0 points means the walk waits for tomorrow  |
| A hero ashore may take a pickup floating beside the shore                                             | RULES_V2 5.6 unchanged ("from a next cell"); 2.6 only lists what a ship can do                 |
| A hero afloat attacking a hero in its town gets no fort and does not enter                            | 3.2 makes it a beach landing; 3.7: the winner stays aboard                                     |
| Mixed paths are ordered in land-equivalent points with the day-ending landing as the rest of that day | A time order across both elements; the replay then gives exact points and days                 |
| The ship art hides the hero aboard; only the code placeholder (a fallback) draws it on deck           | NAVAL 10.1: the art's captain stands in for the hero                                           |
| Docks computed from the map on demand (cached), not stored                                            | Same result as at the game start, nothing in the save                                          |
| Battles at sea keep the defender cell's terrain until bead 5                                          | The layouts are bead 5's; nothing breaks meanwhile                                             |
