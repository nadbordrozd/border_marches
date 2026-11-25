# Faction: The Realm (Humans)

Status: canonical for v0.2 (bead `border_marches-bzc.5`, 2026-11-24).
Written in the terms of [RULES_V2.md](RULES_V2.md), which governs. Damage
and kills follow [GAME_DESIGN.md section 9](GAME_DESIGN.md#9-battle-rules-deterministic).
Prices shared by every faction (halls, forts, guilds, Drills, the Keystone
Hall) are in [ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

## 1. Identity

**Genre:** storybook chivalry, the Sunday-serial kind: tournaments, quests,
oaths sworn on sword hilts, a friar with a quarterstaff. The Realm is a whole
kingdom from a storybook nobody finished: castle, village, fairground and
unfinished quests all made landfall together.

**Tone:** earnest and a little pompous. Everyone has sworn an oath to
something or someone and will tell you about it. Brave, tidy, never grim.

**In the Marches:** the Realm assumes the Marches are a wilderness sent to
test it. It has claimed everything in sight in the name of a Queen nobody
has seen since the landfall, and its knights ride out to "rescue" other
landfalls whether they asked or not.

| Property       | Value                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Faction id     | `humans`                                                                                                                                 |
| Native terrain | Grass (already 100 per step, so no discount: see section 11)                                                                             |
| Faction colour | `#2f6fd0` (tabard blue)                                                                                                                  |
| Hero classes   | Knight Errant (might), Enchanter (magic)                                                                                                 |
| Remains, tags  | Every Realm creature leaves `corpse`; none has an excluded condition                                                                     |
| Play style     | Pairs. Squires and Longbowmen set up extra turns and covering fire; Knights cash them in; the Dragonslayer retaliates against every blow |

## 2. Magic

| School | Bloom | Accord | Clock | Hush | Storm |
| ------ | ----: | -----: | ----: | ---: | ----: |
| Weight |     3 |      4 |     2 |    0 |     1 |

- **Magic Guild cap: level 4.** The heaviest school is Accord; the level 2
  condition tool is Share, Feed or Wind (never Pass on).
- **What the wheel gives the Realm.** Sworn links make Share work from round
  one: any boon on one partner can be copied to the other. Bloom heals are
  doubled by shared healing (section 3). Accord and Bloom are both opposed
  to Hush, so every Shaken or Jinxed the Restless put on a Realm stack is
  Fuel for a doubled heal or link spell.

## 3. Birthright: Sworn

> **Sworn.** At deployment, after artifacts' battle-start rules, the army's
> native stacks are taken in slot order and paired: first with second, third
> with fourth, and so on. A last odd stack stays unpaired. Each stack of a
> pair gains the condition **Sworn** naming the other.

Attachment: at deployment, and a replacement action (RULES_V2 3.8). The rule
it bends: GAME_DESIGN 9.3, "move, then attack" (a swap stands in for the
walk).

**Sworn** (condition kind): Accord, boon, link, no clock, size 0, no gate,
charge 10. While a stack bears it:

1. **Shared healing.** Whenever the bearer is the target of a Heal of X,
   the far end is then healed by the same X with the same "revives" clause,
   whether or not the bearer needed the healing. A Heal that arrived this
   way is never shared again.
2. **Change places.** On its turn, in place of its walk, the bearer may swap
   hexes with the far end (Move: swap). It may then attack an adjacent enemy
   or shoot, as after a walk. A swap counts as 0 hexes moved.

Notes:

- The player chooses the pairs by ordering army slots. Guests and summoned
  stacks are skipped.
- Both ends bear a Sworn, each counting toward its six conditions. When one
  end dies both conditions end (RULES_V2 1.4).
- Sworn is a thing (law 2): it can be ended, burnt as Fuel by a Hush or
  Storm page, set off, and created between any two stacks by the Enchanter's
  Command. Whoever bears it gets its two rules, native or not.

## 4. Roster

| Tier | Unit         |  HP | Atk | Def | Dmg | Speed | Shots | Growth/week | Cost                          |   FV | Abilities           |
| ---: | ------------ | --: | --: | --: | --: | ----: | ----: | ----------: | ----------------------------- | ---: | ------------------- |
|    1 | Squire       |  10 |   4 |   5 |   2 |     4 |     - |          14 | 45 gold                       |   65 | Attend              |
|    2 | Longbowman   |  12 |   6 |   3 |   3 |     4 |    12 |           9 | 115 gold                      |  109 | Covering Volley     |
|    3 | Man-at-Arms  |  26 |   8 |   9 |   5 |     5 |     - |           7 | 240 gold                      |  211 | Shield Wall         |
|    4 | Friar        |  30 |   7 |   8 |   6 |     5 |     - |           4 | 400 gold + 1 essence          |  235 | Caster: Mend, Share |
|    5 | Knight       |  85 |  15 |  14 |  15 |     8 |     - |           2 | 1050 gold + 2 ore             |  875 | Charge              |
|    6 | Dragonslayer | 180 |  20 |  20 |  32 |     6 |     - |           1 | 4000 gold + 3 ore + 2 essence | 2277 | Stand Fast, Paragon |

One week of all six dwellings: 10,545 gold, 7 ore, 6 essence; fight value 8335 (prices tuned by the balance bead, [BALANCE.md](BALANCE.md) section 5). The slowest creature has Speed 4, so a full army moves 1500 a day.

## 5. Abilities

"Adjacent" means sharing a hex edge. Gates are fixed when the condition is
made, from the maker's count at that moment.

| Unit         | Ability             | Exact rule                                                                                                                                                                                                                                                                    |
| ------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Squire       | **Attend**          | Activated, once per battle, in place of an attack (the Squires may walk first): one other friendly stack adjacent to them gains Heartened with gate `{ hp, max: 20 x the Squires' count }`.                                                                                   |
| Longbowman   | **Covering Volley** | Reaction: when the far end of a link the Longbowmen bear makes a melee attack (not a retaliation) and its target survives, the Longbowmen, if they could shoot now, make a shot Strike on that target at x 50%. It uses one shot and resolves after the target's retaliation. |
| Man-at-Arms  | **Shield Wall**     | Other friendly stacks adjacent to the Men-at-Arms get +2 Defense. Several Shield Walls do not stack (`stackKey` shield-wall).                                                                                                                                                 |
| Friar        | **Caster**          | Pages: **Mend** and **Share**. `castPower` 1, `castDivisor` 2, `castCap` 8 (4 Friars cast at Power 3, 14 or more at Power 8).                                                                                                                                                 |
| Knight       | **Charge**          | The MVP rule: +15% damage for each hex walked this turn before the attack (max +75% at 5 hexes). Retaliations, swaps and pushes count 0 hexes.                                                                                                                                |
| Dragonslayer | **Stand Fast**      | Retaliates against every melee attack, not once per round. Bends GAME_DESIGN 9.3.                                                                                                                                                                                             |
| Dragonslayer | **Paragon**         | +10% Strike damage for each boon the Dragonslayers bear (max +50%). Applies to attacks and retaliations.                                                                                                                                                                      |

- **Mend** is the Bloom tier 1 single-stack heal at the RULES_V2 2.4 budget
  (heals 20 + 10 P, revives). **Share** is the Accord tool (RULES_V2 2.7).
  If the spell list names the tier 1 heal differently, the Friar lists that
  page.
- Heartened is the engine-standard kind (RULES_V2 6): the bearer's side may
  end it after the bearer's turn for an extra turn. A Sworn Dragonslayer
  always bears one boon, so Paragon starts at +10%.

### 5.1 Drills

A Drill is bought once per player and then applies to all of that player's
stacks of the creature (ECONOMY 6.3).

| Drill building | Unit        | Ability            | Exact rule                                                                                                                                                                                                               |
| -------------- | ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Butts          | Longbowman  | **Pin Down**       | A stack hit by the Longbowmen's shot (a Covering Volley included) gains Delayed with clock 2 and gate `{ hp, max: 15 x the Longbowmen's count }`.                                                                        |
| Guardroom      | Man-at-Arms | **Bodyguard**      | Reaction: when an enemy stack adjacent to the Men-at-Arms makes a melee attack on another friendly stack adjacent to them, the Men-at-Arms, if they have their retaliation, spend it on a retaliation Strike against it. |
| Tiltyard       | Knight      | **Follow Through** | On strike: after a melee attack that followed a walk of 4 or more hexes, the target is pushed 1 hex directly away from the Knights. A stack no longer adjacent to its attacker does not retaliate.                       |

## 6. Combos

Hero: a Knight Errant with Attack 2 and Defense 2. Target in 6.1 and 6.2:
a stack of 20 Orc Brutes (HP 28, Atk 9, Def 6, Dmg 6; GAME_DESIGN 8.1).

### 6.1 A favour for the knight (Attend, Share, Charge, Paragon)

Slots: Knights (4) and a Dragonslayer (1) are a Sworn pair; Squires (28);
Friars (8, unpaired).

| Step                                                                | Calculation                                                 | Result                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Round 1. Squires step beside the Knights and Attend                 | Gate 20 x 28 = 560; the Knights have 340 HP                 | Knights are Heartened                                       |
| Round 1. Friars cast Share along the Sworn link                     | The copy keeps the gate: 560 against the Dragonslayer's 180 | The Dragonslayer is Heartened too (two boons: Paragon +20%) |
| Round 2. Knights walk 5 hexes and charge                            | A 17, D 6, M 1.55; 4 x 15 x 1.55 x 1.75 = 162.75            | 162: 5 kills. **Brutes 15, top 6**                          |
| The Brutes retaliate (their one retaliation)                        | A 9, D 16, M 20/27; 15 x 6 x 20/27 = 66.7                   | 66: no kill. Knights' top 19/85                             |
| Knights end Heartened: extra turn, attack again from where they are | 4 x 15 x 1.55 = 93                                          | 93: 4 kills, no retaliation left. **Brutes 11, top 25**     |
| The Dragonslayer attacks                                            | A 22, M 1.80; 32 x 1.80 x 1.20 = 69.12                      | 69: 2 kills. **Brutes 9, top 12**                           |
| The Dragonslayer ends Heartened: extra turn (one boon left, +10%)   | 32 x 1.80 x 1.10 = 63.36                                    | 63: 2 kills. **Brutes 7, top 5**                            |

Thirteen Brutes die in one round for one retaliation. Without the combo the
same round is a charge and one Dragonslayer blow: 8 kills.

### 6.2 Lance and longbow (the three Drills)

Slots: Knights (4) and Longbowmen (27) are a Sworn pair. The hex behind the
Brutes is free.

| Step                                           | Calculation                                            | Result                                                            |
| ---------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Knights charge 5 hexes                         | As above                                               | 162: **Brutes 15, top 6**                                         |
| Follow Through pushes the Brutes 1 hex         | They are no longer adjacent                            | No retaliation: 66 damage never happens                           |
| Covering Volley                                | A 8, D 6, M 1.10; 27 x 3 x 1.10 x 0.5 = 44.55          | 44: 2 kills. **Brutes 13, top 18**                                |
| Pin Down                                       | Gate 15 x 27 = 405; the Brutes have 12 x 28 + 18 = 354 | Delayed until the end of round 3: they act last next round        |
| Next round, if an enemy reaches the Longbowmen | Knights Change places and attack: 4 x 15 x 1.55 = 93   | The Longbowmen stand where the Knights were and are free to shoot |

With 18 Longbowmen the gate is 270 and the rehearsal shows Pin Down refused
("gate 270 HP, target has 369"): a bigger Longbowmen stack pins a bigger
target.

### 6.3 Cross-faction: the ghoul who swore an oath (guest Ghouls)

An Enchanter hires 12 Ghouls at a Restless outpost
([FACTION_UNDEAD.md](FACTION_UNDEAD.md#5-abilities): **Feast** heals 6 x
count, reviving, when they end a walk on remains). Guests are not paired at
deployment, so the Enchanter spends the Command **Swear In** on the Ghouls
and the Knights.

Late in a fight the Knights are down from 4 to 2 with the top one at 30/85.
The Ghouls end a walk on an Orc corpse:

- Feast: Heal 6 x 12 = 72 on the Ghouls, reviving.
- Shared healing: Heal 72 on the Knights, reviving. 55 fills the top Knight;
  the last 17 revive a third Knight at 17/85. **Knights 3, top 17.**

A healed stack keeps its creatures after the battle (RULES_V2 1.7), so each
corpse the Ghouls eat returns most of a 1200-gold Knight. The price: the
Command, guests bought from a far outpost, and the remains are used up.

## 7. Hero classes

Skill names are the kinds of [CONTENT_TAXONOMY.md](CONTENT_TAXONOMY.md)
section 3.2; the content bead fixes the final names. Weights are 0 to 10
(RULES_V2 3.3).

| Property        | Knight Errant (might)                | Enchanter (magic)                                                                    |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Starting stats  | Attack 2, Defense 2, Power 1, Lore 1 | Attack 1, Defense 1, Power 2, Lore 2                                                 |
| Stat pattern    | D, A, D, P, A, D, L, A, D, L         | P, L, P, D, L, P, A, L, P, D                                                         |
| Starting skills | Leadership 1, Armour 1               | Accord 1, Wellspring 1; page: Scapegoat (the Accord tier 1 redirect link, concept 2) |
| Starting army   | 16 Squires, 7 Longbowmen (FV 1803)   | 12 Squires, 5 Longbowmen, 2 Friars (FV 1795)                                         |
| Native terrain  | Grass                                | Grass                                                                                |
| Command         | Single Combat                        | Swear In                                                                             |

**Single Combat** (Knight Errant). Choose a friendly stack and an enemy
stack. The enemy gains **Challenged** naming the friendly stack, with clock
min(3, C + 1).

**Challenged** (condition kind): Accord, bane, link, charge 10. The bearer's
Strikes against any stack other than the far end are x 50%. It is not a
Hold. Makers so far: this Command. Users: any stack with strong
retaliation (a Dragonslayer answers every blow), Pass on, Set off, Fuel
for Hush and Storm pages.

**Swear In** (Enchanter). Up to C times: choose two stacks, neither bearing
Sworn; each gains Sworn naming the other. There is no requirement about
sides (law 5): swearing a Squire stack to the enemy's shooters and then
changing places is legal, and the enemy may change them back on its turn.

| Skill      | Knight Errant | Enchanter |     | Skill       | Knight Errant | Enchanter |
| ---------- | ------------: | --------: | --- | ----------- | ------------: | --------: |
| Bloom      |             2 |         7 |     | Fortune     |             4 |         4 |
| Accord     |             3 |        10 |     | Captaincy   |             6 |         4 |
| Clock      |             1 |         5 |     | Omens       |             2 |         5 |
| Hush       |             0 |         1 |     | Logistics   |             6 |         4 |
| Storm      |             1 |         2 |     | Pathfinding |             4 |         3 |
| Offence    |             6 |         2 |     | Scouting    |             3 |         3 |
| Armour     |             8 |         4 |     | Wellspring  |             1 |         8 |
| Archery    |             5 |         4 |     | Learning    |             3 |         5 |
| Riposte    |             6 |         2 |     | Estates     |             6 |         4 |
| Standards  |             6 |         6 |     | Mustering   |             5 |         3 |
| Tactics    |             6 |         3 |     | Parley      |             5 |         6 |
| Leadership |            10 |         6 |     | Scrollcraft |             2 |         5 |

## 8. Named heroes

Specialty forms and numbers are those of RULES_V2 3.7.

| Hero                      | Class         | Specialty                                      |
| ------------------------- | ------------- | ---------------------------------------------- |
| Sir Cuthbert the Unhorsed | Knight Errant | Creature: Knights                              |
| Wat Greenhood             | Knight Errant | Creature: Longbowmen                           |
| Dame Ysolde Brightlance   | Knight Errant | Command: Single Combat counts C one higher     |
| Captain Aldous Ferrow     | Knight Errant | Skill: Leadership at rank 2 (replaces Armour)  |
| Abbess Wilhelmina         | Enchanter     | Spell: Mend                                    |
| Master Tobias Quill       | Enchanter     | Spell: Share                                   |
| Lady Rosamund of the Mere | Enchanter     | Skill: Accord at rank 2 (in place of Accord 1) |
| Reeve Maud Pennywise      | Enchanter     | Resource: 250 gold each day                    |

## 9. Town: the Castle

Starts with the Village Hall, the Squires' Hall, and a Tavern. One building
per day. Costs marked "common" are in
[ECONOMY.md](ECONOMY.md#6-buildings-every-town-shares).

| Building                    | Cost                                  | Requires        | Effect                                                                                                                                                                |
| --------------------------- | ------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Village, Town, City Hall    | common                                | common          | Income 500, 1000, 2000 gold a day                                                                                                                                     |
| Palisade                    | common (Fort 1)                       | -               | Fort level 1; needed for the Barracks                                                                                                                                 |
| Keep                        | common (Fort 2)                       | Palisade        | Fort level 2                                                                                                                                                          |
| Royal Castle                | common (Fort 3)                       | Keep, City Hall | Fort level 3 with its tower                                                                                                                                           |
| Marketplace, Resource Silo  | common                                | common          | Trade; +1 wood and +1 ore a day                                                                                                                                       |
| Magic Guild 1 to 4          | common                                | common          | Capped at level 4                                                                                                                                                     |
| Tavern                      | (start)                               | -               | Hire heroes (RULES_V2 5.4)                                                                                                                                            |
| Squires' Hall (T1)          | (start)                               | -               | Squires                                                                                                                                                               |
| Archery Range (T2)          | 800 gold, 5 wood, 2 ore               | Squires' Hall   | Longbowmen                                                                                                                                                            |
| Barracks (T3)               | 1200 gold, 5 wood, 5 ore              | Palisade        | Men-at-Arms                                                                                                                                                           |
| Friary (T4)                 | 2000 gold, 10 wood, 2 essence         | Archery Range   | Friars                                                                                                                                                                |
| Stables (T5)                | 4000 gold, 10 wood, 10 ore            | Barracks        | Knights                                                                                                                                                               |
| Slayers' Lodge (T6)         | 8000 gold, 10 wood, 10 ore, 6 essence | Stables, Friary | Dragonslayers                                                                                                                                                         |
| Butts (Drill)               | 1000 gold, 5 wood                     | Archery Range   | Longbowmen gain Pin Down                                                                                                                                              |
| Guardroom (Drill)           | 1500 gold, 5 ore                      | Barracks        | Men-at-Arms gain Bodyguard                                                                                                                                            |
| Tiltyard (Drill)            | 2500 gold, 10 wood, 5 ore             | Stables         | Knights gain Follow Through                                                                                                                                           |
| Tithe Barn (special)        | 1500 gold, 10 wood                    | Marketplace     | +250 gold a day                                                                                                                                                       |
| Chapel of Oaths (special)   | 3000 gold, 10 wood, 5 ore, 2 essence  | Friary          | While its owner holds it, in that player's battles: when a Sworn link ends because one end died, the other end gains Heartened and Lucky if it fights for that player |
| Round Table (Keystone Hall) | the Keystone                          | City Hall       | Common Keystone effects, and every army of its owner has Morale +2                                                                                                    |

Every building: 52,500 gold, 155 wood, 104 ore, 22 essence (25 buildings
with the three the town starts with and the Round Table). The tier 6 chain
(Archery Range, Palisade, Barracks, Friary, Stables, Slayers' Lodge) costs
18,000 gold, 55 wood, 27 ore and 8 essence.

## 10. Art

| Unit         | Sprite                                                |
| ------------ | ----------------------------------------------------- |
| Squire       | New (a boy with a shield too big for him)             |
| Longbowman   | Pulp Wars `marksman`                                  |
| Man-at-Arms  | Pulp Wars `swordsman` (or `guard`)                    |
| Friar        | New                                                   |
| Knight       | Pulp Wars `knight`                                    |
| Dragonslayer | New (one very large knight with a trophy on his back) |

The `captain` and `fighter` sprites suit the Knight Errant's map sprite and
portraits; `catapult` is unused (no war machines in v0.2). Drills show as an
insignia, not a new sprite.

## 11. Notable calls

| Call                                                                                        | Why                                                                                                              |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The faction is called the Realm, not the Vowed                                              | "Vow" is a rules word (RULES_V2 3.5); the Humans must read as humans at a glance                                 |
| Sworn pairs are set by slot order, and the swap replaces the walk instead of the whole turn | The player decides the pairs; a swap that still attacks is a move worth making                                   |
| Shared healing copies the offered amount, not the amount restored                           | One number in the rehearsal; lets a healthy healer feed its partner                                              |
| Swear In has no side requirement                                                            | Law 5; an oath with the enemy is the kind of trick the concept wants                                             |
| Squires, a tier 1, make Heartened; the gate is 20 HP per Squire                             | The squire attends the knight; the gate stops one-Squire stacks handing out extra turns                          |
| The Dragonslayer is a human, with unlimited retaliation as its bent rule                    | The mirror of the T-Rex's Terror; it turns Single Combat into a trap                                             |
| Charge is the MVP rule, reused                                                              | Already implemented and tested                                                                                   |
| Guild capped at 4; Hush weight 0                                                            | A might-leaning faction; Hush is the Realm's opposed school twice over                                           |
| Native terrain Grass gives no discount                                                      | Grass and Steppe already cost 100; no terrain in the MVP list suits a storybook kingdom better                   |
| New condition kind Challenged, with one maker                                               | Needed for the Command; the content bead should add two makers (an artifact, a stray) to meet the admission rule |

**Engine asks** (no new noun or verb): a retaliation needs its target
adjacent when it resolves; a link kind with a heal-sharing hook and a swap
action (RULES_V2 1.4 foresees both); a reaction trigger "a stack linked to
me made a melee attack"; gates computed from the maker's count.
