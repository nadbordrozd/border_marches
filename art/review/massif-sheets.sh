#!/bin/sh
# Rebuilds the review sheets of beads border_marches-xaj.14 and xaj.19 (docs/art/MASSIF_ART.md):
# one strip sheet per massif palette (pieces on their grounds, 1:1 and x2),
# the 3x2 towns, the doodads, and a mock range composite per palette.
set -e
cd "$(dirname "$0")/../.."
M=public/assets/terrain/massifs
D=public/assets/terrain/doodads
list() { ls "$@" | tr '\n' ',' | sed 's/,$//'; }
sheet() { # palette ground1 ground2
  node art/review/strip-sheet.mjs "docs/art/sheets/massif-$1.png" \
    "$2=$(list $M/$1/massif-*.png $M/$1/plateau-*.png $M/$1/spine-*.png 2>/dev/null)" \
    "$3=$(list $M/$1/ridge-*.png)" \
    "$2=$(list $M/$1/crag-*.png $M/$1/peak-*.png $M/$1/rounded-*.png $M/$1/foothill-*.png $M/$1/mine-*.png 2>/dev/null)"
}
sheet granite grass jungle
sheet sandstone steppe badlands
sheet basalt wasteland wasteland
node art/review/strip-sheet.mjs docs/art/sheets/towns-3x2.png \
  "jungle=public/assets/towns/dinosaur-town-3x2.png" \
  "steppe=public/assets/towns/goblin-hold-3x2.png" \
  "grass=public/assets/towns/dinosaur-town-3x2.png,public/assets/towns/goblin-hold-3x2.png"
node art/review/strip-sheet.mjs docs/art/sheets/doodads.png \
  "grass=$(list $D/grass/*.png)" "jungle=$(list $D/jungle/*.png)" \
  "steppe=$(list $D/steppe/*.png)" "badlands=$(list $D/badlands/*.png)" \
  "wasteland=$(list $D/wasteland/*.png)"
for p in granite:grass sandstone:steppe basalt:wasteland; do
  node art/review/massif-mock.mjs "docs/art/sheets/massif-mock-${p%%:*}.png" "art/review/massif-mock-${p%%:*}.json" > /dev/null
done
echo "sheets written to docs/art/sheets/"
