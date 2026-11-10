# types

Defined types resolve as in [author-elixir's types.md](../../temporal-architect-author-elixir/reference/types.md#defined-types): collect every constructor site and field access first, and a field whose type stays ambiguous gets a `%% TODO` and a question to the user.

The default converter is author-elixir's chain: a binary travels `binary/plain`, the rest goes through OTP's `json`, and what it rejects falls to `binary/erlang` (ETF), which no other SDK reads (`client/temporal_sdk_client_opts.erl:12-37`, `codec/payload/temporal_sdk_codec_payload_json.erl:60-81`). Erlang's own idioms for strings, "unset" and records are exactly what that chain mangles, so each type maps to what survives it:

| TWF | Erlang |
|-----|--------|
| `string` | a binary, `~"abc"`, never a charlist: `"abc"` is a list of integers, so it travels as the JSON array `[97,98,99]`, and another SDK receives a list. Erlang decodes the array back to the same charlist, so only the wire shows it. A JSON string from another SDK decodes to a binary |
| `bool` / `int` / `float` | `true` / an integer, exact at any size / a float |
| `decimal` | a decimal binary by convention, `~"10.25"`: the stdlib has no decimal |
| `duration` | an integer of milliseconds by convention, the unit of the SDK's own times (`temporal_sdk/temporal_sdk.erl:130-135`) |
| `time` | an RFC 3339 binary, `list_to_binary(calendar:system_time_to_rfc3339(T, [{unit, millisecond}, {offset, "Z"}]))`: a `calendar` datetime is a tuple, so it would fall to ETF |
| `bytes` | a binary; at the top level it travels `binary/plain` raw, but nested in a map or list it must be base64, `base64:encode(B)`: a non-UTF-8 binary there sends the whole payload to ETF |
| `any` | the decoded JSON term |
| optional `T?` | `T` or `null`, never `undefined`: `undefined` is an atom, so it encodes as the string `"undefined"`, while JSON `null` decodes as `null` |
| `list[T]` / `map[string, V]` | a list / a map with binary keys: keys decode as binaries, so atom keys do not survive the round trip |
| user type | a map with the `.twf` fields as binary keys, as named: `#{~"status" => ~"done", ~"trackingId" => Id}`; never a proplist or a record, which are tuples, so ETF |

- **Property names go out as written**, with no case transform: name each key exactly as the `.twf` field (`~"trackingId"`).
- **Keep tuples off the wire.** A proplist, a record, `{ok, V}` and a `calendar` datetime all fall to ETF.
- **Several returns** (`-> (A, B)`) are one map of the values.
- The charlist, `undefined` and `null` rules follow OTP's [`json`](https://www.erlang.org/doc/apps/stdlib/json.html) encoder and decoder defaults, which the codec calls unchanged.

## Dependency types

The ground truth is the function the activity body will call — verified against the version in `rebar.lock`, never trained knowledge.

1. Read the function's `-spec` and docs in its source under `_build/default/lib/<dep>/` after `rebar3 compile` (`_build/rebar3/default/lib/<dep>/` under the corpus's `base_dir`), or on hexdocs at the locked version. Without them: the library's source repository, or the user.
2. Read each argument type's definition the same way (`-type`, `-record`). Verify every field — a name misleads.
3. Follow the chain until every type in the call is a built-in or one you recognize.

Resolved means you can write the full call with concrete types, and `rebar3 compile` accepts it.

## Serialization boundary

**Keep dependency types inside activity bodies**: signatures use defined types, and the activity converts, so no library record or tuple crosses the converter, where it would travel as ETF, and workflow logic stays free of any one dependency.
