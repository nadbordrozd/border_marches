# Content: spells, conditions and ground

Status: content for v0.2 (bead `border_marches-bzc.6`, 2026-11-24).

The v0.2 spellbook: 50 battle spells (10 per school; tiers 3, 3, 2, 1, 1),
10 adventure spells, and every condition and ground kind the v0.2 content
uses. [RULES_V2.md](RULES_V2.md) governs; this document fills the fields it
leaves to content. Sister documents: [CONTENT_HEROES.md](CONTENT_HEROES.md), [CONTENT_ARTIFACTS.md](CONTENT_ARTIFACTS.md),
[CONTENT_MAP_OBJECTS.md](CONTENT_MAP_OBJECTS.md), [CONTENT_CREATURES.md](CONTENT_CREATURES.md). Faction creatures, towns and classes are
in the faction documents, not here.

## 1. How to read a spell

- **P** is the caster's effective Power (RULES_V2 2.4). Every scaling
  number is `base + per x P`. Clocks never scale.
- **Size** is the one number Fuel doubles. "The gate" means the spell has
  no size and Fuel doubles its gate. "None" means the spell cannot be
  Fuelled.
- "Friendly" and "enemy" are requirements, checked once when the spell is
  cast (law 3). A target rule with neither word accepts any stack.
- "A hex and the six around it" is radius 1 (7 hexes); "within 2" is 19
  hexes; "within 3" is 37.
- Flat stat conditions follow RULES_V2 2.4: 2, 3, 4, 5, 6 points by tier,
  Speed at half. Percentage conditions are 25, 30, 40, 50, 60 by tier.
- Mana follows RULES_V2 2.3 (4, 7, 10, 14, 20 by tier, within 2).
- A scroll of a spell is worth 300, 600, 1000, 1500 or 2500 gold by tier
  (for guards and trade).
