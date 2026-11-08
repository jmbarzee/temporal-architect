# query handler

```twf
query GetStatus() -> (string):
	options:
		description: "Current order status"
	return status
```

```perl
# description: "Current order status" (no Perl form)
method get_status :Query('GetStatus') () { return $status }
```

- A `:Query('Name')` method, always with the `.twf` name ([SKILL.md](../SKILL.md#wire-names)); a plain `method` returning the value; params positional.
- It runs read-only: any call that would emit a command dies with `Temporalio::Exception::ReadOnly`, failing the query (`Workflow/Runner.pm:3756-3765`).
- `description` is **unsupported**: `:Query` takes only a name and `dynamic`, and rejects `unfinished_policy` too (`Workflow/Attributes.pm:44-65`). Leave it out, keep the text as a comment, and tell the user.
