# Changelog

All notable changes to **@ozjsey/v-copy** are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 1.2.2 — 2026-09-18

Documentation only; no code change. The README is cut to a landing page — problem, solution,
install, a couple of usage examples — because the playground now carries the reference: every
option driven in a real browser rather than described in a table. Claims that could not be
verified against the source were deleted rather than carried across.

## [1.2.1] — 2026-09-17

Two bugs in `events.ts`, both of which made a documented binding do nothing at all. Each is covered
by a unit test that fails without the fix, and each was additionally driven in a real Chrome through
the playground's `v-copy` tab with trusted input and the real system clipboard — the two failures
are about a selection the browser collapses and about focus, neither of which jsdom models.

### Fixed

- **`.selection` with `.once` copied nothing on a non-interactive host.** `<span v-copy.selection.once>`
  — a `<button>` was never affected. The `.once` latch tears every listener down *inside* the click
  it is latching, and that teardown also dropped the selection snapshot taken on the press. On a
  non-interactive host that snapshot is the only text there is by click time: the browser has
  already collapsed the live selection as the press's default action, which is the entire reason
  1.2.0 takes a snapshot. So the one copy `.once` exists to allow was refused as `error: 'empty'`,
  with the console warning naming an empty selection the user could plainly see was not empty.

  The teardown now keeps the snapshot for the copy it is latching; `takeSelectionText` consumes it
  a moment later, as it does on every other path. Every other teardown — unmount, `disabled`, a
  re-arm, a binding that stops asking for a selection — still drops it, because nothing may survive
  into a gesture that has not happened yet.

  Measured before the fix, in Chrome, with a real drag and a trusted click:
  `dragged="first algorithm" firstPress="COPY5-SENTINEL-once"` — the clipboard still held the
  sentinel written before the test, i.e. nothing was copied.

- **A key-shaped `trigger` (`keydown` / `keyup` / `keypress`) left a non-interactive host out of the
  tab order, so no keyboard could ever fire it.** The `tabindex="0"` + `role="button"` injection and
  the built-in Enter/Space handler were gated on one condition, and a key-shaped trigger switched
  off both. Skipping the Enter/Space handler is correct — the trigger listener is already on that
  key event, and both would copy twice for one press — but skipping the tab stop with it left
  `<span v-copy="{ trigger: 'keydown' }">` unreachable from the only input device a `keydown`
  trigger has, while the README promised a custom trigger keeps the keyboard path. The two are now
  decided separately: the tab stop and the role are added for every trigger, the Enter/Space handler
  only when the trigger is not itself a key event.

  Measured before the fix: `tabindex=null role=null focusAfter8Tabs=button.demo__btn` — eight
  trusted Tab presses walked straight past the span and out of the card.

### Playground

- `16-user-selection.vue` gains a `.selection.once` trigger (with a re-arm control, since `.once`
  detaches for good), and `09-disabled-trigger.vue` gains a `trigger: 'keydown'` host. Both are
  driven by new checks in `playground/scripts/interactions/v-copy.mjs`: the selection one drags a
  real selection, clicks with trusted input and reads the real system clipboard back; the key one
  walks the real tab order with trusted Tab presses and asserts the `[data-copied]` the library
  raises only after the clipboard write resolved — a `readText()` on that card stalls the renderer,
  which the check says so in its own comment.

## 1.2.0

### Added — `v-copy.selection`: copy what the **user** highlighted

```vue
<p>Ada Lovelace wrote the first algorithm intended for a machine, in 1843.</p>
<button v-copy.selection>Copy selection</button>
```

A selection is just another source, so it feeds the history, the `dedupe` promotion, `.rich`
entries, the `[data-copied]` window, the announcement and `copy-result` exactly like a string
binding does. `v-copy="{ selection: true }"` is the config form; `{ selection: { within } }` scopes
it.

**The press destroys the selection, which is the whole difficulty.** Measured in Chrome 153 with
trusted input, dragging a real selection and clicking a real trigger:

