# Worker and Namespace Definitions

## Worker Definitions

Workers are reusable type sets that group workflows and activities:

```
worker_def ::= 'worker' IDENT ':' NEWLINE
               INDENT
               worker_entry*
               DEDENT

worker_entry ::= 'workflow' IDENT NEWLINE
               | 'activity' IDENT NEWLINE
               | 'nexus' 'service' IDENT NEWLINE
```

Worker names use lowerCamelCase convention. Workers contain workflow, activity, and nexus service references — deployment configuration (task_queue, etc.) is specified when the worker is instantiated in a namespace block.

**Example:**
```
worker orderTypes:
    workflow ProcessOrder
    workflow CancelOrder
    activity ChargePayment
    activity SendNotification
    nexus service OrderService
```

## Namespace Definitions

Namespaces instantiate workers with deployment options, defining the deployment topology:

```
namespace_def ::= 'namespace' IDENT ':' NEWLINE
                  INDENT
                  namespace_entry*
                  DEDENT

namespace_entry ::= 'worker' IDENT NEWLINE [options_line]
                  | 'nexus' 'endpoint' IDENT NEWLINE [options_line]
```

Each worker instantiation inside a namespace requires a `task_queue` option. Nexus endpoint instantiations also require a `task_queue` option for routing.

**Example:**
```
namespace orders:
    worker orderTypes
        options:
            task_queue: "orderProcessing"
            max_concurrent_activity_executions: 50
    nexus endpoint OrderEndpoint
        options:
            task_queue: "orderProcessing"
```

The same worker type set can be instantiated in multiple namespaces with different options:

```
namespace staging:
    worker orderTypes
        options:
            task_queue: "staging-orders"
```

## Worker Options

Worker instantiation options (all snake_case):

| Key | Type |
|-----|------|
| `task_queue` | string (required) |
| `worker_activity_rate_limit` | number |
| `task_queue_activity_rate_limit` | number |
| `worker_local_activity_rate_limit` | number |
| `max_concurrent_activity_executions` | number |
| `max_concurrent_workflow_task_executions` | number |
| `max_concurrent_local_activity_executions` | number |
| `max_concurrent_workflow_task_pollers` | number |
| `max_concurrent_activity_task_pollers` | number |
| `max_cached_workflows` | number |
| `sticky_schedule_to_start_timeout` | duration |
| `heartbeat_throttle_interval` | duration |
| `worker_identity` | string |
| `worker_shutdown_timeout` | duration |
| `local_activity_only_mode` | bool |

## Endpoint Options

Nexus endpoint instantiation options:

| Key | Type |
|-----|------|
| `task_queue` | string (required) |

## Resolution

The resolver validates workers, namespaces, and nexus definitions:
- Worker references to undefined workflows, activities, or nexus services produce errors
- Duplicate worker, namespace, or nexus service names produce errors
- Duplicate nexus endpoint names across namespaces produce errors
- Namespace references to undefined workers produce errors
- Worker instantiations missing `task_queue` option produce errors
- Nexus endpoint instantiations missing `task_queue` option produce errors
- Workers on the same task queue (within a namespace) with different type sets produce errors
- Workers on the same task queue with identical type sets produce warnings (redundant)
- Nexus endpoint routing to a task queue where no worker registers the service produces errors
- Defined workflows/activities not on any instantiated worker produce warnings (when namespaces exist)
- Defined nexus services not referenced by any worker produce warnings (when namespaces exist)
- Defined workers not instantiated in any namespace produce warnings (when namespaces exist)
