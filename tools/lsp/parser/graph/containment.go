package graph

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// emitContainment produces one edge per (child, parent) deployment
// pair per the table in README.md § "Containment edges":
//
//	worker dep         → namespace
//	endpoint dep       → namespace
//	workflow dep       → worker dep
//	activity dep       → worker dep
//	service dep        → worker dep
//	nexusOp dep        → service dep (same worker, same namespace)
//
// Orphan nodes don't get containment edges.
//
// The child's declaration site is used, not a call site. For worker /
// endpoint deployments that's the NamespaceWorker / NamespaceEndpoint site.
// For hosted definitions it's the worker's registration of the definition —
// which is more precise than the definition's own declaration and reflects
// where the containment relationship was authored.
func (g *Graph) emitContainment(idx *astIndex) {
	for _, ep := range idx.endpointsByName {
		g.Edges = append(g.Edges, Edge{
			From: EndpointID(ep.Name, ep.Namespace),
			To:   NamespaceID(ep.Namespace),
			Kind: EdgeContainment,
			Site: ep.Site,
		})
	}

	// A worker instantiated twice in one namespace is one node, so only its
	// first instantiation emits edges.
	seen := map[string]bool{}
	for _, wd := range idx.workerDeployments {
		id := WorkerID(wd.WorkerName, wd.NamespaceName)
		if seen[id] {
			continue
		}
		seen[id] = true
		g.Edges = append(g.Edges, Edge{
			From: id,
			To:   NamespaceID(wd.NamespaceName),
			Kind: EdgeContainment,
			Site: wd.Site,
		})
		if wd.worker == nil {
			continue
		}
		emitHostedContainment(g, wd, KindWorkflow, refSites(wd.worker.Workflows, wd.worker.SourceFile, idx))
		emitHostedContainment(g, wd, KindActivity, refSites(wd.worker.Activities, wd.worker.SourceFile, idx))
		emitHostedContainment(g, wd, KindNexusService, refSites(wd.worker.Services, wd.worker.SourceFile, idx))
		for _, r := range wd.worker.Services {
			svcQName, ok := hostedRefQName(r, idx)
			svc := idx.nexusServices[svcQName]
			if !ok || svc == nil {
				continue
			}
			for _, op := range ast.FirstDeclared(svc.Operations) {
				opName := NexusOpQualifiedName(svcQName, op.Name)
				g.Edges = append(g.Edges, Edge{
					From: HostedID(KindNexusOperation, opName, wd.WorkerName, wd.NamespaceName, false),
					To:   HostedID(KindNexusService, svcQName, wd.WorkerName, wd.NamespaceName, false),
					Kind: EdgeContainment,
					Site: ast.SiteOf(svc.SourceFile, op),
				})
			}
		}
	}
}

// refSite is a flat (qualified name, site) pair used by emitHostedContainment
// so the same emission helper works across Workflows / Activities / Services
// without generics gymnastics for the per-element site. Name is the ref's
// QUALIFIED target name (package-aware) so the containment child ID matches the
// hosted definition node's ID.
type refSite struct {
	Name string
	Site ast.Site
}

func refSites[T interface {
	comparable
	ast.Packaged
}](refs []ast.Ref[T], file string, idx *astIndex) []refSite {
	out := make([]refSite, 0, len(refs))
	for _, r := range refs {
		if name, ok := hostedRefQName(r, idx); ok {
			out = append(out, refSite{Name: name, Site: ast.SiteOf(file, r)})
		}
	}
	return out
}

func emitHostedContainment(g *Graph, wd workerDeployment, kind string, refs []refSite) {
	for _, r := range refs {
		g.Edges = append(g.Edges, Edge{
			From: HostedID(kind, r.Name, wd.WorkerName, wd.NamespaceName, false),
			To:   WorkerID(wd.WorkerName, wd.NamespaceName),
			Kind: EdgeContainment,
			Site: r.Site,
		})
	}
}
