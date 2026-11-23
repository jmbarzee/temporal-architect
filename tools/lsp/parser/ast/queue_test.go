package ast

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestParseDeployQueue(t *testing.T) {
	long := strings.Repeat("a", 999)
	tests := []struct {
		in      string
		form    QueueForm
		fixed   []string
		params  []string
		problem string
	}{
		{"control", QueueOpaque, nil, nil, ""},
		{"", QueueOpaque, nil, nil, ""},
		{"sandbox-{}", QueueOpaque, nil, nil, ""},
		{"q-{a.b}", QueueOpaque, nil, nil, ""},
		{"q-{x", QueueOpaque, nil, nil, ""},
		{"sandbox-{sandboxId}", QueueParsed, []string{"sandbox-", ""}, []string{"sandboxId"}, ""},
		{"{hostId}", QueueParsed, []string{"", ""}, []string{"hostId"}, ""},
		{"{a}-{a}", QueueParsed, []string{"", "-", ""}, []string{"a", "a"}, ""},
		{"x/_sys/{x}", QueueParsed, []string{"x/_sys/", ""}, []string{"x"}, ""},
		{long + "{x}", QueueParsed, []string{long, ""}, []string{"x"}, ""},
		{long[2:] + "{x}-{y}", QueueParsed, []string{long[2:], "-", ""}, []string{"x", "y"}, ""},
		// The first broken rule, in spec 03's order.
		{"q-{x}-{a.b}", QueueMalformed, nil, nil, "{a.b} is not a parameter name"},
		{"q-{x}-{}", QueueMalformed, nil, nil, "{} is not a parameter name"},
		{"q-{x}-{}-{a.b}", QueueMalformed, nil, nil, "{} is not a parameter name"},
		{"{a.b}{x}", QueueMalformed, nil, nil, "{a.b} is not a parameter name"},
		{"sandbox{a}{b}", QueueMalformed, nil, nil, "parameters must be separated by fixed text"},
		{"{x}{y}}", QueueMalformed, nil, nil, "parameters must be separated by fixed text"},
		{"q-{x}}", QueueMalformed, nil, nil, "stray or unclosed brace"},
		{"q-{{x}", QueueMalformed, nil, nil, "stray or unclosed brace"},
		{"/_sys/{x}}", QueueMalformed, nil, nil, "stray or unclosed brace"},
		{"/_sys/{x}", QueueMalformed, nil, nil, `fixed text begins with reserved prefix "/_sys/"`},
		{"temporal-sys-per-ns-{x}", QueueMalformed, nil, nil, `fixed text begins with reserved prefix "temporal-sys-per-ns-"`},
		{"/_sys/" + long + "{x}", QueueMalformed, nil, nil, `fixed text begins with reserved prefix "/_sys/"`},
		{long + "a{x}", QueueMalformed, nil, nil, "fixed text plus one byte per parameter exceeds 1000 bytes"},
		{long[1:] + "{x}{y}", QueueMalformed, nil, nil, "parameters must be separated by fixed text"},
		{long[1:] + "{x}-{y}", QueueMalformed, nil, nil, "fixed text plus one byte per parameter exceeds 1000 bytes"},
	}
	for _, tt := range tests {
		got := ParseDeployQueue(tt.in)
		want := Queue{Spelling: tt.in, Form: tt.form, Fixed: tt.fixed, Params: tt.params, Problem: tt.problem}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("ParseDeployQueue(%.40q) =\n %+v\nwant\n %+v", tt.in, got, want)
		}
	}
}

func TestParseCallQueue(t *testing.T) {
	tests := []struct {
		in     string
		form   QueueForm
		fixed  []string
		params []string
	}{
		{"sandbox", QueueOpaque, nil, nil},
		{"sandbox-{lease.sandboxId}", QueueParsed, []string{"sandbox-", ""}, []string{"lease.sandboxId"}},
		{"{lease.queue}", QueueParsed, []string{"", ""}, []string{"lease.queue"}},
		{"{x}", QueueParsed, []string{"", ""}, []string{"x"}},
		{"q-{x.y}-{}", QueueOpaque, nil, nil},
		{"q-{1x}", QueueOpaque, nil, nil},
		{"{a}{b}", QueueOpaque, nil, nil},
		{"q-{x", QueueOpaque, nil, nil},
		{"q-{x}}", QueueOpaque, nil, nil},
		{"/_sys/{x}", QueueParsed, []string{"/_sys/", ""}, []string{"x"}},
	}
	for _, tt := range tests {
		got := ParseCallQueue(tt.in)
		want := Queue{Spelling: tt.in, Form: tt.form, Fixed: tt.fixed, Params: tt.params}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("ParseCallQueue(%q) =\n %+v\nwant\n %+v", tt.in, got, want)
		}
	}
}

