# Rules v2: battle grammar, magic, heroes, artifacts, multi-player

Status: canonical for v0.2 (bead `border_marches-bzc.2`, 2026-11-24). This
is the implementable form of the approved concept,
[MAGIC_AND_FACTIONS_CONCEPT.md](MAGIC_AND_FACTIONS_CONCEPT.md) (option B:
shared grammar and spellbook, one birthright per faction; every section 10
recommendation taken). It is faction-neutral. Content (spell, skill, feat,
artifact, creature and map-object lists; the Humans, Undead and Goblins
rosters and towns) comes from later beads and must be written in the terms
defined here.

Where this document gives a number, the engine uses it. Where it says "set
by content", the engine reads a data field and this document fixes the
field's meaning and limits.

## 0. Relation to the MVP documents

### 0.1 What this supersedes

Everything in [GAME_DESIGN.md](GAME_DESIGN.md), [ECONOMY.md](ECONOMY.md) and
[FACTION_LOST_WORLD.md](FACTION_LOST_WORLD.md) stays in force unless listed
here.

| MVP rule                                                                  | v0.2 rule                                                                                                           | Section |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| GAME_DESIGN 3: one faction, one hero, no spells, artifacts, skills or AI  | Three factions, several heroes per player, two to four players                                                      | all     |
| GAME_DESIGN 4: win by capturing the Warlord's Hold; lose with the hero    | Last player standing; elimination rules                                                                             | 5.9     |
| GAME_DESIGN 6: Attack and Defense only; offers of +1 Attack or +1 Defense | Four primary stats, a class stat pattern, skills, feats                                                             | 3       |
| GAME_DESIGN 6: 1500 movement points; same-creature stacks merge           | Movement from the slowest creature plus modifiers; one creature may fill several slots                              | 3.9     |
| GAME_DESIGN 7.2: mine flags cannot be lost; one hero                      | Mines and towns change hands; hero against hero                                                                     | 5       |
| GAME_DESIGN 7.3: one player's fog                                         | Fog per player                                                                                                      | 5.10    |
| GAME_DESIGN 9.2: turn order from Speed and Wait only                      | The timeline: also Delayed, Hastened, extra turns, scheduled events                                                 | 1.6     |
| GAME_DESIGN 9.3: five actions                                             | Adds hero cast, Command, item act, creature ability, retreat                                                        | 1.7     |
| GAME_DESIGN 9.4: ability multipliers uncapped as a product                | Same formula; the product of percentage multipliers is capped at x 4 and floored at x 1/4; Harm is a second channel | 1.8     |
| GAME_DESIGN 9.6: attack preview                                           | Rehearsal of any action as a full step chain, enemy intents, take-back                                              | 1.13    |
| GAME_DESIGN 9.7: no retreat; round limit without a winner                 | Retreat; 30-round limit, the defender wins                                                                          | 1.12    |
| GAME_DESIGN 10: caps table                                                | Extended                                                                                                            | 1.11    |
| GAME_DESIGN 11: should neutrals grow weekly?                              | No, not in v0.2                                                                                                     | 5.7     |
| `StatusId` and `StatusInstance` (Venom) in `src/core/battle/types.ts`     | Conditions; Venom becomes the condition Venomed (Bloom, bane, size 3, clock 2), with the same numbers as before     | 1.3     |
| ECONOMY 4: flags are permanent                                            | Flags are taken by visiting                                                                                         | 5.6     |

The four resources (gold, wood, ore, essence), the calendar, the square
8-direction adventure grid, zones of control, the 15 x 11 hex field, the
deployment table, the damage formula, the kill rule and exact integer
arithmetic are unchanged.

### 0.2 Conventions

- **Integers only.** Every game number is an integer. Multipliers are whole
  percentages (150 means x 1.5) or exact rationals. A formula is computed
  exactly and floored once at the end, as in GAME_DESIGN 9.4, unless it says
  "rounded up". No floating point touches a game number.
- **No randomness in battle.** A battle is a pure function of its setup and
  the actions taken. Seeds are used only where this document says "seeded"
  (obstacles, level-up offers, tavern and guild contents, map generation),
  always through `deriveSeed` in `src/core/rng.ts` with a fixed label, so a
  reload never changes an outcome.
- **No hidden state.** Everything the engine reads is in the state and can be
  shown. The AI that plays stacks is a pure function of the battle state.
- "Round" means a battle round; "day" and "week" are calendar time.
- "Field order" is attacker stacks by slot, then defender stacks by slot,
  then summoned stacks in order of creation. "Timeline order" is the order of
  section 1.6.
- A **selector** picks a stack by a visible measure, with ties to the lowest
  field order: _strongest_ is the highest stack fight value (count x creature
  FV, GAME_DESIGN 8.2), _weakest_ the lowest, _fastest_ the highest Speed,
  _nearest_ the fewest hexes away.

## 1. The battle grammar

Every spell, ability, artifact, skill, feat, Command and birthright is a
list of **rules**, and each rule is built only from the nouns of sections
1.1 to 1.6 and the verbs of 1.7. New content may not add a noun, a verb or
a subsystem.

### 1.1 The laws

1. **One vocabulary.** As above.
2. **Conditions are things.** Any condition can be moved, copied, fed,
   wound or set off by a rule that says so, whatever made it.
3. **Checked once.** A requirement about who may be chosen (friendly,
   adjacent, living, native) is tested when the effect is created and never
   again.
4. **Bound by identity, sides read live.** An effect that names a stack
   stores its stack id and keeps naming it. The words "friendly", "enemy",
   "mine" are evaluated at the moment the effect acts, from the stack's
   current side.
5. **Anything can target anything.** A rule limits its targets only by an
   explicit requirement. With none, any stack or hex is legal.
6. **Death leaves ground** (1.5).
7. **Reactions resolve one at a time in a fixed, visible order** (1.10).

### 1.2 Stacks

| Field                                      | Meaning                                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                       | `a<slot>`, `d<slot>`, or `s<n>` for summoned stacks                                                                                          |
| `owner`                                    | The battle side that brought or summoned it. Never changes                                                                                   |
| `side`                                     | The owner, or the opposite side while the stack bears Turned. Derived, not stored                                                            |
| `creature`, `count`, `topHp`, `hex`, shots | As in the MVP                                                                                                                                |
| `initialCount`                             | Count at deployment. A heal that revives can never raise the count above it                                                                  |
| `native`                                   | Set at deployment, never changes: true when the creature's faction has a birthright that applies to this army (3.8)                          |
| `summoned`                                 | True for stacks created during the battle (summoned or raised)                                                                               |
| `tags`                                     | From creature data: what its death leaves (`corpse`, `bones`, `wreck`, `sweets` or `nothing`) and at most two condition kinds it cannot bear |
| `conditions`                               | Ordered list, at most six (1.3)                                                                                                              |
| `wary`                                     | Rounds left of refusing Holds (1.9); 0 normally                                                                                              |
| Per-round flags                            | Retaliated, waited, defending, extra turn taken, turn-start effects done                                                                     |
| Per-battle flags                           | Each once-per-battle ability used; pages cast (creature casters)                                                                             |

A stack with hero bonuses takes them from the hero of the side it currently
fights for. All stacks occupy one hex. A side may have at most **ten**
living stacks on the field (seven army slots plus three created in battle);
a summon that would exceed this is refused.

There are no immunities other than the two tagged condition kinds per
creature.

### 1.3 Conditions

A condition is a named effect on one stack.

