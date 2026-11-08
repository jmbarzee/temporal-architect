import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { Counter } from './workflows';
import { counterTypes } from './worker';

let env: TestWorkflowEnvironment;
const taskQueue = 'counters';

before(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
});

after(async () => {
  await env?.teardown();
});

test('Counter completes at the limit', async () => {
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, ...counterTypes() });
  const got = await worker.runUntil(env.client.workflow.execute(Counter, { taskQueue, workflowId: 'counter-1', args: [2, 3] }));
  assert.equal(got, 3);
});

test('Counter continues as new below it', async () => {
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, ...counterTypes() });
  const got = await worker.runUntil(async () => {
    const h = await env.client.workflow.start(Counter, { taskQueue, workflowId: 'counter-2', args: [0, 3] });
    const r = await h.result(); // follows the chain of runs
    const first = env.client.workflow.getHandle(h.workflowId, h.firstExecutionRunId);
    assert.equal((await first.describe()).status.name, 'CONTINUED_AS_NEW');
    return r;
  });
  assert.equal(got, 3);
});
