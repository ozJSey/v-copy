/**
 * Controller runtime — the slot-like reactive object consumers bind. Tracks
 * which elements drive a controller (mount order), ref-counts the feedback
 * windows behind `copied`, and enriches the bound object with `copy()` /
 * `clear()` in place.
 *
 * The programmatic-copy executor is INJECTED by the directive (see
 * `enrichController`) so this module never imports `execute.ts` — keeps the
 * module graph acyclic.
 */
import type { MutableController } from './resolve'
import type { DirectiveState } from './state'
import { stateMap } from './state'
import type { CopyEntry, CopyResult } from './types'

export interface ControllerRuntime {
  /** Bound elements in mount order — the last is the "most recent" driver. */
  drivers: HTMLElement[]
  /** Drivers currently within their feedback window (ref-count for `copied`). */
  active: Set<HTMLElement>
}

const controllerRuntimes = new WeakMap<object, ControllerRuntime>()

export function getControllerRuntime(ctrl: object): ControllerRuntime {
  let rt = controllerRuntimes.get(ctrl)
  if (!rt) {
    rt = { drivers: [], active: new Set() }
    controllerRuntimes.set(ctrl, rt)
  }
  return rt
}

/** Ensure the controller has a history array; return the (reactive) array to mutate. */
export function ensureControllerHistory(ctrl: MutableController): CopyEntry[] {
  if (!Array.isArray(ctrl.history)) {
    ctrl.history = Array.isArray(ctrl.sink) ? ctrl.sink : []
  }
  return ctrl.history
}

/** Signature of the copy executor `enrichController` receives from the directive. */
export type CopyExecutor = (
  el: HTMLElement,
  state: DirectiveState,
  opts?: { event?: Event; override?: string },
) => Promise<CopyResult>

export function enrichController(
  ctrl: MutableController,
  history: CopyEntry[],
  executeCopy: CopyExecutor,
): void {
  const rt = getControllerRuntime(ctrl)
  if (ctrl.copied === undefined) ctrl.copied = false
  if (ctrl.last === undefined) ctrl.last = history[0]
  if (typeof ctrl.copy !== 'function') {
    ctrl.copy = (override?: string) => {
      const el = rt.drivers[rt.drivers.length - 1]
      const st = el ? stateMap.get(el) : undefined
      if (!el || !st || !st.resolved) {
        return Promise.resolve<CopyResult>({ success: false, text: '', via: 'exec-command', error: 'no bound element' })
      }
      return executeCopy(el, st, { override })
    }
  }
  if (typeof ctrl.clear !== 'function') {
    ctrl.clear = () => {
      if (Array.isArray(ctrl.history)) ctrl.history.splice(0)
      ctrl.last = undefined
    }
  }
}

export function deregisterDriver(el: HTMLElement, ctrl: MutableController): void {
  const rt = controllerRuntimes.get(ctrl)
  if (!rt) return
  const i = rt.drivers.indexOf(el)
  if (i >= 0) rt.drivers.splice(i, 1)
  rt.active.delete(el)
  if (rt.active.size === 0) ctrl.copied = false
}