- Summoned creatures (Seedling, Shade) are in
  [CONTENT_CREATURES.md](CONTENT_CREATURES.md#4-summoned-creatures).

## 2. Conditions and ground

### 2.1 Conditions

Eleven kinds are engine-standard (RULES_V2 1.3, marked "std"); fourteen are
new here. Clocks shown are typical; each maker states its own. "3 x" is
the default maximum of RULES_V2 1.3. Charge follows RULES_V2 2.7: size for
kinds that deal Harm each round (Burning, Leeched), the whole size for the
debt (Reckoning), otherwise 10 x the tier of the maker. Only Turned,
Asleep and Frozen are Holds; Scapegoat and Leeched are links.

| Kind          | School | Polarity | Clock | Size                          | Gate                 | Notes     | Rule                                                                                              |
| ------------- | ------ | -------- | ----- | ----------------------------- | -------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| **Venomed**   | Bloom  | bane     | 2-3   | Defense lost (max 3 x)        | -                    | std       | -size Defense, never below 0.                                                                     |
| **Lucky**     | Bloom  | boon     | none  | -                             | -                    | std       | The bearer's next melee attack or shot (not a retaliation) is x 150%, then Lucky ends.            |
| **Mending**   | Bloom  | boon     | 3     | HP healed per round (max 3 x) | -                    | -         | At the bearer's turn start it heals size HP, reviving.                                            |
| **Thorned**   | Bloom  | boon     | 3     | Harm returned (max 3 x)       | -                    | -         | When the bearer is struck in melee, the striker takes Harm equal to size.                         |
| **Ripening**  | Bloom  | boon     | 3     | percent (max 3 x)             | -                    | -         | Strikes by the bearer are x (100 + size)%, and at its turn start size grows by 10.                |
| **Turned**    | Accord | bane     | 1-2   | -                             | HP, set by the maker | std; Hold | The stack fights for the side opposite its owner.                                                 |
| **Heartened** | Accord | boon     | none  | -                             | -                    | std       | After the bearer finishes a turn its side may end Heartened to give it an extra turn.             |
| **Scapegoat** | Accord | boon     | 3     | -                             | -                    | link      | Redirect link (RULES_V2 1.4): damage to the bearer goes to the far end as Harm.                   |
| **Shielded**  | Accord | boon     | 3     | Defense gained (max 3 x)      | -                    | -         | +size Defense.                                                                                    |
| **Warded**    | Accord | boon     | 3     | percent (max 75)              | -                    | -         | Harm the bearer takes is x (100 - size)%.                                                         |
| **Mollified** | Accord | bane     | 2-3   | percent (max 75)              | -                    | -         | Strikes by the bearer are x (100 - size)%.                                                        |
| **Delayed**   | Clock  | bane     | 2     | -                             | -                    | std       | Timeline class last; the bearer cannot Wait.                                                      |
| **Hastened**  | Clock  | boon     | 2     | -                             | -                    | std       | Timeline class first.                                                                             |
| **Quickened** | Clock  | boon     | 2-3   | Speed gained (max 3 x)        | -                    | -         | +size Speed.                                                                                      |
| **Slowed**    | Clock  | bane     | 2-3   | Speed lost (max 3 x)          | -                    | -         | -size Speed, never below 1.                                                                       |
| **Asleep**    | Hush   | bane     | 2     | -                             | HP, set by the maker | std; Hold | Cannot act or retaliate; any damage it takes ends Asleep.                                         |
| **Shaken**    | Hush   | bane     | 2-3   | -                             | -                    | std       | Timeline class last; the bearer cannot Wait.                                                      |
| **Jinxed**    | Hush   | bane     | 3     | percent (max 3 x)             | -                    | std       | The bearer cannot retaliate, and Strikes against it are x (100 + size)%.                          |
| **Reckoning** | Hush   | bane     | 2-3   | debt owed (max 3 x)           | -                    | -         | A debt: when its clock expires the bearer takes Harm equal to size.                               |
| **Hushed**    | Hush   | bane     | 2     | -                             | -                    | -         | The bearer cannot shoot.                                                                          |
| **Leeched**   | Hush   | bane     | 2-3   | Harm per round (max 3 x)      | -                    | link      | At the bearer's turn start it takes Harm equal to size and the far end heals that much, reviving. |
| **Burning**   | Storm  | bane     | 2-3   | Harm per round (max 3 x)      | -                    | std       | At the bearer's turn start it takes Harm equal to size.                                           |
| **Frozen**    | Storm  | bane     | 1-2   | -                             | HP, set by the maker | std; Hold | Cannot act or retaliate; the first Strike against it is x 200% and ends Frozen.                   |
| **Drenched**  | Storm  | bane     | 2-3   | percent (max 100)             | -                    | -         | Harm the bearer takes is x (100 + size)%.                                                         |
| **Fired Up**  | Storm  | boon     | 2-3   | Attack gained (max 3 x)       | -                    | -         | +size Attack.                                                                                     |

### 2.2 Ground

Sweets and ice from the concept are not used in v0.2: no v0.2 creature
leaves sweets, and ice needs the sliding law of a landfall.

| Kind         | Class    | School | Size | Clock | Rule                                                                                                    |
| ------------ | -------- | ------ | ---- | ----- | ------------------------------------------------------------------------------------------------------- |
| **rock**     | blocking | -      | -    | none  | Nothing enters (the MVP obstacle).                                                                      |
| **corpse**   | remains  | -      | -    | none  | Left by a dead stack tagged `corpse`; a rule that uses remains consumes it.                             |
| **bones**    | remains  | -      | -    | none  | Left by a dead stack tagged `bones`; a rule that uses remains consumes it.                              |
| **wreck**    | remains  | -      | -    | none  | Left by a dead stack tagged `wreck`; a rule that uses remains consumes it.                              |
| **fire**     | hazard   | Storm  | Harm | 2-3   | A stack that enters it, or starts its turn in it, takes Harm equal to size.                             |
| **brambles** | hazard   | Bloom  | Harm | 3     | A stack that enters it, or starts its turn in it, takes Harm equal to size and gains Slowed 1, clock 2. |
| **mist**     | surface  | Hush   | -    | 2-3   | A stack standing in it cannot shoot, and shots against it are x 50%.                                    |

### 2.3 Makers and users

The admission rule (RULES_V2 1.3): a new condition kind needs three makers
and three users across at least two factions or schools. A **maker** is a
rule that puts the kind on the board. A **user** is a rule other than the
kind's own that names the kind and pays out because of it. The five tools,
Echo and Fuel work on every kind and are not counted. Morale and Luck
sources count as makers of Heartened and Lucky. "Sources" counts the
distinct schools and source types (artifact, stray, army skill and so on)
among a kind's makers and users. Faction creatures will add to these lists.

| Kind          |     | Makers                                                                                                                                                                                                            | Users                                                                                                                                             | Sources |
| ------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Venomed**   | std | 3: Nettle (spell), Briar Patch (feat), Gardener's Apron (Wonder)                                                                                                                                                  | 1: Poultice (spell)                                                                                                                               | 3       |
| **Lucky**     | std | 4: Lucky Streak (skill), Four-Leaf Buttonhole (Trinket), Lucky Penny (Trinket), Jar of Fair Chances (consumable)                                                                                                  | 1: Double or Nothing (feat)                                                                                                                       | 3       |
| **Mending**   | new | 4: Orchard Day (spell), Watering Can (Wonder), Witch-Hazel (consumable), Groundskeeper (creature)                                                                                                                 | 3: Second Spring (spell), Green Thumb (feat), Gardener's Apron (Wonder)                                                                           | 3       |
| **Thorned**   | new | 3: Thornskin (spell), Thornmail Vest (Wonder), Groundskeeper (creature)                                                                                                                                           | 3: Briar Patch (feat), Burr (feat), Hedge-Clipper Shears (Wonder)                                                                                 | 3       |
| **Ripening**  | new | 4: Ripen (spell), Windfall (feat), Late-Harvest Cordial (consumable), Prize Pumpkin (creature)                                                                                                                    | 3: Harvest (feat), Windfall (feat), Cider Flask (Wonder)                                                                                          | 4       |
| **Turned**    | std | 3: Sign Here (spell), Change of Heart (spell), Notary (creature)                                                                                                                                                  | 0                                                                                                                                                 | 1       |
| **Heartened** | std | 7: Take Heart (spell), Double Time (spell), Banner (skill), Regimental Sash (Trinket), Brass Bugle (Trinket), Whetstone Pendant (Wonder), Bottled Cheer (consumable)                                              | 2: Mob Rule (feat), Vow of Flesh and Blood (vow)                                                                                                  | 5       |
| **Scapegoat** | new | 4: Scapegoat (spell), Notary's Seal (Wonder), The Unsigned Treaty (Marvel piece), Whipping Boy (creature)                                                                                                         | 4: Vow of the Still Air (vow), Treaty Ink (Marvel), The Quill (Marvel piece), The Blotter (Marvel piece)                                          | 4       |
| **Shielded**  | new | 4: Close Ranks (spell), Drill Sergeant (skill), Ambush (skill), Tin Titan (creature)                                                                                                                              | 2: Shield Wall (feat), Gumshoe (creature)                                                                                                         | 4       |
| **Warded**    | new | 3: Sanctuary Oath (spell), Umbrella of State (Wonder), Deep-Sea Diver (creature)                                                                                                                                  | 3: The Sky Falls (spell), Mirror Ward (feat), Lightning Rod (Wonder)                                                                              | 5       |
| **Mollified** | new | 3: Soft Words (spell), Pressed Olive Branch (Wonder), Crooner (creature)                                                                                                                                          | 1: Peace Dividend (feat)                                                                                                                          | 4       |
| **Delayed**   | std | 5: Late Bell (spell), Encore (spell), Ambush (skill), Ball and Chain (cursed Wonder), Winder (creature)                                                                                                           | 2: First Bell (spell), Pile On (feat)                                                                                                             | 4       |
| **Hastened**  | std | 3: First Bell (spell), Forced March (spell), Ambush (skill)                                                                                                                                                       | 1: Late Bell (spell)                                                                                                                              | 2       |
| **Quickened** | new | 3: Quick March (spell), Drum Major's Baton (Wonder), Newsie (creature)                                                                                                                                            | 2: Quickstep (feat), Metronome Spurs (Wonder)                                                                                                     | 4       |
| **Slowed**    | new | 5: Bramble Row (spell), Treacle (spell), Whiteout (spell), Hedge-Clipper Shears (Wonder), Metronome Spurs (Wonder)                                                                                                | 2: Pile On (feat), Rigger (creature)                                                                                                              | 5       |
| **Asleep**    | std | 2: Lullaby (spell), Sleeping Cap of the Night Watch (cursed Wonder)                                                                                                                                               | 0                                                                                                                                                 | 2       |
| **Shaken**    | std | 1: The Thirteenth Chime (cursed Wonder)                                                                                                                                                                           | 2: Take Heart (spell), Pile On (feat)                                                                                                             | 3       |
| **Jinxed**    | std | 3: Bad Omen (spell), Double or Nothing (feat), The Albatross (cursed Wonder)                                                                                                                                      | 0                                                                                                                                                 | 3       |
| **Reckoning** | new | 4: Deadline (spell), On Credit (spell), IOU Pad (cursed Wonder), Loan Shark (creature)                                                                                                                            | 5: Co-signer (feat), Compound Interest (feat), Bailiff's Greatcoat (Wonder), The Hourglass with No Bottom (Marvel), The Upper Bulb (Marvel piece) | 6       |
| **Hushed**    | new | 3: Hush Now (spell), Felt Slippers of the Night Shift (Wonder), Gremlin (creature)                                                                                                                                | 2: Gag Rule (feat), Gumshoe (creature)                                                                                                            | 4       |
| **Leeched**   | new | 3: Leech Line (spell), Bloodstone Ring (Wonder), Bog Leech (creature)                                                                                                                                             | 5: Bloodletting (feat), Thicker than Water (feat), Vow of the Still Air (vow), Treaty Ink (Marvel), The Quill (Marvel piece)                      | 5       |
| **Burning**   | std | 3: Hothead (spell), Blaze of Glory (feat), Coat of Embers (cursed Wonder)                                                                                                                                         | 2: Firewalkers (feat), Lamplighter (creature)                                                                                                     | 4       |
| **Frozen**    | std | 3: Cold Snap (spell), Winter's Pocket Watch (Wonder), Rime Walrus (creature)                                                                                                                                      | 1: Cold Hands (feat)                                                                                                                              | 4       |
| **Drenched**  | new | 3: Downpour (spell), Leaky Bucket (Wonder), Lagoon Lurker (creature)                                                                                                                                              | 2: Soaked Powder (feat), Chain Lightning (feat)                                                                                                   | 4       |
| **Fired Up**  | new | 8: Hothead (spell), Drill Sergeant (skill), Mob Rule (feat), Thicker than Water (feat), Coat of Embers (cursed Wonder), The Odd Cufflink (Marvel piece), Fire-Eater's Draught (consumable), Loan Shark (creature) | 3: Firewalkers (feat), Blaze of Glory (feat), Whetstone Pendant (Wonder)                                                                          | 7       |

All 14 new kinds have at least three makers from at least two sources.
Bead `border_marches-bzc.71` took the spell riders that read a second
condition out of eight spells (section 7), so six new kinds now have
fewer than three users: Mollified 1, Shielded, Quickened, Slowed, Hushed
and Drenched 2 each. Each still does its own job (weaker Strikes, Defense,
Speed, no shooting, more Harm taken), and the kinds stay; new users should
come from creatures, feats or artifacts, not from spell riders. The
standard kinds are exempt: for several of them (Jinxed, Asleep, Turned)
the kind's own rule is the payoff, and the factions will add named users.

Ground, counted the same way (remains are made by any death; the
users listed for corpse, bones and wreck are the rules that use remains):

| Kind         | Makers                                                            | Users                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **corpse**   | Any death of a stack with that tag                                | 8: Second Shift (spell), Curtain Call (spell), Everybody Up (spell), The Sky Falls (spell), Gleaner (feat), Vow of the Grave (vow), Sexton's Spade (Wonder), Sexton (creature) |
| **bones**    | Any death of a stack with that tag                                | 8: Second Shift (spell), Curtain Call (spell), Everybody Up (spell), The Sky Falls (spell), Gleaner (feat), Vow of the Grave (vow), Sexton's Spade (Wonder), Sexton (creature) |
| **wreck**    | Any death of a stack with that tag                                | 8: Second Shift (spell), Curtain Call (spell), Everybody Up (spell), The Sky Falls (spell), Gleaner (feat), Vow of the Grave (vow), Sexton's Spade (Wonder), Sexton (creature) |
| **fire**     | 3: Wildfire (spell), The Sky Falls (spell), Fire-Eater (creature) | 6: Gust (spell), Downpour (spell), Mirror Ward (feat), Firewalkers (feat), Lamplighter (creature), Rigger (creature)                                                           |
| **brambles** | 3: Bramble Row (spell), Seed Bombs (feat), Seedling (creature)    | 3: Gust (spell), Mirror Ward (feat), Rigger (creature)                                                                                                                         |
| **mist**     | 2: Pea Soup (spell), Shade (creature)                             | 0                                                                                                                                                                              |

## 3. Battle spells

### 3.1 Bloom

Healing, summoning, effects that grow. Allied: Storm, Accord. Opposed: Clock, Hush.

| Spell             | Tier | Mana | Target                                        | Effect                                                                                                | Fuel doubles       | Condition and ground kinds |
| ----------------- | ---- | ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ | -------------------------- |
| **Poultice**      | 1    | 4    | One stack                                     | Heal 20 + 10 P (no reviving), and end Venomed on the target.                                          | The heal           | uses Venomed               |
| **Thornskin**     | 1    | 4    | One stack                                     | Add Thorned, size 6 + 3 P, clock 3.                                                                   | Thorned's size     | makes Thorned              |
| **Nettle**        | 1    | 4    | One stack                                     | Harm 12 + 6 P, and add Venomed 2, clock 3.                                                            | The Harm           | makes Venomed              |
| **Feed**          | 2    | 7    | One condition with size above 0               | Condition tool (RULES_V2 2.7): its size grows by half, rounded up, to at most its maximum; not Holds. | None (tool)        | -                          |
| **Regrow**        | 2    | 8    | One stack                                     | Heal 30 + 15 P, reviving.                                                                             | The heal           | -                          |
| **Sprout**        | 2    | 7    | One free hex                                  | Summon Seedlings worth 30 + 15 P HP (HP 6 each).                                                      | The summon budget  | -                          |
| **Bramble Row**   | 3    | 10   | Three hexes in a straight line, none blocking | Add brambles, size 9 + 4 P, clock 3.                                                                  | The brambles' size | makes brambles, Slowed     |
| **Ripen**         | 3    | 9    | One stack                                     | Add Ripening, size 20, clock 3.                                                                       | Ripening's size    | makes Ripening             |
| **Orchard Day**   | 4    | 14   | Every stack of the caster's side              | Add Mending, size 10 + 4 P, clock 3.                                                                  | Mending's size     | makes Mending              |
| **Second Spring** | 5    | 20   | Every stack of the caster's side              | Heal 54 + 21 P, reviving; a stack that bears Mending heals twice that.                                | The heal           | uses Mending               |

### 3.2 Accord

Links, Turned, guarding, swaps. Allied: Bloom, Clock. Opposed: Hush, Storm.

| Spell               | Tier | Mana | Target                          | Effect                                                                                                                    | Fuel doubles     | Condition and ground kinds   |
| ------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------- |
| **Scapegoat**       | 1    | 4    | Two friendly stacks             | The first gains a Scapegoat link to the second, clock 3.                                                                  | None             | makes Scapegoat              |
| **Close Ranks**     | 1    | 4    | One stack                       | It and every stack adjacent to it that is friendly to the caster gain Shielded 2, clock 3.                                | Shielded's size  | makes Shielded               |
| **Change Places**   | 1    | 5    | Two friendly stacks             | Swap their hexes.                                                                                                         | None             | -                            |
| **Share**           | 2    | 7    | One condition on a linked stack | Condition tool: every stack linked to its bearer receives a copy (landing rules apply); not Holds, not links.             | None (tool)      | -                            |
| **Sign Here**       | 2    | 8    | One enemy stack                 | Add Turned, clock 1, gate 75 + 25 P HP.                                                                                   | The gate         | makes Turned                 |
| **Soft Words**      | 2    | 6    | One stack                       | Add Mollified 30, clock 3.                                                                                                | Mollified's size | makes Mollified              |
| **Sanctuary Oath**  | 3    | 10   | One stack                       | It and every stack adjacent to it that is friendly to the caster gain Warded 30, clock 3.                                 | Warded's size    | makes Warded                 |
| **Take Heart**      | 3    | 11   | One friendly stack              | End Shaken on the target, then add Heartened, clock 3.                                                                    | None             | makes Heartened; uses Shaken |
| **Change of Heart** | 4    | 14   | One enemy stack                 | Add Turned, clock 2, gate 150 + 50 P HP.                                                                                  | The gate         | makes Turned                 |
| **The Long Table**  | 5    | 18   | One friendly stack              | Every boon on it that is neither a Hold nor a link is copied to each friendly stack adjacent to it (landing rules apply). | None             | -                            |

### 3.3 Clock

Turn order, extra and delayed turns, clocks and scheduled events. Allied: Accord, Hush. Opposed: Storm, Bloom.

| Spell            | Tier | Mana | Target                           | Effect                                                                                                                                       | Fuel doubles     | Condition and ground kinds   |
| ---------------- | ---- | ---- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------- |
| **First Bell**   | 1    | 4    | One stack                        | End Delayed on the target, then add Hastened, clock 2.                                                                                       | None             | makes Hastened; uses Delayed |
| **Late Bell**    | 1    | 4    | One stack                        | End Hastened on the target, then add Delayed, clock 2.                                                                                       | None             | makes Delayed; uses Hastened |
| **Appointment**  | 1    | 5    | One stack                        | Schedule, at the next round start: Harm 24 + 12 P to that stack.                                                                             | The Harm         | -                            |
| **Wind**         | 2    | 7    | One condition with a clock       | Condition tool: add 2 to its clock (to at most 9) or subtract 2; at 0 it expires now and its expiry rule fires; Holds can only be shortened. | None (tool)      | -                            |
| **Treacle**      | 2    | 7    | A hex and the six around it      | Each stack there gains Slowed 1, clock 3.                                                                                                    | Slowed's size    | makes Slowed                 |
| **Quick March**  | 2    | 8    | Every stack of the caster's side | Add Quickened 1, clock 2.                                                                                                                    | Quickened's size | makes Quickened              |
| **Encore**       | 3    | 9    | The friendly stack about to act  | It takes an extra turn after this one, and then gains Delayed, clock 2.                                                                      | None             | makes Delayed                |
| **Forced March** | 3    | 10   | Every stack of the caster's side | Add Hastened, clock 2.                                                                                                                       | None             | makes Hastened               |
| **Deadline**     | 4    | 14   | One stack                        | Add Reckoning, size 75 + 30 P, clock 2.                                                                                                      | Reckoning's size | makes Reckoning              |
| **Double Time**  | 5    | 20   | Every stack of the caster's side | Add Heartened, clock 1 (an extra turn this round or never).                                                                                  | None             | makes Heartened              |

### 3.4 Hush

Remains, drain, debts, switching off. Allied: Clock, Storm. Opposed: Bloom, Accord.

| Spell            | Tier | Mana | Target                                                        | Effect                                                                                                 | Fuel doubles             | Condition and ground kinds |
| ---------------- | ---- | ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------ | -------------------------- |
| **Hush Now**     | 1    | 4    | One stack                                                     | Add Hushed, clock 2.                                                                                   | None                     | makes Hushed               |
| **On Credit**    | 1    | 4    | One stack                                                     | Heal 25 + 12 P, reviving, and add Reckoning of size 25 + 12 P, clock 3.                                | The heal (not the debt)  | makes Reckoning            |
| **Bad Omen**     | 1    | 4    | One stack                                                     | Add Jinxed, size 25, clock 3.                                                                          | Jinxed's size            | makes Jinxed               |
| **Pass On**      | 2    | 7    | One bane and a stack adjacent to its bearer                   | Condition tool: the bane moves to that stack (landing rules apply; a refused bane stays where it was). | None (tool)              | -                          |
| **Lullaby**      | 2    | 8    | One stack                                                     | Add Asleep, clock 2, gate 75 + 25 P HP.                                                                | The gate                 | makes Asleep               |
| **Second Shift** | 2    | 7    | Remains of a stack the caster's side owned                    | Raise Shades worth 30 + 15 P HP on that hex (HP 8 each).                                               | The summon budget        | uses remains               |
| **Leech Line**   | 3    | 10   | One enemy stack and one friendly stack                        | The first gains a Leeched link to the second, size 15 + 7 P, clock 3.                                  | Leeched's size           | makes Leeched              |
| **Curtain Call** | 3    | 11   | Remains of a stack the caster's side owned                    | Raise the creature recorded in the remains, worth 40 + 20 P HP.                                        | The summon budget        | uses remains               |
| **Pea Soup**     | 4    | 13   | A hex and every hex within 2 of it                            | Add mist, clock 3.                                                                                     | None                     | makes mist                 |
| **Everybody Up** | 5    | 20   | Every remains on the field of a stack the caster's side owned | Each is raised as Shades worth 40 + 15 P HP, in field row order, until the ten-stack limit.            | The summon budget (each) | uses remains               |

### 3.5 Storm

Area Harm, fire, cold, pushing. Allied: Hush, Bloom. Opposed: Accord, Clock.

| Spell             | Tier | Mana | Target                                     | Effect                                                                                                                       | Fuel doubles    | Condition and ground kinds       |
| ----------------- | ---- | ---- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------- |
| **Jolt**          | 1    | 4    | One stack                                  | Harm 20 + 10 P.                                                                                                              | The Harm        | -                                |
| **Gust**          | 1    | 4    | One stack                                  | Harm 10 + 5 P, then push it 3 hexes straight toward the caster's enemy's edge of the field (hazards on the way apply).       | The Harm        | uses fire, brambles              |
| **Hothead**       | 1    | 4    | One stack                                  | Add Burning, size 6 + 3 P, and Fired Up 2, both clock 3.                                                                     | Burning's size  | makes Burning, Fired Up          |
| **Set Off**       | 2    | 7    | One condition                              | Condition tool: it ends and its bearer takes Harm 8 + 4 P for each round it had left (clockless counts as 3; at most 3).     | None (tool)     | -                                |
| **Broadside**     | 2    | 8    | A hex and the six around it                | Harm 18 + 9 P to each stack there, friend and foe.                                                                           | The Harm        | -                                |
| **Cold Snap**     | 2    | 8    | One stack                                  | Add Frozen, clock 2, gate 75 + 25 P HP.                                                                                      | The gate        | makes Frozen                     |
| **Downpour**      | 3    | 9    | A hex and every hex within 2 of it         | Each stack there gains Drenched 40, clock 3, and fire there ends.                                                            | Drenched's size | makes Drenched; uses fire        |
| **Wildfire**      | 3    | 10   | A hex and the six around it, none blocking | Add fire, size 9 + 4 P, clock 3.                                                                                             | The fire's size | makes fire                       |
| **Whiteout**      | 4    | 14   | A hex and every hex within 2 of it         | Harm 36 + 15 P to each stack there, friend and foe, and add Slowed 2, clock 2.                                               | The Harm        | makes Slowed                     |
| **The Sky Falls** | 5    | 20   | A hex and every hex within 3 of it         | Harm 54 + 21 P to each stack there that does not bear Warded, friend and foe; remains there become fire of size 10, clock 3. | The Harm        | makes fire; uses Warded, remains |

### 3.6 Notes on the list

- The five condition tools (Feed, Share, Wind, Pass On, Set Off) are the
  tier 2 tools of RULES_V2 2.7; Share and Set Off are the simpler forms of
  section 7.
- **Scapegoat** and **Broadside** are the concept's spells, at tiers 1 and 2.
- Raising spells need "remains of a stack the caster's side owned". The
  Sexton's Spade (CONTENT_ARTIFACTS) lifts that requirement.
- A Hold's gate depends only on Power, doubled by Fuel. The softeners
  (Mollified, Hushed, Drenched) no longer double a gate (section 7).
- Double Time and Take Heart reuse Heartened rather than adding an
  extra-turn rule; the cap of one extra turn per stack per round holds.
- Regrow, Jolt, Broadside, Change Places and Appointment touch no
  condition kind: they are the plain tools every book needs. Everything
  else makes or uses a kind.

## 4. Adventure spells

Cast from the map on the player's own turn, once per day per hero, with
the school rank for the tier (RULES_V2 2.8). The first of each school is
RULES_V2's; the second is new. All ten are in the guild and shrine pool and
exist as scrolls. Parley and Opening Salvo reach a neutral stack within 2
cells (Chebyshev), so the hero casts from outside its zone of control
(RULES_V2 2.8).

| Spell              | School | Tier | Mana | Other cost                           | Rule                                                                                                                                                                         | Scales           |
| ------------------ | ------ | ---- | ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Green Road**     | Bloom  | 2    | 7    | -                                    | RULES_V2 2.8: until the day ends this hero may enter forest cells at a move cost of 200; a hero in forest at day end is moved back to the last non-forest cell of its path.  | -                |
| **Second Helping** | Bloom  | 3    | 10   | -                                    | The map dwelling, outpost or stray hut the hero stands on gains creatures of its kind worth fight value 100 + 40 P (at least one); each dwelling accepts this once per week. | 100 + 40 P       |
| **Parley**         | Accord | 3    | 10   | -                                    | RULES_V2 2.8: a neutral stack within 2 cells of the hero with stack FV at most 300 + 150 P has no zone of control against this player until the day ends.                    | 300 + 150 P      |
| **Read the Seal**  | Accord | 1    | 4    | -                                    | Within 6 + P cells of the hero, show the contents of one sealed box, bank or vault, or the pages, scrolls, mana and backpack of one enemy hero.                              | 6 + P            |
| **Borrowed Day**   | Clock  | 3    | 10   | -                                    | RULES_V2 2.8: the hero gains 300 + 50 P movement points now, at most 1000, and has that many fewer at the start of the next day.                                             | 300 + 50 P       |
| **Saved Hour**     | Clock  | 1    | 4    | The points saved                     | The hero gives up any number of its remaining movement points, at most 200 + 50 P, and gains them at the start of the next day (the daily cap of 3000 still applies).        | 200 + 50 P       |
| **Ask the Dead**   | Hush   | 1    | 4    | -                                    | RULES_V2 2.8: reveal the cells in a disc of radius 4 + floor(P / 2) around any explored cell within 15 cells of the hero.                                                    | 4 + floor(P / 2) |
| **Dowse**          | Hush   | 2    | 7    | -                                    | Mark the exact cell of every buried cache, and of the buried Keystone, within 5 + P cells of the hero.                                                                       | 5 + P            |
| **Tow Line**       | Storm  | 4    | 14   | All remaining movement, at least 300 | RULES_V2 2.8: the hero moves from a pylon it stands on to any pylon its player has visited.                                                                                  | -                |
| **Opening Salvo**  | Storm  | 2    | 7    | 100 movement                         | A neutral stack within 2 cells of the hero takes Harm 30 + 15 P by the kill rule before any battle; it gives no XP, and a stack reduced to nothing is removed.               | 30 + 15 P        |

## 5. Cross-system combos

Each is a chain the rules allow, not a scripted pair. "Price" is what it
consumes.

1. **The scapegoat who signed nothing.** Notaries Stamp an enemy stack
   (Turned, clock 1) → the hero casts Scapegoat from one of its own stacks
   to the stamped stack, legal because both are friendly now → the round
   ends and the stack turns back → the link has two rounds left and names
   the stack, so every Strike on the protected stack lands on the enemy as
   Harm. Price: the Stamp, one tier 1 page.
2. **Everybody's weather but mine.** Umbrella of State (every stack of
   mine starts Warded 30, clock 3) → The Sky Falls skips every Warded
   stack → a 37-hex blast that hits only the enemy, cast into my own
   melee. Price: a tier 5 page, and it must be cast by round 3.
