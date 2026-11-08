# query handler

```twf
query GetStatus() -> (string):
	options:
		description: "Current order status"
	return status
```

```ts
export const GetStatus = defineQuery<string>('GetStatus');

// in the workflow function, before its first await:
setHandler(GetStatus, () => status, { description: 'Current order status' });
```

- `defineQuery<Ret, [params]>(name)` (`workflow/src/workflow.ts`); the handler is synchronous, params positional.
- `QueryHandlerOptions {description}` (`workflow/src/interfaces.ts`) is the only option: `unfinished_policy` does not apply to a synchronous, read-only handler.
- A query is read-only and never blocks: `temporal-developer` `references/typescript/patterns.md` § Queries.
