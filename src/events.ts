/**
 * Event wiring — the trigger listener, the press listener that rescues the
 * user's selection, the built-in keyboard support for non-native-interactive
 * hosts (tabindex + role=button + Enter/Space), and their teardown.
 * Attach/detach is idempotent and diff-driven.
 */
import { executeCopy } from './execute'
import { SELECTION, type Resolved } from './resolve'
import { captureSelection, forgetSelection } from './selection'
import type { DirectiveState } from './state'

/** Triggers that ARE a key press — adding Enter/Space on top would copy twice. */
const KEY_TRIGGERS = new Set(['keydown', 'keyup', 'keypress'])

/**
 * The press that precedes the activation, and the last moment the user's
 * selection is still readable — the collapse is the *default action* of
 * `mousedown`, which runs after the event has finished dispatching.
 *
 * One event, not both: a touch interaction fires `pointerdown` up front and the
 * compatibility `mousedown` only after the tap has finished, by which time the
 * selection is already gone — a second listener would overwrite the good
 * snapshot with an empty one. `mousedown` is the fallback for an environment
 * with no pointer events at all (jsdom is one, which is why the unit suite
 * exercises this path).
 */
const PRESS_EVENT = typeof PointerEvent === 'function' ? 'pointerdown' : 'mousedown'

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

function detachPress(el: HTMLElement, state: DirectiveState): void {
  if (state.pressHandler) el.removeEventListener(PRESS_EVENT, state.pressHandler, true)
  state.pressHandler = null
  forgetSelection(el)
}

export function detachAll(el: HTMLElement, state: DirectiveState): void {
  detachTrigger(el, state)
  detachKeyboard(el, state)
  detachPress(el, state)
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
  // `.once` has fired and everything is detached — keep it that way. Re-arming
  // on the next render would leave a focusable `role="button"` element with
  // live listeners that copies nothing.
  if (r.once && state.onceFired) {
    detachAll(el, state)
    return
  }

  // Selection rescue. Capture phase, so a consumer's own `stopPropagation` on a
  // descendant cannot stop it, and passive — nothing here changes what the
  // press does. Attached regardless of `trigger`, because `trigger: false` plus
  // a consumer's `@click="ctrl.copy()"` is the same lost selection.
  const wantPress = r.source === SELECTION
  if (wantPress && !state.pressHandler) {
    // Reads the live resolution rather than closing over `r`, so a changed
    // `within` takes effect without re-attaching.
    const handler = () => {
      const cur = state.resolved
      if (cur && cur.source === SELECTION) captureSelection(el, cur.within)
    }
    el.addEventListener(PRESS_EVENT, handler, { capture: true, passive: true })
    state.pressHandler = handler
  } else if (!wantPress && state.pressHandler) {
    detachPress(el, state)
  }

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

  // Built-in keyboard support for non-native-interactive copyables. Skipped for
  // native controls (they already translate Enter/Space to click) and for
  // key-shaped triggers (the trigger listener is already on that key event) —
  // both would otherwise copy twice for one press.
  const wantKeyboard = desired != null && !KEY_TRIGGERS.has(desired) && !isNativeInteractive(el)
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
