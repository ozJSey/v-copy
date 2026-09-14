/**
 * Per-element directive state — listeners (trigger, keyboard, and the press
 * listener that rescues the user's selection), feedback timer, injected a11y
 * attributes, the bound controller, the `.once` latch, and the subscription
 * that keeps a controller's config half live.
 */
import type { DirectiveBinding } from 'vue'
import type { Resolved } from './resolve'
import type { CopyBinding, CopyController } from './types'

export interface DirectiveState {
  resolved: Resolved | null
  /** The latest binding, re-read by the controller subscription in `directive.ts`. */
  binding: DirectiveBinding<CopyBinding> | null
  /** Stops that subscription. Null whenever the binding is not a controller. */
  stopWatch: (() => void) | null
  triggerHandler: ((e: Event) => void) | null
  triggerEvent: string | null
  /** Capture-phase press listener that snapshots the user's selection. */
  pressHandler: (() => void) | null
  keyHandler: ((e: KeyboardEvent) => void) | null
  feedbackTimer: ReturnType<typeof setTimeout> | null
  addedTabindex: boolean
  addedRole: boolean
  controller: CopyController | null
  onceFired: boolean
}

export const stateMap = new WeakMap<HTMLElement, DirectiveState>()
