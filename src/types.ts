/**
 * Public types + the `GlobalDirectives` template-autocomplete augmentation.
 *
 * Leaf module: imports only Vue types.
 */
import type { ObjectDirective } from 'vue'

/**
 * Which clipboard path performed the copy — or `'none'` when no strategy ran
 * at all (a refusal, a disabled binding, SSR, a controller with no bound
 * element). `'none'` is new in 1.2.0; before it, those paths reported
 * `'exec-command'`, which made a wave of refusals look like legacy-fallback
 * copies to anything counting them.
 */
export type CopyVia = 'clipboard-api' | 'exec-command' | 'none'

/** Result of a copy attempt — callbacks and the `copy-result` event carry it. */
export interface CopyResult {
  /** Whether the text landed on the clipboard. */
  success: boolean
  /** The text that was (attempted to be) copied. */
  text: string
  /** Which clipboard strategy ran, or `'none'` when nothing was written. */
  via: CopyVia
  /** The label from the directive argument / `key` config, when set. */
  key?: string
  /**
   * Failure detail when `success` is false. Three values are stable and worth
   * branching on — `'empty'` (nothing to copy, so nothing was written, which
   * includes an empty user selection), `'pending'` (the binding is `null`; the
   * value has not arrived) and `'disabled'`. Anything else is the underlying
   * clipboard error message.
   */
  error?: string
}

/** Detail payload of the bubbling `copy-result` CustomEvent. */
export type CopyEventDetail = CopyResult

/** History entry recorded with the `.rich` modifier / `rich: true`. */
export interface RichCopyEntry {
  text: string
  /** Epoch ms of the copy attempt. */
  at: number
  /** Whether the attempt succeeded. */
  ok: boolean
  /** The label from the directive argument / `key` config, when set. */
  key?: string
}

/** A history entry — plain string by default, rich object with `.rich`. */
export type CopyEntry = string | RichCopyEntry

/**
 * How a repeat copy is matched against the entries already in the history.
 *
 * `'exact'` is the default: a history must hand back exactly what was copied,
 * so collapsing `"foo "` into `"foo"` would make one payload unreachable.
 */
export type DedupeCompare = 'exact' | 'trim' | 'loose'

/**
 * Which stored entries a repeat copy is allowed to replace.
 *
 * `'text'` is the default: the comparison is over the copied **text alone**, so
 * a repeat promotes whichever entry holds the same payload no matter which
 * label (`key` / the directive argument) is stamped on it. A history picker
 * lists payloads, and two rows that put the identical string on the clipboard
 * are one row.
 *
 * `'key'` narrows it — an entry is replaced only when its `key` matches the
 * copying binding's too, so several labelled sources sharing one sink keep a
 * row each.
 */
export type DedupeScope = 'text' | 'key'

/** Fine-grained control of history de-duplication. */
export interface DedupeConfig {
  /**
   * How two texts are compared. Default `'exact'`. A function receives the
   * stored text first and the newly copied text second.
   */
  compare?: DedupeCompare | ((a: string, b: string) => boolean)
  /**
   * Which entries the comparison may replace. Default `'text'` — labels do not
   * participate, so the newest copy's label is the one that survives. Use
   * `'key'` to keep one row per label.
   */
  scope?: DedupeScope
}

/**
 * Where the user's selection has to live for a binding to copy it.
 *
 * - an `Element` — that container.
 * - `true` — the bound element itself. The shape for a copyable block that
 *   holds its own text (`<article v-copy.selection>`): a selection made in a
 *   *different* article is not this one's.
 * - a CSS selector — the nearest matching **ancestor** (`el.closest`), else the
 *   first match in the document. `'.card'` on a copy button inside a card is
 *   the case this option exists for.
 *
 * A selector that matches nothing refuses the copy rather than falling back to
 * the whole document: a scope that silently widens is worse than no scope.
 */
export type SelectionWithin = true | string | Element

/** Fine-grained control of what counts as the user's selection. */
export interface SelectionConfig {
  /**
   * Confine the selection to a container. Omitted, any selection in the
   * document qualifies — which is what ⌘C does, and a page has one selection.
   *
   * The whole selection has to be inside: one that spans the container is out
   * of scope rather than clipped, because a clipped string is not what the
   * user highlighted.
   */
  within?: SelectionWithin
}

/** Fine-grained control of the "copied" feedback state. */
export interface FeedbackConfig {
  /** Class toggled on the element after a copy. Default `'v-copy-copied'`. */
  className?: string
  /** How long the feedback stays, in ms. Default `1500`. `0` disables it. */
  duration?: number
  /** Attribute toggled on the element. Default `'data-copied'`. `''` disables it. */
  attribute?: string
}

/**
 * Full configuration object form of the binding.
 *
 * A config object belongs to the **consumer**: the directive only reads it, so
 * freezing it, sharing one across bindings, or passing a `readonly()` view of
 * it are all ordinary. Nothing is ever written back into it — that is the
 * controller's job, and a controller is a *mutable reactive* object.
 */