| Field      | Meaning                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`     | The condition's definition (content): Venomed, Burning, Frozen, Scapegoat, ...                                                                                             |
| `school`   | One of the five schools; fixed by the kind. Conditions made by creatures and artifacts have a school too                                                                   |
| `polarity` | `boon` or `bane`; fixed by the kind, by what it does to its bearer. It does not flip when the bearer changes side                                                          |
| `size`     | One integer whose meaning the kind defines (Defense lost, Harm per round, debt owed, percent bonus). 0 for kinds with no number                                            |
| `maxSize`  | 3 x the size at creation unless the kind sets another maximum                                                                                                              |
| `clock`    | Rounds left, 1 to 9, or `null` for "until the battle ends"                                                                                                                 |
| `gate`     | `null`, or a threshold a stack must pass to receive the condition: `{ measure: "hp" or "tier", max }`. `hp` is the stack's current total HP; `tier` is the creature's tier |
| `charge`   | Harm per remaining round if the condition is set off (2.7)                                                                                                                 |
| `hold`     | True for Holds (1.9); fixed by the kind                                                                                                                                    |
| `link`     | `null`, or the stack id of the far end (1.4)                                                                                                                               |
| `source`   | The stack id, hero or artifact that made it (for display and for "your" in rule text)                                                                                      |

**Clocks.** All clocks tick at the end of each round (1.6). A condition made
in round r with clock c ends at the end of round r + c - 1; the MVP's Venom
("until the end of the next round") is clock 2. When a clock reaches 0 the
condition **expires** and its on-expire rule, if any, fires (a debt falls
due). A condition removed in any other way (moved away, burnt, set off,
displaced, dispelled, bearer dead) **ends** and its on-expire rule does not
fire.

**Landing.** Whenever a condition would be put on a stack (made, moved or
copied), in this order:

1. Tags: if the stack's tags exclude the kind, it is refused.
2. Gate: if the condition has a gate and the stack exceeds it, it is
   refused. The gate is tested on every landing and never afterwards: a
   stack healed above the gate keeps the condition.
3. Hold rules (1.9).
4. Same kind: a stack never bears two conditions of one kind. The new one
   merges into the old: size = the larger size, clock = the longer clock
   (`null` is longest), gate, source and link from the newcomer. A second
   link of the same kind therefore replaces the first.
5. Room: if the stack already bears six, the condition with the shortest
   clock that is neither a Hold nor clockless is **displaced** (ties: the
   oldest); if none can be displaced, the newcomer is refused.

A refusal is a legal outcome, shown by the rehearsal with its reason and
numbers ("gate 120 HP, target has 400"). The page, use or action is still
spent unless the refusal happens at the choosing step, where the interface
blocks the choice.

**What a moved or copied condition carries:** kind, school, polarity, size,
maxSize, clock, gate, charge and link. Requirements about choosing are not
re-tested (law 3).

**Hooks.** A condition kind may use these and only these:

| Hook                        | Use                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modifier                    | Flat Attack, Defense or Speed; a percentage on Strikes dealt or taken, or on Harm taken; "cannot retaliate", "cannot shoot", "cannot act" (Holds only) |
| On the bearer's turn start  | Once per round (extra turns do not repeat it): Harm, heal, growth of its own size                                                                      |
| On strike / on being struck | A reaction (1.10)                                                                                                                                      |
| On round end                | Before clocks tick                                                                                                                                     |
| On expire                   | When the clock reaches 0                                                                                                                               |
| Redirect                    | Links only (1.4)                                                                                                                                       |
| Timeline class              | Delayed or Hastened (1.6)                                                                                                                              |

**Engine-standard kinds.** Content defines most kinds. These are fixed
here because other rules refer to them:

| Kind      | School | Polarity | Rule                                                                                 |
| --------- | ------ | -------- | ------------------------------------------------------------------------------------ |
| Venomed   | Bloom  | bane     | -size Defense (never below 0)                                                        |
| Burning   | Storm  | bane     | At the bearer's turn start: Harm equal to size                                       |
| Frozen    | Storm  | bane     | Hold. Cannot act or retaliate. The first Strike against it is x 200% and ends Frozen |
| Asleep    | Hush   | bane     | Hold. Cannot act or retaliate. Any damage it takes ends Asleep                       |
| Turned    | Accord | bane     | Hold. The stack fights for the side opposite its owner                               |
| Delayed   | Clock  | bane     | Timeline class "last"; cannot Wait                                                   |
| Hastened  | Clock  | boon     | Timeline class "first"                                                               |
| Heartened | Accord | boon     | Section 6                                                                            |
| Shaken    | Hush   | bane     | Section 6                                                                            |
| Lucky     | Bloom  | boon     | Section 6                                                                            |
| Jinxed    | Hush   | bane     | Section 6                                                                            |

**Admission rule for content.** A new condition kind needs three makers and
three users across at least two factions or schools.

### 1.4 Links

A link is a condition on one stack (the **near end**) whose `link` field
names another stack (the **far end**). It is drawn as a line. It counts
toward the near end's six conditions and not toward the far end's.

- A stack bears at most one link of each kind as near end. It may be the
  far end of any number.
- A link ends when either end dies, and when a move would make both ends
  the same stack (the move is refused).
- **Redirect links** (Scapegoat is the model): damage to the near end,
  whether a Strike or Harm, is computed against the near end in full:
  formula, on-strike and on-being-struck reactions, and the near end's
  retaliation all happen as if it were hit. The near end then loses
  nothing. The final number X goes to the far end as Harm. If X exceeds
  the far end's total HP, the far end dies, the link ends and the excess
  returns to the near end as Harm.
- Harm that arrived through a link is never redirected again by any link.
  This is the loop guard: one hit travels at most one link and back.
- Other link kinds (shared healing, swap places, share a modifier) are
  content and use the same record.

### 1.5 Ground

Each hex holds at most one **feature**.

| Field     | Meaning                                                                            |
| --------- | ---------------------------------------------------------------------------------- |
| `kind`    | Content: rock, fire, ice, brambles, corpse, bones, wreck, sweets, ...              |
| `class`   | `blocking` (nothing enters; the MVP's obstacles), `hazard`, `surface` or `remains` |
| `school`  | A school or `null`                                                                 |
| `size`    | One integer (Harm on entry, Defense bonus, ...), 0 if unused                       |
| `clock`   | Rounds left or `null`; ticks with condition clocks                                 |
| `remains` | For remains: the dead stack's creature, owner and `initialCount`                   |

- Stacks may stand on and move through any feature that is not blocking.
- A **hazard** acts on a stack when it enters the hex (each hex of a path,
  in order) and at its turn start if it stands there.
- Placing a feature on a hex that has one replaces it, except that a
  blocking feature is never replaced or removed by a rule that does not
  name blocking features.
- **Death leaves ground.** When a stack that is not `summoned` dies, its
  hex receives the remains named by its tags, replacing any non-blocking
  feature. Tag `nothing` and summoned stacks leave the hex as it was.
- **Using remains** consumes the feature. A rule that uses remains states
  whose remains qualify (requirement, law 3); the engine supplies the
  recorded owner so "of a stack you owned" can be tested.

### 1.6 The timeline

The timeline is the visible order of everything that will happen this
round: stack turns and scheduled events.

**A round, exactly:**

1. **Round start.** Increase the round number. Clear per-round flags
   (retaliated, waited, extra turn taken; "defending" clears at the
   stack's own next turn start, as in the MVP). Each hero regains its cast
   for the round. Fire scheduled events due at this round start, in order
   of creation. Then build the queue.
2. **Queue.** Living stacks sorted by timeline class (Hastened, then
   normal, then Delayed), then effective Speed descending, then attacker's
   owner first, then field order. The queue is built once; a Speed change
   during the round does not reorder it. Gaining or losing Delayed or
   Hastened during the round moves a stack that has not yet acted to the
   back or the front of the queue.
3. **Turns.** For the next stack in the queue, or when the queue is empty
   the next waiting stack (slowest first, as in the MVP):
   1. Turn start, once per round per stack: ground under the stack, then
      its conditions' turn-start hooks in list order, then its abilities'.
   2. If it now bears Frozen or Asleep, the turn is skipped.
   3. The hero of its side may cast, use the Command and use item acts
      (1.7), in any order, before the stack acts.
   4. The stack acts. Reactions resolve (1.10).
   5. If it was granted an extra turn, that turn follows at once, starting
      at step 3.
4. **Round end.** Scheduled events due at round end fire in order of
   creation. Conditions' round-end hooks fire in field order, list order.
   Then every clock ticks: conditions in field order and list order, then
   ground row by row. Expiries fire as they are reached. Then each Wary
   counter drops by 1.
5. The battle-end test (1.12) runs after every resolved step, not only at
   round end.

**Timeline verbs.**

| Verb       | Rule                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delay      | Put the condition Delayed on a stack. While it lasts the stack acts after every stack that is not Delayed, waiting stacks included, and cannot Wait. Delayed is not a Hold                                           |
| Hasten     | Put Hastened on a stack: it acts before every stack that is not Hastened                                                                                                                                             |
| Extra turn | The stack takes another turn immediately after its current one. **At most one extra turn per stack per round**, from all sources. It does not repeat turn-start effects or restore retaliation                       |
| Schedule   | Create a visible event: `{ due: round start or round end of round n, effect, source, side }`. The effect is any list of verbs. It is drawn on the timeline bar from the moment it is made. At most 12 may be pending |
| Cancel     | Remove a scheduled event (only by a rule that says so)                                                                                                                                                               |

Wait and Defend are unchanged from the MVP.

### 1.7 Verbs and actions

**Verbs.** Every rule's effect is a list of these:

| Verb             | Rule                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strike           | An attack by a stack (1.8)                                                                                                                                                                                                                                         |
| Harm             | A plain number of damage (1.8)                                                                                                                                                                                                                                     |
| Heal             | Restore X HP: first the top creature to full; then, only if the rule says "revives", dead creatures, one per full creature HP and a last partial one, never above `initialCount`. A healed stack that is not summoned keeps the creatures after the battle         |
| Move             | Walk (the MVP move), **push** or **pull** n hexes in a straight hex line away from or toward a named hex (stops before a blocking feature, a stack or the edge; hazards on the way apply), **teleport** to a free hex, or **swap** two stacks' hexes               |
| Add condition    | With the landing rules of 1.3                                                                                                                                                                                                                                      |
| End condition    | Remove it; no expiry rule fires                                                                                                                                                                                                                                    |
| Change condition | Move, copy, feed (grow its size), wind (change its clock) or set off. Section 2.7 gives the five standard tools; any rule may use these operations                                                                                                                 |
| Add / end ground | 1.5                                                                                                                                                                                                                                                                |
| Summon           | Create a stack with `summoned` true on a free hex, owned by the side the summoner fights for at that moment. It joins the end of this round's queue. It leaves no ground, gives no XP and is removed when the battle ends. **Raise** is a summon that uses remains |
| Timeline         | 1.6                                                                                                                                                                                                                                                                |

Passive rules (modifiers and auras) use the modifier hook of 1.3 and the
existing `ABILITY_HOOKS` shape.

**Actions.** One decision by a player or the AI:

| Action                                     | Who and when                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move, move and attack, shoot, wait, defend | The active stack, as in the MVP                                                                                                                                                     |
| Ability                                    | The active stack uses an activated ability instead of attacking; it may move first if the ability says so. Each activated ability is once per battle unless its text says otherwise |
| Creature cast                              | The active stack casts one of its pages (2.6) as its action                                                                                                                         |
| Hero cast                                  | The hero of the active stack's side, before the stack acts. One per round (2.4)                                                                                                     |
| Command                                    | The same hero, before the stack acts. Once per battle (3.7). Does not use the cast                                                                                                  |
| Item act                                   | The same hero, before the stack acts: an artifact's once-per-battle act (4.6). Does not use the cast                                                                                |
| Retreat                                    | The same hero, before the stack acts (1.12)                                                                                                                                         |

A side with no hero (neutral guards, a garrison alone) has only stack
actions.

### 1.8 Strike and Harm

There are two kinds of damage and nothing converts one into the other
except a redirect link.

**Strike.** A melee attack, a shot, a retaliation, or any attack an ability
or scheduled event describes as a Strike by a stack (a delayed shell, a
nip). It uses GAME_DESIGN 9.4 exactly, with two additions:

```text
A, D, M as in GAME_DESIGN 9.4 (M from 3/10 to 4, exact)
P = product of all percentage multipliers on this Strike, exact
P = min(4, max(1/4, P))
damage = max(1, floor(count x Dmg x M x P x (1/2 if ranged in melee)))
```

- Flat Attack and Defense modifiers from every source add; contributions
  that share a `stackKey` do not stack (the largest counts), as today.
- Only a Strike triggers "on strike" and "on being struck" rules and
  retaliation. A retaliation never causes a retaliation.
- A Strike described by a rule states its kind (`melee`, `shot`,
  `retaliation` or `special`) and whether it can be retaliated; `special`
  Strikes are not retaliated unless the rule says so.

**Harm.** A plain number: spell damage, Burning, a hazard, a debt, damage
carried by a link.

```text
harm = floor(X x Q)      Q = product of "Harm taken" percentages on the target,
                         and x 2 if the source spell was Fuelled; min 1/4, max 4
