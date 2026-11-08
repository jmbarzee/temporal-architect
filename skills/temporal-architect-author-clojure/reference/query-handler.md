# query handler

```twf
query GetStatus() -> (string):
	return status
```

```clojure
;; in the defworkflow body:
(w/register-query-handler!
 (fn [query-type _]
   (case query-type
     :GetStatus @status)))
```

- **One** `w/register-query-handler!` per workflow, dispatching every query by `case` on its keyword name (`src/temporal/workflow.clj:106-138`, `:135`). It registers sdk-java's one dynamic query handler, and a second registration silently replaces the first (sdk-java `internal/sync/QueryDispatcher.java:122-124`).
- Params travel as one map, none as `{}`, as for a [signal](./signal-handler.md) (#438). The handler reads state and never blocks.
- `description`: `w/register-query-handler!` keeps sdk-java's default, so a design that sets it registers its own `(reify DynamicQueryHandler (handle …) (getDescription …))` (sdk-java `workflow/DynamicQueryHandler.java:22`) through `Workflow/registerListener`, as for a [signal](./signal-handler.md#handler-options). `unfinished_policy` does not apply to a read-only handler. Queries: [`doc/workflows.md` § Temporal Queries](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#temporal-queries).
