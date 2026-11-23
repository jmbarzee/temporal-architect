package stmtid

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
)

var update = flag.Bool("update", false, "rewrite testdata/*.ids")

// fixtures are testdata/<name>.twf: the agent-sandbox design (#719) and one
// file holding every statement kind.
var fixtures = []string{"agent", "sandbox", "kinds"}

func load(t *testing.T, name string) (*ast.File, string) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name+".twf"))
	if err != nil {
		t.Fatal(err)
	}
	file, errs := parser.ParseFileAll(string(data))
	if len(errs) > 0 {
		t.Fatalf("%s: %v", name, errs[0])
	}
	return file, string(data)
}

// statements lists the statements x identifies, in source order.
func statements(x *Index) []ast.Statement {
	var all []ast.Statement
	for s := range x.ids {
		all = append(all, s)
	}
	slices.SortFunc(all, func(a, b ast.Statement) int {
		if a.NodeLine() != b.NodeLine() {
			return a.NodeLine() - b.NodeLine()
		}
		return a.NodeColumn() - b.NodeColumn()
	})
	return all
}

// Each fixture's identities, line by line, match testdata/<name>.ids.
func TestGolden(t *testing.T) {
	for _, name := range fixtures {
		t.Run(name, func(t *testing.T) {
			file, _ := load(t, name)
			x := Build(file)
			var b strings.Builder
			for _, s := range statements(x) {
				id, _ := x.Of(s)
				fmt.Fprintf(&b, "%d\t%s\n", s.NodeLine(), id)
			}
			path := filepath.Join("testdata", name+".ids")
			if *update {
				if err := os.WriteFile(path, []byte(b.String()), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			want, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if b.String() != string(want) {
				t.Errorf("identities differ from %s (go test -update rewrites it):\n%s", path, b.String())
			}
		})
	}
}

// Every head is its statement's first line as written, up to whitespace; a
// handler's is that line's start.
func TestHeadsAreWritten(t *testing.T) {
	for _, name := range fixtures {
		file, src := load(t, name)
		lines := strings.SplitAfter(src, "\n")
		for _, s := range statements(Build(file)) {
			got, want := key(head(s)), key(firstLine(strings.Join(lines[s.NodeLine()-1:], "")))
			switch s.(type) {
			case *ast.SignalDecl, *ast.UpdateDecl, *ast.QueryDecl:
				if !strings.HasPrefix(want, got) {
					t.Errorf("%s:%d: handler head %q does not start %q", name, s.NodeLine(), head(s), want)
				}
			default:
				if got != want {
					t.Errorf("%s:%d: head %q, written %q", name, s.NodeLine(), head(s), want)
				}
			}
		}
	}
}

// firstLine is src's first line through any bracket it opens, without its
// comment and trailing ':'.
func firstLine(src string) string {
	depth, end := 0, len(src)
	scan(src, func(i int, r rune, quoted bool) {
		switch {
		case quoted || end < len(src):
		case r == '(' || r == '[' || r == '{':
			depth++
		case r == ')' || r == ']' || r == '}':
			depth--
		case (r == '#' || r == '\n') && depth == 0:
			end = i
		}
	})
	return strings.TrimSuffix(strings.TrimSpace(src[:end]), ":")
}

// Every identity resolves to its statement, and its spelling parses back.
func TestRoundTrip(t *testing.T) {
	for _, name := range fixtures {
		file, _ := load(t, name)
		x := Build(file)
		for _, s := range statements(x) {
			id, _ := x.Of(s)
			if r := x.Resolve(id); r.Stmt != s || r.Fault != None {
				t.Errorf("%s: %s resolves to %+v", name, id, r)
			}
			if back, err := Parse(id.String()); err != nil || !reflect.DeepEqual(back, id) {
				t.Errorf("%s: %s parses to %v, %v", name, id, back, err)
			}
		}
	}
}

// Identities spelled by hand, as #719's design writes them, resolve.
func TestWrittenSpellings(t *testing.T) {
	agent, _ := load(t, "agent")
	sandbox, _ := load(t, "sandbox")
	for _, c := range []struct {
		x       *Index
		written string
	}{
		{Build(agent), "workflow:agent.Agent › if (resume == null) › await one @2 › signal SandboxLeaseGrant"},
		{Build(sandbox), "workflow:sandbox.Sandbox › signal LeaseRelease › if (lease != null and lease.owner == requester)"},
		{Build(sandbox), `workflow:sandbox.Sandbox › for › await one › signal LeaseRequest -> requester
  › if (lease == null or lease.owner == requester or workflow.now() >= lease.expiry)
  › else › signal agent.Agent.SandboxLeaseDeny("leased to another holder")`},
	} {
		id, err := Parse(c.written)
		if err != nil {
			t.Fatal(err)
		}
		if r := c.x.Resolve(id); r.Fault != None {
			t.Errorf("%s: %+v", c.written, r)
		}
	}
}

func TestParseRejects(t *testing.T) {
	for _, s := range []string{"", "workflow:A", "A › b", "workflow:A › ", "workflow:A › b @0", "workflow:A › @2"} {
		if id, err := Parse(s); err == nil {
			t.Errorf("Parse(%q) = %v, want an error", s, id)
		}
	}
}

// body is one statement list of a file, open to edits a test undoes.
type body struct {
	n      int
	at     func(i int) ast.Statement
	insert func(i int) (undo func())
	move   func(i, j int) (undo func())
}

func bodyOf[T ast.Statement](list *[]T, probe T) body {
	saved := *list
	set := func(l []T) func() {
		*list = l
		return func() { *list = saved }
	}
	return body{
		n:  len(saved),
		at: func(i int) ast.Statement { return saved[i] },
		insert: func(i int) func() {
			return set(slices.Insert(slices.Clone(saved), i, probe))
		},
		move: func(i, j int) func() {
			return set(slices.Insert(slices.Delete(slices.Clone(saved), i, i+1), j, saved[i]))
		},
	}
}

// bodies lists every statement list in f, each with a uniquely headed probe.
func bodies(f *ast.File) []body {
	stmt := ast.Statement(&ast.RawStmt{Text: "probe = 1"})
	var all []body
	var walk func(stmts []ast.Statement)
	add := func(list *[]ast.Statement) {
		all = append(all, bodyOf(list, stmt))
		walk(*list)
	}
	walk = func(stmts []ast.Statement) {
		for _, s := range stmts {
			switch s := s.(type) {
			case *ast.SignalDecl:
				add(&s.Body)
			case *ast.UpdateDecl:
				add(&s.Body)
			case *ast.QueryDecl:
				add(&s.Body)
			case *ast.IfStmt:
				add(&s.Body)
				add(&s.ElseBody)
			case *ast.SwitchBlock:
				all = append(all, bodyOf(&s.Cases, &ast.SwitchCase{Value: "probe"}))
				for _, c := range s.Cases {
					add(&c.Body)
				}
				add(&s.Default)
			case *ast.AwaitOneBlock:
				all = append(all, bodyOf(&s.Cases, &ast.AwaitOneCase{Target: &ast.IdentTarget{Name: "probe"}}))
				for _, c := range s.Cases {
					if c.AwaitAll != nil {
						add(&c.AwaitAll.Body)
					} else {
						add(&c.Body)
					}
				}
			case *ast.AwaitAllBlock:
				add(&s.Body)
			case *ast.ForStmt:
				add(&s.Body)
			}
		}
	}
	for _, def := range f.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			all = append(all, bodyOf(&d.Signals, &ast.SignalDecl{Name: "Probe"}))
			all = append(all, bodyOf(&d.Queries, &ast.QueryDecl{Name: "Probe"}))
			all = append(all, bodyOf(&d.Updates, &ast.UpdateDecl{Name: "Probe"}))
			for _, h := range d.Signals {
				add(&h.Body)
			}
			for _, h := range d.Queries {
				add(&h.Body)
			}
			for _, h := range d.Updates {
				add(&h.Body)
			}
			add(&d.Body)
		case *ast.ActivityDef:
			add(&d.Body)
		case *ast.NexusServiceDef:
			for _, op := range d.Operations {
				add(&op.Body)
			}
		}
	}
	return all
}

