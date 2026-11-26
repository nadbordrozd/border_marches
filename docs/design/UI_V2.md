# UI v2: a Heroes study and a redesign plan for every screen

Bead border_marches-bzc.51. The user: "The ui is not super clear. work on
it" and "just improve all the UIs. Make them simple and intuitive". This
file compares every screen of the game with the matching screen of Heroes
of Might and Magic I to IV and turns the gaps into implementation beads.
It changes no code.

The earlier audit, [UI_REVIEW.md](UI_REVIEW.md) (bzc.25), made the screens
consistent (one frame, one tooltip, key chips, no overflow). This pass is
about clarity: what a player sees first, what is clickable, and what a click
will do.

## Evidence

Both folders are git-ignored (`.orchestration/`) and are never committed.

- Heroes references: `.orchestration/ui-refs/h1` to `h4`, 40 images, with
  the page and file URL of each in `.orchestration/ui-refs/sources.txt`.
  Sources: the English, French and Russian Wikipedia articles (fair-use
  screenshots) and the Heroes III wiki at heroes.thelazy.net (the original
  press screenshots, `PRSS_*`). They are for studying layout and information
  design only; no Heroes art may enter the game. The Might and Magic Fandom
  wiki refuses direct image downloads, so nothing was taken from it.
- Our screens: `.orchestration/screens/bzc51/<screen>-<W>x<H>.png`, 37 shots
  at each of 1280x800 and 1920x1080 (74 in all), headless Chrome with
  `--mute-audio` and `?mute=1`, dev server on port 6341. No turn was ended
  and no battle was fought: the battle shots use the debug routes, and the
  auto-resolved battle result was left out.
- The tour was a local copy of
  [tests/ui/screens-check.mjs](../../tests/ui/screens-check.mjs) with four
  additions: a configurable DevTools port (the script's fixed ports clash
  when two workers run it), the gallery tabs, the end-turn warning (Escape
  answers "Keep playing", so the turn never ends), and the battle with a
  spell chosen. Bead UI2-01 puts those into the repository script.

Screens captured: `menu`, `menu-named`, `gallery-creatures`,
`gallery-hover`, `gallery-spells`, `gallery-objects`, `gallery-towns`,
`adventure`, `adventure-hover-object`, `adventure-hover-resource`,
`endturn`, `adventure-rich`, `hero`, `hero-hover`, `kingdom`, `spellbook`,
`menu-dialog`, `meeting`, `town-humans`, `town-undead`, `town-goblins`,
`town-neutral`, `town-hover`, `recruit`, `market`, `prebattle`, `site`,
`levelup`, `levelup-hover`, `end-won`, `end-lost`, `battle`,
`battle-hover`, `battle-info`, `battle-book`, `battle-spell` and
`battle-spell-hover`. The `site` shot shows the map, not the site dialog:
the hand-built save's hero ran out of movement on the way, so the site
dialog still lacks a current screenshot (UI2-01 fixes the step).

## Work in flight (not planned again here)

| Bead   | What it changes                                                    | How this plan builds on it                                                      |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| bzc.44 | Roads drawn along the grid                                         | Nothing here touches roads or path markers.                                     |
| bzc.45 | Hero sheet army as full sprites, no captions; sheet fits 1280x800  | Its army band becomes the one army row reused by town, meeting and pre-battle.  |
| bzc.46 | Keyword registry, highlighted keywords, plain spell texts          | Condition badges, hover cards and the gallery use its icons and keyword boxes.  |
| bzc.47 | Spell targeting: disabled spells with reasons, highlighted targets | The battle status line and the adventure spellbook layout follow it.            |
| bzc.48 | Decoration art                                                     | None; the gallery's new entries get the same card.                              |
| bzc.49 | Pick up from the next cell; step onto buildings only               | The map status line and cursors use its "Pick up" action.                       |
| bzc.50 | Denser maps                                                        | Busier maps make the status line, cursors and short hover cards more important. |

Rule for the beads below: a bead that edits a file an in-flight bead also
edits waits until that bead is PUBLISHED (named under "After").

## What Heroes gets right everywhere

These ten habits recur in all four games and are the yardstick for each
screen below.

