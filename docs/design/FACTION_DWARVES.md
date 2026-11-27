# Faction: The Deepforge

Status: design for review (bead `border_marches-bzc.128`, 2026-11-27); not
yet in the game. The beads of [section 14](#14-implementation-beads) build
it; until the integration bead (7) it stays `available: false`. Not yet
balanced: the balance bead (8, simulations on the user's go-ahead) may move
any number here. Written in the terms of [RULES_V2.md](RULES_V2.md), which
governs. Damage and kills follow
[GAME_DESIGN.md section 9](GAME_DESIGN.md#9-battle-rules-deterministic).
Prices shared by every faction are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares). The structure
follows [FACTION_CANDY.md](FACTION_CANDY.md), the newest faction.

## 1. Identity

**Genre:** steam-age dwarves: a brass-and-copper boys'-own adventure of
boilers, rivets, goggles and gear-trains, told as a Sunday-paper comic.
Their world was a mountain that burned through its last seam of coal; the
whole hold made landfall with its kettles still on.

**Tone:** fussy, proud and cheerful. Every problem is a machine that has
not been built yet, and every machine has a name, a face and a whistle.
Nothing is ever broken, only "between repairs". Cute first: round boilers
with porthole eyes, stubby legs, puffs of white steam, ginger beards in
brass rings. Nothing is grim: smoke is white steam, fire stays in the
firebox, and wrecks are a pile of cogs with a sad little spring.

**In the Marches:** the Deepforge came in through the Storm engine, which
hauls worlds across the gap, and it is the one landfall that thinks the
Keepers' engines are machines that want servicing. Its tinkers keep
oiling things that were not squeaking. Riggers find them useful; Winders
resent them, because the dwarves are sure they could build a better
Winder.

| Property       | Value                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faction id     | `dwarves`                                                                                                                                                                                   |
| Native terrain | Volcanic (100 per straight step instead of 150; section 11)                                                                                                                                 |
| Faction colour | `#3aa38f` (verdigris)                                                                                                                                                                       |
| Hero classes   | Thane (might), Artificer (magic)                                                                                                                                                            |
| Remains, tags  | Dwarves (Tinker, Rivet Gunner) leave `corpse`; machines (Gyrocopter, Mortar, Steam Tank, Ironclad) leave `wreck`; the Mortar, Steam Tank and Ironclad cannot bear Heartened or Shaken       |
| Play style     | Stand still and let it build. Natives Stoke when they Defend and strike with the steam; Mortars lob shells that land next round; Gyrocopters spot for the guns; Tinkers repair the machines |

How it differs from the other four: the Realm wins with extra turns and
pairs, the Restless by losing first and getting up, the Horde by blowing
everything apart, and the Candy Kingdom by holding the enemy where it is.
The Deepforge wins by **standing still**: it digs in behind slow, armoured
machines, builds steam while the enemy walks up, shells the ground the enemy
will stand on next round and repairs what breaks. It plans a round ahead
(shells land next round), where the Candy Kingdom plays with who acts first
this round.

**A machine** is a creature that leaves a `wreck`. This is the game's word
already: the Vow of Flesh and Blood bars "creatures that leave a wreck
(machines)", and the stray Bellhop, Winder, Deep-Sea Diver and Tin Titan are
machines. Rules that say "machine" (Patch Up, the Repair Yard) work on every
machine, native or not.

## 2. Magic

| School | Bloom | Accord | Clock | Hush | Storm |
| ------ | ----: | -----: | ----: | ---: | ----: |
| Weight |     1 |      0 |     2 |    3 |     4 |

- **Magic Guild cap: level 4.** The heaviest school is Storm; level 1
  always holds a Storm page, which the Artificer (who starts in Storm) can
  always learn, so no second guarantee is needed. The level 2 condition
  tool is Set off, Pass on, Wind or Feed (never Share: Accord weighs 0).
  Tier 5 pages (The Sky Falls among them) come only from shrines and
  scrolls.
- **Where it sits on the wheel.** `leaningAngle` puts these weights at
  **247.6 degrees**, length 4.75: between Hush (216) and Storm (288), 49.6
  degrees from the Restless (198) and 58.4 from the Horde (306). That is the
  Hush to Storm arc the Candy Kingdom's design left free for a later
  faction, and the widest empty arc of the wheel. The exact midpoint (252)
  needs Hush equal to Storm and Bloom equal to Clock (2, 0, 2, 4, 4, length
  5.24); that would tie Hush with Storm as the heaviest school (the guild
  guarantee would go to Hush) and give a faction of machines Bloom 2, so
  Storm 4 and Hush 3 keep Storm first and land 4.4 degrees short of centre.
- **Why these schools.** Storm is steam, fire, blasts and pushing: the
  boilers and the guns. Hush is "switch it off and salvage the rest":
  wrecks, jammed guns (Hushed) and the dwarves' famous ledgers (debts,
  On Credit). Clock 2 is clockwork. Bloom 1 is the mushroom garden in the
  cellar. Accord 0: the Deepforge argues; it does not negotiate.
- **What the wheel gives the Deepforge.** Steam (section 3) is a Storm boon,
  but clockless, so it is never Echoed. The Rivet Gunners' Burning is Storm,
  so every Hush page the Artificer casts on a burning stack may Echo it a
  round longer. Storm is opposed to Accord and Clock: an enemy's Shielded,
  Mollified, Delayed, Slowed or Stuck is Fuel for a doubled Jolt, Broadside
  or Whiteout (the Candy Kingdom's Stuck on a Deepforge stack fuels the
  page that answers it). Hush is opposed to Bloom and Accord, so the Horde's
  Venomed is Fuel for a Hush page.
- **The price.** Steam is Fuel for the two schools opposed to Storm, and
  the Realm (Accord 4) and the Candy Kingdom (Clock 4) lean on exactly
  those: a stoked stack hands their hero a doubled page. Set off blows a
  boiler: clockless Steam counts as three rounds, Harm 24 + 12 P to its
  bearer.

## 3. Birthright: Stoke

> **Stoke.** When a native stack Defends, it also gains **Steam** 1, or its
> Steam grows by 1, to at most 3.

Attachment: on a native's action choice (RULES_V2 3.8): natives' Defend is
replaced by Stoke, a Defend with a condition added. The rule it bends:
GAME_DESIGN 9.3, "Defend: +30% Defense until the stack's next turn".

**Steam** (condition kind): Storm, boon, clockless, size 1 to 3 (maximum 3
whatever its size at creation), no gate, not a Hold, not a link. **Every
Strike the bearer makes in its next attack, shot or retaliation is x (100 +
50 x size)%; then Steam ends.**

- **Spent by the next Strike, a retaliation included.** A stoked stack that
  is attacked hits back with the steam: Steam 2 is a retaliation at x 200%.
  The rehearsal shows it, so an enemy that can read it shoots the boiler
  instead, or goes round it. A special Strike made by an ability or a
  Command (Ramming Speed, a Cannonball) is an attack; a lobbed shell (5)
  spends the Mortars' Steam when it lands. All Strikes of that one action
  are multiplied (a shell's centre and its splash alike), then Steam ends.
- **Clockless.** Steam does not cool: a stack stoked in round 1 still has it
  in round 6 if nothing has struck. It is never Echoed (no clock); Set off
  counts it as three rounds.
- **Growth, not stacking.** Stoke uses the feed operation by 1 (RULES_V2
  1.7), so Steam goes 1, 2, 3. A second Steam from another maker merges by
  the landing rule (the larger size). The Feed tool grows it by half,
  rounded up (1 to 2, 2 to 3).
- **Stoking costs the turn.** Steam 1 is one turn spent; striking at x 150%
  once every second turn is worse than striking every turn. Stoke pays when
  the enemy is out of reach and coming (a slow army waiting behind its guns),
  when the stack expects to be hit (the defended, stoked retaliation), and
  for the Commands and abilities that read Steam.
- Guests in a Deepforge army do not stoke: their Defend is the ordinary one.
  A guest can still bear Steam (a Bellhop's Carry, the Pocket Boiler).
- **Counters are in the grammar.** Set off ends it for Harm to its bearer;
  any Accord or Clock page with a size burns it as Fuel; a Bellhop carries it
  away; shots hit a stoked stack without meeting its retaliation; Jinxed
  (Bad Omen) stops the retaliation; Hushed stops a stoked shooter's shot.
- **Admission** (RULES_V2 1.3, three makers and three users across two
  factions or schools). Makers: Stoke; the Keystone Hall, The Great Boiler
  (section 9); a new Wonder, the Pocket Boiler (section 5.2). Users: the
  Steam Tanks' Ram; the Artificer's Command Overpressure (section 7); a new
  feat, Scalding (section 5.2).
- The concept's sketch of this faction (the Deepforge: Clock with some
  Storm, birthright **Banked turns**: a native that passes stores the turn
  and later acts twice) keeps its name and its Mortars. Banked turns becomes
  Stoke, a stored blow instead of a stored turn: extra turns are the Realm's
  and the Candy Dragon's, and the cap of one per stack per round (RULES_V2
  1.11) leaves a banked turn little room. Its Clockwinders are the Winders,
  a caretaker already.

## 4. Roster

| Tier | Unit         |  HP | Atk | Def | Dmg | Speed | Shots | Growth/week | Cost                          |   FV | Remains  | Abilities       |
| ---: | ------------ | --: | --: | --: | --: | ----: | ----: | ----------: | ----------------------------- | ---: | -------- | --------------- |
|    1 | Tinker       |  11 |   3 |   5 |   2 |     4 |     - |          14 | 46 gold                       |   66 | `corpse` | Patch Up        |
|    2 | Rivet Gunner |  12 |   5 |   5 |   3 |     4 |     8 |           9 | 120 gold                      |  113 | `corpse` | Hot Rivets      |
|    3 | Gyrocopter   |  20 |   8 |   5 |   5 |     7 |     - |           7 | 230 gold                      |  165 | `wreck`  | Rotors, Spotter |
|    4 | Mortar       |  28 |   8 |   8 |   6 |     3 |     6 |           4 | 480 gold + 1 ore              |  292 | `wreck`  | Lob             |
|    5 | Steam Tank   |  90 |  13 |  17 |  14 |     3 |     - |           2 | 1150 gold + 2 ore             |  887 | `wreck`  | Ram             |
|    6 | Ironclad     | 160 |  18 |  18 |  28 |     4 |     8 |           1 | 4000 gold + 4 ore + 2 essence | 2343 | `wreck`  | Turret          |

One week of all six dwellings: 11,554 gold, 12 ore, 2 essence; fight value
8381 on paper. Gold per FV follows ECONOMY 8.1: 0.70, 1.06, 1.39, 1.64 for
the Mortar, 1.30 and 1.71. The fight value formula counts the Mortar and the
Ironclad as shooters (x 1.25) but sees neither the Mortar's delay and
friendly splash nor Steam, Ram, Spotter or Turret. At the sim's prices
(wood and ore 150, essence 400) the week is 592 FV per 1000 gold, the Realm's
596 and the Horde's 592; the Ironclad is 434 (Realm 479, Restless 425, Horde
512, Candy 354).

