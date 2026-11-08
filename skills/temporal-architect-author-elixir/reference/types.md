# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external library and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `# TODO` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The default converter tries `binary/plain`, then `json/plain`, then `binary/erlang` on each payload, and takes the first that encodes it (`client/temporal_sdk_client_opts.erl:12-37`, `utils/temporal_sdk_utils_proto_converter.erl:139-170`). Any binary goes as `binary/plain` raw bytes (`codec/payload/temporal_sdk_codec_payload_binary.erl:25-27`); the rest goes through OTP's `json` module (`codec/payload/temporal_sdk_codec_payload_json.erl:60-81`), and what it rejects falls to `binary/erlang`, the Erlang term format (ETF), which no other SDK reads (`codec/payload/temporal_sdk_codec_payload_erl.erl:34-37`). So each type maps to what survives that round trip:

| TWF | Elixir |
|-----|--------|
| `string` | a binary, `"abc"`; it travels `binary/plain`, not as a JSON string, and a JSON string from another SDK decodes to a binary |
| `bool` / `int` / `float` | `true` / an integer, exact at any size / a float |
| `decimal` | a decimal string by convention, `"10.25"`: the stdlib has no decimal |
| `duration` | an integer of milliseconds by convention, the unit of the SDK's own times (`temporal_sdk/temporal_sdk.erl:130-135`), or an ISO-8601 string |
| `time` | an ISO-8601 string by convention, `DateTime.to_iso8601(t)`: a `DateTime` holds a tuple, so it would fall to ETF |
| `bytes` | a binary; at the top level it travels `binary/plain` raw, but nested in a map or list it must be base64, `Base.encode64(b)`: a non-UTF-8 binary there sends the whole payload to ETF |
| `any` | the decoded JSON term |
| optional `T?` | `T` or `:null`, never `nil`: `nil` is an atom, so it encodes as the string `"nil"`, while JSON `null` decodes as `:null` |
| `list[T]` / `map[string, V]` | a list / a map with string keys: keys decode as binaries, so atom keys do not survive the round trip |
| user type | a map with the `.twf` fields as string keys, as named: `%{"status" => "done", "trackingId" => id}` |

- **Property names go out as written**, with no case transform: name each key exactly as the `.twf` field (`"trackingId"`).
- **Avoid structs and tuples on the wire.** A tuple, and a struct holding one (`DateTime`), falls to ETF. Any other struct encodes as JSON with an extra `"__struct__"` key and decodes as a plain map.
- **Several returns** (`-> (A, B)`) are one map of the values.
- `:null`, `nil` and the struct rule follow OTP's [`json`](https://www.erlang.org/doc/apps/stdlib/json.html) encoder and decoder defaults, which the codec calls unchanged.

## Dependency types

The ground truth is the function the activity body will call — verified against the version in `mix.lock`, never trained knowledge.

1. Read the function's `@spec` and docs in its source under `deps/<name>/` after `mix deps.get`, or on hexdocs at the locked version. Without them: the library's source repository, or the user.
2. Read each argument type's definition the same way (`@type`, `defstruct`). Verify every field — a name misleads.
3. Follow the chain until every type in the call is a built-in or one you recognize.

Resolved means you can write the full call with concrete types, and `mix compile` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no library struct crosses the converter, where it would travel as ETF or with a `"__struct__"` key, and workflow logic stays free of any one dependency.
