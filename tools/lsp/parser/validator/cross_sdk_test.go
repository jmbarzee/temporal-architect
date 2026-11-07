package validator

import (
	"fmt"
	"testing"
)

// crossSDKFile is a design whose calls run from worker callers to worker
// callees, annotated with the given `@sdk` lines: an activity call, a child
// start, an awaited promise, a Nexus call, and a client start from a sync Nexus
// body.
const crossSDKFile = `workflow Caller():
	activity Act()
	workflow Child()
	promise p <- activity Act()
	await p
	nexus RemoteEp Remote.Op()
	close complete()

activity Act():
	default_options:
		task_queue: "callees"
	return x

workflow Child():
	default_options:
		task_queue: "callees"
	close complete()

nexus service Svc:
	sync Start() -> (R):
		workflow Child()
		return x

nexus service Remote:
	sync Op() -> (R):
		return x

namespace ns:
	worker callers
		options:
			task_queue: "callers"
	worker callees
		options:
			task_queue: "callees"
	nexus endpoint RemoteEp
		options:
			task_queue: "callees"

%sworker callers:
	workflow Caller
	nexus service Svc

%sworker callees:
	activity Act
	workflow Child
	nexus service Remote
`

// TestCrossSDKCall: each call whose caller's and callee's `@sdk` sets are both
// declared and disjoint is one hint; a shared SDK or a side with no `@sdk` is
// none.
func TestCrossSDKCall(t *testing.T) {
	const ref = "; read skills/temporal-architect/reference/cross-sdk.md"
	tests := []struct {
		name, callers, callees string
		want                   []string
	}{
		{"disjoint", "@sdk(go)\n", "@sdk(python)\n", []string{
			"hint CROSS_SDK_CALL 2:2 Act : activity Act runs on python and its caller on go" + ref,
			"hint CROSS_SDK_CALL 3:2 Child : workflow Child runs on python and its caller on go" + ref,
			"hint CROSS_SDK_CALL 4:2 Act : activity Act runs on python and its caller on go" + ref,
			"hint CROSS_SDK_CALL 6:2 Remote.Op : nexus operation Remote.Op runs on python and its caller on go" + ref,
			"hint CROSS_SDK_CALL 21:3 Child : workflow Child runs on python and its caller on go" + ref,
		}},
		{"overlap", "@sdk(go)\n@sdk(python)\n", "@sdk(python)\n", nil},
		{"same", "@sdk(go)\n", "@sdk(go)\n", nil},
		{"no caller sdk", "", "@sdk(python)\n", nil},
		{"no callee sdk", "@sdk(go)\n", "", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := resolvedAllowingErrors(t, fmt.Sprintf(crossSDKFile, tt.callers, tt.callees))
			checkRendered(t, render(Validate(file), ErrCrossSDKCall), tt.want)
		})
	}
}

// TestCrossSDKCallFromSeveralWorkers: a caller hosted on several workers is
// hinted when any of its deployments calls across SDKs, naming that one's SDK.
func TestCrossSDKCallFromSeveralWorkers(t *testing.T) {
	file := resolvedAllowingErrors(t, `workflow W():
	activity A()
	close complete()

activity A():
	default_options:
		task_queue: "a"
	return x

@sdk(go)
worker goW:
	workflow W

@sdk(python)
worker pyW:
	workflow W

@sdk(python)
worker aW:
	activity A

namespace ns:
	worker goW
		options:
			task_queue: "go"
	worker pyW
		options:
			task_queue: "py"
	worker aW
		options:
			task_queue: "a"
`)
	checkRendered(t, render(Validate(file), ErrCrossSDKCall), []string{
		"hint CROSS_SDK_CALL 2:2 A : activity A runs on python and its caller on go; read skills/temporal-architect/reference/cross-sdk.md",
	})
}
