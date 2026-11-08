// Test workflows for Arrivals; bundled only by arrivals.test.ts.
import { CancellationScope, condition, defineSignal, setHandler, sleep } from '@temporalio/workflow';
import { Arrivals } from './arrivals';

export const X = defineSignal<[string]>('X');

function arrivalsOfX(): Arrivals<string> {
  const xs = new Arrivals<string>();
  setHandler(X, (v) => xs.add(v));
  return xs;
}

/** Two waiters of X; the one started first sleeps before it waits, so the other begins waiting first. */
export async function twoWaiters(): Promise<Record<string, string>> {
  const xs = arrivalsOfX();
  const took: Record<string, string> = {};
  await Promise.all([
    (async () => {
      await sleep('1s');
      took['created first'] = await xs.take();
    })(),
    (async () => {
      took['began first'] = await xs.take();
    })(),
  ]);
  return took;
}

/** Binds a promise on X, then awaits X. */
export async function promiseThenAwait(): Promise<Record<string, string>> {
  const xs = arrivalsOfX();
  const p = xs.take();
  const awaited = await xs.take();
  return { promise: await p, await: awaited };
}

/** Starts a waiter of X and cancels it, then takes X. */
export async function cancelledWaiter(): Promise<string> {
  const xs = arrivalsOfX();
  const waiter = new CancellationScope();
  waiter.run(() => xs.take()).catch(() => {});
  await sleep('1s');
  waiter.cancel();
  return xs.take();
}

/** await one: a case for X raced against a timer (listed second), then takes X. */
export async function awaitOne(timeout: number): Promise<string[]> {
  const xs = arrivalsOfX();
  const took: string[] = [];
  const ticket = xs.wait();
  let timerFired = false;
  void sleep(timeout).then(() => {
    timerFired = true;
  });
  await condition(() => xs.ready(ticket) || timerFired);
  if (xs.ready(ticket)) {
    took.push('case ' + xs.claim()); // first listed wins
  } else {
    xs.leave(ticket);
    took.push('timer');
  }
  took.push('then ' + (await xs.take()));
  return took;
}

/** The naive mapping: two waiters on condition(() => pending.length > 0). */
export async function naiveTwoWaiters(): Promise<(string | undefined)[]> {
  const pending: string[] = [];
  setHandler(X, (v) => {
    pending.push(v);
  });
  const take = async () => {
    await condition(() => pending.length > 0);
    return pending.shift();
  };
  return Promise.all([take(), take()]);
}
