# await timer

```twf
await timer(5m)
```

```ts
await sleep('5m');
```

- `sleep(ms: Duration)` from `@temporalio/workflow` (`workflow/src/workflow.ts`) takes the `.twf` duration as an `ms` string (`'30s'`, `'5m'`, `'2h'`, `'1d'`) or milliseconds (`common/src/time.ts`). A variable duration passes straight through: `await sleep(backoff)`.
- A cancelled scope rejects it with a `CancelledFailure`: `temporal-developer` `references/typescript/patterns.md` § Cancellation Scopes.
- Inside `await one:` or a `promise`, see [await-one.md](./await-one.md).
