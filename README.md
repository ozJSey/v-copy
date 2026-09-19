# @ozjsey/v-copy

A Vue 3 directive that copies any element — and keeps the last N copies so your users can pick one
back out.

[![npm](https://img.shields.io/npm/v/@ozjsey/v-copy.svg)](https://www.npmjs.com/package/@ozjsey/v-copy)
![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![gzipped 4.39 KiB](https://img.shields.io/badge/gzipped-4.39%20KiB-blue.svg)
![dependencies 0](https://img.shields.io/badge/dependencies-0-blue.svg)

## The problem

Making one value copyable is a handler, a `ref`, a `writeText`, a `copied` flag and a timer to clear
it — and none of that makes the `<li>` keyboard-operable or tells a screen reader anything happened.
Write it a dozen times for a table of addresses and the user still loses: they copy the next row, and
the one they actually wanted is gone. The clipboard holds one value and your UI kept no record of the
rest.

## The solution

Drop `v-copy` on a `<li>`, a `<code>`, a table cell. Click it — or Tab to it and press Enter — and its
text is on the clipboard, with a "Copied!" state and a screen-reader announcement you did not have to
write.

```vue
<li v-for="email in emails" :key="email" v-copy>{{ email }}</li>
```

Bind an array or a `reactive` object as well and every copy is recorded, newest-first, de-duplicated.
Render that history and each row copies *itself* back out — a clipboard manager, built from one
directive. VueUse's `useClipboard` writes; this one *remembers*. If one string on the clipboard is all
you need, `useClipboard` is smaller and probably already in your project.

One surprise worth having on day one: **an empty or `null` source is refused rather than written** —
writing `""` would silently clear the user's clipboard while the UI flashed "Copied!" — but
`undefined` cannot be refused, because Vue compiles `v-copy` and `v-copy="somethingUndefined"` to the
same binding, so `undefined` has to keep meaning "copy my `textContent`".

## Install

```bash
npm install @ozjsey/v-copy
```

Requires **Vue 3.0 or newer**: the directive imports `watch`, `isReactive`, `isReadonly` and `toRaw`,
all of which shipped in 3.0, and nothing newer.

```ts
import { createApp } from 'vue'
import App from './App.vue'
import { VCopyPlugin } from '@ozjsey/v-copy'

createApp(App)
  .use(VCopyPlugin /*, { max: 20, dedupe: false, announce: false } */) // optional global defaults
  .mount('#app')
```

Or locally — `import { vCopy } from '@ozjsey/v-copy'`, registered under the name `copy`. The directive is always `v-copy`, whatever the package is called.

## Usage

### Copy an element's text

```vue
<template>
  <button v-copy>Copy this label</button>
  <code v-copy>npm install @ozjsey/v-copy</code>
</template>
```

The `textContent` is read **live at copy time** and trimmed. On success the element carries a
`v-copy-copied` class and a `[data-copied]` attribute for a moment, so the confirmation is CSS rather
than a template branch:

```css
[data-copied]::after { content: ' ✓ Copied'; color: green }
```

### Keep a copy history

Bind a `ref` to an array. The directive fills it **mutating in place**, newest-first and capped, so
`history.splice(0)` clears it and the binding keeps working. A repeat copy is *promoted* back to the
top instead of filling the list with the same row.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const users = [{ id: 1, email: 'ada@lovelace.dev' }, { id: 2, email: 'grace@hopper.dev' }]
const history = ref<string[]>([])
</script>

<template>
  <li v-for="u in users" :key="u.id" v-copy="history">{{ u.email }}</li>

  <aside>Last copied: {{ history[0] }}</aside>
</template>
```

### A history the user can pick from

The reason the package exists. Nothing here is special-cased: a history row is an ordinary `v-copy`
whose source is the stored text and whose sink is the same array.

```vue
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { CopyController, CopyEntry } from '@ozjsey/v-copy'

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

## Everything else

Every option, modifier and event — `dedupe` scopes, `.rich` labels, the reactive controller, custom
triggers, `within`-scoped selection copy, `copy-result`, the `execCommand` fallback — is driven in a
real browser on the **[v-copy playground tab](https://ozjsey.github.io/npm-portfolio-playground/#v-copy)**,
one card per feature, every card editable in place:
[bare binding](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/bare) ·
[copy history](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/history) ·
[the history picker](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/history-picker) ·
[aggregated multi-select copy](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/multi-select) ·
[copy what the user selected](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/user-selection) ·
[nothing to copy](https://ozjsey.github.io/npm-portfolio-playground/#v-copy/nothing-to-copy)

[CHANGELOG.md](./CHANGELOG.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

## License

MIT
