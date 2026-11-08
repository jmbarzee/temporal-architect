# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external crate and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Shipment{status: "sent", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `// TODO` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The default converter sends `()`, `Vec<u8>` and `Option<Vec<u8>>` as whole values as `binary/null` or `binary/plain`, and everything else through `serde_json` (`common-wasm/src/data_converters.rs:250-256,679-703`, `data_converters/well_known.rs:10-48`); every serde type is a payload type (`data_converters.rs:653-669`). So each type maps to what survives that round trip:

| TWF | Rust |
|-----|------|
| `string` / `bool` | `String` / `bool` |
| `int` | `i64`, exact across its range as a JSON number |
| `float` | `f64` |
| `decimal` | `rust_decimal::Decimal` with its `serde` feature: a JSON string that keeps its scale (`"0.10"`), exact (`rust_decimal` `src/serde.rs:533-541`). Its `serde-float` feature writes a number instead (`:544-556`) |
| `duration` | `std::time::Duration`, in a payload and as an option or timer argument; serde writes it as an object, `{"secs":5400,"nanos":0}`, neither a number nor ISO 8601 (`serde_core` `src/ser/impls.rs:685-700`) |
| `time` | `chrono::DateTime<Utc>` with chrono's `serde` feature: an RFC 3339 string with `Z`, to the nanosecond (`chrono` `src/datetime/serde.rs:26-32`). Never `SystemTime`, which serde writes as `{"secs_since_epoch", "nanos_since_epoch"}` (`serde_core` `src/ser/impls.rs:702-713`) |
| `bytes` | `Vec<u8>`; a whole argument or result is `binary/plain`, while nested in a struct, list or map it is a JSON array of integers, as serde writes any slice (`serde_core` `src/ser/impls.rs:175`) |
| `any` | `serde_json::Value`: the decoded JSON tree |
| `list[T]` / `map[string, V]` | `Vec<T>` / `BTreeMap<String, V>`: a `BTreeMap` iterates in key order, where a `HashMap`'s order is seeded per process ([control-flow.md](./control-flow.md)) |
| user type | a `#[derive(Serialize, Deserialize)] pub struct` whose fields are the `.twf` fields: `pub struct Shipment { pub status: String, pub tracking_id: String }` |

- **Property names go out as declared**, with no case transform: serde writes the Rust field names. Write fields in snake_case (rustc's `non_snake_case` lint fails the `-D warnings` verify), and where the `.twf` fields are camelCase put `#[serde(rename_all = "camelCase")]` on the struct, so `tracking_id` travels as the `.twf`'s `trackingId`; a name that rule does not produce takes a field's own `#[serde(rename = "…")]`.
- **A field named for a Rust keyword** (`type`, `match`, `ref`) is a raw identifier, `r#type`; serde writes it without the `r#` (`serde_derive` `src/internals/attr.rs:133,1039`).
- **Several returns** (`-> (A, B)`) are one struct of the values. A tuple `(A, B)` is one payload, a JSON array, never two.
- **Several params** (a workflow's, a signal's or an update's) are one input of `MultiArgsN<A, B, …>`, one payload per param in order, for 2 to 6 (`data_converters.rs:820-877`). A plain tuple converts into it (`:843-848`), so a caller passes `(a, b)`. An activity's params need nothing: its macro builds the `MultiArgsN` ([activity-def.md](./activity-def.md)).

## Dependency types

The ground truth is the function the activity body will call — verified against the version in `Cargo.lock`, never trained knowledge.

1. Read the function's declaration in the crate's source under `~/.cargo/registry/src/*/<crate>-<version>/`, or its docs.rs page for that version, for its exact parameter and return types. Without it (not yet fetched, offline): `cargo doc`, the crate's repository at that tag, or the user.
2. Read each parameter type's declaration the same way. Verify every field type — a name misleads.
3. Follow the chain until every type in the call is a primitive or one you recognize.

Resolved means you can write the full call with concrete types, and `cargo check --all-targets` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's type or serde form crosses the converter, and workflow logic stays free of any one dependency.
