# close

| DSL | PHP |
|-----|-----|
| `close complete(Result{status: "done"})` | `return new Result('done');` |
| `close complete` (no return type) | `return;` |
| `close fail(OrderResult{status: "cancelled"})` | `throw new ApplicationFailure('order cancelled', 'OrderCancelled', true, EncodedValues::fromValues([new OrderResult('cancelled')]));` |
| `close continue_as_new(userId, user)` | `return yield Workflow::continueAsNew('UserEntity', [$userId, $user]);` — same workflow, new args |

- `ApplicationFailure` is `Temporal\Exception\Failure\ApplicationFailure` (`Exception/Failure/ApplicationFailure.php:44-63`): message, type, non-retryable, details as a `ValuesInterface`. Never an `\Error`: the default exception interceptor treats it as retryable, so it fails the workflow task, which retries, not the run (`Exception/ExceptionInterceptor.php:30-33`).
- `Workflow::continueAsNew(type, args, options?)` (`Workflow.php:663-670`) ends the run; its first argument is the workflow's wire name. It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs. `Workflow::newContinueAsNewStub(UserEntity::class)` (`:707`) is the typed form.
- Retryable vs non-retryable errors: `temporal-developer` [`error-handling.md` § Application Errors](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/error-handling.md#application-errors), [§ Workflow Failure](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/error-handling.md#workflow-failure); continuing: [`patterns.md` § Continue-as-New](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#continue-as-new).
