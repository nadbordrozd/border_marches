# Border Marches

A pulpy, deterministic strategy game in the spirit of Heroes of Might and
Magic II: an adventure map, towns, heroes and armies, and hex battles.

## Run it

Needs Node 22.13 or newer.

```sh
npm ci        # install exact dependencies
npm run dev   # http://localhost:6273
```

Views are picked with the query string:

- `http://localhost:6273/` the game
- `http://localhost:6273/?view=map&seed=123` adventure map preview
- `http://localhost:6273/?view=battle` battle preview

## Checks

```sh
npm run format:check   # Prettier (npm run format to fix)
npm run lint           # ESLint, zero warnings
npm run typecheck      # tsc, plus src/core and src/data without DOM types
npm test               # Vitest unit tier (npx vitest run <files> for some)
npm run build          # production build into dist/
npm run check          # all of the above
```

## Layout

- `src/core/` pure, deterministic game logic: no DOM, no `Math.random`, no
  `Date` (enforced by lint and a DOM-free tsconfig). Seeded RNG and hashes in
  `src/core/rng.ts`; the adventure map contract in `src/core/map/types.ts`.
- `src/data/` static game data (faction, creatures, buildings).
- `src/render/` canvas renderers; `src/ui/` DOM panels and screens;
  `src/main.ts` entry, `src/router.ts` query router.
- `public/assets/` images served as-is.
- `tests/` mirrors `src/`; `tests/fixtures/small-map.ts` is a hand-written
  24x18 map for renderer and rules work.
- `tools/art/`, `art/`, `docs/art/` the studio asset pipeline (see
  `docs/art/PIPELINE.md`); `tools/orchestration/` the studio workflow.
