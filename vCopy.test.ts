import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, ref, reactive, nextTick } from 'vue'
import { vCopy, VCopyPlugin, type CopyResult, type CopyController, type RichCopyEntry } from './vCopy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mount an app with the directive registered, returning DOM helpers. */
function mount(template: string, state: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ setup: () => state, template })
  app.directive('copy', vCopy)
  app.mount(host)
  return {
    host,
    app,
    find: (sel: string) => host.querySelector(sel) as HTMLElement,
    el: host.firstElementChild as HTMLElement,
    unmount() { app.unmount(); host.remove() },
  }
}

/** Drain the microtask queue so a fire-and-forget copy settles. */
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

/** Listen once for the bubbling copy-result and resolve its detail. */
function onceResult(target: EventTarget): Promise<CopyResult> {
  return new Promise((resolve) => {
    target.addEventListener('copy-result', ((e: CustomEvent<CopyResult>) => resolve(e.detail)) as EventListener, { once: true })
  })
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true })
  if (typeof document.execCommand !== 'function') {
    Object.defineProperty(document, 'execCommand', { value: () => false, writable: true, configurable: true })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ===========================================================================
describe('dispatch & source', () => {
  it('bare v-copy copies the element textContent on click', async () => {
    const { el, unmount } = mount('<button v-copy>copy me</button>')
    el.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('copy me')
    unmount()
  })

  it('reads textContent live and trims it', async () => {
    const txt = ref('  hello  ')
    const { el, unmount } = mount('<button v-copy>{{ txt }}</button>', { txt })
    el.click()
    await flush()
    expect(writeText).toHaveBeenLastCalledWith('hello')

    txt.value = 'world'
    await nextTick()
    el.click()
    await flush()
    expect(writeText).toHaveBeenLastCalledWith('world')
    unmount()
  })

  it('a string binding is a source override', async () => {
    const { el, unmount } = mount('<button v-copy="val">label</button>', { val: 'hello world' })
    el.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('hello world')
    unmount()
  })

  it('a number binding copies String(n)', async () => {
    const { el, unmount } = mount('<button v-copy="42">label</button>')
    el.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('42')
    unmount()
  })

  it('an array binding copies textContent (not the array) and records', async () => {
    const hist = ref<string[]>([])
    const { el, unmount } = mount('<button v-copy="hist">row text</button>', { hist })
    el.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('row text')
    expect(hist.value).toEqual(['row text'])
    unmount()
  })

  it('config.source overrides textContent', async () => {
    const { el, unmount } = mount('<button v-copy="{ source: \'X\' }">label</button>')
    el.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('X')
    unmount()
  })

  it('config without source falls back to textContent', async () => {
    const { el, unmount } = mount('<button v-copy="{ feedback: false }">label</button>')
    el.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('label')
    unmount()
  })

  it('false disables the directive', async () => {
    const { el, unmount } = mount('<button v-copy="false">x</button>')
    el.click()
    await flush()
    expect(writeText).not.toHaveBeenCalled()
    unmount()
  })

  it('refuses an empty binding instead of wiping the clipboard', async () => {
    const { el, unmount } = mount('<button v-copy="val">label</button>', { val: '' })
    const result = onceResult(el)
    el.click()
    const r = await result
    expect(r.success).toBe(false)
    expect(r.error).toBe('empty')
    expect(r.text).toBe('')
    expect(writeText).not.toHaveBeenCalled()
    unmount()
  })

  it('a refusal shows no copied state and announces nothing', async () => {
    // Sentinel the shared region first, so "did not announce" is provable.
    const warm = mount('<button v-copy="\'x\'">c</button>')
    warm.el.click()
    await vi.waitFor(() => {
      expect(document.body.querySelector('[aria-live="polite"]')?.textContent).toBe('Copied')
    })
    warm.unmount()
    const region = document.body.querySelector('[aria-live="polite"]') as HTMLElement
    region.textContent = 'SENTINEL'

    const { el, unmount } = mount('<button v-copy="val">label</button>', { val: '' })
    el.click(); await flush()
    await new Promise((r) => setTimeout(r, 20))
    expect(el.hasAttribute('data-copied')).toBe(false)
    expect(el.classList.contains('v-copy-copied')).toBe(false)
    expect(region.textContent).toBe('SENTINEL')
    unmount()
  })

  it('refuses a bare binding on an element with no text', async () => {
    const { el, unmount } = mount('<button v-copy>   </button>')
    const result = onceResult(el)
    el.click()
    expect((await result).error).toBe('empty')
    expect(writeText).not.toHaveBeenCalled()
    unmount()
  })

  it('calls onCopy and onError — never onSuccess — on a refusal', async () => {
    const onCopy = vi.fn(); const onSuccess = vi.fn(); const onError = vi.fn()
    const { el, unmount } = mount(
      '<button v-copy="{ source: \'\', onCopy, onSuccess, onError }">label</button>',
      { onCopy, onSuccess, onError },
    )
    el.click(); await flush()
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError.mock.calls[0][0]).toMatchObject({ success: false, error: 'empty' })
    unmount()
  })

  it('a null binding is "not yet", not "copy the visible label"', async () => {
    const token = ref<string | null>(null)
    const { el, unmount } = mount('<button v-copy="token">Copy token</button>', { token })
    const result = onceResult(el)
    el.click()
    const r = await result
    expect(r.success).toBe(false)
    expect(r.error).toBe('pending')
    expect(writeText).not.toHaveBeenCalled()

    // …and it starts working the moment the value lands.
    token.value = 'sk-live-1'
    await nextTick()
    el.click(); await flush()
    expect(writeText).toHaveBeenCalledWith('sk-live-1')
    unmount()
  })

  it('the config form refuses an explicitly absent source', async () => {
    const token = ref<string | undefined>(undefined)
    const { el, unmount } = mount('<button v-copy="{ source: token }">Copy token</button>', { token })
    const result = onceResult(el)
    el.click()
    expect((await result).error).toBe('pending')
    expect(writeText).not.toHaveBeenCalled()
    unmount()
  })

  it('an undefined binding is indistinguishable from bare, so it still copies textContent', async () => {
    // Pinned deliberately: Vue normalises `v-copy` and `v-copy="undefinedValue"`
    // to the same binding object, so this cannot be detected. The config form is
    // the documented escape hatch, and the test above proves it works.
    const token = ref<string | undefined>(undefined)
    const { el, unmount } = mount('<button v-copy="token">visible label</button>', { token })
    el.click(); await flush()
    expect(writeText).toHaveBeenCalledWith('visible label')
    unmount()
  })

  it('a refused copy is recorded in neither plain nor rich history', async () => {
    const plain = ref<string[]>([])
    const rich = ref<RichCopyEntry[]>([])
    const a = mount('<button v-copy="{ source: \'\', sink: plain }">x</button>', { plain })
    a.el.click(); await flush()
    expect(plain.value).toEqual([])
    a.unmount()

    const b = mount('<button v-copy.rich="{ source: \'\', sink: rich }">x</button>', { rich })
    b.el.click(); await flush()
    expect(rich.value).toEqual([])
    b.unmount()
  })
})

