import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from './activities';

const { Increment } = proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' });

export async function Counter(count: number, limit: number): Promise<number> {
  await sleep('1 minute');
  const next = await Increment(count);
  if (next >= limit) {
    return next;
  }
  return continueAsNew<typeof Counter>(next, limit);
}
