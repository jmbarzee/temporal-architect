package messages

import (
	"slices"

	"go.temporal.io/sdk/workflow"
)

// arrivals holds a signal's or update's pending arrivals and the waiters for
// them, each oldest first: a handler adds an arrival when it returns, and the
// waiter that began waiting first takes the oldest.
type arrivals[T any] struct {
	pending []T
	waiters []int // tickets, in the order their waiters began
	next    int   // the next waiter's ticket
}

func (a *arrivals[T]) add(v T) {
	a.pending = append(a.pending, v)
}

// take waits until an arrival is pending and no earlier waiter remains, then
// removes the oldest arrival. Await alone would wake waiters in the order their
// coroutines were created, not the order they began waiting.
func (a *arrivals[T]) take(ctx workflow.Context) (T, error) {
	ticket := a.wait()
	defer a.leave(ticket)
	if err := workflow.Await(ctx, func() bool { return a.ready(ticket) }); err != nil {
		var v T
		return v, err
	}
	return a.claim(), nil
}

// wait begins a waiter and returns its ticket. An await one case waits, checks
// ready without taking, and claims only if it wins; win or lose, it leaves.
func (a *arrivals[T]) wait() int {
	ticket := a.next
	a.next++
	a.waiters = append(a.waiters, ticket)
	return ticket
}

// ready reports whether an arrival is pending and ticket is the earliest waiter.
func (a *arrivals[T]) ready(ticket int) bool {
	return len(a.pending) > 0 && a.waiters[0] == ticket
}

// claim gives the oldest arrival to the earliest waiter, which must be ready.
func (a *arrivals[T]) claim() T {
	v := a.pending[0]
	a.pending, a.waiters = a.pending[1:], a.waiters[1:]
	return v
}

// leave ends a waiter that did not claim; after a claim it does nothing.
func (a *arrivals[T]) leave(ticket int) {
	a.waiters = slices.DeleteFunc(a.waiters, func(w int) bool { return w == ticket })
}