// ===========================================================================
describe('history', () => {
  it('records newest-first', async () => {
    const hist = ref<string[]>([])
    const src = ref('a')
    const { el, unmount } = mount('<button v-copy="hist">{{ src }}</button>', { hist, src })
    el.click(); await flush()
    src.value = 'b'; await nextTick()
    el.click(); await flush()
    expect(hist.value).toEqual(['b', 'a'])
    unmount()
  })

  it('caps at the default of 10, newest-first', async () => {
    const hist = ref<string[]>([])
    const src = ref('item1')
    const { el, unmount } = mount('<button v-copy="hist">{{ src }}</button>', { hist, src })
    for (let i = 1; i <= 12; i++) {
      src.value = `item${i}`; await nextTick()
      el.click(); await flush()
    }
    expect(hist.value).toHaveLength(10)
    expect(hist.value[0]).toBe('item12')
    expect(hist.value[9]).toBe('item3')
    unmount()
  })

  it('honors a custom max', async () => {
    const hist = ref<string[]>([])
    const src = ref('1')
    const { el, unmount } = mount('<button v-copy="{ sink: hist, max: 2 }">{{ src }}</button>', { hist, src })
    for (const v of ['1', '2', '3']) { src.value = v; await nextTick(); el.click(); await flush() }
    expect(hist.value).toEqual(['3', '2'])
    unmount()
  })

  it('max:1 is a latest-only bucket', async () => {
    const hist = ref<string[]>([])
    const src = ref('first')
    const { el, unmount } = mount('<button v-copy="{ sink: hist, max: 1 }">{{ src }}</button>', { hist, src })
    el.click(); await flush()
    src.value = 'second'; await nextTick()
    el.click(); await flush()
    expect(hist.value).toEqual(['second'])
    unmount()
  })

  it('records rich entries with the .rich modifier and the argument key', async () => {
    const hist = ref<RichCopyEntry[]>([])
    const { el, unmount } = mount('<button v-copy:email.rich="hist">a@b.com</button>', { hist })
    el.click(); await flush()
    expect(hist.value).toHaveLength(1)
    const [entry] = hist.value
    expect(entry.text).toBe('a@b.com')
    expect(entry.ok).toBe(true)
    expect(entry.key).toBe('email')
    expect(typeof entry.at).toBe('number')
    unmount()
  })

  it('rich mode records failures (ok:false); plain mode does not', async () => {
    writeText.mockRejectedValue(new Error('blocked'))
    vi.spyOn(document, 'execCommand').mockReturnValue(false)

    const rich = ref<RichCopyEntry[]>([])
    const plain = ref<string[]>([])
    const { el: r, unmount: u1 } = mount('<button v-copy:k.rich="rich">x</button>', { rich })
    const { el: p, unmount: u2 } = mount('<button v-copy="plain">y</button>', { plain })
    r.click(); await flush()
    p.click(); await flush()
    expect(rich.value).toEqual([{ text: 'x', at: expect.any(Number), ok: false, key: 'k' }])
    expect(plain.value).toEqual([])
    u1(); u2()
  })

  it('shares one sink across bindings, interleaved in copy order', async () => {
    const hist = ref<string[]>([])
    const { find, unmount } = mount(
      '<div><button class="a" v-copy="hist">A</button><button class="b" v-copy="hist">B</button></div>',
      { hist },
    )
    find('.a').click(); await flush()
    find('.b').click(); await flush()
    expect(hist.value).toEqual(['B', 'A'])
    unmount()
  })

  it('mutates the bound array in place (stable identity)', async () => {
    const hist = ref<string[]>([])
    const original = hist.value
    const { el, unmount } = mount('<button v-copy="hist">x</button>', { hist })
    el.click(); await flush()
    expect(hist.value).toBe(original)
    expect(hist.value).toHaveLength(1)
    unmount()
  })
})