| Trigger host | Selection at `click` time |
|---|---|
| `<button>` | intact |
| `<span>` / `<div>` — what this directive makes copyable | **gone**, collapsed between `mousedown` and `mouseup` |

So the selection is **captured on `pointerdown`**, before the browser's default action collapses it,
and used only when the live selection has gone empty by copy time; the capture is consumed once per
press. `preventDefault()` on `mousedown` would also have worked and was rejected: it additionally
suppresses focus on the trigger (measured — `activeElement` stays on `<body>`), which is an
accessibility cost on every binding to fix a mouse-only problem, and it does nothing for the
keyboard. The keyboard path needs no capture: Tab leaves the document selection in place, so
Shift+Arrow → Tab → Enter reads it live.

- **What is copied is `getSelection().toString()`** — exactly what ⌘C would have produced, including
  the separators an engine inserts at block and cell boundaries. They are not normalised. This is
  deliberately the opposite of `v-select-text`'s conclusion, where the package owns a competing
  resolved view and `toString()` would mean reporting one string and writing another.
- **An empty selection is refused**, with `error: 'empty'` — nothing selected, a collapsed caret, or
  a `user-select: none` region, which stringifies to `""`. Writing that would clear the user's
  clipboard. A one-time console warning names the selection case.
- **`within` scopes it.** The default is the whole document (⌘C parity — a page has one selection).
  `within: '.card'` resolves the nearest matching ancestor, else the first match in the document;
  `within: true` is the bound element. A selection that *spans* the container is out of scope rather
  than clipped, and a selector matching nothing refuses rather than widening back to the document.
- **A focused `<input>` / `<textarea>` is read directly.** Not every engine mirrors a field's
  selection into the document selection — Chrome does, Firefox and Safari do not, per the split
  `v-select-text` documents — so without this the feature would copy an input in one engine and
  nothing in the others. Measured here in Chrome and in jsdom, which behaves like the latter.
  `type="password"` is never read.
- **Not a copy:** dragging out a selection *inside* a copyable host does not copy it. Chrome does
  not fire `click` for a press-drag-release that made a selection, so highlighting inside
  `<blockquote v-copy.selection>` stays a highlight until you click it.
- **Known limit:** tabbing out of a field discards its selection — no engine keeps it as the
  document's current one — so Shift+Arrow in an `<input>` → Tab → Enter copies nothing. Press the
  trigger with the pointer, or select in a `contenteditable`, where the selection survives Tab.
- New exported types: `SelectionConfig`, `SelectionWithin`. New config key `selection`, new
  modifier `.selection`, which replaces the source outright — including the "not here yet" meaning
  of a nullish `source`.

Verified in a real browser, not only in jsdom: eleven checks in the playground's interaction suite
drag a real selection with `Input.dispatchMouseEvent`, press a real trigger and read the **real**
clipboard back over a primed sentinel. Removing the capture turns six of them red; removing the
empty-refusal turns the clipboard-wipe into an observed fact, on the real clipboard.

### Changed — `CopyVia` gained `'none'`

**This widens a union you may be reading.** An exhaustive `switch (result.via)` over the two old
members now fails to compile (`TS2366` / no-fallthrough), which is the intended signal — it is why
this waited for a minor instead of riding along in 1.1.1.

The four paths that write nothing reported `via: 'exec-command'`, a filler that happened to
type-check: a refusal (`'empty'` / `'pending'`), a disabled binding, the SSR branch, and
`ctrl.copy()` with no bound element. Anything counting legacy-fallback copies — the exact signal
someone would use to decide whether the `execCommand` path can be dropped — was reading a wave of
refusals as `execCommand` copies on modern browsers. All four now report `'none'`; a copy that
really ran still reports `'clipboard-api'` or `'exec-command'`, including an `execCommand` that
ran and failed.

### Internals