```

- Harm ignores Attack, Defense, M, Defend and every Strike multiplier, and
  triggers nothing except death rules and redirect links.
- X may be a constant, or scale with the caster's Power, a stack's count,
  a condition's size, or damage already dealt in this action. **X never
  reads any stack's hit points**, maximum or current. Content that breaks
  this is rejected.
- Harm of 0 is legal and does nothing.

Both kinds remove creatures by the kill rule of GAME_DESIGN 9.5.

### 1.9 Holds and Wary

A **Hold** is a condition whose kind is marked `hold`: Frozen, Asleep and
Turned, plus any content kind that stops a stack acting or takes its
loyalty (it must be marked).

| Rule                | Exact form                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Length              | A Hold's clock is at most 2 when it lands. A longer one lands as 2                                                                                                                    |
| One at a time       | A stack bearing a Hold refuses any other Hold                                                                                                                                         |
| Never prolonged     | A Hold cannot be copied, fed, Echoed, doubled, or have its clock increased by any rule                                                                                                |
| What is allowed     | It can be moved (the clock keeps its value; the gate is tested on the receiver), wound forward (shortened), ended, set off or burnt as Fuel                                           |
| Wary                | When a Hold leaves a stack for any reason, the stack becomes Wary for as many rounds as it was held (round ends passed while bearing it, at least 1). A Wary stack refuses every Hold |
| Wary is not a thing | Wary is a counter, not a condition: it cannot be moved, ended or shortened and does not count toward six                                                                              |
| Turned              | Turning a Turned stack is refused (one at a time). A birthright may bend the length and Wary rules for Turned only, never for a Hold that stops a stack acting                        |

So no stack is stopped for more than two rounds in four.

### 1.10 Reactions

A **reaction** is a rule that fires because something happened: on strike,
on being struck (retaliation is one), on death, on a condition landing, on
ground used.

After each action, scheduled event or turn-start step, pending reactions
resolve one at a time in this order:

1. Those of the acting stack (abilities in listed order, then conditions
   in list order).
2. Those of the target. With several targets, targets in timeline order.
   For a Strike: on-being-struck rules first, then retaliation.
3. Those of every other stack, in timeline order.
4. Those of the heroes (artifacts in slot order, then feats, then skills):
   the attacker's hero, then the defender's.

Rules:

- Each reaction (one rule on one stack or hero) fires **at most once per
  action**, however many times its trigger occurs.
- A reaction may trigger others; they join the end of the queue and obey
  the once-per-action rule.
- A stack that dies is removed at once: its remains are placed, its
  conditions end, links naming it end, and its on-death reactions join the
  queue. A dead stack's other pending reactions are dropped.
- Area effects apply to their targets in timeline order, each target fully
  resolved before the next.
- **Hard stop:** a chain is cut after 64 steps and the engine reports a
  content error. With once-per-action this cannot be reached by legal
  content; the limit exists so a mistake cannot hang the game.

A melee attack therefore runs: walk (hazards) → the Strike → the
attacker's on-strike rules → the target's on-being-struck rules → the
target's retaliation with its own on-strike rules → everyone else's.

### 1.11 Caps

| Thing                                            | Cap                                                      |
| ------------------------------------------------ | -------------------------------------------------------- |
| Attack/Defense multiplier M                      | 3/10 to 4                                                |
| Product of percentage multipliers, Strike        | 1/4 to 4 (so one Strike is at most 16 x count x Dmg)     |
| Harm multipliers                                 | 1/4 to 4                                                 |
| Conditions per stack                             | 6                                                        |
| Condition size                                   | `maxSize` (3 x the size at creation by default)          |
| Condition clock                                  | 9; Holds 2                                               |
| Features per hex                                 | 1                                                        |
| Links per stack as near end                      | 1 of each kind                                           |
| Living stacks per side                           | 10                                                       |
| Extra turns                                      | 1 per stack per round                                    |
| Hero casts                                       | 1 per round; 2 with a rule that says so; never more      |
| Fuel                                             | 1 per battle; up to 3 with rules that say so; never more |
| Command                                          | 1 per battle                                             |
| Each page, each activated ability, each item act | 1 per battle unless a rule says otherwise                |
| Effective Speed                                  | 1 to 12                                                  |
| Effective Power                                  | 0 to 30                                                  |
| Scheduled events pending                         | 12                                                       |
| Reaction chain                                   | 64 steps                                                 |
| Battle length                                    | 30 rounds                                                |
| Army Morale and Luck                             | -3 to +3                                                 |

The MVP's ability caps (Mob +5, Pack Hunter x 2.0, Charge x 1.75) remain as
written.

**Forbidden to content:** an effect that can repeat without consuming
something finite (mana, a page, ground, creatures, a once-per-battle use,
rounds); a refund of a cost in full; hidden state; anything the rehearsal
cannot show; a keyword whose rule is longer than one sentence.

### 1.12 The end of a battle

- A side **loses** when it owns no living stack that is not summoned and
  has no scheduled event that will return one of its stacks. Ownership
  counts, not the current side: a Turned stack still belongs to its owner.
- If both sides lose in the same step, the defender wins.
- **Round limit.** If nobody has lost at the end of round 30, the defender
  wins and the attacker is treated as defeated. (The MVP's 100-round limit
  with no winner is replaced.)
- **Retreat.** A hero may retreat on a friendly stack's turn unless the
  hero is defending inside a town or the hero's player owns no town. The
  battle ends as a loss; the army is lost; XP earned so far by the other
  side is kept; the hero keeps its artifacts and goes to its owner's
  tavern (5.4). There is no surrender in v0.2.
- **After the battle.** Summoned stacks vanish. Conditions, ground and
  clocks are discarded. Pages, Fuel, the Command and once-per-battle uses
  are restored; mana spent stays spent. Survivors keep their losses and
  the top creature heals, as in the MVP. A stack that returned from its
  remains by a birthright crumbles. If this would leave the winner with
  no creatures, the weakest of its stacks that would crumble survives
  with 1 creature.
- **XP** to the winning hero: the total HP of enemy creatures killed,
  counting only non-summoned stacks (GAME_DESIGN 6.1). A hero defeated by
  a hero loses its artifacts to the winner (4.4).
- **Battleground.** The terrain, obstacle seed and any local law come
  from the cell the defender stands on. v0.2 ships no local laws; the
  setup carries an empty list so later maps can add them.

### 1.13 Rehearsal, intents and take-back

**Rehearsal.** `rehearse(state, action)` runs the real engine on a copy
and returns:

| Output    | Content                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal`   | True, or a refusal with a reason code, the rule that refused and its numbers                                                                                                                                                                                                                                                                                                                         |
| `steps`   | The ordered chain. Each step has: its index; `cause` (the index of the step that triggered it, or the action); the rule that produced it (ability, condition, artifact, spell or engine rule id); the verb; the stacks or hexes involved; the numbers (a full damage breakdown for a Strike, X and Q for Harm); and the result (count and top HP after, condition or ground added, ended or refused) |
| `after`   | The resulting state                                                                                                                                                                                                                                                                                                                                                                                  |
| `summary` | Per stack touched: HP lost, creatures killed, conditions gained and lost                                                                                                                                                                                                                                                                                                                             |