// ===========================================================================
describe('dedupe', () => {
  it('is on by default — a repeat copy promotes instead of appending', async () => {
    const hist = ref<string[]>([])
    const src = ref('a')
    const { el, unmount } = mount('<button v-copy="hist">{{ src }}</button>', { hist, src })
    el.click(); await flush()
    src.value = 'b'; await nextTick()
    el.click(); await flush()
    src.value = 'a'; await nextTick()
    el.click(); await flush()
    expect(hist.value).toEqual(['a', 'b'])
    unmount()
  })

  it('promotes from the middle and never costs a max slot', async () => {
    const hist = ref<string[]>(['e', 'd', 'c', 'b', 'a'])
    const { el, unmount } = mount(
      '<button v-copy="{ sink: hist, max: 5 }">c</button>',
      { hist },
    )
    el.click(); await flush()
    expect(hist.value).toEqual(['c', 'e', 'd', 'b', 'a'])
    unmount()
  })

  it('dedupe:false keeps the duplicate and lets the cap evict the oldest', async () => {
    const hist = ref<string[]>(['e', 'd', 'c', 'b', 'a'])
    const { el, unmount } = mount(
      '<button v-copy="{ sink: hist, max: 5, dedupe: false }">c</button>',
      { hist },
    )
    el.click(); await flush()
    expect(hist.value).toEqual(['c', 'e', 'd', 'c', 'b'])
    unmount()
  })

  it('removes EVERY prior match, so one copy collapses a duplicated sink', async () => {
    const hist = ref<string[]>(['x', 'y', 'x', 'x'])
    const { el, unmount } = mount('<button v-copy="hist">x</button>', { hist })
    el.click(); await flush()
    expect(hist.value).toEqual(['x', 'y'])
    // Idempotent: copying again changes nothing.
    el.click(); await flush()
    expect(hist.value).toEqual(['x', 'y'])
    unmount()
  })

  it('rich mode promotes with a FRESH timestamp, not the stale one', async () => {
    const hist = ref<RichCopyEntry[]>([])
    const { el, unmount } = mount('<button v-copy:k.rich="hist">x</button>', { hist })
    el.click(); await flush()
    const first = hist.value[0].at
    vi.spyOn(Date, 'now').mockReturnValue(first + 5000)
    el.click(); await flush()
    expect(hist.value).toHaveLength(1)
    expect(hist.value[0].at).toBe(first + 5000)
    expect(hist.value[0].key).toBe('k')
    unmount()
  })

  it('a failed copy neither merges nor evicts', async () => {
    const hist = ref<RichCopyEntry[]>([])
    const { el, unmount } = mount('<button v-copy.rich="hist">x</button>', { hist })
    el.click(); await flush()

    writeText.mockRejectedValue(new Error('blocked'))
    vi.spyOn(document, 'execCommand').mockReturnValue(false)
    el.click(); await flush()

    expect(hist.value.map((e) => e.ok)).toEqual([false, true])
    unmount()
  })

  it('a later success absorbs an earlier failed entry with the same text', async () => {
    writeText.mockRejectedValue(new Error('blocked'))
    const execCommand = vi.spyOn(document, 'execCommand').mockReturnValue(false)
    const hist = ref<RichCopyEntry[]>([])
    const { el, unmount } = mount('<button v-copy.rich="hist">x</button>', { hist })
    el.click(); await flush()
    expect(hist.value).toHaveLength(1)

    writeText.mockResolvedValue(undefined)
    execCommand.mockReturnValue(true)
    el.click(); await flush()
    expect(hist.value).toHaveLength(1)
    expect(hist.value[0].ok).toBe(true)
    unmount()
  })

  it("compare 'exact' (the default) keeps 'foo ' and 'foo' apart", async () => {
    const hist = ref<string[]>([])
    const src = ref('foo ')
    const { el, unmount } = mount(
      '<button v-copy="{ sink: hist, source: src }">x</button>',
      { hist, src },
    )
    el.click(); await flush()
    src.value = 'foo'; await nextTick()
    el.click(); await flush()
    expect(hist.value).toEqual(['foo', 'foo '])
    unmount()
  })

  it("compare 'trim' merges them, and the newly copied text is what is stored", async () => {
    const hist = ref<string[]>([])
    const src = ref('foo ')
    const { el, unmount } = mount(
      '<button v-copy="{ sink: hist, source: src, dedupe: { compare: \'trim\' } }">x</button>',
      { hist, src },
    )
    el.click(); await flush()
    src.value = 'foo'; await nextTick()
    el.click(); await flush()
    expect(hist.value).toEqual(['foo'])
    unmount()
  })

  it("compare 'loose' merges case and whitespace variants", async () => {
    const hist = ref<string[]>([])
    const src = ref('Foo ')
    const { el, unmount } = mount(
      '<button v-copy="{ sink: hist, source: src, dedupe: { compare: \'loose\' } }">x</button>',
      { hist, src },
    )
    el.click(); await flush()
    src.value = 'foo'; await nextTick()
    el.click(); await flush()
    expect(hist.value).toEqual(['foo'])
    unmount()
  })

  it('accepts a compare function', async () => {
    const hist = ref<string[]>([])
    const src = ref('ticket-1')
    // Same ticket, different suffix — the consumer decides what "same" means.
    const sameTicket = (a: string, b: string) => a.split('-')[0] === b.split('-')[0]
    const { el, unmount } = mount(
      '<button v-copy="{ sink: hist, source: src, dedupe: { compare: sameTicket } }">x</button>',
      { hist, src, sameTicket },
    )
    el.click(); await flush()
    src.value = 'ticket-2'; await nextTick()
    el.click(); await flush()
    expect(hist.value).toEqual(['ticket-2'])
    unmount()
  })

  it('matches across a mixed sink shared by a plain and a rich binding', async () => {
    const hist = ref<(string | RichCopyEntry)[]>([])
    const { find, unmount } = mount(
      '<div><button class="a" v-copy="hist">shared</button><button class="b" v-copy.rich="hist">shared</button></div>',
      { hist },
    )
    find('.a').click(); await flush()
    expect(hist.value).toEqual(['shared'])
    find('.b').click(); await flush()
    expect(hist.value).toHaveLength(1)
    expect(hist.value[0]).toMatchObject({ text: 'shared', ok: true })
    unmount()
  })

  it('keeps the controller last pointing at the promoted entry', async () => {
    const ctrl = reactive<CopyController>({ max: 3 })
    const { unmount } = mount('<code v-copy="ctrl">snippet</code>', { ctrl })
    await ctrl.copy!('one')
    await ctrl.copy!('two')
    await ctrl.copy!('one')
    expect(ctrl.history).toEqual(['one', 'two'])
    expect(ctrl.last).toBe('one')
    unmount()
  })

  it('compares TEXT only: a differently-labelled repeat replaces the row and the newest label wins', async () => {
    // `warnOnce` latches per module, not per test — this is the only place the
    // label-dropped path runs, so the spy is guaranteed to see the first firing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = ref<RichCopyEntry[]>([])
    const { find, unmount } = mount(
      '<div>' +
        '<button class="a" v-copy:colA.rich="log">same@value.dev</button>' +
        '<button class="b" v-copy:colB.rich="log">same@value.dev</button>' +
        '</div>',
      { log },
    )
    find('.a').click(); await flush()
    find('.b').click(); await flush()
    expect(log.value).toHaveLength(1)
    expect(log.value[0]).toMatchObject({ text: 'same@value.dev', key: 'colB' })
    // …and it is not silent about the label it dropped.
    expect(warn.mock.calls.flat().join(' ')).toContain("scope: 'key'")
    unmount()
  })

  it("scope: 'key' keeps one row per label", async () => {
    const log = ref<RichCopyEntry[]>([])
    const { find, unmount } = mount(
      '<div>' +
        '<button class="a" v-copy:colA="cfg">same@value.dev</button>' +
        '<button class="b" v-copy:colB="cfg">same@value.dev</button>' +
        '</div>',
      { cfg: { sink: log.value, rich: true, dedupe: { scope: 'key' } }, log },
    )
    find('.a').click(); await flush()
    find('.b').click(); await flush()
    expect(log.value.map((e) => e.key)).toEqual(['colB', 'colA'])
    unmount()
  })

  it("scope: 'key' still promotes a repeat from the SAME label", async () => {
    const log = ref<RichCopyEntry[]>([])
    const { find, unmount } = mount(
      '<div>' +
        '<button class="a" v-copy:colA="cfg">same@value.dev</button>' +
        '<button class="b" v-copy:colB="cfg">other@value.dev</button>' +
        '</div>',
      { cfg: { sink: log.value, rich: true, dedupe: { scope: 'key' } }, log },
    )
    find('.a').click(); await flush()
    find('.b').click(); await flush()
    find('.a').click(); await flush()
    expect(log.value).toHaveLength(2)
    expect(log.value.map((e) => e.key)).toEqual(['colA', 'colB'])
    unmount()
  })

  it('the plugin sets a global default that a binding still overrides', async () => {
    createApp({ render: () => null }).use(VCopyPlugin, { dedupe: false })
    try {
      const off = ref<string[]>([])
      const a = mount('<button v-copy="off">dup</button>', { off })
      a.el.click(); await flush()
      a.el.click(); await flush()
      expect(off.value).toEqual(['dup', 'dup'])
      a.unmount()

      const on = ref<string[]>([])
      const b = mount('<button v-copy="{ sink: on, dedupe: true }">dup</button>', { on })
      b.el.click(); await flush()
      b.el.click(); await flush()
      expect(on.value).toEqual(['dup'])
      b.unmount()
    } finally {
      // Global defaults are module singletons — put the shipped default back.
      createApp({ render: () => null }).use(VCopyPlugin, { dedupe: undefined })
    }
  })
})

