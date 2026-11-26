# Imported from Pulp Wars

Bead border_marches-xaj.4. The user: "FEEL FREE TO REUSE SPRITES from the
other game". These 233 PNGs (and 26 more for the v0.2 factions and strays,
bead border_marches-bzc.14, [listed last](#v02-factions-and-strays-bead-border_marches-bzc14)) were copied byte for byte (no pixel edits, no
PixelLab calls) from the sister project Pulp Wars,
`/Users/nadbor/projects/pulp_wars` (working tree of branch `main`, commit
`42529e562f83f36869ddc62e7ec08ecbddf9bef1`, 2026-11-15), and renamed to
kebab-case paths under `public/assets/`. The registry with their metadata is
`src/assets/manifest.ts`; `tests/assets/manifest.test.ts` checks every
entry's size against its PNG header and its bytes against the sha256 below
(the source and destination hashes are identical: the files are copies).

Contact sheet: [sheets/imported.png](sheets/imported.png) (each image native
on light and dark).

## Counts

| Category | Files |
| --- | --- |
| Units | 36 (13 added by bead bzc.14) |
| Portraits | 36 (13 added by bead bzc.14) |
| Towns | 0 (7 replaced by studio art, bead bzc.97) |
| Textured grounds | 5 |
| Ground swatches | 5 |
| Water | 4 |
| Mountain massif pieces | 28 |
| Mountain extras | 2 |
| Forest pieces | 100 |
| Forest seam clumps | 18 |
| Map objects | 18 |
| **Total** | **252** |

## How these files relate to the studio pipeline

They are not studio recipes: they have no recipe, record or verdict under
`art/sets/`, and `node tools/art/studio-art.mjs validate` only checks sets, so
it neither covers nor complains about them. They are exempted from the
recipe/record/verdict rules as imported, previously accepted Pulp Wars art.
Their integrity check is this table plus `tests/assets/manifest.test.ts`
(size from the PNG header, sha256 against this table, and no PNG under
`public/assets/` missing from the manifest). Replacing one of them with new
art goes through the pipeline as usual and updates this table.

## Where the metadata comes from

All from Pulp Wars source at the commit above:

- **Unit and town anchors**: `src/assets/chibi-direction-*-art-manifest.ts`
  and `chibi-curiosities-art-manifest.ts` (`anchor`, else the class default
  of `chibiAnchorV7` in `src/assets/chibi-art-v7.ts`: units, towns and
  buildings bottom-centre at (w/2, h-40); resources centred).
- **Unit feet**: `src/render/canvas/unit-shadow-measurements-v7.generated.ts`
  (contactY, foot and base extents).
- **Town ground line**: `src/render/canvas/settlement-shadow-measurements-v7.generated.ts`.
- **Town pennant anchors**: `DIRECTION_FLAG_ANCHORS_V7` in
  `src/render/canvas/visual-direction-v7.ts` (the village has none).
- **Ground texture periods**: `FACTION_GRASS_WORLDS_V7` in
  `src/assets/faction-grass-manifest.ts` (grass 8x8, jungle 6x6, steppe 8x8,
  badlands 8x8, wasteland 8x8 cells of 80 px).
- **Mountain pieces**: `src/assets/chibi-mountain-ranges.json` and
  `chibi-massif-v7.ts` (low pieces 24 px above the footprint, tall 48 px;
  ridges two cells wide; one mine).
- **Forest pieces and seam clumps**: `src/assets/chibi-forest-pieces.json`
  (the default forest, used here for grass) and
  `src/assets/faction-forest-pieces.json` (DINOSAUR for jungle, GOBLIN for
  steppe, MARTIAN for badlands, UNDEAD for wasteland); footprints from
  `FOREST_SHAPES_V7` in `chibi-forest-packing-v7.ts`. Every piece has 24 px
  of crown above its footprint. The bake-time parameters in those JSON files
  (`lattice`, `soften`) only describe how Pulp Wars stamped the pieces and
  are not needed to draw them.

## Terrain mapping

| border_marches terrain | Pulp Wars ground | Forest set |
| --- | --- | --- |
| grass | NEUTRAL (default Grass) | default Forest |
| jungle | DINOSAUR | DINOSAUR |
| steppe | GOBLIN | GOBLIN |
| badlands | MARTIAN | MARTIAN |
| wasteland | UNDEAD | UNDEAD |

## Renames worth knowing

- `chibi-direction-` and `chibi-curiosity-` prefixes are dropped; the
  neutral monsters keep their Pulp Wars faction as a prefix
  (`goblin-troll`), the curiosities' monsters do not (`bigfoot`).
- Mountain range pieces are named by kind: `chibi-mountain-range-1x1-x` is
  `low-single-x`, `2x1-x` is `low-ridge-x`, `1x1-tall-x` is `tall-single-x`,
  `2x1-tall-x` is `tall-ridge-x`, `mine-a` stays `mine-a`, and its
  `.master.png` (the mine flattened onto grass, for the interface) is
  `mine-a-composite.png`.
- Forest seam clumps are renumbered 1..n per set in clump order; the default
  forest's seams 1, 2, 4, 5 became `grass/seam-1..4`.