**Slow and armoured.** The Mortar and the Steam Tank have Speed 3, the
slowest of any faction, so a full Deepforge army moves **1450** a day
(RULES_V2 3.9: 1300 + 50 x 3); an early army of Tinkers and Rivet Gunners
moves 1500. The Steam Tank's Defense 17 is the highest of the tier 5s, the
Ironclad's 18 matches the Late King's, and the Tinker's 5 matches the
Squire's. The Gyrocopter (Speed 7, flying) is the army's one fast piece.

Every creature is new art (section 10). The three Pulp Wars dwarf sprites
(`dwarf-engineer`, `dwarf-clockwork-gunner`, `dwarf-brass-titan`) stay on the
stray Rigger, Winder and Tin Titan.

## 5. Abilities

"Adjacent" means sharing a hex edge. Counts are read when the ability acts.

| Unit         | Ability        | Exact rule                                                                                                                                                                                                                                                                                                                                         |
| ------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tinker       | **Patch Up**   | Activated, once per battle, in place of an attack (the Tinkers may walk first): one adjacent friendly machine is healed 4 x the Tinkers' count, reviving.                                                                                                                                                                                          |
| Rivet Gunner | **Hot Rivets** | A stack hit by the Rivet Gunners' shot gains Burning of size half their count, rounded down (at least 1, at most 15), clock 2.                                                                                                                                                                                                                     |
| Gyrocopter   | **Rotors**     | The Gyrocopters' walk is a teleport to any free hex within their Speed, as the Vampires' Mist.                                                                                                                                                                                                                                                     |
| Gyrocopter   | **Spotter**    | Shot Strikes by friendly stacks against a stack adjacent to the Gyrocopters are x 125%. Several Spotters do not stack (`stackKey` spotter).                                                                                                                                                                                                        |
| Mortar       | **Lob**        | The Mortars' shot is lobbed at any hex (only when no enemy is adjacent to them, as every shot): it uses a shot and schedules, for the start of the next round, a shot Strike by the Mortars on the stack on that hex and a shot Strike at x 50% on every stack adjacent to it, friend or foe. If the Mortars are dead by then, the shell is a dud. |
| Steam Tank   | **Ram**        | When a melee Strike by the Steam Tanks spends Steam, the stack struck is then pushed 1 hex directly away from them for each point of that Steam's size, before it retaliates; a stack no longer adjacent does not retaliate.                                                                                                                       |
| Ironclad     | **Turret**     | The Ironclads may shoot while an enemy stack is adjacent to them, and none of their Strikes is halved for a shooter in melee. Bends GAME_DESIGN 9.3.                                                                                                                                                                                               |

- **Patch Up is repair, not healing.** It reaches only machines: the
  Deepforge's four, and any machine guest (a Tin Titan from a Landfall Wreck,
  Winders, a Bellhop). Twenty Tinkers heal 80, which brings back most of a
  Steam Tank. Bloom pages heal machines too: there are no immunities, only
  the faction's preference.
- **Hot Rivets** gives Burning, the Storm bane: 15 Gunners make Burning 7 for
  two rounds. A new hit merges (the larger size, the longer clock), so
  focused fire refreshes rather than stacks.
- **Rotors** reuses Mist: stacks, features and hazards between are ignored,
  and a Stuck Gyrocopter cannot fly (Rotors replaces its walk). After the
  flight it may attack an adjacent stack, so a Gyrocopter that lands beside
  an enemy shooter stops it shooting.
- **Spotter** is the forward observer: the Gyrocopters fly ahead and every
  friendly shot at what they stand beside is x 125%, shells and guest
  shooters' shots included. Spotter is read when the Strike is made, so a
  shell is spotted if the Gyrocopters still stand beside its target when it
  lands.
- **Lob, exactly.** The shell is drawn on its hex and on the timeline from
  the moment it is lobbed (a scheduled event, RULES_V2 1.6; it counts toward
  the 12 pending events). It lands before any stack acts in the next round.
  The Strikes use the Mortars' state when it lands: their count, Attack, the
  hero's Attack, Steam, Spotter. A stack that has already acted this round
  cannot step off the marked hex; one that has yet to act (a faster stack
  that waited, a slower one) can, and the stack AI sees the shell. The hex is
  the target, not the stack: whatever stands there when it lands is hit,
  friend or foe, and an empty hex takes only the splash round it. It is an
  area effect centred on that hex, so Horde natives fighting for the side
  that lobbed it are Launched. Shots are never retaliated.
- **Ram** is Steam's payoff for the melee machines: a Steam Tank with Steam 2
  attacks at x 200%, throws its target 2 hexes back and takes no
  retaliation. The push follows RULES_V2 1.7: it stops before a blocking
  feature, a stack or the edge (a blocked target that is still adjacent
  retaliates), hazards on the way apply, and a pushed Goblin makes its
  Cannonball.
- **Turret** is the top tier's bent rule: the Ironclad is a gun the enemy
  cannot smother. Standing next to it does not stop it shooting, and its
  melee is not halved either. Hushed (Hush Now, a Gremlin) still stops its
  shots; its eight shots run out, and then it fights in melee at full
  strength.

### 5.1 Drills

A Drill is bought once per player and then applies to all of that player's
stacks of the creature (ECONOMY 6.3).

