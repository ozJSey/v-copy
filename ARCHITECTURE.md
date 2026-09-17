# Architecture

`vCopy.ts` is the build entry; it re-exports `src/index.ts`. Each module has one purpose;
dependencies point strictly downward — no cycles (the controller's programmatic `copy()` receives
its executor by injection from the directive rather than importing `execute.ts`).

```
vCopy.ts                   entry — re-exports src/index
└── src/
    ├── index.ts           public surface: vCopy, VCopyPlugin, all public types
    ├── plugin.ts          VCopyPlugin — registration + global defaults merge
    ├── directive.ts       lifecycle wiring: resolve → controller sync → handlers
    ├── events.ts          trigger listener + keyboard a11y (tabindex/role/Enter/Space)
    ├── execute.ts         THE copy pipeline: text → refuse-or-clipboard → history → feedback → event
    ├── feedback.ts        "Copied!" class/attribute window + controller `copied` ref-count
    ├── history.ts         sink recording (newest-first, capped, rich/plain)
    ├── controller.ts      slot-like controller runtime: drivers, history ownership, `last` mirroring
    ├── resolve.ts         binding forms → one Resolved shape; TEXT_CONTENT / SELECTION sentinels
    ├── selection.ts       the USER's selection: reading it, and the press-time snapshot
    ├── state.ts           per-element DirectiveState WeakMap
    ├── announce.ts        one shared aria-live region
    ├── clipboard.ts       Clipboard API + execCommand fallback
    ├── defaults.ts        plugin-level global defaults
    ├── warn.ts            one-shot console warnings
    └── types.ts           public types + GlobalDirectives augmentation
```

The invariant added in 1.1.1, and the one the module split now exists to protect: **an object
binding has exactly one role, and `resolve.ts:isController` is the only place that decides it.**
A *config* object belongs to the consumer — `resolve.ts` reads it and no module writes to it, so a
frozen or `readonly()` config is an ordinary binding rather than a `TypeError` out of `mounted`. A
*controller* is a mutable reactive object (`isReactive(v) && !isReadonly(v)`); the library owns it,
`controller.ts` mirrors state into it, and `directive.ts` subscribes to its config half so a change
takes effect without a re-render. The role is never inferred from the object's keys: guessing from
shape is what produced the 1.1.0 crash.

State ownership follows from that. The authority for a controller is its `ControllerRuntime` — a
WeakMap entry holding the drivers, the open feedback windows and the history array. The bound object
is where that state is *mirrored* so a template can read it, which is why `last` is written from the
head of the array by `syncLast`, for every controller pointing at it, rather than by whichever
binding happened to perform the copy.

A second invariant, added with `dedupe` in 1.1.0: **`history.ts` is the only module that decides
what the sink contains** — de-duplication happens on write, not on read, because the bound array
belongs to the consumer (there is nowhere to hang a derived view), `max` must count what the user
sees, and a read-time filter would break the in-place-mutation guarantee. `controller.ts` chooses
*which array* a controller records into (re-read every resolution, so `ctrl.sink = other` re-points
it); `history.ts` decides what goes in it. `resolve.ts` hands the recorder a pre-resolved
`dedupe` predicate (`DedupePredicate | null`) so no comparison branching happens per entry.

`selection.ts` (1.2.0) owns one fact the rest of the package must not learn: **the press that
starts a copy destroys the selection it is copying.** Measured with trusted input — a `<button>`
host keeps the document selection through the click, a `<span>` (which `events.ts` makes copyable)
has it collapsed between `mousedown` and `mouseup`. So `events.ts` attaches a passive capture-phase
`pointerdown` listener that snapshots the text before the browser's default action runs, and
`takeSelectionText` prefers the live selection, falling back to that snapshot and consuming it.
The rejected alternative, `preventDefault()` on `mousedown`, also works and additionally suppresses
focus on the trigger — an a11y cost on every binding to fix a mouse-only problem.

The snapshot's lifetime is the other half of that invariant, and 1.2.1 is what happens when it is
got wrong: **the snapshot outlives the press listener, and only a teardown that ends the *binding*
may drop it.** `.once` tears its listeners down inside the click it is latching, before the copy has
read anything, so it detaches listeners without calling `forgetSelection` — otherwise the single
copy `.once` allows is the one copy that gets refused. Unmount, `disabled`, and a binding that stops
asking for a selection all still drop it, because those end the gesture rather than serve it.

The second thing the module isolates is the string: **`getSelection().toString()` is correct here,
and that is the opposite of `v-select-text`'s conclusion.** That package owns a resolved view of a
selection it made, so `toString()` would mean reporting one string and writing another. Here the
user's selection is the only view, and `toString()` is what ⌘C would have produced — engine-inserted
block separators included. The module header says so, because agreeing with the sibling package
would be the obvious "fix".

The invariant that matters: **`execute.ts` is the only place a copy happens** — click, Enter/Space,
and `ctrl.copy()` all funnel into it, so history/feedback/announce/event ordering can never diverge
between trigger paths.

The same module owns the two refusals added in 1.1.0 (empty text, and a `null`/absent source), for
the same reason: a refusal has to be unreachable from any other path, or one trigger would still be
able to clear a clipboard while reporting success. `resolve.ts` decides only *whether* the binding is
pending — a flag on `Resolved` — and `execute.ts` decides what a refusal looks like: report through
`copy-result` / `onCopy` / `onError`, write nothing, record nothing, show nothing.

`history.ts` gained a second axis with `dedupe.scope`. Labels stay out of the comparison by default
because the sink is a list of clipboard payloads, not an audit log; the module warns once when that
default actually discards a labelled entry, so the trade shows up at the moment it bites rather than
in a README paragraph nobody reaches.

`CopyVia` gained `'none'` in 1.2.0 (COPY-7): the four paths that write nothing — a refusal, a
disabled binding, the SSR branch, `ctrl.copy()` with no driver — reported `'exec-command'`, a filler
that happened to type-check and made refusals indistinguishable from legacy-fallback copies to
anything counting them.

`vCopy.ts` re-exports `src/index.ts` with a wildcard rather than re-listing the public names: the
duplicated list was a way for a type to be exported from the source and missing from the published
`.d.ts` with nothing failing. `npm run typecheck` covers `src/`, the entry and the test file.

Copy-paste consumers: every file under `src/` plus the entry is self-contained TypeScript with no
dependencies beyond the `vue` peer — take the folder as-is. Three named imports from `vue` are
runtime, not types: `isReactive` / `isReadonly` (the role decision) and `watch` (the controller
subscription); `toRaw` normalises a proxy and its target to one WeakMap key.