// ===========================================================================
describe('feedback', () => {
  it('adds the class + attribute on success and removes them after the duration', async () => {
    vi.useFakeTimers()
    const { el, unmount } = mount('<button v-copy="\'x\'">c</button>')
    el.click()
    await flush()
    expect(el.classList.contains('v-copy-copied')).toBe(true)
    expect(el.hasAttribute('data-copied')).toBe(true)

    vi.advanceTimersByTime(1500)
    expect(el.classList.contains('v-copy-copied')).toBe(false)
    expect(el.hasAttribute('data-copied')).toBe(false)
    unmount()
  })

  it('restarts the window on rapid recopy', async () => {
    vi.useFakeTimers()
    const { el, unmount } = mount('<button v-copy="\'x\'">c</button>')
    el.click(); await flush()
    vi.advanceTimersByTime(1000)
    el.click(); await flush() // resets the 1500ms window
    vi.advanceTimersByTime(1000) // 2000ms since first copy, but only 1000ms since second
    expect(el.classList.contains('v-copy-copied')).toBe(true)
    vi.advanceTimersByTime(500)
    expect(el.classList.contains('v-copy-copied')).toBe(false)
    unmount()
  })

  it('feedback:false adds nothing', async () => {
    const { el, unmount } = mount('<button v-copy="{ source: \'x\', feedback: false }">c</button>')
    el.click(); await flush()
    expect(el.classList.contains('v-copy-copied')).toBe(false)
    expect(el.hasAttribute('data-copied')).toBe(false)
    unmount()
  })

  it('honors custom className / duration / attribute', async () => {
    vi.useFakeTimers()
    const { el, unmount } = mount(
      '<button v-copy="{ source: \'x\', feedback: { className: \'done\', duration: 500, attribute: \'data-ok\' } }">c</button>',
    )
    el.click(); await flush()
    expect(el.classList.contains('done')).toBe(true)
    expect(el.hasAttribute('data-ok')).toBe(true)
    vi.advanceTimersByTime(500)
    expect(el.classList.contains('done')).toBe(false)
    unmount()
  })

  it('clears a pending feedback timer on unmount without error', async () => {
    vi.useFakeTimers()
    const { el, unmount } = mount('<button v-copy="\'x\'">c</button>')
    el.click(); await flush()
    expect(el.classList.contains('v-copy-copied')).toBe(true)
    expect(() => { unmount(); vi.advanceTimersByTime(2000) }).not.toThrow()
  })
})

