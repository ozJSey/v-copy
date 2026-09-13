/**
 * The directive — lifecycle wiring only. Resolves the binding, syncs the
 * controller registration, and delegates listener management to `events.ts`.
 */
import type { DirectiveBinding } from 'vue'
import {
  deregisterDriver,
  enrichController,
  ensureControllerHistory,
  getControllerRuntime,
} from './controller'
import { detachAll, setupHandlers } from './events'
import { executeCopy } from './execute'
import { resolveBinding } from './resolve'
import { stateMap, type DirectiveState } from './state'
import type { CopyBinding, CopyDirective } from './types'

function apply(el: HTMLElement, binding: DirectiveBinding<CopyBinding>, state: DirectiveState): void {
  const r = resolveBinding(binding)
  state.resolved = r

  // Deregister if the bound controller object identity changed.
  if (state.controller && state.controller !== r.controllerObj) {
    deregisterDriver(el, state.controller)
    state.controller = null
  }

  if (r.disabled) {
    detachAll(el, state)
    return
  }

  if (r.controllerObj) {
    const history = ensureControllerHistory(r.controllerObj)
    r.sink = history
    enrichController(r.controllerObj, history, executeCopy)
    const rt = getControllerRuntime(r.controllerObj)
    if (!rt.drivers.includes(el)) rt.drivers.push(el)
    state.controller = r.controllerObj
  }

  setupHandlers(el, state, r)
}

function mounted(el: HTMLElement, binding: DirectiveBinding<CopyBinding>): void {
  const state: DirectiveState = {
    resolved: null, triggerHandler: null, triggerEvent: null, keyHandler: null,
    feedbackTimer: null, addedTabindex: false, addedRole: false, controller: null, onceFired: false,
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
  detachAll(el, state)
  if (state.feedbackTimer) clearTimeout(state.feedbackTimer)
  if (state.controller) deregisterDriver(el, state.controller)
  stateMap.delete(el)
}

/** The `v-copy` directive. */
export const vCopy: CopyDirective = { mounted, updated, unmounted }

export default vCopy
