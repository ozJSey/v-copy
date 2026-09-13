/**
 * Build entry point — re-exports the public surface from `src/`.
 *
 * The split keeps each concern in a single-purpose module (types / defaults /
 * clipboard / announce / resolve / state / history / controller / feedback /
 * execute / events / directive / plugin) without changing the bundle: tsup
 * follows this entry and emits the same minified file. See ARCHITECTURE.md
 * for the module map.
 */
export { vCopy, default, VCopyPlugin } from './src'
export type {
  CopyBinding,
  CopyConfig,
  CopyController,
  CopyDirective,
  CopyEntry,
  CopyEventDetail,
  CopyPluginOptions,
  CopyResult,
  CopyVia,
  DedupeCompare,
  DedupeConfig,
  DedupeScope,
  FeedbackConfig,
  RichCopyEntry,
} from './src'
