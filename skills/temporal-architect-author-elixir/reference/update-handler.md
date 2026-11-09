# update handler

`update Name(params) -> (T):`, its options, `await update`, `promise p <- update`, and update cases in `await one:` are unsupported at the pin: the SDK has no update handling. The workflow command `respond_update` is commented out of the API (`temporal_sdk/temporal_sdk_workflow.erl:47`), and so is the client's `update_workflow` (`temporal_sdk/temporal_sdk.erl:45`); updates are still a TODO (`TODO.md:3`). A workflow that declares an update lives on a worker in another SDK.

The corpus maps the rest of such a design and records the skip: [`corpus/messages/elixir/approval.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/elixir/approval.ex) leaves out `update Review` and its `await update`, and sets `note` to `nil`.
