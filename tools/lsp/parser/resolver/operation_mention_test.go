package resolver

import (
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// kindsOf returns the error kinds in errs, in order.
func kindsOf(errs []*ResolveError) []ErrorKind {
	kinds := make([]ErrorKind, len(errs))
	for i, e := range errs {
		kinds[i] = e.Kind
	}
	return kinds
}

const opMentionServices = `package demo

nexus service Svc:
	async OpA workflow A
	async OpB workflow B

workflow A():
	close complete()

workflow B():
	close complete()
`

// TestWorkerRegistersOperationTwoSegments: `Svc.OpA` on a worker, where Svc is a
// same-package service with operation OpA, is read as an operation of Svc
// (#233). It reports WORKER_REGISTERS_OPERATION in place of
// QUALIFIED_REF_WITHOUT_IMPORT and rewrites the entry to the whole service.
func TestWorkerRegistersOperationTwoSegments(t *testing.T) {
	file := mustParse(t, opMentionServices+`
worker wa:
	nexus service Svc.OpA
`)
	errs := Resolve(file)
	if got := kindsOf(errs); !slices.Equal(got, []ErrorKind{ErrWorkerRegistersOperation}) {
		t.Fatalf("kinds = %v, want only WORKER_REGISTERS_OPERATION: %v", got, errs)
	}
	e := errs[0]
	want := "a worker registers a whole nexus service; Svc.OpA names operation OpA of Svc — register `nexus service Svc`, or move OpA into a service of its own"
	if e.Msg != want || e.Line != 14 || e.Column != 20 || e.Name != "wa" {
		t.Errorf("got %d:%d %q (Name %q), want 14:20 %q (Name wa)", e.Line, e.Column, e.Msg, e.Name, want)
	}
	w := file.Definitions[3].(*ast.WorkerDef)
	ref := w.Services[0]
	if ref.Package != "" || ref.Name != "Svc" || ref.Resolved == nil {
		t.Errorf("entry not rewritten to the whole service: %+v", ref)
	}
}

// TestWorkerQualifierStillPackageWhenNotAnOperation: the two-segment reading
// applies only when the second segment is an operation of the service; any
// other qualified entry keeps today's QUALIFIED_REF_WITHOUT_IMPORT.
func TestWorkerQualifierStillPackageWhenNotAnOperation(t *testing.T) {
	file := mustParse(t, opMentionServices+`
worker wa:
	nexus service Svc.Nope
`)
	errs := Resolve(file)
	if got := kindsOf(errs); !slices.Equal(got, []ErrorKind{ErrQualifiedRefWithoutImport}) {
		t.Fatalf("kinds = %v, want only QUALIFIED_REF_WITHOUT_IMPORT: %v", got, errs)
	}
}

// TestWorkerQualifierImportWins: an import binding named like a local service
// keeps the package reading of `Svc.OpA`.
func TestWorkerQualifierImportWins(t *testing.T) {
	file := mustParse(t, `package demo

import Svc "example.com/x/other"

nexus service Svc:
	async OpA workflow A

workflow A():
	close complete()

worker wa:
	nexus service Svc.OpA
`)
	errs := Resolve(file)
	if hasErrorKind(errs, ErrWorkerRegistersOperation) || hasErrorKind(errs, ErrQualifiedRefWithoutImport) {
		t.Fatalf("an import named Svc must qualify the entry, got %v", errs)
	}
}

// TestWorkerRegistersOperationThreeSegments: `pkg.Svc.Op` parses, keeps the
// worker, and always reports WORKER_REGISTERS_OPERATION. Unconfirmed (external
// or unimported service) it does not call the segment an operation; an
// unimported qualifier also keeps its own error, first.
func TestWorkerRegistersOperationThreeSegments(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   []ErrorKind
		msg    string
	}{
		{
			name:   "external service",
			header: "import \"example.com/x/pkg\"\n",
			want:   []ErrorKind{ErrUnresolvedImport, ErrWorkerRegistersOperation},
			msg:    "a worker registers a whole nexus service; pkg.Svc.OpA names OpA under service pkg.Svc — register `nexus service pkg.Svc`",
		},
		{
			name: "unimported qualifier",
			want: []ErrorKind{ErrQualifiedRefWithoutImport, ErrWorkerRegistersOperation},
			msg:  "a worker registers a whole nexus service; pkg.Svc.OpA names OpA under service pkg.Svc — register `nexus service pkg.Svc`",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := mustParse(t, "package demo\n\n"+tt.header+`
worker wa:
	nexus service pkg.Svc.OpA

namespace ns:
	worker wa
		options:
			task_queue: "q"
`)
			errs := Resolve(file)
			if got := kindsOf(errs); !slices.Equal(got, tt.want) {
				t.Fatalf("kinds = %v, want %v: %v", got, tt.want, errs)
			}
			for _, e := range errs {
				if e.Kind == ErrWorkerRegistersOperation && e.Msg != tt.msg {
					t.Errorf("msg = %q, want %q", e.Msg, tt.msg)
				}
			}
		})
	}
}

// TestWorkerRegistersOperationThreeSegmentsConfirmed: a resolved service with
// the named operation gets the confirmed message.
func TestWorkerRegistersOperationThreeSegmentsConfirmed(t *testing.T) {
	file := mustMerge(t, `# path: example.com/orders
package orders

nexus service Svc:
	async OpA workflow A

workflow A():
	close complete()
`, `package deploy

import "example.com/orders"

worker wa:
	nexus service orders.Svc.OpA
`)
	errs := Resolve(file)
	if got := kindsOf(errs); !slices.Equal(got, []ErrorKind{ErrWorkerRegistersOperation}) {
		t.Fatalf("kinds = %v, want only WORKER_REGISTERS_OPERATION: %v", got, errs)
	}
	if !strings.Contains(errs[0].Msg, "orders.Svc.OpA names operation OpA of orders.Svc") {
		t.Errorf("msg = %q", errs[0].Msg)
	}
}

// TestWorkerQualifierNotReadAsOperationOutsideOwnPackage: the two-segment
// reading needs a service declared in the worker's own package, and never
// applies to a qualifier naming that package.
func TestWorkerQualifierNotReadAsOperationOutsideOwnPackage(t *testing.T) {
	t.Run("service in another package", func(t *testing.T) {
		file := mustMerge(t, `package other

nexus service Svc:
	async OpA workflow A

workflow A():
	close complete()
`, `package demo

worker wa:
	nexus service Svc.OpA
`)
		errs := Resolve(file)
		if got := kindsOf(errs); !slices.Equal(got, []ErrorKind{ErrQualifiedRefWithoutImport}) {
			t.Fatalf("kinds = %v, want only QUALIFIED_REF_WITHOUT_IMPORT: %v", got, errs)
		}
	})
	t.Run("own-package qualifier", func(t *testing.T) {
		// A service named like the package, with an operation named like
		// another service: `demo.Svc` is still the own-package service Svc.
		file := mustParse(t, `package demo

nexus service demo:
	async Svc workflow A

nexus service Svc:
	async OpA workflow A

workflow A():
	close complete()

worker wa:
	nexus service demo.Svc
`)
		errs := Resolve(file)
		if len(errs) != 0 {
			t.Fatalf("unexpected errors: %v", errs)
		}
		w := file.Definitions[3].(*ast.WorkerDef)
		if len(w.OperationMentions) != 0 || w.Services[0].Resolved == nil || w.Services[0].Name != "Svc" {
			t.Errorf("entry misread: %+v, mentions %+v", w.Services[0], w.OperationMentions)
		}
	})
}
