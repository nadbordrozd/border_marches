# Content: artifacts and consumables

Status: content for v0.2 (bead `border_marches-bzc.6`, 2026-11-24).

80 artifact kinds for v0.2: 30 Trinkets, 20 Wonders, 6 cursed Wonders, 12
Marvel pieces that assemble into 4 Marvels, and 12 consumables.
[RULES_V2.md](RULES_V2.md) section 4 governs. Condition kinds are defined
in [CONTENT_SPELLS.md](CONTENT_SPELLS.md).

## 1. Conventions

- **Value** is in gold. It sizes the guard (see
  [CONTENT_MAP_OBJECTS.md](CONTENT_MAP_OBJECTS.md#2-values-and-guards)) and
  the price: sites sell at value and buy at half. Values sit around the
  grade values of RULES_V2 4.2 (Trinket 2000, Wonder 5000, piece 6000,
  Marvel 20000).
- **Form** is one of the five forms of RULES_V2 4.6. "Battle start" rules
  resolve as visible steps before round 1 and use selectors (strongest,
  weakest, fastest; slowest is the lowest Speed, ties to the lowest field
  order). "Item act" is once per battle, before a friendly stack acts.
  "Reaction" fires once per action in the heroes' place in the order.
- "Your" means the side the hero commands when the rule acts. Conditions
  made by artifacts have the school of their kind and count as tier 1 for
  Trinkets, 3 for Wonders and pieces, 5 for Marvels (charge, RULES_V2 2.7).

## 2. Trinkets (30)

Stat modifiers only.

| Trinket                        | Slot   | Value | Rule                                             |
| ------------------------------ | ------ | ----- | ------------------------------------------------ |
| **Tin Sabre**                  | Weapon | 1000  | +1 Attack.                                       |
| **Parade Sword**               | Weapon | 2000  | +2 Attack.                                       |
| **Ringmaster's Whip**          | Weapon | 3000  | +3 Attack.                                       |
| **Pot Lid**                    | Shield | 1000  | +1 Defense.                                      |
| **Tollgate Door**              | Shield | 2000  | +2 Defense.                                      |
| **Manhole Cover**              | Shield | 3000  | +3 Defense.                                      |
| **Reading Glasses**            | Head   | 2000  | +2 Lore.                                         |
| **Thinking Cap**               | Head   | 2000  | +2 Power.                                        |
| **Second-Best Breastplate**    | Torso  | 3000  | +1 Attack and +2 Defense.                        |
| **Star-Chart Robe**            | Torso  | 3000  | +2 Power and +1 Lore.                            |
| **Sprig Pendant**              | Neck   | 2000  | +2 Power for Bloom pages.                        |
| **Sealing-Wax Locket**         | Neck   | 2000  | +2 Power for Accord pages.                       |
| **Fob Chain**                  | Neck   | 2000  | +2 Power for Clock pages.                        |
| **Mourning Brooch**            | Neck   | 2000  | +2 Power for Hush pages.                         |
| **Lightning-Glass Bead**       | Neck   | 2000  | +2 Power for Storm pages.                        |
| **Four-Leaf Buttonhole**       | Neck   | 2000  | +1 Luck.                                         |
| **Regimental Sash**            | Cloak  | 2000  | +1 Morale.                                       |
| **Clerk's Cape**               | Cloak  | 2000  | Your pages cost 10% less mana.                   |
| **Oilskin of Deep Pockets**    | Cloak  | 2000  | +15% maximum mana.                               |
| **Knuckle-Dusters**            | Ring   | 2000  | +1 Attack and +1 Defense.                        |
| **Signet of the Minor Office** | Ring   | 2000  | +1 Power and +1 Lore.                            |
| **Moneylender's Ring**         | Ring   | 2000  | +125 gold each day while its hero is on the map. |
| **Seven-Furlong Boots**        | Feet   | 2500  | +10% movement points.                            |
| **Sensible Shoes**             | Feet   | 2000  | +200 movement points.                            |
| **Galoshes**                   | Feet   | 1500  | Wasteland costs this hero 100 per straight step. |
| **Lucky Penny**                | Pocket | 2000  | +1 Luck.                                         |
| **Brass Bugle**                | Pocket | 2000  | +1 Morale.                                       |
| **Spyglass**                   | Pocket | 1500  | +1 sight radius.                                 |
| **Thermos of Strong Tea**      | Pocket | 1500  | +2 daily mana return.                            |
| **Scholar's Bookmark**         | Pocket | 1500  | +10% to every XP gain.                           |

## 3. Wonders (20)

| Wonder                               | Slot   | Value | Form         | Rule                                                                                                                             | Kinds                          |
| ------------------------------------ | ------ | ----- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Winter's Pocket Watch**            | Pocket | 6000  | Battle start | The fastest enemy stack starts Frozen, clock 1.                                                                                  | makes Frozen                   |
| **Sexton's Spade**                   | Weapon | 5000  | Uses ground  | Your rules that use remains may use the remains of any stack, whoever owned it.                                                  | uses remains                   |
| **The Bellhop's Cap**                | Head   | 6000  | Item act     | Choose one of your stacks; move one condition from a stack adjacent to it to another stack adjacent to it (landing rules apply). | -                              |
| **Tinderbox**                        | Pocket | 5000  | Item act     | Your spent Fuel is restored, so you may Fuel a second time this battle.                                                          | -                              |
| **Watering Can**                     | Pocket | 4000  | Battle start | Your weakest stack starts with Mending 12, clock 4.                                                                              | makes Mending                  |
| **Gardener's Apron**                 | Torso  | 4000  | Reaction     | When Mending heals a stack of yours, each enemy stack adjacent to it gains Venomed 2, clock 2.                                   | makes Venomed; uses Mending    |
| **Thornmail Vest**                   | Torso  | 5000  | Battle start | Your strongest stack starts with Thorned 12, clockless.                                                                          | makes Thorned                  |
| **Hedge-Clipper Shears**             | Weapon | 4000  | Reaction     | When Thorned on your stack deals Harm, the striker gains Slowed 2, clock 2.                                                      | makes Slowed; uses Thorned     |
| **Cider Flask**                      | Pocket | 4000  | Item act     | End Ripening on one of your stacks; it heals 3 x that size in HP, reviving.                                                      | uses Ripening                  |
| **Notary's Seal**                    | Ring   | 5000  | Battle start | Your strongest stack starts with a Scapegoat link to your weakest stack, clock 3.                                                | makes Scapegoat                |
| **Umbrella of State**                | Shield | 5000  | Battle start | Every stack of yours starts Warded 30, clock 3.                                                                                  | makes Warded                   |
| **Lightning Rod**                    | Weapon | 5000  | Reaction     | When Warded lowers Harm to your stack, the amount prevented is dealt as Harm to the nearest enemy stack.                         | uses Warded                    |
| **Pressed Olive Branch**             | Neck   | 4000  | Battle start | The strongest enemy stack starts Mollified 30, clock 2.                                                                          | makes Mollified                |
| **Drum Major's Baton**               | Weapon | 4000  | Battle start | Your two slowest stacks start Quickened 2, clock 3.                                                                              | makes Quickened                |
| **Metronome Spurs**                  | Feet   | 4000  | Reaction     | When a Quickened stack of yours Strikes, the target gains Slowed 1, clock 2.                                                     | makes Slowed; uses Quickened   |
| **Bailiff's Greatcoat**              | Cloak  | 5000  | Reaction     | When a Reckoning expires on an enemy stack, your weakest stack heals that amount, reviving.                                      | uses Reckoning                 |
| **Felt Slippers of the Night Shift** | Feet   | 4000  | Battle start | The enemy shooter with the highest stack fight value starts Hushed, clock 2.                                                     | makes Hushed                   |
| **Bloodstone Ring**                  | Ring   | 5000  | Battle start | The strongest enemy stack starts with a Leeched link to your weakest stack, size 10, clock 3.                                    | makes Leeched                  |
| **Leaky Bucket**                     | Head   | 4000  | Battle start | The strongest enemy stack starts Drenched 50, clock 3.                                                                           | makes Drenched                 |
| **Whetstone Pendant**                | Neck   | 6000  | Reaction     | When a Fired Up stack of yours kills a stack, it gains Heartened, clock 1.                                                       | makes Heartened; uses Fired Up |

## 4. Cursed Wonders (6)

Labelled cursed everywhere, worn by choice, then stuck until lifted
(RULES_V2 4.3). Each drawback is a battle-start condition, so it can be
moved, burnt as Fuel or set off like any other.

| Cursed Wonder                       | Slot   | Value | Bonus                                            | Drawback at battle start                                     |
| ----------------------------------- | ------ | ----- | ------------------------------------------------ | ------------------------------------------------------------ |
| **The Albatross**                   | Neck   | 4000  | +4 Attack and +4 Defense.                        | Your strongest stack starts Jinxed 30, clockless.            |
| **Coat of Embers**                  | Cloak  | 4000  | Every stack of yours starts Fired Up 4, clock 3. | Every stack of yours starts Burning 8, clock 3.              |
| **IOU Pad**                         | Pocket | 4000  | +3 Power.                                        | Your strongest stack starts with a Reckoning of 80, clock 3. |
| **Sleeping Cap of the Night Watch** | Head   | 4000  | +4 Lore and +2 daily mana return.                | Your fastest stack starts Asleep, clock 2, with no gate.     |
| **Ball and Chain**                  | Feet   | 4000  | +5 Defense.                                      | Every stack of yours starts Delayed, clock 2.                |
| **The Thirteenth Chime**            | Ring   | 4000  | +3 Power and +3 Lore.                            | Your two strongest stacks start Shaken, clock 3.             |

## 5. Marvels and their pieces (4 Marvels, 12 pieces)

A hero wears at most one Marvel. Each piece is a Wonder by grade, worth
6000; an assembled Marvel is worth 20000 and takes the slot shown. A
Marvel assembled from a cursed piece is cursed (RULES_V2 4.5).

### The Second Left Glove

Slot: Ring. Value 20000. Rule switch: Your hero may cast twice per round; the second page must be of a school opposed to the first.

| Piece                  | Slot  | Value | Form          | Rule                                                                                                                        |
| ---------------------- | ----- | ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **The Glove's Thumb**  | Ring  | 6000  | Rule switch   | In round 1 your hero may cast twice; the second page must be of a school opposed to the first.                              |
| **The Glove's Lining** | Cloak | 6000  | Stat modifier | A page of a school opposed to the page you cast in the round before costs 25% less mana.                                    |
| **The Odd Cufflink**   | Ring  | 6000  | Reaction      | When you cast a page of a school opposed to your previous page this battle, your strongest stack gains Fired Up 3, clock 2. |

### The Hourglass with No Bottom

Slot: Pocket. Value 20000. Cursed, because the Upper Bulb is. Rule switch: Clocks on conditions on your stacks do not tick, Holds excepted: boons and debts alike.

| Piece                       | Slot   | Value | Form        | Rule                                                                    |
| --------------------------- | ------ | ----- | ----------- | ----------------------------------------------------------------------- |
| **The Upper Bulb** (cursed) | Pocket | 6000  | Rule switch | Clocks on banes on your stacks do not tick, Holds excepted.             |
| **The Lower Bulb**          | Neck   | 6000  | Rule switch | Clocks on boons on your strongest stack do not tick.                    |
| **A Pinch of Sand**         | Pocket | 6000  | Item act    | Change one condition's clock by 2 either way, exactly as the Wind tool. |

### Treaty Ink

Slot: Pocket. Value 20000. Rule switch: When a linked stack dies, its end of the link passes to the nearest living stack, friend or foe.

| Piece                   | Slot   | Value | Form         | Rule                                                                                                    |
| ----------------------- | ------ | ----- | ------------ | ------------------------------------------------------------------------------------------------------- |
| **The Quill**           | Weapon | 6000  | Reaction     | When your side makes a link, its clock is 1 longer.                                                     |
| **The Blotter**         | Shield | 6000  | Reaction     | When the far end of a Scapegoat link on your stack dies, the excess Harm does not return to your stack. |
| **The Unsigned Treaty** | Torso  | 6000  | Battle start | Your strongest stack starts with a Scapegoat link to the strongest enemy stack, clock 1.                |

### The Unspent Page

Slot: Neck. Value 20000. Rule switch: One page, chosen on the map when the Marvel is put on, is never spent; it still costs mana and a cast.

| Piece                   | Slot   | Value | Form          | Rule                                                                                                  |
| ----------------------- | ------ | ----- | ------------- | ----------------------------------------------------------------------------------------------------- |
| **The Torn Corner**     | Pocket | 6000  | Rule switch   | Each of your tier 1 pages may be cast twice per battle.                                               |
| **Bookbinder's Thread** | Ring   | 6000  | Rule switch   | The first scroll you cast each battle is not destroyed.                                               |
| **The Missing Page**    | Head   | 6000  | Stat modifier | +4 Power, and your highest-tier page (ties: the costliest, then book order) starts each battle spent. |

## 6. Consumables (12)

Carried in the backpack and used on the adventure map.

| Consumable                 | Kind   | Value | Rule when used                                                                                                                 |
| -------------------------- | ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Bottled Cheer**          | Potion | 400   | +1 Morale until the hero's next battle ends.                                                                                   |
| **Jar of Fair Chances**    | Potion | 400   | +1 Luck until the hero's next battle ends.                                                                                     |
| **Blue Tonic**             | Potion | 500   | The hero gains 20 mana, which may take it above its maximum once.                                                              |
| **Road Cordial**           | Potion | 500   | +400 movement points today.                                                                                                    |
| **Fire-Eater's Draught**   | Potion | 600   | In the hero's next battle its strongest stack starts Fired Up 4, clock 3.                                                      |
| **Witch-Hazel**            | Potion | 600   | In the hero's next battle its weakest stack starts with Mending 10, clock 4.                                                   |
| **Late-Harvest Cordial**   | Potion | 600   | In the hero's next battle its strongest stack starts with Ripening 20, clock 4.                                                |
| **Elixir of Hindsight**    | Potion | 1000  | The hero's next skill offer or feat draft is redrawn once, with the seed advanced by one.                                      |
| **Dog-Eared Map**          | Paper  | 800   | Marks the exact cell of the nearest buried cache.                                                                              |
| **Letter of Safe Conduct** | Paper  | 1200  | A neutral stack adjacent to the hero with stack FV at most 3000 has no zone of control against this player until the day ends. |
| **Signal Lantern**         | Tool   | 500   | Reveals the cells in a disc of radius 8 around the hero.                                                                       |
| **Collapsible Shovel**     | Tool   | 500   | The hero digs now for 300 movement points, whatever it has already spent today.                                                |

### 6.1 Using a consumable (the rule RULES_V2 lacks)

Proposed as RULES_V2 4.7, for the engine bead to adopt:

- A consumable is an artifact with no slot. It is never worn. Each takes
  one backpack slot; up to three of the same kind share a slot.
- **Use** is an adventure-map action of the hero carrying it, legal only
  on its player's turn and never during a battle. It costs no movement
  points unless the item says so. The item is destroyed and its effect
  applies at once.
- An effect "until the hero's next battle ends" or "in the hero's next
  battle" is recorded on the hero and shown on the hero screen. It is a
  one-battle Morale or Luck bonus (RULES_V2 6) or a battle-start rule
  (RULES_V2 4.6, form 2, resolved with the hero's artifacts). It ends when
  that battle ends, however it ends.
- A hero has at most one pending effect of each consumable kind; a second
  use of the same kind is refused and the item is kept.
- Consumables are handed over, traded, won and lost exactly as artifacts.
  The AI may use them.

## 7. Rule switches this content needs

RULES_V2 4.6 form 5 keeps a fixed table of engine switches. These are the
ones this catalogue uses, artifacts, feats and vows together.

| Switch                                                         | Used by                                                                                                         | Bound by                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Second cast in a round, of a school opposed to the first       | The Second Left Glove; round 1 only: The Glove's Thumb                                                          | Casts 2 per round (RULES_V2 1.11)  |
| Second cast in round 1, any school                             | Vow of the Opening                                                                                              | Casts 2 per round                  |
| The first scroll each battle does not use the cast             | Packrat rank 3                                                                                                  | Casts 2 per round                  |
| Clocks on conditions on own stacks do not tick, Holds excepted | The Hourglass with No Bottom; banes only: The Upper Bulb; boons on the strongest stack only: The Lower Bulb     | Never Holds                        |
| A dying link passes its end to the nearest living stack        | Treaty Ink                                                                                                      | One link of each kind per stack    |
| Links made by this side are clockless                          | Vow of the Still Air                                                                                            | A link still ends when an end dies |
| One chosen page is not spent                                   | The Unspent Page                                                                                                | Mana, one cast a round             |
| Tier 1 pages have two uses                                     | The Torn Corner                                                                                                 | Two, not more                      |
| Hush pages cast on own stacks or remains are not spent         | Vow of the Grave                                                                                                | Mana, remains                      |
| Scrolls are not destroyed                                      | Bookbinder's Thread (the first each battle); Vow of the Borrowed Book (all, at mana cost, once per battle each) | One cast a round                   |
| Remains of any owner qualify                                   | Sexton's Spade                                                                                                  | Remains are consumed               |
| Fuel uses +1                                                   | Tinderbox (as an item act); Vow of Empty Pockets                                                                | Fuel 3 per battle                  |
| Fuel triples                                                   | Bonfire                                                                                                         | Harm and Strike caps               |
| Echo adds 2                                                    | Long Echo                                                                                                       | Clock 9                            |
| Own Storm pages do not harm own stacks                         | Vow of the Pyre                                                                                                 | -                                  |
| Gates read own stacks at twice their HP                        | Vow of Bare Hands                                                                                               | -                                  |

## 8. Decisions made here

| Decision                                                                 | Why                                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Values vary inside a grade (Trinkets 1000 to 3000, Wonders 4000 to 6000) | A +1 and a +3 item should not draw the same guard                                            |
| Sexton's Spade and Tinderbox stay Wonders, as in the concept             | The Spade uses ground, and the Tinderbox is written as an item act, so both fit forms 2 to 4 |
| The Albatross's Jinx is clockless and has no gate                        | It must still be worth carrying across in round 3                                            |
| The Sleeping Cap's Asleep has no gate                                    | A gated curse would simply miss a big stack; the Hold rules already cap it at two rounds     |
| Four Marvels: Glove, Hourglass, Treaty Ink, Unspent Page                 | The four concept Marvels that are one engine switch each                                     |
| Consumables stack three to a backpack slot                               | Twelve slots are otherwise spent on potions                                                  |
| No Trinket sets                                                          | Not one of the five forms (taxonomy 5.3)                                                     |