3. **The Albatross changes necks.** The Albatross gives +4 Attack and
   +4 Defense and Jinxes my strongest stack → that stack walks up to the
   enemy's best → Bellhops beside both Carry the Jinxed across → the
   enemy cannot retaliate and takes x 130% for the whole battle, because
   the Jinx is clockless. Price: the Bellhops' one Carry; no spell.
4. **Burning the bill.** Loan Sharks Advance my stack (Fired Up 4 and a
   Reckoning) → it fights at +4 Attack for three rounds and takes losses
   → before the debt falls due the hero casts Regrow on it and burns the
   Reckoning as Fuel (Hush is opposed to Bloom) → the debt is gone and the
   heal is doubled. Other endings: Pass On hands the bill to an adjacent
   enemy; Co-signer sends half to the nearest enemy anyway. Price: one
   page and the battle's Fuel.
5. **Compound interest.** Deadline puts a Reckoning of 75 + 30 P on an
   enemy stack → a Winder adds 2 rounds to its clock → Feed grows it by
   half and Compound Interest by 10 more each round → when it finally
   falls due, Bailiff's Greatcoat heals my weakest stack by the same
   amount, reviving. Price: two pages, the Winders' one use and four
   rounds of waiting.
6. **The arsonist.** Coat of Embers starts my whole army Fired Up 4 and
   Burning 8 → Firewalkers makes Fired Up stacks ignore Burning → seven
   Storm conditions sit on my own army as Fuel for any Accord or Clock
   page (Change of Heart with its gate doubled by Fuel) → when Fired Up expires,
   Blaze of Glory sets every adjacent enemy Burning at 8. Price: a cursed
   item that cannot be taken off, and a feat.
