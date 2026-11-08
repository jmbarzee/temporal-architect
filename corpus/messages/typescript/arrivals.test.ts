import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker, bundleWorkflowCode, type WorkflowBundleWithSourceMap } from '@temporalio/worker';
import { X, awaitOne, cancelledWaiter, naiveTwoWaiters, promiseThenAwait, twoWaiters } from './arrivals-fixtures';

let env: TestWorkflowEnvironment;
let bundle: WorkflowBundleWithSourceMap;
const taskQueue = 'arrivals';
let n = 0;
const quiet = { log() {}, trace() {}, debug() {}, info() {}, warn() {}, error() {} };

before(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
  bundle = await bundleWorkflowCode({ workflowsPath: require.resolve('./arrivals-fixtures'), logger: quiet });
});

after(async () => {
  await env?.teardown();
});

/** Runs wf, sending X "1" after a minute and X "2" after two. */
async function withTwoXs<R>(wf: (...a: any[]) => Promise<R>, args: unknown[] = []): Promise<R> {
  // A Worker runs once; each test gets its own over the shared bundle.
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, workflowBundle: bundle });
  return worker.runUntil(async () => {
    const h = await env.client.workflow.start(wf, { taskQueue, workflowId: `wf-${n++}`, args });
    await env.sleep('1 minute');
    await h.signal(X, '1');
    await env.sleep('1 minute');
    // A workflow that needed only one X has completed by now.
    await h.signal(X, '2').catch((e) => assert.equal(e.name, 'WorkflowNotFoundError'));
    return h.result();
  });
}

test('arrivals go to waiters in the order they began', async () => {
  assert.deepEqual(await withTwoXs(twoWaiters), { 'began first': '1', 'created first': '2' });
});

test('a promise begins waiting at its binding', async () => {
  assert.deepEqual(await withTwoXs(promiseThenAwait), { promise: '1', await: '2' });
});

test('await one: the case wins and takes', async () => {
  assert.deepEqual(await withTwoXs(awaitOne, [3_600_000]), ['case 1', 'then 2']);
});

test('await one: the timer wins and the case takes nothing', async () => {
  assert.deepEqual(await withTwoXs(awaitOne, [1_000]), ['timer', 'then 1']);
});

test('a cancelled waiter leaves the queue', async () => {
  assert.equal(await withTwoXs(cancelledWaiter), '1');
});

test('naive condition-per-waiter loses an arrival', async () => {
  // Both conditions unblock in one pass, before either shifts.
  // JSON turns the lost arrival's undefined into null.
  assert.deepEqual(await withTwoXs(naiveTwoWaiters), ['1', null]);
});
