/**
 * "Copied!" feedback — the class + attribute window on the host element,
 * mirrored into the bound controller's ref-counted `copied` flag.
 */
import { getControllerRuntime } from './controller'
import type { DirectiveState } from './state'

export function flagCopied(el: HTMLElement, state: DirectiveState): void {
  const r = state.resolved
  if (!r || r.feedback === false) return
  const f = r.feedback
  if (state.feedbackTimer) clearTimeout(state.feedbackTimer)

  el.classList.add(f.className)
  if (f.attribute) el.setAttribute(f.attribute, '')

  const ctrl = state.controller
  if (ctrl) {
    getControllerRuntime(ctrl).active.add(el)
    ctrl.copied = true
  }

  state.feedbackTimer = setTimeout(() => {
    el.classList.remove(f.className)
    if (f.attribute) el.removeAttribute(f.attribute)
    state.feedbackTimer = null
    if (ctrl) {
      const rt = getControllerRuntime(ctrl)
      rt.active.delete(el)
      if (rt.active.size === 0) ctrl.copied = false
    }
  }, f.duration)
}