7. **The undertaker's engine.** Vow of the Grave (Hush pages cast on
   remains are not spent) → Second Shift every round on my own dead →
   Gleaner returns 2 of its 7 mana each time → Sexton's Spade adds the
   enemy's dead → hired Sextons cast their own Second Shift → every Shade
   that falls leaves mist that blinds the enemy's shooters. Price: Bloom
   forever, creatures lost for good, one cast a round.
8. **Wet, then cold.** A Lagoon Lurker's Strike leaves the enemy's best
   stack Drenched (+40% Harm taken) → Cold Snap, its gate doubled by
   Fuel, Freezes it → Cold Hands makes the thawing Strike x 300%, and
   Lucky takes it to the x 4 cap; every Harm it takes meanwhile is x 140%.
   Price: a tier 2 page, the battle's Fuel and a round of setup.
9. **The long table.** A Prize Pumpkin starts with clockless Ripening →
   Harvest grows it by 20 a round toward its maximum of 90 → The Long
   Table copies the Ripening, a boon and clockless, onto every friendly
   stack beside the Pumpkin → five stacks strike at up to x 190% for the
   rest of the battle. Price: a tier 5 page, rank 3 in Covenant, a feat and a slow
   tier 5 stray that must be kept alive.
10. **The debtor who never pays.** The Upper Bulb, a cursed third of the
    Hourglass, stops the clocks on my banes → On Credit becomes a free
    reviving heal every battle and the IOU Pad a free +3 Power, since no
    Reckoning on my stacks ever expires. Price: every Jinx, Burning and
    Slowed the enemy lands on me is permanent too.
