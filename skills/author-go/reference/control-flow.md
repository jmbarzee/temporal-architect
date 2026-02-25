# control flow

## if / else

### DSL

```twf
if (validated.priority == "high"):
    activity ExpediteOrder(order)
else:
    activity StandardProcessing(order)
```

### Go

```go
if validated.Priority == "high" {
    err := workflow.ExecuteActivity(ctx, ExpediteOrder, order).Get(ctx, nil)
    if err != nil {
        return Result{}, err
    }
} else {
    err := workflow.ExecuteActivity(ctx, StandardProcessing, order).Get(ctx, nil)
    if err != nil {
        return Result{}, err
    }
}
```

## for (iteration)

### DSL

```twf
for (item in order.items):
    activity ProcessItem(item)
```

### Go

```go
for _, item := range order.Items {
    err := workflow.ExecuteActivity(ctx, ProcessItem, item).Get(ctx, nil)
    if err != nil {
        return Result{}, err
    }
}
```

## for (conditional)

### DSL

```twf
for (retries < maxRetries):
    activity Attempt(data)
    retries = retries + 1
```

### Go

```go
for retries < maxRetries {
    err := workflow.ExecuteActivity(ctx, Attempt, data).Get(ctx, nil)
    if err != nil {
        return Result{}, err
    }
    retries++
}
```

## for (infinite loop)

### DSL

```twf
for:
    # body
    if (done):
        break
```

### Go

```go
for {
    // body
    if done {
        break
    }
}
```

## switch

### DSL

```twf
switch (phase):
    case "draft":
        # ...
    case "approved":
        # ...
    else:
        # ...
```

### Go

```go
switch phase {
case "draft":
    // ...
case "approved":
    // ...
default:
    // ...
}
```

## Notes

- `break` → `break`, `continue` → `continue` — direct mapping
- DSL `else:` in switch → Go `default:`
- DSL boolean operators: `and` → `&&`, `or` → `||`, `not` → `!`
- All condition expressions (`if`, `for`, `switch`) must be deterministic — no `time.Now()`, `rand`, or non-deterministic function calls. See [workflow-def.md](./workflow-def.md) for the full constraint list

## When to use: sequential vs parallel iteration

- **Sequential** (`.Get()` inside loop): each iteration waits for the previous to complete. Use when order matters or when items depend on prior results
  ```go
  for _, item := range items {
      err := workflow.ExecuteActivity(ctx, Process, item).Get(ctx, nil)
      // blocks here — next iteration starts after this one completes
  }
  ```
- **Parallel** (collect futures, `.Get()` after loop): all iterations start concurrently. Use when items are independent
  ```go
  var futures []workflow.Future
  for _, item := range items {
      futures = append(futures, workflow.ExecuteActivity(ctx, Process, item))
  }
  for _, f := range futures {
      if err := f.Get(ctx, nil); err != nil { ... }
  }
  ```
- The DSL does not distinguish these — infer from context. If unsure, ask the user

## Pitfalls

- **Manual retry loops** (the `for (retries < max)` pattern) are almost always inferior to SDK `RetryPolicy` on `ActivityOptions`. Use `RetryPolicy` for standard retry logic; reserve manual loops for non-standard control flow (e.g., retry with modified input, conditional retry based on error type)
