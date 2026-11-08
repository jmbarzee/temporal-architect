# idioms

Temporal's `temporal-developer` skill does not cover Perl. How to write Perl Temporal code well is sdk-perl's own README and POD at `55816a1`; read the section for the topic, never a copy of it here.

| Topic | sdk-perl `55816a1` |
|---|---|
| worker setup | [§ Running a Worker](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#running-a-worker), [§ Workers](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#workers); every option in the [`Worker.pm` POD](https://github.com/MasonEgger/sdk-perl/blob/55816a1/sdk/lib/Temporalio/Worker.pm#L1249) |
| testing | [§ Testing](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#testing), [§ Replay](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#replay); there is no time-skipping environment ([§ Not yet supported](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#not-yet-supported)) |
| determinism | [§ Workflow logic constraints](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#workflow-logic-constraints), [§ Deterministic time, randomness, and logging](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#deterministic-time-randomness-and-logging) |
| errors | [§ Workflow exceptions](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#workflow-exceptions), [§ Heartbeating and cancellation](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#heartbeating-and-cancellation) |
| data | [§ Data conversion](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#data-conversion); what the default converter writes for each `.twf` type is [types.md](./types.md) |
| versioning | [§ Versioning (patching)](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#versioning-patching); worker versioning only in the [`Worker.pm` POD](https://github.com/MasonEgger/sdk-perl/blob/55816a1/sdk/lib/Temporalio/Worker.pm#L1300) and [worker.md](./worker.md#versioning-not-11) |

## Perl traps

The few that generated code hits, each a silent or misleading failure:

- **Every workflow, activity and Nexus module opens with the same header.** `class` and `async`/`await` are not on by default:

  ```perl
  use v5.38;
  use feature 'class';
  no warnings 'experimental::class';
  use Future::AsyncAwait;
  ```

- **One attributed class per file.** A second `class` with attributed methods in one file fails to compile with an error pointing at the wrong line (`README.md:537-553`). Each workflow, activity class, Nexus service and test fixture is its own `.pm`.
- **`Temporalio::Workflow::sleep`, always fully qualified.** A bare `sleep` is the builtin, which the determinism guard rejects inside a workflow (`Workflow/DeterminismGuard.pm:104-105`).
- **Booleans as `!!$x`.** A plain `1` goes out as the JSON number `1`, and a top-level `JSON::PP::true` is rejected (`Converter/Payload/Json.pm:31`); `!!$x` (or `\1` / `\0`) goes out as `true` / `false`.
- **`dynamically`, not `local`, across an `await`.** `local` dies across a suspension under `Future::AsyncAwait` (`Activity/Context.pm:18-19`); use `Syntax::Keyword::Dynamically` (`README.md:838-839`).