The steps are the same events the engine emits when the action is really
applied, so the preview and the animation cannot disagree. Every engine
event must therefore carry its cause and its numbers. The interface shows
the chain as one line per step ("Trolls strike Triceratops 140 → link →
Ogres take 140 → 1 Ogre dies"), with Echo and Fuel choices as toggles that
re-run the rehearsal.

**Enemy intents.** For every enemy stack still to act this round, the
interface shows what the stack AI would do if its turn came now on the
current board: the action, its target and the rehearsed numbers. Intents
are recomputed after every step.

- Against **guards and garrisons without a hero** intents are exact: the AI
  is a pure function of the state, so if the board does not change, the
  stack does what was shown.
- Against an **enemy hero**, stack intents are shown the same way, and the
  hero's possible cast is shown only as "may cast" with its remaining mana
  and unspent pages. AI heroes may use Echo and Fuel.

**Take-back and the plan line.**

- The player may take back their own actions, newest first, back to the
  last point at which an opponent made a decision the player could not
  have known (an enemy hero's cast, Command, item act or retreat, or any
  action of a stack led by an enemy hero). Against guards nothing is ever
  unknown, so the player may take back to the start of the current round.
  Take-back never crosses a round start.
- **Plan line:** the player may queue actions for their coming turns this
  round. `rehearsePlan(state, actions)` applies them in order, filling
  enemy turns in between with their intents, and returns the combined
  chain. Against an enemy hero the plan stops at the first enemy turn.
  Committing applies the queue one action at a time.
- **Quick battle** runs the stack AI for both sides and shows the exact
  result before the player accepts it or fights by hand. Replaying a
  hand-made opening in quick battle (concept section 10, decision 3) is
  deferred; it needs no rule change.

## 2. Magic

### 2.1 The wheel

Order around the wheel: Bloom, Accord, Clock, Hush, Storm, and back to
Bloom. Neighbours are allied; the other two are opposed.

| School | Allied        | Opposed       | Owns                                             |
| ------ | ------------- | ------------- | ------------------------------------------------ |
| Bloom  | Storm, Accord | Clock, Hush   | Healing, summoning, effects that grow each round |
| Accord | Bloom, Clock  | Hush, Storm   | Links, Turned, guarding, swaps                   |
| Clock  | Accord, Hush  | Storm, Bloom  | Turn order, extra and delayed turns, clocks      |
| Hush   | Clock, Storm  | Bloom, Accord | Remains, drain, debts, switching abilities off   |
| Storm  | Hush, Bloom   | Accord, Clock | Area Harm, fire, cold, pushing                   |

A school is neither allied nor opposed to itself.

### 2.2 Spells, tiers and school skills

A **spell** has: a school, a tier 1 to 5, a mana cost, a target rule, a
list of verbs, one number marked as its **size** (or none), and whether it
is a battle spell or an adventure spell. A hero **knows** a spell or does
not; a known spell is a **page** in the hero's book. Every hero has a book.

Each school has a skill with three ranks (3.4). The rank decides what the
hero can learn and adds to Power for that school's pages.

| School rank | Can learn     | Power bonus for that school's pages |
| ----------: | ------------- | ----------------------------------: |
|           0 | Nothing       |                                   - |
|           1 | Tiers 1 and 2 |                                  +0 |
|           2 | Tiers 1 to 4  |                                  +2 |
|           3 | Tiers 1 to 5  |                                  +4 |

- Learning needs the rank at the moment of learning. A learnt page is kept
  if the rank is later lost.
- A hero who meets a spell it cannot learn gets nothing from a guild and a
  **scroll** from a shrine or other map site (2.5). A hero can return to a
  guild after gaining the rank.

### 2.3 Mana

| Rule            | Value                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Maximum mana    | 10 x Lore, then skill and artifact modifiers (percentages first, then flat)                                    |
| Start           | A new or hired hero has full mana                                                                              |
| Daily return    | At the start of each day: 1 + floor(Lore / 3), plus modifiers, up to the maximum                               |
| In a guild town | A hero that starts the day in a town of its own player with a Magic Guild of level 1 or more has full mana     |
| Above maximum   | Map sites may raise mana above the maximum once; it does not regenerate while above                            |
| Cost by tier    | Tier 1: 4. Tier 2: 7. Tier 3: 10. Tier 4: 14. Tier 5: 20. A spell may list its own cost within 2 of its tier's |
| Cost modifiers  | Percentages (skills, artifacts) apply to the listed cost, rounded up, minimum 1                                |

Mana is an expedition budget: nothing returns mana during a battle except
a rule that consumes something finite, and never the full cost of the page
that triggered it.

### 2.4 Casting in battle

- A hero casts **one page or scroll per round**, before a stack of its
  side acts (1.6). The hero is not on the field and cannot be targeted.
  The spell may target anywhere on the field within its own target rule.
- The cast costs the page's mana. A hero without enough mana cannot cast
  it.
- **A page is spent when cast and stays spent until the battle ends.**
  This holds even if every target refuses the effect.
- A spell **touches** every stack it chooses and every stack caught in its
  area. A condition tool touches both the stack the condition leaves and
  the stack it reaches. A spell aimed only at ground touches no stack.
- **Effective Power** of a hero's page = hero Power + the school rank bonus
  (2.2) + modifiers, from 0 to 30.

**How Power scales a spell.** Every scaling number of a spell has the form
`base + per x P`, with P the effective Power. Clocks never scale with
Power: a spell's clock is a fixed number, 3 unless stated. Content sets
`base` and `per`; these budgets are the reference point for the content
bead, which may move a spell up to a quarter either way for what else it
does:

| Tier | Harm, one stack | Harm, area (each) | Heal      | Summon (HP worth) | Hold gate (HP) |
| ---: | --------------- | ----------------- | --------- | ----------------- | -------------- |
|    1 | 20 + 10 P       | 12 + 6 P          | 20 + 10 P | -                 | -              |
|    2 | 30 + 15 P       | 18 + 9 P          | 30 + 15 P | 30 + 15 P         | 60 + 20 P      |
|    3 | 45 + 20 P       | 27 + 12 P         | 45 + 20 P | 45 + 20 P         | 90 + 30 P      |
|    4 | 60 + 25 P       | 36 + 15 P         | 60 + 25 P | 60 + 25 P         | 120 + 40 P     |
|    5 | 90 + 35 P       | 54 + 21 P         | 90 + 35 P | 90 + 35 P         | 180 + 60 P     |

A summon of budget B creates max(1, floor(B / creature HP)) creatures.
Flat stat conditions are sized in points, not by Power: tier 1 gives 2,
tier 2 gives 3, tier 3 gives 4, tier 4 gives 5, tier 5 gives 6 (Attack,
Defense or Speed; Speed at half, rounded down, minimum 1).

**Echo** (allied schools, free).

- When a hero casts a page or scroll, the hero may choose one condition on
  a stack the spell touches whose school is **allied** to the spell's
  school. Its clock increases by 1, up to 9.
- Not available on Holds or clockless conditions. At most one Echo per
  cast. No skill is needed.

**Fuel** (opposed schools, once per battle).

- When a hero casts a page or scroll that has a size, the hero may choose
  one condition on a stack the spell touches whose school is **opposed**
  to the spell's school. The condition ends (no expiry rule; a Hold
  leaving this way makes its bearer Wary) and the spell's **size is
  doubled**.
- The size is the one number the spell marks: its Harm, its heal, its
  summon budget, the size of the condition it makes, or, for a spell whose
  main effect is a gated condition with no size, its gate. Fuel never
  doubles a clock, an area, a number of targets or a second number.
  A spell with no marked size cannot be Fuelled.
- Each hero may Fuel once per battle (1.11 for the ceiling).
- Any condition qualifies: on friend or foe, boon or bane, made by anyone.

