# condition

| DSL | PHP |
|-----|-----|
| `state:` `condition jobReady` | `private bool $jobReady = false;` on the workflow class |
| `set jobReady` / `unset jobReady` | `$this->jobReady = true` / `$this->jobReady = false` |
| `await jobReady` | `yield Workflow::await(fn(): bool => $this->jobReady)` |

- `Workflow::await` (`Workflow.php:313`) takes a callable, re-evaluated after each change; never the evaluated `bool` (`temporal-developer` [`references/php/gotchas.md` § Awaiting an Evaluated Boolean](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#awaiting-an-evaluated-boolean)).
- A closure that reads a local, such as an `await one` timer's `$fired`, captures it by reference: `function () use (&$fired): bool { … }`. An arrow function captures by value ([PHP manual, Arrow Functions](https://www.php.net/manual/en/functions.arrow.php)), so it never sees the change and the wait never ends.
- A condition as an `await one:` case, a bounded wait included, → its `bool` in the race's condition ([await-one.md](./await-one.md#cases)), not `Workflow::awaitWithTimeout`.