func TestQueueMatches(t *testing.T) {
	tests := []struct {
		call, deploy string
		want         bool
	}{
		{"sandbox-{lease.sandboxId}", "sandbox-{sandboxId}", true},
		{"sandbox", "sandbox-{sandboxId}", false},
		{"sandbox-{lease.region}-{lease.sandboxId}", "sandbox-{sandboxId}", false},
		{"x-{a}-y", "x-{b}-z", false},
		{"q", "q", true},
		{"q", "r", false},
		// Identical spelling matches whichever side parses.
		{"q-{a.b}", "q-{a.b}", true},
		{"sandbox-{x}", "sandbox-{x}", true},
		// A malformed worker queue matches nothing, its own spelling included.
		{"sandbox{a}{b}", "sandbox{a}{b}", false},
		{"{lease.queue}", "sandbox{a}{b}", false},
		// A learned queue reaches any family, and otherwise only its spelling.
		{"{lease.queue}", "sandbox-{sandboxId}", true},
		{"{lease.queue}", "{hostId}", true},
		{"{lease.queue}", "sandbox", false},
		{"{lease.queue}", "{lease.queue}", true},
		// Learned is a call-side reading: a bare family does not reach a call.
		{"sandbox-{lease.id}", "{hostId}", false},
		// A dotted path parses on the call side only.
		{"q-{a.b}", "q-{x}", true},
	}
	for _, tt := range tests {
		if got := ParseCallQueue(tt.call).Matches(ParseDeployQueue(tt.deploy)); got != tt.want {
			t.Errorf("%q.Matches(%q) = %v, want %v", tt.call, tt.deploy, got, tt.want)
		}
	}
}

func TestQueueKey(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"sandbox-{sandboxId}", "sandbox-{id}", true},
		{"{hostId}", "{podId}", true},
		{"q", "q", true},
		{"q", "r", false},
		{"sandbox-{}", "sandbox-{}", true},
		{"sandbox-{}", "sandbox-{sandboxId}", false},
		{"a{}b", "a{x}b", false},
		{"sandbox-{a}", "sandbox-{a}-x", false},
		{"sandbox{a}{b}", "sandbox{a}{b}", false},
	}
	for _, tt := range tests {
		if got := ParseDeployQueue(tt.a).SameKey(ParseDeployQueue(tt.b)); got != tt.want {
			t.Errorf("SameKey(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
	if k, ok := ParseDeployQueue("sandbox{a}{b}").Key(); ok || k != "" {
		t.Errorf("malformed queue Key() = %q, %v; want no key", k, ok)
	}
}

func TestQueueOverlaps(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"sandbox-pool", "sandbox-{sandboxId}", true},
		{"sandbox-{a}", "pool", false},
		{"sandbox-{a}", "sandbox-", false},
		{"a-{x}-b", "a-{y}", true},
		{"{x}-done", "start-{y}", true},
		{"{hostId}", "pool", true},
		{"q", "q", true},
		{"q", "r", false},
		{"sandbox{a}{b}", "sandbox-x", false},
		{"q{a}{b}", "q{x}", false},
		{"sandbox-x", "sandbox{a}{b}", false},
	}
	for _, tt := range tests {
		a, b := ParseDeployQueue(tt.a), ParseDeployQueue(tt.b)
		if got := a.Overlaps(b); got != tt.want {
			t.Errorf("Overlaps(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
		if got := b.Overlaps(a); got != tt.want {
			t.Errorf("Overlaps(%q, %q) = %v, want %v", tt.b, tt.a, got, tt.want)
		}
	}
}

func TestQueueBare(t *testing.T) {
	for in, want := range map[string]bool{"{hostId}": true, "h-{hostId}": false, "{hostId}-h": false, "host": false} {
		if got := ParseDeployQueue(in).Bare(); got != want {
			t.Errorf("ParseDeployQueue(%q).Bare() = %v, want %v", in, got, want)
		}
	}
}

func TestNamespaceWorkerTemplateParamsJSON(t *testing.T) {
	ns := &NamespaceDef{Name: "aivearium", Workers: []NamespaceWorker{
		{Worker: Ref[*WorkerDef]{Name: "sidecar"}, TemplateParams: []string{"sandboxId"}},
		{Worker: Ref[*WorkerDef]{Name: "control"}},
	}}
	out, err := json.Marshal(&File{Definitions: []Definition{ns}})
	if err != nil {
		t.Fatal(err)
	}
	got := string(out)
	for _, want := range []string{
		`{"workerName":"sidecar","site":{"line":0,"column":0},"templateParams":["sandboxId"]}`,
		`{"workerName":"control","site":{"line":0,"column":0}}`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("namespace JSON lacks %s:\n%s", want, got)
		}
	}
}