Echo and Fuel are chosen with the cast and resolve before the spell, in
that order, using conditions already on the board. One cast may use both.
Creature casters use neither.

### 2.5 Scrolls

- A scroll is a single spell on paper. It is held in the hero's **scroll
  case**, capacity 8, separate from the backpack. Scrolls can be handed
  between a player's heroes when they meet (5.3) and sold or bought at
  sites (content).
- Any hero may cast any scroll, with no school rank. It uses the hero's
  cast for the round and costs **no mana**. The scroll is destroyed.
- Effective Power for a scroll is the hero's Power with no school bonus,
  but at least 2.
- The hero may Echo and Fuel with a scroll.
- Adventure spells exist as scrolls too (2.8), used from the map.
- Condition tools exist as scrolls.

### 2.6 Creature casters

A creature may list up to two pages. On its turn the stack may cast one as
its action.

- No mana. Each listed page is spent for that stack once cast, until the
  battle ends.
- Effective Power = `castPower + floor(count / castDivisor)`, capped at
  `castCap`; all three are creature data. The count is read at the cast.
- No Echo, no Fuel, and it does not use the hero's cast.
- The conditions it makes are ordinary conditions with the spell's school.

A creature's own ability is not a spell: page-related rules (spent pages,
"when you cast") do not see it. The conditions and ground it makes still
have schools and can be Echoed or burnt by a hero's cast.

### 2.7 The five condition tools

Each school has one **tool**, a tier 2 battle spell with no size (so it
cannot be Fuelled). They are in every game's spell pool. They work on
conditions of every school.

| Tool    | School | Exact rule                                                                                                                                          |
| ------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feed    | Bloom  | Choose a condition with size above 0. Its size increases by half, rounded up, to at most its `maxSize`. Not Holds                                   |
| Share   | Accord | Choose a link and one other condition on either of its ends. The other end receives a copy (landing rules apply). Not Holds, not links              |
| Wind    | Clock  | Choose a condition with a clock. Add 2 to it (to at most 9) or subtract 2. At 0 it expires now, firing its expiry rule. Holds can only be shortened |
| Pass on | Hush   | Choose a bane and a stack adjacent to its bearer. The bane moves to that stack (landing rules apply; if refused it stays where it was)              |
| Set off | Storm  | Choose a condition. It ends, and its bearer takes Harm = charge x rounds left, where clockless counts as 3 and rounds left are counted to at most 3 |

**Charge.** A condition whose kind deals Harm each round has charge = its
size. A debt (a kind whose size is an amount owed) has charge = its whole
size and counts one round. Every other condition has charge = 10 x the
tier of what made it (spell tier; creature tier; artifacts count as tier 1
for Trinkets, 3 for Wonders, 5 for Marvels).

Creature abilities and artifacts may perform the same operations (a
Bellhop moves a condition); the rules above apply to the operation whoever
performs it.

### 2.8 Adventure spells

Adventure spells are cast from the adventure map on the player's own turn.

- They need the school rank for their tier and cost mana as in 2.3. Some
  also cost movement points.
- Each adventure spell may be cast **once per day per hero**. There are no
  pages on the map.
- Each has one number that scales as `base + per x Power` using the same
  effective Power as battle pages.

The reference set, one per school (content may add more):

| Spell        | School | Tier | Exact rule                                                                                                                                                                   |
| ------------ | ------ | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Green Road   | Bloom  |    2 | Until the day ends this hero may enter forest cells at a move cost of 200. A hero standing in forest when the day ends is moved back to the last non-forest cell of its path |
| Parley       | Accord |    3 | Target a neutral stack adjacent to the hero whose stack FV is at most 300 + 150 x P. Until the day ends it has no zone of control against this player                        |
| Borrowed Day | Clock  |    3 | The hero gains 300 + 50 x P movement points now, at most 1000. At the start of the next day it has that many fewer                                                           |
| Ask the Dead | Hush   |    1 | Reveal the cells in a disc of radius 4 + floor(P / 2) around any explored cell within 15 cells of the hero                                                                   |
| Tow Line     | Storm  |    4 | The hero moves from a pylon it stands on to any pylon its player has visited. Costs all remaining movement points; needs at least 300                                        |

### 2.9 Magic guilds

A town's **Magic Guild** has levels 1 to 5, built in order. A faction may
cap its guild below 5 (set in faction data, with building costs).

| Guild level | Spells offered | Tier |
| ----------: | -------------: | ---: |
|           1 |              4 |    1 |
|           2 |              3 |    2 |
|           3 |              3 |    3 |
|           4 |              2 |    4 |
|           5 |              1 |    5 |

- The spells of all five levels of every town are drawn when the map is
  created, seeded per town, without replacement within a town, and are
  visible on the town screen before building.
- Drawing is weighted by the faction's school weights (faction data, 0 to
  4 per school; at least two schools above 0).
- Guarantees: level 1 has at least one spell of the faction's heaviest
  school; level 2 of every town has exactly one condition tool, of a
  school the faction weights above 0.
- A hero in a town of its own player learns, at once and free, every
  guild spell it is able to learn (on entering, when a level is built
  while it is there, and at the start of each day).
- Adventure spells are in the same pool and are drawn the same way.

Shrines and other teaching sites are content: each teaches one fixed,
visible spell to every visiting hero once, as a page if the hero can learn
it and otherwise as a scroll.

## 3. Heroes

### 3.1 Primary stats

| Stat    | Exact effect                                                                            |
| ------- | --------------------------------------------------------------------------------------- |
| Attack  | Added to the Attack of every stack fighting for the hero's side (GAME_DESIGN 9.4)       |
| Defense | Added to the Defense of every stack fighting for the hero's side                        |
| Power   | The P in every `base + per x P` of the hero's pages, scrolls and adventure spells (2.4) |
| Lore    | Maximum mana = 10 x Lore; daily mana return = 1 + floor(Lore / 3) (2.3)                 |

Stats are integers from 0 to 40 after all modifiers. A class's starting
stats sum to 6, with Power and Lore each at least 1.

### 3.2 Experience and levels

The XP table of GAME_DESIGN 6.1 is kept (level 2 at 1000, level 13 at
24320, then x 1.2 rounded down). There is no level cap. XP comes from
battles (1.12), chests and content sites. XP modifiers from skills are
percentages applied to each gain, floored.

### 3.3 Gaining a level

For each level gained, in order:

1. **Stat.** The hero gains +1 in the stat given by the class's **stat
   pattern**, a fixed list of ten stats. Reaching level L uses entry
   (L - 2) mod 10. A might class's pattern has seven Attack or Defense
   entries; a magic class's has seven Power or Lore entries; every pattern
   has all four stats at least once.
2. **Skill offer.** The player picks one of three offers (below).
3. **Feat.** If L is a multiple of 3, the player then picks one of three
   feats (3.5).

Pending choices are made one at a time in level order, as in the MVP.

**The three skill offers** are drawn with a seed derived from the game
seed, the hero id and the level, so they are fixed for that hero and
level.

- An offer is either **a new skill at rank 1** (only while the hero has
  fewer than six skills) or **+1 rank in a held skill** below rank 3.
- **Offer 1 (the guarantee)** is always +1 rank in a held skill, if any
  held skill is below rank 3.
- **Offers 2 and 3** are drawn without replacement from every remaining
  eligible offer.
- **Weights.** The weight of a skill is its class weight (class data, 0 to 10) times a wheel factor. For a school skill the wheel factor is 4 if
  the school is allied to a school the hero already holds, 1 if it is
  opposed to one (opposed wins when both apply), and 2 otherwise. For
  every other skill it is 2. An upgrade offer uses the same weight as the
  skill. Skills barred by a vow have weight 0.
- If fewer than three offers exist, the rest are **stat offers**: +1 to a
  primary stat, different stats in the order of the class pattern starting
  after this level's entry.

### 3.4 Skills

- A hero holds at most **six** skills, each at rank 1, 2 or 3. A skill is
  never lost except at a site that says so.
- A class starts with two skills at rank 1 (class data).
- The pool is about 24 skills in three families. The list is content;
  each skill must be written in this document's terms.

| Family  | Count | What its rules may touch                                                                                                                       |
| ------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| School  |     5 | One per school: learnable tiers and Power bonus, exactly as 2.2. Nothing else                                                                  |
| Army    |  9-10 | Battle grammar: stack modifiers, aura reach, retaliation, shots, deployment, Morale and Luck (6), Command strength, start-of-battle conditions |
| Journey |  9-10 | Movement, sight, mana and its return, XP, income, hiring, guard parley, scroll and artifact handling, adventure spells                         |

Rank budgets, so skills are comparable: a percentage skill gives 10, 20
and 30 percent at ranks 1 to 3; a flat stat skill gives +1, +2 and +3; a
"once per battle" skill gains one clause per rank rather than more uses.

### 3.5 Feats and vows

- At every level that is a multiple of 3 the hero drafts **one of three
  feats**, drawn seeded as in 3.3 from the feats the hero does not have
  and is eligible for.