1. **One status line says what a click will do.** Heroes III's bottom bar
   reads "Attack Steel Golems (damage 1k-3.1k)" in battle and names the
   hovered object on the map. The player never has to guess.
2. **The cursor shows the action.** Horse for move, sword for attack, hand
   for visit, arrow for shoot, book for spell, a crossed circle for "can't".
3. **Pictures first, numbers second, words on request.** Creatures,
   buildings, spells and resources are pictures with a number; the text
   comes on right-click or in the status line.
4. **Left-click acts, right-click inspects**, on every screen and every
   object: army slots, buildings, spells, map objects, heroes in a list.
5. **Each screen is one fixed frame that never scrolls.** Every Heroes
   screen fits 640x480 or 800x600 with room to spare.
6. **The army is always the same row of seven big portraits** with a count,
   in the same place: hero screen, town (garrison above visiting hero),
   meeting, kingdom overview. Click to select, click to swap or merge.
7. **State is a colour, not a sentence.** The town hall grid colours each
   building's name bar by state (built, can build, can't build yet); hero
   lists carry movement and mana bars; the path turns from green to red
   where today's movement runs out.
8. **Lists are visible all the time.** Heroes and towns sit beside the
   minimap with portraits; one click selects, a second opens.
9. **Few words, consistent words.** Labels are one or two words under an
   icon ("Attack 24", "Expert Archery"); a sentence appears only in a
   description.
10. **The main view gets the space.** The map and the battlefield fill the
    window; panels are narrow and dense.

## What ours gets wrong everywhere

- **Words where pictures should be.** Stats as letters ("A1 D1 P2 L2"),
  condition badges as letters (S, L, V, R, J), the battle turn order as text
  chips, the kingdom garrisons as bare numbers, building cards as paragraphs.
- **Paragraphs of instructions in the chrome.** "Click a stack, then a slot:
  move, merge or swap. Shift-click to split." sits permanently on the hero
  sheet, town and meeting; "Point at an enemy for the exact damage ..."
  fills the battle prompt. A good layout makes these unnecessary.
- **Space wasted at 1920x1080.** The battlefield stays at zoom 1 (896x610
  in a 1920x1080 window) because `fitZoom` only takes whole steps; the side
  panel has an empty gap of about 170 px while the town list is clipped after four
  towns; the town build grid leaves its lower third empty.
- **Scrolling and clipping at 1280x800.** The hero sheet's header scrolls
  out of view (bzc.45 fixes that); the main menu box is cut at the bottom;
  the town build grid scrolls; the map hint line is cut with an ellipsis.
- **The status line does not always match the mode.** With a spell chosen
  in battle the bottom panel still says "Vampires: your move. Point at an
  enemy ..." while the cast panel says "Choose a stack".
- **Abstract numbers.** "Strength about 1040", "At the limit: you win,
  16551 to 6059", "Fight value 1795" mean nothing to a new player; Heroes
  shows "Lots of Bog Leeches" and a threat word.
- **Every building, spell and site looks equally important.** No grouping,
  no hierarchy; the eye has nowhere to start.

## Screen by screen

Priority: P1 makes the game clearer for every player in every session; P2
removes a real stumble; P3 is polish. The bead ids (UI2-nn) refer to the
breakdown at the end.

### Main menu and new-game setup

Heroes: a picture-led title screen with five big verbs (New Game, Load,
High Score, Credits, Quit); scenario choice is a separate screen with a
list on the left and the selected map's details and minimap on the right.

Ours: one tall form (map, size, players, faction, difficulty, seed, two
blurbs) whose bottom is cut off at 1280x800; Continue is greyed text at the
top when there is no save; the faction is three plain buttons and one blurb.

Changes:

1. P2 Split into two columns at 1280 and wider: left the map choice (random
   or named, with a small poster thumbnail for named maps and the size and
   player choices only for "Random map"); right the faction as three cards
   (hero sprite, faction name, a one-line play style, three creature
   sprites). Fits 1280x800 with no scroll. (UI2-16)
2. P2 Continue is the first, gold button when a save exists and hidden when
   there is none; New game is the gold button otherwise. (UI2-16)
3. P3 The seed and the computer difficulty move under an "Options" fold;
   defaults stay as now. (UI2-16)

### Gallery

