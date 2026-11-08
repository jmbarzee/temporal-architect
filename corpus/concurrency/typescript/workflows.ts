import {
  CancellationScope,
  ChildWorkflowCancellationType,
  ParentClosePolicy,
  condition,
  defineSignal,
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
} from '@temporalio/workflow';
import type * as activities from './activities';

const { Count, Store } = proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' });

export const Ack = defineSignal('Ack');

export interface Report {
  count: number;
  audited: boolean;
  status: string;
}

export async function Batch(items: string[]): Promise<Report> {
  let status = 'unacknowledged';
  let acks = 0; // pending arrivals of Ack
  setHandler(Ack, () => {
    status = 'acknowledged';
    acks++;
  });

  const [count, audited] = await Promise.all([Count(items), executeChild(Audit, { args: [items] })]);

  // detach: abandon the child, never request its cancellation, and wait only for its start.
  await startChild(Archive, {
    args: [items],
    parentClosePolicy: ParentClosePolicy.ABANDON,
    cancellationType: ChildWorkflowCancellationType.ABANDON,
  });

  // await one: one condition over every case, then the first listed that is ready wins,
  // so Ack wins a tie with the timer.
  const timer = new CancellationScope();
  let timerFired = false;
  timer.run(() => sleep('1 hour')).then(
    () => (timerFired = true),
    () => {}, // cancelled because Ack won
  );
  await condition(() => acks > 0 || timerFired);
  if (acks > 0) {
    acks--;
    timer.cancel();
  }

  return { count, audited, status };
}

export async function Audit(items: string[]): Promise<boolean> {
  return items.length > 0;
}

export async function Archive(items: string[]): Promise<void> {
  await Store(items);
}
