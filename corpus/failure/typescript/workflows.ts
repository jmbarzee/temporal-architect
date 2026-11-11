import { condition, defineSignal, defineUpdate, proxyActivities, setHandler, type ActivityOptions } from '@temporalio/workflow';
import type * as activities from './activities';

const rejectDefaults: ActivityOptions = { startToCloseTimeout: '1 minute', retry: { maximumAttempts: 1 } };

const { Reject } = proxyActivities<typeof activities>(rejectDefaults);
const { Process } = proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' });

export const Proceed = defineSignal('Proceed');
export const Attempt = defineUpdate<void>('Attempt');

export async function Job(item: string): Promise<void> {
  let proceeding = false;
  setHandler(Proceed, () => {
    proceeding = true;
  });
  // Reject's failure fails the update at once; the run goes on.
  setHandler(Attempt, async () => {
    await Promise.all([Reject(item), Process(item)]);
  });

  await condition(() => proceeding);
  // Reject's failure fails the run at once; Process is left running, never cancelled.
  await Promise.all([Reject(item), Process(item)]);
}
