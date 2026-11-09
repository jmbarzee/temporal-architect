# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external library and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `// TODO:` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The default converter tries, in order, `nil` → `binary/null`, `[UInt8]`/`Data` → `binary/plain`, protobuf messages → JSON protobuf, and everything else through a `JSONEncoder` whose only non-default setting is ISO 8601 dates (`Temporal/Converters/DefaultPayloadConverter.swift:27-35`, `BinaryPayloadConverter.swift:29-35`, `JSONPayloadConverter.swift:27-38`), so each type maps to what survives that round trip:

| TWF | Swift |
|-----|------|
| `string` / `bool` | `String` / `Bool` |
| `int` | `Int`, exact across the 64-bit range as a JSON number |
| `float` | `Double` |
| `decimal` | `Decimal`, a JSON number exact in value but not in scale: `0.10` decodes as `0.1` |
| `duration` | `Swift.Duration`, in a payload and as an option or timer argument; a payload carries it as `Duration`'s own `Codable` form, a two-element array of the 128-bit attosecond count (`5400s` → `[292,13550730476810928128]`), not seconds or ISO 8601 |
| `time` | `Date`, an ISO 8601 UTC string with `Z` in **whole seconds**: the fraction is dropped on encode |
| `bytes` | `Data`; a whole argument or result is `binary/plain`, raw; nested in a struct, array or dictionary it is a base64 string, which decodes back to `Data` |
| `any` | `TemporalRawValue`, an undecoded payload (`Temporal/API/TemporalRawValue.swift:16`, `Temporal/Converters/CompositePayloadConverter.swift:35,55`), as a whole argument or result only: it is not `Codable`, so a field of type `any` needs a `Codable` type the user confirms |
| `list[T]` / `map[string, V]` | `[T]` / `[String: V]` |
| user type | a `struct` conforming to `Codable, Sendable` whose stored properties are the `.twf` fields as named: `struct Result: Codable, Sendable { var status: String; var trackingId: String }` |

- **Property names go out as declared**, with no key strategy (`JSONPayloadConverter.swift:27-31`): name each property exactly as the `.twf` field (`trackingId`). A field named for a Swift keyword (`default`, `in`) is written in backticks; its key stays the bare name.
- **A `nil` optional property is omitted**, not written as `null`.
- **One input per call.** Every workflow, activity, signal, query and update takes one `Input` (`Temporal/Worker/Workflow/WorkflowDefinition.swift:50`, `Temporal/Worker/Activities/ActivityDefinition.swift:49`, `Temporal/Worker/Workflow/WorkflowSignalDefinition.swift:64`, `WorkflowQueryDefinition.swift:60`, `WorkflowUpdateDefinition.swift:55`), so several `.twf` params are one struct of them, named as the params; none is `Void`, sent as one empty payload (`Temporal/Converters/DataConverter.swift:85-86`).
- **Several returns** (`-> (A, B)`) are one struct of the values.

## Dependency types

The ground truth is the method the activity body will call — verified against the version `Package.resolved` pins, never trained knowledge.

1. Read the method's declaration in the package's source under `.build/checkouts/<package>/` after `swift package resolve`. Without it (not yet resolved, offline): the package's published DocC, its repository at the pinned tag, or the user.
2. Read each parameter type's declaration the same way. Verify every field type — a name misleads.
3. Follow the chain until every type in the call is a standard-library type or one you recognize.

Resolved means you can write the full call with concrete types, and `swift build --build-tests` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's type or encoding crosses the converter (DocC [`Working-with-Data.md` § Use the default data converter](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Working-with-Data.md#use-the-default-data-converter)) and workflow logic stays free of any one dependency.
