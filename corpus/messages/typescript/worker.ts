import type { WorkerOptions } from '@temporalio/worker';

/** The approvalTypes worker's registrations, shared by the worker process and the tests. */
export function approvalTypes(): Pick<WorkerOptions, 'workflowsPath'> {
  return { workflowsPath: require.resolve('./workflows') };
}
