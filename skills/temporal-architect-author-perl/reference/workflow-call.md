# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```perl
my $ship_result = await Temporalio::Workflow::execute_child_workflow('ShipOrder', args => [$order]);
```

- `Temporalio::Workflow::execute_child_workflow($name, %opts)` (`Workflow.pm:284-287`) takes the child's wire name as a string; options are flat keys after it ([options.md](./options.md#child-workflow-options)), and a misspelled key is silently dropped. A failed child dies with `Temporalio::Exception::ChildWorkflow` at the `await` (`README.md:641-642`).
- A qualified callee, `workflow orders.ShipOrder(...)`, is still `'ShipOrder'`: a `.twf` package changes the Perl namespace, never the wire name ([SKILL.md](../SKILL.md#output-conventions)).
- A child with an `id_scheme:` gets `id => ShipItem::id($order->{id}, $item->{id})` from its ID sub ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave `id` unset and the SDK draws a deterministic one (`Workflow/Runner.pm:1200-1203`).
- A child takes `id_reuse_policy` only; it has no conflict policy, so a start onto a running ID fails ([options.md](./options.md#workflow-id-policies)). A `workflow` start in a sync nexus body is a client start instead: `$ctx->client->start_workflow` with the type's start options ([nexus-service-def.md](./nexus-service-def.md#sync)).
- Bound to a promise, the call is `my $pay = await Temporalio::Workflow::start_child_workflow(...)`, which resolves to the `ChildWorkflowHandle` once the child has started (`Workflow.pm:272-278`) and is also the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)); `await $pay->result` is the `await` (`Workflow/ChildWorkflowHandle.pm:70`). `execute_child_workflow` is exactly that pair. Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Default `parent_close_policy` is `terminate` (`Workflow/Runner.pm:4375`) — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md)) when the child should outlive the parent.