- A feat is one rule in one sentence. It is permanent and takes no slot.
- **Weights.** A feat lists up to three skills as tags. Its weight is
  1 + 2 x (the sum of the hero's ranks in those skills).
- A **vow** is a feat with a restriction clause. Restrictions come from a
  fixed list the engine enforces: a school that can never be cast (pages
  and scrolls alike); a maximum rank for one or all school skills; rounds
  in which the hero cannot cast; a creature tag the army may not contain;
  an artifact slot that must stay empty.
- A vow is only offered if the hero already satisfies its restriction (no
  rank above the maximum, no barred item worn). After that the
  restriction is enforced: barred skills have weight 0 in offers, barred
  pages are greyed, barred items cannot be worn.
- At least one of the three feats offered is not a vow, when a non-vow
  feat is eligible.

### 3.6 Classes

Each faction has two classes, one leaning to might and one to magic. Class
data:

| Field           | Meaning                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| Faction         | Decides which creatures are native and which birthright applies (3.8)                         |
| Starting stats  | Sum 6 (3.1)                                                                                   |
| Stat pattern    | Ten entries (3.3)                                                                             |
| Skill weights   | 0 to 10 per skill; 0 means never offered                                                      |
| Starting skills | Two, at rank 1. A magic class starts with one school skill and one tier 1 page of that school |
| Command         | 3.7                                                                                           |
| Native terrain  | That terrain costs this class's heroes 100 per straight step                                  |
| Starting army   | For the first hero and for hired heroes (5.4)                                                 |

### 3.7 Commands and specialties

**Command.** Each class has one Command: an act that is not a spell.

- Used before a friendly stack acts, once per battle. It does not use the
  round's cast and costs no mana.
- It has no school and no page: Echo, Fuel, spent-page rules and vows
  about casting do not apply to it. Conditions it makes have a school
  like any other.
- It scales with hero level through **C = 1 + floor(level / 5)** (1 at
  levels 1 to 4, 2 at 5 to 9, and so on). The Command's text uses C for
  one number (stacks affected, hexes, points of a modifier, rounds of a
  clock up to 3).
- Its effect is built from the verbs of 1.7. The concept's Stampede is
  the model: "choose an enemy stack; up to C + 1 friendly stacks adjacent
  to it each make a melee Strike against it, in timeline order; it
  retaliates once".

**Specialty.** Each named hero has one specialty, one sentence, of one of
these forms (numbers fixed here so heroes are comparable):

| Form     | Rule                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Creature | Stacks of one named creature in this hero's army get +1 Attack and +1 Defense, plus 1 more per 5 hero levels, and +1 Speed     |
| Spell    | The hero starts with one named page of tier 1 or 2 and casts it at +2 Power, plus 1 more per 5 levels                          |
| Skill    | The hero starts with one named skill at rank 2 instead of one of the class's starting skills                                   |
| Resource | While the hero is on the map its player gains one of: 250 gold each day; 1 wood and 1 ore each day; 1 essence every second day |
| Command  | The hero's Command counts C one higher                                                                                         |

### 3.8 Natives, guests and birthrights

- A creature is **native** to an army when its faction is the faction of
  the army's hero's class. In a garrison with no hero, the faction is the
  town's.
- Any other creature is a **guest**. Guests fight at full strength with
  no penalty of any kind; supply is the only limit (towns grow natives,
  map dwellings and hired strays are few).
- A **birthright** is one rule belonging to a faction. It applies to
  stacks whose `native` flag is true, wherever they currently fight
  (bound by identity, law 4). Neutral guards have no birthright.
- A birthright must be visible on the board within a round, is written
  with the verbs of 1.7, and may bend **one** numbered rule of this
  document, which its text must name. It may not bend the Hold rules for
  Frozen or Asleep, the caps on casts, Fuel, extra turns or multipliers,
  the Harm rule, or the battle-end rules.

The engine therefore offers birthrights these attachment points, which
cover the three v0.2 factions' candidates in the concept:

| Attachment                  | Example it must support                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| At deployment               | Natives start linked in pairs, or start with a condition (the Vowed's sworn pairs; a human faction's formation)                                                                                                                                                                                                                |
| On a native's death         | Schedule its return at the next round start (the Restless): the stack keeps its id, reappears on its remains with a count the rule gives, and is flagged to crumble (1.12). If its remains were used or replaced, it does not return. If a stack stands on them, it appears on the nearest free hex. Once per stack per battle |
| On Harm from its own side   | A native caught in an area effect of the side it fights for takes 0 from it and is pushed 3 hexes away from the effect's centre (the Goblins' Launched)                                                                                                                                                                        |
| On a native's Strike        | An added Strike or modifier that reads adjacency (the Lost World's Pack). An added Strike is kind `special`, is not retaliated and fires once per action                                                                                                                                                                       |
| On a native's action choice | A replacement action available only to natives                                                                                                                                                                                                                                                                                 |

### 3.9 Movement, sight and the army

**Movement points per day**, computed at the start of the day and fixed
for that day:

```text
base  = 1300 + 50 x clamp(slowest creature Speed in the army, 2, 8)
mp    = floor(base x (100 + sum of percentage modifiers) / 100) + flat modifiers
mp    = min(3000, mp), minus any Borrowed Day debt
```

An army whose slowest creature has Speed 4 gets the MVP's 1500. Step costs
are GAME_DESIGN 7.1. Modifiers:

| Modifier                 | Rule                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Native terrain           | The class's native terrain costs 100 per straight step (replaces the MVP's Jungle note) |
| Terrain skills and items | May lower one terrain's cost toward 100, never below; roads stay 75                     |
| Percentage modifiers     | Skills 10, 20, 30 percent; artifacts 5 to 15 percent each                               |
| Flat modifiers           | Artifacts and one-day map sites, +100 to +400                                           |
| Hired or newly arrived   | A hero has full movement on the day it is hired                                         |

**Sight.** A hero sees a disc of radius 6, a town radius 5, by the disc
rule of GAME_DESIGN 7.3. Skills add 1 per rank, artifacts 1 or 2; the
maximum is 12.

