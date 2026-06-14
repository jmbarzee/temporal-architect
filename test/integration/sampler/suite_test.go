//go:build integration

package integration

import "testing"

// TestSamplerSuite runs every case through the direct-call harness in parallel.
// Each case gets its own dev server, so cases cannot pollute one another.
func TestSamplerSuite(t *testing.T) {
	if testing.Short() {
		t.Skip("integration suite: skipped in -short mode")
	}
	for _, c := range cases() {
		c := c
		t.Run(c.Name, func(t *testing.T) { runCase(t, c) })
	}
}

// cases is the suite registry: one constructor per scenario. Each case (and its
// workflow/activity fixtures) lives in the cases_*_test.go file for the graph
// feature it exercises. The harness model and matchers live in harness_test.go.
func cases() []Case {
	return []Case{
		// Activity dispatch (cases_activities_test.go).
		singleWorkflowActivity(),
		workflowNoDispatch(),
		workflowMultipleDistinctActivities(),
		workflowRepeatedActivity(),
		fanOutSameActivity(),
		multipleWorkflowsSharedActivity(),

		// Child workflows + coarsening (cases_children_test.go).
		parentChildSameQueue(),
		parentChildSameQueueDedup(),
		parentChildCrossQueue(),
		parentChildCrossNamespace(),
		crossNamespaceMultiNamespaceGraph(),

		// Sampling coverage (cases_sampling_test.go).
		multiTypeSingleNamespace(),
		variedCallPatternsPerType(),
		variedCallPatternsRareBranch(),
		lowVolumeTypeMinPerType(),
		highVolumeSamplingSufficiency(),

		// Routing (cases_routing_test.go).
		sameDefinitionTwoQueues(),

		// Signals (cases_signals_test.go).
		signalSendResolved(),
		signalSendUnresolved(),

		// Failure (cases_failure_test.go).
		failedExecutionStillYieldsEdges(),
	}
}
