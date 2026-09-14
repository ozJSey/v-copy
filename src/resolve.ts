/**
 * Binding resolution — every accepted binding form (bare / string / number /
 * history array / config object / controller / `false`) collapses to one
 * `Resolved` shape, with plugin defaults applied.
 *
 * This module also draws the ONE line that keeps the two object roles apart:
 * a **config** object belongs to the consumer and the directive only reads it;
 * a **controller** is a mutable reactive object the library is allowed to own
 * and write state into. See `isController` below.
 */
import { isReactive, isReadonly, type DirectiveBinding } from 'vue'
import { getGlobalDefaults } from './defaults'
import { takeSelectionText } from './selection'
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
  SelectionWithin,
} from './types'

/** Sentinel meaning "read the element's live `textContent` at copy time". */
export const TEXT_CONTENT = Symbol('v-copy:textContent')

/**
 * Sentinel meaning "read what the USER has highlighted at copy time".
 *
 * A sentinel rather than a magic `source: 'selection'` string, deliberately: a
 * bare string binding is ALWAYS a literal source in this package
 * (`v-copy="'selection'"` copies the word), and inferring a role from a value's
 * shape is the exact mistake ARCHITECTURE.md's ownership invariant exists to
 * forbid. The consumer says `.selection` or `selection: true`; nothing is guessed.
 */
export const SELECTION = Symbol('v-copy:selection')

const FEEDBACK_DEFAULTS = { className: 'v-copy-copied', duration: 1500, attribute: 'data-copied' } as const

export type Feedback = { className: string; duration: number; attribute: string }

/** Resolved `dedupe` — a ready predicate, so `history.ts` stays branch-free. */
export type DedupePredicate = (stored: string, copied: string) => boolean

const COMPARATORS: Record<DedupeCompare, DedupePredicate> = {
  exact: (a, b) => a === b,
  trim: (a, b) => a.trim() === b.trim(),
  loose: (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase(),
}

/**
 * Config or controller? Asked of the object itself, never of its shape.
 *
 * The controller role is "observable state the library keeps up to date", and
 * that is only possible on a **mutable reactive** object: a plain literal is
 * re-created every render so nothing can observe a write into it, and a frozen
 * or `readonly()` object refuses the write outright (`reactive()` on a frozen
 * object hands the frozen object straight back, so `isReactive` is false for
 * it). Everything that is not a controller is read-only config — the directive
 * never adds a key to it.
 */
function isController(v: object): boolean {
  return isReactive(v) && !isReadonly(v)
}

/**
 * Binding values cross an untyped boundary: a template expression is not
 * type-checked at runtime, and `v-model.number` on an emptied `<input>` writes
 * `''`, not `undefined`. `Number('')` is `0`, which would silently clamp a cap
 * to 1 or turn a feedback window off — so anything that is not a real number
 * means "not set", and the caller's default applies.
 */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isNaN(n) ? null : n
  }
  return null
}

export interface Resolved {
  disabled: boolean
  source: string | number | (() => string) | typeof TEXT_CONTENT | typeof SELECTION
  /** Scope for a `SELECTION` source. `undefined` = anywhere in the document. */
  within: SelectionWithin | undefined
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
  /** The bound controller, when the binding was a mutable reactive object. */
  controller: CopyController | null
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

/** `unknown`, not `number | undefined`: see `asNumber` — the value is untyped at runtime. */
function clampMax(value: unknown, fallback: number): number {
  const n = asNumber(value)
  return n === null ? fallback : Math.max(1, Math.floor(n))
}

function resolveFeedback(value: boolean | FeedbackConfig | undefined): Feedback | false {
  if (value === false) return false
  if (value === true || value == null) return { ...FEEDBACK_DEFAULTS }
  const duration = asNumber(value.duration) ?? FEEDBACK_DEFAULTS.duration
  if (duration <= 0) return false
  return { ...FEEDBACK_DEFAULTS, ...value, duration }
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
      disabled: true, source: TEXT_CONTENT, within: undefined, trim: false, sink: null,
      rich: false, max: 10, dedupe: null, dedupeScope: 'text', key: undefined, feedback: false,
      announce: false, trigger: false, controller: null, pending: false, ...mods,
    }
  }

  let cfg: CopyConfig = {}
  let source: Resolved['source'] = TEXT_CONTENT
  let sink: CopyEntry[] | null = null
  let controller: CopyController | null = null
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
    // An object is always config. It is ALSO a controller when the library is
    // allowed to own it — see `isController`. A config object is read here and
    // never written to, so freezing one, or passing a `readonly()` view of one,
    // is an ordinary binding rather than a crash at mount.
    cfg = v
    if (isController(v)) controller = v as CopyController
    // An explicitly present-but-absent `source` is the same "not here yet" as a
    // `null` binding, and here it IS distinguishable from omitting the key —
    // which is why this is the form to reach for when a value may be missing.
    if ('source' in cfg && cfg.source == null) pending = true
    source = cfg.source ?? TEXT_CONTENT
    sink = cfg.sink ?? null
  }

  // The user's own selection replaces the source outright — including the
  // "not here yet" meaning of a nullish one, which describes a value this
  // binding has stopped copying. Enabled by the `.selection` modifier or by
  // `selection: true | { within }`, never inferred from a value.
  const selection = m.selection || cfg.selection
  const within = typeof cfg.selection === 'object' && cfg.selection !== null ? cfg.selection.within : undefined
  if (selection) {
    source = SELECTION
    pending = false
  }

  return {
    disabled: !!cfg.disabled,
    source,
    within,
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
    controller,
    pending,
    ...mods,
  }
}

export function resolveText(el: HTMLElement, r: Resolved): string {
  if (r.source === TEXT_CONTENT) return (el.textContent ?? '').trim() // textContent is always trimmed
  // `.trim` still applies: the user selected those characters, so trimming them
  // has to stay something the consumer asks for rather than something we do.
  const raw =
    r.source === SELECTION
      ? takeSelectionText(el, r.within)
      : typeof r.source === 'function'
        ? String(r.source())
        : String(r.source)
  return r.trim ? raw.trim() : raw
}
