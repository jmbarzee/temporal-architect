# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```erlang
%% orders_validate_order.erl
-module(orders_validate_order).

-export([execute/2]).

-include_lib("temporal_sdk/include/activity.hrl").

execute(_Context, [Order]) ->
    [orders_validator:validate(Order)].
```

- A module per activity, named for its design, including `activity.hrl`, which declares `-behaviour(temporal_sdk_activity)` and imports the activity API, `heartbeat/1` and `fail/1` among it (`include/activity.hrl:1-27`), with one exported `execute(Context, Input)` (`temporal_sdk/temporal_sdk_activity.erl:95-96`). `Input` is the positional payload list; the return value is the result's payload list, `[Result]`, and `[]` when the DSL has no return type.
- A raise fails the attempt, which retries per the call's `retry_policy`; `fail(#{message => "…", type => …, non_retryable => true})` fails it at once, its message a charlist ([close.md](./close.md)), and cancellation reaches the activity only through heartbeats ([heartbeat.md](./heartbeat.md)). The mechanics, with `handle_failure/4`: [author-elixir activity-def.md](../../temporal-architect-author-elixir/reference/activity-def.md).
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.

## Activity Implementation Pattern

Generate the four pieces of [author-elixir § Activity Implementation Pattern](../../temporal-architect-author-elixir/reference/activity-def.md#activity-implementation-pattern), each a design-prefixed module: the activity modules, their thin `execute/2` bodies, a behaviour or plain module per dependency (`orders_validator`), and its concrete implementation. A dependency comes from the application, its environment or a supervised client process, or from the activity worker's `{task_settings, [{data, Term}]}`, read with `get_data()`.
