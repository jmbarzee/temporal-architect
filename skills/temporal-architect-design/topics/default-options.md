# Definition-Level Default Options

> **Example:** [`default-options.twf`](./default-options.twf)

An `activity` or `workflow` definition can carry a `default_options:` block that supplies default operational config — timeouts, retry policy, task queue, priority — for every call of that definition. Use it to keep the config with the definition instead of repeating an `options:` block at each call site.

See the [notation reference](../reference/notation-reference.md#definition-level-default_options) for the full key partition and precedence rules.

## Placement

The block leads the definition body:

- **Activity** — head of the body, before any statements.
- **Workflow** — first body element, before the optional `state:` block.

```twf
activity ChargeCard(card: Card, amount: int) -> (Receipt):
    default_options:
        start_to_close_timeout: 30s
        retry_policy:
            maximum_attempts: 5
    return charge(card, amount)
```

## Key partition

- **Activity** `default_options:` accepts every activity call-option key.
- **Workflow** `default_options:` accepts every workflow call-option key **except** `parent_close_policy`, which is call-site-only — it describes one parent↔child bond, not the workflow type. Using it at definition level is rejected with `call-site-only option key not allowed in default_options: parent_close_policy`.

## Precedence

A call-site `options:` block overrides the definition's `default_options:` **per key**:

```twf
workflow FulfillOrder(order: Order) -> (OrderResult):
    default_options:
        workflow_execution_timeout: 1h
        retry_policy:
            maximum_attempts: 3
    state:
        condition paid

    # Uses the activity's default_options unchanged.
    activity ChargeCard(order.card, order.total) -> receipt

    # Overrides one key. The call-site retry_policy atomic-replaces the
    # default retry_policy — there is no deep merge of nested fields.
    activity ChargeCard(order.card, order.tip) -> tipReceipt
        options:
            retry_policy:
                maximum_attempts: 1

    close complete(OrderResult{status: "fulfilled"})
```

- A key present at the call site wins; keys present only in `default_options:` still apply.
- Nested blocks (`retry_policy`, `priority`) **atomic-replace** — a call-site nested block replaces the whole default nested block.
- Precedence is **declarative**: `twf check` validates the two blocks independently and does not compute a merged/effective options set. The layering is applied downstream (code generation / SDK), not by the parser.
