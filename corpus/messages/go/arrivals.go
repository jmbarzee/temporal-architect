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
	var v T
	ticket := a.next
	a.next++
	a.waiters = append(a.waiters, ticket)
	if err := workflow.Await(ctx, func() bool {
		return len(a.pending) > 0 && a.waiters[0] == ticket
	}); err != nil {
		a.waiters = slices.DeleteFunc(a.waiters, func(w int) bool { return w == ticket })
		return v, err
	}
	v, a.pending, a.waiters = a.pending[0], a.pending[1:], a.waiters[1:]
	return v, nil
}
