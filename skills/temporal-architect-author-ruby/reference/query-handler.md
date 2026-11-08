# query handler

```twf
query GetStatus() -> (string):
	options:
		description: "Current order status"
	return status
```

```ruby
workflow_query name: 'GetStatus', description: 'Current order status'
def status
  @status
end
```

- `workflow_query name: '…'` on an explicit method (`workflow/definition.rb:168-180`), never `workflow_query_attr_reader`, which takes no `name:` (the SKILL's Wire names); params positional.
- `description` is the only keyword the `.twf` maps: `unfinished_policy` does not apply to a read-only handler that never blocks (`workflow/definition.rb:155-156`). Queries: `temporal-developer` `references/ruby/patterns.md` § Queries.
