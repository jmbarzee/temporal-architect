# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external package and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `// TODO` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The default payload converter sends a whole `byte[]` argument or result as `binary/plain` and everything else through `System.Text.Json` with `new JsonSerializerOptions()` (`Converters/DefaultPayloadConverter.cs:49-66`, `Converters/BinaryPlainConverter.cs:21`), so each type maps to what survives that round trip:

| TWF | C# |
|-----|----|
| `string` / `bool` | `string` / `bool` |
| `int` | `long`, exact across its range |
| `float` | `double`; NaN and ±∞ throw `ArgumentException` at encode |
| `decimal` | `decimal`, exact: a JSON number that keeps its scale (`1.10` decodes as `1.10m`) |
| `duration` | `TimeSpan`, in a payload and as an option or timer argument; a payload carries it as a `"00:05:00"` string |
| `time` | `DateTimeOffset`, an ISO 8601 string with its offset. Not `DateTime`: an unspecified-kind value writes no offset |
| `bytes` | `byte[]`; nested in a record, list or map it is a base64 string, which decodes back to `byte[]` |
| `any` | `JsonElement`: an `object`-typed value decodes as one |
| `list[T]` / `map[string, V]` | `List<T>` / `Dictionary<string, V>` |
| user type | a positional `record` with PascalCase properties: `record Result(string Status, string TrackingId)` |

- **Property names go out as written**, PascalCase (no naming policy), and decode case-sensitively. Name each property as the `.twf` field in PascalCase (`trackingId` → `TrackingId`).
- **Several returns** (`-> (A, B)`) are one positional record of the values. Never a `ValueTuple`: `System.Text.Json` skips its fields and writes `{}`.

## Dependency types

The ground truth is the method the activity body will call — verified against the version in the `.csproj` `PackageReference` (or `Directory.Packages.props`), never trained knowledge.

1. Read the method's declaration in the package's assembly or XML docs under `~/.nuget/packages/<id>/<version>/` for its exact parameter and return types. Without it (not yet restored, offline): the package's published API docs, its source, or the user.
2. Read each parameter type's declaration the same way. Verify every field type — a name misleads.
3. Follow the chain until every type in the call is a primitive or one you recognize.

Resolved means you can write the full call with concrete types, and `dotnet build` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's class or encoding crosses the payload converter (`temporal-developer` `references/dotnet/data-handling.md`) and workflow logic stays free of any one dependency.
