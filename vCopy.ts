/**
 * Build entry point — re-exports the public surface from `src/`.
 *
 * The re-export is a wildcard on purpose: `src/index.ts` is the single list of
 * what is public, and duplicating that list here is how a type ends up exported
 * from the source and missing from the published `.d.ts` with nothing failing.
 *
 * The split keeps each concern in a single-purpose module (types / defaults /
 * clipboard / announce / resolve / state / history / controller / feedback /
 * execute / events / directive / plugin) without changing the bundle: tsup
 * follows this entry and emits the same minified file. See ARCHITECTURE.md
 * for the module map.
 */
export * from './src'
export { default } from './src'
