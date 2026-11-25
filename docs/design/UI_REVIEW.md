# UI review (bead border_marches-bzc.25)

A review pass over every screen of the game for a beautiful, intuitive and
informative interface in the spirit of Heroes of Might and Magic II, drawn
in CSS from our palette (no new art). This file records what the audit
found, what was fixed and what is left.

## How the screens were checked

`tests/ui/screens-check.mjs` takes a muted screenshot of every screen in
headless Chrome (`--mute-audio`, `?mute=1`) from hand-built saves and the
battle debug routes. It never ends a turn (the end-turn warning is answered
with Escape and the day is checked) and never resolves a battle, so no AI
plays. It starts its own Vite server on a free port and lets Chrome pick a
free DevTools port, so parallel workers never collide (bead bzc.52, UI2-01).

```text
npm run screens -- --out=.orchestration/screens/<bead> --size=1280x800,1920x1080
npm run screens -- --only=hero,town --size=1280x800
npm run screens -- --url=http://127.0.0.1:6400/ --timeout=600
CDP_PORT=9555 node tests/ui/screens-check.mjs --only=battle
```

`--only` takes screen names or families (`gallery` is every `gallery-*`
shot). `--url` uses a running server instead of starting one; `CDP_PORT`
fixes the DevTools port; `--timeout` (default 900 s) stops a stuck run.
`battle-result` auto-resolves a battle and runs only when named in
`--only`. The hand-built save gives the hero levels,
artifacts, pages and scrolls (adventure spells included) and skills, makes
every town the player's and puts a second hero next to the first for the
meeting. The site step clears the neutral guards, reveals the map and walks
to a site with a choice within today's reach. The end screens use the
`previewEnd` page hook. A JSON line ends the run: `ok`, `failures`,
`skipped` and page `errors`.

Screens: `menu`, `menu-named`, `menu-options`, `menu-continue`,
`gallery-<tab>` (every tab), `gallery-hover`, `gallery-keyword`,
`adventure` (path plan and monster hover), `adventure-hover-object`,
`adventure-pickup` (the grab cursor, stamped as a label because headless
shots draw no cursor), `adventure-hover-resource`, `adventure-rich`,
`endturn`, `hero`, `hero-hover`, `hero-hover-army`, `hero-hover-skill`,
`hero-hover-feat`, `hero-hover-stat`, `kingdom`, `spellbook` (the
adventure tab), `spellbook-battle` (when the book has tabs), `adventure-aim`, `menu-dialog`, `meeting`, `town-<faction>`, `town-hover`,
`town-hall` (a selected hall tile), `recruit`, `market`, `prebattle`,
`site`, `levelup`, `levelup-hover`, `end-won`, `end-lost`, `battle`,
`battle-hover`, `battle-info`, `battle-book`, `battle-spell`,
`battle-spell-hover`, `battle-spell-noeffect` and, when named,
`battle-result`.

## One visual language

- `src/ui/theme.css` holds the shared tokens: the carved frame (a dark
  outer edge, a light wood bevel and a gold trim inside), wood grain, the
  inset well for lists, gold-ruled headings (`.gm-rule`), key chips
  (`.gm-kbd`), the tooltip, focus rings and the dialog fade-in hook for the
  animation pass (bzc.26). Every dialog, the main menu, the end screens,
  the side panel, the resource bar and the town header and footer use it.
- Buttons have clear states: raised wood, a gold edge on hover, pressed on
  click, a yellow focus ring for the keyboard, and greyed when disabled.
  The primary button is gold.
- Typography: Georgia for titles and names, Verdana for text, tabular
  figures for numbers; small capitals for side panel labels.
- Faction colours appear as chips on the setup buttons, the town list, the
  town header and the kingdom's rival list; player colours on turn chips.
- Content icons from `iconFor` are used for spells (hero sheet book,
  adventure spellbook), artifacts, skills and feats; resource icons in the
  bar, costs, income tables and mine lists.

## The tooltip system

`src/ui/tooltip.ts` is the single tooltip of the game screens:

- `setTip(element, content)` attaches a tooltip; content is a string, a
  node, or a function called on every hover (never stale).
- `tipCard(title, lines, { icon, subtitle, className })` builds the
  standard card.
- `showTipAt(x, y, content)`, `moveTip(x, y)` and `hideTip()` drive it by
  hand (the adventure map canvas).
- `installTooltips()` installs one set of delegated listeners. Any `title`
  attribute is taken over on first hover, so older code and other beads'
  buttons get the same tooltip with no change; a title of several lines
  becomes a card with its first line as the heading.
- `placeTip()` keeps the tip inside the viewport (below right of the
  pointer, flipped left or up near an edge). Tips appear after 120 ms, at
  once while skimming from one to the next, follow the pointer, show for
  keyboard focus, and hide on click, Escape or when their element goes.

