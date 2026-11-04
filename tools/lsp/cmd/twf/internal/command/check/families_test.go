package check_test

import (
	"os"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/clitest"
)

// aivearium is issue #229's design: a sandbox sidecar family that the Agent
// workflow reaches by interpolating its lease. Its line numbers are the ones
// the per-instance family examples (spec 03) are written against.
const aivearium = `package aivearium

workflow Sandbox(sandboxId: SandboxId, assets: Assets, requester: Identity):
    id_scheme: "sandbox/{sandboxId}"
    activity Provision(sandboxId, assets) -> lease
    close complete()

workflow Agent(task: Task, lease: Lease):
    activity RunTool(task.call) -> output
        options:
            task_queue: "sandbox-{lease.sandboxId}"
            schedule_to_start_timeout: 30s
            start_to_close_timeout: 5m
    close complete(output)

activity Provision(sandboxId: SandboxId, assets: Assets) -> (Lease):
    return lease

activity RunTool(call: ToolCall) -> (ToolOutput):
    return run(call)

worker control:
    workflow Sandbox
    workflow Agent
    activity Provision

worker sidecar:
    activity RunTool

namespace aivearium:
    worker control
        options:
            task_queue: "control"
    worker sidecar
        options:
            task_queue: "sandbox-{sandboxId}"
`

// edit is one line-level change to aivearium, by 1-based line number.
type edit func(lines []string) []string

func replace(n int, text string) edit {
	return func(l []string) []string { l[n-1] = text; return l }
}

func remove(n int) edit {
	return func(l []string) []string { return append(l[:n-1:n-1], l[n:]...) }
}

// insert puts text at line n, so the old line n follows it.
func insert(n int, text ...string) edit {
	return func(l []string) []string { return append(l[:n-1:n-1], append(text, l[n-1:]...)...) }
}

func appendLines(text ...string) edit {
	return func(l []string) []string { return append(l[:len(l)-1:len(l)-1], append(text, "")...) }
}

func variant(edits ...edit) string {
	lines := strings.Split(aivearium, "\n")
	for _, e := range edits {
		lines = e(lines)
	}
	return strings.Join(lines, "\n")
}

