package lexer

import "testing"

// rescanFirst lexes the first token from input then re-scans it as a deploy_name,
// mirroring how the parser drives RescanDeployName from a name position.
func rescanFirst(input string) (string, error) {
	l := New(input)
	first := l.NextToken()
	tok, err := l.RescanDeployName(first)
	return tok.Literal, err
}

func TestRescanDeployName(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"plain-ident", "orders:", "orders"},
		{"hyphen", "fabric-shard:", "fabric-shard"},
		{"single-hole", "fabric-shard-{org}:", "fabric-shard-{org}"},
		{"hole-then-suffix", "fabric-shard-{org}-BootstrapShard rest", "fabric-shard-{org}-BootstrapShard"},
		{"stops-at-dot", "fabric.shard", "fabric"},
		{"stops-at-space", "fabric-shard endpoint", "fabric-shard"},
		{"stops-at-colon", "orders:", "orders"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := rescanFirst(c.in)
			if err != nil {
				t.Fatalf("RescanDeployName(%q) unexpected error: %v", c.in, err)
			}
			if got != c.want {
				t.Errorf("RescanDeployName(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestRescanDeployNameMultipleHolesMidName(t *testing.T) {
	// Holes after a leading segment, in order.
	got, err := rescanFirst("shard-{region}-{org}:")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "shard-{region}-{org}" {
		t.Errorf("got %q, want %q", got, "shard-{region}-{org}")
	}
}

func TestRescanDeployNameErrors(t *testing.T) {
	cases := []struct {
		name string
		in   string
	}{
		{"empty-hole", "foo-{}:"},
		{"unterminated-hole", "foo-{org:"},
		{"digit-start-hole", "foo-{1org}:"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := rescanFirst(c.in)
			if err == nil {
				t.Errorf("RescanDeployName(%q): expected error, got nil", c.in)
			}
		})
	}
}