// ===========================================================================
describe('controller (slot-like exposure)', () => {
  it('enriches a plain reactive object with copy/copied/history/last', async () => {
    vi.useFakeTimers()
    const ctrl = reactive<CopyController>({})
    const { unmount } = mount('<code v-copy="ctrl">snippet</code>', { ctrl })

    expect(typeof ctrl.copy).toBe('function')
    expect(Array.isArray(ctrl.history)).toBe(true)
    expect(ctrl.copied).toBe(false)

    await ctrl.copy!()
    expect(writeText).toHaveBeenCalledWith('snippet')
    expect(ctrl.copied).toBe(true)
    expect(ctrl.last).toBe('snippet')
    expect(ctrl.history).toEqual(['snippet'])

    vi.advanceTimersByTime(1500)
    expect(ctrl.copied).toBe(false)
    unmount()
  })

  it('ctrl.copy(override) copies the override', async () => {
    const ctrl = reactive<CopyController>({})
    const { unmount } = mount('<code v-copy="ctrl">snippet</code>', { ctrl })
    await ctrl.copy!('OVERRIDE')
    expect(writeText).toHaveBeenCalledWith('OVERRIDE')
    unmount()
  })

  it('ctrl.clear() empties the history', async () => {
    const ctrl = reactive<CopyController>({})
    const { unmount } = mount('<code v-copy="ctrl">snippet</code>', { ctrl })
    await ctrl.copy!()
    expect(ctrl.history).toHaveLength(1)
    ctrl.clear!()
    expect(ctrl.history).toHaveLength(0)
    expect(ctrl.last).toBeUndefined()
    unmount()
  })

  it('a plain array sink gets no controller members', async () => {
    const arr = reactive<string[]>([])
    const { el, unmount } = mount('<button v-copy="arr">x</button>', { arr })
    el.click(); await flush()
    expect((arr as unknown as CopyController).copy).toBeUndefined()
    expect((arr as unknown as CopyController).copied).toBeUndefined()
    unmount()
  })

  it('detaches the driver on unmount', async () => {
    const ctrl = reactive<CopyController>({})
    const { unmount } = mount('<code v-copy="ctrl">snippet</code>', { ctrl })
    unmount()
    const result = await ctrl.copy!()
    expect(result.success).toBe(false)
    expect(result.error).toBe('no bound element')
  })
})

