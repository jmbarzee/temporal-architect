# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Receipt):
	close complete(Receipt{status: "done"})
```

```rust
#[workflow]
#[derive(Default)]
pub struct ProcessOrder;

#[workflow_methods]
impl ProcessOrder {
    #[run]
    pub async fn run(_ctx: &mut WorkflowContext<Self>, _order: Order) -> WorkflowResult<Receipt> {
        Ok(Receipt { status: "done".into() })
    }
}
```

A `#[workflow]` struct named as the `.twf` names it, with one `#[run]` method (its name is free; `run`) and `name` unset ([SKILL.md](../SKILL.md#wire-names)), in a `#[workflow_methods]` impl. The run takes one input after its context (`macros/src/workflow_definitions.rs:509-526`): none for no params, the type for one, and `MultiArgsN<A, B>` for several, destructured with `let MultiArgs2(a, b) = args;` ([types.md](./types.md)). No DSL return type → `WorkflowResult<()>`; `-> (A, B)` → one struct.

Workflow state is the struct's fields. Without an `#[init]` the SDK builds it with `Default` (`workflow_definitions.rs:1005-1008`); when handlers need the run's input as state, `#[init] pub fn new(ctx: &WorkflowContextView, input: I) -> Self` takes that input instead of `#[run]`, since the two share one input type (`:635-640`). Async code reads and writes state only through `ctx.state(|s| …)` and `ctx.state_mut(|s| …)` (`workflow/src/workflow_context.rs:2500-2521`).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```rust
impl ShipItem {
    pub fn id(order_id: &str, item_id: &str) -> String {
        format!("ship-{order_id}-{item_id}")
    }
}
```

One ID function per scheme, an associated `id` in a plain `impl` block beside the workflow's `#[workflow_methods]` one, taking one argument per hole. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

A type that has a scheme or ID policies also gets one `start_options` function holding its ID, task queue and `default_options:`; every client start uses it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```rust
impl OrderTracker {
    pub fn id(order_id: &str) -> String {
        format!("tracker-{order_id}")
    }

    pub fn start_options(order_id: &str) -> WorkflowStartOptions {
        WorkflowStartOptions::new(FULFILLMENT_TASK_QUEUE, Self::id(order_id))
            .id_conflict_policy(WorkflowIdConflictPolicy::UseExisting)
            .build()
    }
}

client
    .start_workflow(OrderTracker::run, order_id.clone(), OrderTracker::start_options(&order_id))
    .await?;
```

`WorkflowStartOptions` is the client's, and its task queue and workflow ID are both required (`client/src/options_structs.rs:487-498`); the run's input travels in the `start_workflow` call (`client/src/lib.rs:1155-1166`).

## Determinism constraints

[idioms.md § Determinism](./idioms.md#determinism); changing running workflows: [idioms.md § Versioning](./idioms.md#versioning).
