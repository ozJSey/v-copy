/**
 * Per-element directive state — listeners, feedback timer, injected a11y
 * attributes, the bound controller, and the `.once` latch.
 */
import type { MutableController, Resolved } from './resolve'

export interface DirectiveState {
  resolved: Resolved | null
  triggerHandler: ((e: Event) => void) | null
  triggerEvent: string | null
  keyHandler: ((e: KeyboardEvent) => void) | null
  feedbackTimer: ReturnType<typeof setTimeout> | null
  addedTabindex: boolean
  addedRole: boolean
  controller: MutableController | null
  onceFired: boolean
}

export const stateMap = new WeakMap<HTMLElement, DirectiveState>()
