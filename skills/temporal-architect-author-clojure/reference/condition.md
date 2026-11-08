# condition

| DSL | Clojure |
|-----|---------|
| `state:` `condition jobReady` | `(let [job-ready (atom false)] …)` in the `defworkflow` body |
| `set jobReady` / `unset jobReady` | `(reset! job-ready true)` / `(reset! job-ready false)` |
| `await jobReady` | `(w/await #(deref job-ready))` |

- `w/await` (`src/temporal/workflow.clj:33-38`) re-checks its predicate on every state transition, so the predicate only reads.
- The predicate must return a boolean: a `nil` throws and the workflow task retries forever ([await-one.md](./await-one.md)). Start the atom at `false`, never `nil`.
- A condition as an `await one:` case, a bounded wait included, → its `@job-ready` in the race's predicate ([await-one.md](./await-one.md#cases)), not `(w/await d pred)`.
