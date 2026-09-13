/**
 * Accessibility — one shared, visually-hidden `aria-live="polite"` region for
 * the whole page (not one per element).
 */
let liveRegion: HTMLElement | null = null

export function announce(message: string): void {
  if (typeof document === 'undefined' || !document.body) return
  if (!liveRegion) {
    liveRegion = document.createElement('div')
    liveRegion.setAttribute('aria-live', 'polite')
    liveRegion.setAttribute('role', 'status')
    Object.assign(liveRegion.style, {
      position: 'absolute', width: '1px', height: '1px', padding: '0',
      margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap', border: '0',
    })
    document.body.appendChild(liveRegion)
  }
  const region = liveRegion
  region.textContent = ''
  // Clear-then-set on the next frame so identical repeat copies re-announce.
  const schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)
  schedule(() => { region.textContent = message })
}
