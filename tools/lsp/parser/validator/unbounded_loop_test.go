package validator

import "testing"

func TestUnboundedLoop(t *testing.T) {
	checkFixtures(t, "unbounded_loop", ErrUnboundedLoop)
}
