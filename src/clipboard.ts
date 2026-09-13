/**
 * Clipboard strategies — the async Clipboard API with an automatic
 * `execCommand('copy')` fallback on both absence AND rejection.
 */
import type { CopyVia } from './types'

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function canUseClipboardApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  )
}

function execCommandCopy(text: string): void {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('execCommand copy returned false')
}

export async function runCopy(text: string): Promise<{ ok: boolean; via: CopyVia; error?: string }> {
  if (!isBrowser()) return { ok: false, via: 'exec-command', error: 'unavailable: no DOM (SSR)' }
  // Prefer the async Clipboard API, but fall back on BOTH absence AND rejection
  // (denied permission, insecure context, missing user gesture). The rejection
  // path is why we don't pre-check `isSecureContext` — the catch covers it.
  if (canUseClipboardApi()) {
    try {
      await navigator.clipboard.writeText(text)
      return { ok: true, via: 'clipboard-api' }
    } catch {
      /* fall through to the legacy path */
    }
  }
  try {
    execCommandCopy(text)
    return { ok: true, via: 'exec-command' }
  } catch (err) {
    return { ok: false, via: 'exec-command', error: err instanceof Error ? err.message : String(err) }
  }
}
