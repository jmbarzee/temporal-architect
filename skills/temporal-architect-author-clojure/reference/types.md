# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external library and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before writing a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `;; TODO` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The SDK installs its own converter on every client, worker and test environment that does not pass `:data-converter`: Null, then Nippy, then JSON (`src/temporal/client/options.clj:14-17`, `src/temporal/converter/default.clj:15-18`). sdk-java takes the first converter that accepts a value (`common/converter/PayloadAndFailureDataConverter.java:54-61`), and Nippy accepts every Clojure value, so every non-nil payload is Nippy, labelled `binary/plain` (`src/temporal/converter/nippy.clj:12-29`). Nippy writes each type below natively (`taoensso.nippy` 3.9.0 `schema.clj:67-104,154-165`), so each round-trips exactly:

| TWF | Clojure |
|-----|---------|
| `string` / `bool` | `String` / `Boolean` |
| `int` | `Long`, exact across its range |
| `float` | `Double` |
| `decimal` | `BigDecimal` (`1.10M`), exact, scale kept |
| `duration` | `java.time.Duration`, in a payload and as an option or timer argument |
| `time` | `java.time.Instant`, to the nanosecond |
| `bytes` | `byte[]`, top level or nested |
| `any` | any value |
| `list[T]` / `map[string, V]` | a vector / a map |
| user type | a plain map with kebab-case keyword keys: `{:status "done" :tracking-id id}` |

- **A user type is a map, never a record.** A record round-trips under Nippy too, but every SDK example passes maps (`doc/workflows.md:21-29`). Keys are the `.twf` fields in kebab case (`trackingId` → `:tracking-id`), unqualified.
- **Several params are one map.** A workflow or activity receives exactly one argument, payload 0 (`src/temporal/internal/utils.clj:141-150`), so `(order, item)` is `{:order order :item item}`, destructured with `{:keys [order item]}`; no params pass `{}`.
- **Several returns** (`-> (A, B)`) are one map of the values.
- Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../../temporal-architect/reference/cross-sdk.md).

## Dependency types

The ground truth is the method the activity body will call — verified against the version in the project file, never trained knowledge.

1. Read the function's or method's declaration in the library's source: a Clojure library's jar under `~/.m2/repository/` holds its `.clj` files; a Java library's `-sources.jar` or javadoc gives exact parameter and return types. Without it (not yet resolved, offline): the library's published API docs, its source, or the user.
2. Read each parameter's shape the same way: a Clojure function's destructuring or spec, a Java type's declaration. Verify every field — a name misleads.
3. Follow the chain until every value in the call is a primitive or a shape you recognize.

Resolved means you can write the full call with concrete values, and [Verify](../SKILL.md#verify) loads it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no library's class reaches the converter and workflow logic stays free of any one dependency. A Java object Nippy cannot freeze fails the call with `DataConverterException` (`src/temporal/converter/nippy.clj:23-29`).