Heroes has no gallery. Ours is good: tabs, search, every sprite at native
size and enlarged, full cards. bzc.48 adds decorations to it.

Changes:

1. P3 Filter chips for faction and tier on the creature tab and school on
   the spell tab; a sticky tab bar. (UI2-17)
2. P3 Rules texts use the bzc.46 keyword renderer, so the gallery doubles
   as the glossary. (UI2-17, after bzc.46)

### Adventure map HUD (side panel, resource bar, minimap)

Heroes: minimap at the top right; under it hero portraits with movement and
mana bars beside town portraits; a column of icon buttons (next hero, end
turn, kingdom, cast, dig, system); the selected hero's portrait, four
primary stats with icons and the army as portraits with counts; a single
status line under the map; resources and the date along the bottom.

Ours, from `adventure` and `adventure-rich`: the same skeleton and the key
chips are a real improvement for new players, but:

- the hero list is a strip of small portraits with a thin bar; no mana bar;
- the town list is text rows of fixed height, clipped after four towns even
  at 1920x1080 where about 170 px stay empty under the hero card;
- the stat cells read "A1 D1 P2 L2";
- the army is seven 28 px slots with an overlapping count, hard to read;
- the minimap draws unexplored ground in the same black as its frame, so
  early in a game it looks broken (a small island in a black box);
- the hint line under the map is cut with an ellipsis ("2252 moves l...");
- only four resources show, with no hint that more exist.

Changes:

1. P1 Side panel reflow (UI2-06): hero list as rows of portrait, name,
   movement bar and mana bar (two heroes per row at 1280 wide); town list as
   rows with a faction crest, the BUILD badge and a growth flag, growing to
   fill the panel's free height before it scrolls; stat cells with the
   existing attack, defense, power and lore icons and a number; the army as
   seven 40 px portraits with the count in a dark plate below, not over, the
   sprite; buttons keep their text and key chips but gain an icon.
   Amended by bead bzc.94 (the user found the crest and 32 px portraits
   puny): heroes are framed 48 px portraits between a vertical movement
   bar and mana bar, four to a row, the name in the hover card; towns are
   framed pictures, three to a row, of the town's map sprite at its fort
   level on the faction's town backdrop, a faction-colour band on top, the
   name below and the growth flag, BUILD badge and T key on the picture.
   Up to 860 px tall the minimap takes 23% of the height (28% above), so
   1280x800 shows five towns and 900x700 the whole panel. In the town
   screen a click on the visiting hero's portrait opens the hero sheet over
   the town (its spellbook read only there); closing it returns to the town.
2. P1 Minimap (UI2-06): unexplored ground drawn as dark parchment inside a
   one-pixel map border, so the map's bounds are always visible; the frame
   keeps the map square and centred.
3. P1 Status line (UI2-07): the bottom bar's middle is a single line that
   names what a click on the hovered cell does, in the same words as the
   cursor: "Walk to the Windmill: tomorrow", "Attack 10 Bog Leeches: likely
   victory", "Pick up 800 gold" (bzc.49), "Enter Oathmere", "Meet Sir
   Cuthbert", "Can't reach". Movement numbers move to the hero card's bar;
   the line never needs an ellipsis at 1280 wide.
4. P2 Cursors (UI2-07): CSS cursors for walk, walk tomorrow, attack, visit,
   pick up, enter town, meet hero and can't reach, drawn in code from the
   pixel palette (no new art).
5. P2 Resource bar (UI2-07): all resources always shown, zero greyed; the
   daily income under each; the date as "Month 1 · Week 1 · Day 1" with the
   day number emphasised.

### Map hover cards

Heroes: right-click on anything shows a small box: picture, name, one line
(what it gives, or "Lots of Bog Leeches"), visited or not.

Ours (`adventure`, `adventure-hover-object`): a text card. "Strength about
1040." is abstract; "Collected by the first hero to step on it. One-time:
the first visitor takes it." says the same thing twice and will be wrong
after bzc.49.

Changes:

1. P1 Picture-first cards (UI2-08): object or creature picture, name, one
   line of what it gives with resource icons, guards as portraits with a
   count word (Few, Several, Pack, Lots, Horde) and a threat word coloured
   against the selected hero (the existing estimate), the visited state, and
   the path line from UI2-07. Drop the "Strength about N" line.
