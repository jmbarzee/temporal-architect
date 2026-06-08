package graph

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// astIndex precomputes the lookups needed to enumerate deployment nodes
// and resolve dispatch edges. Built once per Extract call.
type astIndex struct {
	workflows     map[string]*ast.WorkflowDef
	activities    map[string]*ast.ActivityDef
	workers       map[string]*ast.WorkerDef
	namespaces    map[string]*ast.NamespaceDef
	nexusServices map[string]*ast.NexusServiceDef

	// One entry per (worker, namespace) pair from
	// NamespaceDef.Workers — i.e. one entry per worker deployment.
	workerDeployments []workerDeployment

	// Endpoint lookups: by name (resolver-enforced unique) and per
	// namespace. Used by routing.go for nexus dispatch.
	endpointsByName map[string]*endpointDeployment
}

// workerDeployment is one (worker × namespace × queue) instantiation —
// the seed for all of its hosted definitions.
type workerDeployment struct {
	WorkerName    string
	NamespaceName string
	Queue         string
	Line          int

	// worker is non-nil when the named worker definition resolves;
	// orphan-worker namespaces shouldn't really happen (the resolver
	// reports them as errors), but the graph stays robust if they do.
	worker *ast.WorkerDef
}

// endpointDeployment captures one nexus endpoint instantiation. The
// resolver enforces global uniqueness of endpoint names, so a single
// (namespace, queue) pair per endpoint is sufficient.
type endpointDeployment struct {
	Name      string
	Namespace string
	Queue     string
	Line      int
}

func indexAST(file *ast.File) *astIndex {
	idx := &astIndex{
		workflows:       map[string]*ast.WorkflowDef{},
		activities:      map[string]*ast.ActivityDef{},
		workers:         map[string]*ast.WorkerDef{},
		namespaces:      map[string]*ast.NamespaceDef{},
		nexusServices:   map[string]*ast.NexusServiceDef{},
		endpointsByName: map[string]*endpointDeployment{},
	}

	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			idx.workflows[d.Name] = d
		case *ast.ActivityDef:
			idx.activities[d.Name] = d
		case *ast.WorkerDef:
			idx.workers[d.Name] = d
		case *ast.NamespaceDef:
			idx.namespaces[d.Name] = d
		case *ast.NexusServiceDef:
			idx.nexusServices[d.Name] = d
		}
	}

	for _, ns := range idx.namespaces {
		for _, nw := range ns.Workers {
			idx.workerDeployments = append(idx.workerDeployments, workerDeployment{
				WorkerName:    nw.Worker.Name,
				NamespaceName: ns.Name,
				Queue:         taskQueue(nw.Options),
				Line:          nw.Line,
				worker:        idx.workers[nw.Worker.Name],
			})
		}
		for i := range ns.Endpoints {
			ep := &ns.Endpoints[i]
			idx.endpointsByName[ep.EndpointName] = &endpointDeployment{
				Name:      ep.EndpointName,
				Namespace: ns.Name,
				Queue:     taskQueue(ep.Options),
				Line:      ep.Line,
			}
		}
	}

	return idx
}

// taskQueue extracts the task_queue value from an options block, or ""
// if absent. Mirrors validator.extractTaskQueue — kept local so the
// graph package doesn't take a dependency on validator.
func taskQueue(opts *ast.OptionsBlock) string {
	if opts == nil {
		return ""
	}
	for _, e := range opts.Entries {
		if e.Key == "task_queue" {
			return e.Value
		}
	}
	return ""
}

// deploymentsOfWorker returns all (worker × namespace) instantiations
// of the named worker. Empty when the worker is uninstantiated.
func (idx *astIndex) deploymentsOfWorker(workerName string) []workerDeployment {
	out := make([]workerDeployment, 0)
	for _, wd := range idx.workerDeployments {
		if wd.WorkerName == workerName {
			out = append(out, wd)
		}
	}
	return out
}

