import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';

const { Compose } = proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' });

export async function Greet(name: string): Promise<string> {
  return await Compose(name);
}
