package module

import "testing"

func TestParse(t *testing.T) {
	tests := []struct {
		name    string
		src     string
		path    string
		unknown []string
		errMsg  string
		errLine int
	}{
		{"plain", "module example.com/demo\n", "example.com/demo", nil, "", 0},
		{"comments, BOM and CRLF", "\xef\xbb\xbf# header\r\nmodule demo # trailing\r\n", "demo", nil, "", 0},
		{"unknown directive in a valid file", "module demo\ntwf 1.0\n", "demo", []string{"twf"}, "", 0},
		{"no module", "# nothing\n", "", nil, "no module directive", 1},
		{"empty", "", "", nil, "no module directive", 1},
		{"typo names the directive", "\nmodul demo\n", "", nil, `unknown directive "modul"; expected "module <path>"`, 2},
		{"second module", "module a\nmodule b\n", "", nil, "second module directive (first at line 1)", 2},
		{"second module outranks malformed", "module a b\nmodule c\n", "", nil, "second module directive (first at line 1)", 2},
		{"extra words", "module a b\n", "", nil, "malformed module directive: expected one unquoted path", 1},
		{"quoted", "module \"a\"\n", "", nil, "malformed module directive: expected one unquoted path", 1},
		{"bare module", "module\n", "", nil, "malformed module directive: expected one unquoted path", 1},
		{"invalid path", "module -x\n", "", nil, `invalid module path "-x": leading dash`, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, err := Parse([]byte(tt.src))
			if tt.errMsg != "" {
				if err == nil || err.Msg != tt.errMsg || err.Line != tt.errLine {
					t.Fatalf("got %v (file %+v), want error %q at line %d", err, f, tt.errMsg, tt.errLine)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error %v", err)
			}
			if f.Path != tt.path {
				t.Errorf("path = %q, want %q", f.Path, tt.path)
			}
			var names []string
			for _, d := range f.Unknown {
				names = append(names, d.Name)
			}
			if len(names) != len(tt.unknown) || (len(names) > 0 && names[0] != tt.unknown[0]) {
				t.Errorf("unknown = %v, want %v", names, tt.unknown)
			}
		})
	}
}

// TestCheckPath pins the accept/reject table spec 15 states: x/mod's code,
// which a dependency bump could loosen.
func TestCheckPath(t *testing.T) {
	accept := []string{"demo", "acme/orderer", "example.com/demo/fabric/v1", "a+b", "a..b", ".x", "x~beta", "github.com/metacensus/library-temporal-kube"}
	reject := []string{"", "x~1", "con", "-x", "a//b", "a/", "x.", "a:b", "a@b", "a b", `a\b`, "..", "."}
	for _, p := range accept {
		if err := CheckPath(p); err != nil {
			t.Errorf("CheckPath(%q) = %v, want accepted", p, err)
		}
	}
	for _, p := range reject {
		if err := CheckPath(p); err == nil {
			t.Errorf("CheckPath(%q) accepted, want rejected", p)
		}
	}
}

func TestAssumedName(t *testing.T) {
	tests := map[string]string{
		"example.com/demo/fabric/v1": "fabric",
		"acme/billing/v2":            "billing",
		"acme/billing":               "billing",
		"demo":                       "demo",
		"v1":                         "v1",
		"acme/v1x":                   "v1x",
		"gopkg.in/yaml.v3":           "yaml.v3",
		"example.com/v1":             "example.com",
	}
	for p, want := range tests {
		if got := AssumedName(p); got != want {
			t.Errorf("AssumedName(%q) = %q, want %q", p, got, want)
		}
	}
}

func TestUsable(t *testing.T) {
	usable := []string{"fabric", "billing", "service", "endpoint", "id", "run_id", "default_options", "parent", "v1"}
	unusable := []string{"", "library-temporal-kube", "yaml.v3", "example.com", "nexus", "worker", "options", "workflow", "task_queue", "1x"}
	for _, n := range usable {
		if !Usable(n) {
			t.Errorf("Usable(%q) = false, want true", n)
		}
	}
	for _, n := range unusable {
		if Usable(n) {
			t.Errorf("Usable(%q) = true, want false", n)
		}
	}
}

func TestRemotePath(t *testing.T) {
	tests := []struct {
		url, want string
	}{
		{"https://github.com/metacensus/aivearium.git", "github.com/metacensus/aivearium"},
		{"https://user:ghp_secret@github.com/org/repo", "github.com/org/repo"},
		{"git@github.com:org/repo.git", "github.com/org/repo"},
		{"ssh://git@GitHub.com:2222/org/repo.git/", "github.com/org/repo"},
		{"https://gitlab.com/g/sub/r.git", "gitlab.com/g/sub/r"},
		{"git://example.org/x", "example.org/x"},
		{"file:///srv/repo.git", ""},
		{"/srv/repo.git", ""},
		{"../repo", ""},
		{"gh:org/repo", ""},
		{"https://github.com/", ""},
	}
	for _, tt := range tests {
		got, ok := RemotePath(tt.url)
		if (tt.want == "") == ok || got != tt.want {
			t.Errorf("RemotePath(%q) = %q, %v; want %q", tt.url, got, ok, tt.want)
		}
	}
}
