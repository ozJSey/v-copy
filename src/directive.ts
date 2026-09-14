/**
 * The directive — lifecycle wiring only. Resolves the binding, syncs the
 * controller registration, and delegates listener management to `events.ts`.
 *
 * A **config** binding is resolved once per render, which is all a render-owned
 * value can be. A **controller** is a reactive object the library owns, so it
 * gets a subscription instead: `ctrl.disabled = true`, `ctrl.trigger = 'dblclick'`
 * or `ctrl.sink = other` re-resolve and re-apply immediately, without waiting
 * for something unrelated to re-render the host.
 */
import { watch, type DirectiveBinding } from 'vue'
import {
  deregisterDriver,
  enrichController,
  getControllerRuntime,
  syncControllerHistory,
} from './controller'
import { detachAll, setupHandlers } from './events'
import { executeCopy } from './execute'
import { resolveBinding, type Resolved } from './resolve'
import { stateMap, type DirectiveState } from './state'
import type { CopyBinding, CopyDirective } from './types'

function applyResolved(el: HTMLElement, state: DirectiveState, r: Resolved): void {
  state.resolved = r

  // Deregister if the bound controller object identity changed.
  if (state.controller && state.controller !== r.controller) {
    deregisterDriver(el, state.controller)
    state.controller = null
  }

  // Before the `disabled` return, not after: a controller that starts out
  // disabled still owns its `copy()` / `clear()` / `history`, and `copy()` is
  // the only channel that can report the documented `error: 'disabled'`.
  if (r.controller) {
    r.sink = syncControllerHistory(r.controller)
    enrichController(r.controller, executeCopy)
    const rt = getControllerRuntime(r.controller)
    if (!rt.drivers.includes(el)) rt.drivers.push(el)
    state.controller = r.controller
  }

  if (r.disabled) {
    detachAll(el, state)
    return
  }

  setupHandlers(el, state, r)
}

function stopWatch(state: DirectiveState): void {
  if (state.stopWatch) state.stopWatch()
  state.stopWatch = null
}

function apply(el: HTMLElement, binding: DirectiveBinding<CopyBinding>, state: DirectiveState): void {
  state.binding = binding
  stopWatch(state)

  const first = resolveBinding(binding)
  if (!first.controller) {
    applyResolved(el, state, first)
    return
  }

  // The getter IS the resolution, so the subscription tracks exactly the
  // properties resolution reads — no list of option names to keep in sync. It
  // reads no library-owned key (`history` / `copied` / `last` / `copy` /
  // `clear`), so mirroring state back into the controller cannot re-trigger it.
  state.stopWatch = watch(
    () => resolveBinding(state.binding as DirectiveBinding<CopyBinding>),
    (r) => applyResolved(el, state, r),
    { immediate: true, flush: 'sync' },
  )
}

function mounted(el: HTMLElement, binding: DirectiveBinding<CopyBinding>): void {
  const state: DirectiveState = {
    resolved: null, binding: null, stopWatch: null, triggerHandler: null, triggerEvent: null,
    pressHandler: null, keyHandler: null, feedbackTimer: null, addedTabindex: false,
    addedRole: false, controller: null, onceFired: false,
  }
  stateMap.set(el, state)
  apply(el, binding, state)
}

function updated(el: HTMLElement, binding: DirectiveBinding<CopyBinding>): void {
  const state = stateMap.get(el)
  if (state) apply(el, binding, state)
}

function unmounted(el: HTMLElement): void {
  const state = stateMap.get(el)
  if (!state) return
  stopWatch(state)
  state.binding = null
  detachAll(el, state)
  if (state.feedbackTimer) clearTimeout(state.feedbackTimer)
  if (state.controller) deregisterDriver(el, state.controller)
  stateMap.delete(el)
}

/** The `v-copy` directive. */
export const vCopy: CopyDirective = { mounted, updated, unmounted }

export default vCopy
