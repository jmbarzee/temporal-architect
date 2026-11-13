package graph

import (
	"slices"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// astIndex precomputes the lookups needed to enumerate deployment nodes
// and resolve dispatch edges. Built once per Extract call.
//
// The workflow / activity / nexus-service maps are keyed by the definition's
// QUALIFIED name (ast.QualifiedName(pkg, name)) so same-named definitions in
// different packages are distinct entries — the lockstep with the
// package-aware resolver (issue #109). Endpoints stay flat-global; workers and
// namespaces keep bare-name identity. file is the merged file, whose sole
// package is the fallback for a def the merge left unstamped.
type astIndex struct {
	file          *ast.File
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
	Queue         string    // the raw spelling, the worker node's display queue
	queue         ast.Queue // Queue as the deploy side parses it, for routing
	Site          ast.Site
	// TemplateParams is the instantiation's instance parameters.
	TemplateParams []string

	// worker is non-nil when the named worker definition resolves;
	// orphan-worker namespaces shouldn't really happen (the resolver
	// reports them as errors), but the graph stays robust if they do.
	worker *ast.WorkerDef
}

// sdks are the implementations of the deployment's worker, inherited by every
// node it hosts.
func (wd workerDeployment) sdks() []ast.SDKJSON {
	if wd.worker == nil {
		return nil
	}
	return ast.MarshalSDKs(wd.worker.SDKs)
}

// endpointDeployment captures one nexus endpoint instantiation. The
// resolver enforces global uniqueness of endpoint names, so a single
// (namespace, queue) pair per endpoint is sufficient.
type endpointDeployment struct {
	Name           string
	Namespace      string
	Queue          string
	Site           ast.Site
	TemplateParams []string
	// templated marks a queue with a parameter, an ENDPOINT_TASK_QUEUE_TEMPLATED
	// resolve error: the endpoint routes nowhere, so nothing is drawn through it.
	templated bool
}

func indexAST(file *ast.File) *astIndex {
	idx := &astIndex{
		file:            file,
		workflows:       map[string]*ast.WorkflowDef{},
		activities:      map[string]*ast.ActivityDef{},
		workers:         map[string]*ast.WorkerDef{},
		namespaces:      map[string]*ast.NamespaceDef{},
		nexusServices:   map[string]*ast.NexusServiceDef{},
		endpointsByName: map[string]*endpointDeployment{},
	}

	// A name declared twice (a DUPLICATE_* resolve error) is its first
	// declaration's, as the resolver keeps it. kept is the namespace the
	// resolver keeps for each (package, name).
	kept := map[string]*ast.NamespaceDef{}
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			keepFirst(idx.workflows, idx.defQName(d, d.Name), d)
		case *ast.ActivityDef:
			keepFirst(idx.activities, idx.defQName(d, d.Name), d)
		case *ast.WorkerDef:
			keepFirst(idx.workers, d.Name, d)
		case *ast.NamespaceDef:
			keepFirst(idx.namespaces, d.Name, d)
			keepFirst(kept, idx.defQName(d, d.Name), d)
		case *ast.NexusServiceDef:
			keepFirst(idx.nexusServices, idx.defQName(d, d.Name), d)
		}
	}

	for _, ns := range idx.namespaces {
		for _, nw := range ns.Workers {
			queue := taskQueue(nw.Options)
			idx.workerDeployments = append(idx.workerDeployments, workerDeployment{
				WorkerName:     nw.Worker.Name,
				NamespaceName:  ns.Name,
				Queue:          queue,
				queue:          ast.ParseDeployQueue(queue),
				Site:           ast.SiteOf(ns.SourceFile, nw),
				TemplateParams: nw.TemplateParams,
				worker:         idx.workers[nw.Worker.Name],
			})
		}
	}

	// An endpoint name declared twice (DUPLICATE_ENDPOINT) is its first
	// declaration's, as the resolver binds it: walk the namespaces it keeps in
	// definition order.
	for _, def := range file.Definitions {
		ns, ok := def.(*ast.NamespaceDef)
		if !ok || kept[idx.defQName(ns, ns.Name)] != ns {
			continue
		}
		for i := range ns.Endpoints {
			ep := &ns.Endpoints[i]
			if idx.endpointsByName[ep.EndpointName] != nil {
				continue
			}
			queue := taskQueue(ep.Options)
			idx.endpointsByName[ep.EndpointName] = &endpointDeployment{
				Name:           ep.EndpointName,
				Namespace:      ns.Name,
				Queue:          queue,
				Site:           ast.SiteOf(ns.SourceFile, ep),
				TemplateParams: ep.TemplateParams,
				templated:      len(ast.ExtractTemplateParams(queue)) > 0,
			}
		}
	}

	return idx
}

