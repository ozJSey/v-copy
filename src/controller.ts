/**
 * Controller runtime — the slot-like reactive object consumers bind, and the
 * state the LIBRARY owns behind it.
 *
 * Ownership is the whole point of this module. The runtime (a WeakMap keyed by
 * the bound object) is the authority on which elements drive a controller, how
 * many feedback windows are open, and which array the copies go into; the bound
 * object is where that state is *mirrored* so a template can read it. Nothing
 * here ever runs against an object `resolve.ts` did not certify as a mutable
 * reactive controller, which is why every write below is safe.
 *
 * `last` is mirrored from the head of the history for **every** controller that
 * points at that array — not for whoever performed the copy. Two bindings can
 * share one sink (that is exactly the history-picker pattern), and `last` is
 * documented as "the most recent entry", not "the most recent entry of mine".
 *
 * The programmatic-copy executor is INJECTED by the directive (see
 * `enrichController`) so this module never imports `execute.ts` — keeps the
 * module graph acyclic.
 */
import { toRaw } from 'vue'
import type { DirectiveState } from './state'
import { stateMap } from './state'
import type { CopyController, CopyEntry, CopyResult } from './types'

export interface ControllerRuntime {
  /** Bound elements in mount order — the last is the "most recent" driver. */
  drivers: HTMLElement[]
  /** Drivers currently within their feedback window (ref-count for `copied`). */
  active: Set<HTMLElement>
  /** The array copies are recorded into — the consumer's `sink` when there is one. */
  history: CopyEntry[] | null
}

const controllerRuntimes = new WeakMap<object, ControllerRuntime>()

/**
 * Which controllers mirror a given history array, keyed by the RAW array so a
 * reactive proxy and its target are one key. Ephemeron semantics keep this from
 * pinning anything alive: an entry survives only while its array does.
 */
const sinkOwners = new WeakMap<object, Set<CopyController>>()

export function getControllerRuntime(ctrl: object): ControllerRuntime {
  let rt = controllerRuntimes.get(ctrl)
  if (!rt) {
    rt = { drivers: [], active: new Set(), history: null }
    controllerRuntimes.set(ctrl, rt)
  }
  return rt
}

/**
 * Point the controller at the array it records into, and return that array.
 *
 * Re-read on every resolution, so `ctrl.sink = otherArray` re-points the
 * history instead of being ignored forever after the first render. The array is
 * read back out of the controller after assignment: on a reactive object that
 * hands back the proxy, and every mutation has to go through the proxy or the
 * template never sees it.
 */
export function syncControllerHistory(ctrl: CopyController): CopyEntry[] {
  const rt = getControllerRuntime(ctrl)
  const sink = Array.isArray(ctrl.sink) ? ctrl.sink : null
  const wanted =
    sink ??
    rt.history ??
    // A controller whose last driver unmounted keeps its history on the object;
    // remounting it (a `v-if` toggle) must not silently start a new one.
    (Array.isArray(ctrl.history) ? ctrl.history : [])

  if (rt.history !== wanted) {
    // Stop mirroring the array we are leaving, or a write into it would keep
    // setting a `last` this controller no longer shows.
    if (rt.history) sinkOwners.get(toRaw(rt.history))?.delete(ctrl)
    ctrl.history = wanted
    const live = ctrl.history as CopyEntry[]
    rt.history = live
    owners(live).add(ctrl)
    ctrl.last = live[0]
  }
  return rt.history as CopyEntry[]
}

function owners(sink: CopyEntry[]): Set<CopyController> {
  const raw = toRaw(sink)
  let set = sinkOwners.get(raw)
  if (!set) {
    set = new Set()
    sinkOwners.set(raw, set)
  }
  return set
}

/** Mirror the head of a history into every controller that points at it. */
export function syncLast(sink: CopyEntry[]): void {
  const set = sinkOwners.get(toRaw(sink))
  if (!set) return
  for (const ctrl of set) ctrl.last = sink[0]
}

/** Signature of the copy executor `enrichController` receives from the directive. */
export type CopyExecutor = (
  el: HTMLElement,
  state: DirectiveState,
  opts?: { event?: Event; override?: string },
) => Promise<CopyResult>

export function enrichController(ctrl: CopyController, executeCopy: CopyExecutor): void {
  const rt = getControllerRuntime(ctrl)
  if (ctrl.copied === undefined) ctrl.copied = false
  if (typeof ctrl.copy !== 'function') {
    ctrl.copy = (override?: string) => {
      const el = rt.drivers[rt.drivers.length - 1]
      const st = el ? stateMap.get(el) : undefined
      if (!el || !st || !st.resolved) {
        return Promise.resolve<CopyResult>({ success: false, text: '', via: 'none', error: 'no bound element' })
      }
      return executeCopy(el, st, { override })
    }
  }
  if (typeof ctrl.clear !== 'function') {
    ctrl.clear = () => {
      const history = rt.history
      if (!history) return
      history.splice(0)
      syncLast(history)
    }
  }
}

export function deregisterDriver(el: HTMLElement, ctrl: CopyController): void {
  const rt = controllerRuntimes.get(ctrl)
  if (!rt) return
  const i = rt.drivers.indexOf(el)
  if (i >= 0) rt.drivers.splice(i, 1)
  rt.active.delete(el)
  if (rt.active.size === 0) ctrl.copied = false
}