11. **Borrowed loyalty, real estate.** Notaries Stamp an enemy shooter →
    the hero casts Change Places on it and my slowest stack, both
    friendly at that moment → the round ends with the shooter turned back
    in the middle of my army and my slow stack in their back line. Price:
    the Stamp and a tier 1 page.
12. **The thorn that cannot be hurt.** Groundskeepers Tend my best stack
    (Thorned and Mending) → Whipping Boys Take the Blame for it (a
    Scapegoat link, no cast) → each Strike against it is resolved in full,
    so Thorned harms the striker and my stack retaliates, but the damage
    lands on the Whipping Boys → Orchard Day revives them every round.
    Price: two once-per-battle abilities and a tier 4 page.
13. **Softening the gatekeeper (on the map).** Opening Salvo deals Harm
    to a neutral guard before any battle → the guard's fight value falls
    under Silver Tongue's threshold, or under a Letter of Safe Conduct's
    3000 → its zone of control is gone for the day and the hero walks
    past to the prize. Price: 7 mana and 100 movement a day, and no XP.

## 6. Decisions made here

| Decision                                                                    | Why                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 14 new condition kinds, 3 new ground kinds, no more                         | Each new kind needs six rules to justify it; fewer kinds meet more often                                                 |
| Raising needs remains of a stack your side owned                            | Makes the Sexton's Spade and enemy dead a find, as in the concept                                                        |
| Extra turns from spells are Heartened with a clock                          | No second extra-turn rule; Echo, Wind and Share work on them                                                             |
| A Hold's gate is Power and Fuel only; no softener doubles it (bzc.71)       | One rule per spell; the three softeners keep their own effects (section 7)                                               |
| Warded and Mollified cap at 75, Drenched at 100                             | Keeps Harm and Strike multipliers inside the caps of RULES_V2 1.11                                                       |
| The Sky Falls skips Warded stacks                                           | The concept's Controlled Burn without a seam spell                                                                       |
| Ice, sweets and blocking ground made by spells are left out                 | They need landfall laws or pathing work that v0.2 does not have                                                          |
| The Understudy's Mask is left out                                           | Copying any ability cannot be written in one sentence of the grammar yet                                                 |
| First Bell ends Delayed and Late Bell ends Hastened before adding their own | RULES_V2 does not say which timeline class wins when a stack bears both; proposed for the engine: Delayed and Shaken win |