// deploymentsHosting returns all worker deployments whose hosted set
// (workflows / activities / services, depending on kind) includes the
// named definition. Used to fan out registration → deployment nodes.
func (idx *astIndex) deploymentsHosting(kind, name string) []workerDeployment {
	out := make([]workerDeployment, 0)
	for _, wd := range idx.workerDeployments {
		if wd.worker == nil {
			continue
		}
		var hosted bool
		switch kind {
		case kindWorkflow:
			for _, r := range wd.worker.Workflows {
				if r.Name == name {
					hosted = true
					break
				}
			}
		case kindActivity:
			for _, r := range wd.worker.Activities {
				if r.Name == name {
					hosted = true
					break
				}
			}
		case kindNexusService:
			for _, r := range wd.worker.Services {
				if r.Name == name {
					hosted = true
					break
				}
			}
		}
		if hosted {
			out = append(out, wd)
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

// enumerateNodes walks the AST and emits one node per deployment per
// the rules in REVISIONS_003 § "Node enumeration rules". Order doesn't
// matter — finalize() sorts before serialization.
func (g *Graph) enumerateNodes(idx *astIndex) {
	for _, ns := range idx.namespaces {
		g.addNode(Node{
			ID:         namespaceID(ns.Name),
			Definition: defKey(kindNamespace, ns.Name),
		})
	}

	for _, wd := range idx.workerDeployments {
		// Namespace membership is the worker→namespace containment edge
		// (emitted in containment.go), not a denormalized field. Queue has
		// no edge equivalent and is intrinsic to the worker deployment, so
		// it stays.
		g.addNode(Node{
			ID:         workerID(wd.WorkerName, wd.NamespaceName),
			Definition: defKey(kindWorker, wd.WorkerName),
			Queue:      wd.Queue,
		})
	}

	for name := range idx.workers {
		if len(idx.deploymentsOfWorker(name)) == 0 {
			g.addNode(Node{
				ID:         workerID(name, ""),
				Definition: defKey(kindWorker, name),
				Orphan:     true,
			})
		}
	}

	for _, ep := range idx.endpointsByName {
		g.addNode(Node{
			ID:         endpointID(ep.Name, ep.Namespace),
			Definition: defKey(kindNexusEndpoint, ep.Name),
			Namespace:  namespaceID(ep.Namespace),
			Queue:      ep.Queue,
		})
	}

	for name := range idx.workflows {
		g.enumerateHosted(kindWorkflow, name, idx)
	}
	for name := range idx.activities {
		g.enumerateHosted(kindActivity, name, idx)
	}
	for name := range idx.nexusServices {
		g.enumerateHosted(kindNexusService, name, idx)
	}

	for _, svc := range idx.nexusServices {
		serviceDeployments := idx.deploymentsHosting(kindNexusService, svc.Name)
		for _, op := range svc.Operations {
			opName := nexusOpQualifiedName(svc.Name, op.Name)
			if len(serviceDeployments) == 0 {
				g.addNode(Node{
					ID:         hostedID(kindNexusOperation, opName, "", "", true),
					Definition: defKey(kindNexusOperation, opName),
					Orphan:     true,
				})
				continue
			}
			for _, wd := range serviceDeployments {
				g.addNode(Node{
					ID:         hostedID(kindNexusOperation, opName, wd.WorkerName, wd.NamespaceName, false),
					Definition: defKey(kindNexusOperation, opName),
					Worker:     defKey(kindWorker, wd.WorkerName),
					Namespace:  namespaceID(wd.NamespaceName),
					Queue:      wd.Queue,
				})
			}
		}
	}
}

// enumerateHosted emits one deployment node per worker that hosts the
// definition, or a single orphan node when no worker hosts it. Shared
// between workflows, activities, and nexus services.
func (g *Graph) enumerateHosted(kind, name string, idx *astIndex) {
	deployments := idx.deploymentsHosting(kind, name)
	if len(deployments) == 0 {
		g.addNode(Node{
			ID:         hostedID(kind, name, "", "", true),
			Definition: defKey(kind, name),
			Orphan:     true,
		})
		return
	}
	for _, wd := range deployments {
		n := Node{
			ID:         hostedID(kind, name, wd.WorkerName, wd.NamespaceName, false),
			Definition: defKey(kind, name),
		}
		// Worker/namespace membership is the containment edge, not a
		// denormalized field. The nexus tier is the exception: its
		// endpoint↔operation routing is still derived from these fields in
		// the visualizer pending nexus normalization (Reverse-History
		// Backlog), so nexus services keep them. Workflow/activity nodes do
		// not.
		if kind == kindNexusService {
			n.Worker = defKey(kindWorker, wd.WorkerName)
			n.Namespace = namespaceID(wd.NamespaceName)
			n.Queue = wd.Queue
		}
		g.addNode(n)
	}
}
