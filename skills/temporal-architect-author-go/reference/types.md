# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external package and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.Items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `// TODO` and a question to the user. Export every field (uppercase): they cross workflow/activity boundaries via serialization.

| TWF | Go |
|-----|----|
| `string` / `int` / `bool` | same |
| `decimal` | `float64` |
| `duration` | `time.Duration` (`5m` → `5*time.Minute`) |
| `time` | `time.Time` |
| `[]T` / `Map[K]V` | `[]T` / `map[K]V` |

## Dependency types

The ground truth is the method the activity body will call — verified against the version in `go.mod`, never trained knowledge.

1. `go doc <package>.Method` for its exact parameter and return types. Without `go doc` (not yet in `go.mod`, sparse docs, offline): pkg.go.dev, the dependency's source, or the user.
2. `go doc <package>.ParamType` for each parameter's fields. Verify every field type — a name misleads (a `Tools` field may take a union wrapper, not the type the name suggests).
3. Follow the chain until every type in the call is a primitive or one you recognize.

Resolved means you can write the full call with concrete types:

```
client.Messages.New(ctx, anthropic.MessageNewParams{
    Model:    anthropic.Model(model),     // verified: Model is a string typedef
    Messages: []anthropic.MessageParam{}, // verified: not []Message
    Tools:    []anthropic.ToolUnionParam{}, // verified: not []ToolParam
})
```

## Serialization boundary

Workflow and activity parameters pass through the data converter (JSON by default). Defined types round-trip cleanly; dependency types may carry custom marshaling, unexported fields, or non-JSON-safe constructs. **Keep dependency types inside activity bodies**: signatures use your own types, and the activity converts — which also decouples workflow logic from any one dependency.