// ===========================================================================
describe('callbacks & events', () => {
  it('fires onCopy then onSuccess (not onError) on success', async () => {
    const onCopy = vi.fn(); const onSuccess = vi.fn(); const onError = vi.fn()
    const { el, unmount } = mount('<button v-copy="cfg">x</button>', { cfg: { source: 's', onCopy, onSuccess, onError } })
    el.click(); await flush()
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(onCopy.mock.invocationCallOrder[0]).toBeLessThan(onSuccess.mock.invocationCallOrder[0])
    unmount()
  })

  it('fires onError on failure', async () => {
    writeText.mockRejectedValue(new Error('blocked'))
    vi.spyOn(document, 'execCommand').mockReturnValue(false)
    const onError = vi.fn()
    const { el, unmount } = mount('<button v-copy="cfg">x</button>', { cfg: { source: 's', onError } })
    el.click(); await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].success).toBe(false)
    unmount()
  })

  it('swallows a throwing callback and still copies', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onCopy = vi.fn(() => { throw new Error('boom') })
    const { el, unmount } = mount('<button v-copy="cfg">x</button>', { cfg: { source: 's', onCopy } })
    expect(() => { el.click() }).not.toThrow()
    await flush()
    expect(writeText).toHaveBeenCalledWith('s')
    unmount()
  })

  it('dispatches a copy-result event with via + key', async () => {
    const { el, unmount } = mount('<button v-copy:tok="\'x\'">c</button>')
    const result = onceResult(el)
    el.click()
    const detail = await result
    expect(detail.success).toBe(true)
    expect(detail.via).toBe('clipboard-api')
    expect(detail.key).toBe('tok')
    unmount()
  })

  it('the event bubbles to an ancestor', async () => {
    const { find, host, unmount } = mount('<ul><li><button v-copy="\'x\'">c</button></li></ul>')
    const result = onceResult(host)
    find('button').click()
    expect((await result).text).toBe('x')
    unmount()
  })
})

