/**
 * Event wiring — the trigger listener, the built-in keyboard support for
 * non-native-interactive hosts (tabindex + role=button + Enter/Space), and
 * their teardown. Attach/detach is idempotent and diff-driven.
 */
import { executeCopy } from './execute'
import type { Resolved } from './resolve'
import type { DirectiveState } from './state'

function isNativeInteractive(el: HTMLElement): boolean {
  const tag = el.tagName
  return (
    tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
    (tag === 'A' && el.hasAttribute('href'))
  )
}

function detachTrigger(el: HTMLElement, state: DirectiveState): void {
  if (state.triggerHandler && state.triggerEvent) {
    el.removeEventListener(state.triggerEvent, state.triggerHandler)
  }
  state.triggerHandler = null
  state.triggerEvent = null
}

function detachKeyboard(el: HTMLElement, state: DirectiveState): void {
  if (state.keyHandler) el.removeEventListener('keydown', state.keyHandler)
  state.keyHandler = null
  if (state.addedTabindex) { el.removeAttribute('tabindex'); state.addedTabindex = false }
  if (state.addedRole) { el.removeAttribute('role'); state.addedRole = false }
}

export function detachAll(el: HTMLElement, state: DirectiveState): void {
  detachTrigger(el, state)
  detachKeyboard(el, state)
}

function onTrigger(el: HTMLElement, state: DirectiveState, e: Event): void {
  const r = state.resolved
  if (!r || r.disabled) return
  if (r.once) {
    if (state.onceFired) return
    state.onceFired = true
    detachAll(el, state) // detach synchronously so no further events slip through
  }
  void executeCopy(el, state, { event: e })
}

export function setupHandlers(el: HTMLElement, state: DirectiveState, r: Resolved): void {
  const desired = r.trigger === false ? null : (r.trigger || 'click')

  // Trigger listener — the handler reads live state, so a changed source/config
  // needs no re-attach; only an event-name change does.
  if (state.triggerEvent !== desired) {
    detachTrigger(el, state)
    if (desired) {
      const handler = (e: Event) => onTrigger(el, state, e)
      el.addEventListener(desired, handler)
      state.triggerHandler = handler
      state.triggerEvent = desired
    }
  }

  // Built-in keyboard support for non-native-interactive copyables. Native
  // controls already translate Enter/Space to click, so we skip them (no double-copy).
  const wantKeyboard = desired != null && !isNativeInteractive(el)
  if (wantKeyboard && !state.keyHandler) {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault() // stop Space scrolling / default activation
        onTrigger(el, state, e)
      }
    }
    el.addEventListener('keydown', handler)
    state.keyHandler = handler
    if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); state.addedTabindex = true }
    if (!el.hasAttribute('role')) { el.setAttribute('role', 'button'); state.addedRole = true }
  } else if (!wantKeyboard && state.keyHandler) {
    detachKeyboard(el, state)
  }
}
