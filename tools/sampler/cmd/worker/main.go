// Command worker runs the sampler's Temporal worker: it registers the three
// sampling workflows and their activities and polls the "sampler" task queue.
// This is the sampler's own control plane — a separate Temporal connection from
// the TARGET namespace being sampled (the activities reach that via the
// transport package, configured with SAMPLER_* env vars).
//
// Config (control-plane connection to the sampler's own Temporal):
//
//	SAMPLER_TEMPORAL_HOSTPORT   host:port of the sampler's Temporal (default 127.0.0.1:7233)
//	SAMPLER_TEMPORAL_NAMESPACE  namespace the workflows run in (default "default")
//	SAMPLER_MAX_ACTIVITIES      worker.Options.MaxConcurrentActivityExecutionSize (0 = SDK default)
//	SAMPLER_MAX_WORKFLOW_TASKS  worker.Options.MaxConcurrentWorkflowTaskExecutionSize (0 = SDK default)
//
// Config (per-activity connection to the TARGET namespace being sampled) is read
// by the transport package: SAMPLER_ADDRESS, SAMPLER_TRANSPORT, SAMPLER_CALLER_TYPE,
// SAMPLER_BEARER_FILE / TEMPORAL_API_KEY, SAMPLER_TLS*.
package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"

	temporalsampler "github.com/jmbarzee/temporal-architect/tools/sampler/temporal"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "sampler-worker: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	c, err := client.Dial(client.Options{
		HostPort:  getenvDefault("SAMPLER_TEMPORAL_HOSTPORT", client.DefaultHostPort),
		Namespace: getenvDefault("SAMPLER_TEMPORAL_NAMESPACE", "default"),
	})
	if err != nil {
		return fmt.Errorf("dial sampler Temporal: %w", err)
	}
	defer c.Close()

	// Bound fan-out at the worker too, so the in-workflow semaphores and the
	// worker limits together cap load on the target frontend / web API.
	w := worker.New(c, temporalsampler.TaskQueue, worker.Options{
		MaxConcurrentActivityExecutionSize:     envInt("SAMPLER_MAX_ACTIVITIES", 0),
		MaxConcurrentWorkflowTaskExecutionSize: envInt("SAMPLER_MAX_WORKFLOW_TASKS", 0),
	})

	w.RegisterWorkflow(temporalsampler.SampleNamespaceWorkflow)
	w.RegisterWorkflow(temporalsampler.EnumerateTypesWorkflow)
	w.RegisterWorkflow(temporalsampler.SampleTypeWorkflow)
	w.RegisterActivity(temporalsampler.NewActivities())

	fmt.Fprintf(os.Stderr, "sampler-worker: polling task queue %q\n", temporalsampler.TaskQueue)
	if err := w.Run(worker.InterruptCh()); err != nil {
		return fmt.Errorf("run worker: %w", err)
	}
	return nil
}

func getenvDefault(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}
