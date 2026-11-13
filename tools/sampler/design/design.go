// Package design loads a .twf design for the sampler's join: it indexes which
// package each definition belongs to, so an observed definition, which history
// names only by its bare runtime type, gets the node ID graph.Extract gives it,
// and which workflows' id_schemes a workflow ID fits, so a signal's target gets
// a type, and which parameterized namespace or worker family a concrete name
// fits. The package index is read from the design's own graph; a package is
// never guessed from a name.
package design

import (
	"fmt"
	"slices"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// Design is a loaded design and the indexes the sampler's joins read.
type Design struct {
	// Graph is the design's resolved deployment graph, as `twf graph` emits it.
	Graph *graph.Graph

	// defs maps a definition key (kind and bare name) to each package that
	// declares it, and to the deployments that host it there; an unhosted
	// definition has none.
	defs map[string]map[string][]deployment

	// schemes lists each workflow that declares an id_scheme, in declaration order.
	schemes []scheme

	// namespaces and workers are the design graph's namespace nodes and its
	// non-orphan worker nodes by namespace name, whose names or queues the
	// family matches read.
	namespaces []graph.Node
	workers    map[string][]graph.Node
}

// scheme is a workflow's id_scheme template, with the package and bare name
// that identify the workflow.
type scheme struct {
	pkg, name, template string
}

// Target is a workflow a design hosts: its package ID and bare name, and the
// task queue of the worker that hosts it.
type Target struct {
	Package, Name, Queue string
}

// deployment is where a worker hosts a definition: a namespace and a task queue.
type deployment struct {
	namespace, queue string
}

// Load parses the design at path, a .twf file or a directory of them, as
// `twf check` does, and fails if it has errors.
func Load(path string) (*Design, error) {
	file, diags, err := pipeline.ParseFiles([]string{path})
	if err != nil {
		return nil, err
	}
	var errs []string
	for _, d := range diags {
		if d.Severity != "warning" && d.Severity != "hint" { // as pipeline.Summarize counts errors
			errs = append(errs, fmt.Sprintf("%s:%d: %s %s", d.Site.File, d.Site.Line, d.Code, d.Message))
		}
	}
	if len(errs) > 0 {
		return nil, fmt.Errorf("design %s has errors:\n%s", path, strings.Join(errs, "\n"))
	}
	return index(graph.Extract(file), file), nil
}

// index builds a Design from the hosted definitions of a design graph and the
// id_schemes of the file it came from.
func index(g *graph.Graph, file *ast.File) *Design {
	d := &Design{Graph: g, defs: map[string]map[string][]deployment{}, workers: map[string][]graph.Node{}}
	byID := make(map[string]graph.Node, len(g.Nodes))
	for _, n := range g.Nodes {
		byID[n.ID] = n
	}
	workerOf, namespaceOf := g.Ancestors()
	for _, n := range g.Nodes {
		kind, _, _ := strings.Cut(n.Definition, ":")
		switch {
		case kind == graph.KindNamespace:
			d.namespaces = append(d.namespaces, n)
		case kind == graph.KindWorker && !n.Orphan:
			ns := byID[namespaceOf[n.ID]].Name
			d.workers[ns] = append(d.workers[ns], n)
		}
		if kind != graph.KindWorkflow && kind != graph.KindActivity {
			continue
		}
		key := graph.DefKey(kind, n.Name)
		if d.defs[key] == nil {
			d.defs[key] = map[string][]deployment{}
		}
		hosts := d.defs[key][n.PackageID] // an orphan is declared, and hosted nowhere
		if !n.Orphan {
			hosts = append(hosts, deployment{byID[namespaceOf[n.ID]].Name, byID[workerOf[n.ID]].Queue})
		}
		d.defs[key][n.PackageID] = hosts
	}
	seen := map[[2]string]bool{}
	for _, def := range file.Definitions {
		wf, ok := def.(*ast.WorkflowDef)
		if !ok || wf.IDScheme == nil {
			continue
		}
		pkg := ast.PackageIDOf(wf, file)
		if k := [2]string{pkg, wf.Name}; !seen[k] { // the first declaration is the kept one
			seen[k] = true
			d.schemes = append(d.schemes, scheme{pkg, wf.Name, wf.IDScheme.Template})
		}
	}
	return d
}

// Package returns the package ID of the design's definition that a sampled
// definition of that kind and bare name names, as it ran on a namespace and task
// queue. A name that one package declares is that package's. A name several
// declare is the one whose worker hosts it on that namespace and queue. A name
// the design lacks, or one that stays ambiguous, is not resolved.
func (d *Design) Package(kind, name, namespace, queue string) (pkg string, ok bool) {
	byPkg := d.defs[graph.DefKey(kind, name)]
	if len(byPkg) == 1 {
		for pkg := range byPkg {
			return pkg, true
		}
	}
	var hosting []string
	for pkg, hosts := range byPkg {
		if slices.Contains(hosts, deployment{namespace, queue}) {
			hosting = append(hosting, pkg)
		}
	}
	if len(hosting) == 1 {
		return hosting[0], true
	}
	return "", false
}

// MatchWorkflowID returns the workflows whose id_scheme the workflow ID fits and
// that a worker hosts in the namespace, one Target per hosting task queue, in
// declaration order. A workflow hosted only under a templated namespace or
// queue never matches.
func (d *Design) MatchWorkflowID(workflowID, namespace string) []Target {
	var out []Target
	for _, s := range d.schemes {
		if !ast.IDTemplateMatches(s.template, workflowID) {
			continue
		}
		for _, host := range d.defs[graph.DefKey(graph.KindWorkflow, s.name)][s.pkg] {
			if t := (Target{s.pkg, s.name, host.queue}); host.namespace == namespace && !slices.Contains(out, t) {
				out = append(out, t)
			}
		}
	}
	return out
}

// MatchNamespace returns the design's namespace families, as graph nodes, that
// the concrete namespace name fits, in node order. A name the design declares
// literally is its own and fits none.
func (d *Design) MatchNamespace(name string) []graph.Node {
	var out []graph.Node
	for _, n := range d.namespaces {
		switch {
		case n.Name == name:
			return nil
		case len(n.TemplateParams) > 0 && ast.IDTemplateMatches(n.Name, name):
			out = append(out, n)
		}
	}
	return out
}

// MatchWorker returns the design's worker families, as graph nodes, that the
// concrete task queue fits among the workers of the design's namespace of that
// name, in node order. A queue some worker there declares literally is its own
// and fits none.
func (d *Design) MatchWorker(namespace, queue string) []graph.Node {
	concrete := ast.Queue{Spelling: queue}
	var out []graph.Node
	for _, n := range d.workers[namespace] {
		deployed := ast.ParseDeployQueue(n.Queue)
		switch {
		case deployed.Form == ast.QueueOpaque && n.Queue == queue:
			return nil
		case deployed.Form == ast.QueueParsed && concrete.Overlaps(deployed):
			out = append(out, n)
		}
	}
	return out
}
