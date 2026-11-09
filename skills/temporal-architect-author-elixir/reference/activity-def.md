# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```elixir
# orders/validate_order.ex
defmodule Orders.ValidateOrder do
  use TemporalSdk.Activity

  @impl true
  def execute(_context, [order]) do
    [Orders.Validator.validate(order)]
  end
end
```

- A module per activity, `use TemporalSdk.Activity` (`lib/temporal_sdk/temporal_sdk_activity.ex:5-11`), with one `execute(context, input)` callback (`temporal_sdk/temporal_sdk_activity.erl:95-96`). Its type name is the `.twf` name, mapped to the module by the worker ([SKILL.md](../SKILL.md#wire-names)). `input` is the list of decoded payloads, so the params are positional; the return value is the result's payload list, `[result]`, and `[]` when the DSL has no return type.
- A raise fails the attempt, which retries per the call's `retry_policy`; `fail(%{message: …, type: …, non_retryable: true})` fails it at once with an application failure (`temporal_sdk/temporal_sdk_activity.erl:160-177`, `temporal_sdk/temporal_sdk.erl:156-167`), and `handle_failure/4` may shape a raise's failure (`temporal_sdk/temporal_sdk_activity.erl:109-116`).
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches a running activity only through heartbeats, as the optional `handle_cancel/1` callback (`temporal_sdk/temporal_sdk_activity.erl:103-104`; [heartbeat.md](./heartbeat.md)).

## Activity Implementation Pattern

Generate all four pieces:

1. **Activity modules** — one per activity, as above.
2. **Execute bodies** — thin translation: validate input, call the dependency module, translate output.
3. **Dependency modules** — a behaviour or plain module per dependency, shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real library integration: client construction, request/response conversion, error handling.

A module has no instance to hold its dependencies, so they come from the application: its config, or a client process its supervision tree starts. The SDK's own seam is the activity worker's `task_settings: [data: term]`, which each task reads with `get_data()` (`worker/temporal_sdk_worker.erl:93-99`, `temporal_sdk/temporal_sdk_activity.erl:218-220`).

Execute bodies and dependency modules are mechanical; concrete implementations need the library knowledge from dependency resolution.