// keepFirst sets m[k] to v unless k is already set.
func keepFirst[V any](m map[string]V, k string, v V) {
	if _, ok := m[k]; !ok {
		m[k] = v
	}
}

// defQName is the qualified name of a definition — ast.QualifiedName(effective
// package, name), where the effective package is the def's runtime stamp or the
// file's package. It is the name element of every workflow / activity /
// nexus-service (and derived nexus-operation) node ID.
func (idx *astIndex) defQName(def ast.Packaged, name string) string {
	return ast.QualifiedName(ast.PackageIDOf(def, idx.file), name)
}

// hostedRefQName is the qualified target name of a worker registration ref: the
// package it resolved to joined with the ref name, so a worker in package P
// registering a same-named workflow hosts P's copy — not a same-named workflow
// in another package. ok is false for a ref that did not resolve (external,
// undefined): it hosts nothing, so it emits no containment and matches no node.
func hostedRefQName[T interface {
	comparable
	ast.Packaged
}](r ast.Ref[T], idx *astIndex) (name string, ok bool) {
	var zero T
	if r.Resolved == zero {
		return "", false
	}
	return ast.QualifiedName(ast.PackageIDOf(r.Resolved, idx.file), r.Name), true
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
		case KindWorkflow:
			for _, r := range wd.worker.Workflows {
				if q, ok := hostedRefQName(r, idx); ok && q == name {
					hosted = true
					break
				}
			}
		case KindActivity:
			for _, r := range wd.worker.Activities {
				if q, ok := hostedRefQName(r, idx); ok && q == name {
					hosted = true
					break
				}
			}
		case KindNexusService:
			for _, r := range wd.worker.Services {
				if q, ok := hostedRefQName(r, idx); ok && q == name {
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
// the rules in README.md § "Node enumeration rules". Order doesn't
// matter — finalize() sorts before serialization.
func (g *Graph) enumerateNodes(idx *astIndex) {
	for _, ns := range idx.namespaces {
		g.addNode(Node{
			ID:             NamespaceID(ns.Name),
			Definition:     DefKey(KindNamespace, ns.Name),
			Name:           ns.Name,
			TemplateParams: ns.TemplateParams,
		})
	}

	for _, wd := range idx.workerDeployments {
		// A worker instantiated twice in one namespace is one node: it keeps
		// the first instantiation's queue and unions the instance parameters.
		id := WorkerID(wd.WorkerName, wd.NamespaceName)
		if n := g.node(id); n != nil {
			for _, p := range wd.TemplateParams {
				if !slices.Contains(n.TemplateParams, p) {
					n.TemplateParams = append(slices.Clip(n.TemplateParams), p)
				}
			}
			continue
		}
		// Namespace membership is the worker→namespace containment edge
		// (emitted in containment.go), not a denormalized field. Queue has
		// no edge equivalent and is intrinsic to the worker deployment, so
		// it stays.
		g.addNode(Node{
			ID:             id,
			Definition:     DefKey(KindWorker, wd.WorkerName),
			Name:           wd.WorkerName,
			Queue:          wd.Queue,
			TemplateParams: wd.TemplateParams,
			SDKs:           wd.sdks(),
		})
	}

	for name, w := range idx.workers {
		if len(idx.deploymentsOfWorker(name)) == 0 {
			g.addNode(Node{
				ID:         WorkerID(name, ""),
				Definition: DefKey(KindWorker, name),
				Name:       name,
				SDKs:       ast.MarshalSDKs(w.SDKs),
				Orphan:     true,
			})
		}
	}

	for _, ep := range idx.endpointsByName {
		// Namespace membership is the endpoint→namespace containment edge;
		// the endpoint↔operation relationship is the nexusRoute edge. Only
		// Queue (intrinsic, display-only) stays on the node.
		g.addNode(Node{
			ID:             EndpointID(ep.Name, ep.Namespace),
			Definition:     DefKey(KindNexusEndpoint, ep.Name),
			Name:           ep.Name,
			Queue:          ep.Queue,
			TemplateParams: ep.TemplateParams,
		})
	}

	for qname, d := range idx.workflows {
		g.enumerateHosted(KindWorkflow, qname, d.Name, ast.PackageIDOf(d, idx.file), idx)
	}
	for qname, d := range idx.activities {
		g.enumerateHosted(KindActivity, qname, d.Name, ast.PackageIDOf(d, idx.file), idx)
	}
	for qname, d := range idx.nexusServices {
		g.enumerateHosted(KindNexusService, qname, d.Name, ast.PackageIDOf(d, idx.file), idx)
	}

	for _, svc := range idx.nexusServices {
		svcQName := idx.defQName(svc, svc.Name)
		serviceDeployments := idx.deploymentsHosting(KindNexusService, svcQName)
		pkg := ast.PackageIDOf(svc, idx.file)
		for _, op := range svc.Operations {
			opName := NexusOpQualifiedName(svcQName, op.Name)
			bare := NexusOpQualifiedName(svc.Name, op.Name)
			if len(serviceDeployments) == 0 {
				g.addNode(Node{
					ID:         HostedID(KindNexusOperation, opName, "", "", true),
					Definition: DefKey(KindNexusOperation, opName),
					Name:       bare,
					PackageID:  pkg,
					Orphan:     true,
				})
				continue
			}
			for _, wd := range serviceDeployments {
				// Namespace is the containment parent (operation → service →
				// worker → namespace); the endpoint↔operation relationship is
				// the nexusRoute edge. Worker and Queue stay as display
				// metadata only.
				g.addNode(Node{
					ID:         HostedID(KindNexusOperation, opName, wd.WorkerName, wd.NamespaceName, false),
					Definition: DefKey(KindNexusOperation, opName),
					Name:       bare,
					PackageID:  pkg,
					Worker:     DefKey(KindWorker, wd.WorkerName),
					Queue:      wd.Queue,
					SDKs:       wd.sdks(),
				})
			}
		}
	}
}

// enumerateHosted emits one deployment node per worker that hosts the
// definition, or a single orphan node when no worker hosts it. name is the
// definition's qualified name, bare and pkg its name and package identity. Shared
// between workflows, activities, and nexus services.
func (g *Graph) enumerateHosted(kind, name, bare, pkg string, idx *astIndex) {
	deployments := idx.deploymentsHosting(kind, name)
	if len(deployments) == 0 {
		g.addNode(Node{
			ID:         HostedID(kind, name, "", "", true),
			Definition: DefKey(kind, name),
			Name:       bare,
			PackageID:  pkg,
			Orphan:     true,
		})
		return
	}
	for _, wd := range deployments {
		n := Node{
			ID:         HostedID(kind, name, wd.WorkerName, wd.NamespaceName, false),
			Definition: DefKey(kind, name),
			Name:       bare,
			PackageID:  pkg,
			SDKs:       wd.sdks(),
		}
		// Worker/namespace membership is the containment edge, not a
		// denormalized field. nexusService is the lone exception: it still
		// carries Worker/Namespace/Queue (not part of the endpoint↔operation
		// normalization). Workflow/activity nodes — and now nexusEndpoint /
		// nexusOperation — do not.
		if kind == KindNexusService {
			n.Worker = DefKey(KindWorker, wd.WorkerName)
			n.Namespace = NamespaceID(wd.NamespaceName)
			n.Queue = wd.Queue
		}
		g.addNode(n)
	}
}