2. P2 Right-click pins the card (it stays until Escape or a click), the same
   gesture as the battle's info panel; left-click keeps planning paths.
   (UI2-18)

### End-turn warning

Heroes: "One or more heroes may still move, are you sure you want to end
your turn?" with OK and Cancel.

Ours (`endturn`): clear and correct. It lists "Abbess Wilhelmina has not
moved" and "Oathmere can build today" as text.

Changes:

1. P3 Each warning row gets the hero portrait or town crest and is a button
   that closes the dialog and selects that hero or opens that town.
   (UI2-15)

### Hero sheet

Heroes: one screen, no scroll. II shows the army as five landscape cells
with the full creature sprite standing in it (the user's "full glory");
III and IV put the doll on a body silhouette, skills as icon tiles with a
two-word label ("Expert Archery"), primary stats as four big icons with a
number, and the army as a row of portraits at the bottom.

Ours (`hero`): rich and mostly well laid out, but the header scrolls away at
1280x800, the army band has captions, feats are paragraphs and the permanent
instruction line ("Click an item for details ...") takes a row.

bzc.45 owns this screen now (army band and the 1280x800 fit). After it:

1. P2 Feats and vows as icon tiles like skills (name under the icon, the
   rules in the hover card with bzc.46 keywords) instead of paragraphs.
   (UI2-19, after bzc.45 and bzc.46)
2. P2 The doll's empty slots show a faint outline of what goes there (helmet,
   ring, boots) drawn in CSS, instead of an empty square with a caption.
   (UI2-19)
3. P3 The two instruction lines go into the hover cards of the slots they
   describe. (UI2-19)

### Meeting and trade

Heroes III: the two heroes face each other, each with portrait, primary
stats, skills, doll, backpack and army, mirrored; a swap button between the
armies.

Ours (`meeting`): the armies are stacked rows at the top and the items are
one long list per hero; nothing is side by side, so it is hard to see who
has what.

Changes:

1. P2 Two mirrored columns, one per hero: portrait and name, the bzc.45
   army band, worn items and backpack as icons; a "swap armies" and a "give
   all items" button in the middle; drag or click to move as now. Fits
   1280x800. (UI2-14, after bzc.45)

### Town

Heroes III: the townscape fills the top two thirds; every building is drawn
in it and clickable. The bottom strip holds the town's hall and fort icons,
income, the creature growth panel (seven creature portraits with "+N"), and
the garrison above the visiting hero, two aligned rows of seven big
portraits so a stack moves with one click. The hall's build screen is a
grid grouped by kind, each building an icon with a coloured name bar for
its state; a click opens a box with picture, description, requirements and
cost. Heroes IV keeps the same plan.

Ours (`town-*`, `town-hover`): a static picture of the town's map sprite,
then up to 24 building cards of equal weight in a grid that scrolls at
1280x800 and leaves its lower third empty at 1920x1080; each card is a
paragraph, a cost row, a requirements line and a Build button. Built,
buildable and locked cards differ only in a thin side stripe and grey text.
The Recruit panel is a nearly empty box; the garrison row and the "No hero"
row are not aligned and their slots are small; the tavern and marketplace
are separate panels.

Changes:

1. P1 Build grid as a Heroes hall (UI2-09): rows Hall, Fort, Economy,
   Magic and Specials, then the dwellings in tier columns; each building a
   compact tile (icon, name, and a name bar coloured green for "can build
   today", amber for "missing resources", red for "missing requirements",
   gold for "built"); one click selects and shows the full card with
   picture, effect, cost, requirements and the Build button in a detail pane
   beside the grid; the build-today rule shows once in the header. Fits all
   24 buildings of every faction at 1280x800 with no scroll.
2. P1 Army rows (UI2-10): garrison above visiting hero, both the bzc.45 army
   band at the same size and aligned slot for slot, with the town crest and
   the hero's portrait at the left of their rows; click or drag between
   them.
3. P2 Dwellings strip (UI2-10): replaces the Recruit box with the faction's
   dwellings in tier order, each a creature portrait with "available / growth
   per week", greyed and locked until built; a click opens the recruit
   dialog.
