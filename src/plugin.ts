/**
 * Plugin install path — `app.use(VCopyPlugin, { max: 20, ... })` registers the
 * directive globally as `copy` and merges the optional global defaults.
 */
import type { App, Plugin } from 'vue'
import { mergeGlobalDefaults } from './defaults'
import { vCopy } from './directive'
import type { CopyPluginOptions } from './types'

/** Vue plugin that registers the directive globally as `copy` (i.e. `v-copy`). */
export const VCopyPlugin: Plugin = {
  install(app: App, options?: CopyPluginOptions) {
    if (options) mergeGlobalDefaults(options)
    app.directive('copy', vCopy)
  },
}