export interface CopyConfig {
  /** What to copy. Omit to copy the element's `textContent` (read live, trimmed). */
  source?: string | number | (() => string)
  /**
   * Copy **what the user highlighted**, with their mouse or their keyboard,
   * instead of `source` / `textContent`. `v-copy.selection` is the same thing
   * as a modifier, and is the form to reach for when there is nothing to
   * configure.
   *
   * The copied string is `getSelection().toString()` — precisely what ⌘C would
   * have produced, engine-inserted separators at block boundaries included.
   * An empty selection (nothing highlighted, or a `user-select: none` region,
   * which stringifies to `''`) is **refused** with `error: 'empty'` rather than
   * clearing the clipboard.
   *
   * This replaces the source outright, including the "not here yet" meaning of
   * a nullish `source` — that describes a value this binding is no longer
   * copying. Pass a config object to scope it: `{ selection: { within: '.card' } }`.
   */
  selection?: boolean | SelectionConfig
  /** History array to record copies into (mutated in place, newest-first). */
  sink?: CopyEntry[]
  /** Label stamped onto rich entries. The directive argument overrides this. */
  key?: string
  /** Record rich `{ text, at, ok, key }` entries instead of plain strings. */
  rich?: boolean
  /** Max history length. Default `10`, clamped to `>= 1`. */
  max?: number
  /**
   * Keep one entry per payload. `true` (default) promotes a repeat copy back
   * to the top instead of appending a second row; a config object picks how
   * two texts are compared and which entries may be replaced; `false` records
   * every copy verbatim.
   *
   * A promotion never costs a `max` slot — de-duplication runs before the cap.
   *
   * The comparison is over **text only** by default: labels do not participate,
   * so a repeat from a differently-labelled binding replaces the older row and
   * the newer label wins. `dedupe: { scope: 'key' }` gives each label its own row.
   */
  dedupe?: boolean | DedupeConfig
  /** Copied-feedback state. `true`/config enables it (default); `false` disables. */
  feedback?: boolean | FeedbackConfig
  /**
   * Screen-reader announcement. `true` (default) announces "Copied"; a string
   * sets a custom message; `false` disables.
   */
  announce?: boolean | string
  /** DOM event that triggers the copy. Default `'click'`. `false` = programmatic only. */
  trigger?: string | false
  /** Disable the directive. */
  disabled?: boolean
  /** Called on every attempt. */
  onCopy?: (r: CopyResult) => void
  /** Called after a successful copy. */
  onSuccess?: (r: CopyResult) => void
  /** Called after a failed copy. */
  onError?: (r: CopyResult) => void
}

/**
 * A reactive controller — slot-like exposure with no composable. Bind a
 * `reactive({})` (optionally typed `reactive<CopyController>({})`) and the
 * directive fills in the read-only state plus `copy()` / `clear()`.
 *
 * **`reactive()` is the opt-in, not a recommendation.** It is the one runtime
 * question that separates the two object roles: a mutable reactive object is a
 * controller the library owns and writes state into, and everything else — a
 * plain literal, a frozen object, a `readonly()` view — is config the library
 * only reads. A plain `{}` could not serve the role anyway: it is re-created
 * every render, so no write into it is observable.
 *
 * The config half is live for a controller: setting `disabled`, `trigger`,
 * `max`, `dedupe` or `sink` takes effect immediately, with no re-render needed.
 */
export interface CopyController extends CopyConfig {
  /** Reactive: `true` while any bound element is within its feedback window. */
  copied?: boolean
  /** The capped, newest-first history array. */
  history?: CopyEntry[]
  /**
   * The head of `history` — the most recent entry recorded into it, whichever
   * binding wrote it. Two bindings sharing one sink both keep this current.
   */
  last?: CopyEntry
  /** Programmatically copy from the most-recently-mounted bound element. */
  copy?: (override?: string) => Promise<CopyResult>
  /** Clear the history. */
  clear?: () => void
}

/**
 * Every accepted binding value.
 *
 * `null` means **not yet** — the value has not arrived. The directive refuses
 * the copy instead of falling back to the element's visible text. `undefined`
 * cannot mean that: a bare `v-copy` and `v-copy="someUndefinedValue"` compile
 * to the identical binding, so `undefined` has to stay the `textContent` case.
 * For a value that may be absent, use the config form — `v-copy="{ source: maybeToken }"`
 * — where an explicitly absent `source` is distinguishable and is refused.
 */
export type CopyBinding =
  | undefined
  | null
  | false
  | string
  | number
  | CopyEntry[]
  | CopyConfig

/** Global defaults, settable via the plugin. Per-binding config always wins. */
export interface CopyPluginOptions {
  max?: number
  dedupe?: boolean | DedupeConfig
  feedback?: boolean | FeedbackConfig
  announce?: boolean | string
}

/** The `v-copy` directive type. */
export type CopyDirective = ObjectDirective<HTMLElement, CopyBinding>

declare module 'vue' {
  interface GlobalDirectives {
    /** Maps to `v-copy` in templates. */
    vCopy: CopyDirective
  }
}
