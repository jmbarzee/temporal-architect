# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```ruby
def initialize
  @approves = Arrivals.new
end

workflow_signal name: 'Approve'
def approve(approver)
  @status = 'approved'
  @approves.add(approver)
end

# in execute:
approver = @approves.take_now
```

Every signal or update the design waits on gets an `Arrivals` in `initialize`, holding its one param, a `Data` of several (read through its members after the take), or `nil` for none (`add(nil)`). Copy the class from the corpus's [`messages/ruby/arrivals.rb`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/ruby/arrivals.rb) into the workflow's package `module`; [`workflows.rb`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/ruby/workflows.rb) beside it is the worked example (`Approval`).

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `take_now` gives the oldest pending arrival, else waits in the calling fiber for the next. Waiters are served in the order they began, by ticket. A bare `wait_condition { !@pending.empty? }` plus `shift` per waiter loses nothing and keeps that order too: the scheduler resumes only the first satisfied condition, in the order the waits began, and re-checks the rest after that fiber yields (`internal/worker/workflow_instance/scheduler.rb:45-66,80-81`; `workflow.rb:535-538`; the corpus's `test_naive_wait_condition_per_waiter_keeps_each_arrival`). `Arrivals` is for the two rules that queue cannot keep: a promise begins waiting at its binding, and an `await one` case takes only if it wins. A boolean flag holds only one arrival; it is not a `.twf` wait.
- `take` draws its ticket when called, so a promise begins waiting at its binding ([promise.md](./promise.md)).
- An `await one` case uses `wait`, `ready?`, `claim` and `leave` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- A waiter cancelled through its `Temporalio::Cancellation` leaves the queue (`take_at(ticket, cancellation:)`, its `ensure`; the corpus's `test_a_cancelled_waiter_leaves_the_queue`). Cancellations: `temporal-developer` `references/ruby/patterns.md` § Cancellation (Token-based).
- A signal with no params that only an `await one` waits on may count its arrivals instead, as the corpus's `Batch` does (`@acks += 1`; `@acks.positive?`; `@acks -= 1`).
- Code after `take_now` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
