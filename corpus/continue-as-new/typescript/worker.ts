import type { WorkerOptions } from '@temporalio/worker';
import * as activities from './activities';

/** The counterTypes worker's registrations, shared by the worker process and the tests. */
export function counterTypes(): Pick<WorkerOptions, 'workflowsPath' | 'activities'> {
  return { workflowsPath: require.resolve('./workflows'), activities };
}
