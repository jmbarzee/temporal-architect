# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`await` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```ts
const handleA = ProcessA(items.a);
handleA.catch(() => {}); // fails at the await below, not before
// ... do other work ...
const resultA = await handleA;
```

| `promise p <- …` | TypeScript |
|------------------|------------|
| `activity` / `workflow` | the proxy call's or `executeChild`'s un-awaited `Promise`; a child the design also signals is `await startChild(…)`, whose `.result()` is the promise ([signal-send.md](./signal-send.md)) |
| `timer(5m)` | `sleep('5m')` |
| `nexus …` | `client.executeOperation(…)` |
| `signal Approve` / `update Review` | `approves.take()` |

- A promise that rejects before its `await` is an unhandled rejection, which fails the workflow task (`setUnhandledRejectionHandler`, `worker/src/workflow/vm-shared.ts`). The `.catch(() => {})` marks it handled; the `await` still throws.
- A promise on a signal or update begins waiting at its binding, not at its `await`: `take` draws its ticket from the message's `Arrivals` when called ([await-signal.md](./await-signal.md)), as the corpus's `const approval = approves.take()` does.
- In `await one:`, a promise is a settled-flag case ([await-one.md](./await-one.md#cases)).
