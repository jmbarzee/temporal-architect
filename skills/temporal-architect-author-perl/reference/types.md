# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external module and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `# TODO` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The default payload converter sends a `Temporalio::Payload::RawBytes` as `binary/plain`, `undef` as `binary/null`, and everything else through `JSON::PP` with `canonical(1)->allow_blessed(0)` (`Converter/Payload.pm:23-35`, `Converter/Payload/Json.pm:23-24`). It takes only plain scalars, hashrefs, arrayrefs and scalar refs (`Json.pm:29-36`): any blessed value — a `class` instance, `DateTime`, `Math::BigFloat` — is rejected with "no payload converter handled a value" (`Converter/Payload.pm:51`). So each type maps to plain data:

| TWF | Perl |
|-----|------|
| `string` | a scalar. A string scalar once used as a number goes out as a JSON number |
| `bool` | `!!$x` (or `\1` / `\0`); it decodes as a `JSON::PP::Boolean`. A plain `1` goes out as a number, and a top-level `JSON::PP::true` is rejected (blessed) |
| `int` | a scalar, exact across the 64-bit range; a JSON integer past 2^63 decodes as a rounded float |
| `float` | a scalar; NaN and ±Inf go out as invalid JSON that fails to decode |
| `decimal` | a string (`"1.10"`): a number loses its scale (`1.10` goes out `1.1`), JSON numbers decode as doubles, and `Math::BigFloat` is rejected |
| `duration` | seconds, a number (fractional allowed), in a payload and as an option or timer argument |
| `time` | an ISO 8601 string. `Temporalio::Workflow::now` returns a `DateTime` (`Workflow.pm:57-63`): format it before it crosses |
| `bytes` | `Temporalio::Payload::RawBytes->new(bytes => $b)` as a whole argument or result only (`Converter/Payload/BinaryPlain.pm:18-33`); it decodes to a plain byte string. A bare byte string is text, so bytes nested in a hash go out as code points, not base64: base64 them by hand |
| `any` | any decoded JSON value |
| `list[T]` / `map[string, V]` | an arrayref / a hashref |
| user type | a hashref keyed by the `.twf` field names as written: `{ status => 'done', trackingId => $t }` |

- **Hash keys go out as written**, sorted (`canonical`), and decode as written: never rename a field to snake_case.
- **Several returns** (`-> (A, B)`) are one arrayref of the values: a result is one payload.
- **Arguments are positional**, one payload per element of `args => [...]`.

## Dependency types

The ground truth is the method the activity body will call — verified against the version the `cpanfile` requires (or `cpanfile.snapshot`), never trained knowledge.

1. Read the method in the installed module: `perldoc Module::Name` for its POD, `perldoc -l Module::Name` for its source. Without it (not yet installed, offline): its MetaCPAN page at that version, its repository, or the user.
2. Read what each argument and return value holds the same way — a hashref's keys, an object's accessors. Verify every field — a name misleads.
3. Follow the chain until every value in the call is plain data or a class you recognize.

Resolved means you can write the full call with concrete arguments, and a test that exercises it passes.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's object crosses the payload converter (which rejects it) and workflow logic stays free of any one dependency.
