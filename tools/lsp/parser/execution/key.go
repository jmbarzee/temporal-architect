package execution

import (
	"strconv"
	"strings"
)

// Key is an event's identity across executions. Visit is the passes joined by
// ".", so keys compare with ==.
type Key struct {
	Lane    string
	Stmt    string
	Visit   string
	Kind    Kind
	Attempt int
}

// Key returns e's identity across executions.
func (e Event) Key() Key {
	passes := make([]string, len(e.Visit))
	for i, n := range e.Visit {
		passes[i] = strconv.Itoa(n)
	}
	return Key{e.Lane, e.Stmt, strings.Join(passes, "."), e.Kind, e.Attempt}
}

// definition splits a lane id into its definition key and its rank, 0 when it
// carries none.
func definition(lane string) (key string, rank int) {
	key, n, ok := strings.Cut(lane, " @")
	if !ok {
		return lane, 0
	}
	rank, err := strconv.Atoi(n)
	if err != nil || rank < 1 {
		return lane, 0
	}
	return key, rank
}

func keyOf(lane string) string {
	key, _ := definition(lane)
	return key
}
