package validator

import "testing"

// TestWorkerMultiSDK: a worker implemented in more than one SDK is a warning
// at its second `@sdk`; one implementation is not.
func TestWorkerMultiSDK(t *testing.T) {
	const body = "worker w:\n\tactivity A\n\nactivity A():\n\treturn x\n"
	tests := []struct {
		name, above string
		want        []string
	}{
		{"one", "@sdk(go, \"main.go\")\n", nil},
		{"two", "@sdk(go, \"main.go\")\n@sdk(typescript)\n", []string{
			"warning WORKER_MULTI_SDK 2:1 w : worker w has implementations in 2 SDKs; every implementation must replay its workflows identically, so justify the pattern explicitly next to the annotations",
		}},
		{"three", "@sdk(go)\n@sdk(java)\n@sdk(python)\n", []string{
			"warning WORKER_MULTI_SDK 2:1 w : worker w has implementations in 3 SDKs; every implementation must replay its workflows identically, so justify the pattern explicitly next to the annotations",
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := resolvedAllowingErrors(t, tt.above+body)
			checkRendered(t, render(Validate(file), ErrWorkerMultiSDK), tt.want)
		})
	}
}
