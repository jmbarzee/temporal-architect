# Primitives across SDKs

**This applies only to a call or return that crosses workers whose `@sdk` differ**: a workflow, activity, signal, query, update or Nexus operation whose caller runs on a worker in one SDK and whose handler runs on a worker in another. Otherwise it does not apply; within one SDK, each author maps the `.twf` types by its own SDK's conventions.

The SDKs' default data converters write JSON, but not the same JSON for every `.twf` primitive. `string`, `bool`, `float` and an `int` within ±2^53 cross unchanged, alone or in a `list`, `map` or struct. The types below do not.

## The order

1. **Prefer a codec**: a data converter / payload codec at that boundary, on both sides, that fixes one wire form for the type.
2. Without one, either:
   - (a) **prefer the representation of the SDK with the far bulkier implementation** (the larger workflow ecosystem), so the smaller side adapts; or
   - (b) **convert explicitly** at the call or return that crosses the boundary.

**The check:** a workflow tree or cluster strongly prefers its own language's standards and conventions. The case to avoid is many workflows using an atypical type to handle conversion at a few points.

## Per type

Read from the default converters of Go SDK v1.50.0, TypeScript SDK 1.25.0 and Python SDK 1.35.0; for another SDK, read its converter.

| `.twf` | Hazard |
|---|---|
| `int` past 2^53 | JavaScript decodes a JSON number as a double (the TypeScript converter is `JSON.parse`), exact only to 2^53−1; a larger value (an int64 ID, a nanosecond count) silently rounds. A `bigint` does not serialize at all. |
| `decimal` | `.twf` `decimal` is exact; no default converter carries it exactly. As a JSON number it decodes to a binary double in JavaScript and in any Go `float64`; Python's converter does not encode `decimal.Decimal`. |
| `duration` | No shared form. Go's `time.Duration` encodes as a bare integer of nanoseconds (past 2^53 ns, about 104 days, it also hits the JavaScript `int` hazard); Python's converter does not encode `timedelta`; JavaScript has no duration type. |
| `time` | ISO 8601 strings that disagree. Go encodes RFC 3339 to nanoseconds and rejects a timestamp without an offset; Python writes `datetime.isoformat()` (no offset on a naive `datetime`, microseconds at most); JavaScript writes a `Date` to milliseconds and decodes it as a plain string, not a `Date`. |
| `bytes` | Crosses only as a whole argument or result: every converter sends a top-level byte value raw (`binary/plain`). Nested in a struct, list or map it diverges: Go writes a base64 string, Python a list of ints (and cannot decode a base64 string), JavaScript a `Uint8Array` as an object keyed by index. |
