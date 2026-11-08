# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```ruby
module Orders
  class ValidateOrder < Temporalio::Activity::Definition
    def initialize(validator)
      @validator = validator
    end

    def execute(order)
      @validator.validate(Order.from_h(order))
    end
  end
end
```

- One `Temporalio::Activity::Definition` subclass per activity, named as the `.twf` names it, with `activity_name` unset ([SKILL.md](../SKILL.md#wire-names)); `execute` is the body. Params are positional, and a user type arrives as a `Hash` to rebuild with `from_h` ([types.md](./types.md#user-types)); no DSL return type → `nil`.
- **Register an instance when the activity has dependencies.** The worker calls `execute` on that one instance for every execution; given the class, it builds a new instance per execution with no arguments (`activity/definition.rb:8-10,185-196`). Activities run on a thread pool by default, so an instance's dependencies serve concurrent calls (`temporal-developer` `references/ruby/advanced-features.md` § Activity Concurrency and Executors).
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats: `temporal-developer` `references/ruby/gotchas.md` § Not Handling Activity Cancellation.

## Activity Implementation Pattern

Generate all four pieces:

1. **Activity class** — one `initialize` parameter per external dependency; the worker factory registers an instance ([worker.md](./worker.md)).
2. **`execute`** — thin translation: rebuild the input, call the dependency, translate the output into a defined type.
3. **Dependency interface** — the methods the activities call on it, shaped by what they need and informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)); a test passes its own object with the same methods.
4. **Concrete implementations** — the real gem integration: client construction, request/response conversion, error handling.

`execute` and the interface are mechanical; concrete implementations need the library knowledge from dependency resolution.
