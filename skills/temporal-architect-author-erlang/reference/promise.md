# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`wait` in its options); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```erlang
HandleA = start_activity(~"ProcessA", [maps:get(~"a", Items)], activity_opts()),
%% ... do other work ...
case wait(HandleA) of
    #{state := completed, result := [ResultA]} ->
        %% ... the rest of the workflow, using ResultA
        ok;
    #{state := State} ->
        fail_workflow_execution(#{message => <<"ProcessA ", (atom_to_binary(State))/binary>>})
end
```

| `promise p <- …` | Erlang | `await p` |
|------------------|--------|-----------|
| `activity` | `P = start_activity(~"Name", [Args], Opts)`, without `wait` ([activity-call.md](./activity-call.md)) | `wait(P)`, matched on `completed` |
| `workflow` | `P = start_child_workflow(TaskQueue, ~"Name", [{input, [Args]}, {workflow_id, …}])`, without `wait` ([workflow-call.md](./workflow-call.md)) | `wait(P)`, matched on `completed` |
| `timer(5m)` | `P = start_timer({5, minute})` ([await-timer.md](./await-timer.md)) | `wait(P)` |
| `signal Approve` | `P = corpus_arrivals:promise(~"Approve")` ([await-signal.md](./await-signal.md)) | `[Approver] = corpus_arrivals:await(P)` |
| `nexus …` / `update …` | unsupported ([author-elixir nexus.md](../../temporal-architect-author-elixir/reference/nexus.md), [update-handler.md](../../temporal-architect-author-elixir/reference/update-handler.md)) | — |

- A call returns its handle unless `wait` is set; `wait(P)` blocks until it is ready and returns its data map (`temporal_sdk/temporal_sdk_workflow.erl:2690-2703`). A closed activity or child returns its state and never raises, so match `completed` in a `case`, as for an inline call ([activity-call.md](./activity-call.md)).
- **A promise on a signal begins waiting at its binding**: `corpus_arrivals:promise/1` takes its ticket when called, `{Name, Ticket}`. Bind and await it in the main execution, never in a `start_execution` ([signal-handler.md](./signal-handler.md)).
- In `await one:`, a promise is a case ranked by the task it became ready in ([await-one.md](./await-one.md#cases)). Losing a round never cancels it, a `timer` promise included (spec 06; [author-elixir promise.md](../../temporal-architect-author-elixir/reference/promise.md)).
