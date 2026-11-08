# close

| DSL | Perl |
|-----|------|
| `close complete(Result{status: "done"})` | `return { status => 'done' };` |
| `close complete` (no return type) | `return;` |
| `close fail(OrderResult{status: "cancelled"})` | `Temporalio::Exception::Application->throw(message => 'order cancelled', type => 'OrderCancelled', details => [{ status => 'cancelled' }]);` |
| `close continue_as_new(userId, user)` | `Temporalio::Workflow::continue_as_new(undef, args => [$user_id, $user]);` — same workflow, new args |

- `Temporalio::Exception::Application` (`Exception/Application.pm:10-15`) takes `message`, `type`, `non_retryable` and `details`, an arrayref. Only a `Temporalio::Exception` fails the run: a plain `die` fails the workflow task, which retries (`Workflow/Runner.pm:4087-4094`, `README.md:780-791`).
- `Temporalio::Workflow::continue_as_new($type, %opts)` never returns: it dies with a control signal that ends the run (`Workflow.pm:492-499`); `undef` keeps the current workflow type (`:503`). It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Retryable vs non-retryable errors: sdk-perl `README.md` § Workflow exceptions (`:763-827`).
