/**
 * Public surface. Internal modules (warn, defaults, clipboard, announce,
 * resolve, selection, state, history, controller, feedback, execute, events)
 * stay un-exported.
 */
export { vCopy, default } from './directive'
export { VCopyPlugin } from './plugin'
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
  SelectionConfig,
  SelectionWithin,
} from './types'
