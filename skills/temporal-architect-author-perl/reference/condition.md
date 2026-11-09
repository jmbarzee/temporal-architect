# condition

| DSL | Perl |
|-----|------|
| `state:` `condition jobReady` | `field $job_ready = 0;` on the workflow class |
| `set jobReady` / `unset jobReady` | `$job_ready = 1` / `$job_ready = 0` |
| `await jobReady` | `await Temporalio::Workflow::wait_condition(sub { $job_ready })` |

- `Temporalio::Workflow::wait_condition($predicate)` (`Workflow.pm:358-360`) resolves once the predicate is true, checked at the call and after each activation's signals and other jobs (`Workflow/Runner.pm:2016,2129-2141`).
- A condition as an `await one:` case, a bounded wait included, → its field in the race's predicate ([await-one.md](./await-one.md#cases)), not `wait_condition(…, timeout => $s)`.
