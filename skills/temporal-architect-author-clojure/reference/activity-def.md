# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```clojure
(ns orders.activities
  (:require [orders.validator :as validator]
            [temporal.activity :refer [defactivity]]))

(defactivity ValidateOrder
  [{:keys [validator]} {:keys [order]}]
  (validator/validate validator order))
```

- A `defactivity` var named as the `.twf` names it, which is its registered name ([SKILL.md](../SKILL.md#wire-names)). It takes two arguments: the worker's `:ctx`, then the map of the `.twf` params (`src/temporal/activity.clj:255-265`, `src/temporal/internal/activity.clj:115-122`). The body's value is the result; no DSL return type → `nil`.
- **Dependencies come from `:ctx`**, the one value the worker passes to every activity it runs (`src/temporal/client/worker.clj:19,28`): a map of the clients the activities need, built by the worker process ([worker.md](./worker.md)) and by each test. Never reach a dependency through a global.
- A body that returns a `core.async` channel completes the activity with the channel's one value later; a `Throwable` on it fails the activity (`src/temporal/internal/activity.clj:97-109`; [`doc/activities.md` § Asynchronous Mode](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/activities.md#asynchronous-mode)).
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity through a heartbeat or its cancellation token: [`doc/activities.md` § Cancellation](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/activities.md#cancellation).

## Activity implementation pattern

Generate all four pieces:

1. **The `:ctx` map** — one key per external dependency, built once by the worker process.
2. **Activities** — thin translation: validate input, call the dependency, translate output.
3. **Dependency functions** — shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real library integration: client construction, request/response conversion, error handling.

Activities and dependency functions are mechanical; concrete implementations need the library knowledge from dependency resolution.
