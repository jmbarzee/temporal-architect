# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external package and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `// TODO` and a question to the user. Field names are the `.twf`'s, as written: JSON carries the property name unchanged.

The `.twf` type names are defined in `twf spec workflows` (Types). The default payload converter sends a whole `Uint8Array` argument or result as `binary/plain` and everything else through `JSON.stringify`/`JSON.parse` (`common/src/converter/payload-converter.ts`), so each type maps to what survives that round trip:

| TWF | TypeScript |
|-----|------------|
| `string` / `bool` / `float` | `string` / `boolean` / `number` |
| `any` | `unknown` |
| `int` | `number`, exact to 2^53−1 (`Number.MAX_SAFE_INTEGER`); a `bigint` throws in `JSON.stringify` |
| `decimal` | `string` holding the base-10 text; the SDK has no decimal type, and the spec's mapping is open (#401) |
| `duration` | a `number` of milliseconds in a payload; an option or timer argument takes the SDK's `Duration`, `'5m'` or milliseconds (`common/src/time.ts`) |
| `time` | an ISO 8601 `string`: a `Date` encodes as one but decodes as a `string`, so a `Date` type lies |
| `bytes` | `Uint8Array` as a whole argument or result; a base64 `string` when nested in an interface, list or map, where a `Uint8Array` decodes as an index-keyed object |
| `list[T]` / `map[string, V]` | `T[]` / `Record<string, V>` |
| user type | an `interface`: data only, since a class instance decodes as a plain object |

## Dependency types

The ground truth is the method the activity body will call — verified against the version in `package.json`, never trained knowledge.

1. Read the method's declaration in the package's `.d.ts` under `node_modules/` for its exact parameter and return types. Without it (not yet installed, untyped package, offline): the package's published types, its source, or the user.
2. Read each parameter type's declaration the same way. Verify every field type — a name misleads (a `tools` field may take a union, not the type the name suggests).
3. Follow the chain until every type in the call is a primitive or one you recognize.

Resolved means you can write the full call with concrete types, and `npx tsc --noEmit` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's class or encoding crosses the payload converter (`temporal-developer` `references/typescript/data-handling.md`) and workflow logic stays free of any one dependency.