| Drill building  | Unit         | Ability               | Exact rule                                                                                                                                         |
| --------------- | ------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scrap Heap      | Tinker       | **Salvage**           | Patch Up may be used again on every later turn on which a wreck lies on or adjacent to the Tinkers' hex; each further use consumes one such wreck. |
| Rivet Forge     | Rivet Gunner | **Red-Hot Rivets**    | The Rivet Gunners' shots are x 125% against a stack that bears Burning or stands in fire.                                                          |
| Powder Magazine | Mortar       | **Incendiary Shells** | After a shell's Strikes, its centre hex receives fire of size equal to the Mortars' count (at most 30), clock 2.                                   |

Salvage turns wrecks (of any owner: a dead enemy Tin Titan is spare parts)
into repairs, and competes with every spell that raises remains. Red-Hot
Rivets and Incendiary Shells meet in the fire: a stack shelled into fire
stands in it at its turn start (Harm), and the Gunners' next shot on it is
x 125%, then x 125% again while Hot Rivets keeps it burning.

### 5.2 New content outside the faction

Steam needs makers and users outside the Deepforge (section 3):

| Kind   | Name              | Slot, value  | Rule                                                                                                             | Kinds                     |
| ------ | ----------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Wonder | **Pocket Boiler** | Pocket, 4000 | Your stacks that Defend also gain Steam 1, or their Steam grows by 1, to at most 3 (as the Deepforge's Stoke).   | makes Steam               |
| Feat   | **Scalding**      | -            | When Steam on your stack is spent by a Strike, the stack struck gains Burning of 5 x that Steam's size, clock 2. | uses Steam; makes Burning |

Scalding's tags are Stormcalling and Bulwark (CONTENT_HEROES 2). The
Pocket Boiler gives any army Stoke; in a Deepforge army it is for the guests.

## 6. Combos

Hero: a Thane with Attack 1 and Defense 3. Enemies are MVP neutrals: Orc
Brutes (HP 28, Atk 9, Def 6, Dmg 6, Speed 4) and neutral Bomb Chuckers
(HP 12, Atk 6, Def 3, Dmg 3, Speed 4, shots 8).

### 6.1 A head of steam (Stoke, Steam, Ram)

Round 3. Three Steam Tanks Stoked in rounds 1 and 2 while 20 Orc Brutes
walked up through the Gunners' fire; they bear Steam 2. In round 2 the
Brutes reached them and, reading the rehearsal (Defense 26 and a x 150%
retaliation), hit the Tinkers beside them instead. The Brutes (Speed 4) have taken their turn
this round; now the Tanks act.

| Step                                         | Calculation                                     | Result                                          |
| -------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| The Tanks attack: Steam 2, x 200%            | A 14, D 6, M 1.40; 3 x 14 x 1.40 x 2.00 = 117.6 | 117: 4 kills. **Brutes 16, top 23**. Steam ends |
| Ram: pushed 2 hexes directly away            | -                                               | No longer adjacent: **no retaliation**          |
| The same Tanks attacking without Steam       | 3 x 14 x 1.40 = 58.8                            | 58: 2 kills, Brutes 18                          |
| ... and the retaliation they would then take | A 9, D 20, M 20/31; 18 x 6 x 20/31 = 69.7       | 69: no kill, the Tanks' top 21/90               |

Twice the damage for no blow back, paid for with two turns standing still.
The Brutes must now walk back in, under the guns, into Tanks that can Stoke
again. Both turns of waiting were Defends: an enemy that had attacked the
Tanks instead would have met Defense 26 (20 + 30%) and the steam in the
retaliation.

### 6.2 Spot and shell (Rotors, Spotter, Hot Rivets, Lob)

Round 1, the Deepforge attacking. 8 Gyrocopters, 15 Rivet Gunners and 4
Mortars against 14 neutral Bomb Chuckers sheltering behind 10 Orc Brutes.
Order: Gyrocopters (7); the Gunners (4, attacker first); the Brutes and the
Chuckers (4); the Mortars (3).

| Step                                                               | Calculation                                    | Result                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| The Gyrocopters fly over the Brutes and attack the Chuckers        | A 9, D 3, M 1.30; 8 x 5 x 1.30 = 52            | 52: 4 kills. **Chuckers 10, top 8**. They can no longer shoot                     |
| The Chuckers retaliate (ranged in melee, half)                     | A 6, D 8, M 20/22; 10 x 3 x 20/22 x 0.5 = 13.6 | 13: the Gyrocopters' top 7/20                                                     |
| The Gunners shoot: Spotter x 125%                                  | A 6, D 3, M 1.15; 15 x 3 x 1.15 x 1.25 = 64.7  | 64: 5 kills. **Chuckers 5, top 4**. Hot Rivets: Burning 7, clock 2                |
| The Brutes walk toward the Gunners                                 | -                                              | -                                                                                 |
| The Chuckers' turn: Burning, then melee at half on the Gyrocopters | Harm 7; 4 x 3 x 20/22 x 0.5 = 5.5              | 1 dies (**Chuckers 4, top 9**); 5 to the Gyrocopters (top 2), no retaliation left |
| The Mortars lob a shell on the Chuckers' hex                       | -                                              | Drawn on the hex and the timeline                                                 |
| Round 2 starts: the shell lands, Spotter x 125%                    | A 9, D 3, M 1.30; 4 x 6 x 1.30 x 1.25 = 39     | 39: 3 kills. **Chuckers 1, top 6**                                                |
| The splash, x 50%, on the Gyrocopters beside it                    | A 9, D 8, M 1.05; 4 x 6 x 1.05 x 0.5 = 12.6    | 12: 1 Gyrocopter. Friendly fire is the price                                      |

Without the combo the Chuckers shoot first (14 x 3 x 20/22 = 38: three
Gunners die) and keep shooting every round. With it, thirteen of fourteen
are gone before round 2 starts and none of them ever fired. The Chuckers had
acted when the shell was lobbed, so they could not step off its hex.

### 6.3 Cross-faction: Ramming Speed (guest Goblins)

A Thane hires 16 Goblins at a Horde outpost (40 gold each,
[FACTION_GOBLINS.md](FACTION_GOBLINS.md#5-abilities): **Cannonball**, a
special Strike at +25% per hex after being pushed or pulled to a stop beside
an enemy). Round 1: the Goblins stand five hexes from 14 enemy Bomb
Chuckers, in a straight hex line. The Thane uses his Command, **Ramming
Speed** (section 7; C = 1, reach 5).

| Step                                        | Calculation                                        | Result                                                      |
| ------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| The Goblins are pushed 5 hexes, beside them | -                                                  | The Chuckers can no longer shoot                            |
| The Command's Strike, not retaliated        | A 5, D 3, M 1.10; 16 x 2 x 1.10 = 35.2             | 35: 2 kills. **Chuckers 12, top 1**                         |
| Cannonball (a reaction to the push), +125%  | 16 x 2 x 1.10 x 2.25 = 79.2                        | 79: 7 kills, no retaliation. **Chuckers 5, top 6**          |
| The same Goblins walking there instead      | 35 and a retaliation of 12 x 3 x 1.05 x 0.5 = 18.9 | 35 (2 kills) for a dead Goblin, and the shooters fire first |

Goblins are guests: they do not Stoke, and they are not Launched. The price
is 640 gold of guests, a slot and the battle's Command. The same Command
delivers a stoked Steam Tank (Speed 3) to the enemy line in round 1: the
Command's Strike spends the Steam, and Ram throws the target back.

## 7. Hero classes

Skill names are the kinds of [CONTENT_TAXONOMY.md](CONTENT_TAXONOMY.md)
section 3.2, as in the other faction documents. Weights are 0 to 10
(RULES_V2 3.3).

| Property        | Thane (might)                               | Artificer (magic)                                                 |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Starting stats  | Attack 1, Defense 3, Power 1, Lore 1        | Attack 1, Defense 1, Power 2, Lore 2                              |
| Stat pattern    | D, A, D, P, D, A, L, D, A, P                | P, L, P, D, P, L, A, P, L, D                                      |
| Starting skills | Armour 1, Archery 1                         | Storm 1, Estates 1; page: Jolt (the Storm tier 1 Harm, 20 + 10 P) |
| Starting army   | 19 Tinkers, 5 Rivet Gunners (FV 1819)       | 16 Tinkers, 4 Rivet Gunners, 1 Mortar (FV 1800)                   |
| Native terrain  | Volcanic                                    | Volcanic                                                          |
| Command         | Ramming Speed                               | Overpressure                                                      |
| Mount (art)     | a clockwork mountain ram with a wind-up key | a walking copper kettle on two brass legs, steam from its spout   |

**Ramming Speed** (Thane). Choose a friendly stack and an enemy stack in a
straight hex line from it, at most 4 + C hexes away. The friendly stack is
pushed toward the enemy until it stops; if it stops adjacent to the enemy,
it makes a special melee Strike on it, which is not retaliated. (A push:
a Stuck stack can be rammed; Goblins make their Cannonball; Steam is spent
and a Steam Tank's Ram throws the target back.)

**Overpressure** (Artificer). Choose a stack that bears Steam. Its Steam
ends, and every other stack adjacent to it takes Harm 15 x C x that Steam's
size, friend or foe. (An area effect centred on the bearer's hex; the bearer
takes nothing. A Steam 3 stack beside three enemies at C = 2 deals 90 to
each.)

Jolt is the starting page: balance rounds 1 to 3 found that the battle AI
casts damage better than set-up ([BALANCE.md](BALANCE.md) section 7).
Estates is the dwarves' bookkeeping (income); Archery is the gunline.

| Skill      | Thane | Artificer |     | Skill       | Thane | Artificer |
| ---------- | ----: | --------: | --- | ----------- | ----: | --------: |
| Bloom      |     0 |         1 |     | Fortune     |     3 |         4 |
| Accord     |     0 |         0 |     | Captaincy   |     6 |         4 |
| Clock      |     2 |         6 |     | Omens       |     3 |         5 |
| Hush       |     2 |         7 |     | Logistics   |     5 |         3 |
| Storm      |     3 |        10 |     | Pathfinding |     6 |         5 |
| Offence    |     5 |         2 |     | Scouting    |     4 |         4 |
| Armour     |    10 |         4 |     | Wellspring  |     1 |         7 |
| Archery    |     8 |         6 |     | Learning    |     3 |         6 |
| Riposte    |     7 |         2 |     | Estates     |     7 |         7 |
| Standards  |     4 |         3 |     | Mustering   |     6 |         3 |
| Tactics    |     6 |         4 |     | Parley      |     1 |         2 |
| Leadership |     2 |         1 |     | Scrollcraft |     3 |         6 |

Accord is 0 for both classes: the guild teaches none. Leadership is low:
three of the six creatures have no morale. Armour, Archery and Riposte lead
the Thane's army skills: the Deepforge holds a line, shoots and answers
blows. Pathfinding is above average because volcanic ground is rough.

## 8. Named heroes

Specialty forms and numbers are those of RULES_V2 3.7. Eight, as for the
other factions (four per class). Ids are the first distinctive word of each
name, as the Candy Kingdom's.

| Hero                       | Id        | Class     | Specialty                                    |
| -------------------------- | --------- | --------- | -------------------------------------------- |
| Thane Brakka Boltbeard     | `brakka`  | Thane     | Creature: Steam Tanks                        |
| Old Gristle Copperpot      | `gristle` | Thane     | Creature: Rivet Gunners                      |
| Captain Hilde Ironkettle   | `hilde`   | Thane     | Command: Ramming Speed counts C one higher   |
| Foreman Dunstan Coalbright | `dunstan` | Thane     | Resource: 1 wood and 1 ore each day          |
| Mags Sparkwrench           | `mags`    | Artificer | Spell: Jolt                                  |
| Silas Ledgerby             | `silas`   | Artificer | Spell: On Credit                             |
| Auntie Valvina Steamwright | `valvina` | Artificer | Skill: Storm at rank 2 (in place of Storm 1) |
| Nell Fusewright            | `nell`    | Artificer | Creature: Mortars                            |

On Credit is the Hush tier 1 page (heal 25 + 12 P, reviving, and a
Reckoning of the same size, clock 3): repairs on account, from the
Deepforge's moneylender. Silas does not start in Hush; the page is his
specialty's (CONTENT_HEROES 4 lets a faction name any tier 1 or 2 page).

## 9. Town: the Steamworks

Starts with the Village Hall, the Tinkers' Workshop, and a Tavern. One
building per day. Costs marked "common" are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

| Building                         | Cost                                  | Requires                  | Effect                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Village, Town, City Hall         | common                                | common                    | Income 500, 1000, 2000 gold a day                                                                                                                                                                               |
| Riveted Palisade                 | common (Fort 1)                       | -                         | Fort level 1; needed for the Gyro Hangar                                                                                                                                                                        |
| Ironbound Wall                   | common (Fort 2)                       | Riveted Palisade          | Fort level 2                                                                                                                                                                                                    |
| Gun Keep                         | common (Fort 3)                       | Ironbound Wall, City Hall | Fort level 3 with its tower                                                                                                                                                                                     |
| Marketplace, Resource Silo       | common                                | common                    | Trade; +1 wood and +1 ore a day                                                                                                                                                                                 |
| Magic Guild 1 to 4               | common                                | common                    | Capped at level 4                                                                                                                                                                                               |
| Tavern                           | (start)                               | -                         | Hire heroes                                                                                                                                                                                                     |
| Tinkers' Workshop (T1)           | (start)                               | -                         | Tinkers                                                                                                                                                                                                         |
| Rivet Range (T2)                 | 800 gold, 5 wood, 3 ore               | Tinkers' Workshop         | Rivet Gunners                                                                                                                                                                                                   |
| Gyro Hangar (T3)                 | 1200 gold, 5 wood, 5 ore              | Riveted Palisade          | Gyrocopters                                                                                                                                                                                                     |
| Mortar Yard (T4)                 | 2000 gold, 5 wood, 8 ore, 1 essence   | Rivet Range               | Mortars                                                                                                                                                                                                         |
| Boiler Works (T5)                | 4000 gold, 5 wood, 10 ore             | Gyro Hangar               | Steam Tanks                                                                                                                                                                                                     |
| Great Foundry (T6)               | 8000 gold, 10 wood, 15 ore, 4 essence | Boiler Works, Mortar Yard | Ironclads                                                                                                                                                                                                       |
| Scrap Heap (Drill)               | 800 gold, 5 ore                       | Tinkers' Workshop         | Tinkers gain Salvage                                                                                                                                                                                            |
| Rivet Forge (Drill)              | 1000 gold, 5 ore                      | Rivet Range               | Rivet Gunners gain Red-Hot Rivets                                                                                                                                                                               |
| Powder Magazine (Drill)          | 1500 gold, 5 wood, 5 ore              | Mortar Yard               | Mortars gain Incendiary Shells                                                                                                                                                                                  |
| Deep Shaft (special)             | 1500 gold, 10 wood                    | Marketplace               | +1 ore a day                                                                                                                                                                                                    |
| Repair Yard (special)            | 3000 gold, 10 ore, 2 essence          | Boiler Works              | While its owner holds it: after each battle won by a hero of that player, each machine stack in that hero's army gets back a third of the creatures it lost in that battle, rounded down. One counts per player |
| The Great Boiler (Keystone Hall) | the Keystone                          | City Hall                 | Common Keystone effects, and every native stack in its owner's armies starts each battle bearing Steam 1                                                                                                        |

Every building: 50,800 gold, 125 wood, 128 ore, 19 essence (25 buildings
with the three the town starts with and the Great Boiler). The tier 6 chain
(Rivet Range, Riveted Palisade, Gyro Hangar, Mortar Yard, Boiler Works,
Great Foundry) costs 18,000 gold, 45 wood, 41 ore and 5 essence: the
hungriest for ore of the five (the Restless's chain takes 35) and the
lightest on wood after the Restless's.

- **The Deep Shaft is the plain income special**, as the Tithe Barn (+250
  gold a day) and the Essence Still are: one ore a day is 250 gold a day at
  the market's buying price. Dwarves dig.
- **The Repair Yard is repair at the scale of the campaign.** The Restless
  get their numbers back inside a fight; the Deepforge gets machines back
  after one it won. Losing three Steam Tanks returns one (1150 gold); one
  lost Ironclad returns none (a third of 1, rounded down), so it favours the
  middle tiers. It adds to Field Surgeon's tenth. It is the second number the
  balance bead should look at, after Steam.
- **The Great Boiler** starts every native with Steam 1: every native's
  first Strike in a battle is x 150%, or its first Stoke makes Steam 2. As
  the Great Flinger and the Four O'Clock, it rides on the natives as an
  ability (`the-great-boiler`), run at battle start.
- Lean: **ore**, then gold. The Restless lean on ore and essence, the Realm
  on gold and wood, the Horde on wood, the Candy Kingdom on essence.

| Faction   | Leans on  | All buildings (gold / wood / ore / essence) | One week of creatures          |
| --------- | --------- | ------------------------------------------- | ------------------------------ |
| Deepforge | Ore, gold | 50,800 / 125 / 128 / 19                     | 11,554 gold, 12 ore, 2 essence |

Neutral garrison of a Deepforge town: 22 Tinkers and 8 Rivet Gunners (FV
2356; the Candy Kingdom's is 2346). Starting militia (RULES_V2 5.5): 15
Tinkers. Town names, in order of use: Kettlehold, Cogsdeep, Brassbottom,
Rivetrock, Old Smokestack.

## 10. Art

Every Deepforge asset is new; nothing is reused from Pulp Wars. The
direction is [ART_DIRECTION.md](../art/ART_DIRECTION.md) (Bold chibi, black
outlines, sun at the bottom left, never mirrored) and, for towns,
[classes/towns.md](../art/classes/towns.md). The models for a cute machine
are the stray Bellhop and the Tin Titan: a face on the machine (porthole
eyes, a boiler-door mouth), stubby limbs, one oversized prop.

### 10.1 Look and palette

| Material       | Colour (shadow)         | Where                                                          |
| -------------- | ----------------------- | -------------------------------------------------------------- |
| Polished brass | `#d9a634` (`#9a6f1c`)   | Machines, gears, trim, goggles: the dominant material          |
| Copper         | `#c7683a` (`#8a4325`)   | Boilers, pipes, kettles, pots                                  |
| Verdigris      | `#3aa38f` (`#226b5d`)   | Roofs, helmets, hull plates: the faction colour                |
| Iron           | `#4a4f57` (`#2e3238`)   | Plates, rivets, wheels, tracks                                 |
| Steam white    | `#f4f1ea` (`#cfc8bb`)   | Puffs of steam, aprons, the light value                        |
| Firebox glow   | `#ff8a2a`               | The one hot accent: firebox doors, gauges; small, never a fill |
| Beards         | `#c0562a` and `#b8b2a6` | Ginger and grey braids with brass rings                        |

**No yellow roofs.** The user found the Horde's hazard-yellow roofs
off-putting (bead bzc.123), and brass is a yellow: brass stays on machines
and trim, roofs and caps are verdigris and iron, so a Deepforge town never
reads as a yellow town. Steam is white and sparing; there is no black smoke
anywhere. Teal verdigris is far from the Horde's goblin green (`#5fa52a`) and
from the green player colour (`#3fa34a`).

### 10.2 Creatures and heroes

| Id             | Sprite key             | Canvas (px)      | Subject                                                                                                                                         |
| -------------- | ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `tinker`       | `dwarves-tinker`       | 56 x 80          | a stout little dwarf in brass goggles and a leather apron, a ginger braided beard, an oversized wrench, a tiny boiler on her back puffing steam |
| `rivet-gunner` | `dwarves-rivet-gunner` | 56 x 80          | a dwarf in a verdigris helmet with a big brass rivet gun fed by a hose from a copper tank on his back                                           |
| `gyrocopter`   | `dwarves-gyrocopter`   | 56 x 80          | a round brass gyrocopter with a big rotor and stubby wings, a goggled dwarf pilot with a scarf, hovering                                        |
| `mortar`       | `dwarves-mortar`       | 56 x 80          | a squat clockwork mortar automaton on stubby iron legs, a fat copper barrel pointing up, porthole eyes, a wind-up key on its back               |
| `steam-tank`   | `dwarves-steam-tank`   | 72 x 88 (large)  | a chubby riveted tank on caterpillar tracks with a tall chimney, a battering-ram nose and porthole eyes, puffing steam                          |
| `ironclad`     | `dwarves-ironclad`     | 88 x 104 (giant) | a walking iron fortress: a squat riveted hull on four stubby legs, a brass gun turret on top, twin smokestacks, verdigris plates                |
| `thane`        | `hero-thane`           | 72 x 88          | a dwarf lord in a verdigris-crested brass helmet and goggles, a white braided beard and a steam hammer, on a clockwork mountain ram             |
| `artificer`    | `hero-artificer`       | 72 x 88          | a dwarf inventor in a top hat with goggles and an auburn beard, a crackling tuning-fork staff, riding a walking copper kettle                   |

The sprite prefix is the faction id (`dwarves-`), as the Candy Kingdom's
`candy-`; the Pulp Wars `dwarf-` sprites on the strays keep their keys.
Creature portraits are 1:1 head crops of the sprites (no calls); each class
and each named hero gets a 48 x 48 bust (V02_UNIT_ART). Rotors reuses the
Vampires' Mist animation (a short hop); Ram reuses the push animation; a
shell needs a lob arc from the Mortars to the hex (the shot animation along
an arc) and a landing puff. Steam needs the condition's 16 px overlay, and a
shell its hex marker and a timeline tile.

### 10.3 Map town, backdrop and buildings

- **Map town, camp stage (fort 0-1), 3x2, 240 x 184:** a fat copper
  boiler-house with one tall brass smokestack puffing white steam among
  packed little workshop cottages with verdigris roofs, a water tower and a
  coal heap, behind a riveted iron palisade with the signature gate at the
  bottom centre over the entry cell: a big round brass vault door in a
  cog-wheel frame.
- **Map town, fort stage (fort 2-3), 3x2, 240 x 184:** a tall stepped dwarf
  hall cut into a little rock face, with a giant brass gear-and-clock front
  and twin smokestacks (the central landmark), copper-domed workshops and a
  water tower packed round it, behind a thick riveted iron wall with the
  round vault-door gate between two squat cannon towers. The camp stage must
  not have the stepped hall or the clock face.
- **Backdrop, 256 x 224 (generated 256 x 232, shown x2):** the native
  volcanic ground drawn homely, not hellish: warm charcoal basalt flagstones
  with coal heaps and brass pipes, an amber evening sky with white steam
  clouds, a mountain range on the horizon with a carved dwarf gate and
  smokestacks; gears, crates and a kettle only at the edges. No lava.
- **Building sprites, 22 at 64 x 64**, one chunky toy building each, the
  accepted Deepforge fort town as style image. Ids are the section 9 names
  in kebab case.

| Building id        | Signature feature                                                           |
| ------------------ | --------------------------------------------------------------------------- |
| `village-hall`     | a squat stone hall with a verdigris roof and one small brass chimney        |
| `town-hall`        | the same hall grown, with a gear-and-clock gable                            |
| `city-hall`        | the same hall grown again, under a riveted copper dome with a steam whistle |
| `riveted-palisade` | a ring of riveted iron plates with the round vault-door gate                |
| `ironbound-wall`   | a thick stone wall bound with iron bands and rivets                         |
| `gun-keep`         | a round iron keep inside that wall with a cannon on its roof                |
| `marketplace`      | a market stall with a striped awning, crates and a brass scale              |
| `resource-silo`    | a riveted copper hopper on iron legs with a chute                           |
| `magic-guild`      | a lightning-rod spire wound with copper coils, a crackling tip              |
| `tavern`           | a stone alehouse with a giant tankard sign and a steaming kettle chimney    |
| `tinkers-workshop` | a cosy workshop with a big wrench over the door and a tool rack             |
| `rivet-range`      | a shooting butt riveted out of iron plates, peppered with rivets            |
| `gyro-hangar`      | a round hangar with a rotor on its roof and a windsock                      |
| `mortar-yard`      | a sandbagged pit with a fat mortar barrel pointing up                       |
| `boiler-works`     | a big copper boiler house with pipes and a pressure gauge                   |
| `great-foundry`    | a tall foundry with a glowing crucible door and two smokestacks             |
| `scrap-heap`       | a cheerful pile of cogs, springs and pipes with a crane                     |
| `rivet-forge`      | a small brick forge with red-hot rivets in a tray                           |
| `powder-magazine`  | a squat bunker with a round iron door and stacked kegs                      |
| `deep-shaft`       | a mine head with a winding wheel and an ore cart on rails                   |
| `repair-yard`      | a shed with a lifting crane holding a little machine by a hook              |
| `the-great-boiler` | a giant brass boiler with a huge pressure gauge and a whistle on top        |

Two Deepforge buildings must not share a silhouette: the halls are stone
halls under domes, the Boiler Works a boiler house, the Great Boiler a
free-standing boiler, the Magic Guild a coil spire, the Gun Keep a round
keep.

### 10.4 Every asset

Call estimates are per sample-then-batch practice (PIPELINE.md): Pixen
takes about US$0.01 a call, `generate-image-v2` about US$0.08 (the recorded
costs of the `faction-units`, `class-heroes`, `chunky-towns` and
`chunky-buildings` sets in `art/costs.jsonl`).

| Asset                           | Count | Size (px)                       | Studio set          | Endpoint            | Calls (est.) |
| ------------------------------- | ----: | ------------------------------- | ------------------- | ------------------- | -----------: |
| Creature sprites                |     6 | as 10.2                         | `faction-units`     | Pixen               |        12-18 |
| Creature portraits              |     6 | 48 x 48 crops                   | (from the masters)  | -                   |            0 |
| Hero class sprites (mounted)    |     2 | 72 x 88                         | `class-heroes`      | Pixen               |          4-6 |
| Hero class busts                |     2 | 48 x 48                         | `class-heroes`      | Pixen               |          2-3 |
| Named-hero busts                |     8 | 48 x 48                         | `named-heroes`      | Pixen               |         9-12 |
| Map town, camp and fort         |     2 | 240 x 184 (generated 232 x 176) | `chunky-towns`      | `generate-image-v2` |          4-6 |
| Town backdrop                   |     1 | 256 x 224 (generated 256 x 232) | `town-backdrops`    | `generate-image-v2` |          1-2 |
| Building sprites                |    22 | 64 x 64                         | `chunky-buildings`  | `generate-image-v2` |          7-9 |
| Faction outpost (2x2 site)      |     1 | 128 canvas, body about 105 x 90 | `map-objects`       | `generate-image-v2` |          1-2 |
| Steam condition icon            |     2 | 32 x 32 and 16 x 16             | `icons-conditions`  | `generate-image-v2` |            2 |
| Shell marker (hex and timeline) |     2 | 32 x 32 and 16 x 16             | `icons-conditions`  | `generate-image-v2` |            2 |
| Pocket Boiler artifact icon     |     1 | 32 x 32                         | `icons-artifacts`   | `generate-image-v2` |            1 |
| Sounds: recruit, victory, town  |     3 | mp3 cues as SOUND.md            | `tools/art/sfx.mjs` | ElevenLabs          |            3 |

Total about 27-39 Pixen and 18-24 `generate-image-v2` calls, roughly US$2,
plus three sound calls. Sounds: recruit, one steam-whistle toot; victory, a
small brass band's "oompah" with a whistle; town, clanking gears, a hiss and
a ding. The wreck remains, fire and Burning already have art.

## 11. Terrain

**Volcanic** (the orchestrator's call; no new ground): cracked basalt and
ash, already in the game since bead bzc.83 at 150 a straight step. Deepforge
heroes pay 100 on it, the largest discount any faction has (as the
Restless's wasteland, 150 to 100). Forges, coal and smoking hills: it is the
dwarves' kind of country, and the volcanic biome bead (bzc.125, in progress)
is dressing it with decorations and special buildings.

Volcanic lies only in the wild volcanic zones some maps have (chance 0.35,
0.5, 0.6 on S, M, L; at most 1, 1, 2; tier 1 or deeper; `gen/config.ts`).
Start zones take their terrain from the player's index, not the faction, so
like every faction the Deepforge usually starts on grass, jungle, steppe or
wasteland; a native terrain matters to a wandering hero, as for the Candy
Kingdom on frosting.

- **Outposts.** Deepforge faction outposts stand on volcanic ground while a
  volcanic site is free, in their own zone or a volcanic zone, and on any
  ground of their zone otherwise. The Candy Kingdom's `preferFrosting` hook
  (`gen/candy.ts`) becomes one table of preferred grounds by faction
  (candy: frosting, dwarves: volcanic), so a map without a volcanic zone
  keeps its Deepforge outposts where they would stand.
- **Not chosen:** badlands (the Horde's native ground, a 25 discount) and a
  new mountain-rock ground (mountains are impassable obstacles here, and a
  new ground is a whole art family). If volcanic proves too rare for a
  native terrain to matter, the balance bead may move the Deepforge to
  badlands; the discount then shrinks to 25.

## 12. Neutrals, map and AI

- **Neutrals.** No Deepforge creature becomes a wandering guard: strays and
  caretakers keep that job. Deepforge creatures appear on the map as neutral
  Deepforge towns (garrison above), as Faction Outposts (tiers 1 to 4:
  Tinkers, Rivet Gunners, Gyrocopters, Mortars; four new outpost variants)
  and in the hero pool. A garrison with no hero takes its town's faction
  (RULES_V2 3.8), so a neutral Deepforge town's garrison Stokes; an
  outpost's stock hired by another faction does not.
- **The dwarf-looking strays.** The Rigger, the Winder and the Tin Titan
  wear Pulp Wars dwarf sprites. With a dwarf faction in the game a player
  may read them as Deepforge kin; they stay neutral (a Winder is a Clock
  caretaker, not a dwarf). If that confuses, a later bead gives them new
  art (an open question for the user, section 15).
- **Map determinism.** The outpost pool (`rollContents`, every faction
  creature with growth) and `NEUTRAL_TOWN_FACTIONS` both draw from lists the
  new faction lengthens, so every generated map's outposts and neutral town
  factions shift. Bead 7 adds the Deepforge to both deliberately and updates
  the named-map fingerprints in the same commit (the Hourglass Marches pins
  its neutral towns since the Candy integration).
- **Battle AI** (the stack AI and its intents, AI.md):
  - **Stoke.** Defend for a native is worth its Steam: the next Strike's
    expected gain (size x 50% of the stack's best Strike or retaliation in
    the next two rounds), plus the Defend. A stack with a target in reach
    strikes; a slow stack with nothing in reach this round and enemies
    coming Stokes rather than walking into range alone. Attacking a stoked
    stack needs no change: the rehearsal shows the multiplied retaliation,
    so enemies shoot the boilers or go round.
  - **Lob.** Score each hex by the stacks expected on it at the next round
    start: a stack that has acted this round, or cannot walk (Stuck, a
    Hold), counts in full; one still to act counts at a fraction (it may
    step off); friendly stacks in the splash count against. Prefer hexes
    next to friendly Gyrocopters (Spotter). The threat map adds the shells
    due next round, so a stack still to act steps off a marked hex when its
    turn allows, and a friendly stack does not end its walk in a splash.
  - **Rotors and Spotter.** The Gyrocopters' flight is Mist's; landing beside
    an enemy shooter both silences it and spots it, so it scores twice.
  - **Patch Up and Salvage.** As the Friars' Mend: the friendly machine with
    the most HP missing (revives count most); with Salvage, a wreck in reach
    is a reason to walk.
  - **Ram and Turret.** The rehearsal sees Ram's push and the lost
    retaliation; Turret removes the Ironclads from "blocked shooter" in the
    move generator and the threat map, so enemies stop parking next to them
    to stop their shots.
- **Hero AI.** Ramming Speed on the stack with the most to gain (Steam, a
  Ram, a Cannonball) along a line to an enemy shooter or caster; Overpressure
  when a stack with Steam 2 or more has at least two enemy neighbours and
  the Harm to enemies outweighs the Harm to friends; Jolt and Storm pages as
  ordinary pages; Fuel Storm pages with enemy Accord and Clock conditions,
  and Echo Hot Rivets' Burning with Hush pages.
- **Adventure AI.** First-week opening (`OPENINGS.dwarves`): Rivet Range,
  Town Hall, Riveted Palisade, Gyro Hangar. `WANDER_DAYS`: 2 (a Speed 4
  early army). The Deep Shaft ranks as an income building (with the Tithe
  Barn); the Repair Yard once the Boiler Works stands. Movement with a
  Speed 3 army (1450) needs nothing new: the planner reads the day's points.

## 13. Balance plan

The numbers above are hand-set to the existing scales (ECONOMY 8.1, BALANCE
6). Confirming them needs the simulation runs of BALANCE.md section 1,
which under the standing rule need the **user's go-ahead** before they run.

**Expected matchups**, from the rules alone:

| Against           | Expectation           | Why                                                                                                                                                                                                                                         |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Horde         | Slightly behind (45%) | Area Harm ignores the Deepforge's Defense, and Launched Goblins land on the gunline; Wolf Riders' Venomed strips the armour. In return Bombs splash slow, high-Defense machines for little, and Launched Goblins land in shells             |
| The Realm         | Even (50%)            | Accord 4 burns Steam as Fuel; Knights' Charge reaches the guns. But Sworn pairs swapping in front of a Turret still meet the shots, and Paragon gains nothing against a stack that never bears the Realm's boons                            |
| The Restless      | Slightly behind (45%) | Bony halves the gunline against Skeletons; Hush pages jam the guns; getting up undoes shell kills. Machines refuse Shaken, and Patch Up keeps the Tanks standing                                                                            |
| The Candy Kingdom | Even (50%)            | Reel In drags Gunners and Mortars into melee and Clock 4 burns Steam; Stuck holds Deepforge stacks in place for the Candy and Candy stacks in place for the shells (a Stuck stack cannot step off a marked hex). Chewy halves the first Ram |

**What to measure and tune, in order:**

1. Steam: x (100 + 50 x size), at most 3, clockless, spent by a retaliation
   too. Levers: 25% a point; a maximum of 2; a clock of 3; not spent by (and
   not boosting) retaliations.
2. The Repair Yard (a third of lost machines) and the Great Boiler (Steam 1
   on every native at battle start).
3. Lob: the x 50% splash on friends, the landing at the next round start
   and the shell's dud rule; the Mortar's price (480 + 1 ore) and Speed 3.
4. The Ironclad: Turret and its price (4000 + 4 ore + 2 essence, 434 FV per
   1000 gold at the sim's prices).
5. Speed 3 on the Mortar and the Steam Tank: a 1450 army on the map against
   the 1500 of every other faction.
6. Guild weights and cap (Storm 4, cap 4: the Weatherwitch with three or
   four Storm damage pages won four battles in five in balance round 3, so
   the Artificer is the first magic hero to watch); both Commands' reach.

**Method.** The sim harness gains the Deepforge (`tests/sim/armies.ts`),
then `npm run sim:battles -- --mode report --seeds 20 --matrix` over the
twenty ordered pairings, `--mode tiers` and `--mode duels`, and balance mode
by leaning, with `--tweak` for each number above. Targets as in rounds 1 to
4: every faction cell within 35-65% (40-60% where it can be had), the four
existing factions' cells unmoved beyond the noise, the attacker at 45-55%.
Results become a new section of BALANCE.md; changed numbers go back into
this document. The Candy Kingdom's own balance bead (bzc.118) is still open;
the two may share one batch of runs.

## 14. Implementation beads

Numbered in build order. "After" names prerequisites that must be
published first. Art beads take their ids, names and descriptions from this
document, so they can run beside bead 1.

| #   | Bead                                  | Profile                                         | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | After            | Art calls (est.)    |
| --- | ------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------- |
| 1   | Deepforge data and rules              | logic (unit tier: the battle engine is touched) | `FactionId` `dwarves`; the Steam kind, Stoke (natives' Defend) and the feed-by-1 operation; Lob (a scheduled shot Strike on a hex with a x 50% area, drawn on the hex, a dud if its stack is dead); Turret; the six creatures, their tags and abilities (Patch Up's machine requirement, Rotors as Mist, Spotter, Ram's push on spending Steam) and the three Drills; the town tree with guild cap 4 and the weights of section 2; the two classes, Commands, named heroes; the Deep Shaft, Repair Yard and Great Boiler; the Pocket Boiler and Scalding; glossary keywords; `available: false` until bead 7. Focused tests on hand-built battle states for each ability, Steam's landing, growth and spending (attack, shot, retaliation, Command, shell), a shell dodged, a dud and a splash | -                | 0                   |
| 2   | Deepforge creature art                | asset-only                                      | Six sprites and their portrait crops, the Deepforge faction outpost, the Steam icons and shell markers (32 and 16 px) and the Pocket Boiler icon; registered in `src/assets/v02-units.ts`, `map-objects.ts` and `icons.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | -                | 12-18 Pixen, 6-7 v2 |
| 3   | Deepforge hero art                    | asset-only                                      | Thane and Artificer mounted sprites and busts; eight named-hero busts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | -                | 15-21 Pixen         |
| 4   | Deepforge town art                    | asset-only                                      | Map town camp and fort stages, the backdrop, 22 building sprites; `town-art.ts` and `town-buildings.ts` lists; a "Deepforge town art" section and a row in classes/towns.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | -                | 12-17 v2            |
| 5   | Deepforge outposts on volcanic ground | logic                                           | The `preferFrosting` hook becomes a table of preferred grounds by faction (candy: frosting, dwarves: volcanic); Deepforge outposts on volcanic sites while one is free. Fixed-seed tests that a map without a volcanic zone is unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 1, bzc.125       | 0                   |
| 6   | Deepforge AI                          | logic                                           | Battle AI valuations and ability use (section 12: Stoke, Lob targeting and shell dodging in the threat map, Patch Up and Salvage, Spotter, Turret), hero AI Commands, `OPENINGS`, `WANDER_DAYS`, build order; focused AI tests on hand-built states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 1                | 0                   |
| 7   | Deepforge integration                 | cross-cutting                                   | `available: true`; setup list and hint line (`src/ui/app.ts`), gallery, magic wheel (data-driven: check it draws the Deepforge at 247.6 degrees and its card clears the Restless's and the Horde's), the hero pool and tavern, neutral towns and outposts (with named-map fingerprints), the three faction sounds, the shell's lob arc and timeline tile, sim armies, `ai/match.ts`; doc updates (ECONOMY 1, 3, 6.2 and 8.1, RULES_V2 3.8, CONTENT_SPELLS 2.1 and 2.3, CONTENT_HEROES 2 and 4, CONTENT_ARTIFACTS, CONTENT_MAP_OBJECTS). A muted browser screenshot of setup, the town screen and a battle with a shell in the air                                                                                                                                                              | 1, 2, 3, 4, 5, 6 | 3 ElevenLabs        |
| 8   | Deepforge balance                     | cross-cutting                                   | Section 13's runs and tuning; BALANCE.md section; numbers back into this document. Simulations only with the user's go-ahead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 7                | 0                   |

Beads 2, 3 and 4 may run in parallel with each other and with bead 1. Bead
1 is the largest; if it runs long it splits cleanly into 1a (engine: Steam
and Stoke, scheduled area shots, Turret) and 1b (faction data on top). Bead
5 waits for the volcanic biome bead (bzc.125), which is changing the map
generator's volcanic zones now; it is small enough to fold into bead 7 if
bzc.125 publishes first.

## 15. Notable calls

| Call                                                                                                         | Why                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The faction is called the Deepforge (worker's call), id `dwarves`, town the Steamworks                       | The concept's name for steam-age dwarves (MAGIC_AND_FACTIONS_CONCEPT 7), so the world document stays one; the id is the user's word                                                                                                                                                                                                   |
| The birthright is Stoke (Defend builds Steam), not the concept's Banked turns                                | A stored blow a spectator sees in one round (a gauge on the stack); extra turns belong to the Realm and the Candy Dragon and are capped at one a round                                                                                                                                                                                |
| Steam is x (100 + 50 x size), at most 3, clockless, spent by the next Strike or retaliation                  | Lucky's x 150% is the reference for one point; the retaliation makes standing still a threat, which is the faction's play; clockless so it never needs a Wind                                                                                                                                                                         |
| Storm 4, Hush 3, Clock 2, Bloom 1, Accord 0; guild cap 4                                                     | The empty Hush to Storm arc of the wheel (247.6 degrees); Storm stays the heaviest; steam, wrecks and clockwork; Storm and Accord opposed so Accord 0 costs nothing                                                                                                                                                                   |
| A machine is a creature that leaves a wreck                                                                  | The game's word already (the Vow of Flesh and Blood); repair works on stray machines too, so a Tin Titan guest is a Deepforge find                                                                                                                                                                                                    |
| The Mortar, Steam Tank and Ironclad cannot bear Heartened or Shaken; the Gyrocopter can                      | The constructs' tags of CONTENT_CREATURES (Winder, Tin Titan, Bellhop); the Gyrocopter has a pilot                                                                                                                                                                                                                                    |
| Shells land at the next round start and hit the hex, friend or foe                                           | The concept's "planning two rounds ahead and being right": a visible threat on the board that a stack still to act can dodge; it uses Appointment's schedule and the Bomb's splash, no new verb                                                                                                                                       |
| Three shooters (Rivet Gunner, Mortar, Ironclad) and Speed 3 on two machines                                  | The siege and artillery faction the user's theme asks for; the Gyrocopter (Speed 7, flying) is its reach                                                                                                                                                                                                                              |
| The tier 6 is a walking gun whose bent rule is shooting point-blank                                          | A gunline's answer to being reached; Hushed still stops it                                                                                                                                                                                                                                                                            |
| The tier 5 pushes (Ram) only when it spends Steam                                                            | Pushing is Storm's and the Horde's verb; here it is a payoff of the birthright, not the faction's verb                                                                                                                                                                                                                                |
| The Repair Yard returns a third of lost machines after a battle won                                          | Repair instead of healing at the campaign scale; flagged for the balance bead                                                                                                                                                                                                                                                         |
| Native terrain Volcanic, no new ground                                                                       | Forges and smoking hills; the ground exists and bzc.125 is dressing it; the largest discount (150 to 100) on a ground some maps lack, as the Candy Kingdom's frosting                                                                                                                                                                 |
| Faction colour verdigris `#3aa38f`; no yellow roofs                                                          | Brass is yellow and the user disliked the Horde's yellow roofs (bzc.123): brass stays on machines, roofs are verdigris                                                                                                                                                                                                                |
| Eight named heroes                                                                                           | The other factions have eight; the hero pool and the portrait list keep one shape                                                                                                                                                                                                                                                     |
| Jolt, not a Hush page, as the Artificer's page                                                               | The battle AI casts damage better than set-up (BALANCE 7)                                                                                                                                                                                                                                                                             |
| Pocket Boiler and Scalding are added outside the faction                                                     | The admission rule needs makers and users of Steam beyond the Deepforge                                                                                                                                                                                                                                                               |
| The stray Rigger, Winder and Tin Titan keep their Pulp Wars dwarf sprites (open question)                    | They are neutrals; new art for them is a separate bead if the user finds them confusing next to the Deepforge                                                                                                                                                                                                                         |
| Overpressure is shown as "Blow Off Steam" (bead 1)                                                           | The action bar wraps a label at word breaks to 11 characters, and "Overpressure" is one 12-letter word; the Command's id stays `overpressure`, the document's word                                                                                                                                                                    |
| Steam multiplies every Strike its bearer makes until spent, special Strikes included (bead 1)                | Lucky's shape: a Strike multiplier, and a reaction of the first Strike that ends it, so every Strike of that action (a shell's centre and splash, a Cannonball after Ramming Speed) is multiplied first. Scalding burns the first stack struck                                                                                        |
| Ram pushes on any melee-range Strike that spends Steam: an attack, a retaliation or Ramming Speed's (bead 1) | "A melee Strike by the Steam Tanks": a stoked Tank's retaliation also throws its attacker back; shots never push                                                                                                                                                                                                                      |
| Ramming Speed's Strike is a special Strike, halved for a shooter without Turret (bead 1)                     | "Not retaliated" is the special Strike's default; a rammed shooter fights in melee as any shooter does                                                                                                                                                                                                                                |
| Lob is a shot override with a scheduled effect `dwarves:shell` (bead 1)                                      | As the Bomb: the shot spends its use at once and schedules the landing; the area's side is the Mortars' when it lands; the splash catches the Mortars too if they stand next to the hex; a dud lands silently. `pendingShells(state)` lists the shells in the air for the hex markers, the timeline tile (bead 7) and the AI (bead 6) |
| Spotter does not stack through a `stackKey` on Strike multipliers (bead 1)                                   | Flat modifiers already had one; multipliers now keep the largest of each key                                                                                                                                                                                                                                                          |
| Turret is an ability flag, `pointBlank` (bead 1)                                                             | Read by `canShoot` (an enemy next to it does not stop the shot) and by the Strike maths (no halving in melee)                                                                                                                                                                                                                         |
| Stoke is an ability hook on Defend, `onDefend`; the Pocket Boiler is read in the engine's Defend (bead 1)    | One Defend stokes once: a native with the Pocket Boiler still gains 1, not 2. The feed by 1 is `stoke` in `core/battle/steam.ts`, shared by both                                                                                                                                                                                      |
| Salvage's repeat uses go through Patch Up's own check (`repeatByCheck`, bead 1)                              | The engine leaves a once-per-battle ability's repeat to its act, which allows it only with Salvage and a wreck on or next to the Tinkers; the wreck on their hex goes first, then E, SE, SW, W, NW, NE                                                                                                                                |
| The Repair Yard's third adds to Field Surgeon's tenth before rounding (bead 1)                               | Lost x (tenths / 10 + 1/3), rounded down, for each machine stack of the winning hero, attacker or defender                                                                                                                                                                                                                            |
| Until bead 7 the Deepforge stays off maps, the pool, the draft and the gallery (bead 1)                      | `available: false`; its creatures are out of the outpost pool; `HELD_ARTIFACTS` keeps the Pocket Boiler off generated maps, Mystery Bags and the gallery, `HELD_FEATS` keeps Scalding out of the draft and the gallery; bead 7 empties both, so no fingerprint moves now. The town art falls back to the MVP family until bead 4      |
| Doc 6.3's Goblins are pushed 4 hexes, not 5 (bead 1)                                                         | Five hexes away is distance 5 (4 + C at C = 1): the push stops next to the Chuckers after 4 hexes, so Cannonball is +100% (70), not +125% (79). The Command's own Strike (35, 2 kills) is as written                                                                                                                                  |
| Steam's worth is 0.6 of what it adds to the bearer's best Strike, plus Ram's spared retaliation (bead 6)     | Section 12's "size x 50% of the best Strike" with a share below 1: a banked blow is spent later, on a retaliation, or never, and a Stoke costs the turn. The weight is `steam` in the AI's weights, for the balance runs                                                                                                              |
| A stack still to act counts half under a shell; one that has acted, or cannot walk, in full (bead 6)         | Section 12's "a fraction": half, one number for every stack, so the fast estimate stays exact (whether a stack is engaged would depend on the mover)                                                                                                                                                                                  |
| The Deep Shaft ranks 52 with the Tithe Barn, the Repair Yard 62 (bead 6)                                     | Ore is the Deepforge's lean: the Shaft comes before the silo's mixed income; the Repair Yard after the silo and before the Great Foundry it competes with for ore and essence                                                                                                                                                         |

**Engine asks** (no new noun or verb; the first two are the only new
mechanics): **Steam and Stoke**, a condition whose modifier is spent by the
bearer's next Strike-making action or retaliation (Lucky's shape with a
size, retaliations included), and a native Defend that adds it with the feed
operation by 1; **Lob**, a scheduled event that makes a shot Strike, with a
x 50% area, by a named stack at the next round start on a hex, drawn on the
hex and the timeline, cancelled when the stack is dead. Turret is a modifier
on two shooter rules of GAME_DESIGN 9.3; Rotors reuses Mist; Ram reuses
Follow Through's push and its "no longer adjacent, no retaliation"; Patch Up
is a Heal with a requirement on the target's remains tag; Salvage uses
remains as Feast does; Spotter is an aura on shot Strikes with a `stackKey`;
the Great Boiler rides on natives as an ability, as the Four O'Clock does.
