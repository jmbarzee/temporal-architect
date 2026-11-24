package validator

import "testing"

func TestUnreachableStatement(t *testing.T) {
	checkFixtures(t, "unreachable_statement", ErrUnreachableStatement)
}
