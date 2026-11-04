package server

import (
	"slices"
	"testing"
)

// TestSignatureHelpParams: each parameter's label range covers it whole, and a
// comma inside a type does not split it.
func TestSignatureHelpParams(t *testing.T) {
	help := buildSignatureHelp("Tally", "activity", "items: list[Item], counts: map[string, int]", "")
	sig := help.Signatures[0]
	var got []string
	for _, p := range sig.Parameters {
		r := p.Label.([2]uint32)
		got = append(got, sig.Label[r[0]:r[1]])
	}
	if want := []string{"items: list[Item]", "counts: map[string, int]"}; !slices.Equal(got, want) {
		t.Errorf("params = %q, want %q", got, want)
	}
}
