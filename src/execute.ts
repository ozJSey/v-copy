/**
 * Copy execution — the one pipeline every copy goes through, regardless of
 * trigger (click, keyboard, programmatic): resolve text → refuse or clipboard →
 * record history → feedback → announce → event → callbacks.
 *
 * Two refusals happen BEFORE the clipboard is touched, and they are the reason
 * this stage exists rather than the text going straight to `clipboard.ts`:
 * writing an empty string is how a copy directive silently wipes someone's
 * clipboard, and a `null` binding must not fall back to the element's visible
 * label. A refusal still reports — `copy-result`, `onCopy`, `onError` — but it
 * writes nothing, records nothing, and shows no "Copied" state, because the
 * one thing worse than a failed copy is a failed copy that looks successful.
 */
import { announce } from './announce'
import { runCopy } from './clipboard'
import { flagCopied } from './feedback'
import { record } from './history'
import { resolveText, type Resolved } from './resolve'
import type { DirectiveState } from './state'
import type { CopyResult } from './types'
import { warnOnce } from './warn'

/** Reasons a copy is refused before any clipboard call. Stable, documented values. */
type RefusalReason = 'empty' | 'pending'

const REFUSAL_WARNINGS: Record<RefusalReason, string> = {
  empty: 'refused an empty copy — writing one would clear the clipboard. Nothing was written.',
  pending: 'the binding is `null`, so nothing was copied — not even the visible text.',
}

function safeCall(fn: ((r: CopyResult) => void) | undefined, result: CopyResult): void {
  if (!fn) return
  try {
    fn(result)
  } catch (err) {
    warnOnce(`a callback threw: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function executeCopy(
  el: HTMLElement,
  state: DirectiveState,
  opts?: { event?: Event; override?: string },
): Promise<CopyResult> {
  const r = state.resolved
  if (!r || r.disabled) {
    return { success: false, text: '', via: 'exec-command', error: 'disabled' }
  }

  if (opts?.event) {
    if (r.prevent) opts.event.preventDefault()
    if (r.stop) opts.event.stopPropagation()
  }

  // An explicit override is the developer speaking directly, so it outranks a
  // pending binding — `ctrl.copy('literal')` copies the literal either way.
  const override = opts?.override
  const text = override != null
    ? (r.trim ? String(override).trim() : String(override))
    : r.pending
      ? ''
      : resolveText(el, r)

  if (override == null && r.pending) return refuse(el, r, 'pending')
  if (text === '') return refuse(el, r, 'empty')

  const { ok, via, error } = await runCopy(text)
  const result: CopyResult = { success: ok, text, via }
  if (r.key) result.key = r.key
  if (error) result.error = error

  // Order: record history -> flag copied state -> dispatch event -> callbacks,
  // so handlers always observe a consistent post-copy state.
  record(r, result)
  if (ok) {
    flagCopied(el, state)
    if (r.announce !== false) announce(r.announce)
  }
  el.dispatchEvent(new CustomEvent<CopyResult>('copy-result', { detail: result, bubbles: true }))
  safeCall(r.onCopy, result)
  safeCall(ok ? r.onSuccess : r.onError, result)

  return result
}

/**
 * Report a copy that never happened. Same reporting channels as a real failure
 * — the bare and string binding forms have no callbacks, so `copy-result` is
 * the only way a consumer can see this at all — but no clipboard write, no
 * history entry (an empty row is unpickable), no feedback, no announcement.
 */
function refuse(el: HTMLElement, r: Resolved, reason: RefusalReason): CopyResult {
  warnOnce(REFUSAL_WARNINGS[reason])
  const result: CopyResult = { success: false, text: '', via: 'exec-command', error: reason }
  if (r.key) result.key = r.key
  el.dispatchEvent(new CustomEvent<CopyResult>('copy-result', { detail: result, bubbles: true }))
  safeCall(r.onCopy, result)
  safeCall(r.onError, result)
  return result
}