## 7. In-game wording and the simplification pass

Bead `border_marches-bzc.46` (2026-11-25) rewrote the texts the game shows
for every spell (`text` in `src/core/magic/spells.ts`) in plain language.
The tables above stay the rules of record; the in-game texts say the same
thing in this shape:

- **What it targets, what it does, the numbers**, in one or two
  sentences: "Deal 30 Harm to a stack", "A stack gains Thorned 9 for 3
  rounds", "An enemy stack becomes Turned for 1 round: it fights for you.
  Gate 125 HP."
- **Clocks are written as rounds** ("for 3 rounds", not "clock 3"); area
  spells that hit both sides say "friend or foe".
- **Then the Fuel and Echo lines**, built from the school wheel: "Fuel:
  burn a Clock or Hush condition to double the heal." and "Echo: a Storm
  or Accord condition lasts 1 round longer."

Every grammar word a player meets (Bane, Boon, Hold, gate, clock, link,
Harm, Strike, Fuel, Echo, the condition and ground kinds, the schools,
Command, C and so on) is a keyword in `src/data/keywords.ts`, with a one
or two sentence definition. The interface highlights keywords in all rules
text and shows their definitions in boxes beside a hover card, Slay the
Spire style, with the keywords those definitions use one level down
(`src/ui/keywords.ts`). `tests/ui/keywords.test.ts` checks that every
condition and ground kind has an entry and that every entry is used.

