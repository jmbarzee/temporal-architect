# types

Types come from two sources: **defined types**, whose shape the `.twf` gives you, and **dependency types**, whose shape is fixed by an external package and discovered at the call site.

## Defined types

Collect every constructor site and field access across the `.twf` before defining a type — each use may reveal different fields. Resolve in priority order:

1. **Explicit signatures** — workflow/activity params and returns name the type.
2. **Constructors** — `Result{status: "completed", trackingId: r.trackingId}` gives fields, typed from the assigned values.
3. **Field access** — `order.items` implies `Order.items`, typed from its usage context.
4. **Generate** — only application-specific types with no existing match.

A field whose type stays ambiguous gets a `// TODO` and a question to the user.

The `.twf` type names are defined in `twf spec workflows` (Types). The default data converter sends a top-level `Bytes` as `binary/plain` and everything else through `JsonConverter` with `JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION` (`DataConverter/DataConverter.php:36-44`, `DataConverter/BinaryConverter.php:27-34`, `DataConverter/JsonConverter.php:35`), so each type maps to what survives that round trip:

| TWF | PHP |
|-----|-----|
| `string` / `bool` | `string` / `bool` |
| `int` | `int`, exact across its 64-bit range |
| `float` | `float`, written with its `.0`. A top-level `float` parameter rejects a JSON whole number (`1`) with a `DataConverterException` (`JsonConverter.php:103-108`); a DTO property accepts it. NaN and ±∞ throw at encode |
| `decimal` | `string` (`"1.10"`): exact, scale kept. The converter has no decimal type |
| `duration` | a `\DateInterval` property inside a DTO, written as integer nanoseconds and decoded as a `CarbonInterval` (`Internal/Marshaller/Type/DateIntervalType.php:30,69-88,99-102`). Never a top-level `\DateInterval` argument or result: it encodes as `[]`. Options and timers take it as in [options.md](./options.md) |
| `time` | `\DateTimeImmutable`, RFC3339 with its offset; sub-seconds are dropped (`JsonConverter.php:59`, `Internal/Marshaller/Type/DateTimeType.php:40,76-84`) |
| `bytes` | top-level, `Temporal\DataConverter\Bytes` (`binary/plain`); nested in a DTO, list or map, a base64 `string`: a `Bytes` property encodes as `[]` |
| `any` | `mixed`: a JSON object decodes as `\stdClass` (`JsonConverter.php:93-94`) |
| `list[T]` / `map[string, V]` | `array`, typed `list<T>` / `array<string, V>` in PHPDoc. An empty map goes out as `[]` |
| user type | a `final class` with typed public properties: `final class Result { public function __construct(public string $status, public string $trackingId) {} }` |

- **Property names go out as declared** (`Internal/Marshaller/Mapper/AttributeMapper.php:124`): name each property as the `.twf` field (`trackingId`); `#[Marshal(name: 'x')]` renames one.
- **A DTO is decoded without its constructor** (`JsonConverter.php:239-245`): a constructor default never fills a missing field. Adding a field later: `temporal-developer` [`data-handling.md` § Typed Inputs and Results](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/data-handling.md#typed-inputs-and-results).
- **A list of user types inside a DTO** decodes as plain arrays unless the property carries `#[MarshalArray(of: Item::class)]` (`Internal/Marshaller/Meta/MarshalArray.php:28`).
- **Several returns** (`-> (A, B)`) are one DTO of the values.
- **A workflow returns through `#[ReturnType(T::class)]`**: its method is a generator, which cannot declare `T` (`Workflow/ReturnType.php:24`; [workflow-def.md](./workflow-def.md)).

## Dependency types

The ground truth is the method the activity body will call — verified against the version `composer.lock` pins, never trained knowledge.

1. Read the method's declaration under `vendor/<vendor>/<package>/` for its exact parameter and return types, from its PHPDoc where the declaration is untyped. Without it (not yet installed, offline): the package's published API docs, its source, or the user.
2. Read each parameter type's declaration the same way. Verify every field type — a name misleads.
3. Follow the chain until every type in the call is a primitive or one you recognize.

Resolved means you can write the full call with concrete types, and `vendor/bin/phpstan analyse` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no dependency's class or encoding crosses the data converter (`temporal-developer` [`data-handling.md`](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/data-handling.md)) and workflow logic stays free of any one dependency.