// A uniquely headed statement inserted at any index, or a uniquely headed
// statement moved anywhere in its body, changes no other identity.
func TestStability(t *testing.T) {
	for _, name := range fixtures {
		file, _ := load(t, name)
		x := Build(file)
		unchanged := func(edit string) {
			after := Build(file)
			for s, id := range x.ids {
				if got, _ := after.Of(s); got.String() != id.String() {
					t.Errorf("%s: %s: %s became %s", name, edit, id, got)
				}
			}
		}
		for _, b := range bodies(file) {
			for i := 0; i <= b.n; i++ {
				undo := b.insert(i)
				unchanged(fmt.Sprintf("a probe at %d of %d", i, b.n))
				undo()
			}
			for i := 0; i < b.n; i++ {
				if id, ok := x.Of(b.at(i)); ok && id.Path[len(id.Path)-1].Nth != 0 {
					continue // a twin's rank is its identity
				}
				for j := 0; j < b.n; j++ {
					undo := b.move(i, j)
					unchanged(fmt.Sprintf("line %d moved to %d", b.at(i).NodeLine(), j))
					undo()
				}
			}
		}
	}
}

// A stored identity that no longer resolves names the fault and the deepest
// ancestor that survives.
func TestFaults(t *testing.T) {
	file, _ := load(t, "sandbox")
	x := Build(file)
	find := func(spelled string) (ID, ast.Statement) {
		t.Helper()
		id, err := Parse(spelled)
		if err != nil {
			t.Fatal(err)
		}
		r := x.Resolve(id)
		if r.Fault != None {
			t.Fatalf("%s: %+v", spelled, r)
		}
		return id, r.Stmt
	}
	loop := "workflow:sandbox.Sandbox › for › await one"
	_, race := find(loop)
	_, request := find(loop + " › signal LeaseRequest -> requester")
	inner, _ := find(loop + " › signal LeaseRelease › continue")
	deny, _ := find(loop + " › signal LeaseRequest -> requester › if (lease == null or lease.owner == requester or workflow.now() >= lease.expiry) › else › signal agent.Agent.SandboxLeaseDeny(\"leased to another holder\")")
	del, deleteCall := find("workflow:sandbox.Sandbox › activity kube.Delete(ids)")
	sandbox := file.Definitions[1].(*ast.WorkflowDef)

	cases := []struct {
		name    string
		edit    func() (undo func())
		id      ID
		failed  int
		nearest ast.Node
		fault   Fault
	}{
		{"a removed case", func() func() {
			block := race.(*ast.AwaitOneBlock)
			saved := block.Cases
			block.Cases = slices.Delete(slices.Clone(saved), 1, 2)
			return func() { block.Cases = saved }
		}, inner, 2, race, Missing},
		{"an edited ancestor head", func() func() {
			cond := request.(*ast.AwaitOneCase).Body[0].(*ast.IfStmt)
			saved := cond.Condition
			cond.Condition = "lease == null"
			return func() { cond.Condition = saved }
		}, deny, 3, request, Missing},
		{"a twin", func() func() {
			saved := sandbox.Body
			twin := *deleteCall.(*ast.ActivityCall)
			sandbox.Body = append(slices.Clone(saved), &twin)
			return func() { sandbox.Body = saved }
		}, del, 0, sandbox, Ambiguous},
	}
	for _, c := range cases {
		undo := c.edit()
		r := Build(file).Resolve(c.id)
		undo()
		if r.Stmt != nil || r.Fault != c.fault || r.Failed != c.failed || r.Nearest != c.nearest {
			t.Errorf("%s: %s resolves to %+v", c.name, c.id, r)
		}
	}
}
