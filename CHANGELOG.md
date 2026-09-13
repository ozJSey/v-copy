# Changelog

All notable changes to **@ozjsey/v-copy** are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

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
