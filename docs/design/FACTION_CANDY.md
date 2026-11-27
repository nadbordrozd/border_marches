# Faction: The Candy Kingdom

Status: design for review (bead `border_marches-bzc.109`, 2026-11-26). Not
yet in the game: the beads of [section 14](#14-implementation-beads) build
it, and the balance bead may move any number here. Written in the terms of
[RULES_V2.md](RULES_V2.md), which governs. Damage and kills follow
[GAME_DESIGN.md section 9](GAME_DESIGN.md#9-battle-rules-deterministic).
Prices shared by every faction are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

## 1. Identity

**Genre:** fairy-tale confectionery: the gingerbread cottage in the wood
and the land of sweets at the end of the ballet, told by a grandmother who
leaves the ending vague. A whole sugar kingdom made landfall while its
story was still at the part where the children are invited in.

**Tone:** sweet, polite, very welcoming and a little hungry. Everyone
offers you something; nobody is in a hurry for you to leave. It is always
four o'clock, so it is always nearly tea time. Cute first: the sinister part
is in what the rules let the Kingdom do, never in the art (nobody is eaten
on screen, nothing is gory).

**In the Marches:** the Kingdom came in through the Clock engine, which
holds arriving worlds until there is room, and it was held so long that
everything in it set: candied, glazed, preserved in sugar glass, every clock
stopped at four. It treats the rest of the Marches as guests who have not
been asked in yet. Winders call it the best-kept landfall in the Marches.
Sextons will not go in.

| Property       | Value                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faction id     | `candy`                                                                                                                                                                                         |
| Native terrain | Snow, read as icing sugar (100 per straight step instead of 150; section 11)                                                                                                                    |
| Faction colour | `#e2589b` (strawberry pink)                                                                                                                                                                     |
| Hero classes   | Nutcracker (might), Confectioner (magic)                                                                                                                                                        |
| Remains, tags  | Every Candy creature leaves `sweets`, the first creatures that do (RULES_V2 1.5); none has an excluded condition                                                                                |
| Play style     | Come in and stay. Taffy Wranglers reel enemies in, every native touch leaves them Stuck, Peppermint Archers shoot the stuck; Gingerbread Men hasten the heavy pieces, and the Dragon has afters |

How it differs from the other three: the Realm wins with extra turns and
pairs, the Restless by losing first and getting up, the Horde by blowing
everything apart. The Candy Kingdom wins by **holding the enemy where it
is** and taking its own turns early: it pulls where the Horde pushes, and it
plays with the timeline (who acts first, who cannot move) rather than with
damage or numbers.

## 2. Magic

| School | Bloom | Accord | Clock | Hush | Storm |
| ------ | ----: | -----: | ----: | ---: | ----: |
| Weight |     1 |      3 |     4 |    2 |     0 |

- **Magic Guild cap: level 4.** The heaviest school is Clock; level 1
  always holds a Clock page, which the Confectioner (who starts in Clock)
  can always learn, so no second guarantee is needed. The level 2 condition
  tool is Wind, Share, Pass on or Feed (never Set off). Tier 5 pages
  (Double Time among them) come only from shrines and scrolls: a whole army
  Heartened beside a Dragon with Afters is the strongest round the Kingdom
  could play, and it should be found, not built.
- **Where it sits on the wheel.** The wheel places a faction at the
  direction of its weights summed as vectors (`leaningAngle`,
  `src/ui/magic-wheel-model.ts`). These weights put the Kingdom at 126
  degrees, between Accord and Clock, exactly halfway between the Realm (54
  degrees) and the Restless (198 degrees) and as far from the centre as
  both (length 4.98). That was the widest empty arc of the wheel; the Horde
  sits at 306. The weights are the Realm's (3, 4, 2, 0, 1) turned one
  school clockwise, and the Restless's (0, 1, 3, 4, 2) are the Kingdom's
  turned once more: the Kingdom is the step between them, and the Hush to
  Storm arc stays free for a later faction.
- **What the wheel gives the Kingdom.** Stuck (section 3) is a Clock bane,
  so every Accord and Hush page cast on a stuck stack may Echo it a round
  longer (a Soft Words or a Bad Omen keeps a stack stuck). Clock is opposed
  to Bloom and Storm: an enemy's Venomed, Burning or Ripening is Fuel for a
  doubled Appointment, Treacle or Deadline; Accord is opposed to Hush and
  Storm, so the Restless's Shaken and Jinxed are Fuel for Accord pages.
- **The price.** Storm, weight 0, is opposed to both of the Kingdom's main
  schools, and Bloom, weight 1, to Clock. A Horde hero (Bloom 4, Storm 2)
  or any Storm hero may burn the Stuck on its own stacks as Fuel: heat melts
  toffee. Storm's fire and area Harm are what the Kingdom fears.

## 3. Birthright: Sticky

> **Sticky.** A stack struck in melee by a native stack, by an attack or a
> retaliation, gains **Stuck** with clock 2.

Attachment: on a native's Strike (RULES_V2 3.8), adding a condition rather
than a Strike. The rule it bends: GAME_DESIGN 9.3, "Move: up to Speed hexes"
(a stuck stack cannot walk).

**Stuck** (condition kind): Clock, bane, clock 2 as made, size 0, no gate,
not a Hold, not a link. While a stack bears it, it **cannot walk**: neither
the walk of a move or a move and attack, nor any rule that replaces its walk
(the Vampires' Mist, a Sworn stack's Change places). Everything else stays
open: attacking an adjacent stack, shooting (only with no enemy adjacent,
as ever), casting, abilities that do not walk, Wait and Defend. Other rules
may still move it: pushes, pulls, swaps and teleports (Launched, Hurl,
Heave-Ho, the Change Places page, Reel In).

- **It is "you cannot leave", never "you cannot come".** Stuck comes from
  melee, so a stuck stack is always one already in contact, and it can
  always hit what holds it. No Candy shot makes it. That is why it is not a
  Hold and needs no Wary.
- A stuck shooter that a native stands beside can neither shoot nor walk
  clear: it fights in melee at half damage until the native dies or moves.
- Stuck lands after the Strike's own on-strike rules and before the
  retaliation. Every native melee Strike refreshes it (same kind: the longer
  clock wins, RULES_V2 1.3), so a stack in a melee with natives stays stuck.
- Sides are read live (law 4): a native stack that is Turned sticks what it
  strikes for its new side. Guests in a Candy army do not stick.
- **Counters are in the grammar.** Pass on moves Stuck to an adjacent stack
  (often the native that made it); Wind shortens it; Set off ends it for
  Harm; any Bloom or Storm page with a size burns it as Fuel. The Horde bombs its own
  goblins free (Launched is a push), the Realm swaps with the Change Places
  page, and a Restless stack that dies gets up without it.
- **Admission** (RULES_V2 1.3, three makers and three users across two
  factions or schools). Makers: Sticky; the Confectioner's Command Come In,
  Dear (section 7); a new Wonder, the Flypaper Ribbon (section 5.2). Users:
  the Peppermint Archers' Sitting Ducks; the Nutcracker's Command Crack!;
  the feat Pile On, whose list grows to "a Delayed, Slowed, Shaken or Stuck
  stack" (CONTENT_HEROES 2).
- The concept's sketch of this faction (the Sweetlands, Bloom, birthright
  Edible: eat an adjacent friendly stack whole) is not used: Bloom is the
  Horde's heaviest school, and eating a living stack needs a new verb and
  spends creatures for good. Its eating survives in the Larder (section 9),
  which feeds on sweets instead.

## 4. Roster

| Tier | Unit              |  HP | Atk | Def | Dmg | Speed | Shots | Growth/week | Cost                          |   FV | Abilities               |
| ---: | ----------------- | --: | --: | --: | --: | ----: | ----: | ----------: | ----------------------------- | ---: | ----------------------- |
|    1 | Gingerbread Man   |   9 |   4 |   3 |   2 |     6 |     - |          15 | 40 gold                       |   57 | Sugar Rush              |
|    2 | Peppermint Archer |  11 |   7 |   3 |   3 |     5 |    10 |           9 | 120 gold                      |  108 | Sitting Ducks           |
|    3 | Taffy Wrangler    |  24 |   8 |   6 |   5 |     6 |     - |           7 | 240 gold                      |  186 | Reel In                 |
|    4 | Sugarplum         |  30 |   7 |   7 |   6 |     6 |     - |           4 | 430 gold + 1 essence          |  228 | Caster: Late Bell, Wind |
|    5 | Gummy Bear        |  95 |  12 |  15 |  14 |     4 |     - |           2 | 1100 gold + 1 essence         |  857 | Chewy                   |
|    6 | Rock Candy Dragon | 150 |  18 |  16 |  28 |     7 |     - |           1 | 3600 gold + 1 ore + 3 essence | 1750 | Afters                  |

One week of all six dwellings: 10,880 gold, 1 ore, 9 essence; fight value
7505 on paper, the lowest of the four on purpose: Afters (a second attack
every round), Chewy (half of one blow a round), Reel In and Sticky are not
in the fight value formula. Gold per FV follows ECONOMY 8.1: 0.70, 1.11,
1.29, 1.89 for the caster, 1.28, and 2.06 for the Dragon, whose price pays
for Afters. The slowest creature has Speed 4 (Gummy Bears), so a full army
moves 1500 a day; an early army of Gingerbread Men and Peppermint Archers
moves 1550.

The Gingerbread Man is the fastest tier 1 (Speed 6): it reaches the enemy
first and starts the sticking. The Gummy Bear is a slow wall: its Defense
15 is the highest of the playable tier 5s. Every creature is new art
(section 10).

## 5. Abilities

"Adjacent" means sharing a hex edge. Gates are fixed when the condition is
made, from the maker's count at that moment.

| Unit              | Ability           | Exact rule                                                                                                                                                                                                                                                                                   |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gingerbread Man   | **Sugar Rush**    | Activated, once per battle, in place of an attack (the Gingerbread Men may walk first): one other friendly stack adjacent to them gains Hastened with clock 2 and gate `{ hp, max: 20 x the Gingerbread Men's count }`.                                                                      |
| Peppermint Archer | **Sitting Ducks** | The Peppermint Archers' shots are x 150% against a Stuck stack.                                                                                                                                                                                                                              |
| Taffy Wrangler    | **Reel In**       | Activated, usable every turn, in place of an attack (the Wranglers may walk first): choose a stack of any side within 6 hexes whose total HP is at most 30 x the Wranglers' count. It is pulled toward the Wranglers until it is adjacent to them, as the Rigger's Tow pulls (RULES_V2 1.7). |
| Sugarplum         | **Caster**        | Pages: **Late Bell** and **Wind**. `castPower` 1, `castDivisor` 2, `castCap` 8.                                                                                                                                                                                                              |
| Gummy Bear        | **Chewy**         | The first melee Strike against the Gummy Bears each round, an attack or a retaliation, is x 50%.                                                                                                                                                                                             |
| Rock Candy Dragon | **Afters**        | At the end of each round, before round-end events, the Dragons take an extra turn if they have taken none this round and bear no Hold; in it they cannot walk. Bends RULES_V2 1.6 (an extra turn follows at once).                                                                           |

- **Late Bell** is the Clock tier 1 page (end Hastened on the target, then
  Delayed, clock 2) and **Wind** the Clock tool (RULES_V2 2.7). Four
  Sugarplums cast at Power 3; Wind adds 2 rounds to a Stuck or takes 2 from
  an enemy's boon.
- **Afters is the Dragons' one extra turn of the round** (RULES_V2 1.11):
  a Dragon stack that ended Heartened earlier in the round, or took Double
  Time's turn, has no Afters. It is drawn on the timeline as a second Dragon
  slot at the end of the bar; several Dragon stacks take it in timeline
  order. Like any extra turn it repeats no turn-start effects and restores
  no retaliation. With no enemy adjacent, the Dragons defend.
- **Reel In works on any side** (law 5): six Wranglers can pull one of
  their own Dragons (150 HP) into the melee before Afters. The pull stops
  before a blocking feature, a stack or the edge, and hazards on the way
  apply; a stack already adjacent is not moved (the use is still spent for
  the turn).
- Chewy reads a per-round "struck in melee" flag; a Bomb or a shot does not
  use it up.
- Hastened from Sugar Rush moves a stack that has not acted this round to
  the front of the queue (RULES_V2 1.6), and lasts the next round too.

### 5.1 Drills

A Drill is bought once per player and then applies to all of that player's
stacks of the creature (ECONOMY 6.3).

| Drill building | Unit              | Ability               | Exact rule                                                                   |
| -------------- | ----------------- | --------------------- | ---------------------------------------------------------------------------- |
| Bread Oven     | Gingerbread Man   | **Hot from the Oven** | The Gingerbread Men start each battle Hastened, clock 1.                     |
| Mint Press     | Peppermint Archer | **Cool Mint**         | A stack hit by the Peppermint Archers' shot gains Slowed 1, clock 2.         |
| Pulling Hooks  | Taffy Wrangler    | **Long Pull**         | Reel In reaches 8 hexes, and its HP limit is doubled against a Slowed stack. |

Cool Mint and Long Pull meet on Slowed, which Treacle, Whiteout and the
Hedge-Clipper Shears also make: a Slowed stack of 60 HP per Wrangler comes
in from 8 hexes.

### 5.2 New content outside the faction

Stuck needs makers and users outside the Kingdom (section 3):

| Kind   | Name                 | Slot, value  | Rule                                                                                                            | Kinds       |
| ------ | -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------- | ----------- |
| Wonder | **Flypaper Ribbon**  | Pocket, 4000 | Reaction: the first time each of your stacks retaliates in a battle, the stack it strikes gains Stuck, clock 2. | makes Stuck |
| Feat   | **Pile On** (change) | -            | Strikes by your stacks against a Delayed, Slowed, Shaken or Stuck stack are x 125%.                             | uses Stuck  |

## 6. Combos

Hero: a Nutcracker with Attack 2 and Defense 2. Enemies are MVP neutrals:
Orc Brutes (HP 28, Atk 9, Def 6, Dmg 6, Speed 4) and neutral Bomb Chuckers
(HP 12, Atk 6, Def 3, Dmg 3, Speed 4).

### 6.1 Come in and sit down (Reel In, Sticky, Sitting Ducks)

Round 2. Taffy Wranglers (6) stand six hexes from 14 enemy Bomb Chuckers,
who shelter behind 10 Orc Brutes. Gingerbread Men (12) and Peppermint
Archers (15) are close by. Order: Wranglers and Gingerbread Men (Speed 6,
slot order), Archers (5), then the neutrals (4).

| Step                                           | Calculation                                         | Result                                                          |
| ---------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| Wranglers Reel In the Bomb Chuckers            | Limit 30 x 6 = 180; the Chuckers have 14 x 12 = 168 | Pulled 5 hexes, beside the Wranglers: they can no longer shoot  |
| Gingerbread Men walk up and attack             | A 6, D 3, M 1.15; 12 x 2 x 1.15 = 27.6              | 27: 2 kills. **Chuckers 12, top 9**                             |
| Sticky                                         | -                                                   | The Chuckers are Stuck until the end of round 3                 |
| The Chuckers retaliate (ranged in melee, half) | A 6, D 5, M 1.05; 12 x 3 x 1.05 x 0.5 = 18.9        | 18: 2 kills. Gingerbread Men 10                                 |
| Peppermint Archers shoot: Sitting Ducks x 150% | A 9, D 3, M 1.30; 15 x 3 x 1.30 x 1.50 = 87.75      | 87: 7 kills. **Chuckers 5, top 6**                              |
| The Chuckers' turn                             | Stuck, beside two enemy stacks                      | They cannot walk clear to shoot; they hit back in melee at half |

Without the combo the Chuckers shoot first (14 x 3 x 1.05 = 44: four
Archers die) and the Archers answer for 58 (four kills). With it, nine of
fourteen are gone in one round and the rest never shoot again while a
native stands beside them.

### 6.2 Afters (Sugar Rush, Chewy, Afters)

The Kingdom attacks (so it moves first on a Speed tie). Army: Rock Candy
Dragons (2), Gummy Bears (3), Gingerbread Men (15). Enemy: 20 Orc Brutes in
one stack. Round 1: the Gingerbread Men walk up to
the Dragons and Sugar Rush them: gate 20 x 15 = 300 HP, and two Dragons
have exactly 300, so they are Hastened until the end of round 2.

| Step                                                                                        | Calculation                                             | Result                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Round 2. The Dragons act first (Hastened), walk up and attack                               | A 20, D 6, M 1.70; 2 x 28 x 1.70 = 95.2                 | 95: 3 kills. **Brutes 17, top 17**, Stuck                 |
| The Brutes retaliate                                                                        | A 9, D 18, M 20/29; 17 x 6 x 20/29 = 70.3               | 70: no kill. Dragons' top 80/150                          |
| The Gummy Bears step in beside the Brutes                                                   | -                                                       | -                                                         |
| The Brutes' turn: stuck, they cannot reach the Gingerbread Men; they attack the Gummy Bears | A 9, D 17, M 20/28; 17 x 6 x 20/28 x 0.5 (Chewy) = 36.4 | 36 (72 without Chewy): no kill. Gummy Bears' top 59/95    |
| The Gummy Bears retaliate                                                                   | A 14, D 6, M 1.40; 3 x 14 x 1.40 = 58.8                 | 58: 2 kills. **Brutes 15, top 15**                        |
| Round end: Afters. The Dragons attack again without walking                                 | 2 x 28 x 1.70 = 95.2                                    | 95: 3 kills, no retaliation (spent). **Brutes 12, top 4** |

The Dragons alone deal 95 and take 70. With the combo they deal 190 for
the same one retaliation, the Brutes cannot walk away to the soft
Gingerbread Men, and the one blow they land is halved.

### 6.3 Cross-faction: taffy-pulled goblins (guest Goblins)

A Nutcracker hires 16 Goblins at a Horde outpost (40 gold each,
[FACTION_GOBLINS.md](FACTION_GOBLINS.md#5-abilities): **Cannonball**, a
special Strike at +25% per hex after being pushed or pulled to a stop
beside an enemy). Six Taffy Wranglers stand beside 10 Orc Brutes; the
Goblins are six hexes behind them.

| Step                                    | Calculation                                         | Result                                                        |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| The Wranglers Reel In their own Goblins | Limit 180; 16 Goblins have 160                      | Pulled 5 hexes; they stop beside the Wranglers and the Brutes |
| Cannonball, +125%                       | A 6, D 6, M 1.00; 16 x 2 x 1.00 x 2.25 = 72         | 72: 2 kills, no retaliation. **Brutes 8, top 12**             |
| The same Goblins walking there instead  | 16 x 2 x 1.00 = 32; retaliation 9 x 6 x 1.25 = 67.5 | 32 (1 kill) for 6 dead Goblins                                |

Goblins are guests: they do not stick, and they are not Launched. A
Gingerbread stack beside the Brutes does the sticking. The price: 640 gold
of guests, a slot, and the Wranglers' action that turn. The same pull
answers the Horde's own trick from the other side: a Horde army that Hurls
its Goblins at the Kingdom's Archers lands them beside natives, who stick
them there.

## 7. Hero classes

Skill names are the kinds of [CONTENT_TAXONOMY.md](CONTENT_TAXONOMY.md)
section 3.2, as in the other faction documents. Weights are 0 to 10
(RULES_V2 3.3).

| Property        | Nutcracker (might)                                 | Confectioner (magic)                                                              |
| --------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Starting stats  | Attack 2, Defense 2, Power 1, Lore 1               | Attack 1, Defense 1, Power 2, Lore 2                                              |
| Stat pattern    | D, A, D, P, A, D, L, A, D, P                       | L, P, L, D, P, L, A, P, L, D                                                      |
| Starting skills | Armour 1, Tactics 1                                | Clock 1, Parley 1; page: Appointment (the Clock tier 1 scheduled Harm, 24 + 12 P) |
| Starting army   | 20 Gingerbread Men, 6 Peppermint Archers (FV 1788) | 14 Gingerbread Men, 5 Peppermint Archers, 2 Sugarplums (FV 1794)                  |
| Native terrain  | Snow                                               | Snow                                                                              |
| Command         | Crack!                                             | Come In, Dear                                                                     |
| Mount (art)     | a candy-striped rocking horse                      | a marzipan pig                                                                    |

**Crack!** (Nutcracker). Choose an enemy stack that bears Stuck. Up to
C + 1 friendly stacks adjacent to it each make a melee Strike against it,
in timeline order; it retaliates once, against the first. (The concept's
Stampede, opened only by Stuck; each native Strike refreshes the Stuck.)

**Come In, Dear** (Confectioner). Choose an enemy stack and a friendly
stack within C + 4 hexes of it. The enemy is pulled toward the friendly
stack until it is adjacent to it, and gains Stuck, clock 2.

Appointment is the starting page rather than Late Bell: balance rounds 1
to 3 found that the battle AI casts damage better than set-up
([BALANCE.md](BALANCE.md) section 7), and the Sugarplums already carry Late
Bell. Parley (Silver Tongue) is the sweet talk of a host who wants guests:
cheaper hirelings and small neutral stacks that stand aside.

| Skill      | Nutcracker | Confectioner |     | Skill       | Nutcracker | Confectioner |
| ---------- | ---------: | -----------: | --- | ----------- | ---------: | -----------: |
| Bloom      |          1 |            2 |     | Fortune     |          4 |            4 |
| Accord     |          3 |            7 |     | Captaincy   |          6 |            4 |
| Clock      |          3 |           10 |     | Omens       |          5 |            6 |
| Hush       |          1 |            5 |     | Logistics   |          6 |            4 |
| Storm      |          0 |            0 |     | Pathfinding |          4 |            4 |
| Offence    |          6 |            2 |     | Scouting    |          3 |            4 |
| Armour     |          9 |            3 |     | Wellspring  |          1 |            7 |
| Archery    |          6 |            4 |     | Learning    |          3 |            5 |
| Riposte    |          7 |            2 |     | Estates     |          5 |            5 |
| Standards  |          5 |            4 |     | Mustering   |          5 |            3 |
| Tactics    |          8 |            4 |     | Parley      |          4 |            8 |
| Leadership |          6 |            3 |     | Scrollcraft |          2 |            5 |

Storm is 0 for both classes: it is opposed to both of the faction's main
schools and has no weight in its guild (the Restless treat Bloom the same
way). Armour and Riposte lead the Nutcracker's army skills: the Kingdom
holds a line and answers blows.

## 8. Named heroes

Specialty forms and numbers are those of RULES_V2 3.7. Eight, as for the
other factions (four per class).

| Hero                     | Class        | Specialty                                    |
| ------------------------ | ------------ | -------------------------------------------- |
| Captain Kernel Crackwell | Nutcracker   | Creature: Peppermint Archers                 |
| Dame Brittle Hazelby     | Nutcracker   | Creature: Gummy Bears                        |
| Major Walnut Thumps      | Nutcracker   | Command: Crack! counts C one higher          |
| Corporal Humbug          | Nutcracker   | Resource: 250 gold each day                  |
| Madame Praline           | Confectioner | Spell: Late Bell                             |
| Old Mother Treacle       | Confectioner | Spell: Treacle                               |
| Auntie Fondant           | Confectioner | Skill: Clock at rank 2 (in place of Clock 1) |
| Granny Gingersnap        | Confectioner | Creature: Gingerbread Men                    |

Treacle is the Clock tier 2 area page (Slowed 1, clock 3, on a hex and the
six around it); CONTENT_HEROES 4 lets a faction name any tier 1 or 2 page.

## 9. Town: the Confectionery

Starts with the Village Hall, the Gingerbread House, and a Tavern. One
building per day. Costs marked "common" are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

| Building                         | Cost                                 | Requires                    | Effect                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Village, Town, City Hall         | common                               | common                      | Income 500, 1000, 2000 gold a day                                                                                                                                                                   |
| Candy-Cane Fence                 | common (Fort 1)                      | -                           | Fort level 1; needed for the Taffy Ranch                                                                                                                                                            |
| Gingerbread Wall                 | common (Fort 2)                      | Candy-Cane Fence            | Fort level 2                                                                                                                                                                                        |
| Sugar-Glass Keep                 | common (Fort 3)                      | Gingerbread Wall, City Hall | Fort level 3 with its tower                                                                                                                                                                         |
| Marketplace, Resource Silo       | common                               | common                      | Trade; +1 wood and +1 ore a day                                                                                                                                                                     |
| Magic Guild 1 to 4               | common                               | common                      | Capped at level 4                                                                                                                                                                                   |
| Tavern                           | (start)                              | -                           | Hire heroes                                                                                                                                                                                         |
| Gingerbread House (T1)           | (start)                              | -                           | Gingerbread Men                                                                                                                                                                                     |
| Mint Range (T2)                  | 750 gold, 5 wood, 1 essence          | Gingerbread House           | Peppermint Archers                                                                                                                                                                                  |
| Taffy Ranch (T3)                 | 1200 gold, 10 wood                   | Candy-Cane Fence            | Taffy Wranglers                                                                                                                                                                                     |
| Sugarplum Bower (T4)             | 2000 gold, 5 wood, 4 essence         | Mint Range                  | Sugarplums                                                                                                                                                                                          |
| Gummy Den (T5)                   | 3800 gold, 10 wood, 3 ore, 3 essence | Taffy Ranch                 | Gummy Bears                                                                                                                                                                                         |
| Rock Candy Grotto (T6)           | 8000 gold, 10 wood, 5 ore, 8 essence | Gummy Den, Sugarplum Bower  | Rock Candy Dragons                                                                                                                                                                                  |
| Bread Oven (Drill)               | 800 gold, 5 wood                     | Gingerbread House           | Gingerbread Men gain Hot from the Oven                                                                                                                                                              |
| Mint Press (Drill)               | 1000 gold, 5 wood, 1 essence         | Mint Range                  | Peppermint Archers gain Cool Mint                                                                                                                                                                   |
| Pulling Hooks (Drill)            | 1500 gold, 10 wood                   | Taffy Ranch                 | Taffy Wranglers gain Long Pull                                                                                                                                                                      |
| Bakery (special)                 | 1000 gold, 5 wood                    | Gingerbread House           | +8 Gingerbread Men a week in this town (the Gingerbread House grows 23)                                                                                                                             |
| Larder (special)                 | 3000 gold, 5 wood, 3 essence         | Sugarplum Bower             | While its owner holds it, in that player's battles: when a native stack ends a walk on sweets, the sweets are consumed and the stack gains Hastened, clock 2, and is healed 5 x its count, reviving |
| The Four O'Clock (Keystone Hall) | the Keystone                         | City Hall                   | Common Keystone effects, and every native stack in its owner's armies starts each battle Hastened, clock 1                                                                                          |

Every building: 50,050 gold, 150 wood, 70 ore, 32 essence (25 buildings
with the three the town starts with and the Four O'Clock). The tier 6 chain
(Mint Range, Candy-Cane Fence, Taffy Ranch, Sugarplum Bower, Gummy Den,
Rock Candy Grotto) costs 17,750 gold, 55 wood, 8 ore and 16 essence: the
lightest on ore and the hungriest for essence of the four.

- **The Bakery is the one special that is not income.** The other three
  towns' first special pays gold or essence (Tithe Barn, Essence Still, Loot
  Pile); the Kingdom bakes its army instead, like a Heroes horde building.
  Eight Gingerbread Men are 320 gold of creatures (FV 456) a week against
  the Tithe Barn's 1750 gold: cheaper to build and weaker on paper, and the
  first number the balance bead should look at if the Kingdom falls behind
  in the middle game.
- **The Larder is the Kingdom eating its own.** Its dead leave sweets; a
  native that walks onto them gets the sugar rush and the healing. The same
  sweets feed a Restless Ghoul's Feast and a Banshee's Keen, so the Restless
  deny it by eating first.
- Lean: **essence**, then gold. The Restless lean on ore and essence, the
  Realm on gold and wood, the Horde on wood.

| Faction | Leans on      | All buildings (gold / wood / ore / essence) | One week of creatures         |
| ------- | ------------- | ------------------------------------------- | ----------------------------- |
| Candy   | Essence, gold | 50,050 / 150 / 70 / 32                      | 10,880 gold, 1 ore, 9 essence |

Neutral garrison of a Candy town: 26 Gingerbread Men and 8 Peppermint
Archers (FV 2346; the Restless's is 2344). Starting militia (RULES_V2 5.5):
15 Gingerbread Men. Town names, in order of use: Sugarloaf, Toffee Hollow,
Marzipan Mews, Fudgecombe, Gumdrop Green.

## 10. Art

Every Candy asset is new; nothing is reused from Pulp Wars. The direction is
[ART_DIRECTION.md](../art/ART_DIRECTION.md) (Bold chibi, black outlines,
sun at the bottom left, never mirrored) and, for towns,
[classes/towns.md](../art/classes/towns.md). The Prize Pumpkin
(`stray-prize-pumpkin`) is the model for a cute food creature: a face on the
food, stubby limbs, one oversized prop.

### 10.1 Look and palette

| Material            | Colour (shadow)       | Where                                              |
| ------------------- | --------------------- | -------------------------------------------------- |
| Gingerbread         | `#b86b34` (`#7d4420`) | Gingerbread Men, walls, the dominant material      |
| Royal icing         | `#fff4ec` (`#e3cfc4`) | Piping, drips, roof snow, the light value          |
| Strawberry frosting | `#e2589b` (`#a8336c`) | Roofs, the faction colour, the Taffy Wranglers     |
| Candy-cane red      | `#e03a3e` (`#9c2229`) | Stripes with icing white: the one signature accent |
| Mint                | `#7fd6b5` (`#3f9a7c`) | Peppermint hoods, shutters, small accents          |
| Sugar glass         | `#8fe3e8` (`#4fa9b3`) | The Dragon, windows, turrets                       |
| Licorice            | `#2b2230`             | Outlines stay black; licorice trim may use this    |

Sugarplum purple stays on the Sugarplum only, so the town never reads as
the Restless's violet. Sinister-sweet lives in details, never in gore: a
smile a little too wide, the warm glow of an oven door, a "Welcome" mat.

### 10.2 Creatures and heroes

| Id                  | Sprite key                | Canvas (px)                | Subject                                                                                            |
| ------------------- | ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `gingerbread-man`   | `candy-gingerbread-man`   | 48 x 72, padded to 56 x 80 | a small gingerbread cookie soldier with white icing piping, gumdrop buttons and a candy-cane spear |
| `peppermint-archer` | `candy-peppermint-archer` | 56 x 80                    | a candy kid in a red-and-white peppermint-swirl hood with a candy-cane bow                         |
| `taffy-wrangler`    | `candy-taffy-wrangler`    | 56 x 80                    | a stretchy pink taffy cowpoke in a toffee hat, swinging a lasso of pulled taffy                    |
| `sugarplum`         | `candy-sugarplum`         | 56 x 80                    | a plump purple sugarplum fairy with spun-sugar wings and a lollipop wand, hovering                 |
| `gummy-bear`        | `candy-gummy-bear`        | 72 x 88 (large)            | a big translucent red gummy bear with a sugar crust and a wide friendly grin                       |
| `rock-candy-dragon` | `candy-rock-candy-dragon` | 88 x 104 (giant)           | a crystal dragon of pink and teal rock-candy facets with sugar-glass wings                         |
| `nutcracker`        | `hero-nutcracker`         | 72 x 88                    | a toy-soldier nutcracker captain with a big jaw and a tall hat, on a candy-striped rocking horse   |
| `confectioner`      | `hero-confectioner`       | 72 x 88                    | a sweet old baker in an apron with a giant wooden spoon, riding a marzipan pig                     |

Creature portraits are 1:1 head crops of the sprites (no calls); each class
and each named hero gets a 48 x 48 bust (V02_UNIT_ART). The tumbling
"reeled in" pull reuses the battle move animation. A Stuck stack needs the
condition's 16 px overlay; Afters needs the second Dragon slot on the
timeline bar.

### 10.3 Map town, backdrop and buildings

- **Map town, camp stage (fort 0-1), 3x2, 240 x 184:** a fat gingerbread
  cottage with a pink icing-dripped roof and a gumdrop chimney among packed
  little sweet-shop cottages, behind a candy-cane fence with the signature
  gate, an arch of two crossed candy canes, at the bottom centre over the
  entry cell.
- **Map town, fort stage (fort 2-3), 3x2, 240 x 184:** a tall tiered-cake
  palace with a cuckoo-clock tower whose hands stand at four (the central
  landmark), sugar-glass turrets and gingerbread houses packed round it,
  behind a thick gingerbread wall with the candy-cane arch gate between two
  lollipop towers. The camp stage must not have the clock tower.
- **Backdrop, 256 x 224 (generated 256 x 232, shown x2):** the native snow
  drawn as icing (white with a faint pink tint, a few sprinkles), a pale
  pink and mint sky, gumdrop hills and a sugar-glass castle on the
  horizon; lollipop trees and giant candy canes only at the edges.
- **Building sprites, 22 at 64 x 64**, one chunky toy building each, the
  accepted Candy fort town as style image. Ids are the section 9 names in
  kebab case.

| Building id         | Signature feature                                                         |
| ------------------- | ------------------------------------------------------------------------- |
| `village-hall`      | a small iced layer-cake hall with a pink frosting roof                    |
| `town-hall`         | the same hall grown, with a cuckoo-clock gable                            |
| `city-hall`         | the same hall grown again, under a tall tiered-cake dome                  |
| `candy-cane-fence`  | a row of fat candy canes with the arch gate                               |
| `gingerbread-wall`  | a thick gingerbread wall with icing battlements                           |
| `sugar-glass-keep`  | a round sugar-glass keep inside a gingerbread wall, with a lollipop tower |
| `marketplace`       | a sweet stall with a striped awning and jars of sweets                    |
| `resource-silo`     | a giant sugar jar with a cork lid                                         |
| `magic-guild`       | a spire of stacked macarons with a clock face                             |
| `tavern`            | a tea room with a giant teapot sign                                       |
| `gingerbread-house` | the classic gingerbread cottage studded with sweets                       |
| `mint-range`        | an archery butt painted as a peppermint swirl                             |
| `taffy-ranch`       | a pink barn with a taffy-pulling wheel                                    |
| `sugarplum-bower`   | a round plum-shaped bower with spun-sugar windows                         |
| `gummy-den`         | a wobbly mound of red jelly with a cave mouth                             |
| `rock-candy-grotto` | a cave of pink and teal sugar crystals                                    |
| `bread-oven`        | a domed brick oven with a glowing door                                    |
| `mint-press`        | a squat mint-green press with a crank                                     |
| `pulling-hooks`     | two big hooks with a loop of pink taffy between them                      |
| `bakery`            | a bakery with a giant pretzel sign                                        |
| `larder`            | a pantry cupboard bursting with jars, its door ajar                       |
| `the-four-oclock`   | a giant cuckoo clock tower stopped at four, a teacup on top               |

Two Candy buildings must not share a silhouette: the halls are cakes, the
Gingerbread House is a cottage, the Magic Guild a macaron spire, the Four
O'Clock a clock tower.

### 10.4 Every asset

Call estimates are per sample-then-batch practice (PIPELINE.md): Pixen
takes about US$0.01 a call, `generate-image-v2` about US$0.08 (the recorded
costs of the `faction-units`, `class-heroes`, `chunky-towns` and
`chunky-buildings` sets in `art/costs.jsonl`).

| Asset                          | Count | Size (px)                       | Studio set          | Calls (est.) |
| ------------------------------ | ----: | ------------------------------- | ------------------- | -----------: |
| Creature sprites               |     6 | as 10.2                         | `faction-units`     |  12-18 Pixen |
| Creature portraits             |     6 | 48 x 48 crops                   | (from the masters)  |            0 |
| Hero class sprites (mounted)   |     2 | 72 x 88                         | `class-heroes`      |    4-6 Pixen |
| Hero class busts               |     2 | 48 x 48                         | `class-heroes`      |    2-3 Pixen |
| Named-hero busts               |     8 | 48 x 48                         | `named-heroes`      |   9-12 Pixen |
| Map town, camp and fort        |     2 | 240 x 184 (generated 232 x 176) | `chunky-towns`      |       4-6 v2 |
| Town backdrop                  |     1 | 256 x 224 (generated 256 x 232) | `town-backdrops`    |       1-2 v2 |
| Building sprites               |    22 | 64 x 64                         | `chunky-buildings`  |       7-9 v2 |
| Faction outpost (2x2 site)     |     1 | 128 canvas, body about 105 x 90 | `map-objects`       |       1-2 v2 |
| Stuck condition icon           |     2 | 32 x 32 and 16 x 16             | `icons-conditions`  |         2 v2 |
| Flypaper Ribbon artifact icon  |     1 | 32 x 32                         | `icons-artifacts`   |         1 v2 |
| Sounds: recruit, victory, town |     3 | mp3 cues as SOUND.md            | `tools/art/sfx.mjs` | 3 ElevenLabs |

Total about 25-35 Pixen and 16-22 `generate-image-v2` calls, roughly US$2,
plus three sound calls. The optional candy ground (section 11) would add
about 15-20 calls (US$1-1.5).

## 11. Terrain

**No new ground is needed.** The Kingdom's native terrain is **Snow**,
drawn on its backdrop and read as icing sugar: snow costs 150, so the
discount to 100 is the largest any faction has, but snow lies only in the
wild winter zone some maps have. Start zones take their terrain from the
player's index, not the faction (`gen/config.ts`), so like every faction
the Kingdom usually starts on grass, jungle, steppe or wasteland; a native
terrain matters to a wandering hero, as for the Realm.

A **candy ground** ("Frosting": pink-white icing with sprinkles, lollipop
and candy-cane groves, gumdrop hills as its peaks, candy decorations, its
own `GROUND_FAMILY`) would make Candy landfalls a place on the map, like the
volcanic, winter and desert zones. It is optional and deferred: it is
landscape, not faction play, it needs a ground, a tree set, a peak set,
decorations and a map-generator zone rule, and it would replace snow as the
native terrain. Section 14 lists it as an optional bead for the user to
call.

Faction outposts stand on their faction's native terrain
(CONTENT_MAP_OBJECTS 3.2); snow being rare, Candy outposts on maps without a
winter zone need the map bead's fallback (grass), recorded in bead 7.

## 12. Neutrals, map and AI

- **Neutrals.** No Candy creature becomes a wandering guard: strays and
  caretakers keep that job. Candy creatures appear on the map as neutral
  Candy towns (garrison above), as Faction Outposts (tiers 1 to 4: four new
  outpost variants, 16 in all) and in the hero pool. A garrison with no hero
  takes its town's faction (RULES_V2 3.8), so a neutral Candy town's
  garrison sticks; an outpost's stock hired by another faction does not.
- **Map determinism.** The outpost pool (`rollContents`, every faction
  creature with growth) and `NEUTRAL_TOWN_FACTIONS` both draw from lists
  the new faction lengthens, so every generated map's outposts and neutral
  town factions shift. Bead 7 adds Candy to both deliberately and updates
  the named-map fingerprints in the same commit.
- **Battle AI** (the stack AI and its intents, AI.md):
  - Stuck removes walks from the legal moves, so the move generator needs
    no change; the evaluation should count "becomes Stuck" as a cost for
    an enemy shooter or caster walking next to a native, and as a gain for
    a native reaching one.
  - Reel In: score each target within range and limit like the Ogre's Hurl,
    preferring shooters and casters (a pulled shooter cannot shoot) and,
    after the Long Pull drill, Slowed stacks; consider pulling an own
    Dragon into contact.
  - Sugar Rush: give Hastened to the strongest adjacent friendly stack that
    has not acted and fits the gate; Sitting Ducks: prefer Stuck targets.
  - Afters: the round-end turn is an ordinary turn without a walk (attack
    an adjacent stack, else defend).
  - Chewy: an attacker choosing between Gummy Bears and a neighbour should
    see the halved blow in the rehearsal, as it already sees every modifier.
- **Hero AI.** Crack! when two or more friendly stacks stand beside a stuck
  enemy; Come In, Dear on the strongest enemy shooter or caster within
  reach, toward the Gummy Bears or the Dragons; Appointment and Late Bell as
  ordinary pages; Echo a Stuck with Accord and Hush pages; Fuel Clock pages
  with enemy Bloom and Storm conditions.
- **Adventure AI.** First-week opening (`OPENINGS`): Mint Range, Town Hall,
  Candy-Cane Fence, Taffy Ranch. `WANDER_DAYS`: 2 (a Speed 5 early army, no
  faster than the Realm's). The general build order needs the Bakery after
  the Town Hall and the Larder once the Sugarplum Bower stands.

## 13. Balance plan

The numbers above are hand-set to the existing scales (ECONOMY 8.1, BALANCE
6). Confirming them needs the simulation runs of BALANCE.md section 1,
which under the standing rule need the **user's go-ahead** before they run.

**Expected matchups**, from the rules alone:

| Against      | Expectation           | Why                                                                                                                                                                                                                                            |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Horde    | Slightly behind (45%) | Launched pushes stuck Goblins free and Bombs punish a Candy melee; the Horde's guild (Bloom 4, Storm 2) burns Stuck as Fuel. In return the Horde's shooters and Boomshamans are the easiest Reel In targets                                    |
| The Realm    | Even (50%)            | Stuck stops Knights repositioning after a charge and Sworn swaps (a swap replaces the walk); but the Dragonslayer's Stand Fast answers Afters, and the Realm's Change Places page frees a stuck stack                                          |
| The Restless | Even (50%)            | Skeletons want to stand and die, so Stuck costs them little; Banshees get silenced by contact; Pass on hands Stuck back; Ghouls and Keen feed on Candy sweets. Hush is allied to Clock, so neither side gets Fuel from the other's main school |

**What to measure and tune, in order:**

1. The Rock Candy Dragon: price (3600 gold) and Damage (28) against
   Afters. It is the lowest value per gold of the four tier 6 creatures on
   paper (FV 354 per 1000 gold at the sim's prices; Realm 479, Restless
   425, Horde 512) because Afters doubles its attacks; tier duels and the
   late stage will show whether that is right.
2. Stuck's clock (2) and Sticky's reach (melee only). Clock 1 is the first
   lever if the Kingdom locks melee armies too well.
3. Reel In: the limit of 30 HP per Wrangler, range 6, usable every turn.
   Once per battle is the lever if shooters cannot live against it.
4. Sitting Ducks (x 150%; x 125% is the step down) and Chewy (x 50%).
5. The Gingerbread Man in tier 1 duels (Speed 6 on 9 HP) and the weekly
   FV (7505, the lowest; the Restless have 7700).
6. Guild weights and cap, the Bakery, and both Commands' reach (C + 4
   hexes for Come In, Dear).

**Method.** The sim harness gains the Kingdom (`tests/sim/armies.ts`), then
`npm run sim:battles -- --mode report --seeds 20 --matrix` over the twelve
ordered pairings, `--mode tiers` and `--mode duels`, and balance mode by
leaning, with `--tweak` for each number above. Targets as in rounds 1 to
4: every faction cell within 35-65% (40-60% where it can be had), the
three existing factions' cells unmoved beyond the noise, the attacker at
45-55%. Results become a new section of BALANCE.md; changed numbers go back
into this document.

## 14. Implementation beads

Numbered in build order. "After" names prerequisites that must be
published first. Art beads take their ids, names and descriptions from this
document, so they can run beside bead 1.

| #   | Bead                                        | Profile                                         | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | After         | Art calls (est.)       |
| --- | ------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------- |
| 1   | Candy data and rules                        | logic (unit tier: the battle engine is touched) | `FactionId` `candy`; the Stuck kind and the "cannot walk" modifier; Sticky; the six creatures, their abilities and the three Drills; Afters (round-end extra turn) and Chewy (per-round melee flag); the town tree with guild cap 4 and the weights of section 2; the two classes, Commands, named heroes; the Bakery, Larder and Four O'Clock; the Flypaper Ribbon and Pile On's change; glossary keywords; `available: false` until bead 7. Focused tests on hand-built battle states for each ability, the Stuck landing and its counters, Afters with Heartened | -             | 0                      |
| 2   | Candy creature art                          | asset-only                                      | Six sprites and their portrait crops, the Candy faction outpost, the Stuck icons (32 and 16 px) and the Flypaper Ribbon icon; registered in `src/assets/v02-units.ts`, `map-objects.ts` and `icons.ts`                                                                                                                                                                                                                                                                                                                                                              | -             | 12-18 Pixen, 4-5 v2    |
| 3   | Candy hero art                              | asset-only                                      | Nutcracker and Confectioner mounted sprites and busts; eight named-hero busts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | -             | 15-21 Pixen            |
| 4   | Candy town art                              | asset-only                                      | Map town camp and fort stages, the backdrop, 22 building sprites; `town-art.ts` and `town-buildings.ts` lists; a row in classes/towns.md                                                                                                                                                                                                                                                                                                                                                                                                                            | -             | 12-17 v2               |
| 5   | Candy ground (optional, on the user's call) | asset-only and logic                            | Frosting ground, its trees, peaks and decorations, a map-generator zone rule, the native terrain moved from snow                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 1             | 15-20 (Pixflux and v2) |
| 6   | Candy AI                                    | logic                                           | Battle AI valuations and ability use (section 12), hero AI Commands, `OPENINGS`, `WANDER_DAYS`, build order; focused AI tests on hand-built states                                                                                                                                                                                                                                                                                                                                                                                                                  | 1             | 0                      |
| 7   | Candy integration                           | cross-cutting                                   | `available: true`; setup list and hint line (`src/ui/app.ts`), gallery, magic wheel (data-driven: check it draws the Kingdom at 126 degrees), the hero pool and tavern, neutral towns and outposts (with named-map fingerprints), the outpost fallback terrain, the three faction sounds, sim armies, `ai/match.ts`; doc updates (ECONOMY 1, 3, 6.2 and 8.1, RULES_V2 1.3 and 3.8, CONTENT_SPELLS 2, CONTENT_HEROES 2 and 4, CONTENT_ARTIFACTS, CONTENT_MAP_OBJECTS). A muted browser screenshot of setup, the town screen and a battle                             | 1, 2, 3, 4, 6 | 3 ElevenLabs           |
| 8   | Candy balance                               | cross-cutting                                   | Section 13's runs and tuning; BALANCE.md section; numbers back into this document. Simulations only with the user's go-ahead                                                                                                                                                                                                                                                                                                                                                                                                                                        | 7             | 0                      |

Beads 2, 3 and 4 may run in parallel with each other and with bead 1. Bead
1 is the largest; if it runs long it splits cleanly into 1a (engine: Stuck
and "cannot walk", round-end extra turns, the per-round melee flag) and 1b
(faction data on top).

## 15. Notable calls

| Call                                                                              | Why                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The faction is called the Candy Kingdom (orchestrator's call), id `candy`         | The user's words; the concept's "Sweetlands" sketch is superseded                                                                                                                                       |
| The birthright is Sticky (melee makes Stuck), not the concept's Edible            | Stuck is a rule a spectator sees in one round, a thing other rules can move and burn, and the pull's partner; Edible spent creatures for good and needed a new verb                                     |
| Stuck is a condition that stops walking only, never acting                        | It cannot lock a stack out of the battle, so it is not a Hold; a stuck stack always has someone in reach                                                                                                |
| Clock 4, Accord 3, Hush 2, Bloom 1, Storm 0; guild cap 4                          | The widest empty arc of the wheel, midway between the Realm and the Restless; Storm is opposed to both main schools; tier 5 Double Time with Afters is too much to build                                |
| The Kingdom pulls (Reel In, Come In, Dear) where the Horde pushes                 | One clear physical verb per faction; pushes and pulls meet at Cannonball (6.3)                                                                                                                          |
| The tier 6 is a dragon whose bent rule is a round-end second turn                 | A Clock-shaped top tier that pays off holding enemies in place; a dragon for the Realm's Dragonslayer to meet                                                                                           |
| The tier 5 is a tank (Chewy) rather than a second damage dealer                   | Someone has to stand beside the stuck enemy and take its blows                                                                                                                                          |
| Candy creatures leave sweets; the Larder eats them                                | Law 6 at last has its sweets; the sinister note lives in a special building                                                                                                                             |
| The Bakery grows creatures instead of paying income                               | A Heroes horde building gives the town its own economy; flagged for the balance bead                                                                                                                    |
| Native terrain Snow (as icing), no new ground                                     | No new art or generator work is needed to play; a candy ground stays an optional bead                                                                                                                   |
| Eight named heroes, not six                                                       | The other factions have eight; the hero pool and the portrait list keep one shape                                                                                                                       |
| Appointment, not Late Bell, as the Confectioner's page                            | The battle AI casts damage better than set-up (BALANCE 7)                                                                                                                                               |
| Flypaper Ribbon and the Pile On change are added outside the faction              | The admission rule needs makers and users of Stuck beyond the Kingdom                                                                                                                                   |
| Reel In and Come In, Dear pull "re-aimed" (bead 1)                                | Tow's straight-line pull leaves a stack off the six lines short of contact; the pull now picks its direction again at each hex, still stopping before a blocker or stack                                |
| The Larder and The Four O'Clock ride on natives as abilities (bead 1)             | As the Great Flinger gives Cannonball: the battle resolver adds `larder` and `the-four-oclock` to the owner's natives; no new side flags                                                                |
| Battle-start abilities run after the armies' start rules (bead 1)                 | Hot from the Oven and The Four O'Clock use a new ability hook, run in field order before Morale and Luck                                                                                                |
| The Bakery's +8 counts before any +50% growth (bead 1)                            | It raises the dwelling's base growth to 23, as the doc's "grows 23" reads; the Keystone's bonus then applies to 23                                                                                      |
| Until bead 7 the Kingdom stays off maps, the pool and the gallery (bead 1)        | `available: false` now also keeps its named heroes out of the hero pool and its content out of the gallery; Candy outposts and the Flypaper Ribbon are held off generated maps, so no fingerprint moves |
| Named-hero ids are the first distinctive word of each name (bead 1)               | `kernel`, `brittle`, `walnut`, `humbug`, `praline`, `treacle`, `fondant`, `gingersnap`, as the hero art bead registers them                                                                             |
| Afters' second timeline slot is left to bead 7 (bead 1)                           | The engine exports `aftersDue(state)`, the stacks that will take it, for the timeline bar to draw                                                                                                       |
| The AI reads three ability hints: `aiPull`, `aiMeleeMakes`, `aiWalkOnto` (bead 6) | Reel In, Sticky and the Larder tell the battle AI what they do without the AI naming Candy content; other factions' choices change only against Candy or Stuck                                          |
| Bakery rank 22, Larder rank 45 in the build order (bead 6)                        | After the Town Hall and the Mint Range, before the fence; the Larder right after the Sugarplum Bower, before the Gummy Den. The balance bead may move both                                              |
| Keystone halls are built for every faction, and the Keystone goes home (bead 6)   | The AI dug Keystones and never built a hall; The Four O'Clock needed it, and fixing it only for Candy would be a special case                                                                           |

**Engine asks** (no new noun or verb; the first two are the only new
mechanics): a "cannot walk" modifier for the condition hook list (RULES_V2
1.3), read by every walk and every rule that replaces one; an extra turn
taken at round end instead of at once, with the cap of one per round
unchanged (Afters); a per-round "struck in melee" flag (Chewy); the
birthright attachment "on a native's Strike" adding a condition (RULES_V2
3.8 lists added Strikes and modifiers); Reel In reuses Tow's pull and Hurl's
HP limit; the Larder reuses Feast's "on ending a walk on a feature".