// ===========================================================================
describe('clipboard strategy', () => {
  it('uses the Clipboard API when available', async () => {
    const { el, unmount } = mount('<button v-copy="\'api\'">c</button>')
    const result = onceResult(el)
    el.click()
    expect((await result).via).toBe('clipboard-api')
    expect(writeText).toHaveBeenCalledWith('api')
    unmount()
  })

  it('falls back to execCommand when the API is absent', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, writable: true, configurable: true })
    const exec = vi.spyOn(document, 'execCommand').mockReturnValue(true)
    const { el, unmount } = mount('<button v-copy="\'legacy\'">c</button>')
    const result = onceResult(el)
    el.click()
    const detail = await result
    expect(detail.success).toBe(true)
    expect(detail.via).toBe('exec-command')
    expect(exec).toHaveBeenCalledWith('copy')
    unmount()
  })

  it('falls back to execCommand when the API rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const exec = vi.spyOn(document, 'execCommand').mockReturnValue(true)
    const { el, unmount } = mount('<button v-copy="\'x\'">c</button>')
    const result = onceResult(el)
    el.click()
    const detail = await result
    expect(detail.success).toBe(true)
    expect(detail.via).toBe('exec-command')
    expect(exec).toHaveBeenCalled()
    unmount()
  })

  it('reports failure when both strategies fail', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    vi.spyOn(document, 'execCommand').mockReturnValue(false)
    const { el, unmount } = mount('<button v-copy="\'x\'">c</button>')
    const result = onceResult(el)
    el.click()
    const detail = await result
    expect(detail.success).toBe(false)
    expect(detail.error).toBeTruthy()
    unmount()
  })
})

// ===========================================================================
describe('keyboard & a11y', () => {
  it('makes a non-interactive element focusable and copies on Enter', async () => {
    const { el, unmount } = mount('<span v-copy>press</span>')
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.getAttribute('role')).toBe('button')
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flush()
    expect(writeText).toHaveBeenCalledWith('press')
    unmount()
  })

  it('does not add tabindex/keyboard to native interactive elements', async () => {
    const { el, unmount } = mount('<button v-copy="\'x\'">c</button>')
    expect(el.hasAttribute('tabindex')).toBe(false)
    unmount()
  })

  it('removes the attributes it added on unmount', async () => {
    const { el, unmount } = mount('<span v-copy>x</span>')
    expect(el.getAttribute('tabindex')).toBe('0')
    unmount()
    expect(el.hasAttribute('tabindex')).toBe(false)
    expect(el.hasAttribute('role')).toBe(false)
  })

  it('announces "Copied" via a shared aria-live region by default', async () => {
    const { el, unmount } = mount('<button v-copy="\'x\'">c</button>')
    el.click()
    await vi.waitFor(() => {
      const region = document.body.querySelector('[aria-live="polite"]')
      expect(region).not.toBeNull()
      expect(region?.getAttribute('role')).toBe('status')
      expect(region?.textContent).toBe('Copied')
    })
    unmount()
  })

  it('honors a custom announce message', async () => {
    const { el, unmount } = mount('<button v-copy="{ source: \'x\', announce: \'Done!\' }">c</button>')
    el.click()
    await vi.waitFor(() => {
      expect(document.body.querySelector('[aria-live="polite"]')?.textContent).toBe('Done!')
    })
    unmount()
  })

  it('does not announce when announce:false', async () => {
    // Warm up so the region exists AND its pending rAF has fully settled,
    // then sentinel it — otherwise a stray warm-up rAF would clobber the sentinel.
    const warm = mount('<button v-copy="\'x\'">c</button>')
    warm.el.click()
    await vi.waitFor(() => {
      expect(document.body.querySelector('[aria-live="polite"]')?.textContent).toBe('Copied')
    })
    warm.unmount()
    const region = document.body.querySelector('[aria-live="polite"]') as HTMLElement
    region.textContent = 'SENTINEL'

    const { el, unmount } = mount('<button v-copy="{ source: \'y\', announce: false }">c</button>')
    el.click(); await flush()
    await new Promise((r) => setTimeout(r, 20)) // give any stray rAF a chance
    expect(region.textContent).toBe('SENTINEL')
    unmount()
  })
})

