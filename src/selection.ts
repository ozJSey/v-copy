/**
 * The user's own text selection — reading it, and keeping it alive across the
 * gesture that is about to destroy it.
 *
 * ---------------------------------------------------------------------------
 * `getSelection().toString()` IS correct here — and that is the OPPOSITE of the
 * conclusion `v-select-text` reached. Do not "fix" it into agreement.
 * ---------------------------------------------------------------------------
 *
 * `v-select-text` makes the selection itself, so it holds a resolved view of
 * what it selected and reports that string on its event. Copying
 * `toString()` there would mean reporting one string and writing another —
 * its `src/copy.ts` calls that out at length, and it is right to.
 *
 * Here there is no competing view. The user made this selection with a mouse
 * or a keyboard; `toString()` is the engine's own account of it, and it is
 * exactly the string ⌘C would have put on the clipboard. The differences
 * someone will eventually be tempted to normalise away —
 *
 *   - the separators an engine inserts at block and table-cell boundaries
 *     (a newline between `<p>`s, a tab between `<td>`s in some engines), and
 *   - the `''` that a `user-select: none` region stringifies to
 *
 * — are what the platform would have given the user. They are the answer, not
 * noise. The one thing this package does NOT do is write that `''`: an empty
 * selection is refused in `execute.ts` rather than clearing the clipboard,
 * which is the same rule `v-select-text` ships.
 *
 * ---------------------------------------------------------------------------
 * The crux: the press that starts the copy destroys the selection
 * ---------------------------------------------------------------------------
 *
 * Measured in Chrome 153 with trusted `Input.dispatchMouseEvent`, dragging a
 * real selection and clicking a real trigger:
 *
 *   host carrying the trigger                    selection at `click` time
 *   -------------------------------------------  -------------------------
 *   `<button>`                                   intact
 *   `<span tabindex="0" role="button">`          GONE — collapsed between
 *     (exactly what `events.ts` injects)           `mousedown` and `mouseup`
 *   any other non-interactive element            GONE
 *
 * So reading the selection in the click handler works on one host shape and
 * silently copies nothing on every other one — and the shape it fails on is
 * this package's own default, since `events.ts` makes non-interactive hosts
 * copyable. That is the bug this module exists to avoid.
 *
 * **What we do: snapshot the selection on the press, before the default action
 * that collapses it.** `pointerdown` (or `mousedown` where `PointerEvent` does
 * not exist) is dispatched *before* the browser runs the default action, so a
 * passive listener there still sees the intact selection. The snapshot is used
 * only when the live selection has gone empty by copy time, and it is consumed
 * once — see `takeSelectionText`.
 *
 * **What we do NOT do: `preventDefault()` on `mousedown`.** It works — the same
 * probe confirms the selection survives — but its other effect is that focus
 * never moves to the trigger (measured: `document.activeElement` stayed on
 * `<body>` after clicking the button). A control the user just activated that
 * does not take focus breaks `:focus-visible`, breaks a screen reader's idea of
 * where the user is, and breaks any consumer relying on `focus`/`blur` on the
 * trigger. It also does nothing for the keyboard path. Paying an a11y cost on
 * every binding to fix a mouse-only problem is the wrong trade, and it is not
 * ours to make on the consumer's behalf.
 *
 * The keyboard path needs no snapshot at all: moving focus with Tab leaves the
 * document selection in place (measured), so `Enter`/`Space` on the trigger
 * reads it live.
 */
import type { SelectionWithin } from './types'
import { warnOnce } from './warn'

/**
 * The selection captured on the press that is about to destroy it. Keyed by
 * the trigger element, so two triggers never read each other's gesture.
 */
const snapshots = new WeakMap<HTMLElement, string>()

/**
 * `within` named a container that is not on the page.
 *
 * Fail closed: widening back to the whole document would copy text the binding
 * explicitly said it did not want, which is the one outcome a *scoping* option
 * must never produce.
 */
const NO_CONTAINER = Symbol('v-copy:no-container')

/**
 * `<input>` types whose selection is a text selection the user can see.
 *
 * `password` is deliberately absent. Whatever a given browser does with ⌘C in a
 * password field, slicing `value` here would make `v-copy` the most permissive
 * route on the page to its contents — which is not a thing a copy directive
 * should be, and not something a consumer would expect from `.selection`.
 */
const SELECTABLE_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel'])

/**
 * Resolve `within` to the container the selection has to live inside.
 *
 * - `undefined` → `null`, the whole document. See README: a page has one
 *   selection, and ⌘C does not ask which card you meant.
 * - `true` → the bound element itself.
 * - a selector → the nearest matching **ancestor** first (that is the
 *   copy-button-inside-a-card case, which is the reason the option exists),
 *   and only then the first match in the document (a toolbar button outside
 *   the panel it acts on).
 */
