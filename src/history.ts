/**
 * History recording — pushes copies into the bound sink array (newest-first,
 * capped at `max`) and mirrors the new head into every controller that points
 * at that array.
 *
 * De-duplication happens HERE, on write. The bound array belongs to the
 * consumer, so there is nowhere to hang a derived read-time view; `max` has to
 * count what the user actually sees; and a read-time filter would break the
 * in-place-mutation guarantee the array form is built on.
 *
 * The comparison is over TEXT by default — `key` is not part of the identity —
 * because the history is a list of clipboard payloads and two rows that write
 * the same string are one row. That is a real trade: the older row's label goes
 * with it. `dedupe: { scope: 'key' }` is the opt-out, and the default path warns
 * once the first time a labelled entry is actually discarded.
 */
import { syncLast } from './controller'
import type { Resolved } from './resolve'
import type { CopyEntry, CopyResult, RichCopyEntry } from './types'
import { warnOnce } from './warn'

/** One sink can be shared by a plain and a `.rich` binding — read both shapes. */
function textOf(entry: CopyEntry): string {
  return typeof entry === 'string' ? entry : entry.text
}

/** A plain string entry never carried a label, so its key is genuinely absent. */
function keyOf(entry: CopyEntry): string | undefined {
  return typeof entry === 'string' ? undefined : entry.key
}

const LABEL_DROPPED =
  "`dedupe` compares text only, so a repeat copy replaced an entry with a different `key` and " +
  "that label is gone. Use `dedupe: { scope: 'key' }` to keep one row per label."

export function record(r: Resolved, result: CopyResult): void {
  const sink = r.sink
  if (!sink) return

  let entry: CopyEntry
  if (r.rich) {
    const rich: RichCopyEntry = { text: result.text, at: Date.now(), ok: result.success }
    if (r.key) rich.key = r.key
    entry = rich
  } else {
    if (!result.success) return // plain mode records successes only
    if (r.key) warnOnce('`key`/argument is ignored for string history — add the `.rich` modifier to keep labels.')
    entry = result.text
  }

  // Promote, don't ignore: drop EVERY prior match (backwards, so a splice
  // cannot skip the next index) and unshift a fresh entry — in rich mode with
  // a fresh `at`, or the list would sort by recency while showing a stale
  // timestamp. Removing every match is what makes the option idempotent.
  // A failed copy neither merges nor evicts.
  if (r.dedupe && result.success) {
    for (let i = sink.length - 1; i >= 0; i--) {
      const stored = sink[i]
      if (!r.dedupe(textOf(stored), result.text)) continue
      const storedKey = keyOf(stored)
      if (storedKey !== r.key) {
        // `scope: 'key'` is the opt-in that makes labels part of the identity.
        if (r.dedupeScope === 'key') continue
        // Default scope: the match is removed and the newest label wins. Say so
        // once, and only when a real label is being discarded — a plain string
        // entry never had one to lose.
        if (storedKey !== undefined) warnOnce(LABEL_DROPPED)
      }
      sink.splice(i, 1)
    }
  }

  sink.unshift(entry)
  if (sink.length > r.max) sink.splice(r.max) // dedupe first, THEN the cap: a promotion never costs a slot
  // `last` belongs to the array, not to whoever copied: every controller that
  // points at this sink mirrors its head, so a row picked out of a shared
  // history updates the controller that renders it.
  syncLast(sink)
}
