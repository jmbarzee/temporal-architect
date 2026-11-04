// The visualizer's verification bundle: pure checks over the adapter's helpers.
// It touches no filesystem and only prints one JSON report, so it needs no node
// typings; verify/run.mjs runs it and sets the exit code.

import { report } from './check'
import { filesChecks } from './files'

filesChecks()

console.log(JSON.stringify(report()))
