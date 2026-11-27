/**
 * Per-test time limit for the heavy unit tests: the ones that generate many
 * maps, build whole games or play many battles. Alone they take a few
 * seconds to about 40 s, but several workers often run the unit tier at once
 * on one machine (load 20+ on 10 cores), which stretches them past the 30 s
 * default in vite.config.ts. This limit only stops a hung test; it is not a
 * speed budget (those live in `npm run perf`, tests/perf/run.ts).
 *
 * Use it on a describe block whose tests are all heavy
 * (`describe(name, { timeout: HEAVY_TIMEOUT }, ...)`) or on one test
 * (`it(name, fn, HEAVY_TIMEOUT)`). Light tests keep the default.
 */
export const HEAVY_TIMEOUT = 300_000;