4. P2 Recruit dialog (UI2-10): Heroes III's four boxes (cost each,
   available, to recruit, total) above the slider and Max; abilities with
   bzc.46 keywords.
5. P3 Header (UI2-09): income, fort level and the build-today state as icons
   with numbers, not a sentence; tavern and marketplace as two icon buttons
   in the header instead of separate panels.

### Kingdom overview

Heroes III: one row per hero (portrait, primary stats, army as portraits
with counts, artifacts) and one per town (picture, garrison portraits,
creatures available this week); resources and income at the bottom.

Ours (`kingdom`): three tables of text and numbers: an income table that is
mostly dashes, a mines line, a towns table whose garrison is a bare number,
a heroes table whose army is a bare number.

Changes:

1. P2 Heroes as rows: portrait, level, movement bar, army as small
   portraits with counts; click selects the hero and closes. (UI2-12)
2. P2 Towns as rows: crest, name, fort and hall icons, income, garrison
   portraits with counts, the dwellings' available creatures, and the BUILD
   badge; click opens the town. (UI2-12)
3. P2 Income collapses to one row of resource icons with "+N per day" and
   the by-source table in each resource's hover card. (UI2-12)

### Adventure spellbook

Heroes III: an open book with school tabs on the side and adventure and
battle tabs at the bottom; each page shows big spell pictures with name and
cost; spells you cannot cast are greyed; the status line names the hovered
spell.

Ours (`spellbook`): a list by school with small icons, a header that says
"No adventure spells yet", and battle pages as reference. bzc.47 adds
disabled states and reasons; bzc.46 rewrites the texts.

Changes:

1. P3 Two tabs, "Adventure" and "Battle", with the adventure tab first and
   castable spells first in it; school filter chips; bigger icons (48 px)
   with name and mana under them in a grid instead of rows. (UI2-13, after
   bzc.46 and bzc.47)

### Battle

Heroes III: the battlefield fills the screen; the active stack's movement
range is shaded; the cursor shows the action; the one status line names the
action and the damage range; the stack info is a small window on
right-click; the spellbook covers the field only while it is open; spells
with no target cannot be chosen. HotA and IV add a turn queue of creature
portraits.

Ours (`battle`, `battle-hover`, `battle-info`, `battle-book`,
`battle-spell`, `battle-spell-hover`):

- the field is not scaled up: at 1920x1080 it is a 896x610 box in a dark
  window, and at 1280x800 it has black bars at both sides;
- the turn order is a row of coloured text chips that runs off the right
  edge; the round limit chip reads "15 rounds left · At the limit: you win,
  16551 to 6059";
- condition and role badges are letters in small circles (S, L, V, R, J,
  +, !), and Sworn pairs are joined by dashed lines across the field, which
  is the noisiest thing on screen;
