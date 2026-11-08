// Test workflows for await one; bundled only by await-one.test.ts.
import { condition, setHandler, sleep } from '@temporalio/workflow';
import { Ack } from './workflows';

/** Batch's await one over Ack and timer(1h), with the cases listed in order; returns the winner. */
export async function awaitOne(order: ('Ack' | 'timer')[]): Promise<string> {
  let acks = 0;
  setHandler(Ack, () => void acks++);
  let timerFired = false;
  void sleep('1 hour').then(() => (timerFired = true));
  const ready = { Ack: () => acks > 0, timer: () => timerFired };

  await condition(() => order.some((c) => ready[c]()));
  return order.find((c) => ready[c]())!;
}