// ===========================================================================
describe('lifecycle & modifiers', () => {
  it('removes the listener on unmount', async () => {
    const { el, unmount } = mount('<button v-copy="\'x\'">c</button>')
    const remove = vi.spyOn(el, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalled()
  })

  it('.once copies at most once', async () => {
    const { el, unmount } = mount('<button v-copy.once="\'x\'">c</button>')
    el.click(); await flush()
    el.click(); await flush()
    expect(writeText).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('.once latches the TRIGGER — ctrl.copy() is the deliberate way past it', async () => {
    const ctrl = reactive<CopyController>({ source: 'x' })
    const { el, unmount } = mount('<button v-copy.once="ctrl">c</button>', { ctrl })
    el.click(); await flush()
    el.click(); await flush()
    expect(writeText).toHaveBeenCalledTimes(1)
    await ctrl.copy!()
    expect(writeText).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('.once detaches the keyboard path too, not just the pointer one', async () => {
    const { el, unmount } = mount('<span v-copy.once="\'x\'">c</span>')
    el.click(); await flush()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flush()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(el.hasAttribute('tabindex')).toBe(false)
    expect(el.hasAttribute('role')).toBe(false)
    unmount()
  })

  it('a custom trigger replaces the POINTER activation and keeps Enter/Space', async () => {
    // WCAG 2.1.1: an action reachable only by dblclick/contextmenu would be
    // unreachable from a keyboard, so the keyboard path is not swapped out.
    const { el, unmount } = mount(
      '<span v-copy="{ source: \'d\', trigger: \'dblclick\' }">c</span>',
    )
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.getAttribute('role')).toBe('button')

    el.click(); await flush()
    expect(writeText).not.toHaveBeenCalled()

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flush()
    expect(writeText).toHaveBeenCalledWith('d')
    unmount()
  })

  it('trigger:false takes the keyboard path away with it', async () => {
    const { el, unmount } = mount('<span v-copy="{ source: \'p\', trigger: false }">c</span>')
    expect(el.hasAttribute('tabindex')).toBe(false)
    expect(el.hasAttribute('role')).toBe(false)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flush()
    expect(writeText).not.toHaveBeenCalled()
    unmount()
  })

  it('.prevent calls preventDefault on the trigger event', async () => {
    const { el, unmount } = mount('<button v-copy.prevent="\'x\'">c</button>')
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    await flush()
    expect(ev.defaultPrevented).toBe(true)
    unmount()
  })

  it('supports a custom trigger event and swaps it reactively', async () => {
    const cfg = ref<{ source: string; trigger: string }>({ source: 'd', trigger: 'dblclick' })
    const { el, unmount } = mount('<button v-copy="cfg">c</button>', { cfg })

    el.click(); await flush()
    expect(writeText).not.toHaveBeenCalled()

    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flush()
    expect(writeText).toHaveBeenCalledWith('d')

    writeText.mockClear()
    cfg.value = { source: 'd', trigger: 'click' }
    await nextTick()
    el.click(); await flush()
    expect(writeText).toHaveBeenCalledWith('d')
    unmount()
  })

  it('trigger:false disables event copying but allows programmatic copy', async () => {
    const ctrl = reactive<CopyController>({ trigger: false })
    const { el, unmount } = mount('<code v-copy="ctrl">prog</code>', { ctrl })
    el.click(); await flush()
    expect(writeText).not.toHaveBeenCalled()
    await ctrl.copy!()
    expect(writeText).toHaveBeenCalledWith('prog')
    unmount()
  })
})
