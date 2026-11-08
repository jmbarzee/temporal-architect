# close

| DSL | TypeScript |
|-----|------------|
| `close complete(Result{status: "done"})` | `return { status: 'done' };` |
| `close complete` (no return type) | `return;` |
| `close fail(OrderResult{status: "cancelled"})` | `throw ApplicationFailure.create({ message: 'order cancelled', type: 'OrderCancelled', details: [{ status: 'cancelled' }] });` |
| `close continue_as_new(userId, user)` | `await continueAsNew<typeof UserEntity>(userId, user);` — same workflow, new args |

- `ApplicationFailure` and `continueAsNew` come from `@temporalio/workflow` (`common/src/failure.ts`, `workflow/src/workflow.ts`).
- `continueAsNew` never returns: it throws to end the run. It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Retryable vs non-retryable errors: `temporal-developer` `references/typescript/error-handling.md` § Application Failures, § Workflow Failure.