Bead `border_marches-bzc.70` (2026-11-25) put the other texts a player
reads in the same style, again with no change to any rule or number:
artifacts, skills, feats, vows, Commands, specialties, birthrights, town
buildings and map objects. Clocks are rounds ("starts Frozen for 1
round", "for the whole battle"), multipliers are plain percentages
("deal 10% more damage"), "adjacent" is "next to" (except where Long
Shadow names the word abilities use), battle-start rules open "In each
battle, ...", and every skill rank reads on its own (no "Also:"), since
an upgrade card shows one rank alone. "Page" stays where only known
spells count (scrolls excluded), and "gate" is said in words where it
helps ("however big it is"). The same test bans the old shorthand in
these texts.

### 7.1 The simplified spells (bzc.71)

bzc.46 listed the spells that did not fit one or two plain sentences
without leaning on a second rule. Bead `border_marches-bzc.71`
(2026-11-25) gave each one clear rule a player can predict from its text:
riders were dropped, none added, and the power a rider carried went back
into a plain number (Power scaling, mana or size). The tables of section 3
show the new rules; this is what changed and why.

| Spell               | Was                                                                                                                                                                                                     | Now                                                                                    | Why, and where the power went                                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Set Off**         | Ends a condition; Harm = its "charge" x rounds left (at most 3, clockless 3). Charge was the Harm per round of Burning or Leeched, a debt's whole size counted once, or else 10 x the tier of its maker | Ends a condition; Harm 8 + 4 P for each round it had left (at most 3, clockless 3)     | The charge was hidden and had three cases. Now the number is on the card and scales with Power like every other Storm page (48 at P 2 for a full 3 rounds; old typical 30-90). The `charge` field and the kinds' `chargeFromSize` and `debt` flags are gone from the engine. A debt set off now simply ends, like a debt moved or burnt |
| **Share**           | Two picks: a link, then another condition on either end; the opposite end gets a copy                                                                                                                   | One pick: a condition on a linked stack; every stack it is linked to gets a copy       | One choice instead of two, and the copy goes where the link line points. A Sworn pair, a Scapegoat or a Leech Line work as before. The AI's and the player's candidate lists shrank from link x condition pairs to conditions                                                                                                           |
| **The Long Table**  | Every non-Hold, non-link condition on any stack copied to every neighbour, friend or foe; mana 20                                                                                                       | Every boon on a friendly stack copied to each friendly neighbour; mana 18              | "Friend or foe" made the result hard to foresee and usually hurt the caster too. It keeps its identity (Ripening and Heartened shared down the table, combo 9) and loses the trick of spreading an enemy's banes; 2 mana cheaper for that                                                                                               |
| **Gust**            | Harm 8 + 4 P, then a push of 3 away from a second picked hex beside the target                                                                                                                          | Harm 10 + 5 P, then a push of 3 straight toward the caster's enemy's edge of the field | The second pick (which way the wind blows) is gone: an enemy is blown back toward its own edge, a friend forward. The lost choice of direction went into the Harm (+25%). The `stackHex` target rule had no other user and is gone                                                                                                      |
| **Sign Here**       | Turned 1 round, gate 60 + 20 P; doubled if Mollified                                                                                                                                                    | Turned 1 round, gate 75 + 25 P                                                         | The softener rider is gone from all four Holds; the gate is +25% instead, so the Hold lands on bigger stacks without setup. Fuel still doubles it                                                                                                                                                                                       |
| **Change of Heart** | Turned 2 rounds, gate 120 + 40 P; doubled if Mollified                                                                                                                                                  | Turned 2 rounds, gate 150 + 50 P                                                       | As Sign Here                                                                                                                                                                                                                                                                                                                            |
| **Lullaby**         | Asleep 2 rounds, gate 60 + 20 P; doubled if Hushed                                                                                                                                                      | Asleep 2 rounds, gate 75 + 25 P                                                        | As Sign Here                                                                                                                                                                                                                                                                                                                            |
| **Cold Snap**       | Frozen 2 rounds, gate 60 + 20 P; doubled if Drenched                                                                                                                                                    | Frozen 2 rounds, gate 75 + 25 P                                                        | As Sign Here                                                                                                                                                                                                                                                                                                                            |
| **Sanctuary Oath**  | Warded 40 on one stack; spread to friendly neighbours if the target was Shielded                                                                                                                        | Warded 30 on a stack and every friendly stack next to it                               | Always the shape of Close Ranks, which players already know. The spread is now free, so the size went from 40 to 30                                                                                                                                                                                                                     |
| **Encore**          | Extra turn, then Delayed 2 unless Quickened; mana 10                                                                                                                                                    | Extra turn, then Delayed 2; mana 9                                                     | The Quickened escape is gone; 1 mana back                                                                                                                                                                                                                                                                                               |
| **Late Bell**       | Ends Hastened, then Delayed 2, or 3 if Slowed                                                                                                                                                           | Ends Hastened, then Delayed 2                                                          | The rider rarely fired (a Slowed stack the AI chose to delay); no number changed. Ending Hastened stays, the decision of section 6                                                                                                                                                                                                      |
| **Curtain Call**    | Raise the remains' creature, 45 + 20 P HP worth, at most its starting count                                                                                                                             | Raise the remains' creature, 40 + 20 P HP worth                                        | The cap needed the dead stack's starting count, which the player rarely knows. The budget alone decides, as for Sprout, Second Shift and Everybody Up; 5 HP less for the cap's loss                                                                                                                                                     |

Side effects, recorded here:

- **Users of six kinds.** Mollified, Shielded, Quickened, Slowed, Hushed
  and Drenched lost their spell users (section 2.3). Each keeps its own
  effect; new users, if wanted, come from creatures, feats or artifacts.
- **Keywords.** "Charge" left the glossary (`src/data/keywords.ts`); Debt
  already said "ended any other way, it deals nothing", which is now true
  of Set Off too.
- **RULES_V2 2.7** gives the new Share and Set off rows. The faction
  combos keep their numbers: the Realm's 6.1 Friars still Share the
  Knights' Heartened with their Sworn partner (now one pick).
- **The battle AI** scores conditions by kind and rehearses every cast, so
  it needed no change; with Share's shorter candidate list the full mode
  rehearses less (the fast mode's "far fewer" test now asks for half, not
  a quarter).

### 7.2 Balance check

`npm run sim:battles -- --mode balance` (budget 12,000, hero level 6, both
sides battle AI v2), before (main at 4ee7eed) and after, 40 seeds per
pairing with mixed and with magic-only heroes. Attacker's win rate per
pairing, and each faction's rate over its cross-faction battles.

| Pairing (attacker v defender) | Mixed heroes before | Mixed heroes after | Magic heroes before | Magic heroes after |
| ----------------------------- | ------------------: | -----------------: | ------------------: | -----------------: |
| humans v humans               |                  55 |                 53 |                  48 |                 50 |
| humans v undead               |                  58 |                 55 |                  65 |                 65 |
| humans v goblins              |                  53 |                 53 |                  50 |                 45 |
| undead v humans               |                  53 |                 50 |                  58 |                 60 |
| undead v undead               |                  63 |                 63 |                  63 |                 63 |
| undead v goblins              |              **73** |             **73** |                  55 |                 55 |
| goblins v humans              |                  58 |                 53 |              **78** |             **75** |
| goblins v undead              |                  35 |                 43 |                  45 |                 55 |
| goblins v goblins             |                  55 |                 50 |                  60 |                 58 |
| **Realm (humans)**            |                  50 |                 51 |                  45 |                 44 |
| **Restless (undead)**         |                  58 |                 56 |                  51 |                 49 |
| **Horde (goblins)**           |                  42 |                 43 |                  54 |                 58 |

A pairing cell is 40 battles (about plus or minus 8 points), a faction
row 160 (about plus or minus 4). Every faction moved by 4 points or less,
inside the noise, and no cell left the 35-65% band: the two cells outside
it (bold) were outside before, by the same amount, and come from the
armies, not these spells (undead attacking goblins with mixed heroes,
goblins attacking humans with magic heroes). Mixed heroes: 7 of 9 cells
inside 40-60% after (6 before), 8 of 9 inside 35-65% (8). Magic heroes: 6
of 9 inside 40-60% (6), 8 of 9 inside 35-65% (8). No run had an illegal
action. The default 20-seed run read Realm / Restless / Horde 55 / 55 / 40
before and 59 / 53 / 39 after. The Horde's magic-only rate rose 4 points
(Set Off now scales with the Boomshamans' Power); it is the number to
watch if a later run confirms it.
