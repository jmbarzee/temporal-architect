package ast

import (
	"reflect"
	"testing"
)

func TestExtractTemplateParams(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"static", "fabric-shard", nil},
		{"plain-ident", "orders", nil},
		{"single-hole", "fabric-shard-{org}", []string{"org"}},
		{"hole-then-suffix", "fabric-shard-{org}-BootstrapShard", []string{"org"}},
		{"multiple-holes", "{region}-{org}", []string{"region", "org"}},
		{"repeated-hole-distinct", "{org}-{org}", []string{"org"}},
		{"three-holes-order", "{a}-{b}-{a}-{c}", []string{"a", "b", "c"}},
		{"struct-literal-not-a-hole", "Result{ok: true}", nil},
		{"underscore-hole", "q-{my_org}", []string{"my_org"}},
		{"empty-braces-skipped", "x-{}-y", nil},
		{"digit-start-hole-skipped", "x-{1org}", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ExtractTemplateParams(c.in)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("ExtractTemplateParams(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}
