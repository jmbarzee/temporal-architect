# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external library and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `// TODO` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The default converter sends a whole `byte[]` argument or result as `binary/plain` and everything else through Jackson with the SDK's default `ObjectMapper` (`common/converter/DefaultDataConverter.java:16-22`, `ByteArrayPayloadConverter.java:15-22`, `JacksonJsonPayloadConverter.java:71-82`), so each type maps to what survives that round trip:

| TWF | Java |
|-----|------|
| `string` / `bool` | `String` / `boolean` |
| `int` | `long`, exact across its range as a JSON number |
| `float` | `double` |
| `decimal` | `java.math.BigDecimal`, exact: a JSON number that keeps its scale (`0.10` decodes as `0.10`) |
| `duration` | `java.time.Duration`, in a payload and as an option or timer argument; a payload carries it as a JSON number of seconds (`5400.000000000`), not ISO 8601 (`JavaTimeModule`, `JacksonJsonPayloadConverter.java:78`) |
| `time` | `java.time.Instant`, an ISO 8601 UTC string with `Z`, to the nanosecond (`WRITE_DATES_AS_TIMESTAMPS` off, `:77`) |
| `bytes` | `byte[]`; nested in a record, list or map it is a base64 string, which decodes back to `byte[]` |
| `any` | `JsonNode`: the decoded JSON tree |
| `list[T]` / `map[string, V]` | `List<T>` / `Map<String, V>`, boxed (`List<Long>`) |
| user type | a `record` whose components are the `.twf` fields as named: `record Result(String status, String trackingId)` |

- **Property names go out as declared**, with no case transform: a record writes its component names, fields are visible whatever their access (`JacksonJsonPayloadConverter.java:80`), and bean getters write too (`getTotal()` → `"total"`; `temporal-developer` `references/java/data-handling.md` § Computed getters). Name each component exactly as the `.twf` field (`trackingId`).
- **A field named for an `Object` method** (`wait`, `notify`, `notifyAll`, `hashCode`, `toString`, `getClass`, `clone`, `finalize`) is not a legal record component: rename it and keep the wire name with `@JsonProperty("wait")`.
- **Several returns** (`-> (A, B)`) are one record of the values.

## Dependency types

The ground truth is the method the activity body will call — verified against the version in `pom.xml`, never trained knowledge.

1. Read the method's declaration in the library's `-sources.jar` or javadoc under `~/.m2/repository/<groupId path>/<artifactId>/<version>/` for its exact parameter and return types. Without it (not yet resolved, offline): the library's published API docs, its source, or the user.
2. Read each parameter type's declaration the same way. Verify every field type — a name misleads.
3. Follow the chain until every type in the call is a primitive or one you recognize.

Resolved means you can write the full call with concrete types, and `./mvnw -B -q test-compile` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's class or encoding crosses the converter (`temporal-developer` `references/java/data-handling.md`) and workflow logic stays free of any one dependency.
