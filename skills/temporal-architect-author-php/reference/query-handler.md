# query handler

```twf
query GetStatus() -> (string):
	options:
		description: "Current order status"
	return status
```

```php
#[QueryMethod(name: 'GetStatus', description: 'Current order status')]
public function getStatus(): string
{
    return $this->status;
}
```

- A public `#[QueryMethod(name: '…')]` method returning its declared type; params positional.
- `description:` is its only option (`Workflow/QueryMethod.php:38-41`): `unfinished_policy` does not apply to a read-only handler.
- A query is read-only and never `yield`s: `temporal-developer` [`references/php/patterns.md` § Queries](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#queries).