Shared cards live in `src/ui/info-tips.ts`: `creatureTip` (all stats,
growth, cost and every ability with its rule text), `spellTip` (school,
tier, mana, the effect at the hero's Power, what Fuel doubles) and
`buildingTip` (effect, recruits, cost, requirements met or missing, and
what it unlocks).

## Findings and fixes per screen

### New-game setup (main menu)

| Problem                                                                         | Fix                                                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The Lost World chieftain headed a menu of three other factions                  | The selected faction's hero rides above the title and changes with it |
| Faction buttons gave no hint of what a faction plays like (only a native title) | Colour chip on each button and the faction's blurb under the row      |
| "Your faction" label wrapped awkwardly                                          | Wider label column                                                    |
| Key help was a run-on sentence                                                  | Key chips (Space, E, H, T, ?)                                         |
| Plain box frame                                                                 | Carved frame, warmer backdrop                                         |

Left for bzc.18: the named map list will join the map size row.

### Adventure map and side panel

| Problem                                                                                           | Fix                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The side panel overflowed at 900 px high (sound sliders cut off) and much more with several towns | Compact layout: turn chip, minimap, hero portrait strip, scrolling town list, hero card, button grid; End turn pinned at the bottom; the sound settings moved to the Menu                                       |
| Plain one-line hover text on the map                                                              | A card: title, what it is and does, visited and reset (catalogue lines), guards, a battle estimate for monsters and enemy heroes, and the path cost, the days to get there and the movement left after the step |
| No path cost or days anywhere                                                                     | The hint line under the map and the hover card say "Today: 830 moves, then attack" or "In 2 days: 3160 moves, 340 left"                                                                                         |
| Resource tooltips said only "+N per day"                                                          | Stock, income per day and its sources (towns, mines with their count, heroes and artifacts), or how to get some                                                                                                 |
| No hint of what to do next                                                                        | The hint line: plan a path, click again or Space to walk, the hero is tired (H for the next), every hero has moved (E)                                                                                          |
| End turn with heroes unmoved or a town able to build gave no warning                              | A confirmation lists unmoved heroes, heroes with movement left and towns that can still build; Keep playing selects the first such hero                                                                         |
| Hero list showed only names; no sign of a pending level-up                                        | Portrait strip with a movement bar, tired heroes greyed, a gold "+" for a pending level-up, a full card on hover, double-click for the sheet                                                                    |
| Town buttons said only the name                                                                   | Faction chip, a BUILD badge when something is affordable today, a card with income, garrison, fort level and build status                                                                                       |
| Stat line "A 1 D 1 P 2 L 2" in serif capitals was hard to read                                    | Four stat cells with tooltips; movement, mana and XP meters with labels and tooltips                                                                                                                            |
| Shortcuts were only in button labels ("Next hero (H)")                                            | Key chips on every button, `aria-keyshortcuts`, a Keys dialog (?)                                                                                                                                               |
| H cycled heroes even when they had no movement                                                    | H prefers heroes with movement left                                                                                                                                                                             |
| T always opened the first town                                                                    | T opens the town the hero stands in, else the first                                                                                                                                                             |
| AI turns left no record                                                                           | The adventure log (L) keeps every announcement, the AI's captures, defeats and mine flags included                                                                                                              |
| Menu offered only Save and quit                                                                   | Menu (O): Save game, Load the last save (with a confirmation, as it is irreversible), Keys, Quit to menu, and the sound settings                                                                                |

### Hero sheet

| Problem                                                     | Fix                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| The book listed raw spell ids ("poultice, thornskin, ...")  | Spell icons with a card per page at the hero's Power                 |
| Taller than a 900 px window: the title scrolled out of view | Book under the stats and the scroll case under the doll; fits 800 px |
| Title "Hero"                                                | "Hero sheet"                                                         |
| Item, skill and feat titles were native browser tooltips    | Shown by the game tooltip as cards                                   |

### Town screen (all three factions)

| Problem                                                             | Fix                                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| No faction, fort level or build-today status in the header          | Faction chip and name, "no fort" or fort level, "one building a day" or "built today"                                        |
| Dwellings were buried in the building grid (scrolled off at 900 px) | A Recruit panel under the town picture with every built dwelling's stock; click to recruit, hover for the creature card      |
| Building cards said what they need but not what they lead to        | Building card on hover: effect, recruits, cost, requirements in green or red, and what it unlocks                            |
| The grid's last row was cut with no hint of scrolling               | A fade at the bottom edge and a thin gold scrollbar                                                                          |
| Recruit dialog had no abilities                                     | Abilities with their rule text, growth per week, a creature card on the portrait; Recruit defaults to the maximum affordable |
| Tavern heroes had no details                                        | Card with class, level, specialty and what hiring gives                                                                      |
| Recruit buttons at zero stock gave no reason                        | "None left this week: dwellings grow on day 1 of each week"                                                                  |

### Marketplace, tavern, kingdom

- Marketplace: framed like every dialog, key chips on Done.
- Kingdom: an income table by source and resource, mines by kind, towns
  with fort level, income, garrison and a "can build" flag (click a town
  name to open it), heroes with portraits and hover cards, rivals with
  faction and town count.

### Meeting and trade

- Wider name column so names do not wrap; creature cards on every slot.

### Level-up draft

- Framed; the primary pick shows its Enter key. Unchanged otherwise (it
  was already clear).

### Spellbook (adventure)

- Battle pages were a wall of text; now a grid by school, each page an
  icon, its name and mana, with the spell card on hover.

### Site and object dialogs

- Many options (the Hermit's "Forget ..." choices) overflowed the dialog
  sideways; buttons now wrap.

### Pre-battle dialog

- Portraits and creature cards for both armies, and a cheap estimate
  ("Likely victory") from fight values and the hero's Attack and Defense.

### End-of-game screens

- The best hero's portrait, a stats panel (date, days played, towns,
  heroes, mines, best hero) and a focused Main menu button.

### Battle screen, info panels, battle spellbook, results

The battle screen was polished by bzc.20 and bzc.31; this pass kept it.

- The action bar overflowed at 1280 px with a full hero (spells, a Command
  and five item acts): tighter spacing below 1520 px, icon-only acts in a
  group of five or more below 1380 px (their tooltips name them).
- `installTooltips()` also runs on the battle debug route, so plain titles
  in the battle use the same tooltip.

## Layout at 1280x800, 1440x900 and 1920x1080

All screens were captured at the three sizes. The side panel, the hero
sheet, the town screen and every dialog fit at 1280x800; dialogs are
capped at the window height and scroll inside when they must.

## Keyboard

- Adventure: E, H, I, T, K, M, G, L, O, Space, Esc, arrows, +/-, and ?
  for the list. Dialogs: Enter for the primary button, Esc for cancel,
  both shown as chips.
- Every control is a real button with a visible focus ring; focusing one
  shows its tooltip.

## Coordination hooks

- The AI banner (bzc.19) is unchanged; the turn panel shows the current
  player's faction. AI announcements go through `note()` and land in the
  log.
- The setup's rows are unchanged in structure, so the named map list
  (bzc.18) can join them.
- A round-limit indicator (bzc.24) can use `setTip` and the `.gm-kbd` and
  `.gm-rule` styles.
- Animation (bzc.26): `gm-appear` keyframes on dialogs and end screens,
  off under `prefers-reduced-motion`.

## Left for later

- Before screenshots of the meeting, marketplace, site and end screens
  are missing: the audit script could not reach them before the hooks and
  save fixes of this bead (the after shots cover them).
- The battle debug scenarios show the placeholder hero portrait (the
  scenarios give their heroes no roster id); real battles show the hero.
- The town building grid still scrolls at 1280x800; a tabbed or
  category layout would remove that.
- The minimap is a plain canvas; a carved frame around a larger minimap
  would follow Heroes II more closely.

## Animation pass (bead bzc.26)

Code-drawn motion in the pixel style: whole-pixel particles with a dark
outline, a small palette per school, stepped fades, no blur or glow.

- Battle: `src/ui/battle/schedule.ts` plans each batch of engine events
  into beats (event-index order, effect names, durations);
  `src/ui/battle/animate.ts` plays them on the scene only. Effects live in
  `src/render/fx/` (`field.ts` the capped effect field, `pixels.ts` the
  sprites and palettes, `emit.ts` the recipes, `spell-fx.ts` the per-spell
  registry with a school fallback, `shots.ts` the projectile per shooter).
- Map: hero walk with a bob and a gliding camera, revealed fog fading out,
  pickups flying to the resource bar and counting up, flags rising on a
  capture, a level-up burst, day and week banners (`map-view.ts`,
  `src/ui/anim.ts`).
- Interface: dialog fade in and out, button presses, tooltip fade, level-up
  cards dealt in, spellbook pages turning, a building flashing when built,
  the recruit stock counting down (`theme.css`).
- Reduced motion: the Menu's "Motion" button (auto, reduced, full; auto
  follows `prefers-reduced-motion`) sets `html[data-motion="reduced"]`:
  no particles, slides or bobs; news beats hold briefly in place.
  Instant speed and quick battles skip every animation.
- Sound hooks: every effect has a name in `FX_EVENTS` (`src/audio/fx.ts`);
  `fxEvent(name)` plays the sound registered in `FX_SOUNDS` (the five
  school cast sounds now; the sound pass fills the rest).
- Map view polish (bead xaj.18): the map's input (`src/render/map/input.ts`)
  is off under the town and battle screens, dialogs, walks and the AI's
  turn, and drops a drag, held arrow key or edge scroll in progress; edge
  scrolling waits 180 ms at the edge; arrow keys pan only the visible map;
  wheel deltas gather into one zoom step per notch or flick. The camera
  glides (eased, `glideTo`) on hero switches, before a walk, after a
  waystone, along the AI's visible walks and to the human's hero at the
  start of its turn; reduced motion snaps. Visit outcomes, experience and
  mine claims float up from the hero (`floatText`) instead of toasting at
  the top; a flying pickup is its own toast, and under reduced motion its
  line floats in place. Evidence: `node tests/ui/map-view-check.mjs [url]
[dir] [ai]`.
- Evidence: `node tests/ui/fx-check.mjs [url] [dir] [only]` draws frame
  strips with the battle route `strip=` (a manual clock, so frames repeat
  exactly) and timed map and interface frames.
