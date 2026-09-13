/**
 * Plugin-level global defaults. Per-binding config always wins; the plugin's
 * install() merges into these once at app setup.
 */
import type { CopyPluginOptions } from './types'

let globalDefaults: CopyPluginOptions = {}

export function getGlobalDefaults(): CopyPluginOptions {
  return globalDefaults
}

export function mergeGlobalDefaults(options: CopyPluginOptions): void {
  globalDefaults = { ...globalDefaults, ...options }
}
