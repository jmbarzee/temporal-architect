# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external gem and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `# TODO:` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The default converter sends an `ASCII-8BIT` `String` as `binary/plain` and everything else through `JSON.generate`, decoding with `JSON.parse` and ignoring every type hint (`converters/payload_converter.rb:24-31`, `payload_converter/binary_plain.rb:19-22`, `payload_converter/json_plain.rb:31-57`). `JSON.generate` writes any object it has no JSON form for as its `to_s`, silently, and that string decodes as a `String` (#521 §8). So each type maps to what survives that round trip:

| TWF | Ruby |
|-----|------|
| `string` / `bool` | `String` / `true`, `false` |
| `int` | `Integer`, exact at any size as a JSON number |
| `float` | `Float`; `NaN` and `Infinity` raise `JSON::GeneratorError` |
| `decimal` | `BigDecimal` in code; the payload field is a base-10 `String`, `d.to_s('F')`, read back with `BigDecimal(s)`. A `BigDecimal` itself goes out as its `to_s`, `"0.1e0"` |
| `duration` | a number of seconds (`Integer` or `Float`), the unit in the field's name; every option and `Workflow.sleep` takes seconds too ([options.md](./options.md)). Ruby has no duration type the converter writes: a `Rational` goes out as `"3/2"` |
| `time` | `Time` in code; the payload field is `t.utc.iso8601(9)`, an ISO 8601 UTC `String` to the nanosecond, read back with `Time.iso8601(s)`. A `Time` itself goes out as its `to_s`, `"2026-11-08 12:00:00 UTC"`, with no sub-seconds |
| `bytes` | an `ASCII-8BIT` `String` as a whole argument or result (`binary/plain`); nested in a type, list or map, a Base64 `String`, `[b].pack('m0')`, read back with `s.unpack1('m0')`. Raw nested bytes go out only when they happen to be valid UTF-8, else raise `JSON::GeneratorError` |
| `any` | the decoded JSON value |
| `list[T]` / `map[string, V]` | `Array` / `Hash` with `String` keys: a `Symbol` key comes back a `String` |
| user type | a `Data` with the `.twf` fields as members, written as a JSON object (below) |

`pack('m0')` is core Ruby; the `base64` library is a bundled gem from Ruby 3.4 and needs its own `Gemfile` line.

### User types

```twf
workflow Batch(items: list[string]) -> (Report):
	close complete(Report{count: count, audited: audited, status: status})
```

```ruby
module Concurrency
  # The default JSON converter writes a Data with to_s, so Report writes its
  # fields as a JSON object and a receiver rebuilds it with from_h.
  Report = Data.define(:count, :audited, :status) do
    def to_json(*args) = to_h.to_json(*args)
    def self.from_h(hash) = new(**hash.transform_keys(&:to_sym))
  end
end
```

- **A `Data` goes out as its `to_s`** (`"#<data Report count=2, …>"`) unless it defines `to_json` (#521 §8). `to_json` via `to_h` writes `{"count":2,…}` with the member names byte for byte; `from_h` rebuilds it.
- **Members are named exactly as the `.twf` fields.** The converter applies no case transform, so a `.twf` field `trackingId` is the member `:trackingId`, not `:tracking_id`.
- **The receiver gets a `Hash`**, never the type: the default converter ignores hints. Rebuild with `Report.from_h(hash)` where a value arrives (a workflow or activity param, an activity or child result, a signal arg); a member that is itself a user type is rebuilt by that type's `from_h` in the outer one.
- **A `time`, `decimal` or nested `bytes` member** holds the payload form above, so the `Data` stays JSON-safe; convert at the use site.
- **Several returns** (`-> (A, B)`) are one `Data` of the values.
- The JSON additions (`json/add/struct`, `json_create`) round-trip `Struct`s through a Ruby-only `json_class` key; don't use them for a type another SDK reads. Converter hints and ActiveModel: `temporal-developer` `references/ruby/data-handling.md` § Converter Hints, § ActiveModel Integration.

## Dependency types

The ground truth is the method the activity body will call — verified against the version in `Gemfile.lock`, never trained knowledge.

1. Read the method's definition in the gem's source, at `bundle info --path <gem>`, or its RBS or Sorbet signatures where the gem ships them. Without it (not yet installed, offline): the gem's published API docs, its source repository at that tag, or the user.
2. Read each parameter's expected shape the same way. Ruby declares no types, so follow the method body or its docs to what it reads — a name misleads.
3. Follow the chain until every value in the call is a core type or one you recognize.

Resolved means you can write the full call with concrete values, and `ruby -wc` accepts the file.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no gem's object reaches the converter (where it would go out as its `to_s`) and workflow logic stays free of any one dependency.
