# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external package and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `-- TODO` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The SDK has no default converter: every definition names its codec (`Payload.hs:136-145`). Name `JSON` everywhere — `provideWorkflow JSON …`, `provideActivity JSON …`, `KnownSignal "Name" JSON` — which is Aeson's `encode` and `eitherDecodeStrict'`, tagged `json/plain` with a `messageType` of the Haskell type's name (`Payload.hs:149-182`). Each type maps to what survives that round trip:

| TWF | Haskell |
|-----|---------|
| `string` / `bool` | `Text` / `Bool` |
| `int` | `Int`, 64-bit, exact past 2^53 |
| `float` | `Double`; NaN encodes as `null` and ±∞ as the strings `"+inf"` / `"-inf"`, with no error |
| `decimal` | `Scientific`: the exact value with its scale dropped (`1.10` decodes as `1.1`) |
| `duration` | `Temporal.Duration.Duration`, the type every timeout and timer takes; a payload carries it as a protobuf-JSON string, `"300s"` (`Duration.hs:85-108`). Not `NominalDiffTime`, which goes out as a bare number of seconds |
| `time` | `UTCTime`, an ISO 8601 string in UTC with `Z` |
| `bytes` | `ByteString`, which has no JSON form. A definition whose every argument and result is one takes the `Binary` codec, `binary/plain` (`Payload.hs:209-216`); nested in a record, list or map it is a base64 `Text` you encode and decode |
| `any` | `Data.Aeson.Value` |
| `list[T]` / `map[string, V]` | `[T]` / `Map Text V` |
| user type | a record deriving `Generic`, with `FromJSON` and `ToJSON` by `DeriveAnyClass`: `data Result = Result { status :: Text, trackingId :: Text }` |

- **Field names go out as declared**, with no case transform: name each field as the `.twf` field (`trackingId` → `trackingId`). Two records sharing a field name need `DuplicateRecordFields`, as the corpus enables (`corpus/corpus.cabal`). A field that clashes with a definition's value name, as `Report`'s `count` does with the `count` activity, needs `NoFieldSelectors` in that module, as the corpus turns on in `corpus/concurrency/haskell/Batch.hs`.
- **Several returns** (`-> (A, B)`) are one record of the values. Never a tuple: Aeson writes one as a JSON array.
- **No DSL return type** → `()`.

## Dependency types

The ground truth is the function the activity body will call — verified against the version cabal resolved (`cabal.project.freeze`, else `dist-newstyle/cache/plan.json`), never trained knowledge.

1. Read the function's type in that version's haddock on Hackage, or its source (`cabal get <package>-<version>`). Without them (offline, not yet resolved): `:type` and `:info` in `cabal repl`, or the user.
2. Read each argument type's declaration the same way. Verify every field type — a name misleads.
3. Follow the chain until every type in the call is a primitive or one you recognize.

Resolved means you can write the full call with concrete types, and `cabal build all` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's type or instances cross the codec ([idioms.md § data](./idioms.md#data)) and workflow logic stays free of any one dependency.
