import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker, bundleWorkflowCode, type WorkflowBundleWithSourceMap } from '@temporalio/worker';
import type { WorkflowHandle } from '@temporalio/client';
import { awaitOne } from './await-one-fixtures';
import { Ack } from './workflows';

let env: TestWorkflowEnvironment;
let bundle: WorkflowBundleWithSourceMap;
const taskQueue = 'await-one';
const quiet = { log() {}, trace() {}, debug() {}, info() {}, warn() {}, error() {} };

before(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
  bundle = await bundleWorkflowCode({ workflowsPath: require.resolve('./await-one-fixtures'), logger: quiet });
});

after(async () => {
  await env?.teardown();
});

async function events(h: WorkflowHandle) {
  return (await h.fetchHistory()).events ?? [];
}

async function until(h: WorkflowHandle, has: (e: Awaited<ReturnType<typeof events>>[number]) => unknown) {
  while (!(await events(h)).some(has)) await setTimeout(20);
}

/** Runs awaitOne with the timer fired and Ack sent while no worker runs, so both reach one workflow task. */
async function tie(order: ('Ack' | 'timer')[]): Promise<string> {
  // No cache, so no sticky queue: the next workflow task goes to the normal queue, not to a stopped worker.
  const worker = () =>
    Worker.create({ connection: env.nativeConnection, taskQueue, workflowBundle: bundle, maxCachedWorkflows: 0 });
  const h = await env.client.workflow.start(awaitOne, { taskQueue, workflowId: `tie-${order}`, args: [order] });
  await (await worker()).runUntil(until(h, (e) => e.timerStartedEventAttributes));
  // Skip time past the timer. Its workflow task, with no worker to take it, holds
  // time still a few milliseconds short of the sleep's end, so the sleep is not awaited.
  void env.sleep('1 hour');
  await until(h, (e) => e.timerFiredEventAttributes);
  await h.signal(Ack);
  const got = await (await worker()).runUntil(h.result());

  // Both ready on one resume: no workflow task started between the timer firing and Ack arriving.
  const evs = await events(h);
  const fired = evs.findIndex((e) => e.timerFiredEventAttributes);
  const signaled = evs.findIndex((e) => e.workflowExecutionSignaledEventAttributes);
  assert.ok(fired >= 0 && signaled >= 0);
  const between = evs.slice(Math.min(fired, signaled), Math.max(fired, signaled));
  assert.ok(!between.some((e) => e.workflowTaskStartedEventAttributes), 'the timer and Ack reached different workflow tasks');
  return got;
}

test('await one: the first listed of several ready cases wins', async () => {
  assert.equal(await tie(['Ack', 'timer']), 'Ack');
  assert.equal(await tie(['timer', 'Ack']), 'timer');
});
