# Versioning

swift-temporal-sdk `1.5.0` has no DocC article or Example on versioning; its symbol docs are the source. Paths are in `Sources/Temporal/`.

## Patching

| Call | Use | Symbol |
|---|---|---|
| `context.patch("id") -> Bool` | `true` takes the new path; a replay of an older run takes the old one | [`WorkflowContext.patch(_:)`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Worker/Workflow/WorkflowContext.swift#L430) |
| `context.deprecatePatch("id")` | once no run on the old path remains: keep the marker, delete the old branch | [`WorkflowContext.deprecatePatch(_:)`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Worker/Workflow/WorkflowContext.swift#L449) |

A patch ID is code, never design: it stays out of the `.twf`.

## Worker versioning

Spec 03's `versioning:` option sets `TemporalWorker.Configuration.versioningStrategy` ([`VersioningStrategy`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Worker/TemporalWorker+Configuration.swift#L63); default `.none(.init())`, `Worker/TemporalWorker+Configuration.swift:395`):

| `versioning:` | Strategy | Symbol |
|---|---|---|
| `none` | `.none(.init())` | [`none(_:)`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Worker/TemporalWorker+Configuration.swift#L180) |
| `build_id` | `.legacyBuildIdBased(.init(buildId:))` | [`legacyBuildIdBased(_:)`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Worker/TemporalWorker+Configuration.swift#L195) |
| `deployment` | `.deploymentBased(.init(deploymentVersion: …, useWorkerVersioning: true, defaultVersioningBehavior: …))` | [`deploymentBased(_:)`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Worker/TemporalWorker+Configuration.swift#L188) |

The Build ID and deployment name are deploy-time inputs from config or env: never hard-code them. Under `deployment`, the worker's `defaultVersioningBehavior` (`.pinned` or `.autoUpgrade`; `.unspecified` fails at startup, `:133`) is the only behavior knob at `1.5.0`.