- New module `src/selection.ts` — reading the user's selection, the scope resolution, and the
  press-time snapshot. It is the only place `getSelection()` is touched.
- `events.ts` attaches the capture-phase press listener (`pointerdown`, or `mousedown` where
  `PointerEvent` does not exist — one or the other, never both: a touch's compatibility `mousedown`
  arrives after the selection is already gone and would overwrite a good snapshot with an empty one).
- 126 tests, up from 98. Every new behaviour was mutation-tested: twelve deliberate breaks, each
  caught by the test that names it.

## 1.1.1

### Fixed — a crash at mount

**`v-copy` bound to a frozen or `readonly()` config object threw out of `mounted` and took the
component down with it.**

```
TypeError: Cannot add property history, object is not extensible      // Object.freeze(config)
TypeError: Cannot read properties of undefined (reading '0')          // readonly(reactive(config))
```

If your app died at mount with either of those, on a component whose only copy binding was
`v-copy="SOME_CONFIG"`, this is the bug. Nothing in the message named the directive, and neither
binding is exotic: freezing a module-level config object is ordinary defensive practice, and passing
a `readonly()` prop or injected value is idiomatic Vue.

**Cause.** Every plain object binding was adopted as a mutable controller, so the directive wrote
`history`, `copied`, `last`, `copy` and `clear` into whatever object you passed. On a frozen object
the first write was refused; on a `readonly()` one it was refused and warned; either way the next
line dereferenced the result.

**Fix — the two roles are now distinct, and the distinction is asked of the object, not guessed
from its keys.**

- A **config** object belongs to you. The directive reads it and writes nothing into it — ever. A
  frozen config, a `readonly()` view, a shared module constant and an inline `{ ... }` literal are
  all ordinary bindings now.
- A **controller** is a *mutable reactive* object — `isReactive(v) && !isReadonly(v)`. That is the
  documented form (`reactive<CopyController>({})`), it is the only form on which the exposed state
  could ever be observed, and it is now the opt-in rather than a recommendation.

### Changed — behaviour

- **A plain (non-reactive) object binding is no longer enriched.** If you bound a plain object and
  called `ctrl.copy()` from script, wrap it in `reactive()`. A plain literal in a template was never
  usable as a controller — it is re-created every render, so nothing could observe a write into it —
  but it *was* being written to, which is what this release stops.
- **A config binding no longer invents a history.** Previously every object binding silently became
  a history sink, which also fired `` `key`/argument is ignored for string history `` at bindings
  that had no history — spending the one-shot warning so a real mistake later printed nothing.
- **A controller's config half is live.** `ctrl.disabled = true`, `ctrl.trigger = 'dblclick'`,
  `ctrl.max = 3` and `ctrl.sink = otherArray` take effect immediately. Until now the options were a
  render snapshot: `ctrl.disabled = true` kept copying until something unrelated re-rendered the
  host, which made it look intermittent.
- **`ctrl.sink` is re-read.** Swapping it re-points the history instead of being ignored after the
  first render.
- **`ctrl.last` mirrors the head of the history**, whichever binding wrote it, instead of only
  tracking copies made through that same object. In the README's own picker pattern — rows bound as
  `{ source: entry, sink: clipboard.history }` — `clipboard.last` froze at the first value while the
  list above it updated correctly.
- **A controller bound while `disabled` still receives `copy()` / `clear()` / `history`**, and
  `ctrl.copy()` now returns the documented `error: 'disabled'` instead of being `undefined`.
- **`.once` stays detached.** The latch detached the listeners and then the next re-render put them
  back, along with `tabindex="0"` and `role="button"` — leaving an element announced as a button,
  focusable and wired, that copied nothing.
- **A key-shaped `trigger` copies once per press.** `trigger: 'keydown'` attached the built-in
  Enter/Space handler on top of the trigger listener, so one Enter produced two clipboard writes,
  two `copy-result` events and two callback runs.
