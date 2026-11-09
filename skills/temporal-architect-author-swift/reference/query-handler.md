# query handler

```twf
query Status() -> (string):
	options:
		description: "Current approval status"
	return status
```

```swift
@WorkflowQuery(description: "Current approval status")
var status: String = "submitted"
```

```twf
query ItemCount(category: string) -> (int):
	return counts[category]
```

```swift
@WorkflowQuery
func itemCount(input: String) -> Int {
    counts[input, default: 0]
}
```

- A query that returns a state `var` named as the query is that `var`, annotated, with an explicit type (`TemporalMacros/WorkflowQueryMacro.swift:166-173`), as the corpus's `Approval` exposes `status`. Otherwise a `@WorkflowQuery` method with one `input`, after an optional `context: WorkflowContextView`, returning a non-`Void` value (`TemporalMacros/WorkflowQueryMacro.swift:64-97`). Its wire name is the method's or property's, capitalized ([SKILL.md](../SKILL.md#wire-names)).
- A query is synchronous and never mutating: the macro calls it on the workflow without `await` or a mutable copy (`TemporalMacros/WorkflowQueryMacro.swift:121-127`), so it cannot block or change state.
- The property form, and a query with no params, takes `Void`: like a [signal's](./signal-handler.md), a query sent with zero payloads is logged and never answered (`Temporal/Worker/Workflow/WorkflowInstance.swift:658-670`).
- `description:` is the only option (`Temporal/Macros/WorkflowMacro.swift:137`): `unfinished_policy` does not apply to a handler that never blocks. Queries: DocC [`Developing-Workflows.md` § Define query handlers](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Developing-Workflows.md#define-query-handlers).
