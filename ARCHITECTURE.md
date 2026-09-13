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
    ├── controller.ts      slot-like controller runtime: drivers, enrichment, deregistration
    ├── history.ts         sink recording (newest-first, capped, rich/plain)
    ├── resolve.ts         binding forms → one Resolved shape; TEXT_CONTENT sentinel
    ├── state.ts           per-element DirectiveState WeakMap
    ├── announce.ts        one shared aria-live region
    ├── clipboard.ts       Clipboard API + execCommand fallback
    ├── defaults.ts        plugin-level global defaults
    ├── warn.ts            one-shot console warnings
    └── types.ts           public types + GlobalDirectives augmentation
```

A second invariant, added with `dedupe` in 1.1.0: **`history.ts` is the only module that decides
what the sink contains** — de-duplication happens on write, not on read, because the bound array
belongs to the consumer (there is nowhere to hang a derived view), `max` must count what the user
sees, and a read-time filter would break the in-place-mutation guarantee. `resolve.ts` hands it a
pre-resolved predicate (`DedupePredicate | null`) so the recording path stays branch-free.

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

Copy-paste consumers: every file under `src/` plus the entry is self-contained TypeScript with no
dependencies beyond the `vue` peer — take the folder as-is.
