/**
 * Public types + the `GlobalDirectives` template-autocomplete augmentation.
 *
 * Leaf module: imports only Vue types.
 */
import type { ObjectDirective } from 'vue'

/** Which clipboard path performed the copy. */
export type CopyVia = 'clipboard-api' | 'exec-command'

/** Result of a copy attempt — callbacks and the `copy-result` event carry it. */
export interface CopyResult {
  /** Whether the text landed on the clipboard. */
  success: boolean
  /** The text that was (attempted to be) copied. */
  text: string
  /** Which strategy ran. */
  via: CopyVia
  /** The label from the directive argument / `key` config, when set. */
  key?: string
  /**
   * Failure detail when `success` is false. Three values are stable and worth
   * branching on — `'empty'` (nothing to copy, so nothing was written),
   * `'pending'` (the binding is `null`; the value has not arrived) and
   * `'disabled'`. Anything else is the underlying clipboard error message.
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

/** Fine-grained control of the "copied" feedback state. */
export interface FeedbackConfig {
  /** Class toggled on the element after a copy. Default `'v-copy-copied'`. */
  className?: string
  /** How long the feedback stays, in ms. Default `1500`. `0` disables it. */
  duration?: number
  /** Attribute toggled on the element. Default `'data-copied'`. `''` disables it. */
  attribute?: string
}

/** Full configuration object form of the binding. */
export interface CopyConfig {
  /** What to copy. Omit to copy the element's `textContent` (read live, trimmed). */
  source?: string | number | (() => string)
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
 * Note: the exposed members are only observable when the bound object is
 * `reactive` — an inline `{}` literal is recreated each render and won't track.
 */
export interface CopyController extends CopyConfig {
  /** Reactive: `true` while any bound element is within its feedback window. */
  copied?: boolean
  /** The capped, newest-first history array. */
  history?: CopyEntry[]
  /** The most recent entry. */
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
