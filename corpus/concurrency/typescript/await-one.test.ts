import { before, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker, bundleWorkflowCode, type WorkflowBundleWithSourceMap } from '@temporalio/worker';
import type { WorkflowHandle } from '@temporalio/client';
import { awaitOne } from './await-one-fixtures';
import { Ack } from './workflows';

let bundle: WorkflowBundleWithSourceMap;
const taskQueue = 'await-one';
const quiet = { log() {}, trace() {}, debug() {}, info() {}, warn() {}, error() {} };

before(async () => {
  bundle = await bundleWorkflowCode({ workflowsPath: require.resolve('./await-one-fixtures'), logger: quiet });
});

async function events(h: WorkflowHandle) {
  return (await h.fetchHistory()).events ?? [];
}

/** Waits up to 10s of real time for an event that has; throws rather than hang. */
async function until(h: WorkflowHandle, has: (e: Awaited<ReturnType<typeof events>>[number]) => unknown) {
  const deadline = Date.now() + 10_000;
  while (!(await events(h)).some(has)) {
    if (Date.now() > deadline) throw new Error(`${h.workflowId}: the awaited event never reached history`);
    await setTimeout(20);
  }
}

/** A worker with no cache, so no sticky queue: the next workflow task goes to the normal queue, not to a stopped worker. */
function worker(env: TestWorkflowEnvironment) {
  return Worker.create({ connection: env.nativeConnection, taskQueue, workflowBundle: bundle, maxCachedWorkflows: 0 });
}

/**
 * Runs awaitOne with the timer fired and Ack sent while no worker runs, so both reach one
 * workflow task, and returns the winner.
 *
 * In CI the setup sometimes misses: a workflow task starts between the timer firing and Ack
 * arriving, most likely on a poll the stopped first worker left open at the test server (#529). A
 * miss is retried on a fresh test server; if every attempt misses, the test is skipped and this
 * returns undefined, so it never asserts the behaviour on a tie that was not set up.
 */
async function tie(t: TestContext, order: ('Ack' | 'timer')[]): Promise<string | undefined> {
  const attempts = 3;
  const missed: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const env = await TestWorkflowEnvironment.createTimeSkipping();
    try {
      const h = await env.client.workflow.start(awaitOne, { taskQueue, workflowId: `tie-${order}-${attempt}`, args: [order] });
      const miss = await setUpTie(env, h);
      if (miss === undefined) return await (await worker(env)).runUntil(h.result());
      missed.push(miss);
    } finally {
      await env.teardown();
    }
  }
  t.skip(`the tie was not set up in ${attempts} attempts: ${missed.join('; ')}`);
  return undefined;
}

/**
 * Fires the timer and sends Ack while no worker runs. Returns undefined when both reach one
 * workflow task, otherwise the history between them.
 */
async function setUpTie(env: TestWorkflowEnvironment, h: WorkflowHandle): Promise<string | undefined> {
  await (await worker(env)).runUntil(until(h, (e) => e.timerStartedEventAttributes));
  // Skip time past the timer. Its workflow task, with no worker to take it, holds
  // time still a few milliseconds short of the sleep's end, so the sleep is not awaited;
  // on a miss it outlives the server, so its rejection is dropped.
  void env.sleep('1 hour').catch(() => {});
  await until(h, (e) => e.timerFiredEventAttributes);
  await h.signal(Ack);

  const evs = await events(h);
  const fired = evs.findIndex((e) => e.timerFiredEventAttributes);
  const signaled = evs.findIndex((e) => e.workflowExecutionSignaledEventAttributes);
  const between = evs.slice(fired, signaled);
  if (!between.some((e) => e.workflowTaskStartedEventAttributes)) return undefined;
  // Each event named by its attributes field: @temporalio/proto, which names EventType, is not a dependency.
  const names = between.map((e) => Object.keys(e).find((k) => k.endsWith('EventAttributes')));
  return `${h.workflowId}: ${names.join(',')}`;
}

test('await one: the first listed of several ready cases wins', async (t) => {
  const ackFirst = await tie(t, ['Ack', 'timer']);
  if (ackFirst !== undefined) assert.equal(ackFirst, 'Ack');
  const timerFirst = await tie(t, ['timer', 'Ack']);
  if (timerFirst !== undefined) assert.equal(timerFirst, 'timer');
});
