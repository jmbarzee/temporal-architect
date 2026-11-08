# await all

```twf
await all:
	activity Count(items) -> count
	workflow Audit(items) -> audited
```

```rust
let (count, audited) = join!(
    ctx.execute_activity(BatchActivities::count, items.clone(), activity_options()),
    async {
        let audit = ctx.start_child_workflow(Audit::run, items.clone(), child_options(ctx)).await?;
        Ok::<_, WorkflowTermination>(audit.result().await?)
    },
);
let (count, audited) = (count?, audited?);
```

- `temporalio_sdk::workflows::join!` over every branch, whatever its kind, polled in declaration order (`crates/workflow/src/workflows.rs:72-90`); a branch of several steps is an `async` block. This is the corpus's `Batch` ([`batch.rs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/rust/src/batch.rs)).
- `join!` waits for every branch, failed or not; each result is then `?`-checked. Never `tokio::join!` or `futures::join!` in workflow code (`crates/sdk/README.md:244-250`).
- A `detach` call's branch awaits only its start ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```rust
let results = join_all(items.iter().map(|item| {
    ctx.execute_activity(BatchActivities::process_batch_item, item.clone(), activity_options())
}))
.await;
for r in results {
    r?;
}
```

`temporalio_sdk::workflows::join_all` returns the results in input order (`crates/workflow/src/workflows.rs:103-129`).
