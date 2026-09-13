/**
 * Binding resolution — every accepted binding form (bare / string / number /
 * history array / config object / controller / `false`) collapses to one
 * `Resolved` shape, with plugin defaults applied.
 */
import type { DirectiveBinding } from 'vue'
import { getGlobalDefaults } from './defaults'
import type {
  CopyBinding,
  CopyConfig,
  CopyController,
  CopyEntry,
  CopyResult,
  DedupeCompare,
  DedupeConfig,
  DedupeScope,
  FeedbackConfig,
} from './types'

/** Sentinel meaning "read the element's live `textContent` at copy time". */
export const TEXT_CONTENT = Symbol('v-copy:textContent')

const FEEDBACK_DEFAULTS = { className: 'v-copy-copied', duration: 1500, attribute: 'data-copied' } as const

export type Feedback = { className: string; duration: number; attribute: string }

/** Resolved `dedupe` — a ready predicate, so `history.ts` stays branch-free. */
export type DedupePredicate = (stored: string, copied: string) => boolean

const COMPARATORS: Record<DedupeCompare, DedupePredicate> = {
  exact: (a, b) => a === b,
  trim: (a, b) => a.trim() === b.trim(),
  loose: (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase(),
}

export type MutableController = CopyController

export interface Resolved {
  disabled: boolean
  source: string | number | (() => string) | typeof TEXT_CONTENT
  trim: boolean
  sink: CopyEntry[] | null
  rich: boolean
  max: number
  dedupe: DedupePredicate | null
  dedupeScope: DedupeScope
  key: string | undefined
  feedback: Feedback | false
  announce: string | false
  trigger: string | false
  onCopy?: (r: CopyResult) => void
  onSuccess?: (r: CopyResult) => void
  onError?: (r: CopyResult) => void
  controllerObj: MutableController | null
  prevent: boolean
  stop: boolean
  once: boolean
  /**
   * The binding said "not yet" — a `null` value, or a config whose `source` key
   * is present but nullish. `execute.ts` refuses instead of copying the
   * element's visible text.
   */
  pending: boolean
}

export function clampMax(value: number | undefined, fallback: number): number {
  if (value == null || Number.isNaN(value)) return fallback
  return Math.max(1, Math.floor(value))
}

function resolveFeedback(value: boolean | FeedbackConfig | undefined): Feedback | false {
  if (value === false) return false
  if (value === true || value == null) return { ...FEEDBACK_DEFAULTS }
  const merged = { ...FEEDBACK_DEFAULTS, ...value }
  if (merged.duration <= 0) return false
  return merged
}

function resolveDedupe(value: boolean | DedupeConfig | undefined): DedupePredicate | null {
  if (value === false) return null
  if (value === true || value == null) return COMPARATORS.exact // default ON
  const compare = value.compare ?? 'exact'
  return typeof compare === 'function' ? compare : COMPARATORS[compare]
}

/** Labels are out of the comparison unless the consumer opts them in. */
function resolveDedupeScope(value: boolean | DedupeConfig | undefined): DedupeScope {
  return typeof value === 'object' && value !== null ? (value.scope ?? 'text') : 'text'
}

function resolveAnnounce(value: boolean | string | undefined): string | false {
  if (value === false) return false
  if (value === true || value == null) return 'Copied'
  return String(value)
}

export function resolveBinding(binding: DirectiveBinding<CopyBinding>): Resolved {
  const v = binding.value
  const arg = binding.arg
  const m = binding.modifiers ?? {}
  const g = getGlobalDefaults()
  const mods = { prevent: !!m.prevent, stop: !!m.stop, once: !!m.once }

  if (v === false) {
    return {
      disabled: true, source: TEXT_CONTENT, trim: false, sink: null, rich: false,
      max: 10, dedupe: null, dedupeScope: 'text', key: undefined, feedback: false,
      announce: false, trigger: false, controllerObj: null, pending: false, ...mods,
    }
  }

  let cfg: CopyConfig = {}
  let source: Resolved['source'] = TEXT_CONTENT
  let sink: CopyEntry[] | null = null
  let controllerObj: MutableController | null = null
  let pending = false

  if (v === undefined) {
    // Bare `v-copy` and `v-copy="somethingUndefined"` compile to the SAME
    // binding — Vue normalises both to `value: undefined` and keeps no record
    // of whether an expression was written. So undefined has to stay the
    // documented textContent case; `null` below is the one nullish value that
    // can carry a different meaning.
    source = TEXT_CONTENT
  } else if (v === null) {
    // "Not here yet." Copying the element's visible label instead is the trap
    // this branch exists to close — `ref<string | null>(null)` is the ordinary
    // shape of a value still in flight.
    pending = true
  } else if (typeof v === 'string' || typeof v === 'number') {
    // A bare string/number is ALWAYS a source — you never push history into one.
    source = v
  } else if (Array.isArray(v)) {
    // An array is ALWAYS a history sink — copy textContent, record into it.
    sink = v
  } else {
    // A plain object is config + controller.
    cfg = v
    controllerObj = v as MutableController
    // An explicitly present-but-absent `source` is the same "not here yet" as a
    // `null` binding, and here it IS distinguishable from omitting the key —
    // which is why this is the form to reach for when a value may be missing.
    if ('source' in cfg && cfg.source == null) pending = true
    source = cfg.source ?? TEXT_CONTENT
    sink = cfg.sink ?? null
  }

  return {
    disabled: !!cfg.disabled,
    source,
    trim: !!m.trim,
    sink,
    rich: !!(m.rich || cfg.rich),
    max: clampMax(cfg.max ?? g.max, 10),
    dedupe: resolveDedupe(cfg.dedupe ?? g.dedupe),
    dedupeScope: resolveDedupeScope(cfg.dedupe ?? g.dedupe),
    key: arg ?? cfg.key,
    feedback: resolveFeedback(cfg.feedback ?? g.feedback),
    announce: resolveAnnounce(cfg.announce ?? g.announce),
    trigger: cfg.trigger === undefined ? 'click' : cfg.trigger,
    onCopy: cfg.onCopy,
    onSuccess: cfg.onSuccess,
    onError: cfg.onError,
    controllerObj,
    pending,
    ...mods,
  }
}

export function resolveText(el: HTMLElement, r: Resolved): string {
  if (r.source === TEXT_CONTENT) return (el.textContent ?? '').trim() // textContent is always trimmed
  const raw = typeof r.source === 'function' ? String(r.source()) : String(r.source)
  return r.trim ? raw.trim() : raw
}