- **`max` and `feedback.duration` survive an emptied number input.** `v-model.number` writes `''`
  when the field is cleared: `max` collapsed a six-entry history to one row, and a cleared duration
  turned the copied state off for good. A non-numeric value now means "not set" and the default
  applies. `max: 'lots'` no longer removes the cap entirely (it became `NaN`, and `length > NaN` is
  false).
- **The `aria-live` region is re-created if something detaches it.** It was cached by reference for
  the life of the page, so a root re-mount or a DOM cleanup pass silently ended announcements for
  the rest of the session.

### Changed — internals

- `execute.ts` refuses a pending binding **before** resolving text, retiring an unreachable ternary
  arm whose only job was to type-check — and whose presence made the refusal order load-bearing but
  unstated.
- `vCopy.ts` re-exports `src/index.ts` with a wildcard. The duplicated export list was a way for a
  type to exist in the source and be missing from the published `.d.ts` with nothing failing.
- Added `npm run typecheck` (`tsc --noEmit`) over `src/`, the entry and the test file; the test file
  was previously outside `tsconfig.json`'s `include` and never type-checked.
- Removed the `MutableController` alias (identical to `CopyController`, and it named a mutability
  boundary the type did not express) and un-exported `clampMax` / `isBrowser`, which nothing outside
  their own modules called.
- 97 tests, up from 75.

### Known, not fixed in this release

- `CopyResult.via` reports `'exec-command'` on paths where no strategy ran (a refusal, a disabled
  binding, SSR). Honest reporting needs a new member on the `CopyVia` union, which is not a patch.
  Documented on the type in the meantime — check `success` / `error` first.

## 1.1.0

First release under the **`@ozjsey`** scope. The unscoped `v-copy` on npm is a different package
(`egoist`, 0.1.0, 2017) and was never ours; nothing was ever published under the old name, so this is
a rename rather than a migration. The directive is still `v-copy` and no snippet changes.

### Changed — behaviour

- **An empty copy is refused instead of performed.** Writing `''` does not fail, it *clears the
  user's clipboard* — and it used to do so while returning `success: true`, setting `[data-copied]`
  and announcing "Copied". Now nothing is written, no feedback state is shown, nothing is announced,
  nothing is recorded, and the attempt reports `success: false` with `error: 'empty'` through
  `copy-result` / `onCopy` / `onError`. Matches the rule `v-select-text` already ships.
- **A `null` binding means "not here yet" and is refused** with `error: 'pending'`, instead of
  falling back to the element's visible text — the trap an async-loaded token walked into. The same
  applies to the config form when `source` is present but nullish (`{ source: maybeToken }`), which
  is the form to reach for when a value may be missing.
  - `undefined` is deliberately **unchanged**: Vue compiles `v-copy` and `v-copy="someUndefined"` to
    the identical binding, so `undefined` has to keep meaning "copy my `textContent`".
- Both refusals log a one-time console warning naming what happened.

### Added

- **`dedupe`** (`boolean | DedupeConfig`, **default `true`**) — a repeat copy is *promoted* back to
  the top of the history instead of appending a second identical row. Every prior match is removed
  and a fresh entry unshifted (with a fresh `at` in `.rich` mode), which makes the option
  idempotent. De-duplication runs **before** the `max` cap, so a promotion never costs a slot:
  with `max: 5` and `[e, d, c, b, a]`, re-copying `c` gives `[c, e, d, b, a]` — `a` survives, where
  without `dedupe` it would be evicted by the duplicate.
  - `compare`: `'exact'` (default) · `'trim'` · `'loose'` · `(stored, copied) => boolean`.
    `'exact'` is the default because a history must hand back exactly what was copied.
  - Comparison never rewrites a stored entry — the newly copied text is what stays.
  - Failed copies never merge and never evict.
  - Works across a sink shared by a plain and a `.rich` binding.
  - Settable globally through the plugin (`app.use(VCopyPlugin, { dedupe: false })`); per-binding
    config still wins.
  - `scope`: `'text'` (default) · `'key'`. The comparison is over the copied **text alone**, so two
    differently-labelled bindings sharing one sink collapse to a single row and the newest label
    wins — correct for a picker, where the history is a list of clipboard payloads, but it does
    discard the older label. `scope: 'key'` requires the `key` to match too, giving one row per
    label. The default path now warns once, the first time a labelled entry is actually discarded,
    so the trade is never silent.
