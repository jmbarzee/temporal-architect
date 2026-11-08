import type { WorkerOptions } from '@temporalio/worker';
import * as activities from './activities';

/** The batchTypes worker's registrations, shared by the worker process and the tests. */
export function batchTypes(): Pick<WorkerOptions, 'workflowsPath' | 'activities'> {
  return { workflowsPath: require.resolve('./workflows'), activities };
}
