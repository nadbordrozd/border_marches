# Faction: The Lost World

Status: canonical for the MVP (bead `border_marches-xaj.1`, 2026-11-15).
Rules that apply to every faction (damage formula, turn order, retaliation)
are in [GAME_DESIGN.md](GAME_DESIGN.md#9-battle-rules-deterministic);
resource prices and income in [ECONOMY.md](ECONOMY.md).

## 1. Identity

Prehistoric pulp: a hidden plateau where caveman tribes ride and worship
dinosaurs. Cheerful, loud and a bit ridiculous: a toy box of dinosaurs, never
a nature documentary.

| Property       | Value                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Native terrain | Jungle (Lost World heroes move on it at 100, not 150)                                                                                |
| Faction colour | `#fe7500` (crest orange)                                                                                                             |
| Hero class     | Chieftain                                                                                                                            |
| Play style     | Cheap enablers (Cavemen, Spitters) set up adjacency and debuffs; Raptors and Triceratops cash them in; the T-Rex ignores retaliation |

## 2. Roster

Damage is one fixed number per creature. Costs are per creature.

| Tier | Unit                         |  HP | Atk | Def | Dmg | Speed | Shots | Growth/week | Cost                          | Ability     |
| ---: | ---------------------------- | --: | --: | --: | --: | ----: | ----: | ----------: | ----------------------------- | ----------- |
|    1 | Caveman                      |  10 |   4 |   3 |   2 |     4 |     - |          14 | 50 gold                       | Mob         |
|    2 | Spitter (ranged dilophosaur) |  14 |   6 |   4 |   3 |     5 |    10 |           9 | 110 gold                      | Venom       |
|    3 | Raptor                       |  22 |   8 |   5 |   5 |     9 |     - |           7 | 220 gold                      | Pack Hunter |
|    4 | Shaman (ranged)              |  35 |   9 |   8 |   8 |     5 |     6 |           4 | 450 gold + 1 essence          | War Drums   |
|    5 | Triceratops                  |  80 |  13 |  16 |  15 |     5 |     - |           2 | 1100 gold + 2 ore             | Charge      |
|    6 | T-Rex                        | 200 |  20 |  16 |  40 |     8 |     - |           1 | 3000 gold + 4 ore + 2 essence | Terror      |

## 3. Abilities

All deterministic, all checked at the moment of the attack, all shown in the
attack preview. "Adjacent" means sharing a hex edge. "Other friendly stack"
never counts the acting stack itself; any stack counts, even one creature.

| Unit        | Ability         | Exact rule                                                                                                                                                             |
| ----------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caveman     | **Mob**         | +1 Attack for each other friendly stack adjacent to the target (max +5). Applies to attacks and retaliations.                                                          |
| Spitter     | **Venom**       | A stack hit by a Spitter (shot or melee) has -3 Defense until the end of the next round. A new hit refreshes the duration; it never stacks. Defense cannot go below 0. |
| Raptor      | **Pack Hunter** | +20% damage for each other friendly stack adjacent to the target (max +100%, x 2.0). Applies to attacks and retaliations.                                              |
| Shaman      | **War Drums**   | Other friendly stacks adjacent to the Shaman get +2 Attack. Several Shaman stacks do not stack: a stack gets +2 at most.                                               |
| Triceratops | **Charge**      | +15% damage for each hex moved this turn before the attack (max +75% at 5 hexes). Retaliations have moved 0 hexes.                                                     |
| T-Rex       | **Terror**      | Stacks attacked by the T-Rex cannot retaliate.                                                                                                                         |

Notes for play and balance:

- Spitters and Shamans shoot only when no enemy is adjacent, so War Drums
  (which needs the Shaman near the front) competes with its own shooting.
- Splitting Cavemen into one-creature stacks to feed Mob and Pack Hunter is
  allowed: cheap enablers are the point. Watch it in playtests.

## 4. Combos

The worked numbers use the rules in
[GAME_DESIGN.md section 9](GAME_DESIGN.md#9-battle-rules-deterministic).

### 4.1 Venom, Mob and Pack (worked example, exact)

**Setup.** Chieftain with Attack 2, Defense 2. Army: Cavemen A (16), Cavemen
B (16), Spitters (9), Raptors (7). Enemy: 20 Orc Brutes (HP 28, Atk 9, Def 6,
Dmg 6, Speed 4; no hero). Both Caveman stacks reached hexes next to the Orc
Brutes in earlier rounds.

**Round 2, Spitters shoot** (applies Venom until the end of round 3):

- A = 6 + 2 = 8, D = 6, M = 1 + 0.05 x 2 = 1.10
- damage = floor(9 x 3 x 1.10) = floor(29.7) = **29**
- Top Orc has 28: r = 1, kills 1, new top 28 - 1 = 27. **Orc Brutes 19, top 27/28.**

**Round 3.** Order: Raptors (Speed 9) **wait**; Spitters (5); Cavemen A and B
(4, attacker's side first); Orc Brutes (4); then the waiting Raptors.

| Step                                                                                | Calculation                                                               | Result                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. Spitters shoot (Venom refreshed to end of round 4)                               | A 8, D = 6 - 3 = 3, M = 1.25; 9 x 3 x 1.25 = 33.75                        | 33 damage: r = 6, 1 kill, top 22. **Orcs 18, top 22**                                    |
| 2. Cavemen A attack; Mob +1 (Cavemen B beside the target)                           | A = 4 + 2 + 1 = 7, D 3, M = 1.20; 16 x 2 x 1.20 = 38.4                    | 38 damage: r = 16, 1 kill, top 12. **Orcs 17, top 12**                                   |
| 2r. Orcs retaliate (their one retaliation this round)                               | A 9, D = 3 + 2 = 5, M = 1.20; 17 x 6 x 1.20 = 122.4                       | 122 damage: r = 112, 12 kills, top 8. **Cavemen A 4, top 8/10**                          |
| 3. Cavemen B attack; Mob +1 (Cavemen A)                                             | same as step 2                                                            | 38 damage: r = 26, 1 kill, top 2. **Orcs 16, top 2**. No retaliation left                |
| 4. Orc Brutes attack Cavemen B                                                      | A 9, D 5, M = 1.20; 16 x 6 x 1.20 = 115.2                                 | 115 damage: r = 105, 11 kills, top 5. **Cavemen B 5**                                    |
| 4r. Cavemen B retaliate; Mob +1                                                     | A 7, D 3, M = 1.20; 5 x 2 x 1.20 = 12                                     | 12 damage: r = 10, 1 kill, top 18. **Orcs 15, top 18**                                   |
| 5. Raptors (waited) step in; Pack Hunter x 1.40 (Cavemen A and B beside the target) | A = 8 + 2 = 10, D 3, M = 1 + 0.05 x 7 = 1.35; 7 x 5 x 1.35 x 1.40 = 66.15 | **66 damage**: r = 48, 2 kills, top 8. **Orcs 13, top 8**. No retaliation (already used) |

**Without the combo** (Raptors open round 3 into a fresh, unvenomed stack of
19): A 10, D 6, M 1.20, 7 x 5 x 1.20 = 42 damage, 1 kill; the retaliation is
floor(19 x 6 x 1.10) = 125 and kills **5 of the 7 Raptors**. With the combo
the same Raptors deal 66 and lose none. The Cavemen paid for it: cheap
creatures soaking the one retaliation is the intended trade.

### 4.2 War Drums beside a charging Triceratops

4 Triceratops charge 5 hexes and end beside a Shaman stack and a stack of 6
Ogres (HP 90, Atk 14, Def 12, Dmg 16).

| Case                            | Calculation                                                      |               Damage | Ogre retaliation on the Triceratops (D = 16 + 2 = 18) |
| ------------------------------- | ---------------------------------------------------------------- | -------------------: | ----------------------------------------------------- |
| Combo: Drums +2, Charge x 1.75  | A = 13 + 2 + 2 = 17 vs 12, M 1.25; 4 x 15 x 1.25 x 1.75 = 131.25 | 131 (1 kill, top 49) | 5 Ogres: 5 x 16 x 20/24 = 66.7, 66, no kill           |
| No combo: stand still, no Drums | A 15 vs 12, M 1.15; 4 x 15 x 1.15 = 69                           | 69 (no kill, top 21) | 6 Ogres: 6 x 16 x 20/24 = 80 exactly, 1 kill          |
| Combo plus Venom (D 9)          | A 17 vs 9, M 1.40; 4 x 15 x 1.40 x 1.75 = 147                    | 147 (1 kill, top 33) | as the combo row                                      |

The combo nearly doubles the damage. The cost is position: the Shaman must
stand within two hexes of the enemy, where it may be engaged and unable to
shoot.

### 4.3 T-Rex finisher

Terror removes retaliation, so the T-Rex is the safe opener against a big
stack, or the closer after Cavemen have drawn the retaliation elsewhere.
With War Drums and Venom it hits at A = 20 + 2 + 2 = 24 against a venomed
Orc Brute (D 3): M = 2.05, one T-Rex deals floor(40 x 2.05) = 82.

## 5. Hero class: Chieftain

| Property                  | Value                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| Starting Attack / Defense | 2 / 2                                                            |
| Movement                  | 1500 per day; Jungle costs 100 (native)                          |
| Starting army             | 18 Cavemen, 6 Spitters                                           |
| Level-up offers (MVP)     | +1 Attack or +1 Defense                                          |
| Map sprite                | Chieftain riding a raptor (new art, bead `border_marches-xaj.9`) |

## 6. Town

The town starts with **Village Hall** (+500 gold per day) and **Cave**
(Caveman dwelling) built. One building per town per day.

| Building           | Cost                                  | Requires                   | Effect                                                                  |
| ------------------ | ------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| Village Hall       | (start)                               | -                          | Income 500 gold/day                                                     |
| Town Hall          | 2500 gold, 5 wood, 2 ore              | -                          | Income 1000 gold/day (replaces the Village Hall's 500)                  |
| City Hall          | 5000 gold, 10 wood, 5 ore, 3 essence  | Town Hall, Palisade        | Income 2000 gold/day (replaces the Town Hall's 1000)                    |
| Palisade (fort)    | 2000 gold, 15 wood                    | -                          | Needed for T3+ dwellings; town defenders get +2 Defense                 |
| Stockade           | 2500 gold, 5 wood, 5 ore              | Palisade                   | +50% creature growth                                                    |
| Marketplace        | 500 gold, 5 wood                      | -                          | Trade resources at fixed rates ([ECONOMY.md](ECONOMY.md#7-marketplace)) |
| Resource Silo      | 1500 gold, 5 ore                      | Marketplace                | +1 wood and +1 ore per day                                              |
| Cave (T1)          | (start)                               | -                          | Cavemen                                                                 |
| Spitter Nest (T2)  | 800 gold, 5 wood, 2 ore               | Cave                       | Spitters                                                                |
| Raptor Pen (T3)    | 1200 gold, 10 wood                    | Palisade                   | Raptors                                                                 |
| Spirit Lodge (T4)  | 2000 gold, 5 wood, 5 ore, 2 essence   | Spitter Nest               | Shamans                                                                 |
| Horn Grounds (T5)  | 4000 gold, 10 wood, 10 ore            | Raptor Pen                 | Triceratops                                                             |
| Tyrant's Lair (T6) | 8000 gold, 10 wood, 10 ore, 8 essence | Horn Grounds, Spirit Lodge | T-Rex                                                                   |

Growth:

- Dwellings accumulate weekly growth; unbought creatures carry over.
- With the Stockade a dwelling adds 1.5 x its growth per week and keeps the
  fraction. Each dwelling stores a remainder r (0 or 1, in half creatures,
  starting at 0); each week: t = 3 x growth + r, add floor(t / 2) creatures,
  r = t mod 2. Odd growths therefore alternate, lower number first:

| Unit        | Base growth | With Stockade (alternating weeks) | Average |
| ----------- | ----------: | --------------------------------- | ------: |
| Caveman     |          14 | 21                                |      21 |
| Spitter     |           9 | 13, 14                            |    13.5 |
| Raptor      |           7 | 10, 11                            |    10.5 |
| Shaman      |           4 | 6                                 |       6 |
| Triceratops |           2 | 3                                 |       3 |
| T-Rex       |           1 | 1, 2                              |     1.5 |

## 7. Art

Every Lost World creature already exists as a Pulp Wars sprite in the
user-approved style (see
[ART_DIRECTION.md](../art/ART_DIRECTION.md#6-reused-pulp-wars-sprites)):
Caveman, Spitter, Raptor, Shaman, Triceratops, T-Rex. New art for the MVP is
the Chieftain on a raptor, the town and its buildings, mines and pickups.

## 8. Changes from brief

| Change                                                                                            | Why                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Hall incomes are totals that replace each other (500, then 1000, then 2000 per day), not additive | The brief listed each hall's income without saying; Heroes-style halls replace                             |
| Stockade growth keeps the fraction (alternating weeks)                                            | floor(1 x 1.5) = 1 would make the Stockade useless for the T-Rex and cost half a Raptor and Spitter a week |
| Mob and Pack Hunter apply to retaliations; Charge does not (0 hexes moved)                        | Unspecified; "checked at the moment of the attack" makes them consistent                                   |
| War Drums does not stack from several Shamans; does not affect the Shaman itself                  | "Adjacent to the Shaman" read as other stacks; stacking would reward splitting Shamans                     |
| Venom applies to shots and melee hits, floors Defense at 0                                        | Unspecified                                                                                                |
| Combo example run against Orc Brutes with Speed 4 (the neutral roster in GAME_DESIGN.md)          | So the whole sequence fits in one round before the target acts                                             |
