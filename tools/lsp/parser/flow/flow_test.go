package flow

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/stmtid"
)

var update = flag.Bool("update", false, "rewrite testdata/*.flow")

// fixtures are stmtid's, and edges.twf for the edges theirs leave out.
var fixtures = []string{
	"../stmtid/testdata/agent.twf",
	"../stmtid/testdata/sandbox.twf",
	"../stmtid/testdata/kinds.twf",
	"testdata/edges.twf",
}

func load(t *testing.T, path string) *ast.File {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	file, errs := parser.ParseFileAll(string(data))
	if len(errs) > 0 {
		t.Fatalf("%s: %v", path, errs[0])
	}
	return file
}

// graphs returns the graph of each of f's definitions with a body, keyed as
// stmtid keys it.
func graphs(f *ast.File) (keys []string, gs []*Graph) {
	add := func(kind, name string, def ast.Node) {
		if g := Of(def); g != nil {
			keys, gs = append(keys, graph.DefKey(kind, name)), append(gs, g)
		}
	}
	for _, def := range f.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			add(graph.KindWorkflow, ast.QualifiedName(ast.PackageIDOf(d, f), d.Name), d)
		case *ast.ActivityDef:
			add(graph.KindActivity, ast.QualifiedName(ast.PackageIDOf(d, f), d.Name), d)
		case *ast.NexusServiceDef:
			for _, op := range d.Operations {
				add(graph.KindNexusOperation, graph.NexusOpQualifiedName(ast.QualifiedName(ast.PackageIDOf(d, f), d.Name), op.Name), op)
			}
		}
	}
	return keys, gs
}

// name names n as seen from body b: its line, its line and "join", or entry
// or exit, prefixed by its owner's line when n is another body's.
func name(g *Graph, b *Body, n Node) string {
	line := strconv.Itoa(n.At.NodeLine())
	switch n.Port {
	case Join:
		return line + " join"
	case Entry, Exit:
		port := map[Port]string{Entry: "entry", Exit: "exit"}[n.Port]
		if g.body[n] != b {
			return line + " " + port
		}
		return port
	}
	return line
}

// render writes each body's header, then a line per node: its name, its
// flags, and its out-edges.
func render(f *ast.File) string {
	x := stmtid.Build(f)
	var out strings.Builder
	keys, gs := graphs(f)
	for i, g := range gs {
		for _, b := range g.Bodies() {
			key := keys[i]
			if s, ok := b.Owner.(ast.Statement); ok {
				id, _ := x.Of(s)
				key = id.String()
			}
			fmt.Fprintf(&out, "%s\n", key)
			yields := g.Yields(b)
			for _, n := range b.nodes {
				fields := []string{name(g, b, n)}
				if slices.Contains(yields, n) {
					fields = append(fields, "yield")
				}
				switch g.Multiplicity(n) {
				case Many:
					fields = append(fields, "many")
				case Unknown:
					fields = append(fields, "unknown")
				}
				if !g.Reached(n) {
					fields = append(fields, "unreached")
				}
				if l := g.Loop(n); l != nil {
					fields = append(fields, "loop "+strconv.Itoa(l.Line))
				}
				for _, e := range g.Out(n) {
					edge := e.Kind.String() + "→" + name(g, b, e.To)
					if g.Back(e) {
						edge = "back:" + edge
					}
					fields = append(fields, edge)
				}
				fmt.Fprintf(&out, "\t%s\n", strings.Join(fields, "  "))
			}
		}
	}
	return out.String()
}

