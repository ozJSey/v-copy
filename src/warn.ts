/**
 * One-shot console warnings — each distinct message fires once per session.
 */
const warned = new Set<string>()

export function warnOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  if (typeof console !== 'undefined') console.warn(`[v-copy] ${message}`)
}
