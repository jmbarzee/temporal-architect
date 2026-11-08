# query handler

```twf
query GetStatus() -> (string):
	return status
```

```rust
#[query(name = "GetStatus")]
pub fn get_status(&self, _ctx: &WorkflowContextView) -> String {
    self.status.clone()
}
```

- `#[query(name = …)]`, sync only, on `&self` with a `&WorkflowContextView` (`crates/macros/src/workflow_definitions.rs:373-395`); it returns `T`, or a `Result` to fail the query (`:566-582`). Params map as for a [signal](./signal-handler.md): one input, several → `MultiArgsN`.
- `description` is unsupported in Rust: the attribute accepts only `name` (`:270-290`).
