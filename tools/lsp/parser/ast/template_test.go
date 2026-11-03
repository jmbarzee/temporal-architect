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
		{"single-param", "fabric-shard-{org}", []string{"org"}},
		{"param-then-suffix", "fabric-shard-{org}-BootstrapShard", []string{"org"}},
		{"multiple-params", "{region}-{org}", []string{"region", "org"}},
		{"repeated-param-distinct", "{org}-{org}", []string{"org"}},
		{"three-params-order", "{a}-{b}-{a}-{c}", []string{"a", "b", "c"}},
		{"struct-literal-not-a-param", "Result{ok: true}", nil},
		{"underscore-param", "q-{my_org}", []string{"my_org"}},
		{"empty-braces-skipped", "x-{}-y", nil},
		{"digit-start-param-skipped", "x-{1org}", nil},
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
