# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external package and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `# TODO` and a question to the user. Fields are snake_case attributes (`trackingId` → `tracking_id`); JSON carries the attribute name unchanged.

The `.twf` type names are defined in `twf spec workflows` (Types). The default payload converter sends a whole `bytes` argument or result as `binary/plain` and everything else through `json`, decoding by the parameter's type hint (`AdvancedJSONEncoder`, `value_to_type`: `temporalio/converter/_payload_converter.py:659,816`), so each type maps to what survives that round trip:

| TWF | Python |
|-----|--------|
| `string` / `bool` / `float` | `str` / `bool` / `float` |
| `any` | `Any` |
| `int` | `int`, arbitrary precision: `json` writes and reads any integer exactly |
| `decimal` | `str` holding the base-10 text; the converter raises `TypeError` on a `Decimal` |
| `duration` | a number in a payload, its unit in the field name (`timeout_seconds: float`); the converter raises `TypeError` on a `timedelta`. An option or timer argument takes a `timedelta` |
| `time` | an aware `datetime`: it encodes as `isoformat()` and decodes back only where the hint says `datetime`; under `Any` it stays a `str` |
| `bytes` | `bytes`: raw as a whole argument or result; nested in a dataclass, list or dict, a JSON list of ints that the hint decodes back |
| `list[T]` / `map[string, V]` | `list[T]` / `dict[str, V]` |
| user type | a `@dataclass`: encoded by `dataclasses.asdict`, rebuilt from the hint |

A project already on `pydantic_data_converter` keeps `Decimal` and `timedelta`: `temporal-developer` `references/python/data-handling.md` § Pydantic Integration.

## Dependency types

The ground truth is the method the activity body will call — verified against the version in `uv.lock`, never trained knowledge.

1. Read the method's signature in the package's source or `.pyi` stubs under `.venv/lib/python3.*/site-packages/` for its exact parameter and return types. Without it (not yet installed, untyped package, offline): the package's published source, its docs, or the user.
2. Read each parameter type's definition the same way. Verify every field type — a name misleads (a `tools` field may take a union, not the type the name suggests).
3. Follow the chain until every type in the call is a primitive or one you recognize.

Resolved means you can write the full call with concrete types, and `uv run --locked mypy .` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's class or encoding crosses the payload converter (`temporal-developer` `references/python/data-handling.md`) and workflow logic stays free of any one dependency.