// TestCheckPerInstanceFamilies runs `twf check` on each example of the
// per-instance worker family design (issue #229) and asserts its exact output.
func TestCheckPerInstanceFamilies(t *testing.T) {
	const ok = "✓ OK: 2 workflow(s), 2 activity(s)\n"
	tests := []struct {
		name   string
		file   string // base name of the one input file
		src    string
		code   int
		stderr string
		stdout string
	}{
		{name: "the issue's design", src: aivearium, stdout: ok},
		{name: "a learned queue", src: variant(replace(11, `            task_queue: "{lease.queue}"`)), stdout: ok},
		{name: "a family inside a namespace family", src: variant(replace(30, "namespace tenant-{org}:")), stdout: ok},
		{
			name:   "a namespace parameter spelled in a queue",
			src:    variant(replace(30, "namespace tenant-{org}:"), replace(36, `            task_queue: "sandbox-{org}"`)),
			stdout: ok,
		},
		{
			name: "an endpoint family on a static queue",
			file: "shard.twf",
			src: `nexus service Bootstrap:
    sync Start(req: Req) -> (Resp):
        return start(req)

worker shard:
    nexus service Bootstrap

namespace shard-{org}:
    worker shard
        options:
            task_queue: "bootstrap"
    nexus endpoint shard-{org}-Bootstrap
        options:
            task_queue: "bootstrap"
`,
			stdout: "✓ OK: 0 workflow(s), 0 activity(s)\n",
		},
		{
			name: "1. a static call to a family",
			src:  variant(replace(11, `            task_queue: "sandbox"`)),
			code: 1,
			stderr: `error [validate/EXPLICIT_ROUTING_MISMATCH] at aivearium.twf:9:5: activity RunTool has task_queue "sandbox", but no worker on that queue in namespace aivearium registers it
Partial parse: 2 workflow(s), 2 activity(s), 1 error(s), 0 warning(s)
`,
		},
		{
			name: "2. a parameter-count mismatch",
			src:  variant(replace(11, `            task_queue: "sandbox-{lease.region}-{lease.sandboxId}"`)),
			code: 1,
			stderr: `error [validate/EXPLICIT_ROUTING_MISMATCH] at aivearium.twf:9:5: activity RunTool has task_queue "sandbox-{lease.region}-{lease.sandboxId}", but no worker polling a queue of that shape in namespace aivearium registers it
Partial parse: 2 workflow(s), 2 activity(s), 1 error(s), 0 warning(s)
`,
		},
		{
			name: "3. an unbounded wait",
			src:  variant(remove(12)),
			stderr: `hint [validate/INSTANCE_QUEUE_NO_START_TIMEOUT] at aivearium.twf:9:5: activity RunTool routes to the per-instance queue family "sandbox-{sandboxId}" in namespace aivearium with neither schedule_to_start_timeout nor schedule_to_close_timeout: if instances are short-lived, a task for a vanished instance waits until the calling workflow's own timeout or cancellation
`,
			stdout: ok,
		},
		{
			name: "4. a static queue a family member could take",
			src: variant(
				insert(27, "worker pool:", "    activity RunTool", ""),
				appendLines("    worker pool", "        options:", `            task_queue: "sandbox-pool"`),
			),
			stderr: `hint [validate/TASK_QUEUE_OVERLAP] at aivearium.twf:42:13: task_queue "sandbox-pool" of worker pool and "sandbox-{sandboxId}" of worker sidecar could name the same queue in namespace aivearium
`,
			stdout: ok,
		},
		{
			name: "5. two spellings of one family with different types",
			src: variant(
				insert(29, "", "worker sidecar2:", "    activity Provision"),
				appendLines("    worker sidecar2", "        options:", `            task_queue: "sandbox-{id}"`),
			),
			code: 1,
			stderr: `error [validate/TASK_QUEUE_MISMATCH] at aivearium.twf:40:5: workers sidecar and sidecar2 on task queues "sandbox-{sandboxId}" and "sandbox-{id}" in namespace aivearium have different type sets
Partial parse: 2 workflow(s), 2 activity(s), 1 error(s), 0 warning(s)
`,
		},
		{
			name: "6. a malformed family queue",
			src:  variant(replace(36, `            task_queue: "sandbox{a}{b}"`)),
			code: 1,
			stderr: `error [resolve/QUEUE_TEMPLATE_MALFORMED] at aivearium.twf:36:13: task_queue "sandbox{a}{b}" of worker sidecar in namespace aivearium is not a well-formed template: parameters must be separated by fixed text
error [validate/EXPLICIT_ROUTING_MISMATCH] at aivearium.twf:9:5: activity RunTool has task_queue "sandbox-{lease.sandboxId}", but no worker polling a queue of that shape in namespace aivearium registers it
Partial parse: 2 workflow(s), 2 activity(s), 2 error(s), 0 warning(s)
`,
		},
		{
			name: "7. a workflow on a family",
			src:  variant(insert(28, "    workflow Agent")),
			stderr: `hint [validate/INSTANCE_FAMILY_HOSTS_WORKFLOW] at aivearium.twf:35:5: worker sidecar hosts workflow Agent on the per-instance queue family "sandbox-{sandboxId}" in namespace aivearium: if an instance goes away for good, its executions stall until their own timeout; short-lived families should host workflows on a shared queue
`,
			stdout: ok,
		},
		{
			name: "8. a versioned family",
			src:  variant(insert(37, "            versioning: deployment")),
			stderr: `hint [validate/INSTANCE_FAMILY_VERSIONED] at aivearium.twf:37:13: worker sidecar in namespace aivearium is a per-instance family on "sandbox-{sandboxId}" with versioning: deployment; a deployment version accepts at most 100 distinct task queues over its life, so new instance queues are refused once that many have registered
`,
			stdout: ok,
		},
		{
			name: "9. a learned queue with no family",
			src:  variant(replace(11, `            task_queue: "{lease.queue}"`), replace(36, `            task_queue: "sandbox"`)),
			code: 1,
			stderr: `error [validate/EXPLICIT_ROUTING_MISMATCH] at aivearium.twf:9:5: activity RunTool has a learned task_queue "{lease.queue}", but no per-instance worker family in namespace aivearium registers it; a .twf learned queue names a family member (model a static set as a family or as static calls)
Partial parse: 2 workflow(s), 2 activity(s), 1 error(s), 0 warning(s)
`,
		},
		{
			name: "10. worker_identity, and an endpoint queue with a parameter",
			file: "ep.twf",
			src: `package aivearium

nexus service Tools:
    sync Run(call: ToolCall) -> (ToolOutput):
        return run(call)

worker sidecar:
    nexus service Tools

namespace aivearium:
    worker sidecar
        options:
            task_queue: "sandbox-{sandboxId}"
            worker_identity: "sidecar-{podName}"
    nexus endpoint SandboxTools
        options:
            task_queue: "sandbox-{sandboxId}"
`,
			code: 1,
			stderr: `error [resolve/ENDPOINT_TASK_QUEUE_TEMPLATED] at ep.twf:17:13: task_queue "sandbox-{sandboxId}" of nexus endpoint SandboxTools in namespace aivearium has a {sandboxId} parameter: an endpoint targets one task queue in its namespace
warning [validate/INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE] at ep.twf:11:5: worker sidecar registers nexus service Tools on the per-instance queue family "sandbox-{sandboxId}" in namespace aivearium, but a .twf endpoint targets one static queue, so no endpoint in this design reaches it; put the service on a static queue and route on from an async operation's workflow
Partial parse: 0 workflow(s), 0 activity(s), 1 error(s), 1 warning(s)
`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			name := tt.file
			if name == "" {
				name = "aivearium.twf"
			}
			// Run from the file's directory: diagnostics spell the file as given.
			t.Chdir(t.TempDir())
			if err := os.WriteFile("twf.mod", []byte("module aivearium\n"), 0o644); err != nil {
				t.Fatal(err)
			}
			path := name
			if err := os.WriteFile(path, []byte(tt.src), 0o644); err != nil {
				t.Fatal(err)
			}
			var code int
			var stderr string
			var errErr error
			stdout, err := clitest.CaptureStdout(func() {
				stderr, errErr = clitest.CaptureStderr(func() { code = runCheck([]string{path}) })
			})
			if err != nil || errErr != nil {
				t.Fatal(err, errErr)
			}
			if code != tt.code || stderr != tt.stderr || stdout != tt.stdout {
				t.Errorf("twf check exit %d\nstderr:\n%s\nstdout:\n%s\nwant exit %d\nstderr:\n%s\nstdout:\n%s", code, stderr, stdout, tt.code, tt.stderr, tt.stdout)
			}
		})
	}
}