// Each fixture's graphs match testdata/<name>.flow.
func TestGolden(t *testing.T) {
	for _, path := range fixtures {
		name := strings.TrimSuffix(filepath.Base(path), ".twf")
		t.Run(name, func(t *testing.T) {
			got := render(load(t, path))
			golden := filepath.Join("testdata", name+".flow")
			if *update {
				if err := os.WriteFile(golden, []byte(got), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			want, err := os.ReadFile(golden)
			if err != nil {
				t.Fatal(err)
			}
			if got != string(want) {
				t.Errorf("graphs differ from %s (go test -update rewrites it):\n%s", golden, got)
			}
		})
	}
}

// fixture returns the graph of path's definition named def.
func fixture(t *testing.T, path, def string) *Graph {
	t.Helper()
	keys, gs := graphs(load(t, path))
	for i, k := range keys {
		if strings.HasSuffix(k, "."+def) {
			return gs[i]
		}
	}
	t.Fatalf("%s has no %s", path, def)
	return nil
}

// at returns g's node at line, as port.
func at(t *testing.T, g *Graph, line int, port Port) Node {
	t.Helper()
	for _, b := range g.Bodies() {
		for _, n := range b.nodes {
			if n.Port == port && n.At.NodeLine() == line {
				return n
			}
		}
	}
	t.Fatalf("no node at line %d", line)
	return Node{}
}

// arms spells each of edges as "<from> <kind>→<to>".
func arms(g *Graph, edges []Edge) []string {
	var out []string
	for _, e := range edges {
		b := g.body[e.From]
		out = append(out, name(g, b, e.From)+" "+e.Kind.String()+"→"+name(g, b, e.To))
	}
	return out
}

// The design's worked example over the agent fixture.
func TestWorkedExample(t *testing.T) {
	g := fixture(t, fixtures[0], "Agent")
	release := at(t, g, 106, Stmt)
	if in := arms(g, g.In(release)); !g.Reached(release) || !reflect.DeepEqual(in, []string{"69 next→106"}) {
		t.Errorf("106 is reached through %v, want only the break at 69", in)
	}
	for line, want := range map[int]Multiplicity{60: Many, 92: Many, 31: One} {
		if got := g.Multiplicity(at(t, g, line, Stmt)); got != want {
			t.Errorf("Multiplicity(%d) = %d, want %d", line, got, want)
		}
	}
	if got, want := arms(g, g.Arms(at(t, g, 31, Stmt))), []string{"25 then→26", "29 wins→30"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Arms(31) = %v, want %v", got, want)
	}
	back := Edge{at(t, g, 102, Stmt), at(t, g, 48, Stmt), Else}
	if !slices.Contains(g.In(back.To), back) || !g.Back(back) || g.Loop(back.From) != back.To.At {
		t.Errorf("102 else→48 is not a back edge of the for at 48")
	}
}

func TestReached(t *testing.T) {
	tests := []struct {
		path, def string
		line      int
		port      Port
		want      bool
	}{
		{fixtures[3], "Edges", 22, Stmt, true},  // after a switch with no default
		{fixtures[3], "Edges", 6, Exit, false},  // a handler that only closes
		{fixtures[3], "Edges", 9, Exit, true},   // a handler that returns
		{fixtures[3], "Edges", 37, Join, false}, // an await all with a branch that breaks
		{fixtures[3], "Edges", 40, Stmt, false}, // after it
		{fixtures[3], "Edges", 41, Join, false}, // an await all with a branch that closes
		{fixtures[3], "Edges", 46, Stmt, false}, // after a close
		{fixtures[2], "Order", 61, Join, true},  // an await one case's await all
		{fixtures[2], "Order", 69, Stmt, true},  // after a for whose await one breaks and continues
	}
	for _, tt := range tests {
		g := fixture(t, tt.path, tt.def)
		if got := g.Reached(at(t, g, tt.line, tt.port)); got != tt.want {
			t.Errorf("%s:%d Reached = %v, want %v", filepath.Base(tt.path), tt.line, got, tt.want)
		}
	}
}

func TestMultiplicity(t *testing.T) {
	g := fixture(t, fixtures[3], "Edges")
	tests := []struct {
		line int
		want Multiplicity
	}{
		{16, Many},    // a for inside a for
		{22, Many},    // inside both
		{24, Many},    // an empty await one case inside a for
		{30, One},     // a for: every run leaves before its back edge
		{31, One},     // inside it
		{38, One},     // a for whose back edge follows a Join no run reaches
		{12, Unknown}, // in a handler, inside a for
	}
	for _, tt := range tests {
		if got := g.Multiplicity(at(t, g, tt.line, Stmt)); got != tt.want {
			t.Errorf("Multiplicity(%d) = %d, want %d", tt.line, got, tt.want)
		}
	}
}

func TestArms(t *testing.T) {
	g := fixture(t, fixtures[3], "Edges")
	tests := []struct {
		line int
		want []string
	}{
		{19, []string{"17 case→18"}},                   // a case in a for in a for
		{26, []string{"23 wins→25"}},                   // an await one case
		{29, []string{"23 wins→24", "27 else→29"}},     // past a case that breaks and an if that continues
		{35, []string{"33 case→34"}},                   // a switch with no default
		{42, []string{"37 branch→39", "41 branch→42"}}, // an await all branch, past the break at 39
		{36, nil}, // past both
	}
	for _, tt := range tests {
		if got := arms(g, g.Arms(at(t, g, tt.line, Stmt))); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("Arms(%d) = %v, want %v", tt.line, got, tt.want)
		}
	}
	// past a Join only the else of a branch's closing if reaches
	j := fixture(t, fixtures[3], "Joined")
	if got, want := arms(j, j.Arms(at(t, j, 53, Stmt))), []string{"50 else→49 join"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Arms(53) = %v, want %v", got, want)
	}
}

func TestBack(t *testing.T) {
	tests := []struct {
		def      string
		from, to int
		kind     Kind
		want     bool
	}{
		{"Edges", 19, 16, Next, true},     // a continue
		{"Edges", 40, 36, Next, true},     // unreached
		{"Joined", 55, 54, Done, true},    // an inner for's Done into an outer for
		{"Edges", 16, 23, Done, false},    // an inner for's Done onward
		{"Edges", 15, 16, Iterate, false}, // into a for from outside it
	}
	for _, tt := range tests {
		g := fixture(t, fixtures[3], tt.def)
		e := Edge{at(t, g, tt.from, Stmt), at(t, g, tt.to, Stmt), tt.kind}
		if !slices.Contains(g.Out(e.From), e) {
			t.Fatalf("%d has no %s edge to %d", tt.from, tt.kind, tt.to)
		}
		if got := g.Back(e); got != tt.want {
			t.Errorf("Back(%d %s→%d) = %v, want %v", tt.from, tt.kind, tt.to, got, tt.want)
		}
	}
}
