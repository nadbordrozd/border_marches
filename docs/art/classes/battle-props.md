# Battle deck pieces asset contract

Status: adopted (bead `border_marches-bzc.160`, docs/design/NAVAL.md 10.2).
The naval battlefields' deck and the pieces standing on it. Shared direction:
[ART_DIRECTION.md](../ART_DIRECTION.md).

## Inventory

`src/assets/battle-pieces.ts` registers them by the piece keys of
`src/render/battle/naval.ts` (`NAVAL_PIECE_KEYS`). A key without art (the
water) is drawn in code, as is any piece whose image fails to load.

| Key | Files (public/assets/battle/) | Size | Source |
| --- | --- | --- | --- |
| `battle-deck` | `deck.png` | 259 x 259 | set `grounds-deck` take `deck-c`, baked by `tools/art/ground-bake.mjs` (`surfaces.deck`) |
| `battle-mast` | `mast.png` | 64 x 122 | set `battle-props` `mast-b#0` |
| `battle-crate` | `crates.png` | 50 x 40 | `crates-a#2` |
| `battle-reef` | `reef-a.png`, `reef-b.png` | 48 x 38, 48 x 34 | `reef-a#1`, `reef-a#12` |
| `battle-deck-gun` | `deck-gun-east.png`, `deck-gun-west.png` | 38 x 27, 43 x 30 | `gun-east-a#0`, `gun-west-b#0` |

Each prop is a crop to its opaque bounds. The crates also carry a recorded
hand edit: fourteen light grey specks on the silhouette set to the outline's
dark.

## Rules

- Props: `generate-image-v2` at display size with the accepted ship as style
  image (the reef: Sirens' Rock), layers style, light-south-west,
  `class-battle-prop`. Nothing under a piece.
- A deck gun per facing; a sprite is never mirrored.
- The mast's pennant is plain white and is recoloured to the side's colour
  in code (blue attacker, red defender): light near-grey pixels right of
  `MAST_PENNANT.minX` and above `MAST_PENNANT.maxY`.
- The reef has no foam of its own: code draws the ring at its waterline.
- The deck: planks run from the top of the field to the bottom (the ships lie
  side by side, the gangplanks cross). The renderer cuts the texture into its
  boards (`DECK_BOARDS`), picks them by hash and slides each down by its own
  amount with a butt joint at the wrap, so no period shows. Gangplanks and
  jetties stay code-drawn, paler than the deck.

## Lessons

- With the ship (bow to the right) as style image, every "pointing left"
  cannon still pointed right (25 of 25); a direction-free style image
  (`crates-a#2`) and the words "muzzle at the LEFT end" turned all 25 west.
- A 48 x 112 mast drew a thin pole that looked like a lamp post beside the
  creatures; 64 x 128 with "a quarter of the image wide" reads as a mast.
- Pixen draws a deck as a framed ship's interior: crop the open middle.
  "Planks running left to right" gave a parquet of short blocks; "from the
  top of the picture to the bottom" gave long boards.
