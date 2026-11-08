# close

| DSL | Clojure |
|-----|---------|
| `close complete(Result{status: "done"})` | the body's last value: `{:status "done"}` |
| `close complete` (no return type) | `nil` |
| `close fail(OrderResult{status: "cancelled"})` | `(throw+ {:type :OrderCancelled :result {:status "cancelled"}})` |
| `close continue_as_new(next, limit)` | `(w/continue-as-new {:count next :limit limit})` — same workflow, new params |

- A `defworkflow` body has no early return: a `close` mid-body is the value of its branch (`if`, `cond`), as the corpus's `Counter`.
- `throw+` is `clj-commons.slingshot`'s. The SDK turns an uncaught stone into an `ApplicationFailure` of type `"slingshot"` carrying the stone, which fails the run (`src/temporal/internal/workflow.clj:119-121`, `src/temporal/internal/exceptions.clj:17-38`); `::e/non-retriable? true` in the stone makes it non-retryable ([`doc/workflows.md` § Exceptions](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#exceptions)). An `ex-info` with non-empty data is the same stone (`clj-commons/slingshot` 0.13.0 `support.clj:41-49`). A slingshot parent's `try+` catches the stone back ([workflow-call.md](./workflow-call.md)). Any other `Throwable` is rethrown as is, and one that is not a `TemporalFailure` fails the workflow task, which retries ([author-java](../../temporal-architect-author-java/reference/close.md)).
- `w/continue-as-new` never returns: it ends this run and starts the next with the same workflow ID (`src/temporal/workflow.clj:342-380`); its optional second argument is a map of the new run's options. For a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs; continue-as-new: [`doc/workflows.md` § Continue-As-New](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#continue-as-new).
