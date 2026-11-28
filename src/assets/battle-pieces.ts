/**
 * The naval battle's art (docs/design/NAVAL.md 10.2, bead bzc.160), keyed
 * by the piece keys of `render/battle/naval.ts` (`NAVAL_PIECE_KEYS`). A key
 * listed here is drawn from its images; a key left out (the water) stays
 * drawn in code, as does any piece whose image fails to load.
 *
 * The props are crops of the accepted takes of studio set `battle-props`;
 * the deck is baked by `tools/art/ground-bake.mjs` from set `grounds-deck`
 * (art/bake/grounds.json, `surfaces.deck`).
 */
import type { ImageAsset } from "./manifest";

const piece = (
  key: string,
  file: string,
  w: number,
  h: number,
): ImageAsset => ({
  key,
  path: `assets/battle/${file}.png`,
  w,
  h,
  category: "battle-piece",
});

export const DECK_TEXTURE = piece("battle-deck", "deck", 259, 259);

/**
 * Where the deck texture's boards start (its columns), and its width last:
 * the renderer shuffles and staggers the boards, so the deck never shows
 * the texture's period.
 */
export const DECK_BOARDS: readonly number[] = [
  0, 30, 61, 93, 123, 153, 184, 215, 259,
];

/**
 * Images per piece key. The reef has two shapes (picked by hex); the deck
 * gun has the attacker's (muzzle east) and the defender's (muzzle west),
 * since a sprite is never mirrored.
 */
export const BATTLE_PIECE_ART = {
  "battle-deck": [DECK_TEXTURE],
  "battle-mast": [piece("battle-mast", "mast", 64, 122)],
  "battle-crate": [piece("battle-crate", "crates", 50, 40)],
  "battle-reef": [
    piece("battle-reef", "reef-a", 48, 38),
    piece("battle-reef-b", "reef-b", 48, 34),
  ],
  "battle-deck-gun": [
    piece("battle-deck-gun", "deck-gun-east", 38, 27),
    piece("battle-deck-gun-west", "deck-gun-west", 43, 30),
  ],
} as const satisfies Record<string, readonly ImageAsset[]>;

export const BATTLE_PIECE_ASSETS: readonly ImageAsset[] =
  Object.values(BATTLE_PIECE_ART).flat();