- the action bar truncates ("Spend He...", "A Pinch of...");
- the bottom panel repeats the rules ("Point at an enemy for the exact
  damage ...") and does not switch to the cast mode when a spell is chosen;
- the battle spellbook covers the whole field and is a wall of rules text
  (bzc.46 and bzc.47 address the texts and targets).

Changes:

1. P1 Field fills the window (UI2-02): `fitZoom` takes quarter steps from
   1x (1.25, 1.5, ...) with image smoothing off, so 1920x1080 shows the field
   at 1.5x and 1280x800 loses its side bars; hit-testing follows the zoom.
2. P1 Turn queue of portraits (UI2-03): the next eight stacks as creature
   heads in side-coloured frames with the count, the active one larger, a
   "Round 2" divider; hover shows the stack card, click flashes the stack on
   the field. The round chip becomes "Round 1 / 15" with an hourglass; the
   verdict at the limit moves to its hover card in plain words ("If the
   battle ends now, you win").
3. P1 Status line (UI2-05, after bzc.47): the bottom panel is one line that
   says what a click does now, in every mode: "Move here", "Attack Ogres:
   52-60 damage, kills 2, they strike back", "Cast Nettle on Goblins",
   "Choose an enemy stack for Nettle (Esc to cancel)"; the rules paragraph
   moves to the Keys help.
4. P2 Condition badges (UI2-04, after bzc.46): the registry's icons instead
   of letters, at most three under the count and "+N"; hover lists them with
   keyword boxes. Link lines appear only for the active or hovered stack.
5. P2 Action bar (UI2-05): icon plus a short label that never truncates; the
   full name and effect on hover; Auto and Speed as a small cluster at the
   right of the bar instead of a separate block.
6. P3 The battle spellbook (after bzc.47) docks to one side (left half at
   1280, a third at 1920) so the field stays visible while choosing.
   (UI2-13)

### Pre-battle, site and other dialogs

Heroes: a creature encounter names the creature and a count word with its
picture and offers Fight or Flee; a site shows its picture, one sentence of
what it does and OK or Cancel.

Ours (`prebattle`, `levelup`, `menu-dialog`, `market`): consistent frames
and good estimates. The pre-battle armies are text lists with 24 px icons;
the title says "Neutral monsters" above "A pack of 10 Bog Leeches attack!"
yet the enemy list splits them into 4, 3 and 3 with no explanation. The
level-up draft is already Heroes-like and clear.

Changes:

1. P2 Pre-battle (UI2-15, after bzc.45): both armies as the army band (full
   sprites with counts), the estimate as a coloured word with a bar, one
   title ("10 Bog Leeches attack!") and a note when the enemy splits into
   several stacks.
2. P3 Site dialogs (UI2-15): the site's map sprite enlarged at the top, one
   sentence, the options as buttons with resource icons for costs and
   rewards.
3. P3 One dialog rule for every modal (UI2-15): picture, title, one
   sentence, the consequence, buttons with their keys; the primary button is
   the action the player came for.

### End screens

Ours (`end-won`, `end-lost`): fine. No change planned.

## Bead breakdown

Each bead names its validation profile per [CLAUDE.md](../../CLAUDE.md).
"ui" means: format, lint, typecheck, focused tests, build, and muted
screenshots at 1280x800 and 1920x1080 reviewed by the orchestrator. Every
UI bead's worker runs `node tests/ui/screens-check.mjs` (after UI2-01) on its
own port for the screens it touched; no turn is ended and no battle is
auto-resolved.

| Id     | Title                                            | Pri | Files (main)                                                                                                     | After                  |
| ------ | ------------------------------------------------ | --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| UI2-01 | Screen tour: gallery, end turn, spell, port      | P1  | `tests/ui/screens-check.mjs`, `docs/design/UI_REVIEW.md`                                                         | none                   |
| UI2-02 | Battlefield fills the window                     | P1  | `src/render/battle/geometry.ts`, `src/ui/battle/screen.ts` (`layout`), `battle.css`                              | none                   |
| UI2-03 | Battle turn queue of portraits, plain round chip | P1  | `src/ui/battle/screen.ts` (top bar), `src/ui/battle/info.ts`, `battle.css`                                       | bzc.47                 |
| UI2-04 | Condition badges as icons, quieter link lines    | P2  | `src/render/battle/grammar-view.ts`, `renderer.ts`, `scene.ts`                                                   | bzc.46                 |
| UI2-05 | Battle status line and action bar                | P1  | `src/ui/battle/screen.ts` (prompt), `actionbar.ts`, `battle.css`                                                 | bzc.47, UI2-03         |
| UI2-06 | Adventure side panel and minimap                 | P1  | `src/ui/game.ts` (`buildSide`, `renderHeroList`, `renderHeroPanel`, `renderTownPanel`), `minimap.ts`, `game.css` | bzc.49                 |
| UI2-07 | Map status line, cursors, resource bar           | P1  | `src/ui/game.ts` (`renderHint`, `renderBar`), `map-clicks.ts`, `hints.ts`, new `src/ui/cursors.ts`, `game.css`   | bzc.49, UI2-06         |
| UI2-08 | Picture-first map hover cards                    | P1  | `src/ui/format.ts`, `src/ui/game.ts` (`showMapTip`), `tooltip.ts`                                                | bzc.46, bzc.49, UI2-07 |
| UI2-09 | Town build grid as a Heroes hall                 | P1  | `src/ui/town.ts`, `game.css` (town rules), building groups derived from `src/data/*` defs                        | none                   |
| UI2-10 | Town army rows, dwellings strip, recruit dialog  | P1  | `src/ui/town.ts`, `src/ui/army.ts`, `game.css`                                                                   | bzc.45, UI2-09         |
| UI2-12 | Kingdom overview with portraits                  | P2  | `src/ui/game.ts` (`kingdom`), `game.css`                                                                         | bzc.45, UI2-06         |
| UI2-13 | Spellbooks: tabs, icon grid, docked battle book  | P3  | `src/ui/spellbook.ts`, `src/ui/battle/spellbook.ts`, `battle.css`, `game.css`                                    | bzc.46, bzc.47         |
| UI2-14 | Meeting as two mirrored columns                  | P2  | `src/ui/game.ts` (`meet`), `src/ui/hero-screen.ts` (`meetingItems`), `hero.css`                                  | bzc.45                 |
| UI2-15 | Dialogs: pre-battle armies, site pictures, rule  | P2  | `src/ui/game.ts` (`battles`, `siteChoice`, `endTurn`), `src/ui/dom.ts` (`modal`), `game.css`                     | bzc.45, bzc.49         |
| UI2-16 | Main menu in two columns, fits 1280x800          | P2  | `src/ui/app.ts` (`mainMenu`), `game.css`, `tests/ui/setup.test.ts`                                               | none                   |
| UI2-17 | Gallery filters and keyword texts                | P3  | `src/ui/gallery.ts`, `gallery-data.ts`, `gallery.css`                                                            | bzc.46, bzc.48         |
| UI2-18 | Right-click inspects everywhere                  | P2  | `src/ui/tooltip.ts` (pinned card), `map-clicks.ts`, `town.ts`, `hero-screen.ts`                                  | UI2-08, UI2-10, bzc.45 |
| UI2-19 | Hero sheet: feat tiles, doll outlines            | P2  | `src/ui/hero-screen.ts`, `hero.css`                                                                              | bzc.45, bzc.46         |

(UI2-11 was folded into UI2-10.)

### Acceptance per bead

- **UI2-01** (cross-cutting tooling, profile `ui`): `CDP_PORT` overrides the
  DevTools port; new screens `menu-named`, `gallery-<tab>`, `gallery-hover`,
  `endturn` (asserts the warning dialog, answers Escape, asserts the day did
  not change), `battle-spell`, `battle-spell-hover`; the site step picks a
  site within today's reach so `site` shows a dialog; `battle-result`
  (auto-resolve) only when named explicitly. One run at 1280x800 and one at
  1920x1080 print `ok: true`. UI_REVIEW.md's command list updated.
- **UI2-02** (`ui`): unit tests for `fitZoom` (1280x800, 1440x900,
  1920x1080, 2560x1440 at dpr 1 and 2) and for pointer-to-hex mapping at a
  fractional zoom; the field's height is at least 80% of the free stage
  height at 1920x1080; sprites stay crisp (no smoothing) in a zoomed
  screenshot.
- **UI2-03** (`ui`): a pure function builds the queue model (stack id,
  side, portrait, count, round divider) with unit tests; the queue never
  overflows at 1280 wide (it shows fewer entries); hover card and click
  flash work; screenshots of rounds 1 and 2.
- **UI2-04** (`ui`): every condition kind in the engine has an icon (test
  over the condition kinds against the bzc.46 registry); at most three
  badges plus "+N"; link lines drawn only for the active or hovered stack;
  screenshots of a grammar-heavy scenario (`scenario=restless&grammar=1`).
- **UI2-05** (`ui`): a pure function maps (mode, hovered hex, chosen act)
  to the status sentence, with unit tests for move, melee, shoot, swap,
  cast-choose-target, cast-confirm, no-target and enemy turn; no action
  label truncates at 1280x800 with a full hero (`items=1&magic=1`).
- **UI2-06** (`ui`): screenshots with one hero and one town, and with eight
  heroes and five towns, at 1280x800 and 1920x1080; the town list shows all
  five towns without scrolling at 1080 high; stat cells use the icon set;
  minimap bounds visible on turn 1.
- **UI2-07** (`ui`): a pure function maps (hovered cell, selected hero,
  plan) to (cursor kind, status sentence), unit-tested for walk, walk
  tomorrow, attack, visit, pick up, enter town, meet, blocked and fogged;
  the hint line has no ellipsis at 1280 wide for the longest sentence in the
  tests; every resource shows in the bar.
- **UI2-08** (`ui`): card builder unit tests for a monster, a pickup, a mine,
  a dwelling and a town; no card exceeds six lines; screenshots of four
  hovers.
- **UI2-09** (`ui`): a pure function groups every building of every faction
  (test: each building in exactly one group, dwellings in tier order); the
  grid of each faction fits 1280x800 without scrolling; tile colours follow
  the four states (unit test of the state function); screenshots of all
  three factions and a selected building.
- **UI2-10** (`ui`): garrison and visitor rows aligned (same slot rects),
  stacks move between them by click and by drag; dwellings strip shows
  locked and available dwellings; recruit dialog's four boxes; tests in
  `tests/ui` for the town army moves stay green.
- **UI2-12** (`ui`): kingdom with five towns and two heroes fits 1280x800;
  clicking a hero row selects that hero; clicking a town row opens it.
- **UI2-13** (`ui`): adventure tab first, castable spells first; battle book
  docked so at least half of the field stays visible at 1280x800.
- **UI2-14** (`ui`): mirrored columns fit 1280x800; swap armies and give all
  items work and keep each hero's last creature rule; tests updated.
- **UI2-15** (`ui`): pre-battle uses the army band; the enemy split is
  explained when there are several enemy stacks; end-turn warning rows
  select the hero or open the town.
- **UI2-16** (`ui`): menu fits 1280x800 and 1920x1080 without scrolling;
  `tests/ui/setup.test.ts` still green; named map choice hides the size and
  player rows.
- **UI2-17** (`ui`): filter chips narrow the grid; the search still works;
  keyword boxes appear on gallery cards.
- **UI2-18** (`ui`): right-click opens a pinned card on map objects, heroes
  in the side list, army slots, building tiles and spell icons; Escape or a
  click closes it; the browser menu never appears on game screens.
- **UI2-19** (`ui`): feats as tiles with hover cards; doll outlines;
  1280x800 fit kept.

### What can run in parallel

- **Wave 1, now** (no in-flight overlap): UI2-01, UI2-02, UI2-09, UI2-16.
  They touch disjoint files (UI2-02's `screen.ts` change is the `layout`
  method only, so it can run beside bzc.47 and merge cleanly).
- **Wave 2, as the in-flight beads publish**: after bzc.47, UI2-03 then
  UI2-05 (same file, serial); after bzc.46, UI2-04 and UI2-17; after
  bzc.49, UI2-06 then UI2-07 (same file, serial); after bzc.45, UI2-10
  (after UI2-09), UI2-14 and UI2-19. UI2-03/UI2-05, UI2-06/UI2-07,
  UI2-10 and UI2-14 are four independent chains and can run side by side.
- **Wave 3**: UI2-08 (after UI2-07), UI2-12 (after UI2-06), UI2-13,
  UI2-15, then UI2-18 last because it touches every screen.

`src/ui/game.ts` is the bottleneck (UI2-06, 07, 08, 12, 14, 15 all edit
it); those beads stay serial or touch disjoint methods named in their
scope.

## Top ten changes

1. **The battlefield fills the window** (UI2-02): 1.5x at 1920x1080, no
   side bars at 1280x800.
2. **One status line that says what a click does**, on the map (UI2-07)
   and in battle (UI2-05), matching the mode, including spell targeting.
3. **Town build grid as a Heroes hall** (UI2-09): grouped compact tiles
   coloured by state, one detail pane, no scrolling.
4. **Battle turn queue as creature portraits** and a plain round counter
   (UI2-03).
5. **Action cursors on the map** (UI2-07): walk, attack, visit, pick up,
   enter, meet, can't reach.
6. **Adventure side panel that uses its space** (UI2-06): hero rows with
   movement and mana bars, a town list that fits, icon stats, a readable
   army, a minimap with visible bounds.
7. **Picture-first hover cards** (UI2-08): portraits, count words and a
   coloured threat word instead of "Strength about 1040".
8. **Town garrison and visiting hero as two aligned army rows** with a
   dwellings strip (UI2-10).
9. **Condition badges as icons** with keyword hover and quieter link lines
   (UI2-04).
10. **Kingdom overview with portraits** for heroes, garrisons and available
    creatures (UI2-12).
