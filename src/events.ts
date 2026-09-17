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

/** Removes the listener only — the snapshot it took outlives it, see `detachAll`. */
function detachPress(el: HTMLElement, state: DirectiveState): void {
  if (state.pressHandler) el.removeEventListener(PRESS_EVENT, state.pressHandler, true)
  state.pressHandler = null
}

function detachListeners(el: HTMLElement, state: DirectiveState): void {
  detachTrigger(el, state)
  detachKeyboard(el, state)
  detachPress(el, state)
}

/**
 * Teardown for good: every listener, plus any selection snapshot still pending.
 * Unmount, `disabled` and a re-arm all go through here — nothing may survive
 * into a gesture that has not happened yet.
 */
export function detachAll(el: HTMLElement, state: DirectiveState): void {
  detachListeners(el, state)
  forgetSelection(el)
}

function onTrigger(el: HTMLElement, state: DirectiveState, e: Event): void {
  const r = state.resolved
  if (!r || r.disabled) return
  if (r.once) {
    if (state.onceFired) return
    state.onceFired = true
    // Listeners go synchronously, so no further event slips through — but the
    // selection snapshot stays. It was taken on the press that is delivering
    // this very event, and `executeCopy` below is the copy that consumes it.
    // Dropping it here made `.selection.once` copy nothing at all on a
    // non-interactive host, which is the only host shape that needs the
    // snapshot: the live selection is already collapsed by click time.
    detachListeners(el, state)
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
    forgetSelection(el) // the binding stopped asking: a snapshot must not resurface
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

  // Built-in keyboard support for non-native-interactive copyables. Native
  // controls are left alone: they already translate Enter/Space into a click,
  // so a second handler would copy twice for one press.
  const keyboardable = desired != null && !isNativeInteractive(el)
  if (!keyboardable) {
    detachKeyboard(el, state)
    return
  }

  // Focusable and announced, for EVERY trigger — including a key-shaped one.
  // An element that cannot take focus never receives a `keydown`, so gating
  // these on the Enter/Space handler below left `trigger: 'keydown'` on a
  // <span> unreachable from the one device it was configured for.
  if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); state.addedTabindex = true }
  if (!el.hasAttribute('role')) { el.setAttribute('role', 'button'); state.addedRole = true }

  // The Enter/Space handler itself, skipped when the trigger IS a key event:
  // the trigger listener is already on that key, and both would fire for one
  // press. (`desired` narrows to a string from `keyboardable` above.)
  const wantEnterSpace = !KEY_TRIGGERS.has(desired)
  if (wantEnterSpace && !state.keyHandler) {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault() // stop Space scrolling / default activation
        onTrigger(el, state, e)
      }
    }
    el.addEventListener('keydown', handler)
    state.keyHandler = handler
  } else if (!wantEnterSpace && state.keyHandler) {
    el.removeEventListener('keydown', state.keyHandler)
    state.keyHandler = null
  }
}