- **Exported types** `DedupeCompare`, `DedupeConfig` and `DedupeScope`.

## 1.0.0

First public release — a complete redesign of the directive around copying element `textContent`,
with a copy-history ref, slot-like state, and delightful defaults. Everything is delivered through the
directive; there is no composable and there are zero runtime dependencies.

### Added

- **`textContent` copy** — `v-copy` (bare) copies the element's `textContent` (read live, trimmed) on
  click, for *any* element. Built for `v-for` rows.
- **Copy history** — bind a `ref`/array (`v-copy="history"`); each copy is recorded newest-first and
  capped (default `10`, configurable via `max`). Many bindings can share one history.
- **Rich entries** — `.rich` modifier / `rich: true` records `{ text, at, ok, key }` instead of strings.
- **Multi-copy labels** — the directive argument (`v-copy:[key]`) stamps a `key` onto rich entries.
- **Source override** — `v-copy="'text'"`, a number, or `{ source }` (incl. a function) copies that
  instead of `textContent`.
- **Slot-like controller** — binding a `reactive` object enriches it in place with `copy()`, `copied`,
  `history`, `last`, and `clear()` — programmatic copy and reactive state, no composable.
- **"Copied!" feedback** — a `v-copy-copied` class and `[data-copied]` attribute toggle for `1500ms`
  (configurable / disableable via `feedback`), with rapid-recopy reset.
- **Callbacks** — `onCopy` / `onSuccess` / `onError` in the config form.
- **Keyboard support** — Enter/Space on non-interactive copyables (adds `tabindex`/`role`); native
  buttons/links are left untouched to avoid double-copying.
- **Accessibility** — an opt-out shared `aria-live` region announces "Copied" (custom via `announce`).
- **Automatic fallback** — Clipboard API → `execCommand`, now on **both** absence **and** rejection.
  `CopyResult.via` reports which path ran. SSR-guarded.
- **Modifiers** — `.once`, `.prevent`, `.stop`, `.trim`, `.rich`.
- **TypeScript** — `GlobalDirectives` augmentation types `v-copy` in templates (Vue 3.3+); full public
  type exports; plugin accepts global defaults (`{ max, feedback, announce }`).
- `"sideEffects": false` and a types-first `exports` map.

### Documented, not changed

- `.once` latches the **trigger**, not the copy: every listener (pointer *and* keyboard) detaches
  after the first fire, and `ctrl.copy()` is the deliberate way past it. The README said "copy at
  most once", which contradicted the code; the code was right and the README now matches.
- A custom `trigger` replaces the **pointer** activation only. A non-interactive host keeps
  `tabindex="0"`, `role="button"` and Enter/Space, because an action reachable only by `dblclick` or
  `contextmenu` would be unreachable from a keyboard (WCAG 2.1.1). `trigger: false` removes the
  keyboard path with everything else.

### Removed / changed

- **Removed** the reactive `condition` (false→true) auto-copy mode and the `CopyOptions.text` field —
  superseded by the `source`/`textContent` model.
- `CopyOptions` is gone; use `CopyConfig`. `CopyEventDetail` is retained as a deprecated alias of the
  new `CopyResult` (which adds `via` and `key`).
- The `copy-result` event now **bubbles**, so an ancestor can observe a whole subtree.
- A single primitive `ref`/`defineModel<string>()` is **not** a supported history target (it arrives
  unwrapped as an immutable primitive). Use a `string[]` ref or a controller instead.