**Army.** Seven slots. A hero's army always holds at least one creature.
The same creature may occupy several slots (splitting is allowed; merging
is the player's choice). A garrison has seven slots and may be empty.

## 4. Artifacts

### 4.1 Slots

| Slot                               | Count |
| ---------------------------------- | ----: |
| Head                               |     1 |
| Neck                               |     1 |
| Torso                              |     1 |
| Cloak                              |     1 |
| Weapon                             |     1 |
| Shield                             |     1 |
| Ring                               |     2 |
| Feet                               |     1 |
| Pocket (anything that is not worn) |     2 |
| **Worn total**                     |    11 |
| Backpack (no effect while in it)   |    12 |
| Scroll case (2.5)                  |     8 |

- Each artifact names its one slot kind.
- Only a worn artifact has any effect.
- Wearing, removing and swapping are free and done on the adventure map,
  never during a battle.
- A hero with a full backpack cannot take another artifact; it stays on
  the map. An artifact may be destroyed from the backpack at any time.
- A hero may wear **at most one Marvel**. Marvel pieces are not Marvels.

### 4.2 Grades

| Grade   | What its rules may be                                                                                                                | Value (for guards, trade and the AI) |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | -----------------------------------: |
| Trinket | Stat modifiers only (4.6, form 1): at most 3 points of primary stats in total, or one 5 to 15 percent modifier, or +1 Morale or Luck |                                 2000 |
| Wonder  | Makes or uses a condition or ground, or joins two with a trigger (forms 2 to 4)                                                      |                                 5000 |
| Marvel  | One rule switch (form 5) in one sentence, plus optional Wonder-level rules                                                           |                                20000 |

A Marvel piece is a Wonder by grade and value 6000. Value sizes an
artifact's guard (set by the maps bead from GAME_DESIGN 8.3) and its price
where it can be traded: sites sell at value and buy at half.

### 4.3 Cursed artifacts

- A cursed artifact is marked cursed everywhere it is shown, on the map
  before pickup included. Its drawback is part of its visible text and is
  written in the grammar, normally as a condition placed at the start of
  battle.
- Picking one up puts it in the backpack. Wearing it is the player's
  choice.
- Once worn, a cursed artifact **cannot be removed, swapped, handed over
  or destroyed** by its hero.
- It is lifted in three ways: at a map site that lifts curses (content; a
  cost of 1000 gold and 2 essence is the default); in a town of the
  hero's player with a Magic Guild of level 3 or more, for 2000 gold; or
  when the hero is defeated in any way (4.4). Lifting moves the artifact to the
  backpack, or to the hero's cell on the map if the backpack is full. It
  is still cursed and can be worn again.

### 4.4 Winning and losing artifacts

| Event                                       | What happens to the loser's artifacts                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Defeated by a hero                          | All of them, worn and carried, and all scrolls move to the winner's backpack and case in slot order while there is room; the rest are destroyed. Cursed ones arrive unworn |
| Defeated by neutrals or by a garrison alone | The hero keeps them and takes them into the pool (5.4)                                                                                                                     |
| Retreat                                     | The hero keeps them                                                                                                                                                        |

### 4.5 Marvels in pieces

- A broken Marvel is **three pieces**. Each piece is an artifact with its
  own slot and its own rule: a part of the Marvel's rule, which may be
  its worse part.
- When one hero holds all three pieces (worn or carried), **Assemble** is
  offered on the adventure map, free. The three pieces are replaced by
  the Marvel, placed in the backpack. If any piece was cursed, the Marvel
  is cursed. Assembly cannot be undone.
- A map lists its Marvels and pieces at generation; each start region
  gets "one strange thing near home" (concept section 3), which may be a
  piece.

### 4.6 How artifact rules enter the grammar

An artifact is a list of rules, each in exactly one of five forms:

| #   | Form              | Rule                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stat modifier     | Changes a hero number: a primary stat, maximum mana, mana return, movement, sight, Morale, Luck, a cost, an income. Applies on the map and is read into the battle setup                                                                                                                                                                                                                              |
| 2   | Battle-start rule | At deployment, adds conditions or ground chosen by a selector ("your strongest stack starts Jinxed", "the fastest enemy stack starts Frozen"). These are ordinary conditions with a school, clock and gate, and can be moved, burnt or set off                                                                                                                                                        |
| 3   | Reaction          | A trigger and verbs, owned by the hero; fires in the heroes' place in the reaction order (1.10), once per action                                                                                                                                                                                                                                                                                      |
| 4   | Item act          | A once-per-battle act the hero performs before a friendly stack acts (1.7). It is not a spell                                                                                                                                                                                                                                                                                                         |
| 5   | Rule switch       | Sets one named engine flag. The engine has a fixed table of switches, each bounded by 1.11: casts per round 2 (with a stated restriction on the second), Fuel uses +1, clocks on own stacks do not tick (never Holds), a chosen page is not spent, remains exclusive to this side, a dying link passes its end to the nearest stack, and others the content bead proposes and the engine bead accepts |

Battle-start rules resolve as visible steps before round 1: the
attacker's artifacts in slot order, then the defender's, then army Morale
and Luck (6). They appear in the rehearsal of the battle's first screen.

## 5. Players and the adventure layer

### 5.1 Players and the day

- Two to four players. Player 0 is the human; the others are AI. Each
  starts with one town and one hero. `Owner` stays a player index or
  `null` for neutral.
- A player may have at most **8 heroes** on the map.
- Only one hero may stand on a cell.

**A day, exactly:**

1. The day number increases.
2. Elimination by the seven-day rule is tested (5.9).
3. On day 1 of a week from week 2: creature growth in every town and map
   dwelling; the taverns refresh (5.4).
4. For each surviving player in index order: income (not on day 1 of the
   game), then for each of its heroes movement points and mana, then the
   one-building-per-day flag of each of its towns is cleared.
5. Players take their **turns in index order**. A player moves any of its
   heroes in any order, builds, recruits and trades, then ends the turn.
   A battle is resolved the moment it starts, before anything else.
6. After the last player's turn the next day begins.

Adventure-map actions are legal only for the player whose turn it is.

### 5.2 Battles between players

- A hero attacks an enemy hero by moving into its cell (the last step of
  a path). Heroes have no zone of control.
- The mover is the **attacker** (left); the other is the **defender**
  (right) and the battle uses the defender's cell (1.12).
- Against neutral stacks the hero is always the attacker, as in the MVP.
- If the human is involved, the human plays their side (or takes quick
  battle). A battle between two AI players, or an AI and neutrals, is
  resolved by the engine with the stack AI and hero AI on both sides.
- The loser's hero leaves the map (5.4). The winner gains XP and, against
  a hero, artifacts (4.4).

### 5.3 Meetings

Two heroes of one player on adjacent cells may exchange creatures,
artifacts and scrolls freely, at no movement cost. Each must keep at
least one creature. A hero in a town exchanges with the garrison as in
the MVP.

### 5.4 The tavern and the hero pool

- Every town has a **Tavern** from the start (no building needed).
- All named heroes not on the map are in the **pool**. Content provides
  at least four named heroes per class.
- Each player has an **offer** of two heroes, seeded: slot A is a hero of
  a class of the player's starting faction if one is in the pool, slot B
  is any hero. No hero is on two players' offers.
- Offers refresh on day 1 of each week: both slots are redrawn. A hired
  slot stays empty until then.
- **Hiring** costs **2500 gold**, in any town of the player whose cell
  has no hero. The hero appears in the town with its class's starting
  army, full movement and full mana. The first hero of each player is
  free and present at the start.
- **A retreated hero** returns to its owner's offer at once as a third
  entry that lasts until the second weekly refresh after the retreat. It
  keeps its level, stats, skills, feats, pages, scrolls and artifacts.
- **A defeated hero** returns to the pool with its level, stats, skills,
  feats and pages, and whatever artifacts 4.4 leaves it. Any player may
  later draw it. A rehired hero gets its class's starting army.
- A player may **dismiss** a hero on its turn: its army is lost and it
  goes to the pool as if defeated by neutrals.

### 5.5 Towns: capture and defence

- A hero that enters a town not owned by its player fights the defenders
  and, on winning, **captures** it: the owner changes at once. Buildings,
  guild spells, dwelling stock and the remaining garrison (none) stay.
  The town keeps its faction; its new owner may build and recruit there,
  and those creatures are guests in an army led by another faction's
  hero.
- A town with no garrison and no hero is captured on entry without a
  battle.
- **Defenders.** If an enemy hero stands in the town, the attacker fights
  that hero and its army first, with the hero casting and the fort bonus
  applying. If the attacker wins and the garrison is not empty, a second
  battle against the garrison (no hero) follows at once; the attacker
  keeps its losses and spent mana, and pages are fresh. With no hero
  present, only the garrison battle happens.
- A hero defending in a town cannot retreat.
- **Fort.** Faction data maps buildings to a fort level. There are no
  walls, gates or siege engines in v0.2.

| Fort level | Effect on every stack defending the town                                                                                                                |
| ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
|          0 | None                                                                                                                                                    |
|          1 | +2 Defense (the MVP's Palisade)                                                                                                                         |
|          2 | +4 Defense                                                                                                                                              |
|          3 | +6 Defense, and a **tower**: a scheduled event at every round start deals Harm 20 + 10 x (dwellings built in the town) to the strongest attacking stack |

The tower is drawn on the timeline like any scheduled event and stops
when the defenders hold no living stack.

### 5.6 Mines, dwellings and flags

- Visiting a mine or a map dwelling flags it for the visiting player,
  whoever held it. Income follows the flag from the next day (ECONOMY 3).
- Mines have no garrisons in v0.2. A neutral guard stack beside a mine is
  an ordinary monster.
- A flagged map dwelling keeps one stock; whoever holds the flag may
  recruit there with a hero on its cell.

### 5.7 Neutral stacks

Zones of control, guard sizing and the split into up to three stacks are
as in the MVP. Neutral stacks **do not grow** in v0.2 and never move.
Guards with strong abilities, strays for hire and puzzle guards are
content.

### 5.8 The economy across players

Each player has its own resources, income, marketplace access and
one-building-per-day limit per town. Rates and prices are ECONOMY's.
Starting resources are the same for every player; any AI allowance is set
by the AI bead as a visible difficulty setting, not by these rules.

### 5.9 Elimination and victory

A player is **eliminated** when either holds:

- it has no town and no hero on the map (tested after every battle and
  capture); or
- it has held no town for seven consecutive days. A counter starts at 0,
  increases at each day start on which the player owns no town, and
  resets when it captures one; at 7 the player is eliminated.

On elimination its heroes go to the pool (keeping artifacts), its flags
become neutral and its turn is skipped from then on.

| Outcome  | Rule                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Victory  | The human is the only player not eliminated                                                                                                        |
| Defeat   | The human is eliminated. The game ends at once even if AI players remain                                                                           |
| Scenario | A map may add one extra victory condition from a fixed list: capture a named town, or hold a named artifact. The default maps use only elimination |

A player with towns but no heroes is still in the game and may hire.

### 5.10 Fog per player

- Each player has its own `explored` array. A cell is explored once any
  hero or town of the player has seen it (3.9).
- **Explored cells stay fully visible** to that player, as in Heroes 1 to
  3: terrain, objects, flags and other players' heroes on them are shown
  as they are now. There is no "seen but stale" state in v0.2.
- Unexplored cells show nothing.
- The interface draws only what the human has explored. An AI player's
  decisions may read only its own explored cells; it may not read
  unexplored terrain, objects or other players' resources and books.
- What a player may know about an enemy hero on an explored cell: class,
  level, army (creatures and counts) and worn artifacts. Not its pages,
  scrolls, mana or backpack, until a battle starts.

## 6. Morale and luck, made deterministic

Heroes' morale and luck rolls are **replaced**, not dropped: content
wants them as a place to hang skills, artifacts and map sites. Each
becomes an army number that turns into ordinary conditions at the start
of a battle, so they obey every law of section 1 and can be moved, shared
or burnt like anything else.

**The army numbers.** Morale and Luck are each the sum of their visible
sources, clamped to -3 to +3: hero skills and artifacts (4.6, form 1),
one-battle bonuses from map sites (they last until the hero's next battle
ends), and creature abilities that say so. Guests cause no Morale
penalty. A side with no hero has Morale 0 and Luck 0 unless its creatures
say otherwise.

**At the start of battle**, after artifacts' battle-start rules, for each
side, attacker first:

| Army number | Effect                                                        |
| ----------- | ------------------------------------------------------------- |
| Morale +n   | The n strongest eligible stacks start **Heartened**           |
| Morale -n   | The n strongest eligible stacks start **Shaken**              |
| Luck +n     | The n strongest eligible stacks start **Lucky**               |
| Luck -n     | The n strongest eligible stacks start **Jinxed** with clock 3 |

"Eligible" means the landing rules of 1.3 accept it; a refused stack is
skipped and the next strongest is tried.

| Kind      | School, polarity | Clock at start | Exact rule                                                                                                                                    |
| --------- | ---------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Heartened | Accord, boon     | none           | After the bearer finishes a turn, its side may end Heartened to give it an extra turn (1.6; one extra turn per stack per round still applies) |
| Shaken    | Hush, bane       | 2              | The bearer is in timeline class "last" and cannot Wait, exactly as Delayed                                                                    |
| Lucky     | Bloom, boon      | none           | The bearer's next melee attack or shot (not a retaliation) is x 150%; then Lucky ends                                                         |
| Jinxed    | Hush, bane       | 3, or as made  | The bearer cannot retaliate, and Strikes against it are x (100 + size)%; size 25 when it comes from Luck                                      |

None of the four is a Hold. All have charge 10 (2.7) and no gate. Creature
tags normally make undead and constructs unable to bear Heartened and
Shaken (two kinds, the limit of 1.2), which keeps Heroes' "undead have no
morale" without a special rule.

## 7. Notes for the engine and state beads

These map the rules onto the existing code; they add no rules.

| Area                     | Change                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `battle/types.ts` stacks | Add `owner`, `native`, `summoned`, `tags`, `wary`, `conditions` (replacing `statuses`); derive `side`                                                                                                                |
| `battle/types.ts` state  | Add `ground` (replacing `obstacles`), `scheduled`, per-side hero state (stats, mana, pages spent, cast used this round, Fuel uses, Command used, item acts used, rule switches), `laws`                              |
| `BattleAction`           | Add `ability`, `creatureCast`, `heroCast` (with optional Echo and Fuel choices), `command`, `itemAct`, `retreat`                                                                                                     |
| `BattleEvent`            | Every event gains an index and a `cause`; add events for conditions (landed, merged, displaced, refused, moved, copied, fed, wound, set off, expired, ended), ground, summons, schedule, Harm, link redirects, casts |
| `abilities.ts`           | `StatusDefinition` becomes the condition kind definition with the hooks of 1.3; `ABILITY_HOOKS` gains reaction and activated-ability hooks                                                                           |
| `damage.ts`              | Clamp the percentage product to 1/4 .. 4; add `computeHarm`                                                                                                                                                          |
| `engine.ts`              | Round structure of 1.6; reaction queue of 1.10; `rehearse` and `rehearsePlan` as thin wrappers over `applyAction`                                                                                                    |
| `ai.ts`                  | Must stay a pure function of the state (intents); gains ability use; hero AI is a separate function                                                                                                                  |
| `game/types.ts` heroes   | Add Power, Lore, mana, skills, feats, pages, scroll case, worn artifacts, backpack, specialty, daily adventure-spell uses, movement debt, one-battle Morale and Luck bonuses                                         |
| `game/types.ts` state    | Add `currentPlayer`, per-player elimination state and townless-day counter, the hero pool, tavern offers; `GameStatus` per player                                                                                    |
| `game/turn.ts`           | `endDay` becomes `endTurn` for the current player, with the day roll-over of 5.1                                                                                                                                     |
| `game/battle.ts`         | Pending battles gain hero-against-hero and two-stage town battles; results carry mana spent, artifacts moved and retreat                                                                                             |

## 8. Decisions and what is left to other beads

### 8.1 Decisions made here

| Decision                                                                                               | Why                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| A full stack displaces its shortest-clock condition instead of refusing the seventh                    | Refusal would let six cheap boons make a stack immune to banes                                                |
| Damage that travelled a link is never redirected again                                                 | The only loop guard links need; keeps link webs legal                                                         |
| Fuel doubles one marked size per spell, or the gate of a sizeless gated spell; tools cannot be Fuelled | Answers the concept's open "what does Fuel double"; makes Fuel a way to Hold a bigger stack                   |
| Echo and Fuel need no skill and work with scrolls                                                      | More meetings between pieces; school skills still gate tiers and Power                                        |
| School rank 0 learns nothing; ranks 1, 2, 3 open tiers 2, 4, 5 and add 0, 2, 4 Power                   | Makes scrolls matter and a sixth of a hero's skill slots a real price per school                              |
| Scrolls cost no mana                                                                                   | "Castable by anyone" must include heroes with Lore 1                                                          |
| Clocks do not scale with Power                                                                         | Keeps the rehearsal readable and Echo and Wind meaningful                                                     |
| Stat gains follow a fixed class pattern; offers are seeded per hero and level                          | No reload fishing; still the one-of-three choice                                                              |
| Movement reads the slowest creature, anchored so Speed 4 gives the MVP's 1500                          | Heroes-like, and existing numbers stay true                                                                   |
| Eleven worn slots including two pockets; one Marvel worn at a time                                     | The concept's example items need a slot that is not clothing; one Marvel keeps rule switches from compounding |
| Cursed items are labelled, voluntary to wear, then stuck until lifted                                  | No hidden state; the drawback is the puzzle, not the surprise                                                 |
| Round limit 30, defender wins; retreat added; no surrender                                             | A battle must end; retreat gives multi-hero play its Heroes shape                                             |
| A hero in a town is fought first, then the garrison, as two battles                                    | Avoids merging two armies into seven slots                                                                    |
| Fort is a flat Defense bonus and, at level 3, a scheduled tower shot; no walls                         | The cheap version the brief allowed                                                                           |
| Explored cells stay visible (Heroes 1-3 fog)                                                           | No stale-memory model for the interface or the AI                                                             |
| Neutrals do not grow                                                                                   | Keeps guard value in proportion to prizes on maze maps and gives the AI a stable target                       |
| Morale and luck become four ordinary conditions placed at battle start                                 | Deterministic, visible, and movable like every other condition; no new subsystem                              |
| The global start-of-day step pays every player before player 0 moves                                   | Simpler than per-turn upkeep and no player gains from order                                                   |

### 8.2 The concept's "left for fleshing out"

| Question                                   | Answer                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Is a Pack nip a full Strike?               | It is a `special` Strike: full formula, not retaliated, once per action (3.8). The Lost World is not in v0.2 |
| What does Fuel double on a summon or link? | The summon budget; a sizeless link cannot be Fuelled (2.4)                                                   |
| Who chooses the battleground?              | The defender's cell (1.12)                                                                                   |
| Does the AI use Echo and Fuel?             | It may (1.13); how well is the AI bead's work                                                                |
| Offerings, several Leashes                 | Not in v0.2; their factions are not in v0.2                                                                  |

### 8.3 Left to the faction, content, map and AI beads

- **Faction bead:** the Humans, Undead and Goblins rosters, creature
  tags, creature casters and their three numbers, town buildings with
  costs and fort levels, guild caps and school weights, the two classes
  per faction (stats, patterns, weights, starting skills and armies,
  native terrain, Commands), the exact text and numbers of each
  birthright (for example the count a risen stack returns with), named
  heroes and specialties.
- **Content bead:** the spell list with `base` and `per` values, every
  condition and ground kind beyond the engine-standard ones, the skill
  and feat lists, artifacts and Marvel pieces, the rule-switch table, map
  objects (shrines, curse-lifting sites, dwellings, Morale and Luck
  sites, traders), strays and their abilities.
- **Map bead:** guard sizing against artifact values, placement of the
  "strange thing near home", pylons for Tow Line, scenario victory
  conditions.
- **AI bead:** hero AI for casting, Commands and retreat, adventure AI
  within the knowledge limits of 5.10, any visible difficulty allowance.
- **Balance:** every reference budget in 2.4, the XP curve's pace against
  feats (a feat every third level assumes games that reach level 15 to
  20), tavern price, tower Harm. These are starting values; changes are
  recorded here.
- **Not in v0.2:** local laws and seam spells, the five engines and their
  capstones, replaying a hand-made opening in quick battle, surrender,
  boats, siege walls, mine garrisons, neutral growth.
