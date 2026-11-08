# nexus service definition

```twf
@sdk(ruby, "worker.rb")
worker callerTypes:
	workflow Caller

worker greeterTypes:
	workflow Greet
	activity Compose
	nexus service GreeterService

nexus service GreeterService:
	sync Hello(name: string) -> (string):
		close complete("Hello, " + name)
	async Greet workflow Greet
```

**A `nexus service`, its `sync` and `async` operations, and a worker that registers one are unsupported in Ruby.** The SDK has a Nexus caller and no Nexus handler: `Worker.new` takes no service handlers (`worker.rb:463-497`) and builds its core worker with `enable_nexus: false` (`worker.rb:591`), and no handler API exists in the gem. This is an SDK limit, not a design gap: the `.twf` stays as written.

What to write instead:

- **Host the service in another SDK.** The worker that registers the `nexus service` — with the operations' handlers and, usually, an `async` operation's backing workflow — is authored by that SDK's author skill (its `nexus-service-def.md`), and carries that SDK's `@sdk`. Never give it `@sdk(ruby, …)`: no Ruby factory can register the service. The corpus's `nexus` design annotates only `callerTypes` for Ruby.
- **Call it from Ruby** as any caller does: [nexus.md](./nexus.md), [detach.md](./detach.md). Say in the calling file where the service lives, as the corpus's `caller_workflows.rb` does:

```ruby
# Ruby has a Nexus caller (experimental) and no Nexus handler: GreeterService,
# and so the greeterTypes worker, are implemented in another SDK.
class Caller < Temporalio::Workflow::Definition
  # ...
end
```

- **The worker options** `max_concurrent_nexus_task_executions` and `max_concurrent_nexus_task_pollers` are unsupported for the same reason ([worker.md](./worker.md#worker-options)).
- **Testing a Ruby caller** needs a handler from elsewhere: `WorkflowEnvironment#create_nexus_endpoint` routes an endpoint to a task queue under `start_time_skipping`, and the corpus's `caller_test.rb` answers that queue with a stand-in.

A Ruby workflow started by such a handler (or a Ruby client start of it) still takes its ID from the workflow's one ID method, which must render the scheme as the handler's does ([workflow-def.md](./workflow-def.md#id_scheme)).
