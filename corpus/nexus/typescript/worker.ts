import type { WorkerOptions } from '@temporalio/worker';
import * as activities from './activities';
import { greeterServiceHandler } from './service';

type Registrations = Pick<WorkerOptions, 'workflowsPath' | 'activities' | 'nexusServices'>;

/** The callerTypes worker's registrations, shared by the worker process and the tests. */
export function callerTypes(): Registrations {
  return { workflowsPath: require.resolve('./caller-workflows') };
}

/** The greeterTypes worker's registrations. */
export function greeterTypes(): Registrations {
  return {
    workflowsPath: require.resolve('./greeter-workflows'),
    activities,
    nexusServices: [greeterServiceHandler],
  };
}