- `chibi-ore-2` (Pulp Wars' current ore, which replaced `chibi-ore`) is
  `objects/ore.png`.

## Not imported, and why

- **Roads, coast, fog of war**: Pulp Wars draws the dirt roads
  (`dirt-road-v7.ts`), the coast sand and surf (`coast-sand-v7.ts`) and the
  fog, its puffs and lift (`fog-of-war-v7.ts`, `fog-puff-v7.ts`,
  `fog-lift-v7.ts`) in code; there is no raster to import. The renderer bead
  ports the code.
- **Owner masks** (`*.mask.png`): the direction art is fixed-colour; masks
  belong to Pulp Wars' classic look.
- **@2x/@3x variants**: none exist in Pulp Wars' `public/assets/chibi`.
- **Fonts**: Pulp Wars ships no local font files; it uses the npm packages
  `@fontsource/bowlby-one` 5.3.0 (display) and `@fontsource/public-sans`
  5.3.0 (body). Adding them is a dependency change for a later UI bead.

## Files

Source paths are relative to the Pulp Wars repository root.

### Units

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/units/chibi-direction-dinosaur-caveman.png` | `public/assets/units/dinosaur-caveman.png` | 56x80 | `dab39f0c908e476919c6beff0708540370779dc726382af3adb4a38d29019456` |
| `public/assets/chibi/units/chibi-direction-dinosaur-spitter.png` | `public/assets/units/dinosaur-spitter.png` | 56x80 | `6367062a9d798b6efe3ca52eeebd1f7d1af02e9c872c198fce104fa90db1c7f9` |
| `public/assets/chibi/units/chibi-direction-dinosaur-raptor.png` | `public/assets/units/dinosaur-raptor.png` | 72x88 | `b9f70256e532f6fd97e44448056f012010acd7816f99cea4f7b426c8ffb77cf9` |
| `public/assets/chibi/units/chibi-direction-dinosaur-shaman.png` | `public/assets/units/dinosaur-shaman.png` | 56x80 | `4a8f1c8717e7ac4d76366e69601ed85ed98a6817f5b90d51189e666ee8884e18` |
| `public/assets/chibi/units/chibi-direction-dinosaur-triceratops.png` | `public/assets/units/dinosaur-triceratops.png` | 72x88 | `50190af30d1c69734abbcf8d078d004c9de84e43fa868cae513ab2c05bc3c540` |
| `public/assets/chibi/units/chibi-direction-dinosaur-t-rex.png` | `public/assets/units/dinosaur-t-rex.png` | 72x88 | `dcc37823c0f4879493c10fd7a5c9cbad20744f40fda397a31bef791c39425b38` |
| `public/assets/chibi/units/chibi-direction-dinosaur-stegosaurus.png` | `public/assets/units/dinosaur-stegosaurus.png` | 72x88 | `67c6eacfdbdcf70bb9897393b331880952c57036adcc201383f44ced0222d2fc` |
| `public/assets/chibi/units/chibi-direction-dinosaur-ankylosaurus.png` | `public/assets/units/dinosaur-ankylosaurus.png` | 56x80 | `52ee51015a364e0e9ddf23748b334833346b4eccee32eb97acfb07ea7cb7f5ce` |
| `public/assets/chibi/units/chibi-direction-dinosaur-brontosaurus.png` | `public/assets/units/dinosaur-brontosaurus.png` | 88x104 | `c2f9fa013c903a4e9360c35ca80e59b4d74c2d627ca021621ff732ad6db01f37` |
| `public/assets/chibi/units/chibi-direction-goblin-goblin.png` | `public/assets/units/goblin-goblin.png` | 56x80 | `1586227bc2cef1771e1155bff58c15b1f47e33b0b16f0cae39f8c006286b6209` |
| `public/assets/chibi/units/chibi-direction-goblin-wolf-rider.png` | `public/assets/units/goblin-wolf-rider.png` | 72x88 | `5b2b9a4c286b4c027d164bb4c73bc0c2924a4fcd160be8b4e353889f2cf6fd90` |
| `public/assets/chibi/units/chibi-direction-goblin-bomb-chucker.png` | `public/assets/units/goblin-bomb-chucker.png` | 56x80 | `370a259c23b1eb8480c0eb189a5c00517a0299b56f3af80e63592c85c106bf63` |
| `public/assets/chibi/units/chibi-direction-goblin-orc-brute.png` | `public/assets/units/goblin-orc-brute.png` | 56x80 | `f83f9799352e061030a5dea551256f031d829585e7e1b5bf2ae2b6812e40420e` |
| `public/assets/chibi/units/chibi-direction-goblin-troll.png` | `public/assets/units/goblin-troll.png` | 88x104 | `be016ab2d5b5ce203309af8c7eb2d65e3d278102e149950f16e9e969ca65f5c9` |
| `public/assets/chibi/units/chibi-direction-goblin-ogre.png` | `public/assets/units/goblin-ogre.png` | 72x88 | `680b0956652021d68b41f67c86afe3e473aa54af07a38eed638c32a7a6fe9263` |
| `public/assets/chibi/units/chibi-direction-goblin-orc-warboss.png` | `public/assets/units/goblin-orc-warboss.png` | 56x80 | `6e2c2611e9199f79bbd0d3e67a44910b34560c363ac02f90975a7f23267beefd` |
| `public/assets/chibi/units/chibi-direction-undead-skeleton.png` | `public/assets/units/undead-skeleton.png` | 56x80 | `bd0352cddde0a7a81b8462d388de2e5d6daabe6f046b5209d512d3f79e8ae9d7` |
| `public/assets/chibi/units/chibi-direction-undead-zombie.png` | `public/assets/units/undead-zombie.png` | 56x80 | `5c73ef4e66a4ea423a528ab49757f5dca38fbf80fed7ef481c4c5a8734bb6b34` |
| `public/assets/chibi/units/chibi-direction-undead-vampire.png` | `public/assets/units/undead-vampire.png` | 72x88 | `6edd4d41c4fdc3e3330b49d6033507c775337c010726dcf2f1054e399599804a` |
| `public/assets/chibi/units/chibi-direction-martian-grunt.png` | `public/assets/units/martian-grunt.png` | 56x80 | `016dd1020030d197e1a5c115d8790b23106bc70f8ddc7fda064ca98affe790d9` |
| `public/assets/chibi/units/chibi-direction-martian-tripod.png` | `public/assets/units/martian-tripod.png` | 72x88 | `ae5b1f992585421b4260e228082a49852da80ac45668b16cd2d6b4a13c56f71a` |
| `public/assets/chibi/units/chibi-curiosity-bigfoot.png` | `public/assets/units/bigfoot.png` | 88x96 | `2c93f1ca9910c4a0a701a4bca5d7afd72f39016ba04e741745d3ec9c2890a57e` |
| `public/assets/chibi/units/chibi-curiosity-giant-spider.png` | `public/assets/units/giant-spider.png` | 88x72 | `14d4b16b1977f9963cca4c5252d814e2a5b3a1e83f0acb297558833eda9bfabf` |

### Portraits

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-caveman.png` | `public/assets/portraits/dinosaur-caveman.png` | 48x48 | `cccf4fe65c61a18c0d293d1aa4325bd95b75ebd1c892c576adca550455ea6ba9` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-spitter.png` | `public/assets/portraits/dinosaur-spitter.png` | 48x48 | `591b46ab7362052883eeca5cdcf254fa9778ece48bc648f87fb6995e95f269e6` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-raptor.png` | `public/assets/portraits/dinosaur-raptor.png` | 48x48 | `73373a1638caaad95b2ab5bdbb7a5bed26fdc93e6fc30a6336be7bc66612f51b` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-shaman.png` | `public/assets/portraits/dinosaur-shaman.png` | 48x48 | `e77e1b2abb55be883a50463f67165f78d869dae19eb621769757c6ae8c91ece2` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-triceratops.png` | `public/assets/portraits/dinosaur-triceratops.png` | 48x48 | `47b05ced5bfe35ba6ffe1be84e6781d53e349559bb478dc9cbb7f18e53dfd128` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-t-rex.png` | `public/assets/portraits/dinosaur-t-rex.png` | 48x48 | `0e8194d7363c5259bbcdbb27668c0150782e1f2d66be4d6b708ec1a82c9c6d67` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-stegosaurus.png` | `public/assets/portraits/dinosaur-stegosaurus.png` | 48x48 | `f689ee362b04366b75209baa0dba48c74c916a40a4013157dffc8e4fe461c063` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-ankylosaurus.png` | `public/assets/portraits/dinosaur-ankylosaurus.png` | 48x48 | `89de6a21a6baf2f018703be4d90d96a4c47f64af1fa2b049cf141af140ee9e93` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dinosaur-brontosaurus.png` | `public/assets/portraits/dinosaur-brontosaurus.png` | 48x48 | `adac35012a7413d6418f2690ff752b9554c4f3f3bdff1e75b9adba8f4a06d388` |
| `public/assets/chibi/portraits/chibi-direction-portrait-goblin-goblin.png` | `public/assets/portraits/goblin-goblin.png` | 48x48 | `a1f706b981cfc1b2ab79626a37a82bf9440d722d13c33f56625ee7195480277e` |
| `public/assets/chibi/portraits/chibi-direction-portrait-goblin-wolf-rider.png` | `public/assets/portraits/goblin-wolf-rider.png` | 48x48 | `cbbddcac18017ee1e21c75d7060e75b101be1bf5da48211661017be93e10e747` |
| `public/assets/chibi/portraits/chibi-direction-portrait-goblin-bomb-chucker.png` | `public/assets/portraits/goblin-bomb-chucker.png` | 48x48 | `985419fd9fe59a6efd57a51697573b4ea8592fa335e98b9fe3eaa87a4d8f1620` |
| `public/assets/chibi/portraits/chibi-direction-portrait-goblin-orc-brute.png` | `public/assets/portraits/goblin-orc-brute.png` | 48x48 | `9465770e89267bf50d996586c8635d07e459f90aa12b2665f45972ec936cc206` |
| `public/assets/chibi/portraits/chibi-direction-portrait-goblin-troll.png` | `public/assets/portraits/goblin-troll.png` | 48x48 | `9594f9848903c5d82c63f1d837d8059fafd7c434c128c1a594005787302b6cf3` |
| `public/assets/chibi/portraits/chibi-direction-portrait-goblin-ogre.png` | `public/assets/portraits/goblin-ogre.png` | 48x48 | `53b91e74d7a50d363acc279a9916bc4c8803fe6b081eed0385c1b05b3d587160` |
| `public/assets/chibi/portraits/chibi-direction-portrait-goblin-orc-warboss.png` | `public/assets/portraits/goblin-orc-warboss.png` | 48x48 | `5ba378768bc5f0c8e3c46928624f01f46e3aad4c54f5aeb732f8a9947fdb06b7` |
| `public/assets/chibi/portraits/chibi-direction-portrait-undead-skeleton.png` | `public/assets/portraits/undead-skeleton.png` | 48x48 | `2124e69ee809149b92bcf1dd5425c510d0ef82d1210997cb6904ff3d18a1e592` |
| `public/assets/chibi/portraits/chibi-direction-portrait-undead-zombie.png` | `public/assets/portraits/undead-zombie.png` | 48x48 | `57c9416575d2c6feaafedaeb7e071a8da759681d81d9aa837ec522582ccfcf1f` |
| `public/assets/chibi/portraits/chibi-direction-portrait-undead-vampire.png` | `public/assets/portraits/undead-vampire.png` | 48x48 | `a41bce4a71bfded78a66f353ee909b5a072721ea0c1d9c26d7c3eeefd5f921ec` |
| `public/assets/chibi/portraits/chibi-direction-portrait-martian-grunt.png` | `public/assets/portraits/martian-grunt.png` | 48x48 | `7c48d20b9f4704e37fcfe5b05baa752aedb83d778bd08b154b992b4a656f4f83` |
| `public/assets/chibi/portraits/chibi-direction-portrait-martian-tripod.png` | `public/assets/portraits/martian-tripod.png` | 48x48 | `6a19cdcfaaf0bee58ccd2cee6b1fe93914e4526c6da8bb3a3797200bbdadfb8d` |
| `public/assets/chibi/portraits/chibi-curiosity-portrait-bigfoot.png` | `public/assets/portraits/bigfoot.png` | 48x48 | `7119dea31fd318dda01a2b59794b1ae8db4318cddcab2fbf6949f1fcce746a53` |
| `public/assets/chibi/portraits/chibi-curiosity-portrait-giant-spider.png` | `public/assets/portraits/giant-spider.png` | 48x48 | `ed3c09a84729afba0b231a9d1071297146fc59148d39e3a37a40e422766a058c` |

### Towns

None left. The seven imported towns (`dinosaur-city-1` to `-3`,
`goblin-city-1` to `-3` and `village`, from
`public/assets/chibi/settlements/chibi-direction-<name>.png` in Pulp Wars)
were replaced at the same paths and sizes by studio art in bead bzc.97 (set
`chunky-towns`, see [classes/towns.md](classes/towns.md)); the originals
stay in Pulp Wars and in this repository's git history. The `towns-3x2`
recipes that name `public/assets/towns/goblin-city-3.png` as their style
image were generated from the imported file (sha256
`51fa40e9fe9cce62eb0510740dfa87283a555b4bc5f5c0c2c984727a30e11bf0`).

### Textured grounds

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/terrain/faction-grass/world/chibi-neutral-ground.png` | `public/assets/terrain/grounds/grass.png` | 640x640 | `0ccd5041b0765dc6e1484732457380b8206b741c33f2292f951193846ef7f860` |
| `public/assets/chibi/terrain/faction-grass/world/chibi-dinosaur-ground.png` | `public/assets/terrain/grounds/jungle.png` | 480x480 | `395fa0894c382cb695427f4427a37e8bdd1fc9689f0a39a1d9e7e9eb58274231` |
| `public/assets/chibi/terrain/faction-grass/world/chibi-goblin-ground.png` | `public/assets/terrain/grounds/steppe.png` | 640x640 | `e0ae06945a032e7dd9434f3199620b11f5213080a1e82522b044cd3505c48e49` |
| `public/assets/chibi/terrain/faction-grass/world/chibi-martian-ground.png` | `public/assets/terrain/grounds/badlands.png` | 640x640 | `319f8228b04b7a331d437d66a7fefd87307271ffde116cb2adeb69c9a8ac05eb` |
| `public/assets/chibi/terrain/faction-grass/world/chibi-undead-ground.png` | `public/assets/terrain/grounds/wasteland.png` | 640x640 | `f3181d92e95f3ad8d02dd5d842e6fd065716c2709f97c8409ca842282979d32a` |

### Ground swatches

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/terrain/faction-grass/chibi-neutral-grass-1.png` | `public/assets/terrain/grounds/grass-swatch.png` | 80x80 | `e734f203c72f94ec128907b44e0e25d942219f09eb94e6e543d3b4172cf7d2c9` |
| `public/assets/chibi/terrain/faction-grass/chibi-dinosaur-grass-1.png` | `public/assets/terrain/grounds/jungle-swatch.png` | 80x80 | `abc87b61c408182c4bf8213a5b4f4d631140495f1dbbec46dbab9366ab92bb92` |
| `public/assets/chibi/terrain/faction-grass/chibi-goblin-grass-1.png` | `public/assets/terrain/grounds/steppe-swatch.png` | 80x80 | `e37cffea072bcf14a1e03862407c34fdade345ff0bcd16112437759d339dd959` |
| `public/assets/chibi/terrain/faction-grass/chibi-martian-grass-1.png` | `public/assets/terrain/grounds/badlands-swatch.png` | 80x80 | `cf5ec1614d86e9f0402f2f5a87951873f4db034c700d6742553b2ae374ee684e` |
| `public/assets/chibi/terrain/faction-grass/chibi-undead-grass-1.png` | `public/assets/terrain/grounds/wasteland-swatch.png` | 80x80 | `8557f6cdf174cd10774b29bd65ec91f92df7cef002e9c687b217711ed7b16838` |

### Water

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/terrain/chibi-shallow-water-1.png` | `public/assets/terrain/water/shallow-1.png` | 80x80 | `33a873598d926328594bf821f3c3d0414ce5ff2bc3a40f0a77d4d6adaf9afe6e` |
| `public/assets/chibi/terrain/chibi-shallow-water-2.png` | `public/assets/terrain/water/shallow-2.png` | 80x80 | `f3a2862c9f5ddb7a1961b71447a25a2eb4d69203d616979f81602ebcc820c167` |
| `public/assets/chibi/terrain/chibi-deep-water-1.png` | `public/assets/terrain/water/deep-1.png` | 80x80 | `4765e99575277bfb737da2eccabcbb5e90c878e6b040befc2fb3ee484a49161d` |
| `public/assets/chibi/terrain/chibi-deep-water-2.png` | `public/assets/terrain/water/deep-2.png` | 80x80 | `f4efb33f22e105f68c5a4719c79a90c8be8178506ba27e322262124a457b5fee` |

### Mountain massif pieces

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-a.png` | `public/assets/terrain/mountains/low-single-a.png` | 80x104 | `546b42b624675ba57abdcfde528e88bcb34ddc4602e79063a2aa9b883f997f52` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-b.png` | `public/assets/terrain/mountains/low-single-b.png` | 80x104 | `06039e86b8c99727ffead391b4e7bf5264eabc2a930f2dc3d83f50beff92dbf0` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-c.png` | `public/assets/terrain/mountains/low-single-c.png` | 80x104 | `6aa845f06eef310f700b3d82c77b96469367c4b5900752695aa23e8f628740a6` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-d.png` | `public/assets/terrain/mountains/low-single-d.png` | 80x104 | `8b0195c4f716e273e61166e473663500b29069768a879499d0e049515b449d40` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-e.png` | `public/assets/terrain/mountains/low-single-e.png` | 80x104 | `60dc1d98b4ae46b451c4144a4fbb39abbb112ccfa0bf49bdbc044c20ed18681c` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-f.png` | `public/assets/terrain/mountains/low-single-f.png` | 80x104 | `314cf54dce0902a5478f400895255882791537b2fb65034865bf6bd182f287b1` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-g.png` | `public/assets/terrain/mountains/low-single-g.png` | 80x104 | `edd56d7fe8b27c06c4f5a553e49cb02d7e4df76b66d5d066141b71bf99033d7d` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-h.png` | `public/assets/terrain/mountains/low-single-h.png` | 80x104 | `0d4d7bfe7be0354cbb5242335522334e4b864225044175be1e414a8d2b8ab7a3` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-a.png` | `public/assets/terrain/mountains/low-ridge-a.png` | 160x104 | `7dfcd6b369df1818a8af557e0f7acec1170d485670002e2a4c8e05a2b4305e79` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-b.png` | `public/assets/terrain/mountains/low-ridge-b.png` | 160x104 | `f24f60f00d7be7f5cf451f927c7ee9affbf7a804e41132cba749f0c360e18bc3` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-c.png` | `public/assets/terrain/mountains/low-ridge-c.png` | 160x104 | `7b9a48a7dac7c7fe37509c8f631b1751584a3f23e0b003d16ea394baad68db18` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-d.png` | `public/assets/terrain/mountains/low-ridge-d.png` | 160x104 | `b82d6b98d868c0a10943cf6f01ba588c040649b632910ca02babc7973a70f5c4` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-e.png` | `public/assets/terrain/mountains/low-ridge-e.png` | 160x104 | `5e33a128ac9a15162b40c0f52b51d50f855cef903e1ee986a008ea6f3b540c67` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-f.png` | `public/assets/terrain/mountains/low-ridge-f.png` | 160x104 | `cfa510d15d566f56a053a14ce39303adc5d26df2724711728161869607fa6448` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-g.png` | `public/assets/terrain/mountains/low-ridge-g.png` | 160x104 | `670e7a214b8831a0d826f1de6bace32d6a82092ef5aa3184c06a46ed36dea2c3` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-tall-a.png` | `public/assets/terrain/mountains/tall-single-a.png` | 80x128 | `e2b75a63b327ade160648550bcdf0553e6b8e65cf9d4e9224242479ee6ea9e98` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-tall-b.png` | `public/assets/terrain/mountains/tall-single-b.png` | 80x128 | `f6ab27ec0609be01f18b7a6af213f4c93908422562eb92414c66a3e7c0a7921e` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-tall-c.png` | `public/assets/terrain/mountains/tall-single-c.png` | 80x128 | `b2ec3fbde0b820620c43771364e365219860efbb9721c68a27b8bba7664c0afa` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-tall-d.png` | `public/assets/terrain/mountains/tall-single-d.png` | 80x128 | `f01c47e5b26cb8823f4b9a2dbb62e13662c0c557776bd40374239492b2d7f23c` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-tall-e.png` | `public/assets/terrain/mountains/tall-single-e.png` | 80x128 | `2f11c3676e4ab9608260069346620d535573eea8f0a7235a2b417764cd618b49` |
| `public/assets/chibi/mountains/chibi-mountain-range-1x1-tall-f.png` | `public/assets/terrain/mountains/tall-single-f.png` | 80x128 | `70ca705fe6d6aa3a89a0265ee327fb68e6d6c484778926ce053da2cf614a1161` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-tall-a.png` | `public/assets/terrain/mountains/tall-ridge-a.png` | 160x128 | `90f4dcbf2100d74369b2f2cd2fb9f2a30d0eb586c3340a6d21b1a6842d66983a` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-tall-b.png` | `public/assets/terrain/mountains/tall-ridge-b.png` | 160x128 | `b71a0fcbc1984fe8b7bab5cb46dc2c3832f4f5ae73ac430987cc89073fc650bd` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-tall-c.png` | `public/assets/terrain/mountains/tall-ridge-c.png` | 160x128 | `7daf3bc75e1442c3c9a69f7953d1b2ee1edae681164775b9837e93f39276fe35` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-tall-d.png` | `public/assets/terrain/mountains/tall-ridge-d.png` | 160x128 | `0cb0f0df160f5604a8815d92cdfb9ef622cf31dfefd2bb2ed479c5b9b6852c13` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-tall-e.png` | `public/assets/terrain/mountains/tall-ridge-e.png` | 160x128 | `906432fc2deb0088e97f9b9f7458fdd1b88d1dcac14ec8a0505dd631b2ee7dd3` |
| `public/assets/chibi/mountains/chibi-mountain-range-2x1-tall-f.png` | `public/assets/terrain/mountains/tall-ridge-f.png` | 160x128 | `ef7389b9d32ed41db943741e61e8a5cc55413e3ce84e664376225b58e1748666` |
| `public/assets/chibi/mountains/chibi-mountain-range-mine-a.png` | `public/assets/terrain/mountains/mine-a.png` | 80x104 | `385474a38fb3a1ab8f06d0a355051218f56c2b002d755b0220dc2462e657052c` |

### Mountain extras

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/mountains/chibi-mountain-range-mine-a.master.png` | `public/assets/terrain/mountains/mine-a-composite.png` | 80x104 | `cfc428b5c54838387b8207710bf58ec6acc43bc0c27991592d20371c7ac38c67` |
| `public/assets/chibi/terrain/chibi-mountain-ground-1.png` | `public/assets/terrain/mountains/ground-1.png` | 80x80 | `c1c2f2df6900948ff445bb65c8919f537f9f8d10fe909d30dc369494d31e2802` |

### Forest pieces

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/forest/chibi-forest-piece-1x1-a.png` | `public/assets/terrain/forest/grass/piece-1x1-a.png` | 80x104 | `958d045a5943904dfa2ebe9150c5a5b708228c15c9d407c44fc7a2789a7815d3` |
| `public/assets/chibi/forest/chibi-forest-piece-1x1-b.png` | `public/assets/terrain/forest/grass/piece-1x1-b.png` | 80x104 | `0713b8d0afef1274f7c8c4de2534a0a95cfb08aaf7b432c52c5e156ea641c159` |
| `public/assets/chibi/forest/chibi-forest-piece-1x1-c.png` | `public/assets/terrain/forest/grass/piece-1x1-c.png` | 80x104 | `190333e5658f1d306dbc3da98cbcd48e041400b1164f1e15ed1f5aaf4974334a` |
| `public/assets/chibi/forest/chibi-forest-piece-2x1-a.png` | `public/assets/terrain/forest/grass/piece-2x1-a.png` | 160x104 | `b7ec05773cf37d95cf789e5d5af1814abfadd289657d42f874cfd52f4bf1d44e` |
| `public/assets/chibi/forest/chibi-forest-piece-2x1-b.png` | `public/assets/terrain/forest/grass/piece-2x1-b.png` | 160x104 | `a0e664749fd797acd54ebdfdde6d4fa68deedef9aa8432531904f9be217c9127` |
| `public/assets/chibi/forest/chibi-forest-piece-2x1-c.png` | `public/assets/terrain/forest/grass/piece-2x1-c.png` | 160x104 | `be983090def131a10599787ee47d5d53e45b2985de6ea24239e84897f8506c04` |
| `public/assets/chibi/forest/chibi-forest-piece-1x2-a.png` | `public/assets/terrain/forest/grass/piece-1x2-a.png` | 80x184 | `6a354f818e6a3015cb741283fff6b22c6f407dc189d6d46f85a8716a9407e5a7` |
| `public/assets/chibi/forest/chibi-forest-piece-1x2-b.png` | `public/assets/terrain/forest/grass/piece-1x2-b.png` | 80x184 | `39d711d7ba66dcd70dc0b7e4865296e41de612d21dd88dafbd8ff4c6205c7744` |
| `public/assets/chibi/forest/chibi-forest-piece-1x2-c.png` | `public/assets/terrain/forest/grass/piece-1x2-c.png` | 80x184 | `6d14ce03d0f1bb108e08a6414dacf23420229ac5c3ae3a9063a2b13d5ffce22f` |
| `public/assets/chibi/forest/chibi-forest-piece-2x2-a.png` | `public/assets/terrain/forest/grass/piece-2x2-a.png` | 160x184 | `9ffd36515533c787a16b900a03810f508dcb28cf60a61f834a0fc52a47a013ff` |
| `public/assets/chibi/forest/chibi-forest-piece-2x2-b.png` | `public/assets/terrain/forest/grass/piece-2x2-b.png` | 160x184 | `0a8b155ed8e3ab279ac4bf4fb34041884db8424ba8a7556dae181779429fe556` |
| `public/assets/chibi/forest/chibi-forest-piece-2x2-c.png` | `public/assets/terrain/forest/grass/piece-2x2-c.png` | 160x184 | `6dfe75c32ffa7f32fa7d5250845285085d70e738c72a694cc60c1f14faf410d3` |
| `public/assets/chibi/forest/chibi-forest-piece-l-nw-a.png` | `public/assets/terrain/forest/grass/piece-l-nw-a.png` | 160x184 | `e24944f90aa9fdaf0b40ad32e3c3615e67a7e3475d73c82a1baca94c806fad2d` |
| `public/assets/chibi/forest/chibi-forest-piece-l-nw-b.png` | `public/assets/terrain/forest/grass/piece-l-nw-b.png` | 160x184 | `40106077ec241fd956dc55b5d291d62a4e32c06cd6b698f33d3f17bcfb2a2142` |
| `public/assets/chibi/forest/chibi-forest-piece-l-ne-a.png` | `public/assets/terrain/forest/grass/piece-l-ne-a.png` | 160x184 | `04d691f06d10a332a50a89e69802e32d20b5135624d49d454c7cc436511770e4` |
| `public/assets/chibi/forest/chibi-forest-piece-l-ne-b.png` | `public/assets/terrain/forest/grass/piece-l-ne-b.png` | 160x184 | `99d26c7c716fdf23f41480a6a5d3e7794008ef38708ca4f7c2a1ec6d8d31eb57` |
| `public/assets/chibi/forest/chibi-forest-piece-l-sw-a.png` | `public/assets/terrain/forest/grass/piece-l-sw-a.png` | 160x184 | `600a9982e1884f47494ba1d5ab1385ab96014d4acc8281b9babce4b1608bb87c` |
| `public/assets/chibi/forest/chibi-forest-piece-l-sw-b.png` | `public/assets/terrain/forest/grass/piece-l-sw-b.png` | 160x184 | `59ca7b0763cd8af914c7ce1ca4e01817c5a978a8584b5ae9481f16919e04eeb2` |
| `public/assets/chibi/forest/chibi-forest-piece-l-se-a.png` | `public/assets/terrain/forest/grass/piece-l-se-a.png` | 160x184 | `e6ca61b94bc5d31989bf8a70241d70140dd163a1bd2fad9d99cefdf641c363d7` |
| `public/assets/chibi/forest/chibi-forest-piece-l-se-b.png` | `public/assets/terrain/forest/grass/piece-l-se-b.png` | 160x184 | `7b298d50d6eb6ccb77421240558c85c3828e1cbcd8e9b0a8287cfadd7b01c68f` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-1x1-a.png` | `public/assets/terrain/forest/jungle/piece-1x1-a.png` | 80x104 | `1efb99937ff14636e3f956e039ec7b89b7a7f821861df75e0241505495a27c98` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-1x1-b.png` | `public/assets/terrain/forest/jungle/piece-1x1-b.png` | 80x104 | `9f18e51478d656189061cdc3e33817e90fbfd5592cf6f143130b58a9a8d6fc53` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-1x1-c.png` | `public/assets/terrain/forest/jungle/piece-1x1-c.png` | 80x104 | `adef3dce4854fd51b38b798f4724b1261463637b123a23226241b5b565854718` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-2x1-a.png` | `public/assets/terrain/forest/jungle/piece-2x1-a.png` | 160x104 | `aed786f8a1b0a171c5268994069517efb52f7f571f40a0e08492110eccbcde61` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-2x1-b.png` | `public/assets/terrain/forest/jungle/piece-2x1-b.png` | 160x104 | `d04525ea5e8f425009d55b1f4dab41f907bb19a52201b18ef76d8eea39638c27` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-2x1-c.png` | `public/assets/terrain/forest/jungle/piece-2x1-c.png` | 160x104 | `e1904cd4580ef82e532358a738f80e2952878a8f38fee4828bdf1810efcd8e4f` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-1x2-a.png` | `public/assets/terrain/forest/jungle/piece-1x2-a.png` | 80x184 | `3f7d73b50bfd322f1b3718bb76d9e025bd32926edbddc6ddf6ef8f0268061737` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-1x2-b.png` | `public/assets/terrain/forest/jungle/piece-1x2-b.png` | 80x184 | `b0a09649723407d4ac56fd755ce40d23149e0376bb441b241b5227d8e494896e` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-1x2-c.png` | `public/assets/terrain/forest/jungle/piece-1x2-c.png` | 80x184 | `ad7faad6c250b896fc2213de071ee1205fcab777b8b9ebc4500c6dd0035bd06e` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-2x2-a.png` | `public/assets/terrain/forest/jungle/piece-2x2-a.png` | 160x184 | `58aee77d7ed2c269618b5e4ee9fe7bfc853b881051582f0fb50a234fd5590550` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-2x2-b.png` | `public/assets/terrain/forest/jungle/piece-2x2-b.png` | 160x184 | `8994c60ee077de4467f8c2729b581410f1c9846ece8fa3f3f5861f5047ffdf4e` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-2x2-c.png` | `public/assets/terrain/forest/jungle/piece-2x2-c.png` | 160x184 | `443bf3ed7af2d4c00e7009dbc8353bdec45dcd2ef76b94b2d5c93e0d2512e4ba` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-l-nw-a.png` | `public/assets/terrain/forest/jungle/piece-l-nw-a.png` | 160x184 | `8078e071b2b54ee9d129d6424f17d9fd1b2072ff1205cc337d047f505eb7676c` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-l-nw-b.png` | `public/assets/terrain/forest/jungle/piece-l-nw-b.png` | 160x184 | `e4f271d039806e07c75607b6cb1f95b0f140194ac0678a9766ddc28c1a669485` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-l-ne-a.png` | `public/assets/terrain/forest/jungle/piece-l-ne-a.png` | 160x184 | `1f259be3a2777386ee7c162c4f3a2bced84df6d31b558b32c1a8d88555528b42` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-l-ne-b.png` | `public/assets/terrain/forest/jungle/piece-l-ne-b.png` | 160x184 | `52cfa2b23e03dabb3ab94f4816132ba25139fbbc592a19b437a120f41ca8cd09` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-l-sw-a.png` | `public/assets/terrain/forest/jungle/piece-l-sw-a.png` | 160x184 | `8fba0cecab4c6b02c4f6333df9cebb93b0ae204448754dac131bcba712490bf0` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-l-sw-b.png` | `public/assets/terrain/forest/jungle/piece-l-sw-b.png` | 160x184 | `2fd06c66d39abe5383989a7d7a89abf1a1379054932fe6654918b26dd0ade0ec` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-l-se-a.png` | `public/assets/terrain/forest/jungle/piece-l-se-a.png` | 160x184 | `fb3868e6ca64f415142d7ccc6ad871389e119dadb4e2112a9c1c56569ce0bc4e` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-piece-l-se-b.png` | `public/assets/terrain/forest/jungle/piece-l-se-b.png` | 160x184 | `1386b868d6ec15fcca711d7477b055acc6a011ea2f82619adba0c2eb4d3d2e8c` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-1x1-a.png` | `public/assets/terrain/forest/steppe/piece-1x1-a.png` | 80x104 | `4177b75a0fd874a3b6a247ed0f4f5519adac66bedb645ad49dfaa9e8aa46cef2` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-1x1-b.png` | `public/assets/terrain/forest/steppe/piece-1x1-b.png` | 80x104 | `aaf9a8c66fa1a1c4f945bdc9a8ce26023f3140fed847ecede6d09f3f4dff4658` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-1x1-c.png` | `public/assets/terrain/forest/steppe/piece-1x1-c.png` | 80x104 | `02095b7bf02a9969610aabe70822945817b783b088dac4d47d6a5b1c43b24e05` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-2x1-a.png` | `public/assets/terrain/forest/steppe/piece-2x1-a.png` | 160x104 | `d4c3ad467415b505207932f1b36a1bdc6dfcf6cd624b93a2c34bbe8f2d8ba31c` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-2x1-b.png` | `public/assets/terrain/forest/steppe/piece-2x1-b.png` | 160x104 | `8240040442e42d6783d79864ff4946d81127b692c30fd361a68d97171d7fb3e6` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-2x1-c.png` | `public/assets/terrain/forest/steppe/piece-2x1-c.png` | 160x104 | `d1160c3b2b1cad1169db88f16574dfa881fc27bd2aa4bbdbd7cffeaf6ac16022` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-1x2-a.png` | `public/assets/terrain/forest/steppe/piece-1x2-a.png` | 80x184 | `5992c4e15b455b1a938577d80111b80836220ad78f83f5d8428774d81cdec9de` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-1x2-b.png` | `public/assets/terrain/forest/steppe/piece-1x2-b.png` | 80x184 | `ce0d35de72bc3ace059b0536d7aaa0f6e14d5f76714702c40352b1d68ea9d8af` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-1x2-c.png` | `public/assets/terrain/forest/steppe/piece-1x2-c.png` | 80x184 | `8cbdd482bae02454090f1ec68bfa12978a981d18f9787aa2a9f7466575d39030` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-2x2-a.png` | `public/assets/terrain/forest/steppe/piece-2x2-a.png` | 160x184 | `de731b401eb034914ca7f15dad3859e31cf162e567d7c7253a80bf2bbaaad96d` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-2x2-b.png` | `public/assets/terrain/forest/steppe/piece-2x2-b.png` | 160x184 | `0d31e0befc1c7e005c484a78b374e1e899d3dfa0ec353042a44eb3e7b5a23280` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-2x2-c.png` | `public/assets/terrain/forest/steppe/piece-2x2-c.png` | 160x184 | `edd10153d81bb9aa54fa0b7d03342eb4edcdf8a7bdb3929a0a3c92b029046d07` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-l-nw-a.png` | `public/assets/terrain/forest/steppe/piece-l-nw-a.png` | 160x184 | `6b806366d0a11d43390a5e4d47291d32185f4964bbd4a4fa81b0dbdfa6f86fbd` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-l-nw-b.png` | `public/assets/terrain/forest/steppe/piece-l-nw-b.png` | 160x184 | `f77036c86b595305a1e1af5a2e6deed991948f9938063b4baf7916e075cb38a6` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-l-ne-a.png` | `public/assets/terrain/forest/steppe/piece-l-ne-a.png` | 160x184 | `81e15595ddd0b6d6918cb08dc84c9d4ac5f6f21d8f4f159c95e91ec6c293a8e6` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-l-ne-b.png` | `public/assets/terrain/forest/steppe/piece-l-ne-b.png` | 160x184 | `835eb0ee8f49e10076a89e22245093a32647c5275a1cb01305f4c7096181163c` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-l-sw-a.png` | `public/assets/terrain/forest/steppe/piece-l-sw-a.png` | 160x184 | `4581e31319375327593ffae872a60f49b8760f9befdb0003447dbc8ba775cbe8` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-l-sw-b.png` | `public/assets/terrain/forest/steppe/piece-l-sw-b.png` | 160x184 | `fe5c974573f6a5b37e492d225d6c219df89d3efbc2caf481a54ec438d4e9756f` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-l-se-a.png` | `public/assets/terrain/forest/steppe/piece-l-se-a.png` | 160x184 | `33aeb63b98803fe9620c349ea635197bc7ec2d2f235273205219f7b03bd61dd7` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-piece-l-se-b.png` | `public/assets/terrain/forest/steppe/piece-l-se-b.png` | 160x184 | `f91bc0a9a62956a978838951c85992f6a10461ebf23ac6fb9f9a77f966188d13` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-1x1-a.png` | `public/assets/terrain/forest/badlands/piece-1x1-a.png` | 80x104 | `02f324944a956c75e30933f1e8f7e57d2f588c83526d27be7d0a75f07646b3fd` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-1x1-b.png` | `public/assets/terrain/forest/badlands/piece-1x1-b.png` | 80x104 | `2996addc66ec9c963cd5fac28a469116d54e58350fb9bca5668548792cdf9209` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-1x1-c.png` | `public/assets/terrain/forest/badlands/piece-1x1-c.png` | 80x104 | `eff94e0b29e99b5d56dfe0997b5a82cfa9bd4849b3f432110e3280b957474bf0` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-2x1-a.png` | `public/assets/terrain/forest/badlands/piece-2x1-a.png` | 160x104 | `72e0e04964a79be58512282b4d2ef31ecaafd23fd7ca3993e89bc0627205a83f` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-2x1-b.png` | `public/assets/terrain/forest/badlands/piece-2x1-b.png` | 160x104 | `fe5379e3ba5e103d58e57f3bdec68d392b88e30aadfff845d962a91646434260` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-2x1-c.png` | `public/assets/terrain/forest/badlands/piece-2x1-c.png` | 160x104 | `123fc8fad4b2c3c9a42c32247ca437b31f4ca3c86200015456131ce8ce95232e` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-1x2-a.png` | `public/assets/terrain/forest/badlands/piece-1x2-a.png` | 80x184 | `86a5f8f05883647c9d668fc9b05e7ecc51be908e9d2b584e39be85e96b5ae756` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-1x2-b.png` | `public/assets/terrain/forest/badlands/piece-1x2-b.png` | 80x184 | `9bb6a0115709f200d4dc228a7ca22dcc44f5768c34c523a7d264caf725c5bf63` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-1x2-c.png` | `public/assets/terrain/forest/badlands/piece-1x2-c.png` | 80x184 | `0aa5106311c224aa9c183bda38d808b518c981b15dd4919f1eb59e781e57a5df` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-2x2-a.png` | `public/assets/terrain/forest/badlands/piece-2x2-a.png` | 160x184 | `f87e14fb198b612566561e4e0b02564cf1171caa9916fe5eccfeba26653e215c` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-2x2-b.png` | `public/assets/terrain/forest/badlands/piece-2x2-b.png` | 160x184 | `5cc895d52b04dd5300e23dc8cb8dfdb9acdd38b0dfa335b5abf548453f48876f` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-2x2-c.png` | `public/assets/terrain/forest/badlands/piece-2x2-c.png` | 160x184 | `a1778a0c002cd3a74fef79669574139f90c8c167041467a8fe3106a7f1d73292` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-l-nw-a.png` | `public/assets/terrain/forest/badlands/piece-l-nw-a.png` | 160x184 | `eb84b5343a0a1fa50d53eb1ff4390ed1fe55ef5e548c2a74b090d1a3a3a83bbf` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-l-nw-b.png` | `public/assets/terrain/forest/badlands/piece-l-nw-b.png` | 160x184 | `c4cf9d036106ae4a56b006464844e557eec1c5f844ee0c7ed9e73f87e78a9741` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-l-ne-a.png` | `public/assets/terrain/forest/badlands/piece-l-ne-a.png` | 160x184 | `ffec460cc2108207eb20a7dfbcd85cab13f5f5838baed37b39d68e7e54c49940` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-l-ne-b.png` | `public/assets/terrain/forest/badlands/piece-l-ne-b.png` | 160x184 | `9d75d7a5b8ef826269451d740830d9bb0efb8dd32c5c39d90f9860360ffb1522` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-l-sw-a.png` | `public/assets/terrain/forest/badlands/piece-l-sw-a.png` | 160x184 | `1f70f611f97f88843b312996d9b5bd9481c44942c70acc22330a86e52286e78e` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-l-sw-b.png` | `public/assets/terrain/forest/badlands/piece-l-sw-b.png` | 160x184 | `cb2b0c945ccc5d7d3f52041e6167928ce9477d4b866ce037d94feb823f904e4b` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-l-se-a.png` | `public/assets/terrain/forest/badlands/piece-l-se-a.png` | 160x184 | `9687dccd9816365ebe6f5043f9950880920d678f438b11d4d2e6460e908a2342` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-piece-l-se-b.png` | `public/assets/terrain/forest/badlands/piece-l-se-b.png` | 160x184 | `6bf19fd42d2096bcee3fb194c46bf77d430c5a97984a42c6fb2cda3e57802764` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-1x1-a.png` | `public/assets/terrain/forest/wasteland/piece-1x1-a.png` | 80x104 | `1bfaf8fd20cd8c60f2e1dd25366b36d6c98cabfeaae68acd1b7a2e2b6f7cbb6d` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-1x1-b.png` | `public/assets/terrain/forest/wasteland/piece-1x1-b.png` | 80x104 | `d39df71c4e980e95ed4a40d0c7172564fa1498c5955c863f8e9adf8add4c523d` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-1x1-c.png` | `public/assets/terrain/forest/wasteland/piece-1x1-c.png` | 80x104 | `ec59c9a7f158c490323ba5084469e8c6da135f6e776b0ed05338e1f75d6e954e` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-2x1-a.png` | `public/assets/terrain/forest/wasteland/piece-2x1-a.png` | 160x104 | `61e16a623cb450d0c4df879ecd3c4c3b4444006fce0f0bfca9dd8342e75a6831` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-2x1-b.png` | `public/assets/terrain/forest/wasteland/piece-2x1-b.png` | 160x104 | `50291e5eb0415726c6570678d7435774ef94fe2414245b80a928e962f4bf6005` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-2x1-c.png` | `public/assets/terrain/forest/wasteland/piece-2x1-c.png` | 160x104 | `4207f8b3c9e357542a5bdad9074371add1d4cf5c168e7b402f87721bc62d71d8` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-1x2-a.png` | `public/assets/terrain/forest/wasteland/piece-1x2-a.png` | 80x184 | `e67373a3d77a817f5edca288526794d0288cdb4a2398d7e6af8aadb7ed4af941` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-1x2-b.png` | `public/assets/terrain/forest/wasteland/piece-1x2-b.png` | 80x184 | `6abab9f91ecd93ee59e7f270ce7d5b60e3e235d7749a475d6658f28ba5954e3f` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-1x2-c.png` | `public/assets/terrain/forest/wasteland/piece-1x2-c.png` | 80x184 | `78a7dacf52b5d19e9d2959349d12cb979b174300ecce5fbc48c28971eab2d7e9` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-2x2-a.png` | `public/assets/terrain/forest/wasteland/piece-2x2-a.png` | 160x184 | `a69ab42ed73b204b2191751e9d98a01a6977f0237b263881cab8b3f58eaa8391` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-2x2-b.png` | `public/assets/terrain/forest/wasteland/piece-2x2-b.png` | 160x184 | `f7a26fe89e37b513026f4abc413357fe3364af4c312aac3a0468f33d3783db84` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-2x2-c.png` | `public/assets/terrain/forest/wasteland/piece-2x2-c.png` | 160x184 | `1fd293b6740008a741eebdf58889c4d2bc7d9429fdf9c046808c25ea2b9f4fac` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-l-nw-a.png` | `public/assets/terrain/forest/wasteland/piece-l-nw-a.png` | 160x184 | `1ef2460ebf0b536e396003936a0328d8c43a41a7cc11549abd0a2f574fe581d8` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-l-nw-b.png` | `public/assets/terrain/forest/wasteland/piece-l-nw-b.png` | 160x184 | `4e6e148ebe29500fd7b275c0be51107b63cd0988f642695264e8059c58594920` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-l-ne-a.png` | `public/assets/terrain/forest/wasteland/piece-l-ne-a.png` | 160x184 | `c3400ba0df46aa158ad034036cf90659a2b948f658422712257bf8690d2ab206` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-l-ne-b.png` | `public/assets/terrain/forest/wasteland/piece-l-ne-b.png` | 160x184 | `8e07872df58803d977707b109576788f0d945677020684c53f09c8f7b86d0b3a` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-l-sw-a.png` | `public/assets/terrain/forest/wasteland/piece-l-sw-a.png` | 160x184 | `6278d1cf52459a0375f8c270d859400d1b14142b4f01d881b08a50564c8e7ecf` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-l-sw-b.png` | `public/assets/terrain/forest/wasteland/piece-l-sw-b.png` | 160x184 | `b7a008fd5293e0b5057672faae5127b3fa6110dbfb7ad1b2788154b1a7e85f72` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-l-se-a.png` | `public/assets/terrain/forest/wasteland/piece-l-se-a.png` | 160x184 | `8ee31da7aa403d48ecde286df3bb49397bb4a5ae941aedc2762f95c51dedc457` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-piece-l-se-b.png` | `public/assets/terrain/forest/wasteland/piece-l-se-b.png` | 160x184 | `3d1c55660efb17fc25131e8ed24751fc4fd80eb3ab9cd6dbbf221cf6cd1cc594` |

### Forest seam clumps

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/forest/chibi-forest-seam-1.png` | `public/assets/terrain/forest/grass/seam-1.png` | 63x63 | `864be7388b2af1f25d3b336cf9f3a42d7b865f9e12d182cf9c936157b64c3ef8` |
| `public/assets/chibi/forest/chibi-forest-seam-2.png` | `public/assets/terrain/forest/grass/seam-2.png` | 59x79 | `3f274ecb48a5e6b59e86e8cf5154104f96c958993a34e7d8c30c5d57788d527a` |
| `public/assets/chibi/forest/chibi-forest-seam-4.png` | `public/assets/terrain/forest/grass/seam-3.png` | 62x81 | `752e2fc851fb87fee0f06aeeaac75570f2216bade2362a0c90a0b87565058c99` |
| `public/assets/chibi/forest/chibi-forest-seam-5.png` | `public/assets/terrain/forest/grass/seam-4.png` | 63x72 | `0312ecfeb6cfdab914fffbbb24a178ef1137dd1409f4d7aa176f42decb010db3` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-seam-1.png` | `public/assets/terrain/forest/jungle/seam-1.png` | 61x65 | `9549c357fa6e8d1a5d1fd1b5135e54d85550bde1bae706f4df02bfbaeee88540` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-seam-2.png` | `public/assets/terrain/forest/jungle/seam-2.png` | 78x59 | `33d863c5953ed00d337f6fefae5e09b3d94de08864d923e9d9ad9b62fae54355` |
| `public/assets/chibi/forest/dinosaur/chibi-forest-dinosaur-seam-3.png` | `public/assets/terrain/forest/jungle/seam-3.png` | 74x66 | `76854eda658f58287e4ac26434e29026818e087288d143042781a46d38f1a0f6` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-seam-1.png` | `public/assets/terrain/forest/steppe/seam-1.png` | 74x68 | `487e3e39f296f4c1886a77ac1c9b1fce4c992394543b94aa92c975d7be72863f` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-seam-2.png` | `public/assets/terrain/forest/steppe/seam-2.png` | 75x64 | `7edba2af6e54c3941e6244cbbce8887bb90cdbb124fcfef17450e29939ec04d1` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-seam-3.png` | `public/assets/terrain/forest/steppe/seam-3.png` | 69x84 | `3bf87dec4e3581dc4664c46def05181d485f3b296fa38c199dd3b99a527ea265` |
| `public/assets/chibi/forest/goblin/chibi-forest-goblin-seam-4.png` | `public/assets/terrain/forest/steppe/seam-4.png` | 64x58 | `f55e2b4a80756578486947c8e65aa4532bdba82cbcc1b33882af668df0f98884` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-seam-1.png` | `public/assets/terrain/forest/badlands/seam-1.png` | 50x81 | `a5d6e96d63413402fed459d1e0743c66860e6129f22241799aaff150d38683cd` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-seam-2.png` | `public/assets/terrain/forest/badlands/seam-2.png` | 67x80 | `a9434296f539654a845e6e4ec974eeed3f1c4e9ee844986862698baed1bf65b2` |
| `public/assets/chibi/forest/martian/chibi-forest-martian-seam-3.png` | `public/assets/terrain/forest/badlands/seam-3.png` | 62x80 | `122367ef2f71c6dff9e9945ee11d4d3a5d83ee0767bc7982499da723f5691913` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-seam-1.png` | `public/assets/terrain/forest/wasteland/seam-1.png` | 71x66 | `81ae80549478efba89a736ca3d814631923a4228be90bef43c085f70afeb5ca9` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-seam-2.png` | `public/assets/terrain/forest/wasteland/seam-2.png` | 72x56 | `73c0569943aebcff375c431af339b187cd1919d753205d77ad7fd3945391e253` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-seam-3.png` | `public/assets/terrain/forest/wasteland/seam-3.png` | 72x72 | `ff1e8872baa3f64972f719b1376eba8c60a68de7bc2dedb8efe09684e3113f27` |
| `public/assets/chibi/forest/undead/chibi-forest-undead-seam-4.png` | `public/assets/terrain/forest/wasteland/seam-4.png` | 62x64 | `3fba10f2d71b3034c65274a6faf5b0695cdb8c02eb7f5b74374b3dea443cc00d` |

### Map objects

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/buildings/chibi-direction-lumber-camp.png` | `public/assets/objects/lumber-camp.png` | 72x72 | `a8eb642a40d54a5b9a394f51ba7d54151158c6d694046b3e67988f28db61ff32` |
| `public/assets/chibi/buildings/chibi-direction-sawmill.png` | `public/assets/objects/sawmill.png` | 72x72 | `892baf84f8b04c51ed244cd71fe77831750aa9abbb7eb7cc58649a0a1947c4b9` |
| `public/assets/chibi/buildings/chibi-dinosaur-lumber-camp.png` | `public/assets/objects/dinosaur-lumber-camp.png` | 72x72 | `35355ba4acabcdd4b6bba9c549b8bf4797aa8ba5fd7ebf769296393e04f8116d` |
| `public/assets/chibi/buildings/chibi-dinosaur-chopping-block.png` | `public/assets/objects/dinosaur-chopping-block.png` | 72x72 | `ff7df2bad208b1118fbc8a1a3c1f25d8df1c216e04b862c24988ba684f078a29` |
| `public/assets/chibi/buildings/chibi-dinosaur-grinding-stone.png` | `public/assets/objects/dinosaur-grinding-stone.png` | 72x72 | `6f21bab97d8e620c8e18f195b14ef89f9f874abdc178d869d703e3281b30219f` |
| `public/assets/chibi/buildings/chibi-curiosity-gold-claim.png` | `public/assets/objects/gold-claim.png` | 80x80 | `cba05d1bbe9973a11122872da7acb2d24b6fb8dc5cf4bff18389719974ab8bf5` |
| `public/assets/chibi/buildings/chibi-curiosity-shrine.png` | `public/assets/objects/shrine.png` | 80x80 | `80e05b956ef952d9386a507669b73e13a6f8b4c93c9a246e347615843a82720d` |
| `public/assets/chibi/buildings/chibi-curiosity-wishing-well.png` | `public/assets/objects/wishing-well.png` | 80x80 | `393261fbe285dace6fed3151747bf341f0b814c66b24c2a02259b721d103b8ee` |
| `public/assets/chibi/buildings/chibi-curiosity-fountain.png` | `public/assets/objects/fountain.png` | 80x80 | `0e1e21048b4f4e02dafe238240351d0d2cc76ac88678ad53c52bb0d5c954c888` |
| `public/assets/chibi/buildings/chibi-curiosity-lost-expedition.png` | `public/assets/objects/lost-expedition.png` | 80x80 | `fea762cc50310ea29e8d6e43971455d87e7f936a1e888ee2442f6f1356118163` |
| `public/assets/chibi/buildings/chibi-curiosity-graveyard.png` | `public/assets/objects/graveyard.png` | 80x80 | `26893008dcd75fde44242a30b2218595277ad1eb71a71cc0b2a43834a388a379` |
| `public/assets/chibi/buildings/chibi-curiosity-gate.png` | `public/assets/objects/gate.png` | 80x80 | `c56274e7214209ea9a3714930020999bfbf3fa44a0834faa95fe449a3ec8396d` |
| `public/assets/chibi/buildings/chibi-curiosity-web.png` | `public/assets/objects/web.png` | 80x80 | `249304ef7992eff19974ee4f18f948bd94c8ce0bd7fdac8e1cc5662e252d6600` |
| `public/assets/chibi/buildings/chibi-curiosity-downed-saucer.png` | `public/assets/objects/downed-saucer.png` | 80x80 | `6c5f7e414f890d6e43656990695ddd7648598a0152d66d66e7634444eded221b` |
| `public/assets/chibi/resources/chibi-ore-2.png` | `public/assets/objects/ore.png` | 40x40 | `6cc24e6772ee928b78bebd5eb7feed910be5c1d7ec7c4e82edeb2801c1965966` |
| `public/assets/chibi/resources/chibi-treasure.png` | `public/assets/objects/treasure.png` | 40x40 | `a7f2d5d712fdc5469a3dd7547f61f95c48bf4a8026a055f93270f065ae77b5ed` |
| `public/assets/chibi/resources/chibi-pearls.png` | `public/assets/objects/pearls.png` | 40x40 | `552b406824bea2c9bd2e573d6957a844e51c21c8f652b3a7c77a960ced29d686` |
| `public/assets/chibi/resources/chibi-grave.png` | `public/assets/objects/grave.png` | 40x40 | `5f5f3ab9a6d2f6eeeac6fda1211f39e6af778b08c2fd5df2ec125b4ac3122283` |

### v0.2 factions and strays (bead border_marches-bzc.14)

Copied byte for byte from Pulp Wars commit `4b03324415d335bcff1b44a5dcec2c56ac720a52` (2026-11-24), with the same renames (the `chibi-direction-` prefix dropped, the Pulp Wars faction kept as a prefix). Each unit is the sprite the faction docs (`docs/design/FACTION_*.md` section 10) or the stray roster (`docs/art/V02_UNIT_ART.md`) name; its portrait is the Pulp Wars portrait of the same unit (the frog unit portrait is `cult-frog`). Feet are Pulp Wars measurements (unit-shadow-measurements-v7); anchors are the Pulp Wars class default except the Ghoul (32, 48).

| Source | Destination | Size | sha256 |
| --- | --- | --- | --- |
| `public/assets/chibi/units/chibi-direction-knight.png` | `public/assets/units/knight.png` | 72x88 | `7f0bd7b7cd1933208ca21820428887cc1720e411b701bd42d11fffa9b184d427` |
| `public/assets/chibi/units/chibi-direction-marksman.png` | `public/assets/units/marksman.png` | 56x80 | `f566d977ae81169f1383f51603520b92c12ecaaa69fccf89d0135bbef0966bf7` |
| `public/assets/chibi/units/chibi-direction-swordsman.png` | `public/assets/units/swordsman.png` | 56x80 | `9c9e7457e914ef949e5b7bbeb152e71bb2e7638273745aa46731067ff2cbfd7a` |
| `public/assets/chibi/units/chibi-direction-undead-ghoul.png` | `public/assets/units/undead-ghoul.png` | 72x88 | `0a901d0eb96244e01ec0eac9a4c67ca05a574fb3625fa45854978ecec0032e1c` |
| `public/assets/chibi/units/chibi-direction-undead-banshee.png` | `public/assets/units/undead-banshee.png` | 56x80 | `1132af5bba3af9c1e9e582df698f6b9906c9ebb17b478b8be5d9a55fc90c7925` |
| `public/assets/chibi/units/chibi-direction-undead-necromancer.png` | `public/assets/units/undead-necromancer.png` | 56x80 | `be79b464d652f44c9cfc8bca3eec3ccf65130e4d4def727c75bdd708724212a3` |
| `public/assets/chibi/units/chibi-direction-cult-imp.png` | `public/assets/units/cult-imp.png` | 56x80 | `e9a1014bfbfd26287c4e46c7bfd7b6ca7cdc4ad17f70865043642530b3e18ae0` |
| `public/assets/chibi/units/chibi-direction-cult-tentacle.png` | `public/assets/units/cult-tentacle.png` | 56x80 | `a758e82cda310d2eacd9f1c7403be659694d70503267939007528fd6a4972513` |
| `public/assets/chibi/units/chibi-direction-cult-frog-unit.png` | `public/assets/units/cult-frog-unit.png` | 56x80 | `f0f922653c4b4176104a43578857c8eecdb3b1002ab711997c82f3295da7572e` |
| `public/assets/chibi/units/chibi-direction-dwarf-clockwork-gunner.png` | `public/assets/units/dwarf-clockwork-gunner.png` | 56x80 | `d7f3db777e5ce063fa8ebe8e79048c16529bf66e4d8670a3479de856372a38e2` |
| `public/assets/chibi/units/chibi-direction-dwarf-engineer.png` | `public/assets/units/dwarf-engineer.png` | 56x80 | `67bb9260cd497d243e434463bebc6d528349083d32b3d5404f7da1a707954992` |
| `public/assets/chibi/units/chibi-direction-dwarf-brass-titan.png` | `public/assets/units/dwarf-brass-titan.png` | 88x104 | `bb75bfed5556a0071d8100919d5fb062c63aaa481eef7134f0d6fd2597cd4577` |
| `public/assets/chibi/units/chibi-direction-ice-folk-walrus.png` | `public/assets/units/ice-folk-walrus.png` | 56x80 | `4a9aa4fa5c5bcd3510071256c4c0c122f001e22961d1c9e2c8e3de0c8cc83a1e` |
| `public/assets/chibi/portraits/chibi-direction-portrait-knight.png` | `public/assets/portraits/knight.png` | 48x48 | `7dc1d9c85a7d6b7b2a4609d91e2abeebeb3fac27b9a1afae776527b020ad9c44` |
| `public/assets/chibi/portraits/chibi-direction-portrait-marksman.png` | `public/assets/portraits/marksman.png` | 48x48 | `267cef159fa5570780670e12d1efef47f820e5b7e838898571f24f24966c70c3` |
| `public/assets/chibi/portraits/chibi-direction-portrait-swordsman.png` | `public/assets/portraits/swordsman.png` | 48x48 | `9acaaf7cd47d410afb129663eba4c5a7917e8bb72bc8443c8cf77cc543cb8f02` |
| `public/assets/chibi/portraits/chibi-direction-portrait-undead-ghoul.png` | `public/assets/portraits/undead-ghoul.png` | 48x48 | `a5b76182ec446cfa2496a2db297f30681e4bad3a0b09d23a1f9afc9a663d9c70` |
| `public/assets/chibi/portraits/chibi-direction-portrait-undead-banshee.png` | `public/assets/portraits/undead-banshee.png` | 48x48 | `99caf0d8503c90e64b5f48700bb70f4bf9c8f417c0ad19b553363f38634cab49` |
| `public/assets/chibi/portraits/chibi-direction-portrait-undead-necromancer.png` | `public/assets/portraits/undead-necromancer.png` | 48x48 | `de74643bfd122be47e39c5cb4d25192a9ace3c3d612ae9877e6744c71342099c` |
| `public/assets/chibi/portraits/chibi-direction-portrait-cult-imp.png` | `public/assets/portraits/cult-imp.png` | 48x48 | `3305447bde22735785d9eaa0c8bd4998ed6f8fe0d8259709a55cd52ea8cfdfcc` |
| `public/assets/chibi/portraits/chibi-direction-portrait-cult-tentacle.png` | `public/assets/portraits/cult-tentacle.png` | 48x48 | `1c2feef54e60ec54d6a3829db793ad1ae0e6acbc7c8be67c4464bad7aa799183` |
| `public/assets/chibi/portraits/chibi-direction-portrait-cult-frog.png` | `public/assets/portraits/cult-frog-unit.png` | 48x48 | `c8fe773577905c093bcd7c2f5c54e9ea8c0c57360eb7ee55f4d72c6bfbac6e6a` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dwarf-clockwork-gunner.png` | `public/assets/portraits/dwarf-clockwork-gunner.png` | 48x48 | `82504ba2a3baf617399bbecdd025e1b86031dbf848eb64748302cb575d201fd1` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dwarf-engineer.png` | `public/assets/portraits/dwarf-engineer.png` | 48x48 | `28e02c1df51550fdb7cd6875d49088290aa571221562ee0c7c809a2346588d9d` |
| `public/assets/chibi/portraits/chibi-direction-portrait-dwarf-brass-titan.png` | `public/assets/portraits/dwarf-brass-titan.png` | 48x48 | `71f096b525864eb00a729dab1a358144b878802998f4b39fe28579fe3852a4ec` |
| `public/assets/chibi/portraits/chibi-direction-portrait-ice-folk-walrus.png` | `public/assets/portraits/ice-folk-walrus.png` | 48x48 | `e457a68d959d5f7443f656ff144e04db6105ae8da023973c17b695e759452cea` |