function resolveContainer(
  el: HTMLElement,
  within: SelectionWithin | undefined,
): Element | null | typeof NO_CONTAINER {
  if (within === undefined) return null
  if (within === true) return el
  if (typeof within !== 'string') return within
  return el.closest(within) ?? el.ownerDocument.querySelector(within) ?? NO_CONTAINER
}

/**
 * The focused text field's own selection.
 *
 * Not every engine mirrors a focused field's selection into the document
 * selection: Chrome does, Firefox and Safari do not (the split `v-select-text`
 * documents; measured here in Chrome and in jsdom, which behaves like the
 * latter). Without this branch `v-copy.selection` would copy an `<input>` in
 * one engine and nothing in the others. `v-select-text` records that split as a
 * hazard to route around; here it is a hole to close, because a user pointing
 * at their own highlighted text does not care which node owns it.
 *
 * Read from the LIVE field rather than remembered: at `pointerdown` time the
 * field still has focus (the blur is part of the default action we run ahead
 * of), so the snapshot catches it. Once focus has moved on — tabbing from the
 * field to a copy button — the field's selection is no longer the document's
 * current one in any engine, and this returns `''`. That limit is in the README.
 */
function activeFieldSelection(doc: Document, container: Element | null): string {
  const el = doc.activeElement
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return ''
  if (el instanceof HTMLInputElement && !SELECTABLE_INPUT_TYPES.has(el.type)) return ''
  if (container && !container.contains(el)) return ''
  const { selectionStart: start, selectionEnd: end } = el
  if (start == null || end == null || start === end) return ''
  return el.value.slice(start, end)
}

/**
 * What the user currently has selected, as the clipboard would receive it.
 *
 * Returns `''` for "nothing the binding may copy" — no selection, a collapsed
 * one, a `user-select: none` region, a selection outside `within`, or a
 * `within` that does not resolve. `execute.ts` turns that into a refusal.
 */
export function readSelectionText(el: HTMLElement, within: SelectionWithin | undefined): string {
  const doc = el.ownerDocument
  const container = resolveContainer(el, within)
  if (container === NO_CONTAINER) {
    warnOnce(
      `\`selection.within\` matched no element, so nothing was copied. ` +
        `A scope that cannot be resolved is not widened back to the whole document.`,
    )
    return ''
  }

  // The field first: when one is focused, its selection is where the user's
  // caret is — and in the engines that do not mirror it, invisible to
  // `getSelection()` entirely.
  const field = activeFieldSelection(doc, container)
  if (field !== '') return field

  const selection = doc.getSelection()
  if (!selection || selection.rangeCount === 0) return ''

  if (container) {
    // `commonAncestorContainer` contains both endpoints, so this is "the whole
    // range lies inside the container". A selection that *spans* the container
    // — the user dragged across the whole page — is deliberately out of scope:
    // it is not this card's selection, and clipping it would hand back a string
    // the user never highlighted.
    for (let i = 0; i < selection.rangeCount; i++) {
      if (!container.contains(selection.getRangeAt(i).commonAncestorContainer)) return ''
    }
  }

  return selection.toString()
}

/**
 * Remember the selection the press is about to destroy.
 *
 * Always overwrites, including with `''`: the snapshot has to describe *this*
 * gesture. A user who deselects and then clicks the trigger must get the
 * refusal, not the selection they had a minute ago.
 */
export function captureSelection(el: HTMLElement, within: SelectionWithin | undefined): void {
  snapshots.set(el, readSelectionText(el, within))
}

/**
 * The text to copy: the live selection when there still is one, otherwise the
 * one captured on the press.
 *
 * Live wins so that a selection which legitimately *changed* between press and
 * copy is never overridden by a stale capture — and so the keyboard path, which
 * takes no snapshot, needs no special case.
 *
 * The snapshot is consumed, not cached: one press, one copy. The only way to
 * reach a stale one would be to press the trigger, drag away without releasing
 * on it, and then activate it from the keyboard without selecting anything in
 * between — at which point the captured text is still the last selection the
 * user made.
 */
export function takeSelectionText(el: HTMLElement, within: SelectionWithin | undefined): string {
  const live = readSelectionText(el, within)
  const captured = snapshots.get(el)
  snapshots.delete(el)
  return live !== '' ? live : (captured ?? '')
}

/** Drop a pending snapshot — the binding stopped listening for presses. */
export function forgetSelection(el: HTMLElement): void {
  snapshots.delete(el)
}
