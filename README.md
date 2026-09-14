# @ozjsey/v-copy

See in action: [npm portfolio playground](https://ozjsey.github.io/npm-portfolio-playground/#v-copy).

**Or open the card for the thing you came for** — seventeen of them, all editable in the browser:
[bare binding](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/bare) ·
[copy history](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/history) ·
[the history picker](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/history-picker) ·
[aggregated multi-select copy](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/multi-select) ·
[copy the user's selection](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/user-selection) ·
[slot-like controller](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/controller)

[![npm](https://img.shields.io/npm/v/@ozjsey/v-copy.svg)](https://www.npmjs.com/package/@ozjsey/v-copy)
![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![gzipped 4.37 KiB](https://img.shields.io/badge/gzipped-4.37%20KiB-blue.svg)
![dependencies 0](https://img.shields.io/badge/dependencies-0-blue.svg)

**A Vue 3 directive that copies any element — and keeps the last N copies so your users can pick one
back out.**

```vue
<li v-for="email in emails" :key="email" v-copy>{{ email }}</li>
```

That is the whole 90% case: drop `v-copy` on a `<li>`, a `<code>`, a table cell. Click it — or Tab to
it and press Enter — and its text is on the clipboard, with a "Copied!" state and a screen-reader
announcement you did not have to write.

## The part nothing else does: a clipboard history

> [Clipboard history picker — copy, re-open, copy again](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/history-picker) is this paragraph, running: copy a few values, open the teleported dropdown, pick one, and it goes back on the clipboard.

Bind a `reactive` object and every copy is recorded. Render the history and each row copies *itself*
back out — a clipboard manager, built from one directive.

```vue
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { CopyEntry, CopyController } from '@ozjsey/v-copy'

const values = ['ada@lovelace.dev', '9f2c1ab', 'sk-demo-4417']
const open = ref(false)

// `sink: []` so `history` is already an array on the very first render.
const clipboard = reactive<CopyController>({ sink: [], max: 8 })
const isText = (e: CopyEntry): e is string => typeof e === 'string'
const rows = computed(() => (clipboard.history ?? []).filter(isText))
</script>

<template>
  <code v-for="v in values" :key="v" v-copy="clipboard">{{ v }}</code>

  <button @click="open = !open">History ({{ rows.length }})</button>

  <ul v-if="open">
    <!-- Each row writes back into the SAME history, so picking an old value puts
         it on the clipboard and promotes it to the top. -->
    <li v-for="(entry, i) in rows" :key="i" v-copy="{ source: entry, sink: clipboard.history }">
      {{ entry }}
    </li>
  </ul>
</template>
```

The working version of this is playground card 13 (`playground/src/demos/v-copy/13-history-picker.vue`),
which positions the menu with [`v-teleport-to`](#part-of-a-set) — any popover you already use, or a
plain absolutely-positioned `<ul>`, works just as well. Nothing here needs a second package.

## Why not VueUse `useClipboard`?

Because `useClipboard` writes; this one *remembers*. Checked against `@vueuse/core` 14.4.0:

| | `useClipboard` | `@ozjsey/v-copy` |
|---|---|---|
| Shape | composable — you call `copy(text)` from a handler | directive — `v-copy` on the element |
| Where the text comes from | you pass it, or a `source` option | the element's own `textContent`, read live at copy time |
| "Copied" state | `copied` ref, `copiedDuring` | `copied` **plus** a `v-copy-copied` class and `[data-copied]` — CSS-only confirmation, no template branch |
| **History of past copies** | — | `sink`, `max`, `dedupe`, `.rich` `{ text, at, ok, key }` |
| **Re-copy an earlier value** | — | every history row is itself a `v-copy` |
| Labelling which source copied | — | the directive argument: `v-copy:email.rich` |
| Legacy fallback | `legacy: true` opt-in | automatic, on the API being **absent *and* on it rejecting** |
| Keyboard + `aria-live` | you wire it | built in for non-interactive hosts |
| Reading the clipboard | `read: true` | — (this package only writes) |

**If you only need to put one string on the clipboard, use `useClipboard`** — it is smaller, it is
probably already in your project, and it does that job well. Reach for this one when *the list of what
was copied* is part of your UI.

## Features

- 🧾 **Copy history** — bind a `ref` or a `reactive` controller and it fills with the last N copies,
  newest-first, de-duplicated: a repeat copy is *promoted* back to the top instead of filling the list
  with the same row.
- ♻️ **Re-copy** — because the history is a plain array you own, each entry can carry its own
  `v-copy`, which is all a history picker is.
- 🖱️ **Copies the user's own selection** — `v-copy.selection` puts whatever they highlighted on
  the clipboard, surviving the press that would otherwise destroy it. Scope it to a card with
  `within`. See [Copy what the user selected](#copy-what-the-user-selected).
- 📋 **Copies the `textContent` of any element** on click — not just inputs, no handler, no `ref`.
- 🎛️ **Slot-like state** — bind a `reactive` object and read `copied` / `history` / `last`, call
  `copy()` and `clear()`. No composable.
- ✅ **"Copied!" feedback** — a `v-copy-copied` class + `[data-copied]` attribute, styled in CSS.
- ♿ **Keyboard + a11y** — Enter/Space on non-interactive hosts, a shared `aria-live` announcement.
- 🛡️ **Refuses to write nothing** — an empty copy would silently clear the user's clipboard, so it is
  reported as a failure instead. See [Nothing to copy](#nothing-to-copy).
- 🔁 **Automatic fallback** — Clipboard API → `execCommand`, on both absence *and* rejection. SSR-safe.
- 🧩 **Typed** — `v-copy` autocompletes in `<template>` (Vue 3.3+); every binding form is typed.
- **Zero dependencies**, 4.37 KiB gzipped.

## Install

```bash
npm install @ozjsey/v-copy
```

> **Upgrading from 1.1.0?** If your component died at mount with
> `TypeError: Cannot add property history, object is not extensible` or
> `TypeError: Cannot read properties of undefined (reading '0')`, that was this package: every
> object binding was adopted as a mutable controller, so a frozen or `readonly()` config object was
> written to and threw. Fixed in **1.1.1** — a config object is now only ever read. See the
> [changelog](./CHANGELOG.md).

### Global registration (plugin)

```ts
import { createApp } from 'vue'
import { VCopyPlugin } from '@ozjsey/v-copy'

createApp(App)
  .use(VCopyPlugin /*, { max: 20, dedupe: false, announce: false } */) // optional global defaults
  .mount('#app')
```

### Local registration

```ts
import { vCopy } from '@ozjsey/v-copy'

export default {
  directives: { copy: vCopy }, // register under the name `copy` -> usable as v-copy
}
```

The directive is always `v-copy`, whatever the package is called.

## Usage

### Keep a copy history

Bind a `ref` to an array — the directive pushes each copy into it, newest-first, capped at 10.

```vue
<script setup lang="ts">
import { ref } from 'vue'
const history = ref<string[]>([])
</script>

<template>
  <li v-for="u in users" :key="u.id" v-copy="history">{{ u.email }}</li>

  <aside>
    Last copied: {{ history[0] }}
    <ul><li v-for="(h, i) in history" :key="i">{{ h }}</li></ul>
  </aside>
</template>
```

The `ref` is yours — forward it to a store, `provide`/`inject` it, or `defineModel<string[]>()` it.
The directive only fills it, **mutating in place**, so `history.splice(0)` clears it and the binding
keeps working. (Re-assigning `history.value = []` also works, but only because the directive re-reads
the binding on update — mutating is the cheaper habit.)

#### De-duplication (`dedupe`, on by default)

> [dedupe scope](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/dedupe-scope) — one row per payload or one row per label, side by side, with [the history picker](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/history-picker) for what promotion looks like in a real list.

A history that fills up with the same row is not a history. So a repeat copy **promotes**: every
prior entry with the same text is removed and a fresh one is unshifted to the top — with a fresh
`at` in `.rich` mode, so the list never sorts by recency while showing a stale timestamp.

De-duplication runs **before** the cap, so a promotion never costs a `max` slot:

```text
max: 5, history [e, d, c, b, a], re-copy "c"
  dedupe (default) →  [c, e, d, b, a]     "a" survives
  dedupe: false    →  [c, e, d, c, b]     "a" evicted by the duplicate
```

```vue
<li v-copy="{ sink: history, dedupe: false }">…</li>                    <!-- record every copy -->
<li v-copy="{ sink: history, dedupe: { compare: 'trim' } }">…</li>      <!-- ignore surrounding space -->
<li v-copy="{ sink: history, dedupe: { compare: 'loose' } }">…</li>     <!-- ignore space AND case -->
<li v-copy="{ sink: history, dedupe: { compare: same } }">…</li>        <!-- (stored, copied) => boolean -->
```

| `compare` | Two texts are the same when… |
|---|---|
| `'exact'` *(default)* | they are identical. A history must hand back exactly what was copied — collapsing `"foo "` into `"foo"` would make one payload unreachable. |
| `'trim'` | they match after `trim()`. |
| `'loose'` | they match after `trim()` + `toLowerCase()`. |
| `(stored, copied) => boolean` | your predicate says so. |

Comparison never rewrites a stored entry — the match is removed and the **newly copied** text is
what stays. Failed copies (recorded in `.rich` mode as `ok: false`) never merge and never evict.

#### `dedupe` compares text, not labels

**Labels do not participate in the comparison.** Two differently-labelled bindings sharing one sink
collapse to a single row, and the newest label is the one that survives:

```vue
<td v-copy:colA.rich="log">same@value.dev</td>   <!-- copied first  -->
<td v-copy:colB.rich="log">same@value.dev</td>   <!-- copied second -->
<!-- log === [{ text: 'same@value.dev', key: 'colB', … }] -->
```

That is deliberate: the history is a list of clipboard *payloads*, and two rows that put the identical
string on the clipboard are one row from the user's point of view. It is still a real trade — the
older row's label goes with it — so the directive warns once, the first time it actually discards a
labelled entry.

Two ways out, depending on what your history is for:

```vue
<td v-copy:colA.rich="{ sink: log, dedupe: { scope: 'key' } }">…</td>  <!-- one row per label -->
<td v-copy:colA.rich="{ sink: log, dedupe: false }">…</td>             <!-- verbatim log, every copy -->
```

| `scope` | An entry is replaced when… |
|---|---|
| `'text'` *(default)* | the text matches, whatever label is on it. The picker view. |
| `'key'` | the text matches **and** the `key` matches. The per-source log view. |

Under `'key'`, a plain string entry counts as having *no* label, so it never merges with a labelled one.

### Copy an element's text

```vue
<button v-copy>Copy this label</button>
<code v-copy>npm install @ozjsey/v-copy</code>
```

The element's `textContent` is read **live at copy time** and trimmed.

### Rich entries & multi-copy labels

Add `.rich` for `{ text, at, ok, key }` entries, and use the **argument** to label which source
produced each entry. Many bindings can share one history:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { RichCopyEntry } from '@ozjsey/v-copy'
const log = ref<RichCopyEntry[]>([])
</script>

<template>
  <tr v-for="row in rows" :key="row.id">
    <td v-copy:[row.id].rich="log">{{ row.email }}</td>
    <td v-copy:[`${row.id}:phone`].rich="log">{{ row.phone }}</td>
  </tr>

  <ul>
    <li v-for="(e, i) in log" :key="i">
      [{{ e.key }}] {{ e.text }} — {{ new Date(e.at).toLocaleTimeString() }}
    </li>
  </ul>
</template>
```

Labels only survive in `.rich` mode — a plain string history has nowhere to put them, and the
directive warns once if you pass an argument without `.rich`. And see
[`dedupe` compares text, not labels](#dedupe-compares-text-not-labels) for what happens when two
labelled sources copy the same string.

### Override the source

Pass a string/number to copy something other than the visible text:

```vue
<button v-copy="user.rawToken">Copy token</button>      <!-- copies the token -->
<button v-copy="{ source: () => Date.now() }">Copy time</button>
```

### Copy what the user selected

> [Copy what the USER selected](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/user-selection) — highlight across elements and press the button; the selection survives the press.

`v-copy.selection` copies whatever the **user** highlighted — with the mouse, or with Shift+Arrow —
instead of the element's own text.

```vue
<p>Ada Lovelace wrote the first algorithm intended for a machine, in 1843.</p>
<button v-copy.selection>Copy selection</button>
```

Everything else keeps working: the selection is just another source, so it feeds the history, the
`dedupe` promotion, `.rich` entries, the `[data-copied]` window, the `aria-live` announcement and
`copy-result` exactly like a string binding does.

```vue
<button v-copy.selection="clips">Copy selection</button>   <!-- clips: ref<string[]>([]) -->
```

**What gets copied is `getSelection().toString()`** — precisely what ⌘C would have produced. That
includes the separators an engine inserts at block and table-cell boundaries: a selection spanning
two paragraphs arrives with a line break between them, and exactly how much whitespace is the
engine's call. It is not normalised — normalising would hand back a string the user did not
highlight.

> This is deliberately the **opposite** of the call `v-select-text` makes. There the directive
> *makes* the selection, so it holds a resolved view of it, and copying `toString()` would mean
> reporting one string and writing another. Here the user's own selection is the only view there is.

#### The press destroys the selection — and that is handled

Pressing a trigger collapses the document selection *before* your click handler runs, so reading
`getSelection()` in the handler finds nothing. Measured in Chrome 153 with real (trusted) input, dragging
a real selection and clicking a real trigger:

| Trigger host | Selection at `click` time |
|---|---|
| `<button>` | intact |
| `<span>`, `<div>`, … (what `v-copy` makes copyable) | **gone** — collapsed between `mousedown` and `mouseup` |

So the directive **captures the selection on `pointerdown`**, before the browser's default action
collapses it, and uses the capture only when the live selection has gone empty by copy time. The
capture is consumed once per press: it rescues *this* gesture, never a stale one.

The alternative — `preventDefault()` on `mousedown` — also preserves the selection, and is rejected
on purpose: its other effect is that **focus never moves to the trigger** (measured: `activeElement`
stays on `<body>` after the click). A control the user just activated that does not take focus breaks
`:focus-visible`, breaks a screen reader's idea of where the user is, and breaks `focus`/`blur`
handlers — an accessibility cost on every binding, to fix a mouse-only problem. It is also not the
directive's call to make on your behalf. If you want it, it is one line in your own handler.

**Selecting inside a copyable host is not a copy.** Chrome does not fire `click` for a
press-drag-release that made a selection, so dragging out a highlight inside
`<blockquote v-copy.selection>` leaves it highlighted; the click after it is what copies.

**The keyboard path needs none of this.** Moving focus with Tab leaves the document selection in
place, so Shift+Arrow → Tab → Enter reads it live. Non-interactive hosts already get
`tabindex="0"` + `role="button"` + Enter/Space from the directive.

#### An empty selection is refused

Nothing selected, a collapsed caret, or a `user-select: none` region — which stringifies to `""` —
is **refused**, not written: writing `""` would clear the user's clipboard while the UI flashed
"Copied!". Same rule, same reporting and same `error: 'empty'` as everywhere else in this package
(see [Nothing to copy](#nothing-to-copy)); a one-time console warning names the selection case.

#### Whose selection? `within`

> [Whose selection is it — scoping with `within`](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/selection-scope).

The default is **the whole document**, because that is what ⌘C does — a page has one selection, and
the platform never asks which card you meant. A page-level "copy what I selected" button therefore
needs no configuration at all.

`within` narrows it, and a copy button living inside a card is the reason it exists:

```vue
<article class="card">
  <p>Ada Lovelace · ada@lovelace.dev</p>
  <button v-copy="{ selection: { within: '.card' } }">Copy this card's selection</button>
</article>

<blockquote v-copy="{ selection: { within: true } }">…</blockquote>
```

| `within` | Container |
|---|---|
| *(omitted)* | Anywhere in the document — ⌘C parity. |
| `true` | The bound element itself. |
| `'.card'` | The nearest matching **ancestor** (`el.closest`), else the first match in the document — so a toolbar button outside the panel it acts on still works. |
| an `Element` | That container. |

The whole selection has to be inside: one that *spans* the container is out of scope rather than
clipped, because a clipped string is not what the user highlighted. A selector matching **nothing**
refuses the copy rather than falling back to the whole document — a scope that silently widens would
copy text the binding explicitly said it did not want.

#### Text fields, and what it cannot do

A focused `<input>` / `<textarea>` keeps its selection in its own value, and **not every engine
mirrors that into the document selection** — Chrome does, Firefox and Safari do not (the split
`v-select-text` documents; measured here only in Chrome and jsdom, which behaves like the latter).
So `v-copy` reads the focused field directly, and copying what you selected in an input behaves the
same either way. `type="password"` is deliberately never read: whatever the browser does with ⌘C
there, a copy directive should not be the most permissive route on the page to a password field's
contents.

Two honest limits:

- **Tabbing out of a field discards its selection.** Once focus has left, the field's selection is
  no longer the document's current one in any engine, so Shift+Arrow in an `<input>` → Tab → Enter
  copies nothing. Press the trigger with the pointer, or select in a `contenteditable` region, where
  the selection *is* the document selection and survives Tab.
- **A second press copies nothing.** On the hosts that collapse the selection, the first copy leaves
  nothing selected, so pressing again is correctly refused — while on a `<button>`, where the
  selection survives, it copies again. That difference is the browser's, not the directive's.

`selection` replaces the source outright, including the "not here yet" meaning of a nullish
`source` — that describes a value this binding has stopped copying. `v-copy.selection.trim` still
trims, because trimming what someone highlighted has to stay something you ask for.

### Nothing to copy

> [Nothing to copy](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/nothing-to-copy) — an empty binding and a not-yet-loaded one, both refused rather than flashing "Copied!".

A copy directive that writes an empty string does not fail — it **clears the user's clipboard**, and
by default it would do so while flashing "Copied!". So it does not do that:

- **An empty resolution is refused.** Nothing is written, no `[data-copied]`, no announcement, no
  history entry. `copy-result` still fires and `onError` still runs, with `error: 'empty'`.
- **A `null` binding means "not here yet".** `v-copy="token"` with `token === null` is refused with
  `error: 'pending'` rather than falling back to the element's visible label — which is the trap an
  async-loaded token would otherwise walk into.

```vue
<button v-copy="token">Copy token</button>   <!-- token: ref<string | null>(null) — refused until it lands -->
```

**`undefined` is the one case the directive cannot see.** Vue compiles `v-copy` and
`v-copy="someUndefinedValue"` to *the same binding*, so `undefined` has to keep meaning "copy my
`textContent`" — otherwise the bare form above would stop working. For a value that may be missing,
either use `null` as the placeholder, or use the config form, where an absent `source` **is**
distinguishable:

```vue
<button v-copy="{ source: maybeToken }">Copy token</button>   <!-- refused while maybeToken is undefined -->
```

Both refusals log a one-time console warning naming what happened.

### Slot-like state (programmatic copy, `copied`, `history`)

Bind a **`reactive` object** and the directive enriches it in place with `copy()`, `copied`,
`history`, `last`, and `clear()` — like a scoped slot, but from a directive. No factory, no composable:

```vue
<script setup lang="ts">
import { reactive } from 'vue'
import type { CopyController } from '@ozjsey/v-copy'
const ctrl = reactive<CopyController>({})
</script>

<template>
  <code v-copy="ctrl">{{ snippet }}</code>

  <button @click="ctrl.copy?.()">Copy programmatically</button>
  <span v-if="ctrl.copied">Copied!</span>
  <small>{{ ctrl.history?.length ?? 0 }} copies</small>
</template>
```

`ctrl.copy()` runs against the **most recently mounted** element bound to that controller, so when
several elements share one controller, pass the text explicitly — `ctrl.copy(value)` — or give each
element its own binding.

> ⚠️ **`reactive()` is what makes it a controller.** It is the runtime question the directive asks
> — a mutable reactive object is a controller the library owns and writes state into; a plain
> literal, a frozen object or a `readonly()` view is config the library only reads and never
> touches. So `v-copy="{ source: x }"` stays exactly the object you wrote, and
> `v-copy="Object.freeze(CONFIG)"` is an ordinary binding. Bind `reactive({})` when you want
> `copy()` / `copied` / `history` / `last` / `clear()` back.

The config half of a controller is **live**: `ctrl.disabled = true`, `ctrl.trigger = 'dblclick'`,
`ctrl.max = 3` and `ctrl.sink = otherArray` take effect immediately, without waiting for something
else to re-render the host. A controller bound while `disabled` still gets its `copy()`, which
reports `success: false` with `error: 'disabled'`.

### "Copied!" feedback (CSS-only)

After a successful copy the element gets a `v-copy-copied` class and a `[data-copied]` attribute for
1.5s. Style either one:

```css
[data-copied]::after { content: ' ✓ Copied'; color: green }
.v-copy-copied { outline: 2px solid green }
```

Configure or disable per binding:

```vue
<button v-copy="{ source: code, feedback: { className: 'flash', duration: 2500 } }">…</button>
<button v-copy="{ source: code, feedback: false }">no visual feedback</button>
```

### Callbacks & event

Use callbacks in the config form, or listen for the bubbling `copy-result` event (the only channel for
the bare/string forms, and how a parent can collect an entire `v-for` subtree at once):

```vue
<button v-copy="{ source: code, onSuccess: r => toast(`Copied ${r.text}`), onError: r => toast(r.error) }">…</button>

<ul @copy-result="onAnyCopy">
  <li v-for="u in users" :key="u.id" v-copy>{{ u.email }}</li>
</ul>
```

```ts
function onAnyCopy(e: CustomEvent<CopyResult>) {
  // { success, text, via: 'clipboard-api' | 'exec-command' | 'none', key?, error? }
}
```

`error` is `'empty'` or `'pending'` for a refusal (see [Nothing to copy](#nothing-to-copy)),
`'disabled'` for a disabled binding, and the underlying clipboard error message otherwise.

### Triggers

`trigger` picks the DOM event that copies; `false` means programmatic-only.

```vue
<span v-copy="{ source: 'x', trigger: 'dblclick' }">double-click me</span>
<code v-copy="{ source: 'x', trigger: false }">only ctrl.copy() fires this</code>
```

A custom `trigger` replaces the **pointer** activation, not the keyboard one: a non-interactive host
keeps `tabindex="0"`, `role="button"` and Enter/Space, because an action reachable only by
`dblclick` or `contextmenu` would be unreachable from a keyboard. `trigger: false` removes the
keyboard path along with everything else.

### Modifiers

| Modifier | Effect |
|---|---|
| `.once` | The **trigger** fires at most once, then every listener detaches (pointer *and* keyboard). `ctrl.copy()` still works — it is the deliberate way past the latch. |
| `.prevent` / `.stop` | `preventDefault()` / `stopPropagation()` on the trigger event. |
| `.trim` | Trim an explicit/string source (`textContent` is always trimmed). |
| `.rich` | Record rich `{ text, at, ok, key }` history entries. |
| `.selection` | Copy the **user's** current text selection instead of the source. See [Copy what the user selected](#copy-what-the-user-selected). |

### Disable

```vue
<button v-copy="canCopy ? token : false">Copy</button>
```

## Recipes

### Aggregated copy — many selected rows, one payload

> [Multi-select rows → one copied context](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/multi-select). This is the package's wedge; it is worth watching rather than reading.

The source is a `computed`, so the binding is re-read whenever the selection changes the render.
Nothing here is special-cased in the library; it falls out of "the source can be a computed string".

> **What "at copy time" does and does not mean.** A string `source` is the value from the **last
> render** — that is all a template expression can be. It is live here because `selected` drives the
> render. If your source depends on something the render does not track (a `shallowRef`, an external
> store, a non-reactive cache), pass the getter form instead — `v-copy="{ source: () => build() }"`
> is called at the moment of the copy — or bind the element's own `textContent`, which is also read
> live.

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

const rows = [
  { id: 1, name: 'Ada Lovelace', email: 'ada@lovelace.dev', team: 'Compilers' },
  { id: 2, name: 'Grace Hopper', email: 'grace@hopper.dev', team: 'Languages' },
]
const selected = ref<number[]>([])

// A TSV block with a header row — paste it straight into a spreadsheet.
const payload = computed(() => {
  const picked = rows.filter((r) => selected.value.includes(r.id))
  return ['name\temail\tteam', ...picked.map((r) => `${r.name}\t${r.email}\t${r.team}`)].join('\n')
})
</script>

<template>
  <button v-copy="selected.length ? payload : false">
    Copy {{ selected.length }} rows
  </button>
</template>
```

`false` while nothing is selected detaches the listener entirely, so the button cannot copy a
header-only block. Playground card 12 is the full version.

## Accessibility

> [Accessibility](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/a11y) — Tab to a non-interactive host and press Enter.

- A visually-hidden, shared `aria-live="polite"` region announces **"Copied"** on success by default.
  Customize with `announce: 'Email copied'`, or turn it off with `announce: false`. A refused copy
  announces nothing.
- For non-interactive copyables (`<li>`, `<span>`, `<div>`), the directive adds `tabindex="0"` +
  `role="button"` and handles **Enter/Space**, so they're keyboard-operable out of the box. Native
  buttons/links are left untouched (they already activate on Enter/Space).
- Both attributes are only added when absent, and removed again on unmount.

## Clipboard strategy

1. `navigator.clipboard.writeText` when available.
2. Falls back to a temporary `<textarea>` + `document.execCommand('copy')` — automatically, on **both**
   the API being absent **and** it rejecting (denied permission, insecure context, no user gesture).

`CopyResult.via` tells you which path ran — or `'none'` when nothing was written at all: a refusal,
a disabled binding, SSR, or `ctrl.copy()` with no bound element. Everything is SSR-guarded.

## TypeScript

`v-copy` is type-checked in templates via Vue 3.3+ `GlobalDirectives` (works with Volar / `vue-tsc`).
All public types are exported:

```ts
import type {
  CopyBinding, CopyConfig, FeedbackConfig, CopyEntry, RichCopyEntry,
  CopyResult, CopyVia, CopyController, CopyDirective, CopyPluginOptions,
  DedupeCompare, DedupeConfig, DedupeScope, SelectionConfig, SelectionWithin,
} from '@ozjsey/v-copy'
```

## Binding forms

| `v-copy="…"` | Behavior |
|---|---|
| *(bare)* | Copy the element's `textContent`. |
| `"some string"` / `42` | Copy that value (source override). |
| `historyArray` | Copy `textContent`, record into the array (newest-first, capped). |
| `reactive({...})` | Config **and** slot-like state: `copy()` / `copied` / `history` / `last` / `clear()`, kept live. |
| `{ ...plain / frozen / readonly }` | Config only — read, never written to. |
| `{ source?, selection?, sink?, max?, dedupe?, rich?, feedback?, announce?, trigger?, disabled?, onCopy?, onSuccess?, onError?, key? }` | Full config. |
| `null` | Nothing to copy **yet** — the copy is refused rather than falling back to `textContent`. |
| `false` | Disabled. |

> **Note:** a single primitive `ref` (e.g. `ref('')`) or `defineModel<string>()` **cannot** be a
> history target — in templates it arrives unwrapped as an immutable primitive, so there's nothing to
> write back through, and the directive treats it as a *source override* instead. Use a
> `ref<string[]>([])` (read `history[0]`) or a controller's `last` — which mirrors the head of the
> history, whichever binding wrote it, so a value picked out of a shared history updates it too.

## Part of a set

Small, single-purpose Vue 3 directives that share these conventions — one concern each, typed, no
composable, `src/` split into readable modules because most people copy the source rather than install
it.

| Package | On npm | What it does |
|---|---|---|
| [`@ozjsey/v-fit-children`](https://www.npmjs.com/package/@ozjsey/v-fit-children) | ✅ | Hides the children that do not fit a container's width. |
| `@ozjsey/v-copy` | *this one* | Copy any element, with history. |
| `v-teleport-to` | not yet | Anchors a host to a reference element — the dropdown in the picker recipe. |
| `v-dropzone` | not yet | Drag-drop / paste / click-to-pick / upload in one binding. |
| `v-scroll-into-view` | not yet | Declarative, conditional `scrollIntoView`. |
| `v-select-text` | not yet | Selects a host's text, optionally copying the selection. |
| `v-observe` | not yet | `IntersectionObserver` / `ResizeObserver` as a binding. |

## License

MIT
