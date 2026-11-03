package validator

import (
	"strings"
	"testing"
)

// dupNamesPkg declares workflow Run, activity Do, and nexus service Svc in pkg.
func dupNamesPkg(pkg string) namedSource {
	return namedSource{pkg + ".twf", "package " + pkg + `

workflow Run(id):
    close complete(id)

activity Do(id):
    return id

nexus service Svc:
    async Start workflow Run
`}
}

// TestWorkerDuplicateTypeName: a worker holds one type per name and kind, as
// Temporal registers by name; a package qualifier does not tell two apart.
func TestWorkerDuplicateTypeName(t *testing.T) {
	const at = "error WORKER_DUPLICATE_TYPE_NAME "
	const tail = "; Temporal registers types by name, not package, so one worker can hold only one of them"
	tests := []struct {
		name    string
		entries []string // registrations of worker shared in package topo
		want    []string
	}{
		{"one per kind", []string{"nexus service a.Svc", "nexus service b.Svc", "workflow a.Run", "workflow b.Run", "activity a.Do", "activity b.Do"}, []string{
			at + `12:5 shared topo.twf: worker shared registers workflow a.Run and workflow b.Run under one name, "Run"` + tail,
			at + `14:5 shared topo.twf: worker shared registers activity a.Do and activity b.Do under one name, "Do"` + tail,
			at + `10:5 shared topo.twf: worker shared registers nexus service a.Svc and nexus service b.Svc under one name, "Svc"` + tail,
		}},
		{"each later entry", []string{"workflow a.Run", "workflow b.Run", "workflow c.Run"}, []string{
			at + `10:5 shared topo.twf: worker shared registers workflow a.Run and workflow b.Run under one name, "Run"` + tail,
			at + `11:5 shared topo.twf: worker shared registers workflow a.Run and workflow c.Run under one name, "Run"` + tail,
		}},
		{"own package qualified", []string{"workflow Run", "workflow topo.Run"}, nil},
		{"own package beside another", []string{"workflow Run", "workflow a.Run"}, []string{
			at + `10:5 shared topo.twf: worker shared registers workflow topo.Run and workflow a.Run under one name, "Run"` + tail,
		}},
		{"different kinds", []string{"workflow a.Run", "activity b.Do", "nexus service c.Svc"}, nil},
		{"unresolved skipped", []string{"workflow ext.Run", "workflow a.Run"}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			topo := `package topo

import "x/a"
import "x/b"
import "x/c"
import "x/ext"

worker shared:
    ` + strings.Join(tt.entries, "\n    ") + `

workflow Run(id):
    close complete(id)

namespace prod:
    worker shared
        options:
            task_queue: "q"
`
			file := mustMergeNamedAndResolve(t, dupNamesPkg("a"), dupNamesPkg("b"), dupNamesPkg("c"), namedSource{"topo.twf", topo})
			checkRendered(t, render(Validate(file), ErrWorkerDuplicateTypeName), tt.want)
		})
	}
}

// TestWorkerDuplicateTypeNameSeparateWorkers: same-named types on different
// workers never meet.
func TestWorkerDuplicateTypeNameSeparateWorkers(t *testing.T) {
	topo := namedSource{"topo.twf", `package topo

import "x/a"
import "x/b"

worker left:
    nexus service a.Svc
    workflow a.Run
    activity a.Do

worker right:
    nexus service b.Svc
    workflow b.Run
    activity b.Do

namespace prod:
    worker left
        options:
            task_queue: "left"
    worker right
        options:
            task_queue: "right"
`}
	errs := Validate(mustMergeNamedAndResolve(t, dupNamesPkg("a"), dupNamesPkg("b"), topo))
	checkRendered(t, render(errs, ErrWorkerDuplicateTypeName), nil)
}
