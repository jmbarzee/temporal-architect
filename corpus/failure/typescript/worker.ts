import type { WorkerOptions } from '@temporalio/worker';
import * as activities from './activities';

/** The jobTypes worker's registrations, shared by the worker process and the tests. */
export function jobTypes(): Pick<WorkerOptions, 'workflowsPath' | 'activities'> {
  return { workflowsPath: require.resolve('./workflows'), activities };
}
